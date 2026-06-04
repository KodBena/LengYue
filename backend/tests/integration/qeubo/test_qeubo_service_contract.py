"""
tests/integration/qeubo/test_qeubo_service_contract.py

Service-layer contract tests for `qeubo.ExperimentService`, driven
directly (no FastAPI). These pin the lifecycle contract documented in
`backend/qeubo/README.md`: the init -> optimization phase flip at
`total_responses == num_init_queries`, the idempotent pending-pair
reissue, and the posterior best-point shape. A separate slow test runs
one generous convergence trial against a synthetic L2-distance truth.

The runtime (`qeubo.ExperimentService` / `ExperimentStorage`) is
MIT-derivative; this test file is public domain and was authored solely
against the published API contract in `backend/qeubo/README.md`. No
source under `backend/qeubo/runtime/` (or `sanity_test.py`) was read.

Skip guards keep default collection clean on a torch-less machine and on
a host without Redis 6380.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio

# Module-top skip guards. The qeubo package import drags in torch /
# botorch / gpytorch; importorskip turns a missing stack into a clean
# skip rather than a collection error.
pytest.importorskip("torch")
qeubo = pytest.importorskip("qeubo")

from qeubo import ExperimentService, ExperimentStorage  # noqa: E402

QEUBO_REDIS_URL = "redis://127.0.0.1:6380"


def _redis_reachable() -> bool:
    """Synchronous readiness probe for the module-level skip.

    `ping()` is async per the README; run it on a throwaway loop so the
    decision can be made before pytest-asyncio is in play.
    """
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


@pytest_asyncio.fixture
async def service() -> AsyncIterator[ExperimentService]:
    """A live `ExperimentService` over Redis 6380 plus a 2-worker pool.

    Mirrors `main.py`'s lifespan construction. The executor is shut down
    on teardown; per-test experiment cleanup is the caller's job (each
    test uses a unique id and deletes it), so a stray id never lingers in
    the shared Redis.
    """
    executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="qeubo_test")
    svc = ExperimentService(ExperimentStorage(QEUBO_REDIS_URL), executor)
    try:
        yield svc
    finally:
        executor.shutdown(wait=True)


async def _drive_through_init(svc: ExperimentService, eid: str, num_init: int) -> int:
    """Answer init-phase pairs until the phase flips to optimization.

    Returns the `total_responses` reported at the flip. Preference is
    alternated 0/1 purely to keep the init seeding non-degenerate; during
    init the runtime ignores the signal for acquisition, so any answer
    advances the counter.
    """
    last_total = 0
    for i in range(num_init):
        pair = await svc.request_pair(eid)
        result = await svc.submit_response(eid, pair["query_uuid"], i % 2)
        last_total = result["total_responses"]
    return last_total


# ─────────────────────────────────────────────────────────────────────
# Fast contract test (normal integration tier; no `slow` mark).
# ─────────────────────────────────────────────────────────────────────


async def test_lifecycle_contract_init_to_optimization(service: ExperimentService):
    """The documented lifecycle holds end to end on a dim-2 experiment.

    Walks: create -> init loop -> phase flip at the documented count ->
    optimization iteration advance -> idempotent reissue -> best point ->
    delete -> post-delete ValueError. One pass, no model assertions about
    quality (that is the slow convergence test's job).
    """
    eid = f"test-contract-{uuid4()}"
    created = False
    try:
        # dim is derived from controlled_parameters per the README.
        create = await service.create_experiment(
            eid,
            {
                "controlled_parameters": ["alpha", "beta"],
                "parameter_ranges": {"alpha": [0.0, 1.0], "beta": [0.0, 1.0]},
            },
        )
        created = True
        assert create["experiment_id"] == eid

        status = await service.get_status(eid)
        assert status["phase"] == "init"
        # README: num_init_queries defaults to 4 * input_dim; dim 2 -> 8.
        num_init = status["num_init_queries"]
        assert num_init == 8
        assert status["config"]["input_dim"] == 2

        # Init pairs live in [0, 1]^2 and carry a uuid + phase witness.
        first_pair = await service.request_pair(eid)
        assert first_pair["phase"] == "init"
        assert len(first_pair["point_a"]) == 2
        assert len(first_pair["point_b"]) == 2
        for component in (*first_pair["point_a"], *first_pair["point_b"]):
            assert 0.0 <= component <= 1.0
        # Answer that first pair, then drive the remaining init queries.
        await service.submit_response(eid, first_pair["query_uuid"], 0)
        for i in range(1, num_init):
            pair = await service.request_pair(eid)
            result = await service.submit_response(eid, pair["query_uuid"], i % 2)

        # The flip: the last init response should land us in optimization
        # with total_responses == num_init_queries.
        assert result["total_responses"] == num_init
        flipped = await service.get_status(eid)
        assert flipped["phase"] == "optimization"

        # Optimization iteration advances as pairs are requested + answered.
        opt_pair = await service.request_pair(eid)
        assert opt_pair["phase"] == "optimization"
        iteration_before = opt_pair["iteration"]
        await service.submit_response(eid, opt_pair["query_uuid"], 0)
        next_opt_pair = await service.request_pair(eid)
        assert next_opt_pair["iteration"] > iteration_before

        # Idempotent reissue: requesting again WITHOUT answering returns
        # the same pending pair, flagged `reissued`.
        reissued = await service.request_pair(eid)
        assert reissued["reissued"] is True
        assert reissued["query_uuid"] == next_opt_pair["query_uuid"]
        # Answer it so the experiment is left in a clean (no-pending) state.
        await service.submit_response(eid, next_opt_pair["query_uuid"], 1)

        # Best point: posterior argmax in [0, 1]^2. A real GP fit runs
        # here, but this is the contract shape only — kept in the fast
        # tier because a 2-d single best-point call is sub-second-ish in
        # practice; the heavy multi-iteration work is in the slow test.
        best = await service.get_best_point(eid)
        assert len(best["best_point"]) == 2
        for component in best["best_point"]:
            assert 0.0 <= component <= 1.0

        # Delete, then confirm deletion is observable: a follow-up status
        # raises ValueError (README: delete_experiment raises on a missing
        # experiment; get_status on a now-deleted id likewise fails loudly).
        await service.delete_experiment(eid)
        created = False
        with pytest.raises(ValueError):
            await service.get_status(eid)
    finally:
        if created:
            try:
                await service.delete_experiment(eid)
            except ValueError:
                pass


# ─────────────────────────────────────────────────────────────────────
# Generous convergence test (slow tier).
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.slow
async def test_single_trial_converges_toward_target(service: ExperimentService):
    """One trial should pull the best estimate near a random target.

    Truth model: during optimization, prefer whichever point sits closer
    (smaller L2) to a fixed random target in [0, 1]^2. During init we
    answer uniformly at random rather than by the truth, to preserve the
    signal-to-noise the GP needs (init pairs are seeding, not yet
    acquisition-driven).

    The bound is deliberately generous (0.15). This is a single-trial
    smoke that the loop *moves toward* the optimum, not a benchmark of
    qEUBO's sample efficiency.
    """
    import random

    rng = random.Random(20260604)
    target = (rng.random(), rng.random())

    def l2(point) -> float:
        return math.hypot(point[0] - target[0], point[1] - target[1])

    eid = f"test-converge-{uuid4()}"
    created = False
    try:
        await service.create_experiment(
            eid,
            {
                "controlled_parameters": ["x", "y"],
                "parameter_ranges": {"x": [0.0, 1.0], "y": [0.0, 1.0]},
            },
        )
        created = True

        status = await service.get_status(eid)
        num_init = status["num_init_queries"]

        # Init phase: uniform-random preference to seed without biasing
        # the GP toward a single answer.
        await _drive_through_init_random(service, eid, num_init, rng)

        # Optimization budget: ~25 iterations, answering by the truth.
        for _ in range(25):
            pair = await service.request_pair(eid)
            if pair["phase"] != "optimization":
                # Should not happen post-flip, but stay loud if it does.
                raise AssertionError(
                    f"expected optimization phase, got {pair['phase']!r}"
                )
            preferred = 0 if l2(pair["point_a"]) <= l2(pair["point_b"]) else 1
            await service.submit_response(eid, pair["query_uuid"], preferred)

        best = await service.get_best_point(eid)
        distance = l2(best["best_point"])
        assert distance < 0.15, (
            f"best estimate {best['best_point']} is {distance:.3f} from "
            f"target {target}; expected < 0.15 after 25 optimization iters"
        )
    finally:
        if created:
            try:
                await service.delete_experiment(eid)
            except ValueError:
                pass


async def _drive_through_init_random(
    svc: ExperimentService, eid: str, num_init: int, rng
) -> None:
    """Answer all init-phase pairs with a uniform-random preference."""
    for _ in range(num_init):
        pair = await svc.request_pair(eid)
        await svc.submit_response(eid, pair["query_uuid"], rng.randint(0, 1))
