"""
Lineage repository — the SQLAlchemy adapter for tree-fetch operations.

Satisfies LineageRepositoryPort. Before item 32a, the CTE-building
logic and the materialization queries lived in `domain/tree_engine.py`,
where they violated the Dependency Rule by importing from `sqlalchemy`
and `db.schema`. This adapter is their proper home.

Two public methods match the Port:
  - fetch_selection(selection, context_ids, *, user_id): typed-DSL path.
    The BaseSelection is dispatched into a single CTE that handles all
    context ids at once; the CTE is joined with card and
    normalized_position; CardNodes are materialized.
  - fetch_lineage(context_id, max_depth, *, user_id): raw subtree path
    used by validation scripts and by future stats work. Single-context.

Both methods funnel into a shared private _materialize helper.

Item 30d: the recursive-descent CTE pattern is extracted into
_recursive_descent_cte. Three callers delegate to it.

Item 30c: fetch_selection takes List[int]. Single CTE per pipeline run.

Item 16 (tenancy): both Port methods take *, user_id: UserId. The
helper threads the filter through to both the base case and the
recursive step. The non-recursive variants (ContextSelection,
SiblingSelection) and AncestorSelection's parent-walk apply the same
filter at their respective base predicates. Net effect: no CTE walk
can cross a tenant boundary, regardless of historical card_source
data shape.

Dialect-agnostic: uses SQLAlchemy's recursive-CTE primitives and
ANSI-standard IN-list predicates. Same adapter runs on SQLite and
Postgres.
"""
from typing import List, Optional, assert_never

from sqlalchemy import and_, column, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import ColumnElement, CTE, Select

from db.schema import card, card_source, normalized_position
from domain.auth import UserId
from domain.card import Card
from domain.errors import PipelineDSLError
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

        nodes: List[CardNode] = []
        for row in res.fetchall():
            row_dict = row._asdict()
            depth = row_dict.pop("depth")
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

        # The recursive step climbs to the parent. card_source.c.card_id
        # in this row is the parent card (the one whose card_source_id
        # the previous level pointed at). Filter that parent on user_id
        # via a join to card.
        anc_card = card.alias("anc_card")
        step = (
            select(
                card_source.c.card_source_id.label("card_id"),
                literal_column("NULL").label("card_source_id"),
                (base.c.steps + 1).label("steps"),
            )
            .select_from(
                card_source
                .join(base, card_source.c.card_id == base.c.card_source_id)
                .join(anc_card, card_source.c.card_source_id == anc_card.c.id)
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
                    card_source.alias("cs_ctx"),
                    card_source.c.card_source_id
                    == column("cs_ctx").c.card_source_id,
                )
                .join(cs_card, card_source.c.card_id == cs_card.c.id)
            )
            .where(
                and_(
                    column("cs_ctx").c.card_id.in_(context_ids),
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
