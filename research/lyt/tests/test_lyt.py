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
# LYT relations-first amendment, dispatch A (ledger rows 2396/2397/2399/2400,
# rulings 1/2): ogs.lyt/q5go.lyt moved to fixtures/reference/ (third-party
# UI transcriptions, not LengYue's own frontend -- outside the governed
# layout-language surface); the three current_row_wart_*.lyt negative-test
# fixtures moved here, alongside this file, since their entire purpose is a
# pytest assertion this file itself carries (SPEC.md §6, Open Question 2's
# own "a wart fixture with its comment stripped is an unmarked syntax
# error... reclassified as test fixtures living under research/lyt/tests/,
# where a comment-bearing Python test file carries the disclosure" —
# resolved that way here).
FIXTURES_REFERENCE_DIR = Path(__file__).parent.parent / "fixtures" / "reference"
TESTS_DIR = Path(__file__).parent


def _load(name: str):
    """Resolves `name` (a bare .lyt basename, no directory) against every
    location a fixture may now live in: encodings/ (ordinary encodings,
    unchanged), fixtures/reference/ (ogs/q5go, post-move), this directory
    (the three current_row_wart_*.lyt negative fixtures, post-move).
    Refused loudly (FileNotFoundError) rather than silently returning
    nothing when none of the three has the file — the same "a dangling
    reference is a failure" discipline the move's own audit used."""
    for directory in (ENCODINGS_DIR, FIXTURES_REFERENCE_DIR, TESTS_DIR):
        candidate = directory / f"{name}.lyt"
        if candidate.exists():
            return loader.load_layouts(candidate.read_text())
    raise FileNotFoundError(
        f"{name}.lyt not found in {ENCODINGS_DIR}, {FIXTURES_REFERENCE_DIR}, or {TESTS_DIR}"
    )


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
        {min 50fr, pref 1fr, max inf} a[common],
        {min 0px, pref 1fr, max inf} b[common]
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


# --- S1 regression: `envelope: {}` (explicit but EMPTY state list) must ---
# be refused loudly too, not silently coerced to basis='reserved' ----------


def test_empty_envelope_states_is_refused_at_load_time():
    """S1 (SEVERE, `.claude/dispatch-reports/lyt-spec-grammar-audit.md`,
    ledger row 1778): an explicit but EMPTY `envelope: {}` state list is
    concrete syntax `_refuse_bare_envelope` (the F8 fix above) never sees
    -- `parser.parse_sizing` stores it as `RawSizing.envelope_states ==
    []`, which the pre-fix loader's `if rs.envelope_states:` guard treated
    as falsy ("no envelope declared"), so the slot silently loaded as
    plain `basis='reserved'` with the author's envelope declaration
    dropped and no error at all. This is the exact silent-fallback
    behavior `_refuse_bare_envelope`'s own docstring says is forbidden
    (ADR-0002). Covers both concrete-syntax routes: the general sizing
    bag (`min`/`pref`/`max`, ...) and the `{28px}` fixed shorthand, since
    the loader has one call site per branch."""
    prog_general = """
    layout empty-envelope-general =
      {pref 10px, envelope: {}} navBarRow[chrome, info]
    """
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(prog_general)
    assert exc_info.value.detail.get("law") == "L3"
    assert exc_info.value.detail.get("prohibition") == "empty-envelope-states"

    prog_fixed_shorthand = """
    layout empty-envelope-fixed =
      {28px, envelope: {}} I_engine[common, info]
    """
    with pytest.raises(LytLoadError) as exc_info2:
        loader.load_layouts(prog_fixed_shorthand)
    assert exc_info2.value.detail.get("law") == "L3"
    assert exc_info2.value.detail.get("prohibition") == "empty-envelope-states"

    # Companion positive case, unaffected by the fix: a NON-empty state
    # list still loads as basis='envelope' with the declared states
    # threaded through, in both branches.
    prog_ok_general = """
    layout non-empty-envelope-general =
      {pref 10px, envelope: {disconnected, connected}} navBarRow[chrome, info]
    """
    loaded = loader.load_layouts(prog_ok_general)
    sizing = loaded["non-empty-envelope-general"].sizing
    assert sizing.basis == "envelope"
    assert sizing.envelope_states == ["disconnected", "connected"]

    prog_ok_fixed = """
    layout non-empty-envelope-fixed =
      {28px, envelope: {disconnected, connected}} I_engine[common, info]
    """
    loaded2 = loader.load_layouts(prog_ok_fixed)
    sizing2 = loaded2["non-empty-envelope-fixed"].sizing
    assert sizing2.basis == "envelope"
    assert sizing2.envelope_states == ["disconnected", "connected"]


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
            # AMENDMENT 3 (ledger row 1715): the partition sum must include
            # the split's own (k-1)*gap term, the same quantity
            # compiler.py's `_constrain` (Split branch) sums into its own
            # partition equality -- an independent re-derivation, not a
            # re-use of the compiler's own arithmetic, matching this
            # helper's own stated purpose ("recompute ... directly from
            # the solved rects").
            along += int(round(node.gap_px)) * max(len(node.children) - 1, 0)
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
        # lengyue_landscape (all-present, 1920x1080) DROPPED here (Option C
        # tab-skeleton-encoding wave, ledger row 1937): it is now
        # INFEASIBLE at EVERY landscape size, all-present or default (see
        # test_lengyue_landscape_default_valuation_solves_optimal's own
        # docstring for the full derivation) -- there is no size left for
        # this generic "solve, then check tiling math" test to exercise.
        # Coverage of the tiling-partition math itself is NOT lost: the
        # other three rows here (plus the AMENDMENT-3/4/5-specific gap/
        # presence/L5 test sections) still exercise the same
        # `_constrain`/`_extract_rects` machinery this test walks.
        (
            "lengyue_portrait",
            "lengyue-portrait",
            1200,
            1600,
        ),  # widened from 1080x1920 (also now INFEASIBLE all-present,
        # same settingsPane 838px floor -- corrected from the wave's own
        # originally-reported 880px, `.claude/dispatch-reports/
        # lyt-optionc-repair.md` Finding 3 -- colliding with previewBoard's
        # own 96px width claim at 1080px) to a size wide enough to afford
        # both. Cosmetic fix only (realization wave, item 5): this comment
        # is not itself an assertion and the 880->838 correction changes no
        # test outcome here, verified by the unchanged full-suite pass.
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
# AMENDMENT 3 (ledger row 1715): an H/V split may declare an optional
# uniform `gap` -- a constant px reservation between its children, never
# solvable/elastic. See `SPEC-AMENDMENTS.md` and `loader.py`'s
# `_load_gap_px` docstring for the full rationale and law.
# =============================================================================


