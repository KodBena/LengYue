"""
tests/unit/domain/test_pipeline_dsl.py

Pure-Pydantic tests for ``domain/pipeline_dsl.py`` — the typed
forest-query grammar.

The DSL has two layers of validation: (1) discriminated-union
dispatch on the ``type`` / ``stage`` fields rejects unknown tags,
malformed shapes, and ``extra`` keys at parse time; (2) the
``ForestQuery.validate_structure`` model_validator enforces the
"first stage is select, no other stage is select" structural rule.

The route-layer test ``test_forests_routes.py`` pins the wire
boundary; this file pins the parser itself, exhaustively across
every grammar branch the wire test only samples.

Verified:

  - Stage discriminator: every concrete Stage variant round-trips
    through ``Stage`` validation; an unknown ``stage`` tag is a
    parse error.
  - Selection discriminator: every BaseSelection variant round-
    trips through ``Selection``; ``FilterSelection`` is allowed at
    the top of ``Selection``.
  - The 32a invariant ("filter only at top level"): a nested
    ``filter`` inside a ``union`` / ``intersect`` / ``filter`` is a
    parse-time discriminator failure.
  - ``OrderingKey``: every primitive / combinator / preset round-
    trips through the union.
  - ``ForestQuery.validate_structure`` rejects pipelines whose
    first stage is not ``select`` and pipelines that contain a
    second ``select`` stage.
  - ``ForestQuery`` rejects empty ``context_ids`` and empty
    ``pipeline``.
  - ``extra="forbid"`` fires on stray keys (``_DslBase`` shared
    config).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError

from domain.pipeline_dsl import (
    AncestorSelection,
    BfsOrder,
    CentroidOrder,
    CentroidRankKey,
    ContextSelection,
    DepthKey,
    DescendantSelection,
    DfsPostorder,
    DfsPreorder,
    EbisuRecallKey,
    FilterSelection,
    ForestQuery,
    FringeFirst,
    HeavyPathRankKey,
    HeightKey,
    IntersectSelection,
    LexicographicOrder,
    MainLineFirst,
    Negated,
    NumMovesKey,
    NumReviewsKey,
    OrderStage,
    OrderingKey,
    SelectStage,
    Selection,
    ShuffleStage,
    SiblingSelection,
    Stage,
    SubtreeSelection,
    SubtreeSizeKey,
    TakeStage,
    UnionSelection,
    WeightedSumOrder,
    WeightedSumTerm,
    pipeline_adapter,
)

pytestmark = pytest.mark.unit


_stage_adapter: TypeAdapter = TypeAdapter(Stage)
_selection_adapter: TypeAdapter = TypeAdapter(Selection)
_ordering_adapter: TypeAdapter = TypeAdapter(OrderingKey)


# ─── Stage discriminator ──────────────────────────────────────────────────────


def test_select_stage_round_trips():
    stage = _stage_adapter.validate_python({
        "stage": "select",
        "selection": {"type": "DescendantSelection"},
        "ordering": {"type": "DepthKey"},
    })
    assert isinstance(stage, SelectStage)


def test_take_stage_round_trips():
    stage = _stage_adapter.validate_python({"stage": "take", "n": 10})
    assert isinstance(stage, TakeStage)
    assert stage.n == 10


def test_shuffle_stage_round_trips():
    stage = _stage_adapter.validate_python({"stage": "shuffle"})
    assert isinstance(stage, ShuffleStage)


def test_order_stage_round_trips():
    stage = _stage_adapter.validate_python({
        "stage": "order",
        "ordering": {"type": "DepthKey"},
    })
    assert isinstance(stage, OrderStage)


def test_unknown_stage_tag_fails():
    with pytest.raises(ValidationError):
        _stage_adapter.validate_python({"stage": "fictional"})


def test_take_negative_n_fails():
    with pytest.raises(ValidationError):
        _stage_adapter.validate_python({"stage": "take", "n": -1})


def test_extra_field_on_stage_is_forbidden():
    """``_DslBase`` sets ``extra='forbid'`` — typo'd keys fail loudly."""
    with pytest.raises(ValidationError):
        _stage_adapter.validate_python({"stage": "take", "n": 5, "ne": 9})


