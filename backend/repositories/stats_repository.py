"""
Stats repository — the SQLAlchemy adapter for statistics queries.

Satisfies StatsRepositoryPort. Before item 32a.2, these queries lived
in `domain/stats_engine.py` where they held an AsyncSession and
imported from db.schema directly — the same Dependency-Rule violation
that items 32a and 32a.2 exist to eliminate. After 32a.2, the SQL is
here; the pure aggregation logic is in services/stats_service.py;
the two meet only via StatsRepositoryPort.

Two public methods match the Port:
  - fetch_tag_usage: GROUP BY + COUNT over tag ⋈ card_tag ⋈ card. SQL-side
    aggregation — no Python-side work beyond row-to-TagStat construction.
  - fetch_forest_members: recursive CTE that assigns each card to its
    forest root (via card_source.game_source_id ancestry), then joins
    with game_source and card for the full member-row shape. The
    service aggregates the results by root_card_id.

Dialect-agnostic: uses SQLAlchemy's recursive-CTE primitives and
ANSI-standard join syntax. Runs identically on SQLite and Postgres.

Item 15 (tenancy): both methods take *, user_id: UserId. Tag counts
restrict to the user's cards; forest members start from the user's
roots and (belt-and-braces) re-check at the recursive step. The
service layer forwards user_id from its own parameter; the route
forwards from the JWT-derived dependency.
"""
from typing import List

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import card, card_source, card_tag, game_source, tag
from domain.auth import UserId
from domain.stats import ForestMemberRow
from schemas.stats import TagStat


class StatsRepository:
    """
    SQLAlchemy implementation of StatsRepositoryPort.

    Holds a single AsyncSession; does not commit or manage
    transactions (stats are read-only queries). Stateless beyond
    the session reference.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def fetch_tag_usage(self, *, user_id: UserId) -> List[TagStat]:
        """
        Return (name, count) for every tag, sorted by count desc,
        with counts restricted to cards owned by `user_id`.

        Item 15 (tenancy): the join chain extends to `card` with a
        WHERE on user_id. The shape is:

            tag
              LEFT OUTER JOIN card_tag ON tag.id = card_tag.tag_id
              LEFT OUTER JOIN card ON card_tag.card_id = card.id
                                      AND card.user_id = :user_id
            GROUP BY tag.name

        The user_id filter sits inside the LEFT OUTER JOIN's ON clause,
        not in a top-level WHERE. This matters: a top-level
        `WHERE card.user_id = :user_id` would convert the LEFT OUTER
        JOIN to an INNER JOIN (because NULLs from unmatched rows fail
        the predicate), losing tag rows that have zero use by this
        user. Inside the ON clause, the predicate filters which join
        matches are accepted; unmatched tag rows still appear with
        NULL columns that the COUNT aggregates as zero.

        Tags used only by other tenants appear with count=0 — same
        as tags with no use at all. From the API surface the two are
        indistinguishable, which is the correct privacy property.
        The COUNT operates on ``card.c.id`` rather than
        ``card_tag.c.card_id``: when the inner LEFT OUTER JOIN to
        ``card`` fails (the card_tag row's card belongs to a
        different tenant), ``card.c.id`` is NULL on that pseudo-row
        and COUNT skips it. Counting ``card_tag.c.card_id`` instead
        would silently leak cross-tenant tag usage — the bug
        ``test_fetch_tag_usage_does_not_leak_other_tenants_counts``
        pins.
        """
        stmt = (
            select(tag.c.name, func.count(card.c.id).label("count"))
            .select_from(
                tag
                .outerjoin(card_tag, tag.c.id == card_tag.c.tag_id)
                .outerjoin(
                    card,
                    (card_tag.c.card_id == card.c.id)
                    & (card.c.user_id == user_id),
                )
            )
            .group_by(tag.c.name)
            .order_by(func.count(card.c.id).desc())
        )
        result = await self.session.execute(stmt)
        return [
            TagStat(name=row.name, count=row.count)
            for row in result.fetchall()
        ]

    async def fetch_forest_members(
        self, *, user_id: UserId
    ) -> List[ForestMemberRow]:
        """
        Return one row per (card × forest) membership, restricted to
        cards owned by `user_id`.

        Two-stage query:

        Stage 1 (root_mapping CTE): walk the card_source parent
        chain to assign each card to its forest root. The base case
        is "cards with a direct game_source AND owned by this user";
        the recursive step inherits the root_card_id and
        game_source_id from the parent AND requires the descendant
        to also be owned by this user.

        Stage 2 (final SELECT): join root_mapping with game_source
        (for forest-level metadata — description, player_white,
        player_black) and with card (for Bayesian-prior fields
        needed by recall aggregation).

        Item 15 (tenancy): the user_id filter appears in two places:

          - Base case: only roots owned by this user start a CTE walk.
            Achieved by joining card_source ⋈ card and filtering on
            card.user_id.
          - Recursive step: only descendants owned by this user are
            picked up. Achieved by the same ⋈ card filter on the step.
            Belt-and-braces: with item 14 active, every new branch's
            owner matches its parent's owner, but historical data may
            already have a cross-tenant lineage somewhere; the step
            filter prevents such data from leaking into a user's stats.
        """
        # Stage 1: recursive root_mapping CTE.
        # Base case: cards that ARE roots (have a direct game_source)
        # AND are owned by the requesting user.
        base = (
            select(
                card_source.c.card_id,
                card_source.c.game_source_id,
                card_source.c.card_id.label("root_card_id"),  # self-root
            )
            .select_from(
                card_source.join(card, card_source.c.card_id == card.c.id)
            )
            .where(card_source.c.game_source_id.is_not(None))
            .where(card.c.user_id == user_id)  # Item 15: tenancy filter.
            .cte(recursive=True, name="root_mapping")
        )

        # Recursive step: non-root cards inherit their parent's root,
        # AND the descendant must also be owned by this user.
        # The card alias (cs_card) below is the descendant card; we
        # enforce its ownership matches the requesting user.
        cs_card = card.alias("cs_card")
        step = (
            select(
                card_source.c.card_id,
                base.c.game_source_id,
                base.c.root_card_id,
            )
            .select_from(
                card_source
                .join(base, card_source.c.card_source_id == base.c.card_id)
                .join(cs_card, card_source.c.card_id == cs_card.c.id)
            )
            .where(cs_card.c.user_id == user_id)  # Item 15: belt-and-braces.
        )

        root_mapping_cte = base.union_all(step)

        # Stage 2: join with game_source (forest metadata) and card
        # (Bayesian-prior fields). No additional user_id filter needed
        # here — the CTE already restricts to this user's cards.
        stmt = (
            select(
                root_mapping_cte.c.root_card_id,
                root_mapping_cte.c.game_source_id,
                game_source.c.description,
                game_source.c.player_white,
                game_source.c.player_black,
                card.c.alpha,
                card.c.beta,
                card.c.t,
                card.c.last_reviewed_at,
                card.c.creation_date,
                card.c.num_reviews,
            )
            .join(
                game_source,
                game_source.c.id == root_mapping_cte.c.game_source_id,
            )
            .join(card, card.c.id == root_mapping_cte.c.card_id)
        )

        result = await self.session.execute(stmt)

        # Pydantic validates each row's shape on construction;
        # any schema drift (e.g., a removed column) would raise
        # here rather than silently producing wrong aggregations.
        return [
            ForestMemberRow.model_validate(row._asdict())
            for row in result.fetchall()
        ]
