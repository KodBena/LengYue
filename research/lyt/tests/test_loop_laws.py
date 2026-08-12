"""AMENDMENT 7 (ledger rows 2107/2108, M1 of the model-implementation
arc): adversarial accept/refuse coverage for four keys ported from the
model-iteration loop experiment (`lyt-model-loop-experiment`) -- `ceiling`
(round 3, law L9), `unit <axis> <px>` (round 5, law L10), and `wrap
<policy>` (round 6, untyped -- see below) -- plus `measure-bound` (round
6, law L11), which rode in on the same round as `wrap` but is its own
separate declaration.

Ported near-clean from the experiment branch's own `test_loop_laws.py`
(46 tests, written by that branch's substrate-consolidation commission,
ledger row 2107, against the loop's actual `loader.py`/`wellformed.py`
implementation) -- fixtures are self-contained encodings, so porting
needed no fixture changes beyond this header and the law-provenance
prose below. See `.claude/dispatch-reports/lyt-m1-substrate-port.md` for
the port's own dormancy proof (both mainline encodings re-solved
before/after, byte-identical solver output) and per-key port notes.

Verification finding carried over from the experiment branch, stated
plainly: re-reading `loader.py`/`wellformed.py`/`lyt_ast.py`/`parser.py`
end to end and exercising every accept/refuse path below against the
actual implementation found the LANGUAGE-LEVEL implementation of all
four declarations correct and complete -- every refusal this file pins
is the loader's actual behavior on this mainline port too.

Numbering note: `ceiling` and `measure-bound`/`unit` were minted on the
experiment branch as "L6"/"L7"/"L8" and then renumbered to "L9"/"L10"/
"L11" (that branch's own renumbering commit) to avoid a collision with
a separate, not-yet-shipped mainline proposal
(`.claude/dispatch-reports/lyt-domain-model-proposal.md`) that
independently claims L6/L7 for its own laws. This file uses the
post-renumbering numbers throughout, matching this port's own
lyt_ast.py/loader.py/wellformed.py comments.
"""
import pytest

import loader
import lyt_ast as ast
from errors import LytLoadError


def _load(text: str):
    return loader.load_layouts(text)


def pytest_extent(unit: str, v: float) -> ast.Extent:
    """Tiny fixture-construction helper -- `ast.Extent` mirrors the
    resolved shape `_load_sizing`/`_resolve_envelope_state_extents`
    produce, so tests compare against it directly rather than duck-typing
    a dict."""
    return ast.Extent(unit=unit, v=v)


# =============================================================================
# `ceiling` / L9 (ceiling honesty) -- round 3. The flag says: this slot's
# declared extent is an UPPER BOUND on what its content occupies, never a
# floor the realization must fill. Solver-inert (compiler.py never reads
# it) -- purely a load-time law plus a realization-binding fact.
# =============================================================================


def test_ceiling_on_a_bounded_leaf_is_accepted():
    layouts = _load(
        "layout g = {min 0px, pref 0px, max 0px, content bounded, ceiling} A[chrome]"
    )
    assert layouts["g"].sizing.ceiling is True


def test_ceiling_undeclared_defaults_false():
    layouts = _load("layout g = {min 0px, pref 0px, max 0px, content bounded} A[chrome]")
    assert layouts["g"].sizing.ceiling is False


@pytest.mark.parametrize("node_shape", ["split", "exclusive"])
def test_ceiling_refuses_on_non_leaf_nodes(node_shape):
    """L9 clause (a): a Split/Exclusive's own extent IS its children's
    partition -- 'occupies less than declared' there would silently
    re-partition siblings that never agreed to it."""
    open_tok, close_tok = ("H(", ")") if node_shape == "split" else ("T(", ")")
    text = (
        f"layout g = {{min 0px, pref 1fr, max inf, ceiling}} {open_tok}"
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome]" + close_tok
    )
    with pytest.raises(LytLoadError) as exc_info:
        _load(text)
    assert exc_info.value.detail.get("law") == "L9"
    assert exc_info.value.detail.get("prohibition") == "ceiling-on-non-leaf"
    assert exc_info.value.detail.get("node_kind") == node_shape


def test_ceiling_refuses_on_unbounded_content():
    """L9 clause (b): 'unbounded' content has no honest realized extent to
    shrink to -- that is what its declared scroll owner is FOR."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, content unbounded, "
            "scroll v, ceiling} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "L9"
    assert exc_info.value.detail.get("prohibition") == "ceiling-without-bounded-content"
    assert exc_info.value.detail.get("content") == "unbounded"


def test_ceiling_refuses_on_designed_content():
    """L9 clause (b), the other named exclusion: 'designed' content is a
    hard reservation by L5c, so it has no honest realized extent smaller
    than its declaration either."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, content designed, ceiling} A[chrome]")
    assert exc_info.value.detail.get("law") == "L9"
    assert exc_info.value.detail.get("prohibition") == "ceiling-without-bounded-content"
    assert exc_info.value.detail.get("content") == "designed"


def test_ceiling_refuses_when_content_class_is_undeclared():
    """A leaf that has made no `content` claim at all has no basis for
    'occupies less than its ceiling' either -- refused the same way an
    explicit 'unbounded'/'designed' is, not silently defaulted to
    'bounded'."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, ceiling} A[chrome]")
    assert exc_info.value.detail.get("law") == "L9"
    assert exc_info.value.detail.get("prohibition") == "ceiling-without-bounded-content"
    assert exc_info.value.detail.get("content") is None


# =============================================================================
# `unit <axis> <px>` / L10 (unit integrity) -- round 5. The key says: along
# this axis, the leaf's content is a REPETITION of an indivisible unit of
# this extent. Load-time half (leaf-only, content-class-gated, axis/unit
# vocabulary) in `loader._load_unit_axes`; structural half ("reserve at
# least one whole unit along the slot's own partition axis") in
# `wellformed.find_l10_violations`.
# =============================================================================


def test_unit_parses_and_round_trips_both_axes():
    layouts = _load(
        "layout g = {min 66px, pref 66px, max 66px, content bounded, "
        "unit h 33px, unit v 11px} A[chrome]"
    )
    assert layouts["g"].node.unit_axes == frozenset({("h", 33.0), ("v", 11.0)})


@pytest.mark.parametrize("node_shape", ["split", "exclusive"])
def test_unit_refuses_on_non_leaf_nodes(node_shape):
    """Clause (a): a unit is a fact about what a leaf RENDERS -- a split's
    own 'unit' is its children, which the tree already names."""
    open_tok, close_tok = ("H(", ")") if node_shape == "split" else ("T(", ")")
    text = (
        f"layout g = {{min 0px, pref 1fr, max inf, unit h 10px}} {open_tok}"
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome]" + close_tok
    )
    with pytest.raises(LytLoadError) as exc_info:
        _load(text)
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "unit-on-non-leaf"
    assert exc_info.value.detail.get("node_kind") == node_shape


def test_unit_refuses_on_designed_content():
    """Clause (b): a 'designed' leaf's content is ONE designed picture, not
    a repetition of anything -- claiming a unit for it is the L5c chart-
    exclusion dishonesty in the sizing register."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, content designed, unit h 10px} A[chrome]")
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "unit-without-repeatable-content"
    assert exc_info.value.detail.get("content") == "designed"


def test_unit_refuses_when_content_class_is_undeclared():
    """An unclassified leaf has made no claim about its content to declare
    a unit of -- same refusal as 'designed', not a silent default."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, unit h 10px} A[chrome]")
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "unit-without-repeatable-content"
    assert exc_info.value.detail.get("content") is None


def test_unit_refuses_duplicate_axis_declaration():
    """Clause (c): at most one unit per axis -- two competing units on one
    axis would leave 'what may not be split' ambiguous."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 0px, max 0px, content bounded, "
            "unit h 10px, unit h 20px} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "duplicate-unit-axis"
    assert exc_info.value.detail.get("got") == "h"


def test_unit_refuses_invalid_axis_token():
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, content bounded, unit z 10px} A[chrome]")
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "invalid-unit-axis"
    assert exc_info.value.detail.get("got") == "z"


