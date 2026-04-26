"""
tests/helpers.py

Shared test infrastructure used by both the pure unit tests and the
SQLAlchemy integration tests.

Provides:
  - FakeRow:       A minimal stand-in for a SQLAlchemy Row, so unit tests can
                   construct CardNode objects without touching a database.
  - make_node():   Convenience wrapper around FakeRow + CardNode.
  - build_nodes(): Build a list of CardNodes from an adjacency dict.
  - build_chain(): Construct a linear chain of N nodes.
  - TreeBuilder:   Seeds an async SQLAlchemy session with a typed card tree,
                   handling all FK dependencies (users, normalized_position,
                   game_source) automatically.
"""
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession


# ─── Pure-Python Helpers ─────────────────────────────────────────────────────

class FakeRow:
    """
    Minimal stand-in for a SQLAlchemy Row object.

    CardNode.__init__ only reads:
        row.id, row.card_source_id, row.depth

    The remaining attributes are the card columns that CardNode.data exposes
    to the pipeline for Ebisu scoring and CardResponse construction.
    All defaults are chosen to make pure-math operations succeed without
    requiring real data.
    """
    def __init__(
        self,
        node_id: int,
        parent_id: Optional[int] = None,
        depth: int = 0,
        *,
        alpha: float = 3.0,
        beta: float = 3.0,
        t: float = 1.0,
        num_moves: int = 5,
        num_reviews: int = 0,
        suspended: bool = False,
        last_reviewed_at: Optional[datetime] = None,
        creation_date: Optional[datetime] = None,
    ):
        # Fields read by CardNode.__init__
        self.id = node_id
        self.card_source_id = parent_id
        self.depth = depth

        # Card columns used by pipeline ordering / CardResponse
        self.alpha = alpha
        self.beta = beta
        self.t = t
        self.num_moves = num_moves
        self.num_reviews = num_reviews
        self.suspended = suspended
        self.last_reviewed_at = last_reviewed_at
        self.creation_date = creation_date or datetime.now(timezone.utc)
        self.grading_parameter = None
        self.default_visits = 1000
        self.normalized_position_id = 1
        self.normalized_sgf = "(;FF[4]SZ[19])"
        self.user_id = 1

    def _asdict(self) -> dict:
        """Mirror the SQLAlchemy Row._asdict() interface."""
        return {k: v for k, v in self.__dict__.items()}


def make_node(node_id: int, parent_id: Optional[int] = None, depth: int = 0, **kwargs):
    """
    Create a CardNode backed by a FakeRow.  Extra kwargs are forwarded to
    FakeRow so tests can customise alpha/beta/t/num_moves for ordering tests.
    """
    from domain.tree_engine import CardNode
    return CardNode(FakeRow(node_id, parent_id, depth, **kwargs))


def build_nodes(adjacency: Dict[int, Optional[int]]) -> List:
    """
    Build a list of CardNodes from {node_id: parent_id_or_None}.

    Insertion order is preserved (Python 3.7+ dict semantics), which matters
    for the heavy-path decomposition's tie-breaking behaviour.
    """
    return [make_node(nid, pid) for nid, pid in adjacency.items()]


def build_chain(length: int) -> List:
    """
    Build a pure linear chain: 1 → 2 → 3 → … → length.

    This is the worst-case topology for recursive algorithms: every node adds
    one frame to the call stack.  Used by the stack-overflow defect test.
    """
    return build_nodes({i: (i - 1 if i > 1 else None) for i in range(1, length + 1)})


def get_by_id(nodes: List) -> Dict[int, object]:
    return {n.id: n for n in nodes}


# ─── Algebraic Invariant Checkers ────────────────────────────────────────────
# These are reusable across multiple tests.  They raise AssertionError with
# precise, diagnostic messages on any violation.

def assert_height_invariant(nodes: List):
    """
    H1: height(leaf) == 0
    H2: height(internal) == 1 + max(height(child) for child in children)
    """
    by_id = get_by_id(nodes)
    children: Dict[int, List[int]] = {n.id: [] for n in nodes}
    for n in nodes:
        if n.parent_id in by_id:
            children[n.parent_id].append(n.id)

    for n in nodes:
        ch = children[n.id]
        if not ch:
            assert n.height == 0, (
                f"H1 violated: leaf node {n.id} has height={n.height}, expected 0"
            )
        else:
            expected = 1 + max(by_id[c].height for c in ch)
            assert n.height == expected, (
                f"H2 violated: node {n.id} height={n.height}, expected={expected}"
            )


