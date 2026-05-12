# Card-Tag Distribution Statistics + Tag-DSL Test Expressions

A **two-part reference deliverable** for the
`tag-dsl-macro-language-plan.md` arcs. The macro-language
refactor will be deep-tested against the real shape of the
authoring user's `backend/cards.db`; this document captures that
shape plus the test expressions that exercise the new expander
against it.

- **Part 1 — Statistics.** What's actually in the dev database
  as of the snapshot below: how many cards, how many tags, the
  cardinality distribution, the co-occurrence shape, the
  long-tail vs. heavy-hitter split.
- **Part 2 — Test expressions.** Concrete tag-DSL expressions
  with predicted cardinalities, designed to exercise the macro
  expander's behaviour against this real data. Includes
  cap-boundary cases (K / M / D approached) and explicitly-
  marked sandbox-only stress cases that should NOT be run
  against a production-shaped database.

**Snapshot date:** 2026-05-12. The numerics below reflect the
authoring user's local `backend/cards.db` at that timestamp and
will drift as cards are added / removed; the queries that
produced them are embedded inline so a future contributor can
re-run on updated data.

**Genre:** Test-reference. Distinct from a design note (which
describes intent) — this carries the empirical inputs the
implementation will be validated against.

---

# Part 1 — Database statistics

## Aggregate shape

```sql
SELECT (SELECT COUNT(*) FROM card)            AS cards,
       (SELECT COUNT(*) FROM tag)             AS tags,
       (SELECT COUNT(*) FROM card_tag)        AS card_tag_rows,
       (SELECT COUNT(DISTINCT card_id) FROM card_tag) AS cards_with_at_least_one_tag,
       (SELECT COUNT(*) FROM card)
       - (SELECT COUNT(DISTINCT card_id) FROM card_tag) AS cards_untagged,
       (SELECT COUNT(DISTINCT user_id) FROM card)       AS distinct_users;
```

| Metric                          | Value  |
|---------------------------------|--------|
| Total cards                     | 7,873  |
| Total tags                      | 290    |
| `card_tag` rows                 | 10,311 |
| Cards with ≥ 1 tag              | 6,490  |
| Cards untagged                  | 1,383  |
| Distinct users                  | 30     |

The avg tagged card carries ≈ 1.59 tags (10311 / 6490). Untagged
cards are 17.6% of the corpus.

## Tag cardinality — the long-tail split

```sql
SELECT
  CASE WHEN n=1 THEN '1' WHEN n<=5 THEN '2-5' WHEN n<=20 THEN '6-20'
       WHEN n<=100 THEN '21-100' WHEN n<=500 THEN '101-500' ELSE '500+' END AS band,
  COUNT(*) AS n_tags
FROM (SELECT tag_id, COUNT(*) n FROM card_tag GROUP BY tag_id)
GROUP BY band ORDER BY MIN(n);
```

| Cards-per-tag band | n_tags |
|--------------------|--------|
| 1                  | 106    |
| 2-5                | 114    |
| 6-20               | 33     |
| 21-100             | 18     |
| 101-500            | 10     |
| 500+               | 6      |

**85% of the tag namespace is `source:`-prefixed file-path
tags** (247 of 290) — auto-tagged from the SGF source. These
form the bulk of the 1-card and 2-5 card bands. Only ~43 tags
are **semantic** (topical / evaluation-shape) and these are
where the interesting taxonomy lives.

The six heavy hitters (`> 500` cards each) are listed below;
they're the natural anchors for virtual-tag definitions because
they appear frequently and combine meaningfully.

## Top semantic tags (excluding `source:`)

```sql
SELECT t.name, COUNT(*) AS n_cards
FROM card_tag ct JOIN tag t ON t.id = ct.tag_id
WHERE t.name NOT LIKE 'source:%'
GROUP BY t.id ORDER BY n_cards DESC LIMIT 20;
```

| Tag        | n_cards |
|------------|---------|
| volatile   | 2,204   |
| technical  | 1,070   |
| shape      | 816     |
| punish     | 750     |
| joseki     | 735     |
| judgement  | 642     |
| opening    | 444     |
| fight      | 356     |
| blindspot  | 338     |
| followup   | 248     |
| sabaki     | 245     |
| endgame    | 233     |
| extendhane | 184     |
| concept    | 127     |
| contact    | 123     |
| grump      | 107     |
| tsumego    | 98      |
| tesuji     | 92      |
| flow       | 84      |
| fox        | 78      |