def test_gap_parses_and_loads_onto_the_split_node():
    """The `gap <extent>` sizing term round-trips through parser.py ->
    loader.py into `lyt_ast.Split.gap_px`. Absence still defaults to 0.0
    (the pre-amendment behavior, unchanged for every un-amended
    encoding)."""
    with_gap = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, gap 8px} H("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert with_gap["g"].node.gap_px == 8.0
    without_gap = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert without_gap["g"].node.gap_px == 0.0


@pytest.mark.parametrize("bad_gap", ["8fr", "8ch"])
def test_gap_refuses_elastic_or_ch_units_loudly(bad_gap):
    """The ruling's own words: a gap is 'never solvable/elastic' -- `fr`
    is refused outright, and `ch` is refused too even though it IS
    otherwise resolvable to px elsewhere in this loader (min/pref/max),
    because gap position deliberately does not inherit that resolution
    (loader.py's `_load_gap_px` docstring)."""
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(
            f"layout g = {{min 0px, pref 1fr, max inf, gap {bad_gap}}} H("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "gap-declaration"
    assert exc_info.value.detail.get("prohibition") == "non-px-gap"


def test_gap_refuses_symbolic_extent_loudly():
    """`gap WRAPPER_MIN` (a symbolic sentinel, legal in other extent
    positions) is refused the same way `fr`/`ch` are -- gap position
    accepts nothing but a bare px literal."""
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(
            "layout g = {min 0px, pref 1fr, max inf, gap WRAPPER_MIN} H("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "gap-declaration"
    assert exc_info.value.detail.get("prohibition") == "non-px-gap"


def test_gap_refuses_on_t_node():
    """T (Exclusive) nodes take no gap: every child shares one rectangle
    (§4.1 line 297-298), so there is nothing 'between' them to reserve."""
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(
            "layout g = {min 0px, pref 1fr, max inf, gap 8px} T("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "gap-declaration"
    assert exc_info.value.detail.get("node_kind") == "exclusive"


def test_gap_refuses_on_leaf():
    """A leaf has no children at all, so `gap` is refused there too,
    rather than silently dropped."""
    with pytest.raises(LytLoadError) as exc_info:
        loader.load_layouts(
            "layout g = {min 0px, pref 0px, max 0px, gap 8px} A[chrome]"
        )
    assert exc_info.value.detail.get("law") == "gap-declaration"
    assert exc_info.value.detail.get("node_kind") == "leaf"


_GAP_HAND_COMPUTED_PROGRAM = """
layout gaptest =
  {min 0px, pref 1fr, max inf, gap 10px} V(
    {min 100px, pref 100px, max 100px} top[chrome],
    {min 200px, pref 200px, max 200px} mid[chrome]
  )
"""


def test_gap_shifts_solved_rectangles_by_the_hand_computed_amount():
    """Pins the `(k-1)*gap` partition term (compiler.py's `_constrain`,
    Split branch) AND the offset accumulation (`_extract_rects`) against
    a hand-computed case: a V-split root with two FIXED children (100px,
    200px) and `gap 10px`, solved at a viewport whose height is EXACTLY
    100+200+10=310 -- zero slack, so the gap must be neither silently
    absorbed into a child's own extent nor dropped from either child's
    solved offset."""
    layouts = loader.load_layouts(_GAP_HAND_COMPUTED_PROGRAM)
    slot = layouts["gaptest"]
    assert slot.node.gap_px == 10.0
    result = solve_lexicographic(
        slot, class_id="t", w_px=500, h_px=310, board_widget=None, reach_preferred_widgets=None
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    top = result.rects["root/V0"]
    mid = result.rects["root/V1"]
    assert (top.x, top.y, top.w, top.h) == (0, 0, 500, 100)
    # mid.y = 100 (top's own height) + 10 (the gap) = 110, NOT 100 -- the
    # hand-computed pin that would catch a gap silently dropped from the
    # offset accumulation while still being counted in the partition sum
    # (or vice versa).
    assert (mid.x, mid.y, mid.w, mid.h) == (0, 110, 500, 200)


def test_unfittable_gap_is_a_loud_infeasible_not_silently_dropped():
    """Same hand-computed shape, one px too short: the ruling's own
    words -- 'an unfittable gap = loud INFEASIBLE' -- a gap is a hard
    constant reservation the solver may not silently squeeze or drop to
    make an otherwise-tight fit work."""
    layouts = loader.load_layouts(_GAP_HAND_COMPUTED_PROGRAM)
    slot = layouts["gaptest"]
    result = solve_lexicographic(
        slot, class_id="t", w_px=500, h_px=309, board_widget=None, reach_preferred_widgets=None
    )
    assert result.status == "INFEASIBLE"


# =============================================================================
# AMENDMENT 4 (ledger row 1737): per-valuation presence solving --
# `research/lyt/presence.py`. See that module's own docstring and
# `.claude/dispatch-reports/lyt-presence-valuation-solve.md` for the full
# rationale; SPEC-AMENDMENTS.md's own Amendment 4 section for the ruling
# text and diff-vs-spec-prose.
# =============================================================================

import presence as presence_mod  # noqa: E402 -- see module docstring's existing import style


def test_prune_absent_removes_leaf_from_parent_and_drops_arity():
    """`prune_absent` REMOVES the named leaf from its parent Split's
    children entirely (not sized to zero) -- so a 3-child split becomes a
    2-child split, the arity actually drops."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, gap 10px} H("
        "@toggle(user, release) {min 50px, pref 50px, max 50px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome],"
        "{min 0px, pref 1fr, max inf} C[chrome])"
    )
    slot = layouts["g"]
    assert len(slot.node.children) == 3
    pruned = presence_mod.prune_absent(slot, frozenset({"A"}))
    assert len(pruned.node.children) == 2
    widgets = [c.node.widget for c in pruned.node.children]
    assert widgets == ["B", "C"]
    # the original tree is untouched (a NEW tree is returned, not mutated)
    assert len(slot.node.children) == 3


def test_prune_absent_is_identity_for_empty_absent_set():
    """`absent_widgets=frozenset()` (the `ALL_PRESENT` valuation) returns
    the SAME slot object, unchanged -- the identity case every
    registration without a declared `default_valuation` hits."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    slot = layouts["g"]
    assert presence_mod.prune_absent(slot, frozenset()) is slot


def test_absent_slot_gap_arithmetic_uses_the_present_count():
    """The commission's own instruction: 'verify the (k-1)*gap term uses
    the PRESENT count.' Three children, `gap 10px`: with all three
    present the partition consumes 2*10=20px of gap; with one pruned
    absent, only 1*10=10px -- and the two REMAINING children's widths
    grow to absorb the reclaimed 10px + the removed child's own 50px
    reservation, verified by an exact hand-computed solve (mirrors
    `test_gap_shifts_solved_rectangles_by_the_hand_computed_amount`'s own
    style)."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, gap 10px} H("
        "@toggle(user, release) {min 50px, pref 50px, max 50px} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome],"
        "{min 0px, pref 1fr, max inf} C[chrome])"
    )
    slot = layouts["g"]

    all_present = solve_lexicographic(
        slot, class_id="t", w_px=300, h_px=100, board_widget=None, reach_preferred_widgets=None
    )
    assert all_present.status == "OPTIMAL"
    a_path = [p for p, w in all_present.leaf_names.items() if w == "A"][0]
    b_path = [p for p, w in all_present.leaf_names.items() if w == "B"][0]
    c_path = [p for p, w in all_present.leaf_names.items() if w == "C"][0]
    assert all_present.rects[a_path].w == 50
    # 300 - 50(A) - 2*10(gap) = 230, split evenly (B, C both bare {pref 1fr})
    assert all_present.rects[b_path].w + all_present.rects[c_path].w == 230

    pruned = presence_mod.prune_absent(slot, frozenset({"A"}))
    default_result = solve_lexicographic(
        pruned, class_id="t", w_px=300, h_px=100, board_widget=None, reach_preferred_widgets=None
    )
    assert default_result.status == "OPTIMAL"
    assert "A" not in default_result.leaf_names.values()
    b_path2 = [p for p, w in default_result.leaf_names.items() if w == "B"][0]
    c_path2 = [p for p, w in default_result.leaf_names.items() if w == "C"][0]
    # 300 - 1*10(gap, ONE gap now -- the (k-1)*gap term uses the PRESENT
    # count, 2 children -> 1 gap) = 290, split between B and C.
    assert default_result.rects[b_path2].w + default_result.rects[c_path2].w == 290
    assert default_result.rects[b_path2].w + default_result.rects[c_path2].w > (
        all_present.rects[b_path].w + all_present.rects[c_path].w
    )


def test_validate_valuation_refuses_unknown_widget():
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf} A[chrome])"
    )
    slot = layouts["g"]
    bad = presence_mod.PresenceValuation(name="bad", absent_widgets=frozenset({"nonexistent"}))
    with pytest.raises(LytLoadError) as excinfo:
        presence_mod.validate_valuation(slot, bad, layout_name="g")
    assert excinfo.value.detail["law"] == "presence-valuation"
    assert excinfo.value.detail["prohibition"] == "unknown-widget"


def test_validate_valuation_refuses_a_slot_that_is_not_a_user_release_toggle():
    """The commission's own words: 'a named slot that isn't a user-release
    toggle is an error.' A `@fixed` leaf (and, separately, a
    `@toggle(user, preserve)` leaf) named ABSENT must be refused loudly,
    not silently pruned as if it were a release toggle."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "@fixed {min 0px, pref 1fr, max inf} A[chrome],"
        "@toggle(user, preserve) {min 0px, pref 10px, max 10px} B[chrome])"
    )
    slot = layouts["g"]
    for widget in ("A", "B"):
        bad = presence_mod.PresenceValuation(name="bad", absent_widgets=frozenset({widget}))
        with pytest.raises(LytLoadError) as excinfo:
            presence_mod.validate_valuation(slot, bad, layout_name="g")
        assert excinfo.value.detail["law"] == "presence-valuation"
        assert excinfo.value.detail["prohibition"] == "not-a-release-toggle"


def test_resolve_and_validate_rejects_before_pruning():
    """`resolve_and_validate` is a single validate-then-prune operation --
    a malformed valuation must raise before any pruned tree is returned,
    not silently return a partially-pruned map."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "@fixed {min 0px, pref 1fr, max inf} A[chrome])"
    )
    bad = presence_mod.PresenceValuation(name="bad", absent_widgets=frozenset({"A"}))
    with pytest.raises(LytLoadError):
        presence_mod.resolve_and_validate(layouts, ["g"], bad)


@pytest.mark.parametrize(
    "label,w,h,expected",
    [
        ("1920x1080", 1920, 1080, "OPTIMAL"),
        ("2560x1440", 2560, 1440, "OPTIMAL"),
        ("3440x1440", 3440, 1440, "OPTIMAL"),
        ("1366x768", 1366, 768, "INFEASIBLE"),
    ],
)
def test_lengyue_landscape_default_valuation_solves_optimal(label, w, h, expected):
    """STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`, ledger rows 2007/2009 — ADR-0000's own "corrective diff is
    new structure" discipline applied to a test pinning a NOW-FIXED
    defect). PRE-OPTION-C this pinned OPTIMAL at every size named here.
    The Option C tab-skeleton-encoding wave (2026-08-11, ledger row 1937)
    made EVERY landscape size INFEASIBLE for a genuine, disclosed,
    presence-INDEPENDENT reason: `settingsPane`'s own single-row 838px
    width floor exceeded the side column's own separately-ratified hard
    cap (`max 340px+60ch` = 820px) — this test used to pin THAT
    INFEASIBLE outcome as the honest, expected result of an un-fixed
    finding.

    This work item's own settings-substrip FLOW ENVELOPE (rows 2007/2009,
    `research/lyt/flow.py`, `lengyue_landscape.lyt`'s own "FLOW-CAPABLE
    SETTINGS SUBSTRIP" header section) retires that 838px single-row
    floor in favor of a wrap-capable 2-row design point (443px width,
    60px height) — well under the 820px cap — so the T-node's own
    componentwise-max floor is now driven by `CP-analysis`'s unchanged
    664px, not by settings. 1920x1080/2560x1440/3440x1440 (which were
    NEVER bound by the 664px CP-analysis floor, only by settings' retired
    838px) return to their PRE-OPTION-C `OPTIMAL` result.

    1366x768 stays `INFEASIBLE` — for a DIFFERENT, PRE-EXISTING,
    presence-independent reason this work item does not touch: Amendment 4's
    own documented finding (SPEC-AMENDMENTS.md) that the board composite's
    own forced width, plus the tree/panels row's `WRAPPER_MIN`-driven
    floor, exceeds 1366px's available width regardless of presence
    valuation or the settings floor. Verified directly (not merely
    asserted): re-solving 1024x700/900x600/1280x1024 (the OTHER three
    sizes Amendment 4's own table names as presence-independently
    INFEASIBLE) after this work item's change finds them UNCHANGED —
    still INFEASIBLE, for their own unrelated documented reasons, not
    reproduced as a parametrized case here since Amendment 4's own
    coverage already pins them (`test_generated_pages_embed_valid_overlay
    _json_matching_overlay_sizes`'s own `known_infeasible` bookkeeping)."""
    layouts = loader.load_layouts((ENCODINGS_DIR / "lengyue_landscape.lyt").read_text())
    slot = layouts["lengyue-landscape"]
    default_valuation = presence_mod.PresenceValuation(
        name="default", absent_widgets=frozenset({"boardRail", "previewBoard"})
    )
    pruned = presence_mod.resolve_and_validate(layouts, ["lengyue-landscape"], default_valuation)["lengyue-landscape"]
    result = solve_lexicographic(
        pruned, class_id="landscape", w_px=w, h_px=h, board_widget="B", reach_preferred_widgets=None, time_limit_s=15
    )
    assert result.status == expected, (
        f"{label}: expected {expected} after the flow-envelope settings-substrip fix "
        f"(see this test's own docstring); got {result.status}"
    )


def test_lengyue_portrait_default_valuation_solves_optimal_at_420x880():
    """PRE-OPTION-C this pinned OPTIMAL. The Option C tab-skeleton-encoding
    wave (ledger row 1937) made 420x880 INFEASIBLE -- at this narrow a
    portrait viewport, the FULL page width (420px) was already far short
    of `settingsPane`'s own then-838px honest width floor.

    STILL INFEASIBLE after work item `lyt-settings-live-opening`'s flow-
    envelope fix (rows 2007/2009 -- see
    `test_lengyue_landscape_default_valuation_solves_optimal`'s docstring
    for the full derivation), but for a smaller margin now: the composite
    floor dropped 838px -> 443px, and 420px is still narrower than
    443px -- verified directly (not merely re-asserted): re-solved after
    the fix and confirmed still `INFEASIBLE`, not a stale carried-over
    assertion. This remains a genuinely more binding version of the SAME
    landscape finding, not a new, independent one -- just a much
    narrower margin (23px short of 443px, vs. 418px short of 838px
    before)."""
    layouts = loader.load_layouts((ENCODINGS_DIR / "lengyue_portrait.lyt").read_text())
    slot = layouts["lengyue-portrait"]
    default_valuation = presence_mod.PresenceValuation(
        name="default", absent_widgets=frozenset({"boardRail", "previewBoard"})
    )
    pruned = presence_mod.resolve_and_validate(layouts, ["lengyue-portrait"], default_valuation)["lengyue-portrait"]
    result = solve_lexicographic(
        pruned, class_id="portrait", w_px=420, h_px=880, board_widget="B", reach_preferred_widgets=None, time_limit_s=15
    )
    assert result.status == "INFEASIBLE"


def test_lengyue_default_valuation_registered_on_the_runner_registration():
    """The LANGUAGE SURFACE: `runner.REGISTRATIONS`' lengyue entry must
    declare its default valuation as exactly {boardRail, previewBoard,
    A_setup} absent -- the three live default-OFF release toggles named
    by the tree-always-visible build report (boardRail/previewBoard) and
    M2 stage B2b's own palette-adoption ruling (A_setup, ledger row
    2108), re-confirmed in both `.lyt` files' own headers. [Updated
    2026-08-12, M2 stage B2b: was {boardRail, previewBoard} only.]"""
    import runner as runner_mod

    reg = [r for r in runner_mod.REGISTRATIONS if r.name == "lengyue_landscape+portrait"][0]
    assert reg.default_valuation.name == "default"
    assert reg.default_valuation.absent_widgets == frozenset(
        {"boardRail", "previewBoard", "A_setup"}
    )
    # every OTHER registration keeps the spec's own §6 baseline (nothing
    # absent) -- byte-identical to this prototype's pre-Amendment-4
    # behavior for q5go/ogs/current-row-repaired/current-row-asis.
    for other in runner_mod.REGISTRATIONS:
        if other.name != "lengyue_landscape+portrait":
            assert other.default_valuation.absent_widgets == frozenset()


def test_toggle_targets_default_off_release_entries_match_the_registration_default_valuation():
    """Cross-check (per this commission's own instructions on keeping the
    UI-facing `TOGGLE_TARGETS` registry and the solver-facing
    `Registration.default_valuation` from silently drifting apart): every
    `TOGGLE_TARGETS` entry that is `presence='release'` AND
    `default_visible=False` AND resolves to a bare leaf widget (via
    `_widget_at_path`) must name a widget that IS in the registration's
    own declared `default_valuation.absent_widgets` -- and vice versa,
    every widget in `absent_widgets` must be reachable from at least one
    such `TOGGLE_TARGETS` entry, in EVERY class."""
    import runner as runner_mod

    reg = [r for r in runner_mod.REGISTRATIONS if r.name == "lengyue_landscape+portrait"][0]
    reg2, layouts = emit_mockup.load_class_slots()
    assert reg2 is reg or reg2.name == reg.name
    for class_id, targets in emit_mockup.TOGGLE_TARGETS.items():
        layout_name = reg.layout_by_class[class_id]
        slot = layouts[layout_name]
        toggle_target_widgets = {
            emit_mockup._widget_at_path(slot, path)
            for path, (label, presence_kind, default_visible) in targets.items()
            if presence_kind == "release" and not default_visible
        }
        toggle_target_widgets.discard(None)  # composite targets with no single widget id
        assert toggle_target_widgets == reg.default_valuation.absent_widgets, (
            f"{class_id}: TOGGLE_TARGETS default-off release widgets "
            f"{toggle_target_widgets} != Registration.default_valuation.absent_widgets "
            f"{reg.default_valuation.absent_widgets}"
        )


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


# =============================================================================
# emit_mockup.py -- the lyt-cleanroom-mockups commission (ledger row 1703)
# static HTML/CSS-grid mockup generator. Coverage: the LYT-sizing -> CSS
# grid-track mapping (the sizing shapes actually present in the two
# clean-room encodings), the T-node componentwise-max min derivation
# reproduced from compiler.py, and output-shape checks on the generated
# pages (well-formed nesting, every corner-menu toggle target present,
# the debug-overlay solved data embedded and matching the live tree).
# =============================================================================

import json
import re

import emit_mockup


def test_track_for_child_fixed_shape():
    fixed = ast.Sizing(min=ast.Extent(unit="px", v=28), pref=ast.Extent(unit="px", v=28), max=ast.Extent(unit="px", v=28))
    assert emit_mockup._track_for_child(fixed, floor_override_px=None, where="t") == "28px"


def test_track_for_child_elastic_uncapped_shape():
    elastic = ast.Sizing(min=ast.Extent(unit="px", v=0), pref=ast.Extent(unit="fr", v=1), max="inf")
    assert emit_mockup._track_for_child(elastic, floor_override_px=None, where="t") == "minmax(0px, 1fr)"


def test_track_for_child_elastic_capped_shape_drops_the_fr_weight():
    """Module docstring's own disclosed choice: CSS minmax() has only two
    argument slots, so a capped-elastic shape (min/pref-fr/max all
    present, e.g. the side column's `{min 340px, pref 32fr, max
    340px+60ch}`) keeps the hard min/max and drops the fr weight."""
    capped = ast.Sizing(min=ast.Extent(unit="px", v=340), pref=ast.Extent(unit="fr", v=32), max=ast.Extent(unit="px", v=820))
    assert emit_mockup._track_for_child(capped, floor_override_px=None, where="t") == "minmax(340px, 820px)"


def test_track_for_child_floor_override_wins_over_declared_min():
    elastic = ast.Sizing(min=ast.Extent(unit="px", v=0), pref=ast.Extent(unit="fr", v=1), max="inf")
    assert emit_mockup._track_for_child(elastic, floor_override_px=300, where="t") == "minmax(300px, 1fr)"


def test_track_for_child_refuses_unhandled_shapes_loudly():
    """A shape none of the two clean-room encodings actually uses (here:
    uncapped with a plain px pref) has no disclosed mapping -- refused,
    not guessed (ADR-0002)."""
    weird = ast.Sizing(min=ast.Extent(unit="px", v=0), pref=ast.Extent(unit="px", v=50), max="inf")
    with pytest.raises(NotImplementedError):
        emit_mockup._track_for_child(weird, floor_override_px=None, where="t")


def test_exclusive_derived_min_px_matches_compilers_componentwise_max():
    """Reproduces compiler.py's `_constrain` Exclusive branch derivation
    (componentwise max of children's own declared min) -- this is the
    exact floor the T node's own track in emit_mockup's HTML must carry,
    the same floor the CP-SAT solver enforces."""
    children = [
        ast.Slot(node=ast.Leaf(widget="a"), presence=ast.FIXED, sizing=ast.Sizing(min=ast.Extent(unit="px", v=200), pref=ast.Extent(unit="fr", v=1), max="inf")),
        ast.Slot(node=ast.Leaf(widget="b"), presence=ast.FIXED, sizing=ast.Sizing(min=ast.Extent(unit="px", v=300), pref=ast.Extent(unit="fr", v=1), max="inf")),
    ]
    excl = ast.Exclusive(children=children)
    assert emit_mockup._exclusive_derived_min_px(excl, where="t") == 300


def test_exclusive_derived_min_px_empty_children_is_zero():
    assert emit_mockup._exclusive_derived_min_px(ast.Exclusive(children=[]), where="t") == 0.0


@pytest.fixture(scope="module")
def mockup_pages():
    """Solves both classes once and reuses the result across this test
    module's assertions -- each solve is a real (if fast) CP-SAT call,
    and there is nothing about the assertions below that requires a
    fresh solve per test."""
    return emit_mockup.build_all(time_limit_s=10.0)


def test_build_all_produces_both_screen_classes(mockup_pages):
    assert set(mockup_pages.keys()) == {"landscape", "portrait"}
    for class_id, html_text in mockup_pages.items():
        assert html_text.startswith("<!doctype html>")
        assert "GENERATED FILE" in html_text
        assert f"lengyue-{class_id}" in html_text


def test_generated_pages_have_balanced_div_nesting(mockup_pages):
    for class_id, html_text in mockup_pages.items():
        opens = len(re.findall(r"<div", html_text))
        closes = len(re.findall(r"</div>", html_text))
        assert opens == closes, f"{class_id}: {opens} <div vs {closes} </div>"
        assert opens > 0


def test_generated_pages_carry_every_declared_toggle_target(mockup_pages):
    for class_id, targets in emit_mockup.TOGGLE_TARGETS.items():
        html_text = mockup_pages[class_id]
        for label, presence, default_visible in targets.values():
            slug = emit_mockup._slug(label)
            assert f'data-toggle-id="{slug}" data-presence="{presence}"' in html_text
            assert f'data-toggle-for="{slug}"' in html_text
            if presence == "release":
                assert f'data-toggle-id="{slug}"' in html_text and "data-track-prop=" in html_text
            # lyt-tree-always-visible (ledger row ~1735): a default-OFF
            # target's checkbox must NOT carry the `checked` attribute,
            # and a default-ON one must -- the initial-load HTML has to
            # agree with the registry, not just with itself.
            checkbox_tag_re = re.escape(f'<input type="checkbox" data-toggle-for="{slug}"')
            m = re.search(checkbox_tag_re + r'([^>]*)>', html_text)
            assert m, f"{class_id}/{slug}: checkbox tag not found"
            assert ("checked" in m.group(1)) == default_visible


def test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes(mockup_pages):
    """X6 fix (lyt-mockups-opus-review.md): OVERLAY_SIZES now spans the
    review's own full 14-viewport tested set, not just the three
    screenshot sizes. At two of those extra sizes (landscape 1280x1024
    and the portrait-shaped 1080x1920-in-landscape probe) the CP-SAT
    solve is genuinely INFEASIBLE -- a real fact about the .lyt
    encoding's own declared minimums (at 1280x1024 the side column's
    floor, 340px, alone leaves composite less width than the board's
    forced natural size needs), not a bug in this generator or its CSS
    realization. Every OTHER size must still solve OPTIMAL with a real
    board rect; an INFEASIBLE entry carries no slots (matching
    build_overlay_data's own `if status in (OPTIMAL, FEASIBLE) else {}`)
    and the debug overlay's own JS already renders that status text
    instead of crashing (see `drawOverlay`).

    lyt-tree-always-visible (ledger row ~1735) EXPANDED this set the first
    time: boardRail (168px) and previewBoard (160px landscape / 96px
    portrait) are DEFAULT-OFF toggle targets, but `compiler.py`'s own
    then-disclosed limitation ("only the 'all slots present' valuation is
    solved") meant the CP-SAT solve backing this debug overlay treated
    EVERY leaf as always-present -- so five sizes that solve OPTIMAL on
    a real (default-hidden) browser page reported INFEASIBLE here.

    AMENDMENT 4 (ledger row 1737, `research/lyt/presence.py`,
    `.claude/dispatch-reports/lyt-presence-valuation-solve.md`) closes
    that disclosed gap by solving PER PRESENCE VALUATION -- the embedded
    JSON is now `{"valuations": {name: [per-size dict, ...], ...}, ...}`
    (see `emit_mockup.build_overlay_data`'s own docstring), not a flat
    list. `known_infeasible_by_valuation` below is keyed
    `(valuation_name, class_id, label)`.

    Of the FIVE sizes the tree-always-visible commission's own build
    report named as newly, falsely INFEASIBLE (landscape 1366x768/
    1024x700/900x600, landscape 1280x1024, portrait 420x880), solving
    the DEFAULT valuation (boardRail+previewBoard genuinely absent,
    zero reservation, zero gap contribution) flips TWO to OPTIMAL:
    landscape 1366x768 and portrait 420x880. The other three
    (1024x700, 900x600, 1280x1024) remain INFEASIBLE even under the
    default valuation -- verified by hand-derivation (see
    `.claude/dispatch-reports/lyt-presence-valuation-solve.md`'s own
    "feasibility before/after" table): the board composite's own V-split
    forces `B.h == root.h - 52` and (via `aspect 1`) `B.w == B.h`
    EXACTLY, as a hard equality independent of any sibling's width --
    so at these three sizes the board's forced width, PLUS the tree row's
    own `WRAPPER_MIN`-driven floor (300px T-node + 140px tree + 4px gap =
    444px, present in EVERY valuation since tree/T-node are not
    release-toggled, so no absent-slot pruning can ever touch them), PLUS
    the root's own 12px gap, exceeds the available width regardless of
    boardRail/previewBoard's presence. This is a genuine, presence-
    INDEPENDENT geometry fact about the current board-composite shape,
    not a defect this amendment's own scope extends to fixing (same
    "not shrinking an already-grounded reservation just to force a
    presence-blind solve to agree" posture the prior tree-always-visible
    build report itself took) -- landscape 1280x1024's own
    pre-Amendment-4 disclosure (the side column's declared min alone
    already exceeding the board's natural width need) is the SAME
    mechanism family, just triggered by a different one of the two
    additive terms (side-column floor vs. board-forced-width) dominating
    at different aspect ratios.

    ALL-PRESENT stays exactly the pre-Amendment-4 set (every leaf
    reserved, matching the spec's own §6 baseline, line 636) -- this is
    the "all-preserve-slots-present valuation may legitimately remain
    INFEASIBLE at small sizes" case the commission's own instructions
    name explicitly.

    W4 FLOOR SOFTENING update (Q3 ruling, ledger row 1848,
    `.claude/dispatch-reports/lyt-vue-realization-roadmap.md` item 6):
    `encodings/lengyue_landscape.lyt` lowers three mins (the side
    column's own floor 480px->280px, the T-node children's floor
    300px->160px, and the (live-rendering-dead, see that file's own
    header) tree leaf 140px->110px) -- see the encoding's own "W4 FLOOR
    SOFTENING" header section for the full derivation. Under the
    DEFAULT valuation (boardRail/previewBoard genuinely absent -- the
    realistic, shipped case), the three previously-INFEASIBLE landscape
    sizes (1280x1024, 1024x700, 900x600) are now OPTIMAL, re-solved not
    asserted on faith -- removed from the "default" rows below. Under
    ALL-PRESENT (every release-toggle slot, including boardRail's 168px
    and previewBoard's 160px, forced visible), 1280x1024/1024x700/
    900x600 remain genuinely INFEASIBLE even after the softened floors
    -- this is exactly the "all-preserve-slots-present valuation may
    legitimately remain INFEASIBLE at small sizes" case this test's own
    docstring above says the commission's instructions name explicitly,
    so those three rows stay pinned under "all-present". 1366x768
    under all-present, previously INFEASIBLE, also flips to OPTIMAL as
    a side effect of the same softened floors (a strict widening of the
    feasible region -- lowering a min can only ever add newly-feasible
    points, never remove one) -- removed from the pinned set too.
    1080x1920-in-landscape (a portrait-shaped probe run through the
    LANDSCAPE class) and portrait's own 420x880 under all-present are
    UNCHANGED by this pass (a different, unrelated infeasibility
    mechanism) and remain pinned.

    W4 FLOOR CORRECTION update (independent review,
    `.claude/dispatch-reports/lyt-w4-chrome-review.md` item 6): the W4
    FLOOR SOFTENING pass's own 280px side-column min was disclosed as
    "functionally safe, just not empirically re-swept" -- the review's
    live measured width-sweep found that disclosure wrong: 280px clips
    `SetupToolPalette.vue`'s permanently-reserved `.setup-toolkit`
    column by up to 52px. The measured true no-clip floor is 335px;
    this correction raises the encoding's min to 345px (335px + a
    ~10px margin, matching the REPAIR PASS's own precedent for margin
    sizing).

    This exposes a genuine tension, disclosed here rather than papered
    over by re-lowering the floor: re-solving at 345px, of the three
    landscape sizes the softening pass flipped to OPTIMAL under the
    DEFAULT valuation (1280x1024, 1024x700, 900x600), only 1024x700
    survives. 1280x1024 flips back to INFEASIBLE at any min >= 297px
    (i.e. it was ALREADY infeasible at the measured 335px true floor,
    before any margin was even added) and 900x600 flips back to
    INFEASIBLE somewhere between 335px and 341px -- both below the
    corrected 345px, so both are added to the pinned set below. Under
    ALL-PRESENT, 1280x1024/1024x700/900x600 were already pinned
    INFEASIBLE before this correction (the softening pass's own
    docstring above) and remain so -- unaffected by this change, since
    raising an already-exceeded min cannot un-exceed it. This is the
    real cost of correcting the floor to its measured, non-clipping
    value: the SAME TREE cannot be BOTH clip-free at 335px+ AND
    solver-OPTIMAL at 1280x1024/900x600 under the default valuation --
    a genuine tension between the "no clipping" and "no compact class"
    standing rulings this correction surfaces rather than resolves.
    See the encoding's own "W4 FLOOR CORRECTION" header section for
    the numeric derivation.

    OPTION C UPDATE (2026-08-11, ledger row 1937's ratified consult, work
    item lyt-tab-skeleton-encoding). The tab-skeleton-encoding wave's
    newly-opened `settingsPane` composite carries an honest 838px
    ch-measured width floor (corrected 2026-08-11 per
    `.claude/dispatch-reports/lyt-optionc-review.md` Finding 3 /
    `.claude/dispatch-reports/lyt-optionc-repair.md` -- the wave's own
    original delivery reported 880px, a systematic +1-per-label ch-count
    error; see `lengyue_landscape.lyt`'s own header section for the full
    derivation) that EXCEEDS the landscape side column's pre-existing
    820px hard cap at EVERY size, under BOTH valuations -- landscape is
    now INFEASIBLE across the board (verified by re-solving all 8
    OVERLAY_SIZES landscape rows under both valuations, at the CORRECTED
    838px floor). Portrait, whose available width for the control-panel
    row varies with viewport width (previewBoard's presence claims 96px
    of it), now solves OPTIMAL at only its two widest sizes under
    `default` (1080x1920, 1200x1600) and its single widest under
    `all-present` (1200x1600) -- every narrower portrait probe is now
    short of the 838px floor too (re-verified: the pinned set below is
    UNCHANGED between the delivered wave's 880px and the corrected 838px
    -- both narrower portrait probes, 768x1024/540x960, are short of the
    floor by wide enough a margin that the 42px correction doesn't flip
    either). Re-verified by direct re-solve, not carried forward from the
    pre-Option-C table. This is the SAME genuine, disclosed finding named
    in `test_lengyue_landscape_default_valuation_solves_optimal`'s own
    docstring, not a new, independent regression."""
    # STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    # opening`, ledger rows 2007/2009) — the flow-envelope settings-substrip
    # fix (`research/lyt/flow.py`, `test_lengyue_landscape_default_valuation_
    # solves_optimal`'s own docstring has the full derivation) drops the
    # settings composite's floor from 838px to 443px, well under the side
    # column's 820px cap. Re-solved directly (not carried forward), FIVE
    # entries flip INFEASIBLE -> OPTIMAL, disclosed individually:
    #   - ("default", "landscape", "1920x1080")
    #   - ("default", "landscape", "2560x1440")
    #   - ("default", "landscape", "3440x1440")
    #   - ("default", "portrait", "1920x1080-in-portrait")
    #   - ("all-present", "portrait", "1080x1920")
    # Every OTHER entry in the pre-fix set stays INFEASIBLE, for its own
    # unrelated, pre-existing, presence-independent reason (Amendment 4's
    # own board-forced-width/floor-collision finding, or all-present's own
    # boardRail+previewBoard reservation) — re-verified by direct re-solve,
    # not assumed unchanged.
    #
    # LYT presence arc P1 (row 2333, mobile/portrait repetition-first
    # disposition; `.claude/dispatch-reports/lyt-p1-presence-model.md`) —
    # THREE more entries flip INFEASIBLE -> OPTIMAL, re-solved directly
    # (not assumed): `("default", "portrait", "768x1024"/"540x960"/
    # "420x880")`, removed from the set below. Portrait's own DEFAULT
    # valuation now genuinely demotes the control-panel tab group
    # (`"BLACK BOX"`, the `T(...)` Exclusive's own `@demote(h 808px)` --
    # see `lengyue_portrait.lyt`'s own header for the derivation) alongside
    # boardRail/previewBoard/A_setup — at these three narrow-viewport
    # portrait sizes, the row's own residual demand drops from
    # 664(T)+140(tree)+4(gap)=808px to just `tree`'s own 140px floor once
    # `T(...)` is pruned, which is what makes them genuinely solve.
    # Landscape's own entries are UNCHANGED — its `default_valuation` is
    # untouched by this arc (row 2333's own "do NOT shrink any desktop
    # demand"); only a SEPARATE, diagnostic-only "demoted" coverage point
    # (`coverage_matrix.py`, not this mockup-overlay JSON, which embeds
    # only `default`/`all-present`) exercises the control panel's absence
    # on landscape.
    known_infeasible_by_valuation = {
        ("all-present", "landscape", "1920x1080"),
        ("all-present", "landscape", "2560x1440"),
        ("all-present", "landscape", "1280x1024"),
        ("all-present", "landscape", "3440x1440"),
        ("all-present", "landscape", "1366x768"),
        ("all-present", "landscape", "1080x1920-in-landscape"),
        ("all-present", "landscape", "1024x700"),
        ("all-present", "landscape", "900x600"),
        ("default", "landscape", "1280x1024"),
        ("default", "landscape", "1366x768"),
        ("default", "landscape", "1080x1920-in-landscape"),
        ("default", "landscape", "1024x700"),
        ("default", "landscape", "900x600"),
        ("all-present", "portrait", "768x1024"),
        ("all-present", "portrait", "540x960"),
        ("all-present", "portrait", "420x880"),
        ("all-present", "portrait", "1920x1080-in-portrait"),
    }
    for class_id, html_text in mockup_pages.items():
        m = re.search(r'<script id="lyt-solved-data" type="application/json">(.*?)</script>', html_text, re.S)
        assert m, f"{class_id}: no embedded solved-data script tag"
        payload = json.loads(m.group(1))
        assert set(payload["valuations"].keys()) == {"default", "all-present"}
        expected_sizes = emit_mockup.OVERLAY_SIZES[class_id]
        for val_name, data in payload["valuations"].items():
            assert [(d["label"], d["wPx"], d["hPx"]) for d in data] == expected_sizes
            for d in data:
                if (val_name, class_id, d["label"]) in known_infeasible_by_valuation:
                    assert d["status"] == "INFEASIBLE", f"{val_name}/{class_id}/{d['label']}: expected INFEASIBLE, got {d['status']}"
                    assert d["slots"] == {}
                else:
                    assert d["status"] == "OPTIMAL", f"{val_name}/{class_id}/{d['label']}: expected OPTIMAL, got {d['status']}"
                    assert "B" in d["slots"]  # the board widget always solves a rect when OPTIMAL


def test_landscape_side_column_track_carries_the_board_priority_clamp(mockup_pages):
    """B2/B3 fix regression pin: the side column's track (a direct
    sibling of the board composite, both fed by `_board_priority_tracks`
    CASE A) is no longer the bare `minmax(340px, 820px)` that let a
    non-flexible track claim its full max before the board's `1fr` track
    ever saw free space (the review's B2 finding). It is now a
    `clamp()` expression whose middle term subtracts the board's own
    closed-form natural size (100vh minus the 24px+28px fixed info/action
    rows) from the available width, so the board structurally wins its
    natural share before the side column grows toward its own declared
    max -- see `_board_priority_tracks`'s own docstring for the full
    derivation.

    AMENDMENT 3 (ledger row 1715) update: the landscape encoding now
    declares `gap 12px` on its own outer H(...) split (see that file's
    own header comment for the `--space-medium` tier-mapping rationale).
    `_board_priority_tracks`'s CASE A branch subtracts that gap from the
    clamp's middle term (its own updated docstring covers why: the
    board's `1fr` composite track would otherwise silently absorb the
    gap's width out of the board's own natural share), so the pinned
    clamp expression below gains a trailing `- 12px` term versus the
    pre-amendment (gap-less) string.

    W1 REPAIR update (ledger row 1781, review finding A -- see the
    encoding's own header comment, "REPAIR PASS"): the side column's
    `min` is raised from 340px to 480px, a measured, disclosed
    reservation-correction for the merged Toolbar mount's real content
    floor (480px keeps every representative landscape size the base
    suite already pins OPTIMAL genuinely OPTIMAL -- 640px, this repair's
    first candidate, regressed 1366x768 to INFEASIBLE; 480px is the
    largest value that doesn't). The pinned clamp's `340px` LOWER bound
    literal moves to `480px` accordingly; the `820px` upper bound (the
    column's own pre-existing max, `340px+60ch` = 340+8*60) is
    unchanged.

    W4 FLOOR SOFTENING update (Q3 ruling, ledger row 1848): the side
    column's own min is lowered again, 480px -> 280px, so the tree is
    solver-FEASIBLE at 1280x1024/1024x700/900x600 -- see the encoding's
    own "W4 FLOOR SOFTENING" header section. The pinned clamp's lower
    bound literal moves to `280px` accordingly; the `820px` upper bound
    is unchanged.

    W4 FLOOR CORRECTION update (independent review,
    `.claude/dispatch-reports/lyt-w4-chrome-review.md` item 6): 280px
    was live-measured to clip `SetupToolPalette.vue`'s permanently-
    reserved `.setup-toolkit` column by up to 52px -- the softening
    pass's own "functionally safe, not re-swept" disclosure was wrong.
    The side column's min is raised to 345px (335px measured true
    no-clip floor + ~10px margin) -- see the encoding's own "W4 FLOOR
    CORRECTION" header section, including the disclosed tension this
    raises against the feasibility pins (`test_generated_pages_embed_
    valid_overlay_json_matching_overlay_sizes`'s own updated docstring
    covers the numbers). The pinned clamp's lower bound literal moves
    to `345px` accordingly; the `820px` upper bound is unchanged."""
    assert "minmax(340px, 820px)" not in mockup_pages["landscape"]
    assert "clamp(345px, calc(100% - (100vh - 52px) - 12px), 820px)" in mockup_pages["landscape"]


def test_portrait_composite_row_carries_the_board_priority_cap(mockup_pages):
    """B2/B3 fix regression pin, CASE B: portrait's board composite row
    (an uncapped `1fr` track competing against the Tree & Panels T-node's
    OWN uncapped `1fr` track -- plain CSS Grid would split these 50/50,
    the review's measured B3 symptom, 932px/932px instead of the solved
    skew) is now capped at its own closed-form natural ceiling
    (100vw, the board's own aspect-driven max width, plus the 24px+28px
    fixed info/action rows), converting it from a flexible track into a
    non-flexible calc-bounded one so the Tree & Panels T-node's own
    declared `minmax(200px, 1fr)` floor is honored automatically by CSS
    Grid's own track-sizing algorithm (base-size reservation happens
    before a non-flexible sibling is allowed to grow) rather than
    starved by a naive 50/50 split.

    OPTION C UPDATE (ledger row 1937): the T-node's own componentwise-max
    floor moves from 200px to 838px (corrected 2026-08-11 per
    `.claude/dispatch-reports/lyt-optionc-review.md` Finding 3 --
    the wave's own original delivery reported 880px, a systematic
    +1-per-label ch-count error -- the newly-opened `settingsPane`
    composite's own ch-measured width floor is now the tallest/widest of
    the five direct children -- see `lengyue_landscape.lyt`'s own header
    for the derivation, identical across both classes). NOTE: this test
    exercises `emit_mockup.py`'s own STATIC-HTML mockup generator (research
    tooling, not live-consumed by the SPA) -- unlike `emit_layout_tree.py`
    (the LIVE `.gen.ts` emitter), this generator's own
    `_exclusive_derived_min_px` copy was NOT changed by the Finding 2
    repair (out of that repair's scope, named as a residual in
    `.claude/dispatch-reports/lyt-optionc-repair.md`), so this mockup
    correctly continues to show the solver-derived interior floor.

    STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`): the settings composite's own floor drops 838px -> 443px
    (the flow-envelope fix, `research/lyt/flow.py`); the T-node's own
    componentwise-max floor is now driven by `CP-analysis`'s UNCHANGED
    664px instead — verified directly against `emit_mockup.py`'s own
    output, not carried forward from the pre-fix pin.

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2a, ledger rows
    2108/2331): the fork-1 ruling's own tree/T(...) residual-holder swap
    PINS `T(...)` at its own already-existing 664px componentwise-max
    floor (`{min 664px, pref 664px, max 664px}`) instead of leaving it
    elastic (`pref 1fr, max inf`) -- `tree` is now the row's residual
    holder instead. The T-node's own emitted track therefore changes
    shape from `minmax(664px, 1fr)` (elastic-with-a-floor) to a plain
    `664px` (fixed) -- verified directly against `emit_mockup.py`'s own
    output, not assumed from the encoding edit alone.

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2b, ledger rows
    2073/2108/2151): the track var's own index shifts, `--track-4-1` ->
    `--track-5-1` -- the palette-adoption ruling's own new `A_setup`
    leaf (item 2) inserts as a new direct root child ahead of the
    tree/panels row in this class (portrait has no separate side column,
    so `A_setup` sits at root level, shifting every LATER root child's
    own index by one, matching the encoding's own M2 STAGE B2b header
    note)."""
    assert "minmax(0px, calc(100vw + 52px))" in mockup_pages["portrait"]
    # T-node's own now-fixed track (`var(--track-5-1, 664px)`), still driven
    # by CP-analysis's floor, no longer wrapped in `minmax(..., 1fr)`.
    assert "var(--track-5-1, 664px)" in mockup_pages["portrait"]
    assert "minmax(664px, 1fr)" not in mockup_pages["portrait"]


def test_tree_panels_t_node_track_carries_its_derived_floor(mockup_pages):
    """The T node's own track in its parent must carry the
    compiler-derived componentwise-max floor (160px landscape, 200px
    portrait per the two .lyt files' own per-child literal `min` --
    landscape's own five CP-* children used to import the shared
    `WRAPPER_MIN` sentinel (300px); W4 FLOOR SOFTENING (Q3 ruling,
    ledger row 1848) replaces that with a literal `160px` per child,
    scoped to this one encoding so the shared sentinel (and the two
    unrelated `current_row_*.lyt` fixtures that still use it) are
    untouched -- see the encoding's own "W4 FLOOR SOFTENING" header
    section), not the loader's un-derived 0px default.

    OPTION C UPDATE (ledger row 1937): 160px/200px are each now SHADOWED
    by `settingsPane`'s own 838px composite floor (corrected per Finding 3
    -- the widest of the five direct children on both classes) -- see
    `test_portrait_composite_row_carries_the_board_priority_cap`'s own
    updated docstring.

    STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`): 838px -> 664px, now shadowed by `CP-analysis`'s own
    UNCHANGED floor instead of settings' retired one — see
    `test_portrait_composite_row_carries_the_board_priority_cap`'s own
    updated docstring for the full derivation.

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2a, ledger rows
    2108/2331): the fork-1 ruling's own tree/T(...) residual-holder swap
    pins `T(...)` at this SAME 664px floor instead of leaving it elastic
    -- the track shape changes from `minmax(664px, 1fr)` to a plain fixed
    `664px` (`tree` is the row's residual holder now) -- see
    `test_portrait_composite_row_carries_the_board_priority_cap`'s own
    updated docstring for the full derivation.

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2b, ledger rows
    2073/2108/2151): both track vars' own indices shift, landscape's
    `--track-2-2-1` -> `--track-2-3-1` and portrait's `--track-4-1` ->
    `--track-5-1` -- the palette-adoption ruling's own new `A_setup`
    leaf (item 2) inserts as a new direct sibling ahead of the
    tree/panels row (the side column's own child, landscape; the root's
    own child, portrait -- see
    `test_portrait_composite_row_carries_the_board_priority_cap`'s own
    updated docstring)."""
    assert "var(--track-2-3-1, 664px)" in mockup_pages["landscape"]
    assert "var(--track-5-1, 664px)" in mockup_pages["portrait"]
    assert "minmax(664px, 1fr)" not in mockup_pages["landscape"]
    assert "minmax(664px, 1fr)" not in mockup_pages["portrait"]


def test_render_is_deterministic_given_the_same_overlay_data():
    """Re-rendering the SAME (slot, overlay_data) pair must produce a
    byte-identical page -- no wall-clock timestamp, no unordered
    iteration leaking into the output (mirrors emit_ts's own
    determinism test)."""
    reg, layouts = emit_mockup.load_class_slots()
    slot = layouts[reg.layout_by_class["landscape"]]
    overlay = emit_mockup.build_overlay_data(reg, layouts, "landscape", time_limit_s=10.0)
    text_a = emit_mockup.build_html_for_class("landscape", slot, overlay, reg)
    text_b = emit_mockup.build_html_for_class("landscape", slot, overlay, reg)
    assert text_a == text_b


# =============================================================================
# Fix pass regressions (lyt-mockups-opus-review.md, ledger row 1710/1711):
# B1 (square board emission shape), B2/B3 (board-priority track fidelity --
# covered above by test_landscape_side_column_track_carries_the_board_
# priority_clamp / test_portrait_composite_row_carries_the_board_priority_
# cap), and the supporting structural helpers.
# =============================================================================


def test_board_cell_emits_container_query_containment_not_both_axes_definite(mockup_pages):
    """B1 regression pin: the board leaf's own wrapper must carry the
    `board-cell` marker class (container-type:size, in `_STYLE`) and must
    NOT carry the old inert combination that caused the non-square bug
    (aspect-ratio alongside a same-element width:100%;height:100% with no
    non-stretch alignment override) -- i.e. `aspect-ratio` no longer
    appears inline on the leaf itself at all; it lives only in the
    `.board-square` CSS RULE (sized via cq units), never as an inline
    per-instance style on the leaf wrapper the way `justify-self:center`
    used to."""
    for class_id, html_text in mockup_pages.items():
        assert 'class="lyt-node lyt-leaf board-cell"' in html_text
        # The old bug's inline signature must be gone from every leaf.
        assert "aspect-ratio:1/1;max-width:100%" not in html_text
        assert "justify-self:center" not in html_text
        assert "align-self:center" not in html_text
    # The CSS rule carrying the actual containment lives once, in _STYLE.
    assert ".board-cell { display: grid; place-items: center; container-type: size; }" in emit_mockup._STYLE
    assert "width: min(100%, 100cqh); height: min(100%, 100cqw);" in emit_mockup._STYLE


def test_board_stones_sit_on_grid_intersections(mockup_pages):
    """B1 SECONDARY regression pin: every emitted stone's (left, top)
    percentage must be one of `_intersection_pct(i)` for i in 0..18 --
    the review's finding was that the old stone percentages (22%/30%,
    etc.) did not coincide with the board-grid's own line spacing, so
    stones sat inside cells rather than on intersections."""
    valid_pcts = {f"{emit_mockup._intersection_pct(i):g}" for i in range(19)}
    for class_id, html_text in mockup_pages.items():
        stone_positions = re.findall(r'class="board-stone board-stone-[bw]" style="left:([\d.]+)%;top:([\d.]+)%;"', html_text)
        assert stone_positions, f"{class_id}: no stones found"
        for left, top in stone_positions:
            assert left in valid_pcts, f"{class_id}: stone left={left}% is not on a grid intersection"
            assert top in valid_pcts, f"{class_id}: stone top={top}% is not on a grid intersection"


def test_board_has_star_points_and_coordinates(mockup_pages):
    """B1 secondary finding ('no star points and no coordinates').

    lyt-tree-always-visible (ledger row ~1735): previewBoard reuses
    `_board_html()` verbatim (same honest-proxy goban content, see
    `render_leaf`'s own comment for why), so each page now emits TWO
    boards' worth of hoshi/coordinate markup (the main board B plus
    previewBoard) -- counts doubled from the pre-existing single-board
    figures, not a change to what this test verifies (every emitted
    board still carries a full standard 19x19 hoshi/coordinate set)."""
    for class_id, html_text in mockup_pages.items():
        assert html_text.count('class="board-star"') == 18  # 2 boards x 9 standard 19x19 hoshi
        assert html_text.count('class="board-coord board-coord-col"') == 38  # 2 boards x 19
        assert html_text.count('class="board-coord board-coord-row"') == 38


def test_find_board_composite_child_recognizes_both_encodings_shapes():
    """`_find_board_composite_child` must find exactly the board-bearing
    child at both classes' roots, with the fixed-sibling sum matching
    the .lyt source's own declared 24px + 28px info/action rows.

    lyt-tree-always-visible (ledger row ~1735): boardRail is now the new
    FIRST child of both roots (see each .lyt file's own header), shifting
    the board composite's own index by one at both classes -- an index
    shift caused by a legitimate new leading sibling, not a change to
    which child is recognized as the composite (still uniquely matched
    by shape, per `_find_board_composite_child`'s own docstring).

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2b, ledger rows
    2073/2108/2151): portrait's own index shifts again, 2 -> 3 -- the
    palette-adoption ruling's own new `A_setup` leaf (item 2) inserts as
    a new direct root child between `A_app` and the board composite
    (portrait has no separate side column, so `A_setup` sits at root
    level -- see the encoding's own M2 STAGE B2b header note).
    Landscape's own index is UNCHANGED (`A_setup` lands inside the side
    column, not at the root, so the root's own board-composite index
    stays 1)."""
    reg, layouts = emit_mockup.load_class_slots()
    landscape_root = layouts[reg.layout_by_class["landscape"]].node
    portrait_root = layouts[reg.layout_by_class["portrait"]].node
    l_match = emit_mockup._find_board_composite_child(landscape_root)
    assert l_match is not None
    assert l_match[0] == 1  # composite is the SECOND child of landscape's H root (after boardRail)
    assert l_match[2] == 52.0  # 24px + 28px

    p_match = emit_mockup._find_board_composite_child(portrait_root)
    assert p_match is not None
    assert p_match[0] == 3  # composite is the FOURTH child of portrait's V root (after boardRail, A_app, A_setup)
    assert p_match[2] == 52.0


def test_find_board_composite_child_is_none_for_a_split_with_no_aspect_leaf():
    """A Split with no aspect-locked child at all must not match --
    `_board_priority_tracks` must be a no-op there, not misapply the
    override to an unrelated shape."""
    plain = ast.Split(
        axis="h",
        children=[
            ast.Slot(node=ast.Leaf(widget="x"), presence=ast.FIXED, sizing=ast.Sizing(min=ast.Extent(unit="px", v=28), pref=ast.Extent(unit="px", v=28), max=ast.Extent(unit="px", v=28))),
            ast.Slot(node=ast.Leaf(widget="y"), presence=ast.FIXED, sizing=ast.Sizing(min=ast.Extent(unit="px", v=0), pref=ast.Extent(unit="fr", v=1), max="inf")),
        ],
    )
    assert emit_mockup._find_board_composite_child(plain) is None


def test_board_priority_tracks_is_a_noop_when_no_composite_child_matches():
    plain = ast.Split(
        axis="h",
        children=[
            ast.Slot(node=ast.Leaf(widget="x"), presence=ast.FIXED, sizing=ast.Sizing(min=ast.Extent(unit="px", v=28), pref=ast.Extent(unit="px", v=28), max=ast.Extent(unit="px", v=28))),
        ],
    )
    tracks = ["28px"]
    sizings = [plain.children[0].sizing]
    assert emit_mockup._board_priority_tracks(plain, tracks, sizings) == tracks


# =============================================================================
# Fix pass 2 regressions (lyt-mockups-opus-review.md's "Re-review --
# 2026-08-10" section, ledger rows 1717-1720): N1 (the release-toggle
# track-property collision blocker), the X2 residual (caption gutter
# min-width), N2 (the all-off guard's silent revert), and N3 (the board's
# own strips not aligning to the board square).
# =============================================================================


def test_track_prop_naming_is_collision_free_by_construction():
    """N1's own root cause (review's diagnosis): `--track-{i}`, a bare
    per-level index, is an ORDINARY INHERITED CSS custom property -- an
    override set via `.style.setProperty` on one grid container is
    visible to every DESCENDANT grid's `var(--track-{i}, ...)` lookup
    too, not only that container's own template. Two unrelated nodes at
    different nesting depths that happened to reuse the same per-level
    index (the board composite's own row 0 and the portrait root's own
    column 0, in the specimen the review measured) collided: releasing
    the root's track silently rewrote the composite's unrelated one.

    The fix namespaces the property by the child's own FULL PATH FROM
    THE TREE ROOT. This test does not merely assert the review's two
    known-colliding paths no longer collide -- it walks BOTH classes'
    real trees, computes every Split child's track_prop the exact way
    `render_split` does, and asserts the WHOLE per-class set is
    collision-free. This holds by construction (distinct tuples path-
    join to distinct strings, since digits never contain the `-`
    delimiter -- an injective encoding, not a coincidence of the two
    specific trees), but pinning it against the real trees also catches
    a future change to the join scheme (e.g. a delimiter that could
    appear inside an index) that would silently break the guarantee.
    """
    reg, layouts = emit_mockup.load_class_slots()

    def walk(slot, path, acc):
        node = slot.node
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                cpath = path + (i,)
                acc.append("--track-" + "-".join(str(p) for p in cpath))
                walk(child, cpath, acc)
        # ast.Exclusive children are tab labels, not grid tracks of their
        # own (render_exclusive's own template is a plain literal, never
        # parameterized by var(--track-...)) -- nothing to walk into.

    for cls in reg.classes:
        props = []
        walk(layouts[reg.layout_by_class[cls.id]], (), props)
        assert props, f"{cls.id}: no Split tracks found -- test fixture assumption broken"
        dupes = sorted({p for p in props if props.count(p) > 1})
        assert not dupes, f"{cls.id}: collision in emitted track-property names: {dupes}"


def test_generated_pages_declare_every_track_prop_exactly_once(mockup_pages):
    """Concrete regression pin (complementing the abstract walk above):
    the actual EMITTED page must declare exactly one `var(--track-<path>,
    ...)` fragment per Split child in the real tree -- the same count the
    abstract walk computes -- and every declared name must be unique
    within that page. A regression that reintroduced a bare per-level
    index (or any other scheme that could alias two different nodes)
    would either shrink this count (two children silently sharing one
    declaration slot never happens structurally, but a future refactor
    that flattened a level could) or produce a duplicate name; either
    failure mode is caught here directly against the generator's own
    output, not just the tree-walking model of it."""
    reg, layouts = emit_mockup.load_class_slots()

    def count_split_children(slot):
        node = slot.node
        if isinstance(node, ast.Split):
            return len(node.children) + sum(count_split_children(c) for c in node.children)
        return 0

    for cls in reg.classes:
        expected = count_split_children(layouts[reg.layout_by_class[cls.id]])
        html_text = mockup_pages[cls.id]
        declared = re.findall(r"var\((--track-[0-9-]+),", html_text)
        assert len(declared) == expected, f"{cls.id}: expected {expected} track declarations, found {len(declared)}"
        dupes = sorted({p for p in declared if declared.count(p) > 1})
        assert not dupes, f"{cls.id}: duplicate track-property declaration(s) in emitted HTML: {dupes}"


def test_release_toggle_track_prop_is_path_namespaced(mockup_pages):
    """N1 regression pin, concrete specimen: the review's own measured
    collision was the board composite's row-0 track and the root's
    column-0 track both being named the bare `--track-0`. Every
    `data-track-prop` this generator emits must now be a multi-segment,
    path-namespaced name (contains a `-` after `--track`), not a bare
    single-level index -- pinning the exact defect shape the review
    found, not just its abstract precondition."""
    for class_id, html_text in mockup_pages.items():
        props = re.findall(r'data-track-prop="(--track-[0-9-]+)"', html_text)
        assert props, f"{class_id}: no data-track-prop attributes found"
        for p in props:
            assert re.match(r"^--track-\d+-\d+", p) or p.count("-") >= 3, (
                f"{class_id}: {p!r} looks like a bare per-level index, not a path-namespaced name"
            )


def test_x2_caption_gutter_clips_overflow_and_tabstrip_matches_row_padding():
    """X2 residual fix: `flex: 0 0 92px` alone does not stop a longer
    caption's own content from winning past the 92px basis (the review's
    measured 97.55px for "COMMON ACTIONS") -- `min-width: 0` is required
    to make the basis a real ceiling. `.lyt-tabstrip` must also carry the
    same 4px left padding the info/action rows declare, or its own
    caption starts 4px earlier than the other three strips'."""
    assert "min-width: 0;" in emit_mockup._STYLE
    caption_rule = re.search(r"\.row-caption,\s*\.lyt-tab-caption\s*\{([^}]*)\}", emit_mockup._STYLE)
    assert caption_rule, "shared .row-caption/.lyt-tab-caption rule not found in _STYLE"
    assert "min-width: 0" in caption_rule.group(1)
    assert "overflow: hidden" in caption_rule.group(1)
    tabstrip_rule = re.search(r"\.lyt-tabstrip\s*\{([^}]*)\}", emit_mockup._STYLE)
    assert tabstrip_rule, ".lyt-tabstrip rule not found in _STYLE"
    assert "padding-left: var(--space-tight)" in tabstrip_rule.group(1)
    # Matches the rows' own `gap: var(--space-default)` -- without it the
    # tab strip's first content item starts 8px earlier than the three
    # row strips' (the caption box + its margin lines up, but the rows'
    # additional flex `gap` after every child, including the caption,
    # has no tabstrip counterpart otherwise).
    assert "gap: var(--space-default)" in tabstrip_rule.group(1)


def test_n2_release_guard_disables_last_checkbox_instead_of_reverting():
    """N2 regression pin: the first fix pass's guard silently REVERTED an
    accepted click on the last remaining checked release checkbox
    (`cb.checked = true; return;`, with zero visible feedback) -- the
    review named this indistinguishable from a bug. The fix disables
    that checkbox (with an explanatory `title`) so the click is refused
    up front instead of accepted-then-undone."""
    assert "updateReleaseGuard" in emit_mockup._SCRIPT
    assert "cb.disabled = true" in emit_mockup._SCRIPT
    assert "cb.title = 'At least one panel must stay visible'" in emit_mockup._SCRIPT
    # The old silent-revert pattern must be gone, not merely supplemented.
    assert "cb.checked = true; return;" not in emit_mockup._SCRIPT
    assert "anyStillOn" not in emit_mockup._SCRIPT


def test_n3_board_composite_marker_and_fixed_sum_are_emitted(mockup_pages):
    """N3 regression pin: the board composite (the Split wrapping the
    board leaf plus its own fixed info/action rows) must carry the
    `board-composite` class and an inline `--board-fixed-sum` custom
    property equal to the SAME fixed-sibling total
    `_find_board_composite_child` already derives (52px in both classes:
    the 24px info row + 28px action row) -- the one input the
    `.board-composite` CSS rule needs to reproduce the board square's own
    sizing formula one level up."""
    for class_id, html_text in mockup_pages.items():
        assert "board-composite" in html_text
        assert "--board-fixed-sum:52px;" in html_text
    assert ".board-composite { container-type: size; }" in emit_mockup._STYLE
    assert "max-width: min(100cqw, calc(100cqh - var(--board-fixed-sum, 0px)));" in emit_mockup._STYLE


# =============================================================================
# AMENDMENT 5 (ledger row 1937): the `scroll <axis>` sizing-bag key, the
# `content: bounded|designed|unbounded` leaf axis, and the L5/L5a/L5b/L5c
# overflow-honesty laws (wellformed.py). See `SPEC-AMENDMENTS.md`'s own
# Amendment 5 section and `.claude/dispatch-reports/lyt-tab-region-
# consult.md` §9 for the full derivation. All fixtures below are inline
# `.lyt` text (loader.load_layouts), NOT the two protected clean-room
# encodings (lengyue_landscape.lyt / lengyue_portrait.lyt), which another
# concurrent work item owns and which carry NO Amendment 5 declarations
# at all -- see the dormancy regression test at the end of this section.
# =============================================================================


def _l5_load(text: str):
    return loader.load_layouts(text)


def test_scroll_parses_and_round_trips_on_leaf_and_composite_nodes():
    """`scroll <axis>` is legal on ANY node kind (leaf, split, exclusive)
    at any depth -- unlike `gap`, which is Split-only. Round-trips into
    `Slot.scroll_axes`; absence stays the empty frozenset (byte-identical
    to every pre-Amendment-5 encoding)."""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        "{min 0px, pref 1fr, max inf, scroll h} A[chrome],"
        "{min 0px, pref 1fr, max inf} T0[chrome])"
    )
    root = layouts["g"]
    assert root.scroll_axes == frozenset({"v"})
    assert root.node.children[0].scroll_axes == frozenset({"h"})
    assert root.node.children[1].scroll_axes == frozenset()  # undeclared -> empty


def test_scroll_may_declare_both_axes_via_repeated_terms():
    """UNLIKE every other sizing key's last-write-wins bag semantics,
    repeated `scroll <axis>` terms naming DIFFERENT axes accumulate
    (disclosed departure, parser.py's own AMENDMENT 5 note) -- a leaf
    that scrolls in both directions declares `scroll h, scroll v`."""
    layouts = _l5_load(
        "layout g = {min 0px, pref 0px, max 0px, scroll h, scroll v} "
        "A[chrome]"
    )
    assert layouts["g"].scroll_axes == frozenset({"h", "v"})


def test_scroll_refuses_unknown_axis_loudly():
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load("layout g = {min 0px, pref 0px, max 0px, scroll z} A[chrome]")
    assert exc_info.value.detail.get("law") == "scroll-declaration"
    assert exc_info.value.detail.get("prohibition") == "invalid-scroll-axis"


def test_content_class_parses_and_round_trips_on_a_leaf():
    for cls in ("bounded", "designed", "unbounded"):
        # 'unbounded' additionally declares `scroll v` on itself purely
        # so it doesn't trip L5a's coverage requirement -- 'designed'
        # must NOT (that would trip L5c, chart exclusion) and 'bounded'
        # needs none either. This test is about PARSING/ROUND-TRIP, not
        # law enforcement (L5a/L5c get their own dedicated tests below).
        # [Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331: L17
        # is now wired into `check_wellformed`'s default enforcement
        # (`_l5_load` goes through the full `load_layouts` path) -- an
        # `unbounded` leaf declaring `scroll v` on itself now also owes
        # an `edge v`; `continuous` is the honest disposition for this
        # fixture's own content-free stand-in leaf.]
        extra = ", scroll v, edge v continuous" if cls == "unbounded" else ""
        layouts = _l5_load(
            f"layout g = {{min 0px, pref 0px, max 0px, content {cls}"
            f"{extra}}} A[chrome]"
        )
        assert layouts["g"].node.content == cls


def test_content_class_refuses_unknown_value_loudly():
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load("layout g = {min 0px, pref 0px, max 0px, content chart} A[chrome]")
    assert exc_info.value.detail.get("law") == "content-class-declaration"
    assert exc_info.value.detail.get("prohibition") == "unknown-content-class"
    assert exc_info.value.detail.get("got") == "chart"


@pytest.mark.parametrize("node_shape", ["split", "exclusive"])
def test_content_class_refuses_on_non_leaf_nodes(node_shape):
    """`content` is a LEAF-only axis (consult report §9.2: orthogonal to,
    never conscripted into, domain/facets) -- declaring it on a Split or
    an Exclusive is refused, not silently dropped."""
    if node_shape == "split":
        text = (
            "layout g = {min 0px, pref 1fr, max inf, content unbounded} H("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    else:
        text = (
            "layout g = {min 0px, pref 1fr, max inf, content unbounded} T("
            "{min 0px, pref 1fr, max inf} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(text)
    assert exc_info.value.detail.get("law") == "content-class-declaration"
    assert exc_info.value.detail.get("prohibition") == "content-class-on-non-leaf"
    assert exc_info.value.detail.get("node_kind") == node_shape


# --- L5 (overflow honesty): unbounded content may not claim an envelope ----


def test_l5_unbounded_leaf_with_envelope_is_refused():
    """An envelope enumerates a FINITE set of content states -- not an
    honest claim for content that is unbounded by definition."""
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
            "{min 0px, pref 1fr, max inf, content unbounded, "
            "envelope: {short, long}} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l5_bounded_leaf_with_envelope_is_accepted():
    """A bounded (or designed) leaf's envelope IS an honest claim -- L5
    only fires for content: unbounded."""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, content bounded, "
        "envelope: {short, long}} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


# --- L5a (coverage): unbounded requires exactly one scroll owner on path ---


def test_l5a_unbounded_leaf_with_no_scroll_owner_anywhere_is_refused():
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf, content unbounded} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5a"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l5a_unbounded_leaf_covered_by_an_ancestor_scroll_owner_is_accepted():
    """Nesting depth >= 3: H > V > H > leaf, with the scroll owner
    declared on the OUTERMOST H -- coverage does not require the
    IMMEDIATE parent to declare scroll, any ancestor on the
    root-to-leaf path suffices."""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        "{min 0px, pref 1fr, max inf} V("
        "{min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, content unbounded} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome]"
        "),"
        "{min 0px, pref 1fr, max inf} C[chrome]"
        "),"
        "{min 0px, pref 1fr, max inf} D[chrome])"
    )
    assert "g" in layouts


def test_l5a_unbounded_leaf_covered_by_declaring_scroll_on_itself_is_accepted():
    """A leaf may satisfy its own coverage requirement by declaring
    `scroll` on itself -- no ancestor container is required.

    [Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331: L17 is now
    wired into `check_wellformed`'s default enforcement -- `A`'s own
    `content unbounded` + `scroll v` now also owes an `edge v`, which
    this test isn't exercising, so `continuous` (the honest disposition
    for a fixture with no real content nature) is added rather than
    leaving the fixture accidentally L17-noncompliant.]"""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, content unbounded, scroll v, edge v continuous} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l5a_bounded_and_designed_leaves_carry_no_coverage_requirement():
    """Unlike `unbounded`, `bounded`/`designed` leaves need no scroll
    owner at all -- their own reservation (or an honest envelope) is
    sufficient (L5's own disclosed residual)."""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, content bounded} A[chrome],"
        "{min 0px, pref 1fr, max inf, content designed} B[chrome])"
    )
    assert "g" in layouts


