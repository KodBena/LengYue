#!/usr/bin/env node
/**
 * frontend/scripts/lyt-conformance.mjs
 *
 * LYT adoption roadmap, Phase 1 "shadow mode" conformance harness
 * (commission: lyt-shadow-harness; see
 * .claude/dispatch-reports/lyt-shadow-harness-build.md). Serves the
 * BUILT SPA on a scratch port, sets the viewport to each of
 * `current-row-repaired`'s representative screen sizes (per
 * `research/lyt/emit_ts.py` / `research/lyt/runner.py SCREEN_SIZES`),
 * measures the RENDERED bounding rectangles of the DOM elements the
 * `SLOT_SELECTORS` table below maps to LYT slot ids, and diffs them
 * against the solved geometry in the GENERATED
 * `src/state/lyt-solved-layout.gen.ts` module. Divergence is EXPECTED
 * and is the deliverable, not a failure — this script never edits the
 * app to make the numbers agree; it reports what it measures.
 *
 * Zero user-visible change: this script is not wired into any build,
 * test, or CI step. It is invoked by hand (or by a future phase's own
 * automation), reads the built `dist/`, and writes a markdown report
 * under `research/lyt/divergence/`.
 *
 * Playwright discipline (durable rows 686/679/702/703 — see the
 * umbrella CLAUDE.md-adjacent commission text for the full rule):
 *   - Run chromium under `systemd-run --user --scope -p MemoryMax=4G`
 *     — this script does NOT self-wrap (perf-capture.mjs's own
 *     precedent doesn't either); wrap the `node` invocation itself:
 *       systemd-run --user --scope -p MemoryMax=4G -- \
 *         node --max-old-space-size=2048 scripts/lyt-conformance.mjs
 *   - `--js-flags=--max-old-space-size=1024` is passed to the
 *     launched Chromium's own args below.
 *   - ONE browser instance, closed in `finally`.
 *   - `waitForTimeout` / wall-clock sleeps are BANNED — every wait
 *     below is a `waitForSelector`/`waitForFunction` on an actual
 *     condition (DOM presence, `document.readyState`, or a bounded
 *     "never arrived" timeout that is itself a MEASURED, reported
 *     outcome, not a blind pause).
 *   - `nice -n 19` the `vite preview` child process and this script
 *     itself when invoking from the shell.
 *   - Scratch port only: default 19100, must stay >= 19100; the live
 *     ports 4173/5173/5174/8764 are refused at the CLI-arg level
 *     below.
 *   - The SPA needs no backend for layout measurement — this harness
 *     never starts one. Without a reachable backend, the workspace
 *     bootstrap either (a) resolves to `workspaceLoadState: 'loaded'`
 *     synchronously for an unauthenticated cold start (the store's
 *     own "nothing else to show" fallback, `sync-service.ts`) or (b)
 *     never reaches a measurable state. This script waits (bounded,
 *     no blind sleep) for `#split-workspace` to mount; if it never
 *     does, that size's run is recorded as UNREACHABLE — every
 *     in-tree slot for that size is reported unmappable with reason
 *     "workspace never reached a measurable state", not silently
 *     skipped.
 *
 * Usage:
 *   node scripts/lyt-conformance.mjs [--port N] [--headed]
 *        [--out-dir DIR] [--dist-dir DIR] [--build]
 *
 *   --build     run `npm run build` first (otherwise assumes `dist/`
 *               is already current — the caller's responsibility to
 *               keep in sync with the source being measured).
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LYT_SOLVED_LAYOUT, LYT_SCREEN_CLASSES } from '../src/state/lyt-solved-layout.gen.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const REPO_ROOT = join(FRONTEND_ROOT, '..');
const DIVERGENCE_DIR = join(REPO_ROOT, 'research', 'lyt', 'divergence');

// ── tolerance ────────────────────────────────────────────────────────────
// A few px for sub-pixel rounding (getBoundingClientRect returns
// fractional CSS px; the solver's CP-SAT model is integer px) and for
// border/outline contributions the solved geometry — which reasons about
// reserved CONTENT-BOX-shaped rectangles, not the DOM's actual box-sizing
// per element — doesn't model. 3px is the same order of magnitude as the
// codebase's own "few-px" resizer/border allowances (panel-resizer bars
// are 4px; `.status-bar` sets a 1px border-top) — generous enough to
// absorb rounding and a single hairline border, tight enough that a
// genuine layout divergence (tens to hundreds of px, per the encoding's
// own geometry) is never masked by it.
const TOLERANCE_PX = 3;

// ── slot -> selector mapping table ──────────────────────────────────────
// Built by reading the mount sites the LYT consult document itself cites
// (.claude/dispatch-reports/layout-language-consult.md §2) and
// `current_row_repaired.lyt`'s own leaf list. `selector: null` means no
// clean, content-independent CSS selector exists for that slot — recorded
// as unmappable rather than guessed (per the build commission's own
// instruction), with the reason named.
//
// Positional (`:nth-child`) selectors are used ONLY where the DOM order
// is fixed by the template's own literal child sequence (never by
// runtime/content-driven state) — `.engine-controls .toolbar-btn`'s
// mint/learn/play/match/connect order, and `.right-toggles`'s
// board/tree/controls toggle order. Both assume a PRODUCTION build
// (`import.meta.env.DEV === false`): the three dev-only buttons
// (clearCache/autoNav/popStress) that would otherwise sit between
// match and connect are absent, so `:last-child` for connect is safe
// regardless of dev-mode, but the FIXED positional indices for
// mint/learn/play/match assume they are NOT present — true for
// `npm run build`'s output, which is what this harness serves.
const SLOT_SELECTORS = {
  loadSave:      { selector: '.board-actions' },
  boardRail:     { selector: '.thumb-list' },
  addBoard:      { selector: '.tab-add-btn' },
  jankTest:      { selector: null, reason: 'dev-only (`v-if="isDevBuild"`) — absent by construction from a production build' },
  preview:       { selector: '.board-preview' },
  title:         { selector: '.toolbar-title' },
  engineUri:     { selector: '.engine-uri' },
  engineMetrics: { selector: '.engine-metrics-bar', reason: 'mounts only while the engine is connected (`v-if="isConnected"`) — this harness runs with no backend/proxy, so expect absent' },
  sliders:       { selector: '.sliders-metric' },
  setup:         { selector: '.setup-trigger' },
  moveNav:       { selector: '.toolbar-move-nav' },
  mint:          { selector: '.engine-controls .highlight-btn' },
  learn:         { selector: '.engine-controls .toolbar-btn:nth-child(2)' },
  play:          { selector: '.engine-controls .toolbar-btn:nth-child(3)' },
  match:         { selector: '.engine-controls .toolbar-btn:nth-child(4)' },
  clearCache:    { selector: null, reason: 'dev-only (`v-if="isDevBuild"`) — absent by construction from a production build' },
  autoNav:       { selector: null, reason: 'dev-only (`v-if="isDevBuild"`) — absent by construction from a production build' },
  popStress:     { selector: null, reason: 'dev-only (`v-if="isDevBuild"`) — absent by construction from a production build' },
  connect:       { selector: '.engine-controls .toolbar-btn:last-child' },
  sidebarToggle: { selector: '.sidebar-collapse-rail .collapse-btn' },
  boardToggle:   { selector: '.right-toggles .collapse-btn:nth-child(1)' },
  treeToggle:    { selector: '.right-toggles .collapse-btn:nth-child(2)' },
  ctrlToggle:    { selector: '.right-toggles .collapse-btn:nth-child(3)' },
  locale:        { selector: '.locale-picker' },
  captureBanner: { selector: '#keybinding-capture-banner', reason: 'system-driven presence (`v-if="capturingActionLabel !== null"`) — expect absent unless keybinding capture is armed' },
  saveBanner:    { selector: '#workspace-save-banner', reason: 'system-driven presence (`v-if="store.workspaceSaveState.kind === \'error\'"`) — expect absent absent a save failure' },
  systemLog:     { selector: '.system-log-panel', reason: 'conditionally mounted (`v-if="systemLogExpanded || transientLogReveal"`) — expect absent on a cold, message-free load' },
  B:             { selector: '#board-square' },
  setupChip:     { selector: '[data-testid="setup-mode-chip"]', reason: 'system-driven presence (`v-if="activeTool"`) — expect absent unless setup mode is armed' },
  moveBadge:     { selector: '.move-badge' },
  players:       { selector: '.player-names' },
  rulesKomi:     { selector: '.game-info' },
  hintSlot:      { selector: '.transient-hint' },
  pass:          { selector: '.pass-btn' },
  moveNumbers:   { selector: '.move-numbers-btn' },
  caps:          { selector: '.caps' },
  userBadge:     { selector: '.user-badge' },
  resizerOuter:  { selector: '#resizer-outer' },
  tree:          { selector: '#vue-tree-panel' },
  resizerInner:  { selector: '#resizer-inner' },
  // T() (Exclusive) semantics: every child of the control-panel tab group
  // receives the SAME rectangle (§4.1 line 297-299) — all five CP-* slots
  // solve to one identical rect, and `#control-panel` (TabWidget's own
  // wrapper, which renders every pane's content into one body per
  // `TabWidget.vue:126-148` and `v-show`s the active one) is the one DOM
  // container all five legitimately measure against.
  'CP-library':  { selector: '#control-panel' },
  'CP-cards':    { selector: '#control-panel' },
  'CP-settings': { selector: '#control-panel' },
  'CP-analysis': { selector: '#control-panel' },
  'CP-other':    { selector: '#control-panel' },
};

// ── CLI args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const port = Number(flag('port', '19100'));
if (!Number.isInteger(port) || port < 19100) {
  console.error(`[lyt-conformance] refusing port ${port} -- scratch ports must be >= 19100 (live ports 4173/5173/5174/8764 are off-limits, per the harness's own discipline)`);
  process.exit(2);
}
const headed = argv.includes('--headed');
const doBuild = argv.includes('--build');
const outDir = flag('out-dir', DIVERGENCE_DIR);
const distDir = flag('dist-dir', join(FRONTEND_ROOT, 'dist'));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: FRONTEND_ROOT, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

async function waitForPreviewReady(child, url, timeoutMs = 30_000) {
  // No blind sleep: poll a real HTTP HEAD/GET against the preview server
  // until it answers or the bounded timeout elapses. `fetch` is a native
  // Node global (v18+); no extra dependency.
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
      lastErr = new Error(`preview responded ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview never became ready at ${url}: ${lastErr}`);
}

async function measureAtSize(browser, { label, wPx, hPx }) {
  const context = await browser.newContext({ viewport: { width: wPx, height: hPx } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  const url = `http://127.0.0.1:${port}/`;
  let workspaceReached = true;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    // Condition wait, not a sleep: bounded for the "never reaches loaded"
    // case (no backend reachable AND the auth flow itself hangs) --
    // see the module docstring's "Playwright discipline" section.
    await page.waitForSelector('#split-workspace', { timeout: 20_000 });
  } catch {
    workspaceReached = false;
  }

  const measurements = {};
  if (workspaceReached) {
    for (const [widget, { selector }] of Object.entries(SLOT_SELECTORS)) {
      if (selector === null) continue;
      // eslint-disable-next-line no-await-in-loop -- sequential DOM reads, not a hot path
      const rect = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, selector);
      measurements[widget] = rect; // null if selector matched nothing
    }
  }

  await context.close();
  return { label, workspaceReached, measurements, consoleErrors };
}

function classify(solvedRect, measuredRect) {
  if (!measuredRect) return { verdict: 'unmappable', reason: 'selector matched no element in the rendered DOM' };
  const dx = Math.abs(solvedRect.x - measuredRect.x);
  const dy = Math.abs(solvedRect.y - measuredRect.y);
  const dw = Math.abs(solvedRect.w - measuredRect.w);
  const dh = Math.abs(solvedRect.h - measuredRect.h);
  const withinTolerance = dx <= TOLERANCE_PX && dy <= TOLERANCE_PX && dw <= TOLERANCE_PX && dh <= TOLERANCE_PX;
  return {
    verdict: withinTolerance ? 'match' : 'divergent',
    delta: { dx, dy, dw, dh },
  };
}

function fmtRect(r) {
  if (!r) return '—';
  return `x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.w)} h=${Math.round(r.h)}`;
}

function renderReportMarkdown(runs, meta) {
  const stamp = meta.stamp;
  const lines = [];
  lines.push(`# LYT conformance divergence report — ${stamp}`);
  lines.push('');
  lines.push('Phase 1 "shadow mode" (LYT adoption roadmap, commission: lyt-shadow-harness).');
  lines.push('Measured against the BUILT SPA, no backend running, current-row-repaired');
  lines.push('encoding (`research/lyt/encodings/current_row_repaired.lyt`) vs. its solved');
  lines.push('geometry (`frontend/src/state/lyt-solved-layout.gen.ts`, generated by');
  lines.push('`research/lyt/emit_ts.py`).');
  lines.push('');
  lines.push(`Tolerance: ${TOLERANCE_PX}px per axis (x/y/w/h) — see the script's own`);
  lines.push('`TOLERANCE_PX` comment for the rationale (sub-pixel rounding + a single');
  lines.push('hairline border; not generous enough to mask a genuine divergence).');
  lines.push('');
  lines.push('Divergence here is EXPECTED and is the deliverable, not a defect — this');
  lines.push('harness does not tune the app to make the numbers agree.');
  lines.push('');
  lines.push('## Slot -> selector mapping table');
  lines.push('');
  lines.push('| widget | selector | note |');
  lines.push('|---|---|---|');
  for (const [widget, { selector, reason }] of Object.entries(SLOT_SELECTORS)) {
    lines.push(`| \`${widget}\` | ${selector ? '\`' + selector + '\`' : '*(none)*'} | ${reason ?? ''} |`);
  }
  const unmappableByDesign = Object.entries(SLOT_SELECTORS).filter(([, v]) => v.selector === null);
  lines.push('');
  lines.push(`**Unmappable by design (no selector at all): ${unmappableByDesign.length}** — ${unmappableByDesign.map(([w]) => `\`${w}\``).join(', ')}.`);
  lines.push('');

  for (const run of runs) {
    lines.push(`## ${run.label} (${run.wPx}x${run.hPx})`);
    lines.push('');
    if (run.solvedStatus !== 'OPTIMAL' && run.solvedStatus !== 'FEASIBLE') {
      lines.push(`Solver status: **${run.solvedStatus}** — no solved geometry exists for this size; not measured.`);
      lines.push('');
      continue;
    }
    if (!run.workspaceReached) {
      lines.push('**UNREACHABLE**: the workspace never reached a measurable state within the');
      lines.push('20s bounded wait for `#split-workspace` (no backend was started, per this');
      lines.push('harness\'s own scope). Every in-tree slot for this size is unmappable.');
      lines.push('');
      continue;
    }
    if (run.consoleErrors.length > 0) {
      lines.push(`Page errors observed: ${run.consoleErrors.length} (see raw log; not classified below).`);
      lines.push('');
    }
    lines.push('| widget | solved | measured | classification | delta (dx,dy,dw,dh) |');
    lines.push('|---|---|---|---|---|');
    let nMatch = 0, nDivergent = 0, nUnmappable = 0;
    for (const [widget, sel] of Object.entries(SLOT_SELECTORS)) {
      const solved = run.solvedSlots[widget];
      if (sel.selector === null) {
        nUnmappable++;
        lines.push(`| \`${widget}\` | ${fmtRect(solved)} | *(no selector)* | unmappable | — |`);
        continue;
      }
      const measured = run.measurements[widget];
      const { verdict, delta, reason } = classify(solved, measured);
      if (verdict === 'match') nMatch++;
      else if (verdict === 'divergent') nDivergent++;
      else nUnmappable++;
      const deltaStr = delta ? `${Math.round(delta.dx)},${Math.round(delta.dy)},${Math.round(delta.dw)},${Math.round(delta.dh)}` : (reason ?? '—');
      lines.push(`| \`${widget}\` | ${fmtRect(solved)} | ${fmtRect(measured)} | ${verdict} | ${deltaStr} |`);
    }
    lines.push('');
    lines.push(`**Headline: ${nMatch} match / ${nDivergent} divergent / ${nUnmappable} unmappable** (of ${Object.keys(SLOT_SELECTORS).length} slots).`);
    lines.push('');
  }

  lines.push('## License');
  lines.push('');
  lines.push('Public Domain (The Unlicense), matching `research/lyt/__init__.py`\'s license');
  lines.push('line and the umbrella\'s ADR-0006 per-file convention.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  if (doBuild) {
    console.log('[lyt-conformance] building SPA (npm run build)…');
    await run('npm', ['run', 'build']);
  } else {
    try {
      await access(join(distDir, 'index.html'));
    } catch {
      console.error(`[lyt-conformance] ${distDir}/index.html not found -- run \`npm run build\` first, or pass --build`);
      process.exit(2);
    }
  }

  console.log(`[lyt-conformance] starting vite preview on port ${port}…`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: FRONTEND_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewOutput = '';
  preview.stdout.on('data', (d) => { previewOutput += d.toString(); });
  preview.stderr.on('data', (d) => { previewOutput += d.toString(); });

  let browser = null;
  try {
    await waitForPreviewReady(preview, `http://127.0.0.1:${port}/`);

    console.log(`[lyt-conformance] launching chromium (headless=${!headed})…`);
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: !headed,
      args: ['--js-flags=--max-old-space-size=1024'],
    });

    const runs = [];
    for (const reg of LYT_SOLVED_LAYOUT) {
      console.log(`[lyt-conformance] measuring ${reg.label} (${reg.wPx}x${reg.hPx}), solver status=${reg.status}…`);
      if (reg.status !== 'OPTIMAL' && reg.status !== 'FEASIBLE') {
        runs.push({ label: reg.label, wPx: reg.wPx, hPx: reg.hPx, solvedStatus: reg.status, solvedSlots: {}, workspaceReached: false, measurements: {}, consoleErrors: [] });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- sequential viewport sizes, not parallelizable against one browser instance
      const result = await measureAtSize(browser, reg);
      runs.push({ ...result, wPx: reg.wPx, hPx: reg.hPx, solvedStatus: reg.status, solvedSlots: reg.slots });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(outDir, `${stamp}-current-row-repaired.md`);
    const report = renderReportMarkdown(runs, { stamp, screenClasses: LYT_SCREEN_CLASSES });
    await mkdir(outDir, { recursive: true });
    await writeFile(reportPath, report);
    console.log(`[lyt-conformance] wrote ${reportPath}`);

    for (const run of runs) {
      if (run.solvedStatus !== 'OPTIMAL' && run.solvedStatus !== 'FEASIBLE') {
        console.log(`  ${run.label.padEnd(22)} solver=${run.solvedStatus} (not measured)`);
        continue;
      }
      if (!run.workspaceReached) {
        console.log(`  ${run.label.padEnd(22)} UNREACHABLE (workspace never loaded)`);
        continue;
      }
      let nMatch = 0, nDivergent = 0, nUnmappable = 0;
      for (const [widget, sel] of Object.entries(SLOT_SELECTORS)) {
        if (sel.selector === null) { nUnmappable++; continue; }
        const { verdict } = classify(run.solvedSlots[widget], run.measurements[widget]);
        if (verdict === 'match') nMatch++;
        else if (verdict === 'divergent') nDivergent++;
        else nUnmappable++;
      }
      console.log(`  ${run.label.padEnd(22)} match=${nMatch} divergent=${nDivergent} unmappable=${nUnmappable}`);
    }
  } finally {
    if (browser) await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('[lyt-conformance] FAILED:', err);
  process.exit(1);
});
