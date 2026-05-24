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
The script first probes whether `default_visits` still exists on
`card`. If the column has already been dropped (by
`migrate_34b_drop_default_visits_column`, or because the live
`db/schema.py` never declared it on a fresh install), this script
is a no-op. Otherwise it scans every card row, reads the column
value, and writes the JSON merge. If a row already has
`grading_parameter.data.default_visits` populated with the same
value as the column, the row is considered up-to-date and the
UPDATE is skipped. Safe to re-run (e.g., after a deploy wobble).

The early-return probe is what lets the Alembic-bootstrap legacy
chain call this script's `migrate()` against any pre-Alembic DB
shape without needing the live `db/schema.py` to still declare
the now-dropped column. The migration body uses raw SQL via
`sqlalchemy.text` rather than the schema-coupled `card.c.*`
accessors so the script is self-contained — calling it after
the schema has evolved past this migration's snapshot stays safe.

Dialect support
---------------
Raw SQL for the row scan and per-row UPDATE keeps the same code
working against SQLite (JSON stored as TEXT) and Postgres
(native JSON/JSONB). The JSON column write uses a `bindparam`
with `type_=JSON` so SQLAlchemy serialises dialect-appropriately.

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
import json
import logging
import os
import sys
from copy import deepcopy
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import JSON, bindparam, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402

logger = logging.getLogger(__name__)


async def _card_columns(conn, dialect: str) -> set[str]:
    """Return the set of column names currently declared on the
    `card` table. Dialect-aware so the same probe works against
    SQLite (PRAGMA) and Postgres (information_schema)."""
    if dialect == "sqlite":
        result = await conn.execute(text("PRAGMA table_info(card)"))
        return {row.name for row in result.fetchall()}
    if dialect in ("postgresql", "postgres"):
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'card'"
            )
        )
        return {row[0] for row in result.fetchall()}
    raise RuntimeError(f"Unsupported dialect: {dialect!r}")


def _normalize_gp(raw: Any) -> Optional[Dict[str, Any]]:
    """Normalize the `grading_parameter` value returned by a raw
    `text()` SELECT. SQLite stores JSON as TEXT and returns a
    string here; Postgres' driver typically decodes to dict.
    Tolerate both, plus the NULL case."""
    if raw is None:
        return None
    if isinstance(raw, str):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    if isinstance(raw, dict):
        return raw
    return None


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

    # Idempotency probe: if `default_visits` has already been dropped,
    # the relocate work has nothing to do (the column source is gone).
    # This guard is what makes the script safe to call from contexts
    # where the live `db/schema.py` no longer declares the column —
    # the Alembic bootstrap's legacy chain depends on it.
    async with engine.connect() as conn:
        cols = await _card_columns(conn, dialect)

    if "default_visits" not in cols:
        logger.info(
            "default_visits column already absent on card; "
            "relocate is a no-op."
        )
        await engine.dispose()
        return

    logger.info("Relocating default_visits into grading_parameter.data...")

    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # Raw `text()` queries (not `card.c.*`) so the script stays
    # self-contained — no live schema dependency for the column.
    select_stmt = text(
        "SELECT id, default_visits, grading_parameter FROM card"
    )
    update_stmt = text(
        "UPDATE card SET grading_parameter = :gp WHERE id = :id"
    ).bindparams(bindparam("gp", type_=JSON))

    updated = 0
    skipped = 0
    total = 0

    async with async_session() as session:
        async with session.begin():
            # One SELECT to fetch the rows of interest. Card count in
            # this codebase is expected to stay well under the "paginate
            # this" threshold; if the app ever grows into that regime,
            # chunk by primary-key ranges.
            result = await session.execute(select_stmt)

            for row in result.fetchall():
                total += 1
                new_gp, needs_update = _compute_merged(
                    _normalize_gp(row.grading_parameter),
                    row.default_visits,
                )

                if not needs_update:
                    skipped += 1
                    continue

                await session.execute(
                    update_stmt,
                    {"gp": new_gp, "id": row.id},
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
        "It stays in the schema during the 34b transition; "
        "`migrate_34b_drop_default_visits_column` drops it once the "
        "frontend has fully switched."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
