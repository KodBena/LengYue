"""
domain/tag_dsl_grammar.py

Tag-DSL grammar — pure parser, AST, substitutive macro expander,
and DNF normaliser. The half of the tag DSL that has no SQL
concern.

Arc 1 (file split) carved out a `TagDSLGrammar` class holding the
pre-SQL pipeline behind a flat-set virtual-tag model.
Arc 2 (macro-language refactor, this file) replaces the flat-set
model with a substitutive macro expander operating over a small
discriminated-union AST. The contract with the SQL emitter
(`repositories/tag_dsl_sql.py`) is preserved: the grammar
ultimately yields a list of `{pos: Set[str], neg: Set[str]}` DNF
conjunction dicts, which the SQL emitter consumes unchanged.

What changed at arc 2
---------------------
- `self.definitions` now stores parsed `Disj` trees, not flat
  `Set[str]`. Reference expansion is **substitutive** — when
  `$attack` appears, its full grammar tree is substituted at the
  site, not flat-merged eagerly.
- **Negation is admitted in virtual-tag definitions**:
  `$attack :- $tactic;~$blocked` parses and expands. De Morgan
  is applied when a substituted virtual sits inside a negation
  (`~$attack` where `$attack` carries internal negation walks
  the dual).
- **Parentheses** are admitted at the grammar level for explicit
  grouping (`($a, $b); $c` and the non-DNF shape `tag, ($a;$b)`,
  which the DNF normaliser flattens by distribution).
- Three caps fire as `PipelineDSLError`-raising guards at three
  phases. None of them ship configurable — per the design note's
  resolved Q4, defaults are hard-coded and tightened only when a
  real workload demands it.

The three caps
--------------
- **K (definition body length, default 256)**: fires inside
  `_parse_definition`, after the RHS has been substituted to a
  concrete-only `Disj`. Counts concrete leaves; refuses if > K.
  Caught at authoring time, not query time.
- **D (recursion depth, default 8)**: fires during substitution,
  tracked as a depth counter through the reference chain.
  Refuses if a chain exceeds D.
- **M (total expansion size, default 1024)**: fires after macro
  expansion + DNF normalisation, before any SQL is emitted.
  Counts the final conjunction list; refuses if > M.

Each cap-violation error names the cap, the offending count, and
the virtual at fault. Per ADR-0002 (fail loudly): no silent
truncation, no partial expansion.

The cycle preventer
-------------------
Forward declaration is still required. A definition that
references `$x` raises immediately if `$x` is not yet in
`self.definitions`. The substitutive expander inherits this
property — pathological recursion needs intentional fan-out
through the K/M caps, not cycles.

Surface
-------
`TagDSLGrammar` is the base class. `TagDSLCompiler` in
`repositories/tag_dsl_sql.py` subclasses it and adds the SQL
emission. Production code consumes `TagDSLCompiler` via the
`domain.tag_dsl` facade.

Internal method shape (called by `compile_to_subquery` in the
SQL adapter):

- `_split_statements(expr) -> List[str]`: unchanged from arc 1.
  Splits on `.` (period); every non-final statement is a
  definition, the final statement is the query.
- `_parse_definition(defn)`: parses `$name :- body` where `body`
  admits the full new grammar; substitutes referenced virtuals
  (D cap); checks K cap; stores the resulting `Disj`.
- `_parse_query(query) -> Disj`: parses the final-statement
  query expression into a `Disj` AST via recursive descent.
- `_expand_to_dnf(disj) -> List[Dict[str, Set[str]]]`:
  substitutes any remaining virtuals (D cap), pushes negation
  inward via De Morgan, distributes nested groupings, and
  returns the flat DNF dict shape the SQL emitter consumes.

The old `_expand_conjunction` is removed — its responsibilities
fold into `_expand_to_dnf`, which operates on the AST. Test
suites that pinned the flat-set internal-method shape are
updated correspondingly per the design note's resolved Q5
("backwards compatibility with a broken feature is not a
concern").

License: Public Domain (The Unlicense)
"""
from dataclasses import dataclass
from typing import Dict, List, Set, Tuple, Union

from domain.errors import PipelineDSLError


