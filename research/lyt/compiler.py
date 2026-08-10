"""CP-SAT compiler, following the consult document's §6 sketch
(layout-language-consult.md lines 609-674) as literally as its own
disclosed sketchiness allows ("sketch, per commission: secondary", line
609).

Decision variables: one (w, h) integer pair per Slot, in px, per screen
class (line 617-618). No x/y variables and no no-overlap constraints — "the
tree *is* the non-overlap proof" (line 620-622) — positions are recovered
by accumulating partition offsets during rendering (render.py), not solved
for.

Hard constraints (line 624-641):
  - root pinned to the class's W×H (line 626).
  - H/V partition equalities (line 627-628).
  - T-node: every child gets the SAME rectangle as the T node itself
    (line 629-630); T's own min is the componentwise max of its children's
    min (an implication of "same rectangle" + each child's own min bound —
    we additionally derive and assert it explicitly at compile time when
    a T slot's own declared min is smaller than that componentwise max,
    since loader.py deliberately left a T's omitted 'min' at a
    disclosed-default 0px and lets the compiler supply the real floor).
  - sizing bounds per slot, `ch` already resolved by the loader. `fr` in
    `pref` position is handled by the partition equality itself (an
    `fr`-sized child's PREF extent is a free variable within [min,max],
    and the OBJECTIVE's reach-preferred term is what makes it grow — there
    is deliberately no separate "fr proportionality" hard constraint for
    `pref`, since the document doesn't specify one either). `fr` in `min`
    or `max` position is a DIFFERENT case — see "fr bounds (F2 fix)" below;
    it used to be silently dropped (a review defect, F2 in
    `.claude/dispatch-reports/lyt-compiler-prototype-review.md`) and is now
    resolved to a real bound rather than vanishing.
  - aspect: `w = aspect * h` as a pure integer equality for aspect=1
    (line 634-635); for non-1 aspects this prototype still uses
    `w = round(aspect * SCALE) * h / SCALE`-style scaled integer equality
    via CP-SAT's linear constraints (none of the five worked encodings use
    a non-1 aspect, so this path is present but unexercised — disclosed).
  - presence: only the 'all slots present' valuation is solved (line
    636-638's "solve the default valuation... in practice solve the
    default valuation plus any valuation the author lists as common" — no
    worked encoding names an alternate valuation to solve, so only the
    default is implemented; disclosed narrowing).

fr bounds (F2 fix): §6 line 631-633 says only that "fr [is] handled by the
partition equality itself", without saying what an `fr` value in MIN or MAX
position (as opposed to `pref`) means — and §5.3's own worked OGS encoding
(`I[info]{min 96px, pref 160px, max 25fr}`, consult-doc line 537) uses one.
Refusing to load any `fr` in min/max position would make that worked
encoding itself unloadable, which is worse than resolving it. We adopt a
disclosed convention: **`N fr` in min/max position means N% of the
enclosing Split's own extent along its partition axis** (constant
`FR_MIN_MAX_DENOMINATOR = 100`, i.e. "100 shares == the whole split"),
expressed as a genuine CP-SAT linear constraint against the split's own
(w or h) variable — not a constant — so it tracks whatever that split
solves to. A `min`/`max` fr bound with no enclosing Split to denominate
against (the ROOT slot, or a direct child of an Exclusive/T node, which
shares the WHOLE parent rectangle on both axes per §4.1 line 297-298, so
there is no single partition-axis length to take a share of) is refused
with a structured `LytLoadError` at compile time rather than silently
dropped or given an arbitrary meaning.

Objective (line 645-658): staged lexicographic solve, since §6 offers it as
the "standard" option alongside a single weighted sum and doesn't commit to
either — "solve term 1, fix its optimum as a constraint, solve term 2, ..."
is exactly what we do, chosen over the weighted-sum alternative because it
needs no dominance-weight tuning and is easy to witness stage-by-stage.

Staging discipline (F6 fix): §6's own phrasing is "fix ITS OPTIMUM as a
constraint" (line 646-647) — the OBJECTIVE VALUE, not the individual
variable values that happened to produce it. The original version of this
compiler pinned every variable touched by a stage to its one arbitrary
optimal solution's value, which is strictly stronger: later stages lose
the freedom to move among ties from an earlier stage, so a later stage's
result is not certified as the true lexicographic optimum (review finding
F6). Stage 1 still pins a single variable (`board_w`) directly — for a
single variable that is equivalent to pinning the objective value, so it's
kept as the simple form. Stages 1.5 and 2 now pin the SUM of their
objective's terms to the stage's solved optimum via a constraint that is
re-derived (same terms, fresh IntVars) on every subsequent rebuild — see
`stage_constraints` in `solve_lexicographic`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from ortools.sat.python import cp_model

import lyt_ast as ast
from errors import LytLoadError


@dataclass
class SolvedRect:
    x: int
    y: int
    w: int
    h: int


@dataclass
class SolveResult:
    class_id: str
    w_px: int
    h_px: int
    rects: Dict[str, SolvedRect]  # path -> rect (path also encodes widget name)
    leaf_names: Dict[str, str]  # path -> widget id
    objective_values: List[float]
    status: str


class _SlotVars:
    """One CP-SAT (w,h) integer-variable pair per Slot in the tree, keyed
    by the same dotted `path` used elsewhere (loader.py, render.py) so
    results can be cross-referenced."""

    def __init__(self) -> None:
        self.w: Dict[str, cp_model.IntVar] = {}
        self.h: Dict[str, cp_model.IntVar] = {}
        self.leaf_names: Dict[str, str] = {}


# --- fr-in-min/max convention (F2 fix) --------------------------------------
# "N fr" in min/max position means N% of the enclosing Split's own extent
# along its partition axis. See the module docstring's "fr bounds (F2 fix)"
# section for the full reasoning and the refusal this convention still
# performs when there is no enclosing Split to denominate against.
FR_MIN_MAX_DENOMINATOR = 100
_FR_SCALE = 1000


def _extent_px(e, *, upper_bound: int) -> Optional[int]:
    """Resolve a resolved (loader-level) Extent to a concrete px bound, or
    None if it's an 'fr' extent (fr in min/max position is NOT resolved
    here — see `_apply_bound`, which needs the enclosing Split's own
    variable, not just an upper-bound constant) or 'inf'."""
    if e == "inf":
        return upper_bound
    assert isinstance(e, ast.Extent)
    if e.unit == "fr":
        return None
    assert e.unit == "px"
    return int(round(e.v))


def _apply_bound(
    model: cp_model.CpModel,
    var: cp_model.IntVar,
    extent,
    *,
    is_max: bool,
    parent_along_extent: Optional[cp_model.IntVar],
    path: str,
    dim: str,
) -> None:
    """Apply a single min or max sizing bound to `var`.

    Plain px/'inf' bounds are ordinary constant constraints. An 'fr' bound
    resolves per the disclosed F2 convention (module docstring): N fr =>
    N% of `parent_along_extent` (the enclosing Split's own w/h variable
    along its partition axis), expressed as a genuine linear CP-SAT
    constraint so the bound tracks whatever the split solves to, rather
    than a constant computed once against an upper bound. When there is no
    such enclosing-Split variable to denominate against (root sizing, or a
    direct Exclusive/T-node child, which shares the WHOLE parent rectangle
    on both axes — no single partition-axis length applies), an fr bound
    is refused loudly rather than silently ignored or given an arbitrary
    meaning.
    """
    if extent == "inf":
        return  # elastic — no bound to apply
    assert isinstance(extent, ast.Extent)
    if extent.unit == "fr":
        if parent_along_extent is None:
            raise LytLoadError(
                f"'{'max' if is_max else 'min'} {extent.v}fr' at {path} "
                f"({dim}) has no enclosing Split to denominate its share "
                "against (compatible px/inf bounds on the root ARE inert "
                "regardless of declared bounds, but an fr bound is not — "
                "it hits this same refusal as any other undenominated fr "
                "bound; an Exclusive/T-node child shares its parent's "
                "FULL rectangle on both axes, per layout-language-consult.md "
                "line 297-298, so there is no single partition-axis length "
                "to take a share of) — fr bounds in min/max position are "
                "only resolvable for a direct Split (H/V) child (F2 fix, "
                "disclosed FR_MIN_MAX_DENOMINATOR convention)",
                {
                    "path": path,
                    "dim": dim,
                    "fr_value": extent.v,
                    "bound": "max" if is_max else "min",
                    "prohibition": "unresolvable-fr-bound",
                },
            )
        scaled_fr = int(round(extent.v * _FR_SCALE))
        if is_max:
            model.Add(var * FR_MIN_MAX_DENOMINATOR * _FR_SCALE <= scaled_fr * parent_along_extent)
        else:
            model.Add(var * FR_MIN_MAX_DENOMINATOR * _FR_SCALE >= scaled_fr * parent_along_extent)
        return
    assert extent.unit == "px"
    px = int(round(extent.v))
    if is_max:
        model.Add(var <= px)
    else:
        model.Add(var >= px)


def _along_axis_for_path(path: str) -> Optional[str]:
    """Given a dotted slot path built by `_collect`/`_constrain`'s own
    convention (a Split child's path segment is `H{i}` or `V{i}`, an
    Exclusive/T child's is `T{i}`), return which of the slot's own two
    variables ('w' or 'h') is its extent ALONG ITS PARENT'S AXIS — the
    same 'along' semantics `_constrain`/`_collect_slack_terms` thread
    explicitly via an `along` parameter, recovered here from the path
    string alone for call sites (stage 2's reach-preferred shortfall) that
    don't walk the tree with that parameter threaded through. Returns None
    for the root, or for a T-node child (shares the whole parent rectangle
    on both axes — see `_constrain`'s Exclusive branch, which itself uses
    `along=None`)."""
    if path == "root":
        return None
    last_segment = path.rsplit("/", 1)[-1]
    if last_segment.startswith("H"):
        return "w"
    if last_segment.startswith("V"):
        return "h"
    return None  # a "T..." child, or a malformed/unrecognized path


def _collect(slot: ast.Slot, path: str, sv: _SlotVars, model: cp_model.CpModel, W: int, H: int) -> None:
    sv.w[path] = model.NewIntVar(0, W, f"w[{path}]")
    sv.h[path] = model.NewIntVar(0, H, f"h[{path}]")

    node = slot.node
    if isinstance(node, ast.Leaf):
        sv.leaf_names[path] = node.widget
        return
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            _collect(child, f"{path}/{node.axis.upper()}{i}", sv, model, W, H)
        return
    if isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            _collect(child, f"{path}/T{i}", sv, model, W, H)
        return
    raise LytLoadError("unknown node kind during compilation", {"path": path})


def _constrain(
    slot: ast.Slot,
    path: str,
    sv: _SlotVars,
    model: cp_model.CpModel,
    W: int,
    H: int,
    *,
    along: Optional[str] = None,
    parent_along_extent: Optional[cp_model.IntVar] = None,
) -> None:
    """`along` names which of this slot's own two variables is "the
    slot's extent along ITS PARENT'S axis" (lyt_ast.Slot's own docstring,
    line 261) — the one dimension sizing.min/max/aspect actually
    constrains. The document is explicit that Sizing is 1-D per slot
    (line 261), so applying min/max to the CROSS dimension too — as an
    earlier version of this compiler did — is a bug: the cross dimension
    is already pinned by the parent's own cross-axis equality (cascading
    down from the root's hard W_c×H_c pin), and independently re-bounding
    it with THIS slot's min/max produced spurious infeasibility whenever a
    slot's declared extent (e.g. a 28px-tall toolbar row) was smaller than
    the actual cross-axis span it must span (e.g. the board's ~1000px
    width) — every one of the five encodings was INFEASIBLE under the
    buggy version; see the build report.

    `along=None` means "bound both w and h from this slot's own sizing":
    correct for the ROOT (whose w/h are hard-pinned to W_c/H_c regardless,
    so extra bounds are inert as long as compatible) and for an
    Exclusive/T node's children (§4.1 line 297-298: every T child receives
    the SAME rectangle as the T node — both dimensions are shared, so
    there is no single "parent axis" to prefer).

    `parent_along_extent` (F2 fix): the enclosing Split's own w/h variable
    along ITS partition axis, needed only to resolve an `fr` bound in
    min/max position (see `_apply_bound` and the module docstring's "fr
    bounds" section). None for the root and for Exclusive/T children,
    where an fr min/max bound has no well-defined denominator and is
    refused rather than guessed.
    """
    w = sv.w[path]
    h = sv.h[path]
    s = slot.sizing

    # min/max bounds (§6 "Sizing: min_s <= w_s <= max_s ... with 'fr'
    # handled by the partition equality itself", line 631-633 — refined by
    # the F2 fix for fr in min/max position specifically, see
    # `_apply_bound`), applied only to the axis this slot's sizing
    # actually describes.
    targets: List[Tuple[str, cp_model.IntVar]] = []
    if along in (None, "w"):
        targets.append(("w", w))
    if along in (None, "h"):
        targets.append(("h", h))
    for dim, t in targets:
        _apply_bound(model, t, s.min, is_max=False, parent_along_extent=parent_along_extent, path=path, dim=dim)
        _apply_bound(model, t, s.max, is_max=True, parent_along_extent=parent_along_extent, path=path, dim=dim)

    node = slot.node
    if isinstance(node, ast.Split):
        axis = node.axis
        n = len(node.children)
        gap = int(round(node.gap_px))
        along_vars = [sv.w[f"{path}/{axis.upper()}{i}"] if axis == "h" else sv.h[f"{path}/{axis.upper()}{i}"] for i in range(n)]
        cross_axis_var = h if axis == "h" else w
        this_along_extent = w if axis == "h" else h  # this split's OWN extent along ITS axis
        model.Add(sum(along_vars) + gap * max(n - 1, 0) == this_along_extent)
        for i, child in enumerate(node.children):
            child_cross = sv.h[f"{path}/{axis.upper()}{i}"] if axis == "h" else sv.w[f"{path}/{axis.upper()}{i}"]
            if isinstance(child.node, ast.Leaf) and child.sizing.aspect is not None:
                # DISCLOSED GAP in §6's "no x,y variables... needed because
                # the tree is the non-overlap proof" claim (line 620-622):
                # that is only true for children that FILL their cross
                # axis. An aspect-locked leaf (the board) generally does
                # NOT — its cross dimension is a function of its own
                # along-dimension via the aspect equality, which can be
                # smaller than the cross space its siblings' sizing leaves
                # available. Forcing cross == parent-cross for such a leaf
                # produced a genuine INFEASIBLE result on q5go/ogs (see
                # build report): the board composite's H-partition share
                # left it ~1500px of column width while its own aspect,
                # driven by the column's fixed ~1050px height, only wants
                # ~1050px — an exact-fill equality can't reconcile those.
                # We relax to <=, and _extract_rects centers the leaf
                # within the slack (the obvious rendering choice, and the
                # one real UAs make for a non-stretching aspect box).
                model.Add(child_cross <= cross_axis_var)
            else:
                model.Add(child_cross == cross_axis_var)
        child_along = "w" if axis == "h" else "h"
        for i, child in enumerate(node.children):
            _constrain(
                child,
                f"{path}/{axis.upper()}{i}",
                sv,
                model,
                W,
                H,
                along=child_along,
                parent_along_extent=this_along_extent,
            )
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            cpath = f"{path}/T{i}"
            model.Add(sv.w[cpath] == w)
            model.Add(sv.h[cpath] == h)
            # An Exclusive/T child shares the WHOLE parent rectangle on
            # both axes (§4.1 line 297-298) — there is no single
            # partition-axis length for an fr min/max bound to denominate
            # against, so `parent_along_extent=None` here means such a
            # bound is refused by `_apply_bound` rather than guessed.
            _constrain(child, cpath, sv, model, W, H, along=None, parent_along_extent=None)
        # T's own min is the componentwise max of children's min (§4.1
        # line 298-302). loader.py leaves an omitted T 'min' at a
        # disclosed 0px default; we derive and assert the real floor here
        # so the compiler — not a silent default — is the source of
        # truth for it. (An fr min on a T child would hit the same
        # "no denominator" refusal above before ever reaching here, since
        # `_extent_px` alone can't resolve it either — see F2 fix.)
        child_min_w = []
        child_min_h = []
        for i, child in enumerate(node.children):
            cw = _extent_px(child.sizing.min, upper_bound=W)
            ch = _extent_px(child.sizing.min, upper_bound=H)
            if cw is not None:
                child_min_w.append(cw)
            if ch is not None:
                child_min_h.append(ch)
        if child_min_w:
            model.Add(w >= max(child_min_w))
        if child_min_h:
            model.Add(h >= max(child_min_h))
    elif isinstance(node, ast.Leaf):
        if s.aspect is not None:
            # w = aspect * h, as an integer equality (§6 line 634-635).
            # Scaled to avoid float coefficients in CP-SAT.
            SCALE = 1000
            aspect_scaled = int(round(s.aspect * SCALE))
            model.Add(w * SCALE == aspect_scaled * h)


def compile_program(
    slot: ast.Slot, *, class_id: str, w_px: int, h_px: int
) -> Tuple[cp_model.CpModel, _SlotVars]:
    model = cp_model.CpModel()
    sv = _SlotVars()
    _collect(slot, "root", sv, model, w_px, h_px)
    model.Add(sv.w["root"] == w_px)
    model.Add(sv.h["root"] == h_px)
    _constrain(slot, "root", sv, model, w_px, h_px)
    return model, sv


def solve_lexicographic(
    slot: ast.Slot,
    *,
    class_id: str,
    w_px: int,
    h_px: int,
    board_widget: Optional[str],
    reach_preferred_widgets: Optional[List[str]] = None,
    time_limit_s: float = 10.0,
) -> SolveResult:
    """Staged lexicographic solve per §6 (line 645-658):
    1. maximize the board leaf's w (a square board's area maximization is
       linear in this 1-D-per-axis model, matching the document's own
       observation that no multiplication constraint is needed, line
       649-650 — we maximize w, and the aspect equality keeps h in lock
       step).
    2. holding term 1's optimum fixed, maximize a reach-preferred term:
       sum over named widgets of min(extent - pref, 0), MEASURED ON THE
       WIDGET'S OWN ALONG-AXIS (F1 fix — see `_along_axis_for_path`; the
       original version measured shortfall on `w` unconditionally, which
       silently reports zero shortfall — a false "-0.0" objective — for
       every V-split child, since a V-child's along axis is `h`, not `w`).
       [not exceeding pref costs nothing further; falling short is
       penalized] — approximated here via CP-SAT's AddMinEquality/
       AddMaxEquality on an auxiliary var, exactly as the document names
       (line 652).
    3. minimize slack: minimize the sum of (max-capped slack), i.e. total
       unused room across every 'fr'-sized slot whose max is finite and
       whose w falls short of that cap. (§6 line 653-658 frames this term
       as mostly a guard against authoring caps that strand space; we
       implement it as literally minimizing total (cap - w) over
       finite-max slots, holding stages 1-2 fixed.)

    Staging discipline (F6 fix, see module docstring): stages 1.5 and 2 no
    longer pin every variable they touch to one arbitrary optimal
    solution's value. Instead each appends a closure to
    `stage_constraints` that RE-DERIVES the same objective terms on every
    subsequent model rebuild and pins their SUM to the stage's solved
    optimum (`model.Add(sum(terms) == opt)`, per §6's own "fix its
    optimum as a constraint" phrasing, line 646-647) — leaving later
    stages free to move among ties from an earlier stage. Stage 1 still
    pins its single variable directly (`fixed`); for one variable that is
    equivalent to pinning the objective value, so it's kept as the
    simpler form.
    """
    # Each stage below builds a FRESH model (compile_program is cheap —
    # these trees have dozens, not thousands, of slots) rather than
    # mutating one model's objective in place: this ortools build's
    # CpModelProto wrapper doesn't expose ClearField, and rebuilding is
    # also the more obviously-correct way to carry a prior stage's fixed
    # optimum forward as a hard constraint ("solve term 1, fix its
    # optimum as a constraint, solve term 2, ...", §6 line 646-647).
    objective_values: List[float] = []
    fixed: List[Tuple[str, str, int]] = []  # (path, 'w'|'h', value) equalities from prior stages
    stage_constraints: List[Callable[[cp_model.CpModel, _SlotVars], None]] = []

    def _build():
        model, sv = compile_program(slot, class_id=class_id, w_px=w_px, h_px=h_px)
        for path, dim, value in fixed:
            var = sv.w[path] if dim == "w" else sv.h[path]
            model.Add(var == value)
        for constraint_fn in stage_constraints:
            constraint_fn(model, sv)
        return model, sv

    board_path = None
    if board_widget is not None:
        board_path = _find_leaf_path(slot, board_widget, "root")
        if board_path is None:
            raise LytLoadError(
                f"objective names board widget '{board_widget}' but no such leaf exists",
                {"board_widget": board_widget},
            )

        # --- Stage 1: maximize board width ---------------------------------
        model, sv = _build()
        model.Maximize(sv.w[board_path])
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_s
        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SolveResult(class_id, w_px, h_px, {}, sv.leaf_names, [], "INFEASIBLE")
        board_w_opt = solver.Value(sv.w[board_path])
        objective_values.append(float(board_w_opt))
        fixed.append((board_path, "w", board_w_opt))

        # --- Stage 1.5: resolve aspect-relaxation cross-axis slack -------
        # DISCLOSED DEVIATION from §6's literal 3-term ordering
        # (maximize-area, reach-preferred, minimize-slack, line 645-658).
        # The cross axis <= relaxation introduced for aspect-locked leaves
        # (see _constrain's Split branch) leaves the leaf's *parent split*
        # free to claim more cross-axis room than the leaf can use — e.g.
        # in q5go, the board's column can float to any width >= the
        # board's true aspect-driven width, and nothing forces it back
        # down until slack is minimized. §6's own minimize-slack term
        # (line 653-655) is stated as "already zero ... remaining slack
        # only exists as max-capped slots" — that assumption silently
        # relies on every non-aspect-locked child filling its cross axis
        # exactly, which is no longer true once an aspect leaf is present.
        # Deferring this resolution to stage 3 (after stage 2) lets stage
        # 2's reach-preferred term lock in an ARBITRARY oversized column
        # width as a hard fact (CP-SAT picks *some* feasible value when
        # nothing constrains it), which stage 3 can then no longer undo.
        # We resolve it here, right after board-maximization and before
        # reach-preferred, so every later stage sees a well-defined
        # (minimal) cross-axis geometry.
        model, sv = _build()
        aspect_slack_terms: List = []
        slack_controlled_vars: List[Tuple[str, str]] = []  # (path, dim) of the freed cross vars
        _collect_aspect_slack_terms(slot, "root", sv, model, aspect_slack_terms, slack_controlled_vars)
        if aspect_slack_terms:
            model.Minimize(sum(aspect_slack_terms))
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = time_limit_s
            status = solver.Solve(model)
            if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                return SolveResult(class_id, w_px, h_px, {}, sv.leaf_names, objective_values, "INFEASIBLE")
            # F6 fix: pin the SUM of the aspect-slack terms to this
            # stage's optimum, not each individual freed (path, dim)
            # value — a later stage may then redistribute the SAME total
            # slack differently among tied aspect-locked leaves, rather
            # than being frozen into this stage's arbitrary pick.
            aspect_slack_opt = int(round(solver.ObjectiveValue()))

            def _pin_aspect_slack_sum(model: cp_model.CpModel, sv: _SlotVars, *, _opt: int = aspect_slack_opt) -> None:
                terms: List = []
                controlled: List[Tuple[str, str]] = []
                _collect_aspect_slack_terms(slot, "root", sv, model, terms, controlled)
                if terms:
                    model.Add(sum(terms) == _opt)

            stage_constraints.append(_pin_aspect_slack_sum)

    # --- Stage 2: reach-preferred -------------------------------------------
    # F1 fix: each reach slot's shortfall is measured on its OWN
    # along-axis (recovered from its path by `_along_axis_for_path`), not
    # on `w` unconditionally. A T-node child (along axis undefined — it
    # shares the parent's whole rectangle on both axes) is measured on
    # BOTH w and h, mirroring `_constrain`'s own `along=None` treatment of
    # T children.
    reach_paths_px: List[Tuple[str, int]] = []
    if reach_preferred_widgets:
        for widget in reach_preferred_widgets:
            path = _find_leaf_path(slot, widget, "root")
            if path is None:
                continue
            leaf_slot = _find_slot(slot, path, "root")
            pref_px = _extent_px(leaf_slot.sizing.pref, upper_bound=max(w_px, h_px))
            if pref_px is None:
                continue
            reach_paths_px.append((path, pref_px))

    if reach_paths_px:
        model, sv = _build()
        shortfall_terms = []
        # (path, dim, pref_px) for every term actually built, so the F6
        # fix's pinning closure can re-derive the identical set of terms
        # on later rebuilds.
        term_specs: List[Tuple[str, str, int]] = []
        for path, pref_px in reach_paths_px:
            along = _along_axis_for_path(path)
            dims = [along] if along in ("w", "h") else ["w", "h"]
            for dim in dims:
                var = sv.w[path] if dim == "w" else sv.h[path]
                shortfall = model.NewIntVar(0, max(w_px, h_px), f"shortfall[{path}][{dim}]")
                model.AddMaxEquality(shortfall, [pref_px - var, 0])
                shortfall_terms.append(shortfall)
                term_specs.append((path, dim, pref_px))
        model.Minimize(sum(shortfall_terms))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_s
        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SolveResult(class_id, w_px, h_px, {}, sv.leaf_names, objective_values, "INFEASIBLE")
        shortfall_opt = int(round(solver.ObjectiveValue()))
        objective_values.append(-float(shortfall_opt))  # "reach-preferred score", higher (less shortfall) = better

        # F6 fix: pin the SUM of shortfall terms to this stage's optimum,
        # not each individual reach path's solved value — stage 3 may
        # then redistribute the same total shortfall differently among
        # tied reach slots.
        def _pin_reach_preferred_sum(
            model: cp_model.CpModel,
            sv: _SlotVars,
            *,
            _opt: int = shortfall_opt,
            _specs: Tuple[Tuple[str, str, int], ...] = tuple(term_specs),
        ) -> None:
            terms: List = []
            for path, dim, pref_px in _specs:
                var = sv.w[path] if dim == "w" else sv.h[path]
                shortfall = model.NewIntVar(0, max(w_px, h_px), f"shortfall2[{path}][{dim}]")
                model.AddMaxEquality(shortfall, [pref_px - var, 0])
                terms.append(shortfall)
            if terms:
                model.Add(sum(terms) == _opt)

        stage_constraints.append(_pin_reach_preferred_sum)

    # --- Stage 3: minimize slack ---------------------------------------------
    model, sv = _build()
    slack_terms: List = []
    _collect_slack_terms(slot, "root", sv, model, w_px, slack_terms)
    if slack_terms:
        model.Minimize(sum(slack_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(class_id, w_px, h_px, {}, sv.leaf_names, objective_values, "INFEASIBLE")
    if slack_terms:
        objective_values.append(-solver.ObjectiveValue())

    rects = _extract_rects(slot, "root", sv, solver, x0=0, y0=0)
    return SolveResult(
        class_id=class_id,
        w_px=w_px,
        h_px=h_px,
        rects=rects,
        leaf_names=sv.leaf_names,
        objective_values=objective_values,
        status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
    )


def _collect_slack_terms(
    slot: ast.Slot, path: str, sv: _SlotVars, model: cp_model.CpModel, W: int, terms: list, *, along: Optional[str] = None
) -> None:
    """Same axis-conflation bug fixed here as in _constrain (see that
    function's docstring): a slot's sizing.max describes only its `along`
    dimension, so slack (cap - actual) must be measured on that SAME
    dimension. An earlier version used sv.w[path] unconditionally, which
    produced a NEGATIVE, out-of-domain 'slack' for any along='h' leaf
    whose max was smaller than its (correctly unconstrained) w — making
    stage 3 spuriously INFEASIBLE for every encoding with a fixed-height
    row (i.e. all five). See the build report.

    Disclosed scoping (F2 fix follow-up): an `fr` max is now a REAL hard
    bound (`_apply_bound`, applied in `_constrain`), so it is no longer
    silently unconstrained — but this stage-3 term is only built for `px`
    maxima. Re-deriving an `fr` bound's px-equivalent here as an exact
    slack quantity would need the same enclosing-Split variable
    `_apply_bound` uses, and an exact `==` equality against a scaled
    integer division risks spurious infeasibility from rounding; since
    the CORRECTNESS-critical half of F2 (the cap being honored at all) is
    already handled by the hard constraint in `_constrain`, this
    refinement (folding fr-capped slots into the slack-MINIMIZATION
    objective too) is left as a disclosed narrowing rather than risking a
    fragile exact-equality term for a stage that is itself a soft
    tie-breaker (§6 line 653-655: "mostly a guard against ... caps that
    strand space")."""
    s = slot.sizing
    max_px = _extent_px(s.max, upper_bound=max(W, W))
    if max_px is not None and s.max != "inf":
        var_list = []
        if along in (None, "w"):
            var_list.append(("w", sv.w[path]))
        if along in (None, "h"):
            var_list.append(("h", sv.h[path]))
        for dim, var in var_list:
            slack = model.NewIntVar(0, 10_000, f"slack[{path}][{dim}]")
            model.Add(slack == max_px - var)
            terms.append(slack)
    node = slot.node
    if isinstance(node, ast.Split):
        axis = node.axis
        child_along = "w" if axis == "h" else "h"
        for i, child in enumerate(node.children):
            _collect_slack_terms(child, f"{path}/{axis.upper()}{i}", sv, model, W, terms, along=child_along)
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            _collect_slack_terms(child, f"{path}/T{i}", sv, model, W, terms, along=None)


def _collect_aspect_slack_terms(
    slot: ast.Slot,
    path: str,
    sv: _SlotVars,
    model: cp_model.CpModel,
    terms: list,
    controlled: List[Tuple[str, str]],
) -> None:
    """Walks every Split, and for each child the Split branch in
    _constrain relaxed to `<=` (an aspect-locked leaf), adds a slack term
    = parent_cross - child_cross, and records (parent_path, dim) — the
    variable stage 1.5 pins afterward, see solve_lexicographic."""
    node = slot.node
    if isinstance(node, ast.Split):
        axis = node.axis
        cross_var = sv.h[path] if axis == "h" else sv.w[path]
        cross_dim = "h" if axis == "h" else "w"
        for i, child in enumerate(node.children):
            cpath = f"{path}/{axis.upper()}{i}"
            if isinstance(child.node, ast.Leaf) and child.sizing.aspect is not None:
                child_cross_var = sv.h[cpath] if axis == "h" else sv.w[cpath]
                slack = model.NewIntVar(0, 10_000, f"aspect_slack[{cpath}]")
                model.Add(slack == cross_var - child_cross_var)
                terms.append(slack)
                controlled.append((path, cross_dim))
            _collect_aspect_slack_terms(child, cpath, sv, model, terms, controlled)
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            _collect_aspect_slack_terms(child, f"{path}/T{i}", sv, model, terms, controlled)


def _find_slot(slot: ast.Slot, target_path: str, path: str) -> Optional[ast.Slot]:
    if path == target_path:
        return slot
    node = slot.node
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            found = _find_slot(child, target_path, f"{path}/{node.axis.upper()}{i}")
            if found is not None:
                return found
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            found = _find_slot(child, target_path, f"{path}/T{i}")
            if found is not None:
                return found
    return None


def _find_leaf_path(slot: ast.Slot, widget: str, path: str) -> Optional[str]:
    node = slot.node
    if isinstance(node, ast.Leaf):
        return path if node.widget == widget else None
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            found = _find_leaf_path(child, widget, f"{path}/{node.axis.upper()}{i}")
            if found is not None:
                return found
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            found = _find_leaf_path(child, widget, f"{path}/T{i}")
            if found is not None:
                return found
    return None


def _extract_rects(
    slot: ast.Slot, path: str, sv: _SlotVars, solver: cp_model.CpSolver, *, x0: int, y0: int
) -> Dict[str, SolvedRect]:
    """Recovers x,y positions from the ordered partition (§6 line 620-622:
    "the tree IS the non-overlap proof") by walking H/V children in
    document order and accumulating offsets, and T children all sharing
    (x0,y0)."""
    out: Dict[str, SolvedRect] = {}
    w = solver.Value(sv.w[path])
    h = solver.Value(sv.h[path])
    out[path] = SolvedRect(x=x0, y=y0, w=w, h=h)
    node = slot.node
    if isinstance(node, ast.Split):
        offset = 0
        for i, child in enumerate(node.children):
            cpath = f"{path}/{node.axis.upper()}{i}"
            if node.axis == "h":
                child_h = solver.Value(sv.h[cpath])
                cross_offset = max(0, (h - child_h) // 2)  # center a <= cross (aspect-locked) leaf
                out.update(_extract_rects(child, cpath, sv, solver, x0=x0 + offset, y0=y0 + cross_offset))
                offset += solver.Value(sv.w[cpath]) + int(round(node.gap_px))
            else:
                child_w = solver.Value(sv.w[cpath])
                cross_offset = max(0, (w - child_w) // 2)
                out.update(_extract_rects(child, cpath, sv, solver, x0=x0 + cross_offset, y0=y0 + offset))
                offset += solver.Value(sv.h[cpath]) + int(round(node.gap_px))
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            out.update(_extract_rects(child, f"{path}/T{i}", sv, solver, x0=x0, y0=y0))
    return out
