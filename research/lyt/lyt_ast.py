"""Typed AST for LYT, mirroring the TypeScript interfaces in the consult
document §4.1 (layout-language-consult.md lines 224-269) as Python
dataclasses. This is the *normative* representation per the consult
document's own words ("EBNF follows for the concrete syntax... the AST is
normative", line 271-272) — the concrete-syntax parser (parser.py) exists to
read the §5 worked encodings' text form, but everything downstream
(well-formedness checks, the CP-SAT compiler) operates on these dataclasses.

Two deliberate departures from the TS source, both disclosed in the build
report rather than silently made:

1. The TS `domain` union is `'go' | 'common' | 'debug' | 'board' | 'chrome'`
   (line 242) — kept verbatim, five members, no sixth. An earlier revision of
   this module added a sixth literal, 'blackbox', to mark unmodeled-interior
   content (the control-panel tab group); AMENDMENT 6 (ledger row 1937,
   `.claude/dispatch-reports/lyt-tab-region-consult.md` §6.3) RETIRES that
   choice as an ADR-0008 category error, disclosed and named as such by the
   report itself: `domain` is the census's SUBJECT-MATTER axis (which region
   of the app a leaf belongs to), and "unmodeled beyond here" is an
   ORTHOGONAL fact — a boundary marker, not a domain. See `Leaf.boundary`
   below for the re-homed spelling.
2. `Sizing.basis` keeps the TS union `'reserved' | 'envelope'` (line 322)
   verbatim — there is no 'content' member. That absence is deliberate and
   load-bearing (§4.2, line 344: "There is deliberately no basis: 'content'.
   That absence is the language's answer to defect (a).") and is exactly
   the first typed prohibition the build commission asks us to enforce.

AMENDMENT 5 (ledger row 1937, commissioner-delegated; see SPEC-AMENDMENTS.md
and `.claude/dispatch-reports/lyt-tab-region-consult.md`) adds two further,
similarly-disclosed departures — both genuine language extensions, not
readings recovered from the original consult document's text (same footing
as Amendments 1-4):

3. `Slot.scroll_axes` — an optional, per-node `scroll <axis>` disposition
   (§9.1 of the consult report). One more sizing-bag key, legal on any node
   kind at any depth; empty (the default) is byte-identical to every
   pre-Amendment-5 encoding.
4. `Leaf.content` — an orthogonal content-class axis (§9.2 of the consult
   report), deliberately NOT folded into `domain` or `facets` (that would
   re-mint the exact ADR-0008 misfit the report's own §6.3 just retired
   `blackbox` from the domain axis to avoid). `None` (the default) means
   "not classified" — dormant for every existing leaf.

Both are enforced as load-time structural walks in `wellformed.py` (laws
L5/L5a/L5b/L5c), the same enforcement family as L2's dominance test.

AMENDMENT 6 (ledger row 1937, same consult report, §6.3/§6.4/§8.1 — the
"Option C" tab-skeleton-encoding wave) adds a third, disclosed departure,
completing the re-homing Amendment 5's own docstring above already
anticipated:

5. `Leaf.boundary` — the recursion's base case, re-spelled as a boolean fact
   on `Leaf` rather than as a `Domain` member. A `True` value means "an
   unmodeled subtree conceptually stands here" — the SAME fact the retired
   `domain == 'blackbox'` used to carry, now orthogonal to the leaf's own
   TRUE domain (which is free to be any of the five real members, or the
   census's own honest `?`/`flagged` convention when genuinely ambiguous).
   `False` (the default) is byte-identical to every leaf that was never
   `blackbox`-domained. Consumers that used to branch on `domain ==
   'blackbox'` (the emitter's Exclusive-node collapse, `emit_layout_tree.py`
   and `emit_mockup.py`) now branch on `.boundary` instead — see those
   modules' own docstrings for the AMENDMENT 6 disclosure.

AMENDMENT 7 (ledger rows 2107/2108, M1 of the model-implementation arc;
SPEC-AMENDMENTS.md's own Amendment 7 entry is the ruling/rationale record)
ports four keys and three laws proven out on the model-iteration loop
experiment branch (`lyt-model-loop-experiment`, rounds 3/5/6) and verified
by the loop's own substrate-consolidation commission
(`.claude/dispatch-reports/lyt-substrate-consolidation.md`) before this
port. All four are dormant for both mainline encodings — no key declared,
no law fires, byte-identical solver output — see this port's own dispatch
report (`.claude/dispatch-reports/lyt-m1-substrate-port.md`) for the
before/after dormancy proof.

6. `Sizing.ceiling` — a leaf's declared extent is an upper bound on what
   its content occupies, never a standing floor (L9, ceiling honesty).
   Solver-inert; realization-binding only.
7. `Sizing.measure_bound` — a slot's extent along its parent's partition
   axis is derived from the page measure its own aspect-locked content is
   bound by, not from a share of the partition; the residual belongs to
   its siblings (L11, measure integrity). Also solver-inert;
   realization-binding only.
8. `Leaf.unit_axes` — the indivisible occupancy unit of a leaf's content,
   per axis (L10, unit integrity): a slot must reserve a whole number of
   units along its own partition axis.
9. `Slot.wrap_policy` — how a slot's own vocabulary of units distributes
   when it needs more than one row (`wrap <policy>`, closed vocabulary
   `{balanced}` today). Untyped (`detail.law == "wrap-policy"`, a string
   token, not a numbered law) — see the loop consolidation report's own
   naming correction: this key was called "L8" in the loop's own round-6
   commit message, but that number belonged to `measure-bound`'s
   structural checker; `wrap` never claimed a law number of its own.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import FrozenSet, List, Literal, Optional, Tuple, Union

Domain = Literal["go", "common", "debug", "board", "chrome"]
Facet = Literal["action", "info"]
Unit = Literal["px", "ch", "fr"]
# AMENDMENT 5 (ledger row 1937, .claude/dispatch-reports/lyt-tab-region-
# consult.md §9.2): the census gains an ORTHOGONAL content-class axis on
# leaves -- deliberately NOT spelled through `Domain` or `Facet` (the
# consult report's own §6.3 just un-conscripted `blackbox` from the
# domain axis for exactly this "don't conflate two orthogonal axes"
# reason; folding `content` into `domain` or `facets` would re-mint the
# same ADR-0008 misfit one paragraph after it was named). `bounded` =
# statically-boundable chrome/controls; `designed` = a design-fact
# height (a chart, a panel) that must be a hard reservation, never
# scrollable; `unbounded` = genuinely unbounded data (a table, a log, a
# registry) that REQUIRES a scroll owner somewhere on its root-to-leaf
# path (L5a, wellformed.py).
ContentClass = Literal["bounded", "designed", "unbounded"]
# AMENDMENT 5: `scroll <axis>` is a Slot-level sizing-bag key -- legal on
# a leaf OR a composite (Split/Exclusive) node, at any depth (the consult
# report's §9.1: "because `scroll <axis>` is one more key in the sizing
# bag on `Slot`, and `Slot` is inductive, a scroll disposition can sit at
# any node at any depth"). Lives on `Slot` (not `Leaf`/`Split`), since it
# applies uniformly regardless of node kind.
ScrollAxis = Literal["h", "v"]

_VALID_UNITS = {"px", "ch", "fr"}
_VALID_BASES = {"reserved", "envelope"}
_VALID_CONTENT_CLASSES = {"bounded", "designed", "unbounded"}
_VALID_SCROLL_AXES = {"h", "v"}
# AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration loop
# experiment, round 6): the closed vocabulary of WRAP POLICIES a slot may
# declare over its own units (`wrap balanced`). One member today,
# deliberately: the policy the loop's own review asked for is "a
# vocabulary either fits on one row or distributes its units across the
# rows it needs without leaving a single-unit orphan", and inventing a
# second, unexercised policy name beside it would be vocabulary this port
# has not paid for.
_VALID_WRAP_POLICIES = {"balanced"}


@dataclass(frozen=True)
class Extent:
    """A single reservation extent (§4.2, line 324-329).

    `unit='fr'` extents are resolved by the compiler via the parent split's
    partition equality, not by this class. `ch` extents are resolved by a
    per-class px-per-ch constant supplied to the compiler (the document
    defers this exactly as `layout-model.ts:475-488` does — see §6, line
    669-671 — so a px-per-ch constant is a compiler input, not part of the
    AST).

    F3 fix (review row 1609, `.claude/dispatch-reports/lyt-compiler-
    prototype-review.md`): `unit`'s `Literal["px","ch","fr"]` annotation is
    a typecheck-only promise — Python does not enforce it at runtime, so a
    caller constructing `Extent(unit="content", v=5)` directly (bypassing
    the concrete-syntax parser/loader, which DOES refuse content-driven
    sizing, see loader.py `_resolve_extent_like`) previously succeeded
    silently. `__post_init__` now enforces the same closed vocabulary at
    construction time, mirroring `Presence.__post_init__`'s existing
    runtime guard below — "unrepresentable by construction" becomes
    literal for the Python constructor path too, not just the text one.
    """

    unit: Unit
    v: float

    def __post_init__(self) -> None:
        if self.unit not in _VALID_UNITS:
            raise ValueError(
                f"Extent.unit must be one of {sorted(_VALID_UNITS)}, got "
                f"{self.unit!r} — layout-language-consult.md line 324-329 "
                "closes Extent.unit to px|ch|fr; there is no 'content' "
                "member (§4.2 line 344-345, defect (a); F3 fix, review row "
                "1609)."
            )
        if self.v < 0:
            raise ValueError(f"Extent value must be >= 0, got {self.v}")


@dataclass(frozen=True)
class Sizing:
    """§4.2, lines 317-330. `basis` is closed to {'reserved','envelope'} —
    see module docstring point 2. `envelope_states`, when `basis='envelope'`,
    is our concretization of L3 ("every envelope slot must enumerate its
    content states", line 381) — the TS type only carries a bare `basis`
    flag (line 322) and the EBNF only a bare `envelope` keyword (line 286),
    neither of which has anywhere to *put* the enumerated states, so we add
    an optional field for them. Disclosed invention — see build report.

    F3 fix (review row 1609): `basis`'s `Literal["reserved","envelope"]`
    annotation is likewise not runtime-enforced by itself — see `Extent`'s
    docstring above for the same gap and its rationale. `__post_init__`
    below now also validates `basis` against its closed vocabulary before
    the (pre-existing) L3 envelope-states check runs.
    """

    min: Extent
    pref: Extent
    max: Union[Extent, Literal["inf"]]
    aspect: Optional[float] = None
    basis: Literal["reserved", "envelope"] = "reserved"
    envelope_states: Optional[List[str]] = None
    # AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    # loop experiment round 3, ledger rows 2037/2038): this slot's declared
    # extent is an UPPER BOUND on what its content occupies, never a
    # standing floor the realization must fill. Solver-inert by
    # construction — min/pref/max are untouched, so every feasibility
    # result this program already proves is unchanged; the flag binds only
    # the REALIZATION. Loader-refused unless the leaf also declares
    # `content bounded` (L9) — see loader._load_ceiling_flag.
    ceiling: bool = False
    # AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    # loop experiment round 6, ledger rows 2037/2038/2066): this slot's
    # extent along its parent's partition axis is derived from the PAGE
    # MEASURE its own aspect-locked content is bound by (its own cross
    # axis), never from a share of the partition — the residual belongs to
    # its siblings, not to it. Solver-inert by construction, the same
    # footing `ceiling` has: the staged solve already maximizes the
    # board's own dimension first, so there is no solver-side preference
    # left for this flag to express; what it binds is the realization's
    # track-sizing order. Structural checker: `wellformed.find_l11_violations`
    # (L11).
    measure_bound: bool = False

    def __post_init__(self) -> None:
        if self.basis not in _VALID_BASES:
            raise ValueError(
                f"Sizing.basis must be one of {sorted(_VALID_BASES)}, got "
                f"{self.basis!r} — there is deliberately no 'content' "
                "member (layout-language-consult.md line 344-345, defect "
                "(a); F3 fix, review row 1609)."
            )
        if self.basis == "envelope" and not self.envelope_states:
            raise ValueError(
                "L3 (envelope honesty): basis='envelope' requires a "
                "non-empty envelope_states list naming the declared content "
                "states (layout-language-consult.md line 381)."
            )


@dataclass(frozen=True)
class Presence:
    """§4.1, lines 264-269. The TS union is CLOSED to four members; the
    fifth combination `{by:'system', hidden:'release'}` is deliberately
    absent ("note: 'release' is UNTYPABLE here", line 268) — that is the
    *second* typed prohibition alongside content-driven sizing, and this
    dataclass enforces it in `__post_init__` rather than merely documenting
    it, the same way `Sizing` enforces the absence of basis='content' by
    not offering the literal.
    """

    kind: Literal["fixed", "build", "toggle"]
    variant: Optional[Literal["dev"]] = None
    by: Optional[Literal["user", "system"]] = None
    hidden: Optional[Literal["release", "preserve"]] = None

    def __post_init__(self) -> None:
        if self.kind == "toggle":
            if self.by == "system" and self.hidden == "release":
                raise ValueError(
                    "Presence{by:'system', hidden:'release'} is untypable "
                    "(layout-language-consult.md line 268) — a "
                    "system-driven appearance may only fill space already "
                    "reserved for it (L1, line 353-356). Use "
                    "hidden='preserve', or model the toggle as a "
                    "system-driven translation instead of a re-partition."
                )


FIXED = Presence(kind="fixed")
DEV = Presence(kind="build", variant="dev")


def toggle(by: Literal["user", "system"], hidden: Literal["release", "preserve"]) -> Presence:
    return Presence(kind="toggle", by=by, hidden=hidden)


@dataclass(frozen=True)
class Leaf:
    kind: Literal["leaf"] = field(default="leaf", init=False)
    widget: str = ""
    facets: FrozenSet[Facet] = field(default_factory=frozenset)
    domain: Domain = "chrome"
    flagged: bool = False  # our tag for the census's '?' ambiguity marker (§3)
    # AMENDMENT 5 (ledger row 1937): the orthogonal content-class axis --
    # see module docstring's `ContentClass` note. `None` means "not
    # classified" -- the pre-Amendment-5, dormant state every existing
    # leaf is in; L5/L5a/L5c (wellformed.py) only fire for a leaf whose
    # `content` is genuinely declared, so an un-classified leaf is
    # invisible to every Amendment 5 law, exactly as an un-migrated
    # encoding must stay legal.
    content: Optional[ContentClass] = None
    # AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
    # lyt-tab-region-consult.md §6.3): the re-homed boundary marker -- see
    # module docstring point 5. `False` (default) is the pre-Amendment-6
    # state for every leaf that was never `domain == 'blackbox'`.
    boundary: bool = False
    # AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    # loop experiment round 5, ledger rows 2037/2038/2066/2079): the
    # INDIVISIBLE OCCUPANCY UNIT of this leaf's content, per axis --
    # `unit h 86px` reads "along the horizontal axis this leaf's content
    # is a repetition of an 86px unit that may never be split". A
    # frozenset of `(axis, px)` pairs, at most one entry per axis (the
    # loader enforces that); empty by default, byte-identical to every
    # pre-Amendment-7 leaf.
    #
    # A LEAF fact, not a Slot fact, for the same reason `content` is: it
    # describes what the leaf RENDERS, not how the partition treats it.
    # Law L10 (unit integrity, `wellformed.find_l10_violations`) is its
    # structural checker; `loader._load_unit_axes` carries the load-time
    # refusals (leaf-only, px-only, one entry per axis, and the `content
    # bounded|unbounded` precondition).
    unit_axes: FrozenSet[Tuple[str, float]] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        # F3-fix precedent (Extent/Sizing/Presence, this same module):
        # a `Literal[...]` annotation is a typecheck-only promise: a
        # caller constructing `Leaf(content="chart")` directly (bypassing
        # the concrete-syntax loader, which DOES validate this) would
        # otherwise succeed silently. Enforced here too, for the same
        # "unrepresentable by construction, not just by convention"
        # reason.
        if self.content is not None and self.content not in _VALID_CONTENT_CLASSES:
            raise ValueError(
                f"Leaf.content must be one of {sorted(_VALID_CONTENT_CLASSES)} "
                f"or None, got {self.content!r} (AMENDMENT 5, ledger row 1937, "
                ".claude/dispatch-reports/lyt-tab-region-consult.md §9.2)"
            )
        # AMENDMENT 7 (L10): same "unrepresentable by construction"
        # posture the `content` guard above uses -- a direct constructor
        # call bypassing `loader._load_unit_axes` would otherwise mint a
        # unit on an unknown axis, or two conflicting units on one axis,
        # silently.
        seen_axes: set = set()
        for axis, px in self.unit_axes:
            if axis not in _VALID_SCROLL_AXES:
                raise ValueError(
                    f"Leaf.unit_axes axis must be one of "
                    f"{sorted(_VALID_SCROLL_AXES)}, got {axis!r} (AMENDMENT 7, "
                    "L10 unit integrity, ledger rows 2107/2108)"
                )
            if px <= 0:
                raise ValueError(
                    f"Leaf.unit_axes extent must be positive, got {px!r} for "
                    f"axis {axis!r} — a zero-extent unit is not a unit "
                    "(AMENDMENT 7, L10 unit integrity, ledger rows 2107/2108)"
                )
            if axis in seen_axes:
                raise ValueError(
                    f"Leaf.unit_axes declares axis {axis!r} more than once — "
                    "a leaf's content has ONE indivisible unit per axis "
                    "(AMENDMENT 7, L10 unit integrity, ledger rows 2107/2108)"
                )
            seen_axes.add(axis)


@dataclass(frozen=True)
class Split:
    kind: Literal["split"] = field(default="split", init=False)
    axis: Literal["h", "v"] = "h"
    # AMENDMENT 3 (ledger row 1715, SPEC-AMENDMENTS.md): an optional
    # uniform, constant px gap between this split's children — never
    # solvable/elastic. 0.0 (the pre-amendment default) means no gap.
    # Populated from the `gap <extent>` concrete syntax by loader.py's
    # `_load_gap_px`; consumed by compiler.py's `_constrain` (the
    # `(k-1)*gap` partition term) and `_extract_rects` (offset
    # accumulation), and by emit_mockup.py as CSS grid's native `gap`.
    gap_px: float = 0.0
    children: List["Slot"] = field(default_factory=list)


@dataclass(frozen=True)
class Exclusive:
    kind: Literal["exclusive"] = field(default="exclusive", init=False)
    children: List["Slot"] = field(default_factory=list)
    selector: Literal["user"] = "user"
    tag: Optional[str] = None  # documentation-only, e.g. "BLACK BOX" (§5.4)


LayoutNode = Union[Leaf, Split, Exclusive]


@dataclass(frozen=True)
class Slot:
    node: LayoutNode
    presence: Presence
    sizing: Sizing
    violates: FrozenSet[str] = field(default_factory=frozenset)  # e.g. {"L1"}
    # AMENDMENT 5 (ledger row 1937): an optional `scroll <axis>`
    # disposition -- see module docstring's `ScrollAxis` note. Empty
    # (the pre-Amendment-5 default) means "no scroll declared here",
    # byte-identical to every existing encoding's behavior. Legal on
    # every node kind (leaf, split, exclusive) at any depth -- unlike
    # `gap_px` (Split-only, lives on `Split` itself), `scroll` is a
    # Slot-level fact because it is not restricted by node kind.
    scroll_axes: FrozenSet[ScrollAxis] = field(default_factory=frozenset)
    # AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    # loop experiment round 6, ledger rows 2037/2038/2066): how this
    # slot's own VOCABULARY of units distributes when it needs more than
    # one row. Round 5 (L10) gave a leaf the unit its content is made of
    # so a wrap could never fall THROUGH a unit; this is the next
    # question the same law asks: where the break BETWEEN units falls.
    # `balanced` says the vocabulary either stands on one row or
    # distributes its units across the rows it needs, evenly.
    #
    # A Slot fact rather than a Leaf/Exclusive one, the same placement
    # `scroll_axes` takes: legal on two node kinds for two different
    # reasons the loader spells out (`_load_wrap_policy`) — a LEAF wraps
    # the units it declares (`unit h`, required there), an EXCLUSIVE
    # wraps its own tab strip, whose units ARE its declared children.
    # Refused on a Split, whose children are separately-reserved slots
    # its own partition already places. `None` (the default) is
    # byte-identical to every pre-Amendment-7 slot.
    wrap_policy: Optional[str] = None

    def __post_init__(self) -> None:
        if self.wrap_policy is not None and self.wrap_policy not in _VALID_WRAP_POLICIES:
            raise ValueError(
                f"Slot.wrap_policy must be one of {sorted(_VALID_WRAP_POLICIES)} "
                f"or None, got {self.wrap_policy!r} (AMENDMENT 7, ledger rows "
                "2107/2108) — same 'unrepresentable by construction, not just "
                "by convention' posture the F3 fix established for "
                "Extent/Sizing/Presence and Amendment 5 for Leaf.content."
            )
        bad = self.scroll_axes - _VALID_SCROLL_AXES
        if bad:
            raise ValueError(
                f"Slot.scroll_axes must be a subset of {sorted(_VALID_SCROLL_AXES)}, "
                f"got extra member(s) {sorted(bad)} (AMENDMENT 5, ledger row "
                "1937, .claude/dispatch-reports/lyt-tab-region-consult.md §9.1)"
            )


@dataclass(frozen=True)
class ScreenClass:
    id: str
    w_px: float
    h_px: float


@dataclass(frozen=True)
class ObjectiveTermMaximizeArea:
    kind: Literal["maximize-area"] = field(default="maximize-area", init=False)
    leaf: str = ""


@dataclass(frozen=True)
class ObjectiveTermReachPreferred:
    kind: Literal["reach-preferred"] = field(default="reach-preferred", init=False)
    weight: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ObjectiveTermMinimizeSlack:
    kind: Literal["minimize-slack"] = field(default="minimize-slack", init=False)


ObjectiveTerm = Union[
    ObjectiveTermMaximizeArea, ObjectiveTermReachPreferred, ObjectiveTermMinimizeSlack
]


@dataclass
class Program:
    """A finite family of per-screen-class layouts (§4.1, lines 226-231).

    Disclosed narrowing: the consult's §5 worked encodings show only
    `layout <id> = <slot>` fragments (the `layoutsec` production) — none of
    the five demonstrates concrete syntax for `widgetsec`, `classsec`, or
    `objectivesec`. Rather than invent concrete syntax for sections the
    document never shows a worked example of, the parser (parser.py) reads
    only `layoutsec` text, and `classes` / `objective` are supplied here in
    Python by the runner. `widgets` (the census) is left empty for the
    prototype since §4.3's census cross-check is explicitly advisory, not a
    gate ("must be advisory... not a gate", line 683).
    """

    name: str
    classes: List[ScreenClass]
    layouts: dict  # class id -> Slot
    objective: List[ObjectiveTerm]
    widgets: list = field(default_factory=list)
