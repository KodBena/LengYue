# Onboarding — Orientation

Meta-orientation for the LengYue doc graph. Written for an LLM
contributor arriving cold; tells you what to read first, what is
reference material, and what is safe to skip during the onboarding
turn. It does not replace any canonical document — it *sequences*
them, and names what to skip — over a doc graph that is now
organized and machine-inspectable: the committed doc-graph artifact
(`docs/doc-graph.{json,md}` + `docs/doc-graph-report.md`) maps the
cross-reference structure and flags stale or dangling nodes. Read
this, then the subproject-specific onboarding note for the work you
have been asked to do.

## What the project is

LengYue is a spaced-repetition study tool for the game of Go,
structured as a soft monorepo of three peer sub-projects:

- `frontend/` — Vue 3 + TypeScript SPA. The user-facing client.
- `backend/` — FastAPI + SQLAlchemy 2.0 service. Spaced-repetition
  core, card and tree storage, the tenancy boundary.
- `proxy/` — KataProxy, a git submodule. KataGo analysis bridge.
  Independently developed; the umbrella pin advances through
  separate proxy-side releases, coordinated through the
  dispatch ledger. The current pin is recorded in the umbrella
  `CLAUDE.md`.

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
4. `docs/adr-synopsis.md` — the condensed posture across all ten
   ADRs. Read the whole synopsis. Pull a specific ADR only when
   the synopsis points there or your task obviously touches one.
5. `docs/handoff-current.md` — the umbrella's living orientation
   note (architecture, integration model, pedagogy). Work-status
   now lives in the SSOT, not here. Read the sub-project section
   that matches your task; skim the rest.
6. The subproject-specific onboarding note in this directory
   (`frontend.md`, `backend.md`, or `proxy.md`).

That is the onboarding turn. Stop here unless your task obviously
calls for a specific reference document.

## Reference material (consult on demand, do not pre-read)

- `docs/adr/` — The ten ADRs in full. The synopsis covers them,
  but pull the full text on a judgement call; the tenets binding
  contributors are ADR-0002 (fail loudly), 0004 (minimal-touch),
  0005 (doc discipline), 0006 (headers), 0007 (file size), 0008
  (classification), 0009 (perf investigation), 0010 (render
  locality); 0001 and 0003 are decisions.
- the `todo` Postgres database — the work-status store: every open /
  shipped / deferred work-actionable item, with typed status,
  faceted scope/tier, labels, and structured references. Query it
  with `psql -h 192.168.122.1 -d todo` (connection facts in
  `services_local.gitignore`). This is the canonical work surface;
  `docs/TODO.md` is a thin human index over it. When you pick up or
  surface work, the item lives in the store (TODO is its projection,
  not the source).
- `docs/notes/tenancy.md` — Multi-tenancy in the backend. Required
  before any backend work that touches a read path or `user_id`.
- `docs/notes/reflection.md` — Backend architectural retro; the
  "Rough edges" section is unusually candid.
- `docs/notes/design/` — design notes (SSOT-anchored per ADR-0005
  Rule 9; each carries a `> SSOT:` pointer to its owning item).
  `docs/notes/consult/` — analytic-firewall consult records. Read
  only what your task touches.
- `docs/dispatch/` — Cross-team communication ledger. **Always**
  scan it at session start for open requests addressed to your
  sub-project. Do not silently implement against a dispatch; flag
  it, get sign-off, write a status dispatch back as part of the
  deliverable.
- `backend/docs/tree-dsl.md` — Tree-DSL reference; required for
  backend pipeline work.

## Skip during onboarding (read only if explicitly directed)

- `docs/archive/` — Historical snapshots: pre-umbrella
  cross-team communications, the v1.0.0 release-scope freeze,
  the post-v1.0 TODO snapshot, and the post-v1.1.0 archival
  sweep (closed dispatches under `archive/dispatch/`, closed-
  plan notes under `archive/notes/`, per-cycle worklog entries
  under `archive/worklog/<cycle>/`). Internal references point
  at paths as they existed at each file's capture moment; do
  not edit to fix.
- `docs/playbooks/monorepo/` — The restructuring playbooks.
  Already executed. Useful only for understanding why the layout
  is the way it is.
- `docs/worklog/` — Per-PR worklog entries for the current
  release cycle; each is a moment-in-time record of one shipped
  change. Read only when your task explicitly cites one. Prior-
  cycle entries live under `docs/archive/worklog/<cycle>/`; cited
  paths point at whichever location is current.
- `docs/rfcs/` — Proposals under discussion. Not authoritative.
- `docs/notes/auditor-notes.md`, `audit-reflections.md`,
  `decisions-deferred.md`, `docs/notes/design/doc-graph-discipline-plan.md`,
  the `docs/notes/{postmortem,audit,retrospective}/` genre taxa, and
  `docs/notes/vestige/deferred-items/` (the dissolved deferred-items
  ledger) — working-memory, audit, and historical ledgers. Useful
  only for meta-work on the doc graph itself.

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

Read the subproject-specific onboarding note (`frontend.md`,
`backend.md`, or `proxy.md`) for your task.
