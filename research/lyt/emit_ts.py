"""Codegen: solve `current-row-repaired` (encodings/current_row_repaired.lyt)
at every representative screen size and emit the solved rectangles as a
GENERATED TypeScript data module for the frontend
(`frontend/src/state/lyt-solved-layout.gen.ts`).

Phase-1 "shadow mode" scope (LYT adoption roadmap): this module is data
only. Nothing in the SPA imports it yet — it exists so the conformance
harness (frontend/scripts/lyt-conformance.mjs) has a solved geometry to
diff the rendered DOM against. See the umbrella CLAUDE.md's ADR-0002 /
scope-discipline sections and `research/lyt/README.md` /
`research/lyt/SPEC-AMENDMENTS.md` for the encoding's own provenance and
disclosed choices; this script adds no new modeling decisions of its own
beyond the two named below.

Solve inputs, reused verbatim from `runner.py` (the CLI runner already
solves this exact encoding at these exact sizes; this script does not
duplicate the solving logic, just formats its own copy of the result as
TypeScript instead of ASCII):

  - the encoding: `encodings/current_row_repaired.lyt`, layout id
    `current-row-repaired` (registered in `runner.REGISTRATIONS` as a
    single screen class, id `default` — the encoding has no second class,
    per runner.py's own module docstring).
  - the four representative screen sizes: `runner.SCREEN_SIZES`.
  - the CP-SAT lexicographic solve: `compiler.solve_lexicographic`, board
    widget `B`, reach-preferred widgets auto-derived by
    `runner._gather_reach_preferred_widgets` (same as the CLI runner).

Disclosed choice (this script's own, not the runner's): "per screen
class" (the build commission's phrasing) is realized here as "per
representative size the runner already tests against the encoding's one
registered class" — `current-row-repaired` registers a single class
(`default`), but `solve_lexicographic` is called with the concrete
`(w_px, h_px)` of each representative size, not the class's own
representative point, so the four sizes genuinely produce four different
solved geometries (confirmed by `runner.py`'s own output: 1920x1080,
2560x1440, and 1280x1024 solve OPTIMAL with three different board
widths; 1080x1920-portrait is INFEASIBLE — the mandatory preserve-banner
floor plus the nav bar leaves no room for a board at portrait
proportions, per SPEC-AMENDMENTS.md Amendment 1). An INFEASIBLE size
still gets an entry in the emitted registry (`status: 'INFEASIBLE'`,
`slots: {}`) rather than being silently dropped — the conformance
harness needs to know a size was attempted and refused, not just see it
missing.

Regeneration command (also written into the generated file's own
header):

    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_ts.py

(writes to ../../frontend/src/state/lyt-solved-layout.gen.ts by default;
pass --out PATH to redirect, e.g. for the emitter's own tests.)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

import lyt_ast as ast
import loader
from compiler import solve_lexicographic, SolveResult
from presence import ALL_PRESENT, resolve_and_validate
from runner import ENCODINGS_DIR, REGISTRATIONS, SCREEN_SIZES, _gather_reach_preferred_widgets

DEFAULT_OUT = Path(__file__).parent.parent.parent / "frontend" / "src" / "state" / "lyt-solved-layout.gen.ts"

# lyt-constants-swap commission (ledger row 1687): generalized from a
# single hardcoded target so this script can also emit the AS-IS baseline
# (`current_row_asis.lyt`) as a SIBLING generated module, not just the
# repaired encoding. `--registration` selects which `runner.REGISTRATIONS`
# entry to solve; `--out` still overrides the output path (its own
# default now derived from the registration, below).
REGISTRATION_OUTPUTS = {
    "current_row_repaired.lyt": Path(__file__).parent.parent.parent
    / "frontend" / "src" / "state" / "lyt-solved-layout.gen.ts",
    "current_row_asis.lyt": Path(__file__).parent.parent.parent
    / "frontend" / "src" / "state" / "lyt-solved-layout-asis.gen.ts",
}

GENERATED_HEADER_TOOL = "research/lyt/emit_ts.py"
GENERATED_REGEN_COMMAND_TMPL = (
    "cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_ts.py --registration {reg}"
)

_REGISTRATION_NAME = "current_row_repaired.lyt"  # default, overridable via --registration


def _find_registration(name: str = _REGISTRATION_NAME):
    for reg in REGISTRATIONS:
        if reg.name == name:
            return reg
    raise LookupError(
        f"runner.REGISTRATIONS has no entry named {name!r} — "
        "emit_ts.py's target encoding moved or was renamed, or --registration "
        "was given a value that doesn't match any runner.py Registration.name."
    )


def _slots_from_result(result: SolveResult) -> Dict[str, Dict[str, int]]:
    """widget id -> {x,y,w,h}, sorted by widget id for deterministic
    emission (dict insertion order already matches sorted `leaf_names`
    traversal order in practice, but sorting explicitly makes the
    determinism a property of THIS function rather than an accident of
    the solver's internal walk order)."""
    out: Dict[str, Dict[str, int]] = {}
    for path, widget in result.leaf_names.items():
        rect = result.rects.get(path)
        if rect is None:
            continue
        if widget in out:
            raise ValueError(
                f"duplicate widget id {widget!r} across leaf paths in solved "
                f"result (paths include {path!r}) — emit_ts.py's TS `slots` "
                "map is keyed by widget id and cannot represent two leaves "
                "sharing one id; this encoding needs distinct widget ids."
            )
        out[widget] = {"x": rect.x, "y": rect.y, "w": rect.w, "h": rect.h}
    return dict(sorted(out.items()))


def build_solved_registrations(
    *, registration_name: str = _REGISTRATION_NAME, time_limit_s: float = 20.0, class_id: Optional[str] = None
) -> "tuple[List[dict], List[dict]]":
    """Solve the target encoding at every representative size in
    `runner.SCREEN_SIZES`, in that list's own order (deterministic —
    SCREEN_SIZES is a fixed literal list, not derived from dict/set
    iteration). Returns `(registrations, screen_classes)`:

    - `registrations`: one dict per representative SIZE, JSON-serializable,
      in the shape the TS emitter below turns into `LytSolvedRegistration`
      literals. Its own `wPx`/`hPx` are the SOLVED-AGAINST size (e.g.
      1080x1920 for the portrait entry), not the class's representative
      point.
    - `screen_classes`: one dict per registered `ast.ScreenClass` (its OWN
      representative point, §4.4 — e.g. `default` is 1920x1080, the point
      nearest-neighbor measures distance against), independent of which
      size was solved. Kept separate from `registrations` deliberately: a
      single-class registration like this one is solved at four different
      sizes, all against the SAME one class, so folding a class's
      representative point out of the per-size `registrations` list (as an
      earlier draft of this function did, by reading `wPx`/`hPx` off the
      last registration touching that class id) silently returns whichever
      size solved last rather than the class's own declared point — this
      split is the fix.

    `class_id` (W1 REPAIR addition, ledger row 1781; conformance-harness
    need — `frontend/scripts/lyt-conformance.mjs`'s new 'landscape' source):
    solve a NAMED class of a multi-class registration explicitly, rather
    than nearest-neighbor-selecting per size (runner.py's own job) — every
    representative SIZE is solved against the SAME caller-chosen class,
    matching this function's own single-class behavior below, just with
    the class picked by name instead of being the registration's only
    option.

    Presence (W1 REPAIR, review's "Conformance harness" finding — the
    prior rejected attempt's conformance reference was presence-BLIND,
    solving boardRail/previewBoard as always-present even though the W1
    Vue realization genuinely omits them by default, `lyt-layout.gen.ts`'s
    own `presenceDefaultVisible: false`): every registration's own
    DECLARED `default_valuation` (AMENDMENT 4, `presence.py`) is resolved
    and pruned BEFORE solving, exactly like `runner.py.run_all` already
    does — `presence.ALL_PRESENT` (empty absent set) for every
    registration but `lengyue_landscape+portrait`, so this is a no-op,
    byte-identical solve for every OTHER registration this script targets
    (`current_row_repaired.lyt`, `current_row_asis.lyt`); only the
    lengyue registration's reference now correctly excludes
    boardRail/previewBoard, matching the live render it's diffed against.
    """
    reg = _find_registration(registration_name)
    layouts: Dict[str, ast.Slot] = {}
    for f in reg.files:
        text = (ENCODINGS_DIR / f).read_text()
        layouts.update(loader.load_layouts(text, waivers=reg.waivers))
    default_valuation = getattr(reg, "default_valuation", ALL_PRESENT)
    layouts = resolve_and_validate(layouts, reg.layout_by_class.values(), default_valuation)

    screen_classes: List[dict] = [
        {"id": c.id, "wPx": c.w_px, "hPx": c.h_px} for c in sorted(reg.classes, key=lambda c: c.id)
    ]

    out: List[dict] = []
    for label, w, h in SCREEN_SIZES:
        cls: Optional[ast.ScreenClass]
        if class_id is not None:
            matches = [c for c in reg.classes if c.id == class_id]
            if not matches:
                raise LookupError(
                    f"registration {reg.name!r} has no class id {class_id!r} — "
                    f"available: {sorted(c.id for c in reg.classes)}"
                )
            cls = matches[0]
        elif len(reg.classes) == 1:
            cls = reg.classes[0]
        else:
            # This registration carries more than one class and no
            # --class-id was given. Fail loud rather than silently
            # picking one, per ADR-0002 — nearest-neighbor-per-size
            # selection is runner.py's own job, not this script's.
            raise NotImplementedError(
                f"registration {reg.name!r} carries {len(reg.classes)} "
                "screen classes and no class_id was given; pass "
                "--class-id explicitly (e.g. 'landscape') or extend this "
                "function with nearest-neighbor class selection."
            )
        layout_name = reg.layout_by_class[cls.id]
        slot = layouts[layout_name]
        reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
        result = solve_lexicographic(
            slot,
            class_id=cls.id,
            w_px=w,
            h_px=h,
            board_widget=reg.board_widget,
            reach_preferred_widgets=reach,
            time_limit_s=time_limit_s,
        )
        if result.status in ("OPTIMAL", "FEASIBLE"):
            slots = _slots_from_result(result)
        else:
            slots = {}
        out.append(
            {
                "classId": cls.id,
                "label": label,
                "wPx": w,
                "hPx": h,
                "status": result.status,
                "slots": slots,
            }
        )
    return out, screen_classes


def _ts_rect_literal(rect: Dict[str, int]) -> str:
    return f'{{ x: {rect["x"]}, y: {rect["y"]}, w: {rect["w"]}, h: {rect["h"]} }}'


def _ts_slots_literal(slots: Dict[str, Dict[str, int]], indent: str) -> str:
    if not slots:
        return "{}"
    lines = [f"{indent}  {json.dumps(widget)}: {_ts_rect_literal(rect)}," for widget, rect in slots.items()]
    return "{\n" + "\n".join(lines) + f"\n{indent}}}"


def render_ts(
    registrations: List[dict],
    screen_classes: List[dict],
    *,
    registration_name: str = _REGISTRATION_NAME,
) -> str:
    """Pure formatting: `(registrations, screen_classes)` (as returned by
    `build_solved_registrations`) -> the full .gen.ts source text.
    Deterministic given deterministic input — no wall-clock timestamp, no
    hostname, no random iteration order — so re-running the emitter
    against an unchanged solve produces a byte-identical file (verified
    by the emitter's own tests)."""
    reg = _find_registration(registration_name)
    layout_name = next(iter(reg.layout_by_class.values()))
    source_encoding = (
        f"research/lyt/encodings/{reg.files[0]} (layout `{layout_name}`)"
    )
    lines: List[str] = []
    lines.append("/**")
    lines.append(" * GENERATED FILE — do not hand-edit.")
    lines.append(f" * Tool: {GENERATED_HEADER_TOOL}")
    lines.append(f" * Source encoding: {source_encoding}")
    lines.append(
        " * Solve inputs: CP-SAT lexicographic solve (research/lyt/compiler.py"
        " solve_lexicographic), board widget 'B', reach-preferred widgets"
        " auto-derived (research/lyt/runner.py _gather_reach_preferred_widgets),"
        " representative sizes research/lyt/runner.py SCREEN_SIZES."
    )
    if reg.waivers:
        lines.append(
            " * Loaded via the --baseline waiver mechanism (research/lyt/"
            "baseline.py BASELINE_WAIVERS) — this encoding is a disclosed,"
            " honestly non-conformant AS-IS transcription, not a design"
            " proposal; see the source .lyt file's own header."
        )
    lines.append(f" * Regenerate: {GENERATED_REGEN_COMMAND_TMPL.format(reg=reg.name)}")
    if registration_name == "current_row_asis.lyt":
        lines.append(
            " * Phase 2 (lyt-constants-swap, ledger row 1687): plain data,"
            " but no longer shadow-only — layout-model.ts imports"
            " RESIZER_WIDTH_PX from this module (the one slot the"
            " conformance harness showed solved+measured geometry agreeing"
            " on exactly, at every measured size). See"
            " .claude/dispatch-reports/lyt-constants-swap-build.md."
        )
    else:
        lines.append(
            " * Phase-1 shadow mode (LYT adoption roadmap): plain data only, no"
            " behaviour, no runtime import from app code yet — see"
            " .claude/dispatch-reports/lyt-shadow-harness-build.md."
        )
    lines.append(" *")
    lines.append(" * Public Domain (The Unlicense), matching research/lyt/__init__.py's")
    lines.append(" * license line and the umbrella's ADR-0006 per-file convention.")
    lines.append(" */")
    lines.append("")
    lines.append("export interface LytRect {")
    lines.append("  readonly x: number;")
    lines.append("  readonly y: number;")
    lines.append("  readonly w: number;")
    lines.append("  readonly h: number;")
    lines.append("}")
    lines.append("")
    lines.append("export type LytSolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';")
    lines.append("")
    lines.append("export interface LytScreenClass {")
    lines.append("  readonly id: string;")
    lines.append("  readonly wPx: number;")
    lines.append("  readonly hPx: number;")
    lines.append("}")
    lines.append("")
    lines.append("export interface LytSolvedRegistration {")
    lines.append("  /** LYT screen-class id this size was solved against (§4.4). */")
    lines.append("  readonly classId: string;")
    lines.append("  /** Representative-size label, e.g. '1920x1080' (research/lyt/runner.py SCREEN_SIZES). */")
    lines.append("  readonly label: string;")
    lines.append("  readonly wPx: number;")
    lines.append("  readonly hPx: number;")
    lines.append("  readonly status: LytSolveStatus;")
    lines.append("  /** widget id -> solved rect, viewport-relative px. Empty when status is INFEASIBLE. */")
    lines.append("  readonly slots: Readonly<Record<string, LytRect>>;")
    lines.append("}")
    lines.append("")
    lines.append("export const LYT_SCREEN_CLASSES: readonly LytScreenClass[] = [")
    for c in screen_classes:
        lines.append(f'  {{ id: {json.dumps(c["id"])}, wPx: {c["wPx"]}, hPx: {c["hPx"]} }},')
    lines.append("];")
    lines.append("")
    lines.append("export const LYT_SOLVED_LAYOUT: readonly LytSolvedRegistration[] = [")
    for r in registrations:
        lines.append("  {")
        lines.append(f'    classId: {json.dumps(r["classId"])},')
        lines.append(f'    label: {json.dumps(r["label"])},')
        lines.append(f'    wPx: {r["wPx"]},')
        lines.append(f'    hPx: {r["hPx"]},')
        lines.append(f'    status: {json.dumps(r["status"])},')
        lines.append(f'    slots: {_ts_slots_literal(r["slots"], "    ")},')
        lines.append("  },")
    lines.append("];")
    lines.append("")
    lines.append("export const LYT_SOLVED_BY_LABEL: Readonly<Record<string, LytSolvedRegistration>> = {")
    for i, r in enumerate(registrations):
        lines.append(f'  {json.dumps(r["label"])}: LYT_SOLVED_LAYOUT[{i}],')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser_ = argparse.ArgumentParser(description=__doc__)
    parser_.add_argument(
        "--registration",
        default=_REGISTRATION_NAME,
        help="runner.REGISTRATIONS entry name to solve+emit "
        "(default: current_row_repaired.lyt; also supports "
        "current_row_asis.lyt, the --baseline AS-IS encoding)",
    )
    parser_.add_argument(
        "--out",
        type=Path,
        default=None,
        help="output .ts path (default: REGISTRATION_OUTPUTS[--registration])",
    )
    parser_.add_argument(
        "--class-id",
        default=None,
        help="solve a NAMED screen class of a multi-class registration explicitly "
        "(e.g. 'landscape' for lengyue_landscape+portrait) instead of relying on "
        "the single-class default.",
    )
    args = parser_.parse_args(argv)
    out = args.out or REGISTRATION_OUTPUTS.get(args.registration)
    if out is None:
        raise LookupError(
            f"no default output path registered for {args.registration!r} — "
            "add an entry to REGISTRATION_OUTPUTS or pass --out explicitly."
        )

    registrations, screen_classes = build_solved_registrations(
        registration_name=args.registration, class_id=args.class_id
    )
    text = render_ts(registrations, screen_classes, registration_name=args.registration)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(f"[emit_ts] wrote {out} ({len(registrations)} registrations)")
    for r in registrations:
        print(f"  {r['label']:22s} status={r['status']:10s} slots={len(r['slots'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
