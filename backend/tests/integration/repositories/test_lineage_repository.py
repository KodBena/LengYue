"""
tests/integration/repositories/test_lineage_repository.py

Adapter-level integration tests for ``LineageRepository.fetch_selection``,
the typed-DSL multi-context path.

Existing test files cover:
  - ``test_cte_lineage.py``: ``fetch_lineage`` (raw subtree).
  - ``test_lineage_endpoints.py``: ``resolve_roots`` and
    ``fetch_tree_by_root`` (the card-tree endpoints).

This file fills the gap: ``fetch_selection`` against various
``BaseSelection`` subtypes, multi-context union behaviour, and the
tenancy filter at base + recursive step (defense in depth).

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
    users,
)
from domain.auth import UserId
from domain.pipeline_dsl import (
    AncestorSelection,
    ContextSelection,
    DescendantSelection,
    IntersectSelection,
    SiblingSelection,
    SubtreeSelection,
    UnionSelection,
)
from repositories.lineage_repository import LineageRepository

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
        .values(
            position_id=pos, user_id=user_id, description=description,
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
            raise ValueError(f"Cycle in adjacency: {list(remaining)}")
    await session.flush()
    ids["_game_source"] = gs_id
    return ids


# ─── DescendantSelection ──────────────────────────────────────────────────────


async def test_fetch_selection_descendant_returns_descendants_excluding_context(
    async_session,
):
    """
    DescendantSelection's contract: descendants of the context, NOT
    including the context itself. The base predicate is
    ``card_source.card_source_id.in_(context_ids)`` — children, not
    self.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session, {"r": None, "a": "r", "b": "a"}, user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(),
        [ids["r"]],
        user_id=ALICE,
    )

    seen = {n.id for n in nodes}
    assert ids["r"] not in seen, "context itself must not be in result"
    assert seen == {ids["a"], ids["b"]}


async def test_fetch_selection_descendant_max_depth_caps_descent(async_session):
    """
    With max_depth=1 from "r": only the immediate children appear
    (depth=1). The context is excluded; depth-2 nodes are excluded.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a", "c": "b"},
        user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(max_depth=1),
        [ids["r"]],
        user_id=ALICE,
    )
    seen = {n.id for n in nodes}
    assert seen == {ids["a"]}


# ─── ContextSelection ─────────────────────────────────────────────────────────


async def test_fetch_selection_context_returns_only_the_context_card(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session, {"r": None, "a": "r"}, user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        ContextSelection(), [ids["a"]], user_id=ALICE,
    )

    assert len(nodes) == 1
    assert nodes[0].id == ids["a"]


# ─── SiblingSelection ─────────────────────────────────────────────────────────


async def test_fetch_selection_sibling_returns_siblings_excluding_context(
    async_session,
):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "r", "c": "r"},
        user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        SiblingSelection(), [ids["a"]], user_id=ALICE,
    )
    seen = {n.id for n in nodes}
    assert ids["a"] not in seen, "context card itself must not be in result"
    assert seen == {ids["b"], ids["c"]}


# ─── AncestorSelection ────────────────────────────────────────────────────────


async def test_fetch_selection_ancestor_n1_returns_parent(async_session):
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a", "c": "b"},
        user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        AncestorSelection(n=1), [ids["c"]], user_id=ALICE,
    )

    seen = {n.id for n in nodes}
    assert ids["b"] in seen, "n=1 must return the immediate parent"


# ─── Multi-context (item 30c) ────────────────────────────────────────────────


async def test_fetch_selection_multi_context_unions_descendants(async_session):
    """Two independent subtrees, queried in one call: descendants union."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    a_ids = await _build_tree(
        session,
        {"r": None, "child": "r", "leaf": "child"},
        user_id=ALICE,
        description="tree-A",
    )
    b_ids = await _build_tree(
        session,
        {"r": None, "child": "r"},
        user_id=ALICE,
        description="tree-B",
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(),
        [a_ids["r"], b_ids["r"]],
        user_id=ALICE,
    )

    seen = {n.id for n in nodes}
    # Descendants only — neither root is in the result.
    assert a_ids["r"] not in seen
    assert b_ids["r"] not in seen
    # All non-root nodes from both trees are.
    assert {a_ids["child"], a_ids["leaf"], b_ids["child"]} <= seen


async def test_fetch_selection_empty_context_ids_returns_empty_list(
    async_session,
):
    """Empty input short-circuits — no DB round trip."""
    session = async_session
    await _seed_user(session, user_id=ALICE)

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(), [], user_id=ALICE,
    )
    assert nodes == []


