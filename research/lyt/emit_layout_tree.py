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

Scope, W3 (portrait build): both screen classes are now compiled --
`encodings/lengyue_landscape.lyt`'s `lengyue-landscape` layout (as
before, W1) AND `encodings/lengyue_portrait.lyt`'s `lengyue-portrait`
layout (new, W3). Each class is its own registration
(`REGISTRATIONS`, keyed `"landscape"` / `"portrait"`) naming its own
`.lyt` source, layout name, class id, default-presence table, TS
const name, and default output path; `build_program` and every helper
it calls take these as explicit parameters rather than module globals,
so a single process can build both classes without any global
reassignment footgun (a script that might build both classes in one
run -- e.g. from a test -- must not rely on module-level state a
second call could stomp). `main`'s `--registration {landscape,portrait}`
CLI flag selects which one a given invocation emits; landscape keeps
its historical default output path
(`frontend/src/state/lyt-layout.gen.ts`) and portrait gets its own new
sibling file (`frontend/src/state/lyt-layout-portrait.gen.ts`), per
the roadmap's own disclosed shape for this wave.

Portrait's board composite is a DIFFERENT shape than landscape's --
CASE B, not CASE A, in `emit_mockup.py`'s `_board_priority_tracks`
taxonomy (that function's own ~70-line docstring, read in full, is the
normative derivation for both cases). Landscape's root is `H(...)` and
its board composite is a `V(...)`, so `composite.axis ('v') !=
node.axis ('h')` -- CASE A, "cap the non-board elastic+capped
sibling". Portrait's root is `V(...)` and its board composite is
ALSO a `V(...)`, so `composite.axis == node.axis` -- CASE B, "cap the
COMPOSITE's OWN track at its natural ceiling" instead. `_apply_board_
priority` below implements both branches (ported from `emit_mockup.
py`'s CASE B, verbatim in its arithmetic) rather than raising
`NotImplementedError` for CASE B the way the original W1-only version
did.

CASE B's track shape (`{kind: 'board-priority-self-clamp',
naturalCrossUnit, fixedSiblingSumPx}`) is a NEW member of the JSON
track-shape vocabulary (and the TS `LytTrackShape` discriminated
union it renders as) alongside CASE A's existing `board-priority-
clamp`. Unlike CASE A, CASE B carries no independent `minPx`/`maxPx`
-- its cap is a bare `minmax(0px, natural)`, not a three-way clamp --
so the two kinds are genuinely different shapes, not the same fields
renamed. See `frontend/src/state/lyt-layout-types.ts`'s own doc-
comment on this union member for the exact CSS this compiles to
(`frontend/src/composables/chrome/useLytTrackCss.ts` is the
compiler; that file is NOT touched by this script or by this
commission -- it belongs to the parallel Vue-side W3 task).

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
EXPANSION of it. This applies identically to both classes -- both
`.lyt` encodings give their T node the same six-child shape.

AMENDMENT 6 retirement (ledger row 1937, .claude/dispatch-reports/
lyt-tab-region-consult.md §6.2/§6.4/§8.1, the "Option C" tab-skeleton-
encoding wave): the paragraph above's "five CP-* children" is no longer
five bare leaves -- CP-analysis and CP-settings are now composite Split
subtrees (a nested tab group and a strip+pane, respectively), opened one
structural level per the ratified consult. The plain-leaf-T assertion this
Exclusive branch used to raise (`isinstance(c.node, ast.Leaf)` required, a
`NotImplementedError` otherwise) is RETIRED: `_build_node`'s Exclusive
branch no longer inspects each child's node kind at all before collapsing
-- it always collapses the WHOLE node to one `blackbox` leaf, and
`childWidgets` is now populated by `_collect_leaf_widgets`, a genuine
structural fold (total over Leaf|Split|Exclusive, not a one-level
`c.node.widget` read) so a composite tab's interior leaves are still named
for documentation, never silently dropped. The emitted TS shape and
LytNode.vue's realization boundary are UNCHANGED by this wave (§8.1's own
"Wave 1 ships solver-side... byte-identical" resolution) -- the only
observable diff, regenerating both classes' `.gen.ts` after this wave, is
`childWidgets`' own contents (now longer, listing the opened tabs'
interior leaves instead of the bare `CP-analysis`/`CP-settings` strings),
a field this module's own docstring above already discloses as
documentation-only and `LytNode.vue` never reads.

Presence (repair pass, ledger row 1781, W1 REPAIR; generalized here to
portrait, W3): both `.lyt` source files declare `@toggle(user,
release)` presence on `boardRail`/`previewBoard` (AMENDMENT 4, ledger
row 1737, `research/lyt/presence.py`). The toggle annotation only
affects `slot.presence` (consumed by `presence.py`'s valuation
machinery -- `runner.py`, `emit_ts.py`, `emit_mockup.py`), never
`slot.sizing` -- this emitter reads only `slot.sizing`
(`_track_shape_for_child`), so it is presence-BLIND by construction
and needs no change to keep working against a presence-annotated
encoding. Each registration's own `default_visible_by_path` table
remains the ONE fact this emitter needs from the presence story --
reproduced verbatim from `emit_mockup.py.TOGGLE_TARGETS[class_id]`'s
own third tuple element for that class, independently of `presence.
py`'s valuation-solving machinery (which this W1/W3 runtime renderer
has no use for: there is no presence MENU this wave, roadmap S8, so
"default visible or not" is the only fact consumed, not "which
valuation is currently active").

Regeneration command (also written into each generated file's own
header):

    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration landscape
    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration portrait

(landscape writes to ../../frontend/src/state/lyt-layout.gen.ts by
default, portrait to ../../frontend/src/state/lyt-layout-portrait.gen.ts;
pass --out PATH to redirect either, e.g. for this emitter's own tests.
`--registration` defaults to `landscape`, matching this script's
pre-W3 behavior when called with no arguments.)

Shared TS types (ADR-0012 one-home-per-fact, W3): the `LytProgram`
data-shape types (`LytAxis`, `LytTrackShape`, etc.) used to be
duplicated verbatim inside this script's own `render_ts` (the only
consumer, landscape's `lyt-layout.gen.ts`). Now that a second
generated file exists, this script instead emits an `import type
{...} from './lyt-layout-types'` plus a re-export (`export type *`)
into EACH generated file -- the actual interface/union declarations
live once, hand-written, at `frontend/src/state/lyt-layout-types.ts`.
Every existing consumer's import path (`from '../../state/lyt-layout.
gen'`) keeps resolving unchanged, since the re-export makes the types
transitively available there too.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import lyt_ast as ast
import loader
from runner import ENCODINGS_DIR

