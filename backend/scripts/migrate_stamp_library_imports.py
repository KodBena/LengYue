"""
Backfill `metadata_extra->>'imported_via' = 'library'` on existing
library-imported rows so the post-rollout list endpoint
(filter ``_is_library_entry``) surfaces them.

Why this script exists
----------------------
The library arc landed without a provenance stamp distinguishing
library imports from card-mint rows in the shared ``game_source``
table. The list endpoint subsequently grew a filter on
``metadata_extra->>'imported_via' = 'library'`` so the user-facing
Library view shows only intentional imports, not the ~thousands of
card-mint side-effect rows. Existing library entries that predate
the stamp need a one-shot backfill, otherwise they vanish from
their owner's library view.

Identification heuristic
------------------------
Rows where any of ``date``, ``result``, ``ruleset``, ``board_size``
is non-NULL are demonstrably library imports today — the card-mint
flow (``services/card_service.py``) only populates
``player_white``/``player_black`` and leaves the other typed
metadata columns NULL. The heuristic is tight against today's
ingestion paths; a future card-mint upgrade that extracts these
fields would blur it, but new card-mints would not run this
backfill script.

Idempotency
-----------
The script skips rows already carrying ``imported_via``. Safe to
re-run after a successful or partial run.

Dialect support
---------------
SQLite (``json_set`` + ``json_extract``) and Postgres
(``jsonb_set`` + ``->>``). Both write a stamped ``metadata_extra``
back to the row, preserving any pre-existing keys (``source_path``
or SGF-extras dict).

Usage
-----
    python scripts/migrate_stamp_library_imports.py

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


_HEURISTIC_PREDICATE = (
    "(date IS NOT NULL OR result IS NOT NULL OR "
    "ruleset IS NOT NULL OR board_size IS NOT NULL)"
)


async def _count_candidates(conn, dialect: str) -> int:
    if dialect == "sqlite":
        not_stamped = (
            "(metadata_extra IS NULL OR "
            "json_extract(metadata_extra, '$.imported_via') IS NULL)"
        )
    elif dialect in ("postgresql", "postgres"):
        not_stamped = (
            "(metadata_extra IS NULL OR "
            "metadata_extra->>'imported_via' IS NULL)"
        )
    else:
        raise RuntimeError(f"Unsupported dialect: {dialect!r}")
    result = await conn.execute(
        text(
            f"SELECT COUNT(*) FROM game_source "
            f"WHERE {_HEURISTIC_PREDICATE} AND {not_stamped}"
        )
    )
    return result.scalar_one()


async def _backfill(conn, dialect: str) -> int:
    if dialect == "sqlite":
        stmt = (
            "UPDATE game_source "
            "SET metadata_extra = json_set("
            "  COALESCE(metadata_extra, '{}'), "
            "  '$.imported_via', 'library'"
            ") "
            f"WHERE {_HEURISTIC_PREDICATE} "
            "AND (metadata_extra IS NULL OR "
            "     json_extract(metadata_extra, '$.imported_via') IS NULL)"
        )
    elif dialect in ("postgresql", "postgres"):
        # jsonb_set requires a jsonb value; cast for the merge.
        stmt = (
            "UPDATE game_source "
            "SET metadata_extra = jsonb_set("
            "  COALESCE(metadata_extra::jsonb, '{}'::jsonb), "
            "  '{imported_via}', "
            "  '\"library\"'::jsonb"
            ") "
            f"WHERE {_HEURISTIC_PREDICATE} "
            "AND (metadata_extra IS NULL OR "
            "     metadata_extra->>'imported_via' IS NULL)"
        )
    else:
        raise RuntimeError(f"Unsupported dialect: {dialect!r}")
    result = await conn.execute(text(stmt))
    return result.rowcount or 0


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    async with engine.connect() as conn:
        candidates = await _count_candidates(conn, dialect)

    if candidates == 0:
        logger.info(
            "No rows match the library-import heuristic without an "
            "imported_via stamp. Nothing to do."
        )
        await engine.dispose()
        return

    logger.info(
        f"Backfilling {candidates} row(s) with "
        "imported_via=library in metadata_extra."
    )

    async with engine.begin() as conn:
        applied = await _backfill(conn, dialect)
        logger.info(f"  Stamped {applied} row(s).")

    await engine.dispose()
    logger.info("")
    logger.info("Backfill complete.")


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
