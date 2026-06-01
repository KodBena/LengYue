#!/usr/bin/env node
/**
 * frontend/scripts/perf-heap.mjs
 *
 * Memory-leak detector for the perf-scenario harness (the quartet's item 3,
 * folded onto item 4's infrastructure). Runs a `window.__perfScenario`
 * scenario N times and, between cycles, forces GC (CDP
 * `HeapProfiler.collectGarbage`) and reads the **retained** V8 heap
 * (`Runtime.getHeapUsage` post-GC). A scenario whose resource-ownership is
 * clean (every `createBoard` paired with the teardown `closeBoard`, every
 * subscription released) returns to baseline each cycle → flat series. A
 * leak — module-scope state keyed by a `boardId` that `closeBoard` forgot,
 * a listener never removed — grows the retained heap ~linearly per cycle;
 * the slope is the bytes-leaked-per-cycle.
 *
 * A `--warmup` run precedes the baseline so one-time init allocations
 * (i18n catalogs, lazy singletons) are not miscounted as a leak — only
 * steady-state per-cycle growth is measured.
 *
 * Counts/bytes, not wall-clock. With `--snapshot`, also writes a
 * `.heapsnapshot` at the end (open in DevTools → Memory to attribute the
 * growth by constructor / retainer).
 *
 * Usage:
 *   node scripts/perf-heap.mjs <scenario> [--cycles N] [--warmup K]
 *        [--model SUBSTR] [--visits N] [--proxy-url WS] [--adapt] [--sgf F]
 *        [--connect CDP_URL] [--headed] [--snapshot] [--url U] [--out DIR]
 *
 * Examples:
 *   node scripts/perf-heap.mjs nav-only --cycles 30           # board lifecycle
 *   node scripts/perf-heap.mjs full-stress --model b10 --cycles 10 --snapshot
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const scenario = argv[0];
if (!scenario || scenario.startsWith('--')) {
  console.error('usage: node scripts/perf-heap.mjs <scenario> [--cycles N] [--warmup K] [--model S] [--visits N] [--proxy-url WS] [--adapt] [--sgf F] [--connect URL] [--headed] [--snapshot] [--url U] [--out DIR]');
  process.exit(2);
}
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://localhost:5173');
const outDir = flag('out', join(homedir(), 'w', 'vdc', 'chromium_profiles'));
const cycles = Number(flag('cycles', '20'));
const warmup = Number(flag('warmup', '1'));
const headed = argv.includes('--headed');
const connectUrl = flag('connect', undefined);
const wantSnapshot = argv.includes('--snapshot');
const cfg = {};
if (flag('visits', undefined) !== undefined) cfg.visits = Number(flag('visits'));
if (flag('proxy-url', undefined) !== undefined) cfg.proxyUrl = flag('proxy-url');
if (flag('model', undefined) !== undefined) cfg.model = flag('model');
if (argv.includes('--adapt')) cfg.adaptive = true;
const sgfPath = flag('sgf', undefined);
if (sgfPath !== undefined) cfg.sgf = await readFile(sgfPath, 'utf8');

const fmtMB = (b) => (b / (1024 * 1024)).toFixed(2);

console.log(`[perf-heap] scenario=${scenario} cycles=${cycles} warmup=${warmup} ${connectUrl ? `connect=${connectUrl}` : `headed=${headed}`}`);

const ownsBrowser = !connectUrl;
const browser = connectUrl
  ? await chromium.connectOverCDP(connectUrl)
  : await chromium.launch({ executablePath: '/usr/bin/chromium', headless: !headed });

let page = null;
try {
  const context = connectUrl ? (browser.contexts()[0] ?? await browser.newContext()) : await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [page:error] ${e.message}`));

  console.log('[perf-heap] loading app…');
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => !!window.__perfScenario, null, { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  const client = await context.newCDPSession(page);
  await client.send('HeapProfiler.enable');
  await client.send('Runtime.enable');

  // Major GC, then read the retained V8 heap. Two passes — a single
  // collectGarbage can leave finalizable cycles uncollected.
  async function retainedHeap() {
    await client.send('HeapProfiler.collectGarbage');
    await client.send('HeapProfiler.collectGarbage');
    const { usedSize } = await client.send('Runtime.getHeapUsage');
    return usedSize;
  }

  async function runOnce(label) {
    await page.evaluate(({ name, c }) => window.__perfScenario.run(name, c), { name: scenario, c: cfg });
    if (label) process.stdout.write(`  ${label}`);
  }

  // Warmup — absorb one-time init allocations before the baseline.
  for (let i = 0; i < warmup; i++) await runOnce('');
  const baseline = await retainedHeap();
  console.log(`[perf-heap] baseline (post-warmup, post-GC): ${fmtMB(baseline)} MB`);

  const series = [];
  for (let i = 1; i <= cycles; i++) {
    await runOnce('');
    const h = await retainedHeap();
    series.push(h);
    const delta = h - baseline;
    console.log(`  cycle ${String(i).padStart(3)}: ${fmtMB(h)} MB  (Δbaseline ${delta >= 0 ? '+' : ''}${fmtMB(delta)} MB)`);
  }

  // Least-squares slope (bytes/cycle) over a window of the series.
  function slopeOver(idxStart) {
    const sub = series.slice(idxStart);
    const m = sub.length;
    if (m < 2) return 0;
    const meanX = (idxStart + (idxStart + m - 1)) / 2;
    const meanY = sub.reduce((a, b) => a + b, 0) / m;
    let num = 0, den = 0;
    for (let i = 0; i < m; i++) {
      const x = idxStart + i;
      num += (x - meanX) * (sub[i] - meanY);
      den += (x - meanX) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }
  const n = series.length;
  const wholeSlope = slopeOver(0);
  // Steady-state: the last third (warmup transients — bounded caches, V8 IC
  // warming, lazy compilation — live in the early cycles; a true unbounded
  // leak keeps the SAME per-cycle delta into the tail). The tail slope is
  // the leak discriminant; the whole-series slope over-reads the transient.
  const tailStart = Math.floor((n * 2) / 3);
  const tailSlope = slopeOver(tailStart);
  const totalGrowth = series[n - 1] - baseline;

  console.log('');
  console.log('=== verdict ===');
  console.log(`  baseline ............ ${fmtMB(baseline)} MB`);
  console.log(`  final ............... ${fmtMB(series[n - 1])} MB`);
  console.log(`  total growth ........ ${totalGrowth >= 0 ? '+' : ''}${fmtMB(totalGrowth)} MB over ${n} cycles`);
  console.log(`  slope (whole) ....... ${(wholeSlope / 1024).toFixed(1)} KB / cycle`);
  console.log(`  slope (tail ⅓) ...... ${(tailSlope / 1024).toFixed(1)} KB / cycle  ← steady-state leak discriminant`);
  // A real per-board leak (100-node tree + ledger + subscriptions retained)
  // is hundreds of KB to MB per cycle and does NOT decay; sub-threshold tail
  // slope with a higher whole slope = bounded warmup, not a leak.
  const LEAK_KB_PER_CYCLE = 50;
  const tailKB = tailSlope / 1024;
  let verdict;
  if (tailKB > LEAK_KB_PER_CYCLE) {
    verdict = `LIKELY LEAK — steady-state retained heap grows ${tailKB.toFixed(1)} KB/cycle (> ${LEAK_KB_PER_CYCLE} KB)`;
  } else if (wholeSlope / 1024 > LEAK_KB_PER_CYCLE) {
    verdict = `clean (bounded) — early growth decays to ${tailKB.toFixed(1)} KB/cycle in the tail; warmup/cache fill, not an unbounded leak`;
  } else {
    verdict = `clean — retained heap flat within noise (tail ${tailKB.toFixed(1)} KB/cycle)`;
  }
  console.log(`  → ${verdict}`);

  if (wantSnapshot) {
    console.log('[perf-heap] capturing heap snapshot for attribution…');
    let snap = '';
    const onChunk = (e) => { snap += e.chunk; };
    client.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    client.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await mkdir(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapPath = join(outDir, `${scenario}-${stamp}.heapsnapshot`);
    await writeFile(snapPath, snap);
    console.log(`[perf-heap] wrote ${fmtMB(Buffer.byteLength(snap))} MB → ${snapPath} (open in DevTools → Memory)`);
  }
} finally {
  try {
    if (page) await page.evaluate(() => window.__perfScenario?.disconnect?.());
  } catch { /* page gone */ }
  if (!ownsBrowser && page) { try { await page.close(); } catch { /* tab gone */ } }
  await browser.close();
}
