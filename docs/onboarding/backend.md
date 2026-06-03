# Onboarding — Backend

You are working in `backend/`, a FastAPI + SQLAlchemy 2.0 service.
This note assumes you have already read the generic orientation
(`docs/onboarding/orientation.md`) and the umbrella `CLAUDE.md`.

## Read in this turn (mandatory)

1. `backend/CLAUDE.md` — the backend authoring posture (Clean /
   Hexagonal layering; Domain / Use Cases / Ports / Adapters /
   Routers; Pydantic v2 with `frozen=True` on domain models).
2. `backend/README.md` — the contributor entry point. The
   "Adopting for another domain" section is the worked example of
   how the Port architecture is intended to scale.
3. `docs/handoff-current.md`, "The backend" section — the
   architectural snapshot and the open gaps
   (`PipelineExecutor.run()` couples lineage and tag-filter; no
   row-level audit log; no tenant deletion path). The `tag_dsl.py`
   adapter-misfiling and the test-coverage gaps have **closed**
   (the tag-DSL file split + the 442-test backend arc); verify a
   "known gap" against the work-status SSOT, not this prose, if
   unsure.
4. `docs/notes/tenancy.md` — required reading before any work that
   touches a read path, the JWT, or `user_id` threading. The
   404-not-403 invariant is load-bearing.
5. `docs/notes/reflection.md` — the backend architectural retro.
   The "Rough edges" section is unusually candid.
6. Scan `docs/dispatch/` for open requests addressed to the
   backend (filenames containing `to-backend`). Surface
   unaddressed ones at the start of the session before
   implementing.

That is the onboarding turn.

## Architectural shape (one-line reminder)

The Ports declared in `repositories/ports.py` are the contracts
the inner layers depend on. Each Port returns domain entities or
DTOs (`Card`, `CardNode`, `ForestMemberRow`, etc.), never
SQLAlchemy Rows or CTEs. `domain/` has no SQLAlchemy imports on
the production path. The route file knows about FastAPI and the
Ports it depends on; it does not know about SQLAlchemy directly.
Extract a Port when a second concrete consumer appears, not
speculatively.

## ADR map (backend-relevant)

- **ADR-0002** — Fail loudly. The most consequential single
  document; five concrete rules, three documented exceptions. Why
  analysis-recording has no silent retry queue and why ACL
  boundaries validate rather than coerce.
- **ADR-0003** — Domain bands. Most backend work is Band 1
  (domain-agnostic) by design; Band 2/3 placement is deliberate.
- **ADR-0006** — Module docstring (path + purpose + license) at
  the top of every `.py` file. `__init__.py` is exempt.
- **ADR-0007** — File-size / information-density budgets; the
  density + never-compress-logic-to-fit principle applies to `.py`
  as much as to the frontend.
- **ADR-0008** — Classification discipline. Refuse fuzzy matches
  against an inadequate closed vocabulary (an enum, a
  discriminated-union tag); leave flat rather than invent a
  synthetic parent. The silent-coercion-at-protocol-boundaries
  family is its fail-loudly sibling.

ADR-0004 (minimal-touch) and ADR-0005 (documentation discipline)
bind every edit.

## Reference material (consult on demand)

- `backend/docs/tree-dsl.md` — Tree-DSL reference; required for
  any pipeline work.
- `docs/archive/notes/design/analysis-persistence-plan.md` — Design note for
  the analysis-persistence feature, which **shipped** (the note is
  archived as its planning record, ADR-0005 Rule 9).
- `docs/archive/notes/card-tree-backend-spec.md` — Backend capability spec
  for the card-tree widget.
- `docs/archive/notes/qEUBO.md` — Successor-session map for qEUBO work.
- `docs/work-status.json` — the work-status SSOT (query via
  `tools/work-status/sql.mjs`); `docs/TODO.md` is its thin human
  index. The tenancy spine **shipped end-to-end** and the
  de-branding / wire-rename work (items 34 / 34a / 34b) closed —
  both were "next major milestone" framing that is now historical.
- `backend/scripts/` — Hand-rolled migration scripts. One-shot,
  idempotent, dialect-aware (SQLite + Postgres). No Alembic.
- `docs/worklog/` — Per-PR records for the current cycle; useful
  when the task description references a specific shipped change.
  Prior-cycle entries live under `docs/archive/worklog/<cycle>/`.

## Skip during onboarding

- Anything frontend-internal beyond the wire contract.
- Anything proxy-internal.
- `docs/archive/`, `docs/playbooks/monorepo/`, `docs/rfcs/`,
  `docs/notes/auditor-notes.md`, `audit-reflections.md`,
  `decisions-deferred.md`,
  `docs/notes/design/doc-graph-discipline-plan.md`,
  `docs/notes/vestige/deferred-items/` (the dissolved ledger).

## Output discipline

For substantive backend changes, structure the response as:
roadmap (naming the architectural location: Domain / Use Case /
Adapter / Router) → contracts (the Ports the change requires or
modifies) → logic (pure use case implementation depending only on
Ports) → infrastructure (concrete Adapter implementation) →
wiring (FastAPI route gluing use case to adapter via `Depends`).
For trivial fixes, skip the structure and make the change.

`pytest` runs the test suite (DSL and graph algorithms; light
coverage). Schema is created on first run via SQLAlchemy's
`metadata.create_all`; existing installs use the migration scripts
in `backend/scripts/`.

## Cross-team

The OpenAPI schema (auto-generated by FastAPI from the route
definitions and Pydantic schemas) is the cross-team contract. The
frontend regenerates `src/types/backend.ts` from it via
`npm run gen:api`. Wire-shape changes appear in the OpenAPI diff;
treat that diff as load-bearing. Field-rename or schema-breaking
changes coordinate through a dispatch
(`docs/dispatch/backend-to-frontend-*.md`), not a unilateral
deploy.
