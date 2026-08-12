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
# METAMODEL WAVE, item 1 (ledger row 2157/2158): the closed orientation
# vocabulary `_load_orientation` refuses against -- the loader-side mirror
# of `lyt_ast._VALID_ORIENTATIONS`, same two-layer posture every other
# closed-vocabulary field in this loader already uses.
VALID_ORIENTATIONS = {"h", "v"}
# LOOP ITERATION 10 / arc 4 round 3 (ledger rows 2037/2066/2107/2157/2228):
# L14's two ROLE names. Every axis-taking sizing key in this language names
# a PHYSICAL axis ('h'/'v'), which is the right frame for a slot -- a slot's
# axes are its parent's. It is the wrong frame for a leaf that lays ITSELF
# out along a declared `orient`: such a leaf's facts ("the lattice pitch
# across my flow", "my flow overflows") are facts about ITS OWN frame, and
# spelling them physically forces the same fact to be re-declared, differently,
# once per screen class -- which is exactly the per-view declaration METAMODEL
# WAVE item 1 introduced `orient` to retire. `along` resolves to the leaf's own
# orientation axis; `across` resolves to the other one.
VALID_AXIS_ROLES = {"along", "across"}
# LOOP ITERATION 11 / arc 4 round 4 (ledger rows 2037/2066/2107/2157/2241):
# L15's closed ACTIVITY vocabulary -- the loader-side mirror of
# `lyt_ast._VALID_ACTIVITY_LEVELS`, same two-layer posture every other
# closed-vocabulary field here already uses.
VALID_ACTIVITY_LEVELS = {"sustained", "occasional"}
# LOOP ITERATION 13 / arc 4 round 6 (ledger rows 2037/2066/2107/2157/2286):
# L17's closed EDGE-DISPOSITION vocabulary -- the loader-side mirror of
# `lyt_ast._VALID_EDGE_DISPOSITIONS`, same two-layer posture.
VALID_EDGE_DISPOSITIONS = {"unit", "item", "continuous"}


def _resolve_axis_token(
    token: str, *, orientation: Optional[str], where: str, key: str, law: str
) -> str:
    """LOOP ITERATION 10 / ARC 4 ROUND 3 (L14, ledger row 2228): binds one
    axis token to a PHYSICAL axis. A physical token passes through
    untouched (so every pre-iteration encoding resolves byte-identically);
    a ROLE token resolves against the leaf's own declared `orient`.

    Refused loudly, one clause: a role token OFF A LEAF. A Split's or
    Exclusive's axes are its parent's partition and its own children's
    rectangle -- neither has an orientation for `along`/`across` to mean
    anything against, so the token would name nothing, which is the
    decorative-declaration failure mode this loader's whole family of
    node-kind refusals exists to prevent. (`orientation is None` is how
    every non-leaf call site spells "no frame here"; a leaf always has one,
    since `_load_orientation` defaults it to 'v'.)
    """
    if token not in VALID_AXIS_ROLES:
        return token
    if orientation is None:
        raise LytLoadError(
            f"{key} declared at {where} with the ROLE axis {token!r}, but "
            f"{token!r} resolves against a leaf's own declared `orient` and "
            "this is not a leaf — a split's axes are its parent's partition "
            "and a T's children all share one rectangle, so neither has an "
            "orientation for a role name to bind to and the declaration "
            f"would name nothing ({law} — LOOP ITERATION 10, ledger row 2228)",
            {
                "where": where,
                "law": law,
                "prohibition": "role-axis-on-non-leaf",
                "got": token,
                "key": key,
            },
        )
    if token == "along":
        return orientation
    return "h" if orientation == "v" else "v"


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


def _resolve_envelope_state_extents(
    rs: lytparser.RawSizing, *, where: str, pref_extent: ast.Extent
) -> Optional[Dict[str, ast.Extent]]:
    """METAMODEL WAVE, item 2 (ledger row 2157/2173-2176). `rs.
    envelope_entries` is the per-state `(name, extent_or_None)` list the
    parser now captures. Returns `None` for the pre-wave legacy shape (no
    entries at all, or every entry a bare name with no `: <extent>`) —
    unchanged, `envelope_states` stays documentation exactly as it always
    was. Returns the resolved `{name: Extent}` map when every entry
    carries an extent — the dict-envelope upgrade (rev2 domain-model-
    proposal §2.1): "reservation is not an extent, it is a function from a
    finite, declared set of activity states to extents, and its
    reservation is the max over the set." Refuses loudly rather than
    guessing at:

      (a) a MIXED list (some entries named, some not) — an author who
          gives ONE state an extent and leaves a sibling bare has not
          declared a function, they have declared an inconsistency.
      (b) cross-unit incomparability among the declared extents (only
          px vs fr can actually arise here, since `ch` is already
          resolved to px earlier in this same pass) — there is no
          honest "max" across incommensurable units, so this is refused
          rather than guessed, the same posture `_apply_preserve_
          reservation`'s own min/pref unit-mismatch check already takes.
      (c) the slot's own declared `pref` disagreeing with the computed
          max — this is the check that makes L3's state list finally
          COMPUTE something (SPEC.md §4.2's own disclosed gap: "the code
          does not compute a max over anything"): the reservation the
          author wrote must equal what their own declared states justify.
    """
    entries = rs.envelope_entries
    if not entries:
        return None
    named = [(name, ext) for name, ext in entries if ext is not None]
    if not named:
        return None  # legacy bare-name spelling, unchanged
    if len(named) != len(entries):
        unnamed = [name for name, ext in entries if ext is None]
        raise LytLoadError(
            f"envelope at {where} mixes states WITH a declared extent and "
            f"states WITHOUT one ({sorted(unnamed)} carry none) — a "
            "dict-envelope must declare an extent for EVERY state, or for "
            "NONE (the legacy documentation-only spelling); a mix is "
            "neither (METAMODEL WAVE item 2, ledger row 2157/2173)",
            {
                "where": where,
                "law": "L3",
                "prohibition": "mixed-envelope-entries",
                "unnamed_states": sorted(unnamed),
            },
        )
    resolved: Dict[str, ast.Extent] = {}
    for name, raw_ext in named:
        resolved[name] = _resolve_extent_like(raw_ext, where=f"{where} (envelope state {name!r})")
    units = {e.unit for e in resolved.values()}
    if len(units) > 1:
        raise LytLoadError(
            f"envelope at {where} declares states in incomparable units "
            f"({sorted(units)}) — there is no honest max across units "
            "this loader will guess at (METAMODEL WAVE item 2, ledger row "
            "2157/2173)",
            {
                "where": where,
                "law": "L3",
                "prohibition": "envelope-extent-unit-mismatch",
                "units": sorted(units),
            },
        )
    max_extent = max(resolved.values(), key=lambda e: e.v)
    if max_extent.unit != pref_extent.unit or max_extent.v != pref_extent.v:
        raise LytLoadError(
            f"envelope at {where} declares a componentwise max of "
            f"{max_extent.v:g}{max_extent.unit} over its states, but the "
            f"slot's own 'pref' is {pref_extent.v:g}{pref_extent.unit} — "
            "the declared reservation must equal what the declared states "
            "justify (rev2 domain-model-proposal §2.1: 'reservation is "
            "the max over the set'), refused rather than silently letting "
            "the two drift (METAMODEL WAVE item 2, ledger row 2157/2173)",
            {
                "where": where,
                "law": "L3",
                "prohibition": "envelope-reservation-mismatch",
                "computed_max": {"unit": max_extent.unit, "v": max_extent.v},
                "declared_pref": {"unit": pref_extent.unit, "v": pref_extent.v},
            },
        )
    return resolved


