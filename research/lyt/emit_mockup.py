"""research/lyt/emit_mockup.py

Commission: lyt-cleanroom-mockups (ledger row 1703, worktree
lyt-cleanroom-mockups). "Can we try to produce something that doesn't
look amateurish, now that we can consolidate all widgets by function and
build something hierarchically correct?" -- static HTML/CSS mockups of
the clean-room LengYue layout (`encodings/lengyue_landscape.lyt` /
`encodings/lengyue_portrait.lyt`, themselves a transcription of
`layout-language-consult.md` SS5.4/SS5.5), one page per screen class, for
the commissioner to judge from screenshots. NOT Vue, NOT wired to the
app -- `frontend/` is untouched, per the umbrella's scope discipline.

Two commissioner amendments landed while this script was being designed
and are both incorporated (there was no code to convert -- this is the
first draft):

1. The page must NOT be absolute-positioned solved rectangles. It is
   built as the LYT tree realized directly in CSS -- each Split/Exclusive
   node becomes a live CSS Grid container the browser's own layout engine
   solves, so the mockup behaves correctly under a real window resize.
   The CP-SAT-solved rectangles (`compiler.solve_lexicographic`, reused
   verbatim from `runner.py` / `emit_ts.py` -- no second solving logic)
   move to a VERIFICATION role: a toggleable debug overlay (default off)
   draws them as outlines over the live grid so solve-vs-CSS agreement is
   visible on demand, instead of being the page's own positioning
   mechanism.
2. The CSS realization is GRID, not flex -- one grid per LYT inner node
   (H/V/T), nested to the same depth as the tree, never flattening
   sibling subtrees into a shared grid (that would let unrelated tracks
   couple, breaking the tree's own independence-of-subtrees semantics).

LYT -> CSS Grid mapping table (the second amendment's required
deliverable; also restated in the build report):

  H node (axis='h', partitions width):
    display:grid; grid-auto-flow:column;
    grid-template-columns:<one track per child, in child order>;
    grid-template-rows:1fr;
  V node (axis='v', partitions height): the transpose --
    grid-auto-flow:row; grid-template-rows:<tracks>; grid-template-columns:1fr.
    Grid's own default `align-items`/`justify-items: stretch` already
    gives every child the parent's FULL extent on the cross axis for
    free -- exactly LYT's H/V cross-axis-exact-fill semantics (SS4.1),
    with no extra CSS needed for it.
  T node (Exclusive): realized as a tab strip (auto-height row) + a
    single active body (1fr row) -- `display:grid;
    grid-template-rows:auto 1fr; grid-template-columns:1fr;`. This is a
    disclosed simplification of "every child receives the parent's whole
    rectangle" (SS4.1 line 297-299): rather than literally stacking all
    six children in one shared grid cell (only one ever visible), the
    five non-active children are rendered as tab LABELS only, not
    duplicate body DOM -- they are the census's own declared BLACK BOX,
    so a duplicate placeholder body per inactive tab adds DOM without
    adding honest information. The exclusive/shared-rectangle property
    the law cares about (no child ever gets a size the others don't
    share) still holds: the body area is sized once, by the T node's own
    track in ITS parent, never by whichever child is active.
  Per-child track (the sizing shapes actually present in the two
  clean-room encodings -- anything else fails loudly rather than
  guessing a mapping nobody has adjudicated, see `_track_for_child`):
    fixed        (min=pref=max, e.g. `{28px}`)      -> "<v>px"
    elastic      (max=inf, pref is Nfr)              -> "minmax(<min>px, Nfr)"
    elastic+cap  (max=Xpx (or px+ch sum), pref Nfr)  -> "minmax(<min>px, Xpx)"
      -- CSS `minmax()` takes only two arguments; there is no third slot
      for the LYT `pref` fr-weight once a hard `max` is also declared.
      The hard cap (LYT max is a genuine constraint, SS4.2) wins over the
      soft target (LYT pref is an OBJECTIVE term the solver reaches for,
      not a constraint) -- so the fr weight is dropped for this shape,
      not the cap. This is the one shape where the live grid and the
      CP-SAT solve can genuinely diverge (the solver's lexicographic
      objective can leave the capped track short of its own max when a
      higher-priority stage needs the room; the grid's `minmax` always
      grows a non-flex track to its max before any `fr` track gets
      anything) -- exactly the kind of disagreement the debug overlay
      exists to surface, not hide.
  Exclusive (T) node's OWN track floor: loader.py leaves an omitted T
  'min' at a disclosed 0px default and lets the compiler derive the real
  one (componentwise max of the T's children's own declared min, both
  axes -- compiler.py's `_constrain` Exclusive branch, lines 360-379).
  `_exclusive_derived_min_px` below reproduces that exact derivation so
  the T node's track in ITS parent carries the same floor the solver
  enforces, not the loader's un-derived 0px.
  Board leaf (aspect-locked): grid's default stretch would force it to
  the parent's full cross-axis extent, which fights `aspect-ratio`. The
  ITEM (not the track) gets `aspect-ratio:1/1`, a `justify-self`/
  `align-self:center` override on whichever axis is this leaf's cross
  axis, and `max-width/max-height:100%` so it never overflows its track.
  This is the CSS-grid analog of `compiler.py`'s own disclosed,
  one-directional cross-axis relaxation for aspect leaves (README.md
  "Honest caveat on the 'infeasibility proof' results") -- both this
  mockup and the solver have to bend the same literal exact-cross-fill
  rule to let a square board coexist with `aspect`, and both name the
  bend rather than silently absorbing it.

Judgment calls beyond the two amendments (disclosed here and in the
build report; none of them touch a solved rectangle, the census
assignment, or add/remove a widget -- the commission's own STOP-and-
report boundary):
  - Corner presence-menu targets and their release/preserve choice: the
    two `.lyt` source files declare only default (`@fixed`) presence --
    neither encodes an `@toggle`. The commissioned corner menu is an
    ADDED UI affordance, not a rendering of a declared presence. Targets
    chosen: the five (four in portrait) top-level consolidated groups
    that already get the census's A/B/C/D-style visual grouping. Board
    and the tree/control-panel tab group use `preserve` (CSS
    `visibility:hidden` -- the codebase's own SetupToolPalette
    precedent, layout-language-consult.md line 213-214); the three
    action/info strips use `release` (CSS `display:none`, space
    redistributes to the grid's other tracks) -- matching the census's
    own sidebar-collapse-rail / board-tree-controls-toggle family.
  - Debug-class (C) widgets (autoNav, popStress, clearCache dev-only
    per the census, folded into `A_common`'s own comment "`@dev C
    strip`" in the .lyt source) render as a single relegated, inert
    pill ("Debug (3)") rather than three separate buttons on the main
    row -- satisfying "collapsed/menu-relegated form, not on the main
    surface" without adding a second interactive element beyond the
    one the commission names (the corner menu).
  - Theme: DARK only. theme.css's own docstring calls dark "the
    long-standing default"; cluster is skipped for scope (this mockup
    renders one coherent look rather than 4 file variants across 2
    classes x 2 themes). Flagged rather than silently assumed, since
    the commission's own phrasing ("both themes if cheap, else the
    cluster default -- say which") is ambiguous about whether "cluster"
    names the fallback theme or is a slip for "just default" -- this is
    the "say which" the brief asks for.
  - Board leaf content: plain black/white circles, not the app's
    engine/constants.ts domain palette (frontend/CLAUDE.md places
    Go-domain colors out of the chrome-substrate's own scope; this
    script does not import application code at all, per the umbrella's
    scope discipline).
  - T-node tabs are NOT click-interactive (only the presence-menu is,
    per the commission's own "This is the ONE interactive element").
    Tree is shown active by construction (first child, `tree[board,
    info+action]` in both encodings); the five CP-* tabs render as
    inert labels.

Regeneration command (also written into each generated page's own
header comment):

    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_mockup.py

(writes research/lyt/mockups/landscape.html and
research/lyt/mockups/portrait.html.)

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import lyt_ast as ast
import loader
from compiler import solve_lexicographic
from emit_ts import _find_registration, _slots_from_result
from runner import ENCODINGS_DIR, _gather_reach_preferred_widgets

REGISTRATION_NAME = "lengyue_landscape+portrait"
OUT_DIR = Path(__file__).parent / "mockups"

# Representative sizes the debug overlay solves against, per class -- the
# commission's own screenshot sizes (1920x1080 landscape, 1080x1920
# portrait, plus 2560x1440), reusing runner.py's SCREEN_SIZES labels so
# the overlay's `label` field matches the CLI runner's own vocabulary.
OVERLAY_SIZES: Dict[str, List[Tuple[str, int, int]]] = {
    "landscape": [("1920x1080", 1920, 1080), ("2560x1440", 2560, 1440)],
    "portrait": [("1080x1920-portrait", 1080, 1920)],
}

# path-tuple (child index chain from the class's root Split) -> (label, presence).
# See the module docstring's "Corner presence-menu targets" paragraph.
TOGGLE_TARGETS: Dict[str, Dict[Tuple[int, ...], Tuple[str, str]]] = {
    "landscape": {
        (0,): ("Board", "preserve"),
        (1, 0): ("Go Actions", "release"),
        (1, 1): ("Engine Info", "release"),
        (1, 2): ("Common Actions", "release"),
        (1, 3): ("Tree & Panels", "preserve"),
    },
    "portrait": {
        (0,): ("Top Actions", "release"),
        (1,): ("Board", "preserve"),
        (2,): ("Engine Info", "release"),
        (3,): ("Tree & Panels", "preserve"),
    },
}

TAB_LABELS: Dict[str, str] = {
    "tree": "Tree",
    "CP-library": "Library",
    "CP-cards": "Cards",
    "CP-settings": "Settings",
    "CP-analysis": "Analysis",
    "CP-other": "Other",
}

# Widget id -> honest-proxy inner HTML (fixed sample content sized to the
# slot's own reservation, never content that would vary -- per the
# commission's own "LATENCY '40 ms', never content that would vary").
# The board leaf ('B') is handled separately by `_board_html` since it is
# not text content. Only the T-node's own children (tree, CP-*) live here
# -- the single-line info/actions strips are `ROW_WIDGETS` below instead,
# so their optional corner-menu caption can be spliced into the SAME flex
# row rather than overlapping the content vertically (see that dict's
# own docstring).
WIDGET_CONTENT: Dict[str, str] = {
    "tree": (
        '<div class="tree-body">'
        '<div class="tree-row" style="padding-left:0">Game Tree</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 1 (B)</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 2 (W)</div>'
        '<div class="tree-row" style="padding-left:24px">│ ├ Variation A</div>'
        '<div class="tree-row" style="padding-left:24px">│ └ Variation B</div>'
        '<div class="tree-row" style="padding-left:12px">└ Move 3 (B) — current</div>'
        "</div>"
    ),
    "CP-library": '<div class="blackbox-body">Library (control-panel tab — black box, SS2 census)</div>',
    "CP-cards": '<div class="blackbox-body">Cards (control-panel tab — black box, SS2 census)</div>',
    "CP-settings": '<div class="blackbox-body">Settings (control-panel tab — black box, SS2 census)</div>',
    "CP-analysis": '<div class="blackbox-body">Analysis (control-panel tab — black box, SS2 census)</div>',
    "CP-other": '<div class="blackbox-body">Other (control-panel tab — black box, SS2 census)</div>',
}

# Row-shaped leaf widgets (single-line info/actions strips): widget id ->
# (row CSS class, inner content WITHOUT the wrapping row div). Kept
# separate from WIDGET_CONTENT so `render_leaf` can splice an optional
# corner-menu caption in as a LEADING SEGMENT of the same flex row --
# these leaves have horizontal room to spare (their own reservation is a
# fixed HEIGHT, elastic width), so the caption lives there instead of
# overlapping the content vertically (the earlier position:absolute
# overlay label this replaced did exactly that overlap on every
# fixed-height strip -- see the build report's first-draft screenshot
# finding).
ROW_WIDGETS: Dict[str, Tuple[str, str]] = {
    "I_board": (
        "info-row",
        "<span>Move 47</span>"
        "<span>● Black — Alice (2400)</span>"
        "<span>○ White — Bob (2350)</span>"
        "<span>Caps B 3 · W 5</span>",
    ),
    "A_board": (
        "actions-row",
        '<button class="btn">Pass</button>'
        '<button class="btn">|&lt;</button>'
        '<button class="btn">&lt;</button>'
        '<button class="btn">&gt;</button>'
        '<button class="btn">&gt;|</button>'
        '<button class="btn">Annotate</button>'
        '<button class="btn">Setup</button>',
    ),
    "A_go": (
        "actions-row",
        '<button class="btn">Mint Card</button>'
        '<button class="btn">Learn Path</button>'
        '<button class="btn">Play</button>'
        '<button class="btn">Match</button>'
        '<button class="btn">Load SGF</button>'
        '<button class="btn">Save SGF</button>',
    ),
    "I_engine": (
        "info-row",
        "<span>KataGo v1.0.27</span>"
        "<span>Connected</span>"
        "<span>Model: b18-8192</span>"
        "<span>1200 pps</span>"
        "<span>40 ms</span>"
        "<span>Queue 2</span>",
    ),
    "A_common": (
        "actions-row",
        '<button class="btn">Connect</button>'
        '<button class="btn">Sliders</button>'
        '<button class="btn debug-pill" title="Autonav, popover test, clear cache (dev-only, C-domain)">Debug (3)</button>',
    ),
    "A_top": (
        "actions-row actions-row-wrap",
        '<button class="btn">Mint</button>'
        '<button class="btn">Learn</button>'
        '<button class="btn">Play</button>'
        '<button class="btn">Match</button>'
        '<button class="btn">Load</button>'
        '<button class="btn">Save</button>'
        '<button class="btn">Connect</button>'
        '<button class="btn">Sliders</button>'
        '<button class="btn debug-pill" title="Autonav, popover test, clear cache (dev-only, C-domain)">Debug (3)</button>',
    ),
}



def _board_html() -> str:
    return (
        '<div class="board-square">'
        '<div class="board-grid"></div>'
        '<div class="board-stone board-stone-b" style="left:22%;top:30%;"></div>'
        '<div class="board-stone board-stone-w" style="left:35%;top:45%;"></div>'
        '<div class="board-stone board-stone-b" style="left:50%;top:38%;"></div>'
        '<div class="board-stone board-stone-w" style="left:44%;top:58%;"></div>'
        "</div>"
    )


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# ---------------------------------------------------------------------------
# LYT Sizing -> CSS grid track (see module docstring's mapping table).
# ---------------------------------------------------------------------------


def _px(e: ast.Extent, *, where: str) -> float:
    if e.unit != "px":
        raise NotImplementedError(
            f"{where}: expected a resolved px extent, got unit={e.unit!r} (v={e.v}) -- "
            "emit_mockup.py's grid mapping only handles the sizing shapes actually "
            "present in encodings/lengyue_landscape.lyt / lengyue_portrait.lyt; "
            "extend _track_for_child before pointing this generator at a new shape."
        )
    return e.v


def _is_fixed(sizing: ast.Sizing) -> bool:
    if sizing.max == "inf":
        return False
    if sizing.min.unit != "px" or sizing.pref.unit != "px" or sizing.max.unit != "px":
        return False
    return sizing.min.v == sizing.pref.v == sizing.max.v


def _track_for_child(sizing: ast.Sizing, *, floor_override_px: Optional[float], where: str) -> str:
    if _is_fixed(sizing):
        return f"{_px(sizing.pref, where=where):g}px"
    min_px = floor_override_px if floor_override_px is not None else _px(sizing.min, where=where)
    if sizing.max == "inf":
        if sizing.pref.unit == "fr":
            return f"minmax({min_px:g}px, {sizing.pref.v:g}fr)"
        raise NotImplementedError(f"{where}: uncapped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")
    max_px = _px(sizing.max, where=where)
    if sizing.pref.unit == "fr":
        # Elastic + capped: the hard `max` wins over the soft `pref` fr
        # weight (module docstring's mapping table, "elastic+cap" row).
        return f"minmax({min_px:g}px, {max_px:g}px)"
    raise NotImplementedError(f"{where}: capped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")


def _exclusive_derived_min_px(excl: ast.Exclusive, *, where: str) -> float:
    """compiler.py's `_constrain` Exclusive branch (lines 360-379):
    a T node's own structural min is the componentwise max of its
    children's declared min, on both axes. Reproduced here so this
    mockup's grid track for a T node's own slot carries the same floor
    the solver enforces, not the loader's un-derived 0px default."""
    mins = [_px(c.sizing.min, where=f"{where}/child") for c in excl.children]
    return max(mins) if mins else 0.0


