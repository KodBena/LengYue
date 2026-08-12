"""AMENDMENT 9 (ledger row 2310) -- derived orientation. Coverage for
`orientation.py` (`derive_orientation`, `compute_derived_orientations`,
`rebind`) and `wellformed.py`'s L18 (`find_residual_child`,
`find_residual_leaves`, `find_l18_violations`).

Fixtures are self-contained `layout g = ...` texts, the same convention
`tests/test_loop_laws.py` uses -- an `H` split with one FIXED
(`min==pref==max`) sibling and one genuinely elastic (`pref 1fr`) sibling,
the sibling that is this language's own structural spelling of "residual-
holding" (`wellformed.find_residual_child`'s own docstring). Sizes are
chosen so the residual box's solved width/height land exactly on the
aspect sign or the tie the test names -- see each test's own comment for
the arithmetic (`residual_along = parent_along - fixed_along`, no gap
declared anywhere below, so the arithmetic is exact integer subtraction).
"""
from pathlib import Path

import pytest

import loader
import lyt_ast as ast
import orientation
from compiler import solve_lexicographic
from errors import LytLoadError
from wellformed import find_l18_violations, find_residual_child, find_residual_leaves

ENCODINGS_DIR = Path(__file__).parent.parent / "encodings"


def _load(text: str):
    return loader.load_layouts(text)


# A residual leaf carrying an L14 role-frame declaration (`ceiling across`)
# whose resolved physical axis DEPENDS on the leaf's own orientation --
# used to prove `orientation.rebind` actually re-binds the role frame,
# not merely `Leaf.orientation` itself.
_ROLE_FRAME_PROGRAM = (
    "layout g = {{min 0px, pref 1fr, max inf}} H("
    "{{min 100px, pref 100px, max 100px}} fixedLeaf[chrome],"
    "{{min 0px, pref 1fr, max inf, content bounded, ceiling across}} residualLeaf[common]"
    ")"
)


def _solve(slot: ast.Slot, *, w_px: int, h_px: int):
    return solve_lexicographic(
        slot, class_id="c", w_px=w_px, h_px=h_px, board_widget=None, reach_preferred_widgets=None
    )


# =============================================================================
# `derive_orientation` -- the tie-to-vertical rule (sub-ruling (b)), in
# isolation from any solve/tree.
# =============================================================================


def test_derive_orientation_landscape_residual_derives_horizontal():
    assert orientation.derive_orientation(400, 200) == "h"


def test_derive_orientation_portrait_residual_derives_vertical():
    assert orientation.derive_orientation(120, 400) == "v"


def test_derive_orientation_exact_tie_falls_to_vertical():
    """Sub-ruling (b), stated verbatim: 'an aspect tie at exactly 1 falls
    to VERTICAL... 1 is a legitimate bare quantity' -- not an ambiguity to
    refuse, a resolved point in the {h, v} state universe like any other."""
    assert orientation.derive_orientation(200, 200) == "v"


def test_derive_orientation_degenerate_zero_height_falls_to_vertical():
    """A collapsed (zero-height) residual has no well-defined aspect --
    falls to the same 'v' default `_load_orientation` gives every
    undeclared leaf, rather than raising a new refusal this module would
    otherwise have to invent for a fact `compiler.py` already reports
    honestly (an `INFEASIBLE`/degenerate solve)."""
    assert orientation.derive_orientation(400, 0) == "v"


# =============================================================================
# Structural residual-holding detection (`find_residual_child` /
# `find_residual_leaves`) -- static, load-time-computable, no solve
# involved.
# =============================================================================


def test_find_residual_child_is_the_unique_fr_pref_sibling():
    slot = _load(_ROLE_FRAME_PROGRAM.format())["g"]
    residual = find_residual_child(slot)
    assert residual is not None
    assert isinstance(residual.node, ast.Leaf)
    assert residual.node.widget == "residualLeaf"


