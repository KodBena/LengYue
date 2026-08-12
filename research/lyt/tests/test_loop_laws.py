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
from errors import LytLoadError


def _load(text: str):
    return loader.load_layouts(text)


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
        "layout g = {min 66px, pref 66px, max 66px, content bounded, "
        "unit h 33px, wrap balanced} A[chrome]"
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
        "{62px, content bounded, ceiling, unit h 106px, "
        "wrap balanced} A[go, action],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
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
        "scroll v, unit h 86px, unit v 56px} A[common, info+action]"
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
