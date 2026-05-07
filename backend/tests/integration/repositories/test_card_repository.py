"""
tests/integration/repositories/test_card_repository.py

Adapter-level integration tests for ``CardRepository`` — the
SQLAlchemy implementation of ``CardRepositoryPort`` (read) and
``CardWriteRepositoryPort`` (write).

The Port-fake module covers the use-case-orchestration layer
(``tests/unit/services/``); these tests verify that the SQL the
adapter generates honours the same contract:

  - Tenancy: the WHERE-clause-fusion pattern collapses
    "doesn't exist" and "not yours" into 404-not-403.
  - Schema invariants: the ``check_one_source`` CheckConstraint
    enforces XOR between parent_card_id and game_source_id at the
    database level — the adapter never produces a row that would
    violate it.
  - Dedup: ``get_or_create_position`` is content-hash-keyed;
    ``get_or_create_game_source_by_client_id`` is
    ``(user_id, client_game_id)``-keyed with first-mint-wins.
  - Tag attachment: idempotent and batched per item 21e.

These tests run against the same in-memory SQLite session the
existing ``test_lineage_endpoints.py`` and ``test_tag_dsl_qsl.py``
use. Each test gets a fresh database via ``async_session``.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import insert, select
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
from repositories.card_repository import CardRepository

pytestmark = pytest.mark.integration


ALICE = UserId(1)
BOB = UserId(2)


# ─── Inline seeding ───────────────────────────────────────────────────────────
# The legacy TreeBuilder is fine for pure-card seeding tests, but for
# adapter tests we want fine-grained control over rows (e.g. seeding
# positions that the test then expects the adapter to dedup against).
# Inline helpers parallel those in test_lineage_endpoints.py.


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
            num_moves=5,
            alpha=3.0,
            beta=3.0,
            t=1.0,
            user_id=user_id,
            normalized_position_id=position_id,
        )
        .returning(card.c.id)
    )
    return int(res.scalar())


# ─── get_card_by_id (read; tenancy) ───────────────────────────────────────────


async def test_get_card_by_id_returns_card_for_owner(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    fetched = await repo.get_card_by_id(cid, user_id=ALICE)
    assert fetched is not None
    assert fetched.id == cid
    assert fetched.canonical_content == "(;FF[4]C[A])"


async def test_get_card_by_id_returns_none_for_cross_tenant(async_session):
    """The 404-not-403 invariant: cross-tenant reads return None."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    bobs_card = await _seed_card(session, user_id=BOB, position_id=pos_id)

    repo = CardRepository(session)
    assert await repo.get_card_by_id(bobs_card, user_id=ALICE) is None
    # Bob can still see his own card.
    assert await repo.get_card_by_id(bobs_card, user_id=BOB) is not None


