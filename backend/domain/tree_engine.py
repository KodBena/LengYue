"""
Pure tree algorithms over CardNode structures.

Item 32a: this module is now genuinely free of SQLAlchemy and
db.schema imports. The two previously-SQL-coupled functions
(`fetch_lineage` and `build_selection_cte`) moved to
`repositories/lineage_repository.py`. What remains here is the pure
algorithmic layer: the `CardNode` type and `compute_structural_coords`,
the O(N) traversal that decorates an already-assembled node list with
height, subtree_size, heavy_path_rank, and centroid_rank.

CardNode itself was also refactored in 32a:

- Before: CardNode(row) where row was a SQLAlchemy Row object;
  access was `n.id`, `n.parent_id`, `n.data.num_reviews` (reaching
  through to the row).
- After: CardNode(card, depth) where card is a typed `Card` domain
  entity. Access is `n.card.num_reviews` directly. `n.id` and
  `n.parent_id` are properties computed from `card.id` and
  `card.card_source_id` — preserved so compute_structural_coords
  and existing order-key functions don't need rewriting.

The mutable structural fields (height, subtree_size, etc.) remain
mutable because compute_structural_coords writes to them in place —
a deliberate performance choice for a hot path that runs once per
pipeline execution on the full pool. If profiling ever shows this
isn't a bottleneck, the whole thing can become a pure
`(List[CardNode]) -> List[CardNodeWithCoords]` transformation.
"""
from typing import List, Optional

from domain.card import Card


class CardNode:
    """
    A card in the tree, enriched with its traversal depth and space
    for the structural coordinates computed by compute_structural_coords.

    Item 32a: now wraps a typed `Card` domain entity instead of a
    SQLAlchemy Row. Downstream code that needs card data (the
    NumReviewsKey / NumMovesKey / EbisuRecallKey scorers in the
    pipeline executor, the final projection loop) reads `n.card.*`
    rather than `n.data.*`. `n.id` and `n.parent_id` remain as
    properties for the structural-computation code that thinks of
    the tree by id.

    Not frozen: compute_structural_coords writes to height,
    subtree_size, heavy_path_rank, and centroid_rank in place.
    """

    def __init__(self, card: Card, depth: int):
        self.card = card
        self.depth = depth
        self.height = 0
        self.subtree_size = 1
        self.heavy_path_rank = 0
        self.centroid_rank = 0

    @property
    def id(self) -> int:
        return self.card.id

    @property
    def parent_id(self) -> Optional[int]:
        return self.card.card_source_id


def compute_structural_coords(nodes: List[CardNode]) -> None:
    """
    Computes Height, Subtree Size, Heavy-Path Rank, and Centroid Rank
    for a forest of CardNodes, in-place.

    O(N) per traversal, four traversals total — negligible for the
    pool sizes we operate on (at most a few thousand cards per
    pipeline run).

    Pure Python: this function takes and returns no SQL, no session,
    no database handle. It operates solely on the shape of the node
    list.
    """
    if not nodes:
        return

    by_id = {n.id: n for n in nodes}
    children: dict[int, list[int]] = {n.id: [] for n in nodes}
    for n in nodes:
        if n.parent_id in by_id:
            children[n.parent_id].append(n.id)

    # 1. Post-order: height and subtree_size
    visited: set[int] = set()

    def _visit_bottom_up(nid: int) -> None:
        if nid in visited:
            return
        node = by_id[nid]
        for cid in children.get(nid, []):
            _visit_bottom_up(cid)
            node.subtree_size += by_id[cid].subtree_size

        if children.get(nid):
            node.height = 1 + max(by_id[cid].height for cid in children[nid])
        else:
            node.height = 0
        visited.add(nid)

    roots = [n.id for n in nodes if n.parent_id not in by_id]
    for r in roots:
        _visit_bottom_up(r)

    # 2. Heavy-Path decomposition (pre-order with children sorted by subtree_size).
    # Main line gets rank 0, rank 1, ...
    rank_counter = [0]

    def _visit_heavy(nid: int) -> None:
        node = by_id[nid]
        node.heavy_path_rank = rank_counter[0]
        rank_counter[0] += 1

        kids = children.get(nid, [])
        if not kids:
            return

        # Heavy child first
        kids.sort(key=lambda x: by_id[x].subtree_size, reverse=True)
        for cid in kids:
            _visit_heavy(cid)

    for r in roots:
        _visit_heavy(r)

    # 3. Centroid decomposition
    c_rank = [0]

    def _centroid_decompose(component: set) -> None:
        if not component:
            return

        def _sizes() -> dict:
            sz: dict = {}
            vis: set = set()

            def _calc(nid: int) -> int:
                if nid in vis:
                    return sz.get(nid, 0)
                vis.add(nid)
                count = 1
                for c in children.get(nid, []):
                    if c in component:
                        count += _calc(c)
                sz[nid] = count
                return count

            local_roots = [
                n for n in component if by_id[n].parent_id not in component
            ]
            for lr in local_roots:
                _calc(lr)
            return sz

        sz = _sizes()
        n_comp = len(component)
        centroid = min(
            component, key=lambda v: max(sz.get(v, 1), n_comp - sz.get(v, 1))
        )
        by_id[centroid].centroid_rank = c_rank[0]
        c_rank[0] += 1

        child_components = []
        all_child_nodes: set = set()
        for cid in children.get(centroid, []):
            if cid not in component:
                continue
            sub: set = set()
            dfs = [cid]
            while dfs:
                curr = dfs.pop()
                if curr in component:
                    sub.add(curr)
                    dfs.extend(c for c in children.get(curr, []) if c in component)
            child_components.append(sub)
            all_child_nodes.update(sub)

        upward = component - {centroid} - all_child_nodes
        if upward:
            child_components.append(upward)

        for sub in child_components:
            _centroid_decompose(sub)

    for r in roots:
        tree_nodes: set = set()
        dfs = [r]
        while dfs:
            curr = dfs.pop()
            tree_nodes.add(curr)
            dfs.extend(children.get(curr, []))
        _centroid_decompose(tree_nodes)