# --- L5b (single scroll owner per axis per root-to-leaf path) --------------


def test_l5b_second_declaration_on_the_same_axis_on_the_same_path_is_refused():
    """Nesting depth >= 3: the outer H declares `scroll v`; a V nested
    two levels below it declares `scroll v` again on the SAME path --
    'which container absorbs the overflow' is ambiguous."""
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
            "{min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf, scroll v} V("
            "{min 0px, pref 1fr, max inf, content unbounded} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome]"
            ")"
            "),"
            "{min 0px, pref 1fr, max inf} C[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5b"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l5b_two_different_axes_on_the_same_path_are_accepted():
    """`scroll h` at one slot and `scroll v` at a descendant on the SAME
    path are NOT in conflict -- L5b is scoped per axis.

    [Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331: `edge v
    continuous` added -- L17 is now wired, and `A`'s `content unbounded`
    + `scroll v` owes an edge; `h` carries no `content`/`scroll` of its
    own on the leaf, so nothing else is owed on that axis.]"""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf, scroll h} H("
        "{min 0px, pref 1fr, max inf, scroll v, content unbounded, edge v continuous} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    assert "g" in layouts


def test_l5b_same_axis_on_two_different_paths_is_accepted():
    """Two SIBLING subtrees each declaring `scroll v` on their OWN,
    disjoint root-to-leaf paths do not conflict -- L5b is quantified per
    path, not over the whole tree.

    [Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331: `edge v
    continuous` added to both leaves -- L17 is now wired, and each
    leaf's own `content unbounded` + `scroll v` owes its own edge.]"""
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, scroll v, content unbounded, edge v continuous} A[chrome],"
        "{min 0px, pref 1fr, max inf, scroll v, content unbounded, edge v continuous} B[chrome])"
    )
    assert "g" in layouts


