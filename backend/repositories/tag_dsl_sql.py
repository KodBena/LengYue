"""
repositories/tag_dsl_sql.py

Tag-DSL SQL emitter — turns the pre-SQL DNF produced by
`domain.tag_dsl_grammar.TagDSLGrammar` into a SQLAlchemy `Select`
that returns card ids satisfying the expression.

Before the tag-DSL macro-language arc 1 split, the SQL emission
lived in `domain/tag_dsl.py` alongside the parser, in violation of
the Dependency Rule (`domain/` does not import SQLAlchemy). Arc 1
relocated the SQL half here; the pure half lives in
`domain/tag_dsl_grammar.py`. Arc 2 replaced the flat-set
dereference inside the grammar with a substitutive macro expander
operating over a small AST, plus three caps (K / D / M). The SQL
emission itself is unchanged from arc 1 — it consumes the same
`{pos: Set[str], neg: Set[str]}` DNF conjunction shape — but the
orchestration in `compile_to_subquery` adapts to the new grammar
contract: `_parse_query` now returns a `Disj` AST,
`_expand_to_dnf` replaces the old `_expand_conjunction` loop, and
the M cap fires here before any SQL is emitted.

Surface
-------
`TagDSLCompiler(TagDSLGrammar)` is the class production code
consumes. It inherits the grammar state (`self.definitions`) and
the new grammar methods (`_split_statements`,
`_parse_definition`, `_parse_query`, `_expand_to_dnf`) from the
base class and adds:

  - `compile_to_subquery(expression)`: top-level orchestration.
    Splits statements, parses each definition (K + D caps fire
    inside), parses the query into a Disj, expands to DNF (D cap
    fires inside), applies the M cap, emits one
    `_conjunction_to_sql` per expanded conjunction, and `UNION`s
    the result. Raises `PipelineDSLError` on an empty expression
    or on a final-statement expansion that yields zero
    conjunctions (the D-8 fail-loud guard).
  - `_conjunction_to_sql(conj)`: builds a single subquery for one
    concrete-only conjunction. Positive set: `card_tag JOIN tag`
    filtered on the positive tag names with
    `GROUP BY card_id HAVING COUNT(*) = len(pos)`; negative set
    (if present) `EXCEPT`-ed from the positive set.

Tenancy
-------
This compiler is intentionally tenancy-agnostic — it emits a
`SELECT card_id` over the tag-membership tables. The
`TagFilterRepository` adapter wraps the compiled subquery in an
outer `SELECT card.id WHERE card.id IN (...) AND card.user_id =
:user_id` to apply the tenant filter (item 16). The compiler
itself stays general so tests can exercise it without a tenant
context.

Failure mode
------------
Every detectable malformation raises `PipelineDSLError`. The
defensive guard inside `compile_to_subquery` for the
"no conjunctions" case is load-bearing: it would otherwise be
unreachable for well-formed input, but it pins the D-8
fail-loud contract against future changes that might widen the
grammar in a way that produces an empty expansion.

License: Public Domain (The Unlicense)
"""
from typing import Dict, Set

from sqlalchemy import func, select, union
from sqlalchemy.sql import Select

from db.schema import card, card_tag, tag
from domain.errors import PipelineDSLError
from domain.tag_dsl_grammar import TagDSLGrammar


class TagDSLCompiler(TagDSLGrammar):
    def compile_to_subquery(self, expression: str) -> Select:
        statements = self._split_statements(expression)
        if not statements:
            raise PipelineDSLError("Empty tag expression")

        for defn in statements[:-1]:
            self._parse_definition(defn)

        query_expr = statements[-1]
        query_disj = self._parse_query(query_expr)
        # `_expand_to_dnf` fires the M cap inline during distribution
        # via a running-count guard — the cap kicks in before any
        # large intermediate list materialises, so a pathological
        # input (e.g. 5¹⁰ ≈ 9.77M conjunctions from the stats doc's
        # S1 stress case) is refused without enumerating it. No
        # post-DNF M check is needed at this layer.
        expanded_conjunctions = self._expand_to_dnf(query_disj)

        subqueries = []
        for conj in expanded_conjunctions:
            subqueries.append(self._conjunction_to_sql(conj))

        if not subqueries:
            # Defensive: should be unreachable if the query parser produces at
            # least one conjunction for a non-empty final statement. Keep as a
            # loud error rather than silently returning no rows.
            raise PipelineDSLError(
                f"Tag expression produced no conjunctions: {query_expr!r}"
            )
        if len(subqueries) == 1:
            return subqueries[0]

        return union(*subqueries)

    def _conjunction_to_sql(self, conj: Dict[str, Set[str]]) -> Select:
        final_pos = conj["pos"]
        final_neg = conj["neg"]

        if final_pos:
            pos_query = (
                select(card_tag.c.card_id.label("card_id"))
                .join(tag, card_tag.c.tag_id == tag.c.id)
                .where(tag.c.name.in_(final_pos))
                .group_by(card_tag.c.card_id)
                .having(func.count(tag.c.id) == len(final_pos))
            )
        else:
            pos_query = select(card.c.id.label("card_id"))

        if not final_neg:
            sq = pos_query.subquery()
            return select(sq.c.card_id)

        neg_query = (
            select(card_tag.c.card_id.label("card_id"))
            .join(tag, card_tag.c.tag_id == tag.c.id)
            .where(tag.c.name.in_(final_neg))
        )

        sq = pos_query.except_(neg_query).subquery()
        return select(sq.c.card_id)
