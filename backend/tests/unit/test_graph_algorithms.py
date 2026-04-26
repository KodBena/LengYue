"""
tests/unit/test_graph_algorithms.py
====================================
Tier 1 — Pure Python Unit Tests: ``compute_structural_coords``

No database.  No SQLAlchemy execution.  No async.

Strategy
--------
Every test here exercises the graph math in ``domain/tree_engine.py`` using
hand-constructed ``CardNode`` objects backed by ``FakeRow`` stubs.

The tests are structured in three layers:

  1. **Exact coordinate tests** — parametrised over known topologies with
     hand-calculated expected values.

  2. **Algebraic invariant tests** — applied to every topology, they verify
     the *mathematical laws* that must hold regardless of specific values
     (height law, size conservation, heavy-path permutation, heavy-child
     precedence).

  3. **Edge-case and defect tests** — probes that target specific
     implementation decisions and documented bugs.

Known Defects Documented Here
------------------------------
- D-1: ``_visit_bottom_up`` / ``_visit_heavy`` are recursive →
        ``RecursionError`` on deep chains.  Marked ``xfail(strict=True)``.
- D-2: ``centroid_rank`` is never computed or initialised on ``CardNode``.
        Marked ``xfail(strict=True)``.
- D-B: ``compute_structural_coords`` is not idempotent: ``subtree_size``
        accumulates on repeated calls due to ``+=`` without reset.
"""
import sys
import pytest
from typing import List, Optional

from domain.tree_engine import CardNode, compute_structural_coords
from tests.helpers import (
    FakeRow,
    make_node,
    build_nodes,
    build_chain,
    get_by_id,
    assert_height_invariant,
    assert_size_invariant,
    assert_root_conservation,
    assert_heavy_path_permutation,
    assert_heavy_child_consecutive_rank,
)

pytestmark = pytest.mark.unit


# ─── Parametrised Topology Fixtures ──────────────────────────────────────────
#
# Each entry is (topology_name, adjacency_dict, expected_coords_dict).
# adjacency_dict: {node_id: parent_id_or_None}  (insertion order matters for
#                 tie-breaking in heavy-path decomposition)
# expected_coords_dict: {node_id: {"height": int, "size": int, "hp_rank": int}}
#
# Expected values are computed by hand using the algorithm defined in
# tree_engine.py and validated against REFERENCE.md semantics.

