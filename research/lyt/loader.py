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
  2. **Structural well-formedness laws** — checked by a *separate* pass,
     `check_wellformed()`, run after a Slot tree is fully built. Currently
     this implements **L2 only** (a whole-subtree graph-shape check — see
     wellformed.py). Called by `load_layout()` automatically, so "load
     time" covers this pass, matching the commission's phrasing.

     F7 CORRECTION (review row 1609,
     `.claude/dispatch-reports/lyt-compiler-prototype-review.md`): an
     earlier version of this docstring claimed L1 "is checked
     opportunistically against the `warns` the parser preserved ...
     cross-checked against an independent structural re-derivation." That
     was never true — `wellformed.py` has never contained an L1 check, and
     the ⚠-marker metadata the parser preserves as `Slot.violates` (see
     `parser.py`'s "disclosed grammar extensions" and `load_slot` below,
     which threads `rs.warns` into `Slot.violates` unchanged) is never
     read by any code — it is inert, disclosed provenance from the raw
     transcription, not an active cross-check. L1 ("control stability",
     line 350-364) is NOT structurally checkable the way L2 is: it
     quantifies over "screen class, user-initiated toggle states, user
     drags" at RUNTIME, not over the static tree shape, so a genuine L1
     checker would need a different design than `check_wellformed`'s
     tree walk — out of scope for this prototype. This paragraph replaces
     the false claim rather than leaving a dead feature described as
     live.

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

AMENDMENT 1 (ledger row 1670, commissioner-delegated; see
`SPEC-AMENDMENTS.md`): `_apply_preserve_reservation`, called from every
branch of `load_slot` after a Slot's presence and sizing are both
resolved, raises a `@toggle(_, preserve)` slot's declared `min` to
`max(min, pref)` on its presence-bearing axis — "preserve" now genuinely
reserves its preferred extent, not just its type. See that function's own
docstring for the full rationale and seam-choice disclosure.