def test_find_residual_leaves_names_the_widget_by_id_keyed_on_its_path():
    """Path convention note: every structural walker in this module family
    (`find_l2_violations` etc.) is rooted at the literal string `'root'`,
    never at the layout's own name (SPEC.md §1.1) -- a `Slot` does not
    carry its own construction-time path, so a fresh walk always starts
    from each function's own `path='root'` default, regardless of what
    name `load_slot`/`load_layouts` happened to build the tree under."""
    slot = _load(_ROLE_FRAME_PROGRAM.format())["g"]
    residual_leaves = find_residual_leaves(slot)
    assert residual_leaves == {"residualLeaf": "root/H1"}


def test_find_residual_child_is_none_when_no_child_is_fr_pref():
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 100px, pref 100px, max 100px} a[chrome],"
        "{min 50px, pref 50px, max 50px} b[chrome])"
    )
    slot = _load(text)["g"]
    assert find_residual_child(slot) is None
    assert find_residual_leaves(slot) == {}


def test_find_residual_child_is_none_when_two_siblings_are_fr_pref():
    """Ambiguity, disclosed: two elastic siblings competing for the same
    residual have no single child 'the residual' belongs to -- silently
    non-applicable (no derivation, no refusal), not an invented tie-break
    the ruling never adjudicated."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf} a[common],"
        "{min 0px, pref 1fr, max inf} b[common])"
    )
    slot = _load(text)["g"]
    assert find_residual_child(slot) is None
    assert find_residual_leaves(slot) == {}


def test_find_residual_child_ignores_a_non_leaf_fr_pref_child():
    """A Split (not a Leaf) as the unique `fr`-pref child is structurally
    residual-holding, but `orient`/L14's role frame are leaf-only facts
    (SPEC.md §16.1) -- there is nothing to derive for it, so it
    contributes no entry to `find_residual_leaves`."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 100px, pref 100px, max 100px} a[chrome],"
        "{min 0px, pref 1fr, max inf} V("
        "{min 20px, pref 20px, max 20px} c[chrome],"
        "{min 20px, pref 20px, max 20px} d[chrome]))"
    )
    slot = _load(text)["g"]
    assert find_residual_leaves(slot) == {}


# =============================================================================
# L18 -- authored `orient` on a residual-holding leaf is a refusal
# (sub-ruling (a)); `orient` remains legal everywhere else.
# =============================================================================


def test_l18_refuses_authored_orient_on_the_residual_holding_leaf():
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 100px, pref 100px, max 100px} fixedLeaf[chrome],"
        "{min 0px, pref 1fr, max inf, orient h} residualLeaf[common])"
    )
    with pytest.raises(LytLoadError) as exc_info:
        _load(text)
    detail = exc_info.value.detail
    assert detail.get("law") == "L18" or "L18" in (detail.get("laws") or [])
    assert any("derived-orientation" in v for v in detail.get("violations", []))


