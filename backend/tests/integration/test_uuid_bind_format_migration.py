"""
tests/integration/test_uuid_bind_format_migration.py

Regression coverage for the live defect diagnosed under ledger rows
607 (Cards-tab `${gameSourceId}` macro "faceplant" on Run Pipeline)
and 613 (Lineage Explorer showing nothing for cards visible in
Browse): `alembic/versions/0005_normalize_uuid_bind_format.py`.

This test replays the ACTUAL historical mechanism rather than
asserting a symptom (ADR-0021). `db/schema.py` only describes the
CURRENT (head) schema shape, so — mirroring
`test_alembic_bootstrap.py::test_bootstrap_v1_baseline_db_upgrades_to_head`'s
precedent — the pre-`0004` state is built by running
`metadata.create_all` and then surgically stripping the columns/
indexes `0004` adds, before seeding a card and stamping
`alembic_version` at `0003`. `alembic upgrade` from there onto `0004`
runs the REAL backfill code (the one with the bug), then `0005`'s fix
on top.

The bug: `0004`'s backfill (`alembic/versions/0004_per_user_id_
enumeration.py`, "Step 2") writes the freshly minted `card.public_id`
via raw `text()` SQL with a plain `str(uuid4())` parameter, bypassing
`sa.Uuid()`'s SQLite bind processor — which every subsequent ORM
`WHERE card.c.public_id == some_uuid` comparison (including
`LineageRepository.fetch_tree_by_root`'s root-ownership check, the
exact query behind `/lineage/tree-by-root`) binds in the
dashless-hex form. The result: a card that unquestionably belongs to
the user, 404s.

File-backed (not `:memory:`) SQLite: Alembic's `env.py` opens its own
engine via the `DATABASE_URI` env var / `core.config.config`, which
needs to resolve to the same physical file this test's session writes
through.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from alembic import command
from alembic.config import Config

from db.schema import card, card_source, game_source, metadata, normalized_position, users
from domain.auth import UserId
from domain.errors import CardNotFoundError
from repositories.lineage_repository import LineageRepository

pytestmark = pytest.mark.integration

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_REVISION_WITH_BUG = "0004_per_user_id_enumeration"
_REVISION_WITH_FIX = "0005_normalize_uuid_bind_format"


def _alembic_config(uri: str) -> Config:
    cfg = Config(os.path.join(BACKEND_ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_ROOT, "alembic"))
    cfg.set_main_option("sqlalchemy.url", uri)
    return cfg


@pytest.fixture
def temp_db_uri(tmp_path):
    db_path = tmp_path / "uuid-bind-format.db"
    uri = f"sqlite+aiosqlite:///{db_path}"

    import core.config
    prev_env = os.environ.get("DATABASE_URI")
    prev_config = core.config.config.DATABASE_URI
    os.environ["DATABASE_URI"] = uri
    core.config.config.DATABASE_URI = uri
    try:
        yield uri
    finally:
        if prev_env is None:
            os.environ.pop("DATABASE_URI", None)
        else:
            os.environ["DATABASE_URI"] = prev_env
        core.config.config.DATABASE_URI = prev_config


async def _build_pre_0004_db_with_one_card(uri: str) -> int:
    """
    `metadata.create_all` (head shape) then strip exactly what `0004`
    adds — same technique `test_alembic_bootstrap.py` uses to
    simulate an older installed schema — so the subsequent seed and
    `alembic upgrade` onto `0004` exercises the real backfill loop
    against a genuinely column-less `card.public_id` / `game_source.
    display_ordinal` / `card.display_ordinal`. Returns the seeded
    card's internal id.
    """
    engine = create_async_engine(uri)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
            for idx in (
                "uniq_game_source_user_display_ordinal",
                "uniq_card_user_display_ordinal",
                "ix_card_public_id",
            ):
                await conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))
            await conn.execute(text("ALTER TABLE game_source DROP COLUMN display_ordinal"))
            await conn.execute(text("ALTER TABLE card DROP COLUMN display_ordinal"))
            await conn.execute(text("ALTER TABLE card DROP COLUMN public_id"))

            await conn.execute(insert(users).values(id=1, username="quark", has_password=False))
            pos_id = (await conn.execute(
                insert(normalized_position)
                .values(content_hash=b"\xab", canonical_content="(;FF[4]SZ[19])")
                .returning(normalized_position.c.id)
            )).scalar()
            gs_id = (await conn.execute(
                insert(game_source)
                .values(
                    position_id=pos_id, user_id=1, description="seed game",
                    client_game_id=uuid4(),
                )
                .returning(game_source.c.id)
            )).scalar()
            card_id = (await conn.execute(
                insert(card)
                .values(num_moves=5, alpha=3.0, beta=3.0, t=1.0, user_id=1)
                .returning(card.c.id)
            )).scalar()
            await conn.execute(insert(card_source).values(
                card_id=card_id, game_source_id=gs_id, is_primary_source=True,
            ))

        # Stamp at 0003 — the revision immediately before the bug —
        # so `alembic upgrade` runs 0004 (and only 0004) forward from
        # here, exercising its real backfill against the row above.
        cfg = _alembic_config(uri)
        await asyncio.to_thread(command.stamp, cfg, "0003_analysis_bundle_v2_columns")
        return card_id
    finally:
        await engine.dispose()


async def _read_public_id(uri: str, card_id: int) -> UUID:
    """Read `card.public_id` back the same way `/stats/forests` does —
    a plain typed SELECT, which decodes correctly regardless of
    whether the stored form has dashes (this is why the bug is
    invisible on the read side; it's a WHERE-clause-only defect)."""
    engine = create_async_engine(uri)
    try:
        async with engine.connect() as conn:
            row = (await conn.execute(
                text("SELECT public_id FROM card WHERE id = :cid"),
                {"cid": card_id},
            )).fetchone()
            return UUID(row[0])
    finally:
        await engine.dispose()


async def test_migration_0004_backfill_makes_tree_by_root_404_for_owned_card(temp_db_uri):
    """
    RED, pre-fix: reproduces the live defect exactly. `0004`'s own
    backfill mints and stores `card.public_id` for the seeded card;
    `LineageRepository.fetch_tree_by_root` — the adapter method behind
    `/lineage/tree-by-root` — then can't find it, even though the
    card indisputably belongs to `user_id=1` and is a genuine
    game-source root. This is the exact `CardNotFoundError` / 404
    "root card ... not found for this user" the maintainer hit
    (ledger row 607) and the sibling report (ledger row 613).
    """
    card_id = await _build_pre_0004_db_with_one_card(temp_db_uri)
    cfg = _alembic_config(temp_db_uri)

    # This is the buggy backfill running for real.
    await asyncio.to_thread(command.upgrade, cfg, _REVISION_WITH_BUG)

    public_id = await _read_public_id(temp_db_uri, card_id)

    engine = create_async_engine(temp_db_uri)
    try:
        async with AsyncSession(engine) as session:
            repo = LineageRepository(session)
            with pytest.raises(CardNotFoundError):
                await repo.fetch_tree_by_root(public_id, user_id=UserId(1))
    finally:
        await engine.dispose()


async def test_migration_0005_fixes_tree_by_root_for_pre_existing_card(temp_db_uri):
    """
    GREEN, post-fix: the same seed and the same backfilled
    `public_id`, but with `0005_normalize_uuid_bind_format` applied on
    top. `fetch_tree_by_root` now finds the card — this is the
    regression pin for the fix.
    """
    card_id = await _build_pre_0004_db_with_one_card(temp_db_uri)
    cfg = _alembic_config(temp_db_uri)
    await asyncio.to_thread(command.upgrade, cfg, _REVISION_WITH_BUG)

    public_id_before = await _read_public_id(temp_db_uri, card_id)

    await asyncio.to_thread(command.upgrade, cfg, _REVISION_WITH_FIX)

    # The public_id STRING changed (dashes stripped) but the value it
    # denotes is unaffected — UUID equality is format-independent, and
    # nothing round-trips the raw string.
    public_id_after = await _read_public_id(temp_db_uri, card_id)
    assert public_id_after == public_id_before

    engine = create_async_engine(temp_db_uri)
    try:
        async with AsyncSession(engine) as session:
            repo = LineageRepository(session)
            rooted = await repo.fetch_tree_by_root(public_id_before, user_id=UserId(1))
            assert rooted.root_card_public_id == public_id_before
            assert rooted.tree.id == card_id
    finally:
        await engine.dispose()


async def test_migration_0005_is_idempotent_on_already_dashless_data(temp_db_uri):
    """
    A fresh install (or a DB where every row was already inserted
    through the typed Core path, never through `0004`'s raw-text
    bypass) has nothing to normalize: a card created after `0005` is
    already head-shaped and typed-insert, so its `public_id` is
    already dashless. `0005`'s guard (`length(public_id) = 36`) must
    leave it untouched.
    """
    engine = create_async_engine(temp_db_uri)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)

        cfg = _alembic_config(temp_db_uri)
        await asyncio.to_thread(command.stamp, cfg, _REVISION_WITH_FIX)

        async with engine.begin() as conn:
            await conn.execute(insert(users).values(id=2, username="fresh", has_password=False))
            pos_id = (await conn.execute(
                insert(normalized_position)
                .values(content_hash=b"\xcd", canonical_content="(;FF[4]SZ[19])")
                .returning(normalized_position.c.id)
            )).scalar()
            await conn.execute(insert(game_source).values(
                position_id=pos_id, user_id=2, description="fresh game",
                client_game_id=uuid4(), display_ordinal=1,
            ))
            fresh_public_id = uuid4()
            fresh_card_id = (await conn.execute(
                insert(card).values(
                    num_moves=3, alpha=3.0, beta=3.0, t=1.0, user_id=2,
                    public_id=fresh_public_id, display_ordinal=1,
                ).returning(card.c.id)
            )).scalar()

        before = await _read_public_id(temp_db_uri, fresh_card_id)

        # Re-run 0005's own upgrade body directly against the
        # already-fixed DB — this is the idempotency guard itself,
        # not a second alembic revision step (command.upgrade would
        # no-op at the alembic_version bookkeeping level without ever
        # re-executing the SQL).
        async with engine.begin() as conn:
            await conn.execute(text(
                "UPDATE card SET public_id = REPLACE(public_id, '-', '') "
                "WHERE length(public_id) = 36"
            ))
        after = await _read_public_id(temp_db_uri, fresh_card_id)
        assert after == before == fresh_public_id
    finally:
        await engine.dispose()
