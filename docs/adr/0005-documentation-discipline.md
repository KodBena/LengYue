# ADR-0005: Documentation Discipline

- **Status:** Accepted
- **Genre:** Tenet (cross-cutting authoring discipline) — the
  third tenet in this codebase, after ADR-0002 (fail-loudly) and
  ADR-0004 (minimal-touch).
- **Date:** 2026-04-26
- **Amendments:** 2026-05-07 — appended Rule 8 (sibling revisions
  over silent edits), making the doc-graph plan's `design-note:
  revised` pattern explicit at the tenet level. The new rule is
  the documentation register of ADR-0002 Rule 6 (design-time drift
  surfaces too), in the same shape that Rule 7 of this tenet was
  already identified in the Related section as the documentation
  register of ADR-0002 Rule 1 ("no silent retry queue").
  2026-06-01 — recorded that **Revisit-when #2 (documentation
  tooling matures) has fired**: the doc-graph artifact + freshness
  CI gate (PR #330) mechanize the *cross-reference-resolution*
  subset of this discipline — broken-link detection (the validator's
  `docs/doc-graph-report.md`) and committed-artifact freshness.
  Updated the Negative "no automated check" bullet, Alternative C,
  Revisit-when #2, and Related accordingly. No rule was added; the
  judgment-heavy rules (Rule 3, Rule 6) remain policy, so Alternative
  C's core reasoning holds for them.
  2026-06-02 — appended **Rule 9** (design notes are SSOT-anchored): per the
  work-status SSOT consolidation (RCA guard G5), design notes move to
  `docs/notes/design/`, anchor to exactly one work-status SSOT item via a
  `design-note` ref, and delegate status to it — retiring the per-note
  `design-note: <status>` marker Rule 8 names, in favor of SSOT delegation
  (Rule 1). A design note becomes an archival candidate once its owning item
  closes — query the work-status store for `design-note` refs whose item is
  `closed`. Rule 8's sibling-revision *principle* is unchanged; only
  its status-marker vocabulary is superseded (a forward-pointer is added at
  Rule 8). Pre-SSOT design notes are relocated ad-hoc, with any un-anchorable
  residue carried by a sunsetting allowlist per Rule 7.
  2026-06-11 — noted that the Revisit-when #2 mechanization has widened since
  the 2026-06-01 firing: a co-change advisory
  (`tools/doc-graph/cochange-advisory.mjs`, 2026-06-02) flags derived docs
  (declared via `derived-from` markers) whose sources change in a PR without
  them — a partial, advisory-only net for the Rule 1 / Rule 3 derived-summary
  hazard; and the dangling-reference report gained origin buckets
  (live / executed / frozen), tombstones for retired hubs,
  directory-reference resolution, and an advisory no-new-danglers ratchet
  (work-status item `doc-graph-dangling-signal-cleanup`). Advisory-not-gate
  per Alternative C's reasoning; the judgment core of Rules 3 and 6 remains
  policy. No rule change.
  2026-06-11 — appended **Rule 10** (deferrals are ledgered at authoring
  time): per the history-lessons audit lesson L3 (prose deferrals reliably
  evaporate; ledgered ones survive) and the deferral-harvest arc, every
  deferral / out-of-scope / recommendation bullet in any committed record
  within this tenet's Scope either names its work-status SSOT item id or
  carries a grep-able `not-filed: <reason>` marker; refs to the paid-for
  diagnosis attach at filing time; an item closes only after a residual sweep
  files or marks every named residue. `docs/pre-merge-checklist.md` §D is the
  operational walk-through. (The consolidation review's §6 repairs are folded
  into the rule text — `../notes/audit/audit-consolidation-history-lessons-2026-06-10.md`.)
  2026-06-11 — appended **Rule 11** (commissioned-review artifacts are recorded
  verbatim, in-tree): the commission prompt and full report of any audit /
  consult / adversarial-review sub-agent whose verdict the citing session
  treats as evidence are recorded verbatim in an appendix of the relevant
  committed document; the verdict label does not travel without the artifact's
  substance, and a verdict whose artifact cannot be produced on demand is
  treated as no verdict; corrections are in-situ and dated. Previously defined
  only in a user-local memory note while invoked by name in committed
  documents. (Consolidation §6 repairs folded.)
- **Scope:** All authoring of documentation across the three
  sub-projects. Includes ADRs, notes, READMEs, TODO entries,
  HANDOFFs, playbooks, and inter-team communications.

## Context

The umbrella restructure (recorded in
`docs/playbooks/monorepo/`) surfaced a set of documentation rot
and drift patterns that share a common root: **documentation
written reactively, after-the-fact, or without explicit
lifecycle, decays into low-trust artifacts faster than the
codebase decays around it.** The patterns aren't unique to any
one document genre — they appear in TODOs (item-numbering drift
between parallel sources of truth), in cross-team communications
(no shared filing convention), in note descriptions (carried
over from earlier targets and gone stale), in archived snapshots
(referenced as if they were current), and in playbooks
themselves (status not updated post-execution).

A working contributor's experience of these patterns: an audit
pass takes meaningfully longer than it should because the
documentation graph has to be reconstructed from the codebase
rather than read from the documents. The cost compounds — the
longer the gap between a piece of work and its documentation,
the more reconstruction the next reader does, and the more
reconstruction degrades into guessing.

`docs/notes/reflection.md` names the underlying principle
directly: *"Documentation is cheaper to write while you remember
why, not when you reconstruct why later."* This tenet generalizes
that insight into a set of authoring disciplines.

## Decision

We adopt **Documentation Discipline** as a codebase-wide tenet.
Every documentation artifact — ADRs, notes, TODOs, READMEs,
HANDOFFs, playbooks, dispatch communications — is authored
under the following rules.

### Rule 1: Single source of truth per nominal handle

Item numbers, ADR numbers, ticket ids, handoff names — anything
that names a piece of work — has exactly one owning document.
Parallel documents tracking the same handles drift silently;
this is the failure mode that produced the item-11/12/32
numbering divergence between the pre-umbrella TODOs.

The structural fix: one document with scope tags (`[backend]` /
`[frontend]` / `[both]`), not parallel documents per audience.
Where parallel documents are unavoidable (e.g., legitimate
slimmed-views), the source-of-truth document is named as such,
and the slimmed views explicitly delegate status questions to it.

### Rule 2: Dispatch ledger for cross-team communications

Documents authored by one sub-project for another get filed
under a shared, predictable convention rather than at the
author's local convenience. The umbrella restructure surfaced
that three backend-authored briefings to the frontend during
item 34b ended up in three different places, including one filed
in the recipient's tree.

Convention adopted: cross-team communications go to
`docs/dispatch/{from}-to-{to}-{topic}.md`. Both teams expected
to look there. Specific schema details (date prefixes, status
markers) can evolve; the load-bearing commitment is **one place,
both teams know where**.

### Rule 3: Descriptions describe relations, not content snapshots

A reference's description should describe how the referenced
document RELATES to the referencing one, not what the referenced
document SAYS. The latter goes stale when the target evolves;
the former is stable across most realistic evolutions.

Counterexample (now fixed): `docs/notes/tenancy.md`'s Related
section originally said *"`HANDOFF.md` — describes the system at
the close of the pre-release infrastructure sweep."* That
description was accurate when written, then quietly went stale
when the target was archived and resynthesized. The corrected
version: *"`handoff-current.md` — current orientation document
for the umbrella; this document is the architectural reference
it points back to."*

Apply this pattern in every Related section, every "see also"
reference, and every cross-document link. If you find yourself
summarizing what the referenced document contains, ask whether
the relationship would survive a rewrite of that document; if
not, change the description.

### Rule 4: Document bodies don't bare-name their siblings

Use generic descriptors ("the companion document," "the brief
above," "the playbook this memo accompanies") rather than bare
filenames in document bodies. Bare-named filenames lock renames
and propagate fragility.

The umbrella restructure surfaced this directly:
`34b-parallel-frontend-work.md`'s body refers to
`34b-frontend-brief.md` by filename, which forced the deviation
in Part A's archive naming (renaming would have created a
self-broken reference).

Exception: filenames in code blocks (`run this: cat docs/TODO.md`)
are fine. The rule applies to running prose.

### Rule 5: File location reflects content, not authoring history

If a file's content has drifted from its directory's intent,
move the file before someone trusts the directory. The
`backend/routers/REFERENCE.md` near-miss — the most important
reference doc on the backend lived inside a directory whose
name was misleading enough that a confident cleanup pass would
have deleted it. *(Historical, 2026-06-11: the file was long since
relocated — the path records the near-miss as it stood and no
longer resolves at HEAD.)*

Pattern: when authoring a new file, ask whether its content
matches the directory it's about to live in. When refactoring,
before deleting a directory, audit each file inside on its own
merits.

### Rule 6: Documentation lifecycle — author as you decide

`docs/notes/reflection.md` names this directly. The four
foundational ADRs in this codebase were written at the close of
the work; in hindsight, writing them incrementally would have
produced more, and better, records. The rule applies beyond
ADRs:

- **Status updates** (TODO progressions, completed flags) get
  written when the work commits, not at the close of a milestone.
- **Deviation notes** get added to the relevant playbook or doc
  when the deviation occurs, not at the end of the run.
- **Context for a decision** is captured in the moment, even
  informally (a commit message, an ADR draft, a note appended
  to an existing doc).

The discipline trades a small per-write cost for a large
reconstruction-avoidance benefit.

### Rule 7: Transitional documentation sunsets itself

Sections, files, or documents introduced as transitional carry
an explicit retirement plan. Without that plan, transitional
sections accumulate and ossify into permanent fixtures that
misdescribe the current state.

The "Transitional documentation" subsection introduced into the
root `README.md` during Part B is an example of the pattern done
right: introduced explicitly to flag in-flight transitions,
retired explicitly when the transitions completed. Future
transitional sections should follow the same shape — name the
trigger for retirement at the moment the section is added.

### Rule 8: Sibling revisions over silent edits

*(Appended 2026-05-07.)*

When an authoritative documentation artifact (a design note, an
ADR, a planning record) is found to be wrong in a load-bearing
way, the response is to preserve the original as the
planning-time record and file a sibling marked `revised` —
never to silently edit the original. The doc-graph genre
vocabulary names the markers (`design-note: planned`,
`design-note: implemented`, `design-note: revised`); ADRs
follow the same shape via the Amendments header line and the
append-a-rule convention from Rule 3 of this tenet's Revisit
when… section.

The cost is one extra file (or one Amendments-line entry plus
an appended rule paragraph for an ADR amendment); the payoff
is that wrong-but-honest plans stay legible in the doc graph
rather than collapsing into the post-implementation state. The
trace of planning-time reasoning is what lets a future reader
reconstruct *why* a thing was believed, not just *what*
eventually shipped.

This rule is the documentation register of ADR-0002 Rule 6
("design-time drift surfaces too"), in the same shape that
Rule 7 above is the documentation register of ADR-0002 Rule 1
("no silent retry queue"). The two cross-tenet pairings make
the relationship between this tenet and ADR-0002 a load-bearing
structural fact rather than a Related-section observation: the
documentation discipline is fail-loudly applied to the
documentation graph, and these two rule pairings are how that
relationship is anchored in the codebase's authoring vocabulary.

*(Updated 2026-06-02.)* Rule 9 retires the `design-note: <status>` marker
vocabulary named above in favor of SSOT delegation: the sibling-revision
*principle* here is unchanged, but a design note's status is now read from its
owning work-status SSOT item, not a per-note marker. See Rule 9.

### Rule 9: Design notes are SSOT-anchored

*(Appended 2026-06-02.)*

The work-status SSOT consolidation (RCA guard G5 — the work-status store as
the single source of truth for work status) extends to design-note lifecycle.
A design note is the planning record for a unit of work; that work's status is
an SSOT concern, so the note delegates to it rather than carrying its own.

- **Location (Rule 5).** Design notes live in `docs/notes/design/`; consult
  records in `docs/notes/consult/` — taxa extracted from the flat
  `docs/notes/` root once each grew numerous enough to be a category rather
  than a synthetic guess (the classification threshold ADR-0008 governs).
- **Anchoring (Rule 1).** Every design note is referenced by exactly one
  owning work-status SSOT item via a `design-note` ref, and is not authored
  without it. The note carries a one-line header pointer (`> SSOT: \`<id>\``);
  its lifecycle *is* that item's state. There is no per-note
  `design-note: <status>` marker — that is a parallel status authority, the
  drift Rule 1 forbids.