@pytest.mark.parametrize("bad_extent", ["10ch", "10fr"])
def test_unit_refuses_non_px_extent(bad_extent):
    """Clause (c): a bare px literal only -- 'fr' is a SHARE OF A
    PARTITION, precisely what an indivisible content unit is not; 'ch' is
    refused for the same 'never silently reinterpret the author's
    declared unit' reason `gap` refuses it."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            f"layout g = {{min 0px, pref 1fr, max inf, content bounded, "
            f"unit h {bad_extent}}} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "non-px-unit"


def test_unit_refuses_symbolic_sentinel_extent():
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, content bounded, "
            "unit h WRAPPER_MIN} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "L10"
    assert exc_info.value.detail.get("prohibition") == "non-px-unit"


# --- L10 structural half: whole-unit reservation along the partition axis --


def test_l10_leaf_reserving_less_than_one_unit_on_its_partition_axis_is_refused():
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 10px, pref 10px, max 10px, content bounded, unit h 33px} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L10"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l10_leaf_reserving_exactly_one_unit_is_accepted():
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 33px, pref 33px, max 33px, content bounded, unit h 33px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l10_leaf_reserving_several_whole_units_is_accepted():
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 99px, pref 99px, max 99px, content bounded, unit h 33px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l10_is_dormant_for_a_unit_on_the_cross_axis():
    """Disclosed silence (loader.py's own docstring): a unit on the CROSS
    axis (a horizontal unit inside an H split's child, whose own along
    axis is width -- wait, whose PARTITION axis is 'h' here since this is
    an H split -- so declare the unit on 'v', the cross axis) constrains
    no declared extent in this 1-D-per-slot sizing bag. It must not fire
    even when the leaf's `min` badly under-reserves the cross-axis unit's
    own extent -- that under-reservation is realization-binding only."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 5px, pref 5px, max 5px, content bounded, unit v 999px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l10_binds_both_axes_for_a_root_slot():
    """SPEC.md §8's 'both axes' branch (the root slot has no parent
    partition axis, so its own sizing binds both h and v) applies to L10
    the same way it applies to preserve-reservation (§9.3) and to the
    dominance-test's along-axis reasoning -- a root that under-reserves
    EITHER declared unit axis is refused."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 5px, pref 5px, max 5px, content bounded, "
            "unit h 33px} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "L10"


def test_l10_binds_both_axes_for_a_t_child():
    """The same both-axes reading applies to a direct child of a T node,
    which shares the whole parent rectangle on both axes."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} T("
            "{min 5px, pref 5px, max 5px, content bounded, unit h 33px} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L10"


def test_l10_ignores_a_non_px_min_rather_than_guessing():
    """Disclosed silence: a `min` that is not a plain px extent (an `fr`
    share here, well under one 33px unit if it WERE compared) is skipped
    rather than compared -- ADR-0002 prefers an honest silence to a
    confident wrong answer."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 1fr, pref 1fr, max inf, content bounded, unit h 33px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l10_nesting_depth_three_finds_a_deeply_buried_violation():
    """Nesting depth >= 3 (matching the house convention Amendment 5's own
    L5a/L5b tests use): H > V > H > leaf, with the under-reserving leaf at
    the bottom -- the walk must still find it."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf} V("
            "{min 0px, pref 1fr, max inf} H("
            "{min 10px, pref 10px, max 10px, content bounded, unit h 33px} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} C[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} D[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L10"


# =============================================================================
# `wrap <policy>` (round 6, untyped law -- `detail.law == "wrap-policy"`,
# not a numbered L9/L10/L11; the experiment branch's own round-6 commit
# message called this "law L8" but the STRUCTURAL half of round 6's work
# (`measure-bound`) is the one that actually earned a numbered law -- see
# `loader._load_wrap_policy`'s own docstring, which never claims a law
# NUMBER for `wrap` itself). Says: when this slot's vocabulary of units
# needs more than one row, THIS is how the rows are cut.
# =============================================================================


def test_wrap_balanced_on_a_leaf_with_declared_horizontal_unit_is_accepted():
    layouts = _load(
        # LOOP ITERATION 11 (L15 clause (a)): a LEAF declaring `wrap` must
        # rank itself. This fixture is about `wrap`, so it takes the minimal
        # ranking rather than the law being relaxed for fixtures.
        "layout g = {min 66px, pref 66px, max 66px, content bounded, "
        "unit h 33px, wrap balanced, activity sustained} A[chrome]"
    )
    assert layouts["g"].wrap_policy == "balanced"


def test_wrap_undeclared_defaults_none():
    layouts = _load("layout g = {min 0px, pref 0px, max 0px, content bounded} A[chrome]")
    assert layouts["g"].wrap_policy is None


def test_wrap_refuses_unknown_policy():
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 66px, pref 66px, max 66px, content bounded, "
            "unit h 33px, wrap fizzbuzz} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "wrap-policy"
    assert exc_info.value.detail.get("prohibition") == "unknown-wrap-policy"
    assert exc_info.value.detail.get("got") == "fizzbuzz"


def test_wrap_refuses_on_a_split():
    """Clause (b): a Split's children are separately-reserved slots its
    own partition already places -- 'wrapping' them would be a second,
    competing placement mechanism for the same tree."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, wrap balanced} H("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "wrap-policy"
    assert exc_info.value.detail.get("prohibition") == "wrap-on-split"
    assert exc_info.value.detail.get("node_kind") == "split"


def test_wrap_refuses_on_a_leaf_with_no_declared_horizontal_unit():
    """Clause (c): a wrap policy is a statement ABOUT units -- a leaf
    whose units the model has not declared has no vocabulary to
    distribute."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, content bounded, wrap balanced} A[chrome]")
    assert exc_info.value.detail.get("law") == "wrap-policy"
    assert exc_info.value.detail.get("prohibition") == "wrap-without-declared-unit"


def test_wrap_refuses_on_a_leaf_with_only_a_vertical_unit_declared():
    """Clause (c), sharpened: a VERTICAL-only unit does not satisfy the
    'declared horizontal unit' requirement -- `wrap` cuts rows, so it
    needs a horizontal vocabulary to cut."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 0px, max 0px, content bounded, "
            "unit v 20px, wrap balanced} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "wrap-policy"
    assert exc_info.value.detail.get("prohibition") == "wrap-without-declared-unit"
    assert exc_info.value.detail.get("unit_axes") == [("v", 20.0)]


def test_wrap_on_an_exclusive_needs_no_declared_unit():
    """Clause (c)'s own carve-out: an Exclusive's units ARE its declared
    children, which the tree already names -- `wrap` is legal there with
    no `unit` declaration at all (and `unit` itself is refused on a T
    node, so there is no way to declare one)."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf, wrap balanced} T("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert layouts["g"].wrap_policy == "balanced"


# =============================================================================
# `measure-bound` / L11 (measure integrity) -- round 6. The flag says: this
# slot's extent along its parent's partition axis comes from the PAGE
# MEASURE its aspect-locked content is bound by, and the residual goes to
# siblings. Load-time half (not on an Exclusive) in
# `loader._load_measure_bound`; structural half (not the root; exactly one
# aspect-locked leaf in the declaring subtree) in
# `wellformed.find_l11_violations`.
# =============================================================================


def test_measure_bound_on_a_split_with_exactly_one_aspect_leaf_is_accepted():
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, measure-bound} V("
        "{pref 1fr, aspect 1} B[board],"
        "{min 10px, pref 10px, max 10px} I[board, info]"
        "),"
        "{min 0px, pref 1fr, max inf} C[chrome])"
    )
    assert layouts["g"].node.children[0].sizing.measure_bound is True


def test_measure_bound_directly_on_the_aspect_leaf_itself_is_accepted():
    """Legal on a Leaf too, not just a composite Split -- the aspect-locked
    leaf standing directly in a partition, per `_load_measure_bound`'s own
    docstring."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{pref 1fr, aspect 1, measure-bound} B[board],"
        "{min 0px, pref 1fr, max inf} C[chrome])"
    )
    assert layouts["g"].node.children[0].sizing.measure_bound is True


def test_measure_bound_refuses_on_the_root_slot():
    """Clause (a): the root's own rectangle IS the page -- it has no
    parent partition to take a measure against and no sibling to leave
    the residual to."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {pref 1fr, aspect 1, measure-bound} B[board]")
    assert exc_info.value.detail.get("law") == "L11"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_measure_bound_refuses_on_an_exclusive():
    """Load-time refusal: every T-child shares ONE rectangle -- there is
    no partition axis for a measure to be traded against."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, measure-bound} T("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "measure-bound-on-exclusive" or (
        exc_info.value.detail.get("law") == "L11"
        and exc_info.value.detail.get("prohibition") == "measure-bound-on-exclusive"
    )
    assert exc_info.value.detail.get("prohibition") == "measure-bound-on-exclusive"
    assert exc_info.value.detail.get("node_kind") == "exclusive"


def test_measure_bound_refuses_over_a_subtree_with_zero_aspect_leaves():
    """Clause (b): none leaves nothing to convert a page measure into an
    extent."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf, measure-bound} V("
            "{min 10px, pref 10px, max 10px} I[board, info],"
            "{min 10px, pref 10px, max 10px} J[board, info]"
            "),"
            "{min 0px, pref 1fr, max inf} C[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L11"
    assert "0 aspect" in exc_info.value.detail.get("violations", [""])[0]


def test_measure_bound_refuses_over_a_subtree_with_two_aspect_leaves():
    """Clause (b): several would leave WHICH lock converts the measure
    ambiguous -- the same unambiguous-owner reasoning L5b applies to
    scroll."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf, measure-bound} V("
            "{pref 1fr, aspect 1} B1[board],"
            "{pref 1fr, aspect 1} B2[board]"
            "),"
            "{min 0px, pref 1fr, max inf} C[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L11"
    assert "2 aspect" in exc_info.value.detail.get("violations", [""])[0]


def test_measure_bound_nesting_depth_three_still_counts_the_aspect_leaf():
    """The aspect leaf may sit several levels below the declaring slot --
    `count_aspect_leaves` folds over the whole subtree, not just direct
    children."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, measure-bound} V("
        "{min 0px, pref 1fr, max inf} H("
        "{pref 1fr, aspect 1} B[board],"
        "{min 10px, pref 10px, max 10px} I[board, info]"
        "),"
        "{min 10px, pref 10px, max 10px} J[board, info]"
        "),"
        "{min 0px, pref 1fr, max inf} C[chrome])"
    )
    assert "g" in layouts


# =============================================================================
# Cross-key interaction: the three ported keys used TOGETHER on one leaf,
# and their interaction with Amendment 5's `content`/`scroll` machinery --
# the exact shapes the experiment branch's own encodings used
# (`I_metrics`: ceiling + envelope + unit, both axes; `A_engine`: ceiling
# + unit h + wrap balanced; `boardRail`: unit + content unbounded +
# scroll, no ceiling since unbounded content can never carry one) --
# neither mainline encoding declares any of these keys yet (dormancy,
# below), so these fixtures are self-contained, not read from either
# `.lyt` file.
# =============================================================================


def test_ceiling_envelope_and_two_axis_unit_compose_on_one_leaf():
    """A leaf shaped like the experiment's `I_metrics`: `ceiling` (L9) +
    `envelope` (L3) + `unit` on BOTH axes (L10) + `content bounded` all on
    one declaration, none of the four laws' preconditions conflicting
    with another's. Nested inside a V split so L10's structural half
    binds only the partition axis ('v', the 19px reservation) -- the
    330px `unit h` is deliberately the CROSS axis here."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{67px, envelope: {disconnected, connected}, "
        "content bounded, ceiling, unit h 330px, unit v 19px} A[go, info],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    slot = layouts["g"].node.children[0]
    assert slot.sizing.ceiling is True
    assert slot.sizing.basis == "envelope"
    assert slot.node.unit_axes == frozenset({("h", 330.0), ("v", 19.0)})


def test_ceiling_unit_and_wrap_compose_on_one_leaf():
    """A leaf shaped like the experiment's `A_engine`: `ceiling` (L9) +
    `unit h` (L10) + `wrap balanced` all on one declaration -- `wrap`'s
    own precondition (a declared horizontal unit) is satisfied by the
    SAME `unit h` term `ceiling`'s own precondition (`content bounded`)
    does not conflict with. Nested inside a V split so L10's structural
    half does not bind the CROSS-axis 106px unit against the 62px height
    reservation."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        # `activity sustained`: LOOP ITERATION 11's L15 clause (a), and the
        # same ranking the real `A_engine` carries.
        "{62px, content bounded, ceiling, unit h 106px, "
        "wrap balanced, activity sustained} A[go, action],"
        # L15 clause (b): a ranking is a BAND-wide fact, so the sibling is
        # ranked too. Witnessed on its own by the L15 fixtures below.
        "{min 0px, pref 1fr, max inf, activity sustained} B[chrome])"
    )
    slot = layouts["g"].node.children[0]
    assert slot.sizing.ceiling is True
    assert slot.wrap_policy == "balanced"
    assert slot.node.unit_axes == frozenset({("h", 106.0)})


