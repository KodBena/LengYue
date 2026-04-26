# Editorial Cleanup Playbook (Part B)

- **Status:** Pending. Part A (`monorepo-plan.md`) complete as of
  2026-04-26.
- **Scope:** Editorial follow-up to the umbrella restructure. TODO
  consolidation, HANDOFF synthesis, archive orientation, and
  resolution of the placeholder references Part A intentionally
  left behind.
- **Order:** The tasks below are largely independent. Each leaves
  the umbrella in an improved state; you can stop between any of
  them without orphaned work. A recommended sequence is given near
  the end.

## Framing

This document is a companion to `monorepo-plan.md` and assumes you
have read its sibling `monorepo-plan-framing.md`. The same posture
applies: this is a playbook, not a runbook; you have authority to
deviate when reality surprises; capture deviations as commit
messages or as inline edits to this playbook itself.

### What this playbook does

The structural restructure (Part A) moved files into their final
locations. It deliberately did NOT do the editorial work that the
moves made possible: merging the two pre-umbrella TODO files into
a single canonical `docs/TODO.md`, synthesizing
`docs/handoff-current.md` from the archived HANDOFFs, adding
orientation to the archive, and updating the references that Part
A's notes left as forward-looking placeholders. Those tasks are
this playbook's content.

### What this playbook does NOT do

- It does not introduce new architectural decisions. If you find
  yourself wanting to write a new ADR while editing, stop; that's
  a separate task.
- It does not rewrite the archived pre-umbrella HANDOFFs. They
  are historical artifacts; their references to old paths and old
  item numbers are accurate to the moment they captured.
- It does not move files. All moves are done. Any move you find
  yourself wanting to make is either a Part A leftover (flag it)
  or a Part C concern (defer).
- It does not consolidate build tooling, write CI, or unify
  dependency management. Same posture as Part A.
- It does not do a broader reference-graph audit beyond the known
  sites. Part A's Phase 4 audit found the live documentation graph
  in better shape than originally feared; the remaining work is
  resolving the placeholders Part A knowingly created, not hunting
  for new broken references. If you discover one during the
  editorial work, fix it inline and note it in the commit message;
  don't open a separate audit pass.

### Posture from the ADRs

The four ADRs in `docs/adr/` describe the codebase's posture. They
apply to documentation work too:

- **ADR-0002 (fail loudly).** Don't paper over gaps; name them.
  If a TODO item's status is unclear from the source files, mark
  it unclear in the merger output rather than guessing. If a
  HANDOFF section's claim has gone stale, say so explicitly.
- **ADR-0004 (minimal-touch edits to partially-visible files).**
  When rewriting paragraphs, work from the full file, not from
  snippets. The TODO files in particular are long; read them
  whole before editing. When in doubt about an item's content,
  request to see it; don't reconstruct from inference.
- **ADR-0001 (honest types over aspirational annotations).**
  Applies to documentation: don't claim status that hasn't been
  verified. "Active" doesn't mean "I think it's still relevant";
  it means "verified still relevant against the codebase." Status
  claims you can't verify go in a "Status uncertain" bucket.
- **ADR-0003 (frontend portability and domain boundaries).** When
  writing the synthesized HANDOFF, respect the asymmetry: the
  backend is domain-agnostic; the frontend is Go-specific.

### What success looks like

When you've done your job:

- `docs/TODO.md` is the canonical, sectioned, deduplicated TODO
  with preserved item numbering.
- `docs/handoff-current.md` exists and describes the post-umbrella
  system state.
- `docs/archive/README.md` exists and explains what the archive
  contains and how to read it.
- `docs/old-todos/` is deleted.
- Placeholder references inside the moved notes (especially
  `docs/notes/tenancy.md`) resolve to real files.
- Root `README.md`'s "Transitional documentation" subsection is
  retired (the documents it described are no longer transitional).
- A commit history exists with one commit per task (or task
  group), with clear messages.

