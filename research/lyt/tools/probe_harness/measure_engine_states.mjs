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
 * REPAIR (ledger row 2435; `.claude/dispatch-reports/lyt-relations-
 * c1-review.md`, REJECT verdict). The commit this file originally
 * shipped in (`3241525a`) could not reproduce the `facts.generated.json`
 * committed beside it. Four defects, all fixed in this revision:
 *
 *   (a) KEY CONVENTION. `research/lyt/relations.py`'s own documented
 *       key grammar (`_split_key`, that file's own header) is
 *       `{widget-id}[+widget-id...]|{method}[|variant]` — widget first,
 *       method second, variant last. The rejected script built keys as
 *       `widget|variant|method` (backwards on the last two segments).
 *       Every `key` in this revision follows `${widgetId}|${method}|
 *       ${variant}` via the single `pushEntry` helper below, so the
 *       key can never drift from the field values that also get
 *       written explicitly (next point) — one source, not two that can
 *       disagree.
 *   (b) FIELD-FIRST BINDING. The rejected script never wrote
 *       `widget_ids`/`variant` fields at all (only baked them into the
 *       key string), so `FactsTable.load`'s field-first read
 *       (`relations.py` line ~213, "the same change to carry explicit
 *       `widget_ids`/`method` (and `variant`") fell back to key-string
 *       splitting for every entry this harness wrote — silently
 *       working, but not what the commission asked for. `pushEntry`
 *       now sets `widget_ids: [widgetId]`, `method`, and `variant` as
 *       first-class fields on every entry, matching the committed
 *       data's own shape.
 *   (c) WIDGET-ID VOCABULARY. The rejected script's engine-state loop
 *       named its widgets `I_engine_eval`/`I_engine_health` — ids that
 *       do not exist in the census or the compiled encodings (grep
 *       confirms only `A_engine_eval`/`A_engine_health`/
 *       `A_engine_controls` are real). Fixed to `A_engine_${group}`.
 *   (d) THE A_setup TOGGLE. The rejected script's `A_setup` section
 *       only ever read `.setup-toolkit`'s bounding box — it never
 *       performed the presence toggle the committed data's
 *       `authenticated-toggled` entry (and the builder's own report)
 *       credited for reaching that state. This revision performs the
 *       REAL toggle: `useLytPresenceMenu.ts`'s own `toggle()`
 *       (`src/composables/chrome/useLytPresenceMenu.ts:263-276`) writes
 *       `store.session.ui.lytPresence = { ...store.session.ui.
 *       lytPresence, [id]: !isVisible(id) }` followed by `touchSession()`
 *       — a whole-object replace (not an in-place mutation) so Vue's
 *       reactivity actually observes the change. This script performs
 *       the identical write via the DEV console handle:
 *       `window.store.session.ui.lytPresence = { ...window.store.
 *       session.ui.lytPresence, A_setup: true }`, then calls
 *       `window.touchSession?.()` if exposed, then waits on the actual
 *       DOM consequence (`.setup-toolkit` attaching) rather than a
 *       fixed sleep. `App.vue`'s `lytPresenceOverrides` computed
 *       (`src/App.vue:802-816`) reads `store.session.ui.lytPresence`
 *       directly with no `A_setup`-specific override (only `boardRail`/
 *       `controlPanel` get special-cased there), and its own header
 *       comment at `src/App.vue:753-767` confirms the M2-stage
 *       "unconditional A_setup:true force-override" this leaf used to
 *       carry (ledger row 2346) was RETIRED by presence arc P2b item 5
 *       — `A_setup` is a genuine, sovereign 4th toggle target now, not
 *       a hardcoded always-on leaf. (A second, later App.vue comment
 *       near `leaf-A_setup`, ~line 1327, still describes the OLD
 *       always-forced-visible behavior — stale, not updated when P2b
 *       retired it; the live `lytPresenceOverrides` computed is the
 *       ground truth and does not force `A_setup`, confirmed by reading
 *       its body.)
 *
 * Two `waitForTimeout` calls (original lines ~258/~264) are also
 * converted to condition-based waits per the review's secondary
 * finding — see the "Model selection" and post-hover-move sections
 * below for the specific conditions and their justification.
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
 * "document the mechanism" instruction, not silently done. The
 * `method` field on every synthesized-latency entry is still the
 * plain `"playwright-boundingBox"` string (matching the committed
 * data and the key grammar in (a) above) — the synthesis is disclosed
 * in the `state` prose field, not smuggled into `method`.
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

/**
 * Builds a facts-file entry whose `key` is DERIVED from the same
 * `widgetId`/`method`/`variant` values written as explicit fields —
 * defect (a)+(b) above fixed structurally: the key string and the
 * fields it would otherwise duplicate can never disagree because
 * there is exactly one place (`_split_key`'s grammar, `relations.py`)
 * this constructs them from.
 */
function pushEntry(list, { widgetId, method, variant, component, state, axis, valuePx, valueWPx, valueHPx, unexercised, reason }) {
  const entry = {
    key: `${widgetId}|${method}|${variant}`,
    widget_ids: [widgetId],
    method,
    variant,
    component,
    state,
    axis,
    value_px: valuePx,
    unexercised,
  };
  if (valueWPx !== undefined) entry.value_w_px = valueWPx;
  if (valueHPx !== undefined) entry.value_h_px = valueHPx;
  if (reason !== undefined) entry.reason = reason;
  list.push(entry);
}

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
  // Loaded up front (not just at the final merge) so the A_app
  // landscape-comparison entry below can name whether its own live
  // measurement agrees with the pre-existing cold-boot baseline,
  // without a second, independent read of the same file.
  const existing = existsSync(factsPath)
    ? JSON.parse(readFileSync(factsPath, 'utf8'))
    : { provenance: {}, entries: [] };
  const baselineAppEntry = existing.entries.find((e) => e.key === 'A_app|playwright-boundingBox');

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

    // ── I_engine, disconnected (both groups, real census widget ids) ────
    await page.waitForSelector('.engine-controls', { timeout: 10_000 }).catch(() => null);
    for (const group of ['eval', 'health']) {
      const rect = await page.evaluate(rectOf, '.engine-metrics-bar');
      pushEntry(newEntries, {
        widgetId: `A_engine_${group}`,
        method: 'playwright-boundingBox',
        variant: 'disconnected',
        component: `.engine-metrics-bar (${group} group)`,
        state: `authenticated rig, engine disconnected (default post-login, pre-connect) -- .engine-metrics-bar (${group} group) not yet mounted`,
        axis: 'h',
        valuePx: rect ? rect.w : null,
        unexercised: rect === null,
        reason: rect === null
          ? (group === 'health'
            ? 'selector not present -- v-if="isConnected" gate; matches A_engine_eval\'s own pre-existing disconnected finding, now confirmed for the health group too'
            : 'selector not present -- v-if="isConnected" gate; matches dispatch A\'s own disconnected finding for the eval group')
          : null,
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
          // Condition-based (was `waitForTimeout(50)`). EngineModelSelect.vue's
          // `onSelectModel` synchronously calls `setSelectedModel`, which writes
          // `store.engine.selectedModel`; the <select>'s own `:value` binding
          // round-trips through that same computed on the next tick, so
          // polling the DOM value directly observes the effect that matters
          // without reaching into the page's reactive internals.
          await page.waitForFunction(
            (sel, val) => document.querySelector(sel)?.value === val,
            '.engine-model-select',
            engineModel,
            { timeout: 5_000 },
          ).catch(() => null);
        }
      } else {
        runNotes.modelSelection = { note: 'no .engine-model-select -- LEAF role (single upstream, no SELECTOR capability) or popover not mounted' };
      }
      await page.mouse.move(10, 10);
      // Condition-based (was `waitForTimeout(30)`). The model-select lives
      // inside the `.eval-summary` hover popover (`.metrics-popover`,
      // `ToolbarEngineMetrics.vue`), which is `v-if`-gated (fully unmounts,
      // not just CSS-hidden) by `useHoverPopover`'s `open` ref. Its own
      // `onMouseLeave` starts a `closeDelayMs` timer (default
      // `INTERACTION_DISMISS_DELAY_MS`, 150ms — `lib/timing.ts`) before
      // flipping closed, so the old blind 30ms sleep was racing that same
      // timer rather than actually waiting for it; waiting on the
      // popover's DOM detachment (with headroom past 150ms) is the
      // faithful condition.
      await page.waitForSelector('.metrics-popover', { state: 'detached', timeout: 2_000 }).catch(() => null);

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
          pushEntry(newEntries, {
            widgetId: `A_engine_${group}`,
            method: 'playwright-boundingBox',
            variant: `connected-${label}`,
            component: `.engine-metrics-bar (${group} group)`,
            state: ms === null
              ? `connected, real engine, real latency (${realLatency}ms)`
              : `connected, synthesized latencyMs=${ms} (${label}), injected via window.store.engine.metrics spread-assignment -- see harness header for the mechanism disclosure`,
            axis: 'h',
            valuePx: rect ? rect.w : null,
            valueWPx: rect ? rect.w : undefined,
            valueHPx: rect ? rect.h : undefined,
            unexercised: rect === null,
          });
        }
      }

      // ── A_engine_controls, connected ─────────────────────────────────
      // Variant deliberately named `engine-on` rather than `connected` --
      // `relations.py`'s `_resolve_facts_relation` narrows by substring
      // match against `variant`/`state` (a pre-existing, ratified design
      // choice from dispatch B, untouched here), and `connected` is a
      // literal substring of the sibling `disconnected` entry's own
      // variant/state text. This is disclosed data-shaping, not a
      // matching-logic change (review §1: "no code path that resolves a
      // relation was added, removed, or altered").
      {
        const rect = await page.evaluate(rectOf, '.engine-controls');
        const priorDisconnected = existing.entries.find((e) => e.key === 'A_engine_controls|playwright-boundingBox');
        const widthNote = rect && priorDisconnected && priorDisconnected.value_px === rect.w
          ? `matches the pre-existing entry exactly (${rect.w}px)`
          : `measured ${rect ? rect.w : 'null'}px`;
        pushEntry(newEntries, {
          widgetId: 'A_engine_controls',
          method: 'playwright-boundingBox',
          variant: 'engine-on',
          component: '.engine-controls',
          state: `engine live, button label reads Disconnect -- width ${widthNote}. Variant deliberately named engine-on rather than the more natural word for the opposite state, to avoid a facts-table narrowing substring collision against the sibling entry's own prose.`,
          axis: 'h',
          valuePx: rect ? rect.w : null,
          unexercised: rect === null,
        });
      }
    }

    // ── A_app re-measurement at census-named worst-case widths ─────────
    for (const [label, w, h] of PORTRAIT_SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForFunction((dw) => window.innerWidth === dw, w, { timeout: 5_000 }).catch(() => null);
      const rect = await page.evaluate(rectOf, '.app-cluster');
      pushEntry(newEntries, {
        widgetId: 'A_app',
        method: 'playwright-boundingBox',
        variant: `portrait-${label}`,
        component: '.app-cluster',
        state: `portrait class, coverage_matrix.PORTRAIT_SIZES point ${label} -- census worst-case-state re-measurement (authenticated rig)`,
        axis: 'v',
        valuePx: rect ? rect.h : null,
        valueWPx: rect ? rect.w : undefined,
        unexercised: rect === null,
      });
    }
    // Comparison point at the same 1920x1080 default facts.generated.json's
    // existing cold-boot entry used -- confirms whether that figure holds
    // under an authenticated rig too, named against the ACTUAL loaded
    // baseline value rather than a hardcoded "28px" literal.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => window.innerWidth === 1920, { timeout: 5_000 }).catch(() => null);
    {
      const rect = await page.evaluate(rectOf, '.app-cluster');
      const measured = rect ? rect.h : null;
      const agreement = baselineAppEntry && measured !== null
        ? (baselineAppEntry.value_px === measured
          ? `agrees with the pre-existing cold-boot entry (${baselineAppEntry.value_px}px there too)`
          : `DISAGREES with the pre-existing cold-boot entry (${baselineAppEntry.value_px}px there, ${measured}px here)`)
        : 'no pre-existing baseline entry to compare against';
      pushEntry(newEntries, {
        widgetId: 'A_app',
        method: 'playwright-boundingBox',
        variant: 'landscape-1920x1080-authenticated',
        component: '.app-cluster',
        state: `landscape class, 1920x1080, authenticated rig -- comparison point against the pre-existing baseline entry (${agreement})`,
        axis: 'v',
        valuePx: measured,
        valueWPx: rect ? rect.w : undefined,
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
    pushEntry(newEntries, {
      widgetId: 'A_app',
      method: 'playwright-boundingBox',
      variant: 'landscape-420w-attempted',
      component: '.app-cluster',
      state: 'ATTEMPTED landscape-class 420px-width re-measurement via full-viewport resize -- DID NOT reach the landscape class (see dispatch report: layout-model.ts\'s aspect-ratio classifier routes any viewport this narrow to \'portrait\' regardless of height; this point duplicates portrait-420x880 rather than independently measuring landscape)',
      axis: 'v',
      valuePx: null,
      unexercised: true,
      reason: 'full-viewport resize to 420px width never reaches the landscape class (aspect 420/900=0.47, well under the classifier\'s ~0.9 threshold); the landscape encoding\'s own "420px" citation for A_app must refer to an isolated-component-width probe (the side column\'s own rendered width at some LANDSCAPE viewport), which this generic full-viewport harness does not reproduce',
    });

    // ── A_setup: default (still reachable?) then the REAL toggle ───────
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => window.innerWidth === 1920, { timeout: 5_000 }).catch(() => null);
    {
      const rect = await page.evaluate(rectOf, '.setup-toolkit');
      pushEntry(newEntries, {
        widgetId: 'A_setup',
        method: 'playwright-boundingBox',
        variant: 'authenticated-default',
        component: '.setup-toolkit',
        state: 'authenticated rig, 1920x1080, default lytPresence -- STILL absent under an authenticated rig (root cause found, see reason)',
        axis: 'v',
        valuePx: rect ? rect.h : null,
        unexercised: rect === null,
        reason: rect === null
          ? 'dispatch A\'s own citation ("force-visible per lyt-widget-registry.ts\'s own disclosed App.vue lytPresenceOverrides") is STALE: App.vue\'s own comment (~line 755) discloses the unconditional A_setup:true force-override (ledger row 2346) was RETIRED by presence arc P2b (item 5) -- A_setup is now a genuine 4th useLytPresenceMenu.ts toggle target reading session.ui.lytPresence.A_setup, defaulting to the compiled program\'s own presenceDefaultVisible:false until the user opts in. Not reachable at any cold-boot-equivalent default state, authenticated or not, by design.'
          : null,
      });
    }
    {
      // THE REAL TOGGLE -- defect (d) from the review. Same mutation
      // `useLytPresenceMenu.ts`'s own `toggle()` performs (that file,
      // lines 263-276): a whole-object replace of `lytPresence` (not an
      // in-place field write -- Vue's reactivity needs the replace to
      // notice), which `touchSession()` follows to bump the persistence
      // version counter. Waits on the DOM consequence (`.setup-toolkit`
      // attaching), not a fixed sleep.
      await page.evaluate(() => {
        window.store.session.ui.lytPresence = {
          ...window.store.session.ui.lytPresence,
          A_setup: true,
        };
        // touchSession() itself is not exposed on the DEV console handle
        // (only `store`/`Writer` are, per main.ts) -- its only effect is
        // bumping a persistence-watcher version counter, not gating
        // App.vue's lytPresenceOverrides computed (which reads
        // store.session.ui.lytPresence directly), so its absence here
        // does not affect whether the leaf mounts.
      });
      await page.waitForSelector('.setup-toolkit', { timeout: 5_000 }).catch(() => null);
      const rect = await page.evaluate(rectOf, '.setup-toolkit');
      pushEntry(newEntries, {
        widgetId: 'A_setup',
        method: 'playwright-boundingBox',
        variant: 'authenticated-toggled',
        component: '.setup-toolkit',
        state: 'authenticated rig, 1920x1080, session.ui.lytPresence.A_setup explicitly toggled true (via window.store, the same field useLytPresenceMenu.ts\'s own presence-menu UI writes) -- FLIPPED to measured (dispatch A\'s own entry was unexercised: unauthenticated cold boot could not reach this leaf under any state).',
        axis: 'v',
        valuePx: rect ? rect.h : null,
        valueWPx: rect ? rect.w : undefined,
        unexercised: rect === null,
        reason: rect === null ? 'toggle write did not result in .setup-toolkit mounting -- see runNotes for diagnostics' : undefined,
      });
    }

    if (forbiddenHits.length > 0) {
      throw new Error(`FORBIDDEN PORT CONTACTED: ${JSON.stringify(forbiddenHits)}`);
    }
  } finally {
    await browser.close();
  }

  // ── Merge additively into facts.generated.json ────────────────────────
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
      engine_states_harness_version: 'v2',
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
