# closeBoard purges the thumbnail cache (O4)

- **Status:** Shipped on `frontend/closeboard-purges-thumbnails`,
  2026-05-04. Build green.
- **Genre:** Bug fix — bounded memory leak; resource-ownership
  audit O4. Last open closeBoard-owner pair.
- **Date:** 2026-05-04.

## Context

The Pass-1 inventory's O4:

> `useThumbnailCache` module-scope cache entries (`Map<string, string>`
> keyed `${nodeId}:${showMarker}`) for the closed board's nodes |
> Does the cache evict on board close? | Memory leak per-SVG.
> Cache is a module singleton with no per-board purge affordance —
> Pass 2 needs to add one (`purgeBoard(boardId)` on the composable
> surface) and call from `closeBoard`.

The cache stores rendered board-thumbnail SVGs, keyed by NodeId
plus a showMarker boolean. NodeIds are UUID-style; cross-user
collision is functionally impossible, so this is memory hygiene
not a privacy concern (unlike O10's CardId-keyed cache).

This PR closes the last open closeBoard-owner pair. After it,
the closeBoard owner is fully swept (O1, O2+O3, O4, O5 — plus
O6 closed by verification in PR #126).

## What changed

### `frontend/src/composables/useThumbnailCache.ts`

Two edits:

1. **New export `purgeBoardThumbnails(boardId)`**. Walks
   `board.nodes` keys (so it must be called while the board is
   still present in `store.boards` — closeBoard's ordering
   discipline ensures this), and deletes both
   `${nodeId}:true` and `${nodeId}:false` cache entries for
   each. `Map.delete` on a missing key is a no-op, so the
   purge is safe when entries weren't cached.

2. **File-header docstring** rewritten to describe the cache
   lifetime as identity-scoped with per-board purge on
   closeBoard, and to clarify that the identity-flip cleanup
   (would-be O9) is deferred per the audit's bounded-memory-
   hygiene framing for UUID-keyed caches.

### `frontend/src/store/index.ts`

Three small edits:

1. **New import**: `purgeBoardThumbnails` from
   `'../composables/useThumbnailCache'`. Same import-from-
   composables pattern as the other audit-driven cleanups
   (`clearCardThumbnailCache` from useCardThumbnail,
   `abortBoardReview` from useReviewSession).

2. **closeBoard body**: one new line:

   ```ts
   purgeBoardThumbnails(boardId);
   ```

   Placed after the abort and before the board-removal splice.
   The ordering comment in the docstring names the constraint:
   `purgeBoardThumbnails` looks the board up in `store.boards`,
   so it MUST run before the splice removes it.

3. **closeBoard docstring**: grows from "Five cleanups" to
   "Six cleanups", with O4 named in the audit-pair list.

## Why the call ordering puts purgeBoardThumbnails after the deletes

The cleanup block now reads:

```ts
analysisService.stopBoardAnalysis(boardId);  // O1 / C1
ledger.purgeBoard(boardId);                   // O1 main
delete store.session.reviews[boardId];        // O2
delete store.engine.activeMode[boardId];      // O3
abortBoardReview(boardId);                    // O5
purgeBoardThumbnails(boardId);                // O4 (this PR)
```

The audit-pair numbering doesn't dictate call order; the
runtime constraints do:

- `stopBoardAnalysis` must run before `ledger.purgeBoard` — see
  closeBoard's ordering rationale (in-flight packets between
  the two would re-populate the ledger).
- The dictionary deletes can run anytime relative to the others.
- `abortBoardReview` runs after the deletes so the catch path's
  attempt to mutate `reviews[boardId]` (via lazy
  `mutateReviewSession`) can't briefly resurrect the row. Wait
  — actually the abort makes the catch take the 'aborted'
  branch which silent-returns; no mutateReviewSession. So
  abort-after-delete vs abort-before-delete is moot. Placing
  abort after the deletes matches my mental model of "release
  resources, then signal cancellation."
- `purgeBoardThumbnails` must run before the splice (it reads
  `board.nodes`). Anywhere before the splice works; placed
  last among the cleanups so the audit-pair grouping is
  visually clean.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual reproduction: open several boards, navigate each so
  thumbnails populate (sidebar warm-path triggers
  `getThumbnailSvg` for every node), then close one. Pre-fix:
  inspect `cache.value.size` — entries for the closed board's
  NodeIds remain. Post-fix: those entries drop, surviving
  boards' entries unchanged.
- Non-regression: thumbnails on surviving boards still render
  cleanly (their cache entries weren't touched). Closing a
  board with no rendered thumbnails is a clean no-op
  (`Map.delete` on missing keys is a no-op).

## Forward notes

closeBoard owner sweep is complete. After this PR:

- O1 (analysis subscription + ledger) — closed (#119, #120).
- O2 (reviews row) — closed (#125).
- O3 (activeMode tombstone) — closed (#125).
- **O4 (thumbnail cache) — closed (this PR).**
- O5 (review-wait abort) — closed (#126).
- O6 (subscribers verification) — closed by verification (#126).

Identity-flip owner status:

- O7, O10, O11 closed.
- O8, O9 still open. Both bounded memory hygiene with low
  collision risk (UUID-keyed). Audit's disposition is
  "either flush on resetWorkspace or document the deferral
  with the same WS-disconnect 'revisit when' trigger."

Component lifecycle owner: closed (#123, #124).

Engine WS reconnect owner: O15 closed by verification (#126).

**13 of 15 pairs closed. Two remain open: O8 (analysisLedger
flush on resetWorkspace) and O9 (useThumbnailCache flush on
resetWorkspace).** Both are pure memory-hygiene candidates
with no correctness or privacy concern.

Recommended for the remaining sweep: either ship one more PR
adding `purgeAll` affordances to the ledger and useThumbnailCache
and wiring them into resetWorkspace (matches the
clearCardThumbnailCache + abortAllReviews patterns from this
session), OR document the deferral in deferred-items.md
alongside the existing analysisService.disconnect deferral.
The deferral framing is defensible because both are bounded
across an SPA session and don't compose with any
correctness or privacy story.

After the remaining two pairs close (or are explicitly deferred),
Pass 3 — the forward-authoring discipline — closes the audit.
The recurring shape Pass 3 codifies (per Pass-1 closeout):
"per-entity Map/Set state in a service or composable singleton
reliably gets a dispose/disconnect cleanup path, but
inconsistently gets an entity-removal cleanup path." The audit
plan's "Pass 3 — Forward-authoring discipline" section sketches
the inline-comment convention and the authoring checklist.
