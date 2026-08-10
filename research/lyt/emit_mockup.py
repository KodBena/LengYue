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

FIX PASS (ledger row 1710, `.claude/dispatch-reports/lyt-mockups-opus-
review.md`): the first draft's board leaf rendered non-square at every
tested viewport (B1) and lost the board-maximize objective's priority to
non-board siblings below ~2200px width / at every portrait height (B2/
B3). Both are fixed below -- see `_child_wrap`'s and
`_board_priority_tracks`'s own docstrings for the mechanism -- along with
the review's 5 major and 8 moderate findings; per-finding disposition is
in the fix pass's own build report
(`.claude/dispatch-reports/lyt-mockups-fix1-build.md`). The two mapping-
table rows below marked FIX PASS UPDATE reflect the corrected mapping;
the rest of this docstring (including the "elastic+cap" row's own
divergence-with-the-solver disclosure, which is now handled -- see the
board-priority block below -- ONLY for the one board-composite shape
both encodings use, and is otherwise still accurate for any other
elastic+capped track) is unchanged from the first draft.

SECOND FIX PASS (ledger rows 1717-1720, re-review at commit `41a71cd9`,
`.claude/dispatch-reports/lyt-mockups-opus-review.md`'s "Re-review --
2026-08-10" section; own build report
`.claude/dispatch-reports/lyt-mockups-fix2-build.md`): the first fix
pass's own topology change (Tree & Panels `preserve` -> `release`, M1)
introduced a new blocker (N1) that the first fix pass's own
re-verification missed because it re-checked per-viewport geometry but
not the full presence power set. N1, and three named residuals (X2's
`min-width:0` gap, N2, N3), are fixed below:
  - N1: `render_split`'s per-track CSS custom property is now namespaced
    by the child's own FULL path from the tree root (`--track-<p0>-
    <p1>-...`), not a bare per-level index -- see that function's own
    comment for why a bare index collided across nesting depths.
  - X2 residual: `.row-caption, .lyt-tab-caption` gains `min-width:0` (a
    flex `flex-basis` alone does not clip a longer caption's rendered
    content) plus a shared `margin-right`, and `.lyt-tabstrip` gains the
    rows' own 4px left padding -- see `_STYLE`'s own comments at each
    rule.
  - N2: the presence-menu's last-remaining-panel guard now DISABLES the
    checkbox (with a `title`) instead of silently reverting an accepted
    click -- see `_SCRIPT`'s `updateReleaseGuard`.
  - N3: the board's own info/action rows are centered under the board
    SQUARE itself (not the composite's own box) via a `.board-composite`
    container-query rule that reproduces `.board-square`'s own sizing
    formula one level up -- see the `.board-composite` rule in `_STYLE`
    and its emission in `render_split`.

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
      exists to surface, not hide. FIX PASS UPDATE (B2): this bare
      mapping is still what `_track_for_child` emits, but for the ONE
      elastic+capped track that is a direct sibling of the board
      composite (both encodings' side/tab-vs-board split),
      `_board_priority_tracks` REPLACES this value with a
      `clamp(min, 100% - natural_board, max)` expression before the
      template string is built -- see that function's own docstring for
      the closed-form derivation and why it eliminates the divergence
      for that one track (other elastic+capped tracks, if any encoding
      ever adds one, keep this bare mapping and its disclosed
      divergence unchanged).
  Exclusive (T) node's OWN track floor: loader.py leaves an omitted T
  'min' at a disclosed 0px default and lets the compiler derive the real
  one (componentwise max of the T's children's own declared min, both
  axes -- compiler.py's `_constrain` Exclusive branch, lines 360-379).
  `_exclusive_derived_min_px` below reproduces that exact derivation so
  the T node's track in ITS parent carries the same floor the solver
  enforces, not the loader's un-derived 0px.
  Board leaf (aspect-locked): FIX PASS UPDATE (B1) -- the first draft
  gave the leaf ITEM `width:100%;height:100%` (render_leaf's ordinary
  per-leaf rule) PLUS `aspect-ratio:1/1` and a `justify-self`/
  `align-self:center` override on only ONE axis. `aspect-ratio` only
  takes effect when exactly one axis is indefinite (CSS Sizing 3);
  making both axes definite via the 100%/100% pair made the declaration
  inert, and the single-axis centering override left the OTHER axis
  still stretched -- together, a non-square board at every tested
  viewport (the review's B1 finding). Fixed via a container-query
  containment pattern instead: the leaf ITEM keeps `width:100%;
  height:100%` (it is just the grid CELL) plus `container-type:size`
  (class `.board-cell`, see `_child_wrap`); the board's own inner
  `.board-square` div is sized `min(100%, 100cqh)` / `min(100%,
  100cqw)` -- the largest square that fits the cell on EITHER axis,
  exact at every viewport, centered via the cell's own
  `place-items:center`. This is still the CSS-grid analog of
  `compiler.py`'s own disclosed, one-directional cross-axis relaxation
  for aspect leaves (README.md "Honest caveat on the 'infeasibility
  proof' results") -- both this mockup and the solver bend the same
  literal exact-cross-fill rule to let a square board coexist with
  `aspect`, and both name the bend rather than silently absorbing it;
  only the CSS MECHANISM used to express the bend changed.

Judgment calls beyond the two amendments (disclosed here and in the
build report; none of them touch a solved rectangle, the census
assignment, or add/remove a widget -- the commission's own STOP-and-
report boundary):
  - Corner presence-menu targets and their release/preserve choice: the
    two `.lyt` source files declare only default (`@fixed`) presence --
    neither encodes an `@toggle`. The commissioned corner menu is an
    ADDED UI affordance, not a rendering of a declared presence. Targets
    chosen (as of the original commission): the five (four in portrait)
    top-level consolidated groups that already get the census's
    A/B/C/D-style visual grouping. Board and the tree/control-panel tab
    group use `preserve` (CSS `visibility:hidden` -- the codebase's own
    SetupToolPalette precedent, layout-language-consult.md line 213-214);
    the three action/info strips use `release` (CSS `display:none`,
    space redistributes to the grid's other tracks) -- matching the
    census's own sidebar-collapse-rail / board-tree-controls-toggle
    family.
  - lyt-tree-always-visible (ledger row ~1735) EXTENDS this registry with
    two more `release` targets, both DEFAULT OFF (`TOGGLE_TARGETS`'
    third tuple element): "Board Rail" (the reinstated boardRail leaf)
    and "Preview Board" (the new previewBoard leaf). Landscape now
    carries 7 targets (2^7=128 power-set states), portrait 6 (2^6=64) --
    `verify_power_set.mjs` reads the live checkbox list from the DOM, so
    it needed no target-COUNT change, only a baseline-capture fix (see
    its own updated header) for the fact that the initial page load no
    longer equals the all-checked state.
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

# Representative sizes the debug overlay solves against, per class.
# X6 fix (fix pass, lyt-mockups-opus-review.md): the review's own finding
# was that the overlay only resolved at the three sizes it happened to be
# screenshotted at ("no solve for 1280x1024" everywhere else), including
# the two sizes where B2's damage was worst -- exactly where the honesty
# claim mattered most. Widened to the review's own full 14-viewport
# tested set (its own "Method" section), so the affordance that exists to
# support the resize-honesty claim can be exercised at every size the
# claim is actually checked against.
OVERLAY_SIZES: Dict[str, List[Tuple[str, int, int]]] = {
    "landscape": [
        ("1920x1080", 1920, 1080),
        ("2560x1440", 2560, 1440),
        ("1280x1024", 1280, 1024),
        ("3440x1440", 3440, 1440),
        ("1366x768", 1366, 768),
        ("1024x700", 1024, 700),
        ("900x600", 900, 600),
        ("1080x1920-in-landscape", 1080, 1920),
    ],
    "portrait": [
        ("1080x1920", 1080, 1920),
        ("1200x1600", 1200, 1600),
        ("768x1024", 768, 1024),
        ("540x960", 540, 960),
        ("420x880", 420, 880),
        ("1920x1080-in-portrait", 1920, 1080),
    ],
}

# path-tuple (child index chain from the class's root Split) -> (label,
# presence, default_visible). See the module docstring's "Corner
# presence-menu targets" paragraph.
#
# M1 fix (fix pass): "Tree & Panels" flips preserve -> release on both
# classes. The review's finding was that the two largest regions on the
# page (Board, Tree & Panels) were BOTH `preserve`, so no presence-menu
# state could ever grow the board -- releasing the emptiest, least-
# content-bearing region (Tree & Panels) lets the menu serve the primary
# board-maximize objective at least once, per the review's own suggested
# fix ("make Tree & Panels release... if the board must keep its geometry
# when hidden, then hiding it should not be offered at all" -- Board
# stays `preserve`, unchanged, for that reason).
# X7 fix: "Board" is relabeled "Board & Controls" -- the toggle's actual
# footprint (per landscape/portrait .lyt source) is the WHOLE composite
# (board + info row + action row, i.e. Pass/move-nav/Annotate/Setup ride
# along too), which the bare word "Board" doesn't disclose. Renaming is
# the review's own offered cheap alternative to splitting the target.
#
# TREE-ALWAYS-VISIBLE fix (ledger row ~1735): "Tree & Panels" now names
# ONLY the T(CP-*) node (tree itself is pulled out into a permanent
# sibling and is no longer a toggle target at all -- "always visible" per
# the commissioner's own words means it does not appear in this registry
# in the first place, not that it appears with some special presence).
# Landscape's path shifts from (1,3) to (1,3,1) since the tree/panels
# row picked up a new H(...) wrapper (tree, T(CP-*), previewBoard);
# portrait's shifts from (3,) to (3,1) for the same reason.
#
# boardRail / previewBoard (same ledger row): two NEW default-OFF
# release targets. `default_visible=False` is the third tuple element --
# every pre-existing entry keeps `True` (unchanged behavior, explicitly
# spelled out rather than left to an implicit default, so a reader can
# see at a glance which targets are new). See `_child_wrap` and
# `render_split` for how a `False` here seeds the generated page's
# INITIAL html/css (unchecked checkbox, collapsed track, `display:none`)
# without waiting for a click -- the mechanism this dict previously had
# no need for, since every prior target defaulted to shown.
TOGGLE_TARGETS: Dict[str, Dict[Tuple[int, ...], Tuple[str, str, bool]]] = {
    "landscape": {
        (0,): ("Board Rail", "release", False),
        (1,): ("Board & Controls", "preserve", True),
        (2, 0): ("Go Actions", "release", True),
        (2, 1): ("Engine Info", "release", True),
        (2, 2): ("Common Actions", "release", True),
        (2, 3, 1): ("Tree & Panels", "release", True),
        (2, 3, 2): ("Preview Board", "release", False),
    },
    "portrait": {
        (0,): ("Board Rail", "release", False),
        (1,): ("Top Actions", "release", True),
        (2,): ("Board & Controls", "preserve", True),
        (3,): ("Engine Info", "release", True),
        (4, 1): ("Tree & Panels", "release", True),
        (4, 2): ("Preview Board", "release", False),
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
# The board leaf ('B') and previewBoard are handled separately (by
# `_board_html`, see `render_leaf`) since they are not text content.
# Block-shaped leaf content lives here: the T-node's own children (CP-*),
# tree (a plain leaf since the TREE-ALWAYS-VISIBLE fix, ledger row ~1735
# -- still block-shaped, so it stays in this dict unchanged), and
# boardRail (same ledger row). The single-line info/actions strips are
# `ROW_WIDGETS` below instead, so their optional corner-menu caption can
# be spliced into the SAME flex row rather than overlapping the content
# vertically (see that dict's own docstring).
WIDGET_CONTENT: Dict[str, str] = {
    # M2/X8 fix (fix pass): denser, more realistic tree content -- a real
    # game tree at move ~47 (I_board's own sample "Move 47", kept
    # consistent) is not six rows. Two effects named by the review: (a)
    # M2's "the Tree region alone is 820x996 carrying a 145x85 content
    # block, 1.6% fill" -- more rows give the region real visual mass;
    # (b) X8's "[the Tree-as-exclusive-tab cost] is currently invisible
    # because the Tree panel is 98% empty" -- a fuller tree makes the
    # "you can't see Analysis while reading the tree" workflow cost this
    # finding names actually visible in the mockup, which is what X8
    # asks for (not a structural fix to the T-node's exclusive-tab
    # mapping itself -- that is the consult's own §5.4 T-node semantics,
    # out of this generator's scope; see the build report's unfixed list).
    "tree": (
        '<div class="tree-body">'
        '<div class="tree-row" style="padding-left:0">Game Tree — 187 moves</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 41 (B) 51.2%</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 42 (W) 49.0%</div>'
        '<div class="tree-row" style="padding-left:24px">│ ├ Move 43 (B) 52.8%</div>'
        '<div class="tree-row" style="padding-left:24px">│ │ └ Variation: 3-3 invasion</div>'
        '<div class="tree-row" style="padding-left:24px">│ └ Move 43 (B) 50.1% (alt)</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 44 (W) 48.6%</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 45 (B) 53.4%</div>'
        '<div class="tree-row" style="padding-left:12px">├ Move 46 (W) 46.9%</div>'
        '<div class="tree-row" style="padding-left:24px">│ └ Variation: hane instead</div>'
        '<div class="tree-row" style="padding-left:12px">└ Move 47 (B) 54.2% — current</div>'
        "</div>"
    ),
    "CP-library": '<div class="blackbox-body">Library (control-panel tab — black box, SS2 census)</div>',
    "CP-cards": '<div class="blackbox-body">Cards (control-panel tab — black box, SS2 census)</div>',
    "CP-settings": '<div class="blackbox-body">Settings (control-panel tab — black box, SS2 census)</div>',
    "CP-analysis": '<div class="blackbox-body">Analysis (control-panel tab — black box, SS2 census)</div>',
    "CP-other": '<div class="blackbox-body">Other (control-panel tab — black box, SS2 census)</div>',
    # boardRail (ledger row ~1735): the open-boards thumbnail rail, back
    # in the tree as a default-OFF toggleable slot (see
    # `encodings/lengyue_landscape.lyt`'s own header). Honest-proxy
    # content, same discipline as every other WIDGET_CONTENT entry --
    # reuses `.blackbox-body`/`.tree-row` rather than inventing a third
    # near-identical CSS rule pair for one more list-of-rows widget.
    "boardRail": (
        '<div class="blackbox-body">'
        '<div class="tree-row">Board 1 — current</div>'
        '<div class="tree-row">Board 2 — Handicap study</div>'
        '<div class="tree-row">Board 3 — Joseki review</div>'
        '<div class="tree-row">Board 4 — vs KataGo</div>'
        "</div>"
    ),
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
    # X8 fix (fix pass): winrate + score lead added. The review's own
    # finding was that the Engine Info envelope showed six pieces of
    # OPERATOR telemetry (version, connected, model, pps, latency, queue)
    # and omitted "the two numbers a student actually reads" -- placed on
    # I_board (the board's own info row, board domain) rather than
    # I_engine (common/operator domain) since that's the row a reviewing
    # student actually looks at.
    "I_board": (
        "info-row",
        "<span>Move 47</span>"
        "<span>● Black — Alice (2400)</span>"
        "<span>○ White — Bob (2350)</span>"
        "<span>Caps B 3 · W 5</span>"
        "<span>Win B 54.2%</span>"
        "<span>Score B +3.5</span>",
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
    # Label drift fix ("The portrait layout, on its own terms" section):
    # portrait now spells out the same labels landscape's A_go/A_common
    # use ("Mint Card", not "Mint") -- the review's own measurement
    # showed the row has the room (580px of content in a 1070px box at
    # 1080px width) and named the two-names-for-one-button drift as
    # something to fix one way or the other; matching landscape's full
    # labels (rather than abbreviating landscape too) keeps every other
    # class's screenshot honest about what the button actually says.
    "A_top": (
        "actions-row actions-row-wrap",
        '<button class="btn">Mint Card</button>'
        '<button class="btn">Learn Path</button>'
        '<button class="btn">Play</button>'
        '<button class="btn">Match</button>'
        '<button class="btn">Load SGF</button>'
        '<button class="btn">Save SGF</button>'
        '<button class="btn">Connect</button>'
        '<button class="btn">Sliders</button>'
        '<button class="btn debug-pill" title="Autonav, popover test, clear cache (dev-only, C-domain)">Debug (3)</button>',
    ),
}



_BOARD_LINES = 19  # a 19x19 goban has 19 lines, 18 gaps between them
_HOSHI = [(3, 3), (3, 9), (3, 15), (9, 3), (9, 9), (9, 15), (15, 3), (15, 9), (15, 15)]  # standard 9 star points, 0-indexed
_COORD_LETTERS = "ABCDEFGHJKLMNOPQRST"  # 19 letters, 'I' conventionally skipped


def _intersection_pct(i: int) -> float:
    """Percentage position (of `.board-square`'s own box, NOT
    `.board-grid`'s) of grid line `i` (0..18) along either axis. B1
    SECONDARY fix (lyt-mockups-opus-review.md): stones/star-points/
    coordinates are positioned via this SAME function everywhere they're
    placed, rather than separately-typed arbitrary percentages -- the
    review's B1 finding was exactly that the old stone percentages
    (22%/30%, 35%/45%, ...) didn't coincide with the board-grid's own
    line spacing, so every stone sat inside a cell instead of on an
    intersection. `.board-grid` is inset 5% on every side of
    `.board-square` (a 90%-wide/tall square) and its own repeating-
    gradient period is 100%/18 -- 18 equal gaps between 19 lines -- so
    the two facts combine to an exact 5% step (90/18 == 5), never
    approximated separately in two places."""
    return 5.0 + i * (90.0 / (_BOARD_LINES - 1))


def _board_html() -> str:
    stars = "".join(
        f'<div class="board-star" style="left:{_intersection_pct(c):g}%;top:{_intersection_pct(r):g}%;"></div>'
        for (r, c) in _HOSHI
    )
    coords_top = "".join(
        f'<div class="board-coord board-coord-col" style="left:{_intersection_pct(c):g}%;">{_COORD_LETTERS[c]}</div>'
        for c in range(_BOARD_LINES)
    )
    coords_left = "".join(
        f'<div class="board-coord board-coord-row" style="top:{_intersection_pct(r):g}%;">{r + 1}</div>'
        for r in range(_BOARD_LINES)
    )
    # A plausible mid-game cluster -- honest-proxy content (a fixed
    # sample, never content that would vary at runtime, per the original
    # commission's own standing rule), now placed ON GRID INTERSECTIONS
    # (row, col; 0-indexed) rather than at arbitrary percentages -- the
    # review's B1 finding.
    stones_spec = [
        ("b", 9, 9), ("w", 9, 10), ("b", 8, 10), ("w", 10, 9),
        ("b", 10, 11), ("w", 11, 10), ("b", 7, 9),
    ]
    stones = "".join(
        f'<div class="board-stone board-stone-{color}" '
        f'style="left:{_intersection_pct(c):g}%;top:{_intersection_pct(r):g}%;"></div>'
        for (color, r, c) in stones_spec
    )
    return (
        '<div class="board-square">'
        '<div class="board-grid"></div>'
        f"{stars}{coords_top}{coords_left}{stones}"
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
# BLOCKER B2/B3 fix (fix pass, `.claude/dispatch-reports/lyt-mockups-opus-
# review.md`): board-maximize lexicographic priority.
#
# Plain CSS Grid has no concept of the CP-SAT compiler's staged
# lexicographic objective (compiler.py `solve_lexicographic`): stage 1
# maximizes the board leaf's own area BEFORE any later stage's fr-weighted
# "reach preferred" term or slack-minimization term runs at all. A flat
# `grid-template-columns/rows` list of tracks -- even one that faithfully
# preserves every declared `fr` weight -- can only express ONE round of
# proportional (or, worse, greedy-non-flexible-first) space distribution,
# which is a different thing than "this track wins first, unconditionally,
# up to what it can actually use."
#
# Both `.lyt` encodings share exactly one shape for their board group: a
# Split (H or V) whose children are [the aspect-locked board leaf, ...one
# or more FIXED-size siblings...], itself a direct child of the class's
# ROOT split. That shape has a closed-form, viewport-relative "natural
# size" for the board -- derived below -- that a plain `calc()`/`clamp()`
# CSS expression can reproduce exactly, no arbitrary weight ratio needed:
#
#   - composite's CROSS dimension (relative to its OWN children) is always
#     cross-filled from the root's own extent along that axis (the
#     ordinary H/V cross-fill rule, SS4.1) -- i.e. it is always exactly
#     100vw or 100vh, a viewport-relative CONSTANT, because `composite` is
#     a direct child of the tree's own root (hard-pinned to the full
#     viewport) and no other node sits between them in either encoding.
#   - the board leaf's aspect (=1 in both encodings) ties its own along-
#     and cross-dimensions together, so its natural maximum size is that
#     same constant, less whatever fixed-size siblings share composite's
#     OTHER (along) axis.
#
# Two orientations occur, depending on whether `composite`'s own
# partition axis matches its PARENT split's axis:
#
#   CASE A (landscape: H root > V composite) -- composite's ALONG
#   dimension (used for its own board/info/action row-split) equals the
#   ROOT's CROSS dimension (perpendicular nesting), so it is the
#   viewport-constant one; the board's natural size therefore bounds
#   composite's CROSS dimension, which is the variable CONTESTED in the
#   root's own H-split (composite.w vs the side column's w). Fix: cap the
#   NON-board sibling's track (only when it's the "elastic+capped" shape
#   this ever needs) via `clamp(min, 100% - natural_board, max)` -- CSS
#   sizes this non-flexible clamp value FIRST, so it structurally yields
#   whatever the board needs before growing toward its own declared max.
#
#   CASE B (portrait: V root > V composite) -- composite's ALONG
#   dimension is itself the ROOT's own along dimension (parallel nesting),
#   i.e. the variable CONTESTED in the root's split; its CROSS dimension
#   is the viewport-constant one. Fix: cap COMPOSITE's OWN track at its
#   natural ceiling (`calc(100v<cross> + fixed_siblings)`) instead --
#   converting it from an uncapped `fr` track into a non-flexible
#   calc-bounded one. CSS Grid's own track-sizing algorithm reserves
#   every OTHER track's declared `min` (a real floor -- e.g. the Tree &
#   Panels T-node's derived WRAPPER_MIN) before growing a non-flexible
#   track, so a sibling's floor is never starved by this cap; whatever
#   free space remains after composite's calc-bounded growth flows to the
#   sibling automatically, since it stays the sole flexible (`fr`) track.
#
# Both cases reduce the live CSS realization to EXACTLY the CP-SAT solve's
# own closed-form result for this shape (worked out in the fix pass's own
# build report) -- not an approximation, an equality, verified against the
# debug overlay at every tested viewport.
#
# Only this ONE recognized shape is touched. Anything else (a board leaf
# nested more than one Split deep, more than one board-bearing sibling in
# the same split, a Split this override wasn't derived for) is left to the
# ordinary per-child mapping -- `_find_board_composite_child` returns None
# rather than guessing a formula for a shape it wasn't derived against.
# ---------------------------------------------------------------------------


