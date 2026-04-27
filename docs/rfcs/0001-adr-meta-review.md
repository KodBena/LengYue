# RFC-0001: ADR Meta-Review (Compliance + Validity Audits)

- **Status:** Draft
- **Date:** 2026-04-27
- **Author:** bork (drafted with Claude Opus 4.7)

## Summary

The codebase carries seven ADRs treated as authoritative by
`CLAUDE.md`. None has been formally re-examined since adoption.
This RFC proposes a two-layer meta-review discipline:

- **Layer 1 — compliance.** "Where in the codebase does each ADR
  not currently hold, and why?"
- **Layer 2 — validity.** "Is the ADR itself still right —
  internally and against the evolved codebase?"

Layer 1 presumes the ADR is right and measures the codebase against
it. Layer 2 questions that presumption. The RFC proposes a cadence,
a ledger destination, triage paths from findings to outcomes, and a
back-of-envelope feasibility estimate.

## Motivation

ADRs are policy, not mechanism. They are followed because
contributors choose to follow them; that choice is under load every
commit. Without measurement, "adoption holds" becomes an untested
assumption.

Drift is already surfacing in passing:

- **ADR-0002 (fail loudly)** has not been swept since adoption.
  `docs/notes/auditor-notes.md` and `docs/notes/deferred-items.md`
  already record candidate violations (silent guard returns,
  fallback chains in the ACL) noticed in passing rather than as a
  systematic pass.
- **ADR-0006 (source-file headers)** is retrofitted on touch;
  coverage is unmeasured. The post-onboarding audit visibly caught
  a full-visibility edit that didn't retrofit (`vite.config.ts`).
- **ADR-0007 (file size and information density)** is *Proposed*;
  without an initial audit, the budgets are unanchored against the
  codebase's actual distribution.
- **Validity drift.** ADRs were authored under specific conditions
  — pre-umbrella restructure for some, pre-tenancy for others. The
  "Revisit when…" triggers may have fired silently. ADR-0001's
  Pinia-revisit trigger is a worked example.

ADR-0005 (documentation discipline) makes this concern
self-referential: if the doc graph asserts adherence that no one has
verified, the graph itself violates ADR-0005's rule on
relations-between-documents.

The deferred-items ledger flagged this directly: *"An ADR-0008 or
similar that prescribes how and when ADRs get audited would close
the loop."* This RFC is the proposal for that loop.

## Goals / non-goals

### Goals

- Define what "compliance" means per ADR, distinguishing
  *decisions* (which are testable in code shape) from *tenets*
  (which are dispositional).
- Propose a measurement method bounded enough to be affordable.
- Separate compliance-checking from validity-checking; the failure
  modes are different and conflating them produces bad triage.
- Establish a ledger destination so audit findings accumulate
  rather than vanishing into individual sessions.
- Name what gets done with a finding — code fix, exception entry,
  ADR amendment, or retirement — so audits don't dead-end.

### Non-goals

- This RFC does not perform an audit; it proposes the discipline.
- It does not amend any ADR.
- It does not propose automation tooling beyond noting which
  signals are obviously automatable.
- It does not bind ownership of the audit work.

## Design

### Two layers, in order

A compliance failure can mean either (a) the code has drifted from a
sound ADR, or (b) the ADR itself has aged. Doing compliance first
and validity second mirrors that branching: most findings resolve at
Layer 1, and only the residual escalates to Layer 2. Conflating the
layers produces the worst outcome — codebase changes to satisfy an
ADR that should itself have been amended.

#### Layer 1 — Compliance audit

Per ADR, enumerate concrete sites where its rules apply; classify
each as compliant or non-compliant-with-explanation. Output is a
per-ADR ledger entry naming each finding by `file:line` with a
one-paragraph classification. The auditor-notes ledger format is
the reference shape: append-only, dated, signed by session.

#### Layer 2 — Validity audit

Per ADR, ask:

- *Intrinsic*: Are the rules internally consistent? Does the
  rationale entail the rules? Are the documented exceptions
  actually all the exceptions, or are there silent ones?
- *Extrinsic*: Do the conditions that motivated the ADR still
  hold? Has the codebase evolved past the problem? Has any
  "Revisit when…" trigger fired without anyone checking?

Output: a per-ADR validity ledger entry, possibly with an amendment
recommendation.

### Cadence

- **Layer 1** (compliance): every six months, or before any major
  release / public deployment, whichever comes first.
- **Layer 2** (validity): annually, or when an ADR's "Revisit
  when…" trigger fires, whichever comes first.

Layer 1 is mechanical and benefits from rhythm. Layer 2 is
deliberative; doing it too often turns ADRs into churn.

### Ledger destination

`docs/audits/` (new directory). Per pass:

- `docs/audits/YYYY-MM-DD-compliance-adr-NNNN.md` — one file per
  ADR per pass.
- `docs/audits/YYYY-MM-DD-validity-adr-NNNN.md` — likewise.

`docs/audits/README.md` explains the genre and indexes the entries.
The auditor-notes ledger is the format reference.

### Triage paths

A **compliance finding** resolves to one of:

1. **Code-side fix.** A TODO entry filed; standard ADR-0004
   minimal-touch posture applies to the fix.
2. **Documented exception.** Site is genuinely one-off; name it in
   the ADR's exceptions list. ADR-0002 already has this pattern;
   others can adopt it.
3. **Escalation to Layer 2.** The finding suggests the ADR itself
   is wrong or under-specified; trigger a validity review on that
   ADR.

A **validity finding** resolves to one of:

1. **Reaffirmation.** Re-checked, still holds, rationale current.
   Logged with the date.
2. **Amendment.** Rules change, rationale updated,
   supersedes-link maintained per ADR-0005.
