# Intensity Gradient Hue-Shift Slider (Release Wrap-up; Accessibility)

- **Status:** Shipped on branch `frontend/intensity-hue-slider`,
  merged via PR #18, 2026-04-28. `npm run build` green; manual smoke
  confirmed live by user (slider in Other tab's Gradient Calibration
  view drives `ColorDebugStrip` and downstream gradient consumers in
  real time; persistence across reload verified).
- **Genre:** Worklog entry — promotes the prior hardcoded `-43°`
  hue offset to a persisted user setting, addressing an
  accessibility concern surfaced by the user (deuteranopia under
  alpha-compositing).
- **Date:** 2026-04-28.
- **Origin:** User flagged that the gradient cycles in the wrong
  direction for deuteranopic readers when alpha-compositing, and
  noted that `-43°` was a hand-applied symmetry not exposed for
  calibration. The user calibrates externally (picom shader
  applying Machado et al.); the slider in-app is the in-frame UI
  the user adjusts while watching the live external simulation.

## Context

`engine/suggestion-colors.ts` has long carried an
`IntensityColorFn` factory (`initializeIntensityFactory`, called
once with the visit-distribution JSON from `resource-service`)
producing a closure that walks a perceptually-uniform LUT
(`big_table`) through an ECDF over the visit distribution. The
factory's body included a hardcoded `const hueShiftDeg = -43;` —
applied as a CIELAB rotation around the L* axis — that the prior
author chose by hand for typical-trichromat readability. For users
with non-typical colour-vision profiles the rotation can land on
exactly the worst-case orientation (deuteranopia in particular,
where alpha-compositing further compounds confusion), so the
constant needed to become a setting.

A separate code-smell was due for cleanup in the same file: the
factory's closure flipped its parameter (`t = 1-t`) early to read
the LUT in one direction, then computed the alpha as `1-t`
(flipping back) — a directional symmetry the gradient-generating
algorithm had quotient-ed out, applied by hand at a site that read
opaquely. There was also a dead `pchipN(u, ALPHA_KNOTS)` line
whose result was overwritten on the next line.

## Approach

A — Persistence. New field `intensityHueShift: number` on
`AppSettings.appearance` (sibling of `theme`). Default `-43°` —
the prior hardcoded value, so existing users see no visual change
unless they move the slider. Schema migration `4 → 5` fills the
field with `-43` for legacy blobs missing it (numeric values
preserved as-is per the user's prior calibration).

B — Engine refactor. Split `initializeIntensityFactory` into
`setVisitDistribution` (one-shot from `resource-service`) and
`setIntensityHueShift` (called by the appearance watcher in
`useAppBootstrap`). Module-level `_quantiles` and `_hueShiftDeg`
slots cache the two inputs independently. `rebuildIntensityColorFn`
produces a fresh `IntensityColorFn` closure capturing both, and
atomically swaps `getIntensityColor.value`; the shallowRef swap is
what propagates to consumers via Vue reactivity.
`initializeIntensityFactory` stays exported as a thin alias to
`setVisitDistribution` so the existing call site in
`resource-service` doesn't need touching.

C — Reactive plumbing. `useAppBootstrap` watches
`store.profile.settings.appearance.intensityHueShift` with
`{ immediate: true }` and calls `setIntensityHueShift(value)` on
change. The early-return inside `rebuildIntensityColorFn` handles
the pre-distribution case gracefully — the value is recorded; the
rebuild fires properly once `resourceService.loadVisitDistribution`
lands.

D — UI. Range slider (`min=-180`, `max=180`, `step=1`) bound to
`store.profile.settings.appearance.intensityHueShift`, mounted in
`App.vue`'s `#other` tab template above the existing
`ColorDebugStrip`. Two-way `v-model.number` writes back to the
store; the watcher above propagates to the engine. A value badge
shows the current degree value next to the slider label. Slider
styling matches existing `.range-slider` patterns in the codebase
(`accent-color: #4aaef0`).

E — Code-smell cleanup along the way. The closure's
`t = 1-t` mutation and the redundant `1-t` in the alpha line are
replaced with named locals: `const lookup = 1 - intensity` for the
LUT index, `const a = clamp(intensity)` for the alpha, with a
comment recording that the LUT was generated direction-quotient-
optimised and the orientation is hand-applied here. The dead
`pchipN(u, ALPHA_KNOTS)` line is removed; `ALPHA_KNOTS` and
`pchipN` come out of the file's imports (still defined and exported
by `helper.ts` for any future consumer). `rotateHueLab` is hoisted
to module scope (it's pure and was unnecessarily nested inside the
factory).

