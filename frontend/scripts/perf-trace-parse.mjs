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
 *   - Realtime-latency surface (added 2026-06-12): frame-duration
 *     distribution, LongTask count + cumulative duration, over-budget-frame
 *     counts. See "Latency surface" below for the event keying.
 *
 * Counts, not wall-clock — per the cross-run discipline (env drift confounds
 * absolute timing; counts of render/patch operations are the strict
 * cross-run comparable).
 *
 * SCOPING NOTE (2026-06-12, mirroring the ADR-0009 amendment of the same
 * date): this parser now ALSO emits realtime-latency distributions
 * (frame-duration percentiles, LongTask count + cumulative duration,
 * over-budget-frame counts). Those are compared **best-effort** — the
 * confounds the counts rule was shaped to avoid (environment drift, cache
 * warmth, engine pacing) are controlled by the capture-normalization
 * protocol (cold caches, scenario-proxy comparability asserted first) and
 * NAMED next to any latency comparison rather than treated as disqualifying.
 * Counts remain the strict comparable; the latency distributions are the
 * jank-relevant comparable counts cannot express. This SCOPES the
 * "counts, not wall-clock" rule (do not compare raw wall-clock totals as if
 * precise) — it does not reverse it. The latency *comparison* judgement is
 * not this script's: the script emits numbers; interpretation is downstream
 * per ADR-0009.
 *
 * ── Latency surface: event keying (what this script reads, and why) ──
 *
 * Frame-duration distribution — keyed on **`PipelineReporter`** async
 * begin/end pairs (`cat` includes `disabled-by-default-devtools.timeline.frame`,
 * `ph:'b'`/`'e'`, paired by `pid` + `id2.local`). PipelineReporter is the
 * modern Chrome trace's per-frame pipeline-lifetime event: it spans a frame
 * from BeginFrame through to presentation, so its `e.ts − b.ts` is a real
 * wall-clock frame duration in µs (emitted here as ms). Chosen over the
 * instant `BeginFrame`/`DrawFrame`/`DroppedFrame` markers (`ph:'I'`,
 * same `…timeline.frame` cat) because those carry only a `frameSeqId` and a
 * timestamp — they mark frame *events* but no duration; deriving a duration
 * from consecutive `BeginFrame` timestamps would measure vsync *cadence*
 * (≈16.7 ms steady) rather than the work-to-present *latency* the jank
 * surface is about. A frame is attributed to the window by its **begin**
 * timestamp. HONEST CAVEAT: a PipelineReporter span is pipeline *latency*,
 * not per-frame CPU — a frame that sat queued behind a long main-thread task
 * shows a long span (the tail can reach >1 s). That is the felt-jank signal
 * we want (a frame that took ~1 s to reach the screen is jank), but it is
 * latency-to-present, not isolated render cost; do not read the tail as CPU
 * time. Dropped/partial-update frames also produce PipelineReporter pairs, so
 * the in-window frame count can exceed (display-Hz × window-seconds) — that
 * surplus IS the dropped-frame surface, not a miscount.
 *
 * LongTask count + cumulative duration — keyed on Blink's explicit
 * **`LongTask`** instant events (`cat:'blink'`, `ph:'I'`,
 * `args.duration` in **seconds**), the same surface the platform's
 * `PerformanceObserver({type:'longtask'})` reports (tasks ≥ 50 ms). Cumulative
 * duration is summed in ms. Cross-checked at authoring against the alternative
 * keying — `RunTask` complete events (`cat:'…devtools.timeline'`, `ph:'X'`,
 * `dur` in µs) ≥ 50 ms on the CrRendererMain thread — and the two agreed to
 * within one event on the probe trace (the blink surface counts every thread's
 * long tasks; the RunTask keying is renderer-main only — the off-main delta is
 * the single divergence). The blink `LongTask` is authoritative (it is the
 * platform-defined long-task surface) and is what this script reports.
 *
 * Over-budget-frame counts — frames whose PipelineReporter duration exceeds
 * the 60 Hz budget (16.7 ms) and a second threshold at 33.3 ms (two display
 * intervals). Both thresholds are named constants below, reported with the
 * threshold in the output line (no bare magic literals).
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

