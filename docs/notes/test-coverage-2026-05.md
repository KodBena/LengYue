# Backend Testing Arc — Retrospective

- **Status:** Closes the long-open "test coverage uneven" rough
  edge (`docs/handoff-current.md`, retired in this same arc).
- **Genre:** Per-arc closing reflection. Peer of
  `docs/notes/reflection.md` (backend infrastructure sweep) and
  `docs/notes/release-retrospective-2026-04.md` (v1.0.0 release
  retrospective). Specific where I can be specific.
- **Date:** 2026-05-07.
- **Audience:** Future contributors, future-self returning cold,
  future audit-LLMs trying to read why the tests are shaped the
  way they are.
- **Retires when:** never. This is a closure document for the
  testing arc; future test work authors its own follow-up notes.

## What this document is

A working contributor's assessment of the testing sweep that
took the backend from `145 collected, 31 pass, 76 fail, 9 xfail,
29 errors, 1 collection ImportError` to
`442 passed, 1 skipped, 2 xfailed`, distributed across five
PRs (#167 Phase 0, two stacked PRs that closed inside the
stack, #170 Phase 3, #172 Phase 4, plus this Phase 5 docs PR).

The user invoked `/effort max` and explicitly framed this as
"an honest sweep that addresses the long-open critique that has
remained since v1.0.0." The plan was a five-phase arc, one PR
per phase, defect xfails preserved as-is.

I am the LLM contributor (Claude Opus 4.7) who carried out the
work. The project author signed off on the autonomous staging
("push + open PR per phase, continue immediately on a new
branch") after Phase 0 landed. Most decisions below were made
in the working seat under that license.

## The starting state

The pre-arc suite documented its own debt by failing loudly. The
breakdown of what broke and why:

  - **Mechanical drift from item 34a (column rename).**
    `pos_hash → content_hash`, `normalized_sgf →
    canonical_content`. Helper module and several integration
    tests still constructed rows with the old names; SQLAlchemy
    raised on every insert.
  - **Mechanical drift from item 32a (Port refactor).** Pipeline
    DSL tests built `dict[str, Any]` pipelines through a path
    that no longer existed; the executor now takes a
    `ForestQuery` and depends on Ports rather than a session.
  - **ADR-0002 fail-loud cascades.** The pipeline compile
    boundary now raises `PipelineDSLError` where it used to
    quietly accept malformed input. Tests that pinned the silent
    behaviour as `xfail-strict` flipped to XPASS, which under
    `--strict-markers` fails the suite.
  - **Item 24 user-id stamp.** The test seed helper inserted
    `game_source` rows without a `user_id`; the new NOT NULL
    constraint rejected them.

The five phases reframed each of these as an opportunity rather
than a chore: a mechanical-drift error tells you exactly which
contract changed and what shape the fix should take.

## The five phases as shipped

### Phase 0 — Foundation (PR #167)

Helpers updated, the strict-XPASS-converted-to-passing pattern
applied to nine defect markers, the `tests/fakes/` Port-shaped
fake module written from scratch (one fake per Port plus the
normalizer), `tests/CLAUDE.md` drafted as the contributor doc.

The collection-order quirk that initially looked like a real bug
(running `pytest` from the test root produced 56 failures that
did not reproduce under `pytest tests/unit/ tests/integration/`)
turned out to be a pytest-config discovery issue: `pytest.ini`
sat at `tests/pytest.ini`, but `rootdir` resolved to
`backend/`, so `asyncio_mode=auto` never loaded. Moving the
config to `backend/pytest.ini` fixed it.

### Phase 1 — Service tests with Port fakes (closed inside stack)

Five service test files, 47 tests. Issue #135's regression test
is the load-bearing example: feed `CardCreate(raw_content=...,
grading_parameter={"data": {"default_visits": 200}})` and
assert the call succeeds without `AttributeError`. The bug
itself was already closed in a prior commit; the test pins it
shut.

The Port-fake pattern proved its weight here. The service tests
construct fakes inline, drive the service against them, and
assert on the in-memory state the fake records. No SQLite, no
async fixtures, no SQL. A mocked-out version would have coupled
to the call sequence; the fakes couple to the Port contract,
which is the right contract to fix.

### Phase 2 — Adapter integration tests (closed inside stack)

Five repository test files, 61 tests. **Three real production
bugs surfaced here:**

  1. `StatsRepository.fetch_tag_usage` was leaking cross-tenant
     counts. The `LEFT OUTER JOIN` was correct; the `COUNT`
     target was wrong (`func.count(card_tag.c.card_id)` instead
     of `func.count(card.c.id)`), so a tag Bob had used showed
     up in Alice's view with Bob's count. Phase-2 privacy fix.
  2. `LineageRepository.fetch_selection` for `SiblingSelection`
     was completely broken SQL: `column("cs_ctx").c.card_source_id`
     does not produce an aliased column reference, it produces
     a syntactically valid but semantically empty FROM clause.
     The bug was unreachable in production because no caller
     used SiblingSelection; the test would have caught it the
     first time the frontend tried.
  3. `LineageRepository.fetch_selection` for `AncestorSelection`
     had an off-by-one: the recursive step projected
     `card_source.c.card_source_id` (the grandparent) where it
     should have projected `card_source.c.card_id` (the parent).
     Closed D-9 as a side effect — `SubtreeSelection` reuses the
     ancestor walk.

All three fixed in-place with regression tests pinning the
correct behaviour.

### Phase 3 — Route tests (PR #170)

Eight route test files, 78 tests, an `httpx + ASGITransport`
fixture that builds a fresh FastAPI per test, wires an in-memory
SQLite via `dependency_overrides`, and mints JWTs for the
sentinel users (`ALICE_ID = 1`, `BOB_ID = 2`). **One real
production bug surfaced here:**

  4. `api/routes/resources.py` raised `ResourceNotFoundError`
     straight through, and the docstring claimed the
     application-level handlers in `main.py` mapped it to 404.
     They did not — `main.py` registers no exception handlers,
     so a missing resource would have surfaced to the client as
     a 500. Fixed: `try/except ResourceNotFoundError →
     HTTPException(404)` at the route boundary.

### Phase 4 — Domain pure tests (PR #172)

Five domain test files, 101 tests. `core/ebisu.py` math pinned
as golden invariants (`predict_recall` probability bounds,
`update_recall_float` halflife shifts after success/failure,
`model_to_halflife` inversion property);
`domain/card.py::project_card` exercised with naive vs aware
datetimes; `domain/pipeline_dsl.py` exhaustive discriminated-
union dispatch (every Stage / Selection / OrderingKey variant
round-trips, the item-32a "filter only at top level" invariant
is carried by the type system); the `analysis_bundle_repository`
codec dispatch (`_encode` / `_decode` / `UnknownSchemeError`)
exercised standalone; `domain/normalization.py` SGF normalizer
contract (position identity is metadata-independent, hash is
SHA-256 of canonical content, malformed SGF raises ValueError).

No bugs here — the pure-domain math was solid.

### Phase 5 — Documentation rollup (this PR)

Three-tier testing posture added to `backend/CLAUDE.md` (Port
fakes for services, in-memory SQLite for adapters, ASGI
transport for routes). The "test coverage uneven" rough edge
retired from `docs/handoff-current.md`. `docs/TODO.md` updated
to mark the testing arc complete. This retro authored.

## What worked

**The Port-fake pattern.** Every service test in Phase 1 reads
the same way: construct a `FakeXRepository`, construct the
service against it, exercise the service, assert on the fake's
recorded state. There is no fixture noise, no mock-call counting,
no async wait machinery. A future service refactor that
preserves the Port contract will leave every Phase-1 test
passing.

**The strict-XPASS-converted-to-passing discipline.** Nine
defect markers got closed across the arc — D-2, D-3, D-4, D-7,
D-8, D-9 in Phase 0, three more by name in Phase 2 — without
anyone noticing they had been silently fixed in prior commits.
The discipline is mechanical: an `xfail(strict=True)` test
asserts the *post-fix* behaviour today; when the underlying
defect is fixed, the test XPASSes; under strict-markers an
XPASS fails the suite, which forces the team to convert the
xfail to a regular passing test in the same commit. The pattern
made the test suite honest about which bugs were real and which
had quietly closed.

**One PR per phase.** Five PRs is more bookkeeping than one big
PR, but each PR's diff was reviewable in one sitting. The
narrowness made it possible to spot the production bugs in
Phases 2 and 3 cleanly — they showed up as one repo / one route
diff with one regression test, not as a haystack inside a
2,000-line testing PR.

**Defect xfails preserved as-is.** D-1 (deep-chain recursion)
and D-5 (SubtreeSelection ancestor walk) ride through the arc
unchanged. They will XPASS-strict-fail when the underlying
issues are fixed, and the test suite will refuse to be green
until the team converts them. This is exactly what the
discipline is for.

## What was hard, and what to know

**Suite-level vs. file-level pytest invocations.** The
collection-order quirk in Phase 0 ate maybe 90 minutes before I
realised the `pytest.ini` was at the wrong path. The lesson: if
`pytest tests/unit/` is green and `pytest` is red on the same
files, suspect config discovery first.

**Production bugs in the SQL layer go undetected by route
tests.** The two `LineageRepository` bugs and the
`StatsRepository` cross-tenant leak only showed up because Phase
2 wrote tests against an in-memory SQLite. The route layer's
own tests (Phase 3) hit the bugs only in the resources route's
case, where the bug was at the route layer itself. The takeaway:
adapter tests are not redundant with route tests; they catch a
different category of bug. Both tiers earn their keep.

**`OAuth2PasswordRequestForm` and httpx form-encoding.** httpx
drops empty-string form values from the wire; FastAPI's `Form()`
requires the field to be present. Tests that POST `/auth/token`
with a `username` and *no* password (the passwordless-login
case) had to send a non-empty placeholder value — the server
ignores the value for passwordless accounts but the form field
must exist on the wire.

**The route-layer fixture is heavier than the rest.** The
`client` fixture builds a fresh FastAPI per test; for 78 tests
that adds maybe 5 seconds total. Worth it for isolation; not
worth optimising further until the suite passes 1,000 tests.

## What's left (honestly)

Phase 4 didn't add tests for `domain/tag_dsl.py`'s structural
adapter shape — its `TagDSLCompiler.compile` exercises SQL
construction and depends on `db.schema`. The unit test exists
already (`tests/unit/test_tag_dsl_pure.py`), but a future
refactor that moves the compiler to `repositories/` (per
`docs/notes/reflection.md`'s rough-edges section) would warrant
a fresh round of tests at the new location.

The `tests/integration/test_pipeline_e2e.py` and
`test_cte_lineage.py` files are the pre-Phase-2 generation —
they exercise the executor and the lineage repo together
through a `ForestQuery` against in-memory SQLite. They survived
the sweep with edits but were not rewritten; future work on the
executor would benefit from splitting them into pure-executor
tests (using the `FakeLineageRepository` already in place) plus
adapter tests. Left as-is for now because the existing tests
work and rewriting them adds no coverage.

The proxy submodule has its own test tree and is out of scope.

## On the LLM contributor seat

I authored the tests, fixed four production bugs, and wrote
this retro under the user's `/effort max` license. A few
observations from inside the work:

  - **The Port-fake pattern is the load-bearing test
    abstraction.** Once `tests/fakes/` was in place, every new
    service test took 10-15 minutes to write. Without it, the
    same tests would have taken 30+ minutes each because the
    decision of "what does this fake need to expose" would
    re-arise per test. Investing in `tests/fakes/` first paid
    off five times over.
  - **The "honest sweep" framing was useful.** It said: don't
    treat issue #135 as the scope; treat the long-open critique
    as the scope. That made it natural to write tests for the
    parts of the code that didn't have any (the codec dispatch,
    the Ebisu math, the SGF normalizer) rather than just the
    one service that triggered the issue.
  - **Production bugs surface as test failures the first time
    the test runs, not the tenth.** All four bugs in this arc
    showed up on the first invocation of the test that
    exercised the buggy code path. The signal-to-noise was
    high: every red test was either a test bug or a code bug,
    and almost all of them were code bugs in the right
    direction.

## Closing

The "test coverage uneven" rough edge is retired. The backend
ships 442 tests across four tiers (unit, unit-with-fakes,
integration, route), four production bugs are fixed, and the
testing posture is documented in `tests/CLAUDE.md` and
`backend/CLAUDE.md` for the next contributor.

License: Public Domain (The Unlicense)
