# CLAUDE.md — Backend tests

You are working in `backend/tests/`, the test tree for the FastAPI +
SQLAlchemy service. This note specializes the umbrella `CLAUDE.md`
and `backend/CLAUDE.md` for test-authoring work.

The backend's architectural posture (Clean / Hexagonal layering,
Ports as Protocols, Pydantic v2 with `frozen=True`, Adapters in
`repositories/`, Routers in `api/routes/`) determines how tests
compose. The test tree mirrors the layering, not the file layout.

## Reading documentation (ADR-0002 corollary)

The umbrella `CLAUDE.md` names ADR-0002 (fail loudly) as applying with
special force to documentation consumption: **the single gravest sin
against ADR-0002 is to fail to read a piece of documentation from
beginning to end, and then make any statement that references any part
within it, no matter how small.** Failing loudly means the user is
never in the dark about whether the collaborator has actually seen the
document. Documentation must never be consumed partially.

The local form for backend test-authoring: this file, the umbrella
`CLAUDE.md`, `backend/CLAUDE.md`, `repositories/ports.py` when fakes
are in scope, the existing fakes under `tests/fakes/` when extending
or mirroring them, the closing-reflection note
`docs/notes/test-coverage-2026-05.md`, and any cited fixture or helper
file are read end to end before authoring — not skimmed for keywords,
not relied on through search-result fragments. If reading is deferred
for a budget reason, say so audibly — name what was read and what was
skipped — and ask the user how to proceed. Bluffing a citation is the
failure mode the umbrella section is shaped to prevent.

## Tier structure

Three tiers, each with a different boundary:

1. **Unit (`tests/unit/`).** Pure Python, no I/O, no async unless
   the code under test is itself async. Tests in this tier exercise
   one module against pre-loaded inputs and assert on its outputs.
   Markers: `pytestmark = pytest.mark.unit`.

   Examples:
   - `test_graph_algorithms.py` — `compute_structural_coords` over
     hand-built `CardNode` lists.
   - `test_tag_dsl_pure.py` — `TagDSLCompiler` parser, DNF
     expansion, error paths.

2. **Integration (`tests/integration/`).** Requires an in-memory
   SQLite session via the `seeded_session` fixture (or `async_session`
   for raw seeding). Exercises one adapter at a time, or the
   composition of an adapter and the executor / service that
   depends on it. Markers: `pytestmark = pytest.mark.integration`.

   Examples:
   - `test_cte_lineage.py` — `LineageRepository.fetch_lineage`
     against a seeded tree.
   - `test_pipeline_e2e.py` — `PipelineExecutor` driven through
     `ForestQuery` against the in-memory database.

3. **Service unit tests with Port fakes (`tests/unit/services/`).**
   *Phase 1 of the testing arc.* Pure Python — drives a service
   class against `tests/fakes/` implementations of its Port
   dependencies. No SQLite, no I/O. Verifies orchestration logic
   without verifying SQL.

4. **Route tests (`tests/integration/routes/`).** *Phase 3 of the
   testing arc.* Drives the FastAPI app via httpx + ASGITransport,
   with per-test JWT mint and per-test `get_db` override pointing
   at an in-memory engine. Verifies the wire contract: status
   codes, response shapes, the 404-not-403 invariant, the 401 /
   422 / 413 / 500 axis mappings.

The split between tier 3 and tier 4 is the same as the split
between Service / Adapter in the production code. A service test
verifies orchestration; a route test verifies the wire contract.

## The Port-fake pattern

Every Port in `repositories/ports.py` (and `domain/normalizer.py`,
`domain/resource.py`) has a corresponding fake in `tests/fakes/`.
The fakes are structural matches for the underlying `Protocol` —
construction takes no SQLAlchemy session, methods compute results
in pure Python, and tenancy filtering is honoured.

Existing fakes:

- `FakeCardRepository` — satisfies both `CardRepositoryPort` and
  `CardWriteRepositoryPort`. One class for both surfaces, mirroring
  the production `CardRepository`.
