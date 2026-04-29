"""
tests/integration/test_lineage_endpoints.py

Integration tests for the card-tree endpoints — the two new
`LineageRepositoryPort` methods backing `/lineage/resolve-roots`
and `/lineage/tree-by-root` (release-scope item 3).

Tests exercise the adapter (`LineageRepository`) directly against an
in-memory SQLite session, matching the layering convention the
existing tag-DSL integration tests use. The route layer is thin
projection from RootResolution / RootedTree to the wire shapes
declared in `api/routes/lineage.py`; testing the adapter is where
the load-bearing logic (the upward-walk CTE, the descent CTE
overflow detection, the multi-tenant filtering) lives.

Self-contained seeding: the existing `TreeBuilder` helper in
`tests/helpers.py` predates the item-34a column rename and would
need updating before it could be reused here. That update is out of
scope for this work; this file builds its small fixtures inline.

License: Public Domain (The Unlicense)
"""
import hashlib
from typing import Dict, List, Optional

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import (
    card,
    card_source,
    game_source,
    normalized_position,
    users,
)
from domain.auth import UserId
from domain.errors import CardNotFoundError, LineageOverflowError
from repositories.lineage_repository import LineageRepository

pytestmark = pytest.mark.integration


# =====================================================================
# Inline seeding helpers — minimal substitute for the legacy
# TreeBuilder while it remains broken against the post-34a schema.
# =====================================================================


async def _seed_user(session: AsyncSession, *, user_id: int, username: str) -> None:
    await session.execute(
        insert(users).values(
            id=user_id, username=username, has_password=False
        )
    )


async def _seed_normalized_position(session: AsyncSession, *, tag: str) -> int:
    """
    Seed one row in normalized_position. `tag` is appended into the
    canonical content so each tree fixture in a test gets a distinct
    content_hash; the schema's UNIQUE constraint on `content_hash`
    would otherwise conflict when a single test seeds two trees.
    """
    canonical = f"(;FF[4]SZ[19]C[{tag}])"
    digest = hashlib.sha256(canonical.encode()).digest()
    res = await session.execute(
        insert(normalized_position)
        .values(content_hash=digest, canonical_content=canonical)
        .returning(normalized_position.c.id)
    )
    return res.scalar()


async def _seed_game_source(
    session: AsyncSession, *, position_id: int, user_id: int, description: str
) -> int:
    res = await session.execute(
        insert(game_source)
        .values(
            position_id=position_id,
            user_id=user_id,
            description=description,
        )
        .returning(game_source.c.id)
    )
    return res.scalar()