# ---------------------------------------------------------------------------
# Tree -> HTML/CSS grid.
# ---------------------------------------------------------------------------


def render_node(
    slot: ast.Slot,
    *,
    path: Tuple[int, ...],
    class_id: str,
    extra_style: str = "",
    extra_data: str = "",
    extra_class: str = "",
    caption: Optional[str] = None,
) -> str:
    node = slot.node
    if isinstance(node, ast.Leaf):
        return render_leaf(node, extra_style=extra_style, extra_data=extra_data, extra_class=extra_class, caption=caption)
    if isinstance(node, ast.Split):
        return render_split(
            node, path=path, class_id=class_id, extra_style=extra_style, extra_data=extra_data, extra_class=extra_class, caption=caption
        )
    if isinstance(node, ast.Exclusive):
        return render_exclusive(
            node, path=path, class_id=class_id, extra_style=extra_style, extra_data=extra_data, extra_class=extra_class, caption=caption
        )
    raise TypeError(f"unknown LayoutNode kind at path {path}: {node!r}")


def _child_wrap(
    child: ast.Slot, *, cpath: Tuple[int, ...], class_id: str, axis: str, track_prop: str
) -> Tuple[str, str, str, Optional[str]]:
    """Returns (extra_style, extra_data, extra_class, caption) for a Split
    child, folding in the board-leaf aspect override and any corner-menu
    toggle target at this path. `track_prop` (e.g. "--track-1") is the
    CSS custom property this child's OWN track is parameterized by in its
    parent's grid-template -- see render_split's own comment for why a
    'release' toggle needs it (collapsing the track itself, not just
    hiding the item) to avoid mis-tracking the remaining siblings."""
    parts = ["min-width:0", "min-height:0"]
    is_board_leaf = isinstance(child.node, ast.Leaf) and child.node.widget == "B"
    if is_board_leaf:
        parts.append("justify-self:center" if axis == "v" else "align-self:center")
        parts += ["aspect-ratio:1/1", "max-width:100%", "max-height:100%"]
    extra_style = ";".join(parts) + ";"

    toggle = TOGGLE_TARGETS.get(class_id, {}).get(cpath)
    if toggle:
        label, presence = toggle
        extra_data = f'data-toggle-id="{_slug(label)}" data-presence="{presence}"'
        if presence == "release":
            extra_data += f' data-track-prop="{track_prop}"'
        extra_class = "lyt-group"
        caption: Optional[str] = label
    else:
        extra_data = ""
        extra_class = ""
        caption = None
    return extra_style, extra_data, extra_class, caption


