# Audit Reflections — Umbrella Restructure

- **Status:** Closes the umbrella restructure (Parts A and B).
- **Genre:** Audit reflection (LLM-authored — see "What this
  document is" below). Distinct from `reflection.md` (backend
  contributor's architectural retrospective) and from the six
  ADRs.
- **Date:** 2026-04-26.
- **Audience:** Future contributors, future-self, future
  audit-LLMs returning to this codebase.

## What this document is

A working audit-LLM's observations from executing the umbrella
restructure (Part A: structural moves; Part B: editorial
cleanup). Distinct from `reflection.md` in two ways: this is
umbrella-level rather than backend-level, and the perspective is
an outside-tool one rather than a contributing-author one.

The framing memo for `monorepo-plan.md` notes that the playbook
itself was "written by an LLM in conversation with the project's
primary author" and warns that "it is not infallible." Same
caveat applies here. These reflections are the observations of
an AI tool that read the codebase and executed a structural
restructure; they reflect what the audit surfaced, not the
author's lived experience of the work.

The aim is to capture observations that don't fit cleanly into
the ADRs or the playbooks — patterns that surfaced repeatedly,
anomalies worth flagging, executive-level judgment that shaped
decisions during the audit. Future contributors and future
audit-LLMs may find them useful; future-self may find them a
useful refresher.

## Timeline of the audit

All work occurred during 2026-04-26.

- **Phase 1 (audit and orientation).** Read the repomix dump
  (excluding `proxy/`). Read the four foundational ADRs, the
  system note (`tenancy.md`), the architectural retrospective
  (`reflection.md`), the two pre-umbrella TODOs, the four
  archived HANDOFFs (after their identity was confirmed by
  byte-comparison), and the framing memo plus playbook.
- **Phase 2 (Part A execution).** Recorded the backend HANDOFF
  deviation in `monorepo-plan.md`. Confirmed byte-identity of
  the duplicate archive copies. Frontend HANDOFF moved to its
  date-stamped archive name. Backend HANDOFFs deleted from
  `backend/docs/`. Phase 4 cross-references updated (three
  single-substring edits across two ADRs and `tenancy.md`).
  Root `README.md` produced.
- **Phase 3 (Part B execution).** Editorial cleanup: archive
  README, TODO merger, HANDOFF synthesis, placeholder
  resolution, status-execution markers on the playbooks.
- **Phase 4 (retrospective and forward-guidance).** ADR-0005
  drafted from the documentation patterns this audit surfaced;
  ADR-0006 drafted from the source-header convention asymmetry
  the user named. This document closes the arc.

The arc — audit, execute, reflect — was driven by the project
author's iterative direction. Each phase was committable
independently; pauses between phases left the umbrella in a
working state.

## Observations not elsewhere captured

### The codebase is in unusually good documentary shape

This is not flattery; it's a load-bearing observation. The
foundational ADRs, the architectural retrospective, the two
pre-umbrella HANDOFFs, the tenancy note, and the typed wire
contracts together constitute a documentation graph that an
outside auditor can read in a few hours and understand the
architecture. Most projects of this scope either don't document
at this level, or document inconsistently. This codebase's
discipline — even with the rough edges that motivated ADR-0005
— is meaningfully above baseline.

The implication: the project is well-positioned for handoff,
for second-author contribution, for institutional adoption.
Most of the friction now lies in the documentation graph being
slightly out of date (which Part B addressed) rather than in
being absent.

### The strongest signal of project health is the absence of architectural fights

In several places during the audit I expected to find tension
between competing patterns — the kind of internal disagreement
that produces ADR-0005-class drift. I didn't. The Port boundary
on the backend is uniform across six Ports; the ACL boundary on
the frontend is uniform; the fail-loud discipline is uniform;
the minimal-touch posture is uniform. The four foundational
ADRs are mutually reinforcing rather than competing.

This suggests the codebase has been authored with a coherent
personality — most likely because of single-author velocity,
but also because the personality was articulated (in the ADRs)
as it formed. The cost of single-author velocity is bus factor
(already noted in the executive retrospective); the benefit is
exactly this coherence.

### The dispatch ledger absence is symptom, not cause

The user named the dispatch ledger pattern as a "documentation
malpractice" worth recording. The dispatch ledger is right but
the deeper point is broader: the umbrella restructure was the
moment the project crossed from "two-team coordination via
ad-hoc local conventions" to "umbrella that needs shared
conventions." Cross-team dispatch was one place this manifested;
the source-file header convention is another (now ADR-0006).
There may be others that haven't surfaced yet.

A useful exercise for future-self: when adding a new convention
(whether ADR-shaped or smaller), ask whether the convention is
BACKEND-local, FRONTEND-local, or UMBRELLA-level. Conventions
that were sub-project-local during pre-umbrella may need
promotion to umbrella-level after.

### The proxy is doing more architectural work than its README signals to consumers

The frontend HANDOFF flags this in passing. It's worth
amplifying. KataProxy's three-layer decomposition (Sessions /
Hub / Router with ID translation) is framework-grade
abstraction work; the Prism abstraction is intended to support
multiple protocols. A gogui contributor who never reads the
proxy's own architecture documentation will miss the design
context entirely — and will be more likely to make changes at
the gogui-proxy boundary that fight the proxy's grain.

