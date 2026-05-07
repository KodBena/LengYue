"""
tests/integration/routes/test_documents_routes.py

Route-layer tests for /documents/{key}.

Verified:

  - GET on a missing key returns ``{"key": <key>, "data": {}}``
    (the "missing = empty" contract item 5 of the frontend
    documented).
  - PUT followed by GET returns the persisted data.
  - Item 23 (tenancy): two users sharing a key get distinct
    values; one cannot read or overwrite the other's row.
  - 401 without bearer.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


# ─── GET (missing-as-empty contract) ──────────────────────────────────────────


async def test_get_document_missing_key_returns_empty_data(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.get(
        "/documents/never_written_key",
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json() == {
        "key": "never_written_key",
        "data": {},
    }


async def test_get_document_after_put_returns_persisted_data(client, session):
    await seed_user(session, user_id=ALICE_ID)

    put_response = await client.put(
        "/documents/user_workspace_settings",
        json={"data": {"theme": "dark", "active_tab": "review"}},
        headers=auth_header(ALICE_ID),
    )
    assert put_response.status_code == 200
    assert put_response.json() == {"status": "ok"}

    get_response = await client.get(
        "/documents/user_workspace_settings",
        headers=auth_header(ALICE_ID),
    )
    assert get_response.status_code == 200
    body = get_response.json()
    assert body["key"] == "user_workspace_settings"
    assert body["data"] == {"theme": "dark", "active_tab": "review"}


async def test_put_overwrites_existing_value(client, session):
    await seed_user(session, user_id=ALICE_ID)

    await client.put(
        "/documents/key1",
        json={"data": {"v": 1}},
        headers=auth_header(ALICE_ID),
    )
    await client.put(
        "/documents/key1",
        json={"data": {"v": 2}},
        headers=auth_header(ALICE_ID),
    )
    response = await client.get(
        "/documents/key1", headers=auth_header(ALICE_ID),
    )
    assert response.json()["data"] == {"v": 2}


# ─── Tenancy (item 23) ────────────────────────────────────────────────────────


async def test_two_users_sharing_a_key_get_distinct_values(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    await client.put(
        "/documents/shared_key",
        json={"data": {"who": "alice"}},
        headers=auth_header(ALICE_ID),
    )
    await client.put(
        "/documents/shared_key",
        json={"data": {"who": "bob"}},
        headers=auth_header(BOB_ID),
    )

    alice = await client.get(
        "/documents/shared_key", headers=auth_header(ALICE_ID),
    )
    bob = await client.get(
        "/documents/shared_key", headers=auth_header(BOB_ID),
    )
    assert alice.json()["data"] == {"who": "alice"}
    assert bob.json()["data"] == {"who": "bob"}


async def test_get_document_cross_tenant_returns_empty_data(client, session):
    """
    Bob asking for a key Alice has written sees the missing-as-empty
    payload — never Alice's data. Item 23 tenancy.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    await client.put(
        "/documents/key1",
        json={"data": {"secret": "alice"}},
        headers=auth_header(ALICE_ID),
    )

    bob_response = await client.get(
        "/documents/key1", headers=auth_header(BOB_ID),
    )
    assert bob_response.status_code == 200
    assert bob_response.json() == {"key": "key1", "data": {}}


# ─── 401 surface ──────────────────────────────────────────────────────────────


async def test_get_document_without_bearer_returns_401(client):
    response = await client.get("/documents/anything")
    assert response.status_code == 401


async def test_put_document_without_bearer_returns_401(client):
    response = await client.put(
        "/documents/anything", json={"data": {}},
    )
    assert response.status_code == 401
