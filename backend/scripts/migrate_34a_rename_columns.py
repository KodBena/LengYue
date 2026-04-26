"""
Item 34a migration: rename Go-specific column names in the
normalized_position table to their generic equivalents.

    pos_hash       -> content_hash
    normalized_sgf -> canonical_content

Both renames are prerequisites for schema/Port alignment. Before 34a,
CardRepository translated the Port's canonical_content / content_hash
names into the schema's Go-specific names inside get_or_create_position.
After 34a, the schema speaks the generic names directly and the
translation disappears.

This script is safe to run multiple times: it checks the current
column state and skips renames that have already been applied. If the
table is in a state it doesn't recognize (neither old nor new column
present), it raises rather than silently doing nothing.

Dialect support:
  - SQLite (3.25.0+): ALTER TABLE RENAME COLUMN landed in Sept 2018.
    Requirement already implied by use of .returning() in insert_card
    (SQLite 3.35+). Column-rename auto-propagates to references in
    other tables (foreign keys, constraints, CHECK clauses).
  - Postgres: ALTER TABLE RENAME COLUMN is standard SQL and supported
    since forever. References in foreign keys and constraints update
    automatically; however, auto-named indexes keep their old name
    (the column in the index is the renamed one, so it still works).
    This script optionally renames the auto-named unique index for
    tidiness — failure to rename the index is non-fatal.

Usage:
    # Run against whatever DATABASE_URI the app is configured for:
    python scripts/migrate_34a_rename_columns.py

    # Or override via env:
    DATABASE_URI="sqlite+aiosqlite:///./ebisu.db" \\
        python scripts/migrate_34a_rename_columns.py

Ordering note for installs with BOTH Postgres (source of truth) AND
SQLite (derived snapshot via scripts/migrate_to_sqlite.py):
  1. Run this migration against Postgres first.
  2. Delete the stale SQLite file (or run migrate_to_sqlite.py to
     regenerate it — it will create a fresh SQLite with the new
     column names because it reads from the current schema.py).
Running migrate_to_sqlite.py BEFORE this migration will fail because
SQLAlchemy will try to SELECT the new column names from a Postgres
database that still has the old column names.
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

# The renames we apply. Order matters only in that the log output
# is deterministic; the two columns are independent.
RENAMES = [
    ("normalized_position", "pos_hash", "content_hash"),
    ("normalized_position", "normalized_sgf", "canonical_content"),
]


async def _column_exists(conn, table: str, column: str, dialect: str) -> bool:
    """
    Return True if `column` exists on `table` in the current database.
    Dialect-branched because SQLite and Postgres use different
    introspection mechanisms; both are ANSI-standard for their
    respective systems.
    """
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


async def _rename_column(conn, table: str, old: str, new: str) -> None:
    """
    Execute ALTER TABLE RENAME COLUMN. Both SQLite (3.25+) and
    Postgres accept this identical syntax.
    """
    # Identifiers are injected via f-string because parameterized
    # ALTER TABLE isn't supported by any dialect; the values come
    # from the hard-coded RENAMES list above, not from user input,
    # so there's no injection surface.
    stmt = text(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}")
    await conn.execute(stmt)
    logger.info(f"  Renamed: {table}.{old} -> {table}.{new}")


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")
    logger.info("Applying item 34a column renames...")

    async with engine.begin() as conn:
        for table, old, new in RENAMES:
            has_old = await _column_exists(conn, table, old, dialect)
            has_new = await _column_exists(conn, table, new, dialect)

            if has_old and has_new:
                raise RuntimeError(
                    f"{table} has both {old} and {new} columns — "
                    "schema is in an inconsistent state. Resolve "
                    "manually before re-running this migration."
                )
            if has_new:
                logger.info(
                    f"  Skipped: {table}.{new} already present "
                    "(migration was previously applied)."
                )
                continue
            if not has_old:
                raise RuntimeError(
                    f"{table} has neither {old} nor {new}. Either "
                    "the schema is corrupt or this is a fresh install "
                    "created with the post-34a schema — in which case "
                    "no migration is needed. Verify by inspecting the "
                    "table: sqlite> .schema normalized_position"
                )

            await _rename_column(conn, table, old, new)

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "Note: on Postgres, the auto-generated unique index "
        "(ix_normalized_position_pos_hash) retains its old name but "
        "still functions correctly. To rename it for tidiness:"
    )
    logger.info(
        "  ALTER INDEX ix_normalized_position_pos_hash "
        "RENAME TO ix_normalized_position_content_hash;"
    )
    logger.info("On SQLite, the index is similarly drift-but-working.")


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
