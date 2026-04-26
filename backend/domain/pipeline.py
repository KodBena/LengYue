"""
Pipeline executor — pure orchestration over two Ports.

Item 32a: the executor no longer holds an AsyncSession and no longer
imports from sqlalchemy or db.schema. It depends on two Ports —
LineageRepositoryPort (for tree fetches) and TagFilterRepositoryPort
(for tag-DSL materialization) — and everything else is pure Python
dispatch and list manipulation.

    python -c "import domain.pipeline; import sys; \
               assert 'sqlalchemy' not in sys.modules"

now passes. The Dependency Rule is mechanically honored.

Compared to the pre-32a executor:

- run() loses its session-level SQL. The for-each-context CTE
  construction + SELECT + fetchall + CardNode construction is now a
  single call: `await self.lineage_repo.fetch_selection(selection,
  cid)`. Collision resolution (first-seen-by-depth wins across
  contexts) stays here because it's a pipeline-level concern, not a
  per-context repository concern.

- run() loses the inline TagDSLCompiler instantiation + execute +
  fetchall. That's now `await self.tag_filter_repo.card_ids_matching(
  tag_expr)` — a single Port call returning Set[int].

- The EbisuRecallKey scorer used to reach into n.data._asdict() and
  reconstruct a Bayesian prior tuple inline. Now it's a one-liner
  delegation to compute_current_recall(n.card, ...).

- The final response loop used to do Card.model_validate(n.data._asdict())
  because CardNode held a raw SQL Row. Now CardNode holds a typed
  Card (constructed by the repository), so the loop is just
  project_card(n.card, ...).

- Selection peeling (top-level filter → base) now narrows from
  Selection to BaseSelection at the type level. The LineageRepositoryPort
  method declares BaseSelection as input, so passing FilterSelection
  is a static type error (and nested filter is unreachable because
  BaseSelection doesn't include it).

Exhaustiveness continues to be enforced via typing.assert_never at
each dispatch's end.
"""
import random
from datetime import datetime, timezone
from typing import List, Optional, assert_never

from domain.auth import UserId
from domain.card import CardWithRecall, compute_current_recall, project_card
from domain.pipeline_dsl import (
    BaseSelection,
    BfsOrder,
    CentroidOrder,
    CentroidRankKey,
    DepthKey,
    DfsPostorder,
    DfsPreorder,
    EbisuRecallKey,
    FilterSelection,
    FringeFirst,
    HeavyPathRankKey,
    HeightKey,
    LexicographicOrder,
    MainLineFirst,
    Negated,
    NumMovesKey,
    NumReviewsKey,
    OrderStage,
    OrderingKey,
    SelectStage,
    ShuffleStage,
    Stage,
    SubtreeSizeKey,
    TakeStage,
    WeightedSumOrder,
)
from domain.tree_engine import CardNode, compute_structural_coords
from repositories.ports import LineageRepositoryPort, TagFilterRepositoryPort


