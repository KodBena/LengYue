"""
repositories/ports.py

Repository Ports — the abstract contracts that use cases depend on.

In Hexagonal terms, these are the "driven ports" — the interfaces the
application's inner core uses to ask the outside world for data. The
outer SQLAlchemy adapters in this package implement them. The inner
use cases (services/card_service.py, services/review_service.py,
services/stats_service.py, domain/pipeline.py::PipelineExecutor) and
the route layer (api/routes/lineage.py for the card-tree endpoints)
declare their dependencies structurally using these Protocols.

Python's Protocol gives us this with structural typing — any class
matching the method signatures satisfies the Port. Adapters inherit
explicitly (for mypy/pyright to catch signature drift); consumers
take the Port as a parameter and don't know which implementation
they got.

Six Ports live here:

    CardRepositoryPort           (21f):    reads for ReviewService + GET /cards/{id}
    CardWriteRepositoryPort      (30b):    writes for CardService
    LineageRepositoryPort        (32a):    tree-fetch for PipelineExecutor;
                                           extended for the card-tree
                                           endpoints (release-scope item 3)
    TagFilterRepositoryPort      (32a):    tag-DSL materialization for PipelineExecutor
    StatsRepositoryPort          (32a.2):  stats fetches for StatsService
    AnalysisBundleRepositoryPort (cross/   per-board KataGo analysis
                                  ap):     bundle persistence

Each Port declares only domain / wire types in its signatures — no
AsyncSession, no CTE, no SQLAlchemy Row. The Dependency Rule is
enforceable by inspecting this file's imports: everything comes from
`typing`, `domain.*`, or `schemas.*`. Nothing from `sqlalchemy.*`,
nothing from `db.schema`.

License: Public Domain (The Unlicense)
"""
from typing import Any, Dict, List, Optional, Protocol, Set, Tuple
from uuid import UUID

