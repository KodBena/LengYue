"""pytest coverage for the LYT prototype, per the build commission's
required minimum: a well-formed encoding solves; a content-driven-sizing
description is rejected; an L2-violating description is rejected. Also
covers the third typed prohibition this prototype independently
discovered/enforces (untypable system+release presence) and one
end-to-end CP-SAT solve sanity check (board is square, root fills the
viewport, no negative rectangles).

F11 fix (review row 1609,
.claude/dispatch-reports/lyt-compiler-prototype-review.md): the review's
own count of test gaps — no regression test for either axis-conflation
bug the original builder found and fixed, no test that stage 2 actually
moves anything (which would have caught F1), no test of fr bounds (F2),
no independent tiling/partition invariant check on solved output — is
closed by the tests below, plus regression coverage for F3 (Sizing/Extent
runtime vocabulary refusal) and F8 (bare `envelope` refused at load time,
not parse time).
"""
import lyt_ast as ast
import pytest
from pathlib import Path

import loader
from errors import LytLoadError, LytParseError
from compiler import solve_lexicographic

ENCODINGS_DIR = Path(__file__).parent.parent / "encodings"


def _load(name: str):
    text = (ENCODINGS_DIR / f"{name}.lyt").read_text()
    return loader.load_layouts(text)


@pytest.mark.parametrize(
    "filename,layout_name",
    [
        ("q5go", "q5go"),
        ("ogs", "ogs"),
        ("lengyue_landscape", "lengyue-landscape"),
        ("lengyue_portrait", "lengyue-portrait"),
        ("current_row_repaired", "current-row-repaired"),
    ],
)
def test_well_formed_encoding_loads(filename, layout_name):
    layouts = _load(filename)
    assert layout_name in layouts


def test_well_formed_encoding_solves():
    """A well-formed encoding (q5go, at a screen size where it's
    geometrically feasible — see the build report for why landscape sizes
    are NOT all feasible for every encoding) actually solves via CP-SAT,
    end to end, with a sane board rectangle."""
    layouts = _load("q5go")
    slot = layouts["q5go"]
    result = solve_lexicographic(
        slot,
        class_id="test",
        w_px=1920,
        h_px=1080,
        board_widget="B",
        reach_preferred_widgets=["A", "I"],
        time_limit_s=30,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    board_path = [p for p, w in result.leaf_names.items() if w == "B"][0]
    board_rect = result.rects[board_path]
    assert board_rect.w == board_rect.h  # aspect 1
    assert board_rect.w > 0
    root_rect = result.rects["root"]
    assert root_rect.w == 1920
    assert root_rect.h == 1080
    for rect in result.rects.values():
        assert rect.x >= 0 and rect.y >= 0 and rect.w >= 0 and rect.h >= 0


def test_content_driven_sizing_is_rejected():
    """Typed prohibition #1 (§4.2 line 344-345): 'max CONTENT' is the
    document's own spelling-out of content-driven sizing. It must be
    refused at load time with a structured, machine-checkable error."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_content")
    assert exc_info.value.detail.get("prohibition") == "content-driven-sizing"


def test_system_release_presence_is_rejected():
    """Typed prohibition #2 (§4.1 line 268): the (by='system',
    hidden='release') presence combination is untypable."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_presence")
    assert exc_info.value.detail.get("prohibition") == "system-release-presence"


