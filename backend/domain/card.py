"""
Card domain entities and pure projections.

Pure domain. Imports only stdlib, Pydantic, and core.ebisu.
No SQLAlchemy, no FastAPI, no db.schema.

Exports:

- Card: persisted shape. Frozen Pydantic entity. Domain-agnostic
  field names throughout. The `tags` field (added per the
  card-metadata inline-edit dispatch arc 1) is populated by the
  repository adapters at read time — `Card` is the entity-level
  home for tags because they're part of the persisted card, not
  a wire-only enrichment. The `content_hash` field (added per the
  card-position-annotations Stage A design) is the dedup hash
  already stored on `normalized_position.content_hash` — projected
  onto `Card` at the same two construction sites as
  `canonical_content` (`CardRepository.get_card_by_id`,
  `LineageRepository._materialize`) so it flows through
  `CardWithRecall` for free via `project_card`'s `model_dump()`.

- CardWithRecall: Card + freshly-computed Bayesian recall projection.
  The wire shape. Post-34b-Commit-3b, emits only the canonical field
  names; the transitional stale-client compat shims (`normalized_sgf`
  and `default_visits` as @computed_field properties) have been
  removed now that the stale-bundle window is closed and all clients
  read the canonical names. The inherited `tags` field flows through
  via `project_card`'s `model_dump()` without explicit handling.

- compute_current_recall_from_prior: lowest-level recall function.
- compute_current_recall: Card-taking wrapper.
- project_card: Card → CardWithRecall.

Field-rename history (for reference; the migration is complete):

    normalized_sgf    (pre-34a name; never on the wire post-34b-3b)
    canonical_content (current name; both schema column and Card field)

And the default_visits relocation (also complete):

    default_visits as top-level column + Card field    (pre-34b)
    column + Card field + grading_parameter.data       (34b Commit 1, dual)
    grading_parameter.data only; column dropped;       (34b Commit 3)
      Card field removed; CardWithRecall stale-client
      computed_field synthesized default_visits from JSON
    grading_parameter.data only; no synthesis           (34b Commit 3b, this state)
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from core.ebisu import model_to_halflife, predict_recall


class Card(BaseModel):
    """
    The persistence shape of a card. Frozen, no derived fields.

    Domain-agnostic field naming:
      - `canonical_content` (was `normalized_sgf` pre-34a/34b).
      - No top-level `default_visits` field; the value lives inside
        `grading_parameter.data.default_visits` for domains that
        need it (KataGo), opaque JSON for domains that don't.

    Constructed from a SQL row by CardRepository and LineageRepository;
    this class itself has no knowledge of SQL or repositories.

    `from_attributes=True` is set so the model can be constructed from
    any object exposing the right attributes (e.g., a SQLAlchemy Row
    dict produced by `row._asdict()`), in addition to the standard
    dict-expansion construction.
    """
    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: int
    num_moves: int
    alpha: float
    beta: float
    t: float
    last_reviewed_at: Optional[datetime]
    creation_date: datetime
    num_reviews: int
    suspended: bool
    grading_parameter: Optional[Dict[str, Any]]
    canonical_content: str
    content_hash: bytes
    card_source_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)

    @field_serializer("content_hash", when_used="json")
    def _serialize_content_hash(self, value: bytes) -> str:
        """
        Card.content_hash is a raw SHA-256 digest (bytes), matching
        the `normalized_position.content_hash` column type. But
        CardWithRecall is also this codebase's wire-response model
        (GET /cards/{id}, POST /forests/query) — raw bytes fail
        Pydantic v2's default JSON serialization (it round-trips
        through UTF-8, and a SHA-256 digest is essentially never
        valid UTF-8). Emit lowercase hex instead: it's the same
        representation `POST /positions/hash` returns (see
        `schemas/positions.py::PositionHashResponse`), so a client
        can compare a card's `content_hash` against that endpoint's
        response with a straight string equality — no decode step.

        `when_used="json"` is load-bearing, not decoration:
        `project_card` builds `CardWithRecall` via
        `CardWithRecall(**card.model_dump(), ...)` — a *python-mode*
        `model_dump()`. Without the restriction, that internal
        round-trip would also run this serializer, turning
        `content_hash` into a hex *string*, which Pydantic then
        re-validates back into `bytes` by UTF-8-encoding the hex
        string — silently double-encoding the hash. Scoping to
        `json` mode means only the actual wire response (FastAPI's
        `model_dump_json` / `dump_json` at the route boundary) sees
        the hex conversion; every internal python-mode dump/copy
        keeps the raw digest bytes.
        """
        return value.hex()


class CardWithRecall(Card):
    """
    A Card augmented with its current Bayesian recall projection.

    The wire shape returned by GET /cards/{id},
    POST /cards/{id}/review, and POST /forests/query.

    Post-34b-Commit-3b: emits only canonical field names. The
    stale-client compat shims that synthesized `normalized_sgf` and
    top-level `default_visits` for browsers running pre-Commit-2
    bundles have been removed — the stale-bundle window has closed
    and frontend code reads exclusively from the canonical fields.

    Any client that still reads `response.normalized_sgf` or
    `response.default_visits` will get `undefined` from this point
    on. The frontend's `34b-cleanup` removes the corresponding
    fallback chains in `mapToReviewCard` in tandem with this commit.
    """
    current_recall: float
    halflife_units: float


def compute_current_recall_from_prior(
    *,
    alpha: float,
    beta: float,
    t: float,
    last_reviewed_at: Optional[datetime],
    creation_date: datetime,
    now: datetime,
    time_unit_seconds: float,
) -> float:
    """
    Lowest-level recall function: computes the current Bayesian recall
    probability from the raw prior fields plus a clock reading.

    Pure function. Takes keyword-only arguments to prevent transposition
    accidents between the six semantically-distinct parameters.
    """
    last = last_reviewed_at or creation_date
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = (now - last).total_seconds() / time_unit_seconds
    return predict_recall((alpha, beta, t), elapsed)


def compute_current_recall(
    card: Card,
    *,
    now: datetime,
    time_unit_seconds: float,
) -> float:
    """
    Convenience wrapper: compute current recall for a Card entity.
    Delegates to compute_current_recall_from_prior.
    """
    return compute_current_recall_from_prior(
        alpha=card.alpha,
        beta=card.beta,
        t=card.t,
        last_reviewed_at=card.last_reviewed_at,
        creation_date=card.creation_date,
        now=now,
        time_unit_seconds=time_unit_seconds,
    )


def project_card(
    card: Card,
    *,
    now: datetime,
    time_unit_seconds: float,
) -> CardWithRecall:
    """
    Pure projection: augment a Card with its current Bayesian recall
    stats (current_recall + halflife_units).
    """
    return CardWithRecall(
        **card.model_dump(),
        current_recall=compute_current_recall(
            card, now=now, time_unit_seconds=time_unit_seconds
        ),
        halflife_units=model_to_halflife((card.alpha, card.beta, card.t)),
    )
