# Toolbar slider popover — band/chrome-neighbourhood mismatch corrective

- **Status:** In flight on `KodBena/fix/knob-toolbar-popover-engine-gating`;
  fix + postmortem + this worklog companion together close the
  documentation gap PR #225 left.
- **Genre:** Bugfix + discipline corrective. The bug is one mount-site
  edit; the postmortem (and the recommendations it carries) is the
  load-bearing artifact.
- **Date:** 2026-05-14.

## Context

PR #225 (`KodBena/feat/knob-toolbar-popover`, merged 2026-05-14 as
`9c17283`) introduced `ToolbarSliderPopover.vue` and mounted it
inside the toolbar's `<div v-if="isConnected" class="engine-metrics-
bar">` wrapper. The popover is ADR-0003 band 1 (substrate-driven —
user preferences like ownership opacity, hue offset, move-filter
threshold); the wrapper is engine-coupled (PPS, LATENCY, WATCHDOG,
QUEUE, all of which legitimately gate on engine reachability).
The popover silently inherited the wrapper's gate.

User-visible symptom: the SLIDERS quick-access badge — and every
knob in the registry's hover panel — is invisible whenever the
engine is not connected. Substrate preferences are unreachable
from the toolbar in disconnected sessions despite none of them
depending on engine state.

The merge subject reads "Knob registry — toolbar quick-access
popover + priority field **(ships with bugs)**." PR #225 shipped
with no documentation companion (no design note, no worklog, no
plan-sibling-revision); the bugs the merge subject acknowledged
were not filed anywhere durable. This worklog and the companion
postmortem are the corrective for both gaps — the band-mismatch
itself, and the documentation-discipline failure that let it
ship.

## What changed

### `src/components/chrome/Toolbar.vue`

`<ToolbarSliderPopover />` moves out of the `engine-metrics-bar`
wrapper to a sibling at the `.toolbar` flex level. The popover
now renders unconditionally; visual adjacency to the engine-
metrics row is preserved when the row is rendered (connected
state) without inheriting its v-if gate.

New mount-site comment names the band-1-vs-chrome-coupling
distinction and references the postmortem so a future reader
sees the constraint at the placement site.

### `src/components/chrome/ToolbarSliderPopover.vue`

SFC header amended. The prior framing "(sibling to PPS, LATENCY,
WATCHDOG, QUEUE)" was visually accurate but produced the
lifecycle-inheritance error; the revised header captures the
distinction between visual adjacency (correct framing) and
lifecycle inheritance (which the band-1 declaration explicitly
forbids).

### `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`

The postmortem. Modelled on the sibling
`postmortem-knob-registry-qeubo-domain-2026-05.md`; same shape,
same arc, same closest-match failure pattern (qEUBO-domain
incident: enum-value closest match; this incident: chrome-
neighbourhood closest match).

The catastrophe-by-substitution test (§4 of the postmortem) is
the load-bearing severity calibration: the failure shape was
trivial on a modestly-used optional surface; the same shape on a
safety-critical surface (error log, save affordance, connection-
recovery prompt) would have been catastrophic. The
recommendations in §7 are calibrated to that worst case rather
than to the observed instance.

### `docs/handoff-current.md`

Single-line entry under the frontend section recording the
band-mismatch corrective and pointing at the postmortem.

## Recommendations recorded (full text in postmortem §7)

Six discipline candidates surfaced by the incident:

1. **Band-coherence check at mount sites.** Before merging any
   PR mounting a new component in chrome, the implementer
   cross-references the component's ADR-0003 band against the
   enclosing wrapper's coupling. A band-1 child inside a
   band-{2,3} wrapper inherits the wrapper's lifecycle silently;
   the default is relocation.
2. **"Ships with bugs" merge subjects are discipline
   violations.** Known defects at merge time must be filed
   somewhere durable (worklog, issue tracker, dispatch). The
   merge subject is not a substitute.
3. **Documentation companion mandatory at PR-filing time.** The
   qEUBO-domain postmortem named this gap; PR #225 reproduced
   it. The corrective is to land the audit checklist as an
   actual file `CLAUDE.md` references as load-bearing.
4. **Visual exercise in disconnected and degraded states.** The
   qEUBO-domain postmortem recommended visual re-inspection;
   this incident extends it to "exercise the surface in every
   state-axis the surface depends on" — connected/disconnected,
   authenticated/unauthenticated, empty/populated, claimed/
   unclaimed at minimum.
5. **The substitution test for severity calibration.**
   Postmortem severity is calibrated to the worst surface the
   same failure shape could apply to, not to the observed
   instance's user-visible cost.
6. **The closest-match failure mode, generalised.** Same root
   pattern as the qEUBO-domain incident, applied to a different
   vocabulary (chrome neighbourhood instead of enum value).
   Worth a tenet-level articulation in a future ADR amendment.

## What's deferred

- **The closest-match-failure-mode ADR amendment.** Postmortem
  §7.6 names it; the actual ADR-0002 (or ADR-0005) amendment is
  a separate small arc.
- **`docs/pre-merge-checklist.md` as an actual file.** Postmortem
  §7.3's recommendation. The qEUBO-domain postmortem already
  flagged the gap once; this incident is the second instance.
  The right tightening is one focused PR landing the checklist
  and a `CLAUDE.md` reference to it; tracking that as a TODO
  rather than executing it inside this corrective.
- **The `priority` field on `KnobDecl`** (PR #225's other shipped
  artifact, separate from the popover surface) is unaffected by
  this corrective. The priority-based ordering in the popover is
  fine; the only broken thing was where the popover lived.

## Cross-references

- `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` — the
  postmortem; the load-bearing artifact here.
- `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md` —
  the sibling postmortem from the same arc; shares the
  closest-match failure pattern.
- `docs/notes/knob-registry-plan.md` — the plan note for the
  parent arc; the toolbar-hover surface is named in §12 Phase 6
  and §"What's deferred" of the worklog only.
- `docs/worklog/2026-05-14-knob-registry.md` — the parent arc's
  worklog.
- PR #225 (`KodBena/feat/knob-toolbar-popover`, merged
  2026-05-14 as `9c17283`) — the originating PR with the
  band-mismatch bug and the "(ships with bugs)" merge subject.

## License

Public Domain (The Unlicense).