# ---------------------------------------------------------------------------
# Caps. Hard-coded per resolved Q4 of the design note.
# ---------------------------------------------------------------------------

MAX_DEFINITION_LEAVES = 256          # K
MAX_REFERENCE_DEPTH = 8              # D
MAX_TOTAL_CONJUNCTIONS = 1024        # M


# ---------------------------------------------------------------------------
# AST. Small discriminated-union shape; all nodes frozen.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Concrete:
    """A literal tag name (e.g. `attack`)."""
    name: str


@dataclass(frozen=True)
class Virtual:
    """A reference to a virtual-tag definition (e.g. `$attack`)."""
    name: str


@dataclass(frozen=True)
class Neg:
    """Negation applied to a Concrete or a Virtual (e.g. `~attack`).

    The grammar deliberately does not accept `~(...)` over composite
    expressions at parse time. Negation of a composite expression
    only arises after macro substitution and is handled by the
    De Morgan push inside `_substitute_disj`.
    """
    term: Union[Concrete, Virtual]


# Atom is the unit of a Conj. A parenthesised sub-expression appears
# in the AST as a Disj nested inside a Conj's atoms tuple.
Atom = Union[Concrete, Virtual, Neg, "Disj"]


@dataclass(frozen=True)
class Conj:
    """Comma-separated conjunction of atoms."""
    atoms: Tuple[Atom, ...]


@dataclass(frozen=True)
class Disj:
    """Semicolon-separated disjunction of conjunctions."""
    conjs: Tuple[Conj, ...]


# ---------------------------------------------------------------------------
# Tokenizer + recursive-descent parser.
# ---------------------------------------------------------------------------

# Token kinds. Whitespace is consumed inside the tokenizer; newlines
# are treated as `;` to preserve the arc-1 grammar's behaviour where
# `[;\n]+` separated disjuncts.

_TOK_IDENT = "IDENT"      # tag name; value is the string
_TOK_DOLLAR_IDENT = "VIRT"  # virtual reference; value is the name (without $)
_TOK_TILDE = "TILDE"
_TOK_COMMA = "COMMA"
_TOK_SEMI = "SEMI"
_TOK_LPAREN = "LPAREN"
_TOK_RPAREN = "RPAREN"
_TOK_EOF = "EOF"


def _tokenize(text: str) -> List[Tuple[str, str]]:
    tokens: List[Tuple[str, str]] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in " \t\r":
            i += 1
            continue
        if ch == "\n" or ch == ";":
            tokens.append((_TOK_SEMI, ch))
            i += 1
            continue
        if ch == ",":
            tokens.append((_TOK_COMMA, ch))
            i += 1
            continue
        if ch == "~":
            tokens.append((_TOK_TILDE, ch))
            i += 1
            continue
        if ch == "(":
            tokens.append((_TOK_LPAREN, ch))
            i += 1
            continue
        if ch == ")":
            tokens.append((_TOK_RPAREN, ch))
            i += 1
            continue
        if ch == "$":
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] == "_"):
                j += 1
            if j == i + 1:
                raise PipelineDSLError(
                    f"Bare '$' with no identifier at position {i} in {text!r}"
                )
            tokens.append((_TOK_DOLLAR_IDENT, text[i + 1:j]))
            i = j
            continue
        if ch.isalnum() or ch == "_" or ch == "-" or ch == "/":
            # Tag names admit alnum + underscore + hyphen + slash (the latter
            # two appear in real-world taxonomies — `life-and-death`, etc).
            j = i + 1
            while j < n and (text[j].isalnum() or text[j] in "_-/"):
                j += 1
            tokens.append((_TOK_IDENT, text[i:j]))
            i = j
            continue
        raise PipelineDSLError(
            f"Unexpected character {ch!r} at position {i} in {text!r}"
        )
    tokens.append((_TOK_EOF, ""))
    return tokens


