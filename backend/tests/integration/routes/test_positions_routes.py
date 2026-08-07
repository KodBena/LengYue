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


# ─── POST /positions/hash-batch (Stage B) ──────────────────────────────
#
# card-position-annotations Stage B (design §5 / §6) — batches the same
# per-item normalize+hash computation the single endpoint above performs,
# so the SPA's tree-node cache can hash every currently-rendered node in
# one round trip. Failure paths first per backend/tests/CLAUDE.md.


async def test_hash_position_batch_over_cap_returns_413(client, session):
    """config.POSITIONS_HASH_BATCH_MAX caps the batch; over it is 413,
    not 422 — a resource-limit rejection, distinct from malformed
    content (domain/errors.py's ResourceLimitError axis)."""
    from core.config import config

    await seed_user(session, user_id=ALICE_ID)
    too_many = [VALID_SGF] * (config.POSITIONS_HASH_BATCH_MAX + 1)

    response = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": too_many},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 413
    body = response.json()["detail"]
    assert body["kind"] == "position_hash_batch_too_large"
    assert body["received"] == config.POSITIONS_HASH_BATCH_MAX + 1
    assert body["maximum"] == config.POSITIONS_HASH_BATCH_MAX


async def test_hash_position_batch_empty_list_returns_422(client, session):
    """min_length=1 on raw_contents — an empty batch is a malformed
    request (pydantic validation), not a degenerate 200 with an empty
    response."""
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": []},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_hash_position_batch_malformed_item_returns_422(client, session):
    """One malformed item fails the WHOLE batch (no partial/sparse
    result) — the route docstring's documented "ambiguous partial
    success is worse than a loud rejection" contract."""
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": [VALID_SGF, "not an sgf", OTHER_VALID_SGF]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
    # Names the first-failing index (1) so a caller can localize the fault.
    assert "index 1" in response.json()["detail"]


async def test_hash_position_batch_without_bearer_returns_401(client):
    response = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": [VALID_SGF]},
    )
    assert response.status_code == 401


async def test_hash_position_batch_happy_path_matches_single_endpoint(client, session):
    """Batch order is preserved and each hash matches what the single
    endpoint returns for the same content — "one identity, one home"
    extended to the batch surface."""
    await seed_user(session, user_id=ALICE_ID)

    single_1 = await client.post(
        "/positions/hash", json={"raw_content": VALID_SGF}, headers=auth_header(ALICE_ID),
    )
    single_2 = await client.post(
        "/positions/hash", json={"raw_content": OTHER_VALID_SGF}, headers=auth_header(ALICE_ID),
    )
    assert single_1.status_code == 200
    assert single_2.status_code == 200

    batch = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": [VALID_SGF, OTHER_VALID_SGF, VALID_SGF]},
        headers=auth_header(ALICE_ID),
    )
    assert batch.status_code == 200
    hashes = batch.json()["content_hashes"]
    assert len(hashes) == 3
    assert hashes[0] == single_1.json()["content_hash"]
    assert hashes[1] == single_2.json()["content_hash"]
    assert hashes[2] == single_1.json()["content_hash"]  # repeated content, repeated hash


async def test_hash_position_batch_single_item(client, session):
    """The minimum valid batch (one item) works — the min_length=1
    boundary's happy-path twin."""
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/positions/hash-batch",
        json={"raw_contents": [VALID_SGF]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert len(response.json()["content_hashes"]) == 1