// ── latency surface (added 2026-06-12) ──────────────────────────────────────────
// Best-effort realtime-latency comparable per ADR-0009's 2026-06-12 amendment.
// Keying documented in the file header ("Latency surface: event keying").
// Frame budgets, named so no magic literal floats free in the over-budget tally:
const FRAME_BUDGET_60HZ_MS = 1000 / 60; // 16.666… ms — the one-vsync 60 Hz budget
const FRAME_BUDGET_2X_MS = 2 * FRAME_BUDGET_60HZ_MS; // 33.333… ms — two display intervals
const LONGTASK_FLOOR_MS = 50; // platform long-task definition (≥ 50 ms); blink LongTask floor

// Frame durations from PipelineReporter async b/e pairs (one frame per pair),
// attributed to the window by the BEGIN timestamp. Span = pipeline latency
// (BeginFrame → present), in µs → ms. See header caveat: this is latency-to-
// present, not isolated per-frame CPU.
const FRAME_RE = /disabled-by-default-devtools\.timeline\.frame/;
const openFrames = new Map(); // pid:id2.local -> begin ts (µs)
const frameDurMs = [];
for (const e of events) {
  if (e.name !== 'PipelineReporter' || typeof e.cat !== 'string' || !FRAME_RE.test(e.cat)) continue;
  const key = `${e.pid}:${e.id2?.local ?? e.id}`;
  if (e.ph === 'b') {
    openFrames.set(key, e.ts);
  } else if (e.ph === 'e') {
    const begin = openFrames.get(key);
    if (begin === undefined) continue; // unpaired end (began before the capture); skip
    openFrames.delete(key);
    if (typeof begin === 'number' && begin >= (window ? window.start : -Infinity) && begin <= (window ? window.end : Infinity)) {
      frameDurMs.push((e.ts - begin) / 1000);
    }
  }
}
frameDurMs.sort((a, b) => a - b);
// Percentile by nearest-rank on the sorted array (p in [0,100]); returns ms.
const pctile = (arr, p) => (arr.length === 0 ? NaN : arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]);
const frameP50 = pctile(frameDurMs, 50);
const frameP90 = pctile(frameDurMs, 90);
const frameP99 = pctile(frameDurMs, 99);
const frameMax = frameDurMs.length ? frameDurMs[frameDurMs.length - 1] : NaN;
const overBudget60 = frameDurMs.filter((d) => d > FRAME_BUDGET_60HZ_MS).length;
const overBudget2x = frameDurMs.filter((d) => d > FRAME_BUDGET_2X_MS).length;

// LongTask: Blink's explicit events (cat 'blink', ph 'I', args.duration in
// SECONDS), windowed by ts. The platform-defined long-task surface (≥ 50 ms).
let longTaskCount = 0;
let longTaskSumMs = 0;
for (const e of events) {
  if (e.name !== 'LongTask' || e.cat !== 'blink' || e.ph !== 'I') continue;
  if (!inWindow(e)) continue;
  const ms = (e.args?.duration ?? 0) * 1000; // seconds → ms
  longTaskCount += 1;
  longTaskSumMs += ms;
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

// Best-effort realtime-latency surface (ADR-0009, 2026-06-12 amendment).
// Numbers only — interpretation (improvement / regression / no-change) is
// downstream, not this script's.
const ms2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
console.log('=== Realtime latency (best-effort comparable; ADR-0009 2026-06-12) ===');
console.log(`  Frame durations (PipelineReporter b→e pipeline latency, ${frameDurMs.length} frames in window):`);
console.log(`    p50 ${ms2(frameP50)} ms · p90 ${ms2(frameP90)} ms · p99 ${ms2(frameP99)} ms · max ${ms2(frameMax)} ms`);
console.log(`  Over-budget frames:`);
console.log(`    > ${FRAME_BUDGET_60HZ_MS.toFixed(1)} ms (60 Hz budget) ...... ${overBudget60}`);
console.log(`    > ${FRAME_BUDGET_2X_MS.toFixed(1)} ms (2× display interval) .. ${overBudget2x}`);
console.log(`  LongTask (blink, ≥ ${LONGTASK_FLOOR_MS} ms; platform long-task surface):`);
console.log(`    count ${longTaskCount} · cumulative ${longTaskSumMs.toFixed(0)} ms`);
if (frameDurMs.length === 0) {
  console.log('  (no PipelineReporter frame pairs in window — trace lacks the …timeline.frame category, or window empty)');
}
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
