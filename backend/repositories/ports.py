"""
Repository Ports — the abstract contracts that use cases depend on.

In Hexagonal terms, these are the "driven ports" — the interfaces the
application's inner core uses to ask the outside world for data. The
outer SQLAlchemy adapters in this package implement them. The inner
use cases (services/card_service.py, services/review_service.py,
services/stats_service.py, domain/pipeline.py::PipelineExecutor)
declare their dependencies structurally using these Protocols.

Python's Protocol gives us this with structural typing — any class
matching the method signatures satisfies the Port. Adapters inherit
explicitly (for mypy/pyright to catch signature drift); consumers
take the Port as a parameter and don't know which implementation
they got.

Five Ports live here:

    CardRepositoryPort       (21f):    reads for ReviewService + GET /cards/{id}
    CardWriteRepositoryPort  (30b):    writes for CardService
    LineageRepositoryPort    (32a):    tree-fetch for PipelineExecutor
    TagFilterRepositoryPort  (32a):    tag-DSL materialization for PipelineExecutor
    StatsRepositoryPort      (32a.2):  stats fetches for StatsService

Each Port declares only domain / wire types in its signatures — no
AsyncSession, no CTE, no SQLAlchemy Row. The Dependency Rule is
enforceable by inspecting this file's imports: everything comes from
`typing`, `domain.*`, or `schemas.*`. Nothing from `sqlalchemy.*`,
nothing from `db.schema`.
"""
from typing import Any, Dict, List, Optional, Protocol, Set, Tuple

from domain.auth import UserId
from domain.card import Card
from domain.pipeline_dsl import BaseSelection
from domain.stats import ForestMemberRow
from domain.tree_engine import CardNode
from schemas.stats import TagStat


class CardRepositoryPort(Protocol):
    """
    The read contract. ReviewService and the GET /cards/{id} route
    depend on this.

    Item 21f introduced it. Item 13 (tenancy) added the `user_id`
    parameter to both methods, threading the JWT-derived tenant
    identity through to the WHERE clause.
    """

    async def get_card_by_id(
        self,
        card_id: int,
        *,
        user_id: UserId,
    ) -> Optional[Card]:
        """
        Fetch a card by id, returning None if not found OR if the
        card exists but belongs to a different tenant.

        Item 13: the WHERE clause filters on both id and user_id. The
        404-not-403 boundary is preserved by collapsing the two
        predicates into one — from a tenant's perspective, the card
        does not exist. The route handler's existing
        `if not card: raise HTTPException(404)` branch handles both
        cases identically.

        ReviewService translates None into a CardNotFoundError
        (item 11), preserving the same error semantic.
        """
        ...

    async def update_card_model(
        self,
        card_id: int,
        new_model: Tuple[float, float, float],
        *,
        user_id: UserId,
    ) -> None:
        """
        Persist a new (alpha, beta, t) Bayesian prior for the card,
        bumping num_reviews and stamping last_reviewed_at.

        Item 13: the WHERE clause filters on user_id. An update issued
        against a card the caller doesn't own affects zero rows and
        returns silently — but the calling pattern (process_review
        always fetches via get_card_by_id first) ensures this branch
        is unreachable in practice. The redundant filter is
        belt-and-braces: if a future caller bypasses the fetch step,
        the update still won't escape the tenant boundary.
        """
        ...


class CardWriteRepositoryPort(Protocol):
    """
    The write contract. CardService depends on this.

    Introduced in item 30b. Five methods, all with keyword-only
    arguments, none committing (transaction boundary lives at the
    route via `async with db.begin():`).
    """

    async def get_or_create_position(
        self,
        *,
        canonical_content: str,
        content_hash: bytes,
    ) -> int:
        ...

    async def insert_card(
        self,
        *,
        num_moves: int,
        model: Tuple[float, float, float],
        user_id: int,
        grading_parameter: Optional[Dict[str, Any]],
        default_visits: int,
        position_id: int,
    ) -> int:
        ...

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
        """
        Insert a new game_source row and return its id.

        Item 24 (tenancy): user_id is now a required parameter and is
        stamped on the inserted row. Two users uploading the same SGF
        get distinct game_source rows (each owns their own metadata)
        even though they share the underlying normalized_position
        row (which is global and content-addressed).
        """
        ...

    async def link_source(
        self,
        *,
        card_id: int,
        parent_card_id: Optional[int],
        game_source_id: Optional[int],
    ) -> None:
        ...

    async def attach_tags(
        self,
        card_id: int,
        tag_names: List[str],
    ) -> None:
        ...


