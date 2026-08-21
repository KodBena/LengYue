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
from runner import (
    REGISTRATIONS,
    _gather_reach_preferred_widgets,
    is_governed_encoding,
    nearest_class,
    resolve_encoding_file,
    source_file_label,
    valuation_for_class,
)

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


def _find_leaf_presence_kind(slot: ast.Slot, widget_id: str) -> "str | None":
    """Walks the (unpruned) tree for `widget_id`'s declared `Presence.kind`
    -- `None` if the identity doesn't appear in this tree at all. Same
    generic-children walk as `_find_leaf_orientation_raw` above; the
    fix-pass counterpart that lets the "demoted" valuation below tell
    "this encoding never declared `@demote` here" (a legal state, per
    `loader._load_presence`'s own `ast.FIXED` default for an undecorated
    leaf) apart from "this encoding declared something else that
    conflicts" -- both distinct from a crash. LYT presence arc P1 (row
    2333): `widget_id` now also matches a tagged Exclusive's own `[TAG]`
    (`presence._collect_leaf_presence`'s own identical widening), since
    `DEMOTED_EXTRA_WIDGETS` names one ("BLACK BOX")."""
    node = slot.node
    if isinstance(node, ast.Leaf) and node.widget == widget_id:
        return slot.presence.kind
    if isinstance(node, ast.Exclusive) and node.tag == widget_id:
        return slot.presence.kind
    for child in getattr(node, "children", []):
        found = _find_leaf_presence_kind(child, widget_id)
        if found is not None:
            return found
    return None


# LOOP ITERATION 11 / arc 4 round 4 (L15, ledger row 2241): the widget(s)
# the "demoted" valuation adds on top of the DEFAULT valuation's own
# absent set. On the experiment branch's own edited encodings, `A_app`
# declares `@demote(h 616px)`, so this valuation is a genuinely separate,
# always-solvable third point on the matrix. Mainline's unedited
# encodings never applied that edit (stage B's own job, not this port's)
# -- `A_app` here is a bare `{160px} A_app[common, action]` leaf with no
# decorator at all, `kind == "fixed"`. That is a LEGAL state, not an
# error (ADR-0002/fix-pass review finding 1, ledger row 2312): the matrix
# below checks for it explicitly per class and reports an honest N/A
# rather than letting `presence.validate_valuation` raise `LytLoadError`
# (which is what this tool did, uncaught, before this fix).
# LYT presence arc P1 (row 2333): "BLACK BOX" (the control-panel
# Exclusive's own `[BLACK BOX]` tag, now a genuine `@demote` presence
# identity on both classes) joins `A_app` here -- landscape's own
# DIAGNOSTIC "demoted" coverage point (its `default_valuation` is
# unchanged; only this coverage row exercises the control panel's
# absence there) and portrait's own "demoted" row (which already
# includes it via `default_valuation_by_class["portrait"]`, so the
# union below is a no-op addition for portrait specifically, not a
# double-count -- `frozenset | frozenset` is idempotent).
DEMOTED_EXTRA_WIDGETS = frozenset({"A_app", "BLACK BOX"})


def run_matrix() -> Tuple[List[dict], bool]:
    reg = next(r for r in REGISTRATIONS if r.name == "lengyue_landscape+portrait")
    layouts_raw: Dict[str, ast.Slot] = {}
    for f in reg.files:
        p = resolve_encoding_file(f)
        text = p.read_text()
        # RATCHET FORM, dispatch C4 (ledger rows 2396/2445): see
        # `runner.load_governed_layouts`'s own docstring.
        layouts_raw.update(
            loader.load_layouts(
                text,
                waivers=reg.waivers,
                refuse_literal_bounds=is_governed_encoding(p),
                source_file=source_file_label(p),
            )
        )

    rows: List[dict] = []
    all_ok = True

    # all-present / default: genuinely declared on every encoding this
    # branch loads (Amendment 4), so always solved, no honesty caveat
    # needed. LYT presence arc P1 (row 2333): "default" is now resolved
    # PER CLASS (`runner.valuation_for_class`) -- portrait's own default
    # differs from landscape's (the control-panel repetition-first
    # demotion), so a single shared valuation can no longer be validated
    # against both layouts in one call (see `runner.run_all`'s own P1
    # docstring update for the identical reasoning).
    for valuation_name in ("all-present", "default"):
        for class_id, sizes in (("landscape", LANDSCAPE_SIZES), ("portrait", PORTRAIT_SIZES)):
            layout_name = reg.layout_by_class[class_id]
            valuation = ALL_PRESENT if valuation_name == "all-present" else valuation_for_class(reg, class_id)
            layouts = resolve_and_validate(dict(layouts_raw), [layout_name], valuation)
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

    # demoted: solved per class, gated on that class's own (unpruned) tree
    # actually declaring `@demote` on every widget this valuation names
    # absent. A class whose tree doesn't is reported honestly, not solved
    # and not silently skipped -- every axis point still gets a labelled
    # row (the module docstring's own "no silent skip anywhere" promise).
    for class_id, sizes in (("landscape", LANDSCAPE_SIZES), ("portrait", PORTRAIT_SIZES)):
        layout_name = reg.layout_by_class[class_id]
        raw_slot = layouts_raw[layout_name]
        demoted = PresenceValuation(
            name="demoted",
            absent_widgets=valuation_for_class(reg, class_id).absent_widgets | DEMOTED_EXTRA_WIDGETS,
        )
        undeclared = sorted(
            w for w in DEMOTED_EXTRA_WIDGETS if _find_leaf_presence_kind(raw_slot, w) != "demote"
        )
        if undeclared:
            tree_orientation = _find_leaf_orientation(raw_slot, "tree")
            reason = f"N/A -- no @demote declared for {', '.join(undeclared)}"
            for size_label, w, h in sizes:
                rows.append(
                    {
                        "class": class_id,
                        "valuation": "demoted",
                        "size": size_label,
                        "tree_orientation": tree_orientation,
                        "status": reason,
                    }
                )
            continue  # not applicable -- no solve, no violation, no skip: an honest labelled absence.

        # @demote IS declared here -- solve exactly as the experiment
        # branch's own (single-shot, all-layouts) call did, narrowed to
        # this one layout so a mixed present/absent split across classes
        # (not exercised on mainline today, but not precluded either)
        # doesn't force an all-or-nothing crash on the OTHER class.
        layouts = resolve_and_validate({layout_name: raw_slot}, [layout_name], demoted)
        slot = layouts[layout_name]
        tree_orientation = _find_leaf_orientation(slot, "tree")
        reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
        for size_label, w, h in sizes:
            cls = ast.ScreenClass(id=class_id, w_px=w, h_px=h)
            assert nearest_class([cls], w, h).id == class_id
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
                    "valuation": "demoted",
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
