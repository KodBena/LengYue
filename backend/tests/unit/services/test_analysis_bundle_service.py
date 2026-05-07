"""
tests/unit/services/test_analysis_bundle_service.py

Service-level tests for ``AnalysisBundleService`` driven through
``FakeAnalysisBundleRepository``.

The service is thin: the per-bundle byte cap is enforced here
(BundleTooLargeError, route maps to 413 with
``kind="bundle_too_large"``); the per-user storage quota is
enforced inside the adapter (UserQuotaExceededError, propagated
through, route maps to 413 with ``kind="user_quota_exceeded"``).

Coverage:

  - ``upsert``: per-bundle cap enforced *before* delegating to
    the Port; the over-cap path raises ``BundleTooLargeError``
    with structured fields.
  - ``upsert``: under the cap, the call delegates and the
    summary the Port returns is what the service returns.
  - ``upsert``: ``UserQuotaExceededError`` from the Port
    propagates unchanged.
  - ``get`` / ``delete`` / ``list_summaries``: pass-throughs
    matching the Port's behaviour, including tenancy isolation.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from domain.analysis_bundle import AnalysisBundle, AnalysisBundleRecord
from domain.auth import UserId
from domain.errors import BundleTooLargeError, UserQuotaExceededError
from services.analysis_bundle_service import AnalysisBundleService
from tests.fakes import FakeAnalysisBundleRepository

pytestmark = pytest.mark.unit


ALICE = UserId(1)
BOB = UserId(2)


def _make_bundle(record_count: int = 2) -> AnalysisBundle:
    return AnalysisBundle(
        schema_version=1,
        records=[
            AnalysisBundleRecord(
                config_hash="hash-A",
                node_id=f"node-{i}",
                packet={"score": i * 0.1},
            )
            for i in range(record_count)
        ],
    )


# ─── upsert: cap enforcement ──────────────────────────────────────────────────


async def test_upsert_under_cap_delegates_and_returns_summary():
    """Under the cap: the service delegates and returns the summary."""
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=1_000_000)

    board_id = uuid4()
    bundle = _make_bundle(record_count=3)

    summary = await svc.upsert(
        board_id=board_id,
        bundle=bundle,
        request_body_bytes=500,
        user_id=ALICE,
    )

    assert summary.board_id == board_id
    assert summary.record_count == 3
    # Persisted via the Port:
    fetched = await repo.get(board_id=board_id, user_id=ALICE)
    assert fetched is not None


async def test_upsert_over_cap_raises_bundle_too_large_before_persisting():
    """
    Over the cap: BundleTooLargeError raises *before* the Port is
    called, so no bundle is written. The route projects the error
    to a 413 with structured detail body
    ``{kind: "bundle_too_large", request_bytes, cap_bytes}``.
    """
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=100)

    board_id = uuid4()
    with pytest.raises(BundleTooLargeError) as exc:
        await svc.upsert(
            board_id=board_id,
            bundle=_make_bundle(),
            request_body_bytes=200,  # > cap
            user_id=ALICE,
        )

    assert exc.value.request_bytes == 200
    assert exc.value.cap_bytes == 100
    # Nothing was written:
    assert await repo.get(board_id=board_id, user_id=ALICE) is None


async def test_upsert_at_exactly_cap_succeeds():
    """The cap is inclusive: request_body_bytes == cap_bytes is allowed."""
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=100)

    board_id = uuid4()
    summary = await svc.upsert(
        board_id=board_id,
        bundle=_make_bundle(),
        request_body_bytes=100,
        user_id=ALICE,
    )
    assert summary.board_id == board_id


async def test_upsert_propagates_user_quota_exceeded_from_repo():
    """
    Per-user storage quota is enforced inside the adapter (atomic
    with the upsert). The service propagates the error unchanged
    so the route can project the right 413 body.
    """
    repo = FakeAnalysisBundleRepository(
        user_quota_bytes=50,
        bytes_per_record=100,  # one record already exceeds the quota
    )
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000_000)

    with pytest.raises(UserQuotaExceededError) as exc:
        await svc.upsert(
            board_id=uuid4(),
            bundle=_make_bundle(record_count=1),
            request_body_bytes=10,  # under per-bundle cap
            user_id=ALICE,
        )

    assert exc.value.quota_bytes == 50
    assert exc.value.current_bytes == 100  # would-be total


# ─── get / delete / list_summaries — pass-throughs ───────────────────────────


async def test_get_returns_bundle_when_present():
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    board_id = uuid4()
    bundle = _make_bundle()
    await svc.upsert(
        board_id=board_id,
        bundle=bundle,
        request_body_bytes=100,
        user_id=ALICE,
    )

    fetched = await svc.get(board_id=board_id, user_id=ALICE)
    assert fetched is not None
    assert fetched.schema_version == 1
    assert len(fetched.records) == 2


async def test_get_returns_none_for_missing_board():
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    assert await svc.get(board_id=uuid4(), user_id=ALICE) is None


async def test_get_returns_none_for_cross_tenant_board():
    """Cross-tenant: the bundle exists but isn't visible — None on get."""
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    board_id = uuid4()
    await svc.upsert(
        board_id=board_id,
        bundle=_make_bundle(),
        request_body_bytes=100,
        user_id=ALICE,
    )

    # Bob asking for Alice's bundle gets None.
    assert await svc.get(board_id=board_id, user_id=BOB) is None


async def test_delete_is_idempotent():
    """Delete returns successfully whether or not the bundle existed."""
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    # Delete a non-existent board: no-op, no raise.
    await svc.delete(board_id=uuid4(), user_id=ALICE)

    # Delete an existing board: removes it.
    board_id = uuid4()
    await svc.upsert(
        board_id=board_id,
        bundle=_make_bundle(),
        request_body_bytes=100,
        user_id=ALICE,
    )
    await svc.delete(board_id=board_id, user_id=ALICE)
    assert await svc.get(board_id=board_id, user_id=ALICE) is None

    # Delete again: still no raise.
    await svc.delete(board_id=board_id, user_id=ALICE)


async def test_delete_cross_tenant_does_not_remove():
    """A cross-tenant delete is a no-op on the owning tenant's bundle."""
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    board_id = uuid4()
    await svc.upsert(
        board_id=board_id,
        bundle=_make_bundle(),
        request_body_bytes=100,
        user_id=ALICE,
    )

    await svc.delete(board_id=board_id, user_id=BOB)

    # Alice's bundle is still there.
    assert await svc.get(board_id=board_id, user_id=ALICE) is not None


async def test_list_summaries_returns_only_callers_bundles():
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)

    alice_a, alice_b, bobs = uuid4(), uuid4(), uuid4()
    for board, user in [(alice_a, ALICE), (alice_b, ALICE), (bobs, BOB)]:
        await svc.upsert(
            board_id=board,
            bundle=_make_bundle(),
            request_body_bytes=100,
            user_id=user,
        )

    alice_summaries = await svc.list_summaries(user_id=ALICE)
    bob_summaries = await svc.list_summaries(user_id=BOB)

    assert {s.board_id for s in alice_summaries} == {alice_a, alice_b}
    assert {s.board_id for s in bob_summaries} == {bobs}


async def test_list_summaries_empty_for_user_with_no_bundles():
    repo = FakeAnalysisBundleRepository()
    svc = AnalysisBundleService(repository=repo, bundle_max_bytes=10_000)
    assert await svc.list_summaries(user_id=ALICE) == []