def test_l18_override_still_honored_on_a_non_residual_placement():
    """Sub-ruling (a)'s other half: `orient` survives as an authored
    override for a NON-residual leaf -- L18 fires only at the specific
    residual-holding leaf, never at a sibling that merely shares its
    Split."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 100px, pref 100px, max 100px, orient h} fixedLeaf[chrome],"
        "{min 0px, pref 1fr, max inf} residualLeaf[common])"
    )
    slot = _load(text)["g"]
    fixed = slot.node.children[0]
    assert isinstance(fixed.node, ast.Leaf)
    assert fixed.node.orientation == "h"
    assert fixed.node.orientation_declared is True
    # the residual leaf itself is unaffected -- still the placeholder
    # default, since it never authored `orient` (that is exactly what
    # would have tripped L18 above).
    residual = slot.node.children[1]
    assert residual.node.orientation == "v"
    assert residual.node.orientation_declared is False
    # and the load succeeds at all -- no L18 violation anywhere.
    assert find_l18_violations(slot) == []


# =============================================================================
# End-to-end derivation: solve, derive, re-bind -- both aspect signs, and
# the L14 role frame actually changing through the derived choice.
# =============================================================================


def test_derivation_end_to_end_landscape_residual_rebinds_to_horizontal():
    text = _ROLE_FRAME_PROGRAM.format()
    slot = _load(text)["g"]
    # residual along-extent = 500 - 100 (fixedLeaf) = 400; cross-extent =
    # 200 (H split, exact cross-fill) -- aspect 2 > 1 -> 'h'.
    result = _solve(slot, w_px=500, h_px=200)
    assert result.status == "OPTIMAL"
    derived = orientation.compute_derived_orientations(slot, result)
    assert derived == {"residualLeaf": "h"}
    rebound = orientation.rebind(text, "g", slot, result)
    residual = rebound.node.children[1]
    assert residual.node.widget == "residualLeaf"
    assert residual.node.orientation == "h"
    # THE role-frame re-bind: `ceiling across` resolved against the
    # PLACEHOLDER 'v' orientation at the first load (`across` of 'v' is
    # 'h') -- against the DERIVED 'h' orientation, `across` is 'v'. If
    # rebind had not actually re-run the role-frame resolution, this
    # would still read {'h'} (the first load's own value).
    assert slot.node.children[1].node.ceiling_axes == frozenset({"h"})
    assert residual.node.ceiling_axes == frozenset({"v"})


def test_derivation_end_to_end_portrait_residual_rebinds_to_vertical():
    text = _ROLE_FRAME_PROGRAM.format()
    slot = _load(text)["g"]
    # residual along-extent = 220 - 100 = 120; cross-extent = 400 --
    # aspect 0.3 < 1 -> 'v' (no CHANGE from the placeholder default here,
    # which is exactly why the landscape case above is the one that
    # proves re-binding actually happened).
    result = _solve(slot, w_px=220, h_px=400)
    assert result.status == "OPTIMAL"
    derived = orientation.compute_derived_orientations(slot, result)
    assert derived == {"residualLeaf": "v"}
    rebound = orientation.rebind(text, "g", slot, result)
    residual = rebound.node.children[1]
    assert residual.node.orientation == "v"
    assert residual.node.ceiling_axes == frozenset({"h"})


def test_derivation_end_to_end_exact_tie_falls_to_vertical():
    text = _ROLE_FRAME_PROGRAM.format()
    slot = _load(text)["g"]
    # residual along-extent = 300 - 100 = 200; cross-extent = 200 -- a
    # genuine square residual box, aspect exactly 1.
    result = _solve(slot, w_px=300, h_px=200)
    assert result.status == "OPTIMAL"
    derived = orientation.compute_derived_orientations(slot, result)
    assert derived == {"residualLeaf": "v"}


def test_rebind_is_a_no_op_identity_when_nothing_is_residual_holding():
    """The common case: a tree with no residual-holding leaf at all
    (`compute_derived_orientations` returns `{}`) -- `rebind` returns the
    SAME object, not a re-parsed copy, so a caller comparing `is` (or
    relying on downstream `result.rects` path alignment, as `runner.py`
    does) sees no behavioral change whatsoever."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 100px, pref 100px, max 100px} a[chrome],"
        "{min 200px, pref 200px, max 200px} b[chrome])"
    )
    slot = _load(text)["g"]
    result = _solve(slot, w_px=300, h_px=200)
    assert result.status == "OPTIMAL"
    assert orientation.rebind(text, "g", slot, result) is slot


def test_compute_derived_orientations_skips_a_widget_absent_from_the_solve():
    """An `INFEASIBLE` solve's own `SolveResult.rects` is `{}` -- a
    residual leaf named by `find_residual_leaves` but missing from
    `result.rects` contributes no entry, rather than this function
    inventing a fallback orientation for geometry that was never solved."""
    text = _ROLE_FRAME_PROGRAM.format()
    slot = _load(text)["g"]
    # 50px is narrower than fixedLeaf's own fixed 100px -- INFEASIBLE.
    result = _solve(slot, w_px=50, h_px=200)
    assert result.status == "INFEASIBLE"
    assert result.rects == {}
    assert orientation.compute_derived_orientations(slot, result) == {}


