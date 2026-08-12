"""research/lyt/presence.py

AMENDMENT 4 (ledger row 1737, commissioner-delegated; see
SPEC-AMENDMENTS.md). This module implements
`layout-language-consult.md`'s own §6 presence paragraph (lines 636-641)
literally: "solve the all-`preserve`-slots-present valuation ... `release`
toggles are user-initiated only [...] so each user-reachable presence
valuation is legitimately a *separate* solve; in practice solve the default
valuation plus any valuation the author lists as common." `compiler.py`'s
own module docstring disclosed the prior narrowing outright ("presence:
only the 'all slots present' valuation is solved") -- this module is the
LANGUAGE SURFACE and pruning machinery that closes that disclosed gap. It
implements the spec's own already-written text; it does not change it (same
footing SPEC-AMENDMENTS.md uses for Amendments 1-3 -- see that file's own
"Diff vs. the original consult document's prose" sections for the
precedent of naming this distinction explicitly).

## What a "presence valuation" is here

A `PresenceValuation` is a named, finite set of WIDGET IDS considered
ABSENT for one solve. "Absent" only makes sense for a slot whose declared
`Presence` is a genuine user-initiated release toggle
(`{kind:'toggle', by:'user', hidden:'release'}`, lyt_ast.py) -- per L1
(layout-language-consult.md line 350-364), a system-driven toggle may never
release space (untypable by construction, lyt_ast.Presence.__post_init__),
and a `preserve` toggle keeps its rectangle by definition (§4.1 line
303-306: "a hidden preserve slot keeps its rectangle and merely stops
painting"). So neither a `preserve` slot nor a non-release-toggle slot can
ever be named ABSENT in a valuation -- naming one is refused loudly
(`validate_valuation` below), not silently ignored or treated as a no-op.
This is the commission's own words: "refuse malformed declarations loudly
(a named slot that isn't a user-release toggle is an error)."

Identified by WIDGET ID (the same string identity `runner.py`'s
`board_widget` / `reach_preferred_widgets` and `compiler.py`'s
`_find_leaf_path` already use as this prototype's existing convention for
referring to a slot generically at the Python/registration layer), not by
tree path. This is a disclosed, narrower concept than
`emit_mockup.py`'s `TOGGLE_TARGETS` registry, which IS path-keyed because
some of its entries name a composite SUBTREE with no single widget id (the
"Tree & Panels" `T(CP-*)` group, the board composite, etc.) -- only a bare
LEAF can be named in a `PresenceValuation`; a whole-subtree presence
valuation is a genuinely broader concept this amendment does not attempt to
generalize to (disclosed narrowing, not silently assumed away). In
practice this was no real restriction for the two original live cases
(`boardRail`, `previewBoard` are both bare leaves).

## LYT presence arc P1 widening (row 2333) -- a second identity: the tagged Exclusive

Amendment 8's `@demote` presence kind (L15, ledger row 2241) was originally
leaf-only, for exactly this module's own reason above -- only a bare leaf
had a `widget` id this module's naming scheme could use. `loader.py`'s
`_load_demote_presence` now also admits an EXCLUSIVE (`T`) node declaring
`@demote`, on the strength of a fact a Split does not share: per SPEC.md
§2, every child of a `T` already receives the IDENTICAL rectangle and
exactly one is visible at a time -- the whole group is already ONE
presence-relevant unit from its own parent's perspective, the same way a
single leaf is (see `loader._load_demote_presence`'s own docstring for the
full disclosure of why this widening is scoped to Exclusive and not
Split). An Exclusive has no `widget` id of its own, so this module's
identity namespace widens to a SECOND kind of entry: an Exclusive's own
declared `[TAG]` (SPEC.md §1.1, previously documentation-only) NOW ALSO
serves as its presence-pruning identity when `@demote` names it --
`absent_widgets` is, as of this widening, "a leaf widget id OR a tagged
Exclusive's own tag string," one flat namespace, not two separately-typed
fields (`loader._load_demote_presence`'s own clause (f) refuses `@demote`
on an untagged Exclusive for exactly this reason -- an untagged Exclusive
has no honest identity to be named by). This is still narrower than
`emit_mockup.py`'s own path-keyed registry (a `[TAG]` names one Exclusive
node, not an arbitrary subtree), but it is no longer leaf-only.

## Pruning semantics

`prune_absent` returns a NEW Slot tree with every Leaf named in the
valuation's `absent_widgets` REMOVED from its parent Split/Exclusive's
`children` list entirely -- not sized to zero, REMOVED -- so the parent
Split's own arity (`len(children)`) genuinely drops. `compiler.py`'s
existing `(k-1)*gap` partition term (`_constrain`'s Split branch,
UNMODIFIED by this amendment) sums the gap over `len(node.children)`,
whatever tree it is handed -- so pruning the tree BEFORE compiling is
sufficient on its own to make that term use the PRESENT count; no
compiler.py change was needed for it. This is why `prune_absent` lives
here rather than as a `compiler.py` concept: presence-valuation
resolution is a LANGUAGE-layer operation on the typed AST (same layer as
`loader.py`'s `_apply_preserve_reservation`, Amendment 1's precedent for
"a language-level semantic completion belongs at load time / on the AST,
not scattered into every consumer") -- the compiler stays presence-blind,
exactly as generic as it was before this amendment, just handed a
DIFFERENT tree per valuation.

An `absent_widgets=frozenset()` valuation (`ALL_PRESENT` below) is the
identity operation -- `prune_absent` returns the SAME tree unchanged, byte-
identical to this prototype's pre-Amendment-4 behavior for every
registration that never declares a `default_valuation` (q5go, ogs,
current-row-repaired, current-row-asis all keep solving the one
all-present tree they always did).

## AMENDMENT 5 fix (review finding 1, `.claude/dispatch-reports/lyt-amendment5-review.md`)

`prune_absent`'s two `ast.Slot(...)` reconstruction call sites (Split and
Exclusive branches) forward `presence`/`sizing`/`violates` from the
original slot but rebuild the `node` -- Amendment 5 (`Slot.scroll_axes`,
ledger row 1937) added a fourth field to that same forward-or-drop set,
and the two call sites here were not swept when that field was added
(they are the only `Slot`-*reconstruction* call sites in this package --
every OTHER `ast.Slot(...)` construction, in `loader.py`, `synthesize.py`,
and `bench_solve.py`, builds a slot from scratch rather than forwarding an
existing one's fields, so there was nothing to drop there). Fixed by
forwarding `scroll_axes=slot.scroll_axes` at both sites. Dormant twice
over before this fix (no encoding combines a `scroll` declaration with a
presence-prunable descendant yet, and `compiler.py`/`render.py`/every
`emit_*.py` module reads `scroll_axes` not at all), but directly upstream
of the Option C follow-on wave, which is expected to combine the two --
see the review's own Finding 1 for the full analysis. Regression:
`tests/test_lyt.py::test_prune_absent_preserves_scroll_axes_on_reconstructed_composites`.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, FrozenSet

import lyt_ast as ast
from errors import LytLoadError


@dataclass(frozen=True)
class PresenceValuation:
    """A named set of widget ids considered ABSENT for one solve. `name`
    is used only for reporting/keying results (emit_mockup.py's per-
    valuation overlay JSON, this module's own error messages) -- it has no
    geometric meaning of its own."""

    name: str
    absent_widgets: FrozenSet[str] = field(default_factory=frozenset)


# The spec's own §6 baseline: "solve the all-preserve-slots-present
# valuation" (line 636) -- nothing named absent. Every registration that
# declares no `default_valuation` of its own solves exactly this,
# unchanged from this prototype's pre-Amendment-4 behavior.
ALL_PRESENT = PresenceValuation(name="all-present", absent_widgets=frozenset())


def is_named_absent(slot: ast.Slot, absent_widgets: FrozenSet[str]) -> bool:
    """LYT presence arc P1 (row 2333): the ONE predicate both the Split and
    Exclusive branches of `prune_absent` below consult, so the two branches
    can never drift on which identities count -- a Leaf matches by its own
    `widget` id (the original, Amendment-4 scope); an Exclusive matches by
    its own declared `[TAG]`, when non-empty (the widening this arc adds --
    see this module's own docstring section for the full rationale). A
    Split never matches -- `loader._load_demote_presence` already refuses
    `@demote` on a Split at load time, so a well-formed tree can never
    present one here, but this predicate stays honest about that rather
    than assuming it.

    LYT presence arc P2a (`.claude/dispatch-reports/lyt-p2a-presence-
    contract.md`): made public (dropped the leading underscore) -- this is
    now a second module's own seam too. `emit_layout_tree.py` derives each
    compiled `LytChild.presenceDefaultVisible` from this SAME predicate
    (against `runner.valuation_for_class`'s own `absent_widgets`), rather
    than re-implementing "which identity does a Split child present" a
    second time in the emitter -- the exact fact this module's docstring
    already establishes as canonical, now shared rather than duplicated."""
    node = slot.node
    if isinstance(node, ast.Leaf):
        return node.widget in absent_widgets
    if isinstance(node, ast.Exclusive):
        return bool(node.tag) and node.tag in absent_widgets
    return False


def prune_absent(slot: ast.Slot, absent_widgets: FrozenSet[str]) -> ast.Slot:
    """Returns a NEW Slot tree with every Leaf child whose widget id, OR
    every Exclusive child whose own `[TAG]`, is in `absent_widgets` --
    removed from its parent Split/Exclusive's children.
    `absent_widgets=frozenset()` returns `slot` itself, unchanged (no new
    tree built) -- the identity case every non-lengyue registration hits.

    Only DIRECT children are pruned by matching their own identity (leaf
    widget id, or -- LYT presence arc P1, row 2333 -- a tagged Exclusive's
    own tag); a Leaf/Exclusive can never itself be "this slot" at the top
    of the recursion (a program's root is never a bare leaf or a tagged
    Exclusive named absent — the recursion below only ever removes a
    CHILD, never the slot passed in), matching this module's own disclosed
    scope (originally "only a bare leaf," now "a bare leaf or a tagged
    Exclusive" -- see the module docstring's own P1 section).
    """
    if not absent_widgets:
        return slot
    node = slot.node
    if isinstance(node, ast.Leaf):
        return slot
    if isinstance(node, ast.Split):
        new_children = [
            prune_absent(c, absent_widgets)
            for c in node.children
            if not is_named_absent(c, absent_widgets)
        ]
        new_node = ast.Split(axis=node.axis, gap_px=node.gap_px, children=new_children)
        # AMENDMENT 5 fix (review finding 1, lyt-amendment5-review.md): this
        # reconstructs a NEW `ast.Slot` from the original's `presence`/
        # `sizing`/`violates` -- `scroll_axes` must be forwarded the same
        # way, or a composite ancestor's own `scroll` declaration silently
        # vanishes the moment a descendant leaf gets pruned. Dormant today
        # (no encoding combines `scroll` with a presence-prunable sibling
        # yet), but this is exactly the sibling-surface gap the amendment's
        # own closure statement should have enumerated -- see this module's
        # docstring "AMENDMENT 5 fix" note for the swept quantification
        # universe.
        return ast.Slot(
            node=new_node, presence=slot.presence, sizing=slot.sizing,
            violates=slot.violates, scroll_axes=slot.scroll_axes,
        )
    if isinstance(node, ast.Exclusive):
        if is_named_absent(slot, absent_widgets):
            # This slot IS the tagged, named-absent Exclusive itself --
            # mirrors the bare-Leaf early return above: actual removal only
            # ever happens from a PARENT's filtered children list (the
            # Split/Exclusive branches' own list comprehensions), never
            # from within the matched node's own recursive call. Reached
            # only if some caller passes this slot directly rather than as
            # a child being filtered (LYT presence arc P1, row 2333).
            return slot
        new_children = [
            prune_absent(c, absent_widgets)
            for c in node.children
            if not is_named_absent(c, absent_widgets)
        ]
        new_node = ast.Exclusive(children=new_children, selector=node.selector, tag=node.tag)
        # AMENDMENT 5 fix -- same forwarding, same rationale as the Split
        # branch above.
        return ast.Slot(
            node=new_node, presence=slot.presence, sizing=slot.sizing,
            violates=slot.violates, scroll_axes=slot.scroll_axes,
        )
    raise TypeError(f"unknown LayoutNode kind: {node!r}")  # pragma: no cover — exhaustive over lyt_ast.LayoutNode


def _collect_leaf_presence(slot: ast.Slot, out: Dict[str, ast.Presence]) -> None:
    """LYT presence arc P1 (row 2333): despite the name (kept for minimal
    footprint against every existing caller), this now collects BOTH
    identity kinds this module's `absent_widgets` namespace admits -- a
    Leaf's own `widget` id (original scope) and a tagged Exclusive's own
    `[TAG]` (the widening; see module docstring). An untagged Exclusive
    contributes nothing -- it has no honest identity to be looked up by,
    matching `loader._load_demote_presence` clause (f)'s own refusal of
    `@demote` on one."""
    node = slot.node
    if isinstance(node, ast.Leaf):
        out[node.widget] = slot.presence
        return
    if isinstance(node, ast.Exclusive):
        if node.tag:
            out[node.tag] = slot.presence
        for c in node.children:
            _collect_leaf_presence(c, out)
        return
    if isinstance(node, ast.Split):
        for c in node.children:
            _collect_leaf_presence(c, out)
        return
    raise TypeError(f"unknown LayoutNode kind: {node!r}")  # pragma: no cover — exhaustive over lyt_ast.LayoutNode


def validate_valuation(slot: ast.Slot, valuation: PresenceValuation, *, layout_name: str) -> None:
    """Refuses loudly (`LytLoadError`, `detail.law == "presence-valuation"`)
    when a valuation names an ABSENT identity that either doesn't exist in
    this tree at all, or exists but whose declared `Presence` isn't a
    genuine user-release toggle or a demotion -- the commission's own
    words: "a named slot that isn't a user-release toggle is an error."
    A no-op for `ALL_PRESENT` (and any other valuation with an empty
    `absent_widgets`), matching `prune_absent`'s own identity treatment of
    the empty case. LYT presence arc P1 (row 2333): "identity" now spans
    both a leaf's own widget id and a tagged Exclusive's own `[TAG]` (see
    `_collect_leaf_presence`'s own updated docstring); the messages below
    are worded generically ("leaf or tagged group") rather than assuming
    every name is a leaf."""
    if not valuation.absent_widgets:
        return
    presence_by_widget: Dict[str, ast.Presence] = {}
    _collect_leaf_presence(slot, presence_by_widget)
    for widget in sorted(valuation.absent_widgets):
        if widget not in presence_by_widget:
            raise LytLoadError(
                f"presence valuation {valuation.name!r} names {widget!r} "
                f"as absent, but layout {layout_name!r} has no leaf and no "
                "tagged Exclusive group with that id",
                {
                    "law": "presence-valuation",
                    "valuation": valuation.name,
                    "widget": widget,
                    "layout_name": layout_name,
                    "prohibition": "unknown-widget",
                },
            )
        presence = presence_by_widget[widget]
        is_release_toggle = (
            presence.kind == "toggle" and presence.by == "user" and presence.hidden == "release"
        )
        # LOOP ITERATION 11 / arc 4 round 4 (L15, ledger rows
        # 2037/2066/2107/2157/2241): a `@demote(<axis> <px>)` slot is
        # nameable-absent for the SAME reason a user-release toggle is, and
        # by the same mechanism. Both release their extent to their
        # siblings; both are reachable states of the running app the author
        # can point at; both therefore describe a legitimately SEPARATE
        # solve rather than a modification of one (§6 line 636-641). What
        # differs is only the actor — the user's click there, the page
        # measure here — and the actor is exactly what does not matter to
        # this module, whose whole question is "may this widget honestly be
        # absent". `lyt_ast.Presence` keeps the two kinds distinct (see its
        # own `demote_axis` note for why demotion is NOT
        # `toggle(by='system', hidden='release')`, which stays untypable);
        # this predicate is the one place they are treated alike, and the
        # `or` below is the entire widening.
        is_demotion = presence.kind == "demote"
        if not (is_release_toggle or is_demotion):
            raise LytLoadError(
                f"presence valuation {valuation.name!r} names widget "
                f"{widget!r} as absent, but its declared presence "
                f"(kind={presence.kind!r}, by={presence.by!r}, "
                f"hidden={presence.hidden!r}) is neither a user-initiated "
                "release toggle nor a demotion -- only a "
                "'@toggle(user, release)' slot or a '@demote(<axis> <px>)' "
                "slot (L15, LOOP ITERATION 11) "
                "may be named ABSENT in a presence valuation "
                "(layout-language-consult.md line 638-639: 'release "
                "toggles are user-initiated only'; a 'preserve' slot "
                "keeps its rectangle by definition, §4.1 line 303-306, "
                "and a system-driven toggle may never release space, L1)",
                {
                    "law": "presence-valuation",
                    "valuation": valuation.name,
                    "widget": widget,
                    "layout_name": layout_name,
                    "presence_kind": presence.kind,
                    "presence_by": presence.by,
                    "presence_hidden": presence.hidden,
                    "prohibition": "not-a-release-toggle",
                },
            )


def resolve_and_validate(
    layouts: Dict[str, ast.Slot], layout_names, valuation: PresenceValuation
) -> Dict[str, ast.Slot]:
    """Validates `valuation` against every named layout in `layouts`, then
    returns a NEW `{layout_name: pruned_slot}` map (only for the named
    layouts) -- the one entry point `runner.py` / `emit_ts.py` /
    `emit_mockup.py` all call so validation and pruning can never drift
    apart (validate-then-prune is a single operation from every caller's
    perspective, not two calls a caller could accidentally reorder or
    skip one of)."""
    out: Dict[str, ast.Slot] = {}
    for layout_name in layout_names:
        slot = layouts[layout_name]
        validate_valuation(slot, valuation, layout_name=layout_name)
        out[layout_name] = prune_absent(slot, valuation.absent_widgets)
    return out