def test_unit_content_unbounded_and_scroll_compose_on_one_leaf():
    """A leaf shaped like the experiment's `boardRail`: `unit` on both
    axes (L10) + `content unbounded` + `scroll v` (Amendment 5, L5a's own
    coverage requirement) all on one declaration -- `ceiling` is
    deliberately ABSENT here (L9 forbids it on unbounded content; this
    fixture confirms the loader does not require or infer one)."""
    layouts = _load(
        "layout g = {min 104px, pref 104px, max 104px, content unbounded, "
        "scroll v, edge v unit, unit h 86px, unit v 56px} A[common, info+action]"
    )
    slot = layouts["g"]
    assert slot.sizing.ceiling is False
    assert slot.node.content == "unbounded"
    assert slot.node.unit_axes == frozenset({("h", 86.0), ("v", 56.0)})


def test_ceiling_and_unit_together_still_refuse_a_split():
    """Both L9 and L10 independently refuse a non-leaf -- declaring BOTH
    on a split must not silently let one precondition's refusal mask the
    other's; either error is acceptable, but the load must fail."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, ceiling, unit h 10px} H("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") in ("L9", "L10")


def test_l10_and_l11_can_both_be_live_in_the_same_program_independently():
    """L10 (unit-integrity) and L11 (measure-integrity) are independent
    structural walks arbitrated through the SAME waiver mechanism
    (`wellformed.check_wellformed`) -- a program with a genuine L10
    violation in one subtree and a genuine L11 violation in another must
    report BOTH, not stop at the first."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 10px, pref 10px, max 10px, content bounded, unit h 33px} A[chrome],"
            "{min 0px, pref 1fr, max inf, measure-bound} V("
            "{min 10px, pref 10px, max 10px} I[board, info],"
            "{min 10px, pref 10px, max 10px} J[board, info]"
            ")"
            ")"
        )
    laws = exc_info.value.detail.get("laws")
    assert laws is not None, exc_info.value.detail
    assert set(laws) == {"L10", "L11"}


# =============================================================================
# Dormancy: a program with NONE of these four declarations anywhere must
# trip none of L9/L10/L11 (or wrap-policy's own refusals) -- the same
# "laws bind declarations, they do not retroactively indict silence"
# posture Amendment 5's own dormancy regression pins for L5/L5a/L5b/L5c.
# This is also this port's own acceptance bar (M1 commission): neither
# mainline encoding declares any of these four keys, so this dormancy
# must hold for both `lengyue_landscape.lyt` and `lengyue_portrait.lyt`
# unchanged.
# =============================================================================


def test_dormancy_no_amendment_7_declarations_means_no_amendment_7_law_violations():
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf, gap 4px} H("
        "{min 100px, pref 100px, max 100px} A[chrome],"
        "{pref 1fr} V("
        "{pref 1fr, aspect 1} B[board],"
        "{min 24px, pref 24px, max 24px} I[board, info]"
        "),"
        "{min 0px, pref 1fr, max inf} T("
        "{min 0px, pref 1fr, max inf} C[chrome],"
        "{min 0px, pref 1fr, max inf} D[chrome]"
        "))"
    )
    root = layouts["g"]
    assert root.sizing.ceiling is False
    assert root.node.children[0].sizing.ceiling is False
    assert root.wrap_policy is None
    assert root.sizing.measure_bound is False


def test_dormancy_holds_across_both_reference_encodings():
    """The two mainline clean-room encodings, re-checked end to end:
    loading either must not raise and must not declare any Amendment 7
    key -- the M1 port's own acceptance bar (neither encoding is touched
    by this port; the solver output stays byte-identical, see this
    port's own dispatch report)."""
    import loader as loader_mod
    from pathlib import Path

    encodings_dir = Path(__file__).parent.parent / "encodings"
    for name in ("lengyue_landscape", "lengyue_portrait"):
        text = (encodings_dir / f"{name}.lyt").read_text()
        layouts = loader_mod.load_layouts(text)
        assert f"lengyue-{name.split('_')[1]}" in layouts


# =============================================================================
# `orient <axis>` -- METAMODEL WAVE item 1 (ledger row 2157/2158/2166,
# branch lyt-model-loop-experiment, NOT merged without ratification). Not a
# structural law with its own tree-walk checker (no L-number) -- a plain
# leaf-only declared fact, same shape as `boundary` (AMENDMENT 6): the
# widget mount's own axis of internal self-layout, `'v'` when undeclared,
# refused off a leaf and refused outside the closed {h, v} vocabulary.
# =============================================================================


def test_orient_h_on_a_leaf_is_accepted():
    layouts = _load("layout g = {min 0px, pref 0px, max 0px, orient h} A[chrome]")
    assert layouts["g"].node.orientation == "h"


def test_orient_v_on_a_leaf_is_accepted():
    layouts = _load("layout g = {min 0px, pref 0px, max 0px, orient v} A[chrome]")
    assert layouts["g"].node.orientation == "v"


def test_orient_undeclared_defaults_v():
    layouts = _load("layout g = {min 0px, pref 0px, max 0px} A[chrome]")
    assert layouts["g"].node.orientation == "v"


def test_orient_refuses_unknown_axis():
    with pytest.raises(LytLoadError) as exc_info:
        _load("layout g = {min 0px, pref 0px, max 0px, orient diagonal} A[chrome]")
    assert exc_info.value.detail.get("law") == "orientation-declaration"
    assert exc_info.value.detail.get("prohibition") == "unknown-orientation"
    assert exc_info.value.detail.get("got") == "diagonal"


@pytest.mark.parametrize("node_shape", ["split", "exclusive"])
def test_orient_refuses_on_non_leaf_nodes(node_shape):
    """Orientation names which axis a SINGLE WIDGET renders itself along --
    a Split/Exclusive has no interior content of its own to orient (a
    Split's own partition axis is already `Split.axis`, a wholly different
    fact)."""
    open_tok, close_tok = ("H(", ")") if node_shape == "split" else ("T(", ")")
    text = (
        f"layout g = {{min 0px, pref 1fr, max inf, orient h}} {open_tok}"
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome]" + close_tok
    )
    with pytest.raises(LytLoadError) as exc_info:
        _load(text)
    assert exc_info.value.detail.get("law") == "orientation-declaration"
    assert exc_info.value.detail.get("prohibition") == "orientation-on-non-leaf"
    assert exc_info.value.detail.get("node_kind") == node_shape