# --- L5c (chart exclusion, subtree-quantified fold) -------------------------


def test_l5c_scroll_container_with_a_designed_descendant_is_refused():
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
            "{min 0px, pref 1fr, max inf, content designed} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5c"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l5c_fires_regardless_of_nesting_depth_of_the_designed_leaf():
    """The fold is over the WHOLE subtree, not just direct children --
    nesting depth >= 3 below the scroll-declaring node."""
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
            "{min 0px, pref 1fr, max inf} V("
            "{min 0px, pref 1fr, max inf} H("
            "{min 0px, pref 1fr, max inf, content designed} A[chrome],"
            "{min 0px, pref 1fr, max inf} B[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} C[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} D[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5c"


def test_l5c_scroll_container_with_no_designed_descendant_is_accepted():
    layouts = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        "{min 0px, pref 1fr, max inf, content unbounded} A[chrome],"
        "{min 0px, pref 1fr, max inf, content bounded} B[chrome])"
    )
    assert "g" in layouts


def test_l5c_the_other_tab_shaped_composition_is_refused():
    """The consult report's own worked failure case (§9.3): a container
    mixing an unbounded editor (a registry leaf) with a chart-ish strip
    (a designed leaf) inside ONE scrolling band -- L5c refuses this
    composition outright, forcing the honest restructure the report
    names: split into a fixed designed-height band and a scroll-owned
    band. Shaped as a T tab (the actual "Other" tab is a T-group child)
    nested inside a V, to match the real region's own shape."""
    with pytest.raises(LytLoadError) as exc_info:
        _l5_load(
            "layout g = {min 0px, pref 1fr, max inf} V("
            "{min 0px, pref 1fr, max inf} T("
            "{min 0px, pref 1fr, max inf, scroll v} V("
            "{min 0px, pref 1fr, max inf, content designed} "
            "colorDebugStrip[chrome],"
            "{min 0px, pref 1fr, max inf, content unbounded} "
            "freeformJsonEditor[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} otherTabSibling[chrome]"
            "),"
            "{min 0px, pref 1fr, max inf} headerStrip[chrome])"
        )
    assert exc_info.value.detail.get("law") == "L5c"
    # Honest restructure per the report: split the scroll-owning band so
    # the designed leaf sits OUTSIDE it, in its own fixed reservation.
    # [Updated 2026-08-12, M2 stage B2a, ledger rows 2108/2331: `edge v
    # continuous` added to `freeformJsonEditor` -- L17 is now wired, and
    # its own `content unbounded` + `scroll v` owes an edge; `continuous`
    # matches this leaf's own freeform-text nature, the same reasoning
    # `otherBand` uses in the real encodings (no indivisible thing stands
    # at a freeform-JSON scroll boundary the way a table row does).]
    fixed = _l5_load(
        "layout g = {min 0px, pref 1fr, max inf} V("
        "{min 0px, pref 1fr, max inf} T("
        "{min 0px, pref 1fr, max inf} V("
        "{min 0px, pref 1fr, max inf, content designed} colorDebugStrip[chrome],"
        "{min 0px, pref 1fr, max inf, content unbounded, scroll v, edge v continuous} "
        "freeformJsonEditor[chrome]"
        "),"
        "{min 0px, pref 1fr, max inf} otherTabSibling[chrome]"
        "),"
        "{min 0px, pref 1fr, max inf} headerStrip[chrome])"
    )
    assert "g" in fixed


