"""
tests/integration/routes/test_forests_routes.py

Route-layer tests for POST /forests/query — the typed pipeline DSL
endpoint.

The pipeline DSL itself is exhaustively covered in
``tests/integration/test_pipeline_e2e.py`` (executor against
in-memory SQLite). This file verifies the route boundary:

  - Pydantic validates the DSL at the wire — first-stage-must-be-
    select, no-second-select, well-typed selection / ordering /
    stage discriminators. Malformed bodies → 422.
  - Tenancy: results are restricted to the caller's cards (item
    25). Cross-tenant cards never appear in the response, even
    when both users share the same context tree shape.
  - 401 without bearer.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib
from itertools import count
from uuid import uuid4

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

# Per-user-id-enumeration design: see test_stats_repository.py's
# identical comment.
_ordinal = count(1)

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


# ─── Inline tree builder ──────────────────────────────────────────────────────


async def _build_tree(
    session: AsyncSession,
    adjacency: dict[str, str | None],
    *,
    user_id: int,
    description: str = "tree",
) -> dict[str, int]:
    canonical = f"(;c[{description}])"
    digest = hashlib.sha256(canonical.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=canonical)
        .returning(normalized_position.c.id)
    )
    pos = int(res.scalar())
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=pos, user_id=user_id, description=description,
            client_game_id=uuid4(), display_ordinal=next(_ordinal),
        )
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())

    ids: dict[str, int] = {}
    inserted: set[str] = set()
    remaining = dict(adjacency)
    while remaining:
        progressed = False
        for name, parent_name in list(remaining.items()):
            if parent_name is not None and parent_name not in inserted:
                continue
            res = await session.execute(
                insert(card)
                .values(
                    num_moves=5, alpha=3.0, beta=3.0, t=1.0,
                    user_id=user_id, normalized_position_id=pos,
                    public_id=uuid4(), display_ordinal=next(_ordinal),
                )
                .returning(card.c.id)
            )
            cid = int(res.scalar())
            ids[name] = cid
            if parent_name is None:
                await session.execute(insert(card_source).values(
                    card_id=cid, game_source_id=gs_id,
                    is_primary_source=True,
                ))
            else:
                await session.execute(insert(card_source).values(
                    card_id=cid, card_source_id=ids[parent_name],
                    is_primary_source=False,
                ))
            inserted.add(name)
            del remaining[name]
            progressed = True
        if not progressed:
            raise ValueError("cycle")
    await session.commit()
    return ids


# ─── Happy path ───────────────────────────────────────────────────────────────


async def test_forests_query_returns_descendant_pool(client, session):
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a"},
        user_id=ALICE_ID,
    )

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [ids["r"]],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    returned_ids = {c["id"] for c in body}
    # DescendantSelection excludes the context.
    assert ids["r"] not in returned_ids
    assert returned_ids == {ids["a"], ids["b"]}
    # card-position-annotations Stage A: content_hash rides along on
    # every CardWithRecall — a hex string (Card._serialize_content_hash),
    # matching the digest of the canonical content _build_tree seeded.
    expected_hash = hashlib.sha256(b"(;c[tree])").hexdigest()
    for c in body:
        assert c["content_hash"] == expected_hash


async def test_forests_query_results_carry_tags(client, session):
    """
    Card-metadata inline-edit arc 1: tags surface on every
    CardWithRecall in the pipeline-result list, populated via the
    batched IN-set fetch in ``LineageRepository._materialize``. A
    card with tags carries them alphabetised; a card without tags
    reports ``[]``. The fetch is single-round-trip regardless of
    pool size.
    """
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a"},
        user_id=ALICE_ID,
    )
    # Tag just one descendant. The other should report `[]`.
    res = await session.execute(
        insert(tag).values(name="joseki").returning(tag.c.id)
    )
    joseki_id = int(res.scalar())
    await session.execute(
        insert(card_tag).values(card_id=ids["a"], tag_id=joseki_id)
    )
    await session.commit()

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [ids["r"]],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    by_id = {c["id"]: c for c in body}
    assert by_id[ids["a"]]["tags"] == ["joseki"]
    assert by_id[ids["b"]]["tags"] == []


async def test_forests_query_take_caps_pool(client, session):
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a", "c": "b"},
        user_id=ALICE_ID,
    )

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [ids["r"]],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
                {"stage": "take", "n": 1},
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1


# ─── 422 wire-shape validation ────────────────────────────────────────────────


async def test_forests_query_first_stage_must_be_select(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [1],
            "pipeline": [{"stage": "take", "n": 5}],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_forests_query_no_second_select_stage(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [1],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_forests_query_unknown_stage_type_is_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [1],
            "pipeline": [{"stage": "fictional"}],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


async def test_forests_query_empty_context_ids_is_422(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422


# ─── Tenancy (item 25) ────────────────────────────────────────────────────────


async def test_forests_query_results_are_tenant_scoped(client, session):
    """
    Bob's tree, queried with Alice's bearer, returns nothing — the
    base case's user_id filter rejects the cross-tenant context.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs = await _build_tree(
        session,
        {"r": None, "leaf": "r"},
        user_id=BOB_ID,
        description="bobs-tree",
    )

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [bobs["r"]],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    assert response.json() == []


