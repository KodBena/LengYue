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
practice this is no real restriction for the two live cases (`boardRail`,
`previewBoard` are both bare leaves).

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


def prune_absent(slot: ast.Slot, absent_widgets: FrozenSet[str]) -> ast.Slot:
    """Returns a NEW Slot tree with every Leaf child whose widget id is in
    `absent_widgets` removed from its parent Split/Exclusive's children.
    `absent_widgets=frozenset()` returns `slot` itself, unchanged (no new
    tree built) -- the identity case every non-lengyue registration hits.

    Only DIRECT Leaf children are pruned by matching their own widget id;
    a Leaf can never itself be "this slot" at the top of the recursion (a
    program's root is never a bare leaf named absent — the recursion below
    only ever removes a CHILD, never the slot passed in), matching this
    module's own "only a bare leaf can be named absent" disclosed scope.
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
            if not (isinstance(c.node, ast.Leaf) and c.node.widget in absent_widgets)
        ]
        new_node = ast.Split(axis=node.axis, gap_px=node.gap_px, children=new_children)
        return ast.Slot(node=new_node, presence=slot.presence, sizing=slot.sizing, violates=slot.violates)
    if isinstance(node, ast.Exclusive):
        new_children = [
            prune_absent(c, absent_widgets)
            for c in node.children
            if not (isinstance(c.node, ast.Leaf) and c.node.widget in absent_widgets)
        ]
        new_node = ast.Exclusive(children=new_children, selector=node.selector, tag=node.tag)
        return ast.Slot(node=new_node, presence=slot.presence, sizing=slot.sizing, violates=slot.violates)
    raise TypeError(f"unknown LayoutNode kind: {node!r}")  # pragma: no cover — exhaustive over lyt_ast.LayoutNode


def _collect_leaf_presence(slot: ast.Slot, out: Dict[str, ast.Presence]) -> None:
    node = slot.node
    if isinstance(node, ast.Leaf):
        out[node.widget] = slot.presence
        return
    if isinstance(node, (ast.Split, ast.Exclusive)):
        for c in node.children:
            _collect_leaf_presence(c, out)
        return
    raise TypeError(f"unknown LayoutNode kind: {node!r}")  # pragma: no cover — exhaustive over lyt_ast.LayoutNode


def validate_valuation(slot: ast.Slot, valuation: PresenceValuation, *, layout_name: str) -> None:
    """Refuses loudly (`LytLoadError`, `detail.law == "presence-valuation"`)
    when a valuation names an ABSENT widget that either doesn't exist in
    this tree at all, or exists but whose declared `Presence` isn't a
    genuine user-release toggle -- the commission's own words: "a named
    slot that isn't a user-release toggle is an error." A no-op for
    `ALL_PRESENT` (and any other valuation with an empty `absent_widgets`),
    matching `prune_absent`'s own identity treatment of the empty case."""
    if not valuation.absent_widgets:
        return
    presence_by_widget: Dict[str, ast.Presence] = {}
    _collect_leaf_presence(slot, presence_by_widget)
    for widget in sorted(valuation.absent_widgets):
        if widget not in presence_by_widget:
            raise LytLoadError(
                f"presence valuation {valuation.name!r} names widget "
                f"{widget!r} as absent, but layout {layout_name!r} has no "
                "leaf with that widget id",
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
        if not is_release_toggle:
            raise LytLoadError(
                f"presence valuation {valuation.name!r} names widget "
                f"{widget!r} as absent, but its declared presence "
                f"(kind={presence.kind!r}, by={presence.by!r}, "
                f"hidden={presence.hidden!r}) is not a user-initiated "
                "release toggle -- only a '@toggle(user, release)' slot "
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