# =============================================================================
# Real reference encodings -- the honest, disclosed finding this
# amendment's own dispatch report names in full. This mechanism is NOT
# structurally dormant against `lengyue_landscape.lyt`/
# `lengyue_portrait.lyt`: `B` (the board leaf, via the `pref maximize`
# sugar SPEC.md §1.1 resolves to elastic `pref 1fr`) and `settingsPane`/
# `otherBand` (both explicit `pref 1fr` leaves alongside a fixed sibling
# inside their own inner V-splits) ARE, structurally, each their own
# Split's unique residual-holding leaf, per class -- three real sites,
# not zero. L18 itself IS dormant (none of the three -- nor any leaf in
# either encoding -- declares `orient`, so the REFUSAL never fires), but
# `orientation.compute_derived_orientations` DOES produce real derived
# values for all three at every solved screen size. What makes `runner.py`'s
# own before/after output byte-identical (see this amendment's dispatch
# report) is a DIFFERENT fact: no consumer in this Python-only substrate
# today reads `Leaf.orientation`/the L14 role-frame fields for rendering
# (SPEC.md §16.1's own disclosed scope note: the realization-layer
# consumer is `frontend/`-side and explicitly out of scope for the
# language-substrate ports this amendment continues) -- so the derivation
# genuinely RUNS, genuinely CHANGES the rebound tree's typed facts, and is
# invisible in `runner.py`'s stdout for a reason that has nothing to do
# with whether the mechanism itself is dormant.
# =============================================================================


def test_real_encodings_have_three_residual_holding_leaves_per_class():
    for filename, layout_name, expected in [
        (
            "lengyue_landscape",
            "lengyue-landscape",
            {"B": "root/H1/V0", "settingsPane": "root/H2/V2/H1/T2/V1", "otherBand": "root/H2/V2/H1/T4/V1"},
        ),
        (
            "lengyue_portrait",
            "lengyue-portrait",
            {"B": "root/V2/V0", "settingsPane": "root/V4/H1/T2/V1", "otherBand": "root/V4/H1/T4/V1"},
        ),
    ]:
        text = (ENCODINGS_DIR / f"{filename}.lyt").read_text()
        slot = loader.load_layouts(text)[layout_name]
        assert find_residual_leaves(slot) == expected
        # L18 itself is dormant: none of the three (nor any other leaf)
        # authors `orient`, so the REFUSAL never fires even though the
        # residual-holding STRUCTURE is real.
        assert find_l18_violations(slot) == []


def test_tree_leaf_specifically_is_not_residual_holding_in_either_encoding():
    """The ruling's own illustrative language centers on the `tree` widget
    ("because the tree is the residual-holding sibling") -- this is the
    one, specific, disclosed gap: in the row `H(tree, T(...), previewBoard)`
    both encodings actually ship, `tree` is FIXED (`min==pref==max`,
    110px landscape / 140px portrait) and `T(...)` (an Exclusive, not a
    Leaf -- orientation is leaf-only, so it could never be a derivation
    subject regardless) is the row's own sole `pref: fr` child today. The
    ruling's own premise does not yet hold against the committed `.lyt`
    content -- see this amendment's dispatch report for the STOP-and-
    report on what encoding edit would be needed to make it hold, which
    this stage does not make unilaterally."""
    for filename, layout_name in [
        ("lengyue_landscape", "lengyue-landscape"),
        ("lengyue_portrait", "lengyue-portrait"),
    ]:
        text = (ENCODINGS_DIR / f"{filename}.lyt").read_text()
        slot = loader.load_layouts(text)[layout_name]
        assert "tree" not in find_residual_leaves(slot)