Mid-tail useful tags (6–100): `ko` (75), `moyo` (68), `subtle`
(38), `uncommon` (19), `classic` (18), `attack` (17), `kata`
(16), `defense` (7).

`volatile` (2,204) is the most-used tag by a wide margin — it
appears to be an evaluation-shape marker rather than a topical
category. Treat it as a "noise / engine-confusion" signal in
test expressions (i.e., expressions that filter `~volatile` are
asking "show me cards the engine is confident about").

## Tags per card

```sql
SELECT
  CASE WHEN n=0 THEN '0' WHEN n=1 THEN '1' WHEN n=2 THEN '2'
       WHEN n=3 THEN '3' WHEN n<=5 THEN '4-5' WHEN n<=10 THEN '6-10'
       ELSE '10+' END AS tags_per_card,
  COUNT(*) AS n_cards
FROM (
  SELECT c.id, COUNT(ct.tag_id) AS n
  FROM card c LEFT JOIN card_tag ct ON ct.card_id = c.id
  GROUP BY c.id
)
GROUP BY tags_per_card ORDER BY MIN(n);
```

| tags_per_card | n_cards |
|---------------|---------|
| 0             | 1,383   |
| 1             | 3,484   |
| 2             | 2,291   |
| 3             | 623     |
| 4-5           | 92      |

No card has > 5 tags. The mode is 1 tag per card; the median is
1 too.

## Top tag co-occurrences (semantic tags only)

```sql
SELECT t1.name AS tag_a, t2.name AS tag_b, COUNT(*) AS co
FROM card_tag ct1 JOIN card_tag ct2
  ON ct1.card_id = ct2.card_id AND ct1.tag_id < ct2.tag_id
JOIN tag t1 ON t1.id = ct1.tag_id JOIN tag t2 ON t2.id = ct2.tag_id
WHERE t1.name NOT LIKE 'source:%' AND t2.name NOT LIKE 'source:%'
GROUP BY ct1.tag_id, ct2.tag_id ORDER BY co DESC LIMIT 15;
```

| Tag A      | Tag B     | Co-occur |
|------------|-----------|----------|
| punish     | volatile  | 186      |
| technical  | volatile  | 177      |
| endgame    | volatile  | 131      |
| shape      | volatile  | 118      |
| shape      | technical | 103      |
| shape      | judgement | 97       |
| fight      | volatile  | 77       |
| shape      | fight     | 75       |
| joseki     | shape     | 72       |
| opening    | judgement | 68       |
| shape      | blindspot | 61       |
| technical  | contact   | 60       |
| joseki     | punish    | 59       |
| fight      | technical | 59       |
| judgement  | volatile  | 56       |

`volatile` dominates co-occurrence with most semantic tags —
again, evaluation-shape marker. The strongest non-`volatile`
co-occurrences are `shape + technical` (103), `shape + judgement`
(97), `shape + fight` (75), `joseki + shape` (72) — these are
the natural virtual-tag composition substrates.

---

# Part 2 — Tag-DSL test expressions

Expressions below are organised by the macro-language feature
they exercise. Each carries:

- **Expression** — the DSL string.
- **Predicted cardinality** — number of cards the expression
  should resolve to, computed from the snapshot above.
- **Behaviour** — what the macro expander should do (parse,
  expand, refuse with a specific error).
- **Notes** — why this case is interesting.

The "predicted cardinality" assumes the expression is evaluated
against the snapshot database with `user_id` tenancy unfiltered
(the test harness should scope appropriately). Cardinalities
are reproducible via the corresponding SQL fragments embedded
inline.

## §2.1 — Smoke tests (old grammar, regression-equivalent)

These compile under the existing grammar and must produce
**identical results** under the new expander. Arc 1's
bit-equality contract is verified primarily by these.

### T1 — Single concrete tag

**Expression:** `volatile`

**Predicted cardinality:** 2,204.

**Behaviour:** parses; emits a single SQL subquery over
`card_tag` filtering on `name = 'volatile'`.

**Note:** The simplest possible smoke test. Any regression in
the existing path breaks this.

### T2 — Simple conjunction

**Expression:** `joseki, shape`

**Predicted cardinality:** 72.

**Behaviour:** parses; emits `card_tag JOIN tag WHERE name IN ('joseki','shape') GROUP BY card_id HAVING COUNT(*) = 2`.

