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
import orientation
from advisory import compute_t_group_shortfalls, format_shortfalls
from baseline import BASELINE_WAIVERS
from compiler import solve_lexicographic
from presence import ALL_PRESENT, PresenceValuation, prune_absent, resolve_and_validate
from render import render_ascii

ENCODINGS_DIR = Path(__file__).parent / "encodings"
# LYT relations-first amendment, dispatch A (ledger rows 2396/2397/2399/2400,
# ruling 1): ogs.lyt/q5go.lyt moved out of encodings/ into fixtures/reference/
# -- they transcribe third-party UIs (OGS's web client, q5go's desktop
# editor), not LengYue's own frontend, so they are reference/comparison
# fixtures outside the governed layout-language surface (SPEC.md §6), the
# same way a golden-file test fixture sits outside a "no magic numbers in
# application code" lint rule's own reach. `resolve_encoding_file` below is
# what keeps every `Registration.files` entry (still a bare filename)
# resolvable after the move, for every consumer that reads a registration's
# own `.lyt` source text.
FIXTURES_REFERENCE_DIR = Path(__file__).parent / "fixtures" / "reference"
# LYT relations-first amendment, dispatch C2 (ledger rows 2426/2427): a
# second sibling fixture directory, for the opposite reason ogs/q5go moved --
# current_row_asis.lyt/current_row_repaired.lyt are FIRST-party transcriptions
# (today's own SPA row-axis layout, measured, not designed) moved out of
# encodings/ because they are transcriptions of reality rather than designs
# under governance, distinct from the third-party fixtures/reference/ pair.
FIXTURES_TRANSCRIPTION_DIR = Path(__file__).parent / "fixtures" / "transcription"


def resolve_encoding_file(filename: str) -> Path:
    """Resolves a `Registration.files` entry to its on-disk path:
    `encodings/` first (every ordinary encoding, unchanged since before the
    dispatch A amendment), `fixtures/reference/` next (ogs.lyt/q5go.lyt,
    third-party transcriptions), `fixtures/transcription/` last
    (current_row_asis.lyt/current_row_repaired.lyt, first-party
    transcriptions, post dispatch C2 move). Refused loudly
    (`FileNotFoundError`, not a silent None) when no location has the file
    -- a dangling reference after a fixture move is a failure this
    dispatch's own audit discipline names, not a footnote."""
    p = ENCODINGS_DIR / filename
    if p.exists():
        return p
    p2 = FIXTURES_REFERENCE_DIR / filename
    if p2.exists():
        return p2
    p3 = FIXTURES_TRANSCRIPTION_DIR / filename
    if p3.exists():
        return p3
    raise FileNotFoundError(
        f"{filename!r} not found in {ENCODINGS_DIR}, {FIXTURES_REFERENCE_DIR}, "
        f"or {FIXTURES_TRANSCRIPTION_DIR}"
    )


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
    # LYT presence arc P1 (row 2333, mobile/portrait repetition-first
    # disposition; `.claude/dispatch-reports/lyt-p1-presence-model.md`):
    # an OPTIONAL per-class override of `default_valuation`. Empty (the
    # default) is byte-identical to every pre-P1 registration -- every
    # class solves the ONE shared `default_valuation` above, unchanged.
    # This exists because `default_valuation` is otherwise ONE object
    # shared across every class a registration declares
    # (`layout_by_class`), and the portrait repetition-first disposition
    # needs the control-panel tab group absent by DEFAULT on portrait
    # specifically, WITHOUT touching landscape's own default (row 2333's
    # own "do NOT shrink any desktop demand to get there") -- a single
    # shared valuation cannot express "absent for this class, present for
    # that one" (naming an identity absent that a DIFFERENT class's tree
    # never declares as a release-toggle/demote would make
    # `validate_valuation` refuse THAT class's own load). Keyed by
    # `ast.ScreenClass.id`; a class absent from this map falls back to
    # `default_valuation` unchanged.
    default_valuation_by_class: Dict[str, PresenceValuation] = field(default_factory=dict)


