# Board scope — the per-`BoardId` tenancy of the SPA

The frontend analog of the backend's per-user tenancy note. Where tenancy
answers "which rows belong to this user", board scope answers "which reactive
state belongs to this board" — but note the load-bearing difference up front:
**board scope is pure partitioning, not a trust boundary.** All boards are one
user's own data; there is no adversary, no `WHERE user_id =` analog. So this
note is about *organisation and lifecycle* (key it right, tear it down), never
about *visibility* (board A may freely read board B — the tab strip does).

## The headline invariant

> Every per-board surface is keyed on `BoardId`, and torn down when its board
> exits (`closeBoard`) or the workspace resets (`resetWorkspace`).

If you add state that means something different for each board, it is per-board
and owes both halves: a key and a teardown. A per-board surface with no
teardown is a tombstone leak (it round-trips to the backend through
SyncService forever); the failure is silent, which is why the discipline is
written down.

## The scope families

The SPA has three scopes. Only the first is the subject of this note:

- **per-board** (`BoardId`) — review session, card-tree forest, analysis
  ledger/subscriptions, `activeMode`, navigator selection. Pure partitioning.
- **per-node** (`NodeId` / `configHash`) — analysis packets, stability
  trajectories. Also pure partitioning; board-*derived* (a board owns its
  nodes), which matters for teardown (below).
- **per-identity** (user) — the one visibility-grade scope (clear-on-identity-
  flip; the `tenancy-instance-cache-leak` class). Handled by
  `IDENTITY_SCOPED_CACHES` + `resetWorkspace`, not here.

## The type-level signal: `PerBoard<T>`

```ts
export type PerBoard<T> = Partial<Record<BoardId, T>>;
```

`grep 'PerBoard<'` enumerates every per-board *store* surface. `Partial<>` (not
bare `Record<>`) is deliberate — it keeps indexed reads honest about the
`undefined`-after-delete contract (ADR-0001/0002). It is a *spec*, not an
enforcement: a `PerBoard<T>` field with no `closeBoard` teardown still
typechecks. The guarantee comes from the test (below), not the type.

## Canonical per-board surfaces

| Surface | Where | Teardown |
|---|---|---|
| `session.reviews` | `GlobalStore` (`PerBoard`) | `BOARD_SCOPED_STORE_CELLS` |
| `engine.activeMode` | `GlobalStore` (`PerBoard`) | `BOARD_SCOPED_STORE_CELLS` |
| `session.ui.cardTreeNav` | `GlobalStore` (`PerBoard`) | `BOARD_SCOPED_STORE_CELLS` |
| `session.ui.forestNav.selection` | `GlobalStore` (`PerBoard`) | `BOARD_SCOPED_STORE_CELLS` |
| board-card-trees slot | module-scope `Map<BoardId,…>` | `removeBoardCardTree` (inline) |
| analysis-service per-board maps | module-scope | `stopBoardAnalysis` (inline) |
| `useReviewSession.pendingAnalysisAborts` | module-scope `Map` | `abortBoardReview` (inline) |
| analysis ledger / stability / thumbnails | per-node (`configHash`/`NodeId`) | `purgeBoard` — walks `board.nodes` (inline) |

## Two teardown classes (why teardown isn't one registry)

- **Class A — board-*keyed* store cells.** Teardown is `delete map[boardId]`.
  Mutually order-independent. These are collapsed into the
  `BOARD_SCOPED_STORE_CELLS` registry (`store/index.ts`) — the board analog of
  `IDENTITY_SCOPED_CACHES` — which `closeBoard` drains.
- **Class B — board-*derived* node-keyed purges.** The ledger / stability /
  thumbnail stores are keyed on `(configHash, nodeId)`, not `BoardId`. Their
  teardown *walks `board.nodes`* and so **must run while the board is still in
  `store.boards`** — before the splice. These stay inline in `closeBoard`,
  explicitly ordered. Folding them into a registry would move that ordering
  knowledge from documented code into array position — a legibility regression
  for no safety gain.

So the registry is bounded to Class A on purpose (board-scope audit P1b; the
scope-exhaustiveness consult under the umbrella `docs/notes/consult/`).

*(2026-06-11: the keep-Class-B-inline judgment above rests on the 2026-06-05
consult's ADVISORY verdict, not a maintainer decision — prior records
overstated its authority. The Class B teardown shape is an open question,
tracked as work-status item `closeboard-class-b-teardown-shape` (parked;
owner-located teardown is a named candidate).)*

**TypeScript cannot enumerate "every per-board surface" to demand each is torn
down** — so the registry's coverage is a *convention*, not a proof. The
board-completeness test (`tests/integration/store-mutators.test.ts`) verifies the
registry drains correctly and per-board, and tripwires its coverage list so it
can't change un-deliberately; it does **not** independently catch a newly-added
cell that was never registered (that would need a lint rule the consult judged
not worth building for a non-leak). So adding a per-board surface is a
discipline step — register it, populate-and-assert it in that test — not an
automatically-guarded one.

