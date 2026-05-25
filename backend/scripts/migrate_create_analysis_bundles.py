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
Frozen schema snapshot: this script carries an inline ``Table``
definition reflecting the **v1.0 baseline shape** of
``analysis_bundles``, not the live ``db/schema.py``. The legacy
chain represents "what brought the schema to v1.0 baseline";
future column additions land via Alembic revisions, not via this
script. Sourcing the live schema here would silently include
post-baseline columns in the bootstrap chain, breaking the
``REVISION_MARKERS`` probe (later columns become detectable on a
post-chain DB, causing the bootstrap to stamp at an Alembic
revision that hasn't actually run its own DDL, and skipping any
earlier-but-pending revision in between). The inline V1 shape is
therefore load-bearing.

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

from sqlalchemy import (  # noqa: E402
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Uuid,
    func,
)
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config  # noqa: E402
from core.logging_config import configure_logging  # noqa: E402

logger = logging.getLogger(__name__)


# V1.0-baseline shape of ``analysis_bundles``, frozen here so the
# legacy chain produces the same table the bootstrap probe expects
# at baseline. Post-baseline columns (format_descriptor,
# uncompressed_byte_size, etc.) are added by their respective
# Alembic revisions on top of this; do NOT add them here. See the
# module docstring's "Strategy" section for why.
#
# A ``users`` stub is declared in the same ``_v1_metadata`` so the
# ``analysis_bundles.user_id`` ForeignKey resolves at table-creation
# time. We never call ``_v1_users.create()`` — the real ``users``
# table is created by the live schema's ``metadata.create_all`` in
# the lifespan, well before this legacy chain runs.
_v1_metadata = MetaData()
_v1_users = Table("users", _v1_metadata, Column("id", Integer, primary_key=True))
_v1_analysis_bundles = Table(
    "analysis_bundles", _v1_metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True, default=1),
    Column("board_id", Uuid, primary_key=True),
    Column("scheme", String, nullable=False),
    Column("payload", LargeBinary, nullable=False),
    Column("record_count", Integer, nullable=False),
    Column("byte_size", Integer, nullable=False),
    Column(
        "updated_at",
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    ),
)


async def migrate() -> None:
    engine = create_async_engine(config.DATABASE_URI)
    dialect = engine.dialect.name
    logger.info(f"Database: {config.DATABASE_URI}")
    logger.info(f"Dialect:  {dialect}")
    logger.info("")

    logger.info("Creating analysis_bundles table at v1.0 baseline shape (idempotent)...")
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: _v1_analysis_bundles.create(
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