def render_split(
    node: ast.Split, *, path: Tuple[int, ...], class_id: str, extra_style: str, extra_data: str, extra_class: str, caption: Optional[str]
) -> str:
    axis = node.axis
    tracks: List[str] = []
    kids: List[str] = []
    for i, child in enumerate(node.children):
        cpath = path + (i,)
        floor = _exclusive_derived_min_px(child.node, where=str(cpath)) if isinstance(child.node, ast.Exclusive) else None
        track_value = _track_for_child(child.sizing, floor_override_px=floor, where=str(cpath))
        # Every track is parameterized by its own CSS custom property,
        # `var(--track-N, <computed value>)`, rather than the bare
        # computed value -- this is what lets the 'release' toggle
        # collapse EXACTLY this track to 0px at runtime (see the JS
        # below) without touching the template string or any sibling's
        # track. `--track-N` is scoped to THIS grid container's own
        # inline style (set via `parentElement.style.setProperty` from
        # the toggled child), so reusing bare index-based names across
        # different nesting levels is safe -- each grid container reads
        # only its own inline declarations first.
        track_prop = f"--track-{i}"
        tracks.append(f"var({track_prop}, {track_value})")
        c_style, c_data, c_class, c_caption = _child_wrap(child, cpath=cpath, class_id=class_id, axis=axis, track_prop=track_prop)
        # Explicit placement (not implicit grid-auto-flow order): a
        # corner-menu 'release' toggle sets one sibling's own box to
        # display:none, which removes it from the auto-placement item
        # list entirely -- with only implicit ordering, the REMAINING
        # siblings would then shift into the wrong explicit tracks (the
        # bug this comment replaces: toggling off a 28px leaf collapsed
        # the T node's own big elastic track to 28px, because the T leaf
        # got auto-placed into the now-vacant 3rd explicit track instead
        # of its own 4th one). Pinning every child to its OWN track index
        # regardless of which siblings are present, PLUS collapsing that
        # exact track's own custom property to 0px (not just hiding the
        # item), is what makes 'release' behave as documented: the
        # vacated track's space is reclaimed because the track itself
        # shrinks to nothing, not because siblings renumber into it.
        if axis == "h":
            c_style = f"grid-column:{i + 1}/{i + 2};grid-row:1;{c_style}"
        else:
            c_style = f"grid-row:{i + 1}/{i + 2};grid-column:1;{c_style}"
        kids.append(render_node(child, path=cpath, class_id=class_id, extra_style=c_style, extra_data=c_data, extra_class=c_class, caption=c_caption))

    if axis == "h":
        template = f"grid-auto-flow:column;grid-template-columns:{' '.join(tracks)};grid-template-rows:1fr;"
    else:
        template = f"grid-auto-flow:row;grid-template-rows:{' '.join(tracks)};grid-template-columns:1fr;"
    style = f"display:grid;{template}column-gap:0px;row-gap:0px;{extra_style}"
    # No text caption at the Split level: a Split group's toggle target in
    # this mockup (only "Board", the V-wrapper of B/I_board/A_board) has no
    # single row to splice a label into without either overlapping the
    # board square or reserving extra space that would drift the group's
    # box away from the solved rect the debug overlay draws. The border
    # (extra_class="lyt-group") plus the board's own unmistakable content
    # already satisfy "visually distinct region" without a redundant label.
    return f'<div class="lyt-node lyt-split lyt-{axis} {extra_class}" {extra_data} style="{style}">{"".join(kids)}</div>'