from domain.analysis_bundle import AnalysisBundle, AnalysisBundleSummary
from domain.auth import UserId
from domain.card import Card
from domain.game_library import (
    GameLibraryImportRequest,
    GameListFilter,
    GameListSort,
    GameListSortDirection,
    ImportOutcome,
    LibraryGame,
    LibraryGameListItem,
    SgfMetadata,
)
from domain.lineage import RootedTree, RootResolution
from domain.normalizer import NormalizedPosition
from domain.pipeline_dsl import BaseSelection
from domain.stats import ForestMemberRow
from domain.tree_engine import CardNode
from schemas.card import CardPatch
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

        Game-source dedup: unconditional insert. The new
        row carries `client_game_id IS NULL`, exempt from the partial
        unique index and therefore not a dedup target. CardService
        dispatches between this method and
        `get_or_create_game_source_by_client_id` based on whether
        the wire request supplied a client_game_id.
        """
        ...

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
        """
        Get-or-create a game_source row keyed on
        `(user_id, client_game_id)` and return its id.

        Game-source dedup: the contract the
        `frontend-to-backend-game-source-dedup` dispatch establishes.
        A frontend that stamps every board's lifetime with a stable
        opaque UUID gets one game_source row regardless of how many
        mints occur during that lifetime — eliminating the
        "Untitled Game ×N" forest-navigator fragmentation that
        triggered the dispatch.

        Implementation contract:

        - SELECT first by `(user_id, client_game_id)`. The pair is
          unique under the partial index
          `uniq_game_source_user_client_game_id`, so the SELECT
          returns at most one row.

        - On hit: return the existing id. The incoming
          `position_id`, `player_white`, `player_black`,
          `description`, and `raw_content` are ignored. First-mint
          wins. This matches user intent — editing SGF root
          properties between mints shouldn't retroactively rewrite
          the recorded metadata. The caller (CardService) doesn't
          care about the distinction, but downstream observability
          (Q4 of the dispatch) wants to record "got" vs "created."

        - On miss: INSERT a new row with the same fields
          `insert_game_source` would set, plus the stamped
          `client_game_id`. The new row's id is returned.

        Tenancy: the SELECT predicate fuses `user_id` and
        `client_game_id` (same WHERE-clause-fusion pattern that gives
        the codebase its 404-not-403 invariant). Two users that
        somehow generated the same UUID get isolated rows; the
        partial unique index permits identical client_game_ids
        across tenants.

        Race window: SELECT-then-INSERT is not strictly atomic. Two
        concurrent transactions sharing a `(user_id, client_game_id)`
        can both miss the SELECT, then both attempt the INSERT, and
        the partial unique index serializes them — one succeeds, the
        other surfaces an IntegrityError. This matches the existing
        race window of `get_or_create_position` and is acceptable
        for the current single-writer-per-tenant pattern; if
        concurrent multi-tab ingestion ever becomes a workload, add
        a dialect-specific upsert branch here. The IntegrityError
        path bubbles to the route as a 500, which is honest:
        a rare race condition that the database correctly refused.
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

    async def update_card_metadata(
        self,
        card_id: int,
        patch: CardPatch,
        *,
        user_id: UserId,
    ) -> Optional[Card]:
        """
        Apply a partial-update patch to the card identified by
        ``card_id``, restricted to cards owned by ``user_id``.

        Card-metadata inline-edit arc 2: the wire-shape contract is
        recorded in
        `docs/dispatch/backend-to-frontend-card-metadata-inline-edit-status.md`
        (Ask 2 mutable-subset table and merge semantics).

        Returns the updated ``Card`` (with ``tags`` populated via the
        same read-side enrichment as ``get_card_by_id``) or ``None``
        when ``card_id`` doesn't exist OR belongs to a different
        tenant. The route layer maps ``None`` to 404 via the
        established ``CardNotFoundError`` translation in
        ``CardService.update_card_metadata``, preserving the
        codebase's 404-not-403 invariant.

        Semantics enforced by the adapter:

        - ``patch.tags is None``: tags left untouched. ``patch.tags
          == []``: all card_tag rows for this card are deleted.
          ``patch.tags == ["a", "b"]``: tags fully replaced with that
          set.
        - ``patch.num_moves``: direct ``UPDATE``.
        - ``patch.suspended``: direct ``UPDATE``.
        - ``patch.grading_parameter``: JSON-merge-patch at the
          ``data`` key level. Keys in the patch's ``data`` overwrite
          the stored same-named keys; other keys preserved. The outer
          ``grading_parameter`` is merge-style: if the stored value
          is ``None``, the patch supplies the new wrapper.
        - ``patch.reset_prior=True``: ``(alpha, beta, t)`` reset to
          ``config.EBISU_DEFAULT_MODEL``, ``last_reviewed_at`` set to
          ``NULL``, ``num_reviews`` set to 0. Independent of any
          other field in the patch.

        All mutations happen inside the caller's transaction (the
        route's ``async with db.begin():``). The adapter does not
        commit.

        Tenancy: predicate fusion in the UPDATE WHERE clause (same
        ``card.id == :card_id AND card.user_id == :user_id`` pattern
        as ``update_card_model``). Cross-tenant writes affect zero
        rows and surface as ``None`` from this method, preserving
        the 404-not-403 invariant. The existence check at the start
        of the method runs against the same fused predicate, so the
        same shape applies on both branches.
        """
        ...