def _find_board_composite_child(node: ast.Split) -> Optional[Tuple[int, ast.Split, float]]:
    """If exactly one child of `node` is itself a Split whose children are
    [one aspect-locked Leaf, ...otherwise only FIXED-size siblings...],
    return (that child's index, the child's own Split node, the sum of the
    fixed siblings' own px extent along the child's partition axis). None
    if no child matches, or more than one does (ambiguous -- refused by
    the caller falling back to the ordinary mapping, not guessed)."""
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


def _board_priority_tracks(
    node: ast.Split, tracks: List[str], sizings: List[ast.Sizing], *, match: Optional[Tuple[int, ast.Split, float]] = None
) -> List[str]:
    """Applies the CASE A / CASE B override described above, in place on a
    COPY of `tracks` (the caller's own list is left untouched), only when
    `node` matches the one recognized board-composite shape. Called only
    for the tree's ROOT split (see `render_split`'s call site) -- the
    100vw/100vh constants below are only valid when `node` itself is
    hard-pinned to the full viewport, which is true for the root and is
    NOT generally true for a split nested deeper in the tree.

    `match` lets the caller pass a precomputed `_find_board_composite_
    child(node)` result (SECOND FIX PASS, N3: `render_split` also needs
    this same match to tag the composite child for the board-strip-
    alignment CSS, so it computes it once and shares it here rather than
    this function silently re-deriving its own copy). `None` (the
    default) re-derives it, unchanged from the first fix pass -- every
    existing caller that doesn't know about the match keeps working."""
    if match is None:
        match = _find_board_composite_child(node)
    if match is None:
        return tracks
    board_idx, composite, fixed_sum = match
    out = list(tracks)
    node_cross_vunit = "vh" if node.axis == "h" else "vw"  # node partitions width -> cross is height, and vice versa
    if composite.axis == node.axis:
        # CASE B: cap composite's OWN track at its natural ceiling.
        # composite.axis == node.axis here, so composite's OWN cross axis
        # (opposite of composite.axis) is the SAME axis as node's own
        # cross axis (opposite of node.axis, which is equal to
        # composite.axis by this branch's own condition) -- both are
        # cross-filled from the same viewport dimension, `node_cross_vunit`.
        natural = f"calc(100{node_cross_vunit} + {fixed_sum:g}px)"
        out[board_idx] = f"minmax(0px, {natural})"
    else:
        # CASE A: cap the non-board, elastic+capped sibling(s).
        #
        # AMENDMENT 3 (ledger row 1715): if `node` (the root split) itself
        # declares a `gap`, that gap is consumed BETWEEN node's own
        # children regardless of which track is flexible -- CSS Grid's
        # native `column-gap`/`row-gap` (see `render_split`'s own gap
        # wiring) subtracts it from the space available to distribute,
        # the same way it subtracts every other non-flexible track's own
        # width before an `fr` track grows. Since the board composite's
        # own track is left an uncapped `1fr` (untouched by this branch --
        # only the SIBLING's track is overridden below), the sibling's
        # clamp must ALSO subtract the gap from what it claims, or the
        # 1fr composite track would silently absorb the gap's width out
        # of the board's own natural share -- the exact "board shrinks by
        # the gap" regression this comment exists to prevent. Hand-
        # verified against `compiler.py`'s own gap-aware partition
        # equality (`_constrain`'s Split branch): `composite.w + sibling.w
        # + gap == node.w`, so `sibling.w := node.w - natural_board - gap`
        # is exactly what leaves `composite.w` (and hence board.w, once
        # bounded by its own aspect ceiling) at its full natural share.
        gap_term = f" - {node.gap_px:g}px" if node.gap_px else ""
        natural_board_expr = f"100{node_cross_vunit} - {fixed_sum:g}px"
        for j, sibling_sizing in enumerate(sizings):
            if j == board_idx:
                continue
            if _is_fixed(sibling_sizing) or sibling_sizing.max == "inf" or sibling_sizing.pref.unit != "fr":
                continue  # not the elastic+capped shape this override is for -- leave alone
            min_px = _px(sibling_sizing.min, where=f"board-priority/sibling-min@{j}")
            max_px = _px(sibling_sizing.max, where=f"board-priority/sibling-max@{j}")
            out[j] = f"clamp({min_px:g}px, calc(100% - ({natural_board_expr}){gap_term}), {max_px:g}px)"
    return out


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
    child, folding in the board-leaf square-containment marker and any
    corner-menu toggle target at this path. `track_prop` (e.g.
    "--track-1-0", namespaced by the child's own full tree path -- see
    render_split's N1 fix comment for why a bare per-level index is not
    safe) is the CSS custom property this child's OWN track is
    parameterized by in its parent's grid-template -- see render_split's
    own comment for why a 'release' toggle needs it (collapsing the track
    itself, not just hiding the item) to avoid mis-tracking the remaining
    siblings.

    BLOCKER B1 fix (fix pass, lyt-mockups-opus-review.md): the board leaf
    no longer gets `aspect-ratio`/`justify-self`/`align-self` inline on
    ITSELF. `aspect-ratio` only takes effect when exactly one axis is
    indefinite (CSS Sizing 3) -- the OLD code also gave this same element
    `width:100%;height:100%` (in `render_leaf`, unconditionally), making
    BOTH axes definite and the aspect-ratio declaration inert; that is
    exactly how the board rendered non-square at every tested viewport
    (the review's B1 finding). The fix moves the containment to a CSS
    container-query pattern instead (`.board-cell` + `.board-square`,
    see `_STYLE`): this element keeps `width:100%;height:100%` (it is
    just the grid CELL, establishing a definite size-contained box via
    `container-type:size`), and the INNER `.board-square` div (built by
    `_board_html`) is sized via `min(100%, 100cqh)` / `min(100%, 100cqw)`
    -- the largest square that fits the cell on EITHER axis, centered by
    the cell's own `place-items:center`. This is exact (not an
    approximation) at every viewport, not just the ones a live-resize
    happened to be eyeballed at.

    GENERALIZATION (ledger row ~1735, previewBoard): the containment
    class used to be gated on `child.node.widget == "B"` -- the ONE
    aspect-locked leaf either encoding had. previewBoard is a second one
    (a modest 160px/96px fixed-and-square leaf, not a maximize target),
    so the gate is now `child.sizing.aspect is not None` -- ANY
    aspect-locked leaf gets the same cross-axis container-query
    containment, not just the board. The CSS class name (`board-cell`)
    is kept as-is rather than renamed: it is a rendering-mechanism hook
    (container-type:size + the sizing formula in `_STYLE`), not a
    board-specific identity marker, and renaming it would touch every
    pinned test string for no behavioral gain.

    DEFAULT-HIDDEN (same ledger row, boardRail/previewBoard): a release
    target whose registry entry's third element is `False` starts the
    page COLLAPSED -- `display:none` on the element itself, seeded here;
    the matching parent-grid track override (`{track_prop}:0px`) is
    seeded by the caller, `render_split`, since that override lives on
    the PARENT's own style attribute, not this child's."""
    parts = ["min-width:0", "min-height:0"]
    is_aspect_leaf = isinstance(child.node, ast.Leaf) and child.sizing.aspect is not None

    toggle = TOGGLE_TARGETS.get(class_id, {}).get(cpath)
    class_parts: List[str] = []
    if is_aspect_leaf:
        class_parts.append("board-cell")
    if toggle:
        label, presence, default_visible = toggle
        extra_data = f'data-toggle-id="{_slug(label)}" data-presence="{presence}"'
        if presence == "release":
            extra_data += f' data-track-prop="{track_prop}"'
            if not default_visible:
                parts.append("display:none")
        class_parts.append("lyt-group")
        caption: Optional[str] = label
    else:
        extra_data = ""
        caption = None
    extra_style = ";".join(parts) + ";"
    extra_class = " ".join(class_parts)
    return extra_style, extra_data, extra_class, caption


def render_split(
    node: ast.Split, *, path: Tuple[int, ...], class_id: str, extra_style: str, extra_data: str, extra_class: str, caption: Optional[str]
) -> str:
    axis = node.axis
    raw_track_values: List[str] = []
    sizings: List[ast.Sizing] = []
    for i, child in enumerate(node.children):
        cpath = path + (i,)
        floor = _exclusive_derived_min_px(child.node, where=str(cpath)) if isinstance(child.node, ast.Exclusive) else None
        raw_track_values.append(_track_for_child(child.sizing, floor_override_px=floor, where=str(cpath)))
        sizings.append(child.sizing)
    # BLOCKER B2/B3 fix: only ever engages at the tree's own ROOT (path ==
    # ()) -- see `_board_priority_tracks`'s own docstring for why the
    # 100vw/100vh constants it relies on are only valid there. A no-op for
    # every other Split in the tree, and for a root that doesn't match the
    # one recognized board-composite shape.
    #
    # `composite_match` is computed once here (rather than letting
    # `_board_priority_tracks` re-derive its own copy) so the SECOND FIX
    # PASS's N3 fix, below, can reuse it to tag the composite child without
    # a second, possibly-diverging, `_find_board_composite_child` call.
    composite_match = _find_board_composite_child(node) if path == () else None
    if path == ():
        raw_track_values = _board_priority_tracks(node, raw_track_values, sizings, match=composite_match)

    tracks: List[str] = []
    kids: List[str] = []
    # DEFAULT-HIDDEN track overrides (ledger row ~1735, boardRail/
    # previewBoard): a release toggle target registered with
    # `default_visible=False` must render COLLAPSED on first paint, not
    # just after a click. The `var(--track-<p>, <computed>)` fallback
    # baked into `tracks` below must stay the FULL computed value (so
    # re-checking the box restores it via `removeProperty`, exactly the
    # JS toggle handler's own `else` branch) -- so the collapse is
    # applied as an inline CUSTOM-PROPERTY OVERRIDE on THIS split's own
    # `style`, the same mechanism `_SCRIPT`'s release handler uses at
    # runtime (`el.parentElement.style.setProperty(trackProp, '0px')`),
    # just pre-seeded at generation time instead of deferred to a click.
    default_hidden_overrides: List[str] = []
    for i, child in enumerate(node.children):
        cpath = path + (i,)
        track_value = raw_track_values[i]
        # Every track is parameterized by its own CSS custom property,
        # `var(--track-N, <computed value>)`, rather than the bare
        # computed value -- this is what lets the 'release' toggle
        # collapse EXACTLY this track to 0px at runtime (see the JS
        # below) without touching the template string or any sibling's
        # track.
        #
        # BLOCKER N1 fix (fix pass 2, lyt-mockups-opus-review.md
        # re-review): this property used to be the bare per-level index
        # `--track-{i}`, on the theory that "each grid container reads
        # only its own inline declarations first" made reuse across
        # nesting levels safe. That reasoning missed that a CSS custom
        # property is an ORDINARY INHERITED property -- an override set
        # via `.style.setProperty` on a PARENT grid container is visible
        # to every descendant's `var(--track-N, ...)` lookup too, not just
        # the parent's own template. Releasing a strip at the root whose
        # track happened to share an index with an unrelated track inside
        # a NESTED grid (e.g. the board composite's own `--track-0`
        # bleeding into a released `--track-0` at the root) silently
        # rewrote that nested track instead: the review's measured
        # portrait damage was the board group's row template collapsing
        # to `0px 24px 28px` (board gone) or `1106px 24px 0px` (board's
        # own action strip gone), neither one caused by anything the user
        # actually toggled. Namespacing the property by the child's own
        # FULL path from the tree root (unique per node, by construction
        # of how paths are built) makes an accidental collision
        # impossible rather than merely unlikely: no two different nodes
        # in the whole tree can ever share a `cpath`, so no override can
        # ever land on a track it wasn't meant for.
        track_prop = "--track-" + "-".join(str(p) for p in cpath)
        tracks.append(f"var({track_prop}, {track_value})")
        toggle_here = TOGGLE_TARGETS.get(class_id, {}).get(cpath)
        if toggle_here and toggle_here[1] == "release" and not toggle_here[2]:
            default_hidden_overrides.append(f"{track_prop}:0px;")
        c_style, c_data, c_class, c_caption = _child_wrap(child, cpath=cpath, class_id=class_id, axis=axis, track_prop=track_prop)
        if composite_match is not None and i == composite_match[0]:
            # N3 fix: mark this child (the board composite -- the Split
            # wrapping the board leaf plus its own fixed info/action
            # rows) so the `.board-composite` CSS rule in `_STYLE` can
            # center THOSE rows under the board square itself, using the
            # same closed-form sizing formula `.board-square` uses one
            # level down -- see that rule's own comment for the
            # derivation. `--board-fixed-sum` is the composite's own
            # fixed-sibling total (already computed by
            # `_find_board_composite_child`), the one input the CSS
            # formula needs that isn't otherwise visible at runtime.
            c_class = (c_class + " board-composite").strip()
            c_style = c_style + f"--board-fixed-sum:{composite_match[2]:g}px;"
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

    # AMENDMENT 3 (ledger row 1715): `node.gap_px` realizes 1:1 as CSS
    # grid's own native `column-gap`/`row-gap` on the matching axis --
    # the same axis the compiler's own `(k-1)*gap` partition term
    # (`compiler.py`'s `_constrain`, Split branch) sums along. 0.0 (no
    # `gap` declared) reproduces the pre-amendment `0px` on both, byte-
    # identical to every encoding that doesn't use the new syntax.
    gap_px = node.gap_px
    if axis == "h":
        template = f"grid-auto-flow:column;grid-template-columns:{' '.join(tracks)};grid-template-rows:1fr;"
        gap_style = f"column-gap:{gap_px:g}px;row-gap:0px;"
    else:
        template = f"grid-auto-flow:row;grid-template-rows:{' '.join(tracks)};grid-template-columns:1fr;"
        gap_style = f"column-gap:0px;row-gap:{gap_px:g}px;"
    style = f"display:grid;{template}{gap_style}{''.join(default_hidden_overrides)}{extra_style}"
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
    elif node.widget == "previewBoard":
        # Ledger row ~1735: the variation-preview mini board reuses the
        # SAME honest-proxy goban content as the main board -- it is a
        # square Go-board rendering, just a second, smaller reservation
        # (see `_child_wrap`'s `is_aspect_leaf` generalization); the
        # `.board-square` div's own sizing is percentage/cq-based, so it
        # scales correctly to this leaf's smaller cell without a second
        # content function.
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
/* Theme: CLUSTER fix pass (item 5, lyt-mockups-opus-review.md fix
   commission). The commissioner's own default light palette
   ([data-theme="cluster"] in frontend/src/assets/css/theme.css,
   resolved against the cluster-12-N literals in
   frontend/src/assets/css/palettes.css -- both read in full, not
   guessed) is now the PRIMARY set (`<html data-theme="cluster">`
   below); the original dark tokens survive as a toggle in the corner
   popover (cheap -- both are just CSS custom-property blocks selected
   by the SAME data-theme attribute the real app uses, no second HTML
   file). Values copied by hand from the two files, hex-only (no
   var(--cluster-12-N) chain, since this mockup imports no app CSS at
   all, per the umbrella's scope discipline) -- exactly the same
   discipline the original build report used for the dark set. */
:root[data-theme="cluster"] {
  --surface-0: #fedaf7;    /* cluster-12-9, page bg */
  --surface-1: #7a6f6d;    /* cluster-12-6, chrome containers (taupe) */
  --surface-2: #fedaf7;    /* collapses to bg tone, per theme.css's own disclosed tier collapse */
  --surface-3: #fedaf7;
  --border-1: #7a6f6d;
  --border-2: #7a6f6d;
  --border-3: #0b001b;     /* cluster-12-4, strong/focus */
  --text-0: #0b001b;       /* cluster-12-4, the only text-emphasis tier */
  --text-disabled: #685e5d;
  --accent-primary: #00a7ff;   /* cluster-12-2 */
  --accent-secondary: #ff8800; /* cluster-12-11 */
  --text-on-accent: #0b001b;
  --state-success: #00a400;    /* cluster-12-1 */
  --state-warning: #ff8800;
  --state-error: #630000;      /* cluster-12-5 */
  --state-attention: #ff0086;  /* cluster-12-10 */
}
:root[data-theme="dark"] {
  --surface-0: #000;
  --surface-1: #111;
  --surface-2: #1a1a1a;
  --surface-3: #222;
  --border-1: #2a2a2a;
  --border-2: #333;
  --border-3: #555;
  --text-0: #fff;
  --text-disabled: #666;
  --accent-primary: #4aaef0;
  --accent-secondary: #f0a04a;
  --text-on-accent: #333;
  --state-success: #4caf50;
  --state-warning: #f0a04a;
  --state-error: #f04a4a;
  --state-attention: #ff4a4a;
}
:root {
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
  --caption-gutter: 104px; /* X2 fix: one shared caption-column width, see .row-caption/.lyt-tab-caption.
                              104px not 92px: the 92px floor clipped "COMMON ACTIONS" (97px) to an
                              ellipsis in the DEFAULT state (opus pass-3 residual) — standing law
                              forbids ellipsized readable names; the shared variable keeps all four
                              content-starts locked by construction. */
}
html, body {
  margin: 0; padding: 0; height: 100%;
  background: var(--surface-0); color: var(--text-0);
  font-family: system-ui, sans-serif; font-size: var(--text-emphasis);
  overflow: hidden;
}
.lyt-node { box-sizing: border-box; }
.lyt-group {
  /* M5 fix: the group chrome used to be `border:1px` + `padding:
     var(--space-tight)` (4px), consuming 10px of every 28px-fixed
     strip -- a 24px button no longer fits an 18px content box. Outline
     draws INSIDE the box without consuming layout space (unlike
     border), and the vertical padding drops to 1px (horizontal stays
     at the tight token) -- 28px strip, 0px consumed by outline + 2px
     vertical padding = 26px content box, fits a 24px button with a
     little room to spare, centered by the row's own
     align-items:center. */
  outline: 1px solid var(--border-1);
  outline-offset: -1px;
  background: var(--surface-1);
  padding: 1px var(--space-tight);
  position: relative;
}
/* X2 fix: a real column grid for the four sibling strips' captions --
   the review measured four different content-start x-positions because
   `.row-caption`/`.lyt-tab-caption` were sized to their own text
   (`flex: 0 0 auto`). Both now share ONE fixed gutter width, so every
   strip's content starts at the same x regardless of caption length.
   X2 RESIDUAL fix (fix pass 2, lyt-mockups-opus-review.md re-review):
   `flex: 0 0 92px` alone only sets the flex-basis -- a longer caption's
   own rendered content still won a fight against that basis (measured:
   "COMMON ACTIONS" rendered 97.55px, not 92), because a flex item's
   automatic minimum size defaults to its content's min-content size,
   which can exceed an explicit basis. `min-width: 0` overrides that
   default so the 92px basis is actually the box's hard ceiling, and
   `overflow: hidden` (plus `text-overflow`/`white-space` below) turns
   the now-genuinely-possible clipped case into a clean truncation
   instead of a broken layout. `margin-right` moves here (shared by both
   selectors, not just `.row-caption`) so `.lyt-tab-caption` -- which
   previously had no analogous margin -- gets the SAME gap before its
   first content item that the info/action rows already had; without it
   the tab strip's content still started 4px earlier than the other
   three rows' even with the caption boxes themselves aligned. */
.row-caption, .lyt-tab-caption {
  flex: 0 0 var(--caption-gutter);
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: var(--space-tight);
}
.row-caption {
  font-size: var(--text-tiny); letter-spacing: var(--tracking-default);
  text-transform: uppercase; color: var(--text-0);
  padding-right: var(--space-tight); border-right: 1px solid var(--border-2);
}
.lyt-leaf { position: relative; }
.info-row, .actions-row {
  display: flex; align-items: center; height: 100%;
  box-sizing: border-box; padding: 0 var(--space-tight);
  gap: var(--space-default); overflow-x: auto; white-space: nowrap;
  /* M4 fix (partial, disclosed): a trailing fade instead of an abrupt
     cut turns silent truncation into a HINTED "there's more, scroll"
     affordance -- an "explicit overflow control", per the review's own
     list of acceptable remedies. This does not implement full
     priority-order button dropping (no widget-priority metadata exists
     in the .lyt encodings to drive it) -- see the fix pass's report for
     the disclosed scope line. */
  mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 18px), transparent 100%);
}
.actions-row-wrap { gap: var(--space-tight); }
/* X1 fix: `.info-row span` (specificity 0,2,0) used to override
   `.row-caption` (0,1,0) whenever the caption ALSO happened to be an
   `.info-row`'s own child (only I_engine) -- the one caption that
   rendered at 12px instead of the other three's 9px. Scoping this rule
   away from `.row-caption` removes the accidental override instead of
   fighting it with a specificity bump. */
.info-row span:not(.row-caption) { color: var(--text-0); font-size: var(--text-emphasis); }
.btn {
  background: var(--surface-3); border: 1px solid var(--border-2);
  color: var(--text-0); border-radius: var(--radius-default);
  padding: 0 var(--space-default); height: 24px; min-width: 24px;
  font-size: var(--text-emphasis); display: inline-flex; align-items: center;
  justify-content: center; flex: 0 0 auto;
}
.debug-pill { background: var(--surface-2); border-color: var(--border-1); }
/* B1 fix: `.board-cell` is the grid ITEM (the `.lyt-leaf` wrapper for
   widget 'B') -- it keeps the ordinary `width:100%;height:100%` inline
   style (set by render_leaf for every leaf), which just makes it fill
   its grid cell exactly and gives `container-type:size` a definite box
   to measure. `.board-square` (its one child, built by `_board_html`)
   is sized via `min(100%, 100cqh)` / `min(100%, 100cqw)` -- the
   largest square that fits the cell on EITHER axis -- which is exact,
   not an approximation, and needs no knowledge of which axis is
   smaller at authoring time. `place-items:center` centers the square
   within any leftover space on the larger axis, matching the CP-SAT
   solve's own aspect-relaxation centering (compiler.py `_extract_
   rects`'s `cross_offset`). */
.board-cell { display: grid; place-items: center; container-type: size; }
.board-square {
  width: min(100%, 100cqh); height: min(100%, 100cqw);
  aspect-ratio: 1 / 1; position: relative;
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
/* B1 secondary fix: star points (hoshi) and rank/file coordinates --
   "no star points and no coordinates" (review's B1 evidence). */
.board-star {
  position: absolute; width: 1.1%; height: 1.1%; border-radius: var(--radius-circle);
  background: var(--border-3); transform: translate(-50%, -50%);
}
.board-coord { position: absolute; font-size: var(--text-tiny); color: var(--text-0); line-height: 1; }
.board-coord-col { top: 1.6%; transform: translateX(-50%); }
.board-coord-row { left: 1.6%; transform: translateY(-50%); }
/* N3 fix (fix pass 2, lyt-mockups-opus-review.md re-review): the board's
   own info/action rows (I_board/A_board) used to be flush against the
   COMPOSITE's own box (a fixed `var(--space-tight)` inset), independent
   of where the aspect-locked `.board-square` actually renders inside its
   own centered cell -- at most viewports the square is inset by tens of
   px on each side (whichever axis has slack), so "Pass"/"Move 47"
   started well to the left of the board they describe (measured: board
   x=37, "Pass" x=8 at 1920x1080, a gap that SCALES with viewport width
   since the square's own inset does). Fix: give the composite its own
   container-query context (`container-type:size`, same mechanism
   `.board-cell` already uses one level down) and reproduce
   `.board-square`'s own sizing formula against THAT box --
   `min(cross-dimension, along-dimension-minus-fixed-siblings)` -- so the
   rows are capped to the exact width the square resolves to, not an
   independently guessed inset, and centered under it with `margin:
   auto`. `--board-fixed-sum` is the composite's own fixed-sibling
   total (the info/action rows' own declared px heights), set inline per
   composite by `render_split` -- see that function's own N3 comment. */
.board-composite { container-type: size; }
.board-composite > .lyt-leaf > .info-row,
.board-composite > .lyt-leaf > .actions-row {
  max-width: min(100cqw, calc(100cqh - var(--board-fixed-sum, 0px)));
  margin-left: auto;
  margin-right: auto;
}
.lyt-tabstrip {
  display: flex; height: 24px; box-sizing: border-box;
  border-bottom: 1px solid var(--border-2); overflow-x: auto; white-space: nowrap;
  /* X2 residual fix: the rows (.info-row/.actions-row) already carry
     `padding: 0 var(--space-tight)` (4px each side); the tab strip had
     no counterpart, so its caption's left edge sat 4px earlier than the
     other three strips' (measured: 1105 vs 1109 at 1920x1080). */
  padding-left: var(--space-tight);
  /* X2 residual fix, continued: `.info-row`/`.actions-row` also declare
     `gap: var(--space-default)` between EVERY flex child (including
     after the caption, on top of its own `margin-right`), which the tab
     strip did not -- so even after the caption boxes and their margins
     matched, the first item after a row's caption still started 8px
     further right than the first tab (measured: 1212 vs 1204 at
     1920x1080, both down from the original 21px-ragged spread, but not
     yet EXACT). Matching the same gap here closes that last 8px. */
  gap: var(--space-default);
}
.lyt-tab-caption {
  /* X4 fix: a distinct fill (chrome surface-1, not the tabstrip's own
     transparent/surface-0 default and not the active tab's surface-2)
     so this reads as a labeled gutter block, not a 7th (disabled) tab
     peer -- the review's own finding was that identical padding+height
     +border made it indistinguishable from a tab. */
  background: var(--surface-1);
  padding: 0 var(--space-default); display: flex; align-items: center;
  font-size: var(--text-tiny); letter-spacing: var(--tracking-default);
  text-transform: uppercase; color: var(--text-0);
  border-right: 1px solid var(--border-2);
}
.lyt-tab {
  padding: 0 var(--space-default); display: flex; align-items: center; flex: 0 0 auto;
  font-size: var(--text-emphasis); color: var(--text-0);
  border-right: 1px solid var(--border-1); box-sizing: border-box;
}
.lyt-tab.active { background: var(--surface-2); border-bottom: 2px solid var(--accent-primary); }
/* M2 fix (fix pass): the tab body used to have no fill of its own, so
   any leftover height below its content showed bare page background --
   "the eye lands on a large void" (review's own description, dark
   theme's black; cluster theme's pale pink). A chrome-tone fill makes
   the WHOLE region read as one contained panel regardless of how much
   of its height the sample content happens to occupy. */
.lyt-tabbody, .blackbox-body { padding: var(--space-tight); overflow: auto; color: var(--text-0); background: var(--surface-1); height: 100%; box-sizing: border-box; }
.tree-row { color: var(--text-0); font-size: var(--text-emphasis); white-space: nowrap; }
#lyt-menu-btn {
  /* X5 fix: bumped from --surface-3-on-surface-1 (near-invisible, per
     the review's own "not findable without knowing where to look") to
     a stronger --border-3 outline and --surface-1 fill -- still
     28x28px, zero ADDITIONAL standing cost, just more findable. */
  position: fixed; right: 8px; bottom: 8px; width: 28px; height: 28px;
  z-index: var(--z-affordance); background: var(--surface-1);
  border: 1px solid var(--border-3); color: var(--text-0);
  border-radius: var(--radius-default); font-size: var(--text-heading);
  line-height: 1; cursor: pointer;
}
#lyt-menu-popover {
  position: fixed; right: 8px; bottom: 42px; z-index: var(--z-popover);
  background: var(--surface-0); border: 1px solid var(--border-2);
  padding: var(--space-medium); min-width: 220px; color: var(--text-0);
}
.lyt-menu-title { font-size: var(--text-heading); color: var(--text-0); margin-bottom: var(--space-tight); }
.lyt-menu-subtitle {
  font-size: var(--text-tiny); letter-spacing: var(--tracking-default); text-transform: uppercase;
  color: var(--text-0); margin: var(--space-default) 0 var(--space-tight);
}
.lyt-menu-divider { border-top: 1px solid var(--border-2); margin: var(--space-tight) 0; }
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

  // X5 fix: aria-expanded (kept in sync with open/closed), Escape
  // dismissal + focus return to the button, and outside-click
  // dismissal -- the review's own named list ("no Escape dismissal, no
  // outside-click dismissal, no aria-expanded, no focus ring, no focus
  // return"). Focus ring itself needs no code: neither this stylesheet
  // nor this script ever sets `outline:none`, so the browser's own
  // default focus ring already renders on both the button and every
  // checkbox/toggle inside the popover.
  function openMenu() { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  function closeMenu(returnFocus) {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) { btn.focus(); }
  }
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'lyt-menu-popover');
  btn.addEventListener('click', function () { if (pop.hidden) { openMenu(); } else { closeMenu(false); } });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !pop.hidden) { closeMenu(true); }
  });
  document.addEventListener('click', function (ev) {
    if (pop.hidden) return;
    if (pop.contains(ev.target) || btn.contains(ev.target)) return;
    closeMenu(false);
  });

  // M3 fix (partial -- prevent the all-off terminal state), refined by
  // the N2 fix (fix pass 2, lyt-mockups-opus-review.md re-review): the
  // review's original finding was that unchecking every panel leaves a
  // pure-black screen with no product identity and no way back except
  // the popover already open. The product-identity half is fixed in the
  // popover's own title (see build_html_for_class). The first fix
  // pass's guard refused the LAST release-panel uncheck by silently
  // REVERTING the checkbox -- accepted the click, then undid it with
  // zero feedback, which N2 correctly named as indistinguishable from a
  // bug (a control that springs back and explains nothing). Fixed
  // properly here: the last remaining CHECKED release checkbox is
  // DISABLED (with a `title` naming why) so that click is never
  // accepted in the first place. 'preserve' targets (Board & Controls,
  // Tree & Panels in landscape / portrait respectively) are excluded
  // from this guard -- they never remove content from the DOM, only
  // hide painting, so they can't produce a truly blank page on their
  // own.
  var releaseCheckboxes = Array.prototype.filter.call(
    document.querySelectorAll('#lyt-menu-popover input[data-toggle-for]'),
    function (cb) {
      var el = document.querySelector('[data-toggle-id="' + cb.getAttribute('data-toggle-for') + '"]');
      return el && el.getAttribute('data-presence') === 'release';
    }
  );

  function updateReleaseGuard() {
    var checkedOnes = releaseCheckboxes.filter(function (cb) { return cb.checked; });
    releaseCheckboxes.forEach(function (cb) {
      if (checkedOnes.length === 1 && cb === checkedOnes[0]) {
        cb.disabled = true;
        cb.title = 'At least one panel must stay visible';
      } else {
        cb.disabled = false;
        cb.title = '';
      }
    });
  }
  updateReleaseGuard();

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
        // var(--track-<path>, <original>), so removing the override
        // restores the original track size and setting it to 0px
        // collapses only this one track, genuinely freeing the space for
        // siblings rather than leaving a blank gap or mis-tracking them).
        var trackProp = el.getAttribute('data-track-prop');
        if (trackProp && el.parentElement) {
          if (cb.checked) {
            el.parentElement.style.removeProperty(trackProp);
          } else {
            el.parentElement.style.setProperty(trackProp, '0px');
          }
        }
        el.style.display = cb.checked ? '' : 'none';
        updateReleaseGuard();
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

  // Theme fix (item 5): cluster (light) is the primary set on <html>;
  // this checkbox is the "secondary toggle... if cheap" the commission
  // allowed for dark, living in the SAME corner popover as the overlay
  // toggle (consistent with that control already sharing the popover
  // rather than adding a second interactive affordance elsewhere).
  var themeToggle = document.getElementById('lyt-theme-toggle');
  themeToggle.addEventListener('change', function () {
    document.documentElement.setAttribute('data-theme', themeToggle.checked ? 'dark' : 'cluster');
  });
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
    # `checked` is now conditional on the registry's own default_visible
    # flag (ledger row ~1735) -- previously every target defaulted to
    # shown, so the attribute was unconditional; boardRail/previewBoard
    # are the first entries to start unchecked, matching the collapsed
    # initial CSS state `render_split`/`_child_wrap` seed for them.
    checklist_html = "".join(
        f'<label class="lyt-menu-row"><input type="checkbox" data-toggle-for="{_slug(label)}"'
        f'{" checked" if default_visible else ""}> {html.escape(label)}</label>'
        for (label, _presence, default_visible) in menu_items.values()
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
  Realization-limit disclosure: the board-priority CSS override
  (`_board_priority_tracks`) reproduces the CP-SAT compiler's
  lexicographic board-maximize solve in closed form for the ONE
  board-composite shape both clean-room encodings use; a future
  encoding using a different shape for its board group is not covered
  and would need the override extended, not silently mis-applied.
  Public Domain (The Unlicense), matching research/lyt/__init__.py's
  license line and the umbrella's ADR-0006 per-file convention.
-->
<html data-theme="cluster">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>{_STYLE}</style>
</head>
<body>
<div id="lyt-root" style="width:100vw;height:100vh;overflow:hidden;position:relative;">
{body_html}
</div>
<button id="lyt-menu-btn" type="button" aria-label="Panel menu" aria-haspopup="true">&#8942;</button>
<div id="lyt-menu-popover" hidden role="menu" aria-label="LengYue panel menu">
  <div class="lyt-menu-title">LengYue</div>
  <div class="lyt-menu-subtitle">Panels</div>
  {checklist_html}
  <div class="lyt-menu-divider"></div>
  <div class="lyt-menu-subtitle">Appearance</div>
  <label class="lyt-menu-row"><input type="checkbox" id="lyt-theme-toggle"> Dark theme</label>
  <div class="lyt-menu-divider"></div>
  <div class="lyt-menu-subtitle">Debug</div>
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
