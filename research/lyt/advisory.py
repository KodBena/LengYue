"""AMENDMENT 5 (ledger row 1937, commissioner-delegated; see
SPEC-AMENDMENTS.md and `.claude/dispatch-reports/lyt-tab-region-
consult.md` §3 Option B) — per-T-group shortfall advisory reporting.

ADVISORY ONLY — per ADR-0011 Rule 5 ("a judgment-shaped output never
gates"), nothing in this module ever raises or refuses a load or a
solve. The LAWS (L5/L5a/L5b/L5c) live in `wellformed.py` and gate at
load time; this module answers a DIFFERENT question — not "is this
legal" but "how much does each pane fall short, at THIS solved size" —
so the runner's own stdout carries the differential-scroll fact the
consult report names in its §1 ("the Basic and Stability panes ... need
scrolling ... different amounts") as a PROGRAM-level fact, printed by
the solver, not something a reader has to open a browser and a DOM
inspector to discover (the row-1849 purpose ruling this whole amendment
answers to).

**What "declared demand" means here, disclosed.** A T-node child's
sizing (per SPEC.md §8's `along=None` bound-application branch) applies
the SAME `min`/`pref`/`max` triple to BOTH axes — there is no separate
w-demand and h-demand in the language's own 1-D-per-slot model. This
module reports each child's declared `pref` (its SOFT target — the same
quantity `compiler.py`'s own reach-preferred objective stage already
measures shortfall against, `_along_axis_for_path`'s `along=None`
branch treating a T child's `pref` as a target on BOTH `w` and `h`),
never `min`. This is a deliberate choice, not an arbitrary one: `min`
is a HARD constraint — the compiler derives the T node's own floor as
the componentwise max of its children's `min`s and enforces it as a
`>=` bound on the T's own solved `(w, h)` (§8), so a child whose `min`
genuinely exceeds the group's available room makes the WHOLE MODEL
`INFEASIBLE` before a rectangle is ever solved — there is no "solved
but short" state for `min` to report a shortfall against. `pref` is
different: it is a soft target the solver may leave unmet, so a
positive shortfall (`pref` above the group's solved extent) is a real,
reachable, non-gating state — exactly the "differential scroll" fact
this module exists to surface. `pref == 'fr'` (unresolvable to a fixed
px demand here) reports `demand_px=None`, not a guessed number. A
composite (non-leaf) child's own declared `pref` is used as-authored,
with the same disclosed-floor honesty this codebase already practices
for author-declared reservations elsewhere (SPEC.md §8's T-node `min`
disclosure is the precedent for "an author-declared number, not a
derived one, and that is stated").

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import lyt_ast as ast
from compiler import SolveResult


@dataclass(frozen=True)
class PaneShortfall:
    """One Exclusive (T) group child, its declared `pref` demand, and its
    shortfall against the group's own SOLVED shared rectangle (every
    child of a T node receives the identical rectangle, SPEC.md §2)."""

    t_path: str
    child_path: str
    child_index: int
    label: str  # leaf widget id, or a composite-node description
    demand_px: Optional[float]  # None when the child's pref is 'fr' (unresolvable here)
    shared_w: int
    shared_h: int
    shortfall_w: Optional[float]
    shortfall_h: Optional[float]


def _extent_px_for_report(e) -> Optional[float]:
    """Resolves a loaded `Sizing.pref` to a plain px float for reporting,
    or `None` when it isn't one ('fr' — an elastic share, no fixed
    demand to compare). Mirrors `compiler._extent_px`'s own "fr => None"
    convention, but this module does not need `compiler._extent_px`'s
    `upper_bound` parameter (`pref` never resolves 'inf' — that sentinel
    is legal only in `max` position, §4.1)."""
    if isinstance(e, ast.Extent) and e.unit != "fr":
        return e.v
    return None


def _child_label(slot: ast.Slot) -> str:
    node = slot.node
    if isinstance(node, ast.Leaf):
        return node.widget
    if isinstance(node, ast.Split):
        return f"({node.axis.upper()}-split)"
    if isinstance(node, ast.Exclusive):
        return "(nested T)"
    return "?"  # unreachable — LayoutNode is closed to Leaf|Split|Exclusive


def compute_t_group_shortfalls(
    root: ast.Slot, result: SolveResult, *, path: str = "root"
) -> List[PaneShortfall]:
    """Walks the loaded tree in lockstep with `result.rects` (keyed by
    the same dotted path convention every other consumer uses — loader.py,
    compiler.py, render.py) and, for every Exclusive (T) node whose own
    rectangle actually solved, reports each child's declared `pref`
    demand against the T's own solved `(w, h)` — the SAME shared
    rectangle every child receives (SPEC.md §2). Recurses into every
    node kind, so a T
    nested inside another T's child (nesting depth >= 3 in the sense the
    build commission asks tests to exercise) is reported too, at ITS own
    path.

    Dormant/empty for a tree with no Exclusive nodes at all. A T node
    whose path has NO entry in `result.rects` (an INFEASIBLE branch that
    never reached `_extract_rects`, or a presence valuation that pruned
    the whole group) is skipped for ITS OWN row but its children are
    still walked, in case a NESTED T deeper in the tree did solve.
    """
    out: List[PaneShortfall] = []
    node = root.node
    if isinstance(node, ast.Exclusive):
        rect = result.rects.get(path)
        for i, child in enumerate(node.children):
            cpath = f"{path}/T{i}"
            if rect is not None:
                demand = _extent_px_for_report(child.sizing.pref)
                shortfall_w = max(demand - rect.w, 0.0) if demand is not None else None
                shortfall_h = max(demand - rect.h, 0.0) if demand is not None else None
                out.append(
                    PaneShortfall(
                        t_path=path,
                        child_path=cpath,
                        child_index=i,
                        label=_child_label(child),
                        demand_px=demand,
                        shared_w=rect.w,
                        shared_h=rect.h,
                        shortfall_w=shortfall_w,
                        shortfall_h=shortfall_h,
                    )
                )
            out += compute_t_group_shortfalls(child, result, path=cpath)
        return out
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            out += compute_t_group_shortfalls(
                child, result, path=f"{path}/{node.axis.upper()}{i}"
            )
    # Leaf: nothing further to walk.
    return out


def format_shortfalls(shortfalls: List[PaneShortfall]) -> str:
    """Human-readable advisory block for the runner's own stdout — never
    parsed by anything downstream (advisory, per ADR-0011 Rule 5), so
    the exact text is not a load-bearing contract; the STRUCTURED
    `PaneShortfall` records above are the contract a test asserts
    against."""
    if not shortfalls:
        return ""
    lines = ["  --- Amendment 5 advisory: per-T-group pane shortfall ---"]
    by_t: dict = {}
    for s in shortfalls:
        by_t.setdefault(s.t_path, []).append(s)
    for t_path in sorted(by_t):
        lines.append(f"  T-group {t_path!r} (shared rect {by_t[t_path][0].shared_w}x{by_t[t_path][0].shared_h}):")
        for s in by_t[t_path]:
            demand = f"{s.demand_px:g}px" if s.demand_px is not None else "n/a (fr)"
            sw = f"{s.shortfall_w:g}" if s.shortfall_w is not None else "n/a"
            sh = f"{s.shortfall_h:g}" if s.shortfall_h is not None else "n/a"
            lines.append(
                f"    [{s.child_index}] {s.label:20s} demand={demand:>10s}  "
                f"shortfall(w,h)=({sw},{sh})"
            )
    return "\n".join(lines)
