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
from typing import Dict, FrozenSet, List, Literal, Optional, Tuple, Union

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

# METAMODEL WAVE, item 1 (ledger row 2157/2158, branch
# lyt-model-loop-experiment, NOT merged without ratification): a leaf's
# declared MOUNT ORIENTATION -- `orient h|v`, one more bag key following the
# `wrap`/`content`/`boundary` precedent. Orientation is a declared fact of
# the ENCODING, not a CSS accident or a component-local default: a widget
# whose realization can lay itself out along either axis (TreeWidget's
# existing `orientation` prop is the worked case) reads which axis to use
# from the program, so a class that needs the horizontal layout (a narrow
# portrait column, say) can declare it without touching the widget's own
# code or its sibling class's declaration. Deliberately leaf-only, same
# reasoning `content`/`unit_axes` already use: a Split/Exclusive's own
# extent IS its children's partition, and "orientation" describes what a
# LEAF renders internally, not how a container arranges its children
# (which axis a Split partitions is already `Split.axis`, a wholly
# different fact).
Orientation = Literal["h", "v"]
_VALID_UNITS = {"px", "ch", "fr"}
_VALID_BASES = {"reserved", "envelope"}
_VALID_CONTENT_CLASSES = {"bounded", "designed", "unbounded"}
_VALID_SCROLL_AXES = {"h", "v"}
_VALID_ORIENTATIONS = {"h", "v"}
# LOOP ITERATION 11 / arc 4 round 4 (model-iteration loop EXPERIMENT,
# ledger rows 2037/2066/2107/2157/2241; branch lyt-model-loop-experiment,
# NOT merged without ratification): the closed vocabulary of ACTIVITY
# LEVELS a leaf may declare -- how often the task this screen exists for
# touches this leaf's content. `sustained` content is worked WITH
# throughout a session; `occasional` content is CONFIGURED once and then
# left alone. Two members, deliberately: the question the language needs
# answered is "may this band's members leave under pressure", which is
# binary. A finer scale (never/rare/often/constant) would invite ranking
# arguments L15's demotion rule has no use for.
_VALID_ACTIVITY_LEVELS = {"sustained", "occasional"}
ActivityLevel = Literal["sustained", "occasional"]
# LOOP ITERATION 13 / arc 4 round 6 (model-iteration loop EXPERIMENT,
# ledger rows 2037/2066/2107/2157/2286; branch lyt-model-loop-experiment,
# NOT merged without ratification): the closed vocabulary of EDGE
# DISPOSITIONS -- what a leaf's own scroll BOUNDARY on an axis falls on.
#
#   unit       -- my content along this axis is a flat sequence of items
#                 of ONE CONSTANT pitch, and that pitch is the `unit
#                 <axis>` L10 already makes me declare. A boundary can be
#                 PLACED between two items, and therefore must be: the
#                 sub-unit remainder is given back, not painted over.
#   item       -- my content along this axis is made of indivisible items
#                 but of NO single constant pitch (a list of variable
#                 rows, a stack of chrome plus a list). No arithmetic
#                 places the boundary between items, so the boundary is
#                 instead ANNOUNCED: a standing lane across from it says
#                 the content continues, and a partial item at the edge
#                 reads as "more below" rather than as a slice.
#   continuous -- my content has no indivisible items along this axis at
#                 all (prose, a drawing, a continuously-scaled surface).
#                 A boundary anywhere cuts nothing, and nothing is owed.
#
# Three members, and the third is what keeps the key from being derivable:
# `unit` is exactly "an L10 unit is declared on this axis" (both
# directions of that join are refused in `loader._load_edge_axes`), so a
# two-member vocabulary would carry no information the bag did not
# already hold. `item` vs `continuous` is the fact only the encoding
# knows.
_VALID_EDGE_DISPOSITIONS = {"unit", "item", "continuous"}
EdgeDisposition = Literal["unit", "item", "continuous"]
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
    # METAMODEL WAVE, item 2 (ledger row 2157/2173/2174/2175, branch
    # lyt-model-loop-experiment, NOT merged without ratification): the
    # dict-envelope upgrade (rev2 domain-model-proposal §2.1, `.claude/
    # dispatch-reports/lyt-domain-model-proposal.md`) -- "reservation is
    # not an extent, it is a function from a finite, declared set of
    # activity states to extents, and its reservation is the max over the
    # set." SPEC.md §4.2 disclosed that the pre-wave implementation "does
    # not compute a max over anything; it stores a fixed extent and a
    # state list side by side" -- this field is what makes the max a real,
    # checked fact instead of documentation: when populated (every
    # declared state names an extent -- loader.py refuses a MIXED list of
    # named/unnamed entries), the loader checks the slot's own `pref`
    # equals `max(envelope_state_extents.values())`, refused loudly on a
    # mismatch. `None` (the pre-wave default, and every entry using the
    # legacy bare-name spelling) means the state list stays exactly what
    # it always was -- documentation attached to a fixed extent, per L3's
    # original, unchanged check (non-empty names only).
    envelope_state_extents: Optional[Dict[str, "Extent"]] = None
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
    # LOOP ITERATION 8 / ARC 4 (model-iteration loop EXPERIMENT, ledger rows
    # 2037/2066/2107/2157 — branch lyt-model-loop-experiment, NOT merged
    # without ratification). `min <axis> <extent>`: a PER-AXIS floor, for
    # the one position in this language where a slot's own `min` binds BOTH
    # of its axes at once — a direct child of an Exclusive/T node (and the
    # root), whose rectangle IS its parent's on both axes, so there is no
    # single "along" axis for `min` to describe (SPEC.md §4.2's own
    # load-bearing fact 2; `compiler._constrain`'s `along=None` branch).
    #
    # This is L11's own ruling ("a declaration binds the axis it is about")
    # applied one level up: not to an extent standing on the wrong axis of a
    # partition, but to a FLOOR that is a fact about one axis and was being
    # read as a fact about two. Both encodings carry numbers of exactly that
    # shape — a ch-measured label-set WIDTH that also stood as a height
    # floor, a chart's own CSS `height: 580px` that also stood as a width
    # floor — and both encodings' own BOTH-AXES TENSION notes already named
    # the limitation as inherited-and-disclosed rather than intended.
    #
    # Semantics: a `(axis, Extent)` pair here OVERRIDES `min` for that axis
    # only; an axis nobody names keeps `min`, so every slot that declares no
    # axis-min is byte-identical to its pre-iteration self. Solver-VISIBLE
    # (unlike ceiling/unit/measure-bound, which bind the realization):
    # `compiler._constrain` and the Exclusive branch's own componentwise-max
    # derivation both read it. Load-time half: `loader._load_axis_mins`.
    # Structural half (is this slot actually in a both-axes position?):
    # `wellformed.find_l12_violations` (L12, floor attribution).
    axis_mins: FrozenSet[Tuple[str, "Extent"]] = frozenset()

    def axis_min(self, axis: str) -> Union["Extent", Literal["inf"]]:
        """The floor this slot declares for `axis` ('h' horizontal / 'v'
        vertical) — the per-axis override where one is declared, the
        axis-agnostic `min` otherwise. One accessor so no consumer
        re-implements the precedence rule (ADR-0012 P1)."""
        for declared_axis, extent in self.axis_mins:
            if declared_axis == axis:
                return extent
        return self.min

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

    kind: Literal["fixed", "build", "toggle", "demote"]
    variant: Optional[Literal["dev"]] = None
    by: Optional[Literal["user", "system"]] = None
    hidden: Optional[Literal["release", "preserve"]] = None
    # LOOP ITERATION 11 / arc 4 round 4 (L15, ledger rows
    # 2037/2066/2107/2157/2241): the DEMOTION presence kind's own two
    # fields -- the axis the width (or height) pressure is measured on, and
    # the extent below which this slot vacates. Both `None` for every other
    # kind, and both REQUIRED for `kind == 'demote'` (guarded below).
    #
    # WHY THIS IS A FOURTH KIND AND NOT `toggle(by='system', hidden=
    # 'release')`, which the guard below still refuses. That prohibition
    # (§4.1 line 268, L1 lines 353-356) is about the SYSTEM's own state --
    # an engine connecting, a log line arriving, a search finishing --
    # re-partitioning the page underneath a user who did not ask for it and
    # cannot predict it: a control moves out from under a stationary
    # cursor. A demotion's trigger is neither the user's click nor the
    # system's state; it is the PAGE MEASURE, which is the same input the
    # solve itself takes. A demotion therefore cannot fire without a
    # re-solve, and a re-solve cannot happen without the viewport changing
    # -- the one event during which the whole page is already moving and no
    # cursor is resting on a control it expects to stay put. The viewport is
    # a third actor, and giving it its own presence kind is what keeps L1's
    # prohibition intact rather than quietly widened: `by` stays `None`
    # here, so `toggle(by='system', hidden='release')` is exactly as
    # untypable after this iteration as before it.
    demote_axis: Optional[Literal["h", "v"]] = None
    demote_below_px: Optional[float] = None

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
        # LOOP ITERATION 11 (L15): the same "unrepresentable by
        # construction, not just by convention" posture every other closed
        # field in this module takes -- a direct constructor call bypassing
        # `loader._load_presence` must not be able to mint a demotion with
        # no threshold to demote below, nor hang a threshold off a kind
        # that has no use for one.
        if self.kind == "demote":
            if self.demote_axis not in _VALID_SCROLL_AXES:
                raise ValueError(
                    f"Presence(kind='demote').demote_axis must be one of "
                    f"{sorted(_VALID_SCROLL_AXES)}, got {self.demote_axis!r} "
                    "(LOOP ITERATION 11, L15 demotion attribution, ledger "
                    "row 2241)"
                )
            if self.demote_below_px is None or self.demote_below_px <= 0:
                raise ValueError(
                    "Presence(kind='demote').demote_below_px must be a "
                    f"positive px extent, got {self.demote_below_px!r} — a "
                    "demotion with no threshold demotes always or never, "
                    "neither of which is a measure (LOOP ITERATION 11, L15, "
                    "ledger row 2241)"
                )
        elif self.demote_axis is not None or self.demote_below_px is not None:
            raise ValueError(
                f"Presence(kind={self.kind!r}) carries demotion fields "
                f"(axis={self.demote_axis!r}, below={self.demote_below_px!r}) "
                "but only kind='demote' has any use for them — a decorative "
                "threshold nothing reads is refused loudly, not carried "
                "(LOOP ITERATION 11, L15, ledger row 2241)"
            )