async def _seed_card(
    session: AsyncSession, *, position_id: int, user_id: int
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
    return res.scalar()


async def _link_card_to_root(
    session: AsyncSession,
    *,
    card_id: int,
    game_source_id: int,
) -> None:
    await session.execute(
        insert(card_source).values(
            card_id=card_id,
            game_source_id=game_source_id,
            is_primary_source=True,
        )
    )


async def _link_card_to_parent(
    session: AsyncSession, *, card_id: int, parent_card_id: int
) -> None:
    await session.execute(
        insert(card_source).values(
            card_id=card_id,
            card_source_id=parent_card_id,
            is_primary_source=False,
        )
    )


async def _build_tree(
    session: AsyncSession,
    adjacency: Dict[str, Optional[str]],
    *,
    user_id: int,
    description: str = "test-tree",
) -> Dict[str, int]:
    """
    Seed a single tree under one game_source row, owned by `user_id`.

    `adjacency` maps node_name → parent_name (or None for the root).
    Exactly one node must have parent None — that's the root, which
    gets linked to a fresh game_source. Returns
    `{node_name: card_id, "_game_source": game_source_id}` for use
    in test assertions.
    """
    pos_id = await _seed_normalized_position(session, tag=description)
    gs_id = await _seed_game_source(
        session, position_id=pos_id, user_id=user_id, description=description
    )

    ids: Dict[str, int] = {}
    inserted: set = set()
    remaining = dict(adjacency)

    while remaining:
        progress = False
        for name, parent_name in list(remaining.items()):
            if parent_name is not None and parent_name not in inserted:
                continue
            cid = await _seed_card(session, position_id=pos_id, user_id=user_id)
            ids[name] = cid
            if parent_name is None:
                await _link_card_to_root(
                    session, card_id=cid, game_source_id=gs_id
                )
            else:
                await _link_card_to_parent(
                    session, card_id=cid, parent_card_id=ids[parent_name]
                )
            inserted.add(name)
            del remaining[name]
            progress = True
        if not progress:
            raise ValueError(f"Cycle in adjacency: {list(remaining)}")

    await session.flush()
    ids["_game_source"] = gs_id
    return ids


USER_ALICE = UserId(1)
USER_BOB = UserId(2)


# =====================================================================
# resolve_roots
# =====================================================================


async def test_resolve_roots_groups_input_by_root(async_session):
    """
    Given two trees owned by the same user, resolve_roots returns one
    `RootGroup` per tree, with the input cards correctly grouped.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")

    tree_a = await _build_tree(
        session,
        {"a_root": None, "a_mid": "a_root", "a_leaf": "a_mid"},
        user_id=USER_ALICE,
        description="tree-a",
    )
    tree_b = await _build_tree(
        session,
        {"b_root": None, "b_child": "b_root"},
        user_id=USER_ALICE,
        description="tree-b",
    )

    repo = LineageRepository(session)
    result = await repo.resolve_roots(
        [tree_a["a_leaf"], tree_a["a_mid"], tree_b["b_child"]],
        user_id=USER_ALICE,
    )

    assert len(result.roots) == 2
    by_root = {g.root_card_id: g for g in result.roots}

    assert tree_a["a_root"] in by_root
    assert by_root[tree_a["a_root"]].game_source_id == tree_a["_game_source"]
    assert sorted(by_root[tree_a["a_root"]].card_ids_in_tree) == sorted(
        [tree_a["a_leaf"], tree_a["a_mid"]]
    )

    assert tree_b["b_root"] in by_root
    assert by_root[tree_b["b_root"]].game_source_id == tree_b["_game_source"]
    assert by_root[tree_b["b_root"]].card_ids_in_tree == [tree_b["b_child"]]

    assert result.unmatched_card_ids == []


async def test_resolve_roots_self_root_input_resolves_to_itself(async_session):
    """
    If an input card is itself a game-source root, resolve_roots must
    still return it correctly grouped under its own id (no recursion
    needed; the base case is terminal).
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")
    tree = await _build_tree(
        session, {"root": None}, user_id=USER_ALICE
    )

    repo = LineageRepository(session)
    result = await repo.resolve_roots(
        [tree["root"]], user_id=USER_ALICE
    )

    assert len(result.roots) == 1
    assert result.roots[0].root_card_id == tree["root"]
    assert result.roots[0].card_ids_in_tree == [tree["root"]]
    assert result.unmatched_card_ids == []


async def test_resolve_roots_unmatched_for_other_tenants_card(async_session):
    """
    Cross-tenant inputs are surfaced in `unmatched_card_ids` — the
    bulk lift of the per-card 404-not-403 invariant. Same status as
    "card doesn't exist."
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")
    await _seed_user(session, user_id=USER_BOB, username="bob")

    bob_tree = await _build_tree(
        session, {"root": None, "child": "root"}, user_id=USER_BOB
    )
    alice_tree = await _build_tree(
        session, {"root": None}, user_id=USER_ALICE, description="alice-tree"
    )

    repo = LineageRepository(session)
    result = await repo.resolve_roots(
        [
            alice_tree["root"],
            bob_tree["child"],   # owned by bob
            999_999,             # nonexistent
        ],
        user_id=USER_ALICE,
    )

    assert len(result.roots) == 1
    assert result.roots[0].root_card_id == alice_tree["root"]
    assert result.unmatched_card_ids == [bob_tree["child"], 999_999]


async def test_resolve_roots_empty_input_returns_empty(async_session):
    """
    Empty input short-circuits without a database round trip, returning
    an empty `RootResolution`.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")

    repo = LineageRepository(session)
    result = await repo.resolve_roots([], user_id=USER_ALICE)

    assert result.roots == []
    assert result.unmatched_card_ids == []


# =====================================================================
# fetch_tree_by_root
# =====================================================================


async def test_fetch_tree_by_root_returns_full_subtree(async_session):
    """
    A 5-node branching tree returned in full as a recursive CardTree
    structure, with `game_source_id` populated on the wrapper.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")
    ids = await _build_tree(
        session,
        {
            "r": None,
            "a": "r", "b": "r",
            "c": "a", "d": "b",
        },
        user_id=USER_ALICE,
    )

    repo = LineageRepository(session)
    rooted = await repo.fetch_tree_by_root(ids["r"], user_id=USER_ALICE)

    assert rooted.root_card_id == ids["r"]
    assert rooted.game_source_id == ids["_game_source"]
    assert rooted.tree.id == ids["r"]

    # Collect every id in the recursive structure.
    seen: set[int] = set()
    stack = [rooted.tree]
    while stack:
        node = stack.pop()
        seen.add(node.id)
        stack.extend(node.children)

    assert seen == {ids[k] for k in ("r", "a", "b", "c", "d")}

    # Verify parent-child relationships are correct.
    by_id = {}
    stack = [rooted.tree]
    while stack:
        node = stack.pop()
        by_id[node.id] = node
        stack.extend(node.children)

    r_kids = {n.id for n in by_id[ids["r"]].children}
    assert r_kids == {ids["a"], ids["b"]}
    a_kids = {n.id for n in by_id[ids["a"]].children}
    assert a_kids == {ids["c"]}
    b_kids = {n.id for n in by_id[ids["b"]].children}
    assert b_kids == {ids["d"]}


async def test_fetch_tree_by_root_404_for_other_tenants_root(async_session):
    """
    A root owned by another tenant raises CardNotFoundError — the
    per-resource 404-not-403 collapse from item 13.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")
    await _seed_user(session, user_id=USER_BOB, username="bob")
    bob_tree = await _build_tree(
        session, {"root": None}, user_id=USER_BOB
    )

    repo = LineageRepository(session)
    with pytest.raises(CardNotFoundError):
        await repo.fetch_tree_by_root(
            bob_tree["root"], user_id=USER_ALICE
        )


async def test_fetch_tree_by_root_404_for_non_root_card(async_session):
    """
    A mid-chain card (owned by the user) is not a game-source root and
    must be rejected. The endpoint accepts only game-source roots — a
    different question (subtree-from-arbitrary-anchor) would be a
    different endpoint.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")
    ids = await _build_tree(
        session,
        {"root": None, "mid": "root", "leaf": "mid"},
        user_id=USER_ALICE,
    )

    repo = LineageRepository(session)
    with pytest.raises(CardNotFoundError):
        await repo.fetch_tree_by_root(ids["mid"], user_id=USER_ALICE)


async def test_fetch_tree_by_root_overflow_returns_actual_size(async_session):
    """
    A tree larger than `max_nodes` raises LineageOverflowError with
    the exact `actual_size`. Per ADR-0002, no post-hoc truncation.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")

    # Build a 10-node chain.
    chain: Dict[str, Optional[str]] = {"n0": None}
    for i in range(1, 10):
        chain[f"n{i}"] = f"n{i - 1}"
    ids = await _build_tree(session, chain, user_id=USER_ALICE)

    repo = LineageRepository(session)
    with pytest.raises(LineageOverflowError) as exc:
        await repo.fetch_tree_by_root(
            ids["n0"], user_id=USER_ALICE, max_nodes=4
        )

    assert exc.value.actual_size == 10
    assert exc.value.max_nodes == 4


async def test_fetch_tree_by_root_at_exactly_max_nodes_succeeds(async_session):
    """
    A tree of exactly `max_nodes` nodes is allowed (the cap is
    inclusive). Boundary check on the LIMIT max_nodes + 1 detection.
    """
    session = async_session
    await _seed_user(session, user_id=USER_ALICE, username="alice")

    chain: Dict[str, Optional[str]] = {"n0": None}
    for i in range(1, 5):
        chain[f"n{i}"] = f"n{i - 1}"
    ids = await _build_tree(session, chain, user_id=USER_ALICE)

    repo = LineageRepository(session)
    rooted = await repo.fetch_tree_by_root(
        ids["n0"], user_id=USER_ALICE, max_nodes=5
    )

    seen: set[int] = set()
    stack = [rooted.tree]
    while stack:
        node = stack.pop()
        seen.add(node.id)
        stack.extend(node.children)
    assert len(seen) == 5