```sql
SELECT COUNT(DISTINCT c.id) FROM card c
WHERE c.id IN (SELECT card_id FROM card_tag ct JOIN tag t ON t.id=ct.tag_id WHERE t.name='joseki')
  AND c.id IN (SELECT card_id FROM card_tag ct JOIN tag t ON t.id=ct.tag_id WHERE t.name='shape');
-- 72
```

### T3 — Simple negation

**Expression:** `joseki, ~shape`

**Predicted cardinality:** 663.

**Behaviour:** parses; the positive subquery filters on
`joseki`; the negative subquery filters on `shape`; the
emission is `(pos) EXCEPT (neg)`.

### T4 — Simple disjunction

**Expression:** `joseki; shape`

**Predicted cardinality:** 1,479.

**Behaviour:** parses; two conjunctions in DNF, each emits a
subquery, `UNION` joins them.

### T5 — Three-way disjunction with negation

**Expression:** `joseki;opening;moyo`

**Predicted cardinality:** 1,193.

```sql
SELECT COUNT(DISTINCT card_id) FROM card_tag ct JOIN tag t ON t.id=ct.tag_id
WHERE t.name IN ('joseki','opening','moyo');
-- 1193
```

### T6 — Conjunction-with-negation, three terms

**Expression:** `shape, technical, ~volatile`

**Predicted cardinality:** 84.

**Note:** `shape + technical` co-occur on 103 cards; 19 of
those are `volatile`. Sanity-check that 84 = 103 - 19 — wait,
84 directly. The relationship is via `card_tag` membership, not
co-occurrence — the SQL handles this correctly via `EXCEPT`.

## §2.2 — Old-grammar virtual tags (regression-equivalent)

Virtual tags as flat-set aliases, exactly as the current
grammar admits. Must continue to work post-refactor.

### T7 — Single-level virtual

**Expression:**
```
$opening_themes :- joseki;opening;moyo.
$opening_themes
```

**Predicted cardinality:** 1,193 (same as T5; the virtual is a
pure alias for the disjunction).

**Behaviour:** definition stores `{joseki, opening, moyo}`;
query expands to the three-way disjunction.

### T8 — Virtual in conjunction (multiplicative distribution)

**Expression:**
```
$opening_themes :- joseki;opening;moyo.
$opening_themes, ~volatile
```

**Predicted cardinality:** 1,145.

```sql
SELECT COUNT(DISTINCT c.id) FROM card c
WHERE c.id IN (SELECT card_id FROM card_tag ct JOIN tag t ON t.id=ct.tag_id WHERE t.name IN ('joseki','opening','moyo'))
  AND c.id NOT IN (SELECT card_id FROM card_tag ct JOIN tag t ON t.id=ct.tag_id WHERE t.name='volatile');
-- 1145
```

**Note:** The current expander multiplicatively distributes the
virtual into three positive conjunctions:
`(joseki, ~volatile); (opening, ~volatile); (moyo, ~volatile)`.
Three subqueries `UNION`'d. The new expander should produce
identical DNF and identical cardinality.

### T9 — Two virtuals multiplicatively distributed

**Expression:**
```
$opening_themes :- joseki;opening;moyo.
$attack_themes :- punish;fight;sabaki.
$opening_themes, $attack_themes
```

**Predicted cardinality:** approx 99 (sum of nine pairwise
co-occurrences; exact via the test harness).

**Note:** Distributes to 3 × 3 = 9 conjunctions, each one
positive: `(joseki,punish); (joseki,fight); (joseki,sabaki);
(opening,punish); ...`. Validates that arc 1 preserves the
multiplicative-distribution semantics and arc 2 doesn't regress
it.

## §2.3 — New-grammar showcases (arc 2 features)

These compile **only after arc 2** lands. Before arc 2 they
should raise `PipelineDSLError` with the current "Negation not
allowed in virtual tag definitions" message.

### T10 — Negation in definition

**Expression:**
```
$attack :- $tactic;~$blocked.
$attack
```

Where `$tactic` and `$blocked` are pre-defined (use real tags
in the substitution — e.g. `$tactic :- punish;fight;sabaki.`
and `$blocked :- volatile.`).

**Full form:**
```
$tactic :- punish;fight;sabaki.
$blocked :- volatile.
$attack :- $tactic;~$blocked.
$attack
```

**Predicted cardinality:** the expanded form is
`(punish;fight;sabaki), ~volatile`. Cardinality computed:

