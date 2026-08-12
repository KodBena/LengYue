"""Concrete-syntax parser for LYT `layoutsec` fragments (consult document
§4.1, lines 274-287):

    layoutsec ::= "layout" classid "=" slot
    slot      ::= presence? sizing node
    node      ::= leaf | split | excl
    split     ::= ("H" | "V") "(" slot ("," slot)* ")"
    excl      ::= "T" "(" slot ("," slot)* ")"
    leaf      ::= widgetid "[" domain ("," facet)* "]"
    presence  ::= "@fixed" | "@dev"
                | "@toggle" "(" ("user" | "system") "," ("release" | "preserve") ")"
    sizing    ::= "{" "min" extent "," "pref" extent "," "max" (extent | "inf")
                  ("," "aspect" number)? ("," "envelope")? "}"
    extent    ::= number ("px" | "ch" | "fr")

Disclosed narrowing (per the build commission's transcription instructions):
this parser reads ONLY `layoutsec` text — `widgetsec` / `classsec` /
`objectivesec` are never demonstrated with concrete syntax anywhere in the
consult document (§5's five worked encodings are all bare `layout X = ...`
fragments), so there is no worked example to be faithful to for those three
productions. Rather than invent syntax the document never shows, the runner
supplies classes/objective in Python (lyt_ast.Program).

Disclosed grammar EXTENSIONS, all required to parse the actual §5.1 text
verbatim (the document's own worked "as-is" encoding uses shorthands its own
EBNF does not cover):

  - `-- text` line comments (§5.1 is comment-annotated throughout).
  - `⚠L<digit>` warning markers prefixing a slot, preserved as
    `Slot.violates` metadata rather than discarded, so the raw transcription
    of §5.1 can be cross-checked against the wellformed.py checker's own
    independent findings (see build report).
  - a domain identifier may carry a trailing `?` (e.g. `common?`,
    line 460/`loadSave[common?, action]`) marking the census's own
    "flagged, not forced" ambiguity (§3). Stored as `Leaf.flagged`.
  - facets may be joined with `+` as well as `,` (`info+action`,
    line 462), both accepted as facet separators.
  - a `[TAG]` bracket may trail a `T(...)` node (`[BLACK BOX]`, line 577)
    as a documentation-only annotation. Stored as `Exclusive.tag`.
  - sizing items beyond the base grammar's min/pref/max/aspect/envelope:
    `width <extent>` (§5.5 line 592, alias for `pref`), `aspect-coupled`
    (§5.1 line 489, sugar for `pref 1fr` with no local aspect clamp — the
    real aspect constraint lives on the wrapped board leaf), and
    `drag-persisted` (§5.1 lines 500/502, a documentation flag with no
    geometric effect in this static-solve prototype — see wellformed.py's
    "L4 ACCOUNTING" paragraph for the disclosure of what this flag does
    and does not do; it is dropped after parsing, never reaching
    lyt_ast.Sizing, loader.py, or compiler.py).
    `envelope` gained an OPTIONAL `: {state, state, ...}` state list — the
    base grammar's bare `envelope` keyword (line 286) has nowhere to put
    the enumerated states L3 requires (line 381), so this parser accepts
    the extended `envelope: {...}` form to actually carry them. F8 fix
    (review row 1609): an EARLIER version of this parser made the
    `: {...}` clause MANDATORY, so the bare keyword — legal per the
    published EBNF — was a PARSE error, not a mere extension. Bare
    `envelope` now parses (`RawSizing.envelope_bare`); it is refused at
    LOAD time instead (loader.py), for the precise reason that L3 needs
    the states it doesn't have — the parser stays permissive per this
    module's own stated architecture, and the refusal moves to the layer
    that actually knows why it's wrong.
  - extents may be sums (`340px+60ch`, line 566) — resolved to plain px at
    LOAD time (see loader.py's `px_per_ch` constant), not by the parser.
  - AMENDMENT 3 (ledger row 1715, commissioner-delegated; see
    SPEC-AMENDMENTS.md): an H/V split's own sizing block may carry an
    optional `gap <extent>` term, the same bare `key <extent>` shape
    every other sizing key already uses (`min`/`pref`/`max`/`width`) --
    no new production, just one more recognized key in the existing
    `sizing` block. This parser stays permissive per its own stated
    architecture (module docstring, top) and accepts any extent unit
    here, same as every other extent-valued key; loader.py is where the
    amendment's actual law -- px only, refused loudly on `fr`/`ch`/a
    symbolic extent, and refused entirely on a T (Exclusive) node -- is
    enforced, matching the "parser permissive, loader refuses" division
    of labor the bare-`envelope` (F8) and `preserve`-reservation
    (AMENDMENT 1) precedents already use.
  - AMENDMENT 5 (ledger row 1937, commissioner-delegated; see
    SPEC-AMENDMENTS.md and
    `.claude/dispatch-reports/lyt-tab-region-consult.md` §9): two more
    sizing-bag keys, same "one more recognized key" precedent as `gap`:
      * `scroll <axis>` (`h` or `v`) -- legal on ANY node kind (leaf,
        split, exclusive) at any depth, unlike `gap` which is Split-only.
        UNLIKE every other sizing key, `scroll` may appear MORE THAN ONCE
        in the same block (`scroll h, scroll v` declares BOTH axes) --
        disclosed departure from this parser's usual last-write-wins bag
        semantics (module docstring's "sizing block is a bag of keys"
        note in SPEC.md §1.1), because two `scroll` terms naming
        DIFFERENT axes are not repetitions of "the same key" in any
        useful sense; occurrences are accumulated into a set
        (`RawSizing.scroll_axes`), not overwritten. The parser accepts
        any identifier in axis position (permissive, per this module's
        own architecture); loader.py refuses anything but `h`/`v`.
      * `content <class>` -- a leaf-only content-class declaration
        (`bounded` | `designed` | `unbounded`), parsed the same
        permissive way (any identifier accepted here; loader.py
        validates the closed vocabulary AND refuses the key entirely on
        a non-leaf node). Deliberately placed in the sizing bag rather
        than the leaf's `[domain, facets]` bracket -- the consult
        report's own §9.2 instruction is that content-class is an
        AXIS ORTHOGONAL to domain/facets, and the sizing bag is this
        parser's established "attach one more per-slot fact" extension
        point (the same point `gap` and `scroll` use), so reusing it
        here keeps the leaf bracket's grammar untouched rather than
        growing a second, competing extension point for the same kind
        of fact.
  - two symbolic size sentinels the document uses as prose-in-syntax:
    `CONTENT` (line 467, `max CONTENT` — the literal spelling-out of the
    forbidden content-driven-sizing basis) and `WRAPPER_MIN` (line 500, a
    named-but-undefined constant referencing `layout-model.ts:216`). Both
    are parsed as ordinary identifiers in extent position; CONTENT is
    refused by the loader (that refusal IS the enforcement of typed
    prohibition #1), WRAPPER_MIN is resolved by the loader to a disclosed
    concrete constant (300px, matching the control-panel floor the same
    document's own footnote cites at `layout-model.ts:186-191`).
  - AMENDMENT 7 (ledger rows 2107/2108, M1 of the model-implementation
    arc; SPEC-AMENDMENTS.md's own Amendment 7 entry; ported from the
    model-iteration loop experiment, rounds 3/5/6): four more sizing-bag
    keys, the same "one more recognized key" precedent as `gap`/`scroll`/
    `content`/`boundary`:
      * bare `ceiling` — "this declared extent is an upper bound, not a
        standing floor". Parsed as a bare flag; loader.py refuses it on a
        non-leaf, and on a leaf that is not `content bounded` (L9).
      * `unit <axis> <extent>` — the indivisible occupancy UNIT of a
        leaf's content along that axis. Accumulated across repeated
        occurrences exactly like `scroll` (two `unit` terms naming
        different axes are not repetitions of one key); any identifier in
        axis position, any extent in value position — `{h,v}` only, px
        only, at most one per axis, leaf-only, and only on a leaf whose
        `content` is `bounded`/`unbounded` are all loader.py's refusal
        (L10, unit integrity).
      * bare `measure-bound` — "this region's extent comes from the page
        measure its aspect-locked content is bound by; the residual on
        the partition axis belongs to its siblings". Parsed as a bare
        flag; loader.py refuses it on an Exclusive, and
        `wellformed.find_l11_violations` refuses it structurally where
        the subtree holds no single aspect-locked leaf to take a measure
        from (L11).
      * `wrap <policy>` — how a slot's own vocabulary of units
        distributes when it needs more than one row (`balanced` today).
        Last-write-wins, any identifier accepted here; the closed policy
        vocabulary, the Split refusal, and the "a leaf must have declared
        the `unit h` it proposes to wrap" precondition are all loader.py's
        (`_load_wrap_policy`).

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Union

from errors import LytParseError

# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

TOKEN_SPEC = [
    ("WARN", r"⚠L(\d)"),
    ("NUMUNIT", r"\d+(?:\.\d+)?(px|ch|fr)\b"),
    ("NUMBER", r"\d+(?:\.\d+)?"),
    ("IDENT", r"[A-Za-z_][A-Za-z0-9_\-]*\??"),
    ("LPAREN", r"\("),
    ("RPAREN", r"\)"),
    ("LBRACK", r"\["),
    ("RBRACK", r"\]"),
    ("LBRACE", r"\{"),
    ("RBRACE", r"\}"),
    ("COMMA", r","),
    ("COLON", r":"),
    ("PLUS", r"\+"),
    ("AT", r"@"),
    ("EQUALS", r"="),
    ("SKIP", r"[ \t\r\n]+"),
]
_MASTER_RE = re.compile("|".join(f"(?P<{n}>{p})" for n, p in TOKEN_SPEC))


@dataclass
class Token:
    kind: str
    text: str
    line: int


def _strip_comments(text: str) -> str:
    out_lines = []
    for line in text.splitlines():
        idx = line.find("--")
        out_lines.append(line[:idx] if idx >= 0 else line)
    return "\n".join(out_lines)


def tokenize(text: str) -> List[Token]:
    text = _strip_comments(text)
    tokens: List[Token] = []
    line_no = 1
    pos = 0
    while pos < len(text):
        m = _MASTER_RE.match(text, pos)
        if not m:
            snippet = text[pos : pos + 30].splitlines()[0]
            raise LytParseError(
                "unrecognized character in LYT source",
                {"line": line_no, "near": snippet},
            )
        kind = m.lastgroup
        piece = m.group()
        line_no += piece.count("\n")
        if kind != "SKIP":
            tokens.append(Token(kind, piece, line_no))
        pos = m.end()
    tokens.append(Token("EOF", "", line_no))
    return tokens


# ---------------------------------------------------------------------------
# Raw parse tree (pre-type-check; loader.py turns this into lyt_ast.*)
# ---------------------------------------------------------------------------


@dataclass
class RawExtent:
    """A single `NUMBER UNIT` term, or a bare symbolic identifier term
    (`CONTENT`, `WRAPPER_MIN`, `inf`)."""

    kind: str  # 'numunit' | 'symbol'
    unit: Optional[str] = None
    v: Optional[float] = None
    symbol: Optional[str] = None


@dataclass
class RawExtentSum:
    parts: List[RawExtent] = field(default_factory=list)


RawExtentLike = Union[RawExtent, RawExtentSum]


@dataclass
class RawSizing:
    min: Optional[RawExtentLike] = None
    pref: Optional[RawExtentLike] = None
    max: Optional[RawExtentLike] = None
    aspect: Optional[float] = None
    envelope_states: Optional[List[str]] = None
    envelope_bare: bool = False  # bare `envelope` keyword, no `: {states}` — F8 fix, see parse_sizing
    aspect_coupled: bool = False
    drag_persisted: bool = False
    fixed: Optional[RawExtentLike] = None  # `{28px}` shorthand, see §5.4/5.5
    gap: Optional[RawExtentLike] = None  # AMENDMENT 3 (ledger row 1715), H/V splits only
    # AMENDMENT 5 (ledger row 1937): `scroll <axis>` -- accumulated (not
    # overwritten) across repeated occurrences, see the module docstring's
    # AMENDMENT 5 note for why. Raw strings, lowercased, NOT yet validated
    # against {'h','v'} -- that is loader.py's job (parser stays
    # permissive).
    scroll_axes: List[str] = field(default_factory=list)
    # `content <class>` -- last-write-wins, like every other single-valued
    # sizing key. Raw string, lowercased, NOT yet validated against the
    # closed vocabulary or against "only legal on a leaf" -- loader.py's
    # job.
    content: Optional[str] = None
    # AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
    # lyt-tab-region-consult.md §6.3): bare boolean flag, same shape as
    # `aspect_coupled`/`drag_persisted` above -- "an unmodeled subtree
    # stands here", re-homed off the retired `domain == 'blackbox'` value.
    # Leaf-only (loader.py's job to refuse elsewhere, same "parser
    # permissive, loader refuses" division of labor every other key here
    # uses).
    boundary: bool = False
    # AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    # loop experiment round 3): bare `ceiling` flag — "this declared
    # extent is an upper bound, not a standing floor". Parsed
    # permissively here; loader.py refuses it on a non-leaf, and on a
    # leaf that is not `content bounded` (L9).
    ceiling: bool = False
    # AMENDMENT 7 (ported from the model-iteration loop experiment round
    # 6): bare `measure-bound` flag — "this region's extent comes from
    # the page measure its aspect-locked content is bound by, and the
    # residual belongs to its siblings". Parsed permissively here;
    # loader.py refuses it on an Exclusive, and
    # `wellformed.find_l11_violations` refuses it structurally where the
    # subtree has no single aspect-locked leaf to take a measure from
    # (L11).
    measure_bound: bool = False
    # AMENDMENT 7 (ported from the model-iteration loop experiment round
    # 6): `wrap <policy>` -- last-write-wins, like every other
    # single-valued sizing key. Raw string, lowercased, NOT validated
    # here against the closed policy vocabulary or against the
    # node-kind/unit preconditions -- loader.py's job, same "parser
    # permissive, loader refuses" division of labor `content`/`unit`
    # already use.
    wrap: Optional[str] = None
    # AMENDMENT 7 (ported from the model-iteration loop experiment round
    # 5): `unit <axis> <extent>` -- accumulated (not overwritten) across
    # repeated occurrences, the SAME disclosed departure from
    # last-write-wins bag semantics `scroll_axes` above already takes,
    # and for the same reason: two `unit` terms naming DIFFERENT axes are
    # not repetitions of "the same key" in any useful sense. Raw
    # `(axis, extent)` pairs, axis lowercased, NEITHER validated here --
    # the closed axis vocabulary, the px-only rule, the one-per-axis rule
    # and the leaf-only/content-class preconditions are all loader.py's
    # job (parser permissive, loader refuses).
    unit_axes: List[Tuple[str, "RawExtentLike"]] = field(default_factory=list)


@dataclass
class RawPresence:
    kind: str  # 'fixed' | 'dev' | 'toggle'
    by: Optional[str] = None
    hidden: Optional[str] = None


@dataclass
class RawLeaf:
    widget: str
    domain: str
    flagged: bool
    facets: List[str]


@dataclass
class RawSplit:
    axis: str
    children: List["RawSlot"]


@dataclass
class RawExclusive:
    children: List["RawSlot"]
    tag: Optional[str] = None


RawNode = Union[RawLeaf, RawSplit, RawExclusive]


@dataclass
class RawSlot:
    node: RawNode
    presence: Optional[RawPresence]
    sizing: Optional[RawSizing]
    warns: List[str] = field(default_factory=list)
    line: int = 0


@dataclass
class RawLayout:
    name: str
    slot: RawSlot


# ---------------------------------------------------------------------------
# Recursive-descent parser
# ---------------------------------------------------------------------------


class Parser:
    def __init__(self, tokens: List[Token]):
        self.toks = tokens
        self.i = 0

    def _peek(self) -> Token:
        return self.toks[self.i]

    def _advance(self) -> Token:
        t = self.toks[self.i]
        self.i += 1
        return t

    def _expect(self, kind: str, text: Optional[str] = None) -> Token:
        t = self._peek()
        if t.kind != kind or (text is not None and t.text != text):
            raise LytParseError(
                f"expected {kind}{'='+text if text else ''}, got {t.kind} {t.text!r}",
                {"line": t.line, "expected_kind": kind, "expected_text": text,
                 "got_kind": t.kind, "got_text": t.text},
            )
        return self._advance()

    def parse_program(self) -> List[RawLayout]:
        layouts = []
        while self._peek().kind != "EOF":
            layouts.append(self.parse_layoutsec())
        return layouts

    def parse_layoutsec(self) -> RawLayout:
        kw = self._expect("IDENT")
        if kw.text != "layout":
            raise LytParseError(
                "expected 'layout' keyword", {"line": kw.line, "got": kw.text}
            )
        name_tok = self._expect("IDENT")
        self._expect("EQUALS")
        slot = self.parse_slot()
        return RawLayout(name=name_tok.text, slot=slot)

    def parse_slot(self) -> RawSlot:
        line = self._peek().line
        warns: List[str] = []
        while self._peek().kind == "WARN":
            w = self._advance()
            m = re.match(r"⚠L(\d)", w.text)
            warns.append(f"L{m.group(1)}")

        presence = None
        if self._peek().kind == "AT":
            presence = self.parse_presence()

        sizing = None
        if self._peek().kind == "LBRACE":
            sizing = self.parse_sizing()

        node = self.parse_node()
        return RawSlot(node=node, presence=presence, sizing=sizing, warns=warns, line=line)

    def parse_presence(self) -> RawPresence:
        self._expect("AT")
        kw = self._expect("IDENT")
        word = kw.text.lower()
        if word == "fixed":
            return RawPresence(kind="fixed")
        if word == "dev":
            return RawPresence(kind="build")
        if word == "toggle":
            self._expect("LPAREN")
            by_tok = self._expect("IDENT")
            self._expect("COMMA")
            hidden_tok = self._expect("IDENT")
            self._expect("RPAREN")
            return RawPresence(
                kind="toggle", by=by_tok.text.lower(), hidden=hidden_tok.text.lower()
            )
        raise LytParseError(
            f"unknown presence keyword '@{kw.text}'", {"line": kw.line, "got": kw.text}
        )

    def parse_extent_term(self) -> RawExtent:
        t = self._peek()
        if t.kind == "NUMUNIT":
            self._advance()
            m = re.match(r"(\d+(?:\.\d+)?)(px|ch|fr)", t.text)
            return RawExtent(kind="numunit", v=float(m.group(1)), unit=m.group(2))
        if t.kind == "NUMBER":
            self._advance()
            # Bare number with no unit (e.g. §5.1 "min 0" for boardRail,
            # line 462). Disclosed: treated as px (0 in any unit is 0, and
            # non-zero bare numbers do not occur in the transcribed
            # encodings).
            return RawExtent(kind="numunit", v=float(t.text), unit="px")
        if t.kind == "IDENT":
            self._advance()
            return RawExtent(kind="symbol", symbol=t.text)
        raise LytParseError("expected an extent", {"line": t.line, "got": t.text})

    def parse_extent(self) -> RawExtentLike:
        first = self.parse_extent_term()
        if self._peek().kind == "PLUS":
            parts = [first]
            while self._peek().kind == "PLUS":
                self._advance()
                parts.append(self.parse_extent_term())
            return RawExtentSum(parts=parts)
        return first

    def parse_sizing(self) -> RawSizing:
        self._expect("LBRACE")
        rs = RawSizing()
        first = True
        while True:
            if self._peek().kind == "RBRACE":
                break
            if not first:
                self._expect("COMMA")
            first = False
            if self._peek().kind in ("NUMUNIT", "NUMBER"):
                # Bare-extent shorthand: `{28px}` means min=pref=max=28px
                # (§5.4/§5.5, e.g. `A_go[go, action]{28px}`, line 567).
                rs.fixed = self.parse_extent()
                continue
            key_tok = self._expect("IDENT")
            key = key_tok.text.lower()
            if key == "min":
                rs.min = self.parse_extent()
            elif key == "pref":
                rs.pref = self.parse_extent()
            elif key == "max":
                if self._peek().kind == "IDENT" and self._peek().text.lower() == "inf":
                    self._advance()
                    rs.max = RawExtent(kind="symbol", symbol="inf")
                else:
                    rs.max = self.parse_extent()
            elif key == "aspect":
                num = self._expect("NUMBER")
                rs.aspect = float(num.text)
            elif key == "envelope":
                if self._peek().kind == "COLON":
                    self._advance()
                    self._expect("LBRACE")
                    states = []
                    sfirst = True
                    while self._peek().kind != "RBRACE":
                        if not sfirst:
                            self._expect("COMMA")
                        sfirst = False
                        states.append(self._expect("IDENT").text)
                    self._expect("RBRACE")
                    rs.envelope_states = states
                else:
                    # F8 fix (review row 1609): the base grammar's bare
                    # `envelope` keyword (line 286) IS spec-legal syntax —
                    # this parser used to demand a `: {states}` clause
                    # unconditionally, making it a PARSE error, which the
                    # review named as a breaking change to spec-legal
                    # syntax disguised as a mere "extension" (F8). Bare
                    # `envelope` now parses; loader.py refuses it at LOAD
                    # time instead, for the more precise reason that L3
                    # requires the enumerated states (line 381) — the
                    # right layer for a semantic refusal, per this
                    # codebase's own "parser permissive, loader refuses"
                    # architecture (loader.py's own module docstring).
                    rs.envelope_bare = True
            elif key == "aspect-coupled":
                rs.aspect_coupled = True
            elif key == "drag-persisted":
                rs.drag_persisted = True
            elif key == "boundary":
                # AMENDMENT 6 (ledger row 1937): bare flag, same shape as
                # aspect-coupled/drag-persisted above.
                rs.boundary = True
            elif key == "width":
                rs.pref = self.parse_extent()  # alias, see module docstring
            elif key == "gap":
                # AMENDMENT 3 (ledger row 1715): parsed permissively here
                # (any extent unit/symbol, same as min/pref/max) -- the
                # px-only/no-fr/no-ch/no-T-node law is loader.py's job, per
                # this module's own "parser permissive, loader refuses"
                # architecture (see module docstring).
                rs.gap = self.parse_extent()
            elif key == "scroll":
                # AMENDMENT 5 (ledger row 1937): accumulated, not
                # overwritten -- see RawSizing.scroll_axes' own docstring
                # and the module docstring's AMENDMENT 5 note for why.
                axis_tok = self._expect("IDENT")
                rs.scroll_axes.append(axis_tok.text.lower())
            elif key == "content":
                # AMENDMENT 5 (ledger row 1937): last-write-wins, parsed
                # permissively (any identifier); loader.py validates the
                # closed vocabulary and the leaf-only restriction.
                content_tok = self._expect("IDENT")
                rs.content = content_tok.text.lower()
            elif key == "ceiling":
                # AMENDMENT 7 (ledger rows 2107/2108, ported from the
                # model-iteration loop experiment round 3): bare flag,
                # same shape as aspect-coupled/drag-persisted/boundary
                # above.
                rs.ceiling = True
            elif key == "measure-bound":
                # AMENDMENT 7 (ported from the model-iteration loop
                # experiment round 6): bare flag, same shape as
                # ceiling/boundary above.
                rs.measure_bound = True
            elif key == "wrap":
                # AMENDMENT 7 (ported from the model-iteration loop
                # experiment round 6): last-write-wins, parsed
                # permissively (any identifier); loader.py validates the
                # closed policy vocabulary and the node-kind /
                # declared-unit preconditions.
                wrap_tok = self._expect("IDENT")
                rs.wrap = wrap_tok.text.lower()
            elif key == "unit":
                # AMENDMENT 7 (ported from the model-iteration loop
                # experiment round 5): `unit <axis> <extent>` --
                # accumulated, not overwritten (see RawSizing.unit_axes'
                # own docstring). Parsed as permissively as `scroll`+`min`
                # are, each in its own layer: any identifier for the
                # axis, any extent for the value; loader.py refuses
                # everything that is not `{h,v} x px`.
                unit_axis_tok = self._expect("IDENT")
                rs.unit_axes.append((unit_axis_tok.text.lower(), self.parse_extent()))
            else:
                raise LytParseError(
                    f"unknown sizing key '{key_tok.text}'",
                    {"line": key_tok.line, "got": key_tok.text},
                )
        self._expect("RBRACE")
        return rs

    def parse_node(self) -> RawNode:
        t = self._peek()
        if t.kind != "IDENT":
            raise LytParseError("expected a node (H/V/T or a widget id)", {"line": t.line, "got": t.text})
        if t.text in ("H", "V"):
            self._advance()
            self._expect("LPAREN")
            children = [self.parse_slot()]
            while self._peek().kind == "COMMA":
                self._advance()
                children.append(self.parse_slot())
            self._expect("RPAREN")
            return RawSplit(axis="h" if t.text == "H" else "v", children=children)
        if t.text == "T":
            self._advance()
            self._expect("LPAREN")
            children = [self.parse_slot()]
            while self._peek().kind == "COMMA":
                self._advance()
                children.append(self.parse_slot())
            self._expect("RPAREN")
            tag = None
            if self._peek().kind == "LBRACK":
                # Could be a tag (`[BLACK BOX]`) following a T(...) node.
                self._advance()
                words = [self._expect("IDENT").text]
                while self._peek().kind != "RBRACK":
                    words.append(self._expect("IDENT").text)
                self._expect("RBRACK")
                tag = " ".join(words)
            return RawExclusive(children=children, tag=tag)
        # Otherwise: a leaf.
        widget_tok = self._advance()
        flagged = widget_tok.text.endswith("?")
        widget_name = widget_tok.text[:-1] if flagged else widget_tok.text
        self._expect("LBRACK")
        domain_tok = self._expect("IDENT")
        domain_flagged = domain_tok.text.endswith("?")
        domain = domain_tok.text[:-1] if domain_flagged else domain_tok.text
        flagged = flagged or domain_flagged
        facets: List[str] = []
        while self._peek().kind in ("COMMA", "PLUS"):
            self._advance()
            facets.append(self._expect("IDENT").text)
        self._expect("RBRACK")
        return RawLeaf(widget=widget_name, domain=domain, flagged=flagged, facets=facets)


def parse_layouts(text: str) -> List[RawLayout]:
    tokens = tokenize(text)
    return Parser(tokens).parse_program()
