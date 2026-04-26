"""
tests/integration/test_tag_dsl_sql.py
=======================================
Tier 2 — SQLAlchemy Integration Tests: ``TagDSLCompiler`` SQL execution.

These tests execute the SQL produced by ``TagDSLCompiler.compile_to_subquery``
against a real in-memory SQLite database and verify the correct card ID sets
are returned.

This is the only layer that can catch:
  - HAVING clause counting errors
  - EXCEPT semantics on SQLite
  - Tag-name binding mismatches
  - Virtual-tag expansion producing wrong SQL unions

Verified Contracts
------------------
TAG-SQL-1: Positive AND semantics — HAVING count == N.
TAG-SQL-2: OR semantics — UNION of subqueries.
TAG-SQL-3: AND NOT semantics — EXCEPT construct.
TAG-SQL-4: Virtual tag full round-trip.
TAG-SQL-5: Card with no tags: not matched by positive, matched by pure negation.
TAG-SQL-6: Universal fallback — pure negation on a single tag returns all
           cards that do NOT have that tag (including tagless cards).
TAG-SQL-7: Two-level virtual tag nesting.
TAG-SQL-8: Mixed virtual-and-concrete positive conjunction.
TAG-SQL-9: Empty positive clause + negation returns all-minus-tagged.
"""
import pytest

from domain.tag_dsl import TagDSLCompiler
from tests.helpers import TreeBuilder

pytestmark = pytest.mark.integration


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def run_tag_query(session, expression: str) -> set[int]:
    """Compile and execute a tag DSL expression; return the matched card ID set."""
    compiler = TagDSLCompiler()
    stmt = compiler.compile_to_subquery(expression)
    result = await session.execute(stmt)
    return {row[0] for row in result.fetchall()}


# ─── TAG-SQL-1: Positive AND semantics ────────────────────────────────────────

async def test_positive_and_requires_all_tags(seeded_session):
    """
    TAG-SQL-1: card_A has {attack, hard}; card_B has {attack} only.
    Query "attack,hard" must return {card_A} only.

    The HAVING count(tag.id) == 2 clause is the gating mechanism.
    If it is absent or wrong, card_B would incorrectly match.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None})
    await builder.add_tags({"A": ["attack", "hard"], "B": ["attack"]}, ids)

    matched = await run_tag_query(session, "attack,hard")
    assert matched == {ids["A"]}, (
        f"Expected only card_A, got {matched}"
    )


async def test_positive_and_three_tags(seeded_session):
    """
    Three-tag AND: only the card with ALL three tags must match.
    """
    session, builder = seeded_session
    ids = await builder.build({"full": None, "partial": None, "none": None})
    await builder.add_tags({
        "full":    ["attack", "hard", "opening"],
        "partial": ["attack", "hard"],
        "none":    ["attack"],
    }, ids)

    matched = await run_tag_query(session, "attack,hard,opening")
    assert matched == {ids["full"]}


async def test_positive_single_tag_matches_all_cards_with_that_tag(seeded_session):
    """
    Single-tag query must still use HAVING (count == 1) and must match ALL
    cards that have that tag, regardless of other tags they carry.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None})
    await builder.add_tags({
        "A": ["attack"],
        "B": ["attack", "hard"],
        "C": ["defense"],
    }, ids)

    matched = await run_tag_query(session, "attack")
    assert matched == {ids["A"], ids["B"]}
    assert ids["C"] not in matched


# ─── TAG-SQL-2: OR semantics ──────────────────────────────────────────────────

async def test_or_returns_union_of_matched_cards(seeded_session):
    """
    TAG-SQL-2: "attack;defense" must return cards with attack OR defense
    (or both).
    """
    session, builder = seeded_session
    ids = await builder.build({"atk": None, "def": None, "both": None, "other": None})
    await builder.add_tags({
        "atk":   ["attack"],
        "def":   ["defense"],
        "both":  ["attack", "defense"],
        "other": ["opening"],
    }, ids)

    matched = await run_tag_query(session, "attack;defense")
    assert matched == {ids["atk"], ids["def"], ids["both"]}
    assert ids["other"] not in matched


# ─── TAG-SQL-3: AND NOT semantics ─────────────────────────────────────────────

