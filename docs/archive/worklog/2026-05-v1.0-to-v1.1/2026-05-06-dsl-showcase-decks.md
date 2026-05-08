/**
 * docs/worklog/2026-05-06-dsl-showcase-decks.md
 * Worklog — three new default deck strategies that showcase
 * distinctive pipeline-DSL primitives (centroid decomposition,
 * heavy-path narrative DFS, two-stage centroid-pool-then-Ebisu).
 * License: Public Domain (The Unlicense).
 */

# DSL-showcase decks — three new default strategies

- **Status:** Shipped on `frontend/dsl-showcase-decks`,
  2026-05-06. Two files touched (defaults + migration); no UI
  changes; build green.
- **Genre:** Default-data addition + schema migration. User
  prompt: "Let's showcase the power of this DSL."
- **Date:** 2026-05-06.
- **Reference:** `backend/docs/tree-dsl.md` is the DSL spec all
  three pipelines target.

## What ships

Three new decks on `defaults.ts::defaultCardSets` plus a backfill
migration (21 → 22) that adds them to existing users' workspaces
without overwriting customisations. The two existing defaults
(`default` BFS+Ebisu, `fringe_first` bottom-up) continue
unchanged.

### `centroid_coverage` — Centroid Coverage

```json
[
  {"stage": "select", "selection": {"type": "SubtreeSelection", "n": 0},
   "ordering": {"type": "centroid_order"}},
  {"stage": "take", "n": 20},
  {"stage": "shuffle"}
]
```

Pure-structural: orders the subtree by centroid decomposition so
each card is one of the maximally-informative samples of the
tree shape. Reviewing 20 cards in this order touches deep nodes
and shallow nodes in proportion to where the structure carries
information, rather than depth-first or breadth-first which both
bias toward one band.

**Pick this when:** getting acquainted with a new game whose SR
scheduler hasn't yet learned what to prioritize. The structural
sample is independent of review history.

The user specifically asked about this primitive when the DSL
was originally designed; the new Forest Directory navigator's
visualisation makes the centroid-decomposition's spatial pattern
visible at last.

### `main_line_first` — Main Line First

```json
[
  {"stage": "select", "selection": {"type": "SubtreeSelection", "n": 0},
   "ordering": {"type": "main_line_first"}},
  {"stage": "take", "n": 20}
]
```

Heavy-path DFS via the `main_line_first` preset — which is
`LexicographicOrder([HeavyPathRankKey, NumReviewsKey])`.
Principal variation surfaces first; sidelines follow in
heavy-path order; within a tier, less-reviewed lines tiebreak
ahead of well-drilled ones. **No final shuffle** — narrative
order is the point. The deck plays as a story.

**Pick this when:** reviewing a game-as-game (a single SGF, a
specific joseki, a complete tactic) rather than as scattered
flashcards. Studying the principal-variation arc end-to-end is
a different mode from spaced-repetition prioritisation.

### `balanced_overdue` — Balanced Overdue

```json
[
  {"stage": "select", "selection": {"type": "SubtreeSelection", "n": 0},
   "ordering": {"type": "centroid_order"}},
  {"stage": "take", "n": 30},
  {"stage": "order", "ordering": {"type": "EbisuRecallKey"}},
  {"stage": "take", "n": 10},
  {"stage": "shuffle"}
]
```

Two-stage combo: pool by centroid coverage (30 structurally-
balanced cards), then re-sort by Ebisu and take the 10 most
overdue. Structurally distinct from the `default` deck —
`default`'s pool is BFS-ordered (shallow bias), so `default`'s
"overdue" set tends to cluster around opening positions the
user has reviewed many times. Centroid-pooling first means the
overdue selection samples deep parts of the tree too.

**Pick this when:** the standard deck feels like it's been
over-exercising the opening. Same SR-priority filter, different
candidate pool.

## Migration 21 → 22

`CURRENT_SCHEMA_VERSION` bumped; one migration appended.
Idempotent and customisation-preserving — each new deck is
added only if its id isn't already present in
`profile.cardSets`. Deck definitions are inlined in the
migration body per the append-only migration discipline (the
migration's behaviour is frozen at ship time; `defaults.ts` may
evolve later without retroactively affecting already-migrated
blobs).

The append-only discipline is the same one the
`backend/docs/tree-dsl.md` reference and the doc's "Common
patterns" section serve: future readers can audit any blob's
history through the migration ledger without needing to find
the version of `defaults.ts` that shipped with each migration.

## Pedagogical layout (why these three)

The five decks now cover a useful taxonomy:

| Deck                | Pool ordering        | Final ordering           | Use case |
|---------------------|----------------------|--------------------------|----------|
| `default`           | BFS (shallow bias)   | Ebisu (overdue first)    | Standard SR, ergonomic. |
| `fringe_first`      | Height + depth       | Random                   | Leaves before parents — drill-the-tactic mode. |
| `centroid_coverage` | Centroid             | Random                   | Structural exposure to a new game. |
| `main_line_first`   | Heavy-path / reviews | Preserved                | Narrative replay of the principal variation. |
| `balanced_overdue`  | Centroid             | Ebisu (overdue first)    | SR priority sampled across the full tree. |

The two "no-Ebisu" decks (`fringe_first`, `centroid_coverage`)
are pure-structural — useful when the SR scheduler hasn't
calibrated yet. The two Ebisu-final decks (`default`,
`balanced_overdue`) differ in their pool: shallow vs balanced,
which is the meaningful axis users will tune across as their
review patterns mature.

## What this PR does NOT do

- **No new DSL primitives.** Everything here is composition over
  existing primitives.
- **No backend changes.** The backend already implements the full
  DSL spec; the frontend just feeds new pipeline JSON.
- **No tag-filtered showcase.** A `filter` selection with a
  `tag_expression` (e.g. `$opening`) was considered and
  deferred — defaults can't reasonably assume specific tag
  schemas, and the user's `knownTags` are personal. Future
  iteration may add a tagged-drill deck once the user-defined
  tag schema stabilises further.
- **No `WeightedSumOrder` showcase.** The DSL's
  `WeightedSumOrder` combinator is real but unit-mismatched
  between integer-valued structural keys and float-valued
  Ebisu scores per the doc's own caveat. Lexicographic
  ordering covers the natural tiebreak case (used in
  `main_line_first`); weighted-sum is left as an advanced
  user-authored option rather than a default.

## Verification

`npm run build` (`vue-tsc -b && vite build`) passes — strict
typecheck happy under the typed `PipelineStage[]` union; all
three new pipelines validate against the generated wire shape
(meaning the DSL primitives I picked are recognised members of
the wire's `Selection` and `OrderKey` unions).

HMR smoke (deferred to user's session — the assistant cannot
visually verify):

- The three new decks appear in the Cards-tab deck dropdown.
- Selecting `centroid_coverage` against a substantial subtree
  produces a balanced-coverage active set in the Lineage
  Explorer (visible spatial pattern: the active marks spread
  across the tree, not clustered).
- Selecting `main_line_first` produces a deck that plays in
  narrative order — the active set traces the principal
  variation depth-first.
- Selecting `balanced_overdue` produces an active set that's
  Ebisu-prioritised but visibly samples deep regions, unlike
  `default`'s shallow-clustering.

Migration round-trip: an existing user's first save after
running this build will stamp `schemaVersion: 22` and add the
three new decks to their `profile.cardSets` (assuming none of
the three ids was already in use).

## License

Public Domain (The Unlicense).