def test_orient_composes_with_content_unit_and_wrap_on_one_leaf():
    """Same nesting shape as `test_ceiling_unit_and_wrap_compose_on_one_leaf`
    above (a V-split child, not the root) so L10's structural half does not
    bind the leaf's own min against a cross-axis unit it never declared."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{62px, content bounded, ceiling, unit h 106px, "
        "wrap balanced, orient h, activity sustained} A[go, action],"
        # L15 clause (b), same reason as the fixture above.
        "{min 0px, pref 1fr, max inf, activity sustained} B[chrome])"
    )
    slot = layouts["g"].node.children[0]
    assert slot.node.orientation == "h"
    assert slot.sizing.ceiling is True
    assert slot.wrap_policy == "balanced"


def test_orient_defaults_v_across_both_reference_encodings():
    """LOOP ITERATION 9 / ARC 4 ROUND 2 (ledger rows 2209/2220) REWROTE
    this test, and the rewrite is the point rather than an incidental
    fixup.

    As written by the metamodel wave, this test asserted that portrait's
    `tree` leaf declares `orient h` -- the per-class orientation witness.
    Iteration 9 retired that declaration after JUDGING THE FLIPPED VIEW:
    portrait's tree reservation is 84px WIDE by its row's full height, a
    narrow-tall rectangle, and the captured 420x880 render showed the
    horizontal spelling produce a squat two-node strip over dead band
    where a vertical spine belongs. See `lengyue_portrait.lyt`'s own LOOP
    ITERATION 9 header note.

    So this test now pins what is actually true of the SHIPPED encodings
    -- neither class declares an orientation, both keep the default `v` --
    rather than a witness the evidence retired. The MECHANISM's own
    coverage (that a declared `orient h` loads, refuses off a leaf, and
    refuses outside {h,v}) lives in this module's other orient tests and
    is untouched; a live-encoding declaration was never what proved the
    mechanism worked, which is why retiring one costs no coverage."""
    import loader as loader_mod
    from pathlib import Path

    encodings_dir = Path(__file__).parent.parent / "encodings"

    def _find_leaf(slot, widget_id):
        node = slot.node
        if getattr(node, "widget", None) == widget_id and hasattr(node, "orientation"):
            return node
        for child in getattr(node, "children", []):
            found = _find_leaf(child, widget_id)
            if found is not None:
                return found
        return None

    landscape = loader_mod.load_layouts(
        (encodings_dir / "lengyue_landscape.lyt").read_text()
    )["lengyue-landscape"]
    portrait = loader_mod.load_layouts(
        (encodings_dir / "lengyue_portrait.lyt").read_text()
    )["lengyue-portrait"]

    landscape_tree = _find_leaf(landscape, "tree")
    portrait_tree = _find_leaf(portrait, "tree")
    assert landscape_tree is not None and portrait_tree is not None
    assert landscape_tree.orientation == "v"
    assert portrait_tree.orientation == "v"


# =============================================================================
# LOOP ITERATION 9 / ARC 4 ROUND 2 (model-iteration loop EXPERIMENT, ledger
# rows 2037/2066/2107/2157/2209/2211/2212/2220; branch
# lyt-model-loop-experiment, NOT merged without ratification): `elastic
# <axis>` and law L13, surplus attribution -- the DUAL of iteration 3's
# `ceiling`. A reservation and its occupancy can disagree in two directions;
# this language had a word for only one of them.
# =============================================================================


def _load_one(text):
    import loader as loader_mod

    layouts = loader_mod.load_layouts(text)
    return next(iter(layouts.values()))


def test_elastic_loads_on_an_unbounded_leaf_and_is_absent_by_default():
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item, elastic h, floor v 10px} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )
    a_leaf = slot.node.children[0].node
    b_leaf = slot.node.children[1].node
    assert a_leaf.elastic_axes == frozenset({"h"})
    assert b_leaf.elastic_axes == frozenset()


def test_elastic_accumulates_both_axes_rather_than_last_write_wins():
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item, elastic h, elastic v, floor v 10px, floor h 10px} a[common]"
        ")"
    )
    assert slot.node.children[0].node.elastic_axes == frozenset({"h", "v"})


@pytest.mark.parametrize(
    "content_decl,expected_content",
    [("content bounded", "bounded"), ("content designed", "designed"), ("", None)],
)
def test_elastic_is_refused_without_unbounded_content(content_decl, expected_content):
    """L13 clause (b). Bounded content has a FINITE demand, so its honest
    answer to a too-large reservation is `ceiling` (L9), not stretching;
    designed content is a hard reservation (L5c); an unclassified leaf has
    made no claim to found an elasticity on. This precondition is what
    keeps `elastic` from being a universal 'just stretch it' escape."""
    bag = "min 10px, pref 1fr, max inf, elastic h"
    if content_decl:
        bag += ", " + content_decl
    with pytest.raises(LytLoadError) as exc:
        _load_one(f"layout t = {{min 0px, pref 1fr, max inf}} V({{{bag}}} a[common])")
    assert exc.value.detail["law"] == "L13"
    assert exc.value.detail["prohibition"] == "elastic-without-unbounded-content"
    assert exc.value.detail["content"] == expected_content


@pytest.mark.parametrize("container", ["V", "T"])
def test_elastic_is_refused_on_a_container(container):
    """L13 clause (a): elasticity is a fact about what OCCUPIES a
    rectangle. A Split's occupant is its children, whose own declared
    shares already say which takes the residual; a T's children each get
    the WHOLE rectangle, so there is no residual between them."""
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf, elastic h} " + container + "("
            "     {min 10px, pref 1fr, max inf} a[common],"
            "     {min 10px, pref 1fr, max inf} b[common]"
            "  )"
            ")"
        )
    assert exc.value.detail["law"] == "L13"
    assert exc.value.detail["prohibition"] == "elastic-on-non-leaf"


def test_elastic_axis_vocabulary_is_closed():
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf, content unbounded, elastic diag} a[common]"
            ")"
        )
    assert exc.value.detail["law"] == "L13"
    assert exc.value.detail["prohibition"] == "invalid-elastic-axis"


def test_l13_fires_on_a_t_child_whose_horizontal_residual_nobody_claims():
    """The structural half. The T-child position is where a slot's own
    declaration binds BOTH axes (L12's own position, for L12's own
    reason), so it is the one place the model holds a floor/cap pair on
    the axis a partition is NOT dividing. A `content unbounded` leaf
    there that declares `scroll v` has disposed of its vertical axis and
    said nothing about its horizontal one.

    M2 STAGE B2a UPDATE (2026-08-12, ledger rows 2108/2331): restored to
    the original experiment-branch shape (`pytest.raises(LytLoadError)`
    around the full `loader.load_layouts` path) now that `check_wellformed`
    wires L13 into its default `all_violations` -- both mainline reference
    encodings now satisfy L13 (`CP-library`/`CP-cards` gained `elastic h`),
    so the FULL LOAD PATH is what this test can exercise again, not merely
    the standalone function (the prior M2-port-era adaptation, calling
    `find_l13_violations` directly on an already-loaded slot, is no longer
    necessary or even possible: a fixture that leaves L13 unsatisfied now
    fails INSIDE `load_layouts` itself, before any direct-call assertion
    could run)."""
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf} T("
            "     {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item} a[common],"
            "     {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item} b[common]"
            "  )"
            ")"
        )
    assert exc.value.detail["law"] == "L13"
    assert len(exc.value.detail["violations"]) == 2
    assert all("'h' axis" in v for v in exc.value.detail["violations"])


@pytest.mark.parametrize(
    "disposition",
    [
        "elastic h",          # the occupant claims the residual
        "scroll h, edge h item",  # the content exceeds it; there is no residual
    ],
)
def test_l13_accepts_any_of_the_three_honest_dispositions(disposition):
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        "     {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item, floor v 10px, "
        + disposition
        + "} a[common]"
        "  )"
        ")"
    )


def test_l13_accepts_a_pinned_axis_where_no_surplus_can_arise():
    """The third disposition: floor == cap, so the reservation can never
    be granted more than its floor and there is nothing to attribute."""
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        "     {min 40px, pref 40px, max 40px, content unbounded, scroll v, edge v item} a[common]"
        "  )"
        ")"
    )


def test_l13_is_silent_outside_the_both_axes_position():
    """DISCLOSED SCOPE, pinned so it cannot drift into an unstated claim:
    a leaf standing in a PARTITION declares an extent for one axis and
    takes its parent's on the other, so the model holds no floor/cap pair
    on the cross axis and this law would be guessing. `settingsPane` and
    `otherBand` in the real encodings carry exactly this shape of unowned
    horizontal surplus and L13 cannot see it. Honest silence, not
    coverage."""
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf, content unbounded, scroll v, edge v item} a[common]"
        ")"
    )


# =============================================================================
# METAMODEL WAVE item 2 (ledger row 2157/2173-2177, branch
# lyt-model-loop-experiment, NOT merged without ratification): the
# dict-envelope upgrade -- `envelope: {state: extent, ...}` -- rev2
# domain-model-proposal §2.1 ("reservation is not an extent, it is a
# function from a finite, declared set of activity states to extents, and
# its reservation is the max over the set"). Not a new L-number: it
# sharpens L3's existing check (a `basis=='envelope'` slot's state list
# must be honest) into a real computed fact instead of documentation.
# =============================================================================


def test_dict_envelope_with_matching_pref_is_accepted():
    layouts = _load(
        "layout g = {min 0px, pref 60px, max 60px, "
        "envelope: {disconnected: 28px, connected: 60px}} A[go, info]"
    )
    slot = layouts["g"]
    assert slot.sizing.basis == "envelope"
    assert slot.sizing.envelope_states == ["disconnected", "connected"]
    assert slot.sizing.envelope_state_extents == {
        "disconnected": pytest_extent("px", 28.0),
        "connected": pytest_extent("px", 60.0),
    }


def test_dict_envelope_refuses_pref_mismatch():
    """The declared reservation (`pref`) must equal the componentwise max
    over the declared states -- SPEC.md §4.2's own disclosed gap
    ("the code does not compute a max over anything") is what this check
    closes."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 28px, max 60px, "
            "envelope: {disconnected: 28px, connected: 60px}} A[go, info]"
        )
    assert exc_info.value.detail.get("law") == "L3"
    assert exc_info.value.detail.get("prohibition") == "envelope-reservation-mismatch"
    assert exc_info.value.detail.get("computed_max") == {"unit": "px", "v": 60.0}
    assert exc_info.value.detail.get("declared_pref") == {"unit": "px", "v": 28.0}


def test_dict_envelope_refuses_mixed_named_and_bare_states():
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 60px, max 60px, "
            "envelope: {disconnected, connected: 60px}} A[go, info]"
        )
    assert exc_info.value.detail.get("law") == "L3"
    assert exc_info.value.detail.get("prohibition") == "mixed-envelope-entries"
    assert exc_info.value.detail.get("unnamed_states") == ["disconnected"]


def test_dict_envelope_refuses_cross_unit_states():
    with pytest.raises(LytLoadError) as exc_info:
        _load(
            "layout g = {min 0px, pref 1fr, max inf, "
            "envelope: {disconnected: 28px, connected: 4fr}} A[go, info]"
        )
    assert exc_info.value.detail.get("law") == "L3"
    assert exc_info.value.detail.get("prohibition") == "envelope-extent-unit-mismatch"


def test_dict_envelope_on_the_fixed_shorthand_form_is_accepted():
    """The `{67px, envelope: {...}}` shape both real encodings actually
    use (I_metrics) -- min=pref=max=the shorthand extent, checked against
    the SAME componentwise max as the full-triple form above."""
    layouts = _load(
        "layout g = {67px, envelope: {disconnected: 30px, connected: 67px}} A[go, info]"
    )
    slot = layouts["g"]
    assert slot.sizing.min == slot.sizing.pref == slot.sizing.max == pytest_extent("px", 67.0)
    assert slot.sizing.envelope_state_extents == {
        "disconnected": pytest_extent("px", 30.0),
        "connected": pytest_extent("px", 67.0),
    }


