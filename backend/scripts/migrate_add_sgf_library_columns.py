"""
SGF-library schema migration: add `created_at`, `date`, `result`,
`ruleset`, `board_size`, `metadata_extra` columns to `game_source`,
plus eight compound indexes supporting the library's read-path query
shapes.

Reactive to the SGF-library design at `docs/notes/sgf-library-plan.md`.
After this migration, `game_source` is a first-class games library —
not only a card-mint side-effect — with the metadata surface a list
view needs to sort and filter on.

Schema additions
----------------
Columns (all added to `game_source`):
  - created_at      DateTime(timezone=True), server_default=NOW()
  - date            String, NULL
  - result          String, NULL
  - ruleset         String, NULL
  - board_size      Integer, NULL
  - metadata_extra  JSON, NULL

Indexes (all on `game_source`):
  - ix_game_source_user_position             (user_id, position_id)
  - ix_game_source_user_created_at_id        (user_id, created_at, id)
  - ix_game_source_user_date_id              (user_id, date, id)
  - ix_game_source_user_player_white_id      (user_id, player_white, id)
  - ix_game_source_user_player_black_id      (user_id, player_black, id)
  - ix_game_source_user_result_id            (user_id, result, id)
  - ix_game_source_user_ruleset_id           (user_id, ruleset, id)
  - ix_game_source_user_board_size_id        (user_id, board_size, id)

Backfill strategy
-----------------
`created_at` is populated for existing rows at migration time:

- **Postgres**: `ADD COLUMN created_at TIMESTAMP WITH TIME ZONE
  DEFAULT NOW()` populates existing rows during the ALTER itself.
- **SQLite**: rejects non-constant DEFAULTs on ADD COLUMN ("Cannot
  add a column with non-constant default"), so the column is added
  nullable without a DDL-level default, then a separate
  ``UPDATE game_source SET created_at = CURRENT_TIMESTAMP WHERE
  created_at IS NULL`` stamps existing rows. Runtime inserts still
  pick up the schema-declared ``server_default=func.now()`` and
  produce non-null values on new rows.

The metadata columns (date, result, ruleset, board_size,
metadata_extra) stay NULL for existing rows. Those came in via the
card-mint flow without explicit metadata extraction; the user can
re-import them through the library flow later if they want
enrichment. A blanket re-parse of existing raw_content to backfill
metadata is out of scope for this migration — the substrate of
existing rows is small (card-mint-only) and the migration's job is
schema, not data archeology.

Dialect support
---------------
SQLite emits `created_at DATETIME` (no DDL default) plus a follow-up
UPDATE to backfill; the typed metadata columns are TEXT/INTEGER as
SQLAlchemy maps them. Postgres emits `created_at TIMESTAMP WITH TIME
ZONE DEFAULT NOW()` without a follow-up UPDATE. Both dialects accept
the index DDL unchanged.

Idempotency
-----------
Each column and each index is detected before creation; missing
items are added, present items skipped. Safe to re-run after a
successful or partial migration.

Usage
-----
    python scripts/migrate_add_sgf_library_columns.py

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


# (column_name, sqlite_ddl_fragment, postgres_ddl_fragment, post_add_sqlite_backfill)
#
# `created_at` carries a backfill statement only on SQLite. SQLite
# rejects non-constant DEFAULTs on ADD COLUMN ("Cannot add a column
# with non-constant default") so the column is added nullable and
# existing rows are explicitly stamped with CURRENT_TIMESTAMP in a
# separate UPDATE. Runtime INSERTs still pick up the schema-declared
# ``server_default=func.now()`` and produce non-null values for new
# rows. Postgres has no such restriction; the DEFAULT NOW() on ADD
# COLUMN populates existing rows during the ALTER itself.
COLUMN_SPECS = [
    (
        "created_at",
        "DATETIME",
        "TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
        "UPDATE game_source SET created_at = CURRENT_TIMESTAMP "
        "WHERE created_at IS NULL",
    ),
    ("date",           "TEXT NULL",    "VARCHAR NULL", None),
    ("result",         "TEXT NULL",    "VARCHAR NULL", None),
    ("ruleset",        "TEXT NULL",    "VARCHAR NULL", None),
    ("board_size",     "INTEGER NULL", "INTEGER NULL", None),
    ("metadata_extra", "TEXT NULL",    "JSON NULL",    None),
]

# (index_name, ordered tuple of columns)
INDEX_SPECS = [
    ("ix_game_source_user_position",
     ("user_id", "position_id")),
    ("ix_game_source_user_created_at_id",
     ("user_id", "created_at", "id")),
    ("ix_game_source_user_date_id",
     ("user_id", "date", "id")),
    ("ix_game_source_user_player_white_id",
     ("user_id", "player_white", "id")),
    ("ix_game_source_user_player_black_id",
     ("user_id", "player_black", "id")),
    ("ix_game_source_user_result_id",
     ("user_id", "result", "id")),
    ("ix_game_source_user_ruleset_id",
     ("user_id", "ruleset", "id")),
    ("ix_game_source_user_board_size_id",
     ("user_id", "board_size", "id")),
]


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

    # Inventory.
    async with engine.connect() as conn:
        missing_columns = []
        for col_name, sqlite_ddl, postgres_ddl, sqlite_backfill in COLUMN_SPECS:
            if not await _column_exists(conn, "game_source", col_name, dialect):
                missing_columns.append(
                    (col_name, sqlite_ddl, postgres_ddl, sqlite_backfill)
                )

        missing_indexes = []
        for index_name, cols in INDEX_SPECS:
            if not await _index_exists(conn, index_name, dialect):
                missing_indexes.append((index_name, cols))

    if not missing_columns and not missing_indexes:
        logger.info(
            "All SGF-library columns and indexes already present on "
            "game_source. Nothing to do."
        )
        await engine.dispose()
        return

    logger.info(
        f"Applying migration: {len(missing_columns)} columns, "
        f"{len(missing_indexes)} indexes to add."
    )

    async with engine.begin() as conn:
        for col_name, sqlite_ddl, postgres_ddl, sqlite_backfill in missing_columns:
            if dialect == "sqlite":
                ddl = f"ALTER TABLE game_source ADD COLUMN {col_name} {sqlite_ddl}"
            elif dialect in ("postgresql", "postgres"):
                ddl = f"ALTER TABLE game_source ADD COLUMN {col_name} {postgres_ddl}"
            else:
                raise RuntimeError(f"Unsupported dialect: {dialect!r}")
            logger.info(f"  ADD COLUMN game_source.{col_name}")
            await conn.execute(text(ddl))
            # SQLite cannot evaluate a function default on ADD COLUMN,
            # so any non-constant backfill runs as a separate UPDATE.
            if dialect == "sqlite" and sqlite_backfill is not None:
                logger.info(
                    f"  BACKFILL game_source.{col_name} via UPDATE"
                )
                await conn.execute(text(sqlite_backfill))

        for index_name, cols in missing_indexes:
            cols_csv = ", ".join(cols)
            ddl = (
                f"CREATE INDEX {index_name} "
                f"ON game_source({cols_csv})"
            )
            logger.info(f"  {ddl}")
            await conn.execute(text(ddl))

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "Existing rows: created_at populated by DEFAULT CURRENT_TIMESTAMP / "
        "NOW() at ADD COLUMN time; metadata columns (date, result, ruleset, "
        "board_size, metadata_extra) remain NULL. Library imports populate "
        "all columns going forward."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
