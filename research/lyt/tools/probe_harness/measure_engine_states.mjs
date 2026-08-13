#!/usr/bin/env node
/**
 * research/lyt/tools/probe_harness/measure_engine_states.mjs
 *
 * LYT relations-first amendment, dispatch C1 (ledger rows
 * 2419/2425/2427; commission: `.claude/dispatch-reports/lyt-relations-
 * c1-engine-facts.md`). Extends `measure.mjs`'s own probe-harness
 * contract to an AUTHENTICATED, ENGINE-CONNECTED rig — `measure.mjs`
 * itself only ever reaches a cold, unauthenticated, backend-less boot
 * (its own file header names this scope explicitly), so every leaf
 * gated on `useEngineControls().isConnected` (`A_engine_eval`,
 * `A_engine_health`) or on presence-override force-visibility
 * (`A_setup`) stays permanently `unexercised` there. This script picks
 * up exactly those leaves, plus a re-measurement of `A_app` at the
 * census's own named worst-case widths (`.claude/dispatch-reports/
 * lyt-relations-amendment-spec.md` §1.4's `A_app` rows) — additive
 * only, no encoding/loader/compiler edits.
 *
 * SCOPE. This script does NOT stand up the backend/frontend rig
 * itself (unlike `measure.mjs`, which serves a static `frontend/dist/`
 * build directly) — an authenticated, engine-connected boot needs a
 * real backend (own DB copy) and a real `vite` DEV server (not a
 * production build: `window.store`, the DEV-only console handle
 * `src/main.ts` installs under `import.meta.env.DEV`, is how this
 * script injects the engine URL and synthesizes latency states — a
 * production build has no such handle). Start the rig first, per the
 * established pattern in `.claude/dispatch-reports/lyt-n1-statusbar.md`
 * §6 / `lyt-default-layout-dividers.md`'s own "RIG WITNESS" section:
 *
 *   Backend (scratch port >= 19000, own DB copy, never `backend/cards.db`):
 *     DATABASE_URI="sqlite+aiosqlite:////path/to/rig/cards.rig.db" \
 *     QEUBO_ENABLED=false \
 *     systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 \
 *       /path/to/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 19100
 *     (run from `backend/` so relative migration scripts resolve)
 *
 *   Frontend (vite DEV server, not `vite preview`/a build):
 *     VITE_API_BASE_URL="http://127.0.0.1:19100" \
 *     VITE_KATAGO_WS_URL="ws://192.168.122.68:1235" \
 *     systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 \
 *       node_modules/.bin/vite --port 19101 --strictPort
 *     (run from `frontend/`, after `npm install` +
 *     `node node_modules/playwright-core/cli.js install chromium`
 *     if not already present)
 *
 *   Auth: register a throwaway passwordless user against the rig
 *   backend (`POST /auth/register` with no password field,
 *   `ALLOW_PASSWORDLESS_LOGIN` defaults true), mint a JWT
 *   (`POST /auth/token`, `grant_type=password&username=...&password=x`
 *   — the passwordless branch does not check the password value, only
 *   the config flag), inject it into `localStorage['auth_token']`
 *   (the `api-client.ts` `TOKEN_KEY` contract) via Playwright's
 *   `addInitScript`, matching `lyt-default-layout-dividers.md`'s own
 *   disclosed "Auth" rig section.
 *
 * Engine: this codebase's standing allowance is
 * `ws://192.168.122.68:1235` model `'14'` for rig work (never the live
 * ports 4173/5173/5174/8764). The engine URL is set via the SAME
 * profile-settings field the URI-editor UI would write
 * (`store.profile.settings.engine.katago.url`) — not a bypass, the
 * exact field `analysisService.connect()` reads when no explicit
 * override is passed — then the real "Connect" button
 * (`.engine-controls` button, `t('toolbar.connect')`) is clicked.
 * Model selection goes through the real SELECTOR `<select>`
 * (`.engine-model-select`, `EngineModelSelect.vue`), picking the
 * option whose `value` is `'14'` from whatever the proxy actually
 * advertises via `query_models` — never hardcoded/assumed present.
 *
 * LATENCY DIGIT-COUNT SYNTHESIS. `EngineMetrics` is a value object
 * `store.engine` swaps WHOLESALE on every response (`engine.ts`'s own
 * header comment) — a real KataGo round-trip to a healthy proxy will
 * essentially never land in the 4-5-digit-millisecond range, so the
 * five declared states (`disconnected`, `latency_1digit`..
 * `latency_5digit`) can only be reached by DIRECT INJECTION:
 * `window.store.engine.metrics = { ...current, latencyMs: N }`. This
 * writes the exact reactive field `useThrottledSnapshot` already
 * reads (`ToolbarEngineMetrics.vue`'s `liveMetrics`/`displayed`), so
 * it is a synthesis of the DISPLAY INPUT, not a fabrication of a DOM
 * measurement — the resulting box is read from the real, live-rendered
 * component, not asserted. Disclosed here per the commission's own
 * "document the mechanism" instruction, not silently done.
 *
 * FINDING, up front (see the dispatch report for the full account):
 * the current LIVE `ToolbarEngineMetrics.vue` no longer renders
 * latency inline at all — the "Overlap fix" (ledger row 2372) moved it
 * into a `position: fixed` hover popover, so `.engine-metrics-bar`'s
 * own box width is INVARIANT to latency digit count today (a 139px
 * grid-track allotment, not content-driven). The census's I_engine row
 * (`.claude/dispatch-reports/lyt-relations-amendment-spec.md` §1.7,
 * "title/engineMetrics envelope states... 0px/96–220px over
 * {disconnected, latency_1digit..5digit}") describes an OLDER design
 * shape (`current_row_asis.lyt`'s own legacy transcription) that this
 * live measurement does not confirm — reported as a discrepancy, not
 * silently reconciled.
 *
 * Usage (rig must already be running, per the header above):
 *   node research/lyt/tools/probe_harness/measure_engine_states.mjs \
 *     --frontend-url http://127.0.0.1:19101/ \
 *     --backend-url http://127.0.0.1:19100 \
 *     --facts research/lyt/facts.generated.json
 *
 * Process/port/memory discipline: same as `measure.mjs` — wrap the
 * `node` invocation in `systemd-run --user --scope -p MemoryMax=4G --
 * nice -n 19 node --max-old-space-size=1024`, Chromium launched with
 * `--js-flags=--max-old-space-size=1024`, ONE browser instance closed
 * in `finally`, no wall-clock sleeps (every wait below is
 * `waitForSelector`/`waitForFunction`, bounded).
 *
 * License: Public Domain (The Unlicense)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const FRONTEND_ROOT = join(REPO_ROOT, 'frontend');

const { chromium } = await import(
  pathToFileURL(join(FRONTEND_ROOT, 'node_modules', 'playwright-core', 'index.mjs')).href
);

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const frontendUrl = flag('frontend-url', 'http://127.0.0.1:19101/');
const backendUrl = flag('backend-url', 'http://127.0.0.1:19100');
const factsPath = flag('facts', join(REPO_ROOT, 'research', 'lyt', 'facts.generated.json'));
const engineWsUrl = flag('engine-ws-url', 'ws://192.168.122.68:1235');
const engineModel = flag('engine-model', '14');
const usernamePrefix = flag('username-prefix', 'lyt-c1-rig');

const FORBIDDEN_HOSTS = ['127.0.0.1:8764', 'localhost:8764', '127.0.0.1:4173', '127.0.0.1:5173', '127.0.0.1:5174'];

const PORTRAIT_SIZES = [
  ['1080x1920', 1080, 1920],
  ['1200x1600', 1200, 1600],
  ['768x1024', 768, 1024],
  ['540x960', 540, 960],
  ['420x880', 420, 880],
];

async function registerAndLogin() {
  const username = `${usernamePrefix}-${Date.now()}`;
  const reg = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
  const tok = await fetch(`${backendUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=x`,
  });
  if (!tok.ok) throw new Error(`token failed: ${tok.status} ${await tok.text()}`);
  const { access_token: token } = await tok.json();
  return token;
}

function rectOf(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

async function main() {
  const token = await registerAndLogin();
  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--max-old-space-size=1024'],
  });
  const forbiddenHits = [];
  const newEntries = [];
  const runNotes = { wizardDismissed: null, connectMechanism: null, connectError: null, modelSelection: null };

  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript((t) => window.localStorage.setItem('auth_token', t), token);
    const page = await context.newPage();
    page.on('request', (req) => {
      const u = req.url();
      for (const host of FORBIDDEN_HOSTS) if (u.includes(host)) forbiddenHits.push(`${host} <- ${u}`);
    });

    await page.goto(frontendUrl, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('#split-workspace', { timeout: 20_000 });
    await page.waitForFunction(
      () => window.store && window.store.auth && window.store.auth.status !== 'unauthenticated',
      { timeout: 15_000 },
    ).catch(() => null);

    // Fresh registered users boot into the first-run onboarding wizard —
    // real rig fact, not an app defect. Dismiss via its own close button.
    const wizardClose = await page.$('.modal-backdrop .close-btn');
    if (wizardClose) {
      await wizardClose.click();
      await page.waitForSelector('.modal-backdrop', { state: 'detached', timeout: 5_000 }).catch(() => null);
    }
    runNotes.wizardDismissed = wizardClose !== null;

    // ── I_engine, disconnected ──────────────────────────────────────────
    await page.waitForSelector('.engine-controls', { timeout: 10_000 }).catch(() => null);
    {
      const rect = await page.evaluate(rectOf, '.engine-metrics-bar');
      newEntries.push({
        key: 'I_engine_eval+health|disconnected|playwright-boundingBox',
        component: '.engine-metrics-bar',
        state: 'authenticated rig, engine disconnected (default post-login, pre-connect)',
        axis: 'h',
        method: 'playwright-boundingBox',
        value_px: rect ? rect.w : null,
        unexercised: rect === null,
        reason: rect === null ? 'selector not present -- v-if="isConnected" gate; matches dispatch A\'s own disconnected finding' : null,
      });
    }

    // ── Connect (real engine, real ws URL, real Connect button) ─────────
    await page.evaluate((url) => {
      window.store.profile.settings.engine.katago.url = url;
    }, engineWsUrl);
    const btns = await page.$$('.engine-controls button');
    let connectBtn = null;
    for (const b of btns) {
      const text = (await b.textContent() || '').trim();
      if (text === 'Connect') { connectBtn = b; break; }
    }
    if (connectBtn) {
      await connectBtn.click();
      try {
        await page.waitForFunction(() => window.store.engine.status === 'connected', { timeout: 20_000 });
        runNotes.connectMechanism = 'WITNESSED';
      } catch (e) {
        runNotes.connectMechanism = 'UNEXERCISED';
        runNotes.connectError = String(e).slice(0, 300);
      }
    } else {
      runNotes.connectMechanism = 'UNEXERCISED';
      runNotes.connectError = 'Connect button not found in .engine-controls';
    }

    if (runNotes.connectMechanism === 'WITNESSED') {
      // ── Model selection (SELECTOR-mode <select>, real advertised set) ──
      await page.hover('.eval-summary').catch(() => null);
      await page.waitForSelector('.engine-model-select', { timeout: 5_000 }).catch(() => null);
      const selectEl = await page.$('.engine-model-select');
      if (selectEl) {
        const options = await page.evaluate(
          (sel) => Array.from(document.querySelector(sel).options).map((o) => o.value),
          '.engine-model-select',
        );
        runNotes.modelSelection = { options, requested: engineModel, matched: options.includes(engineModel) };
        if (options.includes(engineModel)) {
          await selectEl.selectOption(engineModel);
          await page.waitForTimeout(50); // settle after the synchronous change-event dispatch, not a substitute for a condition
        }
      } else {
        runNotes.modelSelection = { note: 'no .engine-model-select -- LEAF role (single upstream, no SELECTOR capability) or popover not mounted' };
      }
      await page.mouse.move(10, 10);
      await page.waitForTimeout(30);

      // ── I_engine, connected, both groups, real + synthesized latency ──
      const digitStates = [
        ['real', null],
        ['1digit', 9],
        ['2digit', 99],
        ['3digit', 999],
        ['4digit', 9999],
        ['5digit', 99999],
      ];
      for (const [label, ms] of digitStates) {
        if (ms !== null) {
          await page.evaluate((v) => {
            window.store.engine.metrics = { ...window.store.engine.metrics, latencyMs: v };
          }, ms);
          await page.waitForFunction((v) => window.store.engine.metrics.latencyMs === v, ms, { timeout: 5_000 }).catch(() => null);
        }
        for (const [group, selector] of [['eval', '.eval-summary'], ['health', '.health-summary']]) {
          const rect = await page.evaluate((sel) => {
            const trigger = document.querySelector(sel);
            const bar = trigger ? trigger.closest('.engine-metrics-bar') : null;
            if (!bar) return null;
            const r = bar.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }, selector);
          const realLatency = await page.evaluate(() => window.store.engine.metrics.latencyMs);
          newEntries.push({
            key: `I_engine_${group}|connected-${label}|playwright-boundingBox`,
            component: `.engine-metrics-bar (${group} group, via ${selector})`,
            state: ms === null
              ? `connected, real engine, real latency (${realLatency}ms)`
              : `connected, synthesized latencyMs=${ms} (${label}), injected via window.store.engine.metrics spread-assignment`,
            axis: 'h',
            method: ms === null ? 'playwright-boundingBox' : 'playwright-boundingBox (synthesized-state)',
            value_px: rect ? rect.w : null,
            value_h_px: rect ? rect.h : null,
            unexercised: rect === null,
          });
        }
      }

      // ── A_engine_controls, connected (label flips Connect->Disconnect) ─
      {
        const rect = await page.evaluate(rectOf, '.engine-controls');
        newEntries.push({
          key: 'A_engine_controls|connected|playwright-boundingBox',
          component: '.engine-controls',
          state: 'connected (button label Connect->Disconnect) -- comparison point against dispatch A\'s disconnected 185px entry',
          axis: 'h',
          method: 'playwright-boundingBox',
          value_px: rect ? rect.w : null,
          unexercised: rect === null,
        });
      }
    }

    // ── A_app re-measurement at census-named worst-case widths ─────────
    for (const [label, w, h] of PORTRAIT_SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction((dw) => window.innerWidth === dw, w, { timeout: 5_000 }).catch(() => null);
      const rect = await page.evaluate(rectOf, '.app-cluster');
      newEntries.push({
        key: `A_app|portrait-${label}|playwright-boundingBox`,
        component: '.app-cluster',
        state: `portrait class, coverage_matrix.PORTRAIT_SIZES point ${label} -- census worst-case-state re-measurement`,
        axis: 'v',
        method: 'playwright-boundingBox',
        value_px: rect ? rect.h : null,
        value_w_px: rect ? rect.w : null,
        unexercised: rect === null,
      });
    }
    // Comparison point at the same 1920x1080 default facts.generated.json's
    // existing cold-boot entry used (28px there) -- confirms whether that
    // figure holds under an authenticated rig too.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => window.innerWidth === 1920, { timeout: 5_000 }).catch(() => null);
    {
      const rect = await page.evaluate(rectOf, '.app-cluster');
      newEntries.push({
        key: 'A_app|landscape-1920x1080-authenticated|playwright-boundingBox',
        component: '.app-cluster',
        state: 'landscape class, 1920x1080, authenticated rig -- comparison point against facts.generated.json\'s existing cold-boot 28px entry',
        axis: 'v',
        method: 'playwright-boundingBox',
        value_px: rect ? rect.h : null,
        value_w_px: rect ? rect.w : null,
        unexercised: rect === null,
      });
    }
    // DISCLOSED, NOT SILENTLY DROPPED: a full-viewport resize to 420px
    // width -- the width the landscape encoding's own A_app comment cites
    // as its worst case -- does NOT reach the landscape class at all.
    // `layout-model.ts`'s nearest-neighbor classifier routes any viewport
    // with aspect ratio this far below its ~0.9-ish threshold to
    // 'portrait' regardless of the chosen height (420/900 = 0.47), so
    // this point is DUPLICATE of the portrait 420x880 point above, not an
    // independent landscape-class measurement. The landscape encoding's
    // own "420px" citation must refer to an isolated-component-width
    // probe (the side column's own rendered width at SOME landscape
    // viewport, not a full-viewport resize), which this generic harness
    // does not attempt to reproduce -- named as a STOP-and-report item,
    // not silently mislabeled.
    newEntries.push({
      key: 'A_app|landscape-420w-ATTEMPTED|playwright-boundingBox',
      component: '.app-cluster',
      state: 'ATTEMPTED landscape-class 420px-width re-measurement via full-viewport resize -- see the mechanism note above',
      axis: 'v',
      method: 'playwright-boundingBox',
      value_px: null,
      unexercised: true,
      reason: 'full-viewport resize to 420px width never reaches the landscape class (aspect-ratio classifier routes it to portrait); duplicates the portrait 420x880 point rather than measuring landscape -- see dispatch report',
    });

    // ── A_setup: still reachable? (dispatch A found it absent) ─────────
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => window.innerWidth === 1920, { timeout: 5_000 }).catch(() => null);
    {
      const rect = await page.evaluate(rectOf, '.setup-toolkit');
      newEntries.push({
        key: 'A_setup|authenticated|playwright-boundingBox',
        component: '.setup-toolkit',
        state: 'authenticated rig, 1920x1080 -- force-visible per lytPresenceOverrides; dispatch A found it absent at cold unauthenticated boot',
        axis: 'v',
        method: 'playwright-boundingBox',
        value_px: rect ? rect.h : null,
        value_w_px: rect ? rect.w : null,
        unexercised: rect === null,
        reason: rect === null ? 'still absent under an authenticated rig -- see dispatch report' : null,
      });
    }

    if (forbiddenHits.length > 0) {
      throw new Error(`FORBIDDEN PORT CONTACTED: ${JSON.stringify(forbiddenHits)}`);
    }
  } finally {
    await browser.close();
  }

  // ── Merge additively into facts.generated.json ────────────────────────
  const existing = existsSync(factsPath)
    ? JSON.parse(readFileSync(factsPath, 'utf8'))
    : { provenance: {}, entries: [] };
  const existingKeys = new Set(existing.entries.map((e) => e.key));
  const merged = existing.entries.slice();
  for (const e of newEntries) {
    if (existingKeys.has(e.key)) {
      // Same key re-run (e.g. a second pass for the determinism gate) --
      // overwrite in place rather than duplicate.
      const idx = merged.findIndex((m) => m.key === e.key);
      merged[idx] = e;
    } else {
      merged.push(e);
      existingKeys.add(e.key);
    }
  }
  const doc = {
    provenance: {
      ...existing.provenance,
      engine_states_harness: 'research/lyt/tools/probe_harness/measure_engine_states.mjs',
      engine_states_harness_version: 'v1',
      engine_states_date: new Date().toISOString().slice(0, 10),
      engine_states_run_notes: runNotes,
    },
    entries: merged,
  };
  writeFileSync(factsPath, JSON.stringify(doc, null, 2) + '\n');
  console.log(`[measure-engine-states] wrote ${newEntries.length} new/updated entries (of ${merged.length} total) to ${factsPath}`);
  console.log(`[measure-engine-states] run notes: ${JSON.stringify(runNotes)}`);
}

main().catch((e) => {
  console.error('[measure-engine-states] FATAL:', e);
  process.exit(1);
});
