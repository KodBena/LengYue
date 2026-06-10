# ADR-0011: Mechanization Discipline

- **Status:** Proposed
- **Genre:** Tenet (cross-cutting corrective-design discipline) — the ninth
  tenet. Rule 1 is the enforcement register of the ADR-0002 / ADR-0008 /
  ADR-0009 unsubstantiated-claim family (an enforcement level is a claim about
  a discipline, and it must be declared, not implied); Rules 2–5 are
  corrective-design protocol adjacent to that family, not a fourth member
  wholesale.
- **Date:** 2026-06-11
- **Scope:** Corrective design and discipline authoring across `frontend/`,
  `backend/`, `proxy/`, the documentation graph, and the work-status store —
  the moments when a discipline is authored or amended, and when a corrective
  responds to a recurrence.

## Context

The project's characteristic failure mode is the invisible-at-authoring,
visible-only-in-aggregate defect, against which policy enforced by one
person's attention and memory is structurally weak — only mechanical nets
help. That is the common root cause of the 2026-06-01 RCA
(`../notes/postmortem/rca-discipline-lapses-2026-06-01.md` §3, three
independent surfaces), whose §5 open question 4 deferred exactly this tenet's
existence to the maintainer, naming `adr-effectiveness-audits` as the vehicle.

The 2026-06-10 history-lessons audit evidenced the lesson from both directions
(its L1), with the caveats carried here per ADR-0009's posture: the
review-only cast-justification rule held at ~50% conformance in a 32-of-224
`.ts` sample (template casts unaudited at sampling); the render-coupling
anti-pattern recurred — roughly nine excisions — until ADR-0010 plus the
render-count harness mechanized it, with no recurrence observed in the ~9-day
window since (explicitly a hypothesis, not a proof); hand-maintained census
comments rotted within days of becoming stale; every RCA-minted lint has held
since its adoption date. The tenet+mechanism pairing — not the describing
document alone — is what arrested recurrence (ADR-0010's own Context is the
worked proof).

## Decision

We adopt **Mechanization Discipline** as a codebase-wide tenet, in five rules.

### Rule 1 — Disciplines declare their enforcement surface