def _load_axis_mins(
    rs: lytparser.RawSizing, *, where: str, orientation: Optional[str] = None
) -> FrozenSet[Tuple[str, ast.Extent]]:
    """LOOP ITERATION 8 / ARC 4 (model-iteration loop EXPERIMENT, ledger rows
    2037/2066/2107/2157) — L12 (floor attribution), LOAD-TIME half.

    Resolves the (possibly-repeated) `min <axis> <extent>` sizing-bag key
    into a frozenset of `(axis, Extent)` pairs, or the empty frozenset when
    no axis-keyed `min` term was declared — the pre-iteration default,
    byte-identical for every slot that declares none.

    THE LAW. A floor is a fact about an axis. Everywhere in this language a
    slot's `min` already names exactly one axis — the one its parent
    partitions on — so the fact and the key agree. There is exactly one
    position where they cannot: a direct child of an Exclusive/T node (and
    the root), whose rectangle IS its parent's on BOTH axes, so `min` is
    read as a floor on both (`compiler._constrain`'s `along=None` branch,
    SPEC.md §4.2's own load-bearing fact 2). Both worked encodings carry
    numbers of exactly that shape, and both encodings' own BOTH-AXES
    TENSION notes already record the reading as inherited-and-disclosed
    rather than intended. `min <axis>` is the key that lets the author say
    which axis the number is a fact about; it is L11's own ruling ("a
    declaration binds the axis it is about") applied to floors.

    Refused loudly here (the STRUCTURAL half — "is this slot actually in a
    both-axes position?" — is `wellformed.find_l12_violations`, since only
    a tree walk knows a slot's parent):

      (a) `{h,v}` only, at most ONE per axis. Two competing floors on one
          axis leave "what may this slot not shrink below" ambiguous, the
          same reasoning `_load_unit_axes` applies to two competing units.
      (b) A CONSTANT extent only (`px`/`ch`, or a sum of them). `fr` is a
          SHARE of a partition — but the whole point of this key is the
          position where there is no partition axis to take a share of, so
          an `fr` floor there is not merely unresolvable (which
          `_apply_bound` already refuses one level down) but incoherent.
          `inf`/`maximize` are refused for the ordinary reason a floor is
          not a sentinel.
      (c) NOT combinable with the `{28px}` fixed shorthand or with
          `aspect-coupled`. Both of those produce their whole sizing triple
          from one declaration and would silently DISCARD an axis floor
          declared beside them — the silent failure ADR-0002 forbids, so
          the combination is refused instead of quietly dropped.
    """
    if not rs.axis_mins:
        return frozenset()
    if rs.fixed is not None or rs.aspect_coupled:
        which = "the `{Npx}` fixed shorthand" if rs.fixed is not None else "'aspect-coupled'"
        raise LytLoadError(
            f"min <axis> declared at {where} alongside {which} — that "
            "shorthand produces the whole min/pref/max triple from one "
            "declaration, so a per-axis floor beside it would be silently "
            "DISCARDED; spell the triple out if one axis genuinely needs "
            "its own floor (L12, floor attribution — LOOP ITERATION 8 / "
            "ARC 4, ledger rows 2037/2066/2107/2157)",
            {
                "where": where,
                "law": "L12",
                "prohibition": "axis-min-with-shorthand",
                "shorthand": "fixed" if rs.fixed is not None else "aspect-coupled",
            },
        )
    resolved: List[Tuple[str, ast.Extent]] = []
    seen: set = set()
    for raw_axis, ext in rs.axis_mins:
        # LOOP ITERATION 10 (L14): role -> physical, before the closed
        # vocabulary below (see `_resolve_axis_token`).
        axis = _resolve_axis_token(
            raw_axis, orientation=orientation, where=where, key="min", law="L14"
        )
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"min axis at {where} must be 'h' or 'v', got {axis!r} "
                "(L12 — LOOP ITERATION 8 / ARC 4, ledger rows "
                "2037/2066/2107/2157)",
                {"where": where, "law": "L12", "prohibition": "invalid-axis-min-axis", "got": axis},
            )
        if axis in seen:
            raise LytLoadError(
                f"min axis {axis!r} declared more than once at {where} — a "
                "slot has ONE floor per axis; two competing floors on one "
                "axis leave what the slot may not shrink below ambiguous "
                "(L12 — LOOP ITERATION 8 / ARC 4, ledger rows "
                "2037/2066/2107/2157)",
                {"where": where, "law": "L12", "prohibition": "duplicate-axis-min", "got": axis},
            )
        seen.add(axis)
        extent = _resolve_extent_like(ext, where=where)
        if extent.unit == "fr":
            raise LytLoadError(
                f"min {axis} at {where} is an 'fr' extent — an axis floor "
                "is only meaningful where the slot's rectangle is its "
                "parent's on both axes, which is precisely where there is "
                "no partition for a share to denominate against (L12 — "
                "LOOP ITERATION 8 / ARC 4, ledger rows 2037/2066/2107/2157)",
                {"where": where, "law": "L12", "prohibition": "fr-axis-min", "axis": axis},
            )
        resolved.append((axis, extent))
    return frozenset(resolved)


def _load_sizing(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    orientation: Optional[str] = None,
) -> ast.Sizing:
    if rs is None:
        raise LytLoadError(f"slot at {where} has no sizing block", {"where": where})

    # LOOP ITERATION 8 / ARC 4 (L12, see `_load_axis_mins`): resolved BEFORE
    # the two early-returning shorthand branches below, so the refusal in
    # clause (c) actually fires instead of the shorthand silently winning.
    # LOOP ITERATION 10 (L14): `orientation` is threaded in only so a
    # LEAF's axis-keyed `min` may name its floor in the leaf's own frame
    # (`min across 60px`). It is `None` for every non-leaf call site, which
    # is precisely how `_resolve_axis_token` refuses a role name there.
    axis_mins = _load_axis_mins(rs, where=where, orientation=orientation)

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
        envelope_state_extents = None
        if basis == "envelope":
            envelope_state_extents = _resolve_envelope_state_extents(
                rs, where=where, pref_extent=fixed_extent
            )
        return ast.Sizing(
            min=fixed_extent,
            pref=fixed_extent,
            max=fixed_extent,
            basis=basis,
            envelope_states=envelope_states,
            envelope_state_extents=envelope_state_extents,
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

    envelope_state_extents = None
    if basis == "envelope":
        envelope_state_extents = _resolve_envelope_state_extents(
            rs, where=where, pref_extent=pref_extent
        )

    return ast.Sizing(
        min=min_extent,
        pref=pref_extent,
        max=max_val,
        aspect=rs.aspect,
        axis_mins=axis_mins,  # LOOP ITERATION 8 / ARC 4 (L12)
        basis=basis,
        envelope_states=envelope_states,
        envelope_state_extents=envelope_state_extents,
    )


def _load_demote_presence(
    rp: lytparser.RawPresence,
    *,
    where: str,
    node_kind: str,
    activity: Optional[str],
    content: Optional[str],
    tag: Optional[str] = None,
) -> ast.Presence:
    """LOOP ITERATION 11 / arc 4 round 4 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2241; branch lyt-model-loop-experiment,
    NOT merged without ratification): resolves the `@demote(<axis> <px>)`
    presence kind — L15's LOAD-TIME half.

    THE DECLARATION. `@demote(h 616px)` on a leaf reads: while the band
    that hosts this slot is granted less than 616px along `h`, this slot
    is ABSENT — its reservation released to its siblings, its content
    re-hosted in the overlay stratum (SPEC.md §2: overlays are not tree
    nodes, contribute no constraints, occupy no standing space) — and at
    or above 616px it stands in the band as declared.

    WHY A PRESENCE KIND AND NOT A SIZING KEY. What a demoted slot does is
    exactly what `@toggle(user, release)` does: it stops standing and its
    extent goes to its siblings. The presence stratum already owns that
    verb, already prunes such a slot out of the tree before the solve
    (`presence.prune_absent`), and already solves each reachable valuation
    separately (Amendment 4). Spelling demotion as a sizing key would have
    been a second, competing mechanism for a fact the language can already
    say — and would have hidden it from `presence.py`, which is the one
    module that knows what "absent" means.

    THE FIVE REFUSALS, PLUS ONE SCOPED WIDENING (LYT presence arc P1,
    row 2333, mobile/portrait repetition-first disposition; see
    `.claude/dispatch-reports/lyt-p1-presence-model.md`).

      (a) LEAF-OR-CONTROL-PANEL-EXCLUSIVE ONLY
          (`"demote-on-non-leaf-non-exclusive"`). `presence.prune_absent`'s
          own disclosed scope was originally that only a bare LEAF can be
          named absent in a valuation; a SPLIT declaring `@demote` still
          takes exactly this refusal (a Split's children are independently
          addressable siblings, not alternatives — pruning the whole band
          on one threshold none of its descendants individually agreed to
          would hide facts about which specific child paid for the
          decision). An EXCLUSIVE (`T`) node is structurally different:
          per SPEC.md §2, every child of a `T` already receives the
          IDENTICAL rectangle and exactly one is visible at a time — the
          group is already ONE presence-relevant unit from its own
          parent's perspective, the same way a single leaf is. Demoting
          the whole group is therefore not "hiding a subtree no
          descendant agreed to" in the way a Split's demotion would be; it
          is "hiding the one alternative-set unit this group already
          is" — no descendant NEEDS to individually agree, because no
          descendant is ever shown without the others being just as
          absent (Exclusive semantics already make them one screen-time
          unit). `presence.prune_absent` is widened to match (see that
          module's own docstring for the pruning-identity mechanism this
          widening needed — an Exclusive has no `widget` id of its own,
          so its declared `[TAG]` doubles as its presence identity when
          `@demote` names it). Same leaf-only discipline `activity`
          itself takes for the Split case, for a related reason — this
          widening is scoped to Exclusive only, Split stays refused.
      (b) LEAF ONLY: REQUIRES `activity occasional`
          (`"demote-without-occasional-activity"`, `detail.activity`
          naming what was declared instead, including `None`). This is
          the leaf-level law's own safety property: a leaf may only leave
          the band if the ENCODING has said, in the same bag a reader is
          looking at, that its content is configured rather than worked
          with. Without it, `@demote` would be a general "move this into
          a menu when cramped" escape hatch, and the first thing a
          cramped layout would reach for is whatever happens to be
          widest — which on this screen is the metrics strip the user
          reads continuously. NOT checked for an Exclusive — `activity`
          is a `Leaf`-only field (SPEC.md §16.1), and an Exclusive's own
          "occasional-ness" is exactly the fact that only ONE of its
          alternatives is ever on screen at a time, already a narrower
          claim than any single leaf's own `activity sustained` could
          make.
      (c) LEAF ONLY: REQUIRES `content bounded`
          (`"demote-without-bounded-content"`). A demoted leaf's content
          has to be re-hostable somewhere with no standing reservation at
          all. `unbounded` content is content that does not fit its own
          rectangle by declaration (that is what its `scroll` owner is
          for) and cannot honestly be promised a corner popover;
          `designed` content is a hard reservation by L5c. Same gate,
          same three-way `detail.content` report, `_load_ceiling_flag`
          uses. NOT checked for an Exclusive — `content` is a `Leaf`-only
          field too; an Exclusive's own children each carry their own
          `content` classification independently, and demoting the whole
          group re-hosts whichever one is showing, at whatever
          reservation THAT tab already declares for itself.
      (f) EXCLUSIVE ONLY: REQUIRES A DECLARED `[TAG]`
          (`"demote-exclusive-without-tag"`). `presence.PresenceValuation`
          identifies a leaf by its `widget` id; an Exclusive has none, so
          its declared `[TAG]` (SPEC.md §1.1, e.g. `[BLACK BOX]`,
          previously documentation-only) is what a valuation names when
          it names this group absent. An Exclusive with no `[TAG]` has no
          honest identity to be named by — refused loudly rather than
          silently un-nameable.
      (d) CLOSED AXIS VOCABULARY (`"invalid-demote-axis"`). Roles
          (`along`/`across`) are deliberately NOT accepted here: L14's role
          frame resolves against the LEAF's own `orient`, and the axis a
          demotion measures is not a fact about the leaf's interior — it is
          the axis its BAND is under pressure on. Naming it physically is
          the honest spelling, and a role token here would silently mean
          something else.
      (e) A CONSTANT px THRESHOLD (`"non-px-demote-threshold"`). `fr` is a
          share of a partition; a threshold expressed as a share of the
          thing being measured is circular. `ch`, extent sums and symbolic
          sentinels are refused for the same "never silently reinterpret a
          declared measurement" reason `unit`/`gap` refuse them.
    """
    axis = rp.demote_axis
    ext = rp.demote_below
    if node_kind not in ("leaf", "exclusive"):
        raise LytLoadError(
            f"@demote declared at {where} but demotion is a LEAF-or-"
            f"control-panel-EXCLUSIVE-only presence kind — a {node_kind} "
            "node (Split) would take a whole band of independently-"
            "addressable siblings out on a threshold none of them "
            "individually agreed to, and none of them could be re-hosted "
            "individually (presence.py's own pruning scope; L15 — LOOP "
            "ITERATION 11, ledger row 2241; widened for Exclusive, LYT "
            "presence arc P1, row 2333)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "demote-on-non-leaf-non-exclusive",
                "node_kind": node_kind,
            },
        )
    if node_kind == "exclusive":
        if not tag:
            raise LytLoadError(
                f"@demote declared at {where} on an Exclusive with no "
                "declared [TAG] — presence.PresenceValuation identifies a "
                "leaf by its widget id; an Exclusive has none of its own, "
                "so its [TAG] is what a valuation must name to prune it. "
                "An untagged Exclusive has no honest identity to be named "
                "by (L15, LYT presence arc P1, row 2333)",
                {
                    "where": where,
                    "law": "L15",
                    "prohibition": "demote-exclusive-without-tag",
                },
            )
        return _load_demote_axis_and_threshold(axis, ext, where=where)
    if activity != "occasional":
        raise LytLoadError(
            f"@demote declared at {where} but this leaf's declared activity "
            f"is {activity!r} — only content the encoding has explicitly "
            "ranked `activity occasional` may leave its band under "
            "pressure. A demotion the model can apply to content it never "
            "ranked is a demotion it can apply to the controls the user is "
            "working with (L15 — LOOP ITERATION 11, ledger row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "demote-without-occasional-activity",
                "activity": activity,
            },
        )
    if content != "bounded":
        raise LytLoadError(
            f"@demote declared at {where} but this leaf's content class is "
            f"{content!r} — a demoted slot's content is re-hosted in the "
            "overlay stratum, which has no standing reservation at all, so "
            "only `bounded` content (a finite, known demand) can honestly "
            "be promised a home there; `unbounded` content does not fit its "
            "own rectangle by declaration and `designed` content is a hard "
            "reservation (L5c) (L15 — LOOP ITERATION 11, ledger row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "demote-without-bounded-content",
                "content": content,
            },
        )
    return _load_demote_axis_and_threshold(axis, ext, where=where)


