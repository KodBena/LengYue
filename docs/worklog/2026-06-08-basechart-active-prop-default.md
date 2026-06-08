# Worklog — fix intermission delta chart blank-render + `ecModel` crash (BaseChart `active` default) (2026-06-08)

## Trigger

Two frontend symptoms the maintainer reported, suspected related:

1. A console `TypeError: can't access property "queryComponents", ecModel is
   undefined` from `queryReferringComponents` ← `containPixel` ← a `BaseChart`
   zrender `mousemove` handler.
2. The **intermission delta chart** not displaying after a finished review —
   "no bordered chart at all."

They are the same bug. Confirmed empirically with Playwright against the live
dev stack (the static read alone had misattributed them as distinct); injecting
a `FINISHED` review showed `canvas count: 0` for the intermission chart and
reproduced the hover crash on the same element.

## Root cause — Vue boolean-prop casting meets an opt-out gate

`BaseChart` gained an `active` work-gate in commit **`4756c30`**
(*"perf(frontend): gate collapsed analysis charts off the packet path"*,
**2026-06-01 14:02**) — the regression's precise onset. The gate short-circuits
the per-packet ECharts work while a chart is collapsed:

```
if (props.active === false) { pendingRedraw = true; return; }   // in updateOptions/updateMarker
```

The author's mental model was "omitted ⇒ active." But `active` is declared a
bare `boolean` prop, and **Vue casts an omitted `boolean`-typed prop to
`false`, not `undefined`.** So every consumer that omits `active` reads
`props.active === false`.

`ReviewSessionPanel`'s intermission chart (binding present since `21c2543`,
predating the gate — verified against `4756c30~1`) omits `active`:

```
<BaseChart :series="intermissionSeries" :zoomRange="[1, …numMoves]" @index-click="…" />
```

So from `4756c30` onward the gate fired on that chart's *first* `updateOptions`.
Two consequences chained from the suppressed first `setOption`:

- **Blank chart.** ECharts `init` creates the instance but the canvas/render
  container is built lazily by the first `setOption`. With `setOption` never
  reached, nothing paints — the "no bordered chart at all" symptom.
- **`ecModel` crash.** The instance's internal `_model` is likewise only built
  by the first `setOption`. The zr `mousemove`/`click` handlers, wired at
  `init` time, stayed live on the unconfigured instance; the first hover called
  `containPixel` → `parseFinder(ecModel, …)` on an `undefined` `_model`.

Only the intermission chart was affected because every *analysis* chart routes
through `AnalysisChartPanel`, which passes `:active="expanded"` explicitly
(default `true`) — the omission path was unique to `ReviewSessionPanel`.

## The fix — `withDefaults({ active: true })` + handler hardening

`frontend/src/components/charts/BaseChart.vue`, two edits:

1. Wrap `defineProps` in `withDefaults(…, { active: true })`. This restores the
   author's intended "omitted ⇒ active" semantics — `withDefaults` overrides
   Vue's boolean-cast. The comment names the casting trap at the site so the
   next person doesn't re-introduce a bare-boolean gate prop. The gate is now
   genuinely opt-in.
2. Guard both zr handlers with `if (!isInitialized) return;` —
   defense-in-depth. `isInitialized` flips true exactly when the first
   `setOption` runs (it builds `_model`), so a pointer event over an
   init'd-but-unconfigured instance becomes a no-op instead of a crash. This
   keeps the collapsed-at-mount path (a deliberate, supported state) crash-safe
   independent of the prop default.

## Guard

`frontend/tests/integration/BaseChart-collapsed-gate.test.ts`:

- The existing collapsed-gate test had encoded the false assumption in a
  comment verbatim ("`active` omitted (undefined) is not gated"); corrected.
- Added a case: mounting with `active` **omitted** must run `setOption`
  (`> 0`). Confirmed live — flipping the default to `active: false` makes it go
  red at the `setOption > 0` assertion, restored to green with the fix.

## Verification

- **Live (Playwright, full dev stack):** intermission chart canvas renders;
  delta line, tooltip, and marker all work; **zero console errors** on
  hover/click. Pre-fix: `canvas count: 0` + the reproduced crash.
- `vue-tsc -b` clean.
- `npm run test:run` green (see commit).
- **Perf regression battery (`full-stress`, before/after):** no regression.
  Normalized on `autonav:step` (per the perf-capture normalization protocol),
  per-component render/patch ratio ≈ 1.00 in both runs; the residual raw delta
  is the documented cache-warmth confound (second run warmer), not structural.
- No FEATURES.md change — this restores intended behaviour, no user-facing
  capability added or altered. No new `src/` file (no FILES.md change); no new
  branded identifier (no IDENTIFIERS.md change).

## Note for the gate author's pattern

The general lesson is small and worth keeping: a boolean prop used as an
**opt-out** gate (`false` suppresses) is a footgun in Vue, because omission and
explicit-`false` collapse to the same value. Either default it with
`withDefaults`, or invert the sense to opt-in (`disabled?: boolean` defaulting
to falsy), so omission lands on the safe side.

License: Public Domain (The Unlicense).
