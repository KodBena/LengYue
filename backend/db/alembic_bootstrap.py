"""
db/alembic_bootstrap.py — startup-time Alembic bootstrap.

The backend's lifespan hook calls ``bootstrap_alembic`` after the
database connection pool is open and ``metadata.create_all`` has
run. The bootstrap performs three jobs:

1. **Probe**: inspect the live schema to determine whether the DB
   is already Alembic-managed (``alembic_version`` table present),
   at a known pre-Alembic baseline, or at an unknown state.
2. **Stamp**: for DBs not yet Alembic-managed, write the
   ``alembic_version`` row at the appropriate revision so a
   subsequent ``upgrade head`` runs only the *pending* revisions
   — not the historical ones already materialised by either
   ``metadata.create_all`` (fresh installs) or the manual
   ``scripts/migrate_*.py`` runs (existing installs).
3. **Upgrade**: run ``alembic upgrade head`` to apply any pending
   revisions. Idempotent — on an up-to-date DB it's a no-op.

The probe consults ``REVISION_MARKERS``: a small registry of
``(table, column, revision_id)`` triples. Each marker says "if
this column exists on this table, the schema is at-or-past this
revision." The probe walks markers latest-to-earliest and stamps
at the first satisfied entry. Every new Alembic revision that
adds a column appends a marker entry here so the bootstrap stays
correct without rewriting per-revision detection.

Failure modes (ADR-0002):

- Unrecognised pre-Alembic schema (no markers satisfied AND
  ``alembic_version`` absent): raise ``SchemaBootstrapError`` with
  a message pointing operators at the prior ``scripts/migrate_*.py``
  to reach v1.0 baseline before retrying.
- Alembic ``upgrade`` failure: propagate the exception; the lifespan
  aborts and the backend doesn't start. Operators see the failure
  at boot, not as opaque 5xxs.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import List, Optional, Tuple

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


class SchemaBootstrapError(RuntimeError):
    """Raised when the live DB's schema doesn't match any known
    bootstrap target. Operators see this at startup with a clear
    remediation path; the backend refuses to serve traffic until
    fixed."""


# Markers for the bootstrap probe. Each entry says "if this column
# exists on this table, the schema is at-or-past this Alembic
# revision." Walked latest-to-earliest; the first satisfied entry
# determines the stamp target. Future revisions APPEND below.
REVISION_MARKERS: List[Tuple[str, str, str]] = [
    # (table, column, revision_id)
    ("game_source", "client_game_id", "0001_baseline"),
]


def _alembic_config(backend_root: str) -> Config:
    """Construct the ``Config`` object Alembic commands consume.

    ``backend_root`` is the absolute path to the directory holding
    ``alembic.ini`` (i.e., the ``backend/`` directory). Resolving
    relative to this path keeps the bootstrap working regardless
    of the current working directory at process start.
    """
    cfg_path = os.path.join(backend_root, "alembic.ini")
    cfg = Config(cfg_path)
    cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))
    return cfg


async def _table_exists(engine: AsyncEngine, table_name: str) -> bool:
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table(table_name)
        )


async def _column_exists(
    engine: AsyncEngine,
    table_name: str,
    column_name: str,
) -> bool:
    async with engine.connect() as conn:
        def _check(sync_conn) -> bool:
            insp = inspect(sync_conn)
            if not insp.has_table(table_name):
                return False
            return any(
                col["name"] == column_name
                for col in insp.get_columns(table_name)
            )
        return await conn.run_sync(_check)


async def _probe_revision(engine: AsyncEngine) -> Optional[str]:
    """Walk ``REVISION_MARKERS`` latest-to-earliest. Return the
    first revision id whose marker is satisfied, or ``None`` if
    no marker matches (pre-baseline schema).
    """
    for table, column, revision in reversed(REVISION_MARKERS):
        if await _column_exists(engine, table, column):
            logger.info(
                "alembic_bootstrap: probe matched marker %s.%s → revision %s",
                table, column, revision,
            )
            return revision
    return None


async def bootstrap_alembic(engine: AsyncEngine, backend_root: str) -> None:
    """Probe + stamp + upgrade. Idempotent.

    Sequence:

    1. If ``alembic_version`` exists → already Alembic-managed.
       Skip stamping; run ``upgrade head`` to apply any pending
       revisions.
    2. Else probe schema markers:
       - Any marker satisfied → stamp at that revision, then
         ``upgrade head``.
       - No marker satisfied AND the ``game_source`` table doesn't
         exist → fresh DB. ``metadata.create_all`` has already
         materialised every table in the current declared schema;
         the LATEST marker should now be satisfied. (Re-probe; if
         still unmatched, raise.)
       - No marker satisfied AND ``game_source`` exists → ancient
         pre-v1.0 schema. Raise ``SchemaBootstrapError`` with
         operator guidance.

    Args:
        engine: live async SQLAlchemy engine.
        backend_root: absolute path to the directory holding
            ``alembic.ini``.
    """
    cfg = _alembic_config(backend_root)

    if await _table_exists(engine, "alembic_version"):
        logger.info("alembic_bootstrap: alembic_version present — running upgrade head")
        await asyncio.to_thread(command.upgrade, cfg, "head")
        return

    revision = await _probe_revision(engine)
    if revision is None:
        # No marker satisfied. Distinguish "no game_source at all"
        # (fresh, post-create_all should have populated markers) from
        # "game_source exists but at an unrecognised state" (pre-v1.0
        # schema we can't bootstrap from).
        if not await _table_exists(engine, "game_source"):
            raise SchemaBootstrapError(
                "alembic_bootstrap: no marker satisfied and game_source is absent. "
                "metadata.create_all should have created game_source before this "
                "bootstrap ran. Confirm db/schema.py imports and the lifespan order."
            )
        raise SchemaBootstrapError(
            "alembic_bootstrap: existing game_source table lacks expected "
            "v1.0 baseline columns (client_game_id). The database appears to "
            "be at a pre-v1.0 schema state that can't be bootstrapped into "
            "Alembic automatically. Run the prior manual migration scripts in "
            "backend/scripts/ (in numerical order) to reach the v1.0 baseline, "
            "then restart the backend."
        )

    logger.info(
        "alembic_bootstrap: stamping alembic_version at revision %s",
        revision,
    )
    await asyncio.to_thread(command.stamp, cfg, revision)
    logger.info("alembic_bootstrap: running upgrade head")
    await asyncio.to_thread(command.upgrade, cfg, "head")