- `FakeLineageRepository` — satisfies `LineageRepositoryPort`.
  Adjacency-graph backed; `seed_tree` accepts a node-name → parent
  dict.
- `FakeTagFilterRepository` — satisfies `TagFilterRepositoryPort`.
  Pre-load `(user_id, expression) → set[card_id]`.
- `FakeStatsRepository` — satisfies `StatsRepositoryPort`. Pre-load
  per-user `TagStat` and `ForestMemberRow` lists.
- `FakeAnalysisBundleRepository` — satisfies
  `AnalysisBundleRepositoryPort`. Tracks per-user aggregate byte
  size for the atomic-quota path.
- `FakeGameLibraryRepository` — satisfies
  `GameLibraryRepositoryPort`. Tenant-scoped row store keyed by
  `(user_id, content_hash)` for dedup; `_raise_on[content_hash]`
  injects the SAVEPOINT-error path for batch-import isolation
  tests.
- `FakeStaticResourceRepository` — satisfies
  `StaticResourceRepositoryPort`. Backed by a `{name: content}`
  dict.
- `FakeNormalizer` — satisfies `PositionNormalizerPort`. Configurable
  metadata; `raises_for(content)` exercises the
  `ValueError → InvalidInputError` translation.

### Wiring a fake into a service

```python
from domain.auth import UserId
from schemas.card import CardCreate, GameSourceCreate
from services.card_service import CardService
from tests.fakes import FakeCardRepository, FakeNormalizer

async def test_create_card_root_happy_path():
    repo = FakeCardRepository()
    normalizer = FakeNormalizer()
    normalizer.set_metadata("(;FF[4])", {"white": "Alice", "black": "Bob"})

    svc = CardService(
        repository=repo,
        normalizer=normalizer,
        read_repository=repo,    # same instance for both Ports
    )

    card_id = await svc.create_card(
        CardCreate(
            raw_content="(;FF[4])",
            num_moves=10,
            grading_parameter={"data": {"default_visits": 200}},
            game_metadata=GameSourceCreate(),
            tags=["attack"],
        ),
        user_id=UserId(1),
    )

    assert card_id in repo.cards
    assert repo.tags[card_id] == ["attack"]
```

### When to add a new fake

Whenever a new Port appears in `repositories/ports.py` or
`domain/*.py`. The fake's shape mirrors the Port's contract — one
method per Protocol method, plain in-memory state. Add it to
`tests/fakes/` as a sibling of the existing modules and re-export
from `tests/fakes/__init__.py`.

If you find yourself writing `Mock()` or `AsyncMock()` for a Port,
stop — write the fake instead. Mocks couple tests to the call
sequence; fakes couple them to the Port's contract. The service's
test should pass without modification across an internal refactor
of the service that doesn't change which Port methods get called.

### When to extend an existing fake

When a new Port method appears, extend the fake to implement it.
When a new test scenario requires a behaviour the fake doesn't yet
expose (a configurable raise, a side-channel inspection method like
`tags.get(card_id)`), add the helper alongside the Port-required
methods, named with a leading underscore if it's internal-only or
with a clear name if it's a test-facing accessor.

## The `defect` xfail discipline

Tests marked `@pytest.mark.xfail(strict=True, reason="D-N: ...")`
document a real, confirmed defect with a known fix path. Three
properties:

1. **The test asserts the correct (post-fix) behaviour.** Today it
   fails — the xfail-strict mark records this as XFAIL.
2. **When the underlying defect is fixed, the test XPASSes.** With
   `strict=True`, an XPASS is treated as a *test failure* — the CI
   refuses to be green until the team converts the xfail to a
   regular passing test.
3. **The conversion is mechanical.** Remove the `@pytest.mark.xfail`
   decorator, update the docstring to explain that the fix is now
   pinned by this regression test, and the assertion stays as-is
   (it was always the post-fix expectation).

Worked examples in this codebase:

- `test_centroid_rank_is_computed_after_compute_structural_coords`
  — was xfail-strict for D-2; converted in the Phase 0 sweep when
  `domain/tree_engine.py` shipped its centroid-decomposition pass.
