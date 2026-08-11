"""CLI runner: for each encoding under encodings/*.lyt, at each
representative screen size, pick a screen class by the nearest-neighbor
rule (§4.4), solve, and print the solved rectangles plus an ASCII render.

Disclosed narrowing: only lengyue_landscape.lyt / lengyue_portrait.lyt
register TWO screen classes (landscape and portrait), because those are
the only two of the five worked encodings that come as a *pair* of whole
trees for two classes (§5.4/§5.5). q5go.lyt, ogs.lyt, and
current_row_repaired.lyt each give exactly one tree — the document never
demonstrates a second class for them — so each is registered as a single
default class that always wins nearest-neighbor, at every representative
size. This still exercises the class-selection machinery (it always picks
the one class there is), just not a genuine multi-class choice.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Tuple

import lyt_ast as ast
import loader
from advisory import compute_t_group_shortfalls, format_shortfalls
from baseline import BASELINE_WAIVERS
from compiler import solve_lexicographic
from presence import ALL_PRESENT, PresenceValuation, resolve_and_validate
from render import render_ascii

ENCODINGS_DIR = Path(__file__).parent / "encodings"

SCREEN_SIZES: List[Tuple[str, int, int]] = [
    ("1920x1080", 1920, 1080),
    ("2560x1440", 2560, 1440),
    ("1280x1024", 1280, 1024),
    ("1080x1920-portrait", 1080, 1920),
]


@dataclass
class Registration:
    name: str
    files: List[str]  # every file whose `layout NAME = ...` fragments get merged
    board_widget: str
    classes: List[ast.ScreenClass]
    layout_by_class: Dict[str, str]  # class id -> layout name (from any of `files`)
    # `--baseline` load-mode support (lyt-constants-swap commission):
    # layout name -> declared wellformed.Waiver list. Empty for every
    # registration except the as-is baseline — `load_layouts` treats an
    # absent/empty map exactly like the pre-waiver `waivers=None` shape,
    # so this default changes no other registration's behavior.
    waivers: Dict[str, list] = field(default_factory=dict)
    # AMENDMENT 4 (ledger row 1737, presence.py): the LANGUAGE SURFACE for
    # per-valuation solving (layout-language-consult.md §6, line 636-641:
    # "solve the default valuation plus any valuation the author lists as
    # common"). `default_valuation` names which release-toggled widgets
    # are ABSENT by default — `presence.ALL_PRESENT` (empty absent set) for
    # every registration that declares no default-off toggle of its own
    # (q5go/ogs/current-row-repaired/current-row-asis all keep this
    # default, byte-identical to this prototype's pre-Amendment-4
    # behavior). `common_valuations` is an optional list of further named
    # valuations "the author lists as common" (the ruling's own phrase);
    # empty when the author names none, which every registration below
    # does today — no worked encoding's own header names a second common
    # valuation, so none is invented here (disclosed narrowing, the same
    # posture `lyt_ast.Program`'s own docstring takes for objectivesec).
    default_valuation: PresenceValuation = field(default_factory=lambda: ALL_PRESENT)
    common_valuations: List[PresenceValuation] = field(default_factory=list)


REGISTRATIONS: List[Registration] = [
    Registration(
        name="q5go.lyt",
        files=["q5go.lyt"],
        board_widget="B",
        classes=[ast.ScreenClass(id="default", w_px=1920, h_px=1080)],
        layout_by_class={"default": "q5go"},
    ),
    Registration(
        name="ogs.lyt",
        files=["ogs.lyt"],
        board_widget="B",
        classes=[ast.ScreenClass(id="default", w_px=1920, h_px=1080)],
        layout_by_class={"default": "ogs"},
    ),
    Registration(
        name="current_row_repaired.lyt",
        files=["current_row_repaired.lyt"],
        board_widget="B",
        classes=[ast.ScreenClass(id="default", w_px=1920, h_px=1080)],
        layout_by_class={"default": "current-row-repaired"},
    ),
    Registration(
        # AS-IS conformance baseline (lyt-constants-swap commission,
        # ledger row 1687) — loaded via the `--baseline` waiver map
        # (`baseline.BASELINE_WAIVERS`), NOT strict mode: this
        # encoding is HONESTLY L2-non-conformant at two disclosed
        # sites (see the .lyt file's own header), waived rather than
        # repaired. `run_all` below threads `reg.waivers` into
        # `loader.load_layouts` for every registration (an empty dict
        # for every OTHER registration, so this changes no existing
        # registration's behavior).
        name="current_row_asis.lyt",
        files=["current_row_asis.lyt"],
        board_widget="B",
        classes=[ast.ScreenClass(id="default", w_px=1920, h_px=1080)],
        layout_by_class={"default": "current-row-asis"},
        waivers=BASELINE_WAIVERS,
    ),
    Registration(
        # Merged: this is the one pair of §5 encodings that come as TWO
        # whole trees for TWO classes (§5.4/§5.5) — registering them
        # together, rather than as two single-class files, is what makes
        # nearest_class() actually choose between trees instead of
        # trivially always picking the file's one class. See runner.py's
        # module docstring.
        name="lengyue_landscape+portrait",
        files=["lengyue_landscape.lyt", "lengyue_portrait.lyt"],
        board_widget="B",
        classes=[
            ast.ScreenClass(id="landscape", w_px=1920, h_px=1080),
            ast.ScreenClass(id="portrait", w_px=1080, h_px=1920),
        ],
        layout_by_class={"landscape": "lengyue-landscape", "portrait": "lengyue-portrait"},
        # AMENDMENT 4 (ledger row 1737): boardRail and previewBoard are
        # the two live default-OFF, user-release toggles (both encodings'
        # own headers, `lyt-tree-always-visible-build.md`) — this is the
        # DEFAULT valuation every downstream consumer (runner.py's own
        # `run_all`, emit_mockup.py's overlay, a future emit_ts.py target)
        # solves as the PRIMARY result, per §6's own line 636-641. Both
        # widget ids are shared verbatim between the landscape and
        # portrait trees, so one PresenceValuation covers both classes.
        default_valuation=PresenceValuation(
            name="default", absent_widgets=frozenset({"boardRail", "previewBoard"})
        ),
    ),
]


def nearest_class(classes: List[ast.ScreenClass], w: int, h: int) -> ast.ScreenClass:
    """§4.4 line 415-418: 'argmin over classes of ||(w,h) - (class.w,
    class.h)|| (scale-normalized distance recommended, so 1280x1440 and
    2560x2880 pick the same class)'. A raw Euclidean distance on (w,h) is
    NOT scale-normalized (it would prefer whichever class's absolute pixel
    count happens to be closer, regardless of aspect). We use log-aspect
    distance instead: dist = |log(w/h) - log(class.w/class.h)| — invariant
    to uniform scaling, which is exactly the property the document asks
    for. Disclosed choice of metric, since §4.4 names the *property*
    wanted but not the formula.
    """
    target_log_aspect = math.log(w / h)
    best = None
    best_d = None
    for c in classes:
        d = abs(math.log(c.w_px / c.h_px) - target_log_aspect)
        if best_d is None or d < best_d:
            best, best_d = c, d
    assert best is not None
    return best


def _gather_reach_preferred_widgets(slot: ast.Slot, board_widget: str, path: str = "root") -> List[str]:
    """F9 disclosure (review row 1609,
    .claude/dispatch-reports/lyt-compiler-prototype-review.md): §4.5's
    `ObjectiveTermReachPreferred` carries an author-declared
    `weight: Record<WidgetId, number>` (consult-doc line 429). This
    prototype has no `objectivesec` concrete syntax to declare one
    (disclosed invention 1/11), so — rather than leave the reach-preferred
    term unimplementable — the runner auto-derives the reach SET itself
    (every non-board leaf with a plain px `pref`, below) and
    `compiler.py`'s stage 2 sums shortfall UNWEIGHTED (every reach widget
    counts equally). Both the auto-derivation and the uniform weighting
    are real behavioral choices the document's §4.5 doesn't make for us,
    and neither was previously stated outright (only the absence of
    objectivesec syntax was disclosed) — named explicitly here."""
    out: List[str] = []
    node = slot.node
    if isinstance(node, ast.Leaf):
        if node.widget != board_widget and isinstance(slot.sizing.pref, ast.Extent) and slot.sizing.pref.unit == "px":
            out.append(node.widget)
        return out
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            out += _gather_reach_preferred_widgets(child, board_widget, f"{path}/{node.axis.upper()}{i}")
    elif isinstance(node, ast.Exclusive):
        for i, child in enumerate(node.children):
            out += _gather_reach_preferred_widgets(child, board_widget, f"{path}/T{i}")
    return out


def run_all(*, cols: int = 100, rows: int = 36, time_limit_s: float = 20.0) -> int:
    """AMENDMENT 4 (ledger row 1737): solves the registration's own
    DECLARED DEFAULT valuation as the primary result — for every
    registration but `lengyue_landscape+portrait` this is
    `presence.ALL_PRESENT` (empty absent set), so `layouts[layout_name]`
    is solved byte-identically to this function's pre-Amendment-4
    behavior. For the lengyue registration, the tree solved here is the
    PRUNED one (`presence.resolve_and_validate`, boardRail/previewBoard
    genuinely removed) — see that module's own docstring for why this
    alone is sufficient to make the compiler's `(k-1)*gap` partition term
    use the PRESENT count, with no compiler.py change needed."""
    exit_code = 0
    for reg in REGISTRATIONS:
        layouts: Dict[str, ast.Slot] = {}
        for f in reg.files:
            text = (ENCODINGS_DIR / f).read_text()
            layouts.update(loader.load_layouts(text, waivers=reg.waivers))
        layouts = resolve_and_validate(layouts, reg.layout_by_class.values(), reg.default_valuation)
        print("=" * 100)
        print(f"ENCODING {reg.name}  (presence valuation: {reg.default_valuation.name!r}, absent={sorted(reg.default_valuation.absent_widgets)})")
        print("=" * 100)
        for label, w, h in SCREEN_SIZES:
            cls = nearest_class(reg.classes, w, h)
            layout_name = reg.layout_by_class[cls.id]
            slot = layouts[layout_name]
            reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
            try:
                result = solve_lexicographic(
                    slot,
                    class_id=cls.id,
                    w_px=w,
                    h_px=h,
                    board_widget=reg.board_widget,
                    reach_preferred_widgets=reach,
                    time_limit_s=time_limit_s,
                )
            except Exception as exc:  # noqa: BLE001 -- surfaced to stdout, ADR-0002 fail-loud
                print(f"[{label}] SOLVE ERROR: {exc}")
                exit_code = 1
                continue
            print(f"\n--- screen {label} -> class '{cls.id}' -> layout '{layout_name}' ---")
            if result.status not in ("OPTIMAL", "FEASIBLE"):
                print(f"  {result.status}")
                exit_code = 1
                continue
            print(f"  objective_values (stage-by-stage) = {result.objective_values}")
            for path in sorted(result.leaf_names):
                widget = result.leaf_names[path]
                rect = result.rects.get(path)
                if rect is None:
                    continue
                print(f"    {widget:20s} x={rect.x:5d} y={rect.y:5d} w={rect.w:5d} h={rect.h:5d}")
            print()
            print(render_ascii(result, slot, cols=cols, rows=rows))
            # AMENDMENT 5 (ledger row 1937): advisory-only per-T-group
            # shortfall report -- never affects `exit_code` (ADR-0011
            # Rule 5, "a judgment-shaped output never gates"; see
            # advisory.py's own module docstring).
            shortfalls = compute_t_group_shortfalls(slot, result)
            if shortfalls:
                print(format_shortfalls(shortfalls))
                print()
    return exit_code


if __name__ == "__main__":
    sys.exit(run_all())