TOPOLOGY_CASES = [
    pytest.param(
        "single_node",
        {1: None},
        {1: {"height": 0, "size": 1, "hp_rank": 0}},
        id="single_node",
    ),
    pytest.param(
        "two_node_chain",
        {1: None, 2: 1},
        {
            1: {"height": 1, "size": 2, "hp_rank": 0},
            2: {"height": 0, "size": 1, "hp_rank": 1},
        },
        id="two_node_chain",
    ),
    pytest.param(
        "three_node_chain",
        {1: None, 2: 1, 3: 2},
        {
            1: {"height": 2, "size": 3, "hp_rank": 0},
            2: {"height": 1, "size": 2, "hp_rank": 1},
            3: {"height": 0, "size": 1, "hp_rank": 2},
        },
        id="three_node_chain",
    ),
    pytest.param(
        "star_root_three_leaves",
        # Root 1 with leaves 2, 3, 4.  Children are inserted in order 2→3→4.
        # After stable-sort by size (all equal=1), heavy child = first = 2.
        {1: None, 2: 1, 3: 1, 4: 1},
        {
            1: {"height": 1, "size": 4, "hp_rank": 0},
            2: {"height": 0, "size": 1, "hp_rank": 1},  # heavy (first equal)
            3: {"height": 0, "size": 1, "hp_rank": 2},
            4: {"height": 0, "size": 1, "hp_rank": 3},
        },
        id="star_root_three_leaves",
    ),
    pytest.param(
        "unbalanced_fork",
        # 1 → [2, 5]; 2 → [3]; 3 → [4]
        # Main line: 1→2→3→4 (size 3 > 1).  Light child: 5.
        {1: None, 2: 1, 5: 1, 3: 2, 4: 3},
        {
            1: {"height": 3, "size": 5, "hp_rank": 0},
            2: {"height": 2, "size": 3, "hp_rank": 1},
            3: {"height": 1, "size": 2, "hp_rank": 2},
            4: {"height": 0, "size": 1, "hp_rank": 3},
            5: {"height": 0, "size": 1, "hp_rank": 4},
        },
        id="unbalanced_fork",
    ),
    pytest.param(
        "perfect_binary_depth_2",
        # Level 0:     1
        # Level 1:   2   3
        # Level 2: 4  5 6  7
        # Both subtrees of 1 have equal size=3; stable sort keeps 2 before 3.
        # Heavy path: 1→2→4; then 5; then 3→6; then 7.
        {1: None, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3},
        {
            1: {"height": 2, "size": 7, "hp_rank": 0},
            2: {"height": 1, "size": 3, "hp_rank": 1},
            4: {"height": 0, "size": 1, "hp_rank": 2},
            5: {"height": 0, "size": 1, "hp_rank": 3},
            3: {"height": 1, "size": 3, "hp_rank": 4},
            6: {"height": 0, "size": 1, "hp_rank": 5},
            7: {"height": 0, "size": 1, "hp_rank": 6},
        },
        id="perfect_binary_depth_2",
    ),
    pytest.param(
        "forest_two_independent_trees",
        # Tree A: 10→11.  Tree B: 20→21.
        # _visit_heavy visits roots in the order they appear in `nodes`.
        # Roots list = [10, 20] (11 and 21 have parents in the pool).
        {10: None, 11: 10, 20: None, 21: 20},
        {
            10: {"height": 1, "size": 2, "hp_rank": 0},
            11: {"height": 0, "size": 1, "hp_rank": 1},
            20: {"height": 1, "size": 2, "hp_rank": 2},
            21: {"height": 0, "size": 1, "hp_rank": 3},
        },
        id="forest_two_independent_trees",
    ),
]


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_exact_coordinates(name, adjacency, expected):
    """
    Verify that compute_structural_coords produces the exact expected height,
    subtree_size, and heavy_path_rank for each known topology.

    These are hand-calculated ground-truth values.  A failure here means the
    algorithm produces a different result than the specification.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)

    for nid, exp in expected.items():
        n = by_id[nid]
        assert n.height == exp["height"], (
            f"[{name}] node {nid}: height={n.height}, expected {exp['height']}"
        )
        assert n.subtree_size == exp["size"], (
            f"[{name}] node {nid}: subtree_size={n.subtree_size}, expected {exp['size']}"
        )
        assert n.heavy_path_rank == exp["hp_rank"], (
            f"[{name}] node {nid}: heavy_path_rank={n.heavy_path_rank}, "
            f"expected {exp['hp_rank']}"
        )


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_height_algebraic_invariant(name, adjacency, expected):
    """
    H1 + H2: the algebraic height law must hold for every topology regardless
    of the absolute values.  This catches bugs in the recursive height formula
    that might not be visible in small exact-value tests.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    assert_height_invariant(nodes)


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_size_algebraic_invariant(name, adjacency, expected):
    """
    S1 + S2: subtree size is self-consistent at every node.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    assert_size_invariant(nodes)


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_root_conservation_law(name, adjacency, expected):
    """
    S3: root.subtree_size == total nodes reachable from that root.

    A violation here means at least one node is being double-counted or missed.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    assert_root_conservation(nodes)


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_heavy_path_rank_is_permutation(name, adjacency, expected):
    """
    HP1: {heavy_path_rank} == {0, …, N-1}.

    No rank may be assigned twice (collision) or skipped (gap).  A violation
    means the DFS visitation counter is wrong.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    assert_heavy_path_permutation(nodes)


@pytest.mark.parametrize("name, adjacency, expected", TOPOLOGY_CASES)
def test_heavy_child_has_consecutive_rank(name, adjacency, expected):
    """
    HP2: for every internal node P, the child with the largest subtree_size
    must have heavy_path_rank == P.heavy_path_rank + 1.

    This is the defining property of heavy-light decomposition: the heavy path
    from any node is visited contiguously in DFS pre-order.
    """
    nodes = build_nodes(adjacency)
    compute_structural_coords(nodes)
    assert_heavy_child_consecutive_rank(nodes)


# ─── Standalone Edge Case Tests ───────────────────────────────────────────────

def test_empty_list_is_noop():
    """
    compute_structural_coords([]) must return immediately without error.
    The function has an explicit early-return guard; this test ensures it
    stays there.
    """
    compute_structural_coords([])  # Must not raise.


def test_single_node_default_attributes():
    """
    A pool containing only a single node with no parent.
    All structural coords must equal their initial default values.
    """
    nodes = [make_node(1, parent_id=None)]
    compute_structural_coords(nodes)
    n = nodes[0]
    assert n.height == 0
    assert n.subtree_size == 1
    assert n.heavy_path_rank == 0


def test_orphaned_context_node_as_local_root():
    """
    When DescendantSelection fetches nodes, the context node (depth=0) is
    excluded AFTER the query, leaving a pool whose top-level nodes have parents
    that do not appear in the pool.

    Those top-level nodes must be recognised as local roots by the algorithm.

    Simulated scenario:  full tree is 1→2→3→4.
    Pool contains only [2, 3, 4] (node 1 excluded).
    Node 2's parent (1) is NOT in the pool → node 2 is the local root.
    """
    nodes = build_nodes({2: 1, 3: 2, 4: 3})  # parent of 2 is 1, which is absent
    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)

    assert by_id[2].height == 2, "Node 2 should be local root with height 2"
    assert by_id[2].subtree_size == 3, "Node 2's subtree covers 3 nodes"
    assert by_id[2].heavy_path_rank == 0, "Local root should get rank 0"
    assert by_id[3].heavy_path_rank == 1
    assert by_id[4].heavy_path_rank == 2


def test_forest_three_independent_single_nodes():
    """
    A pool of three completely unrelated single-node trees.
    Each is its own root with the minimal coords: h=0, s=1.
    HP1 must still hold globally: ranks = {0, 1, 2}.
    """
    nodes = [make_node(10), make_node(20), make_node(30)]
    compute_structural_coords(nodes)

    by_id = get_by_id(nodes)
    for nid in [10, 20, 30]:
        assert by_id[nid].height == 0
        assert by_id[nid].subtree_size == 1

    assert_heavy_path_permutation(nodes)


def test_star_heavy_child_is_first_sibling_on_tie():
    """
    In a star topology all children have equal subtree_size = 1.
    Python's sort is stable: the first sibling in insertion order becomes
    the heavy child (rank = parent_rank + 1).

    This test pins the tie-breaking contract.  If the implementation changes
    to a different strategy, the expected rank must be updated.
    """
    #  Insert order: 1 (root), then 2, 3, 4, 5 (leaves)
    nodes = build_nodes({1: None, 2: 1, 3: 1, 4: 1, 5: 1})
    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)

    # Node 2 was inserted first → it must be the heavy child → rank 1.
    assert by_id[2].heavy_path_rank == by_id[1].heavy_path_rank + 1, (
        "First inserted sibling must be heavy child on tie"
    )


def test_linear_chain_heights_are_strictly_decreasing():
    """
    In a chain 1→2→3→4→5, heights must be [4, 3, 2, 1, 0] from root to leaf.
    """
    nodes = build_chain(5)
    compute_structural_coords(nodes)
    heights = [nodes[i].height for i in range(5)]
    assert heights == [4, 3, 2, 1, 0], f"Chain heights wrong: {heights}"


def test_linear_chain_sizes_are_strictly_decreasing():
    """
    In a chain 1→2→3→4→5, sizes must be [5, 4, 3, 2, 1] from root to leaf.
    """
    nodes = build_chain(5)
    compute_structural_coords(nodes)
    sizes = [nodes[i].subtree_size for i in range(5)]
    assert sizes == [5, 4, 3, 2, 1], f"Chain sizes wrong: {sizes}"


def test_linear_chain_heavy_path_is_the_entire_chain():
    """
    In a chain, every node has exactly one child, so every child is the heavy
    child.  The heavy path runs the full length: ranks = [0, 1, 2, 3, 4].
    """
    nodes = build_chain(5)
    compute_structural_coords(nodes)
    ranks = [nodes[i].heavy_path_rank for i in range(5)]
    assert ranks == [0, 1, 2, 3, 4], f"Chain ranks wrong: {ranks}"


def test_nodes_preserve_initial_state_before_compute():
    """
    Before compute_structural_coords is called, CardNode defaults must be:
      height = 0, subtree_size = 1, heavy_path_rank = 0.

    This is important: pipeline code that reads these fields before compute
    gets well-defined (if incorrect) values, not undefined/None.
    """
    n = make_node(1, parent_id=None)
    assert n.height == 0
    assert n.subtree_size == 1
    assert n.heavy_path_rank == 0


# ─── Defect Tests ─────────────────────────────────────────────────────────────
#
# These tests are marked xfail(strict=True):
#   - XFAIL (x) when the defect is present → expected, CI stays green.
#   - XPASS when the defect is fixed → treated as a TEST FAILURE, forcing the
#     team to remove the xfail mark and write a passing regression test.

@pytest.mark.xfail(
    strict=True,
    reason=(
        "D-1: _visit_bottom_up and _visit_heavy are implemented with Python "
        "recursion. A linear chain longer than sys.getrecursionlimit() causes "
        "RecursionError. Fix: convert to iterative post-order (e.g. explicit "
        "stack) or use sys.setrecursionlimit() with a safety margin."
    ),
)
def test_deep_chain_causes_recursion_error():
    """
    D-1: RecursionError on deep chains.

    We temporarily lower the recursion limit to 50 and attempt to compute
    coords on a chain of 200 nodes.  The test expects this to FAIL today.

    Once the implementation is rewritten iteratively, this test will XPASS,
    signalling that the xfail mark must be removed and a proper passing test
    for deep chains added in its place.
    """
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(50)
    try:
        nodes = build_chain(200)
        # If the implementation is still recursive this raises RecursionError.
        # If it has been fixed iteratively, it succeeds → XPASS.
        compute_structural_coords(nodes)
        # Verify correctness after a successful deep-chain compute.
        by_id = get_by_id(nodes)
        assert by_id[1].subtree_size == 200
        assert by_id[200].height == 0
    finally:
        sys.setrecursionlimit(old_limit)


@pytest.mark.xfail(
    strict=True,
    reason=(
        "D-2: centroid_rank is specified in REFERENCE.md and referenced by "
        "_apply_order in pipeline.py, but it is never computed by "
        "compute_structural_coords and is not initialised on CardNode.__init__. "
        "Accessing n.centroid_rank raises AttributeError at runtime."
    ),
)
def test_centroid_rank_is_computed_after_compute_structural_coords():
    """
    D-2: centroid_rank not implemented.

    After compute_structural_coords runs, every node should have a
    ``centroid_rank`` integer attribute.  Today it does not exist at all.
    """
    nodes = build_nodes({1: None, 2: 1, 3: 1, 4: 2, 5: 2})
    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)

    for n in nodes:
        # This attribute access raises AttributeError today → xfail.
        _ = n.centroid_rank

    # When implemented, centroid_rank must also be a permutation.
    assert_heavy_path_permutation(nodes)  # Reuse HP1 shape check (rename to assert_rank_permutation)


def test_compute_structural_coords_is_NOT_idempotent():
    """
    D-Bug: compute_structural_coords mutates CardNode in place and is NOT safe
    to call twice on the same node objects.

    Root cause: ``node.subtree_size += by_id[cid].subtree_size`` accumulates
    on top of the already-mutated value from a previous call.  The second call
    does not reset subtree_size to 1 before accumulating.

    In production this does not matter because fetch_lineage creates fresh
    CardNode objects for each pipeline run.  But it is a latent correctness
    hazard if nodes are ever cached or reused.

    This test documents the bug as an observed behaviour:
      - After the first call: root.subtree_size == 3  (correct)
      - After the second call: root.subtree_size == 5  (wrong, should be 3)
    """
    # Tree: 1 → [2, 3]
    nodes = build_nodes({1: None, 2: 1, 3: 1})

    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)
    assert by_id[1].subtree_size == 3, "First call must be correct"

    # Second call — subtree_size accumulates again.
    compute_structural_coords(nodes)
    # If the implementation were idempotent this would still be 3.
    # Because it is NOT idempotent, we assert the buggy value to document it.
    assert by_id[1].subtree_size != 3, (
        "If this assertion fails, compute_structural_coords has been made "
        "idempotent — delete this test and add a passing idempotency test."
    )


def test_height_is_recomputed_correctly_on_second_call():
    """
    Unlike subtree_size (which accumulates), height is assigned with ``=``
    and is therefore correctly recomputed on repeated calls.

    This proves that the non-idempotency defect is isolated to subtree_size.
    """
    nodes = build_nodes({1: None, 2: 1, 3: 1})

    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)
    first_heights = {n.id: n.height for n in nodes}

    compute_structural_coords(nodes)
    second_heights = {n.id: n.height for n in nodes}

    assert first_heights == second_heights, (
        "height must be stable across repeated calls (it uses = not +=)"
    )


def test_heavy_path_rank_is_recomputed_correctly_on_second_call():
    """
    heavy_path_rank is also assigned with ``=`` inside _visit_heavy and is
    therefore correctly recomputed on repeated calls.
    """
    nodes = build_nodes({1: None, 2: 1, 5: 1, 3: 2, 4: 3})

    compute_structural_coords(nodes)
    first_ranks = {n.id: n.heavy_path_rank for n in nodes}

    compute_structural_coords(nodes)
    second_ranks = {n.id: n.heavy_path_rank for n in nodes}

    assert first_ranks == second_ranks


def test_node_with_itself_as_effective_forest_root_after_parent_filtered_out():
    """
    If the full tree has root R with children A and B, and we build a pool
    containing only [A, B, child_of_A], both A and B become local roots.

    Their combined subtree sizes must account for all pool members:
    A.subtree_size + B.subtree_size == 3 == len(pool).
    """
    # Full tree: 0 → [1, 2]; 1 → [3]
    # Pool: [1, 2, 3] (root 0 excluded)
    nodes = build_nodes({1: 0, 2: 0, 3: 1})  # parent 0 not in pool
    compute_structural_coords(nodes)
    by_id = get_by_id(nodes)

    # A and B are local roots; 0 is absent.
    total = by_id[1].subtree_size + by_id[2].subtree_size
    assert total == 3, (
        f"Combined subtree sizes of local roots should equal pool size, got {total}"
    )
    assert by_id[1].subtree_size == 2, "Node 1 has one child (node 3)"
    assert by_id[2].subtree_size == 1, "Node 2 is a leaf in the pool"
    assert by_id[3].subtree_size == 1


def test_two_roots_hp1_is_still_global_permutation():
    """
    In a forest with two roots R1 and R2, the heavy_path_rank values must form
    a GLOBAL permutation over the entire pool, not a per-tree permutation.

    This tests that _visit_heavy's rank_counter persists correctly across
    multiple root invocations.
    """
    # Two independent chains of length 3.
    nodes = build_nodes({
        1: None, 2: 1, 3: 2,      # chain A
        10: None, 11: 10, 12: 11, # chain B
    })
    compute_structural_coords(nodes)
    assert_heavy_path_permutation(nodes)  # {0,1,2,3,4,5} globally