class LineageRepositoryPort(Protocol):
    """
    The tree-fetch contract. PipelineExecutor depends on this for the
    pipeline-result path; the card-tree route (api/routes/lineage.py)
    depends on it for the resolve-roots and tree-by-root endpoints.

    Introduced in item 32a. Item 30c generalized fetch_selection to
    multi-context per call. Item 16 (tenancy) added user_id parameters
    so that lineage walks cannot cross tenant boundaries. The
    card-tree extension (release-scope item 3) adds two methods —
    `resolve_roots` (upward walk; many cards → their game-source
    roots) and `fetch_tree_by_root` (downward walk; one root →
    structure-only subtree, capped) — both following the same
    keyword-only-user_id and defense-in-depth-recursive-CTE patterns.
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

    async def resolve_roots(
        self,
        card_ids: List[int],
        *,
        user_id: UserId,
    ) -> RootResolution:
        """
        For each input card id owned by `user_id`, identify the
        game-source root that the card descends from, group the input
        cards by their root, and return both the matched groups and
        the explicit `unmatched_card_ids` list (cards not owned by
        the caller, or not present in the database at all).

        Card-tree contract: see `docs/archive/notes/card-tree-backend-spec.md`
        for the wire-shape rationale and the auditability argument
        for surfacing unmatched ids explicitly rather than silently
        dropping them.

        Tenancy: this is the seventh tenant-scoped read path on the
        backend. The walk follows the same defense-in-depth pattern
        used by `_recursive_descent_cte` — `user_id` applies at both
        the base case and the recursive step so historical
        cross-tenant edges (if any exist) cannot leak into a result.
        Cross-tenant input ids appear in `unmatched_card_ids` (the
        bulk lift of the per-card 404-not-403 invariant from item
        13).

        Empty input returns an empty `RootResolution`. The order of
        `roots` and the `card_ids_in_tree` within each group is the
        adapter's choice; no ordering invariant is part of the
        contract — the frontend re-organizes by its own UX rules.
        """
        ...

    async def fetch_tree_by_root(
        self,
        root_card_id: int,
        *,
        user_id: UserId,
        max_nodes: int = 10000,
    ) -> RootedTree:
        """
        Return the structure-only subtree rooted at `root_card_id`,
        restricted to cards owned by `user_id`. The result wraps the
        recursive `CardTree` with the `root_card_id` and the
        `game_source_id` of the game source the root descends from
        (the wire shape's per-root context).

        Card-tree contract: per-card metadata is fetched separately
        via /cards/{id} (the existing route). The recursive `tree`
        field carries only `id` and `children` per node — see
        `docs/archive/notes/card-tree-backend-spec.md` for the rationale.

        Behaviors:

        - If `root_card_id` is not owned by the caller, or doesn't
          exist, or exists but isn't a game-source root (i.e.
          `card_source.game_source_id IS NULL` for that row), raise
          `CardNotFoundError`. The route maps this to 404 — the
          single 404-not-403 collapse for the single-resource case
          (item 13's posture).

        - If the tree contains more than `max_nodes` nodes, raise
          `LineageOverflowError(actual_size, max_nodes)`. Early
          termination by ADR-0002: post-hoc truncation produces an
          undefined "which subset did the user receive" question,
          so the request fails with structured detail instead.

        Tenancy: eighth tenant-scoped read path. Same
        defense-in-depth filtering as `resolve_roots`. Descendants
        belonging to a different tenant (only possible from
        historical data; item 14 prevents new such crossings) are
        filtered out of the returned tree.

        Implementation note on the return shape: the
        backend-spec text declares the return as `CardTree` and
        the wire response shape as `{root_card_id, game_source_id,
        tree}`. The two are inconsistent because the Port has the
        game_source_id in hand from its own root-verification step,
        and forcing the route to fetch it again would be a wasted
        round trip. The Port returns `RootedTree` (a small wrapper
        carrying both pieces of context) so the route can project
        directly to the wire shape. Worklog
        2026-04-29-card-tree-backend documents the deviation.
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


class AnalysisBundleRepositoryPort(Protocol):
    """
    The analysis-bundle persistence contract. AnalysisBundleService
    depends on this for the cross/analysis-persistence arc.

    Introduced for the per-(user_id, board_id) bundle storage
    feature. The wire-shape and codec-envelope contract is
    recorded in
    docs/dispatch/backend-to-frontend-analysis-persistence-status.md.

    Tenancy: every method takes `*, user_id: UserId` keyword-only,
    matching the rest of the spine. The composite PK
    `(user_id, board_id)` and the WHERE-clause-fusion pattern in
    the adapter preserve the codebase's 404-not-403 invariant — a
    GET / DELETE for someone else's `board_id` is indistinguishable
    from a GET / DELETE for a non-existent bundle.

    The codec dispatch (encoding bundles to the configured write
    scheme; decoding stored payloads regardless of their scheme)
    lives entirely inside the adapter. The Port speaks domain
    DTOs (AnalysisBundle / AnalysisBundleSummary), never raw bytes.
    """

    async def upsert(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
        bundle: AnalysisBundle,
    ) -> AnalysisBundleSummary:
        """
        Insert or replace the bundle stored under
        `(user_id, board_id)`. Returns the post-write summary
        (record_count, stored_scheme, stored_byte_size, updated_at)
        — this is what the route projects directly into the
        AnalysisBundleWriteResponse wire shape.

        The adapter performs three responsibilities atomically
        within the caller's transaction:

        1. Encode `bundle` via the currently-configured write
           scheme (`config.ANALYSIS_PERSISTENCE_WRITE_SCHEME`) and
           compute the post-transcoding byte_size.
        2. Atomic per-user quota check: SUM(byte_size) for this
           user's existing bundles, minus the row being replaced
           (if any), plus the incoming byte_size. If the new total
           would exceed `config.ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES`,
           raise `UserQuotaExceededError(current_bytes, quota_bytes)`
           BEFORE the INSERT/UPDATE — no row is written.
        3. SELECT-then-conditional-INSERT-or-UPDATE for dialect
           agnosticism (matching the documents.py upsert pattern).
           UPDATE replaces the existing row's payload + scheme +
           record_count + byte_size + updated_at; INSERT creates
           a new row.

        Tenancy: the WHERE clauses on the existence check and the
        UPDATE both filter on `user_id`. A would-be cross-tenant
        write affects zero rows (and the quota check above already
        operated on the caller's namespace, so the math is honest).

        Per-bundle cap is checked at the SERVICE layer, not here —
        the service knows the request body length, the adapter
        knows the post-transcoding byte_size; these are the two
        natural enforcement points for two distinct caps.
        """
        ...

    async def get(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> Optional[AnalysisBundle]:
        """
        Fetch the bundle stored under `(user_id, board_id)`,
        decoded back to canonical-JSON shape via the row's
        recorded `scheme`. Returns None if no bundle exists OR if
        the bundle exists but belongs to a different tenant.

        The codec dispatcher in the adapter handles every scheme
        the backend has ever written — old rows with older schemes
        remain readable indefinitely. If a row carries a scheme
        the dispatcher doesn't recognise (a re-pack rolled back, a
        hand-edited row, a misconfigured deployment), the dispatcher
        raises `UnknownSchemeError(scheme)`, which the route maps
        to a structured 500 (Confirmation C2 in the dispatch).

        Tenancy: WHERE clause filters on both `board_id` and
        `user_id`. The 404-not-403 invariant: the route maps None
        to 404, so "doesn't exist" and "not yours" are
        indistinguishable.
        """
        ...

    async def delete(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> None:
        """
        Idempotent delete. Returns successfully whether or not a
        row existed for `(user_id, board_id)`. The route maps
        success to 204 No Content regardless.

        Tenancy: WHERE clause filters on `user_id`. A delete for
        another tenant's `board_id` affects zero rows and returns
        normally — same shape as deleting a non-existent bundle.
        """
        ...

    async def list_summaries(
        self,
        *,
        user_id: UserId,
    ) -> List[AnalysisBundleSummary]:
        """
        Return per-bundle metadata for every bundle the caller
        owns. No payloads — the frontend's storage panel uses this
        to render "you have N bundles using M GB" without forcing
        a per-bundle decode.

        Order is unspecified. Realistic cardinality is small
        (~tens of bundles per user in heavy use); no pagination is
        proposed for v1.

        Tenancy: WHERE clause filters on `user_id` — the caller
        cannot observe other tenants' bundle metadata.
        """
        ...


class GameLibraryRepositoryPort(Protocol):
    """
    The games-library contract. GameLibraryService depends on this.

    Introduced for the SGF-library arc (see
    ``docs/notes/sgf-library-plan.md``). Four methods: batch import,
    list with sort + filter + offset + limit + total count, single-game
    detail fetch, single-game delete. All tenant-scoped — the
    ``user_id`` parameter is non-optional on every method and filters
    every WHERE clause to preserve the codebase's 404-not-403
    invariant.

    The Port is separate from ``CardWriteRepositoryPort`` rather than
    a method-set extension: the read operations (``list_games``,
    ``get_game``) are not card-write concerns, and the library's
    consumer (``GameLibraryService``) is a distinct use case from
    ``CardService``. Per the project's pattern, a Port per concern
    even when the underlying table is shared.
    """

    async def import_games(
        self,
        *,
        user_id: UserId,
        requests: List[GameLibraryImportRequest],
    ) -> List[ImportOutcome]:
        """
        Insert a batch of pre-normalized SGFs as library entries.

        The adapter wraps each per-file write in a SAVEPOINT
        (``session.begin_nested()``); a per-row failure rolls back
        only that SAVEPOINT, not the surrounding batch transaction.
        The returned list is in the same order as ``requests`` — index
        N of the outcomes list corresponds to index N of the input.

        Per-file behaviour:

        - Resolve or create the ``normalized_position`` row via
          content_hash dedup (the existing global dedup chain that
          ``get_or_create_position`` services for cards).
        - Look up ``(user_id, position_id)`` in ``game_source``. If a
          row already exists, return ``ImportOutcomeDeduplicated`` with
          that row's id and ``client_game_id`` (which may be ``None``
          for legacy rows that pre-date the dedup arc). The existing
          row's metadata is preserved as-is — first-mint-wins,
          consistent with ``get_or_create_game_source_by_client_id``.
        - Otherwise, INSERT a new ``game_source`` row with a freshly
          generated ``client_game_id`` UUID, the typed metadata
          columns populated from ``request.metadata``, the JSON
          ``metadata_extra`` populated from ``request.metadata.extras``,
          and ``created_at`` set by the column default. Return
          ``ImportOutcomeCreated`` with the new id and UUID.
        - If the per-row write raises (unique constraint, dialect
          oddity, anything else), the SAVEPOINT rolls back and the
          outcome is ``ImportOutcomeErrored`` carrying the error
          string. The batch continues with the next file.

        Tenancy: every WHERE clause filters on ``user_id``. The
        per-user dedup index ``ix_game_source_user_position``
        supports the existence check without a sequential scan.

        Empty ``requests`` returns an empty list.
        """
        ...

    async def list_games(
        self,
        *,
        user_id: UserId,
        sort: GameListSort,
        direction: GameListSortDirection,
        filt: GameListFilter,
        offset: int,
        limit: int,
    ) -> Tuple[List[LibraryGameListItem], int]:
        """
        Paginated list of the caller's library games, plus the total
        match count under the same filter.

        The returned tuple is ``(rows, total_count)``. ``rows`` is the
        page (length up to ``limit``); ``total_count`` is the number
        of rows matching the filter regardless of pagination — what
        the SPA needs to size the virtual scroll's scrollbar without
        having seen every row.

        Sort handling:

        - The ``sort`` column comes from a closed Literal vocabulary
          (validated at the route boundary; the adapter trusts the
          input). A compound index ``(user_id, sort_col, id)`` exists
          for every sort column.
        - ``direction`` is ``"asc"`` or ``"desc"``. The secondary sort
          is always ``id`` in the same direction — sort determinism
          across pages.
        - Rows with NULL in the sort column sort to the end on ``asc``,
          the start on ``desc`` (the dialect default ordering for
          NULLs varies; the adapter is responsible for normalizing).

        Filter handling:

        - Predicates compose into the WHERE clause; absent predicates
          don't constrain the query.
        - ``player_white_like`` / ``player_black_like``: substring
          match (``LIKE '%val%'``).
        - ``date_from`` / ``date_to``: lexicographic comparison on the
          ``date`` string.
        - ``result_eq`` / ``ruleset_eq`` / ``board_size_eq``: exact
          match.

        Column projection: the returned rows exclude ``raw_content``.
        The detail endpoint ships SGF bodies one row at a time per
        the column-projection discipline (``raw_content`` averages
        ~2 KB per row; listing 100 rows without it is ~15 KB instead
        of ~200 KB).

        Tenancy: WHERE clause always filters on ``user_id``. The
        total_count COUNT(*) uses the same filtered WHERE.
        """
        ...

    async def get_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> Optional[LibraryGame]:
        """
        Fetch a single library game by id, including ``raw_content``.

        Returns ``None`` when the row doesn't exist OR when it
        exists but belongs to a different tenant. The route maps
        ``None`` to 404 — the 404-not-403 invariant per
        ``docs/notes/tenancy.md``.

        ``metadata_extra`` is the JSON column's content (every SGF
        property not lifted into a typed column). It comes back as
        the JSON the adapter wrote — typically a flat string→string
        dict mirroring ``SgfMetadata.extras`` from the import path.
        """
        ...

    async def delete_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> bool:
        """
        Delete the library game identified by ``game_id``, restricted
        to rows owned by ``user_id``. Returns ``True`` on a real
        deletion, ``False`` when no row matched (the row didn't
        exist OR belonged to a different tenant).

        Cascade behaviour on dependent ``card_source`` rows is
        ``ON DELETE SET NULL`` per the existing schema — cards minted
        from this game survive the delete with their
        ``game_source_id`` nulled out. Cards retain their position
        via ``normalized_position_id``; they just lose the source
        link.

        Tenancy: WHERE clause filters on ``user_id``. A delete for
        another tenant's ``game_id`` affects zero rows and returns
        ``False``.
        """
        ...

    async def list_players(
        self,
        *,
        user_id: UserId,
    ) -> List[str]:
        """
        Distinct player names across the caller's library, ordered
        by descending frequency.

        The list is the deduplicated union of ``player_white`` and
        ``player_black`` values across every ``game_source`` row
        owned by ``user_id``. NULL and empty strings are excluded.
        Ordering: most-frequent first (so common players surface at
        the top of the SPA's autocomplete dropdown); ties broken
        alphabetically for determinism.

        Tenancy: WHERE clause filters on ``user_id``. A caller
        cannot observe another tenant's player names.

        Empty library returns an empty list.
        """
        ...
