"""
tests/integration/test_tag_dsl_macro_language.py
=================================================
Tier 2 — Adapter integration: tag-DSL macro language (arc 2).

These tests exercise the arc-2 grammar features end-to-end against
a real in-memory SQLite session. The SQL emitter (unchanged from
arc 1) consumes the DNF that the new substitutive expander
produces; the result-set assertions verify the new grammar
features compose correctly with the existing SQL semantics.

Verified contracts
------------------
T10 — Negation in definition (`$attack :- $tactic;~$blocked`)
      expands and executes correctly.
T11 — Two-level virtual reference resolves and executes.
T12 — Three-level reference chain resolves to the union of every
      concrete tag transitively referenced.
T13 — Parenthesised grouping (`($a, $b); $c`) parses and
      executes as a disjunction of conjunctions.
T14 — Negated virtual at the query site (`~$strong_evals`) De
      Morgans into a flat negation set, identical to the arc-1
      semantics for pure-positive virtuals.

The fixture pattern mirrors ``test_tag_dsl_qsl.py``: synthetic
cards with synthetic tag membership constructed via
``TreeBuilder``. The stats-doc's snapshot cardinalities motivate
the test expressions but the assertions are against deterministic
synthetic membership, not against the snapshot database — synthetic
fixtures keep the tests fast and self-contained.

The stats-doc's sandbox-only stress cases (S1-S5) are NOT covered
here — those are unit-level cap-refusal assertions and live in
``tests/unit/test_tag_dsl_pure.py``. Per the design note's
admonition, an S-case must never execute against any database
(the cap guards refuse before SQL is emitted).
"""
import pytest

from domain.tag_dsl import TagDSLCompiler
from tests.helpers import TreeBuilder

pytestmark = pytest.mark.integration


async def run_tag_query(session, expression: str) -> set[int]:
    """Compile and execute a tag DSL expression; return the matched card ID set."""
    compiler = TagDSLCompiler()
    stmt = compiler.compile_to_subquery(expression)
    result = await session.execute(stmt)
    return {row[0] for row in result.fetchall()}


# ─── T10: Negation in definition ──────────────────────────────────────────────


