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
    geometric effect in this static-solve prototype — see loader.py).
    `envelope` gained a required `: {state, state, ...}` state list, since
    the base grammar's bare `envelope` keyword (line 286) has nowhere to
    put the enumerated states L3 requires (line 381).
  - extents may be sums (`340px+60ch`, line 566) — resolved to plain px at
    LOAD time (see loader.py's `px_per_ch` constant), not by the parser.
  - two symbolic size sentinels the document uses as prose-in-syntax:
    `CONTENT` (line 467, `max CONTENT` — the literal spelling-out of the
    forbidden content-driven-sizing basis) and `WRAPPER_MIN` (line 500, a
    named-but-undefined constant referencing `layout-model.ts:216`). Both
    are parsed as ordinary identifiers in extent position; CONTENT is
    refused by the loader (that refusal IS the enforcement of typed
    prohibition #1), WRAPPER_MIN is resolved by the loader to a disclosed
    concrete constant (300px, matching the control-panel floor the same
    document's own footnote cites at `layout-model.ts:186-191`).
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
    aspect_coupled: bool = False
    drag_persisted: bool = False
    fixed: Optional[RawExtentLike] = None  # `{28px}` shorthand, see §5.4/5.5


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
                self._expect("COLON")
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
            elif key == "aspect-coupled":
                rs.aspect_coupled = True
            elif key == "drag-persisted":
                rs.drag_persisted = True
            elif key == "width":
                rs.pref = self.parse_extent()  # alias, see module docstring
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