- **Retirement.** When the owning item closes, that closure is the
  retirement signal — query the work-status store for `design-note` refs
  whose owning item is `closed`; such a note is an archival candidate and
  moves to `docs/archive/notes/design/`. Archival is editorial (a note may
  retain residual value) and costs a cross-reference audit, so this is an
  advisory signal — it does not gate.
- **Revision (Rule 8).** Sibling-revision-over-silent-edit is unchanged: a
  superseded note is preserved and a sibling authored. The supersession
  relation is carried by the SSOT (`superseded_by`) and a cross-link between
  the notes, not by a `design-note: revised` marker.

Pre-consolidation design notes predate the SSOT and are not retroactively
rewritten (the Neutral clause + ADR-0004). They are relocated into
`docs/notes/design/` (or archived if already implemented) as a one-time
ad-hoc pass; any that cannot be cleanly SSOT-anchored are carried by a
**sunsetting allowlist** in the retirement advisory (Rule 7 — the allowlist
names its own retirement: when the last old-style note is implemented or
retired, the bespoke check is purged from CI).

This rule is the design-note register of the consolidation that made
the work-status store (the `todo` Postgres DB; the `docs/work-status.json`
seed it was first consolidated into has since been retired) canonical for
work status: status lives in one place, and the documents that describe work
delegate to it.

