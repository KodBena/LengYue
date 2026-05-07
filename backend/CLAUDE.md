# CLAUDE.md — Backend (FastAPI + SQLAlchemy)

You are working in the `backend/` sub-project of LengYue. This file
specializes the umbrella `CLAUDE.md` for Python + FastAPI work; the
umbrella file's principles apply here without restatement.

You bring the perspective of a principal architect with a Haskell and
formal-methods background, applied to Python. The vocabulary that
follows — Ports as Protocols, Adapters as concrete implementations,
the Functional Core surrounded by an Imperative Shell — is the
project's working language.

## Architectural shape

Clean / Hexagonal layering, with the Dependency Rule enforced by
convention (inner layers do not import from outer layers):

- **Domain** (`backend/domain/*`) — pure Python. Entities, value
  objects, domain logic. No FastAPI imports, no SQLAlchemy imports,
  no I/O. Pydantic v2 with `frozen=True` for value objects.
- **Use cases / Services** (`backend/services/*`) — orchestration of
  domain logic. Pure where possible. Depends on Ports (Protocols),
  not on concrete adapters.
- **Ports** — Python `Protocol` classes defining the interfaces the
  use cases need. The contract; the Haskell typeclass analog.
- **Adapters** (`backend/repositories/*`, `backend/infrastructure/*`)
  — concrete implementations of Ports. SQLAlchemy lives here, never
  in the domain or in use cases.
- **Routers** (`backend/api/routes/*`) — FastAPI as a delivery
  mechanism. HTTP concerns only: parameter parsing, status codes,
  serialization. Use `Depends` for DI to wire adapters into use
  cases at the request edge.

The route file is allowed to know about FastAPI, Pydantic request /
response schemas, and the Port interfaces it depends on. It is not
allowed to know about SQLAlchemy directly — that's an Adapter
concern. The exception is genuinely simple endpoints that read a
single table for a single field set; ADR-0003 documents the Band 1
case where direct `users` access in `api/routes/auth.py` is
appropriate (see `docs/dispatch/backend-to-frontend-auth-me-status.md`
for the worked example, where no `UserRepositoryPort` was extracted
because no second consumer exists).

The principle: extract a Port when a second concrete consumer
appears, not speculatively.

## Type-driven design

Use the type system as a specification:

- **Pydantic v2 with `frozen=True`** for domain models. Immutability
  by default; mutation goes through explicit construction of a new
  instance.
- **Discriminated unions** (`Literal` + `Union`) for state shapes
  with multiple modes. The Pydantic discriminator field is the
  runtime witness.
- **`Optional` for genuine optionality**. Never `Optional` as a
  workaround for "I don't know what to put here."
- **Result types or specific domain errors** over raw exceptions
  where the failure is part of the domain (a card not found, a
  schedule violation). Raw exceptions are appropriate for genuine
  invariant violations — the things ADR-0002 says should fail loudly.
- **Type aliases for domain identifiers** (`UserId = int`,
  `CardId = int`) are weak in Python relative to TypeScript's
  branded types, but still worth doing for documentation and
  searchability.

ADR-0002 applied to types: a `cast()` or `# type: ignore` needs a
justification in a comment or it doesn't ship.

## Pydantic and FastAPI boundary discipline

The route file's request and response schemas are Pydantic models.
These are wire shapes — they belong with the route, not in the
domain. The auth/me dispatch is the worked example: `AuthMeResponse`
lives at the top of `api/routes/auth.py`, not in
`backend/schemas/`. A dedicated `schemas/auth.py` becomes the
natural target only when a second auth-related schema appears.

Column-projection discipline: when a query selects fields for a wire
response, select only the fields the response shape declares. A
future edit cannot accidentally widen the wire shape to include a
field the query happens to fetch but the schema doesn't claim.
`bcrypt_hash` not appearing in the `/auth/me` query is the
load-bearing example.

## Tenancy

The tenancy spine (per ADR-0003 and `docs/notes/tenancy.md`) threads
through Bands 2 and 3 of the backend. Band 1 endpoints (truly
domain-agnostic, like `/auth/me`) are tenancy-agnostic and read the
JWT directly via `get_current_user_id`. Band 2/3 work touches the
tenancy boundary and requires more care; surface this when in scope.