STATE_DIR = Path(__file__).parent.parent.parent / "frontend" / "src" / "state"

# Landscape's default output path is unchanged from the pre-W3 script
# (kept as its own name, `DEFAULT_OUT`, for backward compatibility with
# existing callers/tests that reference it directly).
DEFAULT_OUT = STATE_DIR / "lyt-layout.gen.ts"
DEFAULT_OUT_PORTRAIT = STATE_DIR / "lyt-layout-portrait.gen.ts"

LAYOUT_FILE = "lengyue_landscape.lyt"
LAYOUT_NAME = "lengyue-landscape"
CLASS_ID = "landscape"

# Reproduced verbatim from emit_mockup.py's own TOGGLE_TARGETS["landscape"]
# table (see that module's docstring for the full corner-menu-affordance
# disclosure) -- W1 only consumes the third tuple element (default_visible).
# Kept as a path-tuple -> bool map, not re-imported from emit_mockup.py
# directly, since that module also carries the (out-of-scope) label/
# release-vs-preserve machinery this script has no use for; duplicating
# just the one fact this emitter needs is more honest than importing a
# generator module built for a different consumer (static HTML) and
# picking one field back out of it.
# LYT toolbar ontology reencode (commissioner-ratified 2026-08-11, ledger
# rows 1930/1931): the side column's V-split shrank from four children
# (A_go/I_engine/A_common/tree-row) to three (A_engine/A_app/tree-row) --
# the tree/panels/preview row's own path shifts from (2, 3, ...) to
# (2, 2, ...) accordingly.
DEFAULT_VISIBLE_BY_PATH: Dict[Tuple[int, ...], bool] = {
    (0,): False,       # boardRail
    (1,): True,        # V-composite (board + info + action rows)
    (2, 0): True,       # A_engine
    (2, 1): True,       # A_app
    (2, 2, 1): True,     # T(CP-*) -- the control-panel black box
    (2, 2, 2): False,    # previewBoard
}