def render_exclusive(
    node: ast.Exclusive, *, path: Tuple[int, ...], class_id: str, extra_style: str, extra_data: str, extra_class: str, caption: Optional[str]
) -> str:
    tabs: List[str] = []
    body = ""
    for i, child in enumerate(node.children):
        if not isinstance(child.node, ast.Leaf):
            raise NotImplementedError(f"T-node child at {path + (i,)} is not a leaf (unsupported by this mockup's T mapping): {child.node!r}")
        widget = child.node.widget
        label = TAB_LABELS[widget]
        active = i == 0
        cls = "lyt-tab active" if active else "lyt-tab"
        tabs.append(f'<div class="{cls}">{html.escape(label)}</div>')
        if active:
            content = _board_html() if widget == "B" else WIDGET_CONTENT[widget]
            body = f'<div class="lyt-tabbody">{content}</div>'
    style = f"display:grid;grid-template-rows:auto 1fr;grid-template-columns:1fr;column-gap:0px;row-gap:0px;{extra_style}"
    # Caption spliced into the SAME row as the tab labels (horizontal room
    # to spare at 24px fixed height), not a separate absolutely-positioned
    # div -- see ROW_WIDGETS' own docstring for why the overlay label this
    # replaced was a defect.
    cap_html = f'<div class="lyt-tab-caption">{html.escape(caption)}</div>' if caption else ""
    return (
        f'<div class="lyt-node lyt-exclusive {extra_class}" {extra_data} style="{style}">'
        f'<div class="lyt-tabstrip">{cap_html}{"".join(tabs)}</div>{body}</div>'
    )


