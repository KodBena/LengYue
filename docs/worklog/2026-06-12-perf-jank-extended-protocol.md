# Worklog: extended jank protocol (`jank-extended` capture scenario)

- **Date:** 2026-06-12
- **Work-status item:** `perf-jank-extended-before-after`
  (maintainer-commissioned 2026-06-12)
- **Sub-project:** `frontend/`
- **Branches:** `bork/perf/jank-extended` (main-side, off main @ `53eedc47`);
  `bork/perf/jank-extended-baseline` (baseline-side, off `34650471`)
- **Genre:** ADR-0009 measurement infrastructure — a *capture harness*, not
  a perf claim. No before/after numbers are asserted here; a separate agent
  takes 10 readings per tree state later (see RUNBOOK).

## Why

Render-count / patch-count alone is a deficient realtime probe. The existing
jank test (`useJankTest.ts`) drives the docked-thumbnail preview path but
never exercises the on-board analysis overlays (move suggestions, liveness,
transpositions, ownership maps) nor a concurrent in-flight query. This work
adds a CDP-drivable `jank-extended` scenario that composes the jank stress with
the overlay + streaming-query stress, so a before/after comparison across the
2026-06 refactoring span (baseline `34650471` vs current main) can surface any
cost of introduced indirections.

## The protocol (authoritative; quoted near-verbatim from the commission)

> On the 342-move Shusaku game, first fire off a 200-visit range query (with
> useTransposition enabled), make sure all overlays are active (move
> suggestions, liveness, transpositions, ownership maps), and only then apply
> the autonav + popover + board scrubbing + active query in flight. The active
> query in flight should be set to something stupid like 100000 visits per node
> just to make sure the query does not finish until the auto-nav is finished;
> when the auto-nav is finished, the query should be canceled indirectly *by
> disconnecting* from the KataGo proxy. Caches always need to be cleared to get
> accurate readings.

## Scenario design (phases + marks)

Implemented as a `PerfScenario` (`jankExtended.ts`) registered as
`jank-extended` in the scenario registry, so `runScenario` brackets it with
`scenario:jank-extended:start` / `:end` (the marks `perf-trace-parse.mjs`
auto-windows on). Each phase emits a `scenario:jank-extended:<phase>:start/end`
mark so the parser segments the run. Fixed order:

| # | Phase | Marks | What runs |
|---|-------|-------|-----------|
| 1 | connect + cache clear | `connect:start/end`, `cacheclear:start/end` | `ctx.connectEngine({url, model})` then `ctx.clearCache()` (proxy `clear_cache`). `cache`/`lookup_cache` left at their registry defaults (both off) per the cold-cache discipline. Connect precedes clear because `clearCache` requires a connected engine. |
| 2 | board setup | `setup:start/end` | The 16-board Shusaku rail via the substrate's `setUpRail` (fixed 342-move Shusaku located by metadata, fail-loud if absent; 15 random others at move 50). Shusaku made active at root. |
| — | overlays enabled (see "Deviation" below) | (none) | `enableAllOverlays()` flips move suggestions / liveness / ownership-continuous / transposition rings (session.ui) + the transposition capability (profile). Enabled here, *before* the warm query, so the warm query carries `includeOwnership: true` and the transposition opt-in. |
| 3 | warm query | `warmquery:start/end` | `ctx.analyzeRange(shusaku, {full:true, visits:200})`, **awaited to completion** via `handle.settled`. |
| 4 | overlays asserted | `overlays:start`, `overlays:on` | `assertAllOverlaysOn()` — re-reads live store state, throws (ADR-0002) if any overlay/capability is off. Gates the stress phase. |
| 5 | stress | `stress:start/end`, `drive:start/end`, `jankext:autonav:*`, `popover:open/close` | In-flight `analyzeRange(shusaku, {full:true, visits:100000})` fired **first** (fire-and-forget, not awaited), then `popoverStress` spawned + `startHoverScrub()` + ONE root→leaf `runAutonav` pass (its completion defines run length, `normalizeTab:false`). `stress:end` carries `{inflightStillRunning}` detail. |
| 6 | indirect cancel | `disconnect:start/end` | `analysisService.disconnect()` (closes the WS → terminates every in-flight query — the *indirect* cancel; the in-flight handle is deliberately NOT `stop()`'d), then `await waitFor(status === 'disconnected')`. |
| — | cleanup (`finally`) | (after `:end`) | `restoreOverlayState` (throw-free, runs first so a `resetWorkspace` throw can't strand overlay state) then `ctx.resetWorkspace()` (the substrate's boards bypass `ctx.loadSgf`, so the context's created-board teardown doesn't cover them). |

### Deviation named loudly: overlays enabled *before* the warm query

The protocol numbers the warm query (step 3) before overlays-active (step 4).
The scenario enables overlays *before* the warm query. This is the **faithful**
reading, not a reordering of intent: `analysis-service.ts` computes
`needsOwnership` from the ownership-overlay state **at query construction**
(`:617-618`) and gates `includeOwnership: true` on it (`:705`); the
transposition capability is likewise read from the store at construction
(`:647`). If overlays were enabled strictly *after* the warm query, the warm
query would carry neither ownership nor the transposition opt-in — i.e. it would
not be the "all overlays active" warm query the protocol wants. The protocol's
"make sure all overlays are active, and *only then* apply the stress" is honored
by the fail-loud `assertAllOverlaysOn()` still gating the **stress** phase
(step 4 mark `overlays:on`). Named here, in the `jankExtended.ts` header, and in
an inline block so it is not mistaken for a silent protocol drift.

## Toggle paths found (the load-bearing store reads/writes)

Confirmed by reading the source on both trees (identical paths in both):

| Overlay / capability | Store path | Default | Writer in scenario |
|---|---|---|---|
| Move suggestions | `store.session.ui.showMoveSuggestions` | `true` | direct session.ui write (same as the `m` keybinding handler) |
| Liveness | `store.session.ui.overlayLayers.ownership.liveness` | `false` | direct session.ui write (same as the `l` keybinding handler) |
| Ownership map | `store.session.ui.overlayLayers.ownership.continuous` | `false` | direct session.ui write (`c` keybinding handler). Enabling **any** of `{continuous, dots, liveness}` flips `needsOwnership` → `includeOwnership: true` on the wire (`analysis-service.ts:617-618, :705`), so the map has data to render. |
| Transposition **rings** (display) | `store.session.ui.showTranspositionRings` | `true` | direct session.ui write |
| Transposition **capability** (wire opt-in) | `store.profile.settings.engine.katago.useTransposition` | `true` | `mutateProfile` (main) / direct (baseline — see port delta) |

The two transposition concepts are distinct and both are set: the **ring** is
the rendering overlay (`session.ui.showTranspositionRings`); the **capability**
is the wire `transposition: {}` opt-in (`engine.katago.useTransposition`),
assembled by `buildPerQueryCapabilities` (`capability-injection.ts:182-183`)
and engaged only when the proxy advertises `transposition`. The protocol's
step 3 names the capability; step 4's "transpositions" names the ring overlay.

## Transposition-enable mechanism

`useTransposition` (default `true`) → read at query construction in
`analysis-service.ts:647` → passed to `buildPerQueryCapabilities` →
`engageTransposition = input.useTransposition && 'transposition' in
input.advertised` (`capability-injection.ts:182-183`) → injects
`transposition: {}` into the wire `capabilities` dict (`:224`). The scenario
sets it explicitly (assert-not-assume) even though the default is already `true`.

## Indirect-disconnect cancel wiring

`analysisService.disconnect()` (`analysis-service.ts:444-461`) does a telemetry
sweep, then `this.client.disconnect()` (closes the WebSocket), then
`applyEngineDisconnectReset()` (`engine-connection.ts:129-134`, sets
`store.engine.status = 'disconnected'`, no auto-reconnect). Closing the WS
terminates every in-flight query at the proxy — that is the *indirect* cancel.
The scenario does **not** call `inflight.stop()` (which would route to
`stopQuery` — the *direct* cancel the protocol forbids); the in-flight handle is
intentionally left un-stopped and the disconnect is the only cancel mechanism.
The scenario then `await waitFor(status === 'disconnected')` so the
`disconnect:end` mark brackets the completed teardown.

## Port deltas (baseline `34650471` vs current main)

The two implementations run the **same protocol**. Deltas found and how each is
handled:

1. **Profile-write mechanism (the sole code-path delta).** Main routes the
   `useTransposition` write through `mutateProfile` (`src/store/profile-owner.ts`,
   landed 2026-06-11). The baseline tree predates `profile-owner.ts`, so its
   port writes `store.profile.settings.engine.katago.useTransposition = …`
   **directly** — the same delta the baseline `scenarioContext.ts` already
   carries for the adaptive toggle. The two writes are behaviourally identical
   (same deep-reactive object, same SyncService deep-watch observation). Named
   in the baseline `jankExtended.ts` header ("BASELINE PORT") and in the
   inline comments. **Not a protocol difference.**
2. `getActiveVariationPath` returns a branded `RootToLeafPath` on main vs an
   unbranded `NodeId[]` on baseline. The substrate uses it only for `.length`
   and indexing, so no cast is needed on either tree — no behavioural effect.
3. `runAutonav`'s `subTab` option is main-only. The scenario does **not** use
   `subTab` on either tree (it passes `normalizeTab:false`), so this delta does
   not touch the scenario.

Everything else the scenario touches is identical across the trees: the overlay
store paths, `showTranspositionRings`, `useTransposition`, the
ownership→`includeOwnership` gate, `capability-injection.ts`,
`analysisService.{analyzeRange, disconnect, clearCache, connect, stopQuery}`,
the `analyzeRange` positional signature (visits is the 5th arg, no client-side
clamp), the telemetry `inFlight` view, the scenario registry shape, and the
`window.__perfScenario` install. Verified by a full delta audit (subagent) and
by direct source reads.

### Comparison-environment note (NOT a protocol confound, but the data agent must know)

The baseline app is at `CURRENT_SCHEMA_VERSION = 59`; the shared `local_user`
backend's persisted workspace blob is at schema **60** (written by the newer
main app). The baseline app therefore **fails to hydrate** the persisted blob
(`[Sync] Hydration failed: Persisted blob is at schemaVersion 60, ahead of this
app's 59` — fail-loud, correct ADR-0002 behaviour) and starts from a **fresh
default workspace**. This does **not** confound the protocol: the scenario sets
every overlay/capability explicitly and snapshots/restores them, and it builds
its own board rail from the library (the library auth works — the 342-step
Shusaku navigation proves it). But the data agent should know the two tree
states start from different persisted-workspace states (main: hydrates schema
60; baseline: fresh defaults), and that the scenario's explicit overlay-setting
is what makes the runs comparable regardless.

