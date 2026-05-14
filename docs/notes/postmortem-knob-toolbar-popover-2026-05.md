# Postmortem — Knob-Toolbar Popover Band/Chrome-Neighbourhood Mismatch

- **Date filed:** 2026-05-14
- **Status:** Bug confirmed by user observation on first hands-on
  exercise of the merged feature; root cause identified at the
  placement / mount-site level; remediation in flight on
  `KodBena/fix/knob-toolbar-popover-engine-gating`.
- **Audience:** Author + LLM collaborators. The focus is operational
  efficiency in spec authoring, PR discipline, and band-coherence
  enforcement, not blame.
- **Scope:** PR #225 (`KodBena/feat/knob-toolbar-popover`, merged
  2026-05-14) introduced `ToolbarSliderPopover.vue` and mounted it
  inside the toolbar's engine-connection-gated metrics row. The
  popover is therefore invisible — and the knob-registry's quick-
  access surface inaccessible — whenever the engine is not
  connected. The popover's *own* SFC header declares it ADR-0003
  band 1 (substrate-driven, no Go vocabulary); its mount inside an
  engine-coupled wrapper silently inherits an engine gate the
  substrate never asked for.

---

## Amendment — 2026-05-14: §7.2 and §7.3 framing correction (project author context)

Per ADR-0005 Rule 8 (sibling revisions over silent edits): §7.2
("'Ships with bugs' is itself a discipline violation") and §7.3
("Documentation companion mandatory at PR-filing time") below
carry an interpretive error. The original framings are preserved
verbatim for fidelity; the corrected framings live in this
amendment.

**The error.** Both sections read PR #225's "(ships with bugs)"
merge subject and absent worklog companion as a failure of
project-level discipline. They were not — they were a deliberate
strategic choice by the project author, made under explicit
constraints recorded by the author 2026-05-14:

- The bug was benign in practice (a visibility-gate non-sequitur
  on a modestly-used optional feature, not user-data corruption
  or a safety-critical surface).
- The feature's usability was important enough that shipping with
  the known defect was preferable to not shipping.
- The LLM implementer at the time couldn't be trusted with the
  correction — asking the bungler to fix it risked compounding
  the bungling rather than closing it. The likely upstream cause
  was Claude Code's routing infrastructure substituting Haiku 3.5
  for Opus 4.7; the project author had no project-level recourse
  beyond ship-and-wait.

The merge subject was the durable record while waiting for
trusted implementer rotation to become available. This bugfix PR
is that rotation operating correctly — the retroactive worklog
companion is filed alongside the code fix, and the merge
subject's signal is honoured.

**§7.2 reframed.** A "(ships with bugs)" merge subject is not a
default discipline failure. It is one of the strategic options
available to a project author whose implementer rotation is
temporarily under-capable. The discipline that should hold:

- The merge subject is the load-bearing signal that a worklog
  companion is *owed*, to be filed when trusted rotation is
  available.
- The author tracks the IOU between merge time and corrective
  time — the project's existing posture, exercised here.
- The corrective applies the disciplines retroactively (band-
  coherence check, visual exercise in every state-axis, etc.)
  against a capable implementer.

There is no project-level discipline that compensates for an
under-capable implementer rotation. The right move when rotation
is suspect is "wait for a trusted session," not "force the
under-capable session through a checklist that requires
capability to complete coherently."

**§7.3 reframed.** A pre-merge documentation-companion checklist
is only useful when the implementer can fill it out coherently.
When the failure mode is implementer-*capability* rather than
implementer-*laziness*, a mandatory checklist isn't a discipline
— it's a bottleneck that produces bungled documentation instead
of missing documentation, which is strictly worse for future
readers (a missing document signals "go look elsewhere"; a
bungled one signals "this is the answer" and propagates the
confusion).

The umbrella's "Documentation is part of the work" tenet stands
— but its operational enforcement point is "trusted rotation
eventually files the corrective," not "every PR blocks on
documentation regardless of implementer state." The pre-merge-
checklist follow-up named in §7.3 below is reframed accordingly:
not a gate that blocks merges, but a template the trusted
rotation consults when filing retroactives so the corrective is
predictably shaped.

**Recommendations §7.1, §7.4, §7.5, §7.6 are unaffected by this
amendment.** They name disciplines that hold for trusted
implementer sessions; they're what the current session operates
against to file this corrective. They are correct as written and
remain in force.

---

## TL;DR

