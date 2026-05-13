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
        .values(position_id=pos, user_id=user_id, description=description)
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
