"""
tests/integration/repositories/test_tag_filter_repository.py

Adapter-level integration tests for ``TagFilterRepository`` — the
SQLAlchemy adapter for tag-DSL materialization.

The ``TagDSLCompiler``'s parser and DNF expansion is covered in
``tests/unit/test_tag_dsl_pure.py`` (no SQL); the SQL-level
behaviour (HAVING + EXCEPT, virtual-tag union expansion) is
covered in ``tests/integration/test_tag_dsl_qsl.py`` (no
tenancy). What's left for this file:

  - The adapter's outer wrap on user_id (item 16) — a tenant
    cannot enumerate other tenants' tagged cards via the tag
    filter, even when they share a tag name.
  - Malformed expressions raise ``PipelineDSLError`` (the
    adapter passes through the compiler's error).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import (
    card,
    card_tag,
    normalized_position,
    tag,
    users,
)
from domain.auth import UserId
from domain.errors import PipelineDSLError
from repositories.tag_filter_repository import TagFilterRepository

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


async def _seed_tag_with_cards(
    session: AsyncSession, *, name: str, card_ids: list[int]
) -> int:
    res = await session.execute(
        insert(tag).values(name=name).returning(tag.c.id)
    )
    tag_id = int(res.scalar())
    for cid in card_ids:
        await session.execute(
            insert(card_tag).values(card_id=cid, tag_id=tag_id)
        )
    return tag_id


# ─── Happy path ───────────────────────────────────────────────────────────────


async def test_card_ids_matching_returns_cards_with_the_tag(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos = await _seed_position(session, content="(;c)")
    c1 = await _seed_card(session, user_id=ALICE, position_id=pos)
    c2 = await _seed_card(session, user_id=ALICE, position_id=pos)
    c3 = await _seed_card(session, user_id=ALICE, position_id=pos)
    await _seed_tag_with_cards(session, name="attack", card_ids=[c1, c2])
    await _seed_tag_with_cards(session, name="other", card_ids=[c3])

    repo = TagFilterRepository(session)
    matched = await repo.card_ids_matching("attack", user_id=ALICE)
    assert matched == {c1, c2}


async def test_card_ids_matching_empty_for_unmatched_tag(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos = await _seed_position(session, content="(;c)")
    await _seed_card(session, user_id=ALICE, position_id=pos)

    repo = TagFilterRepository(session)
    matched = await repo.card_ids_matching("never-used", user_id=ALICE)
    assert matched == set()


# ─── Tenancy (item 16) ────────────────────────────────────────────────────────


async def test_card_ids_matching_does_not_return_other_tenants_cards(
    async_session,
):
    """
    Item 16's outer wrap restricts results to the caller's cards.
    Without it, a tenant could enumerate other tenants' tagged
    cards via the tag filter — even cards they couldn't otherwise
    read via ``get_card_by_id``.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos = await _seed_position(session, content="(;c)")

    alices_card = await _seed_card(session, user_id=ALICE, position_id=pos)
    bobs_card = await _seed_card(session, user_id=BOB, position_id=pos)
    # Same tag name, both cards tagged.
    await _seed_tag_with_cards(
        session, name="attack", card_ids=[alices_card, bobs_card],
    )

    repo = TagFilterRepository(session)
    alice_view = await repo.card_ids_matching("attack", user_id=ALICE)
    bob_view = await repo.card_ids_matching("attack", user_id=BOB)

    assert alice_view == {alices_card}
    assert bob_view == {bobs_card}


async def test_card_ids_matching_negation_does_not_leak_cross_tenant(
    async_session,
):
    """
    A negation query (``~attack``) should also be tenancy-scoped:
    Alice's "all cards minus attack-tagged" must not include Bob's
    untagged cards.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos = await _seed_position(session, content="(;c)")

    alices_attack_card = await _seed_card(
        session, user_id=ALICE, position_id=pos,
    )
    alices_clean_card = await _seed_card(
        session, user_id=ALICE, position_id=pos,
    )
    bobs_clean_card = await _seed_card(
        session, user_id=BOB, position_id=pos,
    )
    await _seed_tag_with_cards(
        session, name="attack", card_ids=[alices_attack_card],
    )

    repo = TagFilterRepository(session)
    alice_view = await repo.card_ids_matching("~attack", user_id=ALICE)

    # Alice's untagged card shows up; Bob's untagged card does not.
    assert alices_clean_card in alice_view
    assert bobs_clean_card not in alice_view
    assert alices_attack_card not in alice_view


# ─── Malformed expressions ────────────────────────────────────────────────────


async def test_card_ids_matching_unknown_virtual_tag_raises(async_session):
    """
    The compiler raises ``PipelineDSLError`` for an undefined
    virtual tag; the adapter passes it through unchanged.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = TagFilterRepository(session)
    with pytest.raises(PipelineDSLError, match=r"\$undefined"):
        await repo.card_ids_matching("$undefined", user_id=ALICE)


async def test_card_ids_matching_empty_expression_raises(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = TagFilterRepository(session)
    with pytest.raises(PipelineDSLError):
        await repo.card_ids_matching("", user_id=ALICE)
