# Tag DSL Reference

A small expression language for slicing the card forest by tag
membership. The frontend's CardSetEditor sends tag-DSL strings to
the backend, where they are compiled into SQL that returns the
matching card IDs. This document is the user-facing reference;
the implementation lives at `backend/domain/tag_dsl_grammar.py`
(grammar) and `backend/repositories/tag_dsl_sql.py` (SQL
emission).

## Motivation

A library grows past a few hundred cards and the user starts
wanting "shape problems excluding ones I've classified as
volatile" or "attack patterns that aren't already in my blocked
list". The tag DSL is the user's primary tool for expressing
those slices — directly in the deck pipeline's `select` stage.

Earlier the language supported only flat-set aliases:
`$opening :- joseki;opening;moyo` defined `$opening` as the union
of three tags, queryable as `$opening` or
`$opening, ~volatile`. That worked for simple aliases but broke
down on the structural patterns above — negation could only
appear in queries, not in definitions, so any "X except Y" idiom
had to be inlined at every query site.

Arc 2 of the tag-DSL macro-language plan lifted that
restriction. Definitions are now a full sub-language with
negation, nesting, and parenthesised grouping. The language is
a **substitutive macro language** layered over the underlying
SQL: virtual-tag references are textually substituted by their
parsed grammar tree at the use site, then DNF-normalised, then
emitted as a SQL UNION of per-conjunction subqueries.

## Quick reference

| Form           | Meaning                                  |
|----------------|------------------------------------------|
| `tag`          | Cards with this tag                      |
| `~tag`         | Cards without this tag                   |
| `a, b`         | Conjunction (AND)                        |
| `a; b`         | Disjunction (OR)                         |
| `(expr)`       | Grouping                                 |
| `$name`        | Virtual-tag reference                    |
| `~$name`       | Negated virtual-tag reference (De Morgan)|
| `$name :- body.` | Definition (statement separated by `.`) |

A program is a sequence of statements separated by `.`. All but
the last statement are definitions; the last is the query.

Whitespace and newlines are insignificant. A newline inside an
expression counts as `;` (matching the historical grammar's
permissive newline handling).

## Grammar (BNF)

```
program     ::= statement ('.' statement)* '.'?
statement   ::= definition | query
definition  ::= '$' ident ':-' disj
query       ::= disj

disj        ::= conj (';' conj)*
conj        ::= atom (',' atom)*
atom        ::= '~' simple
              | simple
              | '(' disj ')'
simple      ::= '$' ident      ; virtual reference
              | ident          ; concrete tag

ident       ::= [A-Za-z0-9_] [A-Za-z0-9_\-/]*
```

Precedence: `;` (OR) binds looser than `,` (AND), which binds
looser than `~` (negation). `(...)` overrides the default
precedence.

## Semantics

- **`tag`** matches cards that have the named tag in their
  `card_tag` entries.
