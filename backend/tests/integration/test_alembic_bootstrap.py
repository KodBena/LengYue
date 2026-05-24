"""
tests/integration/test_alembic_bootstrap.py

Coverage for ``db.alembic_bootstrap.bootstrap_alembic`` — the
probe-and-stamp + auto-upgrade logic that runs on backend
startup. The bootstrap is the load-bearing piece that lets
end-users pull a new release and restart the backend without
running ``scripts/migrate_*.py`` by hand; getting it wrong on
any of the three scenarios (fresh DB, existing pre-Alembic DB,
already-managed DB) breaks deployment.

Each scenario gets its own file-backed SQLite DB so the test
exercises the live Alembic config (which reads ``alembic.ini``
and expects ``DATABASE_URI`` to resolve to a real DB file —
``:memory:`` doesn't survive the cross-thread bridge Alembic
uses on async setups).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import os
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from db.alembic_bootstrap import (
    SchemaBootstrapError,
    bootstrap_alembic,
)
from db.schema import metadata

pytestmark = pytest.mark.integration


BACKEND_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


@pytest_asyncio.fixture
async def temp_db_engine():
    """File-backed SQLite engine in a temp dir, disposed on teardown.

    File-backed (not ``:memory:``) because Alembic's async env.py
    opens a separate engine via ``async_engine_from_config`` and
    needs a URL that resolves to the same physical database the
    test fixture's engine wrote to. An in-memory DB is unique
    per connection — Alembic's connection wouldn't see what the
    test set up.
    """
    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")
    uri = f"sqlite+aiosqlite:///{db_path}"

    # Override the env-resolved DATABASE_URI for this test's lifetime
    # so Alembic's env.py reads the right URL.
    prev_uri = os.environ.get("DATABASE_URI")
    os.environ["DATABASE_URI"] = uri
    # Reload core.config so it picks up the override. Pydantic settings
    # cache values at import time; the cleanest test-side reset is
    # importlib.reload on the module.
    import importlib

    import core.config

    importlib.reload(core.config)

    engine = create_async_engine(uri)
    try:
        yield engine
    finally:
        await engine.dispose()
        if prev_uri is None:
            os.environ.pop("DATABASE_URI", None)
        else:
            os.environ["DATABASE_URI"] = prev_uri
        importlib.reload(core.config)
        import shutil

        shutil.rmtree(tmpdir, ignore_errors=True)


async def _alembic_version(engine: AsyncEngine) -> str | None:
    """Read the current ``alembic_version`` row, or ``None`` if the
    table doesn't exist."""
    async with engine.connect() as conn:
        # The table may not exist; catch the OperationalError silently.
        try:
            result = await conn.execute(
                text("SELECT version_num FROM alembic_version")
            )
            row = result.fetchone()
            return row[0] if row else None
        except Exception:
            return None


# ─── Fresh DB ───────────────────────────────────────────────────────────────


async def test_bootstrap_on_fresh_db_stamps_baseline(temp_db_engine):
    """A fresh DB with the current schema (post-create_all) stamps
    at the latest revision matching the live schema state — for the
    Alembic arc PR alone, that's ``0001_baseline``."""
    async with temp_db_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)

    assert await _alembic_version(temp_db_engine) == "0001_baseline"


# ─── Already-Alembic-managed DB ─────────────────────────────────────────────


async def test_bootstrap_is_idempotent(temp_db_engine):
    """Re-running ``bootstrap_alembic`` on an already-stamped DB is
    a no-op upgrade — alembic_version unchanged, no error."""
    async with temp_db_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)
    first_stamp = await _alembic_version(temp_db_engine)

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)
    second_stamp = await _alembic_version(temp_db_engine)

    assert first_stamp == "0001_baseline"
    assert second_stamp == "0001_baseline"


# ─── Existing pre-Alembic DB (marker present, alembic_version absent) ───────


async def test_bootstrap_existing_pre_alembic_db(temp_db_engine):
    """A DB that has run the prior manual migrations (so the marker
    column is present) but never seen Alembic gets stamped at the
    matched baseline. Simulated by running ``create_all`` to seed
    the schema, then running the bootstrap fresh."""
    # create_all yields the same state an existing v1.0 install
    # would be in after the prior manual migrations were applied,
    # because schema.py here doesn't yet include any post-baseline
    # columns.
    async with temp_db_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)

    # Confirm alembic_version doesn't exist yet.
    assert await _alembic_version(temp_db_engine) is None

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)
    assert await _alembic_version(temp_db_engine) == "0001_baseline"


# ─── Ancient schema (pre-v1.0, no client_game_id) ───────────────────────────


async def test_bootstrap_refuses_pre_v1_schema(temp_db_engine):
    """A DB with a ``game_source`` table but lacking the v1.0
    baseline marker (``client_game_id``) is too old to bootstrap
    into Alembic automatically. The bootstrap raises with operator
    guidance rather than silently corrupting the DB."""
    # Hand-construct an ancient game_source table (no client_game_id).
    async with temp_db_engine.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE game_source ("
            " id INTEGER PRIMARY KEY,"
            " position_id INTEGER,"
            " user_id INTEGER NOT NULL DEFAULT 1,"
            " player_white VARCHAR,"
            " player_black VARCHAR,"
            " raw_content VARCHAR,"
            " description VARCHAR"
            ")"
        ))

    with pytest.raises(SchemaBootstrapError) as excinfo:
        await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)
    assert "pre-v1.0" in str(excinfo.value).lower() or "client_game_id" in str(excinfo.value)