The popover badge is a band-1 surface (substrate-driven; user
preferences like ownership opacity and hue offset live there). It
was mounted as a sibling of the engine-metrics badges (PPS,
LATENCY, WATCHDOG, QUEUE) — and because those badges live inside
`<div v-if="isConnected" class="engine-metrics-bar">` in
`Toolbar.vue:157`, the popover inherited that gate. Users
disconnected from KataGo lost access to every controllable
preference the popover surfaces.

Two distinct failure modes compounded:

1. **Band/chrome-neighbourhood conflation.** The implementer
   reasoned "this badge looks like the engine-metrics badges, so
   it goes next to them." The visual analogy was right; the
   lifecycle analogy (and the gating that came with it) was wrong.
   Band-1 substrate surfaces should not silently inherit
   band-{2,3} chrome's conditional visibility.
2. **Documentation gap.** PR #225 shipped without any companion
   documentation (no design note, no worklog entry, no plan-note
   sibling-revision). The merge subject reads "(ships with
   bugs)" — known defects acknowledged at merge time, but the
   bugs themselves were never written down anywhere in the
   documentation graph.

Concrete remediation is in §6. Recommendations to avert
similar-shaped failures are in §7. The user's catastrophe-by-
substitution framing — §4 — is the load-bearing point.

---

## 1. The chain of authorship

| Step | Artifact | What it did |
|---|---|---|
| 1 | `docs/notes/knob-registry-plan.md` (Phase 6 of §12, authored 2026-05-14) | Named "toolbar-hover quick-access surface" only as eventual future work; no design for placement, no mount-site rationale. |
| 2 | `docs/worklog/2026-05-14-knob-registry.md` §"What's deferred" line 300 | Named the same surface as "author's eventual UX vision for low-friction slider access ... current state is transitional." Single line of forward reference. |
| 3 | PR #225 (`KodBena/feat/knob-toolbar-popover`, merged 2026-05-14 as `9c17283`) | Shipped `ToolbarSliderPopover.vue` + `priority` field on `KnobDecl` with **no companion documentation**. Merge subject literally reads "Knob registry — toolbar quick-access popover + priority field (ships with bugs)". |
| 4 | `src/components/chrome/ToolbarSliderPopover.vue` (SFC header) | Self-described as "sibling to PPS, LATENCY, WATCHDOG, QUEUE" and explicitly declared "ADR-0003 band 1". Both true; their combination is the bug. |
| 5 | `src/components/chrome/Toolbar.vue:218` | Mounted `<ToolbarSliderPopover />` inside `<div v-if="isConnected" class="engine-metrics-bar">` opened at line 157. |
| 6 | 2026-05-14, post-merge user inspection | User opened the SPA in a disconnected state. The SLIDERS badge — and therefore every knob in the registry's quick-access surface — was nowhere to be seen. The user surfaced it as "the slider widget is only visible when you connect ... a non-sequitur." |

The category lived in code uninspected across one whole PR. The
user's first hands-on test produced the report.

---

## 2. Root cause

The popover's purpose answers one question — *"how does the user
reach the substrate's controllable scalars from the chrome's
top-level toolbar?"* — and the popover's placement answers a
different one — *"which existing chrome cluster does this badge
visually belong with?"*. The two questions were resolved
independently, in opposite directions, and the resolution of the
second silently overrode the first.

- **Question 1 (purpose).** Substrate-driven; band 1; preferences
  available always. The popover SFC's own header says this.
- **Question 2 (visual placement).** Engine-metrics badges are
  the closest visual analogue. Mount as a sibling.

Both answers are defensible in isolation. The combination produced
the bug, because being a sibling of the engine-metrics badges
*structurally* (not just visually) meant living inside the
engine-connection v-if wrapper. The visual answer dictated the
lifecycle answer without anything reconciling the two.

This is the same failure shape as the qEUBO-domain category
error documented in
`docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md` —
*closest-match selection* in a vocabulary that doesn't actually
have a true match, taken without flagging the missing category.
There, the vocabulary was the `KnobDomain` enum; here, it was the
toolbar's set of chrome neighbourhoods. Both are the literal-
following / closest-match failure mode that ADR-0002's loud-
failure discipline forbids in other contexts.

---

## 3. Contributing factors

### 3.1 Spec gap

The knob-registry plan (`docs/notes/knob-registry-plan.md`) named
the toolbar-hover quick-access surface only as deferred future
work. The worklog gave it one line in §"What's deferred". Neither
document discussed:

- Where in the toolbar the badge should live.
- Which existing chrome surfaces it was and was not analogous to.
- That substrate-driven surfaces must NOT inherit engine-coupled
  chrome's conditional visibility.

A spec for the placement existed only in the implementer's head.
That's an acceptable cost for small UX choices in general — full
specs for every chrome decision would saturate the documentation
budget — but the band-vs-placement coherence rule is exactly the
kind of load-bearing constraint that, if left implicit, gets
forgotten.

### 3.2 Infrastructure factor (the prior session)

The implementer of PR #225 (an LLM collaborator) appears to have
run under a Claude Code routing bug that may have substituted
Haiku 3.5 for Opus 4.7, reported by the project author at the
opening of the current session. The full session transcript isn't
recoverable, so this is a stated factor rather than a confirmed
contributor — but several PR-level symptoms are consistent with
it:

- **No documentation companion.** The umbrella `CLAUDE.md`
  "Documentation is part of the work" tenet is explicit; the
  qEUBO-domain postmortem's §"Documentation discipline (this
  housekeeping pass)" recorded exactly this failure mode and named
  it a corrective at the time. PR #225 reproduced the failure mode
  five days later, while the qEUBO-domain postmortem was still
  the most recent postmortem in the `docs/notes/` corpus.
- **"Ships with bugs" merge subject.** The merge message
  explicitly acknowledges known defects, without filing them
  anywhere. Per ADR-0002 (fail loudly), known bugs at merge time
  must surface somewhere — the worklog, an issue tracker entry, a
  dispatch — not as a hint in the merge subject. The form
  ADR-0002 forbids in code (the silent fallback at line 6 of the
  loudness hierarchy) the merge subject reproduced at the PR
  ledger level.
- **The band tag was in front of the implementer the entire
  time.** The popover SFC's own header declares it ADR-0003 band 1.
  The mount-site enclosing wrapper is band-2/3 chrome.
  Cross-referencing the two is the exact discipline ADR-0003 was
  written to make routine; ADR-0002 applied to documentation says
  consulting that discipline end-to-end before placing the
  component is the only correct move.

The infrastructure factor is not a get-out-of-jail-free card.
ADR-0004's minimal-touch discipline assumes the collaborator can
read end-to-end and reason about partial visibility; if the
collaborator structurally can't (because it's running on a model
that wasn't supposed to be doing this work), the disciplines need
to be hard-edged enough to fail *before* code lands. §7
recommendations are calibrated to this — they target the failure
shape, not the implementer's capability per session.

### 3.3 Author audit