class _Parser:
    """Recursive-descent parser over the token stream. Produces a Disj."""

    def __init__(self, tokens: List[Tuple[str, str]], source: str):
        self.tokens = tokens
        self.pos = 0
        self.source = source

    def _peek(self) -> Tuple[str, str]:
        return self.tokens[self.pos]

    def _advance(self) -> Tuple[str, str]:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def _expect(self, kind: str) -> Tuple[str, str]:
        tok = self._peek()
        if tok[0] != kind:
            raise PipelineDSLError(
                f"Expected {kind} but got {tok[0]} ({tok[1]!r}) in {self.source!r}"
            )
        return self._advance()

    def parse_disj_top(self) -> Disj:
        # Skip leading SEMIs (the arc-1 grammar tolerated them via [;\n]+).
        while self._peek()[0] == _TOK_SEMI:
            self._advance()
        if self._peek()[0] == _TOK_EOF:
            raise PipelineDSLError(f"Empty expression in {self.source!r}")
        disj = self._parse_disj()
        if self._peek()[0] != _TOK_EOF:
            tok = self._peek()
            raise PipelineDSLError(
                f"Unexpected token {tok[0]} ({tok[1]!r}) after expression in {self.source!r}"
            )
        return disj

    def _parse_disj(self) -> Disj:
        # disj ::= conj (SEMI+ conj)*
        conjs: List[Conj] = []
        conjs.append(self._parse_conj())
        while self._peek()[0] == _TOK_SEMI:
            # Collapse one or more SEMIs.
            while self._peek()[0] == _TOK_SEMI:
                self._advance()
            # SEMI followed immediately by RPAREN/EOF is a trailing separator;
            # don't try to parse an empty conj.
            if self._peek()[0] in (_TOK_RPAREN, _TOK_EOF):
                break
            conjs.append(self._parse_conj())
        return Disj(conjs=tuple(conjs))

    def _parse_conj(self) -> Conj:
        # conj ::= atom (COMMA atom)*
        atoms: List[Atom] = []
        atoms.append(self._parse_atom())
        while self._peek()[0] == _TOK_COMMA:
            self._advance()
            atoms.append(self._parse_atom())
        return Conj(atoms=tuple(atoms))

    def _parse_atom(self) -> Atom:
        tok = self._peek()
        if tok[0] == _TOK_TILDE:
            self._advance()
            inner = self._peek()
            if inner[0] == _TOK_IDENT:
                self._advance()
                return Neg(term=Concrete(name=inner[1]))
            if inner[0] == _TOK_DOLLAR_IDENT:
                self._advance()
                return Neg(term=Virtual(name=inner[1]))
            raise PipelineDSLError(
                f"Negation '~' must precede a tag or virtual reference, "
                f"got {inner[0]} ({inner[1]!r}) in {self.source!r}"
            )
        if tok[0] == _TOK_LPAREN:
            self._advance()
            inner = self._parse_disj()
            self._expect(_TOK_RPAREN)
            return inner
        if tok[0] == _TOK_IDENT:
            self._advance()
            return Concrete(name=tok[1])
        if tok[0] == _TOK_DOLLAR_IDENT:
            self._advance()
            return Virtual(name=tok[1])
        raise PipelineDSLError(
            f"Expected a tag, virtual reference, or '(' but got "
            f"{tok[0]} ({tok[1]!r}) in {self.source!r}"
        )


def _parse_expression(text: str) -> Disj:
    """Tokenise and parse a single (sub-)expression into a Disj."""
    tokens = _tokenize(text)
    parser = _Parser(tokens, source=text)
    return parser.parse_disj_top()


# ---------------------------------------------------------------------------
# Substitution + De Morgan + DNF normalisation.
# ---------------------------------------------------------------------------

def _negate_disj(d: Disj) -> Disj:
    """Apply De Morgan to a Disj to produce its negation.

    `~(A OR B OR C) = ~A AND ~B AND ~C`. Each conj inside the disj
    becomes one atom in the resulting single conj. Each conj
    `(a, b)` itself negates by De Morgan: `~(a AND b) = ~a OR ~b`,
    which is a Disj atom inside the resulting conj.
    """
    atoms: List[Atom] = []
    for conj in d.conjs:
        atoms.append(_negate_conj(conj))
    return Disj(conjs=(Conj(atoms=tuple(atoms)),))


