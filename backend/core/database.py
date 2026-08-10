"""
Database lifecycle container.

Owns the AsyncEngine and the session factory. Constructed once per
application lifetime in main.py::lifespan and attached to app.state.db
so request-scoped dependencies can reach it via request.app.state.

This replaces the previous module-level engine construction in
api/dependencies.py. The previous pattern made `from api.dependencies
import anything` a side-effecting import (it instantiated a real
connection pool against config.DATABASE_URI as a consequence of the
import statement), which is exactly what makes a codebase test-hostile.

After this refactor:
- Importing from api/dependencies has no I/O side effects.
- Tests construct a Database against an in-memory SQLite URI and
  either supply it via build_app(...) or override get_db directly.
- The engine's lifecycle is bounded by the application's lifecycle —
  dispose() runs in lifespan's finally block on shutdown.
"""
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

from sqlalchemy import event
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Ledger rows 1341-1343 (THE CONCURRENCY CONTRACT):
#
# The prior state was NOT "no busy timeout" — aiosqlite/sqlite3 default
# to journal_mode=DELETE (the classic rollback journal) plus stdlib
# sqlite3's own default 5.0s busy-wait (sqlite3.connect()'s `timeout`
# parameter, applied even with no explicit connect_args). 16 concurrent
# `PUT /documents/{key}` requests still reproduced 3x unhandled 500
# (OperationalError: database is locked) under that config. Two things
# make that consistent: (1) in rollback-journal (non-WAL) mode, the
# SELECT-then-write shape this app's upsert uses can hit a lock
# *upgrade* (shared -> reserved/exclusive) that fails immediately on
# collision without honoring the connection's busy-wait at all (the
# row-1367 mechanism — the 5.0s default only governs waiting to
# *open* a lock, not every upgrade path), and (2) DELETE-mode writers
# take an exclusive lock on the whole database file for the duration
# of a write transaction, so under real request load the actual
# contention windows exceeded what the 5.0s default absorbed even
# where it did apply. The contract below replaces that implicit,
# partially-effective default with an explicit policy: WAL (so
# readers/writers stop contending for the same whole-file lock and the
# row-1367 upgrade-failure shape no longer applies) plus a deliberate
# 30s busy timeout and synchronous=NORMAL.
#
# The fix has two independent parts, both declared here (the single home
# where every SQLite connection this application opens is constructed):
#
#   1. `connect_args={"timeout": SQLITE_BUSY_TIMEOUT_SECONDS}` — aiosqlite
#      passes `timeout` straight through to `sqlite3.connect()`, which
#      maps to `sqlite3_busy_timeout()`: a connection that finds the
#      database locked retries for up to this many seconds before
#      raising, instead of raising instantly. This is the backstop for
#      genuine write/write contention under any journal mode.
#   2. `PRAGMA journal_mode=WAL` (+ `PRAGMA synchronous=NORMAL`), set on
#      every new DBAPI connection via a pool "connect" event — WAL lets
#      readers and writers proceed concurrently (only writer/writer
#      contention remains, which part 1's timeout now absorbs instead of
#      surfacing as SQLITE_BUSY). `synchronous=NORMAL` is the documented
#      WAL pairing: WAL already guarantees consistency after a crash via
#      its own commit record, so the extra fsync `FULL` demands on every
#      transaction is unneeded overhead under WAL specifically. Without
#      this pragma pair, a burst of concurrent writers still serializes
#      one-at-a-time (SQLite has one writer at a time regardless of
#      journal mode) but does so by raising instead of waiting, which is
#      exactly the reproduction in rows 1341-1343. WAL mode, once set, is
#      persisted in the database file itself (not a per-connection
#      setting) — the "connect" event still re-issues the PRAGMA on every
#      new connection because it's a cheap no-op once already WAL and
#      makes the declaration self-contained for any db file this
#      application opens, including a fresh one on first boot.
#
# Guarded to sqlite URLs only: `create_async_engine` also serves Postgres
# in this codebase (config.DATABASE_URI is operator-overridable), and
# neither `connect_args={"timeout": ...}` nor `PRAGMA journal_mode` are
# meaningful there — Postgres's MVCC has no equivalent lock-wait knob at
# this layer, and the upsert pattern already avoids dialect-specific SQL
# per backend/CLAUDE.md's "Schema migrations" / adapter posture.
SQLITE_BUSY_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class Database:
    """
    Frozen container for an async SQLAlchemy engine + session factory.

    Constructed via Database.from_uri(...) at application startup.
    Disposed via .dispose() at application shutdown.
    """
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]

    @classmethod
    def from_uri(cls, uri: str, *, echo: bool = False) -> "Database":
        """
        Construct a Database against a SQLAlchemy URI.

        echo: passes through to create_async_engine; keep False in
            production (controlled via config.SQL_ECHO at the call site).

        For sqlite URIs, applies the concurrency contract documented in
        the module-level comment above (busy timeout + WAL journal mode)
        — see ledger rows 1341-1343. No-op for non-sqlite URIs.
        """
        is_sqlite = make_url(uri).get_backend_name() == "sqlite"

        connect_args = {}
        if is_sqlite:
            connect_args["timeout"] = SQLITE_BUSY_TIMEOUT_SECONDS

        engine = create_async_engine(uri, echo=echo, connect_args=connect_args)

        if is_sqlite:
            @event.listens_for(engine.sync_engine, "connect")
            def _set_sqlite_pragmas(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.close()

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        return cls(engine=engine, session_factory=session_factory)

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """
        Yield an AsyncSession from the factory inside an async context.
        Used by api.dependencies.get_db.
        """
        async with self.session_factory() as session:
            yield session

    async def dispose(self) -> None:
        """Close the engine's connection pool. Idempotent."""
        await self.engine.dispose()