# --- Combined-law scenario, and dormancy on every pre-Amendment-5 encoding -


def test_l5_family_waiver_reuses_the_existing_l2_waiver_mechanism():
    """`Waiver`'s own docstring always disclosed `law` as open-ended, "in
    case a future law gains a structural checker" -- this is that law.
    A single, correctly-cited waiver silences one L5a violation without
    weakening the check for any other site."""
    text = (
        "layout g = {min 0px, pref 1fr, max inf} H("
        "{min 0px, pref 1fr, max inf, content unbounded} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    raws = __import__("parser").parse_layouts(text)
    slot = loader.load_slot(raws[0].slot, path=raws[0].name)
    waiver = Waiver(law="L5a", path="root/H0", citation="Amendment 5 test fixture, deliberately uncovered")
    applied = check_wellformed(slot, layout_name="g", waivers=[waiver])
    assert applied == [waiver]


def test_dormancy_no_amendment_5_declarations_means_zero_l5_violations_everywhere():
    """The HARD CONSTRAINT this work item is bound by: every reference
    encoding (including the two protected clean-room encodings this
    session does NOT edit) carries zero `scroll`/`content` declarations,
    so `find_l5_violations` must return `[]` for every one of them --
    the laws bind declarations; they do not retroactively indict
    silence."""
    import wellformed

    for filename, layout_name in [
        ("q5go", "q5go"),
        ("ogs", "ogs"),
        ("lengyue_landscape", "lengyue-landscape"),
        ("lengyue_portrait", "lengyue-portrait"),
        ("current_row_repaired", "current-row-repaired"),
    ]:
        layouts = _load(filename)
        slot = layouts[layout_name]
        assert wellformed.find_l5_violations(slot) == [], (
            f"{filename}:{layout_name} must stay dormant under the new "
            "Amendment 5 laws -- no scroll/content declared anywhere in "
            "it"
        )


# --- Review finding 1 (lyt-amendment5-review.md, MODERATE) -----------------
# `presence.prune_absent` reconstructs a Split/Exclusive's own `Slot` after
# removing an absent child, forwarding `presence`/`sizing`/`violates` from
# the original -- but Amendment 5's `scroll_axes` field was not swept into
# that forwarding when it was added, so a composite ancestor's OWN `scroll`
# declaration silently vanished the instant a sibling leaf got pruned.
# Fixed in presence.py (both the Split and Exclusive branches); regression
# tests below pin BOTH branches, plus the no-op case (empty absent set
# doesn't rebuild the tree at all, so nothing could be dropped there) and
# the Leaf branch (a leaf's own `content` survives unrelated pruning --
# `prune_absent`'s Leaf branch returns the leaf unchanged, so this is a
# dormant-by-construction case, pinned anyway per the review's own request).
# =============================================================================


def test_prune_absent_preserves_scroll_axes_on_reconstructed_composites():
    """The bug, on a Split node: `scroll v` declared on the ROOT (an H
    split) must survive pruning one of its children."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        "@toggle(user, release) {min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    root = layouts["g"]
    assert root.scroll_axes == frozenset({"v"})
    pruned = presence_mod.prune_absent(root, frozenset({"A"}))
    assert pruned.scroll_axes == frozenset({"v"}), (
        "prune_absent dropped the root Split's own scroll declaration "
        "(review finding 1)"
    )
    assert len(pruned.node.children) == 1  # the prune itself still worked


def test_prune_absent_preserves_scroll_axes_on_reconstructed_exclusive():
    """The same bug, on an Exclusive (T) node -- the second call site
    `prune_absent` rebuilds a `Slot` at."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, scroll h} T("
        "@toggle(user, release) {min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    root = layouts["g"]
    assert root.scroll_axes == frozenset({"h"})
    pruned = presence_mod.prune_absent(root, frozenset({"A"}))
    assert pruned.scroll_axes == frozenset({"h"}), (
        "prune_absent dropped the root Exclusive's own scroll declaration "
        "(review finding 1)"
    )
    assert len(pruned.node.children) == 1


def test_prune_absent_preserves_scroll_axes_on_a_nested_composite_ancestor():
    """Nesting: a `scroll v` declared on an INNER V (not the root H) must
    survive pruning a leaf elsewhere in the tree -- the fix must be a
    property of `prune_absent`'s reconstruction generally, not just the
    slot passed in at the top of the recursion."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf} H("
        "@toggle(user, release) {min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf, scroll v} V("
        # inner1's coverage comes from V's ancestor scroll declaration
        # ABOVE, per L5a -- declaring `scroll v` AGAIN here would be a
        # second owner on the same axis on the same path (L5b), not a
        # legal reinforcement.
        "{min 0px, pref 1fr, max inf, content unbounded} inner1[chrome],"
        "{min 0px, pref 1fr, max inf} inner2[chrome]"
        "))"
    )
    root = layouts["g"]
    inner_v = root.node.children[1]
    assert inner_v.scroll_axes == frozenset({"v"})
    pruned = presence_mod.prune_absent(root, frozenset({"A"}))
    pruned_inner_v = pruned.node.children[0]  # A was removed, V is now index 0
    assert pruned_inner_v.scroll_axes == frozenset({"v"}), (
        "prune_absent dropped a NESTED composite's own scroll declaration "
        "(review finding 1)"
    )


def test_prune_absent_identity_case_never_drops_scroll_axes():
    """The `absent_widgets=frozenset()` no-op path returns the SAME slot
    object (no reconstruction at all), so scroll_axes can never be
    dropped there -- pinned to make the "identity means nothing to fix"
    reasoning explicit, not merely implied by the other tests."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        "{min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf} B[chrome])"
    )
    root = layouts["g"]
    pruned = presence_mod.prune_absent(root, frozenset())
    assert pruned is root
    assert pruned.scroll_axes == frozenset({"v"})


