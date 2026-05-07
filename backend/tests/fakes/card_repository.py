"""
tests/fakes/card_repository.py

In-memory fake satisfying both ``CardRepositoryPort`` (read) and
``CardWriteRepositoryPort`` (write). Mirrors the production
``CardRepository`` adapter's responsibility: one object backs both
Port surfaces because the underlying persistence resource (the card
table family) is one resource.

State held in plain Python:

  - ``cards``: ``{card_id: Card}``.
  - ``positions``: ``{content_hash: position_id}``.
  - ``game_sources``: ``{game_source_id: dict}`` keyed by id;
    plus a side-index ``client_id_to_gs`` keyed on
    ``(user_id, client_game_id)`` for the dedup path.
  - ``card_sources``: ``{card_id: (parent_card_id, game_source_id)}``.
  - ``tags``: ``{card_id: list[str]}``.
  - ``user_id_by_card``: ``{card_id: user_id}`` so the read path
    enforces the tenancy filter without a SQL JOIN.

Tenancy is honored: ``get_card_by_id`` returns ``None`` for
cross-tenant ids, ``update_card_model`` is a no-op for cross-tenant
updates. Both behaviours match the production adapter's fused-WHERE
filter.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from domain.auth import UserId
from domain.card import Card


class FakeCardRepository:
    """
    Structural match for ``CardRepositoryPort`` ∪ ``CardWriteRepositoryPort``.

    A test wires it into a service like:

        repo = FakeCardRepository()
        svc = CardService(repository=repo, normalizer=..., read_repository=repo)

    To pre-seed cards (e.g. so a parent-ownership precheck succeeds),
    use ``seed_card`` — the dedicated test helper avoids replicating
    the full insert dance every time.
    """

    def __init__(self) -> None:
        self.cards: Dict[int, Card] = {}
        self.user_id_by_card: Dict[int, int] = {}
        self.positions: Dict[bytes, int] = {}
        self.canonical_by_position: Dict[int, str] = {}
        self.game_sources: Dict[int, Dict[str, Any]] = {}
        self.client_id_to_gs: Dict[Tuple[int, UUID], int] = {}
        self.card_sources: Dict[int, Tuple[Optional[int], Optional[int]]] = {}
        self.tags: Dict[int, List[str]] = {}

        self._next_card_id = 1
        self._next_position_id = 1
        self._next_game_source_id = 1

    # ─── Test helpers ──────────────────────────────────────────────────────

    def seed_card(
        self,
        *,
        user_id: int,
        canonical_content: str = "(;FF[4]SZ[19])",
        parent_card_id: Optional[int] = None,
        alpha: float = 3.0,
        beta: float = 3.0,
        t: float = 1.0,
        num_moves: int = 5,
        num_reviews: int = 0,
        suspended: bool = False,
        last_reviewed_at: Optional[datetime] = None,
        creation_date: Optional[datetime] = None,
        grading_parameter: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Insert a card directly. Returns the new card id. Useful for
        preconditions in service tests (e.g. seeding a parent that
        ``CardService.create_card`` checks ownership against).
        """
        card_id = self._next_card_id
        self._next_card_id += 1
        self.cards[card_id] = Card(
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
            card_source_id=parent_card_id,
        )
        self.user_id_by_card[card_id] = user_id
        self.card_sources[card_id] = (parent_card_id, None)
        return card_id

    # ─── CardRepositoryPort (read) ─────────────────────────────────────────

    async def get_card_by_id(
        self, card_id: int, *, user_id: UserId
    ) -> Optional[Card]:
        card = self.cards.get(card_id)
        if card is None:
            return None
        if self.user_id_by_card.get(card_id) != int(user_id):
            return None
        return card

    async def update_card_model(
        self,
        card_id: int,
        new_model: Tuple[float, float, float],
        *,
        user_id: UserId,
    ) -> None:
        card = self.cards.get(card_id)
        if card is None:
            return
        if self.user_id_by_card.get(card_id) != int(user_id):
            # Cross-tenant: no-op, matching the adapter's WHERE filter.
            return
        alpha, beta, t = new_model
        # Card is frozen — reconstruct.
        self.cards[card_id] = card.model_copy(
            update={
                "alpha": alpha,
                "beta": beta,
                "t": t,
                "last_reviewed_at": datetime.now(timezone.utc),
                "num_reviews": card.num_reviews + 1,
            }
        )

    # ─── CardWriteRepositoryPort (write) ───────────────────────────────────

    async def get_or_create_position(
        self, *, canonical_content: str, content_hash: bytes
    ) -> int:
        if content_hash in self.positions:
            return self.positions[content_hash]
        pid = self._next_position_id
        self._next_position_id += 1
        self.positions[content_hash] = pid
        self.canonical_by_position[pid] = canonical_content
        return pid

    async def insert_card(
        self,
        *,
        num_moves: int,
        model: Tuple[float, float, float],
        user_id: int,
        grading_parameter: Optional[Dict[str, Any]],
        position_id: int,
    ) -> int:
        alpha, beta, t = model
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
            num_reviews=0,
            suspended=False,
            grading_parameter=grading_parameter,
            canonical_content=self.canonical_by_position[position_id],
            card_source_id=None,
        )
        self.user_id_by_card[card_id] = int(user_id)
        return card_id

    async def insert_game_source(
        self,
        *,
        position_id: int,
        user_id: UserId,
        player_white: Optional[str],
        player_black: Optional[str],
        description: Optional[str],
        raw_content: str,
    ) -> int:
        gs_id = self._next_game_source_id
        self._next_game_source_id += 1
        self.game_sources[gs_id] = {
            "position_id": position_id,
            "user_id": int(user_id),
            "player_white": player_white,
            "player_black": player_black,
            "description": description,
            "raw_content": raw_content,
            "client_game_id": None,
        }
        return gs_id

    async def get_or_create_game_source_by_client_id(
        self,
        *,
        client_game_id: UUID,
        position_id: int,
        user_id: UserId,
        player_white: Optional[str],
        player_black: Optional[str],
        description: Optional[str],
        raw_content: str,
    ) -> int:
        key = (int(user_id), client_game_id)
        if key in self.client_id_to_gs:
            # First-mint-wins: existing metadata preserved.
            return self.client_id_to_gs[key]
        gs_id = self._next_game_source_id
        self._next_game_source_id += 1
        self.game_sources[gs_id] = {
            "position_id": position_id,
            "user_id": int(user_id),
            "player_white": player_white,
            "player_black": player_black,
            "description": description,
            "raw_content": raw_content,
            "client_game_id": client_game_id,
        }
        self.client_id_to_gs[key] = gs_id
        return gs_id

    async def link_source(
        self,
        *,
        card_id: int,
        parent_card_id: Optional[int],
        game_source_id: Optional[int],
    ) -> None:
        # Mirror the schema's CheckConstraint: exactly one of parent /
        # game_source is set.
        if (parent_card_id is None) == (game_source_id is None):
            raise ValueError(
                "link_source: exactly one of parent_card_id / "
                "game_source_id must be set"
            )
        self.card_sources[card_id] = (parent_card_id, game_source_id)
        # Update Card.card_source_id projection so subsequent read-Port
        # access reflects the new lineage pointer (the production
        # adapter's GET joins card_source).
        if parent_card_id is not None:
            existing = self.cards[card_id]
            self.cards[card_id] = existing.model_copy(
                update={"card_source_id": parent_card_id}
            )

    async def attach_tags(
        self,
        card_id: int,
        tag_names: List[str],
    ) -> None:
        if not tag_names:
            return
        existing = set(self.tags.get(card_id, []))
        for name in tag_names:
            existing.add(name)
        self.tags[card_id] = sorted(existing)
