# KataGo report-cadence knobs — knob-registry promotion + `maxFromKnob` substrate addition

- **Status:** In flight on `KodBena/feat/katago-cadence-knobs`. User
  green-lit the scope (one knob for `reportDuringSearchEvery`
  applied to both ponder and analyze modes; a sibling knob for
  `firstReportDuringSearchAfter` with the same range; cross-knob
  constraint such that the first-after knob's max is bounded by
  the cadence). Defaults chosen on the user's "Your defaults are
  fine" delegation: 0.15s cadence, 0.05s first-after.
- **Genre:** Feature + substrate addition. Two surfaces shipped
  together: the KataGo cadence-knob promotion (Phase 6 of the
  knob-registry plan, applied to two new `engine.katago.*` leaves)
  and a small substrate extension (`KnobInputDecl.maxFromKnob`) to
  declare cross-knob constraints at the decl site.
- **Date:** 2026-05-15.

## Context

Project author surfaced 2026-05-15:

> firstReportDuringSearchAfter is the option we probably want to
> set on ponder queries. Also, we probably want a slider for
> reportDuringSearchEvery (min 0.01, max 4).

The first option (`firstReportDuringSearchAfter`) didn't appear
anywhere in the codebase — neither in the typed
`KataGoAnalysisQuery` wire shape nor as a value at any analyze-
query construction site. Adding it is a genuine new wire field.

The second (`reportDuringSearchEvery`) was already typed and used,
but with hardcoded values at the two construction sites in
`analysis-service.ts`: `0.5` for realtime range queries
(`analyzeRange`), `0.15` for ponder mode and `0.5` for analyze
mode (`analyzeActiveNode`). Both literals had been flagged in the
2026-05-03 magic-literals audit inventory as preference-
flavoured but not yet promoted; they sat in the Phase-6 backlog
the knob-registry plan named.

The author also asked, separately, whether the substrate could
constrain `firstReportDuringSearchAfter ≤ reportDuringSearchEvery`
reactively: *"Semantically it makes sense. Though, I'm not sure
DOM manipulation like that works reactively. It would be nice
though."* Vue does this trivially (a `computed` over a linked
store path is reactive by default); the question was the right
place to declare the cross-knob binding. This worklog records the
decision to land that as a small substrate extension rather than
inline render-site hardcoding.

## What changed

### Substrate: `KnobInputDecl.maxFromKnob` (substantive)

- `src/types.ts` — `KnobInputDecl` gains an optional
  `maxFromKnob?: KnobId` field. When set, the slider widget's
  effective max is `min(staticRangeMax, readKnob(linkedKnob))`
  rather than the static `range[1]`. Documents the cross-knob
  constraint at the decl site so future readers see the binding
  on the `KnobDecl` directly.
- `src/lib/knobs.ts` — `validateRegistry` (via `validateDecl`)
  gains a check that any `maxFromKnob` reference resolves to a
  registered KnobDecl and that the linked decl declares an
  output path. Per ADR-0002, an unresolved reference is a
  startup-time loud failure, not a silent runtime fallback.
- `src/components/knobs/KnobSlider.vue` — `effectiveMax`
  computed reads the linked knob's stored value reactively
  (when `maxFromKnob` is set); the slider's `:max` and the
  `displayValue` use it. The stored leaf is NOT auto-clamped
  when the linked knob's value drops below it — user preference
  is preserved; only the display and the wire send-time clamp
  reflect the constraint.

This is one substrate addition serving one use case today (the
cadence-knob pair). Per ADR-0003's "don't extract abstractions
before N=2 use cases," this is the threshold worth flagging.
Argument for landing the substrate addition rather than inline
render-site hardcoding: the binding is declarative metadata on
the knob, not behaviour that varies per render site; recording
the linkage at the decl site is more honest, survives renames,
and is one optional property (zero cost when absent on every
other knob). The knob-registry plan's §8 design-space discussion
explicitly anticipated this kind of small declarative-constraint
field — the addition aligns with the plan's framing rather than
fighting it.

