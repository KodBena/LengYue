"""
tests/integration/routes/test_lineage_routes.py

Route-layer tests for /lineage/resolve-roots and
/lineage/tree-by-root — the card-tree backend (release-scope item 3).

Verified surfaces:

  - resolve-roots: groups input by root; surfaces unmatched ids
    (not owned, not present); empty input returns empty.
  - tree-by-root: happy path returns ``{root_card_id,
    game_source_id, tree}``; 404 on cross-tenant or non-root
    target; 422 on overflow with structured detail body.
  - 401: missing bearer.

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
    game_source,
    normalized_position,
)
from tests.integration.routes.conftest import (
    auth_header,
    seed_user,
    ALICE_ID,
    BOB_ID,
)

pytestmark = pytest.mark.integration


# ─── Inline tree builder ──────────────────────────────────────────────────────


async def _seed_position(
    session: AsyncSession, *, content: str
) -> int:
    digest = hashlib.sha256(content.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=content)
        .returning(normalized_position.c.id)
    )
    return int(res.scalar())


async def _build_tree(
    session: AsyncSession,
    adjacency: dict[str, str | None],
    *,
    user_id: int,
    description: str = "tree",
) -> dict[str, int]:
    pos = await _seed_position(session, content=f"(;c[{description}])")
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
    ids["_game_source"] = gs_id
    return ids


# ─── /lineage/resolve-roots ───────────────────────────────────────────────────


async def test_resolve_roots_groups_input_by_root(client, session):
    await seed_user(session, user_id=ALICE_ID)
    a = await _build_tree(
        session, {"r": None, "leaf": "r"},
        user_id=ALICE_ID, description="A",
    )
    b = await _build_tree(
        session, {"r": None, "leaf": "r"},
        user_id=ALICE_ID, description="B",
    )

    response = await client.post(
        "/lineage/resolve-roots",
        json={"card_ids": [a["leaf"], b["leaf"]]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    by_root = {g["root_card_id"]: g for g in body["roots"]}
    assert a["r"] in by_root
    assert b["r"] in by_root
    assert by_root[a["r"]]["card_ids_in_tree"] == [a["leaf"]]
    assert by_root[b["r"]]["card_ids_in_tree"] == [b["leaf"]]
    assert body["unmatched_card_ids"] == []


async def test_resolve_roots_surfaces_unmatched_cross_tenant_and_nonexistent(
    client, session,
):
    """
    Cross-tenant card ids and nonexistent ids both surface in
    ``unmatched_card_ids``. The 404-not-403 invariant lifted to
    bulk: the caller can't distinguish "Bob owns it" from "no
    such card".
    """
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs = await _build_tree(
        session, {"r": None, "leaf": "r"},
        user_id=BOB_ID, description="bobs-tree",
    )
    alice = await _build_tree(
        session, {"r": None}, user_id=ALICE_ID, description="alices-tree",
    )

    response = await client.post(
        "/lineage/resolve-roots",
        json={
            "card_ids": [
                alice["r"],
                bobs["leaf"],   # Bob's
                999_999,        # nonexistent
            ],
        },
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["roots"]) == 1
    assert body["roots"][0]["root_card_id"] == alice["r"]
    assert set(body["unmatched_card_ids"]) == {bobs["leaf"], 999_999}


async def test_resolve_roots_empty_input_returns_empty_response(
    client, session,
):
    await seed_user(session, user_id=ALICE_ID)

    response = await client.post(
        "/lineage/resolve-roots",
        json={"card_ids": []},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {"roots": [], "unmatched_card_ids": []}


async def test_resolve_roots_without_bearer_returns_401(client):
    response = await client.post(
        "/lineage/resolve-roots", json={"card_ids": []},
    )
    assert response.status_code == 401


# ─── /lineage/tree-by-root ────────────────────────────────────────────────────


async def test_tree_by_root_returns_full_subtree(client, session):
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "r", "c": "a"},
        user_id=ALICE_ID,
    )

    response = await client.post(
        "/lineage/tree-by-root",
        json={"root_card_id": ids["r"]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["root_card_id"] == ids["r"]
    assert body["game_source_id"] == ids["_game_source"]

    seen: set[int] = set()
    stack = [body["tree"]]
    while stack:
        node = stack.pop()
        seen.add(node["id"])
        stack.extend(node["children"])
    assert seen == {ids[k] for k in ("r", "a", "b", "c")}


async def test_tree_by_root_cross_tenant_returns_404(client, session):
    await seed_user(session, user_id=ALICE_ID)
    await seed_user(session, user_id=BOB_ID)
    bobs = await _build_tree(
        session, {"r": None}, user_id=BOB_ID,
    )

    response = await client.post(
        "/lineage/tree-by-root",
        json={"root_card_id": bobs["r"]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_tree_by_root_non_root_card_returns_404(client, session):
    """Mid-chain card (non-root) is not a valid target — 404."""
    await seed_user(session, user_id=ALICE_ID)
    ids = await _build_tree(
        session, {"r": None, "mid": "r"}, user_id=ALICE_ID,
    )

    response = await client.post(
        "/lineage/tree-by-root",
        json={"root_card_id": ids["mid"]},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 404


async def test_tree_by_root_overflow_returns_422_with_structured_detail(
    client, session,
):
    """
    LineageOverflowError → 422 with detail carrying actual_size
    and max_nodes per the backend spec.
    """
    await seed_user(session, user_id=ALICE_ID)
    chain: dict[str, str | None] = {"n0": None}
    for i in range(1, 8):
        chain[f"n{i}"] = f"n{i - 1}"
    ids = await _build_tree(session, chain, user_id=ALICE_ID)

    response = await client.post(
        "/lineage/tree-by-root",
        json={"root_card_id": ids["n0"], "max_nodes": 3},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["actual_size"] == 8
    assert detail["max_nodes"] == 3
    assert "tree exceeds" in detail["detail"]


async def test_tree_by_root_at_exactly_max_nodes_succeeds(client, session):
    """The cap is inclusive: a tree of exactly ``max_nodes`` succeeds."""
    await seed_user(session, user_id=ALICE_ID)
    chain: dict[str, str | None] = {"n0": None}
    for i in range(1, 5):
        chain[f"n{i}"] = f"n{i - 1}"
    ids = await _build_tree(session, chain, user_id=ALICE_ID)

    response = await client.post(
        "/lineage/tree-by-root",
        json={"root_card_id": ids["n0"], "max_nodes": 5},
        headers=auth_header(ALICE_ID),
    )
    assert response.status_code == 200


async def test_tree_by_root_without_bearer_returns_401(client):
    response = await client.post(
        "/lineage/tree-by-root", json={"root_card_id": 1},
    )
    assert response.status_code == 401