## Output structure

For substantive changes, structure the response as:

1. **Roadmap** — what's being changed and where, in two or three
   sentences. Name the architectural location (Domain, Use Case,
   Adapter, Router).
2. **Contracts** — the Ports (Protocols) the change requires or
   modifies. Define these before implementation.
3. **Logic** — the pure use case implementation, depending only
   on the Ports.
4. **Infrastructure** — the concrete Adapter implementation
   (SQLAlchemy queries, etc.).
5. **Wiring** — the FastAPI route that glues use case to adapter
   via `Depends`.

For trivial changes (a typo fix, a one-line bugfix), this structure
is overhead; skip it and just make the change.

## Scope boundaries

The backend's concerns end at the wire contract. How the frontend
chooses to consume an endpoint, what shape its ACL projects the
response into, is not the backend's to design. If the frontend
requests a wire-shape change, that's a dispatch decision (per the
umbrella file's dispatch protocol), not unilateral.

The OpenAPI schema (auto-generated by FastAPI from the route
definitions and Pydantic schemas) is the cross-team contract. The
frontend regenerates `src/types/backend.ts` from it via
`npm run gen:api`. Changes to wire shapes are visible in OpenAPI
diff; treat that diff as load-bearing.

ADR-0003's bands are the authoring-time question for new endpoints
and use cases: Band 1 (domain-agnostic, portable to Chess/Shogi),
Band 2 (game-tree-coupled), or Band 3 (Go-bound). Most backend
work is Band 1 by design; Band 2/3 placement should be deliberate.

## Testing posture

The test tree mirrors the layering, with a different boundary at
each tier:

- **Unit (`tests/unit/`)** — pure-Python tests of one module
  against pre-loaded inputs. Domain math (`core/ebisu.py`),
  pure projections (`domain/card.py`), discriminated-union
  grammars (`domain/pipeline_dsl.py`), the codec dispatch in
  `repositories/analysis_bundle_repository.py`. No I/O.
- **Service unit tests with Port fakes
  (`tests/unit/services/`)** — drives a service against
  Port-shaped fakes from `tests/fakes/`. One fake per Port,
  mirroring the production class shape; in-memory state, no
  SQLAlchemy, no async fixtures. The contract a service test
  pins is the Port contract — internal refactors that preserve
  it leave the test green.
- **Adapter integration (`tests/integration/`)** — exercises one
  adapter at a time (or an executor + adapter composition)
  against a fresh in-memory SQLite session via the
  `seeded_session` fixture. Verifies SQL behaviour the Port
  fakes deliberately don't model: WHERE-clause tenancy,
  recursive CTE shape, atomic quota checks.
- **Route tests (`tests/integration/routes/`)** — drives the
  FastAPI app via `httpx.AsyncClient(transport=ASGITransport(app))`
  with per-test JWT mint and per-test `get_db` override.
  Verifies the wire contract: status codes, response shapes,
  the 404-not-403 invariant (`docs/notes/tenancy.md`), the 401
  / 422 / 413 axis mappings.

Three contracts to honour:

1. **Trust the type system.** Pydantic `frozen=True`, the Port
   `Protocol` declarations, the discriminated-union dispatchers
   — all do work the test doesn't need to redo. Test the parts
   the type system can't see (runtime behaviour, side effects,
   serialised wire shapes), not the parts it polices.
2. **Failure mode first.** When testing a service or route,
   write the cross-tenant 404 / 422 / 413 case before the happy
   path. The happy path is what production exercises; the
   failure path is what production doesn't, so it's where
   regressions hide. The bug count from the testing arc bears
   this out: 4 bugs found (3 in adapter SQL, 1 in route error
   mapping), all in failure paths.
3. **Defect xfails are strict.** A test marked
   `@pytest.mark.xfail(strict=True, reason="D-N: ...")` asserts
   the *post-fix* behaviour. Today it's an XFAIL; when the
   underlying defect is fixed, the test XPASSes — and under
   `--strict-markers` an XPASS fails the suite. The team
   converts the xfail to a regular passing test in the same
   commit. This is the discipline that closed nine defects
   silently across the testing arc.

Working contributor doc: `tests/CLAUDE.md`. Closing reflection
on the testing arc: `docs/notes/test-coverage-2026-05.md`.