async def test_forests_query_content_hash_isolated_across_tenants_sharing_position(
    client, session,
):
    """
    card-position-annotations Stage A tenancy check (design §1: "the
    per-user hash set comes from the user's own cards"). `content_hash`
    is deliberately a *global* identity — two tenants who mint a card
    off the identical canonical content share the same
    `normalized_position` row and therefore the same `content_hash`
    value. That sharing must never leak *card ids* across the tenancy
    boundary: Alice's forest query returns only her own card, with the
    (shared) hash value, and Bob's card id never appears — the existing
    404-not-403 / ownership-filtered invariant holds regardless of
    whether the underlying position happens to be shared.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)

    # normalized_position.content_hash is UNIQUE (a shared, global
    # dedup row) — seed it once, then attach a card for each tenant
    # to the same position id, mirroring what CardRepository's
    # get_or_create_position does for two independent mints of
    # identical content.
    canonical = "(;c[shared])"
    digest = hashlib.sha256(canonical.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=canonical)
        .returning(normalized_position.c.id)
    )
    pos = int(res.scalar())

    async def _attach_root_card(user_id: int) -> int:
        res = await session.execute(
            insert(game_source)
            .values(
                position_id=pos, user_id=user_id, description="shared",
                client_game_id=uuid4(), display_ordinal=next(_ordinal),
            )
            .returning(game_source.c.id)
        )
        gs_id = int(res.scalar())
        res = await session.execute(
            insert(card)
            .values(
                num_moves=5, alpha=3.0, beta=3.0, t=1.0,
                user_id=user_id, normalized_position_id=pos,
                public_id=uuid4(), display_ordinal=next(_ordinal),
            )
            .returning(card.c.id)
        )
        cid = int(res.scalar())
        await session.execute(insert(card_source).values(
            card_id=cid, game_source_id=gs_id, is_primary_source=True,
        ))
        return cid

    alice_root = await _attach_root_card(ALICE_ID)
    bob_root = await _attach_root_card(BOB_ID)
    await session.commit()

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [alice_root],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "AncestorSelection", "n": 0},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    returned_ids = {c["id"] for c in body}
    assert returned_ids == {alice_root}
    assert bob_root not in returned_ids
    expected_hash = hashlib.sha256(b"(;c[shared])").hexdigest()
    assert body[0]["content_hash"] == expected_hash


# ─── 401 without bearer ───────────────────────────────────────────────────────


async def test_forests_query_without_bearer_returns_401(client):
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [1],
            "pipeline": [
                {
                    "stage": "select",
                    "selection": {"type": "DescendantSelection"},
                    "ordering": {"type": "DepthKey"},
                },
            ],
        },
    )
    assert response.status_code == 401


# ─── macro-public-id-tokens: game_source_ordinals ─────────────────────────────
#
# Restoring the Cards-tab `${gameSourceId}` macro (ledger row 456). Failure
# paths first (backend/tests/CLAUDE.md contract 2): cross-tenant token → 404,
# unknown ordinal → 404, then the happy path and the both-empty 422.


_SELECT_DESCENDANTS = [
    {
        "stage": "select",
        "selection": {"type": "DescendantSelection"},
        "ordering": {"type": "DepthKey"},
    },
]


async def _seed_root_with_ordinal(
    session: AsyncSession, *, user_id: int, description: str = "macro-tree",
) -> tuple[int, int]:
    """
    Like `_build_tree`, but for a single root card and returns the
    game_source's own `display_ordinal` alongside the root card id —
    the macro grammar addresses game sources by that ordinal, not by
    the module-global `_ordinal` counter's raw value (which the
    caller can't observe from `_build_tree`'s dict-of-ids return
    alone).
    """
    canonical = f"(;c[{description}])"
    digest = hashlib.sha256(canonical.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=canonical)
        .returning(normalized_position.c.id)
    )
    pos = int(res.scalar())
    ordinal = next(_ordinal)
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=pos, user_id=user_id, description=description,
            client_game_id=uuid4(), display_ordinal=ordinal,
        )
        .returning(game_source.c.id)
    )
    gs_id = int(res.scalar())
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5, alpha=3.0, beta=3.0, t=1.0,
            user_id=user_id, normalized_position_id=pos,
            public_id=uuid4(), display_ordinal=next(_ordinal),
        )
        .returning(card.c.id)
    )
    root_id = int(res.scalar())
    await session.execute(insert(card_source).values(
        card_id=root_id, game_source_id=gs_id, is_primary_source=True,
    ))
    await session.commit()
    return root_id, ordinal


async def test_forests_query_unknown_game_source_ordinal_is_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [],
            "game_source_ordinals": [999999],
            "pipeline": _SELECT_DESCENDANTS,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_forests_query_cross_tenant_game_source_ordinal_is_404(client, session):
    """
    Bob's game_source ordinal, queried with Alice's bearer, is a 404 —
    not Alice's own unrelated data and not a leak of Bob's root. The
    (user_id, display_ordinal) predicate fusion inside
    `resolve_game_source_root_card_ids` makes "belongs to another
    tenant" and "doesn't exist" indistinguishable from Alice's
    perspective, same invariant docs/notes/tenancy.md documents for
    every other tenant-scoped lookup.
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    _bob_root, bob_ordinal = await _seed_root_with_ordinal(
        session, user_id=BOB_ID, description="bobs-macro-tree",
    )

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [],
            "game_source_ordinals": [bob_ordinal],
            "pipeline": _SELECT_DESCENDANTS,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_forests_query_game_source_ordinal_resolves_root_and_descendants(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a"},
        user_id=ALICE_ID,
    )
    # `_build_tree` doesn't return the game_source's display_ordinal;
    # read it back directly (it's the ordinal `_build_tree` minted via
    # the same module-level `_ordinal` counter `_seed_root_with_ordinal`
    # uses — but since other tests in this module also draw from that
    # counter, look it up by the root card's own card_source row
    # rather than assuming a specific value).
    res = await session.execute(
        select(game_source.c.display_ordinal)
        .select_from(
            card_source.join(
                game_source, card_source.c.game_source_id == game_source.c.id,
            )
        )
        .where(card_source.c.card_id == ids["r"])
    )
    ordinal = int(res.scalar())

    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [],
            "game_source_ordinals": [ordinal],
            "pipeline": _SELECT_DESCENDANTS,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    returned_ids = {c["id"] for c in response.json()}
    assert returned_ids == {ids["a"], ids["b"]}


async def test_forests_query_context_ids_and_game_source_ordinals_both_empty_is_422(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)
    response = await client.post(
        "/forests/query",
        json={
            "context_ids": [],
            "game_source_ordinals": [],
            "pipeline": _SELECT_DESCENDANTS,
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
