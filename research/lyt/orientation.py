"""AMENDMENT 9 (ledger row 2310) — derived orientation.

THE RULING, verbatim substance (commissioner-ratified, ledger row 2310):
tree orientation is DERIVED, not authored. A leaf's mount orientation
(`Leaf.orientation`, `orient h|v` concrete syntax, METAMODEL WAVE item 1)
derives from the aspect ratio of its RESIDUAL SLOT — the box left over
after its Split siblings are placed — whenever that leaf genuinely IS its
Split's unique residual-holding child (`wellformed.find_residual_child`).
Because the residual-holding sibling solves LAST (its own along-extent is
whatever the partition equality leaves over once every other sibling's
extent is pinned), the residual box's aspect is well-defined BEFORE the
leaf's own orientation-dependent facts (the L14 `along`/`across` role
frame — `ceiling`/`floor`/`edge`/`elastic`/`unit`/`scroll`/`min <axis>`
declared by role rather than physical axis) enter at all: siblings solve
first, the residual box's aspect picks h|v, THEN the role frame binds
through the chosen orientation. Single pass, no fixed point — see "WHY
THIS IS SOLVER-INERT" below for the structural reason no fixed point
exists to close.

Sub-rulings:
  (a) Derivation is the DEFAULT. The authored `orient` key survives only
      as an override for NON-residual placements (an ordinary leaf, not
      its Split's unique elastic sibling); an authored `orient` on a
      residual-holding leaf is a wellformedness REFUSAL — L18
      (`wellformed.find_l18_violations`), not something this module
      enforces (it only ever runs on an already-loaded, already-L18-clean
      tree, so a residual leaf's `orientation_declared` is always False
      here by the time this module sees it).
  (b) An aspect TIE at exactly 1 falls to VERTICAL — `derive_orientation`
      below states this as a spec rule (1 is a legitimate bare quantity,
      not an error or an ambiguity to refuse). The state-universe
      enumeration this covers is just the two members of
      `lyt_ast.Orientation` (`{'h', 'v'}`) — no conditional-disjunction
      construct exists or is added; every point still resolves to exactly
      one of the two.

WHY THIS IS SOLVER-INERT (the reason "single pass, no fixed point" is
true and not merely asserted). Every axis-taking key the L14 role frame
threads through — `ceiling`/`elastic`/`floor`/`edge`/`unit`/`scroll` — is
REALIZATION-BINDING only (SPEC.md §15.2/§16.1: `compiler.py` never reads
any of them). The one EXCEPTION, `min <axis>` (L12), IS solver-visible,
but L12 is refused everywhere except the "both-axes" position (the root,
or a direct Exclusive/T-node child) — a Split child (which is what a
residual-holding leaf, by definition, always is) can never legally
declare it. So a residual-holding leaf's own orientation-dependent facts
never feed `compiler.solve_lexicographic`'s decision variables or
constraints at all: the SOLVED geometry (including the residual leaf's
own solved rectangle) is identical whether the leaf's true orientation is
known, guessed, or left at the load-time placeholder default. This is
what makes a single, un-iterated pass sound: solve once (with every leaf
at whatever `_load_orientation` resolves without help — the placeholder
default `'v'` for a residual leaf, since L18 forbids it from authoring
`orient` itself), read the residual leaf's own solved `(w, h)` off that
ONE solve, derive its true orientation from the aspect, and re-bind the
role frame through that derived choice — no second solve, no
convergence loop, because nothing about the derivation could have changed
the first solve's own answer.

THE RE-LOAD SEAM. Re-binding the L14 role frame means re-resolving
`along`/`across` tokens to physical axes (`loader._resolve_axis_token`)
— but by the time a tree is LOADED, those tokens are already gone
(SPEC.md §16.1: "resolved to a physical axis at load time... and never
survives into the AST"), so there is nothing left on an already-loaded
`Leaf` to re-resolve in place. Rather than retrofit the typed AST to
retain raw, pre-resolution tokens (a footprint change to every axis-
taking field, for a fact only a residual-holding leaf ever needs), this
module re-loads the SAME source text a second time, through
`loader.load_layouts`'s own `orientation_overrides` parameter (see that
function's own docstring) — the ordinary "parser permissive, loader
resolves" pipeline runs twice, once to solve (placeholder orientation,
solver-inert so the solve is unaffected either way) and once more, with
the derived choice threaded in, to produce the tree every OTHER consumer
(wellformedness re-check, `render.py`, a future `emit_layout_tree.py`
consumer) actually sees. A no-op (`rebind` returns the same `ast.Slot`
object unchanged) whenever `compute_derived_orientations` finds nothing
to derive — but that is NOT every load today: both real reference
encodings carry genuine residual-holding leaves (`rebind`'s own
docstring has the full disclosure) — the derivation genuinely runs
there, it is only invisible downstream because nothing yet consumes the
fields it changes.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from typing import Dict, Optional

import loader
import lyt_ast as ast
from compiler import SolveResult
from wellformed import find_residual_leaves


def derive_orientation(w: float, h: float) -> str:
    """Sub-ruling (b): the tie-to-vertical rule. `aspect = w / h`; strictly
    wider-than-tall (`aspect > 1`) derives `'h'`; strictly taller-than-wide
    OR exactly square (`aspect <= 1`, which is what makes the `aspect == 1`
    tie fall to `'v'` rather than needing a separate branch) derives `'v'`.
    A degenerate zero-height residual (`h <= 0`, e.g. an `INFEASIBLE` solve
    reporting a collapsed rectangle) has no well-defined aspect at all —
    falls to `'v'`, the same default `_load_orientation` already gives
    every undeclared leaf, rather than raising: a degenerate box is a fact
    about the SOLVE (already reported honestly as `INFEASIBLE`/a zero
    rectangle by `compiler.py`), not a new refusal this module invents."""
    if h <= 0:
        return "v"
    return "h" if (w / h) > 1 else "v"


def compute_derived_orientations(root: ast.Slot, result: SolveResult) -> Dict[str, str]:
    """For every leaf `find_residual_leaves` names, look up its SOLVED
    rectangle in `result.rects` (keyed by the same dotted tree path both
    `loader.py` and `compiler.py` use) and derive its orientation from
    that rectangle's aspect. A residual leaf absent from `result.rects`
    (an `INFEASIBLE` solve, whose `SolveResult.rects` is `{}` — see
    `compiler.solve_lexicographic`) contributes no entry: there is no
    solved geometry to derive an aspect from, and an infeasible solve is
    already reported as such by the caller — this function does not
    invent a fallback orientation for a screen size the program cannot
    serve at all.
    """
    out: Dict[str, str] = {}
    for widget, path in find_residual_leaves(root).items():
        rect = result.rects.get(path)
        if rect is None:
            continue
        out[widget] = derive_orientation(rect.w, rect.h)
    return out


def rebind(
    text: str,
    layout_name: str,
    root: ast.Slot,
    result: SolveResult,
    *,
    waivers: Optional[Dict[str, list]] = None,
) -> ast.Slot:
    """Derive residual orientations from `result` and, only if there is at
    least one to derive, re-load `text` a second time with them threaded
    through as `orientation_overrides` (see `loader.load_layouts`'s own
    docstring for why a second load, not a patch of the already-loaded
    tree, is the re-binding mechanism). Returns `root` UNCHANGED (the same
    object, not a copy) when `compute_derived_orientations` finds nothing
    to derive.

    DISCLOSED, NOT DORMANT, against the real reference encodings. This is
    NOT the common case there: `lengyue_landscape.lyt`/
    `lengyue_portrait.lyt` each carry THREE genuine residual-holding
    leaves (`B` — the board, via the `pref maximize` sugar SPEC.md §1.1
    resolves to elastic `pref 1fr` — and `settingsPane`/`otherBand`, both
    explicit `pref 1fr` leaves beside a fixed sibling), so `rebind`
    genuinely reloads and genuinely produces derived orientations for all
    three, at every solved screen size. What stays invisible in
    `runner.py`'s own stdout (see this amendment's dispatch report for the
    byte-identical before/after proof) is a DIFFERENT fact: no consumer in
    this Python-only substrate reads `Leaf.orientation`/the L14 role-frame
    fields for rendering today (SPEC.md §16.1's own disclosed scope note —
    the realization-layer consumer is `frontend/`-side and out of scope
    for the language-substrate ports this amendment continues), so a real
    rebind has nothing downstream to show a difference in. The genuinely
    dormant fact is narrower and specific: `tree` itself — the leaf the
    ruling's own illustrative language names — is FIXED (`min==pref==max`)
    in both encodings today, not residual-holding; `T(...)`, the row's
    actual sole `pref: fr` child, is an Exclusive (orientation is
    leaf-only, so it was never eligible regardless). See the dispatch
    report's own STOP-and-report section for what a future `.lyt` edit
    would need to change for the ruling's own premise to hold for `tree`
    specifically.
    """
    derived = compute_derived_orientations(root, result)
    if not derived:
        return root
    # 2026-08-12 (review of ledger row 2310, Duty 6 finding): address this
    # call's derived map to layout_name specifically, not as a bare
    # widget_id -> axis dict — load_layouts now scopes orientation_overrides
    # by layout name (`{layout_name: {widget_id: axis}}`) precisely so a
    # widget id shared with some OTHER layout in the same `text` can never
    # inherit an override computed from THIS layout's own solve. See
    # `loader.load_layouts`'s own docstring for the full hazard this closes.
    return loader.load_layouts(
        text, waivers=waivers, orientation_overrides={layout_name: derived}
    )[layout_name]
