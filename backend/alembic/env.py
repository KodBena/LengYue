"""
alembic/env.py — Alembic runtime bootstrap (async).

Configures Alembic to consume the same ``DATABASE_URI`` and
``metadata`` the live backend uses, so the ``alembic`` CLI and
the in-process auto-upgrade in ``main.py``'s lifespan target a
single source of truth.

Three deviations from the default ``alembic init -t async`` output:

- ``target_metadata`` is wired to ``db.schema.metadata`` so
  ``autogenerate`` can diff against the declared tables.
- The DB URL comes from ``core.config.DATABASE_URI`` rather than
  ``alembic.ini``'s ``sqlalchemy.url`` (the ini value is a dummy
  placeholder retained only because Alembic's machinery looks for
  the key). One config surface, one truth.
- The script path is appended to ``sys.path`` so ``db.schema`` and
  ``core.config`` resolve when ``alembic`` is invoked from the
  ``backend/`` directory.

License: Public Domain (The Unlicense)
"""
import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Make ``db.schema`` / ``core.config`` importable when the alembic
# CLI is invoked from the backend directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import config as app_config  # noqa: E402
from db.schema import metadata as target_metadata  # noqa: E402

# Alembic Config object — values from alembic.ini, overridable via
# `-x` switches on the CLI.
config = context.config

# Logging config from alembic.ini ([loggers] / [handlers] / [formatters]).
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the alembic.ini dummy ``sqlalchemy.url`` with the live
# backend's DATABASE_URI so the migration target matches the
# running app's database.
config.set_main_option("sqlalchemy.url", app_config.DATABASE_URI)


def run_migrations_offline() -> None:
    """Offline mode — emit SQL without a live DB connection.

    Used by ``alembic upgrade --sql`` for previewing the SQL a
    migration would emit. Not exercised by the live backend; kept
    for operator workflows.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Online mode — connect to the live DB via async SQLAlchemy.

    Alembic itself is sync; the async engine + ``run_sync`` bridge
    is the documented pattern for async setups.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