### KataGo cadence knobs (the user's ask)

- `src/types.ts` — `AppSettings.engine.katago` gains
  `reportDuringSearchEvery: number` and
  `firstReportDuringSearchAfter: number`.
- `src/engine/katago/types.ts` — `KataGoAnalysisQuery` gains
  `firstReportDuringSearchAfter?: number`. The wire field
  matches KataGo's analysis-engine option name.
- `src/store/defaults.ts` — two new leaves with defaults 0.15s
  (cadence) and 0.05s (first-after); two new KnobDecls under the
  `engine` domain (`engine.report-during-search-every` priority
  70; `engine.first-report-during-search-after` priority 80,
  with `inputs[0].maxFromKnob` referencing the cadence knob).
- `src/store/migrations.ts` — schema bump 41 → 42 with a
  migration that backfills both leaves and seeds both KnobDecls
  on persisted blobs. The migration is idempotent per the
  established Phase-6 discipline.
- `src/store/archived-migrations.ts` — receives the 39 → 40
  migration (the prior Phase-6 sweep) per the rolling-archive
  discipline in `frontend/CLAUDE.md`. The active body in
  `migrations.ts` now holds 40 → 41 (priority backfill) and
  41 → 42 (cadence knobs) as the two style anchors.
- `src/services/analysis-service.ts` — both construction sites
  (`analyzeRange` and `analyzeActiveNode`) now read both cadence
  values from the registry. The wire-side `Math.min(first,
  cadence)` clamp enforces the semantic invariant at send time
  as defence-in-depth — the slider widget's `effectiveMax`
  prevents new misalignments via UI, the wire-clamp catches any
  drift in the stored leaves (e.g. if the cadence is reduced
  while the first-after's stored value is preserved). The user's
  simplification choice — single value applies to both ponder
  and analyze modes — replaces the prior 0.15/0.5 distinction
  with a single registry leaf.

### i18n catalogs

Two new labels (`knobRegistry.label.engine.report-during-search-
every`, `knobRegistry.label.engine.first-report-during-search-
after`) across all four locale catalogs (en, ja, ko, zh-CN).
Translations match the LLM-drafted catalog tier convention.

### Tests

- `tests/unit/lib/knobs.test.ts` — three new tests for the
  `maxFromKnob` validateRegistry path: passes on resolved
  reference; throws on unresolved id; throws on linked knob
  with no output path.
- `tests/unit/store/migrations.test.ts` — nine new tests for
  the 41 → 42 migration: each leaf's default-backfill case;
  each leaf's preserve-existing case; each KnobDecl seed
  (including maxFromKnob field check); preserve-existing-decl
  case; defensive no-katago case; asymmetric-absence case.

## Design choices recorded for future readers

### Single cadence knob, not per-mode

The prior code distinguished ponder cadence (0.15) from analyze
cadence (0.5). The user picked "one knob applies to both" on
2026-05-15 — both modes now use the single registry-driven
value. Default 0.15 (the more responsive of the two prior
literals) leans toward the workflow the cadence is supposed to
support (rapid first-paint after pressing space); users wanting
slower cadence dial up via slider, all the way to 4.0s if
desired.

### Wire-side clamp is defence-in-depth, not the primary enforcement

The `KnobInputDecl.maxFromKnob` constraint prevents new UI-side
misalignments. The wire-side `Math.min` clamp catches drift
between the stored leaves — e.g. if the cadence is reduced via
the cadence slider while the first-after's stored value is
preserved (the deliberate "user preference is preserved" choice
in the widget's `effectiveMax` paragraph). The two mechanisms
compose: UI prevents new misalignments; wire-layer guarantees
the contract reaching the engine is always coherent regardless
of stored-leaf state.

### Stored leaf preservation under linked-knob change

When the user decreases the cadence such that the first-after's
stored value now exceeds it, the first-after's stored leaf is
NOT auto-clamped. Rationale: the user's stored preference is
their stated intent; auto-clamping would silently rewrite that
intent on a transient slider drag. The display badge clamps to
the effective max so the slider thumb and badge agree; the wire
sends the clamped value to KataGo. If the user later raises the
cadence back up, the first-after's stored preference re-appears
in the display naturally — the substrate "remembers" the
original preference. An auto-clamp would lose that.

This is the same posture the knob-registry plan §7 takes on
claims: the substrate preserves the user's intent, only the
effective behaviour is mediated.

## What this arc does NOT close

Named explicitly so future readers don't read the arc as
all-encompassing:

- **Component / template tests for the KnobSlider widget's
  effectiveMax behaviour.** Component-level tests are out of
  scope per `tests/CLAUDE.md`. The maxFromKnob substrate path is
  unit-tested (validateRegistry); the slider's reactive max
  isn't unit-testable without a component-render harness. The
  qEUBO-domain postmortem's §7 "visual re-inspection in every
  state-axis" discipline applies: exercise the new sliders
  manually with the cadence drag-down case before declaring
  done.
- **A `KnobInputDecl.minFromKnob` sibling.** Not asked for; the
  symmetric "lower bound from another knob" case has no current
  use case. If a future scenario surfaces, it can land on the
  same shape. Premature now per ADR-0003.
- **A general "step from another knob" / "label from another
  knob" extension.** This arc adds exactly the constraint the
  user named. Generalising prematurely is what ADR-0003 warns
  against.
- **Documentation of the `firstReportDuringSearchAfter` option
  in KataGo's own docs.** The author noted the option exists
  but is *"not documented(!)"* in KataGo. Out of scope for this
  arc.

## Cross-references

- `src/types.ts` — `KnobInputDecl.maxFromKnob` definition; both
  new `engine.katago.*` fields.
- `src/engine/katago/types.ts` — `firstReportDuringSearchAfter`
  added to `KataGoAnalysisQuery`.
- `src/components/knobs/KnobSlider.vue` — reactive `effectiveMax`
  implementation.
- `src/lib/knobs.ts::validateDecl` — maxFromKnob target check.
- `src/services/analysis-service.ts` — both construction sites
  reading the registry leaves with wire-side clamp.
- `src/store/defaults.ts`, `migrations.ts`,
  `archived-migrations.ts` — seed + migrate + rolling-archive.
- `docs/notes/knob-registry-plan.md` §8 — declarative-vs-
  imperative consumption design space; `maxFromKnob` is a small
  concrete declarative-constraint addition.
- `docs/notes/knob-registry-plan.md` §10 — magic-literals
  promotion pipeline; the two cadence literals retire from the
  audit inventory's residue list.
- `docs/worklog/2026-05-15-ledger-first-packet-sync-bump.md` —
  the sibling arc that landed the frontend's structural first-
  packet delay component. The KataGo cadence knobs address the
  upstream contributor named there as the dominant source of
  perceived first-paint delay.
- `docs/archive/notes/magic-literals-audit-inventory.md` — the
  inventory entries for the 0.15/0.5 literals are now retired
  by promotion; the audit doc is archived and not retroactively
  edited (per ADR-0005's preserve-the-record discipline).
- ADR-0002 (fail loudly) — applies to the validateRegistry
  maxFromKnob check (startup-time loud failure on dangling
  reference) and the wire-side clamp (defence-in-depth).
- ADR-0002 Rule 7 (closest-match selection surfaces too) —
  applies to the `engine` domain placement for the new
  KnobDecls (no closest-match concern — `engine` is the right
  home; same domain as the watchdog knobs).
- ADR-0003 — `maxFromKnob` is a band-1 substrate field; the
  cadence knobs themselves are band-2 (game-tree-coupled via
  KataGo's wire vocabulary).

## License

Public Domain (The Unlicense).
