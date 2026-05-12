"""
tests/unit/test_tag_dsl_pure.py
================================
Tier 1 — Pure Python Unit Tests: tag-DSL grammar, AST, macro
expander, three caps (K / D / M), and the closed-defect
regressions.

No database. No async. No SQLAlchemy execution.

Strategy
--------
Arc 2 of the tag-DSL macro-language plan replaced the flat-set
virtual-tag model with a substitutive macro expander over a small
AST. These tests pin:

  1. **AST construction** — ``_parse_definition`` stores a
     parsed ``Disj`` (not a flat ``Set[str]``); ``_parse_query``
     returns a ``Disj``. The parser admits the full new grammar
     including negation in definitions and parenthesised
     sub-expressions.

  2. **Macro expansion** — ``_expand_to_dnf`` substitutes
     references (D cap), pushes negation inward via De Morgan
     when appropriate, distributes nested groupings, and
     returns the flat DNF-dict shape the SQL emitter consumes.

  3. **Cap guards** — K (definition body length), D (recursion
     depth), and M (total expansion size) each raise
     ``PipelineDSLError`` at the correct phase with messages
     naming the cap, the offending count, and the virtual at
     fault.

  4. **SQL structure (smoke)** — compile a Select and inspect
     its string form to verify structural properties (HAVING,
     EXCEPT, UNION).

  5. **Closed-defect regressions** — D-7 and D-8 from the
     pre-release sweep stay pinned through the compile boundary.

Failure-mode-first: cap-violation classes appear before
happy-path expansion classes in source order, per the testing-arc
discipline named in ``docs/notes/test-coverage-2026-05.md``.

Stats-doc test bank
-------------------
The test cases are driven by the empirical bank in
``docs/card-tag-stats-representative.md``. Case labels (T1-T22,
S1-S5) trace back to that document's §2.1-§2.6.
"""
import pytest

from domain.errors import PipelineDSLError
from domain.tag_dsl import TagDSLCompiler
from domain.tag_dsl_grammar import (
    MAX_DEFINITION_LEAVES,
    MAX_REFERENCE_DEPTH,
    MAX_TOTAL_CONJUNCTIONS,
    Concrete,
    Conj,
    Disj,
    Neg,
    Virtual,
)

pytestmark = pytest.mark.unit


# ─── AST helpers ──────────────────────────────────────────────────────────────


def _concrete(name: str) -> Concrete:
    return Concrete(name=name)


def _virtual(name: str) -> Virtual:
    return Virtual(name=name)


def _neg(term) -> Neg:
    return Neg(term=term)


def _conj(*atoms) -> Conj:
    return Conj(atoms=tuple(atoms))


def _disj(*conjs) -> Disj:
    return Disj(conjs=tuple(conjs))


# ─── _split_statements (unchanged from arc 1) ─────────────────────────────────


class TestSplitStatements:
    def test_single_query_no_period(self):
        c = TagDSLCompiler()
        assert c._split_statements("attack") == ["attack"]

    def test_single_query_with_trailing_period(self):
        c = TagDSLCompiler()
        assert c._split_statements("attack.") == ["attack"]

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
        assert c._split_statements("   ") == []

    def test_whitespace_only_segments_are_skipped(self):
        c = TagDSLCompiler()
        result = c._split_statements("attack.  .defense")
        assert "" not in result
        assert len(result) == 2


# ─── Failure mode first: cap-K violations (definition body length) ────────────


class TestCapK:
    """The K cap fires inside ``_parse_definition`` after the body has
    been substituted to concrete leaves. Refuses if leaf count > K.
    """

    def test_T15_definition_at_K_minus_epsilon_is_accepted(self):
        """T15: 250 concrete leaves; below K = 256. Must parse."""
        body = ";".join(f"t{i}" for i in range(250))
        c = TagDSLCompiler()
        c._parse_definition(f"$wide :- {body}")
        # The Disj carries 250 conjs.
        assert len(c.definitions["wide"].conjs) == 250

    def test_T18_definition_at_K_plus_epsilon_raises(self):
        """T18: 260 leaves; above K = 256. Must raise with cap-name + count."""
        body = ";".join(f"t{i}" for i in range(260))
        c = TagDSLCompiler()
        with pytest.raises(PipelineDSLError) as exc:
            c._parse_definition(f"$wide :- {body}")
        assert "260" in str(exc.value)
        assert f"K={MAX_DEFINITION_LEAVES}" in str(exc.value)
        assert "$wide" in str(exc.value)

    def test_S2_K_overflow_with_real_tag_names(self):
        """S2 (sandbox-only stress): a single definition listing every
        concrete tag in the database (well above K = 256). Must raise
        at definition-parse time before any SQL is reached.
        """
        body = ";".join(f"real_tag_{i}" for i in range(290))
        c = TagDSLCompiler()
        with pytest.raises(PipelineDSLError, match=r"K=256"):
            c._parse_definition(f"$everything :- {body}")