def test_legacy_bare_envelope_states_are_unaffected_by_the_dict_upgrade():
    """The pre-wave spelling (names only, no extents) is byte-identical to
    before: `envelope_state_extents` stays None, and no pref-vs-max check
    fires (there is nothing computed to check against)."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf, "
        "envelope: {disconnected, connected}} A[go, info]"
    )
    slot = layouts["g"]
    assert slot.sizing.envelope_states == ["disconnected", "connected"]
    assert slot.sizing.envelope_state_extents is None


def test_both_reference_encodings_dict_envelopes_still_load_clean():
    """Neither shipped encoding uses the dict form yet as of this test
    (both still declare the legacy bare-name spelling for I_metrics/
    A_engine) -- this pins that the new machinery is dormant for them,
    the same 'laws bind declarations, not silence' posture every other
    METAMODEL WAVE addition takes."""
    import loader as loader_mod
    from pathlib import Path

    encodings_dir = Path(__file__).parent.parent / "encodings"
    for name in ("lengyue_landscape", "lengyue_portrait"):
        text = (encodings_dir / f"{name}.lyt").read_text()
        loader_mod.load_layouts(text)  # must not raise


# =============================================================================
# L12 -- `min <axis> <extent>` (LOOP ITERATION 8 / ARC 4, ledger rows
# 2037/2066/2107/2157). A PER-AXIS floor, for the one position where a
# slot's own `min` binds BOTH axes: a direct child of an Exclusive/T node
# (and the root). Load-time half `loader._load_axis_mins`; structural half
# `wellformed.find_l12_violations`; solver-visible in `compiler._constrain`
# and in the Exclusive branch's componentwise-max floor derivation.
# =============================================================================


def _t_child_program(child_bag: str) -> str:
    """A minimal T whose FIRST child carries `child_bag` -- the both-axes
    position L12 is about. The sibling keeps a plain `min` so the
    componentwise max has two genuinely different contributors."""
    return (
        "layout g = {min 0px, pref 1fr, max inf} T("
        f"{child_bag} A[chrome],"
        "{min 40px, pref 1fr, max inf} B[chrome])"
    )


def test_axis_min_on_a_t_child_is_accepted_and_overrides_only_that_axis():
    layouts = _load(_t_child_program("{min 100px, min h 800px, pref 1fr, max inf}"))
    child = layouts["g"].node.children[0]
    assert child.sizing.axis_mins == frozenset({("h", ast.Extent(unit="px", v=800.0))})
    # The named axis takes the override; the unnamed one keeps `min`.
    assert child.sizing.axis_min("h") == ast.Extent(unit="px", v=800.0)
    assert child.sizing.axis_min("v") == ast.Extent(unit="px", v=100.0)


def test_both_axes_may_be_named_at_once():
    layouts = _load(_t_child_program("{min 100px, min h 800px, min v 300px, pref 1fr, max inf}"))
    child = layouts["g"].node.children[0]
    assert child.sizing.axis_min("h") == ast.Extent(unit="px", v=800.0)
    assert child.sizing.axis_min("v") == ast.Extent(unit="px", v=300.0)


def test_axis_min_undeclared_leaves_every_slot_byte_identical():
    """Dormancy, the same posture every other loop declaration takes: a
    program naming no axis returns `min` for both axes."""
    layouts = _load(_t_child_program("{min 100px, pref 1fr, max inf}"))
    child = layouts["g"].node.children[0]
    assert child.sizing.axis_mins == frozenset()
    assert child.sizing.axis_min("h") == child.sizing.axis_min("v") == ast.Extent(unit="px", v=100.0)


def test_axis_min_refuses_unknown_axis():
    with pytest.raises(LytLoadError) as exc_info:
        _load(_t_child_program("{min 100px, min z 800px, pref 1fr, max inf}"))
    assert exc_info.value.detail.get("law") == "L12"
    assert exc_info.value.detail.get("prohibition") == "invalid-axis-min-axis"
    assert exc_info.value.detail.get("got") == "z"


def test_axis_min_refuses_the_same_axis_twice():
    with pytest.raises(LytLoadError) as exc_info:
        _load(_t_child_program("{min 100px, min h 800px, min h 900px, pref 1fr, max inf}"))
    assert exc_info.value.detail.get("law") == "L12"
    assert exc_info.value.detail.get("prohibition") == "duplicate-axis-min"


def test_axis_min_refuses_an_fr_extent():
    """An axis floor is only meaningful where the slot's rectangle IS its
    parent's on both axes -- precisely where there is no partition for a
    share to denominate against."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(_t_child_program("{min 100px, min h 2fr, pref 1fr, max inf}"))
    assert exc_info.value.detail.get("law") == "L12"
    assert exc_info.value.detail.get("prohibition") == "fr-axis-min"


def test_axis_min_refuses_beside_the_fixed_shorthand():
    """`{28px}` produces the whole triple from one declaration; an axis
    floor beside it would be silently discarded, so it is refused."""
    with pytest.raises(LytLoadError) as exc_info:
        _load(_t_child_program("{28px, min h 800px}"))
    assert exc_info.value.detail.get("law") == "L12"
    assert exc_info.value.detail.get("prohibition") == "axis-min-with-shorthand"
    assert exc_info.value.detail.get("shorthand") == "fixed"


