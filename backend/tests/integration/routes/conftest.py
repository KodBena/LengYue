"""
tests/integration/routes/conftest.py

Route-level integration test infrastructure: a fresh FastAPI app
per test, an in-memory SQLite ``Database`` attached to
``app.state.db``, an httpx ``AsyncClient`` over ASGITransport for
calling routes without an HTTP server, and helpers for minting
bearer JWTs and seeding users.

Each test gets its own app + database. Schema is created via
``metadata.create_all`` (no migration scripts run); test cleanup
is implicit when the engine disposes.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes import (
    analysis_bundles,
    auth,
    cards,
    documents,
    forests,
    library,
    lineage,
    resources,
    stats,
)
from core.database import Database
from core.security import create_access_token
from db.schema import metadata, users


def _build_test_app(db: Database) -> FastAPI:
    """
    Construct a FastAPI app for tests: routers wired, database
    attached to ``app.state.db``, no lifespan, no qEUBO.

    The production ``main.py`` constructs ``app`` at import time
    with a real lifespan that spins up Redis and a thread pool.
    Importing it would side-effect into a Database against the
    configured DATABASE_URI. For tests, build a fresh app each
    time and bind a known in-memory Database.
    """
    app = FastAPI(title="Spaced Repetition API (test)")
    app.state.db = db
    # qEUBO routes are not used by these tests; not wiring the
    # /qeubo router avoids importing the heavy qeubo package.
    app.include_router(analysis_bundles.router)
    app.include_router(auth.router)
    app.include_router(cards.router)
    app.include_router(forests.router)
    app.include_router(documents.router)
    app.include_router(library.router)
    app.include_router(lineage.router)
    app.include_router(resources.router)
    app.include_router(stats.router)
    return app


@pytest_asyncio.fixture
async def test_db() -> AsyncIterator[Database]:
    """
    Fresh in-memory SQLite Database with the schema bootstrapped.
    """
    db = Database.from_uri("sqlite+aiosqlite:///:memory:", echo=False)
    async with db.engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    try:
        yield db
    finally:
        await db.dispose()


@pytest_asyncio.fixture
async def client(test_db: Database) -> AsyncIterator[AsyncClient]:
    """
    httpx ``AsyncClient`` wired to a fresh test app over
    ASGITransport. Use this in routes tests to call the FastAPI
    surface directly.
    """
    app = _build_test_app(test_db)
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture
async def session(test_db: Database) -> AsyncIterator[AsyncSession]:
    """
    Direct AsyncSession on the same test database the routes use.
    Useful for seeding rows the route tests then exercise.
    """
    async with test_db.session() as s:
        yield s


# ─── Auth helpers ────────────────────────────────────────────────────────────


async def seed_user(
    session: AsyncSession,
    *,
    user_id: int,
    username: Optional[str] = None,
    has_password: bool = False,
) -> None:
    """Insert a user row directly into the test database."""
    await session.execute(
        insert(users).values(
            id=user_id,
            username=username or f"u{user_id}",
            has_password=has_password,
        )
    )
    await session.commit()


def bearer_token_for(user_id: int) -> str:
    """
    Mint a JWT for a given user_id. Uses the same
    ``core.security.create_access_token`` the production /auth/token
    route uses.
    """
    return create_access_token(data={"sub": str(user_id)})


def auth_header(user_id: int) -> dict[str, str]:
    """
    Convenience: build the Authorization header for a given user.
    """
    return {"Authorization": f"Bearer {bearer_token_for(user_id)}"}


# Sentinel user ids used across the routes test files. Distinct from
# any real production seed data; aligned with the
# tests/integration/repositories/ convention.
ALICE_ID = 1
BOB_ID = 2