## Verification runs (one headed CDP run per tree state)

Probe-before-trust for a measurement harness: one headed X11 capture per tree,
parsed to confirm the phase marks and per-component data are present and the
protocol visibly ran. **These are verification runs, not data.**

Stack (standing, confirmed up): backend `127.0.0.1:8764` (library holds Shusaku),
SELECTOR proxy `ws://127.0.0.1:1235`, model `b10c128`. Headed Chromium on the
real display `:0` via the machine-local X11 recipe (see RUNBOOK). Dev server per
worktree on `http://localhost:5176`.

| Tree | Trace (under `~/w/vdc/chromium_profiles/`) | Size | gz | mtime (local) |
|---|---|---|---|---|
| main | `jank-extended-main-verify-20260612T011247.json` | 184,184,631 B (175.7 MB) | ~18 MB | 2026-06-12 01:12:33 |
| baseline | `jank-extended-baseline-verify-20260612T011607.json` | 139,473,813 B (133.0 MB) | ~14 MB | 2026-06-12 01:15:53 |

Both traces, parsed with `perf-trace-parse.mjs`, confirm the protocol ran:

- **All phase marks present in order**, including every `:end` and
  `scenario:jank-extended:end`: `start → connect:start/end →
  cacheclear:start/end → setup:start/end → warmquery:start/end →
  overlays:start → overlays:on → stress:start → drive:start/end → autonav →
  stress:end → disconnect:start/end → end`.
- **`overlays:on` fired** ⇒ `assertAllOverlaysOn()` passed (it throws otherwise),
  so all four overlays + the transposition capability were verified ON before
  the stress phase.
- **342 `jankext:autonav:step` marks** on both trees ⇒ the fixed 342-move
  Shusaku game loaded and exactly one root→leaf pass ran.
- **`inflightStillRunning: true`** on both trees (the `stress:end` mark detail)
  ⇒ the 100000-visit/node in-flight query was **still live** at autonav end —
  the protocol's central requirement.
