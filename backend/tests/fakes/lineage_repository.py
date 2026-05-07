"""
tests/fakes/lineage_repository.py

In-memory fake for ``LineageRepositoryPort``. Backed by an adjacency
graph plus an owner map; the four Port methods are pure-Python
descents over that graph.

The fake is a behavioural mirror of the SQLAlchemy adapter — same
tenancy filtering at base and recursive step, same overflow surface
on ``fetch_tree_by_root`` (raises ``LineageOverflowError`` past
``max_nodes``), same ``CardNotFoundError`` semantics on a non-root or
cross-tenant root.

A test seeds a tree via ``seed_tree`` (or one card at a time via
``seed_card``) and the Port methods just walk the seeded structure.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from domain.auth import UserId
from domain.card import Card
from domain.errors import CardNotFoundError, LineageOverflowError
from domain.lineage import CardTree, RootedTree, RootGroup, RootResolution
from domain.pipeline_dsl import (
    AncestorSelection,
    BaseSelection,
    ContextSelection,
    DescendantSelection,
    IntersectSelection,
    SiblingSelection,
    SubtreeSelection,
    UnionSelection,
)
from domain.tree_engine import CardNode


class FakeLineageRepository:
    """
    Structural match for ``LineageRepositoryPort``.

    Adjacency model: each card has an optional parent_card_id and an
    optional root_game_source_id. A card with no parent and a non-
    null game-source id is a root.

    Test usage::

        repo = FakeLineageRepository()
        repo.seed_tree(
            user_id=1,
            game_source_id=42,
            tree={
                "root": None,
                "child": "root",
                "leaf": "child",
            },
        )

    Returns symbolic-name → card_id dicts so tests can refer to seeded
    cards without hardcoded ids.
    """

    def __init__(self) -> None:
        self.cards: Dict[int, Card] = {}
        self.parent_of: Dict[int, Optional[int]] = {}
        self.game_source_of_root: Dict[int, int] = {}
        self.user_id_by_card: Dict[int, int] = {}

        self._next_card_id = 1

    # ─── Test helpers ──────────────────────────────────────────────────────

    def seed_tree(
        self,
        *,
        user_id: int,
        game_source_id: int,
        tree: Dict[str, Optional[str]],
    ) -> Dict[str, int]:
        """
        Seed an adjacency-described tree. ``tree`` maps node-name to
        parent-name (or ``None`` for the root). Insertion order is
        topological — parents must be present before children.
        """
        ids: Dict[str, int] = {}
        for name, parent_name in tree.items():
            if parent_name is None:
                ids[name] = self.seed_card(
                    user_id=user_id,
                    game_source_id=game_source_id,
                )
            else:
                if parent_name not in ids:
                    raise ValueError(
                        f"FakeLineageRepository.seed_tree: parent "
                        f"{parent_name!r} not yet inserted (insert "
                        f"order is topological)"
                    )
                ids[name] = self.seed_card(
                    user_id=user_id,
                    parent_card_id=ids[parent_name],
                )
        return ids

    def seed_card(
        self,
        *,
        user_id: int,
        parent_card_id: Optional[int] = None,
        game_source_id: Optional[int] = None,
        canonical_content: str = "(;FF[4]SZ[19])",
        alpha: float = 3.0,
        beta: float = 3.0,
        t: float = 1.0,
        num_moves: int = 5,
        num_reviews: int = 0,
    ) -> int:
        """
        Seed one card. Either ``parent_card_id`` or ``game_source_id``
        must be set (mirroring the schema CheckConstraint).
        """
        if (parent_card_id is None) == (game_source_id is None):
            raise ValueError(
                "FakeLineageRepository.seed_card: exactly one of "
                "parent_card_id / game_source_id must be set"
            )
        card_id = self._next_card_id
        self._next_card_id += 1
        self.cards[card_id] = Card(
            id=card_id,
            num_moves=num_moves,
            alpha=alpha,
            beta=beta,
            t=t,
            last_reviewed_at=None,
            creation_date=datetime.now(timezone.utc),
            num_reviews=num_reviews,
            suspended=False,
            grading_parameter=None,
            canonical_content=canonical_content,
            card_source_id=parent_card_id,
        )
        self.parent_of[card_id] = parent_card_id
        self.user_id_by_card[card_id] = user_id
        if game_source_id is not None:
            self.game_source_of_root[card_id] = game_source_id
        return card_id

    # ─── Internal walks ────────────────────────────────────────────────────

    def _children_of(self, card_id: int, *, user_id: int) -> List[int]:
        return [
            cid
            for cid, parent in self.parent_of.items()
            if parent == card_id and self.user_id_by_card.get(cid) == user_id
        ]

    def _descend(
        self,
        *,
        start_id: int,
        user_id: int,
        max_depth: Optional[int],
    ) -> List[CardNode]:
        # Tenancy at the base: refuse to start from a non-owned card.
        if self.user_id_by_card.get(start_id) != user_id:
            return []
        nodes: List[CardNode] = []
        # BFS with depth tracking.
        frontier: List[Tuple[int, int]] = [(start_id, 0)]
        while frontier:
            current_id, depth = frontier.pop(0)
            card = self.cards[current_id]
            nodes.append(CardNode(card, depth))
            if max_depth is not None and depth >= max_depth:
                continue
            for child_id in self._children_of(current_id, user_id=user_id):
                frontier.append((child_id, depth + 1))
        return nodes

    def _ancestors_of(
        self, card_id: int, *, user_id: int
    ) -> List[int]:
        """Walk upward; stops on any non-owned card or game-source root."""
        chain: List[int] = []
        current: Optional[int] = self.parent_of.get(card_id)
        while current is not None:
            if self.user_id_by_card.get(current) != user_id:
                break
            chain.append(current)
            current = self.parent_of.get(current)
        return chain

    def _terminal_root(
        self, card_id: int, *, user_id: int
    ) -> Optional[Tuple[int, int]]:
        """Return (root_card_id, game_source_id) or None if unreachable/unowned."""
        if self.user_id_by_card.get(card_id) != user_id:
            return None
        current = card_id
        while True:
            parent = self.parent_of.get(current)
            if parent is None:
                gs_id = self.game_source_of_root.get(current)
                if gs_id is None:
                    return None
                return (current, gs_id)
            if self.user_id_by_card.get(parent) != user_id:
                return None
            current = parent

    # ─── LineageRepositoryPort ─────────────────────────────────────────────

    async def fetch_selection(
        self,
        selection: BaseSelection,
        context_ids: List[int],
        *,
        user_id: UserId,
    ) -> List[CardNode]:
        if not context_ids:
            return []
        out: List[CardNode] = []
        for cid in context_ids:
            if isinstance(selection, DescendantSelection):
                out.extend(self._descend(
                    start_id=cid, user_id=int(user_id), max_depth=None,
                ))
            elif isinstance(selection, ContextSelection):
                if self.user_id_by_card.get(cid) == int(user_id):
                    out.append(CardNode(self.cards[cid], 0))
            elif isinstance(selection, SubtreeSelection):
                # n=0 is descent from cid; n=N walks up N then
                # descends. The fake mirrors the DSL spec; the
                # production adapter has D-5 caveats this fake does
                # not reproduce.
                start = cid
                for _ in range(selection.n):
                    parent = self.parent_of.get(start)
                    if parent is None or self.user_id_by_card.get(parent) != int(user_id):
                        break
                    start = parent
                out.extend(self._descend(
                    start_id=start, user_id=int(user_id),
                    max_depth=selection.m,
                ))
            elif isinstance(selection, AncestorSelection):
                # n=0 means context itself; n=1 means parent; n=2 grandparent.
                target: Optional[int] = cid
                for _ in range(selection.n):
                    if target is None:
                        break
                    parent = self.parent_of.get(target)
                    if parent is None or self.user_id_by_card.get(parent) != int(user_id):
                        target = None
                        break
                    target = parent
                if target is not None and self.user_id_by_card.get(target) == int(user_id):
                    out.append(CardNode(self.cards[target], 0))
            elif isinstance(selection, SiblingSelection):
                parent = self.parent_of.get(cid)
                if parent is not None:
                    for sibling in self._children_of(parent, user_id=int(user_id)):
                        if sibling != cid:
                            out.append(CardNode(self.cards[sibling], 0))
            elif isinstance(selection, UnionSelection):
                # Recursive: union of two inner selections over the same context.
                out.extend(
                    await self.fetch_selection(
                        selection.a, [cid], user_id=user_id
                    )
                )
                out.extend(
                    await self.fetch_selection(
                        selection.b, [cid], user_id=user_id
                    )
                )
            elif isinstance(selection, IntersectSelection):
                a_nodes = await self.fetch_selection(
                    selection.a, [cid], user_id=user_id
                )
                b_ids = {
                    n.id
                    for n in await self.fetch_selection(
                        selection.b, [cid], user_id=user_id
                    )
                }
                out.extend(n for n in a_nodes if n.id in b_ids)
            else:
                raise NotImplementedError(
                    f"FakeLineageRepository.fetch_selection: "
                    f"selection type {type(selection).__name__!r} "
                    f"not implemented in fake"
                )
        return out

    async def fetch_lineage(
        self,
        context_id: int,
        max_depth: Optional[int] = None,
        *,
        user_id: UserId,
    ) -> List[CardNode]:
        return self._descend(
            start_id=context_id,
            user_id=int(user_id),
            max_depth=max_depth,
        )

    async def resolve_roots(
        self,
        card_ids: List[int],
        *,
        user_id: UserId,
    ) -> RootResolution:
        if not card_ids:
            return RootResolution(roots=[], unmatched_card_ids=[])
        groups: Dict[Tuple[int, int], List[int]] = {}
        order_seen: List[Tuple[int, int]] = []
        unmatched: List[int] = []
        for cid in card_ids:
            term = self._terminal_root(cid, user_id=int(user_id))
            if term is None:
                unmatched.append(cid)
                continue
            if term not in groups:
                groups[term] = []
                order_seen.append(term)
            groups[term].append(cid)
        return RootResolution(
            roots=[
                RootGroup(
                    root_card_id=root_id,
                    game_source_id=gs_id,
                    card_ids_in_tree=groups[(root_id, gs_id)],
                )
                for (root_id, gs_id) in order_seen
            ],
            unmatched_card_ids=unmatched,
        )

    async def fetch_tree_by_root(
        self,
        root_card_id: int,
        *,
        user_id: UserId,
        max_nodes: int = 10000,
    ) -> RootedTree:
        # Root must exist, be owned by the caller, and be a
        # game-source root (parent is None and gs_id is set).
        if self.user_id_by_card.get(root_card_id) != int(user_id):
            raise CardNotFoundError(
                f"root card {root_card_id} not found for this user"
            )
        if self.parent_of.get(root_card_id) is not None:
            raise CardNotFoundError(
                f"root card {root_card_id} is not a game-source root"
            )
        gs_id = self.game_source_of_root.get(root_card_id)
        if gs_id is None:
            raise CardNotFoundError(
                f"root card {root_card_id} has no game source"
            )

        # Descent: collect all owned descendants.
        descents = self._descend(
            start_id=root_card_id, user_id=int(user_id), max_depth=None,
        )
        actual_size = len(descents)
        if actual_size > max_nodes:
            raise LineageOverflowError(
                actual_size=actual_size, max_nodes=max_nodes,
            )

        # Build CardTree recursively.
        def build_subtree(node_id: int) -> CardTree:
            return CardTree(
                id=node_id,
                children=[
                    build_subtree(child)
                    for child in self._children_of(
                        node_id, user_id=int(user_id),
                    )
                ],
            )

        return RootedTree(
            root_card_id=root_card_id,
            game_source_id=gs_id,
            tree=build_subtree(root_card_id),
        )
