# Tag-DSL macro language — implementation

- **Status:** Shipped 2026-05-12 across PRs #197 (arc 1), #198
  (arc 2), and #199 (reference + REPL). Full backend suite green
  at 471 / 1 / 2 (passed / skipped / xfailed) after all three.
- **Genre:** Feature — closes the planned two-arc plan in
  `docs/archive/notes/tag-dsl-macro-language-plan.md`; that note
  transitions from `design-note: planned` to `design-note:
  implemented` in the same closure pass. Also closes the
  long-carrying `tag_dsl.py`-is-an-adapter rough-edge that
  `docs/notes/reflection.md` had been carrying since the
  pre-release sweep.
- **Date:** 2026-05-12.

## Context

`backend/domain/tag_dsl.py` was less expressive than its surface
grammar suggested: negation was forbidden inside virtual-tag
definitions and recursion was set-flat (definitions stored as
`Set[str]`, so structural information needed for negation was
discarded on first dereference). The plan named both gaps and a
two-arc fix: a pure file split first (`tag_dsl.py` was
structurally an adapter inside `domain/` — Dependency-Rule
violation), then a substitutive macro language on the clean
baseline.

The two-arc shape was a deliberate sequencing call. Arc 1 had
zero open questions; arc 2 had six. Doing the certain thing first
meant arc 2 inherited a known-stable structural baseline and the
PR diffs were each focused on one concern.

## What changed

### Arc 1 — `backend/domain/tag_dsl.py` file split (PR #197)

Pure refactor along the Dependency-Rule boundary. The pure
parser, dereferencer, and DNF normaliser moved to
`backend/domain/tag_dsl_grammar.py` (new — `TagDSLGrammar` base
class; no SQLAlchemy imports). The SQL emitter — `TagDSLCompiler`
itself, plus `_conjunction_to_sql` — moved to
`backend/repositories/tag_dsl_sql.py` (new —
`TagDSLCompiler(TagDSLGrammar)`). `backend/domain/tag_dsl.py`
became a thin facade re-exporting `TagDSLCompiler` so every
existing call site keeps working without import changes.

Behaviour is bit-equal — same compiled SQL, same matched rows.
The subclass shape (`TagDSLCompiler(TagDSLGrammar)`) preserves
direct calls to the underscored grammar methods on
`TagDSLCompiler` instances, which the unit test suite deliberately
exercises.

The facade carries one explicit
`from repositories.tag_dsl_sql import TagDSLCompiler` line — a
deliberate cross-layer reach inside `domain/` for public-surface
preservation, acknowledged in the facade's docstring. The
rough-edge at the *file-content* level (direct SQLAlchemy +
`db.schema` imports inside `domain/`) is closed at this commit;
the facade's cross-layer import is the trade.

The `tag_dsl.py`-is-an-adapter entry in
`docs/notes/reflection.md` was retired in the same commit
window, plus the matching "Known gaps (backend)" bullet in
`docs/handoff-current.md`. `db/schema.py`'s index comment and
`scripts/rigorous_validator.py`'s docstring were updated to point
at the new home of the SQL-emission code.

### Arc 2 — macro language, three caps, AST (PR #198)

Replaced the flat-set virtual-tag model with a substitutive
macro expander over a small frozen-dataclass AST (`Concrete`,
`Virtual`, `Neg`, `Conj`, `Disj`).

**Grammar.** Recursive-descent parser. Admits negation in
virtual-tag definitions (per resolved Q5 — the old "Negation not
allowed in virtual tag definitions" error disappears with the
broken restriction it described), parenthesised grouping (per
resolved Q1 — `($a, $b); $c` and the non-DNF shape
`tag, (a; b)` which the distributor flattens), and the full
existing comma/semicolon/tilde lexicon. Forward declaration is
preserved as the cheap cycle preventer.

**Storage is lazy.** Definitions store the parsed AST with
`Virtual` references intact, not the eagerly-substituted form.
This was a load-bearing decision the plan didn't anticipate:
under eager substitution, a chain `$d1 → $d2 → ... → $dN`
collapses to N independent single-hop substitutions and the D
cap blinds to the chain. Lazy storage means the chain is walked
transitively at substitution time and depth accumulates across
multi-definition chains — the depth-cap semantics the stats
doc's T17 / T20 / S3 cases anticipated.

**Three caps as `PipelineDSLError`-raising guards.** Defaults
hard-coded per resolved Q4:

- **K (definition body length, 256)**: fires inside
  `_parse_definition` via an ephemeral substitution + leaf
  count. Caught at authoring time, not query time.
- **D (recursion depth, 8)**: fires during substitution via a
  depth counter through the reference chain.
- **M (total expansion size, 1024)**: fires **during** DNF
  distribution via a running-count guard, before any large
  intermediate list materialises. Load-bearing for S1's
  9.77M-conjunction stress case (caught at 1025, never
  enumerated to completion). The post-DNF M check in
  `compile_to_subquery` became unreachable once the running
  guard was added and was removed.

**De Morgan applied when substituting `Neg(Virtual)`.** A negated
virtual reference walks the dual of its stored Disj — `~(A OR
B)` becomes `~A AND ~B`; `~(A AND B)` becomes `~A OR ~B`; `~~A`
becomes `A`. Composes cleanly with the rest of the language.

