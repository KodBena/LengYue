# KataGo first-report-after upstream-cliff floor — SPA-side mitigation

- **Status:** Landed locally. Not pushed; awaits user manual test
  (knob slider visual sanity-check at the floor, hover-tooltip
  legibility, the persistence migration on a real persisted blob).
- **Genre:** Mitigation arc + small substrate addition. Companion
  to the diagnosis worklog
  `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`
  which characterised the upstream KataGo cliff this mitigation
  works around.
- **Date:** 2026-05-15.

## Context

The diagnosis arc (sibling worklog above) established that
KataGo 1.16.4 silently substitutes the cadence value for
`firstReportDuringSearchAfter` values below an absolute ~25 ms
threshold, with a non-deterministic flip-flop strip from 0.020 –
0.030 s. The user-facing surface: the cadence-knobs shipped
earlier today (`docs/worklog/2026-05-15-katago-cadence-knobs.md`)
exposed both knobs with a static range of `[0.01, 4.0]`, leaving
end users free to set values inside the broken band that the wire
silently ignored.

The diagnosis worklog named "no band-aids" as the disposition: a
proper four-part mitigation rather than just a wire-side clamp.
This worklog records what landed.

## What changed

### `src/engine/katago/limits.ts` (new)

Single-constant module declaring `KATAGO_FIRST_REPORT_FLOOR_S =
0.035`. Documents the upstream artefact (the empirically-
characterised cliff), the removal trigger ("when upstream is
fixed and confirmed against a target KataGo version, drop this
constant and the migration that retired the workaround"), and
cross-references the staged bug-report package at
`~/katago_bugreport` plus the diagnosis worklog.

The file deliberately starts with one constant — single use case
today. Future upstream-imposed constants can land alongside; the
file's purpose statement explicitly distinguishes
*upstream-imposed* (here) from *project preferences* (`defaults.ts`).

### `src/types.ts` — `KnobInputDecl.minFloor?: number`

Optional absolute lower bound, in the knob's native unit. Sibling
of `maxFromKnob`. The docstring distinguishes `minFloor` from
`range[0]`:

> `range[0]` describes the knob's intrinsic meaningful range;
> `minFloor` represents an external-constraint-induced lower
> bound — typically an upstream limitation that is expected to be
> removable when the constraint is lifted.

This separation is the load-bearing design choice. Raising
`range[0]` would conflate the workaround with the knob's
permanent shape, making the workaround harder to retire cleanly
when upstream is fixed. Carrying the floor as a separate field
means retiring the workaround is one field drop + one schema
migration.

### `src/lib/knobs.ts` — validateRegistry extension

Two checks added in `validateDecl`:

1. `minFloor` must be a finite number when present.
2. `minFloor` must not exceed `range[1]` (incoherent declaration:
   would collapse the slider's effective range to zero).

Per ADR-0002, both are startup-time loud failures. The "must be
within static range" check parallels `maxFromKnob`'s
"resolves to a registered knob" check: catch the incoherent
declaration at boot rather than silently degrading the widget at
render time.

### `src/components/knobs/KnobSlider.vue` — effectiveMin + at-floor marker

- `effectiveMin` computed mirrors `effectiveMax`'s reactive shape:
  reads `decl.value?.inputs[0]?.minFloor`, falls back to
  `range[0]` when absent or non-finite. The slider's `:min`
  binding uses `effectiveMin`, so drags below the floor pin to it
  (HTML's native `<input type="range">` clamp behaviour).
- `step` computed now derives from the *effective* span between
  `effectiveMin` and `effectiveMax` (was: between static `range[0]`
  and `effectiveMax`). Keeps the 100-step density honest when
  either constraint narrows the slider's reach.
- `displayValue` clamps to both bounds (was: clamps to
  `effectiveMax` only). The badge agrees with the thumb's pinned
  position when either bound caps the displayed value.
- `atFloor` computed: true when the stored value sits at-or-below
  `effectiveMin` AND the floor is genuinely active (above the
  static range[0]). Drives the visual indicator and tooltip.
- `floorTooltip` computed: i18n lookup at
  `knobRegistry.floorTooltip.<knobId>`. Opt-in via translation —
  knobs without a tooltip entry just show the dotted-underline
  marker (signal: "there's something to know here") without
  hover text.
- Template binding on the badge: `:class` toggles
  `knob-slider-value-at-floor`; `:title` carries the tooltip.
- Scoped CSS: the at-floor class adds dotted underline + help
  cursor (universal "more info on hover" convention). No
  text-shift on the badge during state transitions.

### `src/store/defaults.ts` — minFloor on the first-report seed

Imports `KATAGO_FIRST_REPORT_FLOOR_S` from `engine/katago/limits.ts`
and adds it as `inputs[0].minFloor` on the
`engine.first-report-during-search-after` KnobDecl. Fresh installs
now ship with the floor enforced from boot. Pre-existing decl
shape is otherwise unchanged.

### `src/services/analysis-service.ts` — wire-side clamp at both call sites

Both `analyzeRange` and `analyzeActiveNode` had a
`Math.min(stored, cadence)` clamp; now they have
`Math.min(cadence, Math.max(KATAGO_FIRST_REPORT_FLOOR_S, stored))`.

The order matters. Reading inside-out:

1. `Math.max(floor, stored)` enforces the upstream-cliff
   workaround — values below the floor get raised to it.
2. `Math.min(cadence, …)` enforces the `firstReportAfter ≤
   cadence` semantic invariant from the cadence-knobs worklog.

When `cadence < floor` (user has set a very small cadence), the
outer `Math.min` wins and `firstReportAfter` reaches the engine
equal to cadence. That correctly degrades the first-paint promise
to "cadence tick" in the regime where the upstream cliff makes
sub-cadence first-paint impossible — the slider's `effectiveMin`
similarly pins to `min(floor, ...)` at the widget layer.

The wire-side clamp is defence-in-depth: the slider's
`effectiveMin` prevents new UI-side misalignments; the wire
clamp catches stored-leaf drift (a hand-edited blob, a future
code path that bypasses the widget). The two mechanisms compose
exactly the way the cadence-knobs worklog's `maxFromKnob` +
`Math.min` pair does.

### Schema migration 42 → 43 + rolling-archive move

- `CURRENT_SCHEMA_VERSION` bumped to 43 in `migrations.ts`.
- New 42 → 43 migration appended to the active body in
  `migrations.ts`. Adds `inputs[0].minFloor = 0.035` to the
  persisted `engine.first-report-during-search-after` KnobDecl
  when absent. Idempotent: a pre-existing finite `minFloor` is
  preserved unchanged; a non-finite stored value is overwritten
  (defensive against malformed blobs).
- Hardcodes `0.035` rather than importing
  `KATAGO_FIRST_REPORT_FLOOR_S` per the migrations.ts append-only
  invariant: a shipped migration's behaviour is frozen; importing
  a mutable constant would let a future constant change silently
  retroactively alter what blobs in the wild were migrated to.
- 40 → 41 (knob-priority backfill) moved from `migrations.ts`'s
  active body into `archived-migrations.ts` per the rolling-
  archive cadence in `frontend/CLAUDE.md`. The active body now
  holds 41 → 42 (cadence knobs) and 42 → 43 (first-report floor)
  as the two style anchors.
- `archived-migrations.ts` header scope updated:
  "migrations 1 → 2 through 40 → 41 (40 entries)".

### i18n catalogues

New label `knobRegistry.floorTooltip.engine.first-report-during-search-after`
added to all four locale catalogs (en, ja, ko, zh-CN). Matches
the LLM-drafted machine-translation convention the cadence-knobs
labels follow. The text names the upstream nature of the
constraint and the approximate threshold; intentionally does
*not* point at the bug-report directory or the github issue
(that's content for an internal-developer document, not an end-
user tooltip).

### Tests

- `tests/unit/lib/knobs.test.ts` — six new tests for the
  `minFloor` validateRegistry path: passes when present and
  within range; passes when equal to `range[0]` (degenerate but
  coherent); throws on NaN; throws on Infinity; throws when
  above `range[1]`; passes when paired with `maxFromKnob`
  (no interaction between the two substrate fields).
- `tests/unit/store/migrations.test.ts` — eight new tests for
  the 42 → 43 migration: adds minFloor when absent; preserves
  pre-existing finite minFloor (idempotency); overwrites a
  non-numeric value; overwrites NaN; preserves the maxFromKnob
  and outputs; is no-op when the first-report decl is absent;
  is no-op when the decl has no inputs array; doesn't touch
  unrelated decls.

Full suite (`npm run test:run`) — **508 passed, 3 skipped, 0
failed**. Build (`npm run build`) — clean. Strict typecheck
(`vue-tsc -b`) — clean.

## Design choices recorded for future readers

### `minFloor` is decl-level metadata, not a clamping behaviour the substrate auto-applies

The substrate (`KnobSlider.vue`) reads `minFloor` and clamps the
*widget*'s effective min. The stored leaf is NOT auto-clamped.
The same posture the cadence-knobs worklog took for `maxFromKnob`:
the substrate preserves the user's stored intent; only the
effective behaviour is mediated. When the upstream constraint is
lifted and `minFloor` retires (some future schema bump), users
who had stored a sub-floor value before the workaround would
see their original preference re-appear naturally.

### The wire clamp uses the constant directly, not the registry value

`analysis-service.ts` imports `KATAGO_FIRST_REPORT_FLOOR_S` from
`limits.ts` rather than reading `store.profile.settings.knobs[
'engine.first-report-during-search-after'].inputs[0].minFloor`.
Two reasons:

1. **Decoupling.** The wire-clamp is enforcing an upstream
   constraint, not a user preference. The constant in `limits.ts`
   is the canonical source of truth for the floor; the slider's
   `minFloor` field is a *consumer* of that fact, not the source.
2. **Surface area.** Reading from the registry from inside
   analysis-service.ts couples the wire layer to the knob
   substrate. The current shape keeps the wire layer's
   dependency surface narrow — `analysis-service.ts` already
   imports from `engine/katago/*`, so depending on
   `engine/katago/limits.ts` is at-grain; depending on the knob
   substrate would not be.

If a future scenario surfaces where the user *should* be able to
edit the floor (perhaps through a hidden developer-mode UI for
testing upstream fixes), the registry-read can be added then —
the substrate already supports it. Premature today per ADR-0003.

### The migration hardcodes 0.035 even though the constant exists

The migration body is frozen per the append-only invariant. If
`KATAGO_FIRST_REPORT_FLOOR_S` is ever changed in `limits.ts`,
new installs would see the new value but existing users
migrated through 42 → 43 would keep the original 0.035. That's
the intended behaviour: changing the floor materially is the
trigger for a *new* migration, not an in-place rewrite of an
existing one. ADR-0002's "fail loudly" applies — silent
retroactive constant changes in migrations are the failure mode
the append-only invariant exists to prevent.

### Tooltip text doesn't reference the bug-report directory or upstream URL

The catalogue text is for end users in their own language. An
internal-developer pointer to `~/katago_bugreport` or to a
github issue URL would either go stale (the URL changes when
the issue is closed/renamed) or expose maintenance internals to
users who shouldn't have to care. The diagnosis worklog and the
bug-report package are the right places for that detail; the
tooltip names the upstream nature of the constraint without
linking out.

## What this arc does NOT close

- **The upstream KataGo bug.** Still in the "executive bandwidth"
  bucket per the diagnosis worklog. The bug-report package at
  `~/katago_bugreport` is staged and self-contained.
- **A `KnobInputDecl.minFromKnob` sibling.** Same posture the
  cadence-knobs worklog took: not asked for, no current use case,
  premature now per ADR-0003. If a future scenario surfaces, it
  can land on the same shape.
- **A "developer-mode override" for testing upstream fixes.**
  When the upstream bug is fixed, the natural workflow is: drop
  the floor in `limits.ts`, ship a migration that removes
  `minFloor` from existing decls, update the catalogue tooltip
  to retire the message. No special override surface needed —
  the constraint goes away cleanly.
- **A unit test that exercises the wire-clamp arithmetic** in
  `analysis-service.ts`. The clamp is two-line; the four
  permutations of (stored vs floor) × (stored vs cadence) are
  trivial; the diagnosis arc's headless probes are the
  end-to-end validation that the cliff is actually bypassed.
  If a future regression in the wire-clamp surfaces, that's the
  point to add the unit test.
- **Component / template tests for the KnobSlider widget's
  at-floor marker behaviour.** Component-level tests are out of
  scope per `tests/CLAUDE.md`. The `minFloor` substrate path is
  unit-tested (validateRegistry); the slider's reactive
  `effectiveMin` and `atFloor` aren't unit-testable without a
  component-render harness. The qEUBO-domain postmortem's §7
  "visual re-inspection in every state-axis" discipline applies:
  exercise the slider manually with the cadence-knobs UI
  (default cadence ≥ floor: slider min at floor; cadence below
  floor: slider min at cadence — degenerate but reachable) and
  confirm the tooltip is legible in all four locales before
  declaring done.

## Cross-references

- `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md` —
  the sibling worklog that characterised the upstream cliff this
  arc works around. Names the bug-report package and the open
  items that would tighten the upstream report further.
- `docs/worklog/2026-05-15-katago-cadence-knobs.md` — the parent
  worklog that promoted the cadence knobs and added the
  `maxFromKnob` substrate this arc mirrors with `minFloor`.
- `~/katago_bugreport/` — staged upstream bug-report package.
- `src/engine/katago/limits.ts` — new file; the upstream-imposed
  constant.
- `src/types.ts::KnobInputDecl` — substrate field added.
- `src/lib/knobs.ts::validateDecl` — validation extension.
- `src/components/knobs/KnobSlider.vue` — `effectiveMin`,
  `atFloor`, `floorTooltip`, at-floor CSS marker.
- `src/store/defaults.ts` — minFloor seeded on the first-report
  KnobDecl.
- `src/store/migrations.ts` — 42 → 43 migration; active body
  rolled (40 → 41 moved out).
- `src/store/archived-migrations.ts` — receives 40 → 41; header
  scope updated.
- `src/services/analysis-service.ts` — wire-side clamp at both
  call sites; imports `KATAGO_FIRST_REPORT_FLOOR_S`.
- `src/locales/{en,ja,ko,zh-CN}.json` — new floor-tooltip label
  across all four catalogs.
- `tests/unit/lib/knobs.test.ts` — `minFloor` validateRegistry
  tests.
- `tests/unit/store/migrations.test.ts` — 42 → 43 migration
  tests.
- ADR-0002 (fail loudly) — applies to validateRegistry's
  startup-time minFloor coherence checks and to the wire-side
  clamp's defence-in-depth posture (the slider preventing new
  misalignments; the wire clamp catching stored-leaf drift).
- ADR-0002 Rule 7 (closest-match selection surfaces too) —
  applies trivially: `minFloor` was the right name and shape
  for this addition; the cadence-knobs worklog's
  "minFromKnob considered but deferred" note named the
  vocabulary fit honestly at decl time.
- ADR-0003 — `minFloor` is a band-1 substrate field; the
  cadence-knobs themselves are band-2.
- ADR-0004 (minimal-touch) — applies to the rolling-archive move
  of 40 → 41 (a verbatim cut-and-paste, no body edits) and to
  the analysis-service.ts wire-clamp edits (only the four lines
  inside the relevant `firstReportDuringSearchAfter:` expressions
  changed; the `isRealtime` gate, the cadence-knob clamp shape,
  and the surrounding query construction are untouched).
- ADR-0005 (documentation discipline) — this worklog is the
  sibling-revision-on-top-of-diagnosis pattern in action. The
  diagnosis worklog stays the planning-time record; this is the
  shipped-outcome companion.

## License

Public Domain (The Unlicense).