# ─── Selection discriminator ──────────────────────────────────────────────────


@pytest.mark.parametrize("body, expected_cls", [
    ({"type": "ContextSelection"}, ContextSelection),
    ({"type": "DescendantSelection"}, DescendantSelection),
    ({"type": "DescendantSelection", "max_depth": 5}, DescendantSelection),
    ({"type": "AncestorSelection", "n": 2}, AncestorSelection),
    ({"type": "SiblingSelection"}, SiblingSelection),
    ({"type": "SubtreeSelection", "n": 1, "m": 3}, SubtreeSelection),
])
def test_base_selection_variants_round_trip(body, expected_cls):
    parsed = _selection_adapter.validate_python(body)
    assert isinstance(parsed, expected_cls)


def test_union_selection_round_trips():
    parsed = _selection_adapter.validate_python({
        "type": "union",
        "a": {"type": "ContextSelection"},
        "b": {"type": "DescendantSelection"},
    })
    assert isinstance(parsed, UnionSelection)
    assert isinstance(parsed.a, ContextSelection)
    assert isinstance(parsed.b, DescendantSelection)


def test_intersect_selection_round_trips():
    parsed = _selection_adapter.validate_python({
        "type": "intersect",
        "a": {"type": "DescendantSelection"},
        "b": {"type": "AncestorSelection", "n": 1},
    })
    assert isinstance(parsed, IntersectSelection)


def test_filter_selection_round_trips_at_top_level():
    parsed = _selection_adapter.validate_python({
        "type": "filter",
        "tag_expression": "tactic|attack",
        "base": {"type": "DescendantSelection"},
    })
    assert isinstance(parsed, FilterSelection)
    assert parsed.tag_expression == "tactic|attack"


def test_unknown_selection_tag_fails():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({"type": "ImaginarySelection"})


def test_descendant_max_depth_negative_fails():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "DescendantSelection", "max_depth": -1,
        })


def test_ancestor_n_negative_fails():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "AncestorSelection", "n": -1,
        })


# ─── Item 32a: filter only at top level ───────────────────────────────────────


def test_filter_inside_union_is_rejected():
    """A nested filter is a parse-time discriminator failure (32a)."""
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "union",
            "a": {
                "type": "filter",
                "tag_expression": "x",
                "base": {"type": "ContextSelection"},
            },
            "b": {"type": "ContextSelection"},
        })


def test_filter_inside_intersect_is_rejected():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "intersect",
            "a": {"type": "ContextSelection"},
            "b": {
                "type": "filter",
                "tag_expression": "x",
                "base": {"type": "DescendantSelection"},
            },
        })


def test_filter_inside_filter_base_is_rejected():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "filter",
            "tag_expression": "outer",
            "base": {
                "type": "filter",
                "tag_expression": "inner",
                "base": {"type": "ContextSelection"},
            },
        })


def test_filter_empty_tag_expression_fails():
    with pytest.raises(ValidationError):
        _selection_adapter.validate_python({
            "type": "filter",
            "tag_expression": "",
            "base": {"type": "ContextSelection"},
        })


# ─── OrderingKey union ────────────────────────────────────────────────────────


@pytest.mark.parametrize("body, expected_cls", [
    ({"type": "DepthKey"}, DepthKey),
    ({"type": "HeightKey"}, HeightKey),
    ({"type": "SubtreeSizeKey"}, SubtreeSizeKey),
    ({"type": "HeavyPathRankKey"}, HeavyPathRankKey),
    ({"type": "CentroidRankKey"}, CentroidRankKey),
    ({"type": "NumReviewsKey"}, NumReviewsKey),
    ({"type": "NumMovesKey"}, NumMovesKey),
    ({"type": "EbisuRecallKey"}, EbisuRecallKey),
    ({"type": "bfs_order"}, BfsOrder),
    ({"type": "dfs_preorder"}, DfsPreorder),
    ({"type": "dfs_postorder"}, DfsPostorder),
    ({"type": "fringe_first"}, FringeFirst),
    ({"type": "centroid_order"}, CentroidOrder),
    ({"type": "main_line_first"}, MainLineFirst),
])
def test_primitive_and_preset_ordering_round_trips(body, expected_cls):
    parsed = _ordering_adapter.validate_python(body)
    assert isinstance(parsed, expected_cls)