def test_axis_min_refuses_structurally_off_the_both_axes_position():
    """A Split child's own `min` already names exactly one axis (its
    parent's partition axis) and the other is fixed by the cross-axis
    equality -- an axis floor there binds nothing, which is the
    decorative-declaration failure this family refuses."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{min 10px, min h 800px, pref 1fr, max inf} A[chrome],"
        "{min 10px, pref 1fr, max inf} B[chrome])"
    )
    with pytest.raises(LytLoadError) as exc_info:
        _load(text)
    detail = exc_info.value.detail
    assert detail.get("law") == "L12" or "L12" in (detail.get("laws") or [])
    assert any("floor-attribution" in v for v in detail.get("violations", []))


def test_axis_min_is_accepted_on_the_root():
    """The root is the other `along=None` position -- its rectangle IS the
    page on both axes, so an axis floor there is a real (if rarely useful)
    fact, not a decorative one."""
    layouts = _load("layout g = {min 0px, min h 40px, pref 1fr, max inf} A[chrome]")
    assert layouts["g"].sizing.axis_min("h") == ast.Extent(unit="px", v=40.0)


def test_axis_min_actually_moves_the_solver_not_just_the_ast():
    """The point of the law: a T child that declares its 800px is a WIDTH
    no longer raises its siblings' shared HEIGHT floor with it. Solved
    twice against the same page, once with the number axis-agnostic and
    once attributed."""
    from compiler import solve_lexicographic

    both_axes = _load(_t_child_program("{min 800px, pref 1fr, max inf}"))["g"]
    attributed = _load(_t_child_program("{min 40px, min h 800px, pref 1fr, max inf}"))["g"]
    page = dict(class_id="c", w_px=1000, h_px=300, board_widget=None, reach_preferred_widgets=None)
    assert solve_lexicographic(both_axes, **page).status == "INFEASIBLE"
    assert solve_lexicographic(attributed, **page).status == "OPTIMAL"


def test_axis_min_leaves_a_program_that_declares_none_solving_identically():
    """Mechanism inertness, pinned rather than asserted: the same program
    with no axis-keyed `min` anywhere solves exactly as it did before this
    law existed (the 800px binding BOTH axes, hence INFEASIBLE at a page
    only 300px tall, and OPTIMAL once the page is tall enough)."""
    from compiler import solve_lexicographic

    prog = _load(_t_child_program("{min 800px, pref 1fr, max inf}"))["g"]
    assert solve_lexicographic(
        prog, class_id="c", w_px=1000, h_px=300, board_widget=None, reach_preferred_widgets=None
    ).status == "INFEASIBLE"
    assert solve_lexicographic(
        prog, class_id="c", w_px=1000, h_px=900, board_widget=None, reach_preferred_widgets=None
    ).status == "OPTIMAL"


# =============================================================================
# LOOP ITERATION 10 / ARC 4 ROUND 3 (model-iteration loop EXPERIMENT, ledger
# rows 2037/2066/2107/2157/2226-2236; branch lyt-model-loop-experiment, NOT
# merged without ratification): `ceiling <axis>` + the `along`/`across` role
# frame, and law L14 (demand attribution). A drawn structure's extent on
# either axis is a property OF THE STRUCTURE, never a constant -- and the
# axis a leaf's own facts are about is a fact about the leaf's ORIENTATION,
# not about the view it happens to be declared in.
# =============================================================================


def test_role_axes_resolve_through_the_leafs_own_declared_orientation():
    """The role frame's whole point, stated as one assertion: the SAME
    source text binds to opposite physical axes under opposite `orient`
    declarations. Both real classes are `orient v` today, so this synthetic
    pair is the mechanism's witness -- the same discipline METAMODEL WAVE
    item 1's own orientation witness used, for the same reason (a fact that
    is currently identical in both classes still has to be shown to BE the
    mechanism, not a coincidence)."""
    text = (
        "layout t = {{min 0px, pref 1fr, max inf}} H("
        "  {{min 60px, pref 60px, max 60px, content unbounded, orient {o},"
        "    scroll along, scroll across, ceiling along, ceiling across,"
        "    edge along item, edge across unit, unit across 24px}} a[common],"
        "  {{min 10px, pref 1fr, max inf}} b[common]"
        ")"
    )
    vert = _load_one(text.format(o="v"))
    horiz = _load_one(text.format(o="h"))
    v_slot, h_slot = vert.node.children[0], horiz.node.children[0]
    # `unit across`: across == h under orient v, == v under orient h.
    assert dict(v_slot.node.unit_axes) == {"h": 24.0}
    assert dict(h_slot.node.unit_axes) == {"v": 24.0}
    # `scroll along` + `scroll across` covers both axes either way, and so
    # does the pair of ceilings (which is also this file's witness that
    # `ceiling` ACCUMULATES per axis rather than last-write-wins).
    assert v_slot.scroll_axes == frozenset({"h", "v"})
    assert h_slot.scroll_axes == frozenset({"h", "v"})
    assert v_slot.node.ceiling_axes == frozenset({"h", "v"})
    assert h_slot.node.ceiling_axes == frozenset({"h", "v"})


def test_role_axes_resolve_on_a_solver_visible_key_too():
    """The same flip on L12's axis-keyed `min`, which (unlike scroll/unit/
    elastic/ceiling) the CP-SAT solve actually reads -- so the role frame
    is not confined to the realization-binding half of the language."""
    text = (
        "layout t = {{min 0px, pref 1fr, max inf}} V("
        "  {{min 10px, pref 1fr, max inf}} T("
        "     {{min 10px, min across 60px, pref 1fr, max inf, orient {o}}} a[common]"
        "  )"
        ")"
    )
    v_axes = {a for a, _ in _load_one(text.format(o="v")).node.children[0].node.children[0].sizing.axis_mins}
    h_axes = {a for a, _ in _load_one(text.format(o="h")).node.children[0].node.children[0].sizing.axis_mins}
    assert v_axes == {"h"}
    assert h_axes == {"v"}


def test_physical_axis_spellings_are_untouched_by_the_role_frame():
    """Every pre-iteration-10 encoding must resolve byte-identically: a
    physical token passes through `_resolve_axis_token` unchanged."""
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 24px, pref 1fr, max inf, content unbounded, scroll h, edge h unit, unit h 24px} a[common]"
        ")"
    )
    child = slot.node.children[0]
    assert child.scroll_axes == frozenset({"h"})
    assert dict(child.node.unit_axes) == {"h": 24.0}


@pytest.mark.parametrize("key_decl", ["scroll along", "unit across 24px", "ceiling across"])
@pytest.mark.parametrize("container", ["V", "T"])
def test_role_axes_are_refused_off_a_leaf(key_decl, container):
    """A role name resolves against an ORIENTATION, and only a leaf has
    one: a Split's axes are its parent's partition, a T's children all
    share one rectangle. The token would name nothing, which is the
    decorative-declaration failure this loader's node-kind refusals exist
    to prevent."""
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf, " + key_decl + "} " + container + "("
            "     {min 10px, pref 1fr, max inf} a[common],"
            "     {min 10px, pref 1fr, max inf} b[common]"
            "  )"
            ")"
        )
    # Whichever refusal fires first, it must be a node-kind one and never a
    # silent resolution to some physical axis. `unit`'s own leaf-only
    # refusal precedes role resolution (it is checked before the token loop
    # that resolves roles), which is the right order: the key had no
    # business being there at all, and reporting a role complaint would name
    # the smaller of the two problems.
    assert exc.value.detail["prohibition"] in (
        "role-axis-on-non-leaf",
        "axis-ceiling-on-non-leaf",
        "unit-on-non-leaf",
    )


def test_ceiling_axis_loads_beside_a_scroll_on_the_same_axis():
    """L14 clause (c)'s admitted shape: the `scroll` owns the excess, the
    `ceiling` owns the deficit -- together, 'take exactly your demand'."""
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 40px, pref 40px, max 40px, content unbounded, scroll h, edge h item, scroll v, edge v item,"
        "   ceiling h} a[common]"
        ")"
    )
    assert slot.node.children[0].node.ceiling_axes == frozenset({"h"})


def test_ceiling_axis_loads_on_bounded_content_without_any_scroll():
    """L9's own precondition survives per-axis: a bounded leaf's demand is
    finite and can never exceed the bound, so it needs no excess-owner."""
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 40px, pref 40px, max 40px, content bounded, ceiling h} a[common]"
        ")"
    )
    assert slot.node.children[0].node.ceiling_axes == frozenset({"h"})


def test_bare_ceiling_and_axis_ceiling_are_different_declarations():
    """The parser distinguishes them by one token of lookahead and nothing
    else; the bare flag must keep going to `Sizing.ceiling` (L9) so no
    pre-iteration-10 encoding changes meaning."""
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 40px, pref 40px, max 40px, content bounded, ceiling} a[common]"
        ")"
    )
    child = slot.node.children[0]
    assert child.sizing.ceiling is True
    assert child.node.ceiling_axes == frozenset()


@pytest.mark.parametrize(
    "content_decl,expected_content",
    [("content unbounded", "unbounded"), ("content designed", "designed"), ("", None)],
)
def test_ceiling_axis_is_refused_when_nothing_owns_that_axis_excess(
    content_decl, expected_content
):
    """L14 clause (c). A ceiling invites content past a bound; without an
    owner for what goes past, the outcome is overprint or clip -- the two
    things this language exists to make unconstructable. `scroll` on the
    SAME axis is the only alternative to `content bounded`; note the
    unbounded case here declares `scroll v`, i.e. a scroll on the OTHER
    axis does not count."""
    bag = "min 40px, pref 40px, max 40px, ceiling h, scroll v, edge v item"
    if content_decl:
        bag += ", " + content_decl
    with pytest.raises(LytLoadError) as exc:
        _load_one(f"layout t = {{min 0px, pref 1fr, max inf}} H({{{bag}}} a[common])")
    assert exc.value.detail["law"] == "L14"
    assert exc.value.detail["prohibition"] == "axis-ceiling-without-excess-owner"
    assert exc.value.detail["axis"] == "h"
    assert exc.value.detail["content"] == expected_content


def test_ceiling_axis_vocabulary_is_closed():
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} H("
            "  {min 40px, pref 40px, max 40px, content bounded, ceiling diag} a[common]"
            ")"
        )
    assert exc.value.detail["law"] == "L14"
    assert exc.value.detail["prohibition"] == "invalid-ceiling-axis"


def test_l14_fires_on_a_pinned_two_dimensional_scroller():
    """The structural half, at the shape that mints the law: a leaf that
    can overflow BOTH ways draws a structure, and a pin on the axis its
    parent partitions asserts a constant where that structure's own demand
    belongs."""
    with pytest.raises(LytLoadError) as exc:
        _load_one(
            "layout t = {min 0px, pref 1fr, max inf} H("
            "  {min 84px, pref 84px, max 84px, content unbounded, scroll h, edge h unit, scroll v, edge v item,"
            "   unit h 24px} a[common],"
            "  {min 10px, pref 1fr, max inf} b[common]"
            ")"
        )
    assert exc.value.detail["law"] == "L14"
    assert len(exc.value.detail["violations"]) == 1
    v = exc.value.detail["violations"][0]
    assert "'h' axis" in v
    # The message names the declared unit, so the reader sees the pin FOR
    # WHAT IT IS -- a round multiple of the leaf's own lane.
    assert "24px" in v


def test_l14_is_satisfied_by_declaring_the_pin_a_bound():
    slot = _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 84px, pref 84px, max 84px, content unbounded, scroll along, edge along item, scroll across, edge across unit,"
        "   ceiling across, unit across 24px} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )
    assert slot.node.children[0].node.ceiling_axes == frozenset({"h"})


def test_l14_is_silent_for_a_one_axis_scroller():
    """DISCLOSED SCOPE, pinned so it cannot drift into an unstated claim. A
    strip or a reflowing pane scrolls one way; its CROSS extent honestly IS
    a constant, and this law says nothing about it. `settingsSubstrip`,
    `settingsPane`, `otherBand` and `boardRail` in the real encodings are
    all this shape."""
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 34px, pref 34px, max 34px, content unbounded, scroll v, edge v unit, unit v 24px} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )


def test_l14_is_silent_at_the_both_axes_position():
    """The COMPLEMENT of L12/L13's scope, and the same honest-silence
    reason read from the other side: at a T-child (or the root) one
    declaration is read on BOTH axes, so 'which axis is pinned' is not a
    question this walk could answer without guessing."""
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        "     {min 84px, pref 84px, max 84px, content unbounded, scroll h, edge h item, scroll v, edge v item} a[common]"
        "  )"
        ")"
    )


def test_l14_is_silent_where_the_reservation_is_not_pinned():
    _load_one(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 60px, pref 1fr, max 84px, content unbounded, scroll h, edge h item, scroll v, edge v item} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )


# =============================================================================
# LOOP ITERATION 11 / ARC 4 ROUND 4 -- L15, DEMOTION ATTRIBUTION.
# `activity <level>` + the `@demote(<axis> <px>)` presence kind: a band's
# members are not equally earned, and the least-active leave before anyone
# wraps.
# =============================================================================


def test_activity_resolves_both_levels_on_a_leaf():
    for level in ("sustained", "occasional"):
        layouts = _load(
            f"layout g = {{min 0px, pref 0px, max 0px, content bounded, "
            f"activity {level}}} A[chrome]"
        )
        assert layouts["g"].node.activity == level


def test_activity_undeclared_is_none_not_an_implicit_sustained():
    """An unranked leaf has made NO claim -- the language must not read
    silence as a ranking, or every pre-iteration-11 encoding would acquire
    an opinion it never expressed."""
    layouts = _load("layout g = {min 0px, pref 0px, max 0px, content bounded} A[chrome]")
    assert layouts["g"].node.activity is None


def test_activity_refuses_an_unknown_level():
    with pytest.raises(LytLoadError) as exc:
        _load("layout g = {min 0px, pref 0px, max 0px, activity rarely} A[chrome]")
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "unknown-activity-level"


@pytest.mark.parametrize("shape", ["V", "T"])
def test_activity_refuses_a_container(shape):
    """A container has no content of its own to rank; its children each
    answer for themselves (and a T's children are alternatives, never
    co-present)."""
    with pytest.raises(LytLoadError) as exc:
        _load(
            f"layout g = {{min 0px, pref 1fr, max inf, activity sustained}} {shape}("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "activity-on-non-leaf"


def test_demote_is_accepted_on_an_occasional_bounded_leaf():
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "@demote(h 616px) {100px, content bounded, activity occasional} A[chrome],"
        "{min 0px, pref 1fr, max inf, activity sustained} B[chrome])"
    )
    presence = layouts["g"].node.children[0].presence
    assert presence.kind == "demote"
    assert presence.demote_axis == "h"
    assert presence.demote_below_px == 616.0
    # And L1's own prohibition is untouched: a demotion is NOT spelled as a
    # system-driven release toggle, so `by`/`hidden` stay unset.
    assert presence.by is None and presence.hidden is None


def test_demote_requires_occasional_activity():
    """The law's whole safety property: a model that could demote content it
    never ranked could demote the controls the user is working with."""
    for bag in ("{100px, content bounded}", "{100px, content bounded, activity sustained}"):
        with pytest.raises(LytLoadError) as exc:
            _load(
                "layout g = {min 0px, pref 1fr, max inf} V("
                f"@demote(h 616px) {bag} A[chrome],"
                "{min 0px, pref 1fr, max inf} B[chrome])"
            )
        assert exc.value.detail["law"] == "L15"
        assert exc.value.detail["prohibition"] == "demote-without-occasional-activity"


@pytest.mark.parametrize(
    "inner",
    [
        "{100px, content unbounded, scroll v, edge v item, activity occasional}",
        "{100px, content designed, activity occasional}",
        "{100px, activity occasional}",
    ],
)
def test_demote_requires_bounded_content(inner):
    """A demoted slot is re-hosted in the overlay stratum, which has no
    standing reservation at all -- only finite, known content can honestly be
    promised a home there. The third case is the undeclared one: a leaf that
    made no content claim founded nothing to demote."""
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            f"@demote(h 616px) {inner} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "demote-without-bounded-content"


@pytest.mark.parametrize("axis", ["z", "along", "across"])
def test_demote_refuses_a_bad_axis_including_the_l14_role_names(axis):
    """`along`/`across` resolve against the LEAF's own orient; the axis a
    demotion measures is the one its BAND is under pressure on. Accepting a
    role here would silently mean something else, so it is refused by name."""
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            f"@demote({axis} 616px) "
            "{100px, content bounded, activity occasional} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "invalid-demote-axis"


@pytest.mark.parametrize("bad", ["1fr", "40ch"])
def test_demote_refuses_a_non_px_threshold(bad):
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            f"@demote(h {bad}) "
            "{100px, content bounded, activity occasional} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "non-px-demote-threshold"


@pytest.mark.parametrize("shape", ["V", "T"])
def test_demote_refuses_a_container(shape):
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            "@demote(h 616px) {min 0px, pref 1fr, max inf} " + shape + "("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome]),"
            "{min 0px, pref 1fr, max inf} C[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert exc.value.detail["prohibition"] == "demote-on-non-leaf"


def test_l15_clause_a_fires_on_a_wrapping_leaf_that_never_ranked_itself():
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            "{66px, content bounded, unit h 33px, wrap balanced} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert "declares `wrap balanced`" in exc.value.detail["violations"][0]


def test_l15_clause_a_is_silent_for_an_exclusive_that_wraps():
    """A T's units ARE its declared children, each of which is a leaf that
    answers for itself -- the same reasoning `_load_unit_axes` uses to refuse
    `unit` on a container. So `wrap` on a T needs no `activity`, and both
    encodings' own control-panel T nodes stay legal unranked."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf, wrap balanced} T("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert layouts["g"].wrap_policy == "balanced"