# Reproduced verbatim from emit_mockup.py's own TOGGLE_TARGETS["portrait"]
# table -- same discipline as DEFAULT_VISIBLE_BY_PATH above, one class's
# worth of the one fact this emitter needs. Derived from
# encodings/lengyue_portrait.lyt's own root V(...) child order: boardRail
# (0, toggle-off), A_app (1, formerly A_top -- LYT toolbar ontology
# reencode, 2026-08-11), the board composite V(B, I_board, A_board)
# (2, always visible -- not itself toggleable), A_engine (3, formerly
# I_engine, always visible), and the tree/panels/preview row H(tree,
# T(CP-*), previewBoard) (4) whose own three children are tree (4,0,
# always visible), the control-panel T-node (4,1, always visible), and
# previewBoard (4,2, toggle-off) -- matching TOGGLE_TARGETS["portrait"]'s
# (0,)/(1,)/(2,)/(3,)/(4,1)/(4,2) entries exactly (every path
# TOGGLE_TARGETS doesn't mention is default-visible, per that table's own
# convention). Paths themselves are UNCHANGED from pre-reencode (portrait's
# tree structure needed only a rename, not a reshuffle).
DEFAULT_VISIBLE_BY_PATH_PORTRAIT: Dict[Tuple[int, ...], bool] = {
    (0,): False,      # boardRail
    (1,): True,       # A_app
    (2,): True,       # V-composite (board + info + action rows)
    (3,): True,       # A_engine
    (4, 0): True,      # tree
    (4, 1): True,      # T(CP-*) -- the control-panel black box
    (4, 2): False,     # previewBoard
}


@dataclass(frozen=True)
class Registration:
    """One screen class's full set of build-program inputs -- threaded
    explicitly through `build_program`/`_build_node` rather than read off
    module globals, so a single process can build multiple registrations
    without any global-reassignment footgun (see module docstring)."""

    layout_file: str
    layout_name: str
    class_id: str
    default_visible_by_path: Dict[Tuple[int, ...], bool]
    const_name: str
    default_out: Path


REGISTRATIONS: Dict[str, Registration] = {
    "landscape": Registration(
        layout_file=LAYOUT_FILE,
        layout_name=LAYOUT_NAME,
        class_id=CLASS_ID,
        default_visible_by_path=DEFAULT_VISIBLE_BY_PATH,
        const_name="LYT_LANDSCAPE",
        default_out=DEFAULT_OUT,
    ),
    "portrait": Registration(
        layout_file="lengyue_portrait.lyt",
        layout_name="lengyue-portrait",
        class_id="portrait",
        default_visible_by_path=DEFAULT_VISIBLE_BY_PATH_PORTRAIT,
        const_name="LYT_PORTRAIT",
        default_out=DEFAULT_OUT_PORTRAIT,
    ),
}