async def test_and_not_semantics(seeded_session):
    """
    TAG-SQL-3: "attack,~contact_play"
    card_A has {attack};           card_B has {attack, contact_play}.
    Result: {card_A} only.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None})
    await builder.add_tags({
        "A": ["attack"],
        "B": ["attack", "contact_play"],
    }, ids)

    matched = await run_tag_query(session, "attack,~contact_play")
    assert matched == {ids["A"]}


async def test_and_not_with_multiple_negations(seeded_session):
    """
    "attack,~easy,~beginner": must have 'attack' and NEITHER 'easy' NOR 'beginner'.
    """
    session, builder = seeded_session
    ids = await builder.build({
        "pure":    None,
        "easy":    None,
        "beg":     None,
        "both_ex": None,
    })
    await builder.add_tags({
        "pure":    ["attack"],
        "easy":    ["attack", "easy"],
        "beg":     ["attack", "beginner"],
        "both_ex": ["attack", "easy", "beginner"],
    }, ids)

    matched = await run_tag_query(session, "attack,~easy,~beginner")
    assert matched == {ids["pure"]}


# ─── TAG-SQL-4: Virtual tag full round-trip ───────────────────────────────────

async def test_virtual_tag_round_trip(seeded_session):
    """
    TAG-SQL-4: "$fight :- attack;defense. $fight,~contact_play"

    $fight expands to {attack, defense}.
    Combined with ~contact_play, the effective query is:
      (has attack AND NOT contact_play)
      OR
      (has defense AND NOT contact_play)

    This is the reference example from REFERENCE.md.
    """
    session, builder = seeded_session
    ids = await builder.build({
        "atk_clean":     None,  # attack, no contact_play → match
        "def_clean":     None,  # defense, no contact_play → match
        "atk_dirty":     None,  # attack, contact_play → no match
        "def_dirty":     None,  # defense, contact_play → no match
        "unrelated":     None,  # opening only → no match
        "both_clean":    None,  # attack + defense, no contact_play → match (appears twice in UNION but deduplicated)
    })
    await builder.add_tags({
        "atk_clean":  ["attack"],
        "def_clean":  ["defense"],
        "atk_dirty":  ["attack", "contact_play"],
        "def_dirty":  ["defense", "contact_play"],
        "unrelated":  ["opening"],
        "both_clean": ["attack", "defense"],
    }, ids)

    matched = await run_tag_query(
        session,
        "$fight :- attack;defense. $fight,~contact_play"
    )
    assert matched == {ids["atk_clean"], ids["def_clean"], ids["both_clean"]}, (
        f"Expected attack/defense without contact_play, got {matched}"
    )


# ─── TAG-SQL-5: No-tag card ───────────────────────────────────────────────────

async def test_tagless_card_not_matched_by_positive_query(seeded_session):
    """
    TAG-SQL-5a: A card with no tags at all must not be returned by any
    positive tag query.
    """
    session, builder = seeded_session
    ids = await builder.build({"tagged": None, "tagless": None})
    await builder.add_tags({"tagged": ["attack"]}, ids)

    matched = await run_tag_query(session, "attack")
    assert ids["tagless"] not in matched


async def test_tagless_card_matched_by_pure_negation(seeded_session):
    """
    TAG-SQL-5b: A card with no tags must be returned by a pure-negation query
    "~snark" because it has no 'snark' tag.

    This is the "warm-up" pattern from REFERENCE.md: exclude only the
    'volatile' tag, include everything else.
    """
    session, builder = seeded_session
    ids = await builder.build({"clean": None, "snarky": None, "tagless": None})
    await builder.add_tags({
        "clean":  ["opening"],
        "snarky": ["snark"],
    }, ids)

    matched = await run_tag_query(session, "~snark")
    assert ids["tagless"] in matched, "Tagless card must match '~snark'"
    assert ids["clean"]   in matched, "Card without snark must match '~snark'"
    assert ids["snarky"] not in matched, "Card with snark must be excluded"


# ─── TAG-SQL-6: Universal-set fallback ────────────────────────────────────────

async def test_empty_positive_with_negation_returns_all_minus_tagged(seeded_session):
    """
    TAG-SQL-6: When pos is empty and neg is non-empty, the compiler generates:
        SELECT card.id   (all cards)
        EXCEPT
        SELECT card_tag.card_id WHERE tag.name IN (neg)

    This returns every card that does NOT have any tag in the negation set.
    Including tagless cards.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None})
    await builder.add_tags({
        "A": ["volatile"],
        "B": ["stable"],
    }, ids)
    # Card C has no tags.

    matched = await run_tag_query(session, "~volatile")
    assert ids["A"] not in matched
    assert ids["B"] in matched
    assert ids["C"] in matched  # Tagless card is included


