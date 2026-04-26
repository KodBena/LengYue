# Framing memo for the executor

This memo accompanies `monorepo-plan.md`. It is intended for the
person or agent who is about to execute the playbook — to set
expectations before action.

## What you have in front of you

`monorepo-plan.md` is a **restructuring playbook**. It describes:

- A target end state (a soft monorepo with three subprojects and
  consolidated documentation).
- A sequence of moves that takes a starting state to the target.
- Rationale for each move — why this destination, why this name,
  what trap is being avoided.
- Validation criteria for success.
- Explicit out-of-scope items, deferred to a separate "Part B"
  documentation-cleanup playbook.

It is **not** a spec. It is **not** a runbook. It does not assume
you will follow every step literally without judgment. It assumes
you have full read access to the umbrella repo (`omega/`) and
authority to make the moves it describes.

## What you are authorized to do

- Execute the moves as described in Phase 3 onward (Phases 1 and 2
  are already complete; see the "Execution state" section).
- Deviate from the plan when reality surprises you. Specifically:
  - If a file the playbook says to move doesn't exist, do not
    invent it. Investigate, decide, and document.
  - If a file's contents don't match what the playbook implies
    they contain (e.g., `routers/REFERENCE.md` is rumored to be
    the tree-DSL doc but its contents say something else),
    investigate before moving.
  - If a move would silently break a working system (e.g., a
    Python import path, a frontend asset reference), pause and
    flag rather than push through.
- Capture deviations as commit messages, or as inline edits to
  the playbook itself with a note.

## What you are NOT authorized to do

- Generate documents from thin air. The playbook references files
  that exist (e.g., `backend/docs/HANDOFF.md`); if they don't
  exist when you look, do not synthesize a substitute. Halt and
  report.
- Combine the moves with the editorial work scheduled for Part B.
  The TODO merger, the HANDOFF synthesis, the deep cross-reference
  audit — those are not your task. Park source files in
  `docs/old-todos/` and `docs/archive/` per the playbook; the
  Part B agent (or a human) handles the editorial pass later.
- Delete files based on path location alone. The most important
  reference doc on the backend
  (`backend/routers/REFERENCE.md`) sits in a directory whose name
  suggests it's irrelevant. The directory was deleted; the file
  inside survived deliberately. Apply the same discipline to any
  file whose location seems to suggest it's vestigial: open it
  first, decide based on contents.
- Unify build tooling. No root-level `pyproject.toml`, no
  root-level `package.json`, no shared lint config. Each
  subproject keeps its own. The playbook is deliberate about
  this; do not "improve" by consolidating.

## How the documents around you relate

The playbook references several other documents. Brief orientation:

- **The four ADRs** (`omega/docs/adr/0001-...md` through
  `0004-...md`, after Phase 3a moves them) describe the
  codebase's architectural personality. Read them before making
  judgment calls — your decisions should fit the codebase's grain.
  Especially ADR-0002 (fail loudly) and ADR-0004 (minimal-touch
  edits to partially-visible files), which directly inform the
  posture this playbook expects of you.
- **Tenancy system note** (`omega/docs/notes/tenancy.md` after
  the move) describes the multi-tenant model. Not directly
  relevant to the structural restructuring, but useful context
  if you're confused why some files reference `user_id`.
- **`reflection.md`** (also in `notes/`) is a retrospective on
  the work that produced the current state. It explicitly names
  rough edges in the codebase. If you encounter one of those
  rough edges (e.g., `domain/tag_dsl.py` being a misfiled
  adapter), you'll find it explained there.
- **The two pre-umbrella HANDOFFs** are moment-in-time documents.
  After Phase 3 archives them, they'll live in `docs/archive/`
  with date-stamped filenames. They are reference material, not
  active documentation.
- **`monorepo-plan.md`** itself (the playbook you are about to
  execute) is also a moment-in-time artifact. After execution,
  it can either be deleted or moved to `docs/archive/`. Don't
  worry about that step; the next executor (Part B) handles
  cleanup.

## The relationship between this playbook and Part B

This playbook does the **structural** work: file moves, directory
creations, deletions of confirmed-stale files. It does not do
**editorial** work: merging documents, rewriting cross-references,
synthesizing summaries.

After this playbook runs cleanly, several things will be
deliberately broken:

- Internal cross-references inside the moved ADRs and notes
  (paths point to the old locations until updated).
- Subproject READMEs reference `TODO.md` and `HANDOFF.md` at
  paths that no longer resolve.
- `docs/handoff-current.md` doesn't exist yet (Part B synthesizes
  it).
- `docs/TODO.md` is a placeholder pointing at `docs/old-todos/`
  (Part B does the merger).

These are expected and explicitly out of this playbook's scope.
Part B's playbook (which will be written separately) handles
them. Your job ends when the structural moves are done and the
validation checklist passes.

## What success looks like

When you've done your job:

- `omega/docs/` exists with the structure the playbook describes.
- All moves listed in the move table are complete.
- All deletions listed are complete (and you have not deleted
  anything not on the list).
- The validation checklist at the end of the playbook passes.
- Subproject builds still work (`cd backend && pytest`,
  `cd frontend && npm run dev`, `cd proxy && ...`).
- A commit history exists with one commit per logical move (or
  small groups of related moves), with clear messages.
- You have explicitly noted (in commit messages or inline
  playbook edits) any deviation from the plan.

If you find yourself uncertain at any point, the right move is to
halt and flag the uncertainty, not to guess. The cost of pausing
is small; the cost of guessing wrong propagates downstream.

## A final note

This playbook was written by an LLM in conversation with the
project's primary author. It reflects decisions made through
that conversation. It is not infallible. If something seems
wrong, it might be — flag it, don't paper over it. The author
would rather hear "this part of the plan doesn't make sense" than
discover the silent fallout three weeks later.

Hand off in good condition.
