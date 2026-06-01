#!/usr/bin/env node
/**
 * frontend/scripts/perf-trace-parse.mjs
 *
 * Dependency-free analyzer for a Chrome DevTools performance trace
 * (`{metadata, traceEvents}`, plain or .gz) captured by
 * `scripts/perf-capture.mjs`. Re-homes the ADR-0009 analysis off
 * `@firefox-devtools/profiler-cli` — which cannot ingest Chrome traces
 * (`Image is not defined`) — onto a direct `traceEvents` parse. Surfaces
 * the signals ADR-0009 cares about:
 *
 *   - Per-component render / patch counts (the `blink.user_timing` measure
 *     spans `<Comp> render` / `<Comp> patch`), with the render÷patch ratio
 *     — render ≫ patch is the render-coupling tell.
 *   - Aggregate Vue render / patch operation counts (the `vue-render-*` /
 *     `vue-patch-*` instant marks).
 *   - Harness marks (`scenario:*`, `autonav:*`, `popover:*`, …) tallied.
 *
 * Counts, not wall-clock — per the cross-run discipline (env drift confounds
 * absolute timing; counts of render/patch operations are comparable).
 *
 * If the trace carries a `scenario:<name>:start` / `:end` pair, counts are
 * clipped to that window by default (so app-load churn is excluded); pass
 * `--no-window` to count the whole trace, or `--window <prefix>` to clip to
 * a specific `<prefix>:start`/`:end` bracket (e.g. a measured `drive`).
 *
 * Usage:
 *   node scripts/perf-trace-parse.mjs <trace.json|.gz> [--top N] [--no-window] [--window PREFIX]
 *
 * License: Public Domain (The Unlicense)
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const file = argv[0];
if (!file || file.startsWith('--')) {
  console.error('usage: node scripts/perf-trace-parse.mjs <trace.json|.gz> [--top N] [--no-window] [--window PREFIX]');
  process.exit(2);
}
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const topN = Number(flag('top', '20'));
const noWindow = argv.includes('--no-window');
const windowPrefix = flag('window', undefined);

// ── load ──────────────────────────────────────────────────────────────────────
const bytes = readFileSync(file);
const text = file.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
const json = JSON.parse(text);
const events = Array.isArray(json) ? json : json.traceEvents;
if (!Array.isArray(events)) {
  console.error('trace has no traceEvents array');
  process.exit(1);
}

// ── window detection (clip counts to the measured run) ──────────────────────────
function findWindow(prefix) {
  let start = null;
  let end = null;
  for (const e of events) {
    if (e.name === `${prefix}:start`) start = start === null ? e.ts : Math.min(start, e.ts);
    if (e.name === `${prefix}:end`) end = end === null ? e.ts : Math.max(end, e.ts);
  }
  return start !== null && end !== null ? { start, end } : null;
}
function autoScenarioPrefix() {
  for (const e of events) {
    const m = /^(scenario:[^:]+):start$/.exec(e.name ?? '');
    if (m) return m[1];
  }
  return null;
}
let window = null;
let windowLabel = 'whole trace';
if (!noWindow) {
  const prefix = windowPrefix ?? autoScenarioPrefix();
  if (prefix) {
    window = findWindow(prefix);
    if (window) windowLabel = `${prefix}:start..:end`;
  }
}
const inWindow = (e) => !window || (typeof e.ts === 'number' && e.ts >= window.start && e.ts <= window.end);

// ── tally ───────────────────────────────────────────────────────────────────────
const ut = events.filter((e) => typeof e.cat === 'string' && e.cat.includes('blink.user_timing') && inWindow(e));

// Memory counters (the DevTools "Memory" lane): `UpdateCounters` instant
// events carry {jsHeapSizeUsed, nodes, jsEventListeners, documents}, emitted
// by `disabled-by-default-devtools.timeline` — already in every capture, no
// flag needed. Sampled over the window → the coarse grow-during-run signal.
const memSamples = events
  .filter((e) => e.name === 'UpdateCounters' && e.args?.data && inWindow(e))
  .map((e) => e.args.data);

// Per-component render/patch from measure begins (ph 'b'); one per operation.
const COMPONENT_RE = /^<(.+)> (render|patch)$/;
const components = new Map(); // comp -> { render, patch }
const otherSpans = new Map(); // non-component b-spans (e.g. rb3:handler)
for (const e of ut) {
  if (e.ph !== 'b') continue;
  const m = COMPONENT_RE.exec(e.name);
  if (m) {
    const row = components.get(m[1]) ?? { render: 0, patch: 0 };
    row[m[2]] += 1;
    components.set(m[1], row);
  } else {
    otherSpans.set(e.name, (otherSpans.get(e.name) ?? 0) + 1);
  }
}

// Aggregate vue ops from instant start marks (exclude :end).
let renderOps = 0;
let patchOps = 0;
const harness = new Map();
for (const e of ut) {
  if (e.ph !== 'I') continue;
  if (/^vue-render-\d+$/.test(e.name)) renderOps += 1;
  else if (/^vue-patch-\d+$/.test(e.name)) patchOps += 1;
  else if (!/^vue-(render|patch|mount|init|update|compile)-\d+(:end)?$/.test(e.name) && !/:end$/.test(e.name)) {
    // Harness / app marks (scenario:*, autonav:*, popover:*, rb3:*, …).
    harness.set(e.name, (harness.get(e.name) ?? 0) + 1);
  }
}

// ── report ───────────────────────────────────────────────────────────────────────
const totalMb = (Buffer.byteLength(text) / (1024 * 1024)).toFixed(1);
console.log(`Trace: ${file}`);
console.log(`  ${events.length} events · ${totalMb} MB · counting: ${windowLabel}`);
console.log('');

const compRows = [...components.entries()]
  .map(([comp, r]) => ({ comp, ...r, ratio: r.patch > 0 ? r.render / r.patch : Infinity }))
  .sort((a, b) => b.render + b.patch - (a.render + a.patch));
const totRender = compRows.reduce((s, r) => s + r.render, 0);
const totPatch = compRows.reduce((s, r) => s + r.patch, 0);

console.log('=== Per-component render / patch (blink.user_timing spans) ===');
console.log(`  ${'COMPONENT'.padEnd(28)}${'RENDER'.padStart(8)}${'PATCH'.padStart(8)}${'R/P'.padStart(8)}`);
for (const r of compRows.slice(0, topN)) {
  const ratio = r.ratio === Infinity ? '∞' : r.ratio.toFixed(2);
  console.log(`  ${r.comp.padEnd(28)}${String(r.render).padStart(8)}${String(r.patch).padStart(8)}${ratio.padStart(8)}`);
}
if (compRows.length > topN) console.log(`  … ${compRows.length - topN} more components`);
console.log(`  ${'TOTAL'.padEnd(28)}${String(totRender).padStart(8)}${String(totPatch).padStart(8)}`);
console.log('');

console.log('=== Aggregate Vue ops (instant marks) ===');
console.log(`  render ops: ${renderOps}   patch ops: ${patchOps}`);
console.log('');

if (otherSpans.size) {
  console.log('=== Other instrumented spans ===');
  for (const [n, c] of [...otherSpans.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
    console.log(`  ${String(c).padStart(8)}  ${n}`);
  }
  console.log('');
}

console.log('=== Harness / app marks ===');
const harnessRows = [...harness.entries()].sort((a, b) => b[1] - a[1]);
if (harnessRows.length === 0) console.log('  (none — trace predates the scenario harness, or marks fell outside the window)');
for (const [n, c] of harnessRows.slice(0, topN)) {
  console.log(`  ${String(c).padStart(8)}  ${n}`);
}

if (memSamples.length) {
  const heapMB = memSamples.map((d) => d.jsHeapSizeUsed / (1024 * 1024));
  const peakField = (f) => memSamples.reduce((m, d) => Math.max(m, d[f] ?? 0), 0);
  const first = heapMB[0];
  const last = heapMB[heapMB.length - 1];
  const min = Math.min(...heapMB);
  const max = Math.max(...heapMB);
  console.log('');
  console.log(`=== Memory counters (UpdateCounters, ${memSamples.length} samples over window) ===`);
  console.log(`  JS heap used ........ first ${first.toFixed(1)} → last ${last.toFixed(1)} MB  (min ${min.toFixed(1)} / peak ${max.toFixed(1)})`);
  console.log(`  in-window delta ..... ${last - first >= 0 ? '+' : ''}${(last - first).toFixed(1)} MB  (intra-run; GC sawtooth — NOT a leak metric, see perf-heap.mjs for cross-cycle retained)`);
  console.log(`  DOM nodes (peak) .... ${peakField('nodes')}`);
  console.log(`  JS listeners (peak) . ${peakField('jsEventListeners')}`);
  console.log(`  documents (peak) .... ${peakField('documents')}`);
}