async def test_T10_negation_in_definition_AND_form(seeded_session):
    """T10 (conjunctive form): ``$attack :- $tactic, ~$blocked``
    means ``$tactic AND NOT $blocked`` under clean grammar (`,` =
    AND). This is the syntax that expresses the design note's
    stated user intent — "everything in tactic except blocked".

    The design note's worked example uses ``$attack :- $tactic;~$blocked``
    (semicolon), which under clean grammar means ``$tactic OR NOT
    $blocked`` — a semantically different and far less restrictive
    expression. See the separate ``test_T10_negation_in_definition_OR_form``
    test for that variant. The discrepancy between the design
    note's syntax (semicolon) and its parenthetical stated intent
    ("except") is a documentation inconsistency surfaced during
    arc 2 implementation.

    Fixture: punish/fight/sabaki are the "tactic" tags; volatile is
    the "blocked" tag.

      A — punish (no volatile)        → matches ($tactic AND no $blocked)
      B — fight, volatile             → excluded ($blocked present)
      C — sabaki                      → matches
      D — opening (unrelated)         → excluded (no $tactic member)
      E — punish, volatile            → excluded ($blocked present)
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None, "D": None, "E": None})
    await builder.add_tags(
        {
            "A": ["punish"],
            "B": ["fight", "volatile"],
            "C": ["sabaki"],
            "D": ["opening"],
            "E": ["punish", "volatile"],
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$tactic :- punish;fight;sabaki. "
        "$blocked :- volatile. "
        "$attack :- $tactic, ~$blocked. "
        "$attack",
    )
    assert matched == {ids["A"], ids["C"]}


async def test_T10_negation_in_definition_OR_form(seeded_session):
    """T10 (disjunctive form): ``$attack :- $tactic; ~$blocked``
    means ``$tactic OR NOT $blocked`` under clean grammar (`;` =
    OR). This is the literal reading of the design note's worked
    example syntax (which uses semicolon).

    Match set is much wider than the AND form: a card matches if
    it has any $tactic member OR if it simply lacks $blocked
    members.

    Fixture (same as the AND form):
      A — punish (no volatile)        → matches ($tactic) AND (no $blocked)
      B — fight, volatile             → matches ($tactic, fight)
      C — sabaki                      → matches ($tactic) AND (no $blocked)
      D — opening                     → matches (no $blocked)
      E — punish, volatile            → matches ($tactic, punish)

    All five match.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None, "D": None, "E": None})
    await builder.add_tags(
        {
            "A": ["punish"],
            "B": ["fight", "volatile"],
            "C": ["sabaki"],
            "D": ["opening"],
            "E": ["punish", "volatile"],
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$tactic :- punish;fight;sabaki. "
        "$blocked :- volatile. "
        "$attack :- $tactic;~$blocked. "
        "$attack",
    )
    assert matched == {ids["A"], ids["B"], ids["C"], ids["D"], ids["E"]}


# ─── T11: Two-level virtual reference (depth 2) ───────────────────────────────


async def test_T11_two_level_virtual_reference(seeded_session):
    """T11: ``$shape_focus :- shape;contact`` and
    ``$technical_shape :- $shape_focus;technical``. Query
    ``$technical_shape, ~volatile`` expands to the three-way
    disjunction ``(shape;contact;technical), ~volatile``.
    """
    session, builder = seeded_session
    ids = await builder.build(
        {
            "A_shape": None,
            "B_contact": None,
            "C_tech": None,
            "D_volatile": None,
            "E_other": None,
        }
    )
    await builder.add_tags(
        {
            "A_shape":    ["shape"],
            "B_contact":  ["contact"],
            "C_tech":     ["technical"],
            "D_volatile": ["shape", "volatile"],
            "E_other":    ["opening"],
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$shape_focus :- shape;contact. "
        "$technical_shape :- $shape_focus;technical. "
        "$technical_shape, ~volatile",
    )
    # A_shape (shape, no volatile), B_contact (contact, no volatile),
    # C_tech (technical, no volatile) match.
    # D_volatile has shape but also volatile → excluded.
    # E_other lacks all three positives → excluded.
    assert matched == {ids["A_shape"], ids["B_contact"], ids["C_tech"]}


# ─── T12: Three-level reference chain (depth 3) ───────────────────────────────


async def test_T12_three_level_reference_chain(seeded_session):
    """T12: chain
        $lvl1 :- joseki;opening.
        $lvl2 :- $lvl1;sabaki.
        $lvl3 :- $lvl2;moyo.
        $lvl3
    expands to the union of joseki, opening, sabaki, moyo.
    """
    session, builder = seeded_session
    ids = await builder.build(
        {"J": None, "O": None, "S": None, "M": None, "X": None}
    )
    await builder.add_tags(
        {
            "J": ["joseki"],
            "O": ["opening"],
            "S": ["sabaki"],
            "M": ["moyo"],
            "X": ["volatile"],  # unrelated tag
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$lvl1 :- joseki;opening. "
        "$lvl2 :- $lvl1;sabaki. "
        "$lvl3 :- $lvl2;moyo. "
        "$lvl3",
    )
    assert matched == {ids["J"], ids["O"], ids["S"], ids["M"]}
    assert ids["X"] not in matched


# ─── T13: Parenthesised grouping ──────────────────────────────────────────────


async def test_T13_top_level_parenthesised_disjunction(seeded_session):
    """T13: ``(joseki, shape); (technical, opening)``. Top-level
    disjunction of two two-element conjunctions. Cards matching
    either pair are returned.
    """
    session, builder = seeded_session
    ids = await builder.build({"JS": None, "TO": None, "J_only": None, "X": None})
    await builder.add_tags(
        {
            "JS":     ["joseki", "shape"],
            "TO":     ["technical", "opening"],
            "J_only": ["joseki"],            # missing the AND'd partner
            "X":      ["volatile"],          # unrelated
        },
        ids,
    )

    matched = await run_tag_query(session, "(joseki, shape); (technical, opening)")
    assert matched == {ids["JS"], ids["TO"]}


async def test_T13_non_dnf_distributes_correctly(seeded_session):
    """T13 (distributive): ``a, (b; c)`` is non-DNF and the
    distributor flattens it to ``(a, b); (a, c)``. Each disjunct
    matches independently.
    """
    session, builder = seeded_session
    ids = await builder.build({"AB": None, "AC": None, "BC": None, "A_only": None})
    await builder.add_tags(
        {
            "AB":     ["a", "b"],
            "AC":     ["a", "c"],
            "BC":     ["b", "c"],     # lacks 'a'
            "A_only": ["a"],          # lacks both b and c
        },
        ids,
    )

    matched = await run_tag_query(session, "a, (b; c)")
    assert matched == {ids["AB"], ids["AC"]}


# ─── T14: Negation of a virtual at the query site ─────────────────────────────


async def test_T14_negated_virtual_at_query_site(seeded_session):
    """T14: ``shape, ~$strong_evals`` where
    ``$strong_evals :- judgement;flow;subtle``. The negation of a
    pure-positive virtual De Morgans into a flat negation set:
    `shape AND NOT judgement AND NOT flow AND NOT subtle`.
    """
    session, builder = seeded_session
    ids = await builder.build(
        {
            "clean":      None,
            "with_judge": None,
            "with_flow":  None,
            "with_sub":   None,
            "no_shape":   None,
        }
    )
    await builder.add_tags(
        {
            "clean":      ["shape"],
            "with_judge": ["shape", "judgement"],
            "with_flow":  ["shape", "flow"],
            "with_sub":   ["shape", "subtle"],
            "no_shape":   ["judgement"],  # negation passes but no positive
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$strong_evals :- judgement;flow;subtle. shape, ~$strong_evals",
    )
    assert matched == {ids["clean"]}


# ─── Cross-feature: negation in definition + multi-level reference ────────────


async def test_negation_in_definition_with_deep_reference(seeded_session):
    """Composition test: a virtual whose body uses both a deeper
    virtual reference AND negation expands correctly. Exercises the
    De Morgan + substitution interaction across more than one level.

        $inner :- a;b.
        $outer :- $inner;~c.
        $outer
    expands to: a OR b OR (NOT c)
    Cards matching either positive tag, or any card without c.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None, "D": None})
    await builder.add_tags(
        {
            "A": ["a"],
            "B": ["b"],
            "C": ["c"],
            "D": ["d"],
        },
        ids,
    )

    matched = await run_tag_query(
        session,
        "$inner :- a;b. $outer :- $inner;~c. $outer",
    )
    # A has 'a' → matches positive a
    # B has 'b' → matches positive b
    # C has 'c' only → fails ~c disjunct (has c)
    #   but also lacks a and b → no match
    # D has 'd' → matches ~c (lacks c)
    assert matched == {ids["A"], ids["B"], ids["D"]}