def test_l15_clause_b_refuses_a_partially_ranked_band():
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            "{min 0px, pref 1fr, max inf, activity sustained} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert "ranks 1 of its 2 leaf children" in exc.value.detail["violations"][0]


def test_l15_clause_b_is_silent_for_a_wholly_unranked_band():
    """Dormancy, pinned rather than asserted: an encoding that ranks nothing
    anywhere is untouched by clause (b), which is what keeps every
    pre-iteration-11 encoding legal."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert [c.node.activity for c in layouts["g"].node.children] == [None, None]


def test_l15_clause_b_ignores_composite_children():
    """A ranking is about a band's LEAF members; a Split child is itself a
    band whose own children rank themselves, so it does not have to enter its
    parent's ordering (the same locality L2's dominance measure keeps). This
    is what lets landscape's side column rank its four toolbar leaves while
    the tree/panels row beside them stays out of the ordering."""
    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{min 0px, pref 1fr, max inf, activity sustained} A[chrome],"
        "{min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf} B[chrome],"
        "{min 0px, pref 1fr, max inf} C[chrome]))"
    )
    assert layouts["g"].node.children[0].node.activity == "sustained"


def test_l15_clause_c_refuses_a_wholly_demotable_band():
    """A band that can vacate completely is a PRESENCE slot, and
    `@toggle(user, release)` is already this language's word for one."""
    with pytest.raises(LytLoadError) as exc:
        _load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            "{min 0px, pref 1fr, max inf} V("
            "@demote(h 616px) {100px, content bounded, activity occasional} A[chrome],"
            "@demote(h 616px) {100px, content bounded, activity occasional} B[chrome]),"
            "{min 0px, pref 1fr, max inf} C[chrome])"
        )
    assert exc.value.detail["law"] == "L15"
    assert "can vacate completely" in exc.value.detail["violations"][0]


def test_a_demoted_widget_is_nameable_absent_in_a_presence_valuation():
    """The mechanism half: `presence.validate_valuation` accepts a demote
    slot on exactly the footing a user-release toggle already had, so a
    demoted state is a genuinely SEPARATE solve (Amendment 4's own §6
    reading) rather than a modification of one -- which is why the coverage
    matrix can give it a verdict instead of an assertion."""
    import presence as presence_mod

    layouts = _load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "@demote(h 616px) {100px, content bounded, activity occasional} A[chrome],"
        "{min 0px, pref 1fr, max inf, activity sustained} B[chrome])"
    )
    val = presence_mod.PresenceValuation(name="demoted", absent_widgets=frozenset({"A"}))
    presence_mod.validate_valuation(layouts["g"], val, layout_name="g")  # does not raise
    pruned = presence_mod.prune_absent(layouts["g"], val.absent_widgets)
    assert [c.node.widget for c in pruned.node.children] == ["B"]

    # And the refusal the widening did NOT weaken: a plain fixed-presence
    # leaf is still not nameable-absent.
    bad = presence_mod.PresenceValuation(name="bad", absent_widgets=frozenset({"B"}))
    with pytest.raises(LytLoadError) as exc:
        presence_mod.validate_valuation(layouts["g"], bad, layout_name="g")
    assert exc.value.detail["prohibition"] == "not-a-release-toggle"


def test_l1_stays_untypable_after_the_demotion_kind_exists():
    """The load-bearing non-regression: adding a viewport-driven release kind
    must not have opened the system-driven one L1 forbids. Plus the two
    construction guards that keep the demotion fields from drifting onto a
    kind with no use for them, or off the one that requires them."""
    with pytest.raises(LytLoadError) as exc:
        _load("layout g = @toggle(system, release) {min 0px, pref 0px, max 0px} A[chrome]")
    assert exc.value.detail["prohibition"] == "system-release-presence"
    with pytest.raises(ValueError):
        ast.Presence(kind="fixed", demote_axis="h", demote_below_px=616.0)
    with pytest.raises(ValueError):
        ast.Presence(kind="demote")


def _leaf_slots_by_widget(slot, out=None):
    out = {} if out is None else out
    node = slot.node
    if isinstance(node, ast.Leaf):
        out[node.widget] = slot
        return out
    for child in node.children:
        _leaf_slots_by_widget(child, out)
    return out


# ---------------------------------------------------------------------------
# LOOP ITERATION 12 / ARC 4 ROUND 5 -- L16, deficit attribution
# (`floor <axis> <px>`), ledger rows 2037/2066/2107/2157/2268-2280.
#
# The DEFICIT corner of the square L13 (`elastic`, surplus) and L14
# (`ceiling`, demand) already stand in. Coverage below follows this file's
# own house style: every load-time refusal by its own `prohibition` name,
# all three structural clauses, the law's disclosed SILENCES pinned so they
# cannot drift into an unstated claim, and the role frame's own witness (a
# flipped `orient`, the discipline round 2's review asked for).
# ---------------------------------------------------------------------------


def _l16_leaf(floor="floor v 40px", orient="", min_decl="min 40px"):
    """An unbounded leaf in a T (both-axes) position that satisfies L12/L13/
    L14 and varies only in what THIS law is about."""
    return (
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        f"     {{{min_decl}, pref 1fr, max inf, content unbounded, scroll v, edge v item, "
        f"elastic h, {floor}{orient}}} a[common]"
        "  )"
        ")"
    )


def _l16_load(text):
    layouts = loader.load_layouts(text)
    return next(iter(layouts.values()))


def test_l16_floor_loads_and_is_absent_by_default():
    slot = _l16_load(_l16_leaf())
    leaf = slot.node.children[0].node.children[0].node
    assert leaf.floor_axes == frozenset({("v", ast.Extent(unit="px", v=40.0))})
    plain = _l16_load(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )
    assert plain.node.children[0].node.floor_axes == frozenset()


def test_l16_floor_accumulates_both_axes_rather_than_last_write_wins():
    slot = _l16_load(_l16_leaf(floor="floor v 40px, floor h 30px"))
    leaf = slot.node.children[0].node.children[0].node
    assert {a for a, _ in leaf.floor_axes} == {"h", "v"}


def test_l16_floor_takes_the_l14_role_frame_and_binds_through_orient():
    """The role frame's witness is a FLIPPED-ORIENT one rather than a
    number: `floor along` is ONE declaration resolving to two different
    physical axes depending only on the leaf's own `orient`."""
    import parser as _parser

    def _resolved_axes(orient):
        # BELOW `check_wellformed` on purpose: flipping `orient` moves the
        # floor off the axis clause (a) asks for, so the structural half
        # would (correctly) object to a fixture whose whole point is the
        # LOAD-TIME resolution. `load_slot` is that half by itself.
        text = _l16_leaf(floor="floor along 40px", orient=f", orient {orient}")
        raw = _parser.parse_layouts(text)[0]
        root = loader.load_slot(raw.slot, path=raw.name)
        return {a for a, _ in root.node.children[0].node.children[0].node.floor_axes}

    assert _resolved_axes("v") == {"v"}
    assert _resolved_axes("h") == {"h"}


def test_l16_refuses_a_floor_on_a_split():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(
            "layout t = {min 0px, pref 1fr, max inf, floor v 40px} V("
            "  {min 10px, pref 1fr, max inf} b[common]"
            ")"
        )
    assert exc.value.detail["prohibition"] == "floor-on-non-leaf"
    assert exc.value.detail["law"] == "L16"


def test_l16_refuses_a_floor_on_an_exclusive():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf, floor v 40px} T("
            "     {min 10px, pref 1fr, max inf} a[common]"
            "  )"
            ")"
        )
    assert exc.value.detail["prohibition"] == "floor-on-non-leaf"


def test_l16_refuses_an_unknown_floor_axis():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(_l16_leaf(floor="floor z 40px"))
    assert exc.value.detail["prohibition"] == "invalid-floor-axis"


def test_l16_refuses_two_floors_on_one_axis():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(_l16_leaf(floor="floor v 40px, floor v 50px"))
    assert exc.value.detail["prohibition"] == "duplicate-floor"


@pytest.mark.parametrize("bad", ["floor v 4fr", "floor v 20ch"])
def test_l16_refuses_a_non_px_floor(bad):
    """`fr` is a share of the very partition whose sufficiency is in
    question; `ch` is a text measure standing in for a stack of controls
    whose extent is not text. Narrower than `min <axis>`'s own rule, on
    purpose -- see `loader._load_floor_axes` clause (c)."""
    with pytest.raises(LytLoadError) as exc:
        _l16_load(_l16_leaf(floor=bad))
    assert exc.value.detail["prohibition"] == "non-px-floor"


def test_l16_clause_a_fires_on_an_unbounded_leaf_that_forgot_its_deficit():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf} T("
            "     {min 40px, pref 1fr, max inf, content unbounded, scroll v, edge v item, "
            "elastic h} a[common]"
            "  )"
            ")"
        )
    assert exc.value.detail["law"] == "L16"
    assert "declares no `floor v`" in exc.value.detail["violations"][0]


@pytest.mark.parametrize(
    "decl",
    [
        # a one-axis scroller with NO elastic claim never asserted it
        # reasoned about its residual, so this law puts no words in its
        # mouth (settingsPane / otherBand / boardRail are all this shape).
        # Pinned floor==cap so L13 has nothing to say either -- the point
        # is L16's silence, not another law's noise.
        "pinned",
        # bounded content's smallest form is its own demand, which L14's
        # `ceiling` already governs
        "content bounded, scroll v, ceiling v",
        # designed content is L5c's hard reservation
        "content designed",
    ],
)
def test_l16_clause_a_is_silent_where_it_disclaims_scope(decl):
    """DISCLOSED SCOPE, pinned so it cannot drift into an unstated claim."""
    sizing = (
        "min 40px, pref 40px, max 40px, content unbounded, scroll v, edge v item"
        if decl == "pinned"
        else f"min 40px, pref 1fr, max inf, {decl}"
    )
    _l16_load(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        f"     {{{sizing}}} a[common]"
        "  )"
        ")"
    )