def test_negated_ordering_round_trips():
    parsed = _ordering_adapter.validate_python({
        "type": "negated",
        "key": {"type": "DepthKey"},
    })
    assert isinstance(parsed, Negated)
    assert isinstance(parsed.key, DepthKey)


def test_lexicographic_order_round_trips():
    parsed = _ordering_adapter.validate_python({
        "type": "LexicographicOrder",
        "keys": [{"type": "HeightKey"}, {"type": "DepthKey"}],
    })
    assert isinstance(parsed, LexicographicOrder)
    assert len(parsed.keys) == 2


def test_lexicographic_order_empty_keys_fails():
    with pytest.raises(ValidationError):
        _ordering_adapter.validate_python({
            "type": "LexicographicOrder", "keys": [],
        })


def test_weighted_sum_order_round_trips():
    parsed = _ordering_adapter.validate_python({
        "type": "WeightedSumOrder",
        "terms": [
            {"key": {"type": "DepthKey"}, "weight": 1.0},
            {"key": {"type": "HeightKey"}, "weight": -0.5},
        ],
    })
    assert isinstance(parsed, WeightedSumOrder)
    assert len(parsed.terms) == 2
    assert isinstance(parsed.terms[0], WeightedSumTerm)


def test_weighted_sum_empty_terms_fails():
    with pytest.raises(ValidationError):
        _ordering_adapter.validate_python({
            "type": "WeightedSumOrder", "terms": [],
        })


def test_unknown_ordering_tag_fails():
    with pytest.raises(ValidationError):
        _ordering_adapter.validate_python({"type": "ImaginaryKey"})


# ─── ForestQuery.validate_structure ───────────────────────────────────────────


def test_forest_query_first_stage_must_be_select():
    with pytest.raises(ValidationError, match="First pipeline stage"):
        ForestQuery(
            context_ids=[1],
            pipeline=[
                TakeStage(n=10),
            ],
        )


def test_forest_query_no_second_select_stage():
    with pytest.raises(ValidationError, match="second 'select'"):
        ForestQuery(
            context_ids=[1],
            pipeline=[
                SelectStage(selection=ContextSelection()),
                SelectStage(selection=DescendantSelection()),
            ],
        )


def test_forest_query_happy_path():
    """A pipeline with a single select stage validates."""
    q = ForestQuery(
        context_ids=[1, 2, 3],
        pipeline=[
            SelectStage(selection=DescendantSelection()),
            TakeStage(n=10),
            ShuffleStage(),
            OrderStage(ordering=HeightKey()),
        ],
    )
    assert len(q.pipeline) == 4


def test_forest_query_empty_context_ids_fails():
    with pytest.raises(ValidationError):
        ForestQuery(
            context_ids=[],
            pipeline=[SelectStage(selection=DescendantSelection())],
        )


def test_forest_query_empty_pipeline_fails():
    with pytest.raises(ValidationError):
        ForestQuery(context_ids=[1], pipeline=[])


# ─── pipeline_adapter (TypeAdapter export) ────────────────────────────────────


def test_pipeline_adapter_validates_a_list_of_stages():
    """The exported adapter accepts a bare pipeline list (no wrapper)."""
    parsed = pipeline_adapter.validate_python([
        {
            "stage": "select",
            "selection": {"type": "DescendantSelection"},
            "ordering": {"type": "DepthKey"},
        },
        {"stage": "take", "n": 5},
    ])
    assert len(parsed) == 2
    assert isinstance(parsed[0], SelectStage)
    assert isinstance(parsed[1], TakeStage)
