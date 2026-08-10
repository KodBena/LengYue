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
   (line 242). The consult's own §2 census commissions one region as an
   opaque "BLACK BOX" (control-panel tabs) whose interior is explicitly
   *not* categorized by that union — it is out of scope for classification,
   not merely unclassified-yet. We add a sixth domain literal, 'blackbox',
   for exactly that region, rather than forcing an arbitrary member of the
   closed five-way union onto content the document declines to classify.
2. `Sizing.basis` keeps the TS union `'reserved' | 'envelope'` (line 322)
   verbatim — there is no 'content' member. That absence is deliberate and
   load-bearing (§4.2, line 344: "There is deliberately no basis: 'content'.
   That absence is the language's answer to defect (a).") and is exactly
   the first typed prohibition the build commission asks us to enforce.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import FrozenSet, List, Literal, Optional, Union

Domain = Literal["go", "common", "debug", "board", "chrome", "blackbox"]
Facet = Literal["action", "info"]
Unit = Literal["px", "ch", "fr"]

_VALID_UNITS = {"px", "ch", "fr"}
_VALID_BASES = {"reserved", "envelope"}


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
