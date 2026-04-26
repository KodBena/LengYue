"""
Wire-layer DTOs.

This module owns the *shape of HTTP requests and action responses* —
delivery concerns. The persisted shape of a card (and its projections)
belongs to the domain layer; see domain/card.py for Card and
CardWithRecall.

Item 30a: CardResponse has been removed from this file. It used to
serve as both the wire shape *and* the implicit domain entity, with
the repository computing recall projections inside it. That conflation
was addressed: persistence is domain.card.Card; wire is
domain.card.CardWithRecall; projection is domain.card.project_card.

Item 34b Commit 3: CardCreate tightens to the canonical shape.

  - The `sgf` alias is removed; only `raw_content` parses.
  - Top-level `default_visits` is removed; the value must be
    nested inside `grading_parameter.data.default_visits`.

Requests that use the pre-34b shape get a 422 with a Pydantic
validation error naming the offending field. The response side's
stale-client compat (CardWithRecall's computed_field aliases) is
separate — submissions tighten, emissions stay permissive until
commit-3b.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class GameSourceCreate(BaseModel):
    """Metadata for minting a brand new root card."""
    player_white: Optional[str] = None
    player_black: Optional[str] = None
    description: Optional[str] = None


class CardBase(BaseModel):
    """
    Fields shared by card-creation-related DTOs.

    Post-34b Commit 3: `default_visits` removed. Domain-specific
    grading config (including KataGo's default_visits) lives inside
    the opaque `grading_parameter` blob.
    """
    num_moves: int
    grading_parameter: Optional[Dict[str, Any]] = None


class CardCreate(CardBase):
    """
    Request body shape for POST /cards/.

    Post-34b Commit 3: only `raw_content` is accepted for the content
    field. The transitional alias for `sgf` is gone. If the frontend
    sends a legacy shape the request fails at parse time with a
    clear Pydantic error — which is the correct diagnostic, not a
    silent misbinding.

    Domain-specific grading configuration (KataGo visits, palette,
    gamma) travels inside `grading_parameter.data`. This DTO doesn't
    validate the blob's contents — it's the frontend's contract with
    the specific backend grading logic.
    """
    raw_content: str = Field(
        description=(
            "The raw domain content (SGF for Go, PGN for Chess, etc.). "
            "Normalized canonically by the configured PositionNormalizer "
            "before storage."
        ),
    )
    tags: List[str] = []

    parent_card_id: Optional[int] = None
    game_metadata: Optional[GameSourceCreate] = None

    @model_validator(mode="after")
    def check_source_mutually_exclusive(self) -> "CardCreate":
        has_parent = bool(self.parent_card_id)
        has_game = bool(self.game_metadata)
        if has_parent == has_game:
            raise ValueError(
                "Lineage violation: Must provide exactly one of "
                "'parent_card_id' (for branches) or 'game_metadata' (for roots)."
            )
        return self


class CardCreateResponse(BaseModel):
    """
    Strongly-typed response for POST /cards/. Replaces the prior
    Dict[str, Any], which provided no information to OpenAPI consumers
    (and therefore no information to any code-generated TypeScript
    client downstream — see item 30). Item 4.
    """
    status: Literal["created"]
    card_id: int


class ReviewRequest(BaseModel):
    scores: List[float] = Field(
        ..., description="Float scores for each move [0.0 - 1.0]"
    )
    # datetime.utcnow() is deprecated in Python 3.12 and returns a naive
    # datetime, which the rest of the codebase has to special-case via
    # tzinfo checks. Producing tz-aware UTC at the boundary eliminates
    # that ritual. Item 3.
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