def _negate_conj(c: Conj) -> Atom:
    """Negate a single conjunction. `~(a AND b AND c) = ~a OR ~b OR ~c`.

    Returns an Atom — either a single negated atom (single-atom conj),
    or a Disj wrapping the disjunction of negated atoms.
    """
    negated_atoms = [_negate_atom(a) for a in c.atoms]
    if len(negated_atoms) == 1:
        return negated_atoms[0]
    # Wrap each negated atom in its own Conj; the Disj of those conjs
    # is the De Morgan dual.
    return Disj(conjs=tuple(Conj(atoms=(na,)) for na in negated_atoms))


def _negate_atom(a: Atom) -> Atom:
    """Negate a single atom."""
    if isinstance(a, Concrete):
        return Neg(term=a)
    if isinstance(a, Virtual):
        return Neg(term=a)
    if isinstance(a, Neg):
        # ~~x = x
        return a.term
    if isinstance(a, Disj):
        return _negate_disj_as_atom(a)
    raise PipelineDSLError(f"Cannot negate atom of type {type(a).__name__}")


def _negate_disj_as_atom(d: Disj) -> Atom:
    """Negate a Disj-as-atom (parenthesised sub-expression).

    The De Morgan dual is itself a Disj atom. We return the result of
    `_negate_disj`'s Conj wrapped as a Disj atom if it has multiple
    members, or unwrapped if single.
    """
    negated = _negate_disj(d)
    if len(negated.conjs) == 1 and len(negated.conjs[0].atoms) == 1:
        return negated.conjs[0].atoms[0]
    return negated


def _substitute_disj(
    d: Disj,
    definitions: Dict[str, Disj],
    depth: int,
    max_depth: int,
) -> Disj:
    """Substitute every Virtual reference inside a Disj with its
    stored definition. Pushes negation inward via De Morgan when a
    Virtual appears inside a Neg.

    Depth is incremented each time a Virtual is substituted; raises
    if it exceeds `max_depth`.
    """
    new_conjs = []
    for conj in d.conjs:
        new_conjs.append(_substitute_conj(conj, definitions, depth, max_depth))
    return Disj(conjs=tuple(new_conjs))


def _substitute_conj(
    c: Conj,
    definitions: Dict[str, Disj],
    depth: int,
    max_depth: int,
) -> Conj:
    new_atoms: List[Atom] = []
    for atom in c.atoms:
        new_atoms.append(_substitute_atom(atom, definitions, depth, max_depth))
    return Conj(atoms=tuple(new_atoms))


def _substitute_atom(
    a: Atom,
    definitions: Dict[str, Disj],
    depth: int,
    max_depth: int,
) -> Atom:
    if isinstance(a, Concrete):
        return a
    if isinstance(a, Virtual):
        if a.name not in definitions:
            raise PipelineDSLError(f"Unknown virtual tag in query: ${a.name}")
        next_depth = depth + 1
        if next_depth > max_depth:
            raise PipelineDSLError(
                f"Reference depth {next_depth} exceeds D={max_depth} "
                f"(recursion depth cap) at virtual '${a.name}'"
            )
        # Recursively substitute the body of the definition. The
        # definition is itself already substituted at parse time, but
        # we recurse defensively in case a future change loosens that
        # invariant.
        body = _substitute_disj(definitions[a.name], definitions, next_depth, max_depth)
        # Return as a Disj-atom; the DNF flattener distributes through.
        if len(body.conjs) == 1 and len(body.conjs[0].atoms) == 1:
            return body.conjs[0].atoms[0]
        return body
    if isinstance(a, Neg):
        # ~Concrete -> stays Neg(Concrete).
        if isinstance(a.term, Concrete):
            return a
        # ~Virtual -> substitute then De Morgan.
        v = a.term
        if v.name not in definitions:
            raise PipelineDSLError(f"Unknown virtual tag in query: ${v.name}")
        next_depth = depth + 1
        if next_depth > max_depth:
            raise PipelineDSLError(
                f"Reference depth {next_depth} exceeds D={max_depth} "
                f"(recursion depth cap) at virtual '${v.name}'"
            )
        body = _substitute_disj(definitions[v.name], definitions, next_depth, max_depth)
        return _negate_disj_as_atom(body)
    if isinstance(a, Disj):
        return _substitute_disj(a, definitions, depth, max_depth)
    raise PipelineDSLError(f"Cannot substitute atom of type {type(a).__name__}")


