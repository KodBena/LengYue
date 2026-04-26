"""
tests/integration/conftest.py
==============================
Shared async fixtures for all integration tests.

Every test in tests/integration/ that needs a database gets a fresh,
isolated in-memory SQLite session.  The schema is created from
``db.schema.metadata`` (the same SQLAlchemy Table definitions the
production code uses) so there is no drift between test and prod schema.

Isolation contract
------------------
- Each test function gets its OWN session and its OWN in-memory database.
  Nothing persists between tests.
- ``TreeBuilder`` is provided as a pre-configured fixture so tests don't
  need to call ``setup_base()`` manually.
"""
import pytest
import pytest_asyncio

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from db.schema import metadata
from tests.helpers import TreeBuilder


@pytest_asyncio.fixture
async def async_session() -> AsyncSession:
    """
    Yield a single AsyncSession backed by a fresh in-memory SQLite database.

    Schema is created on entry, dropped implicitly when the engine is disposed
    (the database vanishes with the connection).
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        # SQLite requires this to honour foreign key constraints.
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_session(async_session: AsyncSession) -> tuple[AsyncSession, TreeBuilder]:
    """
    Yield (session, builder) where builder has already called setup_base().

    Use this fixture when tests need to insert trees without boilerplate.
    """
    builder = TreeBuilder(async_session)
    await builder.setup_base()
    return async_session, builder
