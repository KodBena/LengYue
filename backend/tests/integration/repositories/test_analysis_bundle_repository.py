"""
tests/integration/repositories/test_analysis_bundle_repository.py

Adapter-level integration tests for ``AnalysisBundleRepository`` —
the codec dispatch + atomic-quota piece of the
``cross/analysis-persistence`` arc.

Three concerns sit inside the adapter that don't surface at the
service level:

  1. Codec dispatch — ``json`` and ``json+gzip`` round-trip the
     same canonical bundle. Old rows with one scheme remain
     readable after the deployment flips to a different write
     scheme.

  2. Atomic per-user quota — ``UserQuotaExceededError`` raises
     before the INSERT/UPDATE; nothing is written when the cap
     would be exceeded. The check operates on the post-transcoding
     ``byte_size``, which is what the dispatch's Confirmation C3
     pins.

  3. Tenancy — the WHERE-clause-fusion pattern collapses
     "doesn't exist" and "not yours" into 404-not-403 on get, and
     a no-op on cross-tenant delete.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from db.schema import analysis_bundles, users
from domain.analysis_bundle import (
    AnalysisBundle,
    AnalysisBundleRecord,
)
from domain.auth import UserId
from domain.errors import UnknownSchemeError, UserQuotaExceededError
from repositories.analysis_bundle_repository import AnalysisBundleRepository

pytestmark = pytest.mark.integration


ALICE = UserId(1)
BOB = UserId(2)


async def _seed_user(session: AsyncSession, *, user_id: int) -> None:
    await session.execute(
        insert(users).values(
            id=user_id, username=f"u{user_id}", has_password=False,
        )
    )


def _make_bundle(record_count: int = 2) -> AnalysisBundle:
    return AnalysisBundle(
        schema_version=1,
        records=[
            AnalysisBundleRecord(
                config_hash=f"cfg-{i}",
                node_id=f"node-{i}",
                packet={"score": i * 0.1, "winrate": 0.5},
            )
            for i in range(record_count)
        ],
    )


# ─── Codec round-trip ────────────────────────────────────────────────────────


async def test_upsert_then_get_round_trips_with_json_scheme(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    original = _make_bundle(record_count=3)

    summary = await repo.upsert(
        board_id=board, user_id=ALICE, bundle=original,
    )
    assert summary.stored_scheme == "json"

    fetched = await repo.get(board_id=board, user_id=ALICE)
    assert fetched is not None
    assert fetched.schema_version == 1
    assert len(fetched.records) == 3
    # Packets preserved byte-for-byte (modulo JSON normalisation).
    assert fetched.records[0].config_hash == "cfg-0"
    assert fetched.records[1].packet == {"score": 0.1, "winrate": 0.5}


async def test_upsert_then_get_round_trips_with_json_gzip_scheme(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json+gzip", user_quota_bytes=10**9,
    )
    board = uuid4()
    original = _make_bundle(record_count=2)

    summary = await repo.upsert(
        board_id=board, user_id=ALICE, bundle=original,
    )
    assert summary.stored_scheme == "json+gzip"
    # gzip header guarantee:
    row = (await session.execute(
        select(analysis_bundles.c.payload, analysis_bundles.c.scheme)
        .where(analysis_bundles.c.board_id == board)
    )).fetchone()
    assert row.scheme == "json+gzip"
    assert row.payload[:2] == b"\x1f\x8b"  # gzip magic.

    fetched = await repo.get(board_id=board, user_id=ALICE)
    assert fetched is not None
    assert len(fetched.records) == 2


async def test_get_decodes_existing_row_regardless_of_current_write_scheme(
    async_session,
):
    """
    A row written under ``json`` remains readable after the
    deployment flips to ``json+gzip``. The decoder picks the
    function from the stored scheme, not the current write scheme.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)

    # Write under "json" first.
    repo_json = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    await repo_json.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(),
    )

    # Now flip the write scheme on a freshly-constructed adapter
    # (same session; same row). Reads should still succeed.
    repo_gz = AnalysisBundleRepository(
        session, write_scheme="json+gzip", user_quota_bytes=10**9,
    )
    fetched = await repo_gz.get(board_id=board, user_id=ALICE)
    assert fetched is not None