```sql
SELECT COUNT(DISTINCT card_id) FROM card_tag ct JOIN tag t ON t.id=ct.tag_id
WHERE t.name IN ('punish','fight','sabaki')
  AND card_id NOT IN (SELECT card_id FROM card_tag ct2 JOIN tag t2 ON t2.id=ct2.tag_id WHERE t2.name='volatile');
-- (run me to populate)
```

**Behaviour:** macro expander substitutes `$tactic` with its
disjunction tree, `$blocked` with its single-tag tree, then
`$attack` with the resulting `(...);~(...)` shape. DNF
normalisation flattens to three conjunctions each negating
`volatile`.

**Note:** This is the canonical example from the design note.
The cardinality is the **measurable proof** that negation-in-
definitions composes correctly.

### T11 — Two-level virtual reference (depth 2)

**Expression:**
```
$shape_focus :- shape;contact.
$technical_shape :- $shape_focus;technical.
$technical_shape, ~volatile
```

**Behaviour:** `$technical_shape` expands first to
`$shape_focus;technical`, then `$shape_focus` substitutes to
`shape;contact`. Final pre-DNF form:
`(shape;contact;technical), ~volatile`. The recursion-depth
counter sees depth 2 — well below `D = 8`.

**Predicted cardinality:** computed via:
```sql
SELECT COUNT(DISTINCT card_id) FROM card_tag ct JOIN tag t ON t.id=ct.tag_id
WHERE t.name IN ('shape','contact','technical')
  AND card_id NOT IN (SELECT card_id FROM card_tag ct2 JOIN tag t2 ON t2.id=ct2.tag_id WHERE t2.name='volatile');
```

### T12 — Three-level reference chain (depth 3)

**Expression:**
```
$lvl1 :- joseki;opening.
$lvl2 :- $lvl1;sabaki.
$lvl3 :- $lvl2;moyo.
$lvl3
```

**Behaviour:** depth-3 substitution chain. Final expansion:
`joseki;opening;sabaki;moyo`. Counts the depth correctly.

**Predicted cardinality:**
```sql
SELECT COUNT(DISTINCT card_id) FROM card_tag ct JOIN tag t ON t.id=ct.tag_id
WHERE t.name IN ('joseki','opening','sabaki','moyo');
```

### T13 — Parentheses for explicit grouping

**Expression:** `(joseki, shape); (technical, opening)`

**Predicted cardinality:** sum of two pairwise conjunctions
minus overlap.

**Behaviour:** parses as a top-level disjunction of two
conjunctions. If Open Question #1 (parentheses in grammar) is
resolved as "yes, admit", this must parse; if "no", this
should raise a parse error naming the unexpected `(`.

### T14 — Negation of a virtual at query site

**Expression:**
```
$strong_evals :- judgement;flow;subtle.
shape, ~$strong_evals
```

**Predicted cardinality:** cards tagged `shape` excluding any
tagged `judgement`, `flow`, or `subtle`.

**Behaviour:** `$strong_evals` in negative position expands to
its flat set; the SQL emission unions the negation set just
like in the old grammar.

## §2.4 — Cap-boundary cases (approach K / M / D, do not exceed)

These approach the caps without breaching. They should all
**succeed** and produce valid results. If any of them raises a
cap-violation error, the implementation has the cap too tight.

### T15 — Definition body at K - ε (K = 256)

**Expression:**
```
$wide :- t1;t2;t3;...;t250.
$wide
```

A definition with 250 concrete tags (none real — uses
synthetic tag names that don't exist in the DB). The
**body length** is 250, below `K = 256`.

**Behaviour:** parses; the cardinality is 0 because none of
the synthetic tags exist, but the query is well-formed.

**Note:** Tests that the cap-K guard fires AT > K, not AT >=
K. Off-by-one matters here.

### T16 — Conjunction expansion at M - ε (M = 1024)

**Expression:**
```
$a :- t1;t2;t3;t4;t5.
$b :- t6;t7;t8;t9;t10.
$c :- t11;t12;t13;t14;t15.
$d :- t16;t17;t18;t19;t20.
$a, $b, $c, $d
```

5 × 5 × 5 × 5 = 625 conjunctions, below `M = 1024`.

**Behaviour:** parses; expands to 625 conjunctions; emits 625
SQL subqueries `UNION`'d. Cardinality is 0 (synthetic tags
again), but the SQL execution plan is the test surface — the
SQL plan should complete in reasonable time.

### T17 — Reference chain at D - ε (D = 8)

