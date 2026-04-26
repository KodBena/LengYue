"""
Item 34b Commit 1 data migration: relocate `card.default_visits` into
`card.grading_parameter.data.default_visits`.

The column is NOT dropped by this script — it stays in the schema
for the duration of Commits 1 and 2. After Commit 1:
    - Existing rows have the value in BOTH the column and the JSON.
    - New rows (via CardService.create_card) have the value in both.
Commit 3 drops the column and rewrites CardService to read from
the JSON exclusively.

Idempotency
-----------
The script scans every card row, reads the column value, and writes
the JSON merge. If a row already has
`grading_parameter.data.default_visits` populated with the same value
as the column, the row is considered up-to-date and the UPDATE is
skipped. Safe to re-run (e.g., after a deploy wobble).

Dialect support
---------------
Uses SQLAlchemy Core for reads and writes, so the same code runs
against SQLite (JSON stored as TEXT with SQLAlchemy JSON type) and
Postgres (native JSONB).

Performance
-----------
Sequential scan with per-row UPDATE. For the expected workload
(thousands of cards, not millions), this is fine. Running time on
a realistic dataset is dominated by transaction overhead, not by
the JSON manipulation. If the card count grows into the hundreds
of thousands, rewrite this as a single SQL UPDATE using JSON
functions — but the dialect-specific syntax (SQLite json_set vs
Postgres jsonb_set) would make the script dialect-branched.

Usage
-----
    python scripts/migrate_34b_relocate_default_visits.py

Reads DATABASE_URI from core.config; override via environment
variable if running against a non-default database.
"""
import asyncio
import logging
import os
import sys
from copy import deepcopy
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402
from db.schema import card  # noqa: E402

logger = logging.getLogger(__name__)


def _compute_merged(
    grading_parameter: Optional[Dict[str, Any]],
    default_visits: int,
) -> Tuple[Dict[str, Any], bool]:
    """
    Compute the post-merge grading_parameter dict and report whether
    an update is needed.

    Returns (new_grading_parameter, needs_update).

    needs_update is False when the JSON already has
    `grading_parameter.data.default_visits` equal to the column value —
    the row is up-to-date, no UPDATE required. Lets the migration skip
    already-migrated rows on re-run, preserving idempotency cheaply.

    Kept pure (no side effects, no session reference) so it can be
    unit-tested without a database.
    """
    existing = grading_parameter or {}
    existing_data = existing.get("data", {}) if isinstance(existing, dict) else {}
    existing_dv = existing_data.get("default_visits") if isinstance(existing_data, dict) else None

    if existing_dv == default_visits:
        # Already migrated (or happened to be in sync). Skip.
        return existing, False

    # Defensive copy — don't mutate the input.
    merged = deepcopy(existing) if isinstance(existing, dict) else {}
    data = merged.setdefault("data", {})
    if not isinstance(data, dict):
        # Malformed existing JSON — rebuild the `data` subtree.
        data = {}
        merged["data"] = data
    data["default_visits"] = default_visits
    return merged, True


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")
    logger.info("Relocating default_visits into grading_parameter.data...")

    async_session = async_sessionmaker(engine, expire_on_commit=False)

    updated = 0
    skipped = 0
    total = 0

    async with async_session() as session:
        async with session.begin():
            # One SELECT to fetch the rows of interest. Card count in
            # this codebase is expected to stay well under the "paginate
            # this" threshold; if the app ever grows into that regime,
            # chunk by primary-key ranges.
            result = await session.execute(
                select(
                    card.c.id,
                    card.c.default_visits,
                    card.c.grading_parameter,
                )
            )

            for row in result.fetchall():
                total += 1
                new_gp, needs_update = _compute_merged(
                    row.grading_parameter,
                    row.default_visits,
                )

                if not needs_update:
                    skipped += 1
                    continue

                await session.execute(
                    update(card)
                    .where(card.c.id == row.id)
                    .values(grading_parameter=new_gp)
                )
                updated += 1

    await engine.dispose()

    logger.info("")
    logger.info(f"Total rows scanned:  {total}")
    logger.info(f"Rows updated:        {updated}")
    logger.info(f"Rows already synced: {skipped}")
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "The `default_visits` column is NOT dropped by this script. "
        "It stays in the schema during the 34b transition; Commit 3 "
        "drops it once the frontend has fully switched."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