## The authoring recipe

When you add per-board state:

1. **Key it on `BoardId`.** A store cell → `PerBoard<T>`. A module cache →
   `Map<BoardId, T>`.
2. **Tear it down.** A Class A store cell → add it to
   `BOARD_SCOPED_STORE_CELLS` (and its label list). Anything ordering-bound or
   node-derived (Class B) → an explicit, commented call in `closeBoard`, placed
   relative to the engine-stop and the splice.
3. **Reset it.** A `GlobalStore` cell is covered by the `defaultSessionUI` /
   `session` reset in `resetWorkspace`; a module cache that is *also*
   identity-scoped registers in `IDENTITY_SCOPED_CACHES`.
4. **Migrate it.** A new persisted `GlobalStore` shape needs a `migrations.ts`
   step (and the rolling-archive move).
5. **Assert it.** Extend the board-completeness test.

`cardTreeNav` is the clean worked example; `forestNav.selection` (below) is the
second.

## Name the scope of each axis (the `forestNav` lesson)

A surface can carry axes of different scope. `forestNav` bundles two:

- `expanded` — **workspace-global.** The navigator tree is the user's whole
  library; collapsing a game on one board must not re-expand it on another.
- `selection` — **per-board** (`PerBoard<NavSelection>`, schema 59). It drives
  each board's right-pane Lineage Explorer.

The original field was wholly global, and the global `selection` driving a
per-board pane was the scope collision behind the card-metadata-during-review
bug. The fix (P0) re-scoped *only the selection axis* — not "mirror
`cardTreeNav` wholesale", which would have wrongly per-boarded the global
expansion. When you add a navigator-style field, decide the scope of each axis
deliberately; don't inherit a neighbour's shape by reflex.

## A per-board slot with three producers (the card-tree slot)

The per-board card-tree slot (`board-card-trees.ts`) is written by **three**
producers — the deck pipeline (`runPipeline`), the review session
(`seedFromQueue`), and the navigator browse (`loadBrowse`/`loadBrowseForest`) —
but has **one persist-relevant** clearer — the browse policy's null-selection
`clearBrowse` (board-close `removeBoardCardTree` and identity-flip
`clearAllBoardCardTrees` also clear, but tear the whole slot down, correctly,
regardless of `source`). With no arbitration they raced: on a top-level tab switch `ForestDirectory` unmounts
and remounts, the policy's `immediate` watch re-fires with a null selection, and
`clearBrowse` wiped whatever the slot held — pipeline-preview *or* review
content — while `seedFromQueue`'s idempotent short-circuit wouldn't restore it.
(A *board* switch keeps `ForestDirectory` mounted, so it didn't reproduce — the
tell that this is a remount/producer problem, not a scope one.)

The arbitration is **ownership**: the slot carries a `source`
(`'browse' | 'matched' | null`) stamped by whichever producer last populated it
(`'matched'` covers pipeline *and* review — they share the
`populateSlotFromMatched` seam), and `clearBrowse` clears ONLY `'browse'`-owned
content. One discriminator fixes all three producers at once — and a future
producer that forgets to stamp inherits `null` ownership and is left alone, so
the forget-failure is *persists* (safe), never *vanishes*.

For the card-tree slot this ownership pattern is now **lint-enforced**: a custom
ESLint rule (`local/clear-needs-ownership`, in `eslint-rules/`) flags any
function in `useCardTreeData.ts` that empties the slot (`reset()` or
`.forest = []`) without consulting `source` or calling a repopulator — it fires
on the literal shape of the shipped bug (verified by reintroducing the blind
clear), and a RuleTester test keeps the guard from being edited into a no-op.
The rule is configurable, so a second owned multi-writer slot adds another
`files`/`options` block in `eslint.config.js`. Across the *class* the guarantee
is still a convention until each such slot opts in — nothing stops a brand-new
per-board slot from reintroducing the shape before anyone wires the rule to it.
(Other `PerBoard<T>` cells today are single-writer or have ownership-respecting
clearers, so there is no live twin.) The discipline remains: reach for an owner
when you add the second writer.

The lesson — and the mistake the first cut of this fix made: when a per-board
surface has more than one writer, give it an **owner**, not a per-writer guard.
The first fix gated the clear on `isReviewActive` — which covered the review
producer but not the pipeline producer, so the forest still vanished when
previewing lineage relations outside a review. The ownership model is the
producer-count-independent form that the reported symptom (review only) had
hidden. Reach for the owner, not the special case.

License: Public Domain (The Unlicense).
