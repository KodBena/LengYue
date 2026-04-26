"""
Typed pipeline DSL — Pydantic discriminated unions for the forest-query grammar.

Item 31: replaced the Dict[str, Any] pipeline representation with
typed Pydantic models.

Item 32a (this pass): splits the Selection grammar into two layered
unions:

    BaseSelection = ContextSelection | DescendantSelection | AncestorSelection
                  | SiblingSelection | SubtreeSelection
                  | UnionSelection   | IntersectSelection

    Selection     = BaseSelection | FilterSelection

Every combinator that takes nested selections — UnionSelection.a/b,
IntersectSelection.a/b, FilterSelection.base — now declares its
sub-selections as BaseSelection, not Selection. This encodes the
"filter only at top level" rule in the type system itself: a
nested-filter JSON body is now a Pydantic ValidationError at parse
time, not a runtime PipelineDSLError raised by build_selection_cte.

SelectStage.selection remains typed as Selection (filter may appear
at the top). PipelineExecutor peels off FilterSelection there and
passes the typed BaseSelection down to LineageRepositoryPort —
whose method signature declares BaseSelection as the input, closing
the loop: the type system now carries the invariant end-to-end.

Grammar overview (wire format unchanged):

    Stage = SelectStage | TakeStage | ShuffleStage | OrderStage
    (discriminated by "stage")

    Selection = BaseSelection | FilterSelection
    BaseSelection = ContextSelection | DescendantSelection | ...
    (both discriminated by "type")

    OrderingKey = [17 variants — 8 primitives + 3 combinators + 6 presets]
    (discriminated by "type")

Structural rule (first stage must be 'select', no subsequent select
stages): enforced by @model_validator on ForestQuery at parse time.
"""
from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


