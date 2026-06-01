# Pluggable perf-scenario harness + Chrome/CDP capture + trace parser

- **Status:** Built 2026-06-01 (frontend). Full frontend suite green
  at 769 / 3 / 0 (passed / skipped / xfailed) at branch tip;
  `vue-tsc -b` clean; new code lint-clean (the 5 remaining
  `no-restricted-imports` errors are pre-existing component→service
  boundary violations, untouched here).
- **Genre:** Tooling — the repeatable-capture follow-on to the green
  perf arc (`docs/notes/green-perf-arc-retrospective-2026-05-31.md`).
  Transposes the perf-investigation tooling onto a Chrome/CDP-first
  path per the perf-capture design-space consult
  (`docs/notes/opus-consult-2026-06-01-perf-capture-automation-design-space.md`).
- **Date:** 2026-06-01.

## Context

The green arc's wins were validated through a manual capture
rigamarole (Firefox DevTools, hold-arrow nav under `xset r rate`,
hand-sliced profiles). Two limits: it was manual/semi-automated,
and it could not reproduce the **regime-B** case that motivated the
arc — UI actions *concurrent with* a streaming range analysis —
because the manual nav and the popover stress could not be driven
simultaneously while a query streamed.

The design-space consult concluded a Chrome/CDP-via-Playwright path
should be tested first (a Chrome perf win stands in as a proxy for a
Firefox one; the CDP path automates cleanly), and the gating capture
(`~/w/vdc/chromium_profiles/gnarp.gz`) confirmed a Chrome DevTools
trace carries every ADR-0009 signal — per-component `<C> render` /
`<C> patch` user-timing spans plus the harness marks — even though
`@firefox-devtools/profiler-cli` cannot ingest it (`Image is not
defined`; its Chrome-trace importer is browser-UI-only).

## What shipped

A pluggable scenario harness whose contract lets the author compose
concurrency freely — fire `analyzeRange` (not awaited; it streams)
and `await autonav()` (the yielding measured pass), so the single-
threaded event loop interleaves packet processing with nav renders
(the regime-B interleaving). Three layers:

**Shared primitives (SSOT with the autonomous-SRS driver).** The
overlap with the autonomous-loop driver (`composables/board/
autonomous-srs.ts`) is at the *primitive* layer, not the
orchestration layer (review-session state machine there; render
stress here). Two primitives extracted:

- `composables/reactive-settle.ts` — `waitForCondition`, the
  reactive-settle bridge (resolve a promise when a reactive predicate
  flips true). Was private in `autonomous-srs.ts`; now imported by
  both it and the scenario context.
- `composables/sgf/loadIntoBoard.ts` — `loadSgfIntoBoard`, the bare
  parse + overwrite-board + navigate-to-leaf primitive, extracted
  from `useDirtyBoardGuard`. The guard keeps its confirm-modal +
  swallow-and-log behaviour via a local wrapper; the primitive is
  now fail-loud (ADR-0002), so headless drivers see load failures.
  (Also dropped a gratuitous `as any` — `BoardState.id` is a mutable
  `BoardId`, so the re-id is assignment, not a cast.)

**The scenario module (`composables/perf/`).**

- `autonav.ts` — SSOT autonav loop core: an *awaitable* fixed-timestep
  rAF walk of `next()` to the active line's leaf, emitting
  `<prefix>:start/step/end` marks. `useAutoNavigatePerf` is refactored
  to a thin toggle wrapper over it (public API unchanged); the
  scenario context awaits the same core. `summarizeAnalysisQueue` /
  `AutoNavMarkerDetail` moved here (re-exported from
  `useAutoNavigatePerf` for `useAutoPopoverPerf`).
- `types.ts` — `PerfScenario` (`run(ctx)`), `ScenarioContext`,
  `QueryHandle` (fire-and-forget analysis), `ScenarioStimulus`,
  `RangeOpts`.
- `scenarioContext.ts` — `createScenarioContext` (the imperative
  app-action façade: `createBoard` / `loadSgf` / `loadLibraryGameById`
  / `connectEngine` / `clearCache` / `analyzeRange` / `analyzeFullGame`
  / `autonav` / `spawn` / `waitFor` / `measure` / `mark`) + `runScenario`
  (brackets the run, guarantees spawned-stimulus teardown even on throw).
  `connectEngine({url, model, adaptive})` connects to the proxy, resolves
  a SELECTOR model by **substring** against the advertised labels
  (fail-loud unless exactly one matches — `'b10'` need not be the full
  label), and sets `adaptiveReevaluate.enabled`. `clearCache()` sends the
  proxy `clear_cache` for a cold-cache run.
- `stimuli.ts` — `popoverStress`, the composable form of
  `useAutoPopoverPerf` (toggles a popover via `__devForcePopoverOpen`).
- `scenarios.ts` — registry + built-ins (`nav-only` regime-A baseline,
  `nav-range` regime-B, `full-stress` regime-B + popover churn) +
  `window.__perfScenario` install (dev-gated, from `main.ts`; exposes
  `run` / `list` / `disconnect`). The analysis scenarios share a
  `prepareAnalysis` preamble: connect (model + adaptive) → `clearCache` →
  load fixture — engine awaits **before** board creation so no event-loop
  yield sits between creating the board and `analyzeRange` (an async
  sync-hydrate `resetWorkspace()` would otherwise clobber `store.boards`
  mid-setup). Protocol defaults: **1000 visits/move, adaptive OFF, cold
  cache, SELECTOR `ws://127.0.0.1:1235`** — the green-arc capture protocol.
