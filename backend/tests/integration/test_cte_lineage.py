"""
tests/integration/test_cte_lineage.py
=======================================
Tier 2 — SQLAlchemy Integration Tests: ``LineageRepository.fetch_lineage``
and the recursive descent CTE.

These tests use a real in-memory SQLite database seeded via ``TreeBuilder``.
They verify that the recursive CTE backing ``fetch_lineage`` produces
correct node sets and depth assignments for a variety of tree topologies.

They do NOT test the coordinate computation (that is covered in
``test_graph_algorithms.py``); they test what ROWS come back from SQL.

Item 32a moved ``fetch_lineage`` from ``domain/tree_engine.py`` to
``repositories/lineage_repository.LineageRepository.fetch_lineage`` —
the function is now an instance method on the adapter, takes a
keyword-only ``user_id`` (item 16, tenancy), and returns ``CardNode``
objects wrapping typed ``Card`` domain entities.

Verified Contracts
------------------
- Correct node set returned for a given context_id.
- Depth values assigned by the CTE match the true distance from context.
- max_depth boundary: depth < max_depth (not depth <= max_depth).
- Non-root context_id as start node (subtree anchoring).
- Leaf context_id returns exactly one node.
- Nonexistent context_id returns an empty list.
- parent_id population on returned CardNode (carried via Card.card_source_id).

Retired tests
-------------
The former D-5 / D-6 tests exercised the pre-consolidation stubs in
``domain/tree_dsl.py`` (since deleted as dead code). Their still-applicable
coverage lives against the consolidated path:
- SubtreeSelection ancestor-walk (n=1 anchors at the parent) →
  ``test_pipeline_e2e.py::test_subtree_selection_n1_walks_up_one_ancestor``.
- ContextSelection returns only the context card →
  ``test_lineage_repository.py::test_fetch_selection_context_returns_only_the_context_card``.
"""
import pytest

from domain.auth import UserId
from repositories.lineage_repository import LineageRepository
from tests.helpers import get_by_id

pytestmark = pytest.mark.integration

# TreeBuilder defaults to user_id=1; tests use the same id for the
# fetch_lineage caller so the tenancy filter doesn't accidentally
# mask a row.
USER = UserId(1)


# ─── CTE-1: Full subtree from root ────────────────────────────────────────────

async def test_fetch_lineage_full_chain(seeded_session):
    """
    CTE-1: fetch_lineage on the root of a 4-node chain must return all 4 nodes
    with depths [0, 1, 2, 3].
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a", "c": "b"})

    nodes = await LineageRepository(session).fetch_lineage(ids["r"], user_id=USER)
    assert len(nodes) == 4

    by_id = get_by_id(nodes)
    assert by_id[ids["r"]].depth == 0
    assert by_id[ids["a"]].depth == 1
    assert by_id[ids["b"]].depth == 2
    assert by_id[ids["c"]].depth == 3


# ─── CTE-2: max_depth boundary (off-by-one probe) ────────────────────────────

async def test_fetch_lineage_max_depth_boundary(seeded_session):
    """
    CTE-2: The recursive step condition is ``base.c.depth < max_depth``.
    With max_depth=1, nodes at depth 0 AND depth 1 are included;
    nodes at depth 2 must be EXCLUDED.

    This is the canonical off-by-one test.  A ``<=`` implementation would
    incorrectly return depth-2 nodes.
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a", "c": "b"})

    nodes = await LineageRepository(session).fetch_lineage(
        ids["r"], max_depth=1, user_id=USER
    )
    returned_ids = {n.id for n in nodes}

    assert ids["r"] in returned_ids, "depth=0 (root) must be included"
    assert ids["a"] in returned_ids, "depth=1 must be included with max_depth=1"
    assert ids["b"] not in returned_ids, "depth=2 must be EXCLUDED with max_depth=1"
    assert ids["c"] not in returned_ids, "depth=3 must be EXCLUDED with max_depth=1"
    assert len(nodes) == 2


async def test_fetch_lineage_max_depth_zero_returns_only_root(seeded_session):
    """
    With max_depth=0, only the anchor node itself (depth=0) is returned.
    The recursive step condition ``0 < 0`` is false, so no children are fetched.
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a"})

    nodes = await LineageRepository(session).fetch_lineage(
        ids["r"], max_depth=0, user_id=USER
    )
    assert len(nodes) == 1
    assert nodes[0].id == ids["r"]
    assert nodes[0].depth == 0


async def test_fetch_lineage_max_depth_none_is_unbounded(seeded_session):
    """
    max_depth=None must return the entire subtree with no depth limit.
    """
    session, builder = seeded_session
    ids = await builder.build({
        "r": None, "a": "r", "b": "a", "c": "b", "d": "c"
    })

    nodes = await LineageRepository(session).fetch_lineage(
        ids["r"], max_depth=None, user_id=USER
    )
    assert len(nodes) == 5


# ─── CTE-3: Non-root context node ─────────────────────────────────────────────

async def test_fetch_lineage_mid_chain_context(seeded_session):
    """
    CTE-3: fetch_lineage anchored at a non-root node must return only that
    node and its descendants.  The parent chain must NOT be included.

    Tree: r → a → b → c
    Context: a (depth 1 in the full tree).
    Expected result: [a(depth=0), b(depth=1), c(depth=2)]
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a", "c": "b"})

    nodes = await LineageRepository(session).fetch_lineage(ids["a"], user_id=USER)
    returned_ids = {n.id for n in nodes}

    assert ids["r"] not in returned_ids, "Parent of context must NOT be returned"
    assert ids["a"] in returned_ids
    assert ids["b"] in returned_ids
    assert ids["c"] in returned_ids
    assert len(nodes) == 3

    by_id = get_by_id(nodes)
    assert by_id[ids["a"]].depth == 0, "Context node is always depth=0"
    assert by_id[ids["b"]].depth == 1
    assert by_id[ids["c"]].depth == 2