class PipelineExecutor:
    def __init__(
        self,
        lineage_repo: LineageRepositoryPort,
        tag_filter_repo: TagFilterRepositoryPort,
        time_unit: float = 14400.0,
    ):
        """
        Depends on two Ports and one scalar. No session, no config
        reach-in beyond the explicitly-injected time_unit.

        The Ports are declared as Protocols (see repositories/ports.py),
        so tests can pass any object matching the structural interface.
        A FakeLineageRepo holding an in-memory dict and a FakeTagFilter
        holding a pre-computed set-of-matches is ~20 lines and runs
        in microseconds.
        """
        self.lineage_repo = lineage_repo
        self.tag_filter_repo = tag_filter_repo
        self.time_unit = time_unit

    def _build_order_key_fn(self, ordering: OrderingKey, now: datetime):
        """
        Dispatch a typed ordering-key value to a sort-key function
        over CardNode. Recursion handles combinators (negated, lex,
        weighted sum) and presets (which expand into primitive
        compositions).

        After 32a: card-attribute accesses go through `n.card.*`
        (typed Card domain entity) rather than `n.data.*` (raw SQL
        row). The EbisuRecallKey scorer delegates to
        compute_current_recall — the previous inline tz-normalization
        + prior-tuple construction + predict_recall call is now a
        single function call.
        """
        # ---- Primitive keys ----
        if isinstance(ordering, DepthKey):
            return lambda n: n.depth
        if isinstance(ordering, HeightKey):
            return lambda n: n.height
        if isinstance(ordering, SubtreeSizeKey):
            return lambda n: n.subtree_size
        if isinstance(ordering, HeavyPathRankKey):
            return lambda n: n.heavy_path_rank
        if isinstance(ordering, CentroidRankKey):
            return lambda n: n.centroid_rank
        if isinstance(ordering, NumReviewsKey):
            return lambda n: n.card.num_reviews
        if isinstance(ordering, NumMovesKey):
            return lambda n: n.card.num_moves

        if isinstance(ordering, EbisuRecallKey):
            # Item 32a: delegates to compute_current_recall. The
            # defensive `if last else 0.0` branch from the pre-32a
            # scorer was unreachable (Card.creation_date is non-
            # Optional, so last is always a datetime).
            return lambda n: compute_current_recall(
                n.card, now=now, time_unit_seconds=self.time_unit
            )

        # ---- Combinators (recursive) ----
        if isinstance(ordering, Negated):
            inner = self._build_order_key_fn(ordering.key, now)
            return lambda n: -inner(n)

        if isinstance(ordering, LexicographicOrder):
            inners = [self._build_order_key_fn(k, now) for k in ordering.keys]
            return lambda n: tuple(f(n) for f in inners)

        if isinstance(ordering, WeightedSumOrder):
            built = [
                (self._build_order_key_fn(term.key, now), term.weight)
                for term in ordering.terms
            ]
            return lambda n: sum(w * f(n) for f, w in built)

        # ---- Presets (expand into primitive compositions and recurse) ----
        if isinstance(ordering, BfsOrder):
            return self._build_order_key_fn(DepthKey(), now)
        if isinstance(ordering, DfsPreorder):
            return self._build_order_key_fn(HeavyPathRankKey(), now)
        if isinstance(ordering, DfsPostorder):
            return self._build_order_key_fn(
                LexicographicOrder(keys=[HeightKey(), HeavyPathRankKey()]), now,
            )
        if isinstance(ordering, FringeFirst):
            return self._build_order_key_fn(
                LexicographicOrder(keys=[HeightKey(), DepthKey()]), now,
            )
        if isinstance(ordering, CentroidOrder):
            return self._build_order_key_fn(CentroidRankKey(), now)
        if isinstance(ordering, MainLineFirst):
            return self._build_order_key_fn(
                LexicographicOrder(keys=[HeavyPathRankKey(), NumReviewsKey()]),
                now,
            )

        assert_never(ordering)

    async def run(
        self,
        context_ids: List[int],
        pipeline: List[Stage],
        *,
        user_id: UserId,
    ) -> List[CardWithRecall]:
        """
        Executes a typed pipeline against the given context ids,
        restricted to cards owned by `user_id`.

        Pydantic has already validated (via ForestQuery's
        @model_validator) that:
          - pipeline is non-empty
          - pipeline[0] is a SelectStage
          - no other pipeline[i] is a SelectStage

        This method therefore needs no defensive structural checks —
        it dispatches over typed values and calls Ports.

        Item 25 (tenancy): user_id is keyword-only. It threads through
        to both Port call sites — the lineage CTE materialization and
        the optional tag-filter materialization — completing the
        tenancy spine for the /forests/query endpoint. Items 13–16
        prepared the Ports; this method's signature change is the
        last domino.

        For ALLOW_PASSWORDLESS_LOGIN=True installs, behavior is
        unchanged: every request still produces user_id=1, so every
        Port call still scopes to the same data. The change matters
        only for multi-tenant installs.
        """
        # pipeline[0] is guaranteed to be a SelectStage by ForestQuery's
        # validator. The runtime assert documents the invariant and
        # lets a static checker narrow the type for downstream access.
        select_stage = pipeline[0]
        assert isinstance(select_stage, SelectStage)

        # Peel off the top-level filter if present. After the 32a
        # Selection split, `selection.base` is typed as BaseSelection,
        # which is exactly what LineageRepositoryPort.fetch_selection
        # accepts. The type system carries the "filter is top-level-
        # only" invariant — nested filter is now a parse error, not
        # a runtime guard.
        selection: BaseSelection
        tag_expr: Optional[str] = None
        if isinstance(select_stage.selection, FilterSelection):
            tag_expr = select_stage.selection.tag_expression
            selection = select_stage.selection.base
        else:
            # select_stage.selection is Selection minus FilterSelection,
            # which is structurally BaseSelection.
            selection = select_stage.selection  # type: ignore[assignment]

        # Build the pool via the lineage Port. Item 30c: a single call
        # covering all context ids. The repository executes one CTE;
        # the per-context loop that lived here pre-30c is gone.
        # First-seen-by-depth dedup remains in Python — the
        # repository may return the same card id multiple times (once
        # per context-rooted CTE branch that reached it), and the
        # collision policy ("smallest depth wins") is a pipeline-level
        # decision, not a persistence-boundary one.
        nodes = await self.lineage_repo.fetch_selection(
            selection, context_ids, user_id=user_id
        )
        pool_map: dict[int, CardNode] = {}
        for node in nodes:
            if node.id not in pool_map or node.depth < pool_map[node.id].depth:
                pool_map[node.id] = node

        pool = list(pool_map.values())

        # Apply tag filter via Port if present.
        if tag_expr is not None:
            valid_ids = await self.tag_filter_repo.card_ids_matching(
                tag_expr, user_id=user_id
            )
            pool = [n for n in pool if n.id in valid_ids]

        compute_structural_coords(pool)

        now = datetime.now(timezone.utc)

        # Initial sort.
        order_fn = self._build_order_key_fn(select_stage.ordering, now)
        pool.sort(key=order_fn)

        # Subsequent stages.
        for stage in pipeline[1:]:
            if isinstance(stage, TakeStage):
                pool = pool[: stage.n]
            elif isinstance(stage, ShuffleStage):
                random.shuffle(pool)
            elif isinstance(stage, OrderStage):
                order_fn = self._build_order_key_fn(stage.ordering, now)
                pool.sort(key=order_fn)
            elif isinstance(stage, SelectStage):
                # Forbidden by ForestQuery's validator; unreachable at
                # runtime. assert_never flags it if the validator is
                # ever weakened.
                assert_never(stage)
            else:
                assert_never(stage)

        # Response construction: project each CardNode's typed Card.
        # No Pydantic re-validation, no row._asdict() — the domain
        # entity already exists.
        return [
            project_card(n.card, now=now, time_unit_seconds=self.time_unit)
            for n in pool
        ]
