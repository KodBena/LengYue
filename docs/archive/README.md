# Archive

This directory holds documentation snapshots that captured a
specific moment and are kept for historical reference. The contents
are not maintained: references inside these files point at locations
and item numbers as they existed at the moment of capture. For
current state, see `../handoff-current.md`, `../TODO.md`, and the
ADRs in `../adr/`.

## Contents

Two layers. The top-level files are the original six artifacts (four
pre-umbrella, one v1.0.0 scope freeze, one post-v1 TODO snapshot).
Three subdirectories — `dispatch/`, `notes/`, `worklog/` — hold the
post-v1.1.0 archival sweep (2026-05-08): 120 files moved out of the
live `docs/dispatch/`, `docs/notes/`, and `docs/worklog/` trees as
their work shipped through the v1.0.0 and v1.1.0 cycles.

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

### Post-v1 TODO-completion snapshot

- **`TODO-completed-2026-05-06.md`** — snapshot of `../TODO.md`'s
  `Completed — do not act on these (reference only)` section
  (Backend / Frontend / Joint synopsis tables plus the
  `Documentation (architectural records)` reference sub-table)
  and the `Tenancy model — recorded for context` block that
  preceded it, archived 2026-05-06 to bound the size of the live
  tracker. The de-branding preservation note that scoped the
  now-archived Trivial / Small / Medium entries was moved
  alongside as an appendix. The live `../TODO.md` retains only
  Active items, Future projects, and the Implementation-order
  recommendation.

### `dispatch/` — closed cross-team coordination loops (20 files)

The post-v1.1.0 sweep moved every dispatch whose work shipped to
both ends of the loop. Two dispatches stayed in the live
`../dispatch/` tree: the proxy-to-proxy letter (id-translation
near-miss) and the post-v1.0.13 follow-up punch list, both named
in `../onboarding/proxy.md`'s mandatory pre-reads.

The archived dispatches cluster into the features they coordinated:

- **`/auth/me` endpoint** — `frontend-to-backend-auth-me.md` plus
  the backend's status reply. Shipped 2026-04-26.
- **OpenAPI title de-branding** — `backend-to-frontend-openapi-title-debrand.md`.
  Informational, no reply expected. Closed 2026-04-29.
- **Card-tree widget (release-scope item 3)** — both halves of the
  spec dispatch chain. Closed 2026-04-29 on both ends.
- **qEUBO integration** — `frontend-to-backend-qeubo-integration.md`
  plus the backend's status reply. Frontend half subsequently shipped
  through worklogs rather than a status dispatch back. Shipped
  2026-04-28.
- **Analysis persistence** — the three-file chain (frontend proposal,
  backend status, frontend status reply) for the
  `cross/analysis-persistence` arc. Shipped 2026-05-07 per
  `../notes/analysis-persistence-plan.md`.
- **Game-source dedup (`clientGameId`)** — three-file chain. Closed
  2026-05-07 on both ends.
- **Frontend → frontend session handoffs** — three handoffs
  (auth-UX-and-dirty-board, 2026-04-27, 2026-05-02). Per-session
  closing notes from named work sessions; subsequent retrospectives
  cover the same ground.
- **Default-palette metrics spec** — frontend → frontend specification
  for what shipped as v1.0.0 release-scope item 5.
- **Audit: formalize approved-plan logging** — proposed the
  `docs/worklog/` convention; the convention is now in active use
  across ~94 worklog entries (since archived to `worklog/` here),
  and the audit role's adoption is recorded in
  `../notes/auditor-notes.md`.
- **Keep-alive `SessionMiddleware`** — the three-phase frontend → proxy
  request and the proxy → frontend status. Shipped across proxy
  v1.0.7 → v1.0.11.

### `notes/` — closed-plan and audit notes (6 files)

Design notes and audit plans whose work shipped, with no live
forward-pointer remaining in the codebase that the file is the
authoritative current home for:

- **`cards-tab-merge-plan.md`** — design note for the SR/Database
  tab merge. Implemented 2026-05-06 across PRs #140-#142.
- **`forest-directory-hierarchy-redesign.md`** — design note for
  the file-manager-style nav redesign. Shipped 2026-05-06 across
  PRs #149-#154.
