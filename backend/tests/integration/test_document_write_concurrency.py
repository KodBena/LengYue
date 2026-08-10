"""
tests/integration/test_document_write_concurrency.py

Adapter-level concurrency storm for the ``documents`` table against
the REAL engine construction (``core.database.Database.from_uri``),
on a temp-FILE-backed SQLite database — not the in-memory
``tests/integration/routes/conftest.py::test_db`` fixture, whose
``StaticPool`` shares a single DBAPI connection across every session
and would therefore serialize all writes trivially, for the wrong
reason (no real lock contention to reproduce).

Ledger rows 1341-1343: the production db ran ``journal_mode=DELETE``
with no aiosqlite busy timeout, and 16 concurrent
``PUT /documents`` requests reproduced 3x unhandled 500
(``OperationalError: database is locked``). ``core/database.py::
Database.from_uri`` now declares the fix (busy timeout + WAL journal
mode) for every sqlite URI it opens — this test drives the same
write shape (the ``documents`` table's UPDATE statement, matching
``api/routes/documents.py::update_document``'s existing-row branch)
through that exact code path and pins that it no longer raises.

Why a barrier, not a bare ``asyncio.gather``: an early version of
this test drove the storm through full HTTP requests via
``asyncio.gather`` with no synchronization and found it passed
whether or not the fix was applied — the per-request work (JWT
decode, dependency resolution, the existence-check SELECT) was
enough wall-clock spread that the 16 writes' actual SQL UPDATE
statements rarely landed on SQLite's writer lock at the same instant,
so the reproduction was timing-luck, not a deterministic pin. An
``asyncio.Barrier`` removes the luck: every writer opens its own
session (and thus its own DBAPI connection, from the shared engine's
pool) ahead of time, then all release together at the barrier so
their ``UPDATE`` statements genuinely contend for SQLite's
single-writer lock at the same moment — which is exactly the shape
rows 1341-1343 diagnosed.

Scope note on "same key" concurrency: every key this test writes to
is pre-seeded with one sequential ``INSERT`` before the concurrent
burst, so every concurrent write below is an ``UPDATE`` against an
existing row. This is deliberate — ``update_document``'s
SELECT-then-conditional-INSERT existence check has its own
independent TOCTOU race under true concurrency on a BRAND NEW key
(two concurrent first-writers can both observe "no row" and both
attempt ``INSERT``, tripping the ``(key, user_id)`` UNIQUE constraint
with ``IntegrityError``, not ``OperationalError``). That's a real,
separate, pre-existing defect in the upsert's existence-check
pattern — orthogonal to the SQLITE_BUSY/journal-mode defect rows
1341-1343 describe and this fix addresses — surfaced here as a
finding, not fixed under this dispatch's fixed scope (narrow =
stop-and-report; see the GATES report). Pre-seeding isolates the
UPDATE-path lock-contention shape this test is chartered to pin.

Pre-fix reproduction (evidence for the GATES report, not re-run by
CI): with ``Database.from_uri``'s sqlite branch forced off, this
file's ``test_barrier_forced_concurrent_updates_all_succeed`` reliably
fails with several of 16 writers raising
``sqlite3.OperationalError: database is locked`` -- matching the
1341-1343 diagnosis. See the GATES report for the exact failure
output captured this way.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import insert, select, update

from core.database import Database
from db.schema import documents, metadata, users

pytestmark = pytest.mark.integration

ALICE_ID = 1
N_KEYS = 4
WRITERS_PER_KEY = 4  # 4 keys x 4 writers = 16 concurrent UPDATEs, matching
# the 1341-1343 reproduction shape: writers on the SAME (pre-seeded) key
# contend for the same row's write lock; writers across DIFFERENT keys
# still contend for SQLite's single whole-database writer lock. Neither
# shape trips the separate INSERT-path TOCTOU race documented above.


async def _setup(db: Database) -> None:
    async with db.engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
        await conn.execute(
            insert(users).values(id=ALICE_ID, username="alice", has_password=False)
        )
        for k in range(N_KEYS):
            await conn.execute(
                insert(documents).values(
                    key=f"storm_key_{k}", user_id=ALICE_ID, data={"value": -1}
                )
            )


async def _write(db: Database, *, key: str, value: int, barrier: asyncio.Barrier) -> None:
    """
    Open a fresh session (a fresh DBAPI connection out of the shared
    engine's pool -- the same per-request pattern ``api.dependencies.
    get_db`` uses), wait at the barrier so every writer's UPDATE fires
    together, then update and commit -- mirroring
    ``update_document``'s existing-row UPDATE branch exactly.
    """
    async with db.session() as session:
        await barrier.wait()
        await session.execute(
            update(documents)
            .where(documents.c.key == key)
            .where(documents.c.user_id == ALICE_ID)
            .values(data={"value": value})
        )
        await session.commit()


async def test_barrier_forced_concurrent_updates_all_succeed(tmp_path):
    """
    16 writers (4 keys x 4 writers/key), synchronized via an
    ``asyncio.Barrier`` so their ``UPDATE`` statements genuinely
    contend for SQLite's writer lock at the same instant, all succeed
    against a temp-file-backed real engine. None raise
    ``OperationalError`` (or anything else).
    """
    db_path = tmp_path / "document_write_concurrency.db"
    db = Database.from_uri(f"sqlite+aiosqlite:///{db_path}", echo=False)
    await _setup(db)

    total_writers = N_KEYS * WRITERS_PER_KEY
    barrier = asyncio.Barrier(total_writers)

    writes = [
        _write(db, key=f"storm_key_{k}", value=writer, barrier=barrier)
        for k in range(N_KEYS)
        for writer in range(WRITERS_PER_KEY)
    ]
    results = await asyncio.gather(*writes, return_exceptions=True)
    await db.dispose()

    exceptions = [r for r in results if isinstance(r, BaseException)]
    assert not exceptions, (
        f"{len(exceptions)}/{total_writers} barrier-synchronized concurrent "
        f"UPDATEs raised instead of committing cleanly: {exceptions!r} -- "
        "SQLITE_BUSY surfacing as an unhandled exception is exactly the "
        "row-1341-1343 defect"
    )


async def test_barrier_forced_concurrent_updates_persist_final_values(tmp_path):
    """
    Companion assertion: not just "no exception" but "every write that
    reported success actually persisted" -- each key ends up with
    SOME writer's value (not the -1 seed, not silently lost).
    """
    db_path = tmp_path / "document_write_concurrency_persistence.db"
    db = Database.from_uri(f"sqlite+aiosqlite:///{db_path}", echo=False)
    await _setup(db)

    total_writers = N_KEYS * WRITERS_PER_KEY
    barrier = asyncio.Barrier(total_writers)

    writes = [
        _write(db, key=f"storm_key_{k}", value=writer, barrier=barrier)
        for k in range(N_KEYS)
        for writer in range(WRITERS_PER_KEY)
    ]
    await asyncio.gather(*writes)

    async with db.session() as session:
        for k in range(N_KEYS):
            row = (
                await session.execute(
                    select(documents.c.data).where(
                        (documents.c.key == f"storm_key_{k}")
                        & (documents.c.user_id == ALICE_ID)
                    )
                )
            ).fetchone()
            assert row is not None
            assert row.data["value"] != -1, (
                f"storm_key_{k} still holds the pre-seed sentinel -- one "
                "of its concurrent writers' commits was silently lost"
            )
    await db.dispose()
