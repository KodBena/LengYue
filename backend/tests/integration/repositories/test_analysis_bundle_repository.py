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
    AnalysisBundleV2,
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


# ─── v2-brotli wire shape: round-trip + storage shape ───────────────────────


import base64


def _make_v2_bundle(*, raw_payload: bytes, record_count: int = 3,
                    uncompressed: int = 12345) -> AnalysisBundleV2:
    """Construct a V2 bundle from an arbitrary raw byte payload.
    The fixture mimics what an SPA encoder would produce: pre-
    encoded bytes (in real use: JSON-projected, quantised) carried
    in ``data_b64`` together with a descriptor and the SPA's
    size/record assertions."""
    return AnalysisBundleV2(
        wire_format="v2",
        schema_version=1,
        format_descriptor={"scheme": "ofb-q4-q8", "version": 1},
        record_count=record_count,
        uncompressed_byte_size=uncompressed,
        data_b64=base64.b64encode(raw_payload).decode("ascii"),
    )


async def test_v2_upsert_then_get_round_trips_data_b64(async_session):
    """A v2 upsert stores the brotli-wrapped raw bytes; a subsequent
    get unwraps and re-encodes to base64. The data_b64 round-trips
    bit-identically."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    raw = b"arbitrary SPA-encoded bytes " + bytes(range(256))
    in_bundle = _make_v2_bundle(raw_payload=raw)

    await repo.upsert(board_id=board, user_id=ALICE, bundle=in_bundle)
    fetched = await repo.get(board_id=board, user_id=ALICE)

    assert isinstance(fetched, AnalysisBundleV2)
    assert fetched.wire_format == "v2"
    # Raw bytes survive the brotli round-trip.
    assert base64.b64decode(fetched.data_b64) == raw


async def test_v2_upsert_preserves_format_descriptor(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    in_bundle = _make_v2_bundle(raw_payload=b"x" * 100)
    await repo.upsert(board_id=board, user_id=ALICE, bundle=in_bundle)

    fetched = await repo.get(board_id=board, user_id=ALICE)
    assert fetched.format_descriptor == {"scheme": "ofb-q4-q8", "version": 1}
    assert fetched.uncompressed_byte_size == 12345
    assert fetched.record_count == 3


async def test_v2_upsert_writes_scheme_v2_brotli_regardless_of_config(
    async_session,
):
    """The configured ``write_scheme`` only applies to v1 uploads;
    v2 uploads always land with ``scheme='v2-brotli'``."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json+gzip", user_quota_bytes=10**9,
    )
    board = uuid4()
    summary = await repo.upsert(
        board_id=board,
        user_id=ALICE,
        bundle=_make_v2_bundle(raw_payload=b"hello"),
    )
    assert summary.stored_scheme == "v2-brotli"

    row = (await session.execute(
        select(analysis_bundles.c.scheme).where(
            analysis_bundles.c.board_id == board
        )
    )).scalar_one()
    assert row == "v2-brotli"


async def test_v2_summary_carries_uncompressed_byte_size(async_session):
    """The new ``uncompressed_byte_size`` field surfaces in the
    upsert response and in list_summaries."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    summary = await repo.upsert(
        board_id=board,
        user_id=ALICE,
        bundle=_make_v2_bundle(raw_payload=b"x" * 50, uncompressed=99_999),
    )
    assert summary.uncompressed_byte_size == 99_999

    listed = await repo.list_summaries(user_id=ALICE)
    assert len(listed) == 1
    assert listed[0].uncompressed_byte_size == 99_999
    assert listed[0].format_descriptor == {"scheme": "ofb-q4-q8", "version": 1}


async def test_v1_summary_has_null_v2_fields(async_session):
    """v1 uploads leave format_descriptor + uncompressed_byte_size
    NULL — the summary surfaces None for both."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()
    summary = await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(record_count=3),
    )
    assert summary.format_descriptor is None
    assert summary.uncompressed_byte_size is None

    listed = await repo.list_summaries(user_id=ALICE)
    assert len(listed) == 1
    assert listed[0].format_descriptor is None
    assert listed[0].uncompressed_byte_size is None


async def test_v2_replacing_v1_row_transitions_columns_correctly(
    async_session,
):
    """An UPDATE that replaces a v1 row with a v2 bundle populates
    the v2 columns; the reverse case (v1 over v2) clears them."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = AnalysisBundleRepository(
        session, write_scheme="json", user_quota_bytes=10**9,
    )
    board = uuid4()

    # v1 first
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(record_count=2),
    )
    first = await repo.get(board_id=board, user_id=ALICE)
    assert isinstance(first, AnalysisBundle)

    # v2 replaces
    await repo.upsert(
        board_id=board,
        user_id=ALICE,
        bundle=_make_v2_bundle(raw_payload=b"xx", record_count=7),
    )
    second = await repo.get(board_id=board, user_id=ALICE)
    assert isinstance(second, AnalysisBundleV2)
    assert second.record_count == 7

    # v1 again clears the v2 columns
    await repo.upsert(
        board_id=board, user_id=ALICE, bundle=_make_bundle(record_count=4),
    )
    third = await repo.get(board_id=board, user_id=ALICE)
    assert isinstance(third, AnalysisBundle)
    assert len(third.records) == 4
    listed = await repo.list_summaries(user_id=ALICE)
    assert listed[0].format_descriptor is None
    assert listed[0].uncompressed_byte_size is None