def test_prune_absent_preserves_a_surviving_leafs_content_class():
    """`content` lives on `Leaf`, and `prune_absent`'s Leaf branch returns
    a leaf UNCHANGED (`return slot`, no reconstruction) rather than
    rebuilding it -- so a surviving leaf's `content` classification is
    dormant-by-construction safe from this bug class. Pinned anyway, per
    the review's own request to check "content classes, if any
    reconstruction path touches leaves" -- this test is the evidence that
    none does."""
    layouts = loader.load_layouts(
        "layout g = {min 0px, pref 1fr, max inf, scroll v} H("
        # B's coverage comes from the root H's ancestor scroll declaration
        # -- a second self-declared `scroll v` here would be an L5b
        # conflict, same reasoning as the nested-composite test above.
        "@toggle(user, release) {min 0px, pref 1fr, max inf} A[chrome],"
        "{min 0px, pref 1fr, max inf, content unbounded} B[chrome])"
    )
    root = layouts["g"]
    pruned = presence_mod.prune_absent(root, frozenset({"A"}))
    surviving = pruned.node.children[0]
    assert surviving.node.widget == "B"
    assert surviving.node.content == "unbounded"
    # B carries no scroll of its OWN (coverage comes from root); this
    # assertion pins that `content` -- the field under test here -- is
    # what survives, not a scroll_axes value B never declared.
    assert surviving.scroll_axes == frozenset()


