# hash-batch-chunking-fix.md

REPAIR dispatch, ledger row 637. Fixes `useNodePositionHashes.ts`'s
`flush()` sending an entire board's pending NodeId set in ONE
`POST /positions/hash-batch` request. The backend caps a single
request at `config.POSITIONS_HASH_BATCH_MAX` (200,
`backend/core/config.py:211`); a full game tree routinely exceeds
that, so selecting a card 413s the whole fill
(`backend/api/routes/positions.py:121`) and fires the incompleteness
notice — witnessed live by the maintainer minutes after deploy.

Isolated worktree: `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/hash-batch-chunking-wt`
(branch `bork/fix/hash-batch-chunking`, off `next`, not pushed). Ports
4173/5173/5174/8764 and the main checkout were never touched.

## The fix

`frontend/src/composables/cards/useNodePositionHashes.ts`:

- New `HASH_BATCH_MAX_ITEMS = 200` — hand-mirrors backend
  `config.POSITIONS_HASH_BATCH_MAX` (no shared source across the
  frontend/backend boundary; the file header now names the drift risk
  explicitly: raising the backend cap without raising this one only
  wastes round trips, lowering it without lowering this one reopens
  the 413).
- New pure `partitionIntoChunks(ids)` splits an id list into
  consecutive chunks of at most `HASH_BATCH_MAX_ITEMS`.
- `flush()` now loops over the chunks and awaits each
  `hashPositionsBatch` call **sequentially** (never `Promise.all` —
  the existing 150ms debounce already coalesces a burst into one
  flush; firing every chunk of a huge fill concurrently would still
  hammer the backend). Each chunk's results are cached the instant
  that chunk lands.

## Partial-failure semantics (ADR-0002)

- A chunk that succeeds **before** a later chunk fails keeps its
  cached results — they are correct, and wiping them on a later
  failure would be a second, needless silent-data-loss bug.
- The existing once-per-episode failure notice (`notifiedThisEpisode`,
  per-board) still fires **exactly once** per flush's failure, at the
  first failing chunk; the loop then stops issuing further chunks for
  that flush (no retry storm against a still-down backend within the
  same flush).
- The failed chunk's ids (and any never-sent chunk after it)
  deliberately are **not** re-added to `s.pending` — that set was
  already drained at the top of `flush`, and `requestHashFill`'s own
  dedup logic treats "already in pending" as "already scheduled,"
  which would leave them stuck with no live timer. Instead they are
  simply left un-cached: `TreeWidget`'s `watch` re-fires
  `requestHashFill` on every `nodeList` recompute, and `hasCachedNodeHash`
  naturally filters to just the gap on that next call, so **retry
  covers only the uncached remainder**, never the whole set again.
  This is the existing pending/dedup logic doing the right thing
  as-is — no new re-request bookkeeping was needed.
- **Board-close guard, per chunk (not per flush).** The
  `perBoard.has(state.id)` check now runs at the top of every loop
  iteration (before dispatching that chunk) in addition to its
  existing post-await placements. A close landing between chunk N and
  chunk N+1 stops the loop before N+1 is ever sent. Note: `closeBoard`
  synchronously purges **every** cache entry for that board
  (`purgeBoardNodeHashes`, pre-existing, unchanged) — so a close also
  wipes chunk N's already-landed results, same as it always has for
  any other cache entry. This fix's job is narrower and correctly
  scoped: never resurrect a purged entry, and never dispatch a chunk
  for a board that's already gone.

## Tests — red then green

Extended `frontend/tests/integration/useNodePositionHashes.test.ts`
with a helper (`addSiblingNodes`) building N synthetic root-child
nodes on a `BoardState`, and three new tests under "chunked flush
(ledger row 637)":

1. **`a fill over HASH_BATCH_MAX_ITEMS issues ceil(N/200) requests
   with correct partitioning and all results cached`** — 250 ids ->
   asserts exactly 2 calls, lengths `[200, 50]` in order, and every id
   cached.
2. **`a mid-sequence chunk failure keeps the earlier chunk's results,
   notifies once, and a later fill retries only the gap`** — chunk 1
   (200) succeeds, chunk 2 (50) rejects; asserts chunk 1's 200 ids
   stay cached, chunk 2's 50 stay uncached, exactly one notice fires,
   then a second `requestHashFill` with the SAME 250-id list issues a
   **third** call of length 50 (only the gap) and completes the fill
   with no additional notice.
3. **`a board close between chunks stops issuing further chunks and
   never resurrects a purged entry`** — 450 ids (3 chunks: 200/200/50);
   chunk 2's mock calls `closeBoard` as a side effect (modelling a
   close landing while chunk 2 is outstanding); asserts chunk 3's mock
   (which throws if invoked) is **never called** (exactly 2 calls
   total) and every id — including chunk 1's, which had already
   landed — stays purged, matching `closeBoard`'s existing
   whole-board-purge contract.

**WITNESSED red-then-green**: stashed only the composable change
(kept the new tests), reran — all 3 new tests failed with `expected
"vi.fn()" to be called 2 times, but got 1 times` (the pre-fix
single-request `flush` never issues a second call). Restored the fix;
all 3 pass. Full suite run below is the fix-applied state.

```
 RUN  v4.1.5 .../hash-batch-chunking-wt/frontend
 Test Files  1 passed (1)
      Tests  11 passed (11)
```
(`useNodePositionHashes.test.ts` alone — 8 pre-existing + 3 new, all
green; pre-existing debounce/coalesce, failure-honesty, cross-board-
isolation, and eviction-on-close tests are unmodified and still pass,
confirming no regression to the board-scoping or eviction guarantees
this composable already carried.)

## Gates — WITNESSED

- `npm run build` (`vue-tsc -b && vite build`) — **WITNESSED green**.
  1113 modules transformed, build succeeded. (Pre-existing chunk-size
  warning on `dist/assets/index-*.js` >500kB is unrelated to this
  change — the app's overall bundle, not this composable.)
- `npx eslint .` — **WITNESSED clean**, no output, exit 0.
- `npm run test:run` (full suite) — **WITNESSED green**: `Test Files
  121 passed | 3 skipped (124)`, `Tests 1538 passed | 4 skipped
  (1542)`. No failures anywhere in the tree.

## Summary

`useNodePositionHashes.flush()` now chunks a board's pending NodeIds
into `≤200`-item batches (mirroring backend
`config.POSITIONS_HASH_BATCH_MAX`), awaits each chunk sequentially,
and keeps every earlier chunk's cached results on a later chunk's
failure — fixing the 413-on-a-full-tree-selection defect (ledger row
637) without regressing the board-scoping or eviction guarantees the
composable already carried through two prior review rounds.

Branch head: `bork/fix/hash-batch-chunking` @ `29109111` (worktree at
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/hash-batch-chunking-wt`,
not pushed).

Gates: `npm run build` WITNESSED green · `npx eslint .` WITNESSED
clean · `npm run test:run` WITNESSED green (1538 passed, 4 skipped,
0 failed).
