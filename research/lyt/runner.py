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
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import lyt_ast as ast
import loader
from compiler import solve_lexicographic
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
    exit_code = 0
    for reg in REGISTRATIONS:
        layouts: Dict[str, ast.Slot] = {}
        for f in reg.files:
            text = (ENCODINGS_DIR / f).read_text()
            layouts.update(loader.load_layouts(text))
        print("=" * 100)
        print(f"ENCODING {reg.name}")
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
    return exit_code


if __name__ == "__main__":
    sys.exit(run_all())
