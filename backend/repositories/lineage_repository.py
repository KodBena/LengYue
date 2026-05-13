"""
repositories/lineage_repository.py

Lineage repository — the SQLAlchemy adapter for tree-fetch operations.

Satisfies LineageRepositoryPort. Before item 32a, the CTE-building
logic and the materialization queries lived in `domain/tree_engine.py`,
where they violated the Dependency Rule by importing from `sqlalchemy`
and `db.schema`. This adapter is their proper home.

Four public methods match the Port:
  - fetch_selection(selection, context_ids, *, user_id): typed-DSL path.
    The BaseSelection is dispatched into a single CTE that handles all
    context ids at once; the CTE is joined with card and
    normalized_position; CardNodes are materialized.
  - fetch_lineage(context_id, max_depth, *, user_id): raw subtree path
    used by validation scripts and by future stats work. Single-context.
  - resolve_roots(card_ids, *, user_id): card-tree endpoint. Walks UP
    from each input id to its game-source root, grouping the input by
    root and surfacing unmatched ids explicitly.
  - fetch_tree_by_root(root_card_id, *, user_id, max_nodes): card-tree
    endpoint. Walks DOWN from a verified game-source root, returning
    a structure-only CardTree, with explicit overflow on
    `count > max_nodes`.

The first two funnel into a shared private _materialize helper. The
two card-tree methods do not — their result types are different
(structural-only DTOs, no Card domain entity) so they materialize
directly from CTE rows.

Item 30d: the recursive-descent CTE pattern is extracted into
_recursive_descent_cte. Three callers delegate to it; the card-tree
fetch_tree_by_root makes the fourth.

Item 30c: fetch_selection takes List[int]. Single CTE per pipeline run.

Item 16 (tenancy): both Port methods take *, user_id: UserId. The
helper threads the filter through to both the base case and the
recursive step. The non-recursive variants (ContextSelection,
SiblingSelection) and AncestorSelection's parent-walk apply the same
filter at their respective base predicates. The card-tree extension
follows the same pattern — `_root_walk_cte` filters at base+step,
and `fetch_tree_by_root`'s descent reuses `_recursive_descent_cte`'s
existing belt-and-braces filter. Net effect: no CTE walk can cross
a tenant boundary, regardless of historical card_source data shape.

Dialect-agnostic: uses SQLAlchemy's recursive-CTE primitives and
ANSI-standard IN-list predicates. Same adapter runs on SQLite and
Postgres.

License: Public Domain (The Unlicense)
"""
from typing import List, Optional, assert_never

from sqlalchemy import and_, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import ColumnElement, CTE, Select

from db.schema import card, card_source, card_tag, normalized_position, tag
from domain.auth import UserId
from domain.card import Card
from domain.errors import (
    CardNotFoundError,
    LineageOverflowError,
    PipelineDSLError,
)
from domain.lineage import CardTree, RootGroup, RootResolution, RootedTree
from domain.pipeline_dsl import (
    AncestorSelection,
    BaseSelection,
    ContextSelection,
    DescendantSelection,
    IntersectSelection,
    SiblingSelection,
    SubtreeSelection,
    UnionSelection,
)
from domain.tree_engine import CardNode