# --- Per-T-group shortfall advisory (advisory.py) ---------------------------


_ADVISORY_FIXTURE = """
layout advtest =
  {min 0px, pref 1fr, max inf} V(
    {min 24px, pref 24px, max 24px} header[chrome],
    {pref 1fr} T(
      {min 20px, pref 100px, max inf} basic[chrome],
      {min 20px, pref 400px, max inf} stability[chrome]
    )
  )
"""


def test_advisory_reports_per_child_shortfall_against_the_shared_rectangle():
    """Hand-computed: a 300x300 viewport leaves the T group 300x276
    (300 - 24px header) after the V-split partition -- the T node's own
    HARD floor (componentwise max of its children's declared `min`s,
    20px both axes) fits comfortably, so the model is feasible, and
    (with no reach-preferred widgets registered) both children solve to
    exactly the shared rectangle. `basic`'s 100px SOFT `pref` target
    fits (shortfall 0 on both axes -- SPEC.md §8's along=None branch
    applies the SAME declared `pref` to both w AND h for a T child);
    `stability`'s 400px `pref` target does not fit either axis --
    exactly the DIFFERENTIAL shortfall the consult report's §1 witnessed
    symptom names as a program-level fact. This is deliberately measured
    against `pref` (a soft target the solver may leave unmet), never
    `min` (a hard floor whose shortfall state is unreachable -- see
    advisory.py's own module docstring)."""
    import advisory

    layouts = loader.load_layouts(_ADVISORY_FIXTURE)
    slot = layouts["advtest"]
    result = solve_lexicographic(
        slot, class_id="t", w_px=300, h_px=300, board_widget=None,
        reach_preferred_widgets=None,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    shortfalls = advisory.compute_t_group_shortfalls(slot, result)
    by_widget = {s.label: s for s in shortfalls}
    assert set(by_widget) == {"basic", "stability"}
    basic = by_widget["basic"]
    assert basic.t_path == "root/V1"
    assert basic.demand_px == 100.0
    assert (basic.shared_w, basic.shared_h) == (300, 276)
    assert basic.shortfall_w == 0.0 and basic.shortfall_h == 0.0
    stability = by_widget["stability"]
    assert stability.demand_px == 400.0
    assert stability.shortfall_w == 100.0  # max(400-300, 0)
    assert stability.shortfall_h == 124.0  # max(400-276, 0)
    # format_shortfalls is advisory prose only -- assert it runs and
    # mentions both panes, not a specific wording (never a load-bearing
    # contract, per the module's own docstring).
    text = advisory.format_shortfalls(shortfalls)
    assert "basic" in text and "stability" in text


def test_advisory_is_empty_for_a_tree_with_no_exclusive_nodes():
    import advisory

    layouts = _load("q5go")
    slot = layouts["q5go"]
    result = solve_lexicographic(
        slot, class_id="test", w_px=1920, h_px=1080, board_widget="B",
        reach_preferred_widgets=["A", "I"], time_limit_s=30,
    )
    assert advisory.compute_t_group_shortfalls(slot, result) == []
    assert advisory.format_shortfalls([]) == ""


def test_advisory_recurses_into_nested_t_groups_at_their_own_depth():
    """Nesting depth >= 3: a T nested inside a V nested inside the outer
    T's own child reports its OWN shortfalls at its OWN t_path, not
    folded into the outer group's row."""
    import advisory

    text = """
    layout nested =
      {min 0px, pref 1fr, max inf} T(
        {min 0px, pref 1fr, max inf} V(
          {min 20px, pref 20px, max 20px} strip[chrome],
          {pref 1fr} T(
            {min 50px, pref 50px, max inf} inner1[chrome],
            {min 60px, pref 60px, max inf} inner2[chrome]
          )
        ),
        {min 30px, pref 30px, max inf} otherPane[chrome]
      )
    """
    layouts = loader.load_layouts(text)
    slot = layouts["nested"]
    result = solve_lexicographic(
        slot, class_id="t", w_px=200, h_px=200, board_widget=None,
        reach_preferred_widgets=None,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    shortfalls = advisory.compute_t_group_shortfalls(slot, result)
    t_paths = {s.t_path for s in shortfalls}
    assert "root" in t_paths
    assert "root/T0/V1" in t_paths
    inner_labels = {s.label for s in shortfalls if s.t_path == "root/T0/V1"}
    assert inner_labels == {"inner1", "inner2"}


# =============================================================================
# OPTION C tab-skeleton-encoding wave (2026-08-11, ledger row 1937's ratified
# consult, `.claude/dispatch-reports/lyt-tab-region-consult.md`; work item
# lyt-tab-skeleton-encoding), item 6: cross-check the encoding's nested
# T(AT-basic, AT-distributions, AT-stability, AT-multiresolution) DEFAULT
# analysis-tab structure against `frontend/src/store/defaults.ts`'s own
# `analysisTabs` array -- the authority (product's SSOT of default tabs,
# per the ratified consult's own §8.1 point 4: "the tab tables are the
# authority ... the encoding's nested-T fragment is derived or build-time-
# linted against them").
#
# STRENGTH DISCLOSURE (P7's hierarchy, ADR-0011 Rule 1's own "name the
# level" discipline): this is a STATIC-TEXT-EXTRACTION regression, not a
# true two-sided GENERATED artifact (a JSON snapshot both `defaults.ts`'s
# own build and this Python suite would independently emit and diff). That
# stronger form would require either a Node/TS build step wired into this
# Python test's own fixture setup (a new build-tooling dependency this
# research prototype does not otherwise carry) or a `frontend/src`-side
# generator emitting a snapshot file for this suite to read (a
# `frontend/src` touch this wave's SOLVER-SIDE-ONLY scope forbids). The
# floor this test DOES clear: it is NOT pure-prose correspondence (a
# comment asserting the two match) -- it is a MECHANICAL, automated
# extraction of `defaults.ts`'s own literal `analysisTabs` array text
# (a regex over the SAME source the frontend itself imports, not a
# hand-transcribed copy) compared programmatically against the loaded
# `.lyt` tree's own structure, and it FAILS LOUDLY (a real pytest
# assertion, gated in CI's `research/lyt` suite run) the moment either
# side changes without the other. Named honestly as the interim floor,
# per §8.1's own point 4: "the §3 cross-check test is the floor, the
# build-time form the named target" -- promoting to a true generated-JSON
# two-sided snapshot is the filed follow-up, not silently substituted for
# here.
# =============================================================================

FRONTEND_ROOT = Path(__file__).parent.parent.parent.parent / "frontend"


def _extract_default_analysis_tabs():
    """Regex-extracts `frontend/src/store/defaults.ts`'s own `analysisTabs`
    array literal -- `[(tab_id, panel_count), ...]` in declared order. Reads
    the SAME source file the frontend itself imports (never a hand-copied
    transcription), so a future edit to that array is picked up automatically
    the next time this test runs, per this test's own strength disclosure
    above."""
    import re

    defaults_ts = (FRONTEND_ROOT / "src" / "store" / "defaults.ts").read_text()
    m = re.search(r"analysisTabs:\s*\[(.*?)\n\s*\],", defaults_ts, re.S)
    assert m, "defaults.ts: could not locate the analysisTabs array literal -- has its shape changed?"
    block = m.group(1)
    entries = []
    for entry_m in re.finditer(r"\{\s*id:\s*'([^']+)'.*?panelIds:\s*\[([^\]]*)\]\s*\}", block):
        tab_id = entry_m.group(1)
        panel_ids_text = entry_m.group(2).strip()
        panel_count = 0 if not panel_ids_text else len(panel_ids_text.split(","))
        entries.append((tab_id, panel_count))
    assert entries, "defaults.ts: analysisTabs array matched but no {id, panelIds} entries were extracted"
    return entries


def _find_control_panel_exclusive(node) -> "ast.Exclusive | None":
    """Recursively finds the control-panel `T(...)` node (`tag == 'BLACK
    BOX'`) anywhere in a layout tree -- a genuine structural fold, total
    over Leaf|Split|Exclusive, since the T's own depth in its parent tree
    is encoding detail this helper should not hardcode."""
    if isinstance(node, ast.Leaf):
        return None
    if isinstance(node, ast.Exclusive):
        if node.tag == "BLACK BOX":
            return node
        for c in node.children:
            found = _find_control_panel_exclusive(c.node)
            if found is not None:
                return found
        return None
    if isinstance(node, ast.Split):
        for c in node.children:
            found = _find_control_panel_exclusive(c.node)
            if found is not None:
                return found
        return None
    raise TypeError(f"unknown LayoutNode kind: {node!r}")


def _encoding_analysis_tab_structure(slot: ast.Slot):
    """Walks the LOADED `.lyt` tree to find `CP-analysis`'s own composite
    interior -- `V(timelineStrip, T(AT-basic, AT-distributions, AT-stability,
    AT-multiresolution))` -- and returns `[(index, panel_count), ...]` in
    declared child order: a `V`-node AT-* child's panel_count is its own
    number of leaf children; a bare-leaf AT-* child (AT_multires) counts as
    exactly 1. `CP-analysis` is identified structurally (the FOURTH direct
    child of the outer 5-way T, per this wave's own encoding order --
    library/cards/settings/analysis/other), not by widget id, since it no
    longer HAS one (it is a composite, not a leaf)."""
    outer_t = _find_control_panel_exclusive(slot.node)
    assert outer_t is not None, "could not find the control-panel T node (tag=='BLACK BOX') anywhere in this layout's tree"
    cp_analysis_slot = outer_t.children[3]
    cp_analysis = cp_analysis_slot.node
    assert isinstance(cp_analysis, ast.Split), "CP-analysis (4th child) must be the opened V(timelineStrip, T(AT-*)) composite"
    inner_t_slot = cp_analysis.children[1]
    inner_t = inner_t_slot.node
    assert isinstance(inner_t, ast.Exclusive), "CP-analysis's 2nd child must be the nested T(AT-*) group"
    out = []
    for i, at_slot in enumerate(inner_t.children):
        node = at_slot.node
        if isinstance(node, ast.Leaf):
            out.append((i, 1))
        elif isinstance(node, ast.Split):
            leaf_count = sum(1 for c in node.children if isinstance(c.node, ast.Leaf))
            out.append((i, leaf_count))
        else:
            raise AssertionError(f"AT-* child {i} is neither a Leaf nor a V-split: {node!r}")
    return out


@pytest.mark.parametrize("filename,layout_name", [
    ("lengyue_landscape", "lengyue-landscape"),
    ("lengyue_portrait", "lengyue-portrait"),
])
def test_analysis_tabs_cross_check_against_defaults_ts(filename, layout_name):
    """Item 6's cross-check: the encoding's nested T(AT-*) group must have
    exactly as many children as `defaults.ts`'s own `analysisTabs` array,
    and each AT-* child's own panel-leaf count must match that tab's own
    `panelIds` length. A divergence here (a tab added/removed/renamed in
    `defaults.ts`, or a panel added/removed from a tab) FAILS this test
    loudly rather than leaving the encoding silently stale."""
    default_tabs = _extract_default_analysis_tabs()
    layouts = _load(filename)
    slot = layouts[layout_name]
    encoded = _encoding_analysis_tab_structure(slot)
    assert len(encoded) == len(default_tabs), (
        f"{filename}: encoding has {len(encoded)} AT-* tabs, defaults.ts has {len(default_tabs)} "
        f"({[t for t, _ in default_tabs]}) -- the encoding's nested T(AT-*) group has drifted from "
        "the authoritative default tab table."
    )
    for (idx, enc_count), (tab_id, def_count) in zip(encoded, default_tabs):
        assert enc_count == def_count, (
            f"{filename}: AT-* tab #{idx} (defaults.ts id={tab_id!r}) has {def_count} panels in "
            f"defaults.ts but {enc_count} panel leaves in the encoding -- drifted."
        )