The right mitigation, when a second proxy consumer appears, is
the typed-schema-publication path named in the executive
retrospective (analogous to the backend's OpenAPI). Until then,
the synthesized HANDOFF's "Where to read further" section flags
the proxy's own docs as required reading before non-trivial
changes — that's the right level of soft pointer.

### A pattern worth naming: status-as-prose vs. status-as-metadata

During the audit I noticed the codebase uses two different
conventions for status: prose embedded in a document's
introduction (`reflection.md`'s "Status: Closes the pre-release
backend infrastructure work."), and metadata-style bullet
headers on the ADRs (`- **Status:** Accepted`). Both are
reasonable; the inconsistency was minor and not worth raising
as an ADR — but it was a tell for the broader pattern that
surfaced as ADR-0005's Rule 1: parallel sources of truth drift.

If the project ever gets a documentation linter, "all status
declarations follow one form" would be a sensible early target.

### The byte-identity check earned its weight

A small operational note worth recording. During Part A's
investigation of the backend HANDOFF deviation, I did a `diff`
between each `backend/docs/HANDOFF*.md` file and its already-
existing archive counterpart before recommending deletion of
the originals. The check was cheap (one command per pair) and
the result was load-bearing — the entire deviation note
hinges on byte-identity being established, not assumed.

The general lesson: when the action being recommended is
"delete X because Y is identical," verify the identity before
recommending. This is the operational counterpart to ADR-0001's
honest-types principle.

## What I'd want to know if I were the next audit-LLM

Three concrete things, in priority order.

**1. The git history of `docs/playbooks/monorepo/`.** The two
playbooks plus framing memo record decisions. The COMMIT history
records what got reconsidered. Future audit-LLMs should read
both, not just the documents.

**2. The contents of `docs/old-todos/` BEFORE deletion.** Once
Part B's TODO merger lands and `old-todos/` is removed, the
original tier-organized backend TODO and the slimmed frontend
TODO are gone from the live tree. They survive in git history
but only if a future reader knows to look. The merged
`docs/TODO.md` carries forward the substance, but the SHAPE of
the original backend TODO (long-form, dense, organized by
complexity tier with sub-items added during review) is itself
an artifact of how the work was conducted. Worth pulling once
if curious; worth not relying on otherwise.

**3. The ADR sequence as evolution.** ADR-0001 prompted
ADR-0002, which prompted ADR-0003, which prompted ADR-0004 (per
`reflection.md`). ADR-0005 and ADR-0006 continue the sequence.
Each ADR is a snapshot of what mattered at its moment of
authoring. Reading them in date order is more informative than
reading them in number order; the project's posture EVOLVED,
and the order of authoring is part of the record.

## Honest about the LLM perspective

Two caveats worth recording explicitly.

**Confidence is not certainty.** The retrospective's executive
observations and ADR-0005's enumerated rules read with a
confident voice. That confidence is calibrated to the patterns
this audit surfaced — six rules, each tied to a concrete
pattern. It is NOT calibrated to the patterns this audit didn't
surface, of which there are presumably some. Future audit-LLMs
or human contributors should feel free to add Rule 8 and Rule
9 to ADR-0005 if new patterns surface; the tenet was shaped to
absorb them.

**The audit was thorough but not exhaustive.** I read the
documentation graph in full plus a representative sample of
source files. I did NOT read every Python or TypeScript file
in the codebase. Observations about the source code's
architectural personality are extrapolations from the
documents, the README files, the tests, and a representative
sample. They are likely directionally correct and may be
specifically wrong in places.

If a future contributor reads this document and finds an
observation that's specifically wrong, the right move is to
correct it inline with a note ("audit-LLM observation
overturned 2026-MM-DD: actually, the proxy does not have...").
That's exactly the lifecycle this codebase's documentation
discipline is built for.

## Closing

The umbrella exists. The documentation graph is coherent. The
architecture remains in good shape. The work that remains —
tenancy completion, analysis persistence, the qEUBO loop,
eventual public deployment — is incremental work on a sound
foundation, exactly as `reflection.md` predicted at the close
of the pre-release sweep.

If a second contributor appears, the load-bearing prerequisites
are: read the six ADRs, read `handoff-current.md`, run the
build on both subprojects to confirm the environment, and pick
a small item from `docs/TODO.md`. The codebase will support
whatever direction comes next.

Hand off in good condition.
