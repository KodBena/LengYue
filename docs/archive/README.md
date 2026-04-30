# Archive

This directory holds documentation snapshots that captured a
specific moment and are kept for historical reference. The contents
are not maintained: references inside these files point at locations
and item numbers as they existed at the moment of capture. For
current state, see `../handoff-current.md`, `../TODO.md`, and the
ADRs in `../adr/`.

## Contents

The five files split into three genres: pre-umbrella cross-team
communications, a pre-umbrella state-of-system snapshot, and a
v1-release scope freeze.

### Backend → frontend communications during the 34b project

These three documents were authored by the backend during item 34b
(the wire-contract rename to domain-neutral field names) and
addressed to the frontend. They are filed under the project-stamped
naming pattern (`34b-*`) because the documents themselves refer to
each other by these names — most notably,
`34b-parallel-frontend-work.md` opens by naming
`34b-frontend-brief.md` as its companion, so renaming would break an
internal reference.

- **`34b-frontend-brief.md`** — opening brief. Names the wire
  changes (`sgf` → `raw_content`, `default_visits` relocation),
  the four files the frontend needed to update, and the backend's
  dual-accept transition window. Authored at `backend/docs/HANDOFF.md`
  before the restructure.
- **`34b-parallel-frontend-work.md`** — triage companion to the
  brief. Identifies which items in the pre-umbrella backend TODO
  the frontend could work on in parallel with 34b without merge
  conflicts, and the dependency order. Authored at
  `backend/docs/HANDOFF-companion.md`.
- **`34b-complete-status.md`** — confirmation note after 34b
  landed on both sides. "No reply necessary; this document is
  confirmation, not a request." Authored at the backend, filed by
  the frontend at `frontend/34b-complete-status.md`.

### Frontend self-handoff at the close of the pre-release sweep

- **`handoff-2026-04-frontend-pre-umbrella.md`** — the frontend's
  bird's-eye orientation document, written for future contributors
  arriving at the gogui codebase. Broader in scope than the 34b
  documents; a moment-in-time snapshot of frontend architecture
  and posture at the close of the pre-release infrastructure
  sweep. Authored at `frontend/docs/HANDOFF.md`.

### v1.0.0 release scope freeze

- **`release-scope-2026-04.md`** — the project-level scope freeze
  authored 2026-04-28 that named the seven items gating v1.0.0
  and committed the project to ship after they closed. All seven
  closed by 2026-04-30; the scope's own retirement clause moved
  it here. Distinct from the other archive contents in two ways:
  the references inside reflect post-umbrella paths (it was
  authored after the umbrella restructure), and it captures a
  forward-looking commitment rather than a retrospective
  snapshot. The closure document that replaces it for
  current-state purposes is
  `../notes/release-retrospective-2026-04.md`.

## On the naming asymmetry

The project-stamped pattern (`34b-*`) and the date-stamped pattern
(`handoff-2026-04-frontend-pre-umbrella`, `release-scope-2026-04`)
coexist deliberately. The former fits the 34b project's
communications because those documents already named themselves
that way internally; the latter fits state-of-system snapshots and
project-level commitment freezes that have no narrower project
anchor. The trade-off is recorded in
`../playbooks/monorepo/monorepo-plan.md` under "Backend HANDOFF
deviation."

## Posture toward these files

Read them for context. Do not edit them to fix references — for
the four pre-umbrella files, references inside reflect
pre-umbrella paths and pre-merger TODO item numbers; for the v1
scope freeze, references inside reflect the project state on
2026-04-28. Both kinds are accurate to the moment they captured.
For current paths, current TODO state, and current release
posture, follow the pointers in this directory's parent
`README` or in the system-level documentation under `../`.
