"""
tests/integration/routes/test_cards_batch_routes.py

Route-layer tests for POST /cards/batch — the transactional batch
card mint (ratified wire contract, ledger rows 884/885/886).

Verified surfaces:

  - Mid-batch failure (invalid member at index k) -> 4xx naming
    index k, DB row count unchanged, per-user display counters
    unchanged. This is the rollback witness: the load-bearing test
    per the commission — a real in-memory SQLite database (not a
    Port fake) is required to observe an actual transaction
    rollback, since `CardService.create_cards_batch` itself has no
    transaction concept (see tests/unit/services/test_card_service.py's
    docstring on that split).
  - Forward/self batch_index reference -> 422 naming the index,
    nothing inserted.
  - Cross-tenant parent card_id -> 404, nothing inserted.
  - Happy path: anchor (parent_ref null) + child (batch_index 0) +
    grandchild (batch_index 1) -> correct lineage rows, ordered
    card_ids, content_hash present on each (via a follow-up GET —
    the batch response itself is deliberately the thin
    `{"card_ids": [...]}` shape per the ratified contract).
  - Over-cap batch -> 413 with the structured `cards_batch_too_large`
    body.
  - Concurrency: two batches racing for the same user serialize
    cleanly (see tests/integration/repositories/
    test_cards_batch_concurrency.py — a route-level in-memory SQLite
    client can't witness genuine concurrency, per
    test_display_counters_concurrency.py's own documented reason:
    StaticPool shares one DBAPI connection across sessions).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import config
from db.schema import card, user_display_counters
from tests.integration.routes.conftest import (
    ALICE_ID,
    BOB_ID,
    auth_header,
    seed_user,
)

pytestmark = pytest.mark.integration


async def _card_count(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(card))).scalar()


async def _counter_row(session: AsyncSession, *, user_id: int):
    res = await session.execute(
        select(user_display_counters).where(
            user_display_counters.c.user_id == user_id
        )
    )
    return res.first()


def _root(raw_content: str, **kwargs) -> dict:
    return {
        "raw_content": raw_content,
        "num_moves": 5,
        "parent_ref": None,
        "game_metadata": {},
        **kwargs,
    }


def _branch(raw_content: str, parent_ref: dict, **kwargs) -> dict:
    return {
        "raw_content": raw_content,
        "num_moves": 5,
        "parent_ref": parent_ref,
        **kwargs,
    }


# ─── The rollback witness (failure-mode first, per CLAUDE.md) ────────────────


async def test_mid_batch_failure_rolls_back_all_rows_and_counters(client, session):
    """
    The load-bearing test. A batch where member index 2 fails (a
    forward batch_index reference) must leave: zero new card rows,
    and the per-user display counter untouched — even though members
    0 and 1 would have succeeded on their own. This is what makes
    the endpoint transactional rather than a loop of independent
    creates (ADR-0012).
    """
    await seed_user(session, user_id=ALICE_ID)
    before_count = await _card_count(session)
    before_counter = await _counter_row(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _root("(;FF[4]C[ok-0])"),
                _root("(;FF[4]C[ok-1])"),
                _branch(
                    "(;FF[4]C[bad-2])",
                    {"batch_index": 5},  # forward/nonexistent reference
                ),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
    assert "2" in response.json()["detail"]

    after_count = await _card_count(session)
    after_counter = await _counter_row(session, user_id=ALICE_ID)
    assert after_count == before_count
    assert after_counter == before_counter


async def test_mid_batch_cross_tenant_parent_rolls_back(client, session):
    """
    Same rollback witness, but the failure mode is a cross-tenant
    `parent_ref.card_id` at a later index (not the first member).
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    # Seed Bob's own card so there's something cross-tenant to
    # reference.
    bob_response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4]C[bob-root])",
            "num_moves": 5,
            "game_metadata": {},
        },
        headers=auth_header(BOB_ID),
    )
    assert bob_response.status_code == 201
    bobs_card_id = bob_response.json()["card_id"]

    before_count = await _card_count(session)
    before_counter = await _counter_row(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _root("(;FF[4]C[alice-ok])"),
                _branch("(;FF[4]C[alice-bad])", {"card_id": bobs_card_id}),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404
    assert "1" in response.json()["detail"]

    after_count = await _card_count(session)
    after_counter = await _counter_row(session, user_id=ALICE_ID)
    assert after_count == before_count
    assert after_counter == before_counter


# ─── Forward/self batch_index reference — 422, nothing inserted ─────────────


async def test_self_batch_index_reference_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    before_count = await _card_count(session)

    response = await client.post(
        "/cards/batch",
        json={"cards": [_branch("(;FF[4])", {"batch_index": 0})]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
    assert "0" in response.json()["detail"]
    assert await _card_count(session) == before_count


async def test_forward_batch_index_reference_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    before_count = await _card_count(session)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _branch("(;FF[4]C[a])", {"batch_index": 1}),
                _root("(;FF[4]C[b])"),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
    assert await _card_count(session) == before_count


# ─── Cross-tenant parent card_id — 404, nothing inserted ────────────────────


async def test_cross_tenant_parent_card_id_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    bob_response = await client.post(
        "/cards/",
        json={
            "raw_content": "(;FF[4]C[bob-root2])",
            "num_moves": 5,
            "game_metadata": {},
        },
        headers=auth_header(BOB_ID),
    )
    bobs_card_id = bob_response.json()["card_id"]
    before_count = await _card_count(session)

    response = await client.post(
        "/cards/batch",
        json={"cards": [_branch("(;FF[4]C[x])", {"card_id": bobs_card_id})]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404
    assert await _card_count(session) == before_count


async def test_nonexistent_parent_card_id_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={"cards": [_branch("(;FF[4])", {"card_id": 999_999})]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


# ─── 401 / 422 wire-shape ─────────────────────────────────────────────────


async def test_post_cards_batch_without_bearer_returns_401(client):
    response = await client.post(
        "/cards/batch", json={"cards": [_root("(;FF[4])")]},
    )
    assert response.status_code == 401


async def test_post_cards_batch_member_with_both_parent_ref_and_game_metadata_returns_422(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                {
                    "raw_content": "(;FF[4])",
                    "num_moves": 5,
                    "parent_ref": {"batch_index": 0},
                    "game_metadata": {},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_post_cards_batch_member_with_neither_returns_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/cards/batch",
        json={"cards": [{"raw_content": "(;FF[4])", "num_moves": 5}]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


# ─── Over-cap batch — 413 ─────────────────────────────────────────────────


async def test_over_cap_batch_returns_413(client, session, monkeypatch):
    monkeypatch.setattr(config, "CARDS_BATCH_MINT_MAX", 2)
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _root("(;FF[4]C[1])"),
                _root("(;FF[4]C[2])"),
                _root("(;FF[4]C[3])"),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 413
    body = response.json()["detail"]
    assert body["kind"] == "cards_batch_too_large"
    assert body["received"] == 3
    assert body["maximum"] == 2


# ─── Happy path ───────────────────────────────────────────────────────────


async def test_anchor_child_grandchild_batch_happy_path(client, session):
    """
    The commission's worked example: anchor (parent_ref null) +
    child (batch_index 0) + grandchild (batch_index 1) in one
    request. Verifies ordered card_ids, correct lineage, and that
    each minted card carries a content_hash via a follow-up GET
    (the wire field known-positions depends on).
    """
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _root("(;FF[4])"),
                _branch("(;FF[4]C[child])", {"batch_index": 0}),
                _branch("(;FF[4]C[grandchild])", {"batch_index": 1}),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 201
    body = response.json()
    card_ids = body["card_ids"]
    assert len(card_ids) == 3
    assert len(set(card_ids)) == 3
    anchor_id, child_id, grandchild_id = card_ids

    for cid in card_ids:
        get_resp = await client.get(
            f"/cards/{cid}", headers=auth_header(ALICE_ID),
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["content_hash"]

    # Lineage, verified via GET's card_source_id-derived projection
    # is not directly exposed on CardWithRecall; verify at the DB
    # level instead.
    from db.schema import card_source

    rows = (
        await session.execute(
            select(card_source.c.card_id, card_source.c.card_source_id)
            .where(card_source.c.card_id.in_(card_ids))
        )
    ).all()
    lineage = {row.card_id: row.card_source_id for row in rows}
    assert lineage[child_id] == anchor_id
    assert lineage[grandchild_id] == child_id
    assert lineage[anchor_id] is None


async def test_duplicate_position_members_permitted(client, session):
    """
    Duplicate-position members are permitted exactly as POST /cards/
    permits duplicates — no server-side silent skip.
    """
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/cards/batch",
        json={
            "cards": [
                _root("(;FF[4]C[dup])"),
                _root("(;FF[4]C[dup])"),
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 201
    card_ids = response.json()["card_ids"]
    assert len(card_ids) == 2
    assert card_ids[0] != card_ids[1]