### Rule 10: Deferrals are ledgered at authoring time

*(Appended 2026-06-11.)*

A deferral names a piece of future work; per Rule 1, future work has exactly
one owning home — the work-status SSOT. The 2026-06-10 history-lessons audit
verified the failure mode from both directions (lesson L3): every deferral
that reached the work-status store was accounted for at audit time, while
deferrals recorded only in worklog "What's deferred" sections, postmortem
recommendations, or retrospective roadmaps reliably evaporated — including
one (the module-scope rebinding audit, deferred in a 2026-05-17 worklog)
parts of whose class recurred before the audit re-surfaced it. The
consolidation review that followed (`../notes/audit/audit-consolidation-history-lessons-2026-06-10.md`)
sharpened L3 in two ways carried into this rule's bullets: the leak has a
second point — **closure** — and the genre enumeration the first draft used
itself failed open.

- **Capture.** Every deferral / out-of-scope / recommendation bullet in **any
  committed record within this tenet's Scope** ends with either a work-status
  item id or an explicit, grep-able `not-filed: <reason>` marker. The earlier
  draft enumerated genres ("worklog, postmortem, retrospective, audit, or
  consult record"); that enumeration failed open at a paid-for instance — a
  dispatch carrying the learned-vf closure obligations — so the rule keys on
  the Scope, not a list, because a rule institutionalizing "enumerations fail
  open" must not itself be an enumeration. Neither "held for the next X-touch
  PR" nor a bare prose admission is a tracked state.
- **Refs at filing.** An item filed near a diagnosis document gets its ref to
  that document at filing time; an item without refs to its paid-for
  diagnosis forces the next session to re-derive it.
- **Retitle to the residual.** When an open item's work partially ships,
  retitle/redescribe it to what actually remains.
- **Close only after a residual sweep.** An item closes only after a sweep
  files or marks (`not-filed: <reason>`) every named residue — the program's
  freshest evaporations were at *closure*, not authoring: `services-boundary-deny-by-default`
  closed with its step (b) record lost (re-captured as
  `reactive-state-modules-relocation`), and `cast-hygiene-lint` closed with
  its stage-2 title-half measured-but-unadopted and no successor. Retitle-to-the-
  residual covers the partial-ship case; this bullet covers the close-it-anyway
  case the partial-ship bullet does not.
- **Generalization deferrals are recorded, not silently dropped.** A drop on
  single-domain grounds is itself a fail-loud event (ADR-0002): a deferral
  whose rationale is generality for a second domain is dropped only by a bullet
  that **names the generality rationale it declines** — never silently on "only
  one domain uses it" grounds. The fork constraint this protects is the one
  `docs/pre-merge-checklist.md` §D attributes to the deferral-harvest audit
  (§3.22); the constraint is strategy-contingent (it presupposes the fork is a
  live target), so a session declining it records why.

Positive and negative markers both have a form. The negative marker
(`not-filed: <reason>`) is deliberately grep-able so a future advisory sweep
can mechanize detection — Revisit-when #2's open candidates gain a third, and
filing that sweep is itself tracked work. The positive case is a bullet ending
with the owning item id in backticks (e.g. ``… → `reactive-state-modules-relocation` ``).
Honestly: a bullet carrying neither marker remains checklist/review territory
until that advisory sweep exists — the sweep is what would make the absence
mechanically visible. The two post-§D same-day misses the consolidation
recorded (two deferrals that evaporated within hours of the checklist-§D
convention landing) are the calibration evidence for why review alone is not
yet sufficient.

This rule is Rule 6's "where" to its "when": the evaporated deferrals *were*
written down in the moment — in the wrong home. It is the forward-looking
register of the consolidation Rule 9 records: Rule 9 anchors design notes to
the SSOT; this rule anchors the moment future work is first named.
`docs/pre-merge-checklist.md` §D is the operational walk-through.

### Rule 11: Commissioned-review artifacts are recorded verbatim, in-tree

*(Appended 2026-06-11.)*

When work leans on a **commissioned review** — a delegated audit sub-agent, a
consult, an adversarial pass such as a hack-rationalization run, **whose
verdict the citing session treats as evidence** — the commission prompt and
the full report are recorded verbatim in an appendix of the relevant committed
document (worklog, audit note, postmortem). (A review whose verdict is not
cited as evidence — an informal sanity read the session does not lean on — is
out of scope; the rule binds the moment a verdict is wielded.) The verdict
label does not travel without the artifact: a bare "passed review" or
"narrower-but-justified" with no inspectable commission and report is the
unsubstantiated-claim shape ADR-0002 and ADR-0009 forbid in their registers,
and **a verdict whose artifact cannot be produced on demand is treated as no
verdict** — the PR #382 235-character merge-on-nothing comment, which
referenced an assessment reachable nowhere, is the substrate (since repaired).

The artifact's substance is defined minimally so a summary cannot stand in for
it: **the verdict plus every verdict-carrying finding reproduced, not
characterized.** Where an artifact's authoritative copy lives off-tree (a PR
comment), the committed document carries the pointer plus that substance, so
the record survives the forge — a one-line gloss does not satisfy it.