# ─── Failure mode first: cap-D violations (recursion depth) ───────────────────


class TestCapD:
    """The D cap fires during substitution. The chain depth is the
    number of Virtual hops resolved before reaching a concrete shape.
    """

    def test_T17_chain_at_D_minus_epsilon_is_accepted(self):
        """T17: chain of 7 forward references, all resolving to
        ``joseki``. Depth 7, below D = 8.
        """
        c = TagDSLCompiler()
        c._parse_definition("$d1 :- joseki")
        c._parse_definition("$d2 :- $d1")
        c._parse_definition("$d3 :- $d2")
        c._parse_definition("$d4 :- $d3")
        c._parse_definition("$d5 :- $d4")
        c._parse_definition("$d6 :- $d5")
        c._parse_definition("$d7 :- $d6")
        # Compiles cleanly (no D-cap raise).
        stmt = c.compile_to_subquery(
            "$d1 :- joseki. $d2 :- $d1. $d3 :- $d2. $d4 :- $d3. "
            "$d5 :- $d4. $d6 :- $d5. $d7 :- $d6. $d7"
        )
        assert stmt is not None

    def test_T20_chain_at_D_plus_epsilon_raises(self):
        """T20: chain of 9 forward references. Depth 9, above D = 8.
        Must raise with cap-name + offending virtual.
        """
        defs = "\n".join(
            [f"$d1 :- joseki."]
            + [f"$d{i} :- $d{i - 1}." for i in range(2, 10)]
        )
        expr = defs + "\n$d9"
        with pytest.raises(PipelineDSLError) as exc:
            TagDSLCompiler().compile_to_subquery(expr)
        msg = str(exc.value)
        assert f"D={MAX_REFERENCE_DEPTH}" in msg
        assert "recursion depth cap" in msg

    def test_S3_D_overflow_with_long_synthetic_chain(self):
        """S3 (sandbox-only stress): 20-level forward reference chain.
        Must raise. Without D cap the recursion is unbounded and a
        fan-out variant would compound catastrophically.
        """
        defs = "$d1 :- joseki."
        for i in range(2, 21):
            defs += f" $d{i} :- $d{i - 1}."
        with pytest.raises(PipelineDSLError, match=rf"D={MAX_REFERENCE_DEPTH}"):
            TagDSLCompiler().compile_to_subquery(defs + " $d20")

    def test_S4_pathological_fan_out_exponential_cliff(self):
        """S4 (sandbox-only stress): the "exponential cliff". Each
        level structurally doubles by referencing the previous level
        twice (``$aN :- $a(N-1);$a(N-1)``). Must refuse before any
        catastrophic intermediate state materialises.

        Empirical observation under the arc-2 implementation: K
        fires first (at ``$a9``, leaf count = 2⁹ = 512 > K=256), not
        D. The stats doc anticipated D as the load-bearing cap on
        the assumption that the AST deduplicates identical Virtual
        references — under that assumption, leaves would stay at 2
        per level and D=8 would catch the chain depth first. The
        arc-2 implementation preserves duplicate references
        literally (the macro language is substitutive, not
        dedup-and-substitute), so leaves grow as 2^N and K fires
        first. Either refusal path is acceptable; the safety
        contract is "S4 is refused before any large intermediate
        list materialises", not "a specific cap is the trigger".
        """
        defs = "$a1 :- t1;t2."
        for i in range(2, 21):
            defs += f" $a{i} :- $a{i - 1};$a{i - 1}."
        with pytest.raises(
            PipelineDSLError,
            match=rf"(K={MAX_DEFINITION_LEAVES}|D={MAX_REFERENCE_DEPTH})",
        ):
            TagDSLCompiler().compile_to_subquery(defs + " $a20")


# ─── Failure mode first: cap-M violations (total expansion size) ──────────────