**Expression:**
```
$d1 :- joseki.
$d2 :- $d1.
$d3 :- $d2.
$d4 :- $d3.
$d5 :- $d4.
$d6 :- $d5.
$d7 :- $d6.
$d7
```

A chain of 7 forward references, all resolving back to `joseki`.
Depth 7, below `D = 8`.

**Predicted cardinality:** 735 (the `joseki` count).

**Behaviour:** each `$dN` substitutes once, no fan-out; final
expansion is the single tag `joseki`. Validates that the depth
counter increments correctly across single-edge chains.

## §2.5 — Cap-violation cases (must raise, friendly errors)

Each of these **must raise `PipelineDSLError`** at the correct
phase, with the cap name + offending count + the offending
virtual named in the error message (per ADR-0002 fail-loudly).

### T18 — Definition body at K + ε

A definition with 260 concrete tags. Must raise at
definition-parse time (not at query time):
```
PipelineDSLError: Virtual tag '$wide' has 260 leaves;
                  exceeds K=256 (definition body length cap)
```

### T19 — Conjunction expansion at M + ε

A 5-virtual conjunction where 5⁵ = 3125 > 1024. Must raise
**after macro expansion, before SQL emission**:
```
PipelineDSLError: Macro expansion of '$a, $b, $c, $d, $e'
                  produces 3125 conjunctions; exceeds M=1024
                  (total expansion size cap)
```

### T20 — Reference chain at D + ε

A chain of 9 forward references. Must raise during expansion:
```
PipelineDSLError: Reference depth 9 exceeds D=8
                  (recursion depth cap) at virtual '$d9'
```

### T21 — Unknown virtual reference

**Expression:** `$nonexistent`

**Behaviour:** raises immediately at expansion. Validates the
existing-loud-error path still fires:
```
PipelineDSLError: Unknown virtual tag in query: $nonexistent
```

### T22 — Forward-reference order violation

**Expression:**
```
$b :- $a;tag1.
$a :- tag2;tag3.
$b
```

