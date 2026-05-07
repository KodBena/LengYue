"""
tests/integration/routes/test_auth_routes.py

Route-layer tests for /auth/register, /auth/token, /auth/me.

Verified surfaces:

  - Register (201) creates a user; duplicate username 400.
  - Token (200) issues a JWT for a passwordless user when
    ALLOW_PASSWORDLESS_LOGIN is True; 401 for bad password and
    for a non-existent username (collapsed onto the same opaque
    detail per item 9c).
  - /auth/me (200) returns ``{id, username, has_password}`` for
    a valid bearer token.
  - /auth/me 401 paths: missing bearer; malformed token; wrong-
    secret token; valid token referring to a vanished user. All
    converge on the same detail body and ``WWW-Authenticate:
    Bearer`` header.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import jwt
import pytest
from sqlalchemy import select

from core.config import config
from db.schema import users
from tests.integration.routes.conftest import (
    auth_header,
    bearer_token_for,
    seed_user,
    ALICE_ID,
)

pytestmark = pytest.mark.integration


# ─── /auth/register ───────────────────────────────────────────────────────────


async def test_register_creates_passwordless_user(client, session):
    response = await client.post(
        "/auth/register", json={"username": "alice"},
    )
    assert response.status_code == 201

    rows = (await session.execute(select(users))).fetchall()
    assert len(rows) == 1
    assert rows[0].username == "alice"
    assert rows[0].has_password is False
    assert rows[0].bcrypt_hash is None


async def test_register_creates_password_user(client, session):
    response = await client.post(
        "/auth/register",
        json={"username": "alice", "password": "secret"},
    )
    assert response.status_code == 201

    row = (await session.execute(select(users))).fetchone()
    assert row.has_password is True
    assert row.bcrypt_hash is not None


async def test_register_duplicate_username_returns_400(client):
    await client.post("/auth/register", json={"username": "alice"})
    response = await client.post(
        "/auth/register", json={"username": "alice"},
    )
    assert response.status_code == 400


# ─── /auth/token ──────────────────────────────────────────────────────────────


async def test_token_passwordless_login_returns_jwt(client):
    """
    With ALLOW_PASSWORDLESS_LOGIN=True (the default for transparent
    local install), a registered passwordless user can obtain a JWT.
    OAuth2PasswordRequestForm requires the ``password`` form field to
    be present (FastAPI's ``Form(...)`` rejects missing fields with
    422); the server ignores the value when the account is
    passwordless. Tests send an arbitrary placeholder.
    """
    await client.post("/auth/register", json={"username": "alice"})
    response = await client.post(
        "/auth/token",
        data={"username": "alice", "password": "ignored"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    # The token decodes to the user's id.
    payload = jwt.decode(
        body["access_token"], config.SECRET_KEY, algorithms=["HS256"],
    )
    assert int(payload["sub"]) > 0


async def test_token_unknown_username_returns_401(client):
    """User-not-found path: 401 with the opaque detail (item 9c)."""
    response = await client.post(
        "/auth/token",
        data={"username": "ghost", "password": "anything"},
    )
    assert response.status_code == 401


async def test_token_password_user_with_wrong_password_returns_401(client):
    await client.post(
        "/auth/register",
        json={"username": "alice", "password": "secret"},
    )
    response = await client.post(
        "/auth/token",
        data={"username": "alice", "password": "wrong"},
    )
    assert response.status_code == 401


async def test_token_password_user_with_correct_password_returns_jwt(client):
    await client.post(
        "/auth/register",
        json={"username": "alice", "password": "secret"},
    )
    response = await client.post(
        "/auth/token",
        data={"username": "alice", "password": "secret"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


# ─── /auth/me — happy path ────────────────────────────────────────────────────


async def test_me_returns_identity_for_valid_bearer(client, session):
    await seed_user(
        session, user_id=ALICE_ID, username="alice", has_password=False,
    )

    response = await client.get(
        "/auth/me", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "id": ALICE_ID,
        "username": "alice",
        "has_password": False,
    }
    # bcrypt_hash never crosses the wire.
    assert "bcrypt_hash" not in body


async def test_me_does_not_leak_bcrypt_hash_for_password_user(client, session):
    await seed_user(
        session, user_id=ALICE_ID, username="alice", has_password=True,
    )

    response = await client.get(
        "/auth/me", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert "bcrypt_hash" not in response.json()


# ─── /auth/me — 401 paths ─────────────────────────────────────────────────────


async def test_me_without_bearer_returns_401(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_with_malformed_bearer_returns_401(client):
    response = await client.get(
        "/auth/me",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


async def test_me_with_wrong_secret_token_returns_401(client, session):
    await seed_user(session, user_id=ALICE_ID)

    # Mint a JWT with a different secret.
    bad_token = jwt.encode(
        {"sub": str(ALICE_ID)}, key="wrong-secret", algorithm="HS256",
    )
    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {bad_token}"},
    )
    assert response.status_code == 401


async def test_me_with_token_missing_sub_returns_401(client):
    bad_token = jwt.encode(
        {"not_sub": "1"}, key=config.SECRET_KEY, algorithm="HS256",
    )
    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {bad_token}"},
    )
    assert response.status_code == 401


async def test_me_with_token_referencing_vanished_user_returns_401(client):
    """
    Valid JWT, but the user_id no longer corresponds to a row.
    Same opaque detail as the other 401 paths — the recovery
    action is identical (drop the token, re-auth).
    """
    response = await client.get(
        "/auth/me", headers=auth_header(99_999),
    )
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
