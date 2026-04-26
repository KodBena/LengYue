"""
tests/unit/test_tag_dsl_pure.py
================================
Tier 1 — Pure Python Unit Tests: ``TagDSLCompiler`` parsing and DNF expansion.

No database.  No async.  No SQLAlchemy execution.

Strategy
--------
The ``TagDSLCompiler`` is tested at two sub-levels:

  1. **Parser-level** — ``_split_statements``, ``_parse_definition``,
     ``_parse_query``:  Do tokens get split correctly?  Do virtual tag
     definitions accumulate in ``self.definitions`` correctly?

  2. **Algebraic DNF expansion** — ``_expand_conjunction``:
     Does the distributive law hold?  Does negation of a virtual tag expand
     into the flat negation set?

  3. **Compile-time error detection** — ``compile_to_subquery`` on inputs that
     must raise ``ValueError``.

  4. **SQL structure checks** — without executing SQL, we compile a Select
     object and inspect its string form to verify structural properties
     (HAVING clause presence, EXCEPT clause, etc.).

Known Defects Documented Here
------------------------------
- D-7: A statement that looks like a definition ``$X :- a`` passed as the
        *last* statement is silently treated as a query tag name.
- D-8: An empty virtual tag definition ``$X :-`` (no tags) causes a *silent*
        match-nothing for positive queries using ``$X``.
"""
import re
import pytest

from domain.tag_dsl import TagDSLCompiler

pytestmark = pytest.mark.unit


# ─── _split_statements ────────────────────────────────────────────────────────

class TestSplitStatements:
    def test_single_query_no_period(self):
        c = TagDSLCompiler()
        result = c._split_statements("attack")
        assert result == ["attack"]

    def test_single_query_with_trailing_period(self):
        """A trailing period is a statement separator and must be stripped."""
        c = TagDSLCompiler()
        result = c._split_statements("attack.")
        assert result == ["attack"]

    def test_definition_and_query(self):
        c = TagDSLCompiler()
        result = c._split_statements("$fight :- attack;defense. $fight")
        assert len(result) == 2
        assert result[0].startswith("$fight")
        assert result[1] == "$fight"

    def test_multiple_definitions_and_query(self):
        c = TagDSLCompiler()
        result = c._split_statements("$a :- x. $b :- y. $a;$b")
        assert len(result) == 3

    def test_empty_string_returns_empty_list(self):
        c = TagDSLCompiler()
        result = c._split_statements("   ")
        assert result == []

    def test_whitespace_only_segments_are_skipped(self):
        c = TagDSLCompiler()
        result = c._split_statements("attack.  .defense")
        # The middle empty segment must be dropped.
        assert "" not in result
        assert len(result) == 2


# ─── _parse_definition ────────────────────────────────────────────────────────

class TestParseDefinition:
    def test_simple_single_tag_definition(self):
        c = TagDSLCompiler()
        c._parse_definition("$atk :- attack")
        assert c.definitions == {"atk": {"attack"}}

    def test_or_definition_semicolon(self):
        c = TagDSLCompiler()
        c._parse_definition("$fight :- attack;defense")
        assert c.definitions == {"fight": {"attack", "defense"}}

    def test_or_definition_newline(self):
        c = TagDSLCompiler()
        c._parse_definition("$fight :- attack\ndefense")
        assert c.definitions == {"fight": {"attack", "defense"}}

    def test_transitive_expansion_forward_reference_fails(self):
        """
        DNF-5: Forward reference — $B references $A before $A is defined.
        Must raise ValueError.
        """
        c = TagDSLCompiler()
        with pytest.raises(ValueError, match=r"\$A"):
            c._parse_definition("$B :- $A;extra")  # $A not yet in definitions

    def test_transitive_expansion_backward_reference_succeeds(self):
        """
        DNF-3: $B :- $A;y  AFTER $A :- x  must expand $B = {x, y}.
        """
        c = TagDSLCompiler()
        c._parse_definition("$A :- x")
        c._parse_definition("$B :- $A;y")
        assert c.definitions["B"] == {"x", "y"}

    def test_negation_in_definition_raises(self):
        """DNF-4: Negation (~) inside a virtual tag definition is forbidden."""
        c = TagDSLCompiler()
        with pytest.raises(ValueError, match=r"Negation not allowed"):
            c._parse_definition("$X :- attack;~defense")

    def test_non_matching_string_is_silently_ignored(self):
        """
        _parse_definition returns without modifying state if the string
        does not match the ':-' definition pattern.
        """
        c = TagDSLCompiler()
        c._parse_definition("just_a_query_not_a_definition")
        assert c.definitions == {}

    def test_definition_tags_are_deduplicated(self):
        """Duplicate tags in a definition should not appear twice."""
        c = TagDSLCompiler()
        c._parse_definition("$dup :- tag_a;tag_a;tag_a")
        assert c.definitions["dup"] == {"tag_a"}


