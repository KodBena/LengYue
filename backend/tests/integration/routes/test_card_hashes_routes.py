"""
tests/integration/routes/test_card_hashes_routes.py

Route-layer tests for GET /cards/hashes — the bulk
content_hash/card_id fetch that backs the SPA's known-positions
boot-time hydrate (see
`.claude/dispatch-reports/card-position-annotations-design.md`, §3
"Recommend (b)", and `.claude/dispatch-reports/
known-positions-boot-hydrate.md`).

Verified surfaces:

  - Returns every (content_hash, card_id) pair for the caller's own
    cards.
  - Does NOT return another tenant's cards' pairs (item 13's
    tenancy filter).
  - Returns an empty list for a user with no cards, rather than a
    404 or an error — an absent set is a valid, distinct-from-error
    result.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib
from itertools import count
from uuid import uuid4

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

import pytest

# Started at a high offset per test_cards_routes.py's identical
# rationale: avoids colliding with production-path-assigned ordinals
# in tests that also drive POST /cards for the same seeded user.
_ordinal = count(200_000)

from db.schema import card, card_source, game_source, normalized_position
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


async def _seed_position(session: AsyncSession, *, content: str) -> tuple[int, bytes]:
    digest = hashlib.sha256(content.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=content)
        .returning(normalized_position.c.id)
    )
    return int(res.scalar()), digest


async def _seed_card_with_root(
    session: AsyncSession, *, user_id: int, content: str
) -> tuple[int, bytes]:
    """
    Seeds a root card (with its normalized_position and card_source
    rows) directly, bypassing POST /cards. Returns (card_id,
    content_hash_bytes).
    """
    pos_id, digest = await _seed_position(session, content=content)
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5, alpha=3.0, beta=3.0, t=1.0,
            user_id=user_id, normalized_position_id=pos_id,
            public_id=uuid4(), display_ordinal=next(_ordinal),
        )
        .returning(card.c.id)
    )
    cid = int(res.scalar())
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=pos_id, user_id=user_id,
            client_game_id=uuid4(), display_ordinal=next(_ordinal),
        )
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())
    await session.execute(insert(card_source).values(
        card_id=cid, game_source_id=gs_id, is_primary_source=True,
    ))
    await session.commit()
    return cid, digest


async def test_get_card_hashes_returns_own_cards(client, session):
    await seed_user(session, user_id=ALICE_ID)
    cid1, digest1 = await _seed_card_with_root(
        session, user_id=ALICE_ID, content="(;FF[4]SZ[19]PW[A]PB[B])"
    )
    cid2, digest2 = await _seed_card_with_root(
        session, user_id=ALICE_ID, content="(;FF[4]SZ[19]PW[C]PB[D])"
    )

    response = await client.get("/cards/hashes", headers=auth_header(ALICE_ID))

    assert response.status_code == 200
    body = response.json()
    pairs = {(entry["content_hash"], entry["card_id"]) for entry in body}
    assert (digest1.hex(), cid1) in pairs
    assert (digest2.hex(), cid2) in pairs
    assert len(body) == 2


async def test_get_card_hashes_does_not_leak_other_tenants_cards(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    alice_cid, alice_digest = await _seed_card_with_root(
        session, user_id=ALICE_ID, content="(;FF[4]SZ[19]PW[A]PB[B])"
    )
    bob_cid, bob_digest = await _seed_card_with_root(
        session, user_id=BOB_ID, content="(;FF[4]SZ[19]PW[E]PB[F])"
    )

    alice_response = await client.get("/cards/hashes", headers=auth_header(ALICE_ID))
    bob_response = await client.get("/cards/hashes", headers=auth_header(BOB_ID))

    assert alice_response.status_code == 200
    assert bob_response.status_code == 200

    alice_pairs = {(e["content_hash"], e["card_id"]) for e in alice_response.json()}
    bob_pairs = {(e["content_hash"], e["card_id"]) for e in bob_response.json()}

    assert alice_pairs == {(alice_digest.hex(), alice_cid)}
    assert bob_pairs == {(bob_digest.hex(), bob_cid)}
    # Belt-and-braces: neither tenant's set contains the other's pair.
    assert (bob_digest.hex(), bob_cid) not in alice_pairs
    assert (alice_digest.hex(), alice_cid) not in bob_pairs


async def test_get_card_hashes_empty_for_user_with_no_cards(client, session):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.get("/cards/hashes", headers=auth_header(ALICE_ID))

    assert response.status_code == 200
    assert response.json() == []


async def test_get_card_hashes_requires_auth(client, session):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.get("/cards/hashes")

    assert response.status_code == 401
