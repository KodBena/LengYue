"""research/lyt/emit_layout_tree.py

W1 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
S3, "layout as data, not template"; S8 W1 item 1). Sibling to `emit_ts.py`
rather than an extension of it: `emit_ts.py`'s job is a CP-SAT-SOLVED
rectangle registry (Phase-1 shadow mode, used only by the conformance
harness); this script's job is a different data shape entirely -- the
compiled LYT PROGRAM itself (the H/V/Exclusive tree, its sizing/gap/
presence declarations, unsolved) as typed TS data, which
`frontend/src/components/chrome/LytNode.vue` interprets at RUNTIME as
nested CSS Grid containers (the browser's own layout engine does the
solving, continuously, under live resize -- exactly the mechanism
`research/lyt/emit_mockup.py`'s static-HTML mockups already proved out;
see that module's own docstring, read in full, for the LYT -> CSS Grid
mapping table this script's `_track_shape_for_child` reproduces as JSON
track-shape descriptors instead of literal CSS strings).

Scope, W1 (disclosed narrowing, ratified by the roadmap's own §8 W1 text
-- "screen-class selection may be static-landscape this wave"): only
`encodings/lengyue_landscape.lyt`'s `lengyue-landscape` layout is
compiled. The portrait class swap is W3 scope.

Exclusive (T) node collapse (disclosed simplification, matches the
roadmap's own S8 W1 item 2 framing -- "the control panel...is ONE leaf,
commissioner: black box"): rather than expand the T node's five CP-*
children into their own grid children (which W1's widget registry does
not populate -- TabWidget.vue already owns the tab-strip-plus-body
realization internally), this emitter collapses the WHOLE Exclusive node
into a single synthetic leaf (`kind: 'blackbox'`, widget id
`controlPanel`) whose track uses the SAME `_exclusive_derived_min_px`
floor the CP-SAT compiler and `emit_mockup.py`'s mockup both use (the
componentwise max of the five children's own declared `min`). The five
child widget ids are still carried (`childWidgets`) for documentation/
report-table parity -- nothing about the census is lost, only the GRID
EXPANSION of it.

Presence (repair pass, ledger row 1781, W1 REPAIR):
`encodings/lengyue_landscape.lyt` DOES declare `@toggle(user, release)`
presence on `boardRail`/`previewBoard` (AMENDMENT 4, ledger row 1737,
`research/lyt/presence.py`) -- the ORIGINAL text this docstring carried
("neither `.lyt` source file declares an `@toggle` presence") was true
only under the REJECTED prior W1 attempt's undisclosed reversion of that
declaration (`.claude/dispatch-reports/lyt-w1-skeleton-review.md` Finding
C); this repair build restores the `@toggle` concrete syntax and corrects
this docstring to match. The toggle annotation only affects `slot.presence`
(consumed by `presence.py`'s valuation machinery -- `runner.py`,
`emit_ts.py`, `emit_mockup.py`), never `slot.sizing` -- this emitter reads
only `slot.sizing` (`_track_shape_for_child`), so it is presence-BLIND by
construction and needs no change to keep working against the
presence-annotated encoding: both `boardRail` and `previewBoard` declare
`{min 168px, pref 168px, max 168px}` / `{min 160px, pref 160px, max 160px,
aspect 1}` regardless of the `@toggle` prefix, so `_is_fixed` still
matches and `_track_shape_for_child` still emits `{kind: 'fixed', ...}`
unchanged. This script's own `DEFAULT_VISIBLE_BY_PATH` table remains the
ONE fact it needs from the presence story -- reproduced verbatim from
`emit_mockup.py.TOGGLE_TARGETS["landscape"]`'s own third tuple element,
independently of `presence.py`'s valuation-solving machinery (which this
W1 runtime renderer has no use for: there is no presence MENU this wave,
roadmap §8, so "default visible or not" is the only fact consumed, not
"which valuation is currently active").

Regeneration command (also written into the generated file's own
header):

    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py

(writes to ../../frontend/src/state/lyt-layout.gen.ts by default; pass
--out PATH to redirect, e.g. for this emitter's own tests.)

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import lyt_ast as ast
import loader
from runner import ENCODINGS_DIR

DEFAULT_OUT = Path(__file__).parent.parent.parent / "frontend" / "src" / "state" / "lyt-layout.gen.ts"

LAYOUT_FILE = "lengyue_landscape.lyt"
LAYOUT_NAME = "lengyue-landscape"
CLASS_ID = "landscape"

# Reproduced verbatim from emit_mockup.py's own TOGGLE_TARGETS["landscape"]
# table (see that module's docstring for the full corner-menu-affordance
# disclosure) -- W1 only consumes the third tuple element (default_visible).
# Kept as a path-tuple -> bool map, not re-imported from emit_mockup.py
# directly, since that module also carries the (out-of-W1-scope) label/
# release-vs-preserve machinery this script has no use for; duplicating
# just the one fact this emitter needs is more honest than importing a
# generator module built for a different consumer (static HTML) and
# picking one field back out of it.
DEFAULT_VISIBLE_BY_PATH: Dict[Tuple[int, ...], bool] = {
    (0,): False,       # boardRail
    (1,): True,        # V-composite (board + info + action rows)
    (2, 0): True,       # A_go
    (2, 1): True,       # I_engine
    (2, 2): True,       # A_common
    (2, 3, 1): True,     # T(CP-*) -- the control-panel black box
    (2, 3, 2): False,    # previewBoard
}


def _px(e: ast.Extent, *, where: str) -> float:
    if e.unit != "px":
        raise NotImplementedError(
            f"{where}: expected a resolved px extent, got unit={e.unit!r} (v={e.v}) -- "
            "emit_layout_tree.py's grid mapping only handles the sizing shapes actually "
            "present in encodings/lengyue_landscape.lyt; extend _track_shape_for_child "
            "before pointing this generator at a new shape."
        )
    return e.v


def _is_fixed(sizing: ast.Sizing) -> bool:
    if sizing.max == "inf":
        return False
    if sizing.min.unit != "px" or sizing.pref.unit != "px" or sizing.max.unit != "px":
        return False
    return sizing.min.v == sizing.pref.v == sizing.max.v


def _track_shape_for_child(sizing: ast.Sizing, *, floor_override_px: Optional[float], where: str) -> dict:
    """Mirrors emit_mockup.py's `_track_for_child` mapping table (that
    module's own docstring, read in full, is the normative source) but
    returns a JSON-serializable shape descriptor instead of a literal CSS
    string -- `LytNode.vue` does the final `minmax()`/`clamp()` string
    assembly at runtime, off this same closed vocabulary."""
    if _is_fixed(sizing):
        return {"kind": "fixed", "px": _px(sizing.pref, where=where)}
    min_px = floor_override_px if floor_override_px is not None else _px(sizing.min, where=where)
    if sizing.max == "inf":
        if sizing.pref.unit == "fr":
            return {"kind": "elastic", "minPx": min_px, "frWeight": sizing.pref.v}
        raise NotImplementedError(f"{where}: uncapped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")
    max_px = _px(sizing.max, where=where)
    if sizing.pref.unit == "fr":
        return {"kind": "elastic-capped", "minPx": min_px, "maxPx": max_px}
    raise NotImplementedError(f"{where}: capped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")


def _exclusive_derived_min_px(excl: ast.Exclusive, *, where: str) -> float:
    """compiler.py's `_constrain` Exclusive branch: a T node's own
    structural min is the componentwise max of its children's declared
    min. Reproduced here (same derivation emit_mockup.py's own
    `_exclusive_derived_min_px` uses) so the collapsed blackbox leaf's
    track carries the same floor the solver enforces."""
    mins = [_px(c.sizing.min, where=f"{where}/child") for c in excl.children]
    return max(mins) if mins else 0.0


def _find_board_composite_child(node: ast.Split) -> Optional[Tuple[int, ast.Split, float]]:
    """Verbatim port of emit_mockup.py's own `_find_board_composite_child`
    -- see that function's docstring for the full derivation. Detects the
    one recognized shape (a Split child = [one aspect-locked Leaf, ...
    otherwise only FIXED siblings]) so the CASE A/B board-maximize
    override below can be applied only where it was actually derived."""
    matches: List[Tuple[int, ast.Split, float]] = []
    for i, child in enumerate(node.children):
        if not isinstance(child.node, ast.Split):
            continue
        sub = child.node
        aspect_leaves = [c for c in sub.children if isinstance(c.node, ast.Leaf) and c.sizing.aspect is not None]
        if len(aspect_leaves) != 1:
            continue
        others = [c for c in sub.children if c is not aspect_leaves[0]]
        if not all(_is_fixed(c.sizing) for c in others):
            continue
        fixed_sum = sum(_px(c.sizing.pref, where=f"board-composite-fixed-sum@{i}") for c in others)
        matches.append((i, sub, fixed_sum))
    return matches[0] if len(matches) == 1 else None


def _apply_board_priority(
    node: ast.Split, shapes: List[dict], *, match: Tuple[int, ast.Split, float]
) -> List[dict]:
    """CASE A ONLY (module docstring's disclosed W1 narrowing): landscape's
    root H split's board composite (child 1, a V node) has axis 'v' !=
    the root's own axis 'h', which is exactly emit_mockup.py's CASE A
    ("cap the non-board elastic+capped sibling"). CASE B (the portrait
    shape, composite.axis == node.axis) is out of scope for this script --
    portrait is W3. Raises loudly rather than silently falling through to
    the un-overridden mapping if a future encoding change makes CASE B
    the one that matches here, per ADR-0002."""
    board_idx, composite, fixed_sum = match
    if composite.axis == node.axis:
        raise NotImplementedError(
            "CASE B (composite.axis == node.axis) board-priority override is out of "
            "this W1 emitter's disclosed scope (landscape-only, CASE A shape) -- "
            "port emit_mockup.py's CASE B branch before pointing this script at an "
            "encoding whose root/composite axes match."
        )
    out = list(shapes)
    node_cross_unit = "vh" if node.axis == "h" else "vw"
    for j, child in enumerate(node.children):
        if j == board_idx:
            continue
        sizing = child.sizing
        if _is_fixed(sizing) or sizing.max == "inf" or sizing.pref.unit != "fr":
            continue  # not the elastic+capped shape this override is for
        min_px = _px(sizing.min, where=f"board-priority/sibling-min@{j}")
        max_px = _px(sizing.max, where=f"board-priority/sibling-max@{j}")
        out[j] = {
            "kind": "board-priority-clamp",
            "minPx": min_px,
            "maxPx": max_px,
            "naturalBoardCrossUnit": node_cross_unit,
            "fixedSiblingSumPx": fixed_sum,
            "parentGapPx": node.gap_px,
        }
    return out


def _domain_facets(leaf: ast.Leaf) -> Tuple[str, List[str]]:
    return leaf.domain, sorted(leaf.facets)


def _build_node(slot: ast.Slot, *, path: Tuple[int, ...]) -> dict:
    node = slot.node
    if isinstance(node, ast.Leaf):
        domain, facets = _domain_facets(node)
        return {
            "kind": "leaf",
            "widget": node.widget,
            "domain": domain,
            "facets": facets,
            "aspect": slot.sizing.aspect,
        }
    if isinstance(node, ast.Exclusive):
        child_widgets = []
        for c in node.children:
            if not isinstance(c.node, ast.Leaf):
                raise NotImplementedError(
                    f"Exclusive child at {path} is not a Leaf -- this emitter's "
                    "blackbox collapse assumes every T-node child is a plain leaf "
                    "(true of lengyue_landscape.lyt's CP-* children)."
                )
            child_widgets.append(c.node.widget)
        return {
            "kind": "blackbox",
            "widget": "controlPanel",
            "tag": node.tag,
            "childWidgets": child_widgets,
        }
    if isinstance(node, ast.Split):
        axis = node.axis
        shapes: List[dict] = []
        for i, child in enumerate(node.children):
            cpath = path + (i,)
            floor = (
                _exclusive_derived_min_px(child.node, where=str(cpath))
                if isinstance(child.node, ast.Exclusive)
                else None
            )
            shapes.append(_track_shape_for_child(child.sizing, floor_override_px=floor, where=str(cpath)))
        if path == ():
            match = _find_board_composite_child(node)
            if match is not None:
                shapes = _apply_board_priority(node, shapes, match=match)
        children = []
        for i, child in enumerate(node.children):
            cpath = path + (i,)
            children.append(
                {
                    "path": ".".join(str(p) for p in cpath),
                    "presenceDefaultVisible": DEFAULT_VISIBLE_BY_PATH.get(cpath, True),
                    "track": shapes[i],
                    "node": _build_node(child, path=cpath),
                }
            )
        return {"kind": "split", "axis": axis, "gapPx": node.gap_px, "children": children}
    raise TypeError(f"unknown LayoutNode kind at path {path}: {node!r}")


def build_program() -> dict:
    text = (ENCODINGS_DIR / LAYOUT_FILE).read_text()
    layouts = loader.load_layouts(text)
    slot = layouts[LAYOUT_NAME]
    if not isinstance(slot.node, ast.Split):
        raise TypeError(f"{LAYOUT_NAME}'s root is not a Split: {slot.node!r}")
    root = _build_node(slot, path=())
    return {"classId": CLASS_ID, "root": root}


# ---------------------------------------------------------------------------
# TS rendering (pure formatting, deterministic -- no timestamp/hostname/
# random iteration order, matching emit_ts.py's own determinism discipline).
# ---------------------------------------------------------------------------


def _ts_track_shape(shape: dict) -> str:
    kind = shape["kind"]
    if kind == "fixed":
        return f'{{ kind: "fixed", px: {shape["px"]:g} }}'
    if kind == "elastic":
        return f'{{ kind: "elastic", minPx: {shape["minPx"]:g}, frWeight: {shape["frWeight"]:g} }}'
    if kind == "elastic-capped":
        return f'{{ kind: "elastic-capped", minPx: {shape["minPx"]:g}, maxPx: {shape["maxPx"]:g} }}'
    if kind == "board-priority-clamp":
        return (
            "{ kind: \"board-priority-clamp\", "
            f'minPx: {shape["minPx"]:g}, maxPx: {shape["maxPx"]:g}, '
            f'naturalBoardCrossUnit: {json.dumps(shape["naturalBoardCrossUnit"])}, '
            f'fixedSiblingSumPx: {shape["fixedSiblingSumPx"]:g}, parentGapPx: {shape["parentGapPx"]:g} }}'
        )
    raise ValueError(f"unknown track shape kind: {kind!r}")


def _ts_node(node: dict, indent: str) -> str:
    kind = node["kind"]
    if kind == "leaf":
        aspect = "null" if node["aspect"] is None else f'{node["aspect"]:g}'
        facets = ", ".join(json.dumps(f) for f in node["facets"])
        return (
            f'{{ kind: "leaf", widget: {json.dumps(node["widget"])}, '
            f'domain: {json.dumps(node["domain"])}, facets: [{facets}], aspect: {aspect} }}'
        )
    if kind == "blackbox":
        tag = "null" if node["tag"] is None else json.dumps(node["tag"])
        child_widgets = ", ".join(json.dumps(w) for w in node["childWidgets"])
        return (
            f'{{ kind: "blackbox", widget: {json.dumps(node["widget"])}, tag: {tag}, '
            f"childWidgets: [{child_widgets}] }}"
        )
    if kind == "split":
        inner = indent + "  "
        children_lines = []
        for child in node["children"]:
            children_lines.append(f"{inner}  {{")
            children_lines.append(f'{inner}    path: {json.dumps(child["path"])},')
            children_lines.append(f'{inner}    presenceDefaultVisible: {json.dumps(child["presenceDefaultVisible"])},')
            children_lines.append(f'{inner}    track: {_ts_track_shape(child["track"])},')
            children_lines.append(f'{inner}    node: {_ts_node(child["node"], inner + "    ")},')
            children_lines.append(f"{inner}  }},")
        children_block = "\n".join(children_lines)
        return (
            f'{{\n{inner}kind: "split", axis: {json.dumps(node["axis"])}, gapPx: {node["gapPx"]:g},\n'
            f"{inner}children: [\n{children_block}\n{inner}],\n{indent}}}"
        )
    raise ValueError(f"unknown node kind: {kind!r}")


def render_ts(program: dict) -> str:
    lines: List[str] = []
    lines.append("/**")
    lines.append(" * GENERATED FILE — do not hand-edit.")
    lines.append(" * Tool: research/lyt/emit_layout_tree.py")
    lines.append(f" * Source encoding: research/lyt/encodings/{LAYOUT_FILE} (layout `{LAYOUT_NAME}`)")
    lines.append(
        " * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — "
        "consumed at runtime by LytNode.vue, which realizes each Split as a live CSS "
        "Grid container (roadmap S3, 'layout as data, not template')."
    )
    lines.append(
        " * W1 scope (disclosed): landscape class only (portrait is W3); the "
        "Exclusive (T) control-panel node is collapsed to a single 'blackbox' leaf "
        "(widget id 'controlPanel') rather than expanded into its five CP-* grid "
        "children — see this tool's own module docstring."
    )
    lines.append(" * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py")
    lines.append(" *")
    lines.append(" * Public Domain (The Unlicense), matching research/lyt/__init__.py's")
    lines.append(" * license line and the umbrella's ADR-0006 per-file convention.")
    lines.append(" */")
    lines.append("")
    lines.append("export type LytAxis = 'h' | 'v';")
    lines.append("export type LytDomain = 'go' | 'common' | 'debug' | 'board' | 'chrome' | 'blackbox';")
    lines.append("export type LytFacet = 'action' | 'info';")
    lines.append("")
    lines.append("export interface LytLeafNode {")
    lines.append("  readonly kind: 'leaf';")
    lines.append("  readonly widget: string;")
    lines.append("  readonly domain: LytDomain;")
    lines.append("  readonly facets: readonly LytFacet[];")
    lines.append("  readonly aspect: number | null;")
    lines.append("}")
    lines.append("")
    lines.append("/** Collapsed Exclusive (T) node — see file header, 'Exclusive (T) node collapse'. */")
    lines.append("export interface LytBlackboxNode {")
    lines.append("  readonly kind: 'blackbox';")
    lines.append("  readonly widget: string;")
    lines.append("  readonly tag: string | null;")
    lines.append("  readonly childWidgets: readonly string[];")
    lines.append("}")
    lines.append("")
    lines.append("export type LytTrackShape =")
    lines.append("  | { readonly kind: 'fixed'; readonly px: number }")
    lines.append("  | { readonly kind: 'elastic'; readonly minPx: number; readonly frWeight: number }")
    lines.append("  | { readonly kind: 'elastic-capped'; readonly minPx: number; readonly maxPx: number }")
    lines.append("  | {")
    lines.append("      readonly kind: 'board-priority-clamp';")
    lines.append("      readonly minPx: number;")
    lines.append("      readonly maxPx: number;")
    lines.append("      readonly naturalBoardCrossUnit: 'vh' | 'vw';")
    lines.append("      readonly fixedSiblingSumPx: number;")
    lines.append("      readonly parentGapPx: number;")
    lines.append("    };")
    lines.append("")
    lines.append("export interface LytSplitNode {")
    lines.append("  readonly kind: 'split';")
    lines.append("  readonly axis: LytAxis;")
    lines.append("  readonly gapPx: number;")
    lines.append("  readonly children: readonly LytChild[];")
    lines.append("}")
    lines.append("")
    lines.append("export type LytNodeData = LytLeafNode | LytBlackboxNode | LytSplitNode;")
    lines.append("")
    lines.append("export interface LytChild {")
    lines.append("  /** Dotted child-index path from the program root, e.g. '1.3.2'. */")
    lines.append("  readonly path: string;")
    lines.append("  /** W1 scope: the only presence fact consumed (no toggle UI this wave). */")
    lines.append("  readonly presenceDefaultVisible: boolean;")
    lines.append("  readonly track: LytTrackShape;")
    lines.append("  readonly node: LytNodeData;")
    lines.append("}")
    lines.append("")
    lines.append("export interface LytProgram {")
    lines.append("  readonly classId: string;")
    lines.append("  readonly root: LytSplitNode;")
    lines.append("}")
    lines.append("")
    lines.append(f"export const LYT_LANDSCAPE: LytProgram = {{")
    lines.append(f'  classId: {json.dumps(program["classId"])},')
    lines.append(f'  root: {_ts_node(program["root"], "  ")},')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser_ = argparse.ArgumentParser(description=__doc__)
    parser_.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output .ts path")
    args = parser_.parse_args(argv)

    program = build_program()
    text = render_ts(program)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text)
    print(f"[emit_layout_tree] wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