- **`~tag`** matches cards that do not have the named tag. A
  card with no tags at all still matches `~tag` (the absence is
  what's tested).
- **`a, b`** matches cards that satisfy both `a` and `b`.
- **`a; b`** matches cards that satisfy either `a` or `b` (or
  both — `;` is inclusive).
- **`(expr)`** is `expr`, evaluated as a sub-expression. Useful
  to override the default precedence: `tag, (a; b)` is "tag
  AND (a OR b)" — distributed into DNF as
  `(tag, a); (tag, b)`.
- **`$name`** substitutes the body of the named virtual tag at
  the reference site. The substitution is structural — the full
  grammar tree of the definition is inserted, not a flat set.
- **`~$name`** substitutes the De Morgan dual of the named
  virtual tag's body. `~(a; b)` becomes `~a, ~b`; `~(a, b)`
  becomes `~a; ~b`; `~~a` becomes `a`.

## Virtual-tag definitions

`$name :- body.` defines a virtual tag whose body is any valid
disj expression. Definitions must precede their use (forward
references raise `PipelineDSLError` — the cheap cycle
preventer).

Definitions are **lazy**: the parser stores the body's grammar
tree with `Virtual` references intact. Substitution happens at
the query site, walking the reference chain transitively. This
means a chain of definitions `$d1 → $d2 → … → $dN` accumulates
depth across the chain, which is what the D cap bounds (see
"Caps" below).

Definitions are **substitutive, not flattening**:

```
$tactic :- punish;fight;sabaki.
$blocked :- volatile.
$attack :- $tactic, ~$blocked.    # "tactic except blocked"
$attack
```

At query time, `$attack` is substituted by its parsed body
`$tactic, ~$blocked`, which is then further substituted to
`(punish;fight;sabaki), ~volatile`. DNF normalisation distributes
the inner disjunction across the conjunction, yielding three
conjunctions:

```
(punish, ~volatile); (fight, ~volatile); (sabaki, ~volatile)
```

SQL emission UNIONs three subqueries, each selecting cards with
one of the positive tags and EXCEPTing cards with `volatile`.

## Caps

Three caps protect against pathological expressions. Each raises
`PipelineDSLError` naming the cap, the offending count, and the
virtual at fault (per ADR-0002: fail loudly).

| Cap | Default | Phase                          | Bounds                              |
|-----|---------|--------------------------------|-------------------------------------|
| K   | 256     | Definition-parse time           | Concrete leaves of a definition's substituted body |
| D   | 8       | Substitution                    | Recursion depth through virtual-tag references     |
| M   | 1024    | DNF distribution                | Total conjunctions in the expanded query           |

The caps are module-level constants in
`backend/domain/tag_dsl_grammar.py`. They are hard-coded; if a
real workload demands different values, tune in place rather than
exposing as runtime configuration (per the design note's resolved
Q4).

The M cap is enforced **during** DNF distribution via a
running-count guard — a pathological input like a 10-virtual
conjunction with 5 disjuncts each (≈ 9.77M conjunctions) is
refused at 1025, never enumerated to completion.

## Worked examples

### Simple query

```
joseki, shape
```

Cards tagged with both `joseki` and `shape`.

### Negation

```
joseki, ~shape
```

Cards tagged `joseki` but not `shape`.

### Disjunction

```
joseki; opening; moyo
```

Cards tagged with any of `joseki`, `opening`, or `moyo`.

### Aliasing with a virtual tag

```
$opening_themes :- joseki; opening; moyo.
$opening_themes, ~volatile
```

Cards in any opening-themes tag, excluding those marked
`volatile`. Equivalent to writing the disjunction inline three
times in different queries — a one-line change to the definition
propagates.

### Exclusion in a definition

```
$tactic :- punish; fight; sabaki.
$blocked :- volatile.
$attack :- $tactic, ~$blocked.
$attack
```

`$attack` is "any tactic, except cards tagged `volatile`". Cards
matching `$attack` are exactly those with `punish`, `fight`, or
`sabaki` AND without `volatile`.

### Two-level reference

```
$shape_focus :- shape; contact.
$technical_shape :- $shape_focus; technical.
$technical_shape, ~volatile
```

`$technical_shape` expands transitively to
`shape; contact; technical`. The query AND's with `~volatile`.

### Parenthesised grouping (non-DNF input)

```
tag, (a; b)
```

`tag` AND (`a` OR `b`). The DNF normaliser distributes:

```
(tag, a); (tag, b)
```

Two subqueries UNIONed.

## Rationale (briefly)

**Substitutive macro, not flat-set.** Arc 1's flat-set design
could only ever broaden a definition — definitions were
monotone-additive. The substitutive macro language preserves the
full grammar tree, so negation and nested groupings compose
correctly across substitution.

**Lazy storage.** Definitions store the parsed AST with `Virtual`
references unresolved. The K cap performs an ephemeral
substitution at parse time to compute the effective leaf count
(and to enforce forward declaration). The query-time substitution
walks the same chain, so the D cap accumulates depth across
multi-definition chains rather than collapsing each step to a
single hop.

**De Morgan for ~$x.** A negated virtual reference is expanded
by walking the dual of its stored Disj. This composes cleanly
with the rest of the language — `~$x` is just shorthand for
"NOT (whatever `$x` expands to)", and the dual is computed
mechanically.

**Caps fire loudly.** Per ADR-0002, none of the caps truncate or
silently substitute partial results. A cap violation is a
`PipelineDSLError` with the offending count and the virtual at
fault, surfaced through `/pipelines` as a 422 with the compiler's
message.

**No wire-shape change.** The frontend sends a tag-DSL string;
the backend parses, compiles, and executes. The grammar is
strictly a backend concern — adding macro-language features
required no frontend coordination.

## Trying it out

`backend/scripts/tag_dsl_repl.py` is an interactive REPL for
experimenting with the DSL against a live database (SQLite or
Postgres, env-driven via `DATABASE_URI`). It compiles each
expression you type, shows the substituted definitions and the
DNF, runs the query, and prints the matched card count plus a
sample of IDs. See the script's `--help` for options.

## See also

- `backend/domain/tag_dsl_grammar.py` — grammar, AST,
  substitution, DNF normalisation, caps.
- `backend/repositories/tag_dsl_sql.py` — SQL emission for the
  per-conjunction subqueries.
- `backend/repositories/tag_filter_repository.py` — the adapter
  that wraps the compiled SQL with the tenancy filter.
- `docs/archive/notes/tag-dsl-macro-language-plan.md` — the
  planning-time design note (motivation, DoS analysis, cap
  calibration, the arc-1 / arc-2 implementation plan).
  `docs/worklog/2026-05-12-tag-dsl-macro-language.md` is the
  companion "what shipped" record.
- `docs/card-tag-stats-representative.md` — the test-expression
  bank (T1–T22 + S1–S5) driving the arc-2 test suite, with
  predicted cardinalities against a real-DB snapshot.
- `backend/docs/tree-dsl.md` — sibling reference for the
  pipeline DSL (the larger language the tag DSL is embedded in
  via the `select` stage).

License: Public Domain (The Unlicense).
