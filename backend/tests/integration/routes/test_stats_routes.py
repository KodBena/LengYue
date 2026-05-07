"""
tests/integration/routes/test_stats_routes.py

Route-layer tests for /stats/tags and /stats/forests.

Verified:

  - /stats/tags: returns the caller's tag usage; cross-tenant
    counts are not leaked (the privacy bug fixed in Phase 2 is
    pinned at the wire surface here).
  - /stats/forests: returns one ForestStat per game-source root;
    cross-tenant forests not visible.
  - 401 without bearer.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import (
    card,
    card_source,
    card_tag,
    game_source,
    normalized_position,
    tag,
)
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


# ─── Inline seeding ──────────────────────────────────────────────────────────


async def _seed_position(session: AsyncSession, *, content: str) -> int:
    digest = hashlib.sha256(content.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=content)
        .returning(normalized_position.c.id)
    )
    return int(res.scalar())


async def _seed_card(
    session: AsyncSession, *, user_id: int, position_id: int
) -> int:
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5, alpha=3.0, beta=3.0, t=1.0,
            user_id=user_id, normalized_position_id=position_id,
        )
        .returning(card.c.id)
    )
    return int(res.scalar())


async def _seed_root(
    session: AsyncSession,
    *,
    user_id: int,
    description: str,
) -> tuple[int, int]:
    pos = await _seed_position(session, content=f"(;c[{description}])")
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=pos, user_id=user_id, description=description,
            player_white="W", player_black="B",
        )
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())
    cid = await _seed_card(session, user_id=user_id, position_id=pos)
    await session.execute(insert(card_source).values(
        card_id=cid, game_source_id=gs_id, is_primary_source=True,
    ))
    await session.commit()
    return cid, gs_id


async def _seed_tag_with_cards(
    session: AsyncSession, *, name: str, card_ids: list[int]
) -> None:
    res = await session.execute(
        insert(tag).values(name=name).returning(tag.c.id)
    )
    tag_id = int(res.scalar())
    for cid in card_ids:
        await session.execute(
            insert(card_tag).values(card_id=cid, tag_id=tag_id)
        )
    await session.commit()


# ─── /stats/tags ──────────────────────────────────────────────────────────────


async def test_stats_tags_returns_users_tag_counts(client, session):
    await seed_user(session, user_id=ALICE_ID)
    pos = await _seed_position(session, content="(;c)")
    c1 = await _seed_card(session, user_id=ALICE_ID, position_id=pos)
    c2 = await _seed_card(session, user_id=ALICE_ID, position_id=pos)
    await _seed_tag_with_cards(session, name="attack", card_ids=[c1, c2])

    response = await client.get(
        "/stats/tags", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    by_name = {t["name"]: t["count"] for t in body}
    assert by_name["attack"] == 2


async def test_stats_tags_does_not_leak_cross_tenant_counts(client, session):
    """
    The Phase-2 privacy fix is pinned at the wire surface: a tag
    Bob has used does not leak its non-zero count into Alice's view.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    pos = await _seed_position(session, content="(;c)")
    bobs_card = await _seed_card(session, user_id=BOB_ID, position_id=pos)
    await _seed_tag_with_cards(
        session, name="bobs_secret", card_ids=[bobs_card],
    )

    alice_resp = await client.get(
        "/stats/tags", headers=auth_header(ALICE_ID),
    )
    bob_resp = await client.get(
        "/stats/tags", headers=auth_header(BOB_ID),
    )
    alice_view = {t["name"]: t["count"] for t in alice_resp.json()}
    bob_view = {t["name"]: t["count"] for t in bob_resp.json()}

    # Tag exists globally; Alice sees count=0, Bob sees count=1.
    assert alice_view.get("bobs_secret") == 0
    assert bob_view.get("bobs_secret") == 1


async def test_stats_tags_without_bearer_returns_401(client):
    response = await client.get("/stats/tags")
    assert response.status_code == 401


# ─── /stats/forests ───────────────────────────────────────────────────────────


async def test_stats_forests_returns_one_summary_per_root(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await _seed_root(session, user_id=ALICE_ID, description="A")
    await _seed_root(session, user_id=ALICE_ID, description="B")

    response = await client.get(
        "/stats/forests", headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    descriptions = {f["description"] for f in body}
    assert descriptions == {"A", "B"}


async def test_stats_forests_excludes_cross_tenant_forests(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    await _seed_root(session, user_id=ALICE_ID, description="alice-only")
    await _seed_root(session, user_id=BOB_ID, description="bobs-only")

    alice_resp = await client.get(
        "/stats/forests", headers=auth_header(ALICE_ID),
    )
    bob_resp = await client.get(
        "/stats/forests", headers=auth_header(BOB_ID),
    )
    alice_descs = {f["description"] for f in alice_resp.json()}
    bob_descs = {f["description"] for f in bob_resp.json()}

    assert alice_descs == {"alice-only"}
    assert bob_descs == {"bobs-only"}


async def test_stats_forests_without_bearer_returns_401(client):
    response = await client.get("/stats/forests")
    assert response.status_code == 401