3. **Retirement.** ADR is no longer relevant; archived per
   ADR-0005. A "soft-retire / period of grace" sub-status may be
   appropriate when the codebase has grown deeply dependent on the
   ADR's posture (open question 3 below).

### Economic feasibility

Cost varies sharply by ADR depending on whether the compliance
signal is automatable:

- **Automatable.** ADR-0006 (header presence), ADR-0007 (file
  size, density). Scriptable; near-zero per-pass cost after the
  script is written.
- **Semi-automatable.** ADR-0001 (mutator-only on reactive
  containers), ADR-0005 (cross-reference integrity — a graph walk
  can verify described relationships). Tooling narrows the search;
  final classification requires reading.
- **Manual.** ADR-0002 (fail loudly), ADR-0003 (band placement
  for new modules), ADR-0004 (retrospective minimal-touch posture
  on PRs/commits). Per-site judgment is the whole audit.

The first compliance pass is the most expensive; subsequent passes
benefit from **delta-only review** — only files changed since the
last audit need re-classification, and the prior ledger entry
serves as the baseline. That structural discount is what makes a
regular cadence economically viable; without it, each pass would
re-litigate the entire codebase.

A **rolling-audit alternative** — one ADR per month — splits the
cost over the calendar without changing the total. It surrenders
cross-ADR observation (e.g., a single site that violates two ADRs
gets noticed twice instead of once) in exchange for steady cadence
and lower per-month spend. Reasonable fallback if the
every-six-months pass turns out to be too lumpy.

## Alternatives considered

1. **No discipline; rely on per-task observation.** Status quo.
   Drift accrues; the auditor-notes and deferred-items entries
   that motivated this RFC document the drift already happening
   and being noticed but not closed.

2. **Per-ADR cadence rules embedded in each ADR's body.** More
   flexible, decentralized. Harder to remember, fragments the
   ledger, and creates inconsistency between ADRs about how
   strictly they're observed.

3. **Automated linting only.** Some signals are automatable; most
   aren't. An automation-only approach would hollow out the audit
   by leaving the judgment-heavy ADRs (0002, 0003, 0004)
   unmeasured. Good complement, bad substitute.

4. **External-auditor-only.** Outsource compliance to fresh Claude
   sessions or human reviewers, no internal discipline. Cost moves
   but doesn't reduce; the auditor-notes ledger is already the
   skeleton of this idea but it captures observations only ad hoc.

5. **Ratify as ADR-0008 directly without RFC.** Plausible — an
   audit discipline is itself a decision. The RFC framing surfaces
   the proposal to discussion first; if accepted, ratification as
   ADR-0008 is the natural follow-on (open question 1).

## Open questions

1. **Where does the discipline itself land after acceptance?**
   ADR-0008 (this is a decision about how the project is governed)
   vs. `docs/playbooks/` (this is a procedural sequence). The
   axis is "tenet" vs. "recipe." Most likely ADR, given
   `CLAUDE.md` already treats the existing tenets as authoritative
   and an audit discipline composes naturally with them.

2. **Who runs the audits?** Single contributor, rotation, a
   dedicated session per pass, automated where possible? This RFC
   doesn't bind ownership; the first pass will likely teach.

3. **Soft-retire status for ADRs.** When a validity finding
   suggests retirement but the codebase has grown deeply
   dependent on the ADR's posture, clean retirement is
   destabilizing. A "soft-retire / period of grace" status —
   ADR is deprecated for new work but observed for existing —
   may be necessary. Worth specifying if accepted.

4. **The proxy submodule's status.** The proxy (`proxy/`,
   KataProxy) is pinned at v1.0.0 and frozen until release. ADRs
   nominally apply project-wide, but the proxy has its own
   architecture and was not authored against these ADRs. The
   audit should explicitly scope to `frontend/` and `backend/`
   and exempt `proxy/`.

5. **Tension with the `CLAUDE.md` gating effect.** The umbrella
   CLAUDE.md treats ADRs as runtime checks on every contribution
   ("a contribution that fights any of these is wrong by
   default"). The audit is a periodic check on accumulated state.
   Are these in tension (the runtime check should suffice) or
   complementary (runtime catches obvious drift, periodic catches
   subtle drift)? The RFC's bias is the latter; worth saying so
   explicitly.

6. **Doc-graph integrity as a separate audit layer.** ADR-0005
   rule 3 (relations between documents are described accurately)
   is itself auditable — a script can walk the graph and verify
   described relationships against actual content. Folds into
   Layer 1 of ADR-0005's audit, but the cross-cutting nature
   (every doc references multiple others) might warrant a third
   layer focused on the graph rather than per-ADR.

7. **First-audit-pass scope.** Should the first pass be all seven
   ADRs at once (high cost, full picture) or rolling (one per
   month, lower upfront cost)? Likely all-at-once for the
   baseline, then delta-only thereafter.

## Acceptance criteria

This RFC is accepted when:

- The user reviews the two-layer split, the cadence, the ledger
  destination, and the triage paths.
- A decision is made on open question 1 (ADR-0008 vs. playbook).
- Open questions 2–7 are answered or explicitly deferred to
  first-audit-time.
- A first audit pass is scheduled — by date or by trigger (e.g.,
  "before public deployment").

If accepted, follow-on commits create:

- `docs/audits/` with a `README.md` explaining the genre.
- Either `docs/adr/0008-adr-meta-review.md` or
  `docs/playbooks/adr-audit/` codifying the discipline.
- The first audit pass entries, dated.
- A cross-reference from `docs/handoff-current.md`'s
  "Architectural governance" section pointing at the audit
  discipline alongside the ADR list.