class TestCapM:
    """The M cap fires in ``compile_to_subquery`` after macro expansion
    + DNF normalisation, before any SQL is emitted.
    """

    def test_T16_expansion_at_M_minus_epsilon_is_accepted(self):
        """T16: 5 × 5 × 5 × 5 = 625 conjunctions; below M = 1024.
        Compiles cleanly.
        """
        defs = "\n".join(
            [
                "$a :- t1;t2;t3;t4;t5.",
                "$b :- t6;t7;t8;t9;t10.",
                "$c :- t11;t12;t13;t14;t15.",
                "$d :- t16;t17;t18;t19;t20.",
            ]
        )
        stmt = TagDSLCompiler().compile_to_subquery(defs + "\n$a, $b, $c, $d")
        assert stmt is not None

    def test_T19_expansion_at_M_plus_epsilon_raises(self):
        """T19: 5⁵ = 3125 conjunctions; above M = 1024. Must raise
        during DNF distribution before the full 3125 conjunctions
        materialise — the running-count guard fires as soon as the
        cap is crossed, so the exact final count is not computed
        (and intentionally so: for the S1 9.77M-conjunction case the
        same guard refuses without enumeration).
        """
        defs = "\n".join(
            [
                "$a :- t1;t2;t3;t4;t5.",
                "$b :- t6;t7;t8;t9;t10.",
                "$c :- t11;t12;t13;t14;t15.",
                "$d :- t16;t17;t18;t19;t20.",
                "$e :- t21;t22;t23;t24;t25.",
            ]
        )
        with pytest.raises(PipelineDSLError) as exc:
            TagDSLCompiler().compile_to_subquery(defs + "\n$a, $b, $c, $d, $e")
        msg = str(exc.value)
        assert f"M={MAX_TOTAL_CONJUNCTIONS}" in msg
        assert "total expansion size cap" in msg

    def test_S1_M_overflow_at_scale(self):
        """S1 (sandbox-only stress): 10-virtual conjunction where
        each virtual contains 5 disjuncts. 5¹⁰ ≈ 9.77M conjunctions.
        Must refuse via M cap before SQL emission.
        """
        defs_lines = []
        for letter_i, letter in enumerate("abcdefghij"):
            base = letter_i * 5
            defs_lines.append(
                f"${letter} :- " + ";".join(f"t{base + j + 1}" for j in range(5)) + "."
            )
        defs = "\n".join(defs_lines)
        query = ", ".join(f"${letter}" for letter in "abcdefghij")
        with pytest.raises(PipelineDSLError, match=rf"M={MAX_TOTAL_CONJUNCTIONS}"):
            TagDSLCompiler().compile_to_subquery(defs + "\n" + query)

    def test_S5_dense_disjunction_exceeds_M(self):
        """S5 (sandbox-only stress): a top-level disjunction of many
        small parenthesised conjunctions. Each disjunct contributes
        one conj to the final DNF; chaining many past M must refuse
        via the M cap during DNF distribution.

        Construct 1100 disjuncts each ``(a_i, b_i)``. 1100 > M=1024,
        so the running-count guard fires during distribution before
        the full DNF materialises.
        """
        disjuncts = [f"(a{i}, b{i})" for i in range(1100)]
        expr = ";".join(disjuncts)
        with pytest.raises(PipelineDSLError, match=rf"M={MAX_TOTAL_CONJUNCTIONS}"):
            TagDSLCompiler().compile_to_subquery(expr)


# ─── Failure mode first: error paths (T21 unknown virtual, T22 forward) ──────