- `test_named_preset_bfs_order_is_handled` and friends — were
  xfail-strict for D-3 / D-4; converted when `_build_order_key_fn`
  shipped exhaustive primitive + combinator + preset coverage.
- `test_D7_definition_as_last_statement_now_raises` — was a "silent
  failure documentation" test (passed by asserting the bug); rewritten
  as a closed-defect regression once the compile boundary started
  raising loudly per ADR-0002.

The discipline is what closed nine defects across the Phase 0
sweep without anyone noticing they'd been silently fixed in
previous arcs. **Preserve the xfail-strict pattern in new tests
that document confirmed defects.**

## Fixture conventions

- `async_session` (in `tests/integration/conftest.py`) yields a
  fresh in-memory SQLite session per test, with the schema created
  via `metadata.create_all`. Each test owns its database; nothing
  persists across tests.
- `seeded_session` wraps `async_session` and pre-runs
  `TreeBuilder.setup_base()` so the user / position / game-source
  anchor rows exist. Tests that just want to seed a tree use this.
- `TreeBuilder` (in `tests/helpers.py`) seeds a tree from an
  adjacency dict. Honors the post-34a column rename and stamps
  `game_source.user_id` (item 24).

For unit tests the fixtures don't apply — construct fakes inline.

## Helpers

`tests/helpers.py`:

- `make_card(card_id, parent_id, ...)` — build a typed `Card` with
  sensible defaults. The graph-algorithm tests use it via
  `make_node`.
- `make_node(node_id, parent_id, depth, **kwargs)` — build a
  `CardNode` wrapping a fresh `Card`. The `**kwargs` thread to
  `make_card` so tests can customise alpha/beta/t/num_moves for
  ordering tests.
- `build_nodes(adjacency)`, `build_chain(length)` — bulk
  constructors for tree-shape fixtures.
- `assert_height_invariant`, `assert_size_invariant`,
  `assert_root_conservation`, `assert_heavy_path_permutation`,
  `assert_heavy_child_consecutive_rank` — algebraic invariant
  checkers reusable across topology fixtures.

## Running

From `backend/`:

```bash
pytest                              # whole suite
pytest tests/unit/                  # unit tier only
pytest tests/integration/           # integration tier only
pytest tests/integration/test_cte_lineage.py::test_fetch_lineage_full_chain
pytest -k "tag_dsl"                 # name-substring filter
pytest -m unit                      # marker filter
pytest -x --tb=long                 # stop on first failure, full traceback
```

The `pytest.ini` at the backend root pins `asyncio_mode = auto`,
the `unit` / `integration` / `defect` markers, and
`--strict-markers`. A typo in a marker name fails collection rather
than warning.

## Authoring posture

- **One assertion per concept.** A test that "happens to also
  verify" three other things is a test that fails for four reasons
  next year.
- **Failure mode first.** When testing a service, write the
  cross-tenant 404 / 403 / 422 / 413 case before the happy path.
  The happy path is what production exercises; the failure path
  is what production doesn't, so it's where regressions hide.
- **Trust the type system.** Pydantic's `frozen=True`, the
  `Protocol` declarations, the `assert_never` exhaustiveness
  checks — all do work the test doesn't need to redo. Test the
  parts the type system can't see (runtime behaviour, side
  effects, serialised wire shapes), not the parts it polices.

## Skip during onboarding

- Anything outside `backend/tests/`.
- Frontend tests (none yet exist; that's the frontend's debt).
- Proxy tests (the proxy is a submodule with its own test tree).

## Cross-references

- `backend/CLAUDE.md` — backend authoring posture (overrides this
  for any conflict).
- `backend/repositories/ports.py` — the six Port Protocols.
  Dictates the shape of `tests/fakes/`.
- `backend/services/*.py` — the use cases that consume Ports.
  Each gets a `tests/unit/services/test_<name>.py` in Phase 1.
- `backend/api/routes/*.py` — the route layer. Each gets a
  `tests/integration/routes/test_<name>_routes.py` in Phase 3.
- `docs/notes/tenancy.md` — the 404-not-403 invariant. Route
  tests pin this in practice.