- **`disconnect:end` fired** on both ⇒ the indirect cancel completed (status
  reached `disconnected`).
- Overlay components rendered: `MoveSuggestions`, `BoardDisplay`,
  `BoardHeatmapOverlay` (the ownership map), `BoardVariationsOverlay` mounts and
  per-pass renders are in both traces. Popover stress: ~42–51 open/close cycles.
  Range-packet processing: `rb3:handler` ×1275 (main) / ×1329 (baseline).
- A genuine tree difference already visible (and exactly what the comparison
  exists to surface, not a confound): the baseline thumbnail renders
  `MiniBoardSvg`; main renders `MiniBoardCanvas` (the thumbnail-render-lifecycle
  refactor). The harness drives the same protocol; the rendered components
  differ because the trees differ.

### Out-of-frame review

Ran the hack-rationalization-detector out-of-frame (a subagent that did not see
the implementation reasoning). Verdict: **narrower-but-justified** (a
protocol-faithful harness; the one named deviation — overlays-before-warm-query
— is cost-backed by the `includeOwnership`/capability construction-time read,
not laundered; the multi-writer overlay slots are *owned* via
snapshot-before-mutation + restore-in-`finally`, not per-writer gated). The
cache-warming-the-in-flight-query confound (could the 200-visit warm query warm
a cache that lets the 100000-visit query finish instantly?) was assessed and
judged **not** a completion confound: the replay cache is keyed including
`maxVisits` (200 ≠ 100000 → different keys), and `lookup_cache` is off so the
in-flight query cannot replay — both independently close it; the residual
NN-eval-cache warmth is a second-order *timing* effect, not a completion one,
and 100000 visits/node across a full line cannot drain in a ~342-step autonav
window regardless. The runtime `inflightStillRunning: true` on both trees
confirms this empirically. (Cross-boundary caveat per ADR-0002: the
authoritative "what `clear_cache` clears" and "is `maxVisits` in the replay key"
live in the proxy's `pubsub_hub.py` docstring, not read here; the SPA-side wire
types `engine/katago/types.ts:224-262` were taken as a faithful mirror. If a
future run ever shows the in-flight query completing, verify the proxy replay
key first.)

Two review findings folded in:
- The in-flight-completion guard is a `console.warn`, not a throw, and the
  `stress:end` mark carries `{inflightStillRunning}` as structured detail — kept
  as a warn (a confounded run still yields a parseable trace and the mark detail
  is the durable post-hoc signal); named so the choice is explicit.
- Cleanup ordering hardened: `restoreOverlayState` (throw-free) now runs
  **before** `ctx.resetWorkspace()` in the `finally`, so a `resetWorkspace`
  throw cannot strand the user's overlay state clobbered.

## Gate outputs

Main-side branch (`bork/perf/jank-extended`):
- `npm run build` (`vue-tsc -b && vite build`) — **pass** (strict typecheck,
  1060 modules, built in ~1.9 s).
- `npx eslint .` — **pass** (clean, exit 0).
- `npm run test:run` — **pass** (1041 passed, 4 skipped; 0 failures).

Baseline branch (`bork/perf/jank-extended-baseline`):
- `npm run build` — **pass** (1045 modules). (Baseline lint config predates
  current rules; only build is gated for the baseline port, per the commission.)

## Files

- `frontend/src/composables/perf/jankSubstrate.ts` — **new.** Shared
  docked-thumbnail-jank substrate extracted from `useJankTest.ts` (ADR-0007):
  Shusaku metadata lookup (fail-loud), 16-board rail (`setUpRail`),
  forward-to-ply nav, hover-scrub stimulus.
- `frontend/src/composables/perf/jankExtended.ts` — **new.** The `jank-extended`
  scenario (overlay + streaming-query stress; the protocol above).
- `frontend/src/composables/perf/useJankTest.ts` — **edited.** Re-homed onto the
  substrate; public shape (`useJankTest()` → `{isRunning, toggle}`) unchanged.
- `frontend/src/composables/perf/scenarios.ts` — **edited.** Registered
  `jank-extended` (a pre-built scenario, not a `prepareAnalysis`-preamble one).
- `frontend/FILES.md` — **edited.** Two new perf entries; `scenarios.ts` and
  `useJankTest.ts` entries refreshed.
- (Baseline branch carries the same four source files with the named port delta.)

