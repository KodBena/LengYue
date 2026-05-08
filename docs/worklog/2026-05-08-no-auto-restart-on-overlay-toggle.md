# Overlay-layer toggles no longer auto-restart analyses

- **Status:** Shipped on `kodbena/frontend/no-auto-restart-on-overlay-toggle`,
  2026-05-08. Build green; 115 / 115 tests pass (suite unchanged).
- **Genre:** Bug fix — costly-and-unexpected side effect of a UI
  toggle; ADR-0002 ("fail loudly" generalised to "expensive
  operations should be explicit, not implicit").
- **Date:** 2026-05-08.

## Context

`useAppBootstrap.ts` carried a `deep: true` watcher on
`store.session.ui.overlayLayers` that called
`analysisService.restartActiveAnalyses()` on **any** change to the
overlay tree. The original justification (the watcher's now-removed
comment block):

> Restart active analyses whenever an overlay layer toggles. The
> flag gates a wire-level field (e.g. `includeOwnership`) that's
> set at query construction; in-flight queries don't pick up the
> new flag value, so a clean stop-then-reissue is the
> discipline-correct refresh.

That reasoning is right for the case where the toggle's effect
genuinely changes the wire query — turning `continuous` on when
`dots` and `liveness` are off flips `needsOwnership` from `false`
to `true`, so the next query needs `includeOwnership: true`.

Two flaws surfaced under use:

### 1. Liveness toggling re-fired identical queries

`liveness` is an SPA-side projection: `BoardWidget.vue`'s
`livenessCells` reads `decodedOwnership` (computed from
`packet.ownership`) and filters per stone-position. Toggling
`liveness` while `continuous` or `dots` is already on **doesn't
change `needsOwnership`** — it stays `true`, the wire query is
identical to the in-flight one, and yet the watcher fired
`restartActiveAnalyses()` anyway. Visible to the user as analysis
progress dropping back to zero on a UI checkbox flip; expensive
because the engine restarts the search from scratch.

### 2. The general posture is wrong

A config-toggle that auto-fires an expensive engine query is the
costly-and-unexpected side-effect class ADR-0002 is shaped to
make explicit. Display preferences should not initiate work the
user didn't ask for; the user re-triggers analysis when they
want fresh data. The original design conflated two concerns:

- **Wire-level data needs.** If the user wants ownership data
  in the cached packet, they need to ask KataGo for it at query
  time via `includeOwnership: true`. Set when any of the three
  ownership sub-modes is on at construction.
- **Display preferences.** Whether to render that data as
  continuous fill, dots, or liveness highlights is a downstream
  rendering choice. The data either is or isn't in the packet;
  the toggle gates whether to render it.

The watcher made the toggle pretend to bridge both concerns
("toggle on → wire flag turns on → fresh data appears"), at the
cost of silently re-issuing analyses on every flip.

## What changed

`frontend/src/composables/useAppBootstrap.ts`. The `watch(...)`
block is removed; an extended comment block in its place names
the deliberate absence and the consumer-side guarantees that
make the no-watcher posture correct.

The consumer side was already wired for "toggle is UI-only" —
this is what made the fix surgical rather than invasive:

- `decodedOwnership` (`BoardWidget.vue:92`) returns `null` when
  the cached packet has no `ownership` field.
- `continuousCells` / `dotsCells` / `livenessCells`
  (`BoardWidget.vue:110-133`) all gate on **both** the toggle
  state AND on `decodedOwnership` being non-null.
- Toggle off → empty list → nothing renders.
- Toggle on with `ownership` in the packet → renders.
- Toggle on without `ownership` in the packet (because the
  original query went out without `includeOwnership: true`) →
  empty list → nothing renders. **No auto-refetch.**

Behaviour change: a user who runs an analysis without an
ownership-mode active and then toggles one on sees nothing
render — they re-run analysis manually to fetch ownership data.
The previous behaviour silently re-issued the analysis on the
toggle, which felt magical but was the costly-side-effect mode.

## What's NOT changed

The qEUBO toolbar watcher (Applied / A / B, also at
`useAppBootstrap.ts`) stays as-is. Clicking A is asking for
analysis under proposal A's parameters — a genuine
data-change request rather than a display preference — so the
auto-restart is well-shaped for that toggle's semantics.

## Related work

The `cross/analysis-persistence` arc (v1.1.0) and the recent
`overrideSettings` arc (kodbena/frontend/katago-override-settings
PR #187) both factor `BoardWidget.vue`'s consumer-side gating
correctness; this work depends on the gating already being
correct, not on extending it. The pre-existing
"resource-ownership audit" tradition (PR #118 onward) is the
sibling discipline — `stopAllBoardAnalyses` and `closeBoard`
already enforce that no orphan analyses leak when boards are
removed; this change ensures that a deliberately-running
analysis doesn't get involuntarily terminated by a UI flip
either.

## Verification

- `npm run build` (vue-tsc -b + vite build) — green.
- `npm run test:run` — 115 / 115 (no test changes; the
  removed watcher had no unit-test coverage and the consumer-
  side gating that the new posture relies on is exercised
  through `tests/integration/useAnalysisProjection.test.ts`
  via the same `BoardWidget`-shaped projection invariants).
- Manual smoke: toggle `liveness` while `continuous` is on —
  no analysis restart; the liveness highlight appears or
  disappears purely client-side. Toggle `continuous` on
  after running an analysis with no ownership-mode active —
  nothing renders (rather than silently re-issuing the
  analysis); a manual re-trigger fetches ownership.

License: Public Domain (The Unlicense)
