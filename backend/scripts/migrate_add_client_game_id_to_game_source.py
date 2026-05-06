"""
Game-source dedup schema migration: add `game_source.client_game_id`
column and the partial unique index on (user_id, client_game_id).
Reactive to the dedup arc in
`docs/dispatch/frontend-to-backend-game-source-dedup.md`. Carries no
tenancy-spine item number — the spine's items 13–26 are independent
of this work, and item 25 specifically refers to threading user_id
through PipelineExecutor (a code-only change with no migration
script).

After this migration, a frontend client can stamp every game_source
write with a stable opaque session identifier; the backend honors it
as a get-or-create key on `(user_id, client_game_id)` so two mints
from the same loaded SGF in the same board lifetime resolve to a
single game_source row instead of fragmenting into separate
"Untitled Game" entries in the forest navigator.

The dispatch establishing this contract is
`docs/dispatch/frontend-to-backend-game-source-dedup.md` (frontend
side) / `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`
(backend reply).

Backfill strategy
-----------------
None. The column is added as nullable. Existing rows keep
`client_game_id IS NULL` and the partial unique index ignores them
(per its `WHERE client_game_id IS NOT NULL` predicate). The
historical "always-create" behavior remains the contract for any
caller that doesn't supply the field — which preserves curl-shaped
clients and any pre-rollout frontend traffic still in flight.

A backfill that retroactively grouped historical rows by content
similarity would have to invent the grouping key (the dispatch
rejects content-hash and raw_content-hash for documented reasons),
so no such backfill is correct without a user signal that doesn't
exist for already-shipped data.

Dialect support
---------------
SQLite emits `client_game_id CHAR(32)` (matches SQLAlchemy 2.0's
`Uuid` type emulation: 32 hex chars without hyphens). Postgres emits
`client_game_id UUID` (native). Both dialects support `CREATE UNIQUE
INDEX ... WHERE ...` (SQLite since 3.8.0 / 2013; Postgres always),
so the partial unique constraint is a single statement on each.

Idempotency
-----------
Detects whether `client_game_id` already exists on game_source AND
whether the partial unique index already exists. Either-half present
is fine; the missing half gets added. Safe to re-run after a
successful migration.

Usage
-----
    python scripts/migrate_add_client_game_id_to_game_source.py

Reads DATABASE_URI from core.config.

License: Public Domain (The Unlicense)
"""
import asyncio
import logging
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402

logger = logging.getLogger(__name__)

INDEX_NAME = "uniq_game_source_user_client_game_id"


async def _column_exists(conn, table: str, column: str, dialect: str) -> bool:
    if dialect == "sqlite":
        result = await conn.execute(text(f"PRAGMA table_info({table})"))
        return any(row.name == column for row in result.fetchall())
    if dialect in ("postgresql", "postgres"):
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column},
        )
        return result.fetchone() is not None
    raise RuntimeError(f"Unsupported dialect: {dialect!r}")


async def _index_exists(conn, index_name: str, dialect: str) -> bool:
    if dialect == "sqlite":
        result = await conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'index' AND name = :name"
            ),
            {"name": index_name},
        )
        return result.fetchone() is not None
    if dialect in ("postgresql", "postgres"):
        result = await conn.execute(
            text(
                "SELECT indexname FROM pg_indexes WHERE indexname = :name"
            ),
            {"name": index_name},
        )
        return result.fetchone() is not None
    raise RuntimeError(f"Unsupported dialect: {dialect!r}")


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    async with engine.connect() as conn:
        column_present = await _column_exists(
            conn, "game_source", "client_game_id", dialect
        )
        index_present = await _index_exists(conn, INDEX_NAME, dialect)

    if column_present and index_present:
        logger.info(
            "Column game_source.client_game_id and index "
            f"{INDEX_NAME} already exist. Nothing to do."
        )
        await engine.dispose()
        return

    logger.info("Applying migration...")
    async with engine.begin() as conn:
        if not column_present:
            if dialect == "sqlite":
                # CHAR(32) matches SQLAlchemy 2.0's Uuid emulation
                # on non-Postgres dialects (32 hex chars, no hyphens).
                logger.info(
                    "  [sqlite] ADD COLUMN game_source.client_game_id CHAR(32) NULL"
                )
                await conn.execute(text(
                    "ALTER TABLE game_source ADD COLUMN client_game_id CHAR(32) NULL"
                ))
            elif dialect in ("postgresql", "postgres"):
                logger.info(
                    "  [postgres] ADD COLUMN game_source.client_game_id UUID NULL"
                )
                await conn.execute(text(
                    "ALTER TABLE game_source ADD COLUMN client_game_id UUID NULL"
                ))
            else:
                raise RuntimeError(f"Unsupported dialect: {dialect!r}")
        else:
            logger.info(
                "  Column game_source.client_game_id already present; "
                "skipping ADD COLUMN."
            )

        if not index_present:
            # Partial unique index — both dialects accept the syntax.
            # The WHERE clause keeps the constraint inert for legacy
            # NULL rows (and any future caller that omits the field),
            # while serializing concurrent inserts that share a
            # (user_id, client_game_id) key.
            logger.info(
                f"  CREATE UNIQUE INDEX {INDEX_NAME} "
                "ON game_source(user_id, client_game_id) "
                "WHERE client_game_id IS NOT NULL"
            )
            await conn.execute(text(
                f"CREATE UNIQUE INDEX {INDEX_NAME} "
                "ON game_source(user_id, client_game_id) "
                "WHERE client_game_id IS NOT NULL"
            ))
        else:
            logger.info(
                f"  Index {INDEX_NAME} already present; skipping CREATE INDEX."
            )

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "Existing game_source rows retain client_game_id IS NULL and "
        "are exempt from the unique constraint. Future writes from a "
        "client_game_id-aware caller dedup on (user_id, client_game_id); "
        "callers omitting the field continue to always-create as before."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