def render_leaf(node: ast.Leaf, *, extra_style: str, extra_data: str, extra_class: str, caption: Optional[str]) -> str:
    if node.widget == "B":
        content = _board_html()
    elif node.widget in ROW_WIDGETS:
        row_class, inner = ROW_WIDGETS[node.widget]
        cap_html = f'<span class="row-caption">{html.escape(caption)}</span>' if caption else ""
        content = f'<div class="{row_class}">{cap_html}{inner}</div>'
    else:
        content = WIDGET_CONTENT[node.widget]
    style = f"width:100%;height:100%;{extra_style}"
    return f'<div class="lyt-node lyt-leaf {extra_class}" {extra_data} style="{style}">{content}</div>'


# ---------------------------------------------------------------------------
# Page assembly.
# ---------------------------------------------------------------------------

# Theme tokens copied from frontend/src/assets/css/theme.css's
# `[data-theme="dark"]` block plus the theme-invariant `:root` scale
# tokens this mockup actually uses -- dark only, see module docstring's
# "Theme" judgment-call paragraph.
_STYLE = """
:root {
  --surface-0: #000;
  --surface-1: #111;
  --surface-2: #1a1a1a;
  --surface-3: #222;
  --border-1: #2a2a2a;
  --border-2: #333;
  --border-3: #555;
  --text-0: #fff;
  --accent-primary: #4aaef0;
  --state-attention: #ff4a4a;
  --space-tight: 4px;
  --space-default: 8px;
  --space-medium: 12px;
  --text-tiny: 9px;
  --text-emphasis: 12px;
  --text-heading: 16px;
  --radius-default: 3px;
  --radius-circle: 50%;
  --tracking-default: 0.1em;
  --z-popover: 10;
  --z-affordance: 50;
  --z-overlay: 99999;
}
html, body {
  margin: 0; padding: 0; height: 100%;
  background: var(--surface-0); color: var(--text-0);
  font-family: system-ui, sans-serif; font-size: var(--text-emphasis);
  overflow: hidden;
}
.lyt-node { box-sizing: border-box; }
.lyt-group {
  border: 1px solid var(--border-1);
  background: var(--surface-1);
  padding: var(--space-tight);
  position: relative;
}
.row-caption {
  font-size: var(--text-tiny); letter-spacing: var(--tracking-default);
  text-transform: uppercase; color: var(--text-0); flex: 0 0 auto;
  padding-right: var(--space-tight); border-right: 1px solid var(--border-2);
  margin-right: var(--space-tight);
}
.lyt-leaf { position: relative; }
.info-row, .actions-row {
  display: flex; align-items: center; height: 100%;
  box-sizing: border-box; padding: 0 var(--space-tight);
  gap: var(--space-default); overflow-x: auto; white-space: nowrap;
}
.actions-row-wrap { gap: var(--space-tight); }
.info-row span { color: var(--text-0); font-size: var(--text-emphasis); }
.btn {
  background: var(--surface-3); border: 1px solid var(--border-2);
  color: var(--text-0); border-radius: var(--radius-default);
  padding: 0 var(--space-default); height: 24px; min-width: 24px;
  font-size: var(--text-emphasis); display: inline-flex; align-items: center;
  justify-content: center; flex: 0 0 auto;
}
.debug-pill { background: var(--surface-2); border-color: var(--border-1); }
.board-square {
  width: 100%; height: 100%; position: relative;
  background: var(--surface-2); border: 1px solid var(--border-2);
  box-sizing: border-box;
}
.board-grid {
  position: absolute; inset: 5%;
  background-image:
    repeating-linear-gradient(var(--border-2) 0 1px, transparent 1px 5.5556%),
    repeating-linear-gradient(90deg, var(--border-2) 0 1px, transparent 1px 5.5556%);
}
.board-stone {
  position: absolute; width: 5%; height: 5%; border-radius: var(--radius-circle);
  transform: translate(-50%, -50%);
}
.board-stone-b { background: #000; border: 1px solid #444; }
.board-stone-w { background: #fff; border: 1px solid #999; }
.lyt-tabstrip {
  display: flex; height: 24px; box-sizing: border-box;
  border-bottom: 1px solid var(--border-2); overflow-x: auto; white-space: nowrap;
}
.lyt-tab-caption {
  padding: 0 var(--space-default); display: flex; align-items: center; flex: 0 0 auto;
  font-size: var(--text-tiny); letter-spacing: var(--tracking-default);
  text-transform: uppercase; color: var(--text-0);
  border-right: 1px solid var(--border-2); box-sizing: border-box;
}
.lyt-tab {
  padding: 0 var(--space-default); display: flex; align-items: center; flex: 0 0 auto;
  font-size: var(--text-emphasis); color: var(--text-0);
  border-right: 1px solid var(--border-1); box-sizing: border-box;
}
.lyt-tab.active { background: var(--surface-2); border-bottom: 2px solid var(--accent-primary); }
.lyt-tabbody, .blackbox-body { padding: var(--space-tight); overflow: auto; color: var(--text-0); }
.tree-row { color: var(--text-0); font-size: var(--text-emphasis); white-space: nowrap; }
#lyt-menu-btn {
  position: fixed; right: 8px; bottom: 8px; width: 28px; height: 28px;
  z-index: var(--z-affordance); background: var(--surface-3);
  border: 1px solid var(--border-2); color: var(--text-0);
  border-radius: var(--radius-default); font-size: var(--text-heading);
  line-height: 1; cursor: pointer;
}
#lyt-menu-popover {
  position: fixed; right: 8px; bottom: 42px; z-index: var(--z-popover);
  background: var(--surface-0); border: 1px solid var(--border-2);
  padding: var(--space-medium); min-width: 220px; color: var(--text-0);
}
.lyt-menu-title { font-size: var(--text-emphasis); color: var(--text-0); margin-bottom: var(--space-tight); }
.lyt-menu-row {
  display: flex; align-items: center; gap: var(--space-tight);
  min-height: 24px; color: var(--text-0); font-size: var(--text-emphasis);
}
.lyt-menu-row input[type="checkbox"] { width: 16px; height: 16px; }
.lyt-overlay-status { font-size: var(--text-tiny); color: var(--text-0); margin-top: var(--space-tight); }
#lyt-overlay-layer { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-overlay); }
.lyt-overlay-rect { position: absolute; border: 1px solid var(--state-attention); background: transparent; box-sizing: border-box; }
.lyt-overlay-tag { position: absolute; top: 0; left: 0; font-size: var(--text-tiny); color: var(--state-attention); background: var(--surface-0); padding: 0 2px; }
"""