FIXED = Presence(kind="fixed")
DEV = Presence(kind="build", variant="dev")


def toggle(by: Literal["user", "system"], hidden: Literal["release", "preserve"]) -> Presence:
    return Presence(kind="toggle", by=by, hidden=hidden)


def demote(axis: Literal["h", "v"], below_px: float) -> Presence:
    """LOOP ITERATION 11 / arc 4 round 4 (L15, ledger row 2241): the
    constructor for the demotion presence kind, mirroring `toggle` above.
    Reads: while the band hosting this slot is granted less than `below_px`
    along `axis`, this slot is ABSENT and its extent belongs to its
    siblings; at or above it, the slot stands. Release semantics by
    construction -- there is no preserve-flavoured demotion, because a
    demotion that kept its rectangle would relieve no pressure and the
    whole point is the room it gives back."""
    return Presence(kind="demote", demote_axis=axis, demote_below_px=below_px)


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
    # LOOP ITERATION 9 / arc 4 round 2 (model-iteration loop EXPERIMENT,
    # ledger rows 2037/2066/2107/2157/2209; branch lyt-model-loop-
    # experiment, NOT merged without ratification): the axes along which
    # this leaf's OCCUPANT claims whatever extent the leaf's reservation
    # is given -- `elastic h` reads "along the horizontal axis, whatever
    # this leaf is granted, its content grows to fill it; it never leaves
    # a residual". A frozenset of axis names, at most one entry per axis
    # (the loader enforces that); empty by default, byte-identical to
    # every pre-iteration-9 leaf.
    #
    # It is the DUAL of `Sizing.ceiling` (L9). Both keys answer the same
    # question -- what happens when a reservation is larger than what
    # occupies it -- from opposite ends: `ceiling` shrinks the
    # RESERVATION to the content (the honest answer for bounded content,
    # which has a finite demand), `elastic` grows the OCCUPANT to the
    # reservation (the only honest answer for unbounded content, which
    # does not). Law L13 (surplus attribution,
    # `wellformed.find_l13_violations`) is its structural checker;
    # `loader._load_elastic_axes` carries the load-time refusals
    # (leaf-only, `{h,v}` only, one entry per axis, and the `content
    # unbounded` precondition -- bounded content's answer is `ceiling`,
    # designed content's is L5c's hard reservation).
    elastic_axes: FrozenSet[str] = field(default_factory=frozenset)
    # METAMODEL WAVE, item 1 (ledger row 2157/2158): the leaf's declared
    # mount orientation -- `orient h|v`. `'v'` is the default (the
    # "one-more-bag-key" precedent's own convention: an undeclared key
    # resolves to the byte-identical pre-wave behavior of every existing
    # orientation-aware widget), so every leaf that predates this wave
    # loads with `orientation == 'v'` whether or not it ever names an
    # orientation-aware widget at all -- geometry-inert on its own, exactly
    # like `boundary`'s own default-False landing.
    orientation: Orientation = "v"
    # LOOP ITERATION 10 / arc 4 round 3 (model-iteration loop EXPERIMENT,
    # ledger rows 2037/2066/2107/2157/2227; branch lyt-model-loop-
    # experiment, NOT merged without ratification): the axes along which
    # this leaf's declared extent is an UPPER BOUND rather than a standing
    # floor -- `ceiling across` reads "across this leaf's own orientation,
    # what this leaf occupies is its content's DEMAND, and the reservation
    # is only the bound that demand may not exceed". A frozenset of
    # PHYSICAL axis names; the `.lyt` source may spell either physical axis
    # (`h`/`v`) or, per L14, one of the two ROLE names (`along`/`across`),
    # which `loader._resolve_axis_token` binds to a physical axis through
    # this same leaf's `orientation` before construction -- so by the time
    # a value reaches here the role frame is already gone.
    #
    # It is the PER-AXIS form of `Sizing.ceiling` (L9), and it is a LEAF
    # fact rather than a Sizing one for the reason `orientation` is: only a
    # leaf has an orientation for a role name to resolve against. L9's own
    # `content bounded` precondition is relaxed here in exactly one way
    # (`loader._load_ceiling_axes` clause (c)): an axis that declares
    # `scroll` already names an owner for the EXCESS, so a ceiling on that
    # same axis is the honest answer for the DEFICIT -- together the two
    # say "this axis takes exactly its content's current demand". Law L14
    # (demand attribution, `wellformed.find_l14_violations`) is its
    # structural checker.
    ceiling_axes: FrozenSet[str] = field(default_factory=frozenset)
    # LOOP ITERATION 11 / arc 4 round 4 (model-iteration loop EXPERIMENT,
    # ledger rows 2037/2066/2107/2157/2241; branch lyt-model-loop-
    # experiment, NOT merged without ratification): how often the task this
    # screen exists for touches this leaf's content -- `activity sustained`
    # or `activity occasional`. `None` (the default) means the encoding has
    # not ranked this leaf, which is where every leaf predating this
    # iteration stands; the language reads an unranked leaf as "no claim
    # made", never as "sustained by default", so nothing about an
    # un-migrated encoding changes.
    #
    # It is a LEAF fact for the same reason `content` is: it describes what
    # this widget IS to its user, not how a partition treats it. And it is
    # the precondition for the `@demote` presence kind -- a slot may only
    # vacate a band under width pressure if its own encoding has said, in
    # so many words, that the user does not work with it continuously. That
    # ordering is the whole safety property: the model cannot move a
    # sustained control into a menu, because it has to declare the content
    # occasional first, in the same file a reader is looking at.
    activity: Optional[ActivityLevel] = None
    # LOOP ITERATION 12 / arc 4 round 5 (model-iteration loop EXPERIMENT,
    # ledger rows 2037/2066/2107/2157/2268-2269; branch lyt-model-loop-
    # experiment, NOT merged without ratification): the leaf's own SMALLEST
    # USABLE extent per physical axis -- `floor v 257px` reads "below 257px
    # of height I am not a usable control; what you grant me under that is
    # not a truncation of my content but a CUT THROUGH one of its members".
    # A frozenset of `(axis, Extent)` pairs, the same shape `Sizing.
    # axis_mins` (L12) carries, and the same physical-axis vocabulary:
    # `loader._resolve_axis_token` has already bound any `along`/`across`
    # role spelling against this leaf's own `orientation` before
    # construction.
    #
    # It is the DEFICIT dual of `elastic_axes` (L13, surplus) and the third
    # corner of the same square `ceiling_axes` (L14, demand) stands in.
    # `elastic` disposes of room the leaf did not need; `scroll` (L5a)
    # disposes of content the reservation could not hold; NEITHER says how
    # little room makes the leaf's own vocabulary unreadable, and that is
    # the only one of the three whose absence can put a control's glyph row
    # across a clip edge. Law L16 (deficit attribution,
    # `wellformed.find_l16_violations`) is its structural checker, and its
    # second clause is the JOIN to L15: a leaf declaring a floor must
    # either RESERVE it (its own `min` on that axis) or be able to LEAVE
    # (`@demote`) -- being granted less than one's floor and staying is the
    # state this key exists to make unrepresentable.
    floor_axes: FrozenSet[Tuple[str, "Extent"]] = frozenset()
    # LOOP ITERATION 13 / arc 4 round 6 (L17, edge attribution; ledger row
    # 2286 -- branch lyt-model-loop-experiment, NOT merged without
    # ratification): what this leaf's own scroll BOUNDARY on a physical
    # axis falls on. A frozenset of `(axis, disposition)` pairs over the
    # closed `_VALID_EDGE_DISPOSITIONS` vocabulary above; empty (the
    # pre-iteration-13 default) means the leaf says nothing, which is
    # exactly the state L17's trigger clause exists to find.
    #
    # It is the fact every key on this leaf so far presupposed and none
    # stated. `scroll <axis>` (L5a) says the content runs PAST the
    # rectangle; `elastic` (L13) disposes of room the occupant did not
    # need; `ceiling` (L14) gives a finite surplus back; `floor` (L16)
    # refuses a rectangle too small for the whole vocabulary. All four
    # reason about the AREA. None says anything about the BOUNDARY the
    # scroll creates -- and a boundary is where content is actually cut,
    # which is why a leaf can satisfy every one of them and still show a
    # row bisected through its own glyph rows at the pane's bottom edge.
    edge_axes: FrozenSet[Tuple[str, str]] = frozenset()

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
        # METAMODEL WAVE, item 1: same "unrepresentable by construction"
        # posture as `content`'s guard above -- a direct constructor call
        # bypassing `loader._load_orientation` would otherwise mint an
        # orientation outside the closed {h, v} vocabulary silently.
        if self.orientation not in _VALID_ORIENTATIONS:
            raise ValueError(
                f"Leaf.orientation must be one of {sorted(_VALID_ORIENTATIONS)}, "
                f"got {self.orientation!r} (METAMODEL WAVE item 1, ledger row "
                "2157/2158)"
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
        # LOOP ITERATION 9 (L13): the same "unrepresentable by
        # construction" posture every closed-vocabulary field above uses
        # -- a direct constructor call bypassing
        # `loader._load_elastic_axes` would otherwise mint an elastic
        # claim on an unknown axis silently. (A frozenset cannot carry a
        # duplicate, so the one-per-axis guard L10's list-shaped
        # `unit_axes` needs has no analog here.)
        bad_elastic = self.elastic_axes - _VALID_SCROLL_AXES
        if bad_elastic:
            raise ValueError(
                f"Leaf.elastic_axes must be a subset of "
                f"{sorted(_VALID_SCROLL_AXES)}, got {sorted(bad_elastic)} "
                "(LOOP ITERATION 9, L13 surplus attribution, ledger row 2209)"
            )
        # LOOP ITERATION 10 (L14): same guard, same reason -- and note the
        # vocabulary checked here is the PHYSICAL one: `along`/`across` are
        # concrete-syntax role names `loader._resolve_axis_token` has
        # already resolved, never a value the AST may carry.
        bad_ceiling = self.ceiling_axes - _VALID_SCROLL_AXES
        if bad_ceiling:
            raise ValueError(
                f"Leaf.ceiling_axes must be a subset of "
                f"{sorted(_VALID_SCROLL_AXES)}, got {sorted(bad_ceiling)} "
                "(LOOP ITERATION 10, L14 demand attribution, ledger row 2227)"
            )
        # LOOP ITERATION 11 (L15): same guard, same reason as `content`'s.
        if self.activity is not None and self.activity not in _VALID_ACTIVITY_LEVELS:
            raise ValueError(
                f"Leaf.activity must be one of {sorted(_VALID_ACTIVITY_LEVELS)} "
                f"or None, got {self.activity!r} (LOOP ITERATION 11, L15 "
                "demotion attribution, ledger row 2241)"
            )
        # LOOP ITERATION 12 (L16): same guard, same reason as
        # `elastic_axes`' -- and the one-per-axis check `axis_mins` needs
        # too, since a `(axis, Extent)` frozenset CAN carry two entries for
        # one axis when the extents differ, which would leave "how little
        # room is too little" ambiguous exactly where the point is that it
        # not be.
        floor_seen: set = set()
        for floor_axis, _extent in self.floor_axes:
            if floor_axis not in _VALID_SCROLL_AXES:
                raise ValueError(
                    f"Leaf.floor_axes axis must be one of "
                    f"{sorted(_VALID_SCROLL_AXES)}, got {floor_axis!r} "
                    "(LOOP ITERATION 12, L16 deficit attribution, ledger "
                    "row 2269)"
                )
            if floor_axis in floor_seen:
                raise ValueError(
                    f"Leaf.floor_axes declares axis {floor_axis!r} twice -- "
                    "a leaf has ONE smallest-usable extent per axis (LOOP "
                    "ITERATION 12, L16 deficit attribution, ledger row 2269)"
                )
            floor_seen.add(floor_axis)
        # LOOP ITERATION 13 (L17): same "unrepresentable by construction"
        # posture as every closed-vocabulary field above, and the same
        # one-per-axis guard `floor_axes` needs for the same reason -- a
        # `(axis, disposition)` frozenset CAN carry two entries for one
        # axis when the dispositions differ, which would leave "what does
        # my boundary fall on" ambiguous exactly where the point is that
        # it not be.
        edge_seen: set = set()
        for edge_axis, disposition in self.edge_axes:
            if edge_axis not in _VALID_SCROLL_AXES:
                raise ValueError(
                    f"Leaf.edge_axes axis must be one of "
                    f"{sorted(_VALID_SCROLL_AXES)}, got {edge_axis!r} (LOOP "
                    "ITERATION 13, L17 edge attribution, ledger row 2286)"
                )
            if disposition not in _VALID_EDGE_DISPOSITIONS:
                raise ValueError(
                    f"Leaf.edge_axes disposition must be one of "
                    f"{sorted(_VALID_EDGE_DISPOSITIONS)}, got "
                    f"{disposition!r} for axis {edge_axis!r} (LOOP "
                    "ITERATION 13, L17 edge attribution, ledger row 2286)"
                )
            if edge_axis in edge_seen:
                raise ValueError(
                    f"Leaf.edge_axes declares axis {edge_axis!r} twice -- a "
                    "leaf's boundary on an axis falls on ONE kind of thing "
                    "(LOOP ITERATION 13, L17 edge attribution, ledger row "
                    "2286)"
                )
            edge_seen.add(edge_axis)


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
