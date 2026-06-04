"""
tests/integration/routes/test_qeubo_routes.py

Route-contract tests for the qEUBO endpoints in
`api/routes/qeubo.py`. These drive the FastAPI surface over
httpx + ASGITransport with a per-test JWT, against a live
`ExperimentService` backed by Redis 6380 (mirroring `main.py`'s
lifespan construction). Failure-mode-first per `tests/CLAUDE.md`:
503-disabled, 401-unauth, 404-missing, and the submit/best state
conflicts are pinned before the happy path.

The shared routes `conftest.py` deliberately omits qEUBO (ADR-0004
minimal-touch — it must not import the heavy stack), so this module
builds its own test app: it wires `qeubo.router` and sets
`app.state.qeubo_service`. A second app with no service set exercises
the 503 path. JWT mint and the user-id sentinels are reused from the
conftest helpers (which this file does not modify).

The runtime is MIT-derivative; this test file is public domain and was
authored solely against `backend/qeubo/README.md` and the PD route file.
No source under `backend/qeubo/runtime/` (or `sanity_test.py`) was read.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

# Module-top skip guards: clean skip on a torch-less / Redis-less host.
pytest.importorskip("torch")
qeubo_pkg = pytest.importorskip("qeubo")

from qeubo import ExperimentService, ExperimentStorage  # noqa: E402

from api.routes import qeubo as qeubo_routes  # noqa: E402
from tests.integration.routes.conftest import auth_header  # noqa: E402

QEUBO_REDIS_URL = "redis://127.0.0.1:6380"


def _redis_reachable() -> bool:
    import asyncio

    async def _probe() -> bool:
        return await ExperimentStorage(QEUBO_REDIS_URL).ping()

    try:
        return asyncio.run(_probe())
    except Exception:
        return False


if not _redis_reachable():
    pytest.skip("Redis 6380 unavailable", allow_module_level=True)


pytestmark = [pytest.mark.integration, pytest.mark.qeubo]


# ─── App builders ────────────────────────────────────────────────────

# Each test gets a UNIQUE user_id so the namespaced `_eid`
# (`{user_id}:default`) is unique in the shared Redis. The id is derived
# from the low bits of a fresh uuid4; collisions across a test run are
# vanishingly unlikely and teardown deletes the experiment regardless.


def _unique_user_id() -> int:
    return uuid4().int % 1_000_000_000


def _build_qeubo_app(service) -> FastAPI:
    """A minimal app with only the qEUBO router and a service in state.

    Mirrors `main.py`: `app.state.qeubo_service` is the live service the
    dependency `get_qeubo_service` resolves. No database is wired — the
    qEUBO routes do not touch the SQL `app.state.db`.
    """
    app = FastAPI(title="qEUBO routes (test)")
    app.state.qeubo_service = service
    app.include_router(qeubo_routes.router)
    return app


def _build_disabled_app() -> FastAPI:
    """An app whose `qeubo_service` is None — the 503 path."""
    app = FastAPI(title="qEUBO disabled (test)")
    app.state.qeubo_service = None
    app.include_router(qeubo_routes.router)
    return app


@pytest_asyncio.fixture
async def shared_service() -> AsyncIterator[ExperimentService]:
    """A service / executor scoped to the test's event loop.

    `ExperimentStorage` holds a `redis.asyncio` client bound to the loop
    it first talks on. pytest-asyncio gives each test a fresh loop, so a
    module-scoped client would be closed against a stale loop. Construct
    per test; the per-user namespacing means there is no cross-test state
    to share anyway.
    """
    executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="qeubo_route_test")
    svc = ExperimentService(ExperimentStorage(QEUBO_REDIS_URL), executor)
    try:
        yield svc
    finally:
        executor.shutdown(wait=True)


@pytest_asyncio.fixture
async def enabled(shared_service) -> AsyncIterator[tuple[AsyncClient, int]]:
    """Yield (client, user_id) against the enabled app; clean up on exit.

    Teardown deletes the user's experiment directly via the service so a
    failed test still leaves the shared Redis clean. A unique user_id per
    test isolates state without per-test Redis flushes.
    """
    user_id = _unique_user_id()
    app = _build_qeubo_app(shared_service)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        try:
            yield client, user_id
        finally:
            # _eid namespacing is `{user_id}:default` per the route file.
            try:
                await shared_service.delete_experiment(f"{user_id}:default")
            except ValueError:
                pass


@pytest_asyncio.fixture
async def disabled() -> AsyncIterator[AsyncClient]:
    app = _build_disabled_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ─── Helpers ─────────────────────────────────────────────────────────

_CREATE_BODY = {
    "controlled_parameters": ["alpha", "beta"],
    "parameter_ranges": {"alpha": [0.0, 1.0], "beta": [0.0, 1.0]},
}


async def _drive_to_optimization(
    client: AsyncClient, user_id: int, num_init: int
) -> dict:
    """GET pair -> POST preference, alternating, until phase flips.

    Returns the final preference-submit JSON (the one that reports the
    flip). Answers alternate 0/1; init pairs do not consume the signal
    for acquisition, so this only seeds the GP.
    """
    last = {}
    for i in range(num_init):
        pair = await client.get(
            "/qeubo/experiment/pair", headers=auth_header(user_id)
        )
        assert pair.status_code == 200, pair.text
        submit = await client.post(
            "/qeubo/experiment/preference",
            headers=auth_header(user_id),
            json={"query_uuid": pair.json()["query_uuid"], "preferred": i % 2},
        )
        assert submit.status_code == 200, submit.text
        last = submit.json()
    return last


# ─── Failure-mode-first ──────────────────────────────────────────────


async def test_status_503_when_service_disabled(disabled: AsyncClient):
    """A backend with no `qeubo_service` returns 503, not a 5xx crash."""
    resp = await disabled.get(
        "/qeubo/experiment/status", headers=auth_header(_unique_user_id())
    )
    assert resp.status_code == 503


async def test_status_401_without_auth(enabled):
    """No Authorization header -> 401 before any service work."""
    client, _ = enabled
    resp = await client.get("/qeubo/experiment/status")
    assert resp.status_code == 401


async def test_status_404_when_no_experiment(enabled):
    client, user_id = enabled
    resp = await client.get(
        "/qeubo/experiment/status", headers=auth_header(user_id)
    )
    assert resp.status_code == 404


async def test_pair_404_when_no_experiment(enabled):
    client, user_id = enabled
    resp = await client.get(
        "/qeubo/experiment/pair", headers=auth_header(user_id)
    )
    assert resp.status_code == 404


async def test_preference_404_when_no_experiment(enabled):
    client, user_id = enabled
    resp = await client.post(
        "/qeubo/experiment/preference",
        headers=auth_header(user_id),
        json={"query_uuid": "nonexistent", "preferred": 0},
    )
    assert resp.status_code == 404


async def test_best_404_when_no_experiment(enabled):
    client, user_id = enabled
    resp = await client.get(
        "/qeubo/experiment/best", headers=auth_header(user_id)
    )
    assert resp.status_code == 404


async def test_delete_404_when_no_experiment(enabled):
    client, user_id = enabled
    resp = await client.request(
        "DELETE", "/qeubo/experiment", headers=auth_header(user_id)
    )
    assert resp.status_code == 404


async def test_preference_409_on_mismatched_query_uuid(enabled):
    """Create + fetch a pair, then submit with a wrong uuid -> 409.

    The route maps the runtime's "wrong query_uuid" ValueError to 409
    (state conflict). The valid pending pair is left unanswered; teardown
    deletes the experiment.
    """
    client, user_id = enabled
    create = await client.post(
        "/qeubo/experiment", headers=auth_header(user_id), json=_CREATE_BODY
    )
    assert create.status_code == 200, create.text
    pair = await client.get("/qeubo/experiment/pair", headers=auth_header(user_id))
    assert pair.status_code == 200, pair.text

    resp = await client.post(
        "/qeubo/experiment/preference",
        headers=auth_header(user_id),
        json={"query_uuid": "definitely-not-the-pending-uuid", "preferred": 0},
    )
    assert resp.status_code == 409


async def test_two_user_isolation(enabled, shared_service):
    """User A's experiment is invisible to user B (B sees 404).

    A second user is minted inline; A is the fixture's user. B's
    experiment id never gets created, so its status is 404 regardless of
    A's. B has no teardown obligation (it never creates state).
    """
    client, user_a = enabled
    create = await client.post(
        "/qeubo/experiment", headers=auth_header(user_a), json=_CREATE_BODY
    )
    assert create.status_code == 200, create.text

    user_b = _unique_user_id()
    resp = await client.get(
        "/qeubo/experiment/status", headers=auth_header(user_b)
    )
    assert resp.status_code == 404


# ─── Happy paths ─────────────────────────────────────────────────────


async def test_create_returns_stripped_namespace(enabled):
    """POST create: phase=='init' and `experiment_id` is namespace-stripped.

    The route strips the `{user_id}:` prefix before the wire, so the
    response should carry the suffix-only form (`default`), never the
    namespaced `{user_id}:default`.
    """
    client, user_id = enabled
    resp = await client.post(
        "/qeubo/experiment", headers=auth_header(user_id), json=_CREATE_BODY
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["phase"] == "init"
    assert body["experiment_id"] == "default"
    assert not body["experiment_id"].startswith(f"{user_id}:")


async def test_pair_init_shape(enabled):
    """GET pair after create: documented init-pair wire shape.

    query_uuid present; point_a/point_b len-2 in [0,1]; values_a/values_b
    decoded into {alpha, beta}; phase=='init'; reissued is a bool.
    """
    client, user_id = enabled
    create = await client.post(
        "/qeubo/experiment", headers=auth_header(user_id), json=_CREATE_BODY
    )
    assert create.status_code == 200, create.text

    resp = await client.get("/qeubo/experiment/pair", headers=auth_header(user_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body["query_uuid"], str) and body["query_uuid"]
    assert len(body["point_a"]) == 2
    assert len(body["point_b"]) == 2
    for component in (*body["point_a"], *body["point_b"]):
        assert 0.0 <= component <= 1.0
    assert set(body["values_a"]) == {"alpha", "beta"}
    assert set(body["values_b"]) == {"alpha", "beta"}
    assert body["phase"] == "init"
    assert isinstance(body["reissued"], bool)


async def test_submit_through_init_flips_phase(enabled):
    """Looping pair->preference flips phase init->optimization at num_init.

    dim 2 -> num_init_queries defaults to 4*dim == 8. At the flip,
    `total_responses` equals num_init_queries.
    """
    client, user_id = enabled
    create = await client.post(
        "/qeubo/experiment", headers=auth_header(user_id), json=_CREATE_BODY
    )
    assert create.status_code == 200, create.text
    num_init = create.json()["num_init_queries"]
    assert num_init == 8

    last = await _drive_to_optimization(client, user_id, num_init)
    assert last["phase"] == "optimization"
    assert last["total_responses"] == num_init

    status = await client.get(
        "/qeubo/experiment/status", headers=auth_header(user_id)
    )
    assert status.status_code == 200, status.text
    assert status.json()["phase"] == "optimization"


@pytest.mark.slow
async def test_best_409_during_init_then_200_after_fit(enabled):
    """GET best is 409 in init, 200 once optimization is reached.

    The post-flip 200 runs a real GP fit (seconds), so this is `slow`.
    The returned `point` is len-2 in [0,1] and `values` decode to the
    declared parameter names.
    """
    client, user_id = enabled
    create = await client.post(
        "/qeubo/experiment", headers=auth_header(user_id), json=_CREATE_BODY
    )
    assert create.status_code == 200, create.text
    num_init = create.json()["num_init_queries"]

    # In init, best is not yet fitted -> 409.
    early = await client.get("/qeubo/experiment/best", headers=auth_header(user_id))
    assert early.status_code == 409

    await _drive_to_optimization(client, user_id, num_init)

    resp = await client.get("/qeubo/experiment/best", headers=auth_header(user_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["point"]) == 2
    for component in body["point"]:
        assert 0.0 <= component <= 1.0
    assert set(body["values"]) == {"alpha", "beta"}
