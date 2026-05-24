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
from typing import Awaitable, Callable, List, Optional, Tuple

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
    ("game_source", "created_at", "0002_sgf_library_columns"),
]


def _load_legacy_chain() -> List[Tuple[str, Callable[[], Awaitable[None]]]]:
    """Import the legacy migration scripts and return the
    dependency-ordered chain that brings a pre-Alembic schema
    forward to the v1.0 baseline.

    Deferred-import so that test runs against fresh DBs don't pay
    the cost of loading seven modules they won't exercise; the
    chain is only consulted on the rare-but-real pre-v1.0
    bootstrap path.

    Each script's ``migrate()`` is idempotent — calls on
    already-applied schemas detect the existing state and skip
    the relevant DDL. The chain is therefore safe to run on any
    pre-baseline state; missing pieces apply, present pieces are
    no-ops.

    Order is dependency-driven (not strictly numerical):

    - 23 / 24: add ``user_id`` to ``documents`` / ``game_source``.
      Tenancy plumbing; independent of each other but both must
      land before later migrations that filter on user_id.
    - 34a: rename ``pos_hash → content_hash``,
      ``normalized_sgf → canonical_content`` on
      ``normalized_position``.
    - 34b (relocate then drop): move ``default_visits`` from a
      column to a JSON field in ``grading_parameter``; drop the
      now-unused column. Relocate before drop.
    - ``add_client_game_id``: requires ``game_source.user_id``
      (from 24).
    - ``create_analysis_bundles``: a new table; no prior
      dependency.
    """
    from scripts import (  # noqa: E402 — deferred per the docstring
        migrate_23_add_user_id_to_documents,
        migrate_24_add_user_id_to_game_source,
        migrate_34a_rename_columns,
        migrate_34b_drop_default_visits_column,
        migrate_34b_relocate_default_visits,
        migrate_add_client_game_id_to_game_source,
        migrate_create_analysis_bundles,
    )

    return [
        ("23: documents.user_id", migrate_23_add_user_id_to_documents.migrate),
        ("24: game_source.user_id", migrate_24_add_user_id_to_game_source.migrate),
        ("34a: rename pos_hash → content_hash etc.", migrate_34a_rename_columns.migrate),
        (
            "34b: relocate default_visits into grading_parameter",
            migrate_34b_relocate_default_visits.migrate,
        ),
        (
            "34b: drop default_visits column",
            migrate_34b_drop_default_visits_column.migrate,
        ),
        (
            "add_client_game_id: game_source.client_game_id + partial unique",
            migrate_add_client_game_id_to_game_source.migrate,
        ),
        (
            "create_analysis_bundles: new table",
            migrate_create_analysis_bundles.migrate,
        ),
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
         exist → ``metadata.create_all`` should have created
         ``game_source`` before this bootstrap ran. If it didn't,
         the lifespan order is wrong; raise loudly.
       - No marker satisfied AND ``game_source`` exists → pre-v1.0
         schema. Run the legacy migration chain (the pre-Alembic
         ``scripts/migrate_*.py`` ``migrate()`` functions, invoked
         in dependency order; each is idempotent) to bring the
         schema forward to the v1.0 baseline. Re-probe. If the
         post-chain probe still finds no marker, raise — the
         chain didn't reach a known baseline, which is a defect
         in the chain definition rather than a user error.

    The pre-v1.0 path is what makes the bootstrap robust against
    real legacy installs and the (intentionally pre-v1.0) sample
    DB shipped under ``samples/``. End-users on any pre-Alembic
    schema get a one-restart upgrade; no manual ``migrate_*.py``
    invocations required.

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
        # (post-create_all should have populated markers — defect)
        # from "game_source exists at a pre-v1.0 state" (real
        # legacy install — recoverable via the chain).
        if not await _table_exists(engine, "game_source"):
            raise SchemaBootstrapError(
                "alembic_bootstrap: no marker satisfied and game_source is absent. "
                "metadata.create_all should have created game_source before this "
                "bootstrap ran. Confirm db/schema.py imports and the lifespan order."
            )

        logger.info(
            "alembic_bootstrap: pre-v1.0 schema detected (game_source present, "
            "no v1.0 markers) — running legacy migration chain to reach baseline"
        )
        await _run_legacy_chain(engine)

        # Re-probe. The chain ran every legacy migration in order;
        # if no marker is now satisfied, the chain is mis-defined
        # relative to the actual baseline state Alembic stamps to.
        revision = await _probe_revision(engine)
        if revision is None:
            raise SchemaBootstrapError(
                "alembic_bootstrap: legacy migration chain ran but the post-chain "
                "schema still doesn't satisfy any REVISION_MARKERS entry. The chain "
                "definition in `_load_legacy_chain` is out of step with the marker "
                "registry; this is a defect in the bootstrap, not a user error."
            )

    logger.info(
        "alembic_bootstrap: stamping alembic_version at revision %s",
        revision,
    )
    await asyncio.to_thread(command.stamp, cfg, revision)
    logger.info("alembic_bootstrap: running upgrade head")
    await asyncio.to_thread(command.upgrade, cfg, "head")


async def _run_legacy_chain(engine: AsyncEngine) -> None:
    """Walk the dependency-ordered chain of pre-Alembic migration
    scripts, invoking each ``migrate()`` in turn. The scripts open
    their own engines via ``core.config.DATABASE_URI`` — the same
    URI this bootstrap's engine uses — so no engine-sharing is
    required.

    Each script's ``migrate()`` is idempotent. Running the full
    chain on a partially-migrated DB applies only the missing
    steps; running it on an already-v1.0 DB is a chain of no-ops
    (but in practice that case is handled upstream by the marker
    probe and never reaches here).

    The ``engine`` argument is unused — the legacy scripts manage
    their own engines — but accepted for symmetry with the rest
    of the bootstrap API and to make this function easier to
    extend if a future migration needs the bootstrap's existing
    connection.
    """
    del engine  # parameter accepted for API symmetry; see docstring
    for description, migrate_fn in _load_legacy_chain():
        logger.info("alembic_bootstrap: legacy chain — %s", description)
        await migrate_fn()