# ─── _parse_query ─────────────────────────────────────────────────────────────

class TestParseQuery:
    def test_single_positive_tag(self):
        c = TagDSLCompiler()
        dnf = c._parse_query("attack")
        assert len(dnf) == 1
        assert dnf[0] == {"pos": {"attack"}, "neg": set()}

    def test_and_semantics_comma(self):
        """Comma → AND: both tags must appear in the positive set."""
        c = TagDSLCompiler()
        dnf = c._parse_query("attack,hard")
        assert len(dnf) == 1
        assert dnf[0]["pos"] == {"attack", "hard"}
        assert dnf[0]["neg"] == set()

    def test_or_semantics_semicolon(self):
        """Semicolon → OR: two separate conjunctions."""
        c = TagDSLCompiler()
        dnf = c._parse_query("attack;defense")
        assert len(dnf) == 2
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert frozenset({"attack"}) in pos_sets
        assert frozenset({"defense"}) in pos_sets

    def test_negation_prefix(self):
        """~tag_name is extracted into the neg set."""
        c = TagDSLCompiler()
        dnf = c._parse_query("attack,~contact_play")
        assert len(dnf) == 1
        assert dnf[0]["pos"] == {"attack"}
        assert dnf[0]["neg"] == {"contact_play"}

    def test_negation_only_query(self):
        """A query with only negations and no positives."""
        c = TagDSLCompiler()
        dnf = c._parse_query("~snark")
        assert len(dnf) == 1
        assert dnf[0]["pos"] == set()
        assert dnf[0]["neg"] == {"snark"}

    def test_mixed_or_and_and_negation(self):
        """attack,~bad;defense → two conjunctions."""
        c = TagDSLCompiler()
        dnf = c._parse_query("attack,~bad;defense")
        assert len(dnf) == 2


# ─── _expand_conjunction ──────────────────────────────────────────────────────

class TestExpandConjunction:
    """
    Tests for the DNF (Disjunctive Normal Form) expansion of virtual tags.
    These are the algebraic core of the filter DSL.
    """

    def _compiler_with(self, definitions: dict) -> TagDSLCompiler:
        """Helper: build a compiler pre-loaded with definitions."""
        c = TagDSLCompiler()
        c.definitions = {k: set(v) for k, v in definitions.items()}
        return c

    def test_dnf1_distributive_law_single_virtual_pos(self):
        """
        DNF-1: $fight,c  where $fight = {attack, defense}
        Expands to: [{pos:{attack,c}, neg:{}}, {pos:{defense,c}, neg:{}}]

        This is the distributive law: AND distributes over the OR of a
        virtual tag's members.
        """
        c = self._compiler_with({"fight": ["attack", "defense"]})
        conj = {"pos": {"$fight", "c"}, "neg": set()}
        result = c._expand_conjunction(conj)

        assert len(result) == 2
        pos_sets = {frozenset(r["pos"]) for r in result}
        assert frozenset({"attack", "c"}) in pos_sets
        assert frozenset({"defense", "c"}) in pos_sets
        # All neg sets must be empty.
        assert all(r["neg"] == set() for r in result)

    def test_dnf2_negation_of_virtual_tag_collapses_to_neg_set(self):
        """
        DNF-2: ~$fight  where $fight = {attack, defense}
        Expands to ONE conjunction: {pos:{}, neg:{attack, defense}}

        Negated virtual tags must expand ALL their members into the flat
        negation set, NOT into OR branches.  DeMorgan does not apply here —
        the semantics are "card must not have any member of $fight".
        """
        c = self._compiler_with({"fight": ["attack", "defense"]})
        conj = {"pos": set(), "neg": {"$fight"}}
        result = c._expand_conjunction(conj)

        assert len(result) == 1
        assert result[0]["pos"] == set()
        assert result[0]["neg"] == {"attack", "defense"}

    def test_dnf1_two_independent_virtual_positives_cartesian_product(self):
        """
        $A,$B where $A={a1,a2} and $B={b1,b2}
        Expands to 4 conjunctions: all (aX,bY) pairs.
        """
        c = self._compiler_with({"A": ["a1", "a2"], "B": ["b1", "b2"]})
        conj = {"pos": {"$A", "$B"}, "neg": set()}
        result = c._expand_conjunction(conj)

        assert len(result) == 4
        pos_sets = {frozenset(r["pos"]) for r in result}
        for a in ("a1", "a2"):
            for b in ("b1", "b2"):
                assert frozenset({a, b}) in pos_sets, (
                    f"Missing conjunction ({a}, {b})"
                )

    def test_negated_virtual_merges_with_concrete_negations(self):
        """
        attack,~$bad,~extra  where $bad={x,y}
        neg set must be {x, y, extra}.
        """
        c = self._compiler_with({"bad": ["x", "y"]})
        conj = {"pos": {"attack"}, "neg": {"$bad", "extra"}}
        result = c._expand_conjunction(conj)

        assert len(result) == 1
        assert result[0]["neg"] == {"x", "y", "extra"}
        assert result[0]["pos"] == {"attack"}

    def test_concrete_only_conjunction_is_identity(self):
        """
        A conjunction with no virtual tags passes through _expand_conjunction
        unchanged (wrapped in a list of length 1).
        """
        c = TagDSLCompiler()
        conj = {"pos": {"attack", "hard"}, "neg": {"easy"}}
        result = c._expand_conjunction(conj)

        assert len(result) == 1
        assert result[0] == conj

    def test_unknown_positive_virtual_tag_raises(self):
        """DNF-6: A virtual tag in the query that was never defined."""
        c = TagDSLCompiler()
        conj = {"pos": {"$undefined"}, "neg": set()}
        with pytest.raises(ValueError, match=r"\$undefined"):
            c._expand_conjunction(conj)

    def test_unknown_negative_virtual_tag_raises(self):
        c = TagDSLCompiler()
        conj = {"pos": set(), "neg": {"$undefined"}}
        with pytest.raises(ValueError, match=r"\$undefined"):
            c._expand_conjunction(conj)