Verbatim appendices are **reference records, consumed by pointer-citation**:
they are not read end to end on every consultation. The sanctioned posture for
fanning out a body of agents over a large verbatim corpus is a single
read-once digest with pointers, which subsequent agents cite by pointer — the
regime the corpus audit's own ~810 KB fan-out incident mandated. This
reconciles the rule with the umbrella `CLAUDE.md`'s read-fully-before-citing
discipline: the *digest* is read fully and the appendix is the citable record
behind its pointers, rather than every agent re-reading the whole corpus.

Corrections to a recorded artifact are made **in situ, dated, by strike rather
than deletion** — the wrong text stays legible with a visible strike and the
correction beside it, so the record shows both what was claimed and what
replaced it (the Rule 8 sibling-revision principle applied inside a single
record). This is consistent with the audit directory's not-retro-edited
convention: a **dated, additive** correction that leaves the struck original
readable is the sanctioned move; a **silent rewrite** of a point-in-time
artifact never is.

Substrate: the 2026-06-10 multi-writer arc, where a fabricated sanction
quote inside an in-frame review artifact was caught precisely because the
artifact was verbatim-recorded and an out-of-frame rerun could check it
against the commissioning item; the strike is an in-situ dated correction,
the artifact otherwise untouched (the worklog's appendix and postscript are
the worked example). The practice predates this rule — the history-lessons
audit's three-part verbatim appendix is the largest instance — but its
definition lived only in a user-local memory note while committed documents
invoked "the standing verbatim-record discipline" by name: a named handle
with no owning committed document, the Rule 1 failure shape applied to a
discipline.