def _count_concrete_leaves(d: Disj) -> int:
    """Count the concrete tag leaves of a fully-substituted Disj.

    Used by the K cap. Counts each `Concrete` and each `Neg(Concrete)`
    as one leaf; recurses through any nested Disj atoms (parenthesised
    sub-expressions that survived substitution).
    """
    n = 0
    for conj in d.conjs:
        for atom in conj.atoms:
            if isinstance(atom, Concrete):
                n += 1
            elif isinstance(atom, Neg) and isinstance(atom.term, Concrete):
                n += 1
            elif isinstance(atom, Disj):
                n += _count_concrete_leaves(atom)
            else:
                # Unsubstituted Virtual or Neg(Virtual) — should not happen
                # if substitution ran first. Raise defensively.
                raise PipelineDSLError(
                    f"Encountered unsubstituted atom while counting leaves: {atom!r}"
                )
    return n


def _distribute_to_dnf(d: Disj, max_conjunctions: int) -> List[Conj]:
    """Flatten a Disj that may contain nested Disjs inside Conjs into
    a list of Conjs whose atoms are only `Concrete` or
    `Neg(Concrete)`.

    Distributes nested disjunctions over conjunctions:
    `A AND (B OR C)` becomes `(A AND B) OR (A AND C)`.

    Guarded by `max_conjunctions`: the M cap. Raises
    `PipelineDSLError` as soon as the running count exceeds the
    cap so a pathological input (e.g. 5¹⁰ ≈ 9.77M conjunctions
    from S1) is refused before any large intermediate list is
    materialised. The error mirrors the post-DNF M-cap message in
    `compile_to_subquery`; either firing path identifies the same
    failure.
    """
    out: List[Conj] = []
    for conj in d.conjs:
        out.extend(_distribute_conj(conj, max_conjunctions))
        if len(out) > max_conjunctions:
            raise PipelineDSLError(
                f"Macro expansion produces more than {max_conjunctions} "
                f"conjunctions; exceeds M={max_conjunctions} "
                f"(total expansion size cap)"
            )
    return out


def _distribute_conj(c: Conj, max_conjunctions: int) -> List[Conj]:
    flat_atoms: List[Atom] = []
    nested_disjs: List[Disj] = []
    for atom in c.atoms:
        if isinstance(atom, Disj):
            nested_disjs.append(atom)
        elif isinstance(atom, (Concrete, Neg)):
            flat_atoms.append(atom)
        else:
            raise PipelineDSLError(
                f"Cannot DNF-flatten atom of type {type(atom).__name__}"
            )

    # Start with one conj carrying the flat atoms.
    result: List[Conj] = [Conj(atoms=tuple(flat_atoms))]
    # Cross-product distribute each nested disj.
    for nested in nested_disjs:
        expanded_inner = _distribute_to_dnf(nested, max_conjunctions)
        new_result: List[Conj] = []
        for existing in result:
            for inner_conj in expanded_inner:
                new_result.append(Conj(atoms=existing.atoms + inner_conj.atoms))
                if len(new_result) > max_conjunctions:
                    raise PipelineDSLError(
                        f"Macro expansion produces more than "
                        f"{max_conjunctions} conjunctions; exceeds "
                        f"M={max_conjunctions} (total expansion size cap)"
                    )
        result = new_result

    return result


def _conj_to_dnf_dict(c: Conj) -> Dict[str, Set[str]]:
    pos: Set[str] = set()
    neg: Set[str] = set()
    for atom in c.atoms:
        if isinstance(atom, Concrete):
            pos.add(atom.name)
        elif isinstance(atom, Neg) and isinstance(atom.term, Concrete):
            neg.add(atom.term.name)
        else:
            raise PipelineDSLError(
                f"Cannot convert non-flat atom to DNF dict: {atom!r}"
            )
    return {"pos": pos, "neg": neg}


# ---------------------------------------------------------------------------
# Grammar class — production surface.
# ---------------------------------------------------------------------------

