"""METAMODEL WAVE, item 3 (ledger rows 2107/2108/2157/2187, M2 of the
model-implementation arc; ported to mainline from the model-iteration
loop experiment): a total coverage matrix over a declared, finite axis
product, with a verdict per point and measured solve time.

Disclosed scope (read before relying on the "full product" framing the
commission's own text uses). The commission asks for a solve over "the
FULL PRODUCT of declared axes (class x presence valuation x variant x
orientation x activity phase where declared)". This script delivers the
BOUNDED subset of that product this branch's existing machinery actually
supports and can solve without inventing new language mechanism this
wave's time did not afford:

  - screen class: {landscape, portrait} -- genuinely declared
    (research/lyt/runner.py's own REGISTRATIONS, ast.ScreenClass).
  - presence valuation: {all-present, default} -- genuinely declared
    (Amendment 4, presence.py).
  - orientation: recorded per class (item 1's own `orient h|v` fact on
    the `tree` leaf) -- NOT solved as an independent axis (orientation is
    solver-inert by construction, per item 1's own commit message; the
    compiled geometry does not change with it), so it is reported as a
    column alongside each row rather than multiplying the point count.

NOT implemented this wave, named rather than silently absorbed: a
genuine STRUCTURAL variant-family axis (row 2074/2108's own per-
valuation precedent, generalized to §2.4's StatusBar-segment-set /
board-rail-placement / settings-sub-tab-orientation / analysis-panel-
arrangement variants) would require a NEW declared-variant-family
language construct (closed, finite variant lists per class, each
requiring its OWN registered `.lyt` tree or a parameterized loader) that
does not exist in this branch's grammar today -- inventing it safely
(with load-time refusals, tests, and a real second tree per variant)
is a substantially larger effort than this wave's remaining budget
affords. Likewise an "activity phase" axis (workspace load state, the
root error boundary) has no LYT-level representation at all -- it is a
Vue-realization concept (App.vue's own v-if ladder), not a compiled-
program fact this solver ever sees. Both are named here, not solved,
per ADR-0008 Rule 3 / ADR-0002 Rule 7 (surface the gap visibly rather
than reading a narrower matrix as the full one).

An axis point without a verdict is a toolchain refusal (the commission's
own requirement): every (class, valuation) pair below is solved and
reported; there is no silent skip anywhere in this script.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import lyt_ast as ast
import loader
from compiler import solve_lexicographic
from presence import ALL_PRESENT, PresenceValuation, resolve_and_validate
from runner import REGISTRATIONS, _gather_reach_preferred_widgets, nearest_class

ENCODINGS_DIR = Path(__file__).parent / "encodings"

# Representative sizes, both classes -- runner.py's own SCREEN_SIZES plus
# the narrower portrait class points Amendment 4's own feasibility table
# (SPEC-AMENDMENTS.md) pinned, so the matrix's own "portrait must stay
# solvable" floor is checked at more than one point, not just the widest.
LANDSCAPE_SIZES: List[Tuple[str, int, int]] = [
    ("1920x1080", 1920, 1080),
    ("2560x1440", 2560, 1440),
    ("1280x1024", 1280, 1024),
]
PORTRAIT_SIZES: List[Tuple[str, int, int]] = [
    ("1080x1920", 1080, 1920),
    ("1200x1600", 1200, 1600),
    ("768x1024", 768, 1024),
    ("540x960", 540, 960),
    ("420x880", 420, 880),
]


def _find_leaf_orientation_raw(slot: ast.Slot, widget_id: str) -> "str | None":
    """None means 'not found in this subtree' -- distinct from the real
    default value 'v', which a bug in an earlier version of this function
    conflated with (a truthy 'v' fallback returned from every failed
    recursive branch short-circuited the walk before it ever reached the
    real leaf deeper in the tree)."""
    node = slot.node
    if getattr(node, "widget", None) == widget_id and hasattr(node, "orientation"):
        return node.orientation  # type: ignore[union-attr]
    for child in getattr(node, "children", []):
        found = _find_leaf_orientation_raw(child, widget_id)
        if found is not None:
            return found
    return None


def _find_leaf_orientation(slot: ast.Slot, widget_id: str) -> str:
    return _find_leaf_orientation_raw(slot, widget_id) or "v"  # default, per loader._load_orientation


def run_matrix() -> Tuple[List[dict], bool]:
    reg = next(r for r in REGISTRATIONS if r.name == "lengyue_landscape+portrait")
    layouts_raw: Dict[str, ast.Slot] = {}
    for f in reg.files:
        text = (ENCODINGS_DIR / f).read_text()
        layouts_raw.update(loader.load_layouts(text, waivers=reg.waivers))

    # LOOP ITERATION 11 / arc 4 round 4 (L15, ledger row 2241): a THIRD
    # valuation joins the product. `A_app` now declares the `@demote(h 616px)`
    # presence kind, which `presence.validate_valuation` accepts as
    # nameable-absent on exactly the footing a user-release toggle already
    # had -- so the demoted state is a genuinely SEPARATE solve (Amendment
    # 4's own §6 reading), not a modification of the default one, and the
    # matrix is the place that fact gets a verdict rather than an assertion.
    # Built off the DEFAULT valuation's own absent set rather than a second
    # hand-written literal (ADR-0012 P1: the default's membership has one
    # home, in `runner.REGISTRATIONS`).
    demoted = PresenceValuation(
        name="demoted",
        absent_widgets=reg.default_valuation.absent_widgets | frozenset({"A_app"}),
    )
    valuations = {
        "all-present": ALL_PRESENT,
        "default": reg.default_valuation,
        "demoted": demoted,
    }
    rows: List[dict] = []
    all_ok = True

    for valuation_name, valuation in valuations.items():
        layouts = resolve_and_validate(dict(layouts_raw), reg.layout_by_class.values(), valuation)
        for class_id, sizes in (("landscape", LANDSCAPE_SIZES), ("portrait", PORTRAIT_SIZES)):
            layout_name = reg.layout_by_class[class_id]
            slot = layouts[layout_name]
            tree_orientation = _find_leaf_orientation(slot, "tree")
            reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
            for size_label, w, h in sizes:
                cls = ast.ScreenClass(id=class_id, w_px=w, h_px=h)
                assert nearest_class([cls], w, h).id == class_id  # own-class sanity, not a real nearest-neighbor call
                result = solve_lexicographic(
                    slot,
                    class_id=class_id,
                    w_px=w,
                    h_px=h,
                    board_widget=reg.board_widget,
                    reach_preferred_widgets=reach,
                    time_limit_s=20.0,
                )
                ok = result.status in ("OPTIMAL", "FEASIBLE")
                if class_id == "portrait" and not ok:
                    all_ok = False
                rows.append(
                    {
                        "class": class_id,
                        "valuation": valuation_name,
                        "size": size_label,
                        "tree_orientation": tree_orientation,
                        "status": result.status,
                    }
                )
    return rows, all_ok


def main() -> int:
    t0 = time.monotonic()
    rows, portrait_ok = run_matrix()
    elapsed_s = time.monotonic() - t0

    print("=" * 100)
    print(
        f"METAMODEL WAVE item 3 -- total coverage matrix "
        f"({len(rows)} axis points: 2 classes x 3 valuations x "
        f"{len(LANDSCAPE_SIZES)}/{len(PORTRAIT_SIZES)} sizes)"
    )
    print("=" * 100)
    header = f"{'class':10s} {'valuation':12s} {'size':16s} {'tree orient':11s} {'status':12s}"
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['class']:10s} {row['valuation']:12s} {row['size']:16s} "
            f"{row['tree_orientation']:11s} {row['status']:12s}"
        )
    print()
    print(f"solve wall time for the full matrix: {elapsed_s:.3f}s ({len(rows)} points)")
    print(f"portrait floor (every portrait row OPTIMAL or FEASIBLE): {'HOLDS' if portrait_ok else 'VIOLATED'}")

    out_path = Path(__file__).parent / "coverage_matrix_result.json"
    out_path.write_text(
        json.dumps({"rows": rows, "elapsed_s": elapsed_s, "portrait_floor_holds": portrait_ok}, indent=2)
    )
    print(f"machine-readable result: {out_path}")

    return 0 if portrait_ok else 1


if __name__ == "__main__":
    sys.exit(main())