If you find yourself uncertain at any point, halt and flag rather
than guess. The cost of pausing is small.

---

## Execution state

Part A is complete. The current shape of the documentation graph:

- **Stable.** `docs/adr/` (4 ADRs), `docs/notes/` (4 notes), the
  subproject READMEs, `backend/docs/tree-dsl.md`, root `README.md`.
- **Transient holding cells.** `docs/old-todos/`
  (`TODO-frontend.md` and `TODO-backend.md` await merger).
  `docs/TODO.md` (placeholder pointing at `old-todos/`).
- **Missing but referenced.** `docs/handoff-current.md` (does not
  exist; `docs/notes/tenancy.md`'s Related section links to it).
- **Archive without orientation.** `docs/archive/` contains four
  files (`34b-complete-status.md`, `34b-frontend-brief.md`,
  `34b-parallel-frontend-work.md`,
  `handoff-2026-04-frontend-pre-umbrella.md`) but no README
  explains what they are or how to read them.
- **Playbooks active.** This playbook and its sibling
  `monorepo-plan.md` (now executed) sit in
  `docs/playbooks/monorepo/`.

---

## Tasks

### Task 1: Synthesize `docs/handoff-current.md`

Produce a current-state orientation document at
`docs/handoff-current.md`. The audience is the same as the
archived HANDOFFs — a contributor arriving at the codebase cold,
after the umbrella transition.

#### Source materials

- `docs/archive/handoff-2026-04-frontend-pre-umbrella.md` — the
  most comprehensive of the four archived HANDOFFs; bird's-eye
  orientation to the gogui frontend at the close of the
  pre-release sweep.
- `docs/archive/34b-frontend-brief.md` and
  `docs/archive/34b-parallel-frontend-work.md` —
  backend-authored briefings about the 34b project. Useful for
  the backend's perspective on the period covered.
- `docs/archive/34b-complete-status.md` — frontend's status
  report at 34b's close.
- `docs/notes/reflection.md` — architectural retrospective; the
  closest thing to a current-state narrative for the backend.
- `docs/notes/tenancy.md` — current operating model of the
  tenancy spine.
- The four ADRs — current posture; reference, don't duplicate.

#### Target structure

Suggested sections (adapt to fit the actual content):

1. **What this document is** — one paragraph; orientation,
   audience, what it's for.
2. **The umbrella** — brief: three subprojects, soft-monorepo
   posture, where to find what.
3. **The frontend** — current state, key architectural decisions
   (cross-reference ADRs rather than repeating them), known gaps.
4. **The backend** — same shape; mention the Port architecture,
   the tenancy spine, the typed pipeline DSL.
5. **The proxy** — terse; it's a submodule, see its own README.
6. **Active work** — point at `docs/TODO.md` (which Task 2 will
   produce). Don't duplicate its content; summarize the shape.
7. **Where to read further** — pointer to the ADRs, the notes,
   the archive.

#### Voice

Match the existing HANDOFFs and `docs/notes/reflection.md`:
direct, candid about provisional decisions, willing to flag rough
edges. Not a marketing document; not a comprehensive reference.
Length: probably 300–500 lines if it ends up matching the
existing frontend HANDOFF's depth.

#### Decisions you'll need to make

- **What to do about the closing-of-pre-release-sweep framing.**
  The archived HANDOFFs describe the moment "at the close of the
  pre-release infrastructure sweep." That's a past event now.
  The synthesized doc should describe the *current* moment
  (post-umbrella, Part B in progress or just-completed), not
  relive that close.
- **Whether to mention Part B itself.** If Part B is in progress
  while the document is being written, say so. If Part B is done
  by the time you commit, don't mention it.
- **The umbrella's name.** The umbrella has no settled name yet
  (the Part A playbook used "Omega" as a placeholder). The
  HANDOFF should describe the umbrella by what it is, not by a
  name it doesn't have. If the project gets a name during
  Part B, use it; otherwise speak in descriptors.

### Task 2: Merge `docs/old-todos/` into `docs/TODO.md`

Replace the placeholder `docs/TODO.md` with a consolidated TODO
that supersedes both `TODO-frontend.md` and `TODO-backend.md`.

#### Source materials

- `docs/old-todos/TODO-backend.md` — long-form, complete,
  organized by tier (Trivial / Small / Medium / Large). Includes
  items 1–30+ with sub-items (9a–9e, 21a–f, 30a–d). Items 7 and
  8 are marked "no longer relevant."
- `docs/old-todos/TODO-frontend.md` — the post-completion view.
  Has a "Completed — do not act on these (reference only)"
  section with backend and frontend completion tables, then the
  remaining work organized by tier, plus "Future projects" and
  "Implementation order recommendation" sections.

#### Merger principles

1. **Backend is canonical for item descriptions.** Where the
   two files describe the same item, the backend's wording is
   longer and more complete; use it. The frontend's slimmer
   version is a later editorial pass that loses material; don't
   use it as the trunk.
2. **Frontend is canonical for status.** The frontend's
   "Completed" tables (with one-line synopses) reflect the most
   recent accounting of what's shipped. Use these to mark items
   as completed; preserve the backend's longer description in a
   collapsed or "for context" form beneath each completed item,
   or simply drop the body and keep the synopsis.
3. **Preserve item numbering.** The 1–30+ numbering with
   sub-items is referenced from elsewhere in the codebase
   (commit messages, inline comments, ADRs). Do not renumber.
   Items skipped because "no longer relevant" stay skipped, with
   a one-line note.
4. **Promote frontend-only material.** The frontend's "Future
   projects" and "Implementation order recommendation" sections
   have no backend counterpart. Promote both.

#### Target structure

```
# TODO

[Brief preamble: scope tags, ordering principle, cross-team status]

## Completed (do not act on these)

[Backend table from TODO-frontend.md, refreshed against current
codebase if anything has shipped since]
[Frontend table from TODO-frontend.md, same]

## Active

### Trivial — single-line or single-block
[Items from backend TODO not in the Completed tables, with
descriptions]

### Small — one-file refactors
[Same]

### Medium — touches contracts or coordinated changes
[Same]

### Large — structural changes
[Same]

## Future projects (parked)

[Frontend TODO's "Future projects" section]

## Implementation order recommendation

[Frontend TODO's "Implementation order recommendation" section]
```

#### Normalization to apply

While merging, normalize a few items that the source files have
in older forms:

- `Tenet-0002` → `ADR-0002`. The frontend TODO uses the old
  "Tenet-" prefix from when the file lived at
  `frontend/docs/tenets/0002-fail-loudly.md`. The renaming is
  ADR-0002 throughout the post-Phase-3a documentation; align.
- `docs/ANALYSIS_PERSISTENCE_PLAN.md` →
  `docs/notes/analysis-persistence-plan.md`. Same Phase 3
  rename.
- Any reference to `frontend/docs/HANDOFF.md` →
  `docs/archive/handoff-2026-04-frontend-pre-umbrella.md`.
- Any reference to `backend/docs/HANDOFF.md` →
  `docs/archive/34b-frontend-brief.md` (and the companion to
  `34b-parallel-frontend-work.md`).

#### Decisions you'll need to make

- **What to do about items marked "no longer relevant"** (items
  7 and 8 in the backend TODO). Two options: (a) drop them
  entirely; (b) keep them with a one-line note for numbering
  continuity. Recommend (b) — preserves the numbering and
  answers the implicit "what about 7 and 8?" question.
- **How much of the backend TODO's body content survives.** The
  backend file is dense (~900 lines). The merged file shouldn't
  be much larger; trim aggressively where the description has
  been superseded by shipped code. When trimming, leave a
  pointer ("see commit X" or "see ADR-NNN") rather than deleting
  context.
- **Whether to add a per-item "Status" line.** The frontend's
  approach is to list completed items separately; the active
  items don't need explicit status because they're all active.
  Either approach is fine; pick one and apply consistently.

### Task 3: Add `docs/archive/README.md`

Add a short orientation document that explains the archive's
contents and posture toward them.

#### Why

Without an orientation, a future reader walking into
`docs/archive/` sees four files with naming patterns (`34b-*`
and `handoff-*`) that suggest different conventions. The
asymmetry is intentional (see the deviation note in
`monorepo-plan.md`) but is opaque without context.

#### What to include

- **One-paragraph intro** — what the archive is (snapshots from
  before the umbrella restructure), what posture to take toward
  the contents (read for context, don't expect references inside
  to resolve).
- **Per-file orientation** — for each of the four files, one or
  two sentences saying when it was authored, by whom (frontend
  or backend), and what its content covers.
- **The naming asymmetry** — brief note that two HANDOFFs use
  the date-stamped pattern and three use the project-stamped
  pattern, pointing at the deviation note in
  `../playbooks/monorepo/monorepo-plan.md` for the rationale.

#### Voice

Brief, factual, no frills. This is signage, not a document in
its own right. Around 30–60 lines.

### Task 4: Resolve dependent placeholders

After Tasks 1 and 2 land, three known placeholders need updating.

#### `docs/notes/tenancy.md`

The Related section's `**handoff-current.md**` reference has a
description ("describes the system at the close of the
pre-release infrastructure sweep") that was carried over from
the old `HANDOFF.md` and doesn't fit the synthesized
`handoff-current.md`. Update the description to match what
`handoff-current.md` actually covers.

The prose body line ("for someone who has read the four ADRs and
the HANDOFF and now wants to know how multi-tenancy actually
flows through the code") similarly references "the HANDOFF" in a
way that's slightly stale post-umbrella. Either update to
"`handoff-current.md`" or rephrase to drop the specific
reference; either is fine.

#### Root `README.md`

The "Transitional documentation" subsection describes
`docs/TODO.md` and `docs/handoff-current.md` as in-progress.
After Tasks 1 and 2, both exist. Either:

- **Remove the subsection entirely** — the transitional state is
  over; the references in the main "Documentation" section are
  now accurate.
- **Replace with a brief "Recent transitions" note** for one
  release cycle, then remove. Either is reasonable.

The "Project status" section's mention of "Part B (TODO
consolidation, handoff-current synthesis, broader cross-reference
cleanup) is the remaining work" should be updated. If a Part C is
contemplated, point at it; otherwise just say the umbrella
transition is complete.

### Task 5: Cleanup

After Tasks 1 and 2 are committed and verified:

- **Delete `docs/old-todos/`.** It was a transient holding cell;
  its contents are now superseded by `docs/TODO.md`.
- **Decide on the Part A playbook's fate.** Two options:
  - Keep at `docs/playbooks/monorepo/monorepo-plan.md` and add a
    `Status: executed` line near the top. Cheap; preserves
    rationale for future readers.
  - Move to `docs/archive/` with a date-stamp.

  The same decision applies to `monorepo-plan-framing.md`. Both
  playbooks' framing memos and execution records have ongoing
  value as "why is this directory shaped this way" context, so
  the keep-in-place option is generally preferable unless the
  `playbooks/` directory itself is being reorganized.
- **This playbook (Part B).** Same decision, made after this
  playbook executes.

---

## Migration order — recommended sequence

Tasks are largely independent, but a sensible sequence:

1. **Task 3 (archive README)** — small, easy, doesn't depend on
   anything. Get a quick win and remove a confusion source.
2. **Task 2 (TODO merger)** — produces the canonical TODO.md.
   Task 4's root-README update needs this committed first.
3. **Task 1 (HANDOFF synthesis)** — depends on having read most
   of the source material; can interleave with Task 2 if you've
   read everything once already.
4. **Task 4 (placeholder resolution)** — depends on Tasks 1 and
   2 landing.
5. **Task 5 (cleanup)** — last; final disposition of transient
   files and playbooks.

Each step is one commit (or a small grouped commit). Pause
between any of them without leaving the umbrella in an
inconsistent state.

## Validation criteria

After all tasks complete, verify:

- `docs/TODO.md` opens and renders; the section structure is
  Completed / Active (by tier) / Future projects / Implementation
  order; item numbering is preserved; no `Tenet-` prefix
  references; no old-path references.
- `docs/handoff-current.md` opens and renders; describes the
  current (post-umbrella) state; references ADRs and notes by
  current paths.
- `docs/archive/README.md` opens and renders; explains all four
  archive files.
- `docs/old-todos/` does not exist.
- `docs/notes/tenancy.md`'s Related section's
  `handoff-current.md` link resolves and its description matches
  the synthesized document.
- Root `README.md`'s "Transitional documentation" subsection is
  retired or replaced; "Project status" reflects the new state.
- `cd backend && pytest` still passes; `cd frontend && npm run
  dev` still serves. (Editorial work shouldn't have touched
  code, but the validation is cheap and catches accidents.)

If any of these fail, the editorial pass is incomplete.

## Critical warnings for the executor

These are pitfalls specific to the editorial work, distinct from
Part A's structural pitfalls:

**1. Don't fabricate status.** The single most damaging editorial
mistake is to mark an item "completed" because the description
sounds like it might have been done. If you can't verify by
reading the codebase, mark it "Status uncertain" or leave the
original status as the source file declared it. Per ADR-0001,
the documentation should describe what is, not what we think
might be.

**2. Don't combine items that have separate identities.** Items
9, 9a, 9b, 9c, 9d, 9e are NOT the same item. The lettered
suffixes are sub-items added during review and have their own
commit history. Preserve them as distinct items in the merged
TODO.

**3. Don't rewrite the archived HANDOFFs.** Their references to
old paths and pre-merger TODO item numbers are accurate to the
moment they captured. The archive README is the right place to
explain the discrepancy; the archive contents themselves stay
verbatim.

**4. Don't write Part C while writing Part B.** If broader
documentation issues surface during the editorial work (e.g.,
the backend README could link to `backend/docs/tree-dsl.md`, the
frontend README could mention the umbrella) — note them, don't
fix them. Editorial scope creep is the most common failure mode
of this kind of pass.

**5. Read the full TODO files before editing.** Both are long;
both have material that the merger needs to preserve. Per
ADR-0004, do not edit from snippets; read whole, then edit.

**6. The `handoff-current.md` is a current document, not another
snapshot.** Don't write it as if you're capturing a moment for
archive. Write it as if it will be updated as the system
evolves. A future "hand off in good condition" event would
archive THIS document as a date-stamped snapshot and start a new
`handoff-current.md`.

## What this does NOT do

Explicitly out of scope, deferred to other work:

- **A new ADR or tenet.** If a new architectural decision
  presents itself during editorial work, write it down somewhere
  (a commit message, a note appended to this playbook), but
  don't materialize it as a new ADR. That's a separate task.
- **Subproject README enhancements.** Both READMEs could
  plausibly link to docs in `docs/` after Part B completes.
  That's an enhancement, not a Part B requirement.
- **Cross-cutting refactors triggered by reading.** If the TODO
  merger reveals an architectural issue ("oh, item 28 should
  really be split into 28a and 28b"), note it for a future TODO
  edit; don't act on it during the merge.
- **The submodule's documentation.** `proxy/` has its own README
  and its own internal docs. The umbrella does not curate them.

## Once this is done

The editorial pass is complete. The umbrella's documentation
graph is coherent: every reference resolves, every transitional
document has been retired or made permanent, the archive has
orientation, the playbooks (Part A and Part B) record the work
that produced the current state.

A future "Part C" — if one ever exists — would address concerns
this playbook deferred: subproject README cross-linking, deeper
cross-reference audits, or work triggered by the system's own
evolution. Part C is not foreseen at this time and is not your
concern.

Hand off in good condition.