def valuation_for_class(reg: "Registration", class_id: str) -> PresenceValuation:
    """The one place every consumer (`run_all`, `emit_ts.py`,
    `emit_mockup.py`, `coverage_matrix.py`) resolves which valuation a
    given class solves as its own "default" -- so the per-class override
    above and the shared fallback can never drift between callers (LYT
    presence arc P1, row 2333)."""
    return reg.default_valuation_by_class.get(class_id, reg.default_valuation)


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
        #
        # M2 STAGE B2b (ledger row 2108, PALETTE ADOPTION): "A_setup"
        # joins the set — the setup-tool palette is now a genuine
        # @toggle(user, release) presence slot (both encodings' own M2
        # STAGE B2b header note) whose real default state is closed,
        # matching boardRail/previewBoard's own default-off convention.
        default_valuation=PresenceValuation(
            name="default",
            absent_widgets=frozenset({"boardRail", "previewBoard", "A_setup"}),
        ),
        # LYT presence arc P1 (row 2333, mobile/portrait repetition-first
        # disposition): PORTRAIT ONLY, on top of the shared default above,
        # the control-panel tab group (`"BLACK BOX"`, the `T(...)`
        # Exclusive's own `[BLACK BOX]` tag -- see
        # `lengyue_portrait.lyt`'s own header note for the full
        # derivation and the row-2333 disposition it implements) is ALSO
        # absent by default -- board + match/play (`tree`) primary,
        # every control-panel tab (analysis graphs, browse tables,
        # settings, debug) secondary at phone widths. Landscape's own
        # `default_valuation` (above) is UNCHANGED -- `valuation_for_class`
        # is the single seam every consumer resolves this through.
        # Named "default" (same name as the shared `default_valuation`
        # above, not "default-portrait") -- each CLASS's own default is
        # keyed and reported separately already (`valuation_for_class`,
        # per-class print lines, per-class overlay JSON), so there is no
        # collision to disambiguate by name; reusing "default" is the
        # more honest label ("this IS portrait's default"), not an
        # alternate valuation portrait ALSO happens to solve.
        default_valuation_by_class={
            "portrait": PresenceValuation(
                name="default",
                absent_widgets=frozenset(
                    {"boardRail", "previewBoard", "A_setup", "BLACK BOX"}
                ),
            ),
        },
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
    use the PRESENT count, with no compiler.py change needed.

    LYT presence arc P1 (row 2333): resolved and validated PER CLASS now
    (`valuation_for_class`), not once for the whole registration — a
    registration may declare a PER-CLASS override
    (`default_valuation_by_class`) that only some of its classes use
    (portrait, for the lengyue registration; every other class, and every
    other registration, still resolves the one shared `default_valuation`
    unchanged, since `default_valuation_by_class` defaults to empty)."""
    exit_code = 0
    for reg in REGISTRATIONS:
        layouts: Dict[str, ast.Slot] = {}
        # AMENDMENT 9 (ledger row 2310): `orientation.rebind` re-loads a
        # layout's own SOURCE TEXT a second time (see that function's own
        # docstring for why) once a residual-holding leaf's orientation has
        # been derived from a solve -- this needs the text each layout name
        # came from, kept alongside the merged `layouts` dict the same way
        # `reg.layout_by_class` already tracks which layout a class solves.
        layout_text: Dict[str, str] = {}
        raw_layouts: Dict[str, ast.Slot] = {}
        for f in reg.files:
            text = resolve_encoding_file(f).read_text()
            names = loader.load_layouts(text, waivers=reg.waivers)
            raw_layouts.update(names)
            for name in names:
                layout_text[name] = text
        # LYT presence arc P1: one `resolve_and_validate` call PER CLASS,
        # each against that class's own resolved valuation
        # (`valuation_for_class`) — the shared-registration batched call
        # this replaces could not express "this class's own default
        # differs from that one's" without either raising (a name absent
        # from some OTHER class's tree) or silently applying one class's
        # absence to every class.
        layout_valuation: Dict[str, PresenceValuation] = {}
        for class_id, layout_name in reg.layout_by_class.items():
            valuation = valuation_for_class(reg, class_id)
            layouts.update(resolve_and_validate(raw_layouts, [layout_name], valuation))
            layout_valuation[layout_name] = valuation
        print("=" * 100)
        print(f"ENCODING {reg.name}")
        for class_id, layout_name in sorted(reg.layout_by_class.items()):
            v = layout_valuation[layout_name]
            print(f"  class {class_id!r} -> layout {layout_name!r}  (presence valuation: {v.name!r}, absent={sorted(v.absent_widgets)})")
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
            # AMENDMENT 9 (ledger row 2310): derive any residual-holding
            # leaf's orientation from THIS solve's own geometry and re-bind
            # the L14 role frame through it (`orientation.rebind`'s own
            # docstring). NOT a no-op against the real reference encodings
            # today -- `B`/`settingsPane`/`otherBand` genuinely are
            # residual-holding, so this genuinely re-derives and re-binds
            # for all three, every size -- but it changes nothing THIS
            # function prints, since none of `Leaf.orientation`/the L14
            # role-frame fields is read anywhere below (only solved
            # rectangles, which orientation-dependent facts never feed --
            # see `orientation.py`'s own "WHY THIS IS SOLVER-INERT").
            # Presence pruning (above) already ran on `slot`; re-apply it to the
            # rebound tree too, so `slot`/`result.rects` (keyed by the
            # PRUNED tree's own paths) stay consistent for the render/
            # shortfall calls below — a no-op re-prune when rebind itself
            # was a no-op, since pruning an already-pruned tree by the same
            # absent set removes nothing further.
            rebound = orientation.rebind(
                layout_text[layout_name], layout_name, slot, result, waivers=reg.waivers
            )
            if rebound is not slot:
                # LYT presence arc P1: re-prune with THIS layout's own
                # resolved valuation (`layout_valuation`), not the
                # registration-wide `reg.default_valuation` — the two
                # differ for portrait under the lengyue registration.
                slot = prune_absent(rebound, layout_valuation[layout_name].absent_widgets)
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