class TagDSLGrammar:
    def __init__(self):
        self.definitions: Dict[str, Disj] = {}

    def _split_statements(self, expression: str) -> List[str]:
        expression = expression.strip()
        if expression.endswith('.'):
            expression = expression[:-1]
        return [p.strip() for p in expression.split('.') if p.strip()]

    def _parse_definition(self, defn: str):
        """Parse `$name :- body` and store the parsed Disj.

        Storage is **lazy**: the parsed body is stored with any
        ``Virtual`` references intact. Substitution happens at
        expansion time so the D cap accumulates depth through the
        full reference chain (a chain of N definitions
        ``$dN :- $d(N-1)`` raises at the Nth substitution when
        N > D, not at any single parse step).

        Phases:
          1. Extract the name and the body text.
          2. Parse the body into a Disj via the recursive-descent
             parser.
          3. K cap: ephemerally substitute the body (D-bounded) and
             count concrete leaves; refuse if > K. The ephemeral
             substitution is discarded — the stored Disj remains the
             unsubstituted parse.
          4. Forward-declaration discipline: the K-cap substitution
             also raises if any referenced virtual is undefined,
             preserving the arc-1 cycle-preventer.
          5. Store the parsed Disj keyed by name.

        The K-cap substitution also serves as a parse-time D-cap
        firing if a definition's chain depth itself exceeds D — the
        ephemeral substitution walks the chain and raises before the
        definition is stored.
        """
        head, sep, body_text = defn.partition(':-')
        if not sep:
            raise PipelineDSLError(
                f"Statement is not a valid virtual tag definition "
                f"(expected '$name :- tag1;tag2;...'): {defn!r}"
            )
        head = head.strip()
        if not (head.startswith('$') and len(head) > 1):
            raise PipelineDSLError(
                f"Statement is not a valid virtual tag definition "
                f"(expected '$name :- tag1;tag2;...'): {defn!r}"
            )
        name = head[1:]
        # Validate the name is a plain identifier (alnum + underscore).
        if not all(ch.isalnum() or ch == '_' for ch in name) or not name:
            raise PipelineDSLError(
                f"Invalid virtual tag name in definition: {head!r} (in {defn!r})"
            )

        body_text = body_text.strip()
        if not body_text:
            # Preserve arc-1's behaviour: empty body is parseable and
            # stores an empty disj. Compile-boundary D-8 regression
            # depends on this — the empty virtual in a query produces
            # zero conjunctions, which the compile boundary loudly
            # refuses.
            self.definitions[name] = Disj(conjs=())
            return

        body_disj = _parse_expression(body_text)

        # K cap: ephemerally substitute to compute the effective
        # concrete-leaf count. The result is discarded — only the
        # leaf count is consumed. The substitution also enforces D
        # (parse-time chain-depth check) and forward-declaration
        # (unknown-virtual raise).
        ephemeral_substituted = _substitute_disj(
            body_disj,
            self.definitions,
            depth=0,
            max_depth=MAX_REFERENCE_DEPTH,
        )
        leaves = _count_concrete_leaves(ephemeral_substituted)
        if leaves > MAX_DEFINITION_LEAVES:
            raise PipelineDSLError(
                f"Virtual tag '${name}' has {leaves} leaves; "
                f"exceeds K={MAX_DEFINITION_LEAVES} (definition body length cap)"
            )

        # Store the parsed Disj (with Virtual references intact).
        self.definitions[name] = body_disj

    def _parse_query(self, query: str) -> Disj:
        """Parse the final-statement query expression into a Disj.

        Returns the AST shape unsubstituted — the orchestrator in
        `TagDSLCompiler.compile_to_subquery` calls `_expand_to_dnf`
        next to substitute references and produce DNF.
        """
        return _parse_expression(query)

    def _expand_to_dnf(self, disj: Disj) -> List[Dict[str, Set[str]]]:
        """Substitute references, push negation inward via De Morgan,
        distribute nested groupings, and return the flat DNF dict
        list the SQL emitter consumes.

        The K cap does not fire here (it fires at definition-parse
        time only). The D cap fires during substitution. The M cap
        does NOT fire here either — it is the orchestrator's
        responsibility in `compile_to_subquery` after this call.
        """
        substituted = _substitute_disj(
            disj,
            self.definitions,
            depth=0,
            max_depth=MAX_REFERENCE_DEPTH,
        )
        flat_conjs = _distribute_to_dnf(substituted, MAX_TOTAL_CONJUNCTIONS)
        return [_conj_to_dnf_dict(c) for c in flat_conjs]