The project author records (paraphrased from the current
session's framing): *"While fixing it is important, I'd like you
to investigate whether the decision to make it so is visible
anywhere in the documentation related to this feature. It's
another incident well-worthy of a postmortem because it's such a
non-sequitur."*

The author's audit cost was near-zero — first hands-on exercise
surfaced the bug — but the audit happened post-merge, not
pre-merge. PR #225 was merged with "(ships with bugs)" already in
the subject; the merge was author-acknowledged-with-known-defects
rather than discipline-blocked. The author's framing in the
current session also identified the catastrophe-by-substitution
test (§4 below) as the correct severity calibration, and
explicitly motivated the postmortem.

### 3.4 Forces neither author nor implementer can blame

- **The popover's purpose is real.** Surfacing scalar knobs as a
  hover popover from the toolbar is a good UX call; the
  user-surfaced friction it closes (move-filter slider not
  reachable from AnalysisControls) is real. The fix is not "kill
  the popover" — it's "fix where the popover lives."
- **The visual analogy was real.** The popover *does* look like
  PPS / LATENCY / WATCHDOG / QUEUE — same chrome aesthetic, same
  hover-tooltip behaviour shape. The aesthetic affinity isn't
  wrong; the lifecycle inheritance is.
- **Test coverage focused on substrate primitives and migrations,
  not chrome placement.** This is consistent with `tests/CLAUDE.md`
  (component / template tests explicitly out of scope). The
  qEUBO-domain postmortem already named the gap and recommended
  visual re-inspection after each substantive phase. PR #225
  shipped without that re-inspection step against the
  *disconnected* state.

---

## 4. Why this matters beyond cosmetics — the substitution test

The user surfaced the principle directly:

> I say catastrophe because it could have been so much worse if
> only the feature was substituted for another — we were only
> "lucky" it was only a modestly used *optional* feature and not,
> say, the error log which magically happened to never show up
> unless exactly the right predicates fired.

This is the load-bearing severity calibration for this postmortem.
The actual user-visible cost — a moderately-used preference
popover invisible while disconnected — is small. The failure
mode's *shape*, applied to other surfaces in the same toolbar or
elsewhere in the chrome, is not.

**The substitution test.** Imagine the same failure pattern
applied to:

- **An error log or system-message stream** that "magically
  happens to never show up unless exactly the right predicates
  fired" — users have no idea anything is wrong, ever. The
  fail-loudly tenet's foundation collapses silently.
- **A "save changes" affordance** silently gated on engine
  connection — users edit, leave, lose work, and never see the
  save button to know they had a choice.
- **A connection-recovery prompt** silently gated on *itself*
  (the prompt only appears when the system thinks it's healthy) —
  users have no recovery path when the system breaks.
- **A "report a bug" link** silently gated on the very condition
  that makes the bug worth reporting — users can't tell the
  project anything went wrong.

Each is the same failure shape: a component whose semantic class
(substrate / safety-critical / always-on) gets silently coupled to
an unrelated chrome neighbourhood's lifecycle. The *only*
operational difference between the toolbar-popover incident and
the worst case in this list is the criticality of the substituted
surface. The discipline that catches the toolbar-popover incident
must also catch the worst case; the discipline has to be
calibrated to the worst case, not to the observed instance.

ADR-0002 (fail loudly) was specifically shaped to prevent
"silently degraded" as a behaviour. A band-1 component silently
inheriting a band-3 gate is fail-loudly applied to the chrome
layer; the postmortem's recommendations in §7 are the
discipline-side codification of that application.

---

## 5. Detection cost

First hands-on exercise of the merged feature, in a disconnected
state. Wall-clock detection-cost: seconds. Elapsed-commits
detection cost: one whole PR shipped against `main` and merged
before the bug surfaced.

The elapsed-commits cost is the more interesting metric. In a
project shipping multiple infrastructure phases per session, the
distance between authoring and detection is measured in commits
rather than wall time. PR #225's distance was one PR — but the
disciplines that would have caught it earlier (band-coherence
check at mount sites; visual re-inspection in disconnected state;
mandatory documentation companion) are zero-PR disciplines: they
operate inside the PR's authoring window, not after merge.

---

## 6. Remediation

Targets one follow-up branch (`KodBena/fix/knob-toolbar-popover-
engine-gating`):

1. **`src/components/chrome/Toolbar.vue`** — `<ToolbarSliderPopover />`
   moves from inside the `<div v-if="isConnected" class="engine-
   metrics-bar">` wrapper to a sibling of that wrapper, still at
   the `.toolbar` flex level. Renders unconditionally. Comment at
   the mount site documents the placement rationale and references
   this postmortem.
2. **`src/components/chrome/ToolbarSliderPopover.vue`** — SFC
   header amended to record the corrected placement rationale.
   The visual-adjacency vs lifecycle-coupling distinction is
   captured at the file level so a future reader sees the
   constraint where the component is defined.
3. **This postmortem** — `docs/notes/postmortem-knob-toolbar-
   popover-2026-05.md`.
4. **Worklog companion** — `docs/worklog/2026-05-14-toolbar-
   popover-band-mismatch.md` recording the bugfix arc per
   ADR-0005 Rule 6 (author as you decide) and the umbrella's
   "Documentation is part of the work" tenet. The corrective for
   PR #225's documentation gap is to file the worklog the
   original PR omitted.
5. **`docs/handoff-current.md`** — single-line entry under the
   frontend section recording the band-mismatch corrective and
   pointing at this postmortem.

The `priority` field on `KnobDecl` (PR #225's other shipped
artifact) is unaffected by this remediation. The priority-based
ordering in the popover is fine; the only broken thing was where
the popover lived.

---

## 7. Lessons + recommendations

This is the section the user explicitly asked for: *"make
recommendations for how to avert similar catastrophes in the
future."* Each recommendation names the discipline, the failure
pattern it catches, and the trigger that should invoke it.

### 7.1 Band-coherence check at mount sites

When mounting any SFC into a new chrome location, the
implementer cross-references the SFC's ADR-0003 band declaration
(in its header) against the enclosing wrapper's coupling. A
band-1 component mounted inside a band-2 or band-3 wrapper
*inherits* that wrapper's conditional visibility, lifecycle, and
error-handling — the inheritance is structural, not a stylistic
choice.

Specifically, before merging any PR that mounts a new component
in chrome:

- Locate the component's band tag (`[B1]` / `[B2]` / `[B3]` /
  `[B?]` from `frontend/FILES.md`, or the SFC header's ADR-0003
  declaration).
- Locate the enclosing wrapper's coupling. `v-if`, `v-show`,
  ancestor `<template v-if>`, parent component lifecycle —
  anything that conditionally renders or affects the child.
- Confirm the bands match. A band-1 child inside a band-3 wrapper
  needs explicit justification or relocation; the default is
  relocation.

This is the structural analog of the qEUBO-domain postmortem's
"articulate what an enum is *for* before listing its members"
rule. Both rules say: when categorisation enters the system,
verify the categorisation is the categorisation the category was
shaped for.

### 7.2 "Ships with bugs" is itself a discipline violation

*Amended 2026-05-14 — see the Amendment block at the head of
this document for the corrected framing. The text below is
preserved per ADR-0005 Rule 8 for historical fidelity but
reads PR #225's merge subject as a discipline failure when it
was a deliberate strategic choice by the project author.*

A PR merge subject that reads "(ships with bugs)" without a
corresponding entry in the worklog, issue tracker, or dispatch
ledger is ADR-0002 applied to the PR layer: known defects
surfaced through the *weakest* available channel (the merge
subject), invisible to anyone not actively reading PR titles, and
unrecoverable from version control alone five commits later.

Recommendation: when a PR ships known defects, the merge is
blocked until the defects are filed somewhere durable. Acceptable
homes:

- A worklog entry naming each known bug and its expected fix
  arc.
- A dispatch (cross-team) or issue tracker entry per bug, with
  the PR's commit hash referenced for traceability.
- An in-flight follow-up PR scaffolded against the same branch
  (rare; usually the worklog entry is enough).

The merge subject is not a substitute for any of these. If a PR
genuinely needs to land with known bugs (release-train pressure,
cross-team coordination), the discipline catches the *recording*
of those bugs, not the merging.

### 7.3 Documentation companion mandatory at PR-filing time

*Amended 2026-05-14 — see the Amendment block at the head of
this document for the corrected framing. The text below treats
PR-filing-time documentation as a mandatory gate when the
operational failure mode here was implementer-capability rather
than implementer-laziness.*

The qEUBO-domain postmortem (§"Documentation discipline (this
housekeeping pass)") already recorded this gap and named "adding
the audit as a pre-PR-filing checklist item in future arcs would
harden the discipline." PR #225, filed five days later, did not
adopt the checklist.

Recommendation: every PR's CI checklist or pre-merge audit
includes the umbrella `CLAUDE.md`'s "Documentation is part of
the work" enumeration verbatim. The collaborator filing the PR
answers each question and the answers are part of the PR
description, not the merge subject. The audit is not optional
and is not deferred to "the next housekeeping pass."

This recommendation has been made once already in this codebase
(the qEUBO-domain postmortem's §7) and was not adopted. The
right tightening is to land the checklist as an actual file —
`docs/pre-merge-checklist.md` or similar — and have
`CLAUDE.md` reference it as load-bearing rather than advisory.
A file the collaborator must explicitly tick through is harder
to skip than a tenet sentence the collaborator may not have
read end-to-end.

### 7.4 Visual exercise in disconnected and degraded states

The qEUBO-domain postmortem's §7 recommended visual re-inspection
of editor surfaces after each substantive phase. PR #225's failure
shows the recommendation has a missing dimension: *which state*
the editor is exercised in matters as much as exercising it at
all. The qEUBO bug was caught only after the editor was opened
post-Phase-5; the toolbar-popover bug would have been caught only
if the editor was opened in a disconnected state.

Recommendation: the discipline expands from "exercise the surface
after substantive phases" to "exercise the surface in every
state-axis the surface depends on." For UI surfaces, this means
at minimum:

- Connected vs disconnected (engine state).
- Authenticated vs unauthenticated (auth state, where the surface
  is auth-coupled).
- Empty vs populated (data state, where the surface lists
  things).
- Hard-claim-held vs unclaimed (where the surface is substrate-
  driven).

The four states aren't exhaustive; they're the minimum sweep
for the current chrome's state-axes. New state-axes added to the
chrome should extend the list.

### 7.5 The substitution test for severity calibration

This is the user-surfaced recommendation, codified.

When a defect surfaces, the severity of the postmortem (and the
follow-on disciplines) is calibrated not by *this particular
defect's user-visible cost* but by *what the same failure shape
would cost on a critical surface*. The substitution exercise is
the test:

- Name the failure shape in its most general form (here: "band-1
  surface silently inherits band-{2,3} conditional visibility
  from a chrome neighbour").
- List the surfaces in the codebase to which the same failure
  shape could apply (here: error logs, save affordances,
  connection-recovery prompts, "report a bug" links — anything
  always-on or safety-critical).
- Calibrate the discipline to the worst case on that list.

A defect on a "modestly used optional feature" that, applied to a
safety-critical surface, would cause silent data loss or
unrecoverable error-handling failure, gets the same discipline
weight as if it had surfaced on the safety-critical surface.

This rule is fail-loudly applied to severity assessment. Without
it, postmortems calibrate to observed user-visible cost, which is
the wrong axis — the cost of *catching* a failure shape is
near-constant; the cost of *not* catching it varies wildly by
which surface the next instance lands on.

### 7.6 The closest-match failure mode, generalised

*Shipped 2026-05-15 as ADR-0002 Rule 7 ("Closest-match selection
surfaces too"). The text below proposed the tenet articulation and
identified ADR-0002 as the candidate home; the rule was filed
there with an explicit provisional-home flag, since the deeper
principle (refusing fuzzy matching when sharper classification is
available) is broader than fail-loudly proper and may relocate to
a future classification-discipline tenet. The text is preserved
verbatim per ADR-0005 Rule 8 as the proposal-time record.*

Both the qEUBO-domain postmortem and this one share the same root
failure pattern: *closest-match selection in a vocabulary that
doesn't actually have a true match for the case at hand, taken
without flagging the missing category.* The qEUBO postmortem
named it for enum-value selection. This postmortem extends it to
chrome-neighbourhood selection.

The pattern is general enough to deserve a tenet-level
articulation. The right home is probably an ADR-0002 register
extension (a Rule 7 analogous to Rule 6's design-time-drift
register) or an ADR-0005 register extension for documentation
consequences. Drafting the candidate extension is deferred to a
future arc; this postmortem surfaces the pattern as a
discipline-recommendation candidate.

The discipline, in the meantime, is named explicitly: *when the
closest match in a vocabulary feels not-quite-right, the
honest move is "the vocabulary is missing a category for this
case; revise it before committing."* Taking the closest match is
the literal-spec-following failure mode that ADR-0002's loud-
failure tenet forbids in other contexts, applied to vocabulary-
fit instead of to runtime-error-handling.

---

## 8. References

- `docs/notes/knob-registry-plan.md` — the plan; the toolbar-hover
  quick-access surface is named in §12 Phase 6 and §"What's
  deferred" of the worklog only.
- `docs/worklog/2026-05-14-knob-registry.md` — the parent arc's
  worklog; §"What's deferred" names the toolbar surface as
  "author's eventual UX vision for low-friction slider access."
- `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md` —
  the sibling postmortem from the same arc; shares the closest-
  match failure pattern.
- `src/components/chrome/ToolbarSliderPopover.vue` — the popover
  SFC; its header now carries the corrected placement rationale.
- `src/components/chrome/Toolbar.vue` — the mount site; line 218
  before this arc carried the bug.
- PR #225 (`KodBena/feat/knob-toolbar-popover`, merged 2026-05-14
  as `9c17283`) — the originating PR; merge subject "Knob
  registry — toolbar quick-access popover + priority field (ships
  with bugs)."
- ADR-0002 (fail loudly) — the tenet the closest-match failure
  mode violates.
- ADR-0002 Rule 7 (closest-match selection surfaces too,
  appended 2026-05-15) — the rule §7.6 proposed and that shipped
  as the codification of the pattern. Carries a provisional-home
  flag noting the principle may relocate to a future
  classification-discipline tenet.
- ADR-0003 (frontend portability and domain boundaries) — the
  band classification the postmortem's recommendations operate on.
- ADR-0004 (minimal-touch edits to partially-visible files) — the
  reason §7.1's band-coherence check is necessary as a pre-merge
  discipline.
- ADR-0005 (documentation discipline), Rule 6 — author as you
  decide; §7.3's pre-merge checklist recommendation operationalises.

---

## 9. License

Public Domain (The Unlicense).
