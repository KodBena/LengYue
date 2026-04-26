"""
Item 34b Commit 3 schema migration: drop `card.default_visits` column.

Companion to `34b_relocate_default_visits.py` (Commit 1 data migration).
The Commit 1 script relocated every row's default_visits value into
grading_parameter.data.default_visits. This script removes the now-
redundant column.

Safety
------
The column drop is soft-irreversible: getting the data back requires
a fresh `ALTER TABLE ADD COLUMN` plus a `UPDATE ... SET default_visits =
grading_parameter -> 'data' -> 'default_visits'` backfill. Doable but
painful. To prevent silent data loss, this script runs a pre-flight
check that verifies EVERY card row has `grading_parameter.data.
default_visits` populated. If any row is missing the nested value,
the script aborts with the card ids logged, so the operator can
investigate (probably a missed Commit 1 migration) and re-run after
fixing.

Idempotency
-----------
Detects whether the column still exists and skips if already dropped.
Safe to re-run after a successful drop.

Dialect support
---------------
- SQLite 3.35+ (March 2021): ALTER TABLE DROP COLUMN is supported.
  Older SQLite requires the table-rebuild dance (CREATE new table,
  INSERT SELECT, DROP old, RENAME). Not worth supporting — SQLite
  3.35 is a soft minimum for this codebase already (via RETURNING).
- Postgres: ALTER TABLE DROP COLUMN is standard SQL, supported
  since forever.

Usage
-----
    python scripts/migrate_34b_drop_default_visits_column.py

Reads DATABASE_URI from core.config.
"""
import asyncio
import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402

logger = logging.getLogger(__name__)


async def _column_exists(conn, table: str, column: str, dialect: str) -> bool:
    """Return True if `column` exists on `table` in the current database."""
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


def _row_has_nested_default_visits(grading_parameter: Optional[Dict[str, Any]]) -> bool:
    """
    Pure predicate: does this grading_parameter JSON have
    .data.default_visits populated as a non-null value?

    Returns False for:
      - grading_parameter is None (column may be NULL)
      - grading_parameter is not a dict (corruption)
      - grading_parameter has no 'data' key
      - grading_parameter.data is not a dict
      - grading_parameter.data.default_visits is absent
      - grading_parameter.data.default_visits is None

    Extracted for unit testability. Encodes the invariant the
    pre-flight enforces.
    """
    if not isinstance(grading_parameter, dict):
        return False
    data = grading_parameter.get("data")
    if not isinstance(data, dict):
        return False
    value = data.get("default_visits")
    return value is not None


async def _pre_flight(session) -> Tuple[int, List[int]]:
    """
    Scan every card row. Return (total_count, list_of_unmigrated_ids).

    An unmigrated row is one where grading_parameter.data.default_visits
    is missing or null. Since the Commit 1 migration script copied the
    column value into the JSON for all rows at that time, any unmigrated
    row is an anomaly — either Commit 1 wasn't run, or the row was
    inserted between Commit 1 and Commit 3 with a CardService that didn't
    perform the merge (which shouldn't happen if Commit 1's
    card_service.py is deployed).
    """
    # Import locally to avoid requiring schema.py to be in the Commit-3
    # state when running the pre-flight. This script is dialect-aware
    # and uses text-level SQL for everything; it doesn't need the
    # schema module's Table objects.
    result = await session.execute(
        text("SELECT id, grading_parameter FROM card")
    )

    total = 0
    unmigrated: List[int] = []
    for row in result.fetchall():
        total += 1
        gp = row.grading_parameter
        if not _row_has_nested_default_visits(gp):
            unmigrated.append(row.id)

    return total, unmigrated


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # -----------------------------------------------------------
    # Idempotency check: if the column is already gone, nothing to do.
    # -----------------------------------------------------------
    async with engine.connect() as conn:
        has_column = await _column_exists(conn, "card", "default_visits", dialect)

    if not has_column:
        logger.info("Column card.default_visits is already dropped. Nothing to do.")
        await engine.dispose()
        return

    # -----------------------------------------------------------
    # Pre-flight: verify every row has the nested value.
    # -----------------------------------------------------------
    logger.info("Running pre-flight scan...")
    async with async_session() as session:
        total, unmigrated = await _pre_flight(session)

    logger.info(f"  Rows scanned:  {total}")
    logger.info(f"  Rows missing grading_parameter.data.default_visits: "
                f"{len(unmigrated)}")

    if unmigrated:
        sample = unmigrated[:20]
        logger.error("")
        logger.error("ABORTING: some rows do not have the value migrated "
                     "into grading_parameter.data.default_visits.")
        logger.error(f"First up to 20 unmigrated card ids: {sample}")
        logger.error("")
        logger.error("Likely causes:")
        logger.error("  1. scripts/migrate_34b_relocate_default_visits.py "
                     "was not run.")
        logger.error("  2. Rows were inserted after Commit 1 by a stale "
                     "CardService that skipped the merge.")
        logger.error("")
        logger.error("Recovery:")
        logger.error("  $ python scripts/migrate_34b_relocate_default_visits.py")
        logger.error("  # then re-run this script.")
        await engine.dispose()
        sys.exit(1)

    # -----------------------------------------------------------
    # Column drop.
    # -----------------------------------------------------------
    logger.info("")
    logger.info("Pre-flight passed. Dropping card.default_visits column...")
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE card DROP COLUMN default_visits"))
    logger.info("  Column dropped.")

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "Going forward, default_visits lives exclusively at "
        "card.grading_parameter['data']['default_visits']. Readers of "
        "this field should look there; CardWithRecall's computed_field "
        "synthesizes a top-level `default_visits` in wire responses "
        "for stale-client compat (removed in commit-3b)."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
