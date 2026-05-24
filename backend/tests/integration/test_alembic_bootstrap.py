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

from alembic.config import Config
from alembic.script import ScriptDirectory

from db.alembic_bootstrap import bootstrap_alembic
from db.schema import metadata

pytestmark = pytest.mark.integration


BACKEND_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


def _alembic_head() -> str:
    """The current head revision per the alembic/versions/ directory.

    Read dynamically rather than hardcoded so this test file doesn't
    need editing every time a new revision lands — the bootstrap's
    contract is "reach head", regardless of which revision is at the
    tip of the chain right now.
    """
    cfg = Config(os.path.join(BACKEND_ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_ROOT, "alembic"))
    return ScriptDirectory.from_config(cfg).get_current_head()


@pytest_asyncio.fixture
async def temp_db_engine():
    """File-backed SQLite engine in a temp dir, disposed on teardown.

    File-backed (not ``:memory:``) because Alembic's async env.py
    opens a separate engine via ``async_engine_from_config`` and
    needs a URL that resolves to the same physical database the
    test fixture's engine wrote to. An in-memory DB is unique
    per connection — Alembic's connection wouldn't see what the
    test set up.

    The fixture mutates ``core.config.config.DATABASE_URI`` IN PLACE
    rather than reloading the module. Reloading would rebind
    ``core.config.config`` to a new instance, but legacy migration
    scripts already imported (``from core.config import config``)
    retain a reference to the OLD instance — their later
    ``config.DATABASE_URI`` reads would see stale state across
    tests. Direct mutation of the same object updates every
    holder of a reference, including any cached script imports.
    """
    import shutil

    import core.config

    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")
    uri = f"sqlite+aiosqlite:///{db_path}"

    prev_uri_env = os.environ.get("DATABASE_URI")
    prev_uri_config = core.config.config.DATABASE_URI
    os.environ["DATABASE_URI"] = uri
    core.config.config.DATABASE_URI = uri

    engine = create_async_engine(uri)
    try:
        yield engine
    finally:
        await engine.dispose()
        if prev_uri_env is None:
            os.environ.pop("DATABASE_URI", None)
        else:
            os.environ["DATABASE_URI"] = prev_uri_env
        core.config.config.DATABASE_URI = prev_uri_config
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


async def test_bootstrap_on_fresh_db_stamps_at_head(temp_db_engine):
    """A fresh DB created by ``metadata.create_all`` already has
    every column the live ``db/schema.py`` declares — including
    those introduced by later Alembic revisions. The bootstrap
    probe walks REVISION_MARKERS latest-to-earliest and matches
    the most-recent revision whose marker column is present,
    which on a fresh DB is the head revision."""
    async with temp_db_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)

    assert await _alembic_version(temp_db_engine) == _alembic_head()


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

    head = _alembic_head()
    assert first_stamp == head
    assert second_stamp == head


# ─── Existing pre-Alembic DB (marker present, alembic_version absent) ───────


async def test_bootstrap_v1_baseline_db_upgrades_to_head(temp_db_engine):
    """A DB at v1.0 baseline (post-Alembic-bootstrap merge, before
    later schema work landed) is brought forward to head by
    ``alembic upgrade head`` after the probe stamps at baseline.
    Simulate by running ``create_all``, then surgically reverting
    the post-baseline columns so the schema looks like a v1.0
    install that never saw the library revision."""
    async with temp_db_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
        # Strip the indexes + columns that 0002_sgf_library_columns
        # adds, so the bootstrap's probe matches the earlier
        # client_game_id marker (stamp at baseline) and then
        # `alembic upgrade head` runs the library revision to bring
        # the schema forward. Indexes must drop first — SQLite
        # refuses DROP COLUMN while an index references the column.
        for idx in (
            "ix_game_source_user_position",
            "ix_game_source_user_created_at_id",
            "ix_game_source_user_date_id",
            "ix_game_source_user_player_white_id",
            "ix_game_source_user_player_black_id",
            "ix_game_source_user_result_id",
            "ix_game_source_user_ruleset_id",
            "ix_game_source_user_board_size_id",
        ):
            await conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))
        for col in ("created_at", "date", "result", "ruleset",
                    "board_size", "metadata_extra"):
            await conn.execute(text(f"ALTER TABLE game_source DROP COLUMN {col}"))

    # Confirm alembic_version doesn't exist yet.
    assert await _alembic_version(temp_db_engine) is None

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)

    # The bootstrap should stamp at baseline (the earlier marker)
    # and then run alembic upgrade head, landing at the library
    # revision. The end state has all six library columns back.
    assert await _alembic_version(temp_db_engine) == _alembic_head()
    async with temp_db_engine.connect() as conn:
        info = await conn.execute(text("PRAGMA table_info(game_source)"))
        cols = {row[1] for row in info.fetchall()}
        assert {"created_at", "date", "result", "ruleset",
                "board_size", "metadata_extra"} <= cols