class _DslBase(BaseModel):
    """
    Shared config for every DSL type.

    frozen=True: DSL values are descriptions, not mutable state.
    extra="forbid": unknown fields are a parse error. Typos like
    {"type": "DepthKey", "dpeth": 1} fail loudly rather than being
    silently accepted.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")


# =====================================================================
# Section 1: Ordering keys
# =====================================================================

# ---- Primitive keys (score a CardNode by one of its attributes) -----


class DepthKey(_DslBase):
    type: Literal["DepthKey"] = "DepthKey"


class HeightKey(_DslBase):
    type: Literal["HeightKey"] = "HeightKey"


class SubtreeSizeKey(_DslBase):
    type: Literal["SubtreeSizeKey"] = "SubtreeSizeKey"


class HeavyPathRankKey(_DslBase):
    type: Literal["HeavyPathRankKey"] = "HeavyPathRankKey"


class CentroidRankKey(_DslBase):
    type: Literal["CentroidRankKey"] = "CentroidRankKey"


class NumReviewsKey(_DslBase):
    type: Literal["NumReviewsKey"] = "NumReviewsKey"


class NumMovesKey(_DslBase):
    type: Literal["NumMovesKey"] = "NumMovesKey"


class EbisuRecallKey(_DslBase):
    type: Literal["EbisuRecallKey"] = "EbisuRecallKey"


# ---- Combinators (recursive) ----------------------------------------


class Negated(_DslBase):
    type: Literal["negated"] = "negated"
    key: "OrderingKey"


class LexicographicOrder(_DslBase):
    type: Literal["LexicographicOrder"] = "LexicographicOrder"
    keys: List["OrderingKey"] = Field(min_length=1)


class WeightedSumTerm(_DslBase):
    """One addend in a WeightedSumOrder. Not a discriminated variant."""
    key: "OrderingKey"
    weight: float


class WeightedSumOrder(_DslBase):
    type: Literal["WeightedSumOrder"] = "WeightedSumOrder"
    terms: List[WeightedSumTerm] = Field(min_length=1)


# ---- Presets (expand into primitive compositions at execution) ------


class BfsOrder(_DslBase):
    """Equivalent to DepthKey."""
    type: Literal["bfs_order"] = "bfs_order"


class DfsPreorder(_DslBase):
    """Equivalent to HeavyPathRankKey."""
    type: Literal["dfs_preorder"] = "dfs_preorder"


class DfsPostorder(_DslBase):
    """Equivalent to LexicographicOrder(keys=[HeightKey, HeavyPathRankKey])."""
    type: Literal["dfs_postorder"] = "dfs_postorder"


class FringeFirst(_DslBase):
    """Equivalent to LexicographicOrder(keys=[HeightKey, DepthKey])."""
    type: Literal["fringe_first"] = "fringe_first"


class CentroidOrder(_DslBase):
    """Equivalent to CentroidRankKey."""
    type: Literal["centroid_order"] = "centroid_order"


class MainLineFirst(_DslBase):
    """Equivalent to LexicographicOrder(keys=[HeavyPathRankKey, NumReviewsKey])."""
    type: Literal["main_line_first"] = "main_line_first"


# ---- The union -------------------------------------------------------

OrderingKey = Annotated[
    Union[
        DepthKey,
        HeightKey,
        SubtreeSizeKey,
        HeavyPathRankKey,
        CentroidRankKey,
        NumReviewsKey,
        NumMovesKey,
        EbisuRecallKey,
        Negated,
        LexicographicOrder,
        WeightedSumOrder,
        BfsOrder,
        DfsPreorder,
        DfsPostorder,
        FringeFirst,
        CentroidOrder,
        MainLineFirst,
    ],
    Field(discriminator="type"),
]


# =====================================================================
# Section 2: Selections (item 32a: two-layer split)
# =====================================================================

# ---- Primitives ------------------------------------------------------


class ContextSelection(_DslBase):
    """Just the context card itself."""
    type: Literal["ContextSelection"] = "ContextSelection"


class DescendantSelection(_DslBase):
    """All cards descended from the context, optionally bounded by depth."""
    type: Literal["DescendantSelection"] = "DescendantSelection"
    max_depth: Optional[int] = Field(default=None, ge=0)


class AncestorSelection(_DslBase):
    """The n-th ancestor of the context card (n=1 means parent)."""
    type: Literal["AncestorSelection"] = "AncestorSelection"
    n: int = Field(default=1, ge=0)


class SiblingSelection(_DslBase):
    """All cards that share a parent with the context (excluding the context)."""
    type: Literal["SiblingSelection"] = "SiblingSelection"


class SubtreeSelection(_DslBase):
    """
    The subtree rooted at the n-th ancestor (n=0 means rooted at the
    context itself), bounded by optional max depth m.
    """
    type: Literal["SubtreeSelection"] = "SubtreeSelection"
    n: int = Field(default=0, ge=0)
    m: Optional[int] = Field(default=None, ge=0)


# ---- Combinators (recursive over BaseSelection — not Selection) ----
# Item 32a: UnionSelection and IntersectSelection no longer accept
# FilterSelection as a sub-expression. Nested filter is a parse-time
# error (Pydantic rejects via discriminator mismatch), not a runtime
# error. The type system now carries the "filter only at top level"
# invariant directly.


class UnionSelection(_DslBase):
    type: Literal["union"] = "union"
    a: "BaseSelection"
    b: "BaseSelection"


class IntersectSelection(_DslBase):
    type: Literal["intersect"] = "intersect"
    a: "BaseSelection"
    b: "BaseSelection"


# ---- The BaseSelection union (no filter) ----------------------------

BaseSelection = Annotated[
    Union[
        ContextSelection,
        DescendantSelection,
        AncestorSelection,
        SiblingSelection,
        SubtreeSelection,
        UnionSelection,
        IntersectSelection,
    ],
    Field(discriminator="type"),
]


# ---- Top-level tag filter (wraps a BaseSelection) -------------------


class FilterSelection(_DslBase):
    """
    Wraps a BaseSelection with a tag-DSL expression. By design,
    `base` is typed as BaseSelection — filter cannot be nested inside
    another filter. This is a parse-time invariant; the previous
    runtime check in build_selection_cte (item 31) is no longer
    reachable for well-typed input.
    """
    type: Literal["filter"] = "filter"
    tag_expression: str = Field(min_length=1)
    base: BaseSelection


# ---- The full Selection union (BaseSelection + FilterSelection) -----

Selection = Annotated[
    Union[
        ContextSelection,
        DescendantSelection,
        AncestorSelection,
        SiblingSelection,
        SubtreeSelection,
        UnionSelection,
        IntersectSelection,
        FilterSelection,
    ],
    Field(discriminator="type"),
]


# =====================================================================
# Section 3: Pipeline stages
# =====================================================================


class SelectStage(_DslBase):
    """
    The first and only source stage. Produces the initial pool from
    the given selection, ordered by the given key (default: DepthKey).
    """
    stage: Literal["select"] = "select"
    selection: Selection  # may be FilterSelection at the top level
    ordering: OrderingKey = Field(default_factory=DepthKey)


class TakeStage(_DslBase):
    """Truncate the pool to at most n items."""
    stage: Literal["take"] = "take"
    n: int = Field(ge=0)


class ShuffleStage(_DslBase):
    """Randomize the pool's order in place."""
    stage: Literal["shuffle"] = "shuffle"


