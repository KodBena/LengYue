"""A first joint structure+sizing CP-SAT synthesizer over LYT's own
CONSOLIDATED census regions (lyt-synthesis-spike, ledger row 1848,
question 2). The prototype elsewhere (`compiler.py`) solves SIZING for an
already-hand-written tree; this module asks a different question — given
only a flat SET of regions (no tree at all), can a solver FIND a tree,
jointly with that tree's own sizing, that is at least as good as the
hand-written clean-room encoding?

**The region set.** Grounded directly in `encodings/lengyue_landscape.lyt`
and `encodings/lengyue_portrait.lyt` as they stand today (not the SPEC.md
worked example, which quotes older 340px/28px side-column numbers — the
landscape file's own header records a "REPAIR PASS, ledger row 1781" that
bumped those to 480px/128px; this module reads the CURRENT file's
numbers). Landscape names 8 top-level regions, portrait 7 (the two
encodings genuinely diverge here: portrait merges A_go/A_common into one
28px `A_top` strip and never received the 128px repair, both disclosed
below in `REGIONS_PORTRAIT`'s own values) — both within the commission's
"~6-8" band:

  landscape: rail(168), boardComposite(compound), A_go(128),
             I_engine(128), A_common(128), tree(140), blackbox(compound),
             preview(160, aspect 1)
  portrait:  rail(168), A_top(28), boardComposite(compound), I_engine(28),
             tree(140), blackbox(compound), preview(96, aspect 1)

`boardComposite` (the aspect-locked board leaf plus its two 24/28px info/
action strips, `V(B, I_board, A_board)`) and `blackbox` (the five-tab
control-panel Exclusive group) are COMPOUND regions — their OWN internal
structure is not searched (the commission's own framing: "board composite
(aspect leaf + its strips)" as one atomic unit in the census-region
list). This module reuses `compiler._collect`/`compiler._constrain`
UNMODIFIED to instantiate those two compound sub-trees' internal CP-SAT
variables and constraints — genuine code reuse, not a re-derivation of
the aspect-relaxation or T-node-floor logic those functions already
encode correctly. (Both are underscore-prefixed "module-private" names in
`compiler.py`; imported here anyway, disclosed, because they are the
exact general-purpose tree-walkers the joint model needs and duplicating
their aspect-relaxation math would be the kind of silent re-derivation
ADR-0004 warns against — see the module docstring's own "reuse where the
code allows" framing in the commission.)

**Why NOT more of compiler.py.** For the six ATOMIC regions and for the
STRUCTURE itself, compiler.py's builders cannot be reused as-is: every
one of `_collect`/`_constrain`'s recursive calls walks a Python-level
`node.children` list that is already fixed at MODEL-BUILD time. A joint
synthesizer needs the opposite — which region occupies which slot, and
which axis a split uses, are CP-SAT DECISION VARIABLES, resolved only at
SOLVE time. Encoding that requires reified constraints
(`OnlyEnforceIf`), which `_apply_bound`/`_constrain`'s unconditional
`model.Add(...)` calls do not support without modification (modification
is out of scope — a concurrent W4 builder is touching compiler.py's
neighborhood; this module is deliberately read-only there beyond the two
verbatim imports named above). The structure-and-atomic-region half of
this model is therefore a DISCLOSED PARALLEL MINIMAL SIZING MODEL,
reusing compiler.py's VALUES and DESIGN PATTERNS (the `FR_MIN_MAX
_DENOMINATOR`-style disclosed-convention posture, the aspect cross-axis
`<=`-relaxation direction, the T-node componentwise-max-of-mins floor)
without literal code reuse where reuse isn't code-compatible.

**The bounded skeleton.** Three potential internal H/V nodes, matching
the real encodings' own depth exactly (root H / side-column V / tree-row
H is 3 levels in `lengyue_landscape.lyt` itself):

  - Node A (root): up to `A_SLOTS` (default 4) child slots. Always
    active, pinned to the screen class's own (W, H).
  - Node B: up to `B_SLOTS` (default 5) child slots. Active iff exactly
    one of A's slots "delegates" to it (that slot's box becomes B's own
    (w, h)).
  - Node C: up to `C_SLOTS` (default 4) child slots. Active iff exactly
    one of B's slots delegates to it.

Each node's OWN axis (H or V) is a decision variable. Each slot in each
node is EITHER: one specific region (an `assign[region][node][slot]`
boolean), a delegate to the next node down (only meaningful for A's
slots -> B, and B's slots -> C), or empty. Every region is placed exactly
once, globally. Front-packing symmetry breaking (empty slots trail active
ones within a node) bounds the search without constraining which SET of
regions ends up in which node — see `_build_model`'s own comments for the
exact constraint shapes.

**What this DOESN'T search**: gap px per split (fixed at 12px for the
root, 4px for any nested node — the same tier-scale values the real
encodings use, not searched); WHICH sibling position a nested group
occupies relative to its siblings beyond front-packing (front-packing is
a genuine mathematical symmetry for the SIZING objective — permuting
active slot order changes nothing the objective scores — but it does mean
the reported tree's left-to-right/top-to-bottom ORDER is a solver
artifact, not itself optimized; §12's own honest-limits framing applies
equally here); presence/toggle valuations (every region is modeled
always-present; `boardRail`/`previewBoard`'s real `@toggle(user,
release)` presence is NOT modeled, a disclosed narrowing named again in
the spike's own honest-limits section of the dispatch report).

**Objective.** Two lexicographic stages, mirroring `compiler.py`'s own
staging discipline (fix a stage's objective VALUE as a constraint before
the next stage runs, not the individual variables that produced it — the
F6 fix pattern, reused as a DESIGN CONVENTION here, not literal code):

  1. Maximize the board leaf's own width (`sv.w["bc/V0"]`, from the
     reused board-composite sub-tree) — identical in spirit to
     `compiler.py`'s stage 1.
  2. Maximize the control-panel black box's own along-axis extent (a
     narrower stand-in for `compiler.py`'s reach-preferred/minimize-slack
     stages — see the module docstring's own disclosure: every ATOMIC
     region here is a bare fixed reservation (`min == pref == max`), so
     compiler.py's own reach-preferred term, which only ever fires for a
     widget with a concrete PX `pref` short of its `min`/`max` bracket,
     has nothing to optimize among them; the only two regions with any
     real elasticity left after stage 1 fixes the board are the black
     box and (bounded by aspect) the preview leaf, and only the black
     box's own along-extent is a meaningful "don't strand elastic room"
     signal at this region granularity — named honestly as a narrowing,
     not a hidden simplification).
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple

from ortools.sat.python import cp_model

import lyt_ast as ast
from compiler import _collect, _constrain, _SlotVars  # disclosed reuse, see module docstring

NodeName = Literal["A", "B", "C"]
NODES: Tuple[NodeName, ...] = ("A", "B", "C")


@dataclass(frozen=True)
class Region:
    id: str
    kind: Literal["atomic_fixed", "atomic_aspect", "compound"]
    px: Optional[float] = None  # fixed along-axis reservation, atomic_* only


# --- Region census, grounded in the CURRENT encodings/*.lyt files ----------

REGIONS_LANDSCAPE: List[Region] = [
    Region("rail", "atomic_fixed", px=168.0),
    Region("boardComposite", "compound"),
    Region("A_go", "atomic_fixed", px=128.0),
    Region("I_engine", "atomic_fixed", px=128.0),
    Region("A_common", "atomic_fixed", px=128.0),
    Region("tree", "atomic_fixed", px=140.0),
    Region("blackbox", "compound"),
    Region("preview", "atomic_aspect", px=160.0),
]
BLACKBOX_MIN_LANDSCAPE = 300.0  # WRAPPER_MIN, loader.WRAPPER_MIN_PX

REGIONS_PORTRAIT: List[Region] = [
    Region("rail", "atomic_fixed", px=168.0),
    Region("A_top", "atomic_fixed", px=28.0),
    Region("boardComposite", "compound"),
    Region("I_engine", "atomic_fixed", px=28.0),
    Region("tree", "atomic_fixed", px=140.0),
    Region("blackbox", "compound"),
    Region("preview", "atomic_aspect", px=96.0),
]
BLACKBOX_MIN_PORTRAIT = 200.0  # lengyue_portrait.lyt's own per-child min

GAP_PX: Dict[NodeName, float] = {"A": 12.0, "B": 4.0, "C": 4.0}


def _instantiate_board_composite() -> ast.Slot:
    """`V(B, I_board, A_board)`, byte-identical between the landscape and
    portrait encodings (24px/28px strips, aspect-1 board) — the
    commission's own "board composite (aspect leaf + its strips)" atomic
    region."""
    px24 = ast.Extent(unit="px", v=24.0)
    px28 = ast.Extent(unit="px", v=28.0)
    px0 = ast.Extent(unit="px", v=0.0)
    fr1 = ast.Extent(unit="fr", v=1.0)
    board = ast.Slot(
        node=ast.Leaf(widget="B", domain="board", facets=frozenset()),
        presence=ast.FIXED,
        sizing=ast.Sizing(min=px0, pref=fr1, max="inf", aspect=1.0),
    )
    i_board = ast.Slot(
        node=ast.Leaf(widget="I_board", domain="board", facets=frozenset({"info"})),
        presence=ast.FIXED,
        sizing=ast.Sizing(min=px24, pref=px24, max=px24),
    )
    a_board = ast.Slot(
        node=ast.Leaf(widget="A_board", domain="board", facets=frozenset({"action"})),
        presence=ast.FIXED,
        sizing=ast.Sizing(min=px28, pref=px28, max=px28),
    )
    v = ast.Split(axis="v", gap_px=0.0, children=[board, i_board, a_board])
    return ast.Slot(node=v, presence=ast.FIXED, sizing=ast.Sizing(min=px0, pref=fr1, max="inf"))


def _instantiate_blackbox(min_per_child_px: float) -> ast.Slot:
    """`T(CP-library, CP-cards, CP-settings, CP-analysis, CP-other)` — the
    five-tab control-panel Exclusive group. `min_per_child_px` is
    `WRAPPER_MIN_PX` (300) for landscape, the portrait file's own 200 for
    portrait — the T node's OWN structural floor is the componentwise max
    of these (`_constrain`'s Exclusive branch derives this; not
    re-derived here)."""
    px0 = ast.Extent(unit="px", v=0.0)
    fr1 = ast.Extent(unit="fr", v=1.0)
    child_min = ast.Extent(unit="px", v=min_per_child_px)
    children = [
        ast.Slot(
            # AMENDMENT 6 (ledger row 1937): domain='blackbox' retired --
            # re-homed to the leaf's true domain ('common') + the boundary
            # marker. Geometry-inert (this function's own sizing is
            # unaffected either way).
            node=ast.Leaf(widget=f"CP-{name}", domain="common", boundary=True, facets=frozenset()),
            presence=ast.FIXED,
            sizing=ast.Sizing(min=child_min, pref=fr1, max="inf"),
        )
        for name in ("library", "cards", "settings", "analysis", "other")
    ]
    excl = ast.Exclusive(children=children, tag="BLACK BOX")
    return ast.Slot(node=excl, presence=ast.FIXED, sizing=ast.Sizing(min=px0, pref=fr1, max="inf"))


@dataclass
class SynthesizeResult:
    class_name: str
    status: str
    w_px: int
    h_px: int
    board_w: Optional[int]
    blackbox_along: Optional[int]
    ascii_tree: Optional[str]
    solve_ms: float
    num_bool_vars: int
    num_int_vars: int
    num_regions: int


def _child_delegate_target(node: NodeName) -> Optional[NodeName]:
    return {"A": "B", "B": "C", "C": None}[node]


def synthesize(
    class_name: Literal["landscape", "portrait"],
    *,
    w_px: int,
    h_px: int,
    a_slots: int = 4,
    b_slots: int = 5,
    c_slots: int = 4,
    time_limit_s: float = 60.0,
    regions_override: Optional[List[Region]] = None,
    blackbox_min_override: Optional[float] = None,
) -> SynthesizeResult:
    """`regions_override`/`blackbox_min_override` let a caller (today,
    only `tests/test_synthesize.py`'s trivial-3-region smoke test) bypass
    the two named census region lists entirely, exercising the same
    structure+sizing model against an arbitrary region set without this
    module needing a third hardcoded census — `class_name` still selects
    the screen-class LABEL for the returned `SynthesizeResult`, but the
    census content is caller-supplied whenever these are given."""
    if regions_override is not None:
        regions = regions_override
        blackbox_min = blackbox_min_override if blackbox_min_override is not None else BLACKBOX_MIN_LANDSCAPE
    else:
        regions = REGIONS_LANDSCAPE if class_name == "landscape" else REGIONS_PORTRAIT
        blackbox_min = BLACKBOX_MIN_LANDSCAPE if class_name == "landscape" else BLACKBOX_MIN_PORTRAIT
    slots: Dict[NodeName, int] = {"A": a_slots, "B": b_slots, "C": c_slots}

    model = cp_model.CpModel()

    # --- compound sub-trees: genuine reuse of compiler.py's tree-walkers ---
    sv = _SlotVars()
    bc_slot = _instantiate_board_composite()
    _collect(bc_slot, "bc", sv, model, w_px, h_px)
    _constrain(bc_slot, "bc", sv, model, w_px, h_px, along=None, parent_along_extent=None)
    bc_w, bc_h = sv.w["bc"], sv.h["bc"]
    board_w_var = sv.w["bc/V0"]  # B is the composite V-split's first child

    bb_slot = _instantiate_blackbox(blackbox_min)
    _collect(bb_slot, "bb", sv, model, w_px, h_px)
    _constrain(bb_slot, "bb", sv, model, w_px, h_px, along=None, parent_along_extent=None)
    bb_w, bb_h = sv.w["bb"], sv.h["bb"]

    # --- per-node, per-slot geometry variables -----------------------------
    w: Dict[NodeName, List[cp_model.IntVar]] = {}
    h: Dict[NodeName, List[cp_model.IntVar]] = {}
    active: Dict[NodeName, List[cp_model.IntVar]] = {}
    is_v: Dict[NodeName, cp_model.IntVar] = {}
    assign: Dict[str, Dict[NodeName, List[cp_model.IntVar]]] = {
        r.id: {n: [] for n in NODES} for r in regions
    }
    delegate: Dict[NodeName, List[cp_model.IntVar]] = {"A": [], "B": []}  # C has no further child

    for n in NODES:
        k = slots[n]
        w[n] = [model.NewIntVar(0, w_px, f"w[{n}][{i}]") for i in range(k)]
        h[n] = [model.NewIntVar(0, h_px, f"h[{n}][{i}]") for i in range(k)]
        active[n] = [model.NewBoolVar(f"active[{n}][{i}]") for i in range(k)]
        is_v[n] = model.NewBoolVar(f"is_v[{n}]")
        for r in regions:
            assign[r.id][n] = [model.NewBoolVar(f"assign[{r.id}][{n}][{i}]") for i in range(k)]
        target = _child_delegate_target(n)
        if target is not None:
            delegate[n] = [model.NewBoolVar(f"delegate[{n}->{target}][{i}]") for i in range(k)]

    # --- node activity: B/C only exist if something delegates into them ----
    node_active: Dict[NodeName, cp_model.IntVar] = {"A": model.NewConstant(1)}
    for n, target in (("A", "B"), ("B", "C")):
        dele_sum = sum(delegate[n])
        active_bool = model.NewBoolVar(f"node_active[{target}]")
        model.Add(dele_sum == active_bool)
        # at most one slot of `n` may delegate to `target` (dele_sum in {0,1}
        # is implied by dele_sum == active_bool, a 0/1 BoolVar, but state it
        # directly too so infeasibility, if any, points at the right cause).
        model.Add(dele_sum <= 1)
        node_active[target] = active_bool

    # --- occupancy: each slot holds at most one of {region, delegate} ------
    for n in NODES:
        k = slots[n]
        target = _child_delegate_target(n)
        for i in range(k):
            terms = [assign[r.id][n][i] for r in regions]
            if target is not None:
                terms.append(delegate[n][i])
            model.Add(active[n][i] == sum(terms))
            model.Add(w[n][i] == 0).OnlyEnforceIf(active[n][i].Not())
            model.Add(h[n][i] == 0).OnlyEnforceIf(active[n][i].Not())
        # front-packing symmetry break: active slots occupy the front.
        for i in range(k - 1):
            model.Add(active[n][i] >= active[n][i + 1])
        # a node with no upstream delegate into it may not place anything.
        if n != "A":
            for i in range(k):
                model.Add(active[n][i] <= node_active[n])

    # --- every region placed exactly once, globally ------------------------
    for r in regions:
        model.Add(sum(assign[r.id][n][i] for n in NODES for i in range(slots[n])) == 1)

    # --- node's own (w, h): A is the class root; B/C inherit from whichever
    #     slot of their parent delegates into them.
    node_w: Dict[NodeName, object] = {"A": w_px}
    node_h: Dict[NodeName, object] = {"A": h_px}
    for n, target in (("A", "B"), ("B", "C")):
        tw = model.NewIntVar(0, w_px, f"node_w[{target}]")
        th = model.NewIntVar(0, h_px, f"node_h[{target}]")
        for i in range(slots[n]):
            model.Add(w[n][i] == tw).OnlyEnforceIf(delegate[n][i])
            model.Add(h[n][i] == th).OnlyEnforceIf(delegate[n][i])
        node_w[target] = tw
        node_h[target] = th

    # --- per-node partition equality + cross-fill (mirrors compiler.py's
    #     _constrain Split branch, reified on the node's own axis choice
    #     since axis is a decision variable here, not a fixed tree fact) --
    aspect_region_ids = [r.id for r in regions if r.kind == "atomic_aspect"]
    assert len(aspect_region_ids) <= 1, "at most one atomic_aspect region per class census, disclosed narrowing"
    aspect_region_id = aspect_region_ids[0] if aspect_region_ids else None
    for n in NODES:
        k = slots[n]
        gap = GAP_PX[n]
        active_count = sum(active[n])
        gap_count = model.NewIntVar(0, k, f"gap_count[{n}]")
        model.AddMaxEquality(gap_count, [active_count - 1, 0])

        # H-orientation: along = w, cross = h.
        model.Add(sum(w[n]) + int(gap) * gap_count == node_w[n]).OnlyEnforceIf(is_v[n].Not())
        # V-orientation: along = h, cross = w.
        model.Add(sum(h[n]) + int(gap) * gap_count == node_h[n]).OnlyEnforceIf(is_v[n])

        for i in range(k):
            # aspect-relaxed cross axis: only the `preview` leaf (atomic
            # aspect region) among this model's atomic content — the
            # compound regions' OWN cross-fill is exact (their internal
            # aspect leaf, B, is relaxed one level DOWN by the reused
            # `_constrain` call above, not here).
            aspect_relaxed = assign[aspect_region_id][n][i] if aspect_region_id is not None else None
            if aspect_relaxed is not None:
                model.Add(h[n][i] == node_h[n]).OnlyEnforceIf([is_v[n].Not(), active[n][i], aspect_relaxed.Not()])
                model.Add(h[n][i] <= node_h[n]).OnlyEnforceIf([is_v[n].Not(), active[n][i], aspect_relaxed])
                model.Add(w[n][i] == node_w[n]).OnlyEnforceIf([is_v[n], active[n][i], aspect_relaxed.Not()])
                model.Add(w[n][i] <= node_w[n]).OnlyEnforceIf([is_v[n], active[n][i], aspect_relaxed])
            else:
                model.Add(h[n][i] == node_h[n]).OnlyEnforceIf([is_v[n].Not(), active[n][i]])
                model.Add(w[n][i] == node_w[n]).OnlyEnforceIf([is_v[n], active[n][i]])

        # --- content-specific along-axis bound, per region ------------------
        for r in regions:
            for i in range(k):
                bit = assign[r.id][n][i]
                if r.kind in ("atomic_fixed", "atomic_aspect"):
                    px = int(round(r.px))
                    model.Add(w[n][i] == px).OnlyEnforceIf([bit, is_v[n].Not()])
                    model.Add(h[n][i] == px).OnlyEnforceIf([bit, is_v[n]])
                elif r.id == "boardComposite":
                    model.Add(w[n][i] == bc_w).OnlyEnforceIf(bit)
                    model.Add(h[n][i] == bc_h).OnlyEnforceIf(bit)
                elif r.id == "blackbox":
                    model.Add(w[n][i] == bb_w).OnlyEnforceIf(bit)
                    model.Add(h[n][i] == bb_h).OnlyEnforceIf(bit)

    # --- objective: stage 1, maximize board width ---------------------------
    model.Maximize(board_w_var)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    t0 = time.perf_counter()
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        t1 = time.perf_counter()
        return SynthesizeResult(
            class_name=class_name,
            status="INFEASIBLE",
            w_px=w_px,
            h_px=h_px,
            board_w=None,
            blackbox_along=None,
            ascii_tree=None,
            solve_ms=(t1 - t0) * 1000.0,
            num_bool_vars=0,
            num_int_vars=0,
            num_regions=len(regions),
        )
    board_w_opt = solver.Value(board_w_var)
    model.Add(board_w_var == board_w_opt)

    # --- objective: stage 2, maximize the black box's own along-extent -----
    # (narrower stand-in for reach-preferred/minimize-slack — see module
    # docstring's own disclosure.)
    bb_along = model.NewIntVar(0, max(w_px, h_px), "bb_along_stage2")
    # bb's own along axis is whichever of (bb_w,bb_h) equals bb's assigned
    # slot's along dimension; simplest honest proxy available without
    # re-deriving which node/slot hosts it: maximize (bb_w + bb_h) minus
    # the (fixed, already-pinned) cross dimension is not directly knowable
    # without that lookup, so we maximize the SUM bb_w+bb_h as a monotone
    # stand-in — it is only ever traded off against nothing else at this
    # stage (board width is already pinned), so any config that grows
    # bb_w+bb_h without shrinking anything else stage 1 cares about is a
    # legitimate improvement, and the region's OWN internal T-floor keeps
    # the sum bounded and meaningful.
    model.Add(bb_along == bb_w + bb_h)
    model.Maximize(bb_along)
    solver2 = cp_model.CpSolver()
    solver2.parameters.max_time_in_seconds = time_limit_s
    status2 = solver2.Solve(model)
    t1 = time.perf_counter()
    solve_ms = (t1 - t0) * 1000.0

    final_solver = solver2 if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else solver
    ascii_tree = _render_tree(final_solver, regions, slots, w, h, active, is_v, assign, delegate)

    return SynthesizeResult(
        class_name=class_name,
        status="OPTIMAL" if status2 == cp_model.OPTIMAL else "FEASIBLE",
        w_px=w_px,
        h_px=h_px,
        board_w=final_solver.Value(board_w_var),
        blackbox_along=final_solver.Value(bb_along) if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        ascii_tree=ascii_tree,
        solve_ms=solve_ms,
        num_bool_vars=sum(1 for v in model.Proto().variables if list(v.domain) == [0, 1]),
        num_int_vars=len(model.Proto().variables),
        num_regions=len(regions),
    )


def _render_tree(
    solver: cp_model.CpSolver,
    regions: List[Region],
    slots: Dict[NodeName, int],
    w: Dict[NodeName, List[cp_model.IntVar]],
    h: Dict[NodeName, List[cp_model.IntVar]],
    active: Dict[NodeName, List[cp_model.IntVar]],
    is_v: Dict[NodeName, cp_model.IntVar],
    assign: Dict[str, Dict[NodeName, List[cp_model.IntVar]]],
    delegate: Dict[NodeName, List[cp_model.IntVar]],
) -> str:
    def render(node: NodeName, prefix: str) -> str:
        axis = "V" if solver.Value(is_v[node]) else "H"
        lines = [f"{prefix}{axis}("]
        target = _child_delegate_target(node)
        for i in range(slots[node]):
            if solver.Value(active[node][i]) == 0:
                continue
            w_val, h_val = solver.Value(w[node][i]), solver.Value(h[node][i])
            placed = False
            for r in regions:
                if solver.Value(assign[r.id][node][i]):
                    lines.append(f"{prefix}  {r.id}  [w={w_val} h={h_val}]")
                    placed = True
                    break
            if not placed and target is not None and solver.Value(delegate[node][i]):
                lines.append(render(target, prefix + "  "))
                placed = True
            if not placed:
                lines.append(f"{prefix}  <UNRESOLVED SLOT w={w_val} h={h_val}>")
        lines.append(f"{prefix})")
        return "\n".join(lines)

    return render("A", "")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--time-limit-s", type=float, default=60.0)
    args = parser.parse_args()

    for class_name, w_px, h_px in (("landscape", 1920, 1080), ("portrait", 1080, 1920)):
        print("=" * 100)
        print(f"SYNTHESIZE {class_name} {w_px}x{h_px}")
        print("=" * 100)
        result = synthesize(class_name, w_px=w_px, h_px=h_px, time_limit_s=args.time_limit_s)
        print(f"status={result.status}  solve_ms={result.solve_ms:.1f}  "
              f"regions={result.num_regions}  bool_vars={result.num_bool_vars}  "
              f"total_vars={result.num_int_vars}")
        print(f"board_w={result.board_w}  blackbox_along={result.blackbox_along}")
        if result.ascii_tree:
            print(result.ascii_tree)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
