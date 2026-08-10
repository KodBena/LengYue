"""Raw-parse-tree -> typed-AST loader. This is where "refuse malformed
input with a structured error, never coerce" (ADR-0002, build commission
item 3) actually happens: the parser (parser.py) is deliberately permissive
(it accepts the sentinel identifiers `CONTENT` and the presence combination
`(system, release)` as syntactically valid tokens, because the consult
document's own §5.1 worked encoding contains them, as an illustration of
what LYT's laws forbid) — it is `load_slot()` below that turns those into
loud, structured refusals.

Two independent checking passes happen here, per the build commission:

  1. **Type-level (construction-unrepresentable) prohibitions** — checked
     inline while building the typed AST, because the typed AST's own
     constructors refuse them (lyt_ast.Sizing has no 'content' basis
     member to select; lyt_ast.Presence's __post_init__ rejects
     by='system', hidden='release'). This module's job is just to route a
     LytParseError-shaped raw token into that refusal instead of silently
     coercing it to something loadable.
  2. **Structural well-formedness laws L1/L2** — checked by a *separate*
     pass, `check_wellformed()`, run after a Slot tree is fully built (L2
     is a whole-subtree graph shape check; L1 is checked opportunistically
     against the `warns` the parser preserved from ⚠ markers, cross-checked
     against an independent structural re-derivation — see its docstring).
     Called by `load_layout()` automatically, so "load time" covers both
     passes, matching the commission's phrasing.

Disclosed constant: `PX_PER_CH` collapses `ch` extents (and any
`px`+`ch` extent sum) to plain px at load time. The document says only that
ch is "resolved per class via a declared px-per-ch input" (line 326-328)
without giving the constant or saying whether it varies by class; this
prototype uses one global constant for every class, which is a disclosed
simplification.

Disclosed constant: `WRAPPER_MIN_PX` resolves the symbolic `WRAPPER_MIN`
identifier the document uses without defining a value (§5.1 line 500,
referencing `layout-model.ts:216`). We use 300px, matching the control-panel
floor the same document cites at `layout-model.ts:186-191` for the
adjacent black-box slot in the same encoding.
"""
from __future__ import annotations

from typing import FrozenSet, List, Optional

import lyt_ast as ast
import parser as lytparser
from errors import LytLoadError

PX_PER_CH = 8.0
WRAPPER_MIN_PX = 300.0

VALID_DOMAINS = {"go", "common", "debug", "board", "chrome", "blackbox"}
VALID_FACETS = {"action", "info"}


def _resolve_extent_like(
    e: Optional[lytparser.RawExtentLike], *, where: str
) -> ast.Extent:
    if e is None:
        raise LytLoadError(
            f"sizing at {where} is missing a required min/pref/max term",
            {"where": where},
        )
    if isinstance(e, lytparser.RawExtentSum):
        total_px = 0.0
        for part in e.parts:
            resolved = _resolve_extent_like(part, where=where)
            if resolved.unit == "fr":
                raise LytLoadError(
                    "an extent sum may not include an 'fr' component "
                    "(fr shares are resolved by partition equality, not "
                    "additively)",
                    {"where": where},
                )
            total_px += resolved.v
        return ast.Extent(unit="px", v=total_px)
    assert isinstance(e, lytparser.RawExtent)
    if e.kind == "numunit":
        if e.unit == "ch":
            return ast.Extent(unit="px", v=e.v * PX_PER_CH)
        return ast.Extent(unit=e.unit, v=e.v)
    # symbolic
    sym = (e.symbol or "").upper()
    if sym == "CONTENT":
        # This IS typed prohibition #1: content-driven sizing has no
        # representation in lyt_ast.Sizing (basis is closed to
        # {'reserved','envelope'}; there is no way to spell "size me from
        # my rendered content"). §4.2 line 344-345.
        raise LytLoadError(
            "content-driven sizing ('max CONTENT') is unrepresentable by "
            "construction — LYT's Sizing.basis is closed to "
            "{'reserved','envelope'}; there is no 'content' member "
            "(layout-language-consult.md line 344-345, defect (a))",
            {"where": where, "prohibition": "content-driven-sizing", "token": e.symbol},
        )
    if sym == "WRAPPER_MIN":
        return ast.Extent(unit="px", v=WRAPPER_MIN_PX)
    if sym == "MAXIMIZE":
        # "pref maximize" (§5.2/§5.3/§5.4's board leaf) is prose-in-syntax
        # for "this leaf is the subject of a maximize-area objective term"
        # (§4.5) — there is no extent unit for that, so we resolve it to
        # an elastic 1fr pref (the leaf competes for all free space along
        # its axis) and rely on the Program's objective (built in Python by
        # the runner — see lyt_ast.Program's docstring on why objectivesec
        # concrete syntax isn't parsed) to actually register the
        # maximize-area term for this widget. Disclosed invention.
        return ast.Extent(unit="fr", v=1)
    if sym == "INF":
        raise LytLoadError(
            "'inf' is only legal in 'max' position, not here",
            {"where": where},
        )
    raise LytLoadError(
        f"unresolvable symbolic extent '{e.symbol}'",
        {"where": where, "symbol": e.symbol},
    )