# Minimal inline JS -- the presence-menu (open/close, per-panel toggle)
# and the debug overlay (draw/clear solved rects for the current window
# size). Per the commission: "This is the ONE interactive element."
_SCRIPT = """
(function () {
  var btn = document.getElementById('lyt-menu-btn');
  var pop = document.getElementById('lyt-menu-popover');
  btn.addEventListener('click', function () { pop.hidden = !pop.hidden; });

  document.querySelectorAll('#lyt-menu-popover input[data-toggle-for]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var id = cb.getAttribute('data-toggle-for');
      var el = document.querySelector('[data-toggle-id="' + id + '"]');
      if (!el) return;
      var presence = el.getAttribute('data-presence');
      if (presence === 'preserve') {
        el.style.visibility = cb.checked ? '' : 'hidden';
      } else {
        // 'release': collapse THIS child's own grid track (a CSS custom
        // property on the PARENT grid container, see emit_mockup.py's
        // render_split for why -- the parent's grid-template references
        // var(--track-N, <original>), so removing the override restores
        // the original track size and setting it to 0px collapses only
        // this one track, genuinely freeing the space for siblings
        // rather than leaving a blank gap or mis-tracking them).
        var trackProp = el.getAttribute('data-track-prop');
        if (trackProp && el.parentElement) {
          if (cb.checked) {
            el.parentElement.style.removeProperty(trackProp);
          } else {
            el.parentElement.style.setProperty(trackProp, '0px');
          }
        }
        el.style.display = cb.checked ? '' : 'none';
      }
    });
  });

  var overlayData = JSON.parse(document.getElementById('lyt-solved-data').textContent);
  var overlayToggle = document.getElementById('lyt-overlay-toggle');
  var overlayLayer = document.getElementById('lyt-overlay-layer');
  var overlayStatus = document.getElementById('lyt-overlay-status');

  function drawOverlay() {
    overlayLayer.innerHTML = '';
    var w = window.innerWidth, h = window.innerHeight;
    var match = null;
    for (var i = 0; i < overlayData.length; i++) {
      if (overlayData[i].wPx === w && overlayData[i].hPx === h) { match = overlayData[i]; break; }
    }
    if (!match) {
      overlayStatus.textContent = 'no solve for ' + w + 'x' + h;
      return;
    }
    if (match.status !== 'OPTIMAL' && match.status !== 'FEASIBLE') {
      overlayStatus.textContent = match.label + ': ' + match.status;
      return;
    }
    overlayStatus.textContent = match.label + ' (' + match.status + ')';
    Object.keys(match.slots).forEach(function (widget) {
      var r = match.slots[widget];
      var div = document.createElement('div');
      div.className = 'lyt-overlay-rect';
      div.style.left = r.x + 'px';
      div.style.top = r.y + 'px';
      div.style.width = r.w + 'px';
      div.style.height = r.h + 'px';
      var tag = document.createElement('div');
      tag.className = 'lyt-overlay-tag';
      tag.textContent = widget;
      div.appendChild(tag);
      overlayLayer.appendChild(div);
    });
  }

  overlayToggle.addEventListener('change', function () {
    if (overlayToggle.checked) { drawOverlay(); } else { overlayLayer.innerHTML = ''; overlayStatus.textContent = ''; }
  });
  window.addEventListener('resize', function () { if (overlayToggle.checked) drawOverlay(); });
})();
"""

