#!/usr/bin/env node
/**
 * frontend/scripts/perf-capture.mjs
 *
 * Drive a pluggable performance scenario in a real Chromium and capture a
 * Chrome DevTools performance trace via CDP (the "CDP via Playwright" path,
 * not raw CDP). Launches the system Chromium through playwright-core, loads
 * the running dev build, invokes `window.__perfScenario.run(name, cfg)`,
 * and records a trace carrying the ADR-0009 signals — per-component
 * `<C> render` / `<C> patch` user-timing marks (Vue's `app.config.
 * performance`), plus the `scenario:*` / `autonav:*` / `popover:*` harness
 * marks. The trace is written under ~/w/vdc/chromium_profiles/ (space;
 * overrides ADR-0009's ~/perf-profiles/) for analysis by
 * `scripts/perf-trace-parse.mjs` or Chrome DevTools.
 *
 * Prerequisites (the harness measures the REAL app, so the stack must be up):
 *   - `npm run dev` serving the dev build (DEV gate installs
 *     `window.__perfScenario`); default URL http://localhost:5173.
 *   - For nav-range / full-stress: the SPA connected to a proxy (the
 *     SELECTOR stack), so the streaming range analysis actually runs.
 *
 * Usage:
 *   node scripts/perf-capture.mjs <scenario> [--url U] [--out DIR]
 *        [--visits N] [--model SUBSTR] [--proxy-url WS] [--adapt] [--sgf FILE]
 *        [--popover-target queue|sliders] [--headed] [--connect CDP_URL]
 *        [--wait-engine-ms N]
 *
 * Faithfulness modes (rendering path):
 *   (default)   headless Chromium — fast, CI-friendly, but no real X11
 *               compositor / vsync; least faithful to felt latency.
 *   --headed    our own Chromium window on X11 — real paint + vsync,
 *               observable on the desktop, isolated storage.
 *   --connect http://localhost:9222
 *               attach to a Chromium YOU launched
 *               (`chromium --remote-debugging-port=9222`) — your real
 *               desktop session; most faithful, observable live. We open a
 *               throwaway tab, run the scenario, and only disconnect (never
 *               close your browser).
 *
 * Examples:
 *   node scripts/perf-capture.mjs nav-only
 *   node scripts/perf-capture.mjs full-stress --model b10 --visits 1000 --headed
 *   node scripts/perf-capture.mjs full-stress --model b10 --sgf ~/games/342-turn.sgf --connect http://localhost:9222
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── arg parsing (minimal; fail loud on the obvious mistakes) ──────────────────
const argv = process.argv.slice(2);
const scenario = argv[0];
if (!scenario || scenario.startsWith('--')) {
  console.error('usage: node scripts/perf-capture.mjs <scenario> [--url U] [--out DIR] [--visits N] [--model SUBSTR] [--proxy-url WS] [--adapt] [--sgf FILE] [--popover-target T] [--headed] [--connect CDP_URL] [--wait-engine-ms N]');
  process.exit(2);
}
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://localhost:5173');
const outDir = flag('out', join(homedir(), 'w', 'vdc', 'chromium_profiles'));
const headed = argv.includes('--headed');
// Attach to an already-running Chromium (launched with
// --remote-debugging-port=N) instead of launching one. Use this to capture
// in a real desktop/X11 session — the faithful "what the user observes"
// rendering path (real compositor + vsync + paint), vs the headless default.
const connectUrl = flag('connect', undefined);
// The analysis scenarios connect the engine themselves (ctx.connectEngine);
// this optional pre-wait is only for scenarios that assume an already-connected
// engine. Default 0 (off).
const waitEngineMs = Number(flag('wait-engine-ms', '0'));
const cfg = {};
if (flag('visits', undefined) !== undefined) cfg.visits = Number(flag('visits'));
// close-at-scale: target board count (default 230 in the scenario). Ignored by
// the other scenarios.
if (flag('boards', undefined) !== undefined) cfg.boards = Number(flag('boards'));
if (flag('popover-target', undefined) !== undefined) cfg.popoverTarget = flag('popover-target');
if (flag('proxy-url', undefined) !== undefined) cfg.proxyUrl = flag('proxy-url');
if (flag('model', undefined) !== undefined) cfg.model = flag('model');
// Adaptive defaults OFF in the scenarios (the green-arc protocol); --adapt opts in.
if (argv.includes('--adapt')) cfg.adaptive = true;
// Load a real SGF file as the fixture (e.g. capture a 342-turn game at its
// real depth, rather than the generated 100-move grid fixture).
const sgfPath = flag('sgf', undefined);
if (sgfPath !== undefined) cfg.sgf = await readFile(sgfPath, 'utf8');

// magic-literal: Chrome trace categories. `blink.user_timing` is the
// load-bearing one — it carries every `performance.mark`/`measure`, i.e.
// Vue's per-component render/patch and our scenario marks. The rest mirror
// DevTools' Performance recording for frame/timeline/CPU context.
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'v8.execute',
  'toplevel',
  'blink',
  'cc',
].join(',');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(outDir, `${scenario}-${stamp}.json`);

console.log(`[perf-capture] scenario=${scenario} url=${url} out=${outPath} ${connectUrl ? `connect=${connectUrl}` : `headed=${headed}`}`);

// Two modes: attach to a user-launched Chromium (faithful X11 session, real
// paint), or launch our own (headless default, or --headed). connectOverCDP's
// browser.close() only disconnects — it never kills the user's Chromium.
const ownsBrowser = !connectUrl;
const browser = connectUrl
  ? await chromium.connectOverCDP(connectUrl)
  : await chromium.launch({ executablePath: '/usr/bin/chromium', headless: !headed });

let page = null;
try {
  const context = connectUrl
    ? (browser.contexts()[0] ?? await browser.newContext())
    : await browser.newContext();
  page = await context.newPage();
  page.on('console', (m) => console.log(`  [page:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.error(`  [page:error] ${e.message}`));

  console.log('[perf-capture] loading app…');
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

  // The DEV gate installs window.__perfScenario at bootstrap.
  await page.waitForFunction(() => !!window.__perfScenario, null, { timeout: 30_000 });
  const scenarios = await page.evaluate(() => window.__perfScenario.list());
  if (!scenarios.includes(scenario)) {
    throw new Error(`unknown scenario "${scenario}"; available: ${scenarios.join(', ')}`);
  }

  // Wait for the cold-start bootstrap (auth → sync-hydrate → preload) to
  // settle BEFORE running the scenario. The hydrate path calls
  // resetWorkspace() (store.boards = [fresh]); if it fires after the
  // scenario creates its board, analyzeRange can't find the board. Quiet
  // network ≈ bootstrap HTTP done; best-effort (don't abort if a poll keeps
  // the network from ever going fully idle).
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  // Best-effort wait for the engine to connect (nav-range / full-stress need
  // it; nav-only does not). Log the outcome rather than aborting — the
  // scenario itself fail-louds if it tries to analyze while disconnected.
  if (waitEngineMs > 0) {
    const connected = await page
      .waitForFunction(() => window.store?.engine?.status === 'connected', null, { timeout: waitEngineMs })
      .then(() => true)
      .catch(() => false);
    console.log(`[perf-capture] engine connected: ${connected}`);
  }

  const client = await context.newCDPSession(page);
  console.log('[perf-capture] starting trace…');
  await client.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: TRACE_CATEGORIES,
  });

  console.log('[perf-capture] running scenario…');
  await page.evaluate(
    ({ name, c }) => window.__perfScenario.run(name, c),
    { name: scenario, c: cfg },
  );
  console.log('[perf-capture] scenario complete; ending trace…');

  // Stop tracing and drain the trace stream (robust for large traces).
  const completed = new Promise((resolve) =>
    client.once('Tracing.tracingComplete', resolve),
  );
  await client.send('Tracing.end');
  const { stream } = await completed;

  let data = '';
  for (;;) {
    const { data: chunk, eof, base64Encoded } = await client.send('IO.read', { handle: stream });
    data += base64Encoded ? Buffer.from(chunk, 'base64').toString('utf8') : chunk;
    if (eof) break;
  }
  await client.send('IO.close', { handle: stream });

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, data);
  const mb = (Buffer.byteLength(data) / (1024 * 1024)).toFixed(1);
  console.log(`[perf-capture] wrote ${mb} MB → ${outPath}`);
  console.log(`[perf-capture] analyze: node scripts/perf-trace-parse.mjs ${outPath}`);
} finally {
  // Terminate any in-flight query before tearing down: disconnect implicitly
  // terminates every query on the WS, so a heavy range analysis (e.g. 1000
  // visits × 100 turns) is not left churning on the proxy. The scenario's
  // own q.stop() already covers the success path; this is the safety net for
  // the throw path (and a graceful close vs an abrupt WS drop). Best-effort —
  // the page may be unusable after a crash.
  try {
    if (page) await page.evaluate(() => window.__perfScenario?.disconnect?.());
    console.log('[perf-capture] engine disconnected (queries terminated).');
  } catch (err) {
    console.warn(`[perf-capture] disconnect on teardown failed: ${err?.message ?? err}`);
  }
  // In connect mode, close only the tab we opened; browser.close() then just
  // disconnects the CDP session, leaving the user's Chromium running.
  if (!ownsBrowser && page) {
    try { await page.close(); } catch { /* tab already gone */ }
  }
  await browser.close();
}
