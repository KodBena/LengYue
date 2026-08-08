"""
tests/integration/repositories/test_cards_batch_concurrency.py

Concurrent-batch race witness for `POST /cards/batch`'s transaction
boundary (transactional batch card mint, ledger rows 884/885/886).

The claim under test: two batches racing for the SAME user_id either
succeed with disjoint, gapless per-user display ordinals across both
batches combined, OR serialize cleanly (one batch's transaction
fully completes before the other's first write proceeds) — matching
whatever guarantee `repositories/display_counters.py`'s atomic
`UPDATE ... RETURNING` increment already provides for single-card
concurrent mints (see `test_display_counters_concurrency.py`, the
prior-art witness this file mirrors).

Why a batch actually forces full serialization (not just per-row
atomicity): each batch runs inside ONE open transaction
(`async with session.begin():`, mirroring the route's `async with
db.begin():`). The first `next_card_display_ordinal` call inside
that transaction acquires the `user_display_counters` row's write
lock — SQLite's whole-database writer lock stands in for Postgres's
row-level lock here (same substitution
`test_display_counters_concurrency.py` documents and justifies). A
concurrent second batch's own first counter increment blocks until
the first batch's transaction commits or rolls back, i.e. the two
batches cannot interleave their card inserts even though each batch
internally loops over several `insert_card` calls. This test pins
that: each worker's own set of assigned display_ordinals must be
CONTIGUOUS, and the two workers' contiguous blocks must not
interleave — the concrete, checkable form of "one cleanly
serialized."

Same two-real-engine harness as `test_display_counters_concurrency.py`
for the same reason: the `async_session` fixture's in-memory SQLite
uses `StaticPool`, sharing one DBAPI connection across all sessions —
which would serialize the two workers trivially and for the wrong
reason (no actual contention), making a red-then-green demonstration
meaningless. A temp-file-backed SQLite database with two independent
engines produces genuine contention.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from db.schema import card, metadata, users
from domain.auth import UserId
from domain.sgf_normalizer import SgfNormalizer
from repositories.card_repository import CardRepository
from schemas.card import BatchCardItem, GameSourceCreate
from services.card_service import CardService

pytestmark = pytest.mark.integration

ALICE = UserId(1)
N_PER_WORKER = 8  # 2 workers x 8 = 16 total mints per run.


def _make_engine(db_path: Path) -> AsyncEngine:
    return create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"timeout": 30},
    )


async def _setup_schema_and_user(db_path: Path) -> None:
    engine = _make_engine(db_path)
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
        await conn.execute(
            users.insert().values(
                id=int(ALICE), username="alice", has_password=False,
            )
        )
    await engine.dispose()


def _root_items(n: int, *, worker_offset: int) -> list[BatchCardItem]:
    """
    `n` root items with genuinely distinct canonical positions —
    NOT distinguished by an SGF comment (`C[...]`), which
    `SgfNormalizer` strips as non-essential metadata during
    canonicalization (comment-only variants collide on
    `content_hash`, which would trip the pre-existing, documented
    get-or-create-position race window instead of exercising the
    counter-atomicity claim this test targets). Each item gets a
    distinct single Black move instead, which IS part of the
    canonical game tree. `worker_offset` keeps the two concurrent
    workers' move coordinates from colliding with each other too.
    """
    items = []
    for i in range(n):
        col = chr(ord("a") + worker_offset + i)
        items.append(
            BatchCardItem(
                raw_content=f"(;FF[4]SZ[19];B[{col}a])",
                num_moves=5,
                game_metadata=GameSourceCreate(),
            )
        )
    return items


async def _run_one_batch(db_path: Path, *, worker_offset: int, n: int) -> list[int]:
    """
    Run ONE `create_cards_batch` call, in ONE transaction, against a
    fresh engine/session of this worker's own — a separate DBAPI
    connection from the sibling worker's engine, so two workers
    running via `asyncio.gather` genuinely contend at the database
    layer.
    """
    engine = _make_engine(db_path)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        async with session.begin():
            repo = CardRepository(session)
            svc = CardService(
                repository=repo,
                normalizer=SgfNormalizer(),
                read_repository=repo,
            )
            card_ids = await svc.create_cards_batch(
                _root_items(n, worker_offset=worker_offset), user_id=ALICE,
            )
    await engine.dispose()
    return card_ids


async def _display_ordinals_for(db_path: Path, card_ids: list[int]) -> list[int]:
    engine = _make_engine(db_path)
    async with engine.connect() as conn:
        result = await conn.execute(
            select(card.c.display_ordinal).where(card.c.id.in_(card_ids))
        )
        ordinals = [row[0] for row in result.all()]
    await engine.dispose()
    return ordinals


def _is_contiguous(values: list[int]) -> bool:
    s = sorted(values)
    return s == list(range(s[0], s[0] + len(s)))


async def test_two_concurrent_batches_for_same_user_serialize_cleanly(tmp_path):
    """
    Two batches of N_PER_WORKER root mints each, racing for ALICE,
    via genuinely separate DBAPI connections. Both batches succeed;
    the combined 2*N_PER_WORKER display_ordinals are exactly
    {1..2*N_PER_WORKER} (gapless, no duplicate — the same invariant
    `test_display_counters_concurrency.py` pins for single-card
    mints), AND each batch's own ordinals form one contiguous block
    (the batch-level serialization claim this file adds).
    """
    db_path = tmp_path / "cards_batch_concurrency.db"
    await _setup_schema_and_user(db_path)

    ids_a, ids_b = await asyncio.gather(
        _run_one_batch(db_path, worker_offset=0, n=N_PER_WORKER),
        _run_one_batch(db_path, worker_offset=N_PER_WORKER, n=N_PER_WORKER),
    )

    assert len(ids_a) == N_PER_WORKER
    assert len(ids_b) == N_PER_WORKER
    assert set(ids_a).isdisjoint(ids_b)

    ordinals_a = await _display_ordinals_for(db_path, ids_a)
    ordinals_b = await _display_ordinals_for(db_path, ids_b)

    combined = sorted(ordinals_a + ordinals_b)
    expected = list(range(1, 2 * N_PER_WORKER + 1))
    assert combined == expected, (
        "combined display_ordinals across both concurrent batches must "
        "be exactly {1..2N} -- a duplicate or gap means the per-user "
        "counter increment isn't atomic under batch-level concurrency"
    )

    # The batch-level serialization claim: each worker's own ordinals
    # form ONE contiguous block, never interleaved with the other
    # worker's. If batches interleaved (e.g. a: {1,3,5,7}, b: {2,4,6,8})
    # that would mean the two transactions' counter increments
    # interleaved -- i.e. the batch did NOT hold its transaction open
    # across all N inserts, which would break the rollback-atomicity
    # guarantee the whole endpoint exists for.
    assert _is_contiguous(ordinals_a), (
        f"worker 'a' ordinals not contiguous (batches interleaved): {sorted(ordinals_a)}"
    )
    assert _is_contiguous(ordinals_b), (
        f"worker 'b' ordinals not contiguous (batches interleaved): {sorted(ordinals_b)}"
    )
    # And the two contiguous blocks partition {1..2N} without overlap
    # -- one worker got the low block, the other the high block.
    assert set(ordinals_a).isdisjoint(ordinals_b)