## Consequences

### Positive

- **Lower reconstruction cost.** A reader walking into the
  documentation graph cold spends less time guessing which docs
  are current, which references resolve, and which item numbers
  mean what.
- **Friction-aligned with development.** The discipline operates
  at the moment of authoring; it doesn't impose batched cleanup
  work later. This composes well with the codebase's existing
  posture.
- **Audit trail.** Each rule above corresponds to a concrete
  pattern the umbrella restructure surfaced. Future audits can
  reference the rule rather than re-deriving the pattern.

### Negative

- **Per-write authoring overhead.** Each documentation event
  takes slightly longer because the rules are non-trivial. The
  cost is small per write but real.
- **Discipline is largely policy, not mechanism.** Like ADR-0002
  and ADR-0004, this tenet lives mostly in code review and
  authoring habit. *(Partly mechanized 2026-06-01:* the doc-graph
  `doc-graph-ci` freshness gate + the broken-link validator
  (`docs/doc-graph-report.md`) catch dangling cross-references and a
  stale committed doc-graph — the resolution subset. The
  judgment-heavy rules — Rule 3's relation-vs-content, Rule 6's
  lifecycle — still have no automated check.)
- **Some rules require judgment.** "Document body doesn't
  bare-name its siblings" is unambiguous; "descriptions describe
  relations" requires a small evaluation each time. Reasonable
  contributors will sometimes disagree.

