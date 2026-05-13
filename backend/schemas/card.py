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
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GameSourceCreate(BaseModel):
    """
    Metadata for minting a brand new root card.

    Game-source dedup: `client_game_id` is an opaque
    client-managed UUID. When set, the backend uses it as a
    get-or-create key on `(user_id, client_game_id)` so multiple
    mints from one board's lifetime resolve to a single game_source
    row (and a single forest-navigator entry). When unset, the
    backend falls through to the historical always-create behavior,
    preserving any caller that doesn't speak the new wire (curl,
    test fixtures, pre-rollout frontends).

    First-mint-wins semantic: when the client_game_id matches an
    existing row, the existing row's player_white / player_black /
    description are preserved; the incoming values on the second
    mint are ignored. This matches user intent — editing SGF root
    properties between mints from one board shouldn't retroactively
    rewrite the game's recorded metadata.

    See `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`
    for the wire-shape rationale.
    """
    player_white: Optional[str] = None
    player_black: Optional[str] = None
    description: Optional[str] = None
    client_game_id: Optional[UUID] = None


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


class GradingParameterData(BaseModel):
    """
    The opaque-but-partially-typed `data` blob inside
    ``grading_parameter``.

    Card-metadata inline-edit arc 2 (2026-05-13): the backend's
    contract over ``grading_parameter.data`` is exactly one key:
    ``gamma`` (consumed by ``ReviewService.process_review`` for the
    discounted-sum arithmetic). Every other key — ``analysis_config``,
    ``default_visits``, future additions — is frontend-defined and
    flows through unchanged. The status dispatch's Ask 3 records the
    reasoning.

    ``extra="allow"`` keeps those frontend-owned keys present in
    ``model_dump()``; ``model_dump(exclude_unset=True)`` returns only
    the keys the caller actually sent, which is what the adapter's
    JSON-merge-patch logic needs to merge with the stored ``data``.
    """
    model_config = ConfigDict(extra="allow")

    gamma: Optional[float] = Field(
        default=None,
        gt=0.0,
        lt=1.0,
        description=(
            "Discount factor for the geometric-sum review aggregation. "
            "Constrained to the open unit interval (0, 1). When absent, "
            "the service falls back to `config.SR_DEFAULT_GAMMA`."
        ),
    )


class GradingParameterPatch(BaseModel):
    """
    The ``grading_parameter`` wrapper sent on a PATCH body.

    Card-metadata inline-edit arc 2: ``data`` is the only key the
    wrapper admits at the wire level (``extra="forbid"`` rejects
    unknowns at the same level the API contracts about). The merge
    semantic is JSON-merge-patch at one level of nesting — see the
    status dispatch's "`grading_parameter` merge semantics" section
    and the adapter's ``update_card_metadata`` for the worked
    behaviour.
    """
    model_config = ConfigDict(extra="forbid")

    data: GradingParameterData


class CardPatch(BaseModel):
    """
    Request body shape for ``PATCH /cards/{card_id}``.

    Card-metadata inline-edit arc 2 (2026-05-13). The mutable subset
    is recorded in
    ``docs/dispatch/backend-to-frontend-card-metadata-inline-edit-status.md``
    (Ask 2 table). All fields are optional; ``extra="forbid"`` rejects
    unknown top-level keys with a structured 422 (ADR-0002 — no silent
    coercion at the wire boundary).

    Semantics per field:

    - ``tags``: full replacement when present. ``[]`` wipes all tags;
      ``None`` (or absent) leaves them untouched.
    - ``num_moves``: direct overwrite. The Ebisu prior is NOT
      automatically reset — the caller pairs this with
      ``reset_prior=True`` when starting over is intended.
    - ``suspended``: direct overwrite.
    - ``grading_parameter``: JSON-merge-patch at the ``data`` key
      level. Keys present in the patch's ``data`` overwrite the
      stored same-named keys; absent keys are preserved.
    - ``reset_prior``: explicit opt-in to reset ``(α, β, t)`` to
      ``config.EBISU_DEFAULT_MODEL``, set ``last_reviewed_at`` to
      NULL, and ``num_reviews`` to 0. Independent of ``num_moves``
      — settable on its own when the user decides the prior is
      corrupted. Default false.
    """
    model_config = ConfigDict(extra="forbid")

    tags: Optional[List[str]] = None
    num_moves: Optional[int] = Field(default=None, gt=0)
    suspended: Optional[bool] = None
    grading_parameter: Optional[GradingParameterPatch] = None
    reset_prior: bool = False


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
