"""
tests/integration/repositories/test_stats_repository.py

Adapter-level integration tests for ``StatsRepository`` — the
SQLAlchemy implementation of ``StatsRepositoryPort``.

Two methods, two distinct query shapes:

  - ``fetch_tag_usage`` is a GROUP BY + COUNT over a triple
    LEFT-OUTER-JOIN. The tenancy filter sits inside the join's
    ON clause (per the adapter docstring) so unmatched tag rows
    still appear with count=0 — verifying that placement is
    load-bearing.

  - ``fetch_forest_members`` is a recursive CTE that walks the
    card_source ancestry to assign each card to its root forest.
    Tenancy is enforced at both the base case (only the user's
    own roots start a walk) and the recursive step (the
    descendant card must also be owned by the user — defense
    in depth against historical cross-tenant lineage).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

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
    users,
)
from domain.auth import UserId
from repositories.stats_repository import StatsRepository

pytestmark = pytest.mark.integration


ALICE = UserId(1)
BOB = UserId(2)


# ─── Inline seeding helpers ──────────────────────────────────────────────────


async def _seed_user(session: AsyncSession, *, user_id: int) -> None:
    await session.execute(
        insert(users).values(
            id=user_id, username=f"u{user_id}", has_password=False,
        )
    )


async def _seed_position(session: AsyncSession, *, content: str) -> int:
    digest = hashlib.sha256(content.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=content)
        .returning(normalized_position.c.id)
    )
    return int(res.scalar())


async def _seed_game_source(
    session: AsyncSession,
    *,
    position_id: int,
    user_id: int,
    description: str,
    player_white: str = "W",
    player_black: str = "B",
) -> int:
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=position_id,
            user_id=user_id,
            description=description,
            player_white=player_white,
            player_black=player_black,
        )
        .returning(game_source.c.id)
    )
    return int(res.scalar())


async def _seed_card(
    session: AsyncSession, *, user_id: int, position_id: int,
    num_reviews: int = 0,
) -> int:
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5,
            alpha=3.0,
            beta=3.0,
            t=1.0,
            user_id=user_id,
            num_reviews=num_reviews,
            normalized_position_id=position_id,
        )
        .returning(card.c.id)
    )
    return int(res.scalar())


async def _link_root(
    session: AsyncSession, *, card_id: int, game_source_id: int
) -> None:
    await session.execute(
        insert(card_source).values(
            card_id=card_id,
            game_source_id=game_source_id,
            is_primary_source=True,
        )
    )


async def _link_branch(
    session: AsyncSession, *, card_id: int, parent_card_id: int
) -> None:
    await session.execute(
        insert(card_source).values(
            card_id=card_id,
            card_source_id=parent_card_id,
            is_primary_source=False,
        )
    )


async def _seed_tag(session: AsyncSession, *, name: str) -> int:
    res = await session.execute(
        insert(tag).values(name=name).returning(tag.c.id)
    )
    return int(res.scalar())


async def _seed_card_tag(
    session: AsyncSession, *, card_id: int, tag_id: int
) -> None:
    await session.execute(
        insert(card_tag).values(card_id=card_id, tag_id=tag_id)
    )


# ─── fetch_tag_usage ──────────────────────────────────────────────────────────


async def test_fetch_tag_usage_returns_count_and_name_per_tag(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;a)")
    c1 = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    c2 = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    attack = await _seed_tag(session, name="attack")
    defense = await _seed_tag(session, name="defense")
    await _seed_card_tag(session, card_id=c1, tag_id=attack)
    await _seed_card_tag(session, card_id=c2, tag_id=attack)
    await _seed_card_tag(session, card_id=c1, tag_id=defense)

    repo = StatsRepository(session)
    result = await repo.fetch_tag_usage(user_id=ALICE)

    assert {(t.name, t.count) for t in result} == {
        ("attack", 2),
        ("defense", 1),
    }


async def test_fetch_tag_usage_returns_zero_count_for_unused_tags(async_session):
    """
    LEFT OUTER JOIN preserves tag rows with no matching card_tag
    entry — they appear with count=0 rather than being elided.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_tag(session, name="orphan")

    repo = StatsRepository(session)
    result = await repo.fetch_tag_usage(user_id=ALICE)
    assert ("orphan", 0) in {(t.name, t.count) for t in result}


