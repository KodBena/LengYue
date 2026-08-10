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
  - sizing bounds per slot, `ch` and `fr` already resolved by the loader
    except `fr`, which is handled by the partition equality itself (an
    `fr`-sized child's extent is a free variable within [min,max], and the
    OBJECTIVE's reach-preferred term is what makes it grow — see below;
    there is deliberately no separate "fr proportionality" hard
    constraint, since the document doesn't specify one either).
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

Objective (line 645-658): staged lexicographic solve, since §6 offers it as
the "standard" option alongside a single weighted sum and doesn't commit to
either — "solve term 1, fix its optimum as a constraint, solve term 2, ..."
is exactly what we do, chosen over the weighted-sum alternative because it
needs no dominance-weight tuning and is easy to witness stage-by-stage.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

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


def _extent_px(e, *, upper_bound: int) -> Optional[int]:
    """Resolve a resolved (loader-level) Extent to a concrete px bound, or
    None if it's an 'fr' extent (handled elsewhere) or 'inf'."""
    if e == "inf":
        return upper_bound
    assert isinstance(e, ast.Extent)
    if e.unit == "fr":
        return None
    assert e.unit == "px"
    return int(round(e.v))


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
    slot: ast.Slot, path: str, sv: _SlotVars, model: cp_model.CpModel, W: int, H: int, *, along: Optional[str] = None
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
    """
    w = sv.w[path]
    h = sv.h[path]
    s = slot.sizing

    # min/max bounds (§6 "Sizing: min_s <= w_s <= max_s ... with 'fr'
    # handled by the partition equality itself", line 631-633), applied
    # only to the axis this slot's sizing actually describes.
    min_px = _extent_px(s.min, upper_bound=max(W, H))
    max_px = _extent_px(s.max, upper_bound=max(W, H))
    targets = []
    if along in (None, "w"):
        targets.append(w)
    if along in (None, "h"):
        targets.append(h)
    for t in targets:
        if min_px is not None:
            model.Add(t >= min_px)
        if max_px is not None:
            model.Add(t <= max_px)

    node = slot.node
    if isinstance(node, ast.Split):
        axis = node.axis
        n = len(node.children)
        gap = int(round(node.gap_px))
        along_vars = [sv.w[f"{path}/{axis.upper()}{i}"] if axis == "h" else sv.h[f"{path}/{axis.upper()}{i}"] for i in range(n)]
        cross_axis_var = h if axis == "h" else w
        model.Add(sum(along_vars) + gap * max(n - 1, 0) == (w if axis == "h" else h))
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
            _constrain(child, f"{path}/{axis.upper()}{i}", sv, model, W, H, along=child_along)
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            cpath = f"{path}/T{i}"
            model.Add(sv.w[cpath] == w)
            model.Add(sv.h[cpath] == h)
            _constrain(child, cpath, sv, model, W, H, along=None)
        # T's own min is the componentwise max of children's min (§4.1
        # line 298-302). loader.py leaves an omitted T 'min' at a
        # disclosed 0px default; we derive and assert the real floor here
        # so the compiler — not a silent default — is the source of
        # truth for it.
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
       sum over named widgets of min(w - pref, 0) [not exceeding pref
       costs nothing further; falling short is penalized] — approximated
       here via CP-SAT's AddMinEquality on an auxiliary var, exactly as
       the document names (line 652).
    3. minimize slack: minimize the sum of (max-capped slack), i.e. total
       unused room across every 'fr'-sized slot whose max is finite and
       whose w falls short of that cap. (§6 line 653-658 frames this term
       as mostly a guard against authoring caps that strand space; we
       implement it as literally minimizing total (cap - w) over
       finite-max slots, holding stages 1-2 fixed.)
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

    def _build():
        model, sv = compile_program(slot, class_id=class_id, w_px=w_px, h_px=h_px)
        for path, dim, value in fixed:
            var = sv.w[path] if dim == "w" else sv.h[path]
            model.Add(var == value)
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
            # Pin exactly the (split, dimension) pairs the <= relaxation
            # freed — not every slot in the tree — so stage 2's
            # reach-preferred term still has real freedom elsewhere.
            for p, dim in slack_controlled_vars:
                var = sv.w[p] if dim == "w" else sv.h[p]
                fixed.append((p, dim, solver.Value(var)))

    # --- Stage 2: reach-preferred -------------------------------------------
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
        for path, pref_px in reach_paths_px:
            shortfall = model.NewIntVar(0, max(w_px, h_px), f"shortfall[{path}]")
            model.AddMaxEquality(shortfall, [pref_px - sv.w[path], 0])
            shortfall_terms.append(shortfall)
        model.Minimize(sum(shortfall_terms))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_s
        status = solver.Solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SolveResult(class_id, w_px, h_px, {}, sv.leaf_names, objective_values, "INFEASIBLE")
        shortfall_opt = int(round(solver.ObjectiveValue()))
        objective_values.append(-float(shortfall_opt))  # "reach-preferred score", higher (less shortfall) = better
        for path, _ in reach_paths_px:
            fixed.append((path, "w", solver.Value(sv.w[path])))

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
    row (i.e. all five). See the build report."""
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