def test_l2_violation_is_rejected():
    """L2 (zero-standing-cost affordances, §4.2 line 371-380): the
    sidebar-collapse rail standing alone as a dedicated split child is the
    document's own worked example of a violation."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_l2")
    assert exc_info.value.detail.get("law") == "L2"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l2_conformer_does_not_raise():
    """The board/tree/controls toggle cluster riding the nav bar (§5.1
    line 481-482) is the document's own named L2 CONFORMER — make sure the
    checker doesn't flag it (a checker that flags everything chrome/action
    would pass the violation test above for the wrong reason)."""
    layouts = _load("current_row_repaired")
    assert "current-row-repaired" in layouts  # loads clean, i.e. no L2 raise anywhere in the tree


def test_unknown_domain_is_rejected():
    """A basic ADR-0002 sanity check independent of the two named
    prohibitions: an unrecognized domain literal must be refused, not
    silently coerced."""
    from parser import parse_layouts

    raws = parse_layouts("layout bogus = {min 0px, pref 0px, max inf} X[not-a-real-domain]")
    with pytest.raises(LytLoadError):
        loader.load_slot(raws[0].slot)


# --- F1 regression: reach-preferred must measure shortfall on the -----------
# widget's own ALONG axis, not on `w` unconditionally --------------------


def test_reach_preferred_measures_shortfall_on_along_axis():
    """F1 (MAJOR, review row 1609): a V-split child's declared `pref`
    describes its HEIGHT (§4.2/Slot docstring: "the slot's extent ALONG
    ITS PARENT'S AXIS"), not its width. The pre-fix stage-2 objective
    measured shortfall on `w` unconditionally, so a V-stack whose combined
    height prefs exceed the available height reported a false "no
    shortfall" (-0.0) instead of the true lexicographic optimum.

    Witness (identical to the review's own reproduction, `probe7.py`): a
    500x400 V-stack with prefs 100 (top) + 350 (mid) = 450 > 400 — a
    genuine, unavoidable 50px total shortfall. Also asserts stage 2
    actually MOVED something (closing the review's related F11 gap: "no
    test that stage 2 actually moves anything")."""
    prog = """
    layout squeeze =
      {min 0px, pref 1fr, max inf} V(
        {min 10px, pref 100px, max inf} top[common, info],
        {min 10px, pref 350px, max inf} mid[common, info]
      )
    """
    layouts = loader.load_layouts(prog)
    result = solve_lexicographic(
        layouts["squeeze"],
        class_id="t",
        w_px=500,
        h_px=400,
        board_widget=None,
        reach_preferred_widgets=["top", "mid"],
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    heights = {result.leaf_names[p]: result.rects[p].h for p in result.leaf_names}
    true_shortfall = max(0, 100 - heights["top"]) + max(0, 350 - heights["mid"])
    assert true_shortfall == 50, f"expected the true lexicographic-optimum shortfall (50), got {true_shortfall} from heights {heights}"
    assert heights["top"] + heights["mid"] == 400  # V-partition equality still holds
    # The pre-fix bug reported this stage's objective as -0.0 (false
    # zero); post-fix it must report the true -50.
    assert result.objective_values == [-50.0]


def test_axis_conflation_regression_min_max_applies_only_to_along_axis():
    """Regression test for the FIRST of the two axis-conflation bugs the
    original builder self-reported as found-and-fixed but never covered
    with a test (review F11): a leaf's own min/max sizing bounds only its
    extent ALONG ITS PARENT'S axis, never the cross axis (which is
    pinned by the parent's own cross-fill equality instead). Before that
    fix, a `{min 28px, max 28px}` leaf under a V-parent whose actual width
    (from the H-split it sits in) is 500px would ALSO get its WIDTH
    bounded to [28,28] — an unsatisfiable conflict with the 500px cross-
    fill equality, making the whole program spuriously INFEASIBLE."""
    prog = """
    layout axistest =
      {min 0px, pref 1fr, max inf} H(
        {min 500px, pref 500px, max 500px} wide[common, info],
        {min 0px, pref 1fr, max inf} V(
          {min 28px, pref 28px, max 28px} shortRow[common, info],
          {min 0px, pref 1fr, max inf} filler[common, info]
        )
      )
    """
    layouts = loader.load_layouts(prog)
    result = solve_lexicographic(
        layouts["axistest"], class_id="t", w_px=1000, h_px=100, board_widget=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE"), (
        "spuriously INFEASIBLE -- shortRow's {min 28px, max 28px} sizing "
        "(its ALONG axis is height, under its V parent) must not also "
        "bound its width, which the cross-fill equality forces to 500"
    )
    short_row_path = [p for p, w in result.leaf_names.items() if w == "shortRow"][0]
    rect = result.rects[short_row_path]
    assert rect.h == 28  # bounded, correctly, on its along axis
    assert rect.w == 500  # NOT bounded to 28 -- cross-fill equality wins


def test_axis_conflation_regression_slack_measured_on_along_axis():
    """Regression test for the SECOND axis-conflation bug (review F11,
    same self-reported-but-untested gap as above): stage 3's slack term
    (`_collect_slack_terms`) must measure `max - actual` on the SAME axis
    a slot's sizing describes. Reusing `axistest` from the along-axis test
    above: shortRow's max (28px) applies to its HEIGHT; if slack were
    measured on its WIDTH (500px actual) instead, the slack IntVar's
    non-negative domain [0, 10_000] could not represent `28 - 500`,
    making stage 3 spuriously INFEASIBLE even once stage 1's hard
    constraints are satisfiable."""
    prog = """
    layout axistest2 =
      {min 0px, pref 1fr, max inf} H(
        {min 500px, pref 500px, max 500px} wide[common, info],
        {min 0px, pref 1fr, max inf} V(
          {min 28px, pref 28px, max 28px} shortRow[common, info],
          {min 0px, pref 1fr, max inf} filler[common, info]
        )
      )
    """
    layouts = loader.load_layouts(prog)
    result = solve_lexicographic(
        layouts["axistest2"], class_id="t", w_px=1000, h_px=100, board_widget=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    # stage 3 (minimize-slack) ran and produced a real objective value,
    # i.e. it didn't silently no-op or blow up.
    assert len(result.objective_values) >= 1


# --- F2 regression: fr in min/max position must not silently vanish --------


def test_fr_min_bound_not_silently_dropped():
    """F2 (MAJOR, review row 1609): `{min 100fr}` on an H-split child
    used to silently drop to no bound at all (`_extent_px` returned None,
    every caller treated None as "unconstrained"), so a slot whose
    declared minimum is "ALL the free space" could solve to w=0 (witness
    program identical to the review's own `probes.py` PROBE 3). Post-fix,
    `100fr` resolves to 100% of the enclosing Split's own along-length —
    the whole split — so `wide` must claim the entire 1000px width and
    `other` is left with 0."""
    prog = """
    layout frdrop =
      {min 0px, pref 1fr, max inf} H(
        {min 100fr, pref 100fr, max inf} wide[common, info],
        {min 0px, pref 1fr, max inf} other[common, info]
      )
    """
    layouts = loader.load_layouts(prog)
    result = solve_lexicographic(
        layouts["frdrop"], class_id="t", w_px=1000, h_px=500, board_widget=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    widths = {result.leaf_names[p]: result.rects[p].w for p in result.leaf_names}
    assert widths["wide"] == 1000, f"'min 100fr' must never silently solve to 0 -- got {widths}"
    assert widths["other"] == 0


def test_fr_max_bound_caps_as_a_percentage_of_the_split():
    """F2 companion: an `fr` MAX behaves symmetrically -- `max 25fr` caps
    a slot to 25% of its enclosing Split's own length, a real, checkable
    number, not an unbounded escape hatch. Mirrors the real §5.3 OGS
    encoding's `I[info]{..., max 25fr}` (consult-doc line 537), which
    pre-fix solved to 46% of the viewport height (888/1920) at
    1080x1920 -- see the fix report for that exact before/after."""
    prog = """
    layout frcap =
      {min 0px, pref 1fr, max inf} V(
        {min 0px, pref 1fr, max inf} rest[common, info],
        {min 0px, pref 0px, max 25fr} capped[common, info]
      )
    """
    layouts = loader.load_layouts(prog)
    result = solve_lexicographic(
        layouts["frcap"], class_id="t", w_px=200, h_px=1000, board_widget=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    heights = {result.leaf_names[p]: result.rects[p].h for p in result.leaf_names}
    assert heights["capped"] <= 250, f"'max 25fr' of a 1000px-tall split must cap at <=250px, got {heights}"


def test_fr_bound_without_enclosing_split_is_refused():
    """F2 companion: an fr min/max bound has no defined denominator for
    the ROOT slot or a direct Exclusive/T-node child (which shares its
    parent's FULL rectangle on both axes -- no single partition-axis
    length to take a share of). Rather than silently drop it (the
    original defect) or guess an arbitrary meaning, this is refused
    loudly at compile time."""
    prog = """
    layout frnodenom =
      {min 0px, pref 1fr, max inf} T(
        {min 50fr, pref 1fr, max inf} a[blackbox],
        {min 0px, pref 1fr, max inf} b[blackbox]
      )
    """
    layouts = loader.load_layouts(prog)
    with pytest.raises(LytLoadError) as exc_info:
        solve_lexicographic(
            layouts["frnodenom"], class_id="t", w_px=1000, h_px=500, board_widget=None
        )
    assert exc_info.value.detail.get("prohibition") == "unresolvable-fr-bound"


# --- F3 regression: Sizing/Extent runtime vocabulary validation ------------


def test_extent_content_unit_construction_is_rejected():
    """F3 (MODERATE, review row 1609): `Extent.unit`'s `Literal["px","ch",
    "fr"]` annotation is a typecheck-only promise -- the raw Python
    constructor used to accept `unit='content'` silently (the review's own
    `probes.py` PROBE 2). `__post_init__` now refuses it, mirroring
    `Presence.__post_init__`'s existing runtime guard."""
    with pytest.raises(ValueError):
        ast.Extent(unit="content", v=5)


def test_sizing_content_basis_construction_is_rejected():
    """F3 companion: same gap, `Sizing.basis`."""
    with pytest.raises(ValueError):
        ast.Sizing(
            min=ast.Extent(unit="px", v=0),
            pref=ast.Extent(unit="px", v=100),
            max="inf",
            basis="content",
        )


# --- F8 regression: bare `envelope` keyword is spec-legal syntax, --------
# refused (correctly) at LOAD time, not a PARSE error -----------------------


def test_bare_envelope_keyword_parses_but_is_refused_at_load_time():
    """F8 (MINOR, review row 1609): the base EBNF's `envelope` production
    (consult-doc line 286) has no required state list -- a bare
    `envelope` keyword is spec-legal syntax. An earlier version of this
    parser made the `: {states}` clause mandatory, so the document's own
    legal syntax was a PARSE error, which the review named as an
    undisclosed breaking change. It must now parse, and be refused
    instead at LOAD time, for the more precise reason that L3 requires
    the enumerated states it doesn't have."""
    prog = """
    layout bare-envelope-test =
      {min 0px, pref 0px, max 32px, envelope} navBarRow[chrome, info]
    """
    from parser import parse_layouts

    # Parsing alone must succeed -- this is the part that used to raise
    # LytParseError.
    raws = parse_layouts(prog)
    assert raws[0].slot.sizing.envelope_bare is True

    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(prog)
    assert exc_info.value.detail.get("law") == "L3"


# --- F11: independent tiling-invariant walk, as a suite test --------------


def _tiling_violations(slot, result, *, path="root"):
    """Recompute partition invariants directly from the solved rects
    (containment, exact partition sums, cross-axis fill modulo the
    disclosed aspect relaxation, T-children sharing one rectangle) —
    ported from the review's own independent verification (`probes.py`
    PROBE 4) into the suite per its own recommendation ("I ran that last
    one myself ... it should be in the suite", F11)."""
    bad = []

    def walk(slot, path):
        node = slot.node
        r = result.rects[path]
        if isinstance(node, ast.Split):
            along = 0
            for i, child in enumerate(node.children):
                cp = f"{path}/{node.axis.upper()}{i}"
                cr = result.rects[cp]
                if not (
                    cr.x >= r.x
                    and cr.y >= r.y
                    and cr.x + cr.w <= r.x + r.w
                    and cr.y + cr.h <= r.y + r.h
                ):
                    bad.append(f"{cp}: child rect escapes parent")
                along += cr.w if node.axis == "h" else cr.h
                is_aspect_leaf = isinstance(child.node, ast.Leaf) and child.sizing.aspect is not None
                cross_child = cr.h if node.axis == "h" else cr.w
                cross_parent = r.h if node.axis == "h" else r.w
                if not is_aspect_leaf and cross_child != cross_parent:
                    bad.append(f"{cp}: cross {cross_child} != parent {cross_parent}")
                walk(child, cp)
            parent_along = r.w if node.axis == "h" else r.h
            if along != parent_along:
                bad.append(f"{path}: partition sum {along} != parent {parent_along}")
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                cp = f"{path}/T{i}"
                cr = result.rects[cp]
                if (cr.w, cr.h) != (r.w, r.h):
                    bad.append(f"{cp}: T child rect != T rect")
                walk(child, cp)

    walk(slot, path)
    return bad


@pytest.mark.parametrize(
    "filename,layout_name,w,h",
    [
        ("q5go", "q5go", 1920, 1080),
        ("current_row_repaired", "current-row-repaired", 1920, 1080),
        ("lengyue_landscape", "lengyue-landscape", 1920, 1080),
        ("lengyue_portrait", "lengyue-portrait", 1080, 1920),
    ],
)
def test_tiling_invariants_hold_on_every_solvable_encoding(filename, layout_name, w, h):
    layouts = _load(filename)
    slot = layouts[layout_name]
    result = solve_lexicographic(
        slot, class_id="t", w_px=w, h_px=h, board_widget="B", reach_preferred_widgets=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE"), f"{filename}@{w}x{h}: {result.status}"
    violations = _tiling_violations(slot, result)
    assert not violations, f"{filename}@{w}x{h} tiling violations: {violations}"


# =============================================================================
# AMENDMENT 1 (ledger row 1670): preserve implies a genuine reservation --
# min := max(min, pref) on the presence-bearing axis. See
# `SPEC-AMENDMENTS.md` and `loader.py`'s `_apply_preserve_reservation`
# docstring for the full rationale and seam-choice disclosure.
# =============================================================================


def test_preserve_raises_min_to_pref_in_the_loaded_ast():
    """The floor is raised at LOAD TIME, in the typed AST itself -- not
    merely as a compiler-internal policy. A `@toggle(_, preserve)` slot
    whose declared `min` (0px) is below its `pref` (75px) must come out
    of `loader.load_layouts` with `sizing.min == sizing.pref`; a plain
    `@fixed` sibling with the identical min/pref/max numbers must be
    left untouched (the rule is presence-conditioned, not a blanket
    floor-raise)."""
    prog = """
    layout preservetest =
      {min 0px, pref 1fr, max inf} V(
        @toggle(system, preserve) {min 0px, pref 75px, max 75px} banner[common, info],
        @fixed {min 0px, pref 75px, max 75px} plainFixed[common, info],
        {min 0px, pref 1fr, max inf} filler[common, info]
      )
    """
    layouts = loader.load_layouts(prog)
    slot = layouts["preservetest"]
    banner = slot.node.children[0]
    plain_fixed = slot.node.children[1]
    assert banner.sizing.min.unit == "px" and banner.sizing.min.v == 75.0, (
        "preserve slot's min must be raised to its pref (75px), not left at "
        f"its declared 0px floor -- got {banner.sizing.min!r}"
    )
    assert plain_fixed.sizing.min.v == 0.0, (
        "the amendment is presence-conditioned -- an @fixed sibling with the "
        "SAME declared min/pref must be left alone, not swept up by a "
        "blanket floor-raise"
    )


def test_preserve_reservation_is_a_noop_when_min_already_meets_pref():
    """A preserve slot whose min already equals (or exceeds) its pref --
    e.g. `setup[go, action]{min 24px, pref 24px, max 24px}` in
    `current_row_repaired.lyt` -- is untouched; `max(min, pref)` is a
    no-op there by construction, not a special case this test needs the
    loader to detect explicitly, but worth pinning so a future change to
    the comparison direction (e.g. accidentally lowering min to pref)
    would be caught."""
    prog = """
    layout noop =
      {min 0px, pref 1fr, max inf} V(
        @toggle(user, preserve) {min 24px, pref 24px, max 24px} setup[go, action]
      )
    """
    layouts = loader.load_layouts(prog)
    setup = layouts["noop"].node.children[0]
    assert setup.sizing.min.v == 24.0


def test_preserve_min_pref_unit_mismatch_is_refused():
    """Disclosed edge case: `min` and `pref` in different, incomparable
    units (px vs fr) can't be compared by 'max' without a resolved common
    unit. Refused loudly (ADR-0002) rather than guessed."""
    prog = """
    layout mismatch =
      {min 0px, pref 1fr, max inf} V(
        @toggle(system, preserve) {min 10px, pref 1fr, max inf} weird[common, info]
      )
    """
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(prog)
    assert exc_info.value.detail.get("law") == "preserve-reservation"


def test_preserve_banners_hold_their_reservation_in_solved_geometry():
    """End-to-end witness closing the cold review's OBSERVATION finding
    ("'preserve' banners can and do solve to zero height"): pre-amendment,
    `current_row_repaired.lyt`'s captureBanner/saveBanner/systemLog
    (declared `min 0px`, `preserve`) solved to h=0 at 1920x1080 -- the
    ENTIRE combined pref (32+32+250=314px) became stage-2 shortfall,
    because nothing in the compiled model actually floored their height.
    Post-amendment, their loaded `sizing.min` already equals their `pref`
    (see the two loader-level tests above), so the compiled model has a
    genuine hard floor: this test re-solves the real fixture and checks
    the SOLVED heights, not just the loaded AST, actually honor it."""
    layouts = _load("current_row_repaired")
    slot = layouts["current-row-repaired"]
    result = solve_lexicographic(
        slot, class_id="t", w_px=1920, h_px=1080, board_widget="B", reach_preferred_widgets=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    heights = {result.leaf_names[p]: result.rects[p].h for p in result.leaf_names}
    assert heights["captureBanner"] == 32
    assert heights["saveBanner"] == 32
    assert heights["systemLog"] == 250
    # Stage 2 (reach-preferred) must report NO shortfall for these three
    # now that they're hard-floored -- pre-amendment this stage's
    # objective was -314.0 (all three banners' combined pref, entirely
    # unmet). The overall objective may still carry a small non-zero
    # stage-2 term from OTHER reach-preferred widgets the board's own
    # shrink now shortchanges, but it must not still contain the full
    # 314px the banners used to account for.
    assert result.objective_values[1] > -314.0


def test_current_row_repaired_1920x600_is_expected_infeasible():
    """Pinned expected-INFEASIBLE regression (AMENDMENT 1 consequence,
    named honestly rather than dodged, per the ledger row 1670
    instruction). Mechanism: pre-amendment, `current_row_repaired.lyt`
    solved OPTIMAL at 1920x600 (and every height down to 330px) because
    the three system-preserve banners' `min 0px` let the solver squeeze
    them to nothing whenever the board-maximize stage wanted the room.
    Post-amendment their floor is hard (32+32+250=314px combined, plus
    the 32-64px envelope nav bar and the board composite's own minimum),
    so a 600px-tall viewport can no longer route around the mandatory
    314px banner reservation -- this is now correctly INFEASIBLE, not a
    silently-shrunk board. (Bisected: the real threshold sits between
    640px, still OPTIMAL, and 650px; 600px is comfortably inside the
    newly-infeasible band.) None of the runner's four representative
    screen sizes (1920x1080/2560x1440/1280x1024/1080x1920-portrait) cross
    this threshold -- current-row-repaired stays OPTIMAL at the first
    three and was ALREADY INFEASIBLE at portrait pre-amendment (an
    unrelated aspect/exact-cross-fill collision, see README's "Honest
    caveat" section) -- so this synthetic size is the regression witness
    for the amendment's own predicted consequence."""
    layouts = _load("current_row_repaired")
    slot = layouts["current-row-repaired"]
    result = solve_lexicographic(
        slot, class_id="t", w_px=1920, h_px=600, board_widget="B", reach_preferred_widgets=None
    )
    assert result.status == "INFEASIBLE"


# =============================================================================
# AMENDMENT 2 (ledger row 1671): L2 dominance semantics -- a Split node
# violates L2 when its direct chrome/action-leaf children's combined pref
# is a strict majority of its total reserved extent (all direct children's
# pref, along the split's own partition axis). See `SPEC-AMENDMENTS.md`
# and `wellformed.py`'s module docstring for the full derivation.
# =============================================================================


def test_l2_decoy_construction_is_rejected():
    """The cold review's own witness (`lyt-compiler-cold-review.md`,
    "L2 checker is trivially defeated by a near-zero decoy sibling"):
    wrapping a chrome/action toggle together with a near-zero non-chrome
    decoy sibling in its OWN dedicated Split used to flip the OLD
    tree-shape checker's verdict from VIOLATION to CONFORMS (a bare
    non-chrome sibling was all the old check required, regardless of
    size). The new dominance check closes this: the inner H's own
    chrome/action content (26px) is a strict majority of its own 27px
    total (26+1), independent of what its own outer siblings look like."""
    prog = """
    layout l2_sneak =
      {min 0px, pref 1fr, max inf} H(
        {min 27px, pref 27px, max 27px} H(
          {min 26px, pref 26px, max 26px} sidebarToggle[chrome, action],
          {min 1px, pref 1px, max 1px} decoy[common, info]
        ),
        {min 168px, pref 168px, max 168px} V(
          {min 0px, pref 150px, max 150px} preview[common, info]
        ),
        {min 0px, pref 900px, max 900px} V(
          {min 0px, pref 900px, max 900px} mainColumnPlaceholder[common, info]
        )
      )
    """
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(prog)
    assert exc_info.value.detail.get("law") == "L2"
    violations = exc_info.value.detail.get("violations", [])
    assert len(violations) == 1
    assert "dominance violation" in violations[0]


def test_l2_mixed_toolbar_conforms():
    """A genuine mixed toolbar -- several substantial non-chrome groups
    plus a couple of chrome/action toggle buttons whose combined pref is
    comfortably a minority of the row's total -- must still load clean.
    A checker that flags every chrome/action leaf regardless of context
    would pass `test_l2_decoy_construction_is_rejected` above for the
    wrong reason; this is the check on that."""
    prog = """
    layout mixed_toolbar =
      {min 0px, pref 1fr, max inf} H(
        {min 0px, pref 400px, max inf} title[common, info],
        {min 0px, pref 300px, max inf} search[common, info+action],
        {min 24px, pref 24px, max 24px} sidebarToggle[chrome, action],
        {min 24px, pref 24px, max 24px} boardToggle[chrome, action]
      )
    """
    layouts = loader.load_layouts(prog)
    assert "mixed_toolbar" in layouts


def test_l2_current_row_repaired_toggle_cluster_rides_the_nav_bar():
    """Regression for the AMENDMENT 2 restructuring of
    `current_row_repaired.lyt` itself (see that file's own header note):
    the toggle cluster's dedicated `H{pref 120px}` wrapper -- 96px of
    chrome content against a 120px total, a genuine unambiguous majority
    -- was unwrapped so its five leaves ride the nav-bar row directly.
    The full fixture must load clean (this is the SAME assertion as
    `test_l2_conformer_does_not_raise`, restated here to name the
    specific mechanism this amendment's restructuring addresses)."""
    layouts = _load("current_row_repaired")
    assert "current-row-repaired" in layouts


def test_l2_wrapped_toggle_cluster_would_violate():
    """Confirms the PRE-restructuring shape (the toggle cluster still
    wrapped in its own dedicated Split) really is a genuine, unambiguous
    majority violation under the new semantics -- not something that
    happened to pass only because of how `current_row_repaired.lyt` sits
    in a bigger tree. Isolated, minimal reproduction of the wrapped
    cluster alone."""
    prog = """
    layout wrapped_cluster =
      {min 0px, pref 1fr, max inf} H(
        {min 0px, pref 120px, max inf} H(
          {min 24px, pref 24px, max 24px} sidebarToggle[chrome, action],
          {min 24px, pref 24px, max 24px} boardToggle[chrome, action],
          {min 24px, pref 24px, max 24px} treeToggle[chrome, action],
          {min 24px, pref 24px, max 24px} ctrlToggle[chrome, action],
          {min 24px, pref 24px, max 24px} locale[common, action]
        )
      )
    """
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(prog)
    assert exc_info.value.detail.get("law") == "L2"


# =============================================================================
# emit_ts.py -- the LYT-adoption-roadmap Phase-1 "shadow mode" TS codegen
# (commission: lyt-shadow-harness). Coverage per the build commission's own
# required minimum: stable output shape, deterministic ordering. Also covers
# the INFEASIBLE-size handling and the class-registry/registration split
# (the bug the emitter's own build caught and fixed before this test was
# written: `LYT_SCREEN_CLASSES` must report each class's OWN representative
# point, not whichever solved-size registration happened to touch that
# class id last).
# =============================================================================

import re

import emit_ts


def test_emit_ts_build_solved_registrations_covers_every_representative_size():
    registrations, screen_classes = emit_ts.build_solved_registrations()
    from runner import SCREEN_SIZES

    assert [r["label"] for r in registrations] == [label for label, _, _ in SCREEN_SIZES]
    # current-row-repaired registers exactly one screen class ('default'),
    # solved against at every representative size (runner.py's own module
    # docstring) -- so all four registrations share one classId.
    assert {r["classId"] for r in registrations} == {"default"}
    assert screen_classes == [{"id": "default", "wPx": 1920, "hPx": 1080}]


def test_emit_ts_landscape_sizes_solve_optimal_with_nonempty_slots():
    registrations, _ = emit_ts.build_solved_registrations()
    by_label = {r["label"]: r for r in registrations}
    for label in ("1920x1080", "2560x1440", "1280x1024"):
        reg = by_label[label]
        assert reg["status"] == "OPTIMAL", f"{label}: {reg['status']}"
        assert reg["slots"], f"{label}: expected non-empty slots"
        assert "B" in reg["slots"]  # the board widget always solves a rect when OPTIMAL


def test_emit_ts_portrait_size_is_infeasible_with_empty_slots_not_dropped():
    """1080x1920-portrait is a REAL infeasibility (SPEC-AMENDMENTS.md
    Amendment 1's consequence: the mandatory 314px preserve-banner floor
    plus the nav bar leaves no room for a board at portrait proportions).
    The emitter must record it as an INFEASIBLE entry with empty slots,
    not silently omit the size -- the conformance harness needs to know a
    size was attempted and refused, not just see it missing from the
    registry."""
    registrations, _ = emit_ts.build_solved_registrations()
    by_label = {r["label"]: r for r in registrations}
    portrait = by_label["1080x1920-portrait"]
    assert portrait["status"] == "INFEASIBLE"
    assert portrait["slots"] == {}
    assert portrait["wPx"] == 1080 and portrait["hPx"] == 1920


def test_emit_ts_slots_from_result_rejects_duplicate_widget_ids():
    """`_slots_from_result`'s dict is keyed by widget id; two leaf paths
    sharing one widget id would silently drop one rect if not guarded.
    Refused loudly instead (ADR-0002)."""
    from compiler import SolveResult, SolvedRect

    result = SolveResult(
        class_id="t",
        w_px=100,
        h_px=100,
        rects={"root/H0": SolvedRect(0, 0, 50, 50), "root/H1": SolvedRect(50, 0, 50, 50)},
        leaf_names={"root/H0": "dup", "root/H1": "dup"},
        objective_values=[],
        status="OPTIMAL",
    )
    with pytest.raises(ValueError, match="duplicate widget id"):
        emit_ts._slots_from_result(result)


def test_emit_ts_render_ts_output_is_deterministic():
    """Re-rendering the SAME solved registrations must produce a
    byte-identical .gen.ts text -- no wall-clock timestamp, no hostname, no
    unordered-set/dict iteration leaking into the output. This is the
    build commission's explicit 'deterministic ordering' requirement."""
    registrations, screen_classes = emit_ts.build_solved_registrations()
    text_a = emit_ts.render_ts(registrations, screen_classes)
    text_b = emit_ts.render_ts(registrations, screen_classes)
    assert text_a == text_b


def test_emit_ts_render_ts_slots_are_sorted_by_widget_id():
    """`_slots_from_result` sorts its output; confirm that sortedness
    survives into the emitted TS text for at least one non-trivial
    registration (stable output shape, not just stable across re-runs)."""
    registrations, screen_classes = emit_ts.build_solved_registrations()
    text = emit_ts.render_ts(registrations, screen_classes)
    # Isolate JUST the 1920x1080 registration's own block: from its
    # `label:` line to the next registration-closing "  },\n" line (NOT the
    # first "];" in the file, which only closes the WHOLE array after every
    # registration -- an earlier version of this test split on "];" and
    # accidentally scooped up every registration's keys concatenated,
    # which is unsorted overall even though each one is sorted on its own).
    after_label = text.split('label: "1920x1080"')[1]
    landscape_block = after_label.split("\n  },\n")[0]
    keys_in_order = re.findall(r'"\s*([A-Za-z0-9_-]+)"\s*:\s*\{ x:', landscape_block)
    assert keys_in_order == sorted(keys_in_order)
    assert len(keys_in_order) == 45  # sanity: matches emit_ts.py's own printed count


def test_emit_ts_render_ts_emits_no_content_basis_and_marks_generated():
    """Sanity checks on the header/shape a human or a CI job would look
    for: the GENERATED marker (never-hand-edit), the regenerate command,
    and that every LYT_SOLVED_LAYOUT entry has a status field drawn from
    the closed LytSolveStatus vocabulary."""
    registrations, screen_classes = emit_ts.build_solved_registrations()
    text = emit_ts.render_ts(registrations, screen_classes)
    assert "GENERATED FILE" in text
    assert "do not hand-edit" in text
    # emit_ts.py's --registration generalization (lyt-constants-swap,
    # ledger row 1687) turned the regen command into a per-registration
    # template; the assertion's MEANING (a regen command is present and
    # correct) is unchanged, only the constant's name/shape.
    assert emit_ts.GENERATED_REGEN_COMMAND_TMPL.format(reg=emit_ts._REGISTRATION_NAME) in text
    for r in registrations:
        assert r["status"] in ("OPTIMAL", "FEASIBLE", "INFEASIBLE")


def test_emit_ts_main_writes_file_matching_render_ts(tmp_path):
    """End-to-end: `main(["--out", ...])` writes a file whose content
    equals `render_ts` applied to a fresh `build_solved_registrations()`
    call -- confirms the CLI wiring doesn't diverge from the pure
    functions the other tests exercise directly."""
    out_path = tmp_path / "lyt-solved-layout.gen.ts"
    exit_code = emit_ts.main(["--out", str(out_path)])
    assert exit_code == 0
    written = out_path.read_text()
    registrations, screen_classes = emit_ts.build_solved_registrations()
    assert written == emit_ts.render_ts(registrations, screen_classes)


# =============================================================================
# --baseline waiver mechanism + current-row-asis (lyt-constants-swap
# commission, ledger row 1687): the AS-IS conformance baseline
# (`encodings/current_row_asis.lyt`) is honestly L2-non-conformant at two
# disclosed sites -- `wellformed.Waiver` + `check_wellformed`'s waiver
# arbitration is the mechanism that lets it load anyway, loudly, without
# weakening the checker for every OTHER encoding. `baseline.py`'s
# `BASELINE_WAIVERS` registry is the one place the citations for those two
# sites live.
# =============================================================================

import baseline
from wellformed import Waiver, check_wellformed


def test_current_row_asis_fails_strict_load_without_waivers():
    """Loading the as-is baseline with NO waivers (strict mode, the
    default every other encoding uses) must still raise L2 -- confirms
    the fixture genuinely IS non-conformant, not accidentally clean."""
    text = (ENCODINGS_DIR / "current_row_asis.lyt").read_text()
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(text)
    assert exc_info.value.detail.get("law") == "L2"
    assert len(exc_info.value.detail.get("violations", [])) == 2


def test_current_row_asis_loads_via_baseline_waivers():
    """The `--baseline` load mode: the SAME text loads clean once the
    two disclosed L2 sites are waived via `baseline.BASELINE_WAIVERS`."""
    text = (ENCODINGS_DIR / "current_row_asis.lyt").read_text()
    layouts = loader.load_layouts(text, waivers=baseline.BASELINE_WAIVERS)
    assert "current-row-asis" in layouts


def test_current_row_asis_registered_in_runner():
    """`runner.REGISTRATIONS` carries the as-is registration with its
    waivers wired up -- the CLI runner (not just ad-hoc test code) can
    solve it without hitting the strict-mode L2 refusal."""
    from runner import REGISTRATIONS

    reg = next(r for r in REGISTRATIONS if r.name == "current_row_asis.lyt")
    assert reg.waivers is baseline.BASELINE_WAIVERS
    assert reg.layout_by_class["default"] == "current-row-asis"


def test_waiver_requires_law_path_and_citation():
    """A `Waiver` with any field empty is refused at construction --
    "a waiver must name the law and the citation" (commission's own
    instruction), enforced the same way `Sizing`/`Presence` enforce their
    own closed vocabularies (F3 fix precedent)."""
    with pytest.raises(ValueError):
        Waiver(law="", path="root", citation="cite")
    with pytest.raises(ValueError):
        Waiver(law="L2", path="", citation="cite")
    with pytest.raises(ValueError):
        Waiver(law="L2", path="root", citation="")


def test_check_wellformed_stale_waiver_is_refused():
    """A waiver that names a `(law, path)` not actually present in the
    violations found THIS load is refused loudly (`law:
    'waiver-integrity'`) rather than silently accepted as decorative --
    a waiver that silences nothing real is exactly as dishonest as an
    unwaived violation passing silently."""
    prog = """
    layout mixed_toolbar =
      {min 0px, pref 1fr, max inf} H(
        {min 0px, pref 400px, max inf} title[common, info],
        {min 0px, pref 300px, max inf} search[common, info+action],
        {min 24px, pref 24px, max 24px} sidebarToggle[chrome, action],
        {min 24px, pref 24px, max 24px} boardToggle[chrome, action]
      )
    """
    raws = __import__("parser").parse_layouts(prog)
    slot = loader.load_slot(raws[0].slot, path=raws[0].name)
    stale_waiver = Waiver(law="L2", path="root/H0", citation="nothing lives here")
    with pytest.raises(LytLoadError) as exc_info:
        check_wellformed(slot, layout_name="mixed_toolbar", waivers=[stale_waiver])
    assert exc_info.value.detail.get("law") == "waiver-integrity"


def test_check_wellformed_unwaived_violation_still_raises_with_waivers_present():
    """A waiver for ONE of two real violations does not silence the
    other -- waivers are matched exactly by `(law, path)`, never
    globally weakening the check once any waiver is present."""
    text = (ENCODINGS_DIR / "current_row_asis.lyt").read_text()
    raws = __import__("parser").parse_layouts(text)
    slot = loader.load_slot(raws[0].slot, path=raws[0].name)
    only_one = [baseline.CURRENT_ROW_ASIS_L2_WAIVERS[0]]
    with pytest.raises(LytLoadError) as exc_info:
        check_wellformed(slot, layout_name="current-row-asis", waivers=only_one)
    assert exc_info.value.detail.get("law") == "L2"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_emit_ts_current_row_asis_solves_same_feasibility_pattern_as_repaired():
    """The as-is baseline must solve OPTIMAL at the same three landscape
    representative sizes and INFEASIBLE at portrait -- the same
    feasibility pattern `current_row_repaired.lyt` has (SPEC-AMENDMENTS.md
    Amendment 1's mandatory preserve-banner floor applies identically to
    both encodings, since both spell the banners `@toggle(system,
    preserve)` -- the only loadable option, per the as-is file's own
    TYPE-LEVEL NOTE)."""
    registrations, _ = emit_ts.build_solved_registrations(registration_name="current_row_asis.lyt")
    by_label = {r["label"]: r for r in registrations}
    assert by_label["1920x1080"]["status"] == "OPTIMAL"
    assert by_label["2560x1440"]["status"] == "OPTIMAL"
    assert by_label["1280x1024"]["status"] == "OPTIMAL"
    assert by_label["1080x1920-portrait"]["status"] == "INFEASIBLE"
    assert by_label["1080x1920-portrait"]["slots"] == {}
    for label in ("1920x1080", "2560x1440", "1280x1024"):
        assert len(by_label[label]["slots"]) > 0


def test_emit_ts_current_row_asis_resizer_slots_agree_across_sizes():
    """The specific finding the constants-swap build report relies on:
    `resizerOuter`/`resizerInner` solve to the SAME width (1px, matching
    the real `.panel-resizer` CSS) at every OPTIMAL representative size
    -- the evidence `layout-model.ts`'s `RESIZER_WIDTH_PX` swap rests on."""
    registrations, _ = emit_ts.build_solved_registrations(registration_name="current_row_asis.lyt")
    for r in registrations:
        if r["status"] != "OPTIMAL":
            continue
        assert r["slots"]["resizerOuter"]["w"] == 1
        assert r["slots"]["resizerInner"]["w"] == 1