async def test_get_card_by_id_returns_none_for_nonexistent(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = CardRepository(session)
    assert await repo.get_card_by_id(999_999, user_id=ALICE) is None


async def test_get_card_by_id_does_not_leak_bcrypt_hash(async_session):
    """
    The Card domain entity has no bcrypt_hash field. The query
    selects only the columns the entity declares; future widening
    would leak the credential into the wire shape via project_card.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    fetched = await repo.get_card_by_id(cid, user_id=ALICE)
    assert fetched is not None
    assert not hasattr(fetched, "bcrypt_hash")


# ─── update_card_model (write; tenancy) ──────────────────────────────────────


async def test_update_card_model_updates_owners_card(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.update_card_model(cid, (5.0, 5.0, 2.0), user_id=ALICE)

    fetched = await repo.get_card_by_id(cid, user_id=ALICE)
    assert fetched is not None
    assert fetched.alpha == 5.0
    assert fetched.beta == 5.0
    assert fetched.t == 2.0
    assert fetched.num_reviews == 1
    assert fetched.last_reviewed_at is not None


async def test_update_card_model_is_no_op_cross_tenant(async_session):
    """An update against another tenant's card affects zero rows."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    bobs_card = await _seed_card(session, user_id=BOB, position_id=pos_id)

    repo = CardRepository(session)
    await repo.update_card_model(bobs_card, (10.0, 10.0, 5.0), user_id=ALICE)

    # Bob's card is untouched.
    fetched = await repo.get_card_by_id(bobs_card, user_id=BOB)
    assert fetched is not None
    assert fetched.alpha == 3.0
    assert fetched.beta == 3.0
    assert fetched.t == 1.0
    assert fetched.num_reviews == 0
    assert fetched.last_reviewed_at is None


# ─── get_or_create_position (write; content dedup) ───────────────────────────


async def test_get_or_create_position_creates_on_miss(async_session):
    session = async_session
    repo = CardRepository(session)

    digest = hashlib.sha256(b"content-A").digest()
    pid = await repo.get_or_create_position(
        canonical_content="content-A", content_hash=digest,
    )
    assert pid > 0

    # Verify the row landed.
    row = (await session.execute(
        select(normalized_position).where(normalized_position.c.id == pid)
    )).fetchone()
    assert row is not None
    assert row.canonical_content == "content-A"
    assert row.content_hash == digest


async def test_get_or_create_position_returns_existing_on_hit(async_session):
    """Same content_hash → same id (content-addressed dedup)."""
    session = async_session
    repo = CardRepository(session)

    digest = hashlib.sha256(b"content-A").digest()
    first = await repo.get_or_create_position(
        canonical_content="content-A", content_hash=digest,
    )
    second = await repo.get_or_create_position(
        canonical_content="content-A", content_hash=digest,
    )
    assert first == second


async def test_get_or_create_position_is_global_not_tenant_scoped(async_session):
    """
    The normalized_position table is intentionally global — two
    users uploading the same content share the row. The Port has
    no user_id parameter; the dedup is content-addressed.
    """
    session = async_session
    repo = CardRepository(session)

    digest = hashlib.sha256(b"shared-content").digest()
    pid = await repo.get_or_create_position(
        canonical_content="shared-content", content_hash=digest,
    )
    # Second call from a different "context" (no user binding) — same id.
    pid_again = await repo.get_or_create_position(
        canonical_content="shared-content", content_hash=digest,
    )
    assert pid == pid_again


# ─── insert_card (write; tenancy stamp) ──────────────────────────────────────


async def test_insert_card_stamps_user_id(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")

    repo = CardRepository(session)
    cid = await repo.insert_card(
        num_moves=10,
        model=(3.0, 3.0, 1.0),
        user_id=int(ALICE),
        grading_parameter={"data": {"default_visits": 200}},
        position_id=pos_id,
    )

    # Owner sees the card; cross-tenant sees None.
    assert await repo.get_card_by_id(cid, user_id=ALICE) is not None
    await _seed_user(session, user_id=BOB)
    assert await repo.get_card_by_id(cid, user_id=BOB) is None


# ─── insert_game_source / get_or_create_game_source_by_client_id ──────────────


async def test_insert_game_source_stamps_user_id(async_session):
    """Item 24: insert_game_source stamps user_id."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")

    repo = CardRepository(session)
    gs_id = await repo.insert_game_source(
        position_id=pos_id,
        user_id=ALICE,
        player_white="Alice",
        player_black="Eve",
        description="game-desc",
        raw_content="(;FF[4]C[A])",
    )

    row = (await session.execute(
        select(game_source).where(game_source.c.id == gs_id)
    )).fetchone()
    assert row is not None
    assert row.user_id == int(ALICE)
    assert row.player_white == "Alice"
    assert row.player_black == "Eve"
    assert row.client_game_id is None  # Insert path is dedup-exempt.


async def test_get_or_create_game_source_by_client_id_creates_on_miss(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cgid = uuid4()

    repo = CardRepository(session)
    gs_id = await repo.get_or_create_game_source_by_client_id(
        client_game_id=cgid,
        position_id=pos_id,
        user_id=ALICE,
        player_white="Alice",
        player_black="Eve",
        description="first mint",
        raw_content="(;FF[4]C[A])",
    )

    row = (await session.execute(
        select(game_source).where(game_source.c.id == gs_id)
    )).fetchone()
    assert row is not None
    assert row.client_game_id == cgid
    assert row.description == "first mint"


async def test_get_or_create_game_source_by_client_id_first_mint_wins(
    async_session,
):
    """
    Game-source dedup: a second mint with the same
    (user_id, client_game_id) returns the existing id and leaves
    the metadata intact (incoming description ignored).
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cgid = uuid4()

    repo = CardRepository(session)
    first = await repo.get_or_create_game_source_by_client_id(
        client_game_id=cgid,
        position_id=pos_id,
        user_id=ALICE,
        player_white=None,
        player_black=None,
        description="first mint",
        raw_content="content",
    )
    second = await repo.get_or_create_game_source_by_client_id(
        client_game_id=cgid,
        position_id=pos_id,
        user_id=ALICE,
        player_white="OVERRIDDEN",
        player_black="OVERRIDDEN",
        description="DIFFERENT — should be ignored",
        raw_content="DIFFERENT",
    )
    assert first == second

    row = (await session.execute(
        select(game_source).where(game_source.c.id == first)
    )).fetchone()
    assert row is not None
    assert row.description == "first mint"
    assert row.player_white is None  # First-mint metadata preserved.


async def test_get_or_create_game_source_by_client_id_per_tenant_isolation(
    async_session,
):
    """Two users sharing a (random) client_game_id get distinct rows."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cgid = uuid4()

    repo = CardRepository(session)
    alice_gs = await repo.get_or_create_game_source_by_client_id(
        client_game_id=cgid,
        position_id=pos_id,
        user_id=ALICE,
        player_white=None, player_black=None, description=None,
        raw_content="",
    )
    bob_gs = await repo.get_or_create_game_source_by_client_id(
        client_game_id=cgid,
        position_id=pos_id,
        user_id=BOB,
        player_white=None, player_black=None, description=None,
        raw_content="",
    )
    assert alice_gs != bob_gs


# ─── link_source (write; XOR enforcement) ────────────────────────────────────


async def test_link_source_branch_creates_card_source_row_with_parent(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    parent_id = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    branch_id = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.link_source(
        card_id=branch_id, parent_card_id=parent_id, game_source_id=None,
    )

    row = (await session.execute(
        select(card_source).where(card_source.c.card_id == branch_id)
    )).fetchone()
    assert row is not None
    assert row.card_source_id == parent_id
    assert row.game_source_id is None
    assert row.is_primary_source is False


async def test_link_source_root_creates_card_source_row_with_game_source(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    repo = CardRepository(session)
    gs_id = await repo.insert_game_source(
        position_id=pos_id, user_id=ALICE,
        player_white=None, player_black=None,
        description=None, raw_content="",
    )
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    await repo.link_source(
        card_id=cid, parent_card_id=None, game_source_id=gs_id,
    )

    row = (await session.execute(
        select(card_source).where(card_source.c.card_id == cid)
    )).fetchone()
    assert row is not None
    assert row.card_source_id is None
    assert row.game_source_id == gs_id
    assert row.is_primary_source is True  # Root is primary.


async def test_link_source_violating_xor_raises_integrity_error(async_session):
    """
    Schema CheckConstraint ``check_one_source`` enforces XOR
    between parent_card_id and game_source_id. The adapter doesn't
    pre-validate — the production CardService validator does — but
    a direct caller passing both gets an IntegrityError.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    parent_id = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)
    repo = CardRepository(session)
    gs_id = await repo.insert_game_source(
        position_id=pos_id, user_id=ALICE,
        player_white=None, player_black=None,
        description=None, raw_content="",
    )

    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        await repo.link_source(
            card_id=cid,
            parent_card_id=parent_id,
            game_source_id=gs_id,  # Both set: violates check_one_source.
        )


# ─── attach_tags (write; idempotent + batched) ───────────────────────────────


async def test_attach_tags_creates_missing_tags_and_links(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.attach_tags(cid, ["attack", "opening"])

    rows = (await session.execute(
        select(tag.c.name).join(card_tag, card_tag.c.tag_id == tag.c.id)
        .where(card_tag.c.card_id == cid)
    )).fetchall()
    assert {r.name for r in rows} == {"attack", "opening"}


async def test_attach_tags_reuses_existing_tag_rows(async_session):
    """A pre-existing tag is reused (no duplicate row in `tag`)."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    # Pre-seed an "attack" tag.
    await session.execute(insert(tag).values(name="attack"))
    repo = CardRepository(session)
    await repo.attach_tags(cid, ["attack", "opening"])

    rows = (await session.execute(
        select(tag.c.name).where(tag.c.name == "attack")
    )).fetchall()
    assert len(rows) == 1


async def test_attach_tags_is_idempotent(async_session):
    """Calling twice with the same names doesn't create duplicate links."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.attach_tags(cid, ["attack", "opening"])
    await repo.attach_tags(cid, ["attack", "opening"])  # again

    rows = (await session.execute(
        select(card_tag).where(card_tag.c.card_id == cid)
    )).fetchall()
    assert len(rows) == 2


async def test_attach_tags_empty_list_is_no_op(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.attach_tags(cid, [])

    rows = (await session.execute(
        select(card_tag).where(card_tag.c.card_id == cid)
    )).fetchall()
    assert rows == []


async def test_attach_tags_deduplicates_input(async_session):
    """Same-tag-name twice in the input list creates only one link."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    pos_id = await _seed_position(session, content="(;FF[4]C[A])")
    cid = await _seed_card(session, user_id=ALICE, position_id=pos_id)

    repo = CardRepository(session)
    await repo.attach_tags(cid, ["attack", "attack", "attack"])

    rows = (await session.execute(
        select(card_tag).where(card_tag.c.card_id == cid)
    )).fetchall()
    assert len(rows) == 1