def assert_size_invariant(nodes: List):
    """
    S1: subtree_size(leaf) == 1
    S2: subtree_size(internal) == 1 + Σ subtree_size(children)
    """
    by_id = get_by_id(nodes)
    children: Dict[int, List[int]] = {n.id: [] for n in nodes}
    for n in nodes:
        if n.parent_id in by_id:
            children[n.parent_id].append(n.id)

    for n in nodes:
        ch = children[n.id]
        if not ch:
            assert n.subtree_size == 1, (
                f"S1 violated: leaf node {n.id} has size={n.subtree_size}, expected 1"
            )
        else:
            expected = 1 + sum(by_id[c].subtree_size for c in ch)
            assert n.subtree_size == expected, (
                f"S2 violated: node {n.id} size={n.subtree_size}, expected={expected}"
            )


def assert_root_conservation(nodes: List):
    """
    S3: For each root R, R.subtree_size == |R's full subtree in the pool|.

    This is a global conservation law: no node may be double-counted or missed.
    """
    by_id = get_by_id(nodes)
    children: Dict[int, List[int]] = {n.id: [] for n in nodes}
    for n in nodes:
        if n.parent_id in by_id:
            children[n.parent_id].append(n.id)

    def subtree_ids(nid):
        result = {nid}
        for c in children.get(nid, []):
            result |= subtree_ids(c)
        return result

    roots = [n for n in nodes if n.parent_id not in by_id]
    for r in roots:
        actual = len(subtree_ids(r.id))
        assert r.subtree_size == actual, (
            f"S3 violated: root {r.id} .subtree_size={r.subtree_size}, "
            f"actual reachable nodes={actual}"
        )


def assert_heavy_path_permutation(nodes: List):
    """
    HP1: {n.heavy_path_rank for n in nodes} == {0, 1, …, N-1}

    The ranks must form a perfect bijection.  Any gap or collision is a defect.
    """
    N = len(nodes)
    ranks = sorted(n.heavy_path_rank for n in nodes)
    assert ranks == list(range(N)), (
        f"HP1 violated: ranks {ranks} are not the permutation {{0..{N-1}}}. "
        f"Duplicates or gaps detected."
    )


def assert_heavy_child_consecutive_rank(nodes: List):
    """
    HP2: For every internal node P, the child C with the maximum subtree_size
         satisfies C.heavy_path_rank == P.heavy_path_rank + 1.

    This guarantees that heavy (main-line) paths are visited without
    interruption in DFS pre-order.
    """
    by_id = get_by_id(nodes)
    children: Dict[int, List[int]] = {n.id: [] for n in nodes}
    for n in nodes:
        if n.parent_id in by_id:
            children[n.parent_id].append(n.id)

    by_rank = {n.heavy_path_rank: n for n in nodes}

    for n in nodes:
        ch = children[n.id]
        if not ch:
            continue  # Leaves have no heavy child

        # The node immediately after P in rank order must be one of P's children…
        next_node = by_rank.get(n.heavy_path_rank + 1)
        assert next_node is not None, (
            f"HP2: no node with rank {n.heavy_path_rank + 1} "
            f"(internal node {n.id} at rank {n.heavy_path_rank} has children {ch})"
        )
        assert next_node.id in ch, (
            f"HP2 violated: node {n.id} (rank={n.heavy_path_rank}) "
            f"is followed by node {next_node.id} which is NOT its child. "
            f"Children are: {ch}"
        )
        # …and that child must be the one with maximum subtree_size.
        max_child_size = max(by_id[c].subtree_size for c in ch)
        assert by_id[next_node.id].subtree_size == max_child_size, (
            f"HP2 violated: node {n.id}'s next-ranked child {next_node.id} "
            f"has size {by_id[next_node.id].subtree_size} "
            f"but the max child size is {max_child_size} — not the heavy child."
        )


# ─── Database Seeder (Integration Tests Only) ─────────────────────────────────

