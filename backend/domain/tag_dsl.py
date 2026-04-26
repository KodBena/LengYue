import re
from typing import Dict, List, Set

from sqlalchemy import func, select, union
from sqlalchemy.sql import Select

from db.schema import card, card_tag, tag
from domain.errors import PipelineDSLError


class TagDSLCompiler:
    def __init__(self):
        self.definitions: Dict[str, Set[str]] = {}

    def compile_to_subquery(self, expression: str) -> Select:
        statements = self._split_statements(expression)
        if not statements:
            raise PipelineDSLError("Empty tag expression")

        for defn in statements[:-1]:
            self._parse_definition(defn)

        query_expr = statements[-1]
        conjunctions = self._parse_query(query_expr)

        expanded_conjunctions = []
        for conj in conjunctions:
            expanded_conjunctions.extend(self._expand_conjunction(conj))

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