async def test_fetch_tag_usage_does_not_leak_other_tenants_counts(async_session):
    """
    A tag used only by Bob shows count=0 from Alice's view. The
    privacy property: Alice can't probe whether Bob has used a tag.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos_id = await _seed_position(session, content="(;a)")
    bobs_card = await _seed_card(session, user_id=BOB, position_id=pos_id)
    bobs_tag = await _seed_tag(session, name="bobsecret")
    await _seed_card_tag(session, card_id=bobs_card, tag_id=bobs_tag)

    repo = StatsRepository(session)

    alice_result = await repo.fetch_tag_usage(user_id=ALICE)
    alice_view = {(t.name, t.count) for t in alice_result}
    assert ("bobsecret", 0) in alice_view

    bob_result = await repo.fetch_tag_usage(user_id=BOB)
    bob_view = {(t.name, t.count) for t in bob_result}
    assert ("bobsecret", 1) in bob_view


async def test_fetch_tag_usage_orders_by_count_desc(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;a)")
    cards = [
        await _seed_card(session, user_id=ALICE, position_id=pos_id)
        for _ in range(3)
    ]
    rare = await _seed_tag(session, name="rare")
    common = await _seed_tag(session, name="common")
    await _seed_card_tag(session, card_id=cards[0], tag_id=rare)
    for cid in cards:
        await _seed_card_tag(session, card_id=cid, tag_id=common)

    repo = StatsRepository(session)
    result = await repo.fetch_tag_usage(user_id=ALICE)
    counts_in_order = [t.count for t in result]
    # Strict descending: ("common", 3), ("rare", 1).
    assert counts_in_order == sorted(counts_in_order, reverse=True)
    assert result[0].name == "common"


# ─── fetch_forest_members ─────────────────────────────────────────────────────


async def test_fetch_forest_members_yields_one_row_per_card_in_forest(
    async_session,
):
    """
    A 3-card forest produces 3 rows, each tagged with the same
    root_card_id and game_source_id (the forest-level fields).
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;a)")
    gs_id = await _seed_game_source(
        session, position_id=pos_id, user_id=ALICE, description="forest-1",
    )
    root = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    branch = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    leaf = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    await _link_root(session, card_id=root, game_source_id=gs_id)
    await _link_branch(session, card_id=branch, parent_card_id=root)
    await _link_branch(session, card_id=leaf, parent_card_id=branch)

    repo = StatsRepository(session)
    rows = await repo.fetch_forest_members(user_id=ALICE)

    assert len(rows) == 3
    assert {r.root_card_id for r in rows} == {root}
    assert {r.game_source_id for r in rows} == {gs_id}
    assert {r.description for r in rows} == {"forest-1"}


async def test_fetch_forest_members_two_forests_distinct_root_card_ids(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_a = await _seed_position(session, content="(;a)")
    pos_b = await _seed_position(session, content="(;b)")
    gs_a = await _seed_game_source(
        session, position_id=pos_a, user_id=ALICE, description="A",
    )
    gs_b = await _seed_game_source(
        session, position_id=pos_b, user_id=ALICE, description="B",
    )
    root_a = await _seed_card(session, user_id=ALICE, position_id=pos_a)
    root_b = await _seed_card(session, user_id=ALICE, position_id=pos_b)
    await _link_root(session, card_id=root_a, game_source_id=gs_a)
    await _link_root(session, card_id=root_b, game_source_id=gs_b)

    repo = StatsRepository(session)
    rows = await repo.fetch_forest_members(user_id=ALICE)
    assert {r.root_card_id for r in rows} == {root_a, root_b}


async def test_fetch_forest_members_excludes_cross_tenant_forests(
    async_session,
):
    """
    Tenancy: Bob's forest is invisible to Alice's stats query
    (base case filter rejects roots not owned by the caller).
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos = await _seed_position(session, content="(;a)")
    bob_gs = await _seed_game_source(
        session, position_id=pos, user_id=BOB, description="bobs-forest",
    )
    bob_root = await _seed_card(session, user_id=BOB, position_id=pos)
    await _link_root(session, card_id=bob_root, game_source_id=bob_gs)

    repo = StatsRepository(session)
    alice_rows = await repo.fetch_forest_members(user_id=ALICE)
    assert alice_rows == []
    bob_rows = await repo.fetch_forest_members(user_id=BOB)
    assert len(bob_rows) == 1


async def test_fetch_forest_members_preserves_card_state_fields(async_session):
    """
    The Bayesian-prior fields (alpha/beta/t, num_reviews,
    creation_date, last_reviewed_at) are carried per row so the
    service can compute per-card recall.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos = await _seed_position(session, content="(;a)")
    gs = await _seed_game_source(
        session, position_id=pos, user_id=ALICE, description="A",
    )
    cid = await _seed_card(
        session, user_id=ALICE, position_id=pos, num_reviews=7,
    )
    await _link_root(session, card_id=cid, game_source_id=gs)

    repo = StatsRepository(session)
    rows = await repo.fetch_forest_members(user_id=ALICE)
    assert len(rows) == 1
    r = rows[0]
    assert r.alpha == 3.0
    assert r.beta == 3.0
    assert r.t == 1.0
    assert r.num_reviews == 7
    assert r.creation_date is not None  # server_default fired


async def test_fetch_forest_members_empty_for_user_with_no_forests(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    repo = StatsRepository(session)
    assert await repo.fetch_forest_members(user_id=ALICE) == []