class OrderStage(_DslBase):
    """Re-sort the pool by the given key."""
    stage: Literal["order"] = "order"
    ordering: OrderingKey


Stage = Annotated[
    Union[SelectStage, TakeStage, ShuffleStage, OrderStage],
    Field(discriminator="stage"),
]


# =====================================================================
# Section 4: Query root
# =====================================================================


class ForestQuery(_DslBase):
    """
    The wire-level request body for POST /forests/query.

    Structural invariants enforced by a model_validator:
      1. First stage must be 'select'.
      2. No subsequent stage may be 'select'.

    Field-level validation (each variant's fields, each numeric bound,
    each discriminator value) is handled by Pydantic's discriminated-
    union machinery. The recently-added nested-filter rule (32a) is
    enforced by BaseSelection's absence of FilterSelection — no runtime
    check needed.
    """
    context_ids: List[int] = Field(min_length=1)
    pipeline: List[Stage] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_structure(self) -> "ForestQuery":
        head = self.pipeline[0]
        if not isinstance(head, SelectStage):
            raise ValueError(
                f"First pipeline stage must be 'select'; got stage "
                f"{head.stage!r}."
            )
        for i, stage in enumerate(self.pipeline[1:], start=1):
            if isinstance(stage, SelectStage):
                raise ValueError(
                    f"Pipeline stage {i} is a second 'select' stage; "
                    f"only the first stage may be 'select'."
                )
        return self


# =====================================================================
# Forward-reference resolution
# =====================================================================
# Pydantic v2 needs explicit rebuild for classes whose annotations
# reference type aliases defined later in the module. After the 32a
# split, FilterSelection references BaseSelection (defined above it)
# and Union/IntersectSelection reference BaseSelection (also defined
# below them — hence the string forward ref). Calling model_rebuild()
# eagerly at import avoids rebuild-during-validation surprises.
# =====================================================================
Negated.model_rebuild()
LexicographicOrder.model_rebuild()
WeightedSumTerm.model_rebuild()
WeightedSumOrder.model_rebuild()
UnionSelection.model_rebuild()
IntersectSelection.model_rebuild()
FilterSelection.model_rebuild()
SelectStage.model_rebuild()
ForestQuery.model_rebuild()


# =====================================================================
# Public TypeAdapter for callers that need to validate a standalone
# pipeline list outside a ForestQuery wrapper.
# =====================================================================
pipeline_adapter: TypeAdapter = TypeAdapter(List[Stage])