class TreeBuilder:
    """
    Seeds a typed card tree into an async SQLAlchemy session.

    Handles all foreign key dependencies automatically:
      users → normalized_position → game_source → card → card_source

    Usage::

        builder = TreeBuilder(session)
        await builder.setup_base()
        ids = await builder.build({
            "root":       None,
            "child_a":    "root",
            "child_b":    "root",
            "grandchild": "child_a",
        })
        # ids == {"root": <int>, "child_a": <int>, ...}

    Tags::

        await builder.add_tags({"child_a": ["attack", "hard"]}, ids)
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self._ready = False
        self._norm_pos_id: Optional[int] = None
        self._game_source_id: Optional[int] = None

    async def setup_base(self):
        """Insert the minimum foundation rows required by FK constraints."""
        if self._ready:
            return

        # Defer imports so this module is importable without the full project.
        from db.schema import users, normalized_position, game_source

        # 1. A single user that all test cards belong to.
        await self.session.execute(
            insert(users).values(id=1, username="testuser", has_password=False)
        )

        # 2. A shared normalized_position row (content is irrelevant).
        dummy_sgf = "(;FF[4]SZ[19])"
        pos_hash = hashlib.sha256(dummy_sgf.encode()).digest()
        res = await self.session.execute(
            insert(normalized_position)
            .values(pos_hash=pos_hash, normalized_sgf=dummy_sgf)
            .returning(normalized_position.c.id)
        )
        self._norm_pos_id = res.scalar()

        # 3. A game_source anchor for root cards (satisfies the check constraint
        #    that every card_source row must have EITHER a card_source_id OR a
        #    game_source_id).
        res = await self.session.execute(
            insert(game_source)
            .values(position_id=self._norm_pos_id, description="test-anchor")
            .returning(game_source.c.id)
        )
        self._game_source_id = res.scalar()
        self._ready = True

    async def build(
        self,
        adjacency: Dict[str, Optional[str]],
        *,
        num_moves: int = 5,
        alpha: float = 3.0,
        beta: float = 3.0,
        t: float = 1.0,
    ) -> Dict[str, int]:
        """
        Insert cards and card_source rows in topological order (parents first).

        Parameters
        ----------
        adjacency:
            {node_name → parent_name or None}
        num_moves, alpha, beta, t:
            Shared Ebisu defaults for all inserted cards.

        Returns
        -------
        {node_name → card_id}
        """
        assert self._ready, "Call await builder.setup_base() before build()."

        from db.schema import card, card_source

        ids: Dict[str, int] = {}
        inserted: set = set()
        remaining = dict(adjacency)

        while remaining:
            made_progress = False
            for name, parent_name in list(remaining.items()):
                if parent_name is not None and parent_name not in inserted:
                    continue  # Parent not yet inserted; skip for now.

                # Insert the card.
                res = await self.session.execute(
                    insert(card)
                    .values(
                        num_moves=num_moves,
                        alpha=alpha,
                        beta=beta,
                        t=t,
                        user_id=1,
                        normalized_position_id=self._norm_pos_id,
                    )
                    .returning(card.c.id)
                )
                card_id = res.scalar()
                ids[name] = card_id

                # Insert the source link.
                if parent_name is None:
                    # Root node: link to the game_source anchor.
                    await self.session.execute(
                        insert(card_source).values(
                            card_id=card_id,
                            game_source_id=self._game_source_id,
                            is_primary_source=True,
                        )
                    )
                else:
                    await self.session.execute(
                        insert(card_source).values(
                            card_id=card_id,
                            card_source_id=ids[parent_name],
                            is_primary_source=False,
                        )
                    )

                inserted.add(name)
                del remaining[name]
                made_progress = True

            if not made_progress:
                raise ValueError(
                    f"Cycle detected in adjacency — unresolvable: {list(remaining)}"
                )

        await self.session.flush()
        return ids

    async def add_tags(
        self,
        card_name_to_tags: Dict[str, List[str]],
        ids: Dict[str, int],
    ) -> Dict[str, int]:
        """
        Seed tags and card_tag associations.

        Returns {tag_name → tag_id}.
        """
        from db.schema import tag, card_tag

        tag_name_to_id: Dict[str, int] = {}
        for card_name, tag_names in card_name_to_tags.items():
            cid = ids[card_name]
            for tag_name in tag_names:
                if tag_name not in tag_name_to_id:
                    res = await self.session.execute(
                        insert(tag).values(name=tag_name).returning(tag.c.id)
                    )
                    tag_name_to_id[tag_name] = res.scalar()

                await self.session.execute(
                    insert(card_tag).values(
                        card_id=cid,
                        tag_id=tag_name_to_id[tag_name],
                    )
                )

        await self.session.flush()
        return tag_name_to_id
