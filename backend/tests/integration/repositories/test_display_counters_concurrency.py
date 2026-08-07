"""
tests/integration/repositories/test_display_counters_concurrency.py

Concurrent-insert race witness for `repositories/display_counters.py`
(per-user-id-enumeration design, Decision 2; ledger row 417 item 2 —
named as unwitnessed by the per-user-ids-review.md fresh-context
review, scrutinized item 3: "Concurrency here is architecturally
plausible (row-level UPDATE...RETURNING) but currently unwitnessed by
any test in this diff or the existing suite").

The claim under test: `_increment`'s `UPDATE ... SET x = x + 1
RETURNING x` is atomic under concurrent callers minting for the SAME
user_id — no duplicate ordinal is ever handed out, and no ordinal is
skipped (the sequence assigned across N concurrent mints is exactly
`{1, ..., N}`).

Why the existing `async_session` fixture (`tests/integration/
conftest.py`) can't witness this: `create_async_engine("sqlite+
aiosqlite:///:memory:")` gets SQLAlchemy's `StaticPool` for in-memory
SQLite, meaning every `AsyncSession` opened from that engine shares
the SAME single DBAPI connection. Two sessions "racing" against that
setup never actually contend for a lock — they're serialized by the
shared connection object before either sees the other's context, which
would make a red-then-green demonstration meaningless (a broken,
non-atomic increment would pass too, for the wrong reason).

This file uses a **temp-file-backed SQLite database with two
independent engines** (two real DBAPI connections) instead, so the
two coroutines' `UPDATE ... RETURNING` statements genuinely contend
for the same `user_display_counters` row the way two request-handling
coroutines against a shared Postgres connection pool would. SQLite's
writer lock (not row-level like Postgres, but sufficient to prove
mutual exclusion) plus a `busy_timeout` connect arg lets a blocked
writer wait rather than fail outright — the same shape a Postgres row
lock produces under contention. A duplicate or skipped ordinal here
would mean the increment itself isn't atomic, independent of which
engine provides the lock.

Red-then-green (ADR-0021 witness-construction discipline): a
deliberately-broken read-then-write increment (`_broken_increment`,
defined in this file, never imported by production code) is exercised
first against the same concurrent harness and confirmed to produce a
duplicate — proving the harness can actually detect the defect it
claims to catch — before the real `next_card_display_ordinal` /
next_game_display_ordinal` are exercised and confirmed clean.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from db.schema import metadata, user_display_counters, users
from domain.auth import UserId
from repositories.display_counters import (
    next_card_display_ordinal,
    next_game_display_ordinal,
)

pytestmark = pytest.mark.integration

ALICE = UserId(1)
N_PER_WORKER = 15  # 2 workers x 15 = 30 total mints per run.


def _make_engine(db_path: Path) -> AsyncEngine:
    # `timeout` (seconds) maps to sqlite3's busy_timeout: a writer that
    # finds the file locked waits rather than raising `OperationalError:
    # database is locked` immediately — the SQLite analog of a Postgres
    # session blocking on a row lock rather than failing.
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


async def _broken_increment(session: AsyncSession, *, user_id: UserId) -> int:
    """
    Deliberately non-atomic stand-in for `_increment`: a SELECT
    followed by a separate UPDATE, with no single-statement RETURNING
    fusion. Two concurrent callers can both read the same "current"
    value before either writes back, producing a duplicate — the
    exact bug class the production `UPDATE ... RETURNING` pattern is
    designed to prevent. Only ever used from this test file to prove
    the harness below can detect a real race when one exists.
    """
    current = (
        await session.execute(
            select(user_display_counters.c.next_card_ordinal)
            .where(user_display_counters.c.user_id == user_id)
        )
    ).scalar_one()
    # The race window: yield control here (simulating I/O/scheduling)
    # before the write, giving a concurrent coroutine on a different
    # connection the chance to read the same `current` value.
    await asyncio.sleep(0.01)
    next_value = current + 1
    await session.execute(
        update(user_display_counters)
        .where(user_display_counters.c.user_id == user_id)
        .values(next_card_ordinal=next_value)
    )
    await session.commit()
    return next_value


async def _worker(
    db_path: Path,
    *,
    n: int,
    mint,
) -> list[int]:
    """
    Run `n` sequential mints against a fresh engine/session of this
    worker's own — a separate DBAPI connection from any sibling
    worker's engine, so two workers running via `asyncio.gather`
    genuinely contend at the database layer, not just interleave
    Python bytecode on one connection.
    """
    engine = _make_engine(db_path)
    session_factory_kwargs = {"expire_on_commit": False}
    results: list[int] = []
    async with engine.connect() as _:
        pass  # warm the connection before the timed loop (not asserted).
    from sqlalchemy.ext.asyncio import async_sessionmaker
    session_factory = async_sessionmaker(engine, **session_factory_kwargs)
    for _ in range(n):
        async with session_factory() as session:
            results.append(await mint(session, user_id=ALICE))
    await engine.dispose()
    return results


async def test_broken_increment_harness_sanity_produces_a_duplicate(tmp_path):
    """
    Red half of the red-then-green pair: the deliberately non-atomic
    `_broken_increment` DOES produce a duplicate ordinal under this
    harness's concurrency, proving the harness is capable of catching
    the defect class before trusting it to certify the real
    implementation as clean.
    """
    db_path = tmp_path / "concurrency_broken.db"
    await _setup_schema_and_user(db_path)
    # Seed the counter row so both workers race an UPDATE against an
    # existing row (the lazy-insert first-mint race is a separate,
    # already-disclosed, accepted window — see display_counters.py's
    # module docstring — not what this test targets).
    engine = _make_engine(db_path)
    async with engine.begin() as conn:
        await conn.execute(
            user_display_counters.insert().values(
                user_id=int(ALICE), next_card_ordinal=0, next_game_ordinal=0,
            )
        )
    await engine.dispose()

    results_a, results_b = await asyncio.gather(
        _worker(db_path, n=N_PER_WORKER, mint=_broken_increment),
        _worker(db_path, n=N_PER_WORKER, mint=_broken_increment),
    )
    combined = results_a + results_b
    expected = list(range(1, N_PER_WORKER * 2 + 1))
    assert sorted(combined) != expected, (
        "harness sanity check failed: the deliberately-broken "
        "increment produced no duplicate/gap under this concurrency "
        "harness, so a red-then-green demonstration against the real "
        "implementation would not be trustworthy. Either SQLite's "
        "locking absorbed the race unexpectedly, or the harness isn't "
        "actually running the two workers concurrently."
    )


async def test_concurrent_card_ordinal_mints_are_duplicate_and_gap_free(tmp_path):
    """
    Green half: the real `next_card_display_ordinal` (the production
    `UPDATE ... RETURNING` atomic increment) under the SAME concurrent
    harness that just proved it can catch a broken implementation.
    Two independently-connected workers each mint 15 ordinals for the
    same user concurrently; the combined 30 results must be exactly
    {1..30} — no duplicate, no gap.
    """
    db_path = tmp_path / "concurrency_card.db"
    await _setup_schema_and_user(db_path)
    engine = _make_engine(db_path)
    async with engine.begin() as conn:
        await conn.execute(
            user_display_counters.insert().values(
                user_id=int(ALICE), next_card_ordinal=0, next_game_ordinal=0,
            )
        )
    await engine.dispose()

    async def mint(session: AsyncSession, *, user_id: UserId) -> int:
        value = await next_card_display_ordinal(session, user_id=user_id)
        await session.commit()
        return value

    results_a, results_b = await asyncio.gather(
        _worker(db_path, n=N_PER_WORKER, mint=mint),
        _worker(db_path, n=N_PER_WORKER, mint=mint),
    )
    combined = sorted(results_a + results_b)
    expected = list(range(1, N_PER_WORKER * 2 + 1))
    assert combined == expected, (
        f"expected exactly {expected} (no duplicate, no gap) across "
        f"{N_PER_WORKER * 2} concurrent mints for one user; got {combined}"
    )


async def test_concurrent_game_ordinal_mints_are_duplicate_and_gap_free(tmp_path):
    """Same property as the card-ordinal test above, for the sibling
    `next_game_display_ordinal` counter column."""
    db_path = tmp_path / "concurrency_game.db"
    await _setup_schema_and_user(db_path)
    engine = _make_engine(db_path)
    async with engine.begin() as conn:
        await conn.execute(
            user_display_counters.insert().values(
                user_id=int(ALICE), next_card_ordinal=0, next_game_ordinal=0,
            )
        )
    await engine.dispose()

    async def mint(session: AsyncSession, *, user_id: UserId) -> int:
        value = await next_game_display_ordinal(session, user_id=user_id)
        await session.commit()
        return value

    results_a, results_b = await asyncio.gather(
        _worker(db_path, n=N_PER_WORKER, mint=mint),
        _worker(db_path, n=N_PER_WORKER, mint=mint),
    )
    combined = sorted(results_a + results_b)
    expected = list(range(1, N_PER_WORKER * 2 + 1))
    assert combined == expected, (
        f"expected exactly {expected} (no duplicate, no gap) across "
        f"{N_PER_WORKER * 2} concurrent mints for one user; got {combined}"
    )


async def test_concurrent_first_mint_lazy_upsert_serializes_without_duplicate(
    tmp_path,
):
    """
    The disclosed, accepted race window from `display_counters.py`'s
    module docstring: two concurrent FIRST mints for a brand-new user
    (no `user_display_counters` row yet) could both attempt the
    lazy-insert. Witness the documented claim directly: under real
    concurrent connections, the pair still produces two distinct
    ordinals (1 and 2) — either via the primary key serializing the
    two INSERTs (one raises IntegrityError, caught and retried as a
    plain UPDATE) or via SQLite's writer lock serializing the whole
    read-insert-update sequence outright. This test intentiononally
    does NOT assert on which of the two mechanisms fired — the module
    docstring calls the fallback path acceptable but doesn't guarantee
    which branch a given run takes; it asserts only the outward
    guarantee: no duplicate ordinal survives.
    """
    db_path = tmp_path / "concurrency_first_mint.db"
    await _setup_schema_and_user(db_path)
    # Deliberately do NOT seed a user_display_counters row — this is
    # the first-mint-ever case the lazy upsert in _increment exists
    # to handle.

    async def mint(session: AsyncSession, *, user_id: UserId) -> int:
        try:
            value = await next_card_display_ordinal(session, user_id=user_id)
            await session.commit()
            return value
        except Exception:
            # The disclosed race window: a concurrent first-INSERT
            # collision surfaces as an IntegrityError on some
            # dialect/driver combinations. A single retry after
            # rollback is the documented recovery — the counter row
            # now exists (the sibling coroutine created it), so the
            # plain UPDATE path succeeds.
            await session.rollback()
            value = await next_card_display_ordinal(session, user_id=user_id)
            await session.commit()
            return value

    results_a, results_b = await asyncio.gather(
        _worker(db_path, n=1, mint=mint),
        _worker(db_path, n=1, mint=mint),
    )
    combined = sorted(results_a + results_b)
    assert combined == [1, 2], (
        f"two concurrent first-ever mints for one user must yield two "
        f"distinct ordinals with no duplicate; got {combined}"
    )