## Critical files

- **Edited:** `frontend/src/types.ts` (`appearance.intensity-`
  `HueShift: number`).
- **Edited:** `frontend/src/store/defaults.ts` (default `-43`).
- **Edited:** `frontend/src/store/migrations.ts` (`CURRENT_SCHEMA_-`
  `VERSION = 5`; migration 4→5).
- **Edited:** `frontend/src/engine/suggestion-colors.ts` (refactor
  + cleanup).
- **Edited:** `frontend/src/composables/useAppBootstrap.ts`
  (intensityHueShift watcher).
- **Edited:** `frontend/src/App.vue` (slider in Other tab; styles).

## Reused existing surface

- The `IntensityColorFn` type signature was unchanged
  (`(t, alpha?) => string`); the closure swap is invisible to
  consumers.
- `pushSystemMessage` / system-log infrastructure not needed —
  failures inside `rebuildIntensityColorFn` are non-thrown
  (early-return on missing quantiles).
- `ColorDebugStrip` (the existing two-track gradient previewer)
  doubles as the in-app preview surface; no new viewer needed.

## Verification

1. **Static check.** `npm run build` green.

2. **Manual smoke.** Slider in the Other tab's Gradient Calibration
   view; default reads `-43°`. Dragging the slider re-renders both
   `ColorDebugStrip` tracks (Pure Transfer Function and Composite
   Interaction) live; the `BoardThumbnail` rugplot and analysis-
   panel suggestion colours reflect the new hue immediately.
   Persistence: reload restores the slider's last value via
   `SyncService` hydrate. ✓

3. **Migration.** Legacy v4 blob (post-ownership PR) hydrated
   correctly through 4→5; missing `intensityHueShift` field filled
   to `-43`; user's prior setup unchanged visually. ✓

4. **External calibration.** User confirmed via the picom Machado
   simulation that the slider provides the expected adjustability
   for deuteranopia calibration before release. ✓

## Outcomes

- The hue offset becomes a persisted, user-tunable accessibility
  setting rather than a hardcoded source constant.
- The engine module is structurally cleaner: split setters reflect
  the two independent inputs, the closure body's directional
  symmetry is named rather than smuggled, and the dead `pchipN`
  computation is gone.
- Pattern for "persisted setting → reactive watcher in
  useAppBootstrap → engine module's setter" is now established for
  the next setting that needs it.

## Out of scope (explicitly)

- **In-app deuteranopia / protanopia / tritanopia preview.** User
  has external (picom shader) simulators sufficient for calibration;
  in-app filter avoidance keeps the feature scope tight.
- **Per-band hue offsets.** A single global rotation suffices; per-
  endpoint rotation (e.g., warm vs cool ends) would require a
  more elaborate gradient model.
- **`alpha` parameter usage in the gradient closure.** The
  `IntensityColorFn` signature accepts an `alpha` second argument
  which the existing closure ignores (deriving alpha from
  intensity); honouring it would change the contract for existing
  consumers. Surfaced as a follow-on consideration in the
  rugplot-fix worklog (item below) where a separate sibling
  function emerged as the right answer.
- **Per-user theme presets / colour-vision profile picker.** Future
  settings-tab affordance; out of scope for the slider itself.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — Frontend Completed table gained the entry at PR
  merge time.
- `docs/notes/frontend-backlog.md` — no entry to update; this work
  was direct from the user, not on the backlog.
- No ADR amendment. The persistence pattern follows ADR-0001's
  state-mutation convention; the engine refactor preserves
  ADR-0002's fail-loud posture (rebuild early-returns on missing
  data rather than throwing or fabricating defaults).

## Branch + PR workflow

Branched off `frontend/ownership-overlay` initially (because the
ownership branch was the active dev base mid-session). Once PR #17
merged into `main`, the slider branch was rebased onto the new
`origin/main` so the PR (#18) had a single clean commit on top of a
ratified base. Merged at `542e9ec`.