def _resolve_max(
    e: Optional[lytparser.RawExtentLike], *, where: str
) -> "ast.Extent | str":
    if e is None:
        raise LytLoadError(f"sizing at {where} is missing 'max'", {"where": where})
    if isinstance(e, lytparser.RawExtent) and e.kind == "symbol" and e.symbol == "inf":
        return "inf"
    return _resolve_extent_like(e, where=where)


def _load_sizing(rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str) -> ast.Sizing:
    if rs is None:
        raise LytLoadError(f"slot at {where} has no sizing block", {"where": where})

    if rs.aspect_coupled:
        # Disclosed sugar (parser.py docstring): 'aspect-coupled' expands
        # to an elastic, unaspected wrapper — the real aspect clamp lives
        # on the wrapped board leaf, not this wrapping slot.
        return ast.Sizing(
            min=ast.Extent(unit="px", v=0),
            pref=ast.Extent(unit="fr", v=1),
            max="inf",
        )

    if rs.fixed is not None:
        # `{28px}` shorthand (§5.4/§5.5): min=pref=max=that extent. May be
        # combined with an `envelope: {...}` clause in the same braces
        # (§5.4 line 569's I_engine) — the reserved extent along the
        # parent's partition axis stays fixed regardless of which
        # declared content state is active; envelope_states is then purely
        # documentation for this slot, since Sizing has no second axis to
        # reserve variably (see build report).
        fixed_extent = _resolve_extent_like(rs.fixed, where=where)
        basis = "reserved"
        envelope_states = None
        if rs.envelope_states:
            basis = "envelope"
            envelope_states = rs.envelope_states
        return ast.Sizing(
            min=fixed_extent,
            pref=fixed_extent,
            max=fixed_extent,
            basis=basis,
            envelope_states=envelope_states,
        )

    zero = ast.Extent(unit="px", v=0)
    if rs.min is None:
        # Disclosed general completion rule: several §5 encodings elide
        # 'min' with "..." on shorthand lines (e.g. §5.1 line 466/488's
        # "{min 100fr...}" repeating the fully-spelled sibling triple, and
        # the T-node "min envelope over tabs" prose at line 577). Rather
        # than special-case each ellipsis site, an omitted 'min' in our
        # transcription defaults to 0px (or, for an Exclusive/T node,
        # stays structurally derived — see compiler.py) — the least
        # constraining choice, never a silently-invented larger floor.
        min_extent = zero
    else:
        min_extent = _resolve_extent_like(rs.min, where=where)

    if rs.pref is None:
        raise LytLoadError(f"sizing at {where} is missing 'pref'", {"where": where})
    pref_extent = _resolve_extent_like(rs.pref, where=where)
    if rs.max is None:
        # Same disclosed completion rule, mirrored for 'max': omitted ->
        # 'inf' (the least constraining choice).
        max_val: "ast.Extent | str" = "inf"
    else:
        max_val = _resolve_max(rs.max, where=where)

    basis = "reserved"
    envelope_states = None
    if rs.envelope_states:
        basis = "envelope"
        envelope_states = rs.envelope_states

    return ast.Sizing(
        min=min_extent,
        pref=pref_extent,
        max=max_val,
        aspect=rs.aspect,
        basis=basis,
        envelope_states=envelope_states,
    )