class LineageRepository:
    """
    SQLAlchemy implementation of LineageRepositoryPort.

    Holds a single AsyncSession; does not commit or manage
    transactions. All queries run in whatever transaction the caller
    has established.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

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

        BaseSelection (not Selection) is the only valid input —
        FilterSelection is peeled off upstream by the executor.

        Item 16 (tenancy): the user_id flows through _build_selection_cte
        to every CTE variant. A descent that would have crossed a
        tenant boundary in pre-16 code (from a user's own root into a
        descendant owned by a different tenant — possible only with
        historical data; item 14 prevents new such crossings) returns
        no rows for the cross-tenant portion.

        Empty context_ids returns an empty list without hitting the
        database.
        """
        if not context_ids:
            return []
        cte = _build_selection_cte(selection, context_ids, user_id=user_id)
        return await self._materialize(cte)

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

        Item 16 (tenancy): if context_id is owned by a different
        tenant, the base case returns no rows and the result is empty.
        """
        cte = _recursive_descent_cte(
            base_predicate=card_source.c.card_id == context_id,
            base_depth=0,
            max_depth=max_depth,
            name="lineage",
            user_id=user_id,
        )
        return await self._materialize(cte)

    async def resolve_roots(
        self,
        card_ids: List[int],
        *,
        user_id: UserId,
    ) -> RootResolution:
        """
        Walk upward from each input card id to its game-source root,
        grouping the input by root and surfacing input ids that don't
        resolve (cards not owned by the caller or not in the database)
        in `unmatched_card_ids`.

        Card-tree (release-scope item 3): seventh tenant-scoped read
        path. The CTE is built by `_root_walk_cte`, which applies the
        `user_id` filter at both the base case and the recursive step
        per the defense-in-depth pattern documented in
        `docs/notes/tenancy.md`.

        Empty input short-circuits — no CTE constructed, no
        round-trip to the database.

        Output ordering: `roots` is in the order each root was first
        encountered (i.e. the order of the first input id resolving to
        it); `card_ids_in_tree` within each group is in input-list
        order. Neither is part of the wire contract — the spec leaves
        ordering to the adapter — but the deterministic shape makes
        tests easier to write and keeps the response stable across
        repeated calls.
        """
        if not card_ids:
            return RootResolution(roots=[], unmatched_card_ids=[])

        walk = _root_walk_cte(card_ids, user_id=user_id)
        terminal_query = (
            select(
                walk.c.input_card_id,
                walk.c.current_card_id,
                walk.c.terminal_game_source_id,
            )
            .where(walk.c.terminal_game_source_id.is_not(None))
        )
        rows = (await self.session.execute(terminal_query)).fetchall()

        # Group by (root_card_id, game_source_id).
        groups: dict[tuple[int, int], list[int]] = {}
        order_seen: list[tuple[int, int]] = []
        matched: set[int] = set()

        # Pre-index rows by input_card_id so we can iterate in input
        # order — `card_ids` is the deterministic source of truth, not
        # the row order from SQLite (which is engine-implementation-
        # defined for a UNION ALL recursive CTE without ORDER BY).
        terminal_by_input: dict[int, tuple[int, int]] = {}
        for row in rows:
            terminal_by_input.setdefault(
                row.input_card_id,
                (row.current_card_id, row.terminal_game_source_id),
            )

        for cid in card_ids:
            term = terminal_by_input.get(cid)
            if term is None:
                continue
            root_id, gs_id = term
            key = (root_id, gs_id)
            if key not in groups:
                groups[key] = []
                order_seen.append(key)
            groups[key].append(cid)
            matched.add(cid)

        roots = [
            RootGroup(
                root_card_id=root_id,
                game_source_id=gs_id,
                card_ids_in_tree=groups[(root_id, gs_id)],
            )
            for (root_id, gs_id) in order_seen
        ]
        unmatched = [cid for cid in card_ids if cid not in matched]

        return RootResolution(roots=roots, unmatched_card_ids=unmatched)

    async def fetch_tree_by_root(
        self,
        root_card_id: int,
        *,
        user_id: UserId,
        max_nodes: int = 10000,
    ) -> RootedTree:
        """
        Walk downward from a verified game-source root, returning a
        `RootedTree` (the recursive `CardTree` plus the per-root
        context — `root_card_id` and `game_source_id`) restricted to
        cards owned by `user_id`.

        Card-tree (release-scope item 3): eighth tenant-scoped read
        path.

        Three failure modes:
          - root not owned / not exists / not actually a root →
            CardNotFoundError. The route maps to 404; the
            single-resource 404-not-403 collapse from item 13 applies.
          - tree exceeds `max_nodes` → LineageOverflowError with
            the exact `actual_size`. Per ADR-0002, no post-hoc
            truncation: the caller raises the cap or asks a
            different question.
          - happy path: tree of `<= max_nodes` nodes, returned as a
            RootedTree.

        Implementation:
          1. A small SELECT verifies the root: owned by user_id,
             present in card_source, with `game_source_id IS NOT NULL`
             (i.e. genuinely a game-source root, not a mid-chain
             card). The verification's row carries the
             `game_source_id` we need for the wire response, so the
             second projection is a free byproduct.
          2. The descent CTE reuses `_recursive_descent_cte`, which
             already applies the `user_id` filter at base+step and
             returns `(card_id, card_source_id, depth)` rows.
          3. A bounded SELECT with `LIMIT max_nodes + 1` materializes
             the tree. If the limit is hit, a follow-up COUNT on the
             same CTE produces the exact `actual_size` for the 422
             body. The single happy-path query path is the common
             case; the second query only fires on overflow.
          4. Tree assembly is iterative post-order so a deep chain
             (worst case: a `max_nodes`-long linear tree) doesn't
             exhaust Python's recursion limit.
        """
        # Step 1: verify the root and capture its game_source_id.
        root_check = (
            select(card_source.c.game_source_id)
            .select_from(
                card_source.join(card, card_source.c.card_id == card.c.id)
            )
            .where(card_source.c.card_id == root_card_id)
            .where(card.c.user_id == user_id)
            .where(card_source.c.game_source_id.is_not(None))
        )
        root_row = (await self.session.execute(root_check)).fetchone()
        if root_row is None:
            raise CardNotFoundError(
                f"root card {root_card_id} not found for this user"
            )
        game_source_id = int(root_row.game_source_id)

        # Step 2: build the descent CTE.
        descent = _recursive_descent_cte(
            base_predicate=card_source.c.card_id == root_card_id,
            base_depth=0,
            user_id=user_id,
        )

        # Step 3: bounded materialization.
        bounded = (
            select(descent.c.card_id, descent.c.card_source_id)
            .limit(max_nodes + 1)
        )
        rows = list((await self.session.execute(bounded)).fetchall())

        if len(rows) > max_nodes:
            count_q = select(func.count()).select_from(descent)
            actual = int((await self.session.execute(count_q)).scalar() or 0)
            raise LineageOverflowError(
                actual_size=actual, max_nodes=max_nodes
            )

        # Step 4: assemble the tree iteratively (post-order).
        children_map: dict[int, list[int]] = {row.card_id: [] for row in rows}
        for row in rows:
            parent = row.card_source_id
            if parent is not None and parent in children_map:
                children_map[parent].append(row.card_id)

        built: dict[int, CardTree] = {}
        # Two-phase iterative post-order: push (id, processed) pairs.
        stack: list[tuple[int, bool]] = [(root_card_id, False)]
        while stack:
            node_id, processed = stack.pop()
            if processed:
                built[node_id] = CardTree(
                    id=node_id,
                    children=[built[c] for c in children_map[node_id]],
                )
            else:
                stack.append((node_id, True))
                for child_id in children_map[node_id]:
                    stack.append((child_id, False))

        return RootedTree(
            root_card_id=root_card_id,
            game_source_id=game_source_id,
            tree=built[root_card_id],
        )

    async def _materialize(self, cte: CTE) -> List[CardNode]:
        """
        Shared join-and-construct logic: given a CTE whose rows have
        columns (card_id, card_source_id, depth), join with the card
        table and normalized_position, then construct CardNodes over
        typed Card domain entities.

        card_source_id comes from the CTE (representing the parent-
        in-this-selection, not necessarily the universal parent) and
        is written to Card.card_source_id.

        Item 16 side note: this method does NOT re-apply a user_id
        filter on the join with `card`. The CTE has already restricted
        to the user's cards via _recursive_descent_cte (and the other
        selection variants). Re-filtering here would be redundant and
        would also fight the LEFT-OUTER-JOIN-style semantics of
        AncestorSelection (which legitimately produces NULL ancestor
        rows when a context has no n-th ancestor).

        Item 30c side note: when multiple contexts in a pipeline share
        descendants, this method may materialize the same card id
        multiple times. The pipeline executor dedups in Python.

        Card-metadata inline-edit arc 1 (2026-05-13): after the main
        JOIN materialises the rows, a single batched
        `card_tag ⋈ tag WHERE card_id IN (:ids)` fetches tag names
        for the set of distinct card ids and groups them in Python.
        Single round-trip regardless of result-set size; tag list
        bounded by typical per-card tag count (small constant).
        Alphabetical order per card keeps the wire shape
        deterministic.
        """
        query = (
            select(
                card,
                cte.c.card_source_id,
                cte.c.depth,
                normalized_position.c.canonical_content,
            )
            .join(cte, card.c.id == cte.c.card_id)
            .join(
                normalized_position,
                card.c.normalized_position_id == normalized_position.c.id,
            )
        )
        res = await self.session.execute(query)
        rows = res.fetchall()

        # Batched tag enrichment. Distinct card ids → IN-set → group
        # in Python by card_id. Bypassed entirely when the materialise
        # produces no rows (AncestorSelection-with-no-match, empty
        # subtree, etc.).
        distinct_card_ids = {row._asdict()["id"] for row in rows}
        tags_by_card: dict[int, List[str]] = {
            cid: [] for cid in distinct_card_ids
        }
        if distinct_card_ids:
            tag_rows = (await self.session.execute(
                select(card_tag.c.card_id, tag.c.name)
                .select_from(
                    card_tag.join(tag, card_tag.c.tag_id == tag.c.id)
                )
                .where(card_tag.c.card_id.in_(distinct_card_ids))
                .order_by(card_tag.c.card_id, tag.c.name)
            )).fetchall()
            for tr in tag_rows:
                tags_by_card[tr.card_id].append(tr.name)

        nodes: List[CardNode] = []
        for row in rows:
            row_dict = row._asdict()
            depth = row_dict.pop("depth")
            row_dict["tags"] = tags_by_card.get(row_dict["id"], [])
            card_entity = Card.model_validate(row_dict)
            nodes.append(CardNode(card=card_entity, depth=depth))

        return nodes


# =====================================================================
# CTE construction helpers (private to this module).
# =====================================================================


def _recursive_descent_cte(
    *,
    base_predicate: ColumnElement,
    base_depth: int,
    user_id: UserId,
    max_depth: Optional[int] = None,
    name: Optional[str] = None,
) -> CTE:
    """
    Build the standard recursive descent CTE: starting from rows in
    card_source matching `base_predicate` AND owned by `user_id`,
    recursively descend the parent→child relation, collecting
    (card_id, card_source_id, depth) triples for cards owned by
    `user_id`.

    Item 30d: extracted from three places that previously inlined this
    skeleton (DescendantSelection, SubtreeSelection, fetch_lineage).

    Item 16 (tenancy): user_id is now a required parameter. The base
    case joins card_source ⋈ card and filters on card.user_id; the
    recursive step does the same for the descendant card. Two filter
    points are belt-and-braces: with item 14 active, descendants
    automatically share their parent's tenant, but historical data
    may already have a cross-tenant lineage somewhere; the step
    filter prevents such data from leaking into a user's results.

    Subtle point on the depth bound: callers want "include rows up to
    and including depth max_depth." The recursion stops generating new
    rows when `base.depth + 1 > max_depth`. The condition
    `base.depth < max_depth` in the step's WHERE preserves rows up to
    depth max_depth in the output.

    Naming: an explicit `name` is forwarded to .cte() when the caller
    wants a stable CTE name in the generated SQL.
    """
    # Base case: card_source ⋈ card (descendant card), filtered by
    # base_predicate AND user_id.
    base_query: Select = (
        select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            literal_column(str(base_depth)).label("depth"),
        )
        .select_from(
            card_source.join(card, card_source.c.card_id == card.c.id)
        )
        .where(base_predicate)
        .where(card.c.user_id == user_id)  # Item 16: tenancy filter.
    )

    base = (
        base_query.cte(recursive=True, name=name)
        if name is not None
        else base_query.cte(recursive=True)
    )

    # Recursive step: card_source ⋈ card (descendant card), join base
    # on parent pointer, filter descendant by user_id.
    cs_card = card.alias("cs_card")
    step: Select = (
        select(
            card_source.c.card_id,
            card_source.c.card_source_id,
            (base.c.depth + 1).label("depth"),
        )
        .select_from(
            card_source
            .join(base, card_source.c.card_source_id == base.c.card_id)
            .join(cs_card, card_source.c.card_id == cs_card.c.id)
        )
        .where(cs_card.c.user_id == user_id)  # Item 16: belt-and-braces.
    )

    if max_depth is not None:
        step = step.where(base.c.depth < max_depth)

    return base.union_all(step)


def _build_selection_cte(
    cfg: BaseSelection,
    context_ids: List[int],
    *,
    user_id: UserId,
) -> CTE:
    """
    Build a recursive-CTE expression for the given typed selection
    over a list of context ids, restricted to cards owned by user_id.

    Item 30c: takes List[int]. Item 16 (tenancy): takes user_id.

    Each variant generalizes its base predicate from `== context_id` to
    `.in_(context_ids)`, and adds a user_id filter in the appropriate
    place. The descend-from-roots variants delegate to
    _recursive_descent_cte (which applies the filter at base+step);
    the non-recursive variants and AncestorSelection's parent-walk
    apply the filter directly.

    Caller responsibility: context_ids is non-empty. fetch_selection
    short-circuits empty input before calling this; direct callers
    must do the same.
    """
    if isinstance(cfg, ContextSelection):
        # The context nodes themselves, depth 0. Filter on user_id by
        # joining card_source ⋈ card.
        return (
            select(
                card_source.c.card_id,
                card_source.c.card_source_id,
                literal_column("0").label("depth"),
            )
            .select_from(
                card_source.join(card, card_source.c.card_id == card.c.id)
            )
            .where(card_source.c.card_id.in_(context_ids))
            .where(card.c.user_id == user_id)  # Item 16: tenancy filter.
            .cte()
        )

    if isinstance(cfg, DescendantSelection):
        # Descend from immediate children of any context.
        return _recursive_descent_cte(
            base_predicate=card_source.c.card_source_id.in_(context_ids),
            base_depth=1,
            max_depth=cfg.max_depth,
            user_id=user_id,
        )

    if isinstance(cfg, AncestorSelection):
        # Parent-walk: opposite of recursive descent. Single call site
        # (called internally by SubtreeSelection); not extracted into
        # a helper.
        #
        # Item 16 (tenancy): apply the user_id filter at both the base
        # case (the starting context must belong to the user) and the
        # recursive step (the parent ancestor must also belong to the
        # user). Same belt-and-braces pattern as _recursive_descent_cte.
        #
        # Each row represents "I am at card X, my parent is Y, I have
        # walked S steps." n=0 returns the context itself; n=1 returns
        # the parent; n=2 returns the grandparent; and so on.
        n = cfg.n
        base = (
            select(
                card_source.c.card_id,
                card_source.c.card_source_id,
                literal_column("0").label("steps"),
            )
            .select_from(
                card_source.join(card, card_source.c.card_id == card.c.id)
            )
            .where(card_source.c.card_id.in_(context_ids))
            .where(card.c.user_id == user_id)  # Item 16: tenancy filter.
            .cte(recursive=True)
        )

        # The recursive step climbs one level to the parent. For each
        # base row at depth S, find the card_source row whose
        # `card_id` equals base's `card_source_id` (the parent's
        # card_source row). The new row records `card_id = parent`,
        # `card_source_id = parent's parent`, `steps = S + 1`. Filter
        # the parent on user_id via the join to card.
        anc_card = card.alias("anc_card")
        step = (
            select(
                card_source.c.card_id,
                card_source.c.card_source_id,
                (base.c.steps + 1).label("steps"),
            )
            .select_from(
                card_source
                .join(base, card_source.c.card_id == base.c.card_source_id)
                .join(anc_card, card_source.c.card_id == anc_card.c.id)
            )
            .where(base.c.steps < n)
            .where(anc_card.c.user_id == user_id)  # Item 16: belt-and-braces.
        )
        anc_cte = base.union_all(step)
        return (
            select(
                anc_cte.c.card_id,
                literal_column("NULL").label("card_source_id"),
                literal_column(str(-n)).label("depth"),
            )
            .where(anc_cte.c.steps == n)
            .cte()
        )

    if isinstance(cfg, SiblingSelection):
        # Self-join card_source on shared parent. Item 16: filter the
        # sibling card by user_id via a card join.
        cs_ctx = card_source.alias("cs_ctx")
        cs_card = card.alias("sib_card")
        return (
            select(
                card_source.c.card_id,
                card_source.c.card_source_id,
                literal_column("0").label("depth"),
            )
            .select_from(
                card_source
                .join(
                    cs_ctx,
                    card_source.c.card_source_id == cs_ctx.c.card_source_id,
                )
                .join(cs_card, card_source.c.card_id == cs_card.c.id)
            )
            .where(
                and_(
                    cs_ctx.c.card_id.in_(context_ids),
                    card_source.c.card_id.not_in(context_ids),
                    cs_card.c.user_id == user_id,  # Item 16: tenancy filter.
                )
            )
            .cte()
        )

    if isinstance(cfg, SubtreeSelection):
        # Descend from the n-th-ancestor root(s) of each context.
        # Item 16: the n=0 root_query filters on user_id directly; the
        # n>0 case threads user_id through the internal AncestorSelection
        # recursion, which applies its own filter. Either way, the
        # final _recursive_descent_cte applies the filter again at its
        # base+step.
        n = cfg.n
        m = cfg.m

        if n == 0:
            root_query = (
                select(card_source.c.card_id)
                .select_from(
                    card_source.join(card, card_source.c.card_id == card.c.id)
                )
                .where(card_source.c.card_id.in_(context_ids))
                .where(card.c.user_id == user_id)  # Item 16: tenancy filter.
            )
        else:
            # Internal recursion with a typed AncestorSelection.
            anc = _build_selection_cte(
                AncestorSelection(n=n), context_ids, user_id=user_id
            )
            root_query = select(anc.c.card_id)

        return _recursive_descent_cte(
            base_predicate=card_source.c.card_id.in_(root_query),
            base_depth=0,
            max_depth=m,
            user_id=user_id,
        )

    if isinstance(cfg, UnionSelection):
        cte_a = _build_selection_cte(cfg.a, context_ids, user_id=user_id)
        cte_b = _build_selection_cte(cfg.b, context_ids, user_id=user_id)
        return select(cte_a).union_all(select(cte_b)).cte()

    if isinstance(cfg, IntersectSelection):
        cte_a = _build_selection_cte(cfg.a, context_ids, user_id=user_id)
        cte_b = _build_selection_cte(cfg.b, context_ids, user_id=user_id)
        return (
            select(cte_a).join(cte_b, cte_a.c.card_id == cte_b.c.card_id).cte()
        )

    # Every BaseSelection variant is handled above. assert_never both
    # tells mypy the branch is unreachable and raises AssertionError
    # at runtime if a new variant is ever added to the Union without
    # being handled here.
    assert_never(cfg)


def _root_walk_cte(
    card_ids: List[int],
    *,
    user_id: UserId,
) -> CTE:
    """
    Recursive CTE that walks UPWARD from each input card id toward
    its game-source root, restricted to cards owned by `user_id`.

    Result columns:
      - input_card_id: the original card id this row's walk started at
      - current_card_id: the card whose card_source row we're looking at
      - parent_card_id: the parent pointer (NULL at game-source roots)
      - terminal_game_source_id: the game_source_id on the current row
        (NOT NULL only on terminal rows — i.e. when current_card_id
        is itself a game-source root)

    Caller selects rows where `terminal_game_source_id IS NOT NULL`
    to identify, for each input id, the root and game_source it
    descends from.

    Card-tree (release-scope item 3): used by `resolve_roots`. The
    recursive step fires only when the current row is non-terminal
    (`game_source_id IS NULL`) and the parent's `card_source` row is
    owned by the user — the same defense-in-depth pattern as
    `_recursive_descent_cte`'s downward walk.

    Caller responsibility: `card_ids` is non-empty. `resolve_roots`
    short-circuits empty input upstream.
    """
    base = (
        select(
            card_source.c.card_id.label("input_card_id"),
            card_source.c.card_id.label("current_card_id"),
            card_source.c.card_source_id.label("parent_card_id"),
            card_source.c.game_source_id.label("terminal_game_source_id"),
        )
        .select_from(
            card_source.join(card, card_source.c.card_id == card.c.id)
        )
        .where(card_source.c.card_id.in_(card_ids))
        .where(card.c.user_id == user_id)  # Tenancy: base case filter.
        .cte(recursive=True, name="root_walk")
    )

    parent_cs = card_source.alias("parent_cs")
    parent_card = card.alias("parent_card")
    step = (
        select(
            base.c.input_card_id,
            parent_cs.c.card_id.label("current_card_id"),
            parent_cs.c.card_source_id.label("parent_card_id"),
            parent_cs.c.game_source_id.label("terminal_game_source_id"),
        )
        .select_from(
            base
            .join(parent_cs, base.c.parent_card_id == parent_cs.c.card_id)
            .join(parent_card, parent_cs.c.card_id == parent_card.c.id)
        )
        # Only continue from non-terminal rows.
        .where(base.c.terminal_game_source_id.is_(None))
        # Tenancy: belt-and-braces filter on the parent's owner. With
        # item 14 active, descendants share their parent's tenant for
        # new writes; this filter defends against historical data
        # where a card_source row may bridge two tenants.
        .where(parent_card.c.user_id == user_id)
    )

    return base.union_all(step)
