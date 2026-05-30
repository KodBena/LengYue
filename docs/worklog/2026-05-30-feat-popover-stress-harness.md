# Worklog — popover-stress capture harness (2026-05-30)

*(Backfilled the same day from commit `1f62c3d`.)*

The autonav analog (`docs/worklog/2026-05-30-feat-autonav-perf-harness.md`)
for toolbar popovers. Instead of physically hovering a popover open/closed
while a range query streams, a dev-only harness drives a target popover's
`open` state at a fixed cadence and emits markers so a captured Firefox
profile can be sliced by toggle and by whether a query was streaming — the
programmatic stimulus the popover-sluggishness question needed, in place of
physical mouse movement. No perf *claim* is made here (ADR-0009); it is the
capture harness.

## What shipped

- **`src/composables/useAutoPopoverPerf.ts`** (new, `[B1]`). Toggles the
  target popover open/closed every 250 ms (`HALF_PERIOD_MS`) while running,
  emitting `popover:open` (detail: cycle, target, live queue state via
  `summarizeAnalysisQueue`) / `popover:close`, bracketed by
  `popover:stress-start` / `-end`. The queue state on each open lets a capture
  partition opens into "while a query streams" vs idle.
- **`src/composables/chrome/useHoverPopover.ts`**: a DEV-gated force hook —
  module-scoped `__devForcePopoverOpen(id)` plus a `devId` option. A DEV watch
  drives the *real* `open` ref, so the harness exercises the true render /
  edge-clamp path with **no synthetic pointer events and no per-popover
  logic**. `EngineQueueTooltip` = `devId 'queue'`,
  `ToolbarSliderPopover` = `'sliders'`.
- **i18n** (`en.json`): `toolbar.popoverStress.{start,stop,title}`. The dev
  button itself lands in the Toolbar rewrite of the following commit
  (`6683b6d`), since Toolbar is restructured there.

All DEV-gated at the call site (`v-if="isDevBuild"`); `import.meta.env.DEV`
statically folds the harness out of production.

## What it surfaced (capture J)

- **The queue tooltip re-renders its list on every packet while open** —
  self-coupled (it binds the `v-for` straight to the per-packet `inFlight`).
  Fixed separately in `docs/worklog/2026-05-30-perf-queue-tooltip-throttle.md`.
- **The Toolbar shell re-renders on every packet** — it read `rootInfo` /
  `metrics` in its own render. Fixed in
  `docs/worklog/2026-05-30-perf-toolbar-metrics-extraction.md`.
- **The slider popover does NOT self-couple** — its sluggishness is pure
  main-thread saturation (the per-packet render storm starving interaction),
  not a per-popover redraw. That reframed the slider lag as a symptom of the
  Toolbar/queue coupling above rather than a third fix.

## Docs

- `FILES.md`: `useAutoPopoverPerf.ts` entry present (`[B1]`).
- No `FEATURES.md` change — DEV-only diagnostic, not a user-facing surface.

License: Public Domain (The Unlicense).