# ─── Tenancy (item 16): base + recursive step filtering ───────────────────────


async def test_fetch_selection_starting_from_other_tenants_card_returns_empty(
    async_session,
):
    """
    Item 16 base-case filter: a request that starts from another
    tenant's context returns nothing — the descent never gets off
    the ground.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    bob_ids = await _build_tree(
        session, {"r": None, "leaf": "r"}, user_id=BOB,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(), [bob_ids["r"]], user_id=ALICE,
    )
    assert nodes == []


async def test_fetch_selection_does_not_cross_tenant_boundary_in_descent(
    async_session,
):
    """
    Item 16 recursive-step filter: a descent that started owned by
    Alice cannot pick up a child that's owned by Bob, even when
    historical data introduced a cross-tenant card_source edge.

    We simulate that historical state by:
      - building Alice's root tree via the normal path (root + a child),
      - inserting a Bob-owned card directly,
      - linking Bob's card under Alice's root via a hand-rolled
        card_source row (the schema's CheckConstraint allows it; the
        UNIQUE on card_id means the new card has at most one parent,
        which we satisfy by linking exactly once).

    With item 16's recursive-step filter, Alice's descent finds her
    own child but stops at Bob's card.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    await _seed_user(session, user_id=BOB)
    alice_ids = await _build_tree(
        session,
        {"r": None, "alice_child": "r"},
        user_id=ALICE,
        description="alice-tree",
    )

    # Hand-create Bob's card and link it under Alice's root.
    pos = await _seed_position(session, content="(;c[bob])")
    res = await session.execute(
        insert(card)
        .values(
            num_moves=5, alpha=3.0, beta=3.0, t=1.0,
            user_id=BOB, normalized_position_id=pos,
        )
        .returning(card.c.id)
    )
    bob_card_id = int(res.scalar())
    await session.execute(insert(card_source).values(
        card_id=bob_card_id,
        card_source_id=alice_ids["r"],
        is_primary_source=False,
    ))
    await session.flush()

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        DescendantSelection(), [alice_ids["r"]], user_id=ALICE,
    )
    seen = {n.id for n in nodes}
    # Alice's own child appears.
    assert alice_ids["alice_child"] in seen
    # Bob's card does NOT appear, despite the cross-tenant edge.
    assert bob_card_id not in seen, (
        "recursive-step user_id filter must reject Bob's card "
        "even though card_source links it under Alice's root"
    )


# ─── UnionSelection / IntersectSelection ──────────────────────────────────────


async def test_fetch_selection_union_returns_combined_nodes(async_session):
    """Union of (Descendant max=1) and (Sibling) over the context."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "r", "leaf": "a"},
        user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        UnionSelection(
            a=DescendantSelection(max_depth=1),
            b=SiblingSelection(),
        ),
        [ids["a"]],
        user_id=ALICE,
    )
    seen = {n.id for n in nodes}
    # Descendant(a, max_depth=1) excludes the context: {leaf}
    # Sibling(a): {b}
    assert seen == {ids["leaf"], ids["b"]}


async def test_fetch_selection_intersect_returns_overlap(async_session):
    """
    Intersect (DescendantSelection) ∩ (DescendantSelection max=1):
    overlapping selections collapse to the immediate-children set.
    """
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session,
        {"r": None, "a": "r", "b": "a"},
        user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        IntersectSelection(
            a=DescendantSelection(),
            b=DescendantSelection(max_depth=1),
        ),
        [ids["r"]],
        user_id=ALICE,
    )
    seen = {n.id for n in nodes}
    # Both branches include "a" (immediate child); only the unbounded
    # branch includes "b". Intersection: {a}.
    assert seen == {ids["a"]}


async def test_fetch_selection_intersect_disjoint_returns_empty(async_session):
    """Disjoint sub-selections yield an empty result."""
    session = async_session
    await _seed_user(session, user_id=ALICE)
    ids = await _build_tree(
        session, {"r": None, "a": "r"}, user_id=ALICE,
    )

    repo = LineageRepository(session)
    nodes = await repo.fetch_selection(
        IntersectSelection(
            a=DescendantSelection(),
            b=ContextSelection(),
        ),
        [ids["r"]],
        user_id=ALICE,
    )
    # Descendant excludes the context; ContextSelection IS the context.
    # No overlap.
    assert nodes == []
