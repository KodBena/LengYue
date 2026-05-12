"""
domain/tag_dsl_grammar.py

Tag-DSL grammar — pure parser, virtual-tag dereferencer, and DNF
normaliser. The half of the tag DSL that has no SQL concern.

Before the tag-DSL macro-language arc 1 split, this logic lived in
`domain/tag_dsl.py` alongside the SQL emitter. The colocation
violated the Dependency Rule — `domain/` was importing
`sqlalchemy` and `db.schema` — and the rough-edge had been carried
in `docs/notes/reflection.md` since the pre-release sweep. Arc 1
splits the two concerns along the import boundary: this module
keeps the pure half in `domain/`; the SQL emitter moves to
`repositories/tag_dsl_sql.py`; `domain/tag_dsl.py` becomes a thin
facade re-exporting `TagDSLCompiler` so existing call sites stay
unchanged.

Surface
-------
`TagDSLGrammar` is the base class. It carries the parse state
(`self.definitions: Dict[str, Set[str]]`) and four methods that
together implement the tag DSL's pre-SQL pipeline:

  - `_split_statements(expression)`: split on `.` (period); every
    non-final statement is a virtual-tag definition, the final
    statement is the query.
  - `_parse_definition(defn)`: parse `$name :- t1;t2;$ref;...`,
    dereference any `$ref` by flat-merging the referenced
    definition's concrete set, store the result in
    `self.definitions`.
  - `_parse_query(query)`: split on `[;\\n]+` (OR), then on `,`
    (AND); produce DNF as `List[Dict[str, Set[str]]]` with keys
    `pos` and `neg`.
  - `_expand_conjunction(conj)`: distribute positive virtuals
    multiplicatively (K^N for N virtuals of K disjuncts each),
    flat-merge negative virtuals into the conjunction's negative
    set, return the expanded list of concrete-only conjunctions.

`TagDSLCompiler` in `repositories/tag_dsl_sql.py` subclasses this
class and adds `compile_to_subquery` + `_conjunction_to_sql`.
Subclassing preserves bit-equal behaviour for callers that touch
the underscored methods directly (the unit test suite at
`tests/unit/test_tag_dsl_pure.py` does so deliberately).

Failure mode
------------
Every detectable malformation raises `PipelineDSLError` (a
subclass of `InvalidInputError`; the route layer maps to 422).
Per ADR-0002: silent coercion or fallback-to-empty is not the
shape used here. The two historical silent failures (D-7
definition-as-last-statement, D-8 empty-virtual-tag compile) were
closed during the pre-release sweep and are pinned by regression
tests in the unit suite.

License: Public Domain (The Unlicense)
"""
import re
from typing import Dict, List, Set

from domain.errors import PipelineDSLError


class TagDSLGrammar:
    def __init__(self):
        self.definitions: Dict[str, Set[str]] = {}

    def _split_statements(self, expression: str) -> List[str]:
        expression = expression.strip()
        if expression.endswith('.'):
            expression = expression[:-1]
        return [p.strip() for p in expression.split('.') if p.strip()]

    def _parse_definition(self, defn: str):
        # Allow empty definition body via .* (was .+ in legacy).
        match = re.match(r'\$(\w+)\s*:-\s*(.*)', defn, re.DOTALL)
        if not match:
            # Item 12 / philosophy extension: previously this silently returned,
            # which meant a query expression accidentally placed before the
            # final statement was discarded with no diagnostic. Now it raises
            # so the author sees exactly what was rejected.
            raise PipelineDSLError(
                f"Statement is not a valid virtual tag definition "
                f"(expected '$name :- tag1;tag2;...'): {defn!r}"
            )
        name, tags_str = match.groups()
        raw_tags = {t.strip() for t in re.split(r'[;\n]+', tags_str) if t.strip()}

        expanded_tags = set()
        for t in raw_tags:
            if t.startswith('~'):
                raise PipelineDSLError(
                    f"Negation not allowed in virtual tag definitions: {t!r} "
                    f"(in definition of ${name})"
                )
            if t.startswith('$'):
                ref_name = t[1:]
                if ref_name not in self.definitions:
                    raise PipelineDSLError(
                        f"Virtual tag '${ref_name}' referenced before definition "
                        f"(in definition of ${name})"
                    )
                expanded_tags.update(self.definitions[ref_name])
            else:
                expanded_tags.add(t)

        self.definitions[name] = expanded_tags

    def _parse_query(self, query: str) -> List[Dict[str, Set[str]]]:
        or_parts = [p.strip() for p in re.split(r'[;\n]+', query) if p.strip()]
        dnf = []
        for part in or_parts:
            terms = [t.strip() for t in part.split(',') if t.strip()]
            pos = {t for t in terms if not t.startswith('~')}
            neg = {t[1:] for t in terms if t.startswith('~')}
            dnf.append({"pos": pos, "neg": neg})
        return dnf

    def _expand_conjunction(self, conj: Dict[str, Set[str]]) -> List[Dict[str, Set[str]]]:
        concrete_pos = {t for t in conj["pos"] if not t.startswith('$')}
        virtual_pos = {t[1:] for t in conj["pos"] if t.startswith('$')}
        concrete_neg = {t for t in conj["neg"] if not t.startswith('$')}
        virtual_neg = {t[1:] for t in conj["neg"] if t.startswith('$')}

        pos_expansions = [concrete_pos]
        for virt in virtual_pos:
            if virt not in self.definitions:
                raise PipelineDSLError(f"Unknown virtual tag in query: ${virt}")
            new_expansions = []
            for expansion in pos_expansions:
                for concrete_tag in self.definitions[virt]:
                    new_expansions.append(expansion | {concrete_tag})
            pos_expansions = new_expansions

        neg_expansion = set(concrete_neg)
        for virt in virtual_neg:
            if virt not in self.definitions:
                raise PipelineDSLError(f"Unknown virtual tag in query: ${virt}")
            neg_expansion.update(self.definitions[virt])

        return [{"pos": pos, "neg": neg_expansion} for pos in pos_expansions]