class LineageRepositoryPort(Protocol):
    """
    The tree-fetch contract. PipelineExecutor depends on this.

    Introduced in item 32a. Item 30c generalized fetch_selection to
    multi-context per call. Item 16 (tenancy) added user_id parameters
    so that lineage walks cannot cross tenant boundaries.
    """

    async def fetch_selection(
        self,
        selection: BaseSelection,
        context_ids: List[int],
        *,
        user_id: UserId,
    ) -> List[CardNode]:
        """
        Materialize the CardNodes matching a typed BaseSelection
        rooted at any of the given context ids, restricted to cards
        owned by `user_id`.

        Item 30c: takes List[int] instead of int. The implementation
        executes a single CTE covering all contexts.

        Item 16 (tenancy): the recursive descent CTE applies the
        user_id filter at both base case and recursive step, so a
        descent that started from a user's own context cannot wander
        into another tenant's subtree even if historical card_source
        rows cross tenant boundaries (item 14 prevents new such
        crossings; old data may already have them).

        Empty context_ids returns an empty list (the natural
        no-op result).

        Collision resolution across context ids — when the same card
        id appears via descent from multiple contexts — is the
        caller's responsibility. The materialized list may contain
        duplicates by id (with possibly different depth values, since
        a node can appear at different depths from different roots);
        the executor's first-seen-by-depth pool_map handles dedup.
        """
        ...

    async def fetch_lineage(
        self,
        context_id: int,
        max_depth: Optional[int] = None,
        *,
        user_id: UserId,
    ) -> List[CardNode]:
        """
        Materialize the sub-forest rooted at `context_id` (inclusive),
        optionally bounded by depth, restricted to cards owned by
        `user_id`. Single-context — validator scripts and ad-hoc
        analytics callers want one tree at a time.

        Item 16 (tenancy): the user_id filter applies to both the
        starting context node and all descendants. A request for a
        lineage rooted at another tenant's card returns an empty list
        (the base predicate doesn't match).
        """
        ...


class TagFilterRepositoryPort(Protocol):
    """
    The tag-filter materialization contract. PipelineExecutor depends
    on this for the FilterSelection path.

    Introduced in item 32a. Item 16 (tenancy) added user_id parameter
    so that tag-filter results are restricted to the caller's cards.
    """

    async def card_ids_matching(
        self, tag_expression: str, *, user_id: UserId
    ) -> Set[int]:
        """
        Compile the tag-DSL expression and return the set of card ids
        whose tags satisfy it AND which belong to `user_id`.

        Item 16 (tenancy): tag-DSL expressions are user-authored
        and may match cards across the system. Without filtering,
        a tenant filtering by tag could observe the existence of
        another tenant's tagged cards. The adapter wraps the
        compiled SELECT in an outer query that joins `card` and
        filters on user_id.

        Raises PipelineDSLError for malformed expressions.
        """
        ...


class StatsRepositoryPort(Protocol):
    """
    The stats-fetch contract. StatsService depends on this.

    Introduced in item 32a.2 to get SQL out of `domain/stats_engine.py`
    (now deleted). Item 15 (tenancy) added user_id parameters: tag
    usage and forest membership are both restricted to cards owned by
    the caller.

    Two methods:

    - fetch_tag_usage: SQL-side aggregation (GROUP BY). Returns
      TagStat directly — there's no domain-layer transformation, so
      separating a TagUsageRow DTO would be ceremony without payoff.
      Tag rows with zero use by the caller still appear with count=0
      (LEFT OUTER JOIN preserves them); tags used only by other
      tenants also appear with count=0 from this caller's perspective.

    - fetch_forest_members: one row per (card × forest) membership.
      Python-side aggregation lives in StatsService.compute_forest_
      summaries because it involves per-card Bayesian recall
      computation, which is domain logic.

    A test fake implements both methods with in-memory lists and no
    SQLAlchemy:

        class FakeStatsRepo:
            def __init__(
                self,
                tags: List[TagStat],
                members: List[ForestMemberRow],
            ):
                self._tags = tags
                self._members = members

            async def fetch_tag_usage(self, *, user_id: UserId) -> List[TagStat]:
                return self._tags

            async def fetch_forest_members(self, *, user_id: UserId) -> List[ForestMemberRow]:
                return self._members
    """

    async def fetch_tag_usage(self, *, user_id: UserId) -> List[TagStat]:
        """
        Return the (name, count) pairs for every tag, ordered by
        count descending. Counts are restricted to cards owned by
        `user_id`. TagStat is the wire shape defined in
        schemas/stats.py; it also serves as the domain DTO here
        because the aggregation is pure SQL (GROUP BY + COUNT) and
        there's no separate domain representation worth introducing.

        Item 15: tags with zero use by this user appear with count=0
        (LEFT OUTER JOIN preserves the tag row). Tags used by other
        tenants but not this one are indistinguishable from tags with
        no use at all from the API surface — both report count=0.
        """
        ...

    async def fetch_forest_members(self, *, user_id: UserId) -> List[ForestMemberRow]:
        """
        Return the flat pre-aggregation rows: one per (card, forest)
        membership, restricted to cards owned by `user_id`. The service
        aggregates by root_card_id in Python to compute per-forest
        totals and average recall.

        Dialect-agnostic: the adapter uses a recursive CTE to compute
        forest-root assignments (a card belongs to the forest of its
        root ancestor), then joins with game_source (for forest-level
        metadata) and card (for Bayesian-prior fields).

        Item 15: tenancy is enforced at both the base case and the
        recursive step of the root_mapping CTE. The base-case filter
        ensures we only start from this user's roots; the step filter
        is belt-and-braces against historical data where a descendant
        card may belong to a different tenant than its parent (item 14
        prevents this for new writes; old data may already be in this
        state).
        """
        ...