- **`magic-literals-audit-inventory.md`** — Pass 1 inventory for
  the magic-literals audit. Pass 2 closed 2026-05-03 across nine
  substrate PRs plus a Tier-4 inline-justification sweep.
- **`magic-literals-audit-plan.md`** — the audit's design note;
  closed 2026-05-03 alongside the inventory.
- **`resource-ownership-audit-plan.md`** — the resource-ownership
  audit; all three passes closed 2026-05-04. Forward-looking
  authoring discipline lives in `../../frontend/CLAUDE.md`'s
  "Resource ownership at mutation sites" section, not here.
- **`frontend-theming-plan.md`** — the chrome-substrate refactor
  plan. Phase A (substrate + sweep) shipped 2026-05-02; Phase B
  (cluster-12 second theme) shipped 2026-05-04. The
  "Substrate evolution (post-implementation)" section names
  conventions (decouple-via-alias, color-mix derivation) that
  `../notes/deferred-items.md`'s "Anchor role overloading"
  closed entry references for future substrate-tuning work.

### `worklog/` — per-PR records, cycle-split (94 files)

Per-PR worklog entries from the v1.0.0 and v1.1.0 release cycles,
organised by which cycle they shipped in:

- **`worklog/2026-04-pre-v1.0/`** (29 entries, 2026-04-27 through
  2026-04-30) — the locked-scope arc closing the seven v1.0.0
  release-scope items, plus the C2 / B5 / auth-lifecycle / store
  schema-versioning / de-branding / error-boundary arcs. The
  whole-cycle retrospective is
  `../notes/release-retrospective-2026-04.md`.
- **`worklog/2026-05-v1.0-to-v1.1/`** (65 entries, 2026-05-02
  through 2026-05-08) — the post-v1.0.0 to v1.1.0 cycle: the
  color-theming substrate (A-arc), the magic-literals audit, the
  resource-ownership audit, the cards-tab merge, the forest-
  directory hierarchy redesign, i18n PR1, the cross-team
  analysis-persistence arc, six proxy bumps including the v1.0.13
  structural release, and the two testing arcs (backend, frontend).
  The whole-cycle retrospective is
  `../notes/release-retrospective-2026-05.md`.

Future cycles add a new sibling subdirectory at the cycle's close
(e.g. `worklog/2026-XX-v1.1-to-vNEXT/`); the live `../worklog/`
tree resets to empty on each cycle's archival pass.

## On the naming asymmetry

The project-stamped pattern (`34b-*`) and the date-stamped pattern
(`handoff-2026-04-frontend-pre-umbrella`, `release-scope-2026-04`)
coexist deliberately at the archive's top level. The former fits the
34b project's communications because those documents already named
themselves that way internally; the latter fits state-of-system
snapshots and project-level commitment freezes that have no narrower
project anchor. The trade-off is recorded in
`../playbooks/monorepo/monorepo-plan.md` under "Backend HANDOFF
deviation."

The post-v1.1.0 sweep's subdirectories follow a different pattern:
genre-keyed at the top (`dispatch/`, `notes/`), cycle-keyed where
the volume warrants it (`worklog/2026-XX-CYCLE/`). The asymmetry is
deliberate — dispatches and design notes don't accumulate at a rate
that would benefit from cycle subdivision, while worklogs do.

## Posture toward these files

Read them for context. Do not edit them to fix references —
references inside these files reflect paths and item numbers as
they existed at the moment of each file's capture. Concretely:

- The four pre-umbrella files reflect pre-umbrella paths and
  pre-merger TODO item numbers.
- The v1.0.0 scope freeze reflects the project state on 2026-04-28.
- The post-v1.1.0 archived dispatches, notes, and worklogs reflect
  the project state at their original authoring dates; their
  references to other now-archived files were not rewritten when
  the post-v1.1.0 sweep moved them. A reference inside an archived
  dispatch pointing at `docs/dispatch/X.md` may now resolve to
  `docs/archive/dispatch/X.md`; the reader follows the path mentally
  rather than the link mechanically.

For current paths, current TODO state, and current release posture,
follow the pointers in this directory's parent `README` or in the
system-level documentation under `../`.
