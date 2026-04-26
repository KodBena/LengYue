"""
Database lifecycle container.

Owns the AsyncEngine and the session factory. Constructed once per
application lifetime in main.py::lifespan and attached to app.state.db
so request-scoped dependencies can reach it via request.app.state.

This replaces the previous module-level engine construction in
api/dependencies.py. The previous pattern made `from api.dependencies
import anything` a side-effecting import (it instantiated a real
connection pool against config.DATABASE_URI as a consequence of the
import statement), which is exactly what makes a codebase test-hostile.

After this refactor:
- Importing from api/dependencies has no I/O side effects.
- Tests construct a Database against an in-memory SQLite URI and
  either supply it via build_app(...) or override get_db directly.
- The engine's lifecycle is bounded by the application's lifecycle —
  dispose() runs in lifespan's finally block on shutdown.
"""
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


@dataclass(frozen=True)
class Database:
    """
    Frozen container for an async SQLAlchemy engine + session factory.

    Constructed via Database.from_uri(...) at application startup.
    Disposed via .dispose() at application shutdown.
    """
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]

    @classmethod
    def from_uri(cls, uri: str, *, echo: bool = False) -> "Database":
        """
        Construct a Database against a SQLAlchemy URI.

        echo: passes through to create_async_engine; keep False in
            production (controlled via config.SQL_ECHO at the call site).
        """
        engine = create_async_engine(uri, echo=echo)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        return cls(engine=engine, session_factory=session_factory)

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """
        Yield an AsyncSession from the factory inside an async context.
        Used by api.dependencies.get_db.
        """
        async with self.session_factory() as session:
            yield session

    async def dispose(self) -> None:
        """Close the engine's connection pool. Idempotent."""
        await self.engine.dispose()
