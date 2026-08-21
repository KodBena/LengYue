"""ASCII-art renderer for a SolveResult: a proportional character grid so a
human can eyeball the solved layout without a GUI (build commission item
4: "ASCII-art the solved layout ... so a human can eyeball it").

Only leaf rectangles are drawn (Split/Exclusive rectangles are the union of
their leaf descendants and would just double-draw over them). Each leaf
gets a bordered box; the widget id is centered inside if it fits, elided
with '~' otherwise.
"""
from __future__ import annotations

from typing import Dict, List

import lyt_ast as ast
from compiler import SolveResult


def _leaf_rects(slot: ast.Slot, path: str, out: Dict[str, str]) -> None:
    node = slot.node
    if isinstance(node, ast.Leaf):
        out[path] = node.widget
        return
    if isinstance(node, ast.Split):
        for i, child in enumerate(node.children):
            _leaf_rects(child, f"{path}/{node.axis.upper()}{i}", out)
        return
    if isinstance(node, ast.Exclusive):
        # Only render the FIRST child of a tab group (the others occupy
        # the identical rectangle, per §4.1's "every child receives the
        # same rectangle" — drawing all of them would just overwrite the
        # same cells with different labels). Rendered here as a
        # documentation choice, not a semantic one.
        if node.children:
            _leaf_rects(node.children[0], f"{path}/T0", out)
        return


def render_ascii(result: SolveResult, root_slot: ast.Slot, *, cols: int = 100, rows: int = 40) -> str:
    if result.status not in ("OPTIMAL", "FEASIBLE"):
        return f"<{result.class_id}: {result.status}, nothing to render>"

    names: Dict[str, str] = {}
    _leaf_rects(root_slot, "root", names)

    grid: List[List[str]] = [[" "] * cols for _ in range(rows)]
    sx = cols / result.w_px
    sy = rows / result.h_px

    for path, widget in names.items():
        rect = result.rects.get(path)
        if rect is None:
            continue
        x0 = int(rect.x * sx)
        y0 = int(rect.y * sy)
        x1 = max(x0 + 1, int((rect.x + rect.w) * sx))
        y1 = max(y0 + 1, int((rect.y + rect.h) * sy))
        x1 = min(x1, cols)
        y1 = min(y1, rows)
        if x1 <= x0 or y1 <= y0:
            continue
        for xx in range(x0, x1):
            if 0 <= y0 < rows:
                grid[y0][xx] = "-"
            if 0 <= y1 - 1 < rows:
                grid[y1 - 1][xx] = "-"
        for yy in range(y0, y1):
            if 0 <= x0 < cols:
                grid[yy][x0] = "|"
            if 0 <= x1 - 1 < cols:
                grid[yy][x1 - 1] = "|"
        label = widget[: max(0, x1 - x0 - 2)]
        if label and y1 - y0 >= 2:
            mid_y = (y0 + y1) // 2
            start_x = x0 + max(1, (x1 - x0 - len(label)) // 2)
            for i, ch in enumerate(label):
                xx = start_x + i
                if x0 < xx < x1 - 1:
                    grid[mid_y][xx] = ch

    lines = ["+" + "-" * cols + "+"]
    for row in grid:
        lines.append("|" + "".join(row) + "|")
    lines.append("+" + "-" * cols + "+")
    header = f"{result.class_id}  {result.w_px}x{result.h_px}px  status={result.status}  objective={result.objective_values}"
    return header + "\n" + "\n".join(lines)