# ─── CTE-4: Leaf context ──────────────────────────────────────────────────────

async def test_fetch_lineage_leaf_context_returns_single_node(seeded_session):
    """
    CTE-4: A leaf node has no descendants.  fetch_lineage must return exactly
    one node: the leaf itself at depth=0.
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a"})

    nodes = await LineageRepository(session).fetch_lineage(ids["b"], user_id=USER)
    assert len(nodes) == 1
    assert nodes[0].id == ids["b"]
    assert nodes[0].depth == 0


# ─── CTE-5: Branching tree ────────────────────────────────────────────────────

async def test_fetch_lineage_branching_tree(seeded_session):
    """
    CTE-5: A branching tree fetched from root must return all nodes in all
    branches.
    
    Tree:   r → [a, b]; a → [c, d]; b → [e]
    Total:  6 nodes.
    """
    session, builder = seeded_session
    ids = await builder.build({
        "r": None,
        "a": "r", "b": "r",
        "c": "a", "d": "a",
        "e": "b",
    })

    nodes = await LineageRepository(session).fetch_lineage(ids["r"], user_id=USER)
    assert len(nodes) == 6

    by_id = get_by_id(nodes)
    assert by_id[ids["r"]].depth == 0
    assert by_id[ids["a"]].depth == 1
    assert by_id[ids["b"]].depth == 1
    assert by_id[ids["c"]].depth == 2
    assert by_id[ids["d"]].depth == 2
    assert by_id[ids["e"]].depth == 2


async def test_fetch_lineage_branching_tree_depth_1_only(seeded_session):
    """
    max_depth=1 on a branching tree: root + immediate children only.
    """
    session, builder = seeded_session
    ids = await builder.build({
        "r": None,
        "a": "r", "b": "r",
        "c": "a", "d": "a",
    })

    nodes = await LineageRepository(session).fetch_lineage(
        ids["r"], max_depth=1, user_id=USER
    )
    returned_ids = {n.id for n in nodes}

    assert ids["r"] in returned_ids
    assert ids["a"] in returned_ids
    assert ids["b"] in returned_ids
    assert ids["c"] not in returned_ids
    assert ids["d"] not in returned_ids


# ─── CTE-6: Nonexistent context_id ────────────────────────────────────────────

async def test_fetch_lineage_nonexistent_context_returns_empty(seeded_session):
    """
    CTE-6: A context_id that does not exist in the database must return an
    empty list without raising any exception.
    """
    session, builder = seeded_session
    await builder.build({"r": None})

    nodes = await LineageRepository(session).fetch_lineage(99999, user_id=USER)
    assert nodes == []


# ─── CTE-7: DescendantSelection depth>0 exclusion ────────────────────────────

async def test_descendant_selection_excludes_depth_zero(seeded_session):
    """
    CTE-7: In pipeline.py, DescendantSelection applies:
        pool = [n for n in pool if n.depth > 0]

    This test verifies that when we filter depth > 0 from fetch_lineage results,
    the context node (depth=0) is correctly excluded and all other nodes remain.
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "r", "c": "a"})

    raw_nodes = await LineageRepository(session).fetch_lineage(ids["r"], user_id=USER)
    descendants_only = [n for n in raw_nodes if n.depth > 0]

    returned_ids = {n.id for n in descendants_only}
    assert ids["r"] not in returned_ids, "Context node (depth=0) must be excluded"
    assert ids["a"] in returned_ids
    assert ids["b"] in returned_ids
    assert ids["c"] in returned_ids
    assert len(descendants_only) == 3


# ─── CTE-8: parent_id is correctly populated on CardNode ─────────────────────

async def test_fetch_lineage_parent_id_populated(seeded_session):
    """
    CardNode.parent_id (mapped from cte.c.card_source_id) must correctly
    reflect each node's actual parent.  This is critical for
    compute_structural_coords to build the children map correctly.
    """
    session, builder = seeded_session
    ids = await builder.build({"r": None, "a": "r", "b": "a"})

    nodes = await LineageRepository(session).fetch_lineage(ids["r"], user_id=USER)
    by_id = get_by_id(nodes)

    root = by_id[ids["r"]]
    child_a = by_id[ids["a"]]
    child_b = by_id[ids["b"]]

    # Root's parent in the CTE result is NULL (game_source, not a card).
    assert root.parent_id is None or root.parent_id not in by_id, (
        "Root node's parent_id must not point to another node in the pool"
    )
    assert child_a.parent_id == ids["r"], "a's parent must be the root"
    assert child_b.parent_id == ids["a"], "b's parent must be a"
