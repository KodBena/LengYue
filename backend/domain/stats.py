"""
Stats domain DTOs.

`ForestMemberRow` is the pre-aggregation shape returned by
StatsRepository.fetch_forest_members. One row per (card × forest)
membership — the SQL-side recursive CTE in the adapter produces these;
StatsService aggregates them in Python into the wire-shape ForestStats.

Why this lives in domain/ rather than schemas/: it's an *intermediate*
shape, not a wire contract. The frontend never sees ForestMemberRow;
it sees the aggregated ForestStat. The DTO exists so the Port can
declare its return type in terms of pure Python values rather than
SQLAlchemy Rows, which is the whole point of item 32a.2.

Why the forest-level fields are repeated across rows (rather than a
two-level {root: {...}, members: [...]} shape): the SQL join produces
rows in exactly this flat form, and the service aggregates by
root_card_id in a single linear pass. Restructuring SQL output into
a nested shape would require either a second query or a GROUP_CONCAT-
style trick that's dialect-sensitive. The flat form is dialect-agnostic
(SQLite + Postgres) and the Python aggregation loop is trivial.

The subset of Card fields carried here (alpha, beta, t,
last_reviewed_at, creation_date, num_reviews) is deliberately thinner
than a full Card — it's exactly what the aggregation needs. A future
stats feature that needs more card attributes can widen this DTO
without breaking existing callers (Pydantic's ignore-extra default
makes additive changes safe).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ForestMemberRow(BaseModel):
    """
    One row from the forest-membership query: a card's participation
    in a specific forest, with everything the aggregation needs.

    Forest-level fields (root_card_id, game_source_id, description,
    player_white, player_black) repeat across every member of the
    same forest. The aggregation dedupes them into a single
    ForestStat per distinct root_card_id.

    Card-state fields (alpha, beta, t, last_reviewed_at,
    creation_date, num_reviews) are the per-card inputs to the
    Bayesian recall computation — same fields compute_current_recall_
    from_prior in domain/card.py consumes.
    """
    model_config = ConfigDict(frozen=True)

    # Forest-level (repeated across rows of the same forest)
    root_card_id: int
    game_source_id: int
    description: Optional[str]
    player_white: Optional[str]
    player_black: Optional[str]

    # Card-state fields for recall computation
    alpha: float
    beta: float
    t: float
    last_reviewed_at: Optional[datetime]
    creation_date: datetime
    num_reviews: int