**Behaviour:** raises at parse of `$b` because `$a` isn't yet
defined. The forward-declaration discipline must be preserved
in arc 2 (it's the cheap cycle preventer):
```
PipelineDSLError: Virtual tag '$a' referenced before definition
                  (in definition of $b)
```

## §2.6 — Sandbox-only stress cases

> ⚠️ **WARNING — sandbox only.**
>
> The expressions in this section deliberately approach or
> exceed the caps and are designed to stress-test the
> expander's failure modes. **Do not run any of these against
> a production-shaped database.** They are intended for an
> isolated test environment with a disposable database copy,
> ideally with row-limit timeouts and statement-execution
> timeouts configured at the SQLite layer.
>
> Each expression below is correctly-shaped to **be refused**
> by the implementation — but a bug in cap enforcement would
> let one through. If one slips past the cap, the resulting
> SQL execution may consume substantial memory and CPU.

### S1 — Cap-M overflow at scale

A 10-virtual conjunction where each virtual contains 5 disjuncts:

```
$a :- t1;t2;t3;t4;t5.
$b :- t6;t7;t8;t9;t10.
...
$j :- t46;t47;t48;t49;t50.
$a, $b, $c, $d, $e, $f, $g, $h, $i, $j
```

5¹⁰ ≈ 9.77 million conjunctions. M = 1024 must catch this
**before** SQL emission. If the cap doesn't fire and the SQL
emits, the resulting `UNION` over 9.77M subqueries will exhaust
memory.

### S2 — Cap-K overflow with realistic tags

A single definition listing every concrete tag in the database
(up to 290 entries — well above K = 256):

```
$everything :- volatile;technical;shape;punish;joseki;...
```

K cap must fire at definition-parse time. If not, the storage
of a 290-element flat-set is harmless on its own, but composing
it with another large virtual via conjunction triggers
catastrophic blow-up (290^N).

### S3 — Cap-D overflow with synthetic chain

A 20-level forward reference chain:

```
$d1 :- joseki.
$d2 :- $d1.
...
$d20 :- $d19.
$d20
```

D = 8 must fire by the time the expander walks past depth 8.
If not, the result is correctness-equivalent (still `joseki`),
but the recursion is unbounded by depth and a definition graph
with fan-out (each `$dN := $d(N-1); concrete_N`) would compound
catastrophically.

### S4 — Pathological fan-out — the "exponential cliff"

A reference graph that fans out exponentially:

```
$a1 :- t1;t2.
$a2 :- $a1;$a1.        # (parses as: t1;t2;t1;t2 → t1;t2 after set-dedup
                       #  in old grammar, but with macro substitution
                       #  this is a structural duplication)
$a3 :- $a2;$a2.
$a4 :- $a3;$a3.
...
$a20 :- $a19;$a19.
$a20
```

This is the **named "exponential cliff"** of the design note's
DoS analysis. Each level doubles the structural size of the
expansion. Without depth cap D, the macro tree grows
exponentially before hitting the M-cap.

> **Implementation note for this case.** The K-cap should
> catch it at `$aN` for some N — counting concrete leaves
> after substitution. Whether K fires before D depends on cap
> values; in the recommended defaults (K = 256, D = 8), D
> fires at level 8 before K reaches 256 (since each level only
> doubles structurally but the post-dedup concrete-leaf count
> stays at 2). This means **D is the load-bearing cap for
> this attack shape**, not K. Worth verifying empirically in
> the sandbox.

### S5 — Dense disjunction of cap-M conjunctions

A top-level disjunction of many high-cardinality conjunctions:

```
$wide_disj :- (a,b,c,d,e);(f,g,h,i,j);...;(many groups)
```

If parentheses (Open Question #1) are admitted, this is the
attack shape that abuses them. Each disjunction member is a
conjunction; chaining many such members past `M` should refuse.

---

## §2.7 — Reproduction harness sketch

For the backend session implementing arc 2's test suite, the
suggested harness shape:

```python
# tests/integration/test_tag_dsl_macro_language.py

import pytest
from domain.tag_dsl import TagDSLCompiler
from domain.errors import PipelineDSLError

# Snapshot-derived expected cardinalities.
SNAPSHOT_EXPECTED = {
    "volatile": 2204,
    "joseki, shape": 72,
    "joseki, ~shape": 663,
    "joseki; shape": 1479,
    "joseki;opening;moyo": 1193,
    "shape, technical, ~volatile": 84,
    # ... fill from Part 2 above
}

@pytest.mark.parametrize("expr,expected", SNAPSHOT_EXPECTED.items())
def test_smoke_cardinalities(seeded_session, expr, expected):
    compiler = TagDSLCompiler()
    query = compiler.compile_to_subquery(expr)
    result = seeded_session.execute(query).all()
    assert len(result) == expected

# Cap-violation tests use pytest.raises with regex match on the
# error message naming the cap, count, and virtual.

def test_cap_K_violation(seeded_session):
    expr = "$wide :- " + ";".join(f"t{i}" for i in range(260)) + ".\n$wide"
    with pytest.raises(PipelineDSLError, match=r"260.*K=256"):
        TagDSLCompiler().compile_to_subquery(expr)
```

The test fixture `seeded_session` should load a deterministic
subset of the production database — either via a one-time SQL
dump checked into the repo, or via a fixture builder that
constructs the cards / tags / card_tag rows from a fixed seed.

**Do not run cap-violation tests against the production
`backend/cards.db`** — sandboxed in-memory SQLite with the
test fixture is the correct execution environment for
sandbox-only cases.

---

## Maintenance contract

This document is **a snapshot**, not a living reference. The
statistics will drift as cards are added / removed; if a
future contributor wants fresh numbers, they re-run the queries
embedded inline. The document doesn't need to update
continuously.

Triggers for refresh:

- A material change in card / tag scale (10× growth or
  reduction).
- The cap values (K / M / D) get tuned away from the
  recommended defaults — recompute the cap-boundary cases.
- A schema change touches `tag` or `card_tag`.

Otherwise, this document is fine to age. The tag names will
stay stable (the user's working taxonomy is the taxonomy); the
counts will drift but the **shape** of the distribution
(long-tail, source: dominance, top-six heavy hitters, ≤ 5
tags per card) is unlikely to invert.

## Cross-references

- **`docs/notes/tag-dsl-macro-language-plan.md`** — the design
  note this stats document accompanies. The macro language's
  cap values (K = 256, M = 1024, D = 8) come from there;
  the test expressions below derive from the planned grammar
  shape there.
- **`backend/domain/tag_dsl.py`** — the file the refactor
  targets.
- **`backend/cards.db`** — the dev database that backs every
  count in this document.
- **`docs/adr/0002-fail-loudly.md`** — the cap-violation
  error-message conventions follow ADR-0002.
