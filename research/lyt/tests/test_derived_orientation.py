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
    """[Updated 2026-08-12, M2 stage B2b, ledger rows 2073/2108/2151, the
    ruling-basket census -- this test used to be named
    "...four_residual_holding_leaves..." and pinned `B`/`tree`/
    `settingsPane`/`otherBand`. `settingsPane` DROPS from this dict, not
    because it stopped being a residual position -- its own wrapping
    `V(settingsSubstrip, ...)` still leaves its second child the row's
    `pref: 1fr` residual -- but because item 3 of stage B2b's own
    commission (the pane-granularity fix, ledger rows 2134/2151) opened
    it one level: the residual position is now occupied by a `T(...)` of
    six named sub-panes, not a bare leaf, and per SPEC.md §17.1 "Only a
    LEAF residual-holder is a derivation subject... a Split/Exclusive
    residual-holder... contributes nothing" -- the SAME rule that already
    excludes the control-panel `T(...)` group itself from this dict. Path
    shifts for `tree`/`otherBand`/`B` (landscape's `V2`->`V3`; portrait's
    `V2`->`V3`, `V4`->`V5`) are the OTHER stage-B2b structural edit --
    the new `A_setup` presence-slot leaf (item 2) inserted as a new
    sibling ahead of the tree/panels row (landscape) / ahead of the board
    composite and the tree/panels row (portrait, whose root has no
    separate side column, so `A_setup` sits at the ROOT itself)."""
    for filename, layout_name, expected in [
        (
            "lengyue_landscape",
            "lengyue-landscape",
            {
                "B": "root/H1/V0",
                "tree": "root/H2/V3/H0",
                "otherBand": "root/H2/V3/H1/T4/V1",
            },
        ),
        (
            "lengyue_portrait",
            "lengyue-portrait",
            {
                "B": "root/V3/V0",
                "tree": "root/V5/H0",
                "otherBand": "root/V5/H1/T4/V1",
            },
        ),
    ]:
        text = (ENCODINGS_DIR / f"{filename}.lyt").read_text()
        slot = loader.load_layouts(text)[layout_name]
        assert find_residual_leaves(slot) == expected
        # L18 itself is dormant: none of the three (nor any other leaf)
        # authors `orient`, so the REFUSAL never fires even though the
        # residual-holding STRUCTURE is real.
        assert find_l18_violations(slot) == []


def test_tree_leaf_is_now_residual_holding_in_both_encodings():
    """[Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331 --
    supersedes the prior "...is_not_residual_holding..." test, which
    pinned the STOP-and-report this ruling left open at B1: `tree` was
    fixed and `T(...)` (an Exclusive, never an eligible derivation
    subject regardless) was the row's own sole `pref: fr` child. The
    fork-1 ruling (row 2108) resolves that STOP-and-report by making the
    swap the ruling's own illustrative language ("because the tree is
    the residual-holding sibling") already assumed: `tree` now carries
    `{min <its own established floor>, pref 1fr, max inf}` and is the
    row's unique `fr`-typed child; `T(...)` is pinned at its own
    already-existing componentwise-max floor (664px, unchanged by the
    swap -- see the encodings' own M2 STAGE B2a header note)."""
    for filename, layout_name in [
        ("lengyue_landscape", "lengyue-landscape"),
        ("lengyue_portrait", "lengyue-portrait"),
    ]:
        text = (ENCODINGS_DIR / f"{filename}.lyt").read_text()
        slot = loader.load_layouts(text)[layout_name]
        assert "tree" in find_residual_leaves(slot)


# =============================================================================
# Cross-layout `orientation_overrides` scoping (2026-08-12 fix, review of
# ledger row 2310, Duty 6). Before this fix, `loader.load_layouts` threaded
# ONE bare `widget id -> axis` map verbatim into every `layout NAME = ...`
# fragment parsed from the same `text` -- no `(layout_name, widget_id)`
# scoping anywhere. These tests reconstruct the reviewer's own synthetic
# probe shape: two layouts sharing a widget id in one text blob, an override
# addressed to only ONE of them by name, and a direct assertion that the
# OTHER layout's same-named, structurally unrelated leaf is unaffected.
# =============================================================================