async def test_get_with_unknown_scheme_raises_unknown_scheme_error(async_session):
    """
    A row whose stored scheme isn't in the dispatch table raises
    ``UnknownSchemeError`` per Confirmation C2 in the dispatch.
    The route projects this to a structured 500.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)

    # Hand-write a row with a fake scheme.
    board = uuid4()
    await session.execute(
        insert(analysis_bundles).values(
            user_id=ALICE,
            board_id=board,
            scheme="json+zstd",  # not in dispatch
            payload=b"raw bytes",
            record_count=1,
            byte_size=9,
        )
    )

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    with pytest.raises(UnknownSchemeError):
        await repo.get(board_id=board, user_id=ALICE)


# ─── Quota ─────────────────────────────────────────────────────────────────────


async def test_upsert_under_quota_succeeds(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    # Each bundle ~30 bytes when small; quota of 1 MB is comfortable.
    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=1_000_000,
    )

    for _ in range(3):
        await repo.upsert(
            board_id=uuid4(), user_id=ALICE, bundle=_make_bundle(),
        )

    summaries = await repo.list_summaries(user_id=ALICE)
    assert len(summaries) == 3


async def test_upsert_over_quota_raises_user_quota_exceeded(async_session):
    """
    Atomic per-user quota: when the would-be total exceeds the
    cap, raise BEFORE the INSERT — no row is written.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    # Quota too small for a single bundle.
    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10,
    )

    with pytest.raises(UserQuotaExceededError) as exc:
        await repo.upsert(
            board_id=uuid4(),
            user_id=ALICE,
            bundle=_make_bundle(record_count=5),
        )

    # No row was inserted on the failed quota check.
    rows = (await session.execute(
        select(analysis_bundles).where(analysis_bundles.c.user_id == ALICE)
    )).fetchall()
    assert rows == []
    assert exc.value.quota_bytes == 10


async def test_upsert_replacing_existing_row_excludes_its_byte_size_from_quota(
    async_session,
):
    """
    The atomic quota check excludes the byte_size of the row being
    replaced before adding the incoming bundle's byte_size. This
    means a user at the quota limit can replace a bundle with one
    of equal or smaller size.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )

    board = uuid4()
    await repo.upsert(
        board_id=board, user_id=ALICE,
        bundle=_make_bundle(record_count=10),
    )

    # Now tighten the quota to just above the existing row's
    # size, so a smaller replacement fits but a brand-new bundle
    # of the same size would not.
    sz = (await session.execute(
        select(analysis_bundles.c.byte_size)
        .where(analysis_bundles.c.user_id == ALICE)
    )).scalar()

    tight_repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=sz + 5,
    )

    # Replace with a smaller bundle: succeeds.
    await tight_repo.upsert(
        board_id=board, user_id=ALICE,
        bundle=_make_bundle(record_count=2),
    )

    # New bundle on a different board: fails (the tight quota
    # accommodates one full-size bundle, not two).
    with pytest.raises(UserQuotaExceededError):
        await tight_repo.upsert(
            board_id=uuid4(), user_id=ALICE,
            bundle=_make_bundle(record_count=10),
        )


# ─── Tenancy ──────────────────────────────────────────────────────────────────


async def test_get_returns_none_for_cross_tenant(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )

    board = uuid4()
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(),
    )

    # Alice can read.
    assert await repo.get(board_id=board, user_id=ALICE) is not None
    # Bob cannot — the 404-not-403 collapse.
    assert await repo.get(board_id=board, user_id=BOB) is None


async def test_delete_cross_tenant_is_no_op(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(),
    )

    # Bob deletes Alice's board: silent no-op.
    await repo.delete(board_id=board, user_id=BOB)
    # Alice's bundle still there.
    assert await repo.get(board_id=board, user_id=ALICE) is not None


async def test_delete_idempotent_for_missing_board(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    # Never inserted: still successful.
    await repo.delete(board_id=uuid4(), user_id=ALICE)


async def test_list_summaries_only_callers_bundles(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    a, b, c = uuid4(), uuid4(), uuid4()
    await repo.upsert(board_id=a, user_id=ALICE, bundle=_make_bundle())
    await repo.upsert(board_id=b, user_id=ALICE, bundle=_make_bundle())
    await repo.upsert(board_id=c, user_id=BOB, bundle=_make_bundle())

    alice = await repo.list_summaries(user_id=ALICE)
    bob = await repo.list_summaries(user_id=BOB)
    assert {s.board_id for s in alice} == {a, b}
    assert {s.board_id for s in bob} == {c}


# ─── Update path (replace existing) ───────────────────────────────────────────


async def test_upsert_replaces_existing_row_in_place(async_session):
    """A second upsert on the same (user, board) UPDATEs, not INSERTs."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(record_count=2),
    )
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(record_count=5),
    )

    # Only one row — the second upsert replaced.
    rows = (await session.execute(
        select(analysis_bundles).where(analysis_bundles.c.user_id == ALICE)
    )).fetchall()
    assert len(rows) == 1
    fetched = await repo.get(board_id=board, user_id=ALICE)
    assert fetched is not None
    assert len(fetched.records) == 5