# ─── compile_to_subquery — error paths ────────────────────────────────────────

class TestCompileToSubqueryErrors:
    def test_empty_expression_raises_value_error(self):
        """DNF-7: An empty tag expression has no meaningful query."""
        c = TagDSLCompiler()
        with pytest.raises(ValueError):
            c.compile_to_subquery("")

    def test_whitespace_only_expression_raises_value_error(self):
        c = TagDSLCompiler()
        with pytest.raises(ValueError):
            c.compile_to_subquery("   ")

    def test_negation_in_definition_raises_during_compile(self):
        """DNF-4: compile_to_subquery must surface the negation-in-def error."""
        c = TagDSLCompiler()
        with pytest.raises(ValueError, match=r"Negation not allowed"):
            c.compile_to_subquery("$X :- attack;~defense. $X")

    def test_forward_reference_raises_during_compile(self):
        """DNF-5: referencing an undefined virtual tag raises ValueError."""
        c = TagDSLCompiler()
        with pytest.raises(ValueError):
            c.compile_to_subquery("$B :- $A. $A :- x. $B")

    def test_unknown_virtual_tag_in_query_raises(self):
        c = TagDSLCompiler()
        with pytest.raises(ValueError, match=r"\$ghost"):
            c.compile_to_subquery("$ghost")

    def test_full_pipeline_valid_expression_does_not_raise(self):
        """
        Smoke test: a well-formed expression must compile without error.
        We do not execute the SQL — we only verify that compilation succeeds.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("$fight :- attack;defense. $fight,~contact_play")
        assert stmt is not None


# ─── SQL Structure Tests ──────────────────────────────────────────────────────
# These tests compile Select objects and inspect the generated SQL string.
# No database required.

class TestCompiledSQLStructure:
    @staticmethod
    def _sql(stmt) -> str:
        """Render a SQLAlchemy statement to a SQL string without a dialect."""
        return str(stmt.compile(compile_kwargs={"literal_binds": True}))

    def test_positive_and_generates_having_clause(self):
        """
        A positive AND query (attack,hard) must produce a HAVING COUNT == 2
        clause to ensure both tags are present on the same card.

        Without HAVING, a card with only 'attack' would incorrectly match.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("attack,hard")
        sql = self._sql(stmt)
        assert "HAVING" in sql.upper(), (
            "AND semantics require a HAVING count() == N clause"
        )

    def test_single_positive_tag_generates_having_count_1(self):
        """
        A single-tag query must still use HAVING COUNT == 1.
        This prevents phantom matches from duplicate card_tag rows.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("attack")
        sql = self._sql(stmt)
        assert "HAVING" in sql.upper()

    def test_negation_only_query_generates_except_or_not_in(self):
        """
        ~snark: must generate an EXCEPT or NOT IN construct.
        The pos_query is SELECT all cards; neg_query selects cards with snark.
        The result is all cards minus those with snark.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("~snark")
        sql = self._sql(stmt)
        assert "EXCEPT" in sql.upper() or "NOT IN" in sql.upper(), (
            "Negation-only query must use EXCEPT or NOT IN to exclude tagged cards"
        )

    def test_or_query_generates_union(self):
        """
        attack;defense must generate UNION ALL (or UNION) of two subqueries.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("attack;defense")
        sql = self._sql(stmt)
        assert "UNION" in sql.upper(), (
            "OR semantics must produce a UNION of subqueries"
        )

    def test_virtual_tag_expansion_generates_union_of_concrete_tags(self):
        """
        $fight :- attack;defense. $fight
        Must expand to a UNION of two queries: one for 'attack', one for 'defense'.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("$fight :- attack;defense. $fight")
        sql = self._sql(stmt)
        assert "UNION" in sql.upper()
        # Both concrete tag names must appear in the SQL.
        assert "attack" in sql
        assert "defense" in sql

    def test_having_count_matches_number_of_required_positive_tags(self):
        """
        attack,hard,opening (3 tags) → HAVING count(...) == 3.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("attack,hard,opening")
        sql = self._sql(stmt)
        # The number 3 must appear in a HAVING clause context.
        assert "3" in sql and "HAVING" in sql.upper()


# ─── Documented Silent Failure Tests ──────────────────────────────────────────
# These tests document current INCORRECT behaviour that does not raise an error.
# They are not marked xfail — they pass by asserting the buggy behaviour,
# making the bug visible and preventing it from silently changing.

class TestSilentFailures:
    def test_D7_definition_as_last_statement_is_misinterpreted(self):
        """
        D-7: If the LAST statement looks like a definition (contains ':-'),
        it is passed to _parse_query() instead of _parse_definition().

        _parse_query does NOT recognise the ':-' syntax and treats the entire
        string as a single tag name.  This produces a Select that filters
        for cards tagged with the literal string "$X :- a", which will never
        match any real tag.

        The expression "$X :- a" (no trailing period, single statement) should
        raise ValueError or be treated as a definition error.  Instead, it
        silently produces a semantically meaningless query.

        This test documents the current behaviour.  When fixed, this test
        must be updated to assert a ValueError instead.
        """
        c = TagDSLCompiler()
        # No period → single statement → passed to _parse_query.
        # _parse_query returns [{pos: {"$X :- a"}, neg: {}}]
        # This contains a virtual tag reference "$X" but also extra chars,
        # OR it is treated as a literal tag name.  Either way it's wrong.
        #
        # We verify that NO ValueError is raised (the silent failure mode).
        try:
            stmt = c.compile_to_subquery("$X :- a")
            # If we reach here, no error was raised — the bug is present.
            # The statement must still be a Select object (not None or an error).
            assert stmt is not None, "Should produce some Select statement"
        except ValueError:
            pytest.fail(
                "D-7: A definition-as-last-statement now raises ValueError. "
                "Good! Update this test to assert the ValueError instead."
            )

    def test_D8_empty_virtual_tag_silently_matches_nothing(self):
        """
        D-8: An empty virtual tag definition ($X :- with no tags after ':-')
        produces self.definitions['X'] = set().

        When $X appears as a POSITIVE requirement in the query,
        _expand_conjunction iterates over an empty set and produces NO
        expanded conjunctions for that OR branch.  The effect is that the
        entire OR clause silently disappears, matching no cards.

        This is a silent correctness failure: the user gets zero results with
        no error message, which is indistinguishable from "no cards match."
        """
        c = TagDSLCompiler()
        # Manually inject an empty definition (simulating "$X :- ." or "$X :- ;;")
        c.definitions["empty"] = set()

        conj = {"pos": {"$empty"}, "neg": set()}
        result = c._expand_conjunction(conj)

        # The bug: zero conjunctions are returned for a positive virtual tag
        # whose definition is empty.  A correct implementation might raise
        # ValueError("Empty virtual tag definition") or return a match-all.
        assert result == [], (
            "D-8 confirmed: empty virtual tag definition produces zero conjunctions. "
            "When fixed, update this test to assert the correct behaviour."
        )

    def test_D8_empty_virtual_tag_via_compile_does_not_raise(self):
        """
        D-8 end-to-end: compiling "$X :- . $X" (empty definition) produces a
        Select that returns zero cards, silently.
        """
        c = TagDSLCompiler()
        # "$X :- " with nothing after :- → raw_tags is empty → definitions['X'] = set()
        # The query "$X" then finds zero conjunctions → falls through to
        # select(card.c.id).where(False)
        stmt = c.compile_to_subquery("$X :- . $X")
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        # No error was raised.  The SQL likely contains WHERE false or is empty.
        assert stmt is not None, "Should not raise, but produces a semantically empty query"