---

## RUNBOOK — for the data-taking agent (10 readings per tree state)

Mechanical steps. The harness is the same on both trees; only the worktree
path and dev build differ. **These are data runs; the verification traces above
are NOT data — discard or ignore them for the reading set.**

### Env (one-time per shell)

```bash
# X11 access to the real display :0 (machine-local convention)
KEYED=$(xauth -f ~/.Xauthority list | awk 'NR==1{sub(/\/.*/,"",$1); print $1}')
DISPLAY=:0 XAUTHORITY=~/.Xauthority XAUTHLOCALHOSTNAME=$KEYED xset q   # must succeed first
```

Stack must be up (standing rule; fail loudly if not):
- backend `127.0.0.1:8764` — `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8764/openapi.json` ⇒ `200`.
- SELECTOR proxy `ws://127.0.0.1:1235` — TCP open.
- **Do NOT touch** the qEUBO Redis at `127.0.0.1:6379` (persistent state). The
  research Redis at `:6380` is fair game for scratch (shouldn't be needed).

### Per tree state

| State | Worktree frontend dir | Branch |
|---|---|---|
| main | `/home/bork/w/omega/.claude/worktrees/agent-acc947e49c0ac108c/frontend` (or wherever `bork/perf/jank-extended` is checked out) | `bork/perf/jank-extended` |
| baseline | `/home/bork/w/omega/.claude/worktrees/perf-baseline/frontend` | `bork/perf/jank-extended-baseline` |

`npm ci` once per worktree if `node_modules` is absent. Start the dev server,
run the readings, stop the dev server:

```bash
cd <worktree>/frontend
npm run dev          # note the printed http://localhost:PORT (it picks the first free port)
```

### One reading (repeat ×10 per tree state)

The scenario clears the cache itself (phase 1, proxy `clear_cache`), so cold-cache
is built into each run — no manual cache step needed between readings. Keep
`lookup_cache` off (the default). Each run:

```bash
cd <worktree>/frontend
KEYED=$(xauth -f ~/.Xauthority list | awk 'NR==1{sub(/\/.*/,"",$1); print $1}')
DISPLAY=:0 XAUTHORITY=~/.Xauthority XAUTHLOCALHOSTNAME=$KEYED \
  node scripts/perf-capture.mjs jank-extended --headed \
    --url http://localhost:PORT \
    --model b10c128 \
    --proxy-url ws://127.0.0.1:1235
```

The script writes `~/w/vdc/chromium_profiles/jank-extended-<ISO-stamp>.json`.
**Rename each to the reading scheme** (NN = 01..10, `<state>` = `main`|`baseline`):

```bash
mv ~/w/vdc/chromium_profiles/jank-extended-<ISO-stamp>.json \
   ~/w/vdc/chromium_profiles/jank-extended-<state>-runNN-$(date +%Y%m%dT%H%M%S).json
```

(Traces are large — 130–185 MB each; ~14–18 MB gzipped. They live under
`~/w/vdc/chromium_profiles/` per the ADR-0009 Revisit-#5 path override, NOT in
the repo.)

### Per-run sanity check (before trusting a reading)

```bash
node scripts/perf-trace-parse.mjs ~/w/vdc/chromium_profiles/jank-extended-<state>-runNN-*.json
# Confirm in the output / raw trace:
#   - 342 jankext:autonav:step marks   (full Shusaku pass)
#   - overlays:on mark present          (assertion passed)
#   - inflightStillRunning":true        (grep the raw .json; the in-flight query stayed live)
#   - disconnect:end mark present       (indirect cancel completed)
# A run missing any of these is a confounded reading — discard and re-run.
```

### Comparison axis (per ADR-0009; the data agent's job, not this harness's)

Counts, not wall-clock (the Chromium-path comparable). Normalize on the
scenario proxies before comparing costs: `jankext:autonav:step` count
(navigation volume — should be 342 both sides) and `rb3:handler` count
(analysis-packet volume). Then compare per-component `render`/`patch` counts and
the render÷patch ratio (`render ≫ patch` is the render-coupling tell). Window on
`scenario:jank-extended:start..:end` (the parser does this by default). Expect
genuine tree differences (e.g. `MiniBoardSvg` baseline vs `MiniBoardCanvas`
main) — those are the refactoring-span costs the comparison exists to surface.
