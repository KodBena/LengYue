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

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import FrozenSet, List, Literal, Optional, Union

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

    def __post_init__(self) -> None:
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