def _load_demote_axis_and_threshold(
    axis: Optional[str], ext: object, *, where: str
) -> ast.Presence:
    """Clauses (d)/(e) of `_load_demote_presence`'s own docstring — the
    axis-vocabulary and threshold-unit refusals, shared verbatim by both
    the leaf and the Exclusive branches (LYT presence arc P1, row 2333:
    factored out of `_load_demote_presence` so the Exclusive branch can
    reach it without duplicating the leaf branch's own clauses (b)/(c),
    which do not apply to a composite)."""
    if axis not in VALID_SCROLL_AXES:
        raise LytLoadError(
            f"@demote axis {axis!r} at {where} is not one of "
            f"{sorted(VALID_SCROLL_AXES)} — and note the `along`/`across` "
            "ROLE names L14 introduced are deliberately NOT accepted here: "
            "a role resolves against the LEAF's own orientation, but the "
            "axis a demotion measures is the one its BAND is under pressure "
            "on, which is a different fact (L15 — LOOP ITERATION 11, ledger "
            "row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "invalid-demote-axis",
                "got": axis,
                "valid": sorted(VALID_SCROLL_AXES),
            },
        )
    if not (
        isinstance(ext, lytparser.RawExtent) and ext.kind == "numunit" and ext.unit == "px"
    ):
        bad_unit = ext.unit if isinstance(ext, lytparser.RawExtent) and ext.unit else None
        bad_symbol = ext.symbol if isinstance(ext, lytparser.RawExtent) and ext.symbol else None
        raise LytLoadError(
            f"@demote threshold at {where} must be a constant px extent — "
            "'fr' is a share of the very partition being measured, which "
            "makes the threshold circular; 'ch', extent sums and symbolic "
            "sentinels are refused for the same 'never silently reinterpret "
            "a declared measurement' reason `unit`/`gap` refuse them (L15 — "
            "LOOP ITERATION 11, ledger row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "non-px-demote-threshold",
                "unit": bad_unit,
                "symbol": bad_symbol,
                "is_sum": isinstance(ext, lytparser.RawExtentSum),
            },
        )
    try:
        return ast.demote(axis=axis, below_px=float(ext.v))  # type: ignore[arg-type]
    except ValueError as exc:  # pragma: no cover — every path above already checked
        raise LytLoadError(
            str(exc), {"where": where, "law": "L15", "prohibition": "demote-construction"}
        ) from exc