Every discipline-stating rule — an ADR rule, a CLAUDE.md convention, a
checklist line — names how it is enforced, against this vocabulary (related
explicitly to ADR-0002's loudness hierarchy; each class is distinct and the
choice among them is part of the rule's meaning):

- **compile-time** (type system; brands);
- **build/CI gate** (lint at `error`, harness test, freshness gate — fails the
  build);
- **write-time data constraint** (DB table constraints — refuses the write);
- **query-time gate** (an invariant view a validator fails on, e.g.
  `work_status_violations`);
- **advisory surface** (a report or per-PR advisory that flags but never
  gates — e.g. the doc-graph dangling report, the cochange advisory);
- **checklist-at-a-named-moment** (a template line consulted at a defined
  event);
- **review-only**.

Review-only is legitimate but presumptively decaying — declaring it makes that
a visible, challengeable choice (the ~50% sample is the calibration). A
declaration may be an explicit policy-only admission naming why mechanization
is declined now and the trigger that would change it; the existing per-tenet
"discipline is policy, not mechanism" Negative bullets and mechanization
Revisit triggers are this rule's pre-existing instances.

*Neutral scoping (no retroactive sweep):* declarations bind when a discipline
is authored or amended and at corrective-design moments; existing rules
retrofit on touch, per the corpus's standing posture (ADR-0004/0006). The
`adr-effectiveness-audits` sweep detects absence thereafter.

### Rule 2 — Recurrence converts to mechanism, not more prose

When a failure shape recurs after its describing record exists, the
corrective's record names the mechanism it pairs with the rule — at the
strongest *feasible and proportionate* surface in Rule 1's vocabulary — or
carries the same explicit policy-only admission and trigger as Rule 1.
"Tenet+mechanism arrests recurrence; a describing-only document does not" is
the cited rationale (ADR-0010's Context; RCA §3), not an unconditional
build-a-gate mandate — the RCA itself adopted G4 as honest policy ("a
mitigation, not a fix") and rated G6 "never a gate". Corollary, adopted as
decision text from the history audit's L1: correctness budget goes to
converting existing prose disciplines before authoring new guidance prose.
"Filed alongside" means a work-status store item (per ADR-0005 Rule 10) —
prose-channel recommendations are the measured evaporation shape (L3); a
worklog recommendation does not discharge the obligation.

### Rule 3 — Mechanisms adopt measure-first

The adoption protocol (operational register: `frontend/eslint.config.js`'s
rationale header, where the per-rule records live; also exercised in the
deferral-harvest audit's E4 sign-off and the 2026-06-10 adoption worklogs —
this rule is the normative home those records lacked, not a restatement of
them): assess stock rules before writing custom ones; measure the tree via a
scratch config before picking severity; adopt at `error` only on a
zero-or-fully-triaged baseline (warn-as-backlog is for backlog-surfacing
rules); kept violations are annotated inline escapes (the `vue/no-v-html`
model); the rule's gaps are named at the rule site per ADR-0002; where a
paid-for defect exists, probe-verify the net fires on its literal shape.
Adoption censuses are dated point-in-time baselines in the
"at adoption … resolved" historical phrasing — distinct from the living
censuses the stable-handles convention bans from prose comments
(`code-comment-stable-handles`); even historical baselines take dated in-place
corrections when found wrong (the PR #382 "6 → 6" stale-draft correction is
the worked caution).

### Rule 4 — Nets quantify over the class, not the instance

Enumerations of instances fail open at the next instance. A net keys on an
ownership slot, a name/shape predicate, or deny-by-default with named
exemptions. Four paid-for instances: the card-tree per-writer flag superseded
within hours by an owner; the services import blocklist
incomplete-from-day-one, inverted to deny-by-default; the gate-prop lint keyed
on name patterns, never a component allowlist; the blind-mode exit enumeration
returned UNDISCHARGED-HACK out-of-frame and was replaced by an exit-predicate
watcher quantifying over all exits, present and future.

### Rule 5 — Calibration: template, not tollgate, where the failure mode is capability

A mandatory gate on judgment-shaped output produces bungled compliance,
strictly worse than missing compliance (the pre-merge checklist's §7.3
provenance — gate tried, retracted). CI gates are for crisp mechanical
predicates; advisory surfaces and checklists are for judgment-shaped ones.
ADR-0005 Alternative C's reasoning is incorporated, not overridden. The filed
item `rigor-proportionality-rubric-adoption` is the adjacent calibration arc,
named here so the project does not mint two parallel calibration vocabularies
(ADR-0005 Rule 1) — this rule does not subsume it.

## Self-application

This tenet binds at corrective-design moments — postmortem recommendations,
lint adoptions, ADR amendments — a handful of high-attention, template-routed
events per cycle, not the per-edit regime where the corpus measured prose
decaying. Its own Rule-1 declaration: **checklist-at-a-named-moment plus
audit-sweep absence-detection** — a mechanization-assessment line lands in
`docs/pre-merge-checklist.md` in the same change that adopts this tenet, and
the `adr-effectiveness-audits` sweep checklist gains two absence-checks (a
discipline-stating rule without an enforcement declaration; a mechanism
adoption without a measured-baseline record). The remainder is policy-only by
this tenet's own escape clause: the rules' *quality* judgments are
review-shaped, and per Rule 5 a gate would be miscalibrated. The tenet expects
its own prose to be exactly as weak as Rule 1 says — the protection is the
mechanisms it mints; the tenet is the budget-steering and shape-selection
record.

## Alternatives considered

- **ADR-0005 Rule 10 (a documentation-tenet append).** Declined: the subject
  is enforcement economics for code/CI/DB mechanisms, outside ADR-0005's
  documentation-authoring scope and outside its Revisit #3 pre-authorization;
  its adversarial refutation returned *weakened* on exactly this ground.
- **ADR-0002 Rule 8 with a provisional-home flag** (the Rule 7 precedent).
  Viable but lossy: it carries Rules 1–2 only, leaving Rules 3–5 without a
  normative home — the status quo this tenet exists to end. If the maintainer
  takes this fallback, the Rule-8 text names that loss explicitly and the
  flag's relocation target is this draft.
- **Remain practice-only.** The project demonstrably behaves this way after
  incidents — but only post-incident and within attention: trigger bookkeeping,
  the corpus's analogous memory-bound mechanism, recorded correctly in two
  ADRs and silently rotted in two others. The marginal value of the tenet is
  moving the mechanization assessment from an audit-time observation to a
  named obligation at corrective-authoring time — the moment the RCA shows the
  discipline leaks.

## Consequences

**Positive.** Enforcement levels become legible per discipline — a reader (and
a fork author, who inherits the tree's mechanisms but not the maintainer's
memory) can distinguish mechanism-policed from memory-policed without
archaeology. Correctives stop defaulting to the measured-decaying form.
**Negative.** Per-corrective authoring overhead (the assessment + declaration);
the risk of cargo-cult gates is real and Rule 5 is the counterweight.
**Neutral.** No retroactive sweep (Rule 1's scoping clause); existing
mechanisms are not re-litigated.

## Revisit when…

1. A mechanization is retracted on false-positive economics — record the
   retraction here; Rule 3's calibration may need a rule.
2. A second gate-tried-and-retracted instance joins §7.3 — Rule 5's
   calibration graduates from precedent to pattern.
3. Doc-side semantic-check tooling matures (the RCA G6 class) — the
   advisory-surface rung gains members; reassess the vocabulary.
4. The generic knowledge flash-card fork adopts the corpus — the
   enforcement-surface declarations are the fork's transfer manifest; check
   they survived the fork's re-instantiation of umbrella infrastructure.

## Related

- **ADR-0002 (fail loudly).** Revisit #5 (if adopted per A2) is this tenet's
  fail-loudly-register hook, mirroring the Rule 7 / ADR-0008 pairing. The
  Rule-1 vocabulary maps onto ADR-0002's loudness hierarchy at the
  enforcement level.
- **ADR-0008 (classification discipline).** Rule 1's vocabulary is a closed
  vocabulary under ADR-0008's care; extending it follows the
  revise-don't-fuzzy-match discipline.
- **ADR-0009 (perf investigation discipline).** The sibling per-domain
  instance of the unsubstantiated-claim family; Rule 3's measured baselines
  are the enforcement-domain analog of its captured profiles.
- **ADR-0010 (render locality).** The worked proof of the tenet+mechanism
  pairing this tenet generalizes.
- **`../notes/postmortem/rca-discipline-lapses-2026-06-01.md`** — the RCA
  whose §5 open question 4 this ADR answers; cited, never edited
  (point-in-time record).
- **`frontend/eslint.config.js`** — the operational register of Rule 3's
  protocol; that header gains a pointer to this tenet on next touch; no
  parallel restatement (ADR-0005 Rules 1/3).
- **`docs/pre-merge-checklist.md`** — carries this tenet's
  checklist-at-a-named-moment surface.

## License

Public Domain (The Unlicense).