### Neutral

- **No retroactive rewrite required.** Existing documentation
  that violates these rules is not automatically targeted for
  rewrite. ADR-0004's spirit applies: incremental retrofit when
  files are touched for other reasons; no blanket rewrite pass.

## Alternatives considered

### Alternative A: No tenet — handle each pattern as it surfaces

**Rejected because:** the patterns recurred across multiple
genres and multiple authoring sessions during the umbrella
restructure. Without a unified tenet, each pattern would have
to be re-derived independently. Naming the underlying discipline
pays back across all future authoring.

### Alternative B: A more aggressive tenet that mandates retroactive rewrites

**Rejected because:** would impose a significant one-time cost
on existing documentation that is largely working. The pragmatic
posture is incremental retrofit (composing with ADR-0004), not
blanket rewrites.

### Alternative C: Automated mechanism (linter, doc CI)

**Rejected (for now) because:** the rules are too soft for
current static-analysis tooling to catch usefully. Rule 4 (no
bare-named filenames in prose) might be feasible as a linter;
Rule 3 (descriptions describe relations) is human-judgment-
shaped. As tooling matures, partial mechanization becomes
attractive; not yet.

*Partly adopted 2026-06-01 (PR #330):* the doc-graph artifact
mechanized the **cross-reference-resolution** subset — whether a
reference resolves is *not* soft (a path either points at an
existing doc or it doesn't), so it became a CI validator
(`docs/doc-graph-report.md`, listing dangling refs) plus a
committed-artifact freshness gate. A co-change advisory (2026-06-02)
extends this to declared derived docs whose sources change without
them; the dangling-ref report gained origin classification and an
advisory ratchet (2026-06-10). Rule 4 and the
judgment-shaped rules (Rule 3, Rule 6) remain unmechanized; the
core reasoning above still holds for those.

## Revisit when…

This tenet is worth revisiting if:

1. **A specific rule turns out to introduce its own failure
   mode.** Unlikely but worth flagging as the trigger for revisit.
2. **Documentation tooling matures enough to mechanize part of
   the discipline.** A linter for Rule 4 (no bare-named
   filenames) is the easiest candidate; a checker for unsynced
   TODO items between parallel documents is harder but not
   infeasible. **(Fired 2026-06-01.)** The doc-graph artifact
   (PR #330) mechanized the cross-reference-*resolution* subset —
   the validator + freshness gate (see Alternative C and the
   Amendments line). Rule 4's linter and the parallel-TODO checker
   remain the open candidates; this trigger stays live for them.
3. **A genuinely new failure pattern surfaces** that isn't
   covered by the existing rules. At that point, append the rule
   rather than starting a new tenet — this tenet is shaped to
   absorb additional disciplines. (The 2026-05-07 amendment
   adding Rule 8 is the first instance of this pre-authorized
   append, and the precedent for tracking such additions via the
   Amendments header line.)

## Related

- **ADR-0002 (fail loudly).** This tenet is fail-loudly applied
  to documentation: when a documentation gap exists, name it
  visibly rather than papering over it. The "transitional
  documentation sunsets itself" rule is the documentation analog
  of "no silent retry queue."
- **ADR-0004 (minimal-touch edits to partially-visible files).**
  The "incremental retrofit" posture for existing documentation
  directly applies ADR-0004: don't blanket-rewrite documentation
  that isn't currently being touched; fix issues when the file
  is opened for other reasons.
- **ADR-0006 (source-file headers).** The companion tenet
  governing per-file header conventions; a specific instance of
  this discipline applied at the file level.
- **`docs/notes/reflection.md`.** "Documentation as you go" —
  the original articulation of Rule 6, generalized here.
- **`docs/playbooks/monorepo/`.** The two-part playbook that
  surfaced these patterns. Each rule above corresponds to a
  specific concrete observation recorded in those playbooks.
- **`docs/notes/audit-reflections.md`.** The auditor's-perspective
  companion to `reflection.md`, recording observations from this
  restructure.
- **The doc-graph artifact** (`tools/doc-graph/generate.mjs` →
  `docs/doc-graph.{json,md}` + `docs/doc-graph-report.md` — the SVG
  renders locally and is gitignored, see
  `docs/notes/vestige/deferred-items/doc-graph-svg-render-off-tree.md`;
  design note `docs/archive/notes/design/documentation-graph-artifact-plan.md`).
  The partial mechanization of this tenet (Alternative C, partly
  adopted): the validator surfaces dangling cross-references and the
  freshness gate keeps the committed graph honest. Doc-touching
  changes regenerate it — the authoring requirement is recorded in
  the umbrella `CLAUDE.md`'s "Documentation is part of the work"
  audit.

## What this tenet does NOT mean

- **Not "all documentation is created equal."** Some documents
  (ADRs, the synthesized HANDOFF) are higher-stakes; some
  (commit messages, dispatch notes) are lower-stakes. The
  discipline applies to all but the level of formality scales.
- **Not "no documentation churn."** Documentation evolves. The
  tenet's goal is to reduce DRIFT (unintentional staleness),
  not to freeze documents.
- **Not "documentation must be exhaustive."** Brevity remains a
  virtue. The disciplines above are about authoring posture,
  not coverage.
- **Not a contribution gate.** A PR with imperfect documentation
  is not blocked by this tenet; reviewers may flag specific
  rules but should be proportionate. The tenet is for
  self-discipline as much as for review feedback.