REGEN_COMMAND = "cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_mockup.py"


def load_class_slots() -> Tuple["object", Dict[str, ast.Slot]]:
    reg = _find_registration(REGISTRATION_NAME)
    layouts: Dict[str, ast.Slot] = {}
    for f in reg.files:
        text = (ENCODINGS_DIR / f).read_text()
        layouts.update(loader.load_layouts(text, waivers=reg.waivers))
    return reg, layouts


def build_overlay_data(reg, layouts: Dict[str, ast.Slot], class_id: str, *, time_limit_s: float = 20.0) -> List[dict]:
    layout_name = reg.layout_by_class[class_id]
    slot = layouts[layout_name]
    reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
    out: List[dict] = []
    for label, w, h in OVERLAY_SIZES[class_id]:
        result = solve_lexicographic(
            slot, class_id=class_id, w_px=w, h_px=h, board_widget=reg.board_widget, reach_preferred_widgets=reach, time_limit_s=time_limit_s
        )
        slots = _slots_from_result(result) if result.status in ("OPTIMAL", "FEASIBLE") else {}
        out.append({"label": label, "wPx": w, "hPx": h, "status": result.status, "slots": slots})
    return out


def build_html_for_class(class_id: str, root_slot: ast.Slot, overlay_data: List[dict]) -> str:
    body_html = render_node(root_slot, path=(), class_id=class_id, extra_style="width:100%;height:100%;")
    menu_items = TOGGLE_TARGETS.get(class_id, {})
    checklist_html = "".join(
        f'<label class="lyt-menu-row"><input type="checkbox" data-toggle-for="{_slug(label)}" checked> {html.escape(label)}</label>'
        for (label, _presence) in menu_items.values()
    )
    overlay_json = json.dumps(overlay_data)
    title = f"LengYue clean-room mockup — {class_id}"
    return f"""<!doctype html>
<!--
  GENERATED FILE -- do not hand-edit.
  Tool: research/lyt/emit_mockup.py
  Source encodings: research/lyt/encodings/lengyue_landscape.lyt,
  research/lyt/encodings/lengyue_portrait.lyt (layout `lengyue-{class_id}`).
  Regenerate: {REGEN_COMMAND}
  Public Domain (The Unlicense), matching research/lyt/__init__.py's
  license line and the umbrella's ADR-0006 per-file convention.
-->
<html data-theme="dark">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>{_STYLE}</style>
</head>
<body>
<div id="lyt-root" style="width:100vw;height:100vh;overflow:hidden;position:relative;">
{body_html}
</div>
<button id="lyt-menu-btn" type="button" aria-label="Panel menu">&#8942;</button>
<div id="lyt-menu-popover" hidden>
  <div class="lyt-menu-title">Panels</div>
  {checklist_html}
  <hr>
  <label class="lyt-menu-row"><input type="checkbox" id="lyt-overlay-toggle"> Show solved-rect overlay</label>
  <div id="lyt-overlay-status" class="lyt-overlay-status"></div>
</div>
<div id="lyt-overlay-layer"></div>
<script id="lyt-solved-data" type="application/json">{overlay_json}</script>
<script>{_SCRIPT}</script>
</body>
</html>
"""


def build_all(*, time_limit_s: float = 20.0) -> Dict[str, str]:
    reg, layouts = load_class_slots()
    pages: Dict[str, str] = {}
    for cls in reg.classes:
        layout_name = reg.layout_by_class[cls.id]
        slot = layouts[layout_name]
        overlay = build_overlay_data(reg, layouts, cls.id, time_limit_s=time_limit_s)
        pages[cls.id] = build_html_for_class(cls.id, slot, overlay)
    return pages


def main(argv: Optional[List[str]] = None) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pages = build_all()
    for class_id, text in pages.items():
        out_path = OUT_DIR / f"{class_id}.html"
        out_path.write_text(text)
        print(f"[emit_mockup] wrote {out_path} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