def _px(e: ast.Extent, *, where: str) -> float:
    if e.unit != "px":
        raise NotImplementedError(
            f"{where}: expected a resolved px extent, got unit={e.unit!r} (v={e.v}) -- "
            "emit_layout_tree.py's grid mapping only handles the sizing shapes actually "
            "present in encodings/lengyue_landscape.lyt and encodings/lengyue_portrait.lyt; "
            "extend _track_shape_for_child before pointing this generator at a new shape."
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
    override below can be applied only where it was actually derived.
    Class-agnostic -- called against both landscape's and portrait's root
    split, and correctly finds exactly one match in each (verified by
    this module's own test suite)."""
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
    """Ports BOTH cases of emit_mockup.py's `_board_priority_tracks`
    (that function's own ~70-line docstring is the normative derivation
    for the CASE A/B split -- read it in full before touching this
    function). `node` is always the tree's ROOT split (see this module's
    `_build_node` call site) -- the 100vw/100vh constants below are only
    valid when `node` itself is hard-pinned to the full viewport, which
    is true for the root and NOT generally true for a split nested
    deeper in the tree.

    CASE A (`composite.axis != node.axis` -- landscape's H-root/V-
    composite shape): caps the ONE non-board elastic+capped SIBLING's
    track via a `board-priority-clamp` descriptor (unchanged from the
    original W1 version of this function).

    CASE B (`composite.axis == node.axis` -- portrait's V-root/V-
    composite shape): caps the COMPOSITE's OWN track (not a sibling's)
    via a NEW `board-priority-self-clamp` descriptor -- `minmax(0px,
    calc(100<naturalCrossUnit> + fixedSiblingSumPx px))`, no independent
    min/max the way CASE A's clamp has (see
    frontend/src/state/lyt-layout-types.ts's doc-comment on this union
    member for the full CSS-mapping disclosure). `node_cross_unit` is
    the SAME viewport-relative constant emit_mockup.py's CASE A and
    CASE B both key off -- when `composite.axis == node.axis`,
    composite's own cross axis (opposite `composite.axis`) is the same
    axis as node's own cross axis (opposite `node.axis`, which equals
    `composite.axis` by this branch's own condition), so one shared
    derivation correctly serves both branches."""
    board_idx, composite, fixed_sum = match
    out = list(shapes)
    node_cross_unit = "vh" if node.axis == "h" else "vw"
    if composite.axis == node.axis:
        # CASE B: cap composite's OWN track at its natural ceiling.
        out[board_idx] = {
            "kind": "board-priority-self-clamp",
            "naturalCrossUnit": node_cross_unit,
            "fixedSiblingSumPx": fixed_sum,
        }
        return out
    # CASE A: cap the non-board, elastic+capped sibling(s).
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


def _collect_leaf_widgets(slot: ast.Slot) -> List[str]:
    """AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
    lyt-tab-region-consult.md §6.2/§6.4): a structural fold, total over
    Leaf|Split|Exclusive, collecting every LEAF widget id in a subtree in
    document order. Replaces the retired plain-leaf-T assertion's
    one-level-only `c.node.widget` read (see `_build_node`'s Exclusive
    branch below) -- a T-node child no longer has to BE a bare Leaf for
    this emitter to describe it; it only has to be SOME well-typed subtree,
    and this fold walks whatever depth/shape it actually has. For a bare
    Leaf child (every CP-* tab pre-Amendment-6, and still CP-library/
    CP-cards/CP-other today) this returns exactly `[leaf.widget]` --
    byte-identical output to the pre-Amendment-6 one-level read."""
    node = slot.node
    if isinstance(node, ast.Leaf):
        return [node.widget]
    if isinstance(node, ast.Split):
        return [w for c in node.children for w in _collect_leaf_widgets(c)]
    if isinstance(node, ast.Exclusive):
        return [w for c in node.children for w in _collect_leaf_widgets(c)]
    raise TypeError(f"unknown LayoutNode kind: {node!r}")


def _build_node(
    slot: ast.Slot, *, path: Tuple[int, ...], default_visible_by_path: Dict[Tuple[int, ...], bool]
) -> dict:
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
        # AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
        # lyt-tab-region-consult.md §6.2/§6.4/§8.1): the plain-leaf-T
        # assertion this branch used to raise is RETIRED -- a T-node child
        # no longer has to be a bare ast.Leaf. The whole Exclusive node
        # still collapses to ONE synthetic 'blackbox' leaf unconditionally
        # (§8.1's own resolution: "Wave 1 ships solver-side with the marker
        # sitting at the T ... today's behavior, byte-identical" --
        # LytNode.vue's single `#leaf-controlPanel` slot boundary is
        # untouched by this wave regardless of how deep any one tab's own
        # interior is now modeled). `childWidgets` -- documentation/
        # report-table parity only, never read by LytNode.vue's rendering
        # (confirmed against that file's own source: it branches on
        # `node.kind`, never on `childWidgets`) -- is now a genuine
        # structural fold (`_collect_leaf_widgets`, total over
        # Leaf|Split|Exclusive) instead of a one-level `c.node.widget` read,
        # so a composite CP-* tab's interior leaves are still named for
        # documentation purposes, not silently dropped.
        child_widgets = [w for c in node.children for w in _collect_leaf_widgets(c)]
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
                    "presenceDefaultVisible": default_visible_by_path.get(cpath, True),
                    "track": shapes[i],
                    "node": _build_node(child, path=cpath, default_visible_by_path=default_visible_by_path),
                }
            )
        return {"kind": "split", "axis": axis, "gapPx": node.gap_px, "children": children}
    raise TypeError(f"unknown LayoutNode kind at path {path}: {node!r}")


def build_program(
    *,
    layout_file: str = LAYOUT_FILE,
    layout_name: str = LAYOUT_NAME,
    class_id: str = CLASS_ID,
    default_visible_by_path: Dict[Tuple[int, ...], bool] = DEFAULT_VISIBLE_BY_PATH,
) -> dict:
    text = (ENCODINGS_DIR / layout_file).read_text()
    layouts = loader.load_layouts(text)
    slot = layouts[layout_name]
    if not isinstance(slot.node, ast.Split):
        raise TypeError(f"{layout_name}'s root is not a Split: {slot.node!r}")
    root = _build_node(slot, path=(), default_visible_by_path=default_visible_by_path)
    return {"classId": class_id, "root": root}