# `shared` is `g1`'s own residual-holding leaf (the unique `pref 1fr`
# sibling beside a FIXED one) -- exactly the shape a real derived override
# would be computed for.
_TWO_LAYOUTS_SHARED_WIDGET_ID = (
    "layout g1 = {min 0px, pref 1fr, max inf} H("
    "{min 100px, pref 100px, max 100px} fixedLeaf[chrome],"
    "{min 0px, pref 1fr, max inf} shared[common]"
    ")\n"
    "layout g2 = {min 0px, pref 1fr, max inf} H("
    "{min 50px, pref 50px, max 50px} shared[chrome],"
    "{min 0px, pref 1fr, max inf} other[common]"
    ")"
)


def test_orientation_overrides_scoped_by_layout_name_does_not_bleed_across_layouts():
    """The direct loader-level reproduction of the reviewer's probe. `g1`
    and `g2` both declare a widget called `shared`; only `g1`'s `shared` is
    residual-holding (`g2`'s is a small FIXED, non-residual leaf beside its
    own `pref 1fr` sibling `other`). An override addressed to `g1` alone
    (`{"g1": {"shared": "h"}}`, the post-fix per-layout shape) must land on
    `g1.shared` and must NOT be visible on `g2.shared`, which was never
    solved for this override at all."""
    layouts = loader.load_layouts(
        _TWO_LAYOUTS_SHARED_WIDGET_ID,
        orientation_overrides={"g1": {"shared": "h"}},
    )
    g1_shared = layouts["g1"].node.children[1]
    g2_shared = layouts["g2"].node.children[0]
    assert g1_shared.node.widget == "shared"
    assert g2_shared.node.widget == "shared"
    # The override landed where it was addressed.
    assert g1_shared.node.orientation == "h"
    assert g1_shared.node.orientation_declared is False
    # It did NOT bleed into the other layout's same-named leaf -- `g2`'s
    # `shared` still resolves to the ordinary load-time default ('v'),
    # exactly as if no override had been passed at all.
    assert g2_shared.node.orientation == "v"
    assert g2_shared.node.orientation_declared is False


def test_orientation_overrides_unaddressed_layout_is_byte_identical_to_no_override():
    """A stronger form of the same assertion: `g2`'s loaded `Slot`, when an
    override is present but addressed only to `g1`, is identical to `g2`'s
    own `Slot` loaded from a text carrying `g2` ALONE with no override at
    all -- i.e. the presence of an override elsewhere in the same text
    blob has literally zero effect on a layout it does not name."""
    with_override = loader.load_layouts(
        _TWO_LAYOUTS_SHARED_WIDGET_ID,
        orientation_overrides={"g1": {"shared": "h"}},
    )["g2"]
    g2_only_text = (
        "layout g2 = {min 0px, pref 1fr, max inf} H("
        "{min 50px, pref 50px, max 50px} shared[chrome],"
        "{min 0px, pref 1fr, max inf} other[common]"
        ")"
    )
    without_override = loader.load_layouts(g2_only_text)["g2"]
    assert with_override == without_override


def test_rebind_end_to_end_addresses_its_derived_map_to_the_solved_layout_only():
    """The realistic end-to-end path: `orientation.rebind` computes a
    derived override for `g1` from `g1`'s own solve and re-loads the FULL
    `text` (which still contains `g2`) through `loader.load_layouts`. Post-
    fix, `rebind` addresses its derived map to `layout_name` (`g1`)
    specifically, so a subsequent independent load of `g2` from the same
    text is unaffected by whatever `g1`'s solve derived for the widget id
    `g1` and `g2` happen to share."""
    text = _TWO_LAYOUTS_SHARED_WIDGET_ID
    g1 = loader.load_layouts(text)["g1"]
    # residual along-extent = 500 - 100 (fixedLeaf) = 400; cross-extent =
    # 200 -- aspect 2 > 1 -> 'h', a genuine CHANGE from the load-time
    # placeholder default 'v', so this proves the derived value actually
    # took effect rather than merely matching the default either way.
    result = _solve(g1, w_px=500, h_px=200)
    assert result.status == "OPTIMAL"
    derived = orientation.compute_derived_orientations(g1, result)
    assert derived == {"shared": "h"}
    rebound_g1 = orientation.rebind(text, "g1", g1, result)
    assert rebound_g1.node.children[1].node.orientation == "h"
    # `g2`, loaded independently from the SAME text, never saw this
    # derivation -- its own `shared` leaf is still the ordinary load-time
    # default, not `g1`'s derived 'h'.
    g2 = loader.load_layouts(text)["g2"]
    assert g2.node.children[0].node.widget == "shared"
    assert g2.node.children[0].node.orientation == "v"
    assert g2.node.children[0].node.orientation_declared is False
