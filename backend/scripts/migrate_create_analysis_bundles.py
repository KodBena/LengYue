"""
scripts/migrate_create_analysis_bundles.py

Schema migration: create the `analysis_bundles` table for the
cross/analysis-persistence arc.

After this migration, the backend can persist KataGo analysis
bundles per (user_id, board_id) — the storage shape behind the
PUT/GET/DELETE /analysis-bundles/{board_id} routes. The wire-shape
and codec-envelope contract is recorded in
docs/dispatch/backend-to-frontend-analysis-persistence-status.md.

Strategy
--------
Metadata-driven: the table is defined once in `db/schema.py`; this
script invokes `analysis_bundles.create(checkfirst=True)`, which
emits the right CREATE TABLE for whichever dialect is active
(SQLite via the SQLAlchemy `Uuid` type maps to CHAR(32)/BLOB(16);
Postgres maps to native `UUID`). The single source of truth stays
in the schema module — no risk of the migration drifting from the
declarative shape.

Dialect support
---------------
SQLite + Postgres, both via SQLAlchemy's dialect-aware DDL
generation. No raw SQL in this migration; the `Uuid`, `LargeBinary`,
and `DateTime(timezone=True)` columns map to dialect-appropriate
types automatically.

Idempotency
-----------
`checkfirst=True` issues `CREATE TABLE` only if the table doesn't
exist. Safe to re-run after a successful migration.

Fresh installs do not need to run this script — the application's
`metadata.create_all` in `main.py::lifespan` picks up the table
automatically. The migration matters for installs that predate
this commit.

Usage
-----
    python scripts/migrate_create_analysis_bundles.py

Reads DATABASE_URI from core.config.

License: Public Domain (The Unlicense)
"""
import asyncio
import logging
import os
import sys

from sqlalchemy.ext.asyncio import create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402
from db.schema import analysis_bundles  # noqa: E402

logger = logging.getLogger(__name__)


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    logger.info("Creating analysis_bundles table (idempotent)...")
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: analysis_bundles.create(
                sync_conn, checkfirst=True
            )
        )

    await engine.dispose()
    logger.info("")
    logger.info("Migration complete.")
    logger.info(
        "The analysis_bundles table is ready. The PUT/GET/DELETE "
        "/analysis-bundles/{board_id} routes will persist bundles "
        "for any user authenticated via the existing JWT flow."
    )


if __name__ == "__main__":
    configure_logging(style="cli")
    asyncio.run(migrate())