def _load_presence(rp: Optional[lytparser.RawPresence], *, where: str) -> ast.Presence:
    if rp is None:
        return ast.FIXED
    if rp.kind == "fixed":
        return ast.FIXED
    if rp.kind == "build":
        return ast.DEV
    assert rp.kind == "toggle"
    by = rp.by
    hidden = rp.hidden
    if by not in ("user", "system"):
        raise LytLoadError(f"presence 'by' must be user|system, got {by!r}", {"where": where})
    if hidden not in ("release", "preserve"):
        raise LytLoadError(
            f"presence 'hidden' must be release|preserve, got {hidden!r}", {"where": where}
        )
    # ast.Presence.__post_init__ is where typed prohibition #2 actually
    # fires (by='system', hidden='release' is untypable). We let that
    # exception propagate as-is but re-wrap it as a LytLoadError so callers
    # see one exception family.
    try:
        return ast.toggle(by=by, hidden=hidden)  # type: ignore[arg-type]
    except ValueError as exc:
        raise LytLoadError(
            str(exc),
            {"where": where, "prohibition": "system-release-presence", "by": by, "hidden": hidden},
        ) from exc


def _load_leaf(rl: lytparser.RawLeaf, *, where: str) -> ast.Leaf:
    domain = rl.domain
    facets = set()
    if domain not in VALID_DOMAINS:
        if domain in VALID_FACETS:
            # Disclosed gap: q5go and OGS (§5.2 line 527, §5.3 line 537)
            # write the bare leaf `I[info]` — putting a *facet* name
            # ('info') where the grammar's leaf production
            # (`widgetid "[" domain ("," facet)* "]"`, line 281) expects a
            # *domain*. Both comparison languages are illustrating a
            # generic "information panel" that isn't part of LengYue's own
            # A/B/C/D census, so there is no faithful domain to assign.
            # We resolve this by treating the bracket's first token as a
            # facet (folded into `facets` below) and defaulting domain to
            # 'common' — the census's own catch-all for non-go,
            # non-board content (§2).
            facets.add(domain)
            domain = "common"
        else:
            raise LytLoadError(
                f"unknown domain '{domain}' for widget '{rl.widget}'",
                {"where": where, "domain": domain, "valid": sorted(VALID_DOMAINS)},
            )
    for f in rl.facets:
        if f not in VALID_FACETS:
            raise LytLoadError(
                f"unknown facet '{f}' for widget '{rl.widget}'",
                {"where": where, "facet": f, "valid": sorted(VALID_FACETS)},
            )
        facets.add(f)
    return ast.Leaf(widget=rl.widget, facets=frozenset(facets), domain=domain, flagged=rl.flagged)


def load_slot(rs: lytparser.RawSlot, *, path: str = "root") -> ast.Slot:
    node = rs.node
    if isinstance(node, lytparser.RawLeaf):
        leaf = _load_leaf(node, where=f"{path}:{node.widget}")
        sizing = _load_sizing(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        presence = _load_presence(rs.presence, where=f"{path}:{node.widget}")
        return ast.Slot(node=leaf, presence=presence, sizing=sizing, violates=frozenset(rs.warns))
    if isinstance(node, lytparser.RawSplit):
        children = [
            load_slot(c, path=f"{path}/{node.axis.upper()}{i}") for i, c in enumerate(node.children)
        ]
        split = ast.Split(axis=node.axis, gap_px=0.0, children=children)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="split")
        presence = _load_presence(rs.presence, where=path)
        return ast.Slot(node=split, presence=presence, sizing=sizing, violates=frozenset(rs.warns))
    if isinstance(node, lytparser.RawExclusive):
        children = [load_slot(c, path=f"{path}/T{i}") for i, c in enumerate(node.children)]
        excl = ast.Exclusive(children=children, tag=node.tag)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="exclusive")
        presence = _load_presence(rs.presence, where=path)
        return ast.Slot(node=excl, presence=presence, sizing=sizing, violates=frozenset(rs.warns))
    raise LytLoadError("unknown raw node kind", {"path": path, "node": repr(node)})


def load_layouts(text: str) -> "dict[str, ast.Slot]":
    """Parse + type-check every `layout NAME = ...` fragment in `text`.
    Runs the L1/L2 well-formedness pass on each before returning (see
    wellformed.py) — a caller never receives a Slot tree that hasn't passed
    both the type-level and structural checks.
    """
    from wellformed import check_wellformed

    raws = lytparser.parse_layouts(text)
    out = {}
    for raw in raws:
        slot = load_slot(raw.slot, path=raw.name)
        check_wellformed(slot, layout_name=raw.name)
        out[raw.name] = slot
    return out