def test_l16_clause_b_refuses_a_floor_the_leaf_can_neither_reserve_nor_leave():
    with pytest.raises(LytLoadError) as exc:
        _l16_load(_l16_leaf(min_decl="min 10px"))
    assert exc.value.detail["law"] == "L16"
    assert "neither RESERVES it" in exc.value.detail["violations"][0]


def test_l16_clause_b_accepts_the_reserving_disposition():
    """`min v` (L12's own axis-keyed floor) covering the declared floor is
    the first of the two honest answers -- and it is the one BOTH reference
    encodings take at `CP-library`/`CP-cards`."""
    _l16_load(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  {min 10px, pref 1fr, max inf} T("
        "     {min 10px, min v 40px, pref 1fr, max inf, content unbounded, "
        "scroll v, edge v item, elastic h, floor v 40px} a[common]"
        "  )"
        ")"
    )


def test_l16_clause_b_accepts_the_leaving_disposition():
    """THE JOIN TO L15: a leaf that may vacate its band has an honest answer
    for a floor it cannot be granted, and needs no reservation for it."""
    _l16_load(
        "layout t = {min 0px, pref 1fr, max inf} V("
        "  @demote(h 616px) {min 10px, pref 1fr, max inf, content bounded, "
        "activity occasional, scroll v, floor v 40px} a[common],"
        "  {min 10px, pref 1fr, max inf, activity sustained} b[common]"
        ")"
    )


def test_l16_clause_c_refuses_a_floor_above_the_leafs_own_cap():
    """The leaf RESERVES its floor on the v axis (so clause (b) is quiet)
    and still caps itself below it -- two facts in one bag that cannot both
    hold, which is what makes this its own clause rather than a corollary."""
    with pytest.raises(LytLoadError) as exc:
        _l16_load(
            "layout t = {min 0px, pref 1fr, max inf} V("
            "  {min 10px, pref 1fr, max inf} T("
            "     {min 40px, min v 90px, pref 40px, max 40px, content unbounded, "
            "scroll v, edge v item, floor v 90px} a[common]"
            "  )"
            ")"
        )
    assert exc.value.detail["law"] == "L16"
    assert len(exc.value.detail["violations"]) == 1
    assert "above its own cap" in exc.value.detail["violations"][0]


# ---------------------------------------------------------------------------
# LOOP ITERATION 13 / ARC 4 ROUND 6 -- L17, edge attribution
# (`edge <axis> unit|item|continuous`; ledger row 2286).
#
# The law's own shape is documented in `wellformed.find_l17_violations` and
# `loader._load_edge_axes`; what these tests pin is (i) the key's grammar and
# BOTH directions of its join to L10's `unit`, (ii) the three structural
# clauses including the two that fire nowhere on the encodings, (iii) the
# role frame resolving through the leaf's own `orient`, (iv) the firing
# record re-derived rather than asserted from prose, and (v) solver
# inertness. Same discipline L14/L15/L16 each pinned for themselves.
# ---------------------------------------------------------------------------


def _l17_leaf(bag):
    """A scrolling leaf in a plain H position, varying only in its own bag."""
    return (
        "layout t = {min 0px, pref 1fr, max inf} H("
        f"  {{min 40px, pref 1fr, max inf, content unbounded, {bag}}} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )


def _l17_load(text):
    layouts = loader.load_layouts(text)
    return next(iter(layouts.values()))


def test_l17_edge_loads_and_is_absent_by_default():
    slot = _l17_load(_l17_leaf("scroll v, edge v item"))
    assert slot.node.children[0].node.edge_axes == frozenset({("v", "item")})
    plain = _l17_load(
        "layout t = {min 0px, pref 1fr, max inf} H("
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )
    assert plain.node.children[0].node.edge_axes == frozenset()


def test_l17_edge_accumulates_both_axes_rather_than_last_write_wins():
    """Same departure from last-write-wins bag semantics `scroll`/`unit`/
    `floor` already take: `edge h` and `edge v` are two facts, not a
    correction of one another."""
    slot = _l17_load(_l17_leaf("scroll v, scroll h, edge v item, edge h continuous"))
    assert slot.node.children[0].node.edge_axes == frozenset(
        {("v", "item"), ("h", "continuous")}
    )


def test_l17_edge_is_leaf_only():
    with pytest.raises(LytLoadError) as exc:
        _l17_load(
            "layout t = {min 0px, pref 1fr, max inf, scroll v, edge v item} H("
            "  {min 10px, pref 1fr, max inf} b[common]"
            ")"
        )
    assert exc.value.detail["prohibition"] == "edge-on-non-leaf"


@pytest.mark.parametrize(
    "bag,prohibition",
    [
        ("scroll v, edge diag item", "invalid-edge-axis"),
        ("scroll v, edge v fuzzy", "invalid-edge-disposition"),
        ("scroll v, edge v item, edge v continuous", "duplicate-edge"),
        # THE JOIN TO L10, FORWARD: a boundary that can be PLACED between
        # items needs the constant pitch it would be placed on, and that
        # pitch is not a new number -- it is L10's own `unit`.
        ("scroll v, edge v unit", "edge-unit-without-pitch"),
        # THE JOIN TO L10, BACKWARD: a leaf whose content along an axis IS a
        # repetition of one constant thing may not say its boundary meets
        # none. Together the two directions are what keep the disposition
        # vocabulary honest at three members rather than redundant at two.
        ("scroll v, unit v 24px, edge v item", "edge-under-unit-not-unit"),
        ("scroll v, unit v 24px, edge v continuous", "edge-under-unit-not-unit"),
    ],
)
def test_l17_load_time_refusals(bag, prohibition):
    with pytest.raises(LytLoadError) as exc:
        _l17_load(_l17_leaf(bag))
    assert exc.value.detail["prohibition"] == prohibition
    assert exc.value.detail["law"] == "L17"


def test_l17_edge_takes_the_role_frame_through_the_leafs_own_orientation():
    """`along`/`across` are ADMITTED here for L16's reason verbatim: what a
    boundary falls on is a fact about the leaf's own content in the leaf's
    own frame, which is exactly what L14's role frame resolves against. One
    declaration, two classes, and the axis it binds follows the leaf."""
    text = (
        "layout t = {{min 0px, pref 1fr, max inf}} H("
        "  {{min 40px, pref 1fr, max inf, content unbounded, orient {o},"
        "    scroll along, edge along item}} a[common],"
        "  {{min 10px, pref 1fr, max inf}} b[common]"
        ")"
    )
    vert = _l17_load(text.format(o="v"))
    horiz = _l17_load(text.format(o="h"))
    assert vert.node.children[0].node.edge_axes == frozenset({("v", "item")})
    assert horiz.node.children[0].node.edge_axes == frozenset({("h", "item")})


def test_l17_clause_a_fires_on_a_scroller_that_never_named_its_edge():
    """M2 STAGE B2a UPDATE (2026-08-12, ledger rows 2108/2331): restored to
    the original experiment-branch shape now that `check_wellformed` wires
    L17 into its default `all_violations` -- see
    `test_l13_fires_on_a_t_child_whose_horizontal_residual_nobody_claims`'s
    own updated note for the full rationale (both mainline reference
    encodings now satisfy L17 too)."""
    with pytest.raises(LytLoadError) as exc:
        _l17_load(_l17_leaf("scroll v"))
    assert exc.value.detail["law"] == "L17"
    assert len(exc.value.detail["violations"]) == 1
    assert "declares no `edge v`" in exc.value.detail["violations"][0]


@pytest.mark.parametrize("content", ["bounded", "designed"])
def test_l17_clause_a_is_silent_where_it_disclaims_scope(content):
    """A bounded leaf's content fits by construction (L14 governs its
    demand) and `designed` content is L5c's hard reservation. Neither
    creates a boundary that could cut, so this law does not put words in
    either one's mouth -- the silence is pinned, not implied."""
    import wellformed as _wellformed

    slot = _l17_load(
        "layout t = {min 0px, pref 1fr, max inf} H("
        f"  {{min 40px, pref 1fr, max inf, content {content}}} a[common],"
        "  {min 10px, pref 1fr, max inf} b[common]"
        ")"
    )
    assert _wellformed.find_l17_violations(slot) == []


def test_l17_clause_b_refuses_an_edge_on_an_axis_that_does_not_scroll():
    """The converse of the trigger. Without a scroll there is no boundary
    between shown and unshown content on that axis -- only the parent's
    partition, and where the partition falls is not this leaf's fact.

    M2 STAGE B2a UPDATE (2026-08-12, ledger rows 2108/2331): restored to
    the original experiment-branch shape -- see
    `test_l17_clause_a_fires_on_a_scroller_that_never_named_its_edge`'s
    own updated note for why."""
    with pytest.raises(LytLoadError) as exc:
        _l17_load(_l17_leaf("scroll v, edge v item, edge h continuous"))
    msgs = exc.value.detail["violations"]
    assert len(msgs) == 1
    assert "does not `scroll h`" in msgs[0]


def test_l17_clause_c_refuses_a_placeable_edge_beside_an_elastic_claim():
    """The join to L13, and the reason it is a refusal rather than an
    arbitration: `edge v unit` gives the sub-unit remainder BACK so the
    boundary can fall between two items, `elastic v` claims every pixel of
    residual for the occupant. Same pixels, opposite directions.

    M2 STAGE B2a UPDATE (2026-08-12, ledger rows 2108/2331): restored to
    the original experiment-branch shape -- see
    `test_l17_clause_a_fires_on_a_scroller_that_never_named_its_edge`'s
    own updated note for why. Also declares `floor v 40px` (matching the
    fixture's own 40px min) so this fixture does not ALSO trip L16 (also
    wired) -- L16 is not this test's own subject."""
    with pytest.raises(LytLoadError) as exc:
        _l17_load(_l17_leaf("scroll v, unit v 24px, edge v unit, elastic v, floor v 40px"))
    msgs = exc.value.detail["violations"]
    assert any("in opposite directions" in m for m in msgs)