def _load_activity(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str
) -> Optional[str]:
    """LOOP ITERATION 11 / arc 4 round 4 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2241; branch lyt-model-loop-experiment,
    NOT merged without ratification): resolves the `activity <level>`
    sizing-bag key into `Leaf.activity`, or `None` when the encoding has
    made no claim -- the pre-iteration-11 state of every leaf, and read as
    "unranked", never as an implicit `sustained`.

    THE FACT THIS KEY CARRIES. A band's members are not equally earned.
    Some of them are the task: on a study screen, the move buttons, the
    metrics being read, the tree being walked. Others are configured once
    at the start of a session and then never touched again: which engine
    URI to dial, how many visits to spend, which language the labels are
    in, where an SGF came from. Until this key, the model had no way to
    say which was which, so a band under width pressure had exactly one
    move available to it -- wrap, and keep wrapping -- and every member
    paid the same price regardless of what it was worth. Measured live at
    1024x768 (light theme, engine connected), the side column's toolbar
    stack stood 201px tall in a 768px viewport, better than a quarter of
    the page, carrying byte-identical content to its own 1920 rendering.

    LEAF-ONLY, the same discipline `_load_content_class` /
    `_load_orientation` / `_load_unit_axes` all apply: "how often is this
    touched" is a question about a WIDGET's content. A Split's own
    children each answer it for themselves and may answer differently; a
    T-node's children are alternatives, only one of which is on screen at
    a time. Neither container has content of its own to rank.
    """
    if rs is None or rs.activity is None:
        return None
    level = rs.activity
    if level not in VALID_ACTIVITY_LEVELS:
        raise LytLoadError(
            f"unknown activity level {level!r} at {where} — the closed "
            f"vocabulary is {sorted(VALID_ACTIVITY_LEVELS)} (LOOP ITERATION "
            "11, L15 demotion attribution, ledger row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "unknown-activity-level",
                "got": level,
                "valid": sorted(VALID_ACTIVITY_LEVELS),
            },
        )
    if node_kind != "leaf":
        raise LytLoadError(
            f"activity declared at {where} but 'activity' is a LEAF-only "
            "fact (it ranks how often a widget's own content is touched) — "
            f"a {node_kind} node has no content of its own to rank; its "
            "children each answer for themselves (LOOP ITERATION 11, L15, "
            "ledger row 2241)",
            {
                "where": where,
                "law": "L15",
                "prohibition": "activity-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    return level


def _load_presence(
    rp: Optional[lytparser.RawPresence],
    *,
    where: str,
    node_kind: str = "leaf",
    activity: Optional[str] = None,
    content: Optional[str] = None,
    tag: Optional[str] = None,
) -> ast.Presence:
    if rp is None:
        return ast.FIXED
    if rp.kind == "fixed":
        return ast.FIXED
    if rp.kind == "build":
        return ast.DEV
    if rp.kind == "demote":
        return _load_demote_presence(
            rp, where=where, node_kind=node_kind, activity=activity, content=content, tag=tag
        )
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


def _load_scroll_axes(
    rs: Optional[lytparser.RawSizing], *, where: str, orientation: Optional[str] = None
) -> FrozenSet[str]:
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
    # LOOP ITERATION 10 (L14, see `_resolve_axis_token`): role names resolve
    # to a physical axis through the leaf's own `orient` BEFORE the closed
    # `{h,v}` vocabulary below is applied, so every refusal message this
    # function already produced still names a physical axis.
    axes = [
        _resolve_axis_token(a, orientation=orientation, where=where, key="scroll", law="L14")
        for a in rs.scroll_axes
    ]
    bad = [a for a in axes if a not in VALID_SCROLL_AXES]
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
    return frozenset(axes)


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


def _load_orientation(
    rs: Optional[lytparser.RawSizing], *, where: str, node_kind: str
) -> str:
    """METAMODEL WAVE, item 1 (ledger row 2157/2158): resolves the
    `orient <axis>` sizing-bag key into `Leaf.orientation`. `'v'` when
    undeclared -- the byte-identical default every existing orientation-
    aware widget already renders with (TreeWidget's own `orientation` prop
    default), so this key is geometry-inert until an author names it.

    The fact this key carries: orientation is a DECLARED property of the
    encoding, not a CSS accident or a component-local default -- a widget
    whose realization can lay itself out along either axis reads which axis
    to use from the compiled program, so a screen class that needs the
    other layout (a narrow portrait column favoring a horizontal ribbon,
    say) can declare it without touching the widget's own code, and without
    disturbing its sibling class's own declaration (or lack of one).

    Legal ONLY on a leaf -- same reasoning `_load_content_class`/
    `_load_unit_axes` already apply: a Split/Exclusive's own extent IS its
    children's partition (`Split.axis` already names which axis THAT
    partitions), and "orientation" describes what a single widget renders
    internally, an orthogonal fact a container has no interior content to
    hold.
    """
    if rs is None or rs.orient is None:
        return "v"
    axis = rs.orient
    if axis not in VALID_ORIENTATIONS:
        raise LytLoadError(
            f"unknown orientation {axis!r} at {where} — the closed "
            f"vocabulary is {sorted(VALID_ORIENTATIONS)} (METAMODEL WAVE "
            "item 1, ledger row 2157/2158)",
            {
                "where": where,
                "law": "orientation-declaration",
                "prohibition": "unknown-orientation",
                "got": axis,
                "valid": sorted(VALID_ORIENTATIONS),
            },
        )
    if node_kind != "leaf":
        raise LytLoadError(
            f"orient declared at {where} but 'orient' is a LEAF-only fact "
            "(it names which axis a single widget renders itself along) — "
            f"a {node_kind} node may not declare it (METAMODEL WAVE item 1, "
            "ledger row 2157/2158)",
            {
                "where": where,
                "law": "orientation-declaration",
                "prohibition": "orientation-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    return axis


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


def _load_ceiling_axes(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    content: Optional[str],
    scroll_axes: FrozenSet[str],
    orientation: Optional[str] = None,
) -> FrozenSet[str]:
    """LOOP ITERATION 10 / ARC 4 ROUND 3 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2228; branch lyt-model-loop-experiment,
    NOT merged without ratification) -- L14 (demand attribution), LOAD-TIME
    half. Resolves the (possibly-repeated) `ceiling <axis>` sizing-bag key
    into a frozenset of PHYSICAL axis names, or the empty frozenset when
    none was declared (the pre-iteration-10 default, byte-identical for
    every leaf that does not declare one).

    THE KEY SAYS: along this axis, what this leaf's reservation GRANTS is a
    bound, and what this leaf OCCUPIES is its content's own current demand.
    It is `Sizing.ceiling`/L9 stated per axis instead of per leaf, which is
    the same move L12 made for floors and L13 for surplus -- and for the
    same reason: a leaf whose two axes have different content stories
    cannot state either one with a whole-leaf flag.

    Refusals:

      (a) LEAF-ONLY, verbatim L9's own clause (a) reason: a Split's extent
          IS its children's partition, so "occupies less than declared"
          there silently re-partitions siblings that never declared it.
      (b) `{h,v}` after role resolution, at most ONE ceiling per axis
          (a frozenset cannot carry a duplicate, so this is the vocabulary
          check only), and role names resolved through the leaf's own
          `orient` (`_resolve_axis_token`).
      (c) THE AXIS NEEDS AN OWNER FOR THE EXCESS. L9 admits `content
          bounded` only, because a bounded leaf's demand is finite and can
          never exceed the bound. Per-axis, that precondition has a second
          honest solution, and only one: an axis that declares `scroll`
          has ALREADY named the owner of the excess (L5a), so a ceiling on
          that same axis is the answer for the DEFICIT -- together the two
          read "this axis takes exactly its content's current demand,
          clamped into the declared floor/bound". Any other combination is
          refused: an `unbounded` axis with no scroll has no owner for the
          overflow a ceiling invites, and `designed` content is a hard
          reservation by L5c whichever axis it is asked about.
    """
    if rs is None or not rs.ceiling_axes:
        return frozenset()
    if node_kind != "leaf":
        raise LytLoadError(
            f"ceiling <axis> declared at {where} but 'ceiling' is a "
            "LEAF-only key -- a split's extent IS its children's partition, "
            "and a partition that occupies less than it declares "
            "re-partitions siblings that never declared it (L9, restated "
            f"per-axis by L14) -- a {node_kind} node may not declare it "
            "(LOOP ITERATION 10, ledger row 2228)",
            {
                "where": where,
                "law": "L14",
                "prohibition": "axis-ceiling-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    axes = [
        _resolve_axis_token(a, orientation=orientation, where=where, key="ceiling", law="L14")
        for a in rs.ceiling_axes
    ]
    for axis in axes:
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"ceiling axis at {where} must be 'h', 'v', 'along' or "
                f"'across', got {axis!r} (L14 -- LOOP ITERATION 10, ledger "
                "row 2228)",
                {
                    "where": where,
                    "law": "L14",
                    "prohibition": "invalid-ceiling-axis",
                    "got": axis,
                },
            )
        if content == "bounded":
            continue
        if axis in scroll_axes:
            continue
        raise LytLoadError(
            f"ceiling {axis!r} declared at {where} but nothing owns that "
            f"axis's EXCESS: the leaf's content class is {content!r} (only "
            "'bounded' has a finite demand that can never exceed the bound) "
            f"and it declares no `scroll {axis}` (which would name the "
            "overflow's owner by L5a). A ceiling without an excess-owner "
            "invites content past a bound with nowhere to go, which is "
            "overprint or clip -- the two outcomes this language exists to "
            "make unconstructable (L14 -- LOOP ITERATION 10, ledger row "
            "2228)",
            {
                "where": where,
                "law": "L14",
                "prohibition": "axis-ceiling-without-excess-owner",
                "axis": axis,
                "content": content,
            },
        )
    return frozenset(axes)


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
    orientation: Optional[str] = None,
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
    for raw_axis, ext in rs.unit_axes:
        # LOOP ITERATION 10 (L14): role -> physical, before the closed
        # vocabulary below (see `_resolve_axis_token`).
        axis = _resolve_axis_token(
            raw_axis, orientation=orientation, where=where, key="unit", law="L14"
        )
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


def _load_elastic_axes(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    content: Optional[str],
    orientation: Optional[str] = None,
) -> FrozenSet[str]:
    """LOOP ITERATION 9 / arc 4 round 2 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2209/2211): resolves the
    (possibly-repeated) `elastic <axis>` sizing-bag key into a frozenset of
    axis names, or the empty frozenset when none was declared -- the
    pre-iteration-9 default, byte-identical for every leaf that does not
    declare one.

    The key says: along this axis, whatever extent this leaf's reservation
    is granted, its OCCUPANT claims it. It is the answer to the question
    L9's `ceiling` answers from the other end. A reservation and its
    occupancy can disagree in two directions, and this language had a word
    for only one of them:

      - the reservation is larger than a FINITE demand -> shrink the
        reservation (`ceiling`, L9, bounded content);
      - the reservation is larger than what the occupant currently paints,
        with no finite demand to shrink to -> grow the OCCUPANT
        (`elastic`, L13, unbounded content).

    Without the second word, the surplus on that axis belongs to nobody
    and is painted as bare background -- measured live at 1920 in the
    library pane (819px granted, 667px claimed by a component-authored
    reading-measure cap, 152px unowned; see the encodings' own LOOP
    ITERATION 9 header note for the probe).

    L13 (surplus attribution) is the law. Its LOAD-TIME half is refused
    here; the structural half -- "an unbounded T-child leaf must dispose of
    every axis on which its own reservation can exceed its floor" -- is
    `wellformed.find_l13_violations`, since only a tree walk knows whether a
    slot stands in the one position where its declaration binds both axes
    at once (the same position L12 distinguishes).

      (a) LEAF-ONLY, the same discipline `_load_content_class` /
          `_load_ceiling_flag` / `_load_unit_axes` apply: elasticity is a
          fact about what OCCUPIES a rectangle. A Split's occupant is its
          children, whose own `pref 1fr` shares already say which of them
          takes the residual; a T's children each get the WHOLE rectangle,
          so there is no residual between them to attribute.
      (b) REQUIRES `content unbounded`. Bounded content has a finite
          demand, so the honest disposition of its surplus is to give the
          extent back (`ceiling`, L9) rather than to stretch a finite
          thing over an arbitrary extent; `designed` content is a hard
          reservation (L5c); an unclassified leaf has made no claim about
          its content to found an elasticity on. This is the precondition
          that keeps `elastic` from becoming a universal "just stretch it"
          escape hatch.
      (c) `{h,v}` axes only -- the same closed vocabulary `scroll`/`unit`
          refuse against.
    """
    if rs is None or not rs.elastic_axes:
        return frozenset()
    if node_kind != "leaf":
        raise LytLoadError(
            f"elastic declared at {where} but 'elastic' is a LEAF-only key "
            "— elasticity is a fact about what OCCUPIES a rectangle, and a "
            f"{node_kind} node's occupant is its children, whose own "
            "declared shares already say which of them takes the residual "
            "(L13, surplus attribution — LOOP ITERATION 9, ledger row 2209)",
            {
                "where": where,
                "law": "L13",
                "prohibition": "elastic-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    if content != "unbounded":
        raise LytLoadError(
            f"elastic declared at {where} but the leaf's content class is "
            f"{content!r} — L13 (surplus attribution) admits 'unbounded' "
            "only: 'bounded' content has a FINITE demand, so its honest "
            "answer to a too-large reservation is to give the extent back "
            "('ceiling', L9), not to stretch a finite thing over an "
            "arbitrary extent; 'designed' content is a hard reservation "
            "(L5c); and an unclassified leaf has made no claim about its "
            "content to found an elasticity on (LOOP ITERATION 9, ledger "
            "row 2209)",
            {
                "where": where,
                "law": "L13",
                "prohibition": "elastic-without-unbounded-content",
                "content": content,
            },
        )
    # LOOP ITERATION 10 (L14): role -> physical, before the closed
    # vocabulary below (see `_resolve_axis_token`).
    elastic_axes = [
        _resolve_axis_token(a, orientation=orientation, where=where, key="elastic", law="L14")
        for a in rs.elastic_axes
    ]
    for axis in elastic_axes:
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"elastic axis at {where} must be 'h' or 'v', got {axis!r} "
                "(L13 — LOOP ITERATION 9, ledger row 2209)",
                {
                    "where": where,
                    "law": "L13",
                    "prohibition": "invalid-elastic-axis",
                    "got": axis,
                },
            )
    return frozenset(elastic_axes)


def _load_floor_axes(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    orientation: Optional[str] = None,
) -> FrozenSet[Tuple[str, ast.Extent]]:
    """LOOP ITERATION 12 / ARC 4 ROUND 5 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2268-2270; branch
    lyt-model-loop-experiment, NOT merged without ratification) -- L16
    (deficit attribution), LOAD-TIME half. Resolves the (possibly-repeated)
    `floor <axis> <extent>` sizing-bag key into a frozenset of
    `(physical axis, Extent)` pairs, or the empty frozenset when none was
    declared -- the pre-iteration-12 default, byte-identical for every leaf
    that does not declare one.

    THE KEY SAYS: below this extent along this axis, this leaf is not a
    usable control. It is a MEASUREMENT of the leaf's own content -- the
    smallest rectangle in which its vocabulary still stands whole -- and it
    is the DEFICIT corner of the square L13 and L14 already occupy:

      - too much room, no finite demand to shrink to -> the OCCUPANT claims
        it (`elastic <axis>`, L13, surplus);
      - too much CONTENT for the reservation -> a `scroll <axis>` owns the
        overflow (L5a), and where the demand is finite a `ceiling <axis>`
        gives the unused reservation back (L14, demand);
      - too LITTLE room for the content's own smallest whole form -> this
        key. Nothing else in the language says it, and its absence is the
        only one of the three whose consequence is a control cut through
        its own glyph row rather than a region merely truncated.

    Refusals here (the STRUCTURAL half -- the trigger that finds a leaf
    which OWED a floor and never declared one, and the reserve-or-leave
    join to L15 -- is `wellformed.find_l16_violations`, since only a tree
    walk knows a leaf's presence and its parent's partition):

      (a) LEAF-ONLY (`"floor-on-non-leaf"`). A container has no content of
          its own to be cut through; its extent IS its children's
          partition, and each of those answers for itself -- exactly the
          reasoning `_load_unit_axes` / `_load_activity` already use.
      (b) `{h,v}` after ROLE RESOLUTION, at most one per axis. Unlike
          `@demote`'s threshold axis (which L15 pins to a PHYSICAL axis
          because the axis a demotion measures is the one its BAND is
          under pressure on, not one of the leaf's own), `along`/`across`
          are ADMITTED here and are in fact the natural spelling: a floor
          is a fact about the leaf's own content in the leaf's own frame,
          which is precisely what L14's role frame resolves against.
      (c) A CONSTANT px extent only (`"non-px-floor"`). `ch` is refused
          alongside `fr` here, and that is narrower than `min <axis>`'s
          own rule on purpose: an `fr` floor is a share of the very
          partition whose sufficiency is in question (circular, the same
          reason L15 refuses an `fr` demote threshold), and a `ch` floor
          is a TEXT measure standing for a stack of controls whose extent
          is not text at all -- the misattribution iteration 8 spent a
          whole round undoing when 838 ch-derived px stood as a height.

    NOT refused here, deliberately: whether the leaf's own RESERVATION can
    ever reach its floor. That comparison needs the resolved `Sizing`,
    which this function does not have and which the leaf branch builds
    only after it -- and it is the same judgment as the reserve-or-leave
    join, so both live together in `wellformed.find_l16_violations` rather
    than being split across two modules.
    """
    if rs is None or not rs.floor_axes:
        return frozenset()
    if node_kind != "leaf":
        raise LytLoadError(
            f"floor <axis> declared at {where} but 'floor' is a LEAF-only "
            "key -- a container has no content of its own to be cut "
            "through, and its extent IS its children's partition, each of "
            f"which answers for itself -- a {node_kind} node may not "
            "declare it (L16 -- LOOP ITERATION 12 / ARC 4 ROUND 5, ledger "
            "rows 2268-2270)",
            {
                "where": where,
                "law": "L16",
                "prohibition": "floor-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    resolved: List[Tuple[str, ast.Extent]] = []
    seen: set = set()
    for raw_axis, ext in rs.floor_axes:
        axis = _resolve_axis_token(
            raw_axis, orientation=orientation, where=where, key="floor", law="L16"
        )
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"floor axis at {where} must be 'h', 'v', 'along' or "
                f"'across', got {axis!r} (L16 -- LOOP ITERATION 12 / ARC 4 "
                "ROUND 5, ledger rows 2268-2270)",
                {"where": where, "law": "L16", "prohibition": "invalid-floor-axis", "got": axis},
            )
        if axis in seen:
            raise LytLoadError(
                f"floor axis {axis!r} declared more than once at {where} -- "
                "a leaf has ONE smallest-usable extent per axis; two "
                "competing floors leave 'how little room is too little' "
                "ambiguous exactly where the point of the key is that it "
                "not be (L16 -- LOOP ITERATION 12 / ARC 4 ROUND 5, ledger "
                "rows 2268-2270)",
                {"where": where, "law": "L16", "prohibition": "duplicate-floor", "got": axis},
            )
        seen.add(axis)
        # The unit is judged on the RAW term, BEFORE `_resolve_extent_like`
        # folds a `ch` measure into px: by the time it has, the fact that
        # this number came from a TEXT measure is gone, and that fact is
        # exactly what this refusal is about. (Caught by this law's own
        # `ch` test, which passed a 20ch floor straight through as 160px.)
        raw_unit = (
            "sum"
            if isinstance(ext, lytparser.RawExtentSum)
            else (ext.unit if ext.kind == "numunit" else f"symbol:{ext.symbol}")
        )
        if raw_unit != "px":
            raise LytLoadError(
                f"floor {axis} at {where} is a {raw_unit!r} extent -- a "
                "floor must be a CONSTANT px measurement of the leaf's own "
                "content. An 'fr' floor is a share of the very partition "
                "whose sufficiency is in question (circular, the same "
                "reason L15 refuses an 'fr' demote threshold); a 'ch' "
                "floor is a TEXT measure standing in for a stack of "
                "controls whose extent is not text (the misattribution "
                "LOOP ITERATION 8 spent a round undoing) (L16 -- LOOP "
                "ITERATION 12 / ARC 4 ROUND 5, ledger rows 2268-2270)",
                {
                    "where": where,
                    "law": "L16",
                    "prohibition": "non-px-floor",
                    "axis": axis,
                    "unit": raw_unit,
                },
            )
        resolved.append((axis, _resolve_extent_like(ext, where=where)))
    return frozenset(resolved)


def _load_edge_axes(
    rs: Optional[lytparser.RawSizing],
    *,
    where: str,
    node_kind: str,
    orientation: Optional[str] = None,
    unit_axes: FrozenSet[Tuple[str, float]] = frozenset(),
) -> FrozenSet[Tuple[str, str]]:
    """LOOP ITERATION 13 / ARC 4 ROUND 6 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2286; branch lyt-model-loop-experiment,
    NOT merged without ratification) -- L17 (edge attribution), LOAD-TIME
    half. Resolves the (possibly-repeated) `edge <axis> <disposition>`
    sizing-bag key into a frozenset of `(physical axis, disposition)`
    pairs, or the empty frozenset when none was declared -- the
    pre-iteration-13 default, byte-identical for every leaf that does not
    declare one.

    THE KEY SAYS: what my own scroll BOUNDARY on this axis falls on.

    Every key this language has minted so far reasons about an AREA. `scroll
    <axis>` (L5a) says the content runs past the rectangle and names who owns
    the excess; `elastic` (L13) disposes of room the occupant did not need;
    `ceiling` (L14) hands a finite surplus back; `floor` (L16) refuses a
    rectangle too small for the leaf's whole vocabulary. A leaf can satisfy
    all four and still cut a row in half, because the cut does not happen in
    the area -- it happens at the BOUNDARY the scroll creates, and nothing in
    the language was about the boundary.

    The three dispositions, and why three (see `lyt_ast.
    _VALID_EDGE_DISPOSITIONS` for the vocabulary itself): `unit` is
    biconditional with an L10 `unit <axis>` -- both directions refused
    below -- so a two-member vocabulary would be derivable from the bag and
    carry nothing. The fact only the encoding knows is whether an
    unquantizable scroller's content is nonetheless made of indivisible
    things (`item`) or of nothing indivisible at all (`continuous`), and
    that distinction decides whether its boundary owes an ANNOUNCEMENT.

    Refusals here (the STRUCTURAL half -- the trigger that finds a leaf which
    OWED an edge and never declared one, the edge-on-a-non-scrolling-axis
    refusal that needs the slot's own resolved `scroll_axes`, and the join to
    L13 -- is `wellformed.find_l17_violations`):

      (a) LEAF-ONLY (`"edge-on-non-leaf"`). A container's boundary is not
          its own: what stands at a container's edge is whichever child the
          partition put there, and that child answers for itself. Exactly
          the reasoning `_load_floor_axes` / `_load_unit_axes` already use.
      (b) `{h,v}` after ROLE RESOLUTION, at most one per axis
          (`"invalid-edge-axis"`, `"duplicate-edge"`). `along`/`across` are
          ADMITTED, for L16's reason verbatim: what a boundary falls on is a
          fact about the leaf's own content in the leaf's own frame, which
          is precisely what L14's role frame resolves against.
      (c) A closed disposition vocabulary (`"invalid-edge-disposition"`).
      (d) THE JOIN TO L10, FORWARD (`"edge-unit-without-pitch"`). `edge <a>
          unit` says "my boundary can be placed BETWEEN items", which is
          only true when the pitch is a constant -- and the constant pitch
          of a leaf's content is not a new number, it is `unit <a> <px>`,
          which L10 minted for the reservation side of the same fact. A
          leaf claiming a placeable boundary without declaring the pitch it
          would be placed on has declared half a fact.
      (e) THE JOIN TO L10, BACKWARD (`"edge-under-unit-not-unit"`). A leaf
          that DOES declare `unit <a> <px>` has stated its content along
          that axis is a repetition of one constant thing; saying its
          boundary meets `item` or `continuous` there contradicts its own
          bag. Together (d) and (e) make `edge <a> unit` and `unit <a>` one
          fact spelled from two sides, which is what keeps the disposition
          vocabulary honest at three members rather than redundant at two.

    NOT refused here, deliberately: whether the axis is one this slot
    actually scrolls. That is a `Slot`-level fact (`scroll` is legal on
    every node kind and is resolved separately), and the trigger that
    obliges an edge in the first place is the same walk, so both live in
    `wellformed.find_l17_violations` rather than being split across two
    modules -- the same division `_load_floor_axes` draws for L16's own
    reserve-or-leave judgment.
    """
    if rs is None or not rs.edge_axes:
        return frozenset()
    if node_kind != "leaf":
        raise LytLoadError(
            f"edge <axis> declared at {where} but 'edge' is a LEAF-only key "
            "-- a container's boundary is not its own: what stands at a "
            "container's edge is whichever child its partition put there, "
            f"and that child answers for itself -- a {node_kind} node may "
            "not declare it (L17 -- LOOP ITERATION 13 / ARC 4 ROUND 6, "
            "ledger row 2286)",
            {
                "where": where,
                "law": "L17",
                "prohibition": "edge-on-non-leaf",
                "node_kind": node_kind,
            },
        )
    unit_axis_names = {axis for axis, _px in unit_axes}
    resolved: List[Tuple[str, str]] = []
    seen: set = set()
    for raw_axis, disposition in rs.edge_axes:
        axis = _resolve_axis_token(
            raw_axis, orientation=orientation, where=where, key="edge", law="L17"
        )
        if axis not in VALID_SCROLL_AXES:
            raise LytLoadError(
                f"edge axis at {where} must be 'h', 'v', 'along' or "
                f"'across', got {axis!r} (L17 -- LOOP ITERATION 13 / ARC 4 "
                "ROUND 6, ledger row 2286)",
                {"where": where, "law": "L17", "prohibition": "invalid-edge-axis", "got": axis},
            )
        if disposition not in VALID_EDGE_DISPOSITIONS:
            raise LytLoadError(
                f"edge {axis} at {where} declares disposition "
                f"{disposition!r}, which is outside the closed vocabulary "
                f"{sorted(VALID_EDGE_DISPOSITIONS)} -- a boundary falls on "
                "a constant-pitch sequence ('unit'), on indivisible things "
                "of no constant pitch ('item'), or on nothing indivisible "
                "at all ('continuous'), and there is no fourth answer this "
                "language knows how to act on (L17 -- LOOP ITERATION 13 / "
                "ARC 4 ROUND 6, ledger row 2286)",
                {
                    "where": where,
                    "law": "L17",
                    "prohibition": "invalid-edge-disposition",
                    "axis": axis,
                    "got": disposition,
                },
            )
        if axis in seen:
            raise LytLoadError(
                f"edge axis {axis!r} declared more than once at {where} -- a "
                "leaf's boundary on an axis falls on ONE kind of thing; two "
                "competing dispositions leave 'what gets cut here' "
                "ambiguous exactly where the point of the key is that it "
                "not be (L17 -- LOOP ITERATION 13 / ARC 4 ROUND 6, ledger "
                "row 2286)",
                {"where": where, "law": "L17", "prohibition": "duplicate-edge", "got": axis},
            )
        seen.add(axis)
        if disposition == "unit" and axis not in unit_axis_names:
            raise LytLoadError(
                f"edge {axis} unit at {where} claims a boundary that can be "
                f"PLACED between items, but the leaf declares no `unit "
                f"{axis} <px>` -- the constant pitch such a boundary would "
                "be placed on is not a new number, it is L10's own unit, "
                "and a leaf naming the one without the other has declared "
                "half a fact (L17 -- LOOP ITERATION 13 / ARC 4 ROUND 6, "
                "ledger row 2286)",
                {
                    "where": where,
                    "law": "L17",
                    "prohibition": "edge-unit-without-pitch",
                    "axis": axis,
                },
            )
        if disposition != "unit" and axis in unit_axis_names:
            raise LytLoadError(
                f"edge {axis} {disposition} at {where} contradicts this "
                f"leaf's own `unit {axis}`: a leaf whose content along an "
                "axis is a repetition of ONE constant thing has a boundary "
                "that can be placed between two of them, and must say so "
                f"(`edge {axis} unit`). {disposition!r} is the answer for a "
                "leaf whose pitch is not constant, which this one has "
                "already denied (L17 -- LOOP ITERATION 13 / ARC 4 ROUND 6, "
                "ledger row 2286)",
                {
                    "where": where,
                    "law": "L17",
                    "prohibition": "edge-under-unit-not-unit",
                    "axis": axis,
                    "got": disposition,
                },
            )
        resolved.append((axis, disposition))
    return frozenset(resolved)


def _load_leaf(
    rl: lytparser.RawLeaf,
    *,
    where: str,
    content: Optional[str] = None,
    boundary: bool = False,
    unit_axes: FrozenSet[Tuple[str, float]] = frozenset(),
    elastic_axes: FrozenSet[str] = frozenset(),
    orientation: str = "v",
    orientation_declared: bool = False,
    ceiling_axes: FrozenSet[str] = frozenset(),
    activity: Optional[str] = None,
    floor_axes: FrozenSet[Tuple[str, ast.Extent]] = frozenset(),
    edge_axes: FrozenSet[Tuple[str, str]] = frozenset(),
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
        floor_axes=floor_axes,  # LOOP ITERATION 12 (L16), ledger rows 2268-2270
        edge_axes=edge_axes,  # LOOP ITERATION 13 (L17), ledger row 2286
        elastic_axes=elastic_axes,  # LOOP ITERATION 9 (L13), ledger row 2209
        orientation=orientation,  # METAMODEL WAVE item 1, ledger row 2157/2158
        orientation_declared=orientation_declared,  # AMENDMENT 9, ledger row 2310
        ceiling_axes=ceiling_axes,  # LOOP ITERATION 10 (L14), ledger row 2228
        activity=activity,  # LOOP ITERATION 11 (L15), ledger row 2241
    )


def load_slot(
    rs: lytparser.RawSlot,
    *,
    path: str = "root",
    orientation_overrides: Optional[Dict[str, str]] = None,
) -> ast.Slot:
    """`orientation_overrides` (AMENDMENT 9, ledger row 2310; re-scoped
    2026-08-12, see the dated note below): an optional `widget id ->
    physical axis` map, empty/`None` (the default) for every
    pre-Amendment-9 call site and byte-identical to this function's prior
    behavior when omitted. This is the DERIVATION seam's re-load hook, not
    concrete syntax — a residual-holding leaf's orientation is derived
    POST-SOLVE (see `orientation.py`'s own module docstring for why: the
    residual box's aspect is only known once its siblings have solved,
    which `load_slot` itself has no way to do), so the SAME text is loaded
    TWICE: once with no overrides (to solve — role-frame facts are all
    solver-inert, so this first load's solved geometry is already final),
    once more with the derived choice threaded in here (to re-bind the
    L14 role frame — `along`/`across` — through the derived axis instead
    of the load-time default). A widget named here still goes through
    `_load_orientation`'s ordinary closed-vocabulary validation; the
    override only changes WHICH value wins, never bypasses the check
    (`_load_orientation` is deliberately still called for its own
    `orientation_on_non_leaf`/`unknown_orientation` refusals even when an
    override is present, though a leaf-only override can only ever apply
    where `_load_orientation` would have accepted the same physical axis
    anyway).

    SCOPING (2026-08-12 fix, review of ledger row 2310): `load_slot` itself
    is single-layout by construction — it recurses over ONE `RawSlot` tree,
    never crosses a `layout NAME = ...` boundary — so the bare
    `widget_id -> axis` map it receives here is already implicitly scoped
    to whichever layout the caller is loading. The scoping decision lives
    one level up, in `load_layouts` (see that function's own docstring): it
    is the one function that sees multiple layouts sharing a single
    `orientation_overrides` argument, so it is the one responsible for
    narrowing a `(layout_name, widget_id)`-keyed map down to the bare
    per-layout map this function expects. `load_slot` must never itself be
    handed an override addressed to a different layout — that was exactly
    the review-found hazard: `load_layouts` previously threaded ONE
    unscoped `widget_id -> axis` dict verbatim into every fragment parsed
    from the same text blob, so a widget id repeated across two `layout
    NAME = ...` fragments in one text silently received an override
    computed for the OTHER fragment's solve."""
    orientation_overrides = orientation_overrides or {}
    node = rs.node
    if isinstance(node, lytparser.RawLeaf):
        # AMENDMENT 5 (ledger row 1937): resolved before `_load_leaf` so
        # the validated class can be threaded into `ast.Leaf` at
        # construction (the same "resolve first, construct once" shape
        # `_load_sizing`/`_load_presence` already use).
        content = _load_content_class(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        boundary = _load_boundary_marker(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        # METAMODEL WAVE, item 1 (see `_load_orientation`): resolved here,
        # same "resolve first, construct once" shape `content`/`boundary`
        # already use for this leaf.
        #
        # LOOP ITERATION 10 / ARC 4 ROUND 3 (L14) MOVED THIS UP, ahead of
        # every axis-taking key below: the leaf's orientation is now the
        # frame those keys' `along`/`across` role names resolve against
        # (`_resolve_axis_token`), so it has to be known before any of them
        # is read. Resolution order is the only thing that changed -- the
        # call itself is unmoved and unedited.
        orientation = _load_orientation(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        # AMENDMENT 9 (ledger row 2310): a genuine `orient` declaration was
        # just resolved above (or defaulted to 'v') -- record whether the
        # AUTHOR wrote it, not just what it resolved to (`_load_leaf` needs
        # this distinction; see `ast.Leaf.orientation_declared`'s own
        # docstring). Then, if the caller supplied a DERIVED value for this
        # widget (the post-solve re-load, see `load_slot`'s own docstring),
        # that value wins over whatever `_load_orientation` resolved --
        # L18 (`wellformed.find_l18_violations`) is what keeps these two
        # facts from ever conflicting on a residual-holding leaf.
        orientation_declared = rs.sizing is not None and rs.sizing.orient is not None
        override = orientation_overrides.get(node.widget)
        if override is not None:
            orientation = override
        # AMENDMENT 7 (L10, see `_load_unit_axes`): resolved here, in
        # the same "resolve first, construct once" shape as `content`
        # above, because the unit's own legality DEPENDS on the resolved
        # content class (clause (b): only a bounded/unbounded leaf's
        # content is a repetition of anything).
        unit_axes = _load_unit_axes(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            content=content,
            orientation=orientation,
        )
        # LOOP ITERATION 9 (L13, see `_load_elastic_axes`): resolved here
        # for the same reason `unit_axes` is -- its own legality DEPENDS
        # on the resolved content class (clause (b): only unbounded
        # content has no finite demand to give the extent back to).
        elastic_axes = _load_elastic_axes(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            content=content,
            orientation=orientation,
        )
        # AMENDMENT 3: a leaf has no children at all, so `gap` is refused
        # here too (same law as the T-node refusal below) rather than
        # silently dropped.
        _load_gap_px(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        scroll_axes = _load_scroll_axes(
            rs.sizing, where=f"{path}:{node.widget}", orientation=orientation
        )
        # LOOP ITERATION 10 / ARC 4 ROUND 3 (L14, see `_load_ceiling_axes`):
        # resolved AFTER `scroll_axes`, because its own legality depends on
        # them -- clause (c) admits a ceiling on an `unbounded` axis only
        # where that same axis has already named a scroll to own the excess.
        ceiling_axes = _load_ceiling_axes(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            content=content,
            scroll_axes=scroll_axes,
            orientation=orientation,
        )
        # LOOP ITERATION 10 moved this construction DOWN, below the two
        # keys it now carries that depend on `scroll_axes` -- the same
        # "resolve first, construct once" discipline, applied to a
        # dependency that did not exist before this iteration.
        # LOOP ITERATION 11 / ARC 4 ROUND 4 (L15, see `_load_activity`):
        # resolved BEFORE both the leaf construction that carries it and
        # the `_load_presence` call that DEPENDS on it -- `@demote` is
        # legal only on a leaf whose own bag already says `activity
        # occasional`, so the ranking has to be known before the presence
        # is resolved. Same "resolve first, construct once" discipline
        # every dependent key in this branch already follows.
        activity = _load_activity(rs.sizing, where=f"{path}:{node.widget}", node_kind="leaf")
        # LOOP ITERATION 12 / ARC 4 ROUND 5 (L16, see `_load_floor_axes`):
        # resolved here for the same reason `unit_axes`/`elastic_axes`/
        # `ceiling_axes` are -- it takes L14's role frame, so it has to be
        # read AFTER `orientation`. It depends on nothing else: a floor is
        # a measurement of the leaf's own content, independent of content
        # class, of scroll ownership and of presence, which is exactly why
        # its two remaining questions (can this reservation ever REACH the
        # floor, and may this leaf leave instead) are structural rather
        # than load-time.
        floor_axes = _load_floor_axes(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            orientation=orientation,
        )
        # LOOP ITERATION 13 / ARC 4 ROUND 6 (L17, see `_load_edge_axes`):
        # resolved AFTER `unit_axes`, because both directions of its join
        # to L10 are judged against the resolved units -- `edge <a> unit`
        # requires one and every other disposition refuses one. It takes
        # L14's role frame, so it is also after `orientation`.
        edge_axes = _load_edge_axes(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            orientation=orientation,
            unit_axes=unit_axes,
        )
        leaf = _load_leaf(
            node,
            where=f"{path}:{node.widget}",
            content=content,
            boundary=boundary,
            unit_axes=unit_axes,
            elastic_axes=elastic_axes,
            orientation=orientation,
            orientation_declared=orientation_declared,
            ceiling_axes=ceiling_axes,
            activity=activity,
            floor_axes=floor_axes,
            edge_axes=edge_axes,
        )
        sizing = _load_sizing(
            rs.sizing,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            orientation=orientation,
        )
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
        presence = _load_presence(
            rs.presence,
            where=f"{path}:{node.widget}",
            node_kind="leaf",
            activity=activity,
            content=content,
        )
        sizing = _apply_preserve_reservation(sizing, presence, where=f"{path}:{node.widget}")
        return ast.Slot(
            node=leaf, presence=presence, sizing=sizing,
            violates=frozenset(rs.warns), scroll_axes=scroll_axes,
            wrap_policy=wrap_policy,
        )
    if isinstance(node, lytparser.RawSplit):
        children = [
            load_slot(c, path=f"{path}/{node.axis.upper()}{i}", orientation_overrides=orientation_overrides)
            for i, c in enumerate(node.children)
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
        # METAMODEL WAVE item 1: `orient` is leaf-only too, same reason.
        _load_orientation(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 7: `ceiling` is leaf-only too (L9), same reason.
        _load_ceiling_flag(rs.sizing, where=path, node_kind="split", content=None)
        # LOOP ITERATION 10 (L14): and so is its per-axis form, same reason.
        _load_ceiling_axes(
            rs.sizing, where=path, node_kind="split", content=None, scroll_axes=frozenset()
        )
        # AMENDMENT 7: `unit` is leaf-only too (L10), same reason.
        _load_unit_axes(rs.sizing, where=path, node_kind="split", content=None)
        # LOOP ITERATION 9 (L13): refused on a Split for the same
        # leaf-only reason `unit` is -- see `_load_elastic_axes` clause (a).
        _load_elastic_axes(rs.sizing, where=path, node_kind="split", content=None)
        # AMENDMENT 7: `wrap` is refused on a split (its children are
        # already placed by its own partition) — refused loudly here, same
        # shape as every other node-kind refusal above.
        _load_wrap_policy(rs.sizing, where=path, node_kind="split", unit_axes=frozenset())
        # LOOP ITERATION 11 (L15): `activity` is leaf-only too -- a Split's
        # children each rank themselves. Refused loudly here, same shape as
        # every other node-kind refusal above.
        _load_activity(rs.sizing, where=path, node_kind="split")
        # LOOP ITERATION 12 (L16): `floor` is leaf-only too -- a split's
        # extent IS its children's partition, and each child answers for
        # its own smallest usable form. Refused loudly here, same shape as
        # every other node-kind refusal above.
        _load_floor_axes(rs.sizing, where=path, node_kind="split")
        # LOOP ITERATION 13 (L17): same container refusal, same reason --
        # a container's boundary is whichever child its partition put
        # there, and that child answers for itself.
        _load_edge_axes(rs.sizing, where=path, node_kind="split")
        scroll_axes = _load_scroll_axes(rs.sizing, where=path)
        split = ast.Split(axis=node.axis, gap_px=gap_px, children=children)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="split")
        # AMENDMENT 7 (L11): a Split IS the shape a board composite may
        # declare `measure-bound` on, so this branch resolves it rather
        # than refusing it.
        if _load_measure_bound(rs.sizing, where=path, node_kind="split"):
            sizing = dataclasses.replace(sizing, measure_bound=True)
        # LOOP ITERATION 11 (L15): `node_kind` threaded so `@demote`'s own
        # leaf-only refusal can fire here rather than silently loading a
        # subtree-wide demotion no descendant declared.
        presence = _load_presence(rs.presence, where=path, node_kind="split")
        sizing = _apply_preserve_reservation(sizing, presence, where=path)
        return ast.Slot(
            node=split, presence=presence, sizing=sizing,
            violates=frozenset(rs.warns), scroll_axes=scroll_axes,
        )
    if isinstance(node, lytparser.RawExclusive):
        children = [
            load_slot(c, path=f"{path}/T{i}", orientation_overrides=orientation_overrides)
            for i, c in enumerate(node.children)
        ]
        # AMENDMENT 3: a T node takes no gap — refused loudly (not
        # silently ignored) if the author declared one, same as any other
        # law this loader enforces.
        _load_gap_px(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 5: `content` is leaf-only -- refused here too.
        _load_content_class(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 6: `boundary` is leaf-only too, same reason.
        _load_boundary_marker(rs.sizing, where=path, node_kind="exclusive")
        # METAMODEL WAVE item 1: `orient` is leaf-only too, same reason.
        _load_orientation(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 7: `ceiling` is leaf-only too (L9), same reason.
        _load_ceiling_flag(rs.sizing, where=path, node_kind="exclusive", content=None)
        # LOOP ITERATION 10 (L14): and so is its per-axis form, same reason.
        _load_ceiling_axes(
            rs.sizing, where=path, node_kind="exclusive", content=None, scroll_axes=frozenset()
        )
        # AMENDMENT 7: `unit` is leaf-only too (L10), same reason.
        _load_unit_axes(rs.sizing, where=path, node_kind="exclusive", content=None)
        # LOOP ITERATION 9 (L13): refused on an Exclusive too -- a T's
        # children each get the WHOLE rectangle, so there is no residual
        # between them for an elastic claim to attribute.
        _load_elastic_axes(rs.sizing, where=path, node_kind="exclusive", content=None)
        # AMENDMENT 7 (L11): `measure-bound` is refused on a T node —
        # every child shares one rectangle, so there is no residual.
        _load_measure_bound(rs.sizing, where=path, node_kind="exclusive")
        # LOOP ITERATION 11 (L15): `activity` is leaf-only too -- a T's
        # children are ALTERNATIVES, only one on screen at a time, and each
        # ranks itself. Refused loudly here, same shape as above.
        _load_activity(rs.sizing, where=path, node_kind="exclusive")
        # LOOP ITERATION 12 (L16): `floor` is leaf-only too -- a T's
        # children are alternatives sharing one rectangle, and each of them
        # states its own smallest usable form. Refused loudly here.
        _load_floor_axes(rs.sizing, where=path, node_kind="exclusive")
        # LOOP ITERATION 13 (L17): see the split branch's own note.
        _load_edge_axes(rs.sizing, where=path, node_kind="exclusive")
        # AMENDMENT 7: `wrap` IS legal here — a T group's own tab
        # strip is a vocabulary whose units are its declared children, so
        # no `unit` declaration is required (or accepted) alongside it.
        wrap_policy = _load_wrap_policy(
            rs.sizing, where=path, node_kind="exclusive", unit_axes=frozenset()
        )
        scroll_axes = _load_scroll_axes(rs.sizing, where=path)
        excl = ast.Exclusive(children=children, tag=node.tag)
        sizing = _load_sizing(rs.sizing, where=path, node_kind="exclusive")
        # LOOP ITERATION 11 (L15): same threading as the Split branch.
        # LYT presence arc P1 (row 2333): `tag` is threaded through too --
        # an Exclusive declaring `@demote` needs its own [TAG] as its
        # presence-pruning identity (`_load_demote_presence` clause (f)).
        presence = _load_presence(rs.presence, where=path, node_kind="exclusive", tag=node.tag)
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
    orientation_overrides: Optional[Dict[str, Dict[str, str]]] = None,
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

    `orientation_overrides` (AMENDMENT 9, ledger row 2310; RE-SCOPED
    2026-08-12 — see the dated note below): a `layout name -> {widget id ->
    physical axis}` map, mirroring `waivers`' own per-layout shape. For
    each `raw` this function loads, only `orientation_overrides.get(raw.name)`
    — the sub-map addressed to THAT layout, or `None` if it names none — is
    passed down to `load_slot`. Omitted (the default, `None`) is
    byte-identical to every pre-Amendment-9 call.

    2026-08-12 FIX (review of ledger row 2310, Duty 6 finding): before this
    date, this parameter was a BARE `widget id -> physical axis` map
    threaded VERBATIM into `load_slot` for every fragment this call loads
    — no `(layout_name, widget_id)` scoping anywhere. Because `text` can
    (and the `.lyt` grammar explicitly supports) carry more than one
    `layout NAME = ...` fragment, a widget id repeated across two fragments
    in the same text blob would silently receive an override computed from
    a DIFFERENT layout's own solve — confirmed live by a synthetic two-
    layout-one-widget-id probe during review; dormant only because every
    `.lyt` file committed to `research/lyt/encodings/` today happens to
    contain exactly one `layout NAME = ...` fragment. The per-layout
    `Dict[str, Dict[str, str]]` shape here makes that collision
    unrepresentable: a sub-map addressed to layout A is never even reachable
    while loading layout B's fragment. `orientation.rebind` (the only
    caller that ever passes a non-`None` value here) was updated in the
    same change to address its single derived map to the one layout it
    computed the derivation for.
    """
    from wellformed import check_wellformed

    waivers = waivers or {}
    orientation_overrides = orientation_overrides or {}
    raws = lytparser.parse_layouts(text)
    out = {}
    for raw in raws:
        slot = load_slot(
            raw.slot,
            path=raw.name,
            orientation_overrides=orientation_overrides.get(raw.name),
        )
        check_wellformed(slot, layout_name=raw.name, waivers=waivers.get(raw.name))
        out[raw.name] = slot
    return out
