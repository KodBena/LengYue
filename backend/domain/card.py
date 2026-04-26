"""
Card domain entities and pure projections.

Pure domain. Imports only stdlib, Pydantic, and core.ebisu.
No SQLAlchemy, no FastAPI, no db.schema.

Exports:

- Card: persisted shape. Frozen Pydantic entity. Domain-agnostic
  field names throughout.

- CardWithRecall: Card + freshly-computed Bayesian recall projection.
  The wire shape. Post-34b-Commit-3b, emits only the canonical field
  names; the transitional stale-client compat shims (`normalized_sgf`
  and `default_visits` as @computed_field properties) have been
  removed now that the stale-bundle window is closed and all clients
  read the canonical names.

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
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict

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
    card_source_id: Optional[int] = None


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