class TestErrorPaths:
    def test_T21_unknown_virtual_in_query_raises(self):
        """T21: Query references an undefined virtual. Must raise."""
        with pytest.raises(PipelineDSLError, match=r"\$nonexistent"):
            TagDSLCompiler().compile_to_subquery("$nonexistent")

    def test_T22_forward_reference_order_violation_raises(self):
        """T22: $b references $a before $a is defined. The forward-
        declaration discipline is the cheap cycle preventer and is
        preserved post-arc-2.
        """
        with pytest.raises(PipelineDSLError, match=r"\$a"):
            TagDSLCompiler().compile_to_subquery(
                "$b :- $a;tag1. $a :- tag2;tag3. $b"
            )

    def test_empty_expression_raises(self):
        """An empty tag expression has no meaningful query."""
        with pytest.raises(PipelineDSLError):
            TagDSLCompiler().compile_to_subquery("")

    def test_whitespace_only_expression_raises(self):
        with pytest.raises(PipelineDSLError):
            TagDSLCompiler().compile_to_subquery("   ")

    def test_non_matching_string_in_definition_raises(self):
        """A statement before the final-query position that is not a
        valid definition raises with a name-the-rejected-content
        message (ADR-0002 fail-loudly).
        """
        c = TagDSLCompiler()
        with pytest.raises(PipelineDSLError, match=r"valid virtual tag definition"):
            c._parse_definition("just_a_query_not_a_definition")
        assert c.definitions == {}

    def test_negation_must_precede_a_simple_atom(self):
        """``~`` may only prefix a tag or virtual reference, not a
        parenthesised sub-expression. The current grammar accepts
        ``~tag`` and ``~$ref`` but not ``~(...)``.
        """
        with pytest.raises(PipelineDSLError, match=r"Negation"):
            TagDSLCompiler().compile_to_subquery("~(a, b)")

    def test_bare_dollar_raises(self):
        with pytest.raises(PipelineDSLError, match=r"Bare '\$'"):
            TagDSLCompiler().compile_to_subquery("$")


# ─── _parse_definition (happy paths) ──────────────────────────────────────────


class TestParseDefinition:
    def test_simple_single_tag_definition(self):
        c = TagDSLCompiler()
        c._parse_definition("$atk :- attack")
        assert c.definitions == {"atk": _disj(_conj(_concrete("attack")))}

    def test_or_definition_semicolon(self):
        c = TagDSLCompiler()
        c._parse_definition("$fight :- attack;defense")
        assert c.definitions == {
            "fight": _disj(
                _conj(_concrete("attack")),
                _conj(_concrete("defense")),
            )
        }

    def test_or_definition_newline(self):
        c = TagDSLCompiler()
        c._parse_definition("$fight :- attack\ndefense")
        assert c.definitions == {
            "fight": _disj(
                _conj(_concrete("attack")),
                _conj(_concrete("defense")),
            )
        }

    def test_T7_transitive_backward_reference_storage_is_lazy(self):
        """T7 (storage): ``$B :- $A;y`` after ``$A :- x``. Definitions
        store the parsed Disj with Virtual references intact (lazy
        substitution); the chain is walked at expansion time so the
        D cap accumulates depth across multi-definition chains.
        """
        c = TagDSLCompiler()
        c._parse_definition("$A :- x")
        c._parse_definition("$B :- $A;y")
        # $A has no refs to substitute, so its parsed form is
        # already concrete-only.
        assert c.definitions["A"] == _disj(_conj(_concrete("x")))
        # $B retains the Virtual("A") reference.
        assert c.definitions["B"] == _disj(
            _conj(_virtual("A")),
            _conj(_concrete("y")),
        )

    def test_T7_transitive_backward_reference_expands_correctly(self):
        """T7 (behaviour): a query through ``$B`` expands the chain
        to produce the concrete-tag DNF the SQL emitter consumes.
        """
        c = TagDSLCompiler()
        c._parse_definition("$A :- x")
        c._parse_definition("$B :- $A;y")
        dnf = c._expand_to_dnf(c._parse_query("$B"))
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {frozenset({"x"}), frozenset({"y"})}

    def test_empty_definition_body_stores_empty_disj(self):
        """An empty definition body stores a Disj with no conjs. The
        D-8 compile-boundary regression depends on this — a query
        through the empty virtual produces zero conjunctions, which
        the compile boundary loudly refuses.
        """
        c = TagDSLCompiler()
        c._parse_definition("$empty :- ")
        assert c.definitions["empty"] == _disj()


# ─── Negation in definitions — new at arc 2 ───────────────────────────────────