# ─── TAG-SQL-7: Two-level virtual tag nesting ─────────────────────────────────

async def test_two_level_virtual_tag_nesting(seeded_session):
    """
    TAG-SQL-7: Transitive definition expansion must resolve at compile time.

    $atk :- attack.
    $complex :- $atk;defense.
    $complex

    After expansion: $complex = {attack, defense}.
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None})
    await builder.add_tags({
        "A": ["attack"],
        "B": ["defense"],
        "C": ["opening"],
    }, ids)

    matched = await run_tag_query(
        session,
        "$atk :- attack. $complex :- $atk;defense. $complex"
    )
    assert matched == {ids["A"], ids["B"]}
    assert ids["C"] not in matched


# ─── TAG-SQL-8: Mixed virtual-and-concrete positive conjunction ───────────────

async def test_mixed_virtual_and_concrete_and(seeded_session):
    """
    TAG-SQL-8: "$fight :- attack;defense. $fight,hard"

    Must expand to:
      (attack AND hard) OR (defense AND hard)

    Cards:
      - A: {attack, hard}         → matches (attack AND hard)
      - B: {defense, hard}        → matches (defense AND hard)
      - C: {attack}               → no match (missing 'hard')
      - D: {attack, defense}      → no match (missing 'hard')
    """
    session, builder = seeded_session
    ids = await builder.build({"A": None, "B": None, "C": None, "D": None})
    await builder.add_tags({
        "A": ["attack", "hard"],
        "B": ["defense", "hard"],
        "C": ["attack"],
        "D": ["attack", "defense"],
    }, ids)

    matched = await run_tag_query(
        session,
        "$fight :- attack;defense. $fight,hard"
    )
    assert matched == {ids["A"], ids["B"]}


# ─── TAG-SQL-9: OR of AND queries ─────────────────────────────────────────────

async def test_or_of_and_conjunctions(seeded_session):
    """
    TAG-SQL-9: "attack,hard;defense,easy"
    DNF: (attack AND hard) OR (defense AND easy)
    """
    session, builder = seeded_session
    ids = await builder.build({
        "ah": None, "de": None, "ah_de": None, "none": None
    })
    await builder.add_tags({
        "ah":    ["attack", "hard"],
        "de":    ["defense", "easy"],
        "ah_de": ["attack", "hard", "defense", "easy"],
        "none":  ["opening"],
    }, ids)

    matched = await run_tag_query(session, "attack,hard;defense,easy")
    assert matched == {ids["ah"], ids["de"], ids["ah_de"]}


# ─── TAG-SQL-10: HAVING correctness with phantom duplicates ──────────────────

async def test_having_count_not_fooled_by_tag_count_on_other_tags(seeded_session):
    """
    TAG-SQL-10: A card with tags {attack, defense, opening} and query "attack,hard"
    must NOT match, even though the card has 3 tags.

    Without the WHERE tag.name IN (...) filter, HAVING COUNT == 2 would match
    this card (it has 3 tags total, but 3 != 2, so it actually wouldn't match…
    but if the WHERE clause is missing, we'd count ALL tags).

    This test verifies the WHERE clause restricts to the queried tags before
    the HAVING count is applied.
    """
    session, builder = seeded_session
    ids = await builder.build({"many_tags": None, "correct": None})
    await builder.add_tags({
        "many_tags": ["attack", "defense", "opening"],  # does NOT have "hard"
        "correct":   ["attack", "hard"],
    }, ids)

    matched = await run_tag_query(session, "attack,hard")
    assert ids["many_tags"] not in matched, (
        "Card with {attack, defense, opening} must NOT match query 'attack,hard'"
    )
    assert ids["correct"] in matched