# ─── Pre-v1.0 schema → legacy chain runs → baseline reached ─────────────────


async def test_bootstrap_brings_pre_v1_schema_forward_via_legacy_chain(
    temp_db_engine,
):
    """A DB with `game_source` but no `client_game_id` is brought
    forward to the v1.0 baseline by the bootstrap's legacy chain —
    the pre-Alembic ``scripts/migrate_*.py`` ``migrate()`` functions,
    run in dependency order. Hand-construct a representative
    pre-v1.0 ``game_source`` shape to exercise the path."""
    async with temp_db_engine.begin() as conn:
        # Drop the table create_all may have made (with the post-baseline
        # client_game_id column) so we can put a pre-v1.0 shape in its place.
        await conn.run_sync(metadata.create_all)
        await conn.execute(text("DROP TABLE IF EXISTS game_source"))
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
        # Equally rewind analysis_bundles so the create_analysis_bundles
        # leg of the chain actually exercises its work.
        await conn.execute(text("DROP TABLE IF EXISTS analysis_bundles"))

    await bootstrap_alembic(temp_db_engine, BACKEND_ROOT)

    # The bootstrap runs the legacy chain to reach v1.0 baseline,
    # then `alembic upgrade head` continues forward through every
    # Alembic revision (including the library columns). End state
    # is at head.
    assert await _alembic_version(temp_db_engine) == _alembic_head()
    async with temp_db_engine.connect() as conn:
        info = await conn.execute(text("PRAGMA table_info(game_source)"))
        cols = {row[1] for row in info.fetchall()}
        # Baseline marker (added by legacy chain) + library columns
        # (added by 0002_sgf_library_columns) both present.
        assert "client_game_id" in cols
        assert {"created_at", "date", "result", "ruleset",
                "board_size", "metadata_extra"} <= cols
        tbls = await conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_bundles'"
        ))
        assert tbls.fetchone() is not None


# ─── Regression: the shipped sample DB bootstraps cleanly ───────────────────


async def test_bootstrap_on_shipped_sample_db_reaches_head(temp_db_engine):
    """The pre-v1.0 sample under ``samples/cards.sample.db`` is the
    regression fixture for the legacy chain. Copy it over the test
    DB path and run the bootstrap; the chain should bring it
    forward to v1.0 baseline, and then ``alembic upgrade head``
    continues through every revision (including library columns)
    to land at head.

    This is the load-bearing test for the "user runs load_sample.py
    on a fresh install, restarts the backend, everything works"
    workflow. If this fails, end-users on a fresh install hit a
    wall before they get past first boot.
    """
    import shutil

    # The temp_db_engine fixture set DATABASE_URI to a file under
    # /tmp/...; copy the shipped sample there so the bootstrap reads
    # the same physical file the test's engine and Alembic's env.py
    # both point at.
    sample_path = os.path.join(BACKEND_ROOT, "samples", "cards.sample.db")
    target_path = os.environ["DATABASE_URI"].replace("sqlite+aiosqlite:///", "")
    shutil.copyfile(sample_path, target_path)

    # Re-open the engine against the file we just replaced (the
    # fixture's engine had no connection to it yet).
    await temp_db_engine.dispose()
    new_engine = create_async_engine(os.environ["DATABASE_URI"])

    try:
        # Run create_all + bootstrap (mirroring the lifespan order).
        async with new_engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        await bootstrap_alembic(new_engine, BACKEND_ROOT)

        # Sample content survived the chain.
        async with new_engine.connect() as conn:
            cards = (await conn.execute(text("SELECT COUNT(*) FROM card"))).scalar()
            game_sources = (await conn.execute(text("SELECT COUNT(*) FROM game_source"))).scalar()
            # The sample carries non-zero data; these are smoke
            # assertions (exact counts could drift if the sample is
            # refreshed for other reasons, but they should never go
            # to zero).
            assert cards > 0
            assert game_sources > 0

        # The chain reached baseline and the upgrade continued to head.
        assert await _alembic_version(new_engine) == _alembic_head()
        # Library columns landed via the upgrade post-baseline.
        async with new_engine.connect() as conn:
            info = await conn.execute(text("PRAGMA table_info(game_source)"))
            cols = {row[1] for row in info.fetchall()}
            assert {"created_at", "date", "result", "ruleset",
                    "board_size", "metadata_extra"} <= cols
    finally:
        await new_engine.dispose()