**Test bank.** Driven by the stats-doc test bank
(`docs/card-tag-stats-representative.md` §2.1–§2.6). Tier-1 unit
tests cover the AST shape, cap-boundary acceptance (T15–T17),
cap-violation refusal (T18–T20), sandbox-only stress refusal
(S1–S5), error paths (T21 unknown virtual, T22 forward
reference), smoke cases (T1–T6), and new-grammar features
(T10–T14 plus parentheses + non-DNF distribution). Tier-2
integration tests cover T10–T14 end-to-end against an in-memory
SQLite session via the existing `seeded_session` + `TreeBuilder`
fixture pattern.

**The SQL emitter is unchanged.** `repositories/tag_dsl_sql.py`
consumes the same `{pos: Set[str], neg: Set[str]}` DNF
conjunction shape arc 1 established. Only the orchestration in
`compile_to_subquery` adapts to the new grammar contract
(`_parse_query` returns a `Disj`; `_expand_to_dnf` replaces the
old `_expand_conjunction` loop). The wire shape sent by the
frontend is unchanged — the new grammar is a superset of the
old.

### Reference + REPL (PR #199)

`backend/docs/tag-dsl.md` — concise user-facing reference (~200
lines). Motivation, quick-reference table, BNF grammar, semantics
per construct, virtual-tag definitions, the three caps with the
phase each fires at, six worked examples, brief design rationale,
pointers. Models after `backend/docs/tree-dsl.md`.

`backend/scripts/tag_dsl_repl.py` — interactive playground.
Env-driven `DATABASE_URI` (SQLite or Postgres). Per expression
shows: substituted definitions pretty-printed back to tag-DSL
syntax, the DNF the macro expander produces, optionally
(`--verbose`) the compiled SQL with the tenancy wrapper, matched
card count, sample IDs. `PipelineDSLError` surfaces as a message
without exiting the loop. Also supports `--expr` for one-off
queries and `--user-id` for tenancy override.

## Decisions that differed from the plan

### T10 syntax — comma vs semicolon (the empirical discrepancy)

The design note's Motivation section named
`$attack :- $tactic;~$blocked` with the parenthetical *"intent:
everything in tactic except blocked"*. The stats doc T10's
predicted-cardinality SQL computed `$tactic AND NOT $blocked`.
Under the clean literal grammar arc 2 implements (`;` = OR
everywhere), `$tactic;~$blocked` means `$tactic OR NOT $blocked`
— a much wider expression than the stated intent.

Surfaced during implementation; resolved by the project author
in favour of option 1 (the comma form,
`$tactic, ~$blocked`, which expresses the intent under literal
grammar). The design note's example was updated; the stats doc
T10's expression was updated; the integration test renamed the
OR-form variant to make clear it's documenting literal `;~$x`
semantics, not T10. Both syntaxes parse and execute correctly
under the new grammar; only the comma form computes the
exclusion semantics.

### S4 cap interaction (the "exponential cliff")

The stats doc anticipated D as the load-bearing cap for the
S4 fan-out pattern (`$aN :- $a(N-1);$a(N-1)`) on the assumption
that the AST deduplicates identical Virtual references — under
that assumption, leaves would stay at 2 per level and D=8 would
catch the chain depth first. The arc-2 implementation preserves
duplicate references literally (substitutive, not
dedup-and-substitute), so leaves grow as 2^N and K fires first
at `$a9` (leaf count = 512 > K=256).

Either refusal path is acceptable; the safety contract is "S4
is refused before any large intermediate list materialises", not
"a specific cap is the trigger". The test asserts either K or D
fires.

## Verification

- Full backend suite: 471 passed / 1 skipped / 2 xfailed (was
  442 before arc 2; +29 new tests, no regressions).
- Tier-1 unit (`tests/unit/test_tag_dsl_pure.py`): 63
  assertions covering AST construction, all three cap
  boundaries, sandbox-only stress refusals, smoke cases,
  new-grammar features, closed-defect regressions.
- Tier-2 integration
  (`tests/integration/test_tag_dsl_macro_language.py`): 8
  assertions covering T10–T14 end-to-end with SQL execution.
- Arc-1 integration suite (`test_tag_dsl_qsl.py`,
  `test_tag_filter_repository.py`): 20 assertions still green.
- REPL smoke against `samples/cards.sample.db`:
  - `volatile` → 2204 cards (matches stats-doc predicted 2204).
  - `joseki, shape` → 72 cards (matches predicted 72).
  - T10 canonical with comma → 1000 cards (populated the
    stats-doc `-- (run me to populate)` placeholder).
  - `$nope` → graceful `PipelineDSLError: Unknown virtual tag
    in query: $nope`.

## Doc-graph closure

- `docs/notes/tag-dsl-macro-language-plan.md` →
  `docs/archive/notes/tag-dsl-macro-language-plan.md`; status
  flipped to `design-note: implemented`.
- `docs/TODO.md` "Tag-DSL virtual-tag macro language" entry
  retired with shipped-PR references.
- `docs/handoff-current.md`: arc-1 known-gap bullet retired
  (struck-through with closing reference); roadmap paragraph
  gains a tag-DSL shipped mention alongside the
  hyperparameter-harness shipped paragraph.
- `docs/notes/reflection.md`: rough-edge entry retired with
  closing references; the post-arc-2 successor language updated
  to point at the archived plan + this worklog.
- `docs/card-tag-stats-representative.md`: T10 SQL placeholder
  populated with the verified 1000-card count; cross-reference
  updated to the archived plan path; preamble updated to past
  tense.
- `backend/docs/tag-dsl.md`: "See also" cross-reference updated
  to the archived plan path + this worklog.
