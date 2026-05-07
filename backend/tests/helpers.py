"""
tests/helpers.py

Shared test infrastructure used by both the pure unit tests and the
SQLAlchemy integration tests.

Provides:
  - make_card():   Build a `domain.card.Card` with sensible defaults.
                   Use for any pure tree-algorithm test that needs a
                   typed card payload behind a CardNode.
  - make_node():   Convenience wrapper around make_card + CardNode —
                   constructs the (card, depth) pair the post-32a
                   `CardNode.__init__` requires.
  - build_nodes(): Build a list of CardNodes from an adjacency dict.
  - build_chain(): Construct a linear chain of N nodes.
  - TreeBuilder:   Seeds an async SQLAlchemy session with a typed card
                   tree, handling all FK dependencies (users,
                   normalized_position, game_source) automatically.
                   Aligned with the post-34a column rename
                   (`content_hash`, `canonical_content`) and the
                   post-item-24 game_source.user_id stamp.

  - Algebraic invariant checkers (assert_*).

License: Public Domain (The Unlicense)
"""
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from domain.card import Card
from domain.tree_engine import CardNode


# ─── Pure-Python Helpers ─────────────────────────────────────────────────────


def make_card(
    *,
    card_id: int,
    parent_id: Optional[int] = None,
    alpha: float = 3.0,
    beta: float = 3.0,
    t: float = 1.0,
    num_moves: int = 5,
    num_reviews: int = 0,
    suspended: bool = False,
    last_reviewed_at: Optional[datetime] = None,
    creation_date: Optional[datetime] = None,
    grading_parameter: Optional[Dict] = None,
    canonical_content: str = "(;FF[4]SZ[19])",
) -> Card:
    """
    Build a `domain.card.Card` with sensible defaults.

    The Card domain entity is `frozen=True`; tests construct fresh
    instances per scenario rather than mutating. Defaults are chosen
    so the Bayesian prior, the lineage pointer, and the timestamp
    fields are all valid without each test having to spell them out.

    `parent_id` maps to `Card.card_source_id` — the schema field name
    is preserved at the domain layer to keep the lineage pointer
    semantics explicit.
    """
    return Card(
        id=card_id,
        num_moves=num_moves,
        alpha=alpha,
        beta=beta,
        t=t,
        last_reviewed_at=last_reviewed_at,
        creation_date=creation_date or datetime.now(timezone.utc),
        num_reviews=num_reviews,
        suspended=suspended,
        grading_parameter=grading_parameter,
        canonical_content=canonical_content,
        card_source_id=parent_id,
    )


def make_node(
    node_id: int,
    parent_id: Optional[int] = None,
    depth: int = 0,
    **kwargs,
) -> CardNode:
    """
    Create a CardNode wrapping a freshly-built Card at the given depth.

    Extra kwargs forward to `make_card` so tests can customise
    alpha/beta/t/num_moves/num_reviews/etc. for ordering tests.
    Positional `node_id`, `parent_id`, `depth` mirror the legacy shape
    the graph-algorithm tests author against.
    """
    card = make_card(card_id=node_id, parent_id=parent_id, **kwargs)
    return CardNode(card, depth)


def build_nodes(adjacency: Dict[int, Optional[int]]) -> List[CardNode]:
    """
    Build a list of CardNodes from {node_id: parent_id_or_None}.

    Insertion order is preserved (Python 3.7+ dict semantics), which
    matters for the heavy-path decomposition's tie-breaking behaviour.
    Depth is set to 0 for every node — the algorithmic tests don't
    depend on depth (they reason about parent_id), and an integration
    test that does care reaches the value through the lineage CTE.
    """
    return [make_node(nid, pid) for nid, pid in adjacency.items()]


def build_chain(length: int) -> List[CardNode]:
    """
    Build a pure linear chain: 1 → 2 → 3 → … → length.

    This is the worst-case topology for recursive algorithms: every
    node adds one frame to the call stack. Used by the stack-overflow
    defect test (D-1).
    """
    return build_nodes({i: (i - 1 if i > 1 else None) for i in range(1, length + 1)})


def get_by_id(nodes: List[CardNode]) -> Dict[int, CardNode]:
    return {n.id: n for n in nodes}


# ─── Algebraic Invariant Checkers ────────────────────────────────────────────
# These are reusable across multiple tests. They raise AssertionError with
# precise, diagnostic messages on any violation.


def assert_height_invariant(nodes: List[CardNode]):
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


def assert_size_invariant(nodes: List[CardNode]):
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


def assert_root_conservation(nodes: List[CardNode]):
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


def assert_heavy_path_permutation(nodes: List[CardNode]):
    """
    HP1: {n.heavy_path_rank for n in nodes} == {0, 1, …, N-1}

    The ranks must form a perfect bijection. Any gap or collision is a defect.
    """
    N = len(nodes)
    ranks = sorted(n.heavy_path_rank for n in nodes)
    assert ranks == list(range(N)), (
        f"HP1 violated: ranks {ranks} are not the permutation {{0..{N-1}}}. "
        f"Duplicates or gaps detected."
    )


def assert_heavy_child_consecutive_rank(nodes: List[CardNode]):
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

    Aligned with the post-34a column rename:
      - `pos_hash`       → `content_hash`
      - `normalized_sgf` → `canonical_content`

    Aligned with item 24 (tenancy): `game_source.user_id` is stamped
    from the builder's `user_id` parameter (default 1, the local_user
    id used by the transparent-single-user mode).

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

    def __init__(self, session: AsyncSession, *, user_id: int = 1):
        self.session = session
        self.user_id = user_id
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
            insert(users).values(
                id=self.user_id,
                username=f"testuser_{self.user_id}",
                has_password=False,
            )
        )

        # 2. A shared normalized_position row (content is irrelevant).
        canonical = "(;FF[4]SZ[19])"
        digest = hashlib.sha256(canonical.encode()).digest()
        res = await self.session.execute(
            insert(normalized_position)
            .values(content_hash=digest, canonical_content=canonical)
            .returning(normalized_position.c.id)
        )
        self._norm_pos_id = res.scalar()

        # 3. A game_source anchor for root cards (satisfies the check
        # constraint that every card_source row must have EITHER a
        # card_source_id OR a game_source_id). Item 24: stamp
        # `user_id` so the row is owned by the same tenant whose cards
        # we'll seed below.
        res = await self.session.execute(
            insert(game_source)
            .values(
                position_id=self._norm_pos_id,
                user_id=self.user_id,
                description="test-anchor",
            )
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
                        user_id=self.user_id,
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
