"""
Item 23 schema migration: add `documents.user_id` column.

After this migration, `documents` has a composite primary key
(key, user_id) instead of (key) alone, allowing two users to
independently store data under the same key.

Backfill strategy
-----------------
All existing rows get user_id=1 (local_user from
ALLOW_PASSWORDLESS_LOGIN). The frontend's existing key naming
convention (e.g., "user_workspace_settings") is preserved as-is —
the prefix becomes a no-op string per row, which a future cleanup
can strip if desired. This migration only adds the column and
rewires the primary key; it does not modify key strings.

Dialect support
---------------
Postgres: ALTER TABLE ADD COLUMN ... DEFAULT 1 NOT NULL is one
statement; the PK rewrite is also one statement.

SQLite: cannot ALTER PRIMARY KEY in place. The migration uses the
SQLite-recommended table-rebuild dance:

  1. ADD COLUMN with DEFAULT 1 (atomic backfill of existing rows).
  2. CREATE TABLE _new with the new composite PK.
  3. INSERT INTO _new SELECT * FROM documents.
  4. DROP TABLE documents.
  5. ALTER TABLE _new RENAME TO documents.

The dance is wrapped in a single transaction so the rebuild is
atomic from the application's perspective.

Idempotency
-----------
Detects whether `user_id` already exists in the table. Safe to
re-run after a successful migration (does nothing).

Usage
-----
    python scripts/migrate_23_add_user_id_to_documents.py

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


async def _migrate_sqlite(conn) -> None:
    """
    SQLite path: ADD COLUMN, then table-rebuild for the composite PK.
    """
    logger.info("  [sqlite] ADD COLUMN documents.user_id DEFAULT 1 NOT NULL")
    await conn.execute(text(
        "ALTER TABLE documents ADD COLUMN user_id INTEGER NOT NULL "
        "REFERENCES users(id) DEFAULT 1"
    ))

    # Composite PK rewrite via the rebuild dance.
    logger.info("  [sqlite] Rebuilding documents with composite PK (key, user_id)")
    await conn.execute(text("""
        CREATE TABLE documents_new (
            key TEXT NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
            data JSON NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (key, user_id)
        )
    """))
    await conn.execute(text(
        "INSERT INTO documents_new (key, user_id, data, updated_at) "
        "SELECT key, user_id, data, updated_at FROM documents"
    ))
    await conn.execute(text("DROP TABLE documents"))
    await conn.execute(text("ALTER TABLE documents_new RENAME TO documents"))


async def _migrate_postgres(conn) -> None:
    """
    Postgres path: ADD COLUMN with DEFAULT, then drop old PK and add
    composite PK in one ALTER TABLE.
    """
    logger.info("  [postgres] ADD COLUMN documents.user_id DEFAULT 1 NOT NULL")
    await conn.execute(text(
        "ALTER TABLE documents ADD COLUMN user_id INTEGER NOT NULL "
        "REFERENCES users(id) DEFAULT 1"
    ))

    # Drop old PK on (key) alone, add composite PK.
    logger.info("  [postgres] Rewriting PRIMARY KEY to (key, user_id)")
    await conn.execute(text(
        "ALTER TABLE documents DROP CONSTRAINT documents_pkey, "
        "ADD PRIMARY KEY (key, user_id)"
    ))


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    # Idempotency check.
    async with engine.connect() as conn:
        if await _column_exists(conn, "documents", "user_id", dialect):
            logger.info("Column documents.user_id already exists. Nothing to do.")
            await engine.dispose()
            return

    logger.info("Applying migration...")
    async with engine.begin() as conn:
        if dialect == "sqlite":
            await _migrate_sqlite(conn)
        elif dialect in ("postgresql", "postgres"):
            await _migrate_postgres(conn)
        else:
            raise RuntimeError(f"Unsupported dialect: {dialect!r}")

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "All existing documents rows are now owned by user_id=1 "
        "(local_user). The composite PRIMARY KEY (key, user_id) "
        "permits per-user namespaces; new writes from the application "
        "explicitly supply user_id from the JWT-derived tenant context."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
