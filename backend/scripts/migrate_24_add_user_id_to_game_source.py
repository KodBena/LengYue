"""
Item 24 schema migration: add `game_source.user_id` column.

After this migration, every game_source row is owned by a specific
user. The column is FK-linked to users.id and defaults to 1
(local_user from ALLOW_PASSWORDLESS_LOGIN) for the backfill of
existing rows.

Backfill strategy
-----------------
All existing rows get user_id=1. This matches `card.user_id`'s
existing default and aligns with the assumption that the historical
single-tenant install has all data under local_user. New rows
inserted via CardService.insert_game_source explicitly supply
user_id from the JWT-derived tenant context.

A more sophisticated backfill could derive each game_source's owner
from the cards that reference it (via card_source.game_source_id),
but this is unnecessary in the single-tenant historical case (all
cards already belong to user 1) and adds risk for marginal benefit.
The simple "default to 1" backfill is correct for the deployment
shape this migration is actually intended to upgrade.

Dialect support
---------------
Single-statement ALTER TABLE on both SQLite and Postgres — game_source's
primary key is the surrogate id column, which doesn't need rewriting.
The new column is added with DEFAULT 1 NOT NULL in one statement;
the default applies to existing rows and to any future row that
omits the column (defense-in-depth backstop).

Idempotency
-----------
Detects whether `user_id` already exists on game_source. Safe to
re-run after a successful migration (does nothing).

Usage
-----
    python scripts/migrate_24_add_user_id_to_game_source.py

Reads DATABASE_URI from core.config.
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


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    # Idempotency check.
    async with engine.connect() as conn:
        if await _column_exists(conn, "game_source", "user_id", dialect):
            logger.info("Column game_source.user_id already exists. Nothing to do.")
            await engine.dispose()
            return

    logger.info("Applying migration...")
    logger.info("  ADD COLUMN game_source.user_id DEFAULT 1 NOT NULL")
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE game_source ADD COLUMN user_id INTEGER NOT NULL "
            "REFERENCES users(id) DEFAULT 1"
        ))

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "All existing game_source rows are now owned by user_id=1 "
        "(local_user). New rows inserted by CardService.insert_game_source "
        "explicitly supply user_id from the JWT-derived tenant context."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