AMENDMENT 3 (ledger row 1715, commissioner-delegated; see
`SPEC-AMENDMENTS.md`): a split node (H/V) may declare an optional
uniform `gap` — a constant px reservation between its children, never
solvable/elastic, mapping 1:1 onto the compiler's existing `(k-1)*gap`
partition term (`compiler.py`'s `_constrain`, Split branch) and CSS
grid's native `gap`. `_load_gap_px` (below) is the load-time law: `px`
only (`fr`/`ch`/any symbolic extent refused loudly — rhythm is not a
negotiable, elastic quantity under board-maximization), and refused
entirely on a T (Exclusive) node (its children share one rectangle, so
there is nothing for a gap to separate). This REPLACES the F10-era
"hardcoded to 0.0, no concrete syntax sets it" gap in `load_slot`'s
Split branch — see that branch's own comment below for what changed.

AMENDMENT 5 (ledger row 1937, commissioner-delegated; see
`SPEC-AMENDMENTS.md` and
`.claude/dispatch-reports/lyt-tab-region-consult.md`): two more
load-time resolutions, both feeding the new L5/L5a/L5b/L5c well-
formedness laws (`wellformed.py`):

  - `_load_scroll_axes` resolves the (possibly-repeated) `scroll <axis>`
    sizing-bag key into `Slot.scroll_axes` — legal on ANY node kind, so
    (unlike `_load_gap_px`) this function performs no node-kind refusal
    of its own; it only refuses an axis token that isn't `h`/`v`.
  - `_load_content_class` resolves the `content <class>` sizing-bag key
    into `Leaf.content` — legal ONLY on a leaf (refused loudly on a
    Split or Exclusive node, since "content" describes what a LEAF
    renders, not a container's own structure), and refuses any value
    outside `{bounded, designed, unbounded}`.

Both keep the same "parser permissive, loader refuses" division of
labor as `_load_gap_px` and the bare-`envelope` refusal — the parser
above accepts any identifier in axis/class position; these two
functions are where the actual closed vocabularies and node-kind
restrictions are enforced.

AMENDMENT 7 (ledger rows 2107/2108, M1 of the model-implementation arc;
SPEC-AMENDMENTS.md's own Amendment 7 entry is the ruling/rationale
record) ports four load-time resolutions proven out on the
model-iteration loop experiment branch (rounds 3/5/6) and verified by
that branch's own substrate-consolidation commission
(`.claude/dispatch-reports/lyt-substrate-consolidation.md`):

  - `_load_ceiling_flag` resolves the bare `ceiling` sizing-bag flag
    (leaf-only; requires `content bounded`; solver-inert — L9, ceiling
    honesty).
  - `_load_unit_axes` resolves the (possibly-repeated) `unit <axis>
    <extent>` sizing-bag key into `Leaf.unit_axes` (leaf-only; requires
    `content` in `{bounded, unbounded}`; `{h,v}` only; px only; one unit
    per axis). L10's load-time half lives here; its structural half — "a
    slot must reserve a whole number of units along its own partition
    axis" — needs to know which axis a slot is partitioned on, which
    only a tree walk knows, so it lives in
    `wellformed.find_l10_violations`.
  - `_load_measure_bound` resolves the bare `measure-bound` flag into
    `Sizing.measure_bound` (refused on an Exclusive; its structural half
    is `wellformed.find_l11_violations`, L11).
  - `_load_wrap_policy` resolves `wrap <policy>` into `Slot.wrap_policy`
    (closed vocabulary; refused on a Split; on a Leaf it requires the
    leaf to have already declared the horizontal `unit` it proposes to
    wrap; an Exclusive needs no such declaration, since its units ARE
    its declared children). Untyped (`detail.law == "wrap-policy"`), not
    a numbered law — see this port's own dispatch report
    (`.claude/dispatch-reports/lyt-m1-substrate-port.md`) for the naming
    note inherited from the loop's own round-6 commit message.

Every one of the four keys is dormant for both mainline encodings — no
existing `.lyt` file declares any of them, so no verdict this program
already proves changes; see the dispatch report above for the
before/after dormancy proof.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import dataclasses
from typing import Dict, FrozenSet, List, Optional, Tuple

import lyt_ast as ast
import parser as lytparser
from errors import LytLoadError

PX_PER_CH = 8.0
WRAPPER_MIN_PX = 300.0

VALID_DOMAINS = {"go", "common", "debug", "board", "chrome"}
VALID_FACETS = {"action", "info"}
# AMENDMENT 5 (ledger row 1937): the content-class axis's closed
# vocabulary and the scroll axis's closed vocabulary, both enforced by
# `_load_content_class` / `_load_scroll_axes` below.
VALID_CONTENT_CLASSES = {"bounded", "designed", "unbounded"}
VALID_SCROLL_AXES = {"h", "v"}
# AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
# loop experiment round 6): the closed wrap-policy vocabulary this
# loader refuses against — the loader-side mirror of
# `lyt_ast._VALID_WRAP_POLICIES` (which guards the direct-constructor
# path), the same two-layer posture `VALID_DOMAINS`/`VALID_CONTENT_
# CLASSES` already use.
VALID_WRAP_POLICIES = {"balanced"}


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


def _refuse_bare_envelope(*, where: str) -> None:
    """F8 fix (review row 1609): a bare `envelope` keyword with no
    `: {states}` clause is spec-legal concrete syntax
    (layout-language-consult.md line 286 — the base EBNF's `envelope`
    production has no state list at all), so `parser.py` now parses it
    (`RawSizing.envelope_bare`) instead of raising a PARSE error. It is
    refused HERE, at load time, because L3 ("every envelope slot must
    enumerate its content states", line 381) makes a stateless envelope
    semantically underspecified — there is no honest `basis='envelope'`
    to build without a state list, and silently falling back to
    `basis='reserved'` would drop the author's declared intent exactly
    the way F2's fr-bound silent-drop did. Refused loudly instead."""
    raise LytLoadError(
        "bare 'envelope' keyword (no ': {states}' clause) is spec-legal "
        "syntax (layout-language-consult.md line 286) but violates L3 — "
        "every envelope slot must enumerate its declared content states "
        "(line 381) — refused rather than silently treated as "
        "basis='reserved'",
        {"where": where, "law": "L3", "prohibition": "bare-envelope-no-states"},
    )


def _refuse_empty_envelope_states(*, where: str) -> None:
    """S1 fix (dispatch-report `lyt-spec-grammar-audit.md`, ledger row
    1778, severe finding S1): an EXPLICIT but EMPTY state list —
    `envelope: {}` — is concrete syntax `_refuse_bare_envelope` above does
    not see at all, because `parser.parse_sizing` stores it as
    `rs.envelope_states == []`, which is falsy, so `_load_sizing`'s
    `if rs.envelope_states:` guard silently treats it as "no envelope
    declared" and neither this refusal nor `_refuse_bare_envelope` ever
    fired — the author's `envelope: {}` clause was dropped without any
    error, loading as plain `basis='reserved'`. That is exactly the
    silent-fallback behavior `_refuse_bare_envelope`'s own docstring says
    is forbidden (ADR-0002): a `basis='envelope'` slot requires a
    non-empty state list (L3, line 381; enforced again, redundantly, by
    `lyt_ast.Sizing.__post_init__` for any caller that reaches the typed
    constructor directly), and an explicit empty list is just as
    underspecified as a bare keyword with none at all — it is refused the
    same way, with its own prohibition token so the two spellings remain
    distinguishable in a caller's structured `detail`."""
    raise LytLoadError(
        "envelope: {} (an explicit but EMPTY declared-states list) "
        "violates L3 exactly as a bare 'envelope' keyword does — every "
        "envelope slot must enumerate at least one declared content state "
        "(layout-language-consult.md line 381) — refused rather than "
        "silently treated as basis='reserved' (S1, "
        ".claude/dispatch-reports/lyt-spec-grammar-audit.md)",
        {"where": where, "law": "L3", "prohibition": "empty-envelope-states"},
    )


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
        if rs.envelope_states is not None:
            if not rs.envelope_states:
                # S1 fix: `envelope: {}` — explicit but empty — is
                # distinct from `rs.envelope_states is None` (no envelope
                # clause at all) and must not fall through to
                # basis='reserved' silently. See
                # `_refuse_empty_envelope_states`'s docstring.
                _refuse_empty_envelope_states(where=where)
            basis = "envelope"
            envelope_states = rs.envelope_states
        elif rs.envelope_bare:
            _refuse_bare_envelope(where=where)
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
    if rs.envelope_states is not None:
        if not rs.envelope_states:
            # S1 fix: same empty-vs-absent distinction as the fixed-
            # shorthand branch above.
            _refuse_empty_envelope_states(where=where)
        basis = "envelope"
        envelope_states = rs.envelope_states
    elif rs.envelope_bare:
        _refuse_bare_envelope(where=where)

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


def _apply_preserve_reservation(
    sizing: ast.Sizing, presence: ast.Presence, *, where: str
) -> ast.Sizing:
    """AMENDMENT 1 (ledger row 1670, commissioner-delegated): `preserve`
    implies a genuine reservation. A slot whose presence is
    `@toggle(_, preserve)` gets its minimum raised to its preferred extent
    (`min := max(min, pref)`) on the presence-bearing axis. Ledger
    rationale: a preserve slot squeezed to zero recreates the defect
    class the language forbids (L1's "system-driven appearance may only
    fill space already reserved for it" collapses into a no-op promise if
    the reservation itself can shrink to nothing).

    This is exactly the gap the cold review's OBSERVATION finding named
    (`.claude/dispatch-reports/lyt-compiler-cold-review.md`,
    "'preserve' banners can and do solve to zero height"):
    `current_row_repaired.lyt`'s `captureBanner`/`saveBanner`/`systemLog`/
    `setupChip` were declared `min 0px` with the spec's own prose claiming
    they "become preserve slots of banner height" — a promise the
    *type* (`Presence`) carried but the *sizing* did not.

    SEAM CHOICE (disclosed, per build commission): implemented HERE, in
    the loader, rather than in the compiler. `load_slot` is the one
    choke point every `.lyt` text and (transitively, since `load_layouts`
    is the only public entry point that returns Slot trees to callers)
    every loaded encoding passes through — raising the floor here makes
    the raised `min` a fact of the TYPED AST itself: `slot.sizing.min`
    already reflects the amendment for every downstream consumer
    (`compiler.py`, `wellformed.py`, `render.py`, a human reading a
    loaded `Slot` in a debugger or test), not a policy invisible outside
    the CP-SAT model. A compiler-only implementation would leave the
    AST's own `Sizing.min` understating what `preserve` actually
    guarantees — exactly the kind of "the type says one thing, the
    solved geometry says another" gap the cold review flagged. This
    mirrors the existing pattern in this module (WRAPPER_MIN resolution,
    bare-envelope refusal): a language-level semantic completion belongs
    at load time, not scattered into every consumer.

    Edge cases (disclosed, not guessed):
      - `min` and `pref` in DIFFERENT units (only px vs fr can actually
        arise here — `ch` is already normalized to px earlier in this
        same load pass) are genuinely incomparable without a resolved
        common unit; refused loudly rather than coerced.
      - `pref.v <= min.v` (the floor is already at or above the target)
        is a no-op, not an error — `max` is not consulted or altered
        here; if the raised min now exceeds a smaller `max`, that
        surfaces as the ordinary `min > max` -> INFEASIBLE outcome at
        solve time (same disclosed non-load-time-checked behavior this
        prototype already has for any other min>max sizing, per the cold
        review's own "not a ranked finding" observation).
    """
    if presence.kind != "toggle" or presence.hidden != "preserve":
        return sizing
    min_e, pref_e = sizing.min, sizing.pref
    if min_e.unit != pref_e.unit:
        raise LytLoadError(
            f"preserve slot at {where} has a min/pref unit mismatch "
            f"({min_e.unit!r} vs {pref_e.unit!r}) — the preserve "
            "genuine-reservation rule ('min := max(min, pref)') requires "
            "a common unit to compare; refused rather than guessed "
            "(AMENDMENT 1, ledger row 1670)",
            {
                "where": where,
                "law": "preserve-reservation",
                "min_unit": min_e.unit,
                "pref_unit": pref_e.unit,
            },
        )
    if pref_e.v <= min_e.v:
        return sizing
    return ast.Sizing(
        min=ast.Extent(unit=min_e.unit, v=pref_e.v),
        pref=sizing.pref,
        max=sizing.max,
        aspect=sizing.aspect,
        basis=sizing.basis,
        envelope_states=sizing.envelope_states,
    )


def _load_gap_px(rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str) -> float:
    """AMENDMENT 3 (ledger row 1715): resolves an optional `gap <extent>`
    sizing term to a plain px float, or 0.0 when the term is absent (the
    pre-amendment default, unchanged).

    The ruling's own law, enforced here (not in the parser, which stays
    permissive per this module's architecture — see parser.py's own
    disclosure at the `gap` grammar note):

      - `gap` is legal ONLY on a split (H/V) node. `node_kind` is the
        caller's own classification of the slot being loaded
        ('leaf' | 'split' | 'exclusive'); a `gap` term surviving to this
        call on anything but 'split' is refused loudly — a T node's
        children all share the SAME rectangle (§4.1 line 297-298), so
        there is no "between children" for a gap to reserve, and a leaf
        has no children at all.
      - the resolved extent must be a bare `px` literal — no `fr` (the
        ruling's own words: "never solvable/elastic — rhythm is not
        negotiable under board-maximization"), no `ch` (even though `ch`
        IS otherwise resolvable to px elsewhere in this module — gap
        position deliberately does not inherit that resolution, so the
        author's declared unit is never silently reinterpreted), no
        extent sum, and no symbolic sentinel (`WRAPPER_MIN`, `CONTENT`,
        `MAXIMIZE`, `inf`) — all refused with the same structured error.
    """
    if rs is None or rs.gap is None:
        return 0.0
    if node_kind != "split":
        raise LytLoadError(
            f"gap declared at {where} but only an H/V split node may "
            "declare a gap — a T (Exclusive) node's children all share "
            "the same rectangle (layout-language-consult.md line "
            "297-298), so there is nothing 'between' them for a gap to "
            "reserve (AMENDMENT 3, ledger row 1715)",
            {"where": where, "law": "gap-declaration", "node_kind": node_kind},
        )
    g = rs.gap
    if isinstance(g, lytparser.RawExtent) and g.kind == "numunit" and g.unit == "px":
        return g.v
    bad_unit = g.unit if isinstance(g, lytparser.RawExtent) and g.unit else None
    bad_symbol = g.symbol if isinstance(g, lytparser.RawExtent) and g.symbol else None
    is_sum = isinstance(g, lytparser.RawExtentSum)
    raise LytLoadError(
        f"gap at {where} must be a constant px extent — 'fr' and 'ch' "
        "(and extent sums, and symbolic sentinels) are refused in gap "
        "position: a split's rhythm is a constant reservation, never a "
        "solvable/elastic term, under board-maximization; an unfittable "
        "gap is a loud INFEASIBLE, never silently absorbed elsewhere "
        "(AMENDMENT 3, ledger row 1715)",
        {
            "where": where,
            "law": "gap-declaration",
            "prohibition": "non-px-gap",
            "unit": bad_unit,
            "symbol": bad_symbol,
            "is_sum": is_sum,
        },
    )


def _load_scroll_axes(rs: Optional[lytparser.RawSizing], *, where: str) -> FrozenSet[str]:
    """AMENDMENT 5 (ledger row 1937): resolves the (possibly-repeated)
    `scroll <axis>` sizing-bag key into a `frozenset` of `{'h','v'}`
    members, or the empty frozenset when no `scroll` term was declared
    (the pre-Amendment-5 default, byte-identical for every un-amended
    encoding). Legal on ANY node kind at any depth (unlike `gap`, this
    function does not itself refuse by `node_kind` — the consult
    report's §9.1 places no node-kind restriction on `scroll`), so the
    only refusal here is an axis token outside `{'h','v'}`.
    """
    if rs is None or not rs.scroll_axes:
        return frozenset()
    bad = [a for a in rs.scroll_axes if a not in VALID_SCROLL_AXES]
    if bad:
        raise LytLoadError(
            f"scroll axis at {where} must be 'h' or 'v', got {bad[0]!r} "
            "(AMENDMENT 5, ledger row 1937)",
            {
                "where": where,
                "law": "scroll-declaration",
                "prohibition": "invalid-scroll-axis",
                "got": bad[0],
            },
        )
    return frozenset(rs.scroll_axes)


def _load_content_class(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str
) -> Optional[str]:
    """AMENDMENT 5 (ledger row 1937): resolves the `content <class>`
    sizing-bag key into `Leaf.content`, or `None` when undeclared (the
    pre-Amendment-5 default, dormant for every existing leaf — see
    `wellformed.py`'s L5/L5a/L5c, which only fire when `content` is
    genuinely declared). Legal ONLY on a leaf: `content` describes what
    a LEAF renders (the axis the consult report's §9.2 deliberately
    keeps orthogonal to `domain`/`facets`), so a declaration surviving to
    this call on a Split or Exclusive node is refused loudly rather than
    silently ignored — the same "refuse, never drop the author's
    declared intent" discipline `_load_gap_px`'s node-kind check already
    applies to `gap` on a leaf/T node.
    """
    if rs is None or rs.content is None:
        return None
    if node_kind != "leaf":
        raise LytLoadError(
            f"content declared at {where} but 'content' is a LEAF-only "
            "axis (it names what a leaf renders, orthogonal to "
            "domain/facets — .claude/dispatch-reports/lyt-tab-region-"
            f"consult.md §9.2) — a {node_kind} node may not declare it "
            "(AMENDMENT 5, ledger row 1937)",
            {
                "where": where,
                "law": "content-class-declaration",
                "prohibition": "content-class-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    if rs.content not in VALID_CONTENT_CLASSES:
        raise LytLoadError(
            f"unknown content class {rs.content!r} at {where} — must be "
            f"one of {sorted(VALID_CONTENT_CLASSES)} (AMENDMENT 5, ledger "
            "row 1937)",
            {
                "where": where,
                "law": "content-class-declaration",
                "prohibition": "unknown-content-class",
                "got": rs.content,
                "valid": sorted(VALID_CONTENT_CLASSES),
            },
        )
    return rs.content


def _load_boundary_marker(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str
) -> bool:
    """AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
    lyt-tab-region-consult.md §6.3): resolves the bare `boundary` sizing-bag
    flag into `Leaf.boundary`. `False` when undeclared -- the byte-identical
    default for every leaf that was never `domain == 'blackbox'` under the
    now-retired spelling. Legal ONLY on a leaf, same "refuse, never drop the
    author's declared intent" discipline `_load_content_class`'s node-kind
    check already applies -- the marker names "an unmodeled subtree stands
    here", which only makes sense at a terminal (a Split/Exclusive already
    HAS visible structure by definition, so it cannot also claim to be an
    unmodeled base case).
    """
    if rs is None or not rs.boundary:
        return False
    if node_kind != "leaf":
        raise LytLoadError(
            f"boundary declared at {where} but 'boundary' is a LEAF-only "
            "marker (it names 'an unmodeled subtree stands here' -- "
            ".claude/dispatch-reports/lyt-tab-region-consult.md §6.3) — a "
            f"{node_kind} node may not declare it (AMENDMENT 6, ledger row "
            "1937)",
            {
                "where": where,
                "law": "boundary-marker",
                "prohibition": "boundary-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    return True


def _load_ceiling_flag(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str, content: Optional[str]
) -> bool:
    """AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    loop experiment round 3, ledger rows 2037/2038/2066): resolves the
    bare `ceiling` sizing-bag flag.

    The flag says: this slot's declared extent is an UPPER BOUND on what
    its content occupies, never a standing floor the realization must
    fill.

    L9 (ceiling honesty), refused here rather than merely documented:

      (a) LEAF-ONLY, the same discipline `_load_content_class` /
          `_load_boundary_marker` apply — a Split's own extent is the
          partition its children live in, and "occupy less than declared"
          there would silently re-partition siblings the children never
          agreed to.
      (b) REQUIRES `content bounded`. `unbounded` content has no honest
          realized extent to shrink to (that is what its declared scroll
          owner is FOR), and `designed` content is a hard reservation by
          L5c. Only a bounded leaf enumerates a finite content set whose
          per-state extents are reserved INSIDE the leaf — which is what
          makes "occupies less than its ceiling" a declared fact about the
          negotiated cross-extent rather than a content measurement
          re-partitioning its neighbours (the one thing this language
          exists to forbid; research/lyt/README.md, "Why LYT exists").
    """
    if rs is None or not rs.ceiling:
        return False
    if node_kind != "leaf":
        raise LytLoadError(
            f"ceiling declared at {where} but 'ceiling' is a LEAF-only "
            "flag — a split's extent IS its children's partition, and a "
            "partition that occupies less than it declares re-partitions "
            f"siblings that never declared it (L9) — a {node_kind} node "
            "may not declare it (AMENDMENT 7, ledger rows 2107/2108)",
            {
                "where": where,
                "law": "L9",
                "prohibition": "ceiling-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    if content != "bounded":
        raise LytLoadError(
            f"ceiling declared at {where} but the leaf's content class is "
            f"{content!r} — L9 (ceiling honesty) admits 'bounded' only: "
            "'unbounded' content yields by scrolling (its declared scroll "
            "owner already absorbs the excess) and 'designed' content is a "
            "hard reservation by L5c, so neither has an honest realized "
            "extent smaller than its declaration (AMENDMENT 7, ledger "
            "rows 2107/2108)",
            {
                "where": where,
                "law": "L9",
                "prohibition": "ceiling-without-bounded-content",
                "content": content,
            },
        )
    return True


def _load_measure_bound(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str
) -> bool:
    """AMENDMENT 7 (ported from the model-iteration loop experiment round
    6, ledger rows 2037/2038/2066): resolves the bare `measure-bound`
    sizing-bag flag.

    The flag says: this slot's extent along its parent's partition axis
    comes from the PAGE MEASURE its aspect-locked content is bound by —
    its own cross axis — and the residual on the partition axis belongs
    to its siblings.

    Load-time refusal, one clause only:

      - NOT ON AN EXCLUSIVE. Every child of a T node receives the SAME
        rectangle (SPEC.md §2) — there is no partition axis for a
        measure to be traded against and no residual to hand a sibling,
        so the declaration would name nothing. Legal on a Leaf (an
        aspect-locked leaf standing directly in a partition) and on a
        Split (a board composite shape).

    The substantive check is structural, not local: whether an
    aspect-locked leaf actually stands in this slot's subtree for the
    measure to bind through is a subtree fact, so it lives in
    `wellformed.find_l11_violations` (L11) — the same split L10 already
    makes between its load-time and structural halves.
    """
    if rs is None or not rs.measure_bound:
        return False
    if node_kind == "exclusive":
        raise LytLoadError(
            f"measure-bound declared at {where} but a T (exclusive) node's "
            "children all share ONE rectangle — there is no partition axis "
            "to take a measure on and no residual to leave a sibling, so the "
            "declaration names nothing (L11 — AMENDMENT 7, ledger rows "
            "2107/2108)",
            {
                "where": where,
                "law": "L11",
                "prohibition": "measure-bound-on-exclusive",
                "node_kind": node_kind,
            },
        )
    return True


def _load_wrap_policy(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    unit_axes: FrozenSet[Tuple[str, float]],
) -> Optional[str]:
    """AMENDMENT 7 (ported from the model-iteration loop experiment round
    6, ledger rows 2037/2038/2066): resolves the `wrap <policy>`
    sizing-bag key into `Slot.wrap_policy`, or `None` when undeclared —
    byte-identical to every pre-Amendment-7 slot.

    The key says: when this slot's vocabulary of units needs more than
    one row, THIS is how the rows are cut. `balanced`: the vocabulary
    either stands on one row or distributes its units evenly across the
    rows it needs, so the break is a vocabulary boundary rather than
    wherever the flow happened to run out, and the last unit is never
    orphaned alone beneath the rest of its own vocabulary.

    Refusals:

      (a) CLOSED VOCABULARY (`balanced` today) — an unknown policy is
          refused, never silently ignored.
      (b) NOT ON A SPLIT. A Split's children are separately-reserved
          slots the partition already places; "wrapping" them would be
          a second, competing placement mechanism for the same tree.
      (c) ON A LEAF, REQUIRES A DECLARED HORIZONTAL UNIT (`unit h`). A
          wrap policy is a statement ABOUT units; a leaf whose units the
          model has not declared has no vocabulary to distribute, and
          accepting the policy there would be a promise nothing could
          keep. An EXCLUSIVE needs no such declaration: its units ARE its
          declared children, which the tree already names (the same
          reasoning `_load_unit_axes` uses to refuse `unit` on a
          container in the first place).
    """
    if rs is None or rs.wrap is None:
        return None
    policy = rs.wrap
    if policy not in VALID_WRAP_POLICIES:
        raise LytLoadError(
            f"unknown wrap policy {policy!r} at {where} — the closed "
            f"vocabulary is {sorted(VALID_WRAP_POLICIES)} (AMENDMENT 7, "
            "ledger rows 2107/2108)",
            {
                "where": where,
                "law": "wrap-policy",
                "prohibition": "unknown-wrap-policy",
                "got": policy,
                "valid": sorted(VALID_WRAP_POLICIES),
            },
        )
    if node_kind == "split":
        raise LytLoadError(
            f"wrap declared at {where} but 'wrap' is refused on a split — a "
            "split's children are separately-reserved slots its own "
            "partition already places, so a wrap policy there would be a "
            "second, competing placement mechanism for the same tree "
            "(AMENDMENT 7, ledger rows 2107/2108)",
            {
                "where": where,
                "law": "wrap-policy",
                "prohibition": "wrap-on-split",
                "node_kind": node_kind,
            },
        )
    if node_kind == "leaf" and not any(axis == "h" for axis, _ in unit_axes):
        raise LytLoadError(
            f"wrap declared at {where} but this leaf declares no horizontal "
            "unit — a wrap policy is a statement ABOUT units, and a leaf "
            "whose units the model has not declared (`unit h <px>`, L10) has "
            "no vocabulary to distribute (AMENDMENT 7, ledger rows "
            "2107/2108)",
            {
                "where": where,
                "law": "wrap-policy",
                "prohibition": "wrap-without-declared-unit",
                "unit_axes": sorted(unit_axes),
            },
        )
    return policy


def _load_unit_axes(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    content: Optional[str],
) -> FrozenSet[Tuple[str, float]]:
    """AMENDMENT 7 (ported from the model-iteration loop experiment round
    5, ledger rows 2037/2038/2066/2079): resolves the (possibly-repeated)
    `unit <axis> <extent>` sizing-bag key into a frozenset of `(axis, px)`
    pairs, or the empty frozenset when no `unit` term was declared — the
    pre-Amendment-7 default, byte-identical for every leaf that does not
    declare one.

    The key says: along this axis, the leaf's content is a REPETITION of
    an indivisible unit of this extent — the container knew its own
    extent but not the extent of the thing it is made of.

    L10 (unit integrity) is the law. Its LOAD-TIME half is refused here
    (the structural half — "a slot must reserve a whole number of units
    along its own partition axis" — is `wellformed.find_l10_violations`,
    since only a tree walk knows which axis a slot is partitioned on):

      (a) LEAF-ONLY, the same discipline `_load_content_class` /
          `_load_boundary_marker` / `_load_ceiling_flag` apply: a unit is
          a fact about what a leaf RENDERS. A split's own "unit" is its
          children, which the tree already names.
      (b) REQUIRES `content bounded` or `content unbounded`. A `designed`
          leaf's content is ONE designed picture (a chart), not a
          repetition of anything — claiming a unit for it would be as
          dishonest as L5c's own chart exclusion, and an unclassified
          leaf has made no claim about its content at all yet.
      (c) `{h,v}` axes only, at most ONE unit per axis (a leaf's content
          has one indivisible unit per axis, not two competing ones), and
          a bare `px` literal only — same "the author's declared unit is
          never silently reinterpreted" posture `_load_gap_px` takes, and
          for the stronger reason here that `fr` (a share of a partition)
          is exactly what a unit is NOT.
    """
    if rs is None or not rs.unit_axes:
        return frozenset()
    if node_kind != "leaf":
        raise LytLoadError(
            f"unit declared at {where} but 'unit' is a LEAF-only key — a "
            "unit names the indivisible thing a leaf's CONTENT is made "
            f"of, and a {node_kind} node's own 'units' are its children, "
            "which the tree already names (L10, unit integrity — "
            "AMENDMENT 7, ledger rows 2107/2108)",
            {
                "where": where,
                "law": "L10",
                "prohibition": "unit-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    if content not in ("bounded", "unbounded"):
        raise LytLoadError(
            f"unit declared at {where} but the leaf's content class is "
            f"{content!r} — L10 (unit integrity) admits 'bounded' and "
            "'unbounded' only: 'designed' content is ONE designed picture "
            "(L5c already forbids yielding it piecewise), and an "
            "unclassified leaf has made no claim about its content to "
            "declare a unit of (AMENDMENT 7, ledger rows 2107/2108)",
            {
                "where": where,
                "law": "L10",
                "prohibition": "unit-without-repeatable-content",
                "content": content,
            },
        )
    resolved: List[Tuple[str, float]] = []
    seen: set = set()
    for axis, ext in rs.unit_axes:
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"unit axis at {where} must be 'h' or 'v', got {axis!r} "
                "(L10 — AMENDMENT 7, ledger rows 2107/2108)",
                {
                    "where": where,
                    "law": "L10",
                    "prohibition": "invalid-unit-axis",
                    "got": axis,
                },
            )
        if axis in seen:
            raise LytLoadError(
                f"unit axis {axis!r} declared more than once at {where} — a "
                "leaf's content has ONE indivisible unit per axis; two "
                "competing units on one axis leave 'what may not be split' "
                "ambiguous (L10 — AMENDMENT 7, ledger rows 2107/2108)",
                {
                    "where": where,
                    "law": "L10",
                    "prohibition": "duplicate-unit-axis",
                    "got": axis,
                },
            )
        seen.add(axis)
        if isinstance(ext, lytparser.RawExtent) and ext.kind == "numunit" and ext.unit == "px":
            resolved.append((axis, float(ext.v)))
            continue
        bad_unit = ext.unit if isinstance(ext, lytparser.RawExtent) and ext.unit else None
        bad_symbol = ext.symbol if isinstance(ext, lytparser.RawExtent) and ext.symbol else None
        raise LytLoadError(
            f"unit extent at {where} must be a constant px extent — 'fr' "
            "is a SHARE OF A PARTITION, which is precisely what an "
            "indivisible content unit is not; 'ch', extent sums and "
            "symbolic sentinels are refused in unit position for the same "
            "'never silently reinterpret the author's declared unit' "
            "reason `gap` refuses them (L10 — AMENDMENT 7, ledger rows "
            "2107/2108)",
            {
                "where": where,
                "law": "L10",
                "prohibition": "non-px-unit",
                "unit": bad_unit,
                "symbol": bad_symbol,
                "is_sum": isinstance(ext, lytparser.RawExtentSum),
            },
        )
    return frozenset(resolved)


def _load_leaf(
    rl: lytparser.RawLeaf,
    *,
    where: str,
    content: Optional[str] = None,
    boundary: bool = False,
    unit_axes: FrozenSet[Tuple[str, float]] = frozenset(),
) -> ast.Leaf:
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
    return ast.Leaf(
        widget=rl.widget,
        facets=frozenset(facets),
        domain=domain,
        flagged=rl.flagged,
        content=content,  # AMENDMENT 5, ledger row 1937
        boundary=boundary,  # AMENDMENT 6, ledger row 1937
        unit_axes=unit_axes,  # AMENDMENT 7 (L10), ledger rows 2107/2108
    )


def load_slot(rs: lytparser.RawSlot, *, path: str = "root") -> ast.Slot:
    node = rs.node
    if isinstance(node, lytparser.RawLeaf):
        # AMENDMENT 5 (ledger row 1937): resolved before `_load_leaf` so
        # the validated class can be threaded into `ast.Leaf` at
        # construction (the same "resolve first, construct once" shape
        # `_load_sizing`/`_load_presence` already use).
        content = _load_content_class(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        boundary = _load_boundary_marker(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        # AMENDMENT 7 (L10, see `_load_unit_axes`): resolved here, in
        # the same "resolve first, construct once" shape as `content`
        # above, because the unit's own legality DEPENDS on the resolved
        # content class (clause (b): only a bounded/unbounded leaf's
        # content is a repetition of anything).
        unit_axes = _load_unit_axes(
            rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf", content=content
        )
        leaf = _load_leaf(
            node,
            where=f"{path}:{node.widget}",
            content=content,
            boundary=boundary,
            unit_axes=unit_axes,
        )
        # AMENDMENT 3: a leaf has no children at all, so `gap` is refused
        # here too (same law as the T-node refusal below) rather than
        # silently dropped.
        _load_gap_px(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        scroll_axes = _load_scroll_axes(rs.sizing, where=f"{path}:{node.widget}")
        sizing = _load_sizing(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        # AMENDMENT 7 (L9, see `_load_ceiling_flag`): resolved AFTER
        # `_load_sizing` and folded in with `dataclasses.replace` rather
        # than threaded through every `_load_sizing` return path — the flag
        # is orthogonal to how the extents themselves were spelled (bare
        # shorthand / explicit min-pref-max / aspect-coupled sugar), and
        # `Sizing` is frozen, so one replace at the single site that has
        # both the sizing and the resolved content class is the honest seam.
        if _load_ceiling_flag(
            rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf", content=content
        ):
            sizing = dataclasses.replace(sizing, ceiling=True)
        # AMENDMENT 7 (L11, see `_load_measure_bound`): folded in the
        # same `dataclasses.replace` way `ceiling` is, and for the same
        # reason — the flag is orthogonal to how the extents were spelled.
        if _load_measure_bound(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf"):
            sizing = dataclasses.replace(sizing, measure_bound=True)
        # AMENDMENT 7 (see `_load_wrap_policy`): resolved AFTER
        # `unit_axes`, because a leaf's wrap policy is legal only over
        # units the same leaf has already declared.
        wrap_policy = _load_wrap_policy(
            rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf", unit_axes=unit_axes
        )
        presence = _load_presence(rs.presence, where=f"{path}:{node.widget}")
        sizing = _apply_preserve_reservation(sizing, presence, where=f"{path}:{node.widget}")
        return ast.Slot(
            node=leaf, presence=presence, sizing=sizing,
            violates=frozenset(rs.warns), scroll_axes=scroll_axes,
            wrap_policy=wrap_policy,
        )
    if isinstance(node, lytparser.RawSplit):
        children = [
            load_slot(c, path=f"{path}/{node.axis.upper()}{i}") for i, c in enumerate(node.children)
        ]
        # AMENDMENT 3 (ledger row 1715): `gap_px` is now resolved from an
        # optional `gap <extent>` sizing term instead of being hardcoded
        # to 0.0 (the F10-era disclosure this replaces — see the module
        # docstring's AMENDMENT 3 paragraph and `_load_gap_px`'s own
        # docstring for the full law). No `gap` term still resolves to
        # 0.0, so an un-amended `.lyt` file's geometry is unchanged.
        gap_px = _load_gap_px(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 5: `content` is leaf-only -- a Split declaring it is
        # refused loudly here, same call shape as the leaf branch above.
        _load_content_class(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 6: `boundary` is leaf-only too, same reason.
        _load_boundary_marker(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 7: `ceiling` is leaf-only too (L9), same reason.
        _load_ceiling_flag(rs.sizing, where=path, node_kind="split", content=None)
        # AMENDMENT 7: `unit` is leaf-only too (L10), same reason.
        _load_unit_axes(rs.sizing, where=path, node_kind="split", content=None)
        # AMENDMENT 7: `wrap` is refused on a split (its children are
        # already placed by its own partition) — refused loudly here, same
        # shape as every other node-kind refusal above.
        _load_wrap_policy(rs.sizing, where=path, node_kind="split", unit_axes=frozenset())
        scroll_axes = _load_scroll_axes(rs.sizing, where=path)
        split = ast.Split(axis=node.axis, gap_px=gap_px, children=children)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 7 (L11): a Split IS the shape a board composite may
        # declare `measure-bound` on, so this branch resolves it rather
        # than refusing it.
        if _load_measure_bound(rs.sizing, where=path, node_kind="split"):
            sizing = dataclasses.replace(sizing, measure_bound=True)
        presence = _load_presence(rs.presence, where=path)
        sizing = _apply_preserve_reservation(sizing, presence, where=path)
        return ast.Slot(
            node=split, presence=presence, sizing=sizing,
            violates=frozenset(rs.warns), scroll_axes=scroll_axes,
        )
    if isinstance(node, lytparser.RawExclusive):
        children = [load_slot(c, path=f"{path}/T{i}") for i, c in enumerate(node.children)]
        # AMENDMENT 3: a T node takes no gap — refused loudly (not
        # silently ignored) if the author declared one, same as any other
        # law this loader enforces.
        _load_gap_px(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 5: `content` is leaf-only -- refused here too.
        _load_content_class(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 6: `boundary` is leaf-only too, same reason.
        _load_boundary_marker(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 7: `ceiling` is leaf-only too (L9), same reason.
        _load_ceiling_flag(rs.sizing, where=path, node_kind="exclusive", content=None)
        # AMENDMENT 7: `unit` is leaf-only too (L10), same reason.
        _load_unit_axes(rs.sizing, where=path, node_kind="exclusive", content=None)
        # AMENDMENT 7 (L11): `measure-bound` is refused on a T node —
        # every child shares one rectangle, so there is no residual.
        _load_measure_bound(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 7: `wrap` IS legal here — a T group's own tab
        # strip is a vocabulary whose units are its declared children, so
        # no `unit` declaration is required (or accepted) alongside it.
        wrap_policy = _load_wrap_policy(
            rs.sizing, where=path, node_kind="exclusive", unit_axes=frozenset()
        )
        scroll_axes = _load_scroll_axes(rs.sizing, where=path)
        excl = ast.Exclusive(children=children, tag=node.tag)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="exclusive")
        presence = _load_presence(rs.presence, where=path)
        sizing = _apply_preserve_reservation(sizing, presence, where=path)
        return ast.Slot(
            node=excl, presence=presence, sizing=sizing,
            violates=frozenset(rs.warns), scroll_axes=scroll_axes,
            wrap_policy=wrap_policy,
        )
    raise LytLoadError("unknown raw node kind", {"path": path, "node": repr(node)})


def load_layouts(
    text: str,
    *,
    waivers: Optional["Dict[str, List[object]]"] = None,
) -> "dict[str, ast.Slot]":
    """Parse + type-check every `layout NAME = ...` fragment in `text`.
    Runs the L1/L2 well-formedness pass on each before returning (see
    wellformed.py) — a caller never receives a Slot tree that hasn't passed
    both the type-level and structural checks.

    `waivers`, when given, is a `layout name -> [wellformed.Waiver, ...]`
    map — the `--baseline` load-mode support named by the
    lyt-constants-swap commission (row 1687) for loading an as-is
    encoding that is honestly, disclosedly L2-non-conformant. Omitted
    (the default, `None`) is byte-identical to this function's
    pre-baseline behavior: every layout loads in strict mode, any L2
    violation raises. A layout name absent from the map (or the map
    itself absent) gets `waivers=None` passed to `check_wellformed`,
    which that function treats as "no waivers for this layout" — same
    strict behavior, not a silent skip of the check itself.
    """
    from wellformed import check_wellformed

    waivers = waivers or {}
    raws = lytparser.parse_layouts(text)
    out = {}
    for raw in raws:
        slot = load_slot(raw.slot, path=raw.name)
        check_wellformed(slot, layout_name=raw.name, waivers=waivers.get(raw.name))
        out[raw.name] = slot
    return out