def build_program_for(registration: Registration) -> dict:
    """Convenience wrapper -- `build_program` keyed off one of
    `REGISTRATIONS`'s entries instead of four separate keyword args."""
    return build_program(
        layout_file=registration.layout_file,
        layout_name=registration.layout_name,
        class_id=registration.class_id,
        default_visible_by_path=registration.default_visible_by_path,
    )


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
    if kind == "board-priority-self-clamp":
        return (
            "{ kind: \"board-priority-self-clamp\", "
            f'naturalCrossUnit: {json.dumps(shape["naturalCrossUnit"])}, '
            f'fixedSiblingSumPx: {shape["fixedSiblingSumPx"]:g} }}'
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


def render_ts(program: dict, *, registration: Registration) -> str:
    lines: List[str] = []
    lines.append("/**")
    lines.append(" * GENERATED FILE — do not hand-edit.")
    lines.append(" * Tool: research/lyt/emit_layout_tree.py")
    lines.append(
        f" * Source encoding: research/lyt/encodings/{registration.layout_file} "
        f"(layout `{registration.layout_name}`)"
    )
    lines.append(
        " * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — "
        "consumed at runtime by LytNode.vue, which realizes each Split as a live CSS "
        "Grid container (roadmap S3, 'layout as data, not template')."
    )
    lines.append(
        " * Disclosed simplification (both classes): the Exclusive (T) control-panel "
        "node is collapsed to a single 'blackbox' leaf (widget id 'controlPanel') "
        "rather than expanded into its five CP-* grid children — see this tool's own "
        "module docstring."
    )
    lines.append(
        " * Data-shape types (LytProgram, LytTrackShape, etc.) are NOT declared here — "
        "see './lyt-layout-types.ts' (hand-written, ADR-0012 one-home-per-fact), "
        "re-exported below."
    )
    lines.append(
        f" * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python "
        f"emit_layout_tree.py --registration {registration.class_id}"
    )
    lines.append(" *")
    lines.append(" * Public Domain (The Unlicense), matching research/lyt/__init__.py's")
    lines.append(" * license line and the umbrella's ADR-0006 per-file convention.")
    lines.append(" */")
    lines.append("")
    # Only `LytProgram` is a VALUE-position type reference below (the
    # `export const LYT_*: LytProgram = ...` annotation) — importing the
    # other nine names too (as a prior build of this emitter did) tripped
    # `vue-tsc -b`'s `noUnusedLocals` (TS6196) on every one of them, since
    # an `export type { X } from 'Y'` re-export is NOT a usage of a
    # separately-imported `X` in TS's own accounting. The re-export block
    # below carries all ten regardless — that is what actually republishes
    # them under this file's own import path for existing consumers.
    lines.append("import type { LytProgram } from './lyt-layout-types';")
    lines.append("")
    lines.append("export type {")
    lines.append("  LytAxis,")
    lines.append("  LytDomain,")
    lines.append("  LytFacet,")
    lines.append("  LytLeafNode,")
    lines.append("  LytBlackboxNode,")
    lines.append("  LytTrackShape,")
    lines.append("  LytSplitNode,")
    lines.append("  LytNodeData,")
    lines.append("  LytChild,")
    lines.append("  LytProgram,")
    lines.append("} from './lyt-layout-types';")
    lines.append("")
    lines.append(f"export const {registration.const_name}: LytProgram = {{")
    lines.append(f'  classId: {json.dumps(program["classId"])},')
    lines.append(f'  root: {_ts_node(program["root"], "  ")},')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser_ = argparse.ArgumentParser(description=__doc__)
    parser_.add_argument(
        "--registration",
        choices=sorted(REGISTRATIONS),
        default="landscape",
        help="which screen class to compile (default: landscape, matching this script's pre-W3 behavior)",
    )
    parser_.add_argument("--out", type=Path, default=None, help="output .ts path (default: the registration's own)")
    args = parser_.parse_args(argv)

    registration = REGISTRATIONS[args.registration]
    out = args.out if args.out is not None else registration.default_out

    program = build_program_for(registration)
    text = render_ts(program, registration=registration)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(f"[emit_layout_tree] wrote {out} (registration={args.registration})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
