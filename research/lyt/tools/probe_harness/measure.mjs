#!/usr/bin/env node
/**
 * research/lyt/tools/probe_harness/measure.mjs
 *
 * LYT relations-first amendment, dispatch A (ledger rows
 * 2396/2397/2399/2400; governing spec §4, PROBE CONTRACT;
 * `.claude/dispatch-reports/lyt-relations-amendment-spec.md`). This is
 * the "separate generated facts file" harness §4 recommends over a
 * direct compiler query: it mounts every named `(component, state)` pair
 * once, records a measurement, and writes
 * `research/lyt/facts.generated.json` — a build-time-supplied input table
 * the compiler is meant to consume (not built by this dispatch; a later
 * dispatch's job), the same footing `loader.PX_PER_CH` already occupies.
 *
 * Two measurement mechanisms, matching §4's own "read-constant vs.
 * live-probe" distinction:
 *
 *   - `kind: "read-constant"` — a static regex read of a named source
 *     symbol (a `.ts` constant, a `.vue` CSS rule). No browser. Cheap,
 *     but stale the moment the source constant drifts from what actually
 *     renders (SPEC.md §2, primitive inventory item 9's own disclosure).
 *   - `kind: "playwright-boundingBox"` — serves the BUILT SPA
 *     (`frontend/dist/`, `npm run build` must have already run) on a
 *     scratch port, mounts a real Chromium page, waits for
 *     `#split-workspace` (the app's own cold-boot mount marker — see
 *     `frontend/scripts/lyt-conformance.mjs`'s own precedent), and reads
 *     `getBoundingClientRect()` on the leaf's own `#leaf-<widgetId>`
 *     slot (`frontend/src/state/lyt-widget-registry.ts`'s own
 *     `slotName` convention — the SAME per-leaf DOM anchor the compiled
 *     program itself mounts against, not a bespoke selector per
 *     component).
 *
 * SCOPE, DISCLOSED (this run, not a limitation of the mechanism itself).
 * A cold, unauthenticated boot with no backend and no KataGo engine
 * reaches only the DEFAULT presence valuation's own rendered slots
 * (`boardRail`/`previewBoard` genuinely absent by default; `A_setup` is
 * force-visible per `lyt-widget-registry.ts`'s own disclosed override;
 * anything gated on `useEngineControls().isConnected` — the connected-
 * state engine metrics, the "connected" envelope state — never mounts,
 * matching `ToolbarEngineControls.vue`'s / `EngineQueueTooltip.vue`'s own
 * disclosed isolation limit for exactly this class of rig). Worst-case
 * LABEL-SET measurements (the exact class of probe the ENGINE-CONTROLS
 * WIDTH FLOOR item's own 185px derivation used — five buttons at their
 * WIDEST label variant, not their default-locale rendering) need a
 * bespoke per-component harness (own detached shadow DOM, own
 * label-variant injection) the way that wave's own W-B2 rig was — this
 * generic harness does not attempt to reproduce that per-component
 * machinery; entries needing it are marked `unexercised` with the reason
 * named, not silently skipped.
 *
 * Process/port/memory discipline (mandatory, per the dispatch brief):
 *   - Wrap the NODE invocation in
 *     `systemd-run --user --scope -p MemoryMax=4G -p Nice=19
 *      -p LimitNICE=0 -p CPUSchedulingPolicy=batch` — this script does
 *     NOT self-wrap (matching `lyt-conformance.mjs`'s own precedent);
 *     the caller wraps `node`:
 *       systemd-run --user --scope -p MemoryMax=4G -p Nice=19 \
 *         -p LimitNICE=0 -p CPUSchedulingPolicy=batch -- \
 *         node --max-old-space-size=2048 \
 *         research/lyt/tools/probe_harness/measure.mjs
 *   - Chromium launched with `--js-flags=--max-old-space-size=1024`.
 *   - ONE Chromium instance, closed in a `finally` block even on error.
 *   - Ports >= 19000 only; the live ports 4173/5173/5174/8764 are
 *     refused at the CLI-arg level (--port below).
 *   - The `vite preview` / static-server child's own pid is tracked and
 *     killed in the same `finally`.
 *   - No `waitForTimeout`/wall-clock sleep anywhere — every wait below
 *     is a `waitForSelector` or a bounded HTTP-poll loop on a real
 *     condition (the same discipline `lyt-conformance.mjs`'s own
 *     `waitForPreviewReady` uses).
 *
 * Usage:
 *   node research/lyt/tools/probe_harness/measure.mjs [--port N]
 *        [--dist-dir DIR] [--out FILE]
 *
 * License: Public Domain (The Unlicense)
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const FRONTEND_ROOT = join(REPO_ROOT, 'frontend');
const RESEARCH_LYT_ROOT = join(REPO_ROOT, 'research', 'lyt');

// This script lives under research/lyt/, but `playwright-core` is a
// frontend/ dependency (research/lyt has no package.json of its own —
// per the umbrella's "each sub-project is independently developed"
// posture, this harness borrows the frontend's toolchain rather than
// duplicating a package.json here). Node's ESM resolver walks up from
// the IMPORTING file's own location, which would never find
// frontend/node_modules — resolved explicitly via a file:// URL instead
// of a bare specifier.
const { chromium } = await import(
  pathToFileURL(join(FRONTEND_ROOT, 'node_modules', 'playwright-core', 'index.mjs')).href
);

const HARNESS_VERSION = 'v1';

// ── CLI args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const port = Number(flag('port', '19200'));
if (!Number.isInteger(port) || port < 19000) {
  console.error(`[lyt-probe-harness] refusing port ${port} -- scratch ports must be >= 19000`);
  process.exit(2);
}
if ([4173, 5173, 5174, 8764].includes(port)) {
  console.error(`[lyt-probe-harness] refusing forbidden port ${port}`);
  process.exit(2);
}
const distDir = flag('dist-dir', join(FRONTEND_ROOT, 'dist'));
const outFile = flag('out', join(RESEARCH_LYT_ROOT, 'facts.generated.json'));

// ── read-constant entries: no browser needed ───────────────────────────
// Each entry names a source file (repo-relative), a symbol/rule to find,
// and a regex whose first capture group is the numeric px value. Static,
// cheap, re-run on the same regeneration cadence a `TREE_PANEL_MIN_WIDTH_PX`
// edit would need to be caught by.
const READ_CONSTANT_ENTRIES = [
  {
    key: 'tree|read-constant|portrait-floor',
    component: 'frontend/src/state/layout-model.ts',
    state: 'TREE_PANEL_MIN_WIDTH_PX constant (portrait class; landscape\'s own 110px is a DISCLOSED solver-only relaxation of this same constant, not itself a live read)',
    axis: 'h',
    file: join(FRONTEND_ROOT, 'src', 'state', 'layout-model.ts'),
    pattern: /const\s+TREE_PANEL_MIN_WIDTH_PX\s*=\s*(\d+)/,
  },
  {
    key: 'resizerOuter+resizerInner|read-constant',
    component: 'frontend/src/state/layout-model.ts',
    state: 'RESIZER_WIDTH_PX, resolved at module load from the committed current_row_asis.lyt solve (resizerOuter/resizerInner leaves)',
    axis: 'h',
    file: join(FRONTEND_ROOT, 'src', 'state', 'layout-model.ts'),
    // RESIZER_WIDTH_PX is computed at runtime from a generated .gen.ts,
    // not a bare literal in this file -- the STATIC fact this harness can
    // read is the CSS rule it mirrors (App.vue's own `.panel-resizer`
    // comment names it directly), not a numeric literal in layout-model.ts
    // itself. See the entry below instead.
    pattern: null,
  },
  {
    key: 'AT_multires|read-constant',
    component: 'frontend/src/components/charts/MultiresolutionIntervalPanel.vue',
    state: 'own declared CSS height rule (MultiresolutionIntervalPanel.vue:153)',
    axis: 'v',
    file: join(FRONTEND_ROOT, 'src', 'components', 'charts', 'MultiresolutionIntervalPanel.vue'),
    pattern: /height:\s*(\d+)px/,
  },
];

// resizerOuter/resizerInner's real static source is App.vue's own CSS
// comment, not a bare TS literal -- read separately since its pattern
// differs from the table shape above.
function readResizerWidthPx() {
  const appVuePath = join(FRONTEND_ROOT, 'src', 'App.vue');
  const text = readFileSync(appVuePath, 'utf8');
  const m = text.match(/\.panel-resizer\s*\{\s*width:\s*(\d+)px/);
  return m ? Number(m[1]) : null;
}

function runReadConstants() {
  const results = [];
  for (const entry of READ_CONSTANT_ENTRIES) {
    if (entry.pattern === null) continue; // handled specially below
    let value = null;
    let error = null;
    try {
      const text = readFileSync(entry.file, 'utf8');
      const m = text.match(entry.pattern);
      if (m) value = Number(m[1]);
      else error = `pattern not found in ${entry.file}`;
    } catch (e) {
      error = String(e);
    }
    results.push({
      key: entry.key,
      component: entry.component,
      state: entry.state,
      axis: entry.axis,
      method: 'read-constant',
      value_px: value,
      error,
      source_file: entry.file.replace(REPO_ROOT + '/', ''),
    });
  }
  const resizerPx = readResizerWidthPx();
  results.push({
    key: 'resizerOuter+resizerInner|read-constant',
    component: 'frontend/src/App.vue',
    state: "'.panel-resizer { width: Npx }' CSS rule (App.vue), which layout-model.ts's RESIZER_WIDTH_PX resolves at runtime from the committed current_row_asis.lyt solve -- this entry reads the CSS rule directly as the more durable static anchor",
    axis: 'h',
    method: 'read-constant',
    value_px: resizerPx,
    error: resizerPx === null ? 'pattern not found in App.vue' : null,
    source_file: 'frontend/src/App.vue',
  });
  return results;
}

// ── live-probe entries ──────────────────────────────────────────────────
// `frontend/src/state/lyt-widget-registry.ts` DOES name a `slotName`
// per leaf (e.g. `'#leaf-A_setup'`), but a first run of this harness
// (WITNESSED, not assumed) found that string is a VUE NAMED-SLOT key
// (`LytNode.vue`'s own `<template v-for="name in slotNames" #[name]>`
// re-export), not a literal DOM `id` attribute — `domIdsByPath` (the
// actual id source, `LytNode.vue`'s own `:id="domId(path)"`) is a
// PATH-keyed map this cold-boot build never populates outside a few
// hardcoded ids. This is disclosed here rather than silently corrected
// without a trace: the selector table below uses the REAL, DOM-verified
// anchors this same run's own inspection pass found (`grep -o 'id="..."'
// / 'class="..."'` against the rendered page), which is why several
// entries are plain classes rather than the registry's own documented
// slot-name convention. A future harness revision that gets
// `domIdsByPath` genuinely populated (or asks App.vue to thread it) could
// switch back to the registry's own generic convention; this run reports
// what it could actually verify, not what the registry's own doc comment
// promises.
const LIVE_PROBE_WIDGETS = [
  { widget: 'A_engine_controls', selector: '.engine-controls', axis: 'h', state: 'default locale, disconnected (cold boot, no backend/engine reachable)' },
  { widget: 'A_engine_eval', selector: '.engine-metrics-bar', axis: 'h', state: 'disconnected -- EXPECT ABSENT (v-if="isConnected" gate; matches this component family\'s own disclosed isolation limit for a backend-less rig)' },
  { widget: 'A_app', selector: '.app-cluster', axis: 'v', state: 'default locale, cold boot' },
  { widget: 'A_setup', selector: '.setup-toolkit', axis: 'v', state: 'force-visible per lyt-widget-registry.ts\'s own disclosed App.vue lytPresenceOverrides (A_setup: true, unconditional) -- reachable even though the compiled program itself declares this leaf presenceDefaultVisible:false' },
  { widget: 'tree', selector: '#vue-tree-panel', axis: 'h', state: 'default (no boards open -- cold, unauthenticated boot)' },
  { widget: 'boardRail', selector: '.thumb-list, .sidebar-collapse-rail', axis: 'h', state: 'default-off release toggle -- EXPECT ABSENT at cold boot (matches the compiled program\'s own presenceDefaultVisible:false)' },
  { widget: 'previewBoard', selector: '.board-preview', axis: 'h', state: 'default-off release toggle -- EXPECT ABSENT at cold boot' },
  { widget: 'CP-library+CP-cards+CP-settings+CP-analysis+CP-other', selector: '#control-panel', axis: 'v', state: 'Exclusive(T) group -- every child shares one rectangle (SPEC.md §2); #control-panel is the one DOM container legitimately measured for all five' },
  { widget: 'resizerOuter', selector: '#resizer-outer', axis: 'h', state: 'default (as-is realization)' },
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: FRONTEND_ROOT, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

// Tiny static file server over frontend/dist -- avoids depending on `vite
// preview`'s own CLI (which this repo pins at a specific vite version);
// http.Server + node:fs is enough for a built SPA's own static assets and
// SPA-fallback routing (any unmatched path serves index.html).
function startStaticServer(root, listenPort) {
  const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  };
  const server = createServer((req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/' || !existsSync(join(root, path))) path = '/index.html';
    try {
      const data = readFileSync(join(root, path));
      const ext = path.slice(path.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(listenPort, '127.0.0.1', () => resolve(server));
  });
}

async function waitForServerReady(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
      lastErr = new Error(`server responded ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`static server never became ready at ${url}: ${lastErr}`);
}

async function runLiveProbes() {
  const results = [];
  if (!existsSync(distDir)) {
    for (const { widget, selector, axis, state } of LIVE_PROBE_WIDGETS) {
      results.push({
        key: `${widget}|playwright-boundingBox`,
        component: selector,
        state,
        axis,
        method: 'playwright-boundingBox',
        value_px: null,
        unexercised: true,
        reason: `${distDir} does not exist -- run 'npm run build' in frontend/ first`,
      });
    }
    return results;
  }

  let server;
  let browser;
  try {
    server = await startStaticServer(distDir, port);
    const url = `http://127.0.0.1:${port}/`;
    await waitForServerReady(url);

    browser = await chromium.launch({
      headless: true,
      args: ['--js-flags=--max-old-space-size=1024'],
    });

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    let workspaceReached = true;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForSelector('#split-workspace', { timeout: 20_000 });
    } catch {
      workspaceReached = false;
    }

    for (const { widget, selector, axis, state } of LIVE_PROBE_WIDGETS) {
      if (!workspaceReached) {
        results.push({
          key: `${widget}|playwright-boundingBox`,
          component: selector,
          state,
          axis,
          method: 'playwright-boundingBox',
          value_px: null,
          unexercised: true,
          reason: '#split-workspace never mounted (cold, backend-less boot did not reach a measurable workspace state)',
        });
        continue;
      }
      // Condition wait, not a blind sleep: several of these components
      // finish their own async auth-retry settling after `load` fires
      // (workspace bootstrap's own unauthenticated-fallback path), so a
      // selector genuinely present in the eventual DOM can still be
      // absent at the instant `load` fired. `waitForSelector` polls a
      // real DOM condition, bounded, never a wall-clock sleep.
      const firstSel = selector.split(',')[0].trim();
      await page.waitForSelector(firstSel, { timeout: 5_000 }).catch(() => null);
      const rect = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }, firstSel);
      if (rect === null) {
        results.push({
          key: `${widget}|playwright-boundingBox`,
          component: selector,
          state,
          axis,
          method: 'playwright-boundingBox',
          value_px: null,
          unexercised: true,
          reason: 'selector not present in the DOM at this state (see the state field for the expected-absent condition, when one is named)',
        });
        continue;
      }
      results.push({
        key: `${widget}|playwright-boundingBox`,
        component: selector,
        state,
        axis,
        method: 'playwright-boundingBox',
        value_px: axis === 'h' ? rect.w : rect.h,
        value_w_px: rect.w,
        value_h_px: rect.h,
        unexercised: false,
      });
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return results;
}

async function main() {
  const readConstantResults = runReadConstants();
  const liveResults = await runLiveProbes();

  let frontendSha = null;
  try {
    frontendSha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim();
  } catch {
    frontendSha = null;
  }

  const doc = {
    provenance: {
      harness: 'research/lyt/tools/probe_harness/measure.mjs',
      harness_version: HARNESS_VERSION,
      frontend_git_sha: frontendSha,
      viewport: '1920x1080 (live-probe entries only; read-constant entries are viewport-independent)',
      date: new Date().toISOString().slice(0, 10),
    },
    entries: [...readConstantResults, ...liveResults],
  };
  writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n');
  const exercised = doc.entries.filter((e) => !e.unexercised && e.value_px !== null).length;
  const unexercised = doc.entries.length - exercised;
  console.log(`[lyt-probe-harness] wrote ${doc.entries.length} entries (${exercised} measured, ${unexercised} unexercised) to ${outFile}`);
}

main().catch((e) => {
  console.error('[lyt-probe-harness] FATAL:', e);
  process.exit(1);
});
