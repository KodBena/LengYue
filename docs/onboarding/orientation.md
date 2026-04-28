# Onboarding — Orientation

Meta-orientation for the LengYue doc graph. Written for an LLM
contributor arriving cold; tells you what to read first, what is
reference material, and what is safe to skip during the onboarding
turn. The doc graph is mid-reorganization, so this note is a
temporary switchboard — it does not replace any canonical
document, only points at the ones that matter for a fresh
session. Read this, then the subproject-specific onboarding note
for the work you have been asked to do.

## What the project is

LengYue is a spaced-repetition study tool for the game of Go,
structured as a soft monorepo of three peer sub-projects:

- `frontend/` — Vue 3 + TypeScript SPA. The user-facing client.
- `backend/` — FastAPI + SQLAlchemy 2.0 service. Spaced-repetition
  core, card and tree storage, the tenancy boundary.
- `proxy/` — KataProxy, a git submodule. KataGo analysis bridge.
  Frozen at v1.0.0 until release; do not propose changes to its
  contents.

Each sub-project owns its dependencies, its build tooling, and its
own README. There is no top-level test runner and no shared
dependency manifest. Cross-team work is filed under
`docs/dispatch/`, never as a unilateral edit across boundaries.

## Read in this turn (mandatory)

In order:

1. The umbrella `CLAUDE.md` — already loaded by your harness; this
   is the project's authoring posture and overrides defaults.
2. This document — you are reading it.
3. `README.md` at the repo root — the orientation entry point.
4. `docs/adr-synopsis.md` — the condensed posture across all seven
   ADRs. Read the whole synopsis. Pull a specific ADR only when
   the synopsis points there or your task obviously touches one.
5. `docs/handoff-current.md` — the umbrella's living
   state-of-the-system note. Read the sub-project section that
   matches your task; skim the rest.
6. The subproject-specific onboarding note in this directory
   (`frontend.md` or `backend.md`).

That is the onboarding turn. Stop here unless your task obviously
calls for a specific reference document.

## Reference material (consult on demand, do not pre-read)

- `docs/adr/` — The seven ADRs in full. The synopsis covers them,
  but pull the full text on a judgement call; ADR-0002, 0004,
  0005, 0006 are the cross-cutting tenets binding contributors.
- `docs/TODO.md` — Active and queued work, sorted by implementation
  complexity. Consult when picking up an item, the task references
  item numbers, or you surface newly discovered work.
- `docs/notes/tenancy.md` — Multi-tenancy in the backend. Required
  before any backend work that touches a read path or `user_id`.
- `docs/notes/reflection.md` — Backend architectural retro; the
  "Rough edges" section is unusually candid.
- `docs/notes/` (other) — Design notes and feature specs
  (`analysis-persistence-plan.md`, `card-tree-*-spec.md`,
  `qEUBO.md`, `frontend-backlog.md`). Read only what your task
  touches.
- `docs/dispatch/` — Cross-team communication ledger. **Always**
  scan it at session start for open requests addressed to your
  sub-project. Do not silently implement against a dispatch; flag
  it, get sign-off, write a status dispatch back as part of the
  deliverable.
- `backend/docs/tree-dsl.md` — Tree-DSL reference; required for
  backend pipeline work.

## Skip during onboarding (read only if explicitly directed)

- `docs/archive/` — Pre-umbrella snapshots. Historical only;
  internal references point at paths and item numbers that no
  longer exist.
- `docs/playbooks/monorepo/` — The restructuring playbooks.
  Already executed. Useful only for understanding why the layout
  is the way it is.
- `docs/worklog/` — Per-PR worklog entries; each is a
  moment-in-time record of one shipped change. Read only when
  your task explicitly cites one.
- `docs/rfcs/` — Proposals under discussion. Not authoritative.
- `docs/notes/auditor-notes.md`, `audit-reflections.md`,
  `decisions-deferred.md`, `deferred-items.md`,
  `doc-graph-discipline-plan.md` — Working-memory and audit
  ledgers. Useful only for meta-work on the doc graph itself.

## Working posture

- **Fail loudly** (ADR-0002). Do not silently coerce, retry, or
  swallow errors.
- **Edit minimally under partial visibility** (ADR-0004). Do not
  rewrite a file you have not seen in full.
- **Documentation is part of the deliverable** (ADR-0005). A
  code-only PR with documentation implications is incomplete.
- **Per-file headers** (ADR-0006). Retrofit the standard header on
  files you touch under full visibility.
- **Ask before assuming.** If context required to do the work
  correctly is not in view, ask for it before proceeding.

Sessions are scoped to a single sub-project unless the work is
explicitly umbrella-level. Cross-boundary changes start as a
dispatch, not as direct implementation.

## Next

Read the subproject-specific onboarding note (`frontend.md` or
`backend.md`) for your task.