class TestNegationInDefinition:
    """T10: arc 2's flagship new-grammar capability. Negation inside a
    virtual-tag definition is now admitted and expanded substitutively.
    """

    def test_T10_negation_in_definition_parses(self):
        """``$X :- attack;~defense`` now parses; the stored Disj
        contains both ``Concrete(attack)`` and ``Neg(Concrete(defense))``.
        """
        c = TagDSLCompiler()
        c._parse_definition("$X :- attack;~defense")
        assert c.definitions["X"] == _disj(
            _conj(_concrete("attack")),
            _conj(_neg(_concrete("defense"))),
        )

    def test_T10_canonical_attack_example_compiles(self):
        """The design note's canonical example:
            $tactic :- punish;fight;sabaki.
            $blocked :- volatile.
            $attack :- $tactic;~$blocked.
            $attack
        compiles cleanly post-arc-2; pre-arc-2 it would raise
        "Negation not allowed in virtual tag definitions".
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery(
            "$tactic :- punish;fight;sabaki. "
            "$blocked :- volatile. "
            "$attack :- $tactic;~$blocked. "
            "$attack"
        )
        assert stmt is not None

    def test_negation_in_definition_expands_correctly(self):
        """``$attack :- $tactic;~$blocked`` queried as ``$attack``
        produces the union of ``$tactic`` disjuncts AND a single
        ``~blocked`` term.
        """
        c = TagDSLCompiler()
        c._parse_definition("$tactic :- punish;fight;sabaki")
        c._parse_definition("$blocked :- volatile")
        c._parse_definition("$attack :- $tactic;~$blocked")
        query_disj = c._parse_query("$attack")
        dnf = c._expand_to_dnf(query_disj)
        # Three positive conjs (punish / fight / sabaki) plus one
        # negative conj (~volatile).
        pos_conjs = [d for d in dnf if d["pos"]]
        neg_only = [d for d in dnf if not d["pos"] and d["neg"]]
        assert {next(iter(d["pos"])) for d in pos_conjs} == {"punish", "fight", "sabaki"}
        assert len(neg_only) == 1
        assert neg_only[0]["neg"] == {"volatile"}


# ─── Parentheses in the grammar — new at arc 2 ────────────────────────────────


class TestParentheses:
    """T13: parenthesised sub-expressions admitted per resolved Q1.
    The macro expander distributes nested groupings into DNF.
    """

    def test_T13_top_level_grouping_parses(self):
        """``(joseki, shape); (technical, opening)`` parses as a
        top-level disjunction of two conjunctions.
        """
        c = TagDSLCompiler()
        stmt = c.compile_to_subquery("(joseki, shape); (technical, opening)")
        assert stmt is not None

    def test_non_dnf_distributes(self):
        """``a, (b; c)`` is non-DNF input — the distributor flattens
        it to ``(a, b); (a, c)``.
        """
        c = TagDSLCompiler()
        disj = c._parse_query("a, (b; c)")
        dnf = c._expand_to_dnf(disj)
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {frozenset({"a", "b"}), frozenset({"a", "c"})}

    def test_nested_groupings_distribute(self):
        """``(a; b), (c; d)`` distributes to four DNF conjunctions."""
        c = TagDSLCompiler()
        disj = c._parse_query("(a; b), (c; d)")
        dnf = c._expand_to_dnf(disj)
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {
            frozenset({"a", "c"}),
            frozenset({"a", "d"}),
            frozenset({"b", "c"}),
            frozenset({"b", "d"}),
        }


# ─── _parse_query (Disj output) ───────────────────────────────────────────────


class TestParseQuery:
    def test_single_positive_tag(self):
        c = TagDSLCompiler()
        assert c._parse_query("attack") == _disj(_conj(_concrete("attack")))

    def test_and_semantics_comma(self):
        c = TagDSLCompiler()
        assert c._parse_query("attack,hard") == _disj(
            _conj(_concrete("attack"), _concrete("hard"))
        )

    def test_or_semantics_semicolon(self):
        c = TagDSLCompiler()
        assert c._parse_query("attack;defense") == _disj(
            _conj(_concrete("attack")),
            _conj(_concrete("defense")),
        )

    def test_negation_prefix(self):
        c = TagDSLCompiler()
        assert c._parse_query("attack,~contact_play") == _disj(
            _conj(_concrete("attack"), _neg(_concrete("contact_play")))
        )

    def test_negation_only_query(self):
        c = TagDSLCompiler()
        assert c._parse_query("~snark") == _disj(
            _conj(_neg(_concrete("snark")))
        )

    def test_mixed_or_and_and_negation(self):
        c = TagDSLCompiler()
        assert c._parse_query("attack,~bad;defense") == _disj(
            _conj(_concrete("attack"), _neg(_concrete("bad"))),
            _conj(_concrete("defense")),
        )


# ─── _expand_to_dnf (macro expander semantics) ────────────────────────────────


class TestExpandToDnf:
    """Replaces TestExpandConjunction. The macro expander's algebraic
    contract — substitute, push negation inward where appropriate,
    distribute nested groupings — is exercised here.
    """

    def _compiler_with(self, **defs) -> TagDSLCompiler:
        """Helper: build a compiler pre-loaded with definitions via
        the public ``_parse_definition`` path."""
        c = TagDSLCompiler()
        for name, body in defs.items():
            c._parse_definition(f"${name} :- {body}")
        return c

    def test_dnf1_distributive_law_single_virtual_pos(self):
        """``$fight,c`` where ``$fight :- attack;defense``.
        Expands to ``(attack,c); (defense,c)``.
        """
        c = self._compiler_with(fight="attack;defense")
        dnf = c._expand_to_dnf(c._parse_query("$fight, c"))
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {frozenset({"attack", "c"}), frozenset({"defense", "c"})}
        assert all(d["neg"] == set() for d in dnf)

    def test_dnf2_negation_of_pos_virtual_collapses_to_neg_conjunction(self):
        """``~$fight`` where ``$fight :- attack;defense``.
        De Morgan: ``~(attack OR defense)`` = ``~attack AND ~defense``.
        Single conjunction with empty pos and two-element neg.
        """
        c = self._compiler_with(fight="attack;defense")
        dnf = c._expand_to_dnf(c._parse_query("~$fight"))
        assert len(dnf) == 1
        assert dnf[0]["pos"] == set()
        assert dnf[0]["neg"] == {"attack", "defense"}

    def test_T9_two_independent_virtual_positives_cartesian_product(self):
        """T9: ``$A, $B`` where ``$A :- a1;a2`` and ``$B :- b1;b2``.
        Expands to 4 conjunctions (all pairs).
        """
        c = self._compiler_with(A="a1;a2", B="b1;b2")
        dnf = c._expand_to_dnf(c._parse_query("$A, $B"))
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {
            frozenset({"a1", "b1"}),
            frozenset({"a1", "b2"}),
            frozenset({"a2", "b1"}),
            frozenset({"a2", "b2"}),
        }

    def test_T14_negated_virtual_merges_with_concrete_negations(self):
        """T14: ``shape, ~$strong_evals`` where
        ``$strong_evals :- judgement;flow;subtle``.
        Single conjunction: pos={shape}, neg={judgement,flow,subtle}.
        """
        c = self._compiler_with(strong_evals="judgement;flow;subtle")
        dnf = c._expand_to_dnf(c._parse_query("shape, ~$strong_evals"))
        assert len(dnf) == 1
        assert dnf[0]["pos"] == {"shape"}
        assert dnf[0]["neg"] == {"judgement", "flow", "subtle"}

    def test_concrete_only_conjunction_is_identity(self):
        c = TagDSLCompiler()
        dnf = c._expand_to_dnf(c._parse_query("attack, hard, ~easy"))
        assert len(dnf) == 1
        assert dnf[0]["pos"] == {"attack", "hard"}
        assert dnf[0]["neg"] == {"easy"}

    def test_T11_two_level_virtual_reference(self):
        """T11: ``$technical_shape, ~volatile`` where
        ``$shape_focus :- shape;contact`` and
        ``$technical_shape :- $shape_focus;technical``.
        Final DNF: three conjs each ANDing one positive tag with ~volatile.
        """
        c = self._compiler_with(
            shape_focus="shape;contact",
            technical_shape="$shape_focus;technical",
        )
        dnf = c._expand_to_dnf(c._parse_query("$technical_shape, ~volatile"))
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {frozenset({"shape"}), frozenset({"contact"}), frozenset({"technical"})}
        assert all(d["neg"] == {"volatile"} for d in dnf)

    def test_T12_three_level_reference_chain(self):
        """T12: chain depth 3. Final disjunction:
        ``joseki;opening;sabaki;moyo`` queried alone.
        """
        c = self._compiler_with(
            lvl1="joseki;opening",
            lvl2="$lvl1;sabaki",
            lvl3="$lvl2;moyo",
        )
        dnf = c._expand_to_dnf(c._parse_query("$lvl3"))
        pos_sets = {frozenset(d["pos"]) for d in dnf}
        assert pos_sets == {
            frozenset({"joseki"}),
            frozenset({"opening"}),
            frozenset({"sabaki"}),
            frozenset({"moyo"}),
        }


# ─── Smoke cases T1-T6 (old-grammar regression-equivalent) ────────────────────


class TestStatsDocSmokeCases:
    """T1-T6: simple expressions that compile under both the old and
    new grammars. Verifies arc 2 doesn't regress arc 1 behaviour at
    the unit level. SQL execution is exercised in tier-2 integration.
    """

    def test_T1_single_concrete_tag(self):
        stmt = TagDSLCompiler().compile_to_subquery("volatile")
        assert stmt is not None

    def test_T2_simple_conjunction(self):
        stmt = TagDSLCompiler().compile_to_subquery("joseki, shape")
        assert stmt is not None

    def test_T3_simple_negation(self):
        stmt = TagDSLCompiler().compile_to_subquery("joseki, ~shape")
        assert stmt is not None

    def test_T4_simple_disjunction(self):
        stmt = TagDSLCompiler().compile_to_subquery("joseki; shape")
        assert stmt is not None

    def test_T5_three_way_disjunction(self):
        stmt = TagDSLCompiler().compile_to_subquery("joseki;opening;moyo")
        assert stmt is not None

    def test_T6_conjunction_with_negation_three_terms(self):
        stmt = TagDSLCompiler().compile_to_subquery("shape, technical, ~volatile")
        assert stmt is not None


# ─── SQL structure smoke (preserved from arc 1) ───────────────────────────────


class TestCompiledSQLStructure:
    """Inspect the compiled SQL string for structural properties. No
    database — just structural assertions about the emitted SQL.
    """

    @staticmethod
    def _sql(stmt) -> str:
        return str(stmt.compile(compile_kwargs={"literal_binds": True}))

    def test_positive_and_generates_having_clause(self):
        stmt = TagDSLCompiler().compile_to_subquery("attack,hard")
        assert "HAVING" in self._sql(stmt).upper()

    def test_single_positive_tag_generates_having_count_1(self):
        stmt = TagDSLCompiler().compile_to_subquery("attack")
        assert "HAVING" in self._sql(stmt).upper()

    def test_negation_only_query_generates_except_or_not_in(self):
        stmt = TagDSLCompiler().compile_to_subquery("~snark")
        sql = self._sql(stmt).upper()
        assert "EXCEPT" in sql or "NOT IN" in sql

    def test_or_query_generates_union(self):
        stmt = TagDSLCompiler().compile_to_subquery("attack;defense")
        assert "UNION" in self._sql(stmt).upper()

    def test_virtual_tag_expansion_generates_union_of_concrete_tags(self):
        stmt = TagDSLCompiler().compile_to_subquery(
            "$fight :- attack;defense. $fight"
        )
        sql = self._sql(stmt)
        assert "UNION" in sql.upper()
        assert "attack" in sql
        assert "defense" in sql

    def test_having_count_matches_number_of_required_positive_tags(self):
        stmt = TagDSLCompiler().compile_to_subquery("attack,hard,opening")
        sql = self._sql(stmt)
        assert "3" in sql and "HAVING" in sql.upper()


# ─── Closed-defect regressions (D-7 and D-8 from the pre-release sweep) ──────


class TestClosedSilentFailures:
    """Both D-7 and D-8 documented silent-coercion failures at the
    ``compile_to_subquery`` boundary in the pre-release sweep.
    ADR-0002 closed them; today the malformed inputs raise loudly.
    These tests pin the fail-loud behaviour so a future regression
    that re-introduces the silence would fail here.
    """

    def test_D7_definition_as_last_statement_now_raises(self):
        """D-7: ``compile_to_subquery("$X :- a")`` is structurally a
        definition with no query. The compiler treats the single
        statement as the query, the parser raises Unknown-virtual
        because ``$X`` was never defined.
        """
        with pytest.raises(PipelineDSLError):
            TagDSLCompiler().compile_to_subquery("$X :- a")

    def test_D8_empty_virtual_tag_compile_now_raises(self):
        """D-8: ``$X :- . $X`` previously produced a select that
        silently matched no rows. Today the empty virtual produces a
        zero-conjunction expansion, and the compile boundary's
        defensive guard raises with "no conjunctions".
        """
        with pytest.raises(PipelineDSLError, match=r"no conjunctions"):
            TagDSLCompiler().compile_to_subquery("$X :- . $X")
