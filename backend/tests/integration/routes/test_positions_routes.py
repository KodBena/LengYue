"""
tests/integration/routes/test_positions_routes.py

Route-layer tests for POST /positions/hash — the stateless
position-hashing endpoint from card-position-annotations Stage A
(see the ratified design at
``.claude/dispatch-reports/card-position-annotations-design.md``).

Verified surfaces:

  - Hashing the same content twice returns the same content_hash.
  - Hashing different content returns a different content_hash.
  - The hash matches what minting the same content via POST /cards
    produces on the resulting card's `content_hash` field — the
    "one identity, one home" contract §1 of the design names: the
    route calls the exact same normalizer CardService.create_card
    uses, so the two paths can never silently drift.
  - Malformed SGF returns 422 (same ValueError -> InvalidInputError
    translation CardService.create_card uses).
  - No bearer returns 401 — this route depends on
    get_current_user_id like the rest of the card surface (see the
    route's module docstring for why, despite the computation itself
    not being tenant-scoped).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from tests.integration.routes.conftest import auth_header, seed_user, ALICE_ID

pytestmark = pytest.mark.integration


VALID_SGF = "(;FF[4]SZ[19]PW[Alice]PB[Bob];B[pd];W[dp])"
OTHER_VALID_SGF = "(;FF[4]SZ[19]PW[Alice]PB[Bob];B[pd];W[qp])"


async def test_hash_position_same_content_twice_same_hash(client, session):
    await seed_user(session, user_id=ALICE_ID)

    r1 = await client.post(
        "/positions/hash",
        json={"raw_content": VALID_SGF},
        headers=auth_header(ALICE_ID),
    )
    r2 = await client.post(
        "/positions/hash",
        json={"raw_content": VALID_SGF},
        headers=auth_header(ALICE_ID),
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["content_hash"] == r2.json()["content_hash"]
    # Lowercase-hex SHA-256: 64 hex chars.
    assert len(r1.json()["content_hash"]) == 64
    int(r1.json()["content_hash"], 16)  # raises if not valid hex


async def test_hash_position_different_content_different_hash(client, session):
    await seed_user(session, user_id=ALICE_ID)

    r1 = await client.post(
        "/positions/hash",
        json={"raw_content": VALID_SGF},
        headers=auth_header(ALICE_ID),
    )
    r2 = await client.post(
        "/positions/hash",
        json={"raw_content": OTHER_VALID_SGF},
        headers=auth_header(ALICE_ID),
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["content_hash"] != r2.json()["content_hash"]


async def test_hash_position_matches_minted_card_content_hash(client, session):
    """
    "One identity, one home" (design §1): the hash this endpoint
    returns for a raw content string must equal the content_hash a
    card minted from that exact content ends up with.
    """
    await seed_user(session, user_id=ALICE_ID)

    hash_response = await client.post(
        "/positions/hash",
        json={"raw_content": VALID_SGF},
        headers=auth_header(ALICE_ID),
    )
    assert hash_response.status_code == 200
    predicted_hash = hash_response.json()["content_hash"]

    mint_response = await client.post(
        "/cards/",
        json={
            "raw_content": VALID_SGF,
            "num_moves": 2,
            "game_metadata": {},
        },
        headers=auth_header(ALICE_ID),
    )
    assert mint_response.status_code == 201
    card_id = mint_response.json()["card_id"]

    get_response = await client.get(
        f"/cards/{card_id}", headers=auth_header(ALICE_ID),
    )
    assert get_response.status_code == 200
    assert get_response.json()["content_hash"] == predicted_hash


async def test_hash_position_malformed_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/positions/hash",
        json={"raw_content": "not an sgf"},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_hash_position_without_bearer_returns_401(client):
    response = await client.post(
        "/positions/hash",
        json={"raw_content": VALID_SGF},
    )
    assert response.status_code == 401