- `fixtures.ts` — `buildSpacedFixtureSgf`, a generated even-grid game
  (stride-2 → no two stones orthogonally adjacent → legal, no captures
  ever) giving a deterministic 100-move main line. Legality pinned by
  `tests/unit/composables/perf-fixtures.test.ts` (replays through the
  real rules engine: 100 stones, 0 captures).

**The capture + analysis scripts (`scripts/`, not in `FILES.md` —
that map is `src/`-only).**

- `perf-capture.mjs` — launches the system Chromium via
  `playwright-core` (new devDep; no browser download — uses
  `/usr/bin/chromium`), waits for the cold-start bootstrap to settle
  (`networkidle`) so the hydrate's `resetWorkspace` can't clobber the
  scenario board, starts CDP `Tracing`, invokes
  `window.__perfScenario.run(name, cfg)`, writes the trace under
  `~/w/vdc/chromium_profiles/` (space; overrides ADR-0009's
  `~/perf-profiles/`), and on teardown calls `__perfScenario.disconnect()`
  so a heavy range analysis (1000 visits × 100 turns) is not left churning
  on the proxy. Flags: `--model SUBSTR --visits N --proxy-url WS --adapt
  --sgf FILE`. Three faithfulness modes: headless (default, fast, least
  faithful — no real X11 compositor/vsync), `--headed` (our own X11 window,
  observable + real paint), `--connect CDP_URL` (attach to a Chromium the
  user launched with `--remote-debugging-port` — their real desktop
  session; we open a throwaway tab and only *disconnect* on teardown, never
  closing their browser). `--sgf` loads a real game (e.g. a 342-turn SGF) at
  its real depth instead of the 100-move grid fixture. The SPA authenticates
  as the shared `local_user` and its workspace is server-synced, so each
  capture would *append* a throwaway board to that workspace — the scenario
  context now tracks created boards and `closeBoard`s them in teardown
  (additive-neutral; the resource-ownership discipline). Backend
  `/stats/forests` 401s are cosmetic — analysis is a proxy WS, the fixture
  loads client-side.
- `perf-trace-parse.mjs` — dependency-free Chrome-trace analyzer:
  per-component render/patch ranking (the `b`-phase `<C> X` measure
  spans, with the render÷patch ratio — the render-coupling tell),
  aggregate vue render/patch op counts, harness-mark tallies. Clips
  to the `scenario:<name>:start..end` window by default. Verified
  against `gnarp.gz` (reproduces `<ChartPreviewBox>` 628/628,
  `<MiniBoard>` 627/627, autonav 314).
- `package.json` — `perf:capture` / `perf:trace` scripts.

## Design notes

- **Concurrency is event-loop interleaving, not parallelism.** The
  harness reproduces regime-B *because* it shares the real app's
  single-threaded event loop. This only holds if the measured pass
  yields: `ctx.autonav()` (rAF, one step/frame) yields; a tight
  synchronous `nav.next()` loop would serialize and never reproduce
  it (documented as a footgun on `ctx.nav`).
- **No orchestration unification with the autonomous loop.** Forcing
  one Driver shape onto both the review-session loop and the render-
  stress harness would be the wrong abstraction; the SSOT is the
  primitive layer they compose differently.

## Sanity capture (2026-06-01)

A `full-stress` capture (b10 / 1000 visits / no-adapt / cold cache)
against the live SELECTOR stack, run 3× for robustness (all clean,
~28–29 MB each, engine disconnected on teardown each time). Counting
the `scenario:full-stress:start..:end` window of the canonical run:

| component | render | patch | R/P |
|---|---|---|---|
| AnalysisChartPanel | 226 | 226 | 1.00 |
| BaseChart | 226 | 226 | 1.00 |
| ChartPreviewBox | 204 | 204 | 1.00 |
| MiniBoard | 201 | 201 | 1.00 |
| ScoreLeadPanel / MergedDeltaPanel | 113 | 113 | 1.00 |
| TreeWidget | 101 | 101 | 1.00 |

The signature is the regime-B one the green arc targeted: with a range
analysis streaming during the nav walk, the **analysis chart components
(`AnalysisChartPanel` / `BaseChart`) jump to the top** of the ranking
(they were near-zero in the `nav-only` baseline), and `rb3:firstBump`
449 / `rb3:handler` 137 confirm the range query streamed. **`R/P = 1.00`
for every component** — no render-coupling pathology survived the green
arc (the post-arc `TreeWidget` is 101/101, one render+patch per nav step,
not the 762 ms render-coupled cost the arc removed). The drive also
stretched to ~9 popover cycles (vs ~3 for a cold drive), the per-packet
chart work throttling the nav frames — regime-B contention, visible.

Reference: `~/w/vdc/chromium_profiles/full-stress-2026-06-01T09-04-29Z.json`
(29.2 MB, 100-move fixture, 1000 visits/move, b10, no adaptation).

## Open / deferred

- **ADR-0009 amended (2026-06-01)** to record the Chrome/CDP capture path
  + the scenario harness as the automated/repeatable surface (Revisit
  trigger #2 fired). The amendment keeps the "no harness mandate" Neutral
  clause intact — the harness is recommended, not required.
- A dev-toolbar scenario picker (vs the existing autonav / popover
  toggle buttons) is deferred — the Playwright driver calls
  `window.__perfScenario` directly, which is sufficient for capture.
- **Perceptual event projection** — a faithful "what the user observes"
  event-stream chart (the perceptual dual of the render/patch ranking),
  built on an ACL that maps trace events to a code-independent perceptual
  vocabulary. Documented as a design note
  (`docs/notes/perceptual-event-projection-plan.md`) + a Large TODO entry;
  depends on the `--headed`/`--connect` faithful-capture path. Not
  scheduled — a maintainer-interest subproject.

## License

Public Domain (The Unlicense).
