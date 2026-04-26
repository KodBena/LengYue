"""
StatsService — pure use case for tag-usage and forest-summary queries.

Item 32a.2: replaces the previous `domain/stats_engine.py` (now
deleted). Same shape as the other Port-pure services (CardService,
ReviewService, PipelineExecutor):

  - Depends on one Port (StatsRepositoryPort).
  - Holds a scalar config (time_unit) for Bayesian recall computation.
  - Contains no SQL, no session, no db.schema imports.
  - Testable with a fake repository and a fixed clock reading.

Two use-case methods, mirroring the previous StatsEngine:

  - compute_tag_usage: trivial pass-through. Tag usage is SQL-side
    aggregation (GROUP BY + COUNT); the service adds nothing. Kept
    as a method rather than leaking StatsRepositoryPort to the route
    because (a) symmetry with compute_forest_summaries and (b) a
    future "filter out low-use tags" policy would naturally land here.

  - compute_forest_summaries: the interesting one. Takes the flat
    ForestMemberRow stream from the repository and aggregates it by
    root_card_id into wire-shape ForestStats. Recall is computed
    per card via compute_current_recall_from_prior (the lower-level
    variant added in item 32a to support DTOs thinner than a full
    Card). Results are sorted by total_cards descending — consistent
    with pre-32a.2 behavior.

Aggregation correctness rests on one invariant: the recursive root-
mapping CTE in StatsRepository ensures that each (card, forest)
appears exactly once in the flat rows. If a card could somehow appear
in two forests (e.g., via a future multi-parent model), this
aggregation would double-count its reviews. Today the schema's
CheckConstraint on card_source enforces single-parent, so the
invariant holds — but a future schema change that relaxes this would
need to revisit the aggregation.
"""
from datetime import datetime, timezone
from typing import List, Optional

from domain.auth import UserId
from domain.card import compute_current_recall_from_prior
from repositories.ports import StatsRepositoryPort
from schemas.stats import ForestStat, TagStat


class _ForestStatBuilder:
    """
    Mutable accumulator for per-forest aggregation. Private to this
    module — callers only see the finalized ForestStat.

    Mutation is a deliberate performance choice for a linear-pass
    aggregation over potentially thousands of rows. The lifetime is
    bounded by a single compute_forest_summaries call, so there's
    no shared-state hazard.
    """

    def __init__(
        self,
        *,
        root_card_id: int,
        game_source_id: int,
        description: Optional[str],
        player_white: Optional[str],
        player_black: Optional[str],
    ):
        self.root_card_id = root_card_id
        self.game_source_id = game_source_id
        self.description = description
        self.player_white = player_white
        self.player_black = player_black
        self.total_cards = 0
        self.total_reviews = 0
        self.recall_sum = 0.0

    def add_card(self, *, num_reviews: int, recall: float) -> None:
        self.total_cards += 1
        self.total_reviews += num_reviews
        self.recall_sum += recall

    def finalize(self) -> ForestStat:
        avg_recall = (
            self.recall_sum / self.total_cards
            if self.total_cards > 0
            else 0.0
        )
        return ForestStat(
            root_card_id=self.root_card_id,
            game_source_id=self.game_source_id,
            description=self.description,
            player_white=self.player_white,
            player_black=self.player_black,
            total_cards=self.total_cards,
            total_reviews=self.total_reviews,
            average_recall=avg_recall,
        )


class StatsService:
    def __init__(
        self,
        repository: StatsRepositoryPort,
        time_unit: float = 14400.0,
    ):
        """
        Depends on one Port and one scalar. No session, no config
        reach-in beyond the explicitly-injected time_unit.

        The Port is declared as a Protocol in repositories/ports.py,
        so tests can pass any structural match. A FakeStatsRepo
        holding two in-memory lists is ~10 lines.
        """
        self.repository = repository
        self.time_unit = time_unit

    async def compute_tag_usage(self, *, user_id: UserId) -> List[TagStat]:
        """
        Return tag-usage statistics for `user_id`. Currently a
        pass-through: aggregation happens SQL-side (GROUP BY + COUNT)
        with the tenant filter inside the LEFT OUTER JOIN's ON clause.

        Kept as a service method for symmetry and as a natural
        extension point (a future "hide tags used fewer than N
        times" policy would land here, not in the adapter).
        """
        return await self.repository.fetch_tag_usage(user_id=user_id)

    async def compute_forest_summaries(
        self, *, user_id: UserId
    ) -> List[ForestStat]:
        """
        Return per-forest summaries for `user_id`: total cards, total
        reviews, average recall.

        Aggregation pipeline:
          1. Fetch flat (card × forest) rows from the repository,
             restricted to this user's cards.
          2. Group by root_card_id, computing per-card recall on the
             fly via compute_current_recall_from_prior.
          3. Finalize averages and collect into ForestStat DTOs.
          4. Sort by total_cards descending — largest forests first,
             matching pre-32a.2 behavior.

        Single clock reading (`now`) for the whole batch: every card's
        recall is computed against the same instant, which is the
        semantically-correct choice (the client sees a snapshot, not
        a stream of microsecond-apart readings) and is slightly
        cheaper than re-reading the clock per card.
        """
        rows = await self.repository.fetch_forest_members(user_id=user_id)
        now = datetime.now(timezone.utc)

        builders: dict[int, _ForestStatBuilder] = {}
        for row in rows:
            if row.root_card_id not in builders:
                builders[row.root_card_id] = _ForestStatBuilder(
                    root_card_id=row.root_card_id,
                    game_source_id=row.game_source_id,
                    description=row.description,
                    player_white=row.player_white,
                    player_black=row.player_black,
                )

            recall = compute_current_recall_from_prior(
                alpha=row.alpha,
                beta=row.beta,
                t=row.t,
                last_reviewed_at=row.last_reviewed_at,
                creation_date=row.creation_date,
                now=now,
                time_unit_seconds=self.time_unit,
            )

            builders[row.root_card_id].add_card(
                num_reviews=row.num_reviews,
                recall=recall,
            )

        results = [builder.finalize() for builder in builders.values()]
        results.sort(key=lambda f: f.total_cards, reverse=True)
        return results
