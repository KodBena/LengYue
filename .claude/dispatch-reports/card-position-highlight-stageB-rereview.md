# Re-review: card-position known-position highlight (Stage B) — repair verification

Focused REFUTE re-review of `bork/feat/card-position-highlight-stageb`,
head `beee7215` (repair commits `a1fa5fe4` + merge-of-next `beee7215`),
worktree `.claude/worktrees/card-position-highlight-stageb`. Prior
review (`card-position-highlight-stageB-review.md`) REJECTED on two
findings; this pass verifies the repairs only, per dispatch — the rest
of the branch is not re-litigated. Builder's repair section
(`card-position-highlight-stageB-build.md`, appended) read last.

## VERDICT: REJECT (still) — a third, more serious defect found in the

## repair itself, in the area the builder's own disclosure flagged as "just a bound," not a race

The two originally-rejected findings are genuinely fixed. But probing
the disclosed gap named in the dispatch ("does the perBoard map have a
second, uncensused board-keyed store") turned up more than the
disclosed bound — it's not merely an unbounded-by-content, bounded-by-
board-count memory accumulation. It's a **stale-write race that
resurrects purged cache entries after `closeBoard` has already run**,
independently reproduced below. That is worse than what was disclosed
and is blocking.

---

## 1. Finding 1 (cross-board debounce race) — REPAIRED, verified

`useNodePositionHashes.ts`'s `pending`/`timer`/`notifiedThisEpisode`
are now keyed per `BoardId` in a `perBoard: Map<BoardId,
PerBoardFillState>` (`stateFor(boardId)` mints an entry lazily).
`requestHashFill(nodeIds, state)` and `flush(state)` both resolve
their per-board slot from `state.id`, and the `state` object closed
over by each board's own `setTimeout` callback is stable — a board
switch mid-debounce can no longer merge two boards' pending ids into
one flush, and a switch mid-*flight* of an already-in-progress fetch
is likewise safe: the in-flight `flush(stateA)` call has its own `s =
stateFor(stateA.id)` closure, untouched by a concurrent
`requestHashFill(idsB, stateB)` minting/using a different map entry.
I did not find a path where a resolved batch for board A can write
into board B's cache or vice versa — the isolation claim holds.

**Ran the two ported tests** (`useNodePositionHashes.test.ts`, describe
block `cross-board isolation (review finding 1)`): both pass, 6/6 in
the file.

**Reverted the fix in a scratch copy to confirm red-for-the-right-
reason**: temporarily replaced the per-board `Map` with the original
flat `pending: Set<NodeId>` / `latestState: BoardState | null` shape
(same code shape quoted in the original review) in a throwaway edit,
reran just the two new tests — both failed, one on a call-count
assertion (the merged flush never called `hashPositionsBatch` because
`serializeActivePath` threw first, matching the original review's
root-cause description exactly) and the other on a stale `undefined`
cache read for the board that lost the race. Restored the real fix
immediately after (`git diff` clean, `git status` clean afterward —
confirmed via `git status --short` before moving on).

**Verdict on Finding 1: ACCEPT the repair as stated.**

## 2. Finding 2 (ring collision) — REPAIRED, verified

Merged tree (`TreeWidget.vue`) confirmed to carry all four rings at
distinct radii: active (+3), game-head (+5), review-start (+7,
solid), known-position (+9, dashed) — see the diff excerpt below (`git
diff beee7215^2 beee7215` — i.e., the merge commit's own conflict-
resolution diff, isolating exactly what landed beyond a clean
auto-merge):

```
+          <circle v-if="item.isKnownPosition" :cx="item.px" :cy="item.py" :r="NODE_R + 9" class="known-position-ring" stroke-width="1.5" stroke-dasharray="2,1.5" />
...
           <circle v-if="item.isReviewStart" :cx="item.px" :cy="item.py" :r="NODE_R + 7" class="review-start-ring" stroke-width="1.5" />
```

Both marker template comments cross-reference each other's collision
and resolution. `App.vue` and `FILES.md` diffs are additive-only (new
`useKnownPositionNodes` import/wiring, two new FILES.md rows) — no
dropped hunks from either parent; `backend/domain/errors.py` and
`frontend/src/locales/en.json` auto-merged with zero conflicts (their
additions from each side are non-overlapping). Fill color stays
`--accent-secondary` on both, but shape (dashed vs solid) plus radius
now differentiates them under C18 no-color-only even at full overlap.

**Verdict on Finding 2: ACCEPT the repair as stated.**

## 3. THE DISCLOSED GAP — judged NOT a bound, a REAL correctness race (BLOCKING)

The builder's disclosure (repair section, "Disclosed, not fixed")
frames `perBoard` as: *"accumulates one small entry per distinct
BoardId ever passed to requestHashFill, for the composable's
app-session lifetime... a correctness race, not a leak"* — i.e., they
call it bounded, not a leak, and explicitly say it is *not* a
correctness race, only deferred cleanup.

Reading `frontend/docs/notes/board-scope.md` in full (its headline
invariant: *"Every per-board surface is keyed on `BoardId`, and torn
down when its board exits"*) and `src/store/teardown-registrations.ts`'s
header (the board-completeness test is the actual enforcement — a
per-board `Map` with no registered handler is invisible to it, by
design, since coverage is "a convention, not a proof") confirms the
dispatch's suspicion: `node-position-hashes.ts`'s `nodeHashes` cache
**is** teardown-wired (`purgeBoardNodeHashes` registered as a Class-A-
shaped board-close handler, pinned by
`teardown-registry-completeness.test.ts`). But `useNodePositionHashes.ts`'s
`perBoard` map is a **second, independent board-keyed store — the
fill-orchestration state, not the cache payload** — that the registry
and the board-completeness test cannot see at all. This is exactly the
class board-scope.md names: compare to `analysis-service`'s per-board
maps or `useReviewSession.pendingAnalysisAborts`, both module-scope
`Map<BoardId, …>`s that get **inline** cleanup calls in `closeBoard`
specifically because they're Class-B-shaped (board-derived timing
state, not a simple store cell). `perBoard` here has no such call —
it's not in `BOARD_SCOPED_STORE_CELLS`, not inline in `closeBoard`,
not in the board-completeness test's expected label sets.

**This is not merely a memory-bound question — it's a stale-write race
that undoes `purgeBoardNodeHashes`'s own purge.** `closeBoard` (`store/
index.ts:579`) does NOT clear `board.nodes` before splicing the board
out of `store.boards` — it only removes the board from the array and
runs the registered teardown handlers (which purge the `nodeHashes`
cache while the board is still findable). The `BoardState` object
itself, however, is still live in memory as long as something holds a
reference to it — and `useNodePositionHashes`'s pending `setTimeout`
callback closes over exactly that reference (`() => { void
flush(state); }` in `requestHashFill`, `useNodePositionHashes.ts:128`).
If a board is closed while its fill is still inside the 150ms debounce
window, `closeBoard` runs its purge synchronously, but the orphaned
timer is never cancelled — it fires later, `flush(state)` runs against
the detached-but-still-intact `BoardState`, `serializeActivePath`
succeeds (the object's `.nodes` is untouched by `closeBoard`), the
batch call succeeds, and `cacheNodeHash(id, hash)` writes the result
**back into the shared `nodeHashes` cache for a NodeId belonging to a
board that was already closed and purged** — resurrecting a stale
entry after teardown, not just leaking a few bytes in `perBoard`.

**WITNESSED** via a targeted probe (fake timers, real `store`/
`closeBoard`/`useNodePositionHashes`, mocked `hashPositionsBatch`) — not
committed, scratch-only, deleted after:

```ts
const boardA = createInitialBoard();
const boardB = createInitialBoard();
store.boards.push(boardA, boardB);
fakeBackendService.hashPositionsBatch.mockResolvedValue([HASH_ROOT]);

const { requestHashFill } = useNodePositionHashes();
requestHashFill([boardA.rootNodeId], boardA);

closeBoard(boardA.id);                                  // purge runs
expect(getCachedNodeHash(boardA.rootNodeId)).toBeUndefined(); // confirmed purged

await vi.advanceTimersByTimeAsync(150);                  // orphaned timer fires
console.log('post-close cached value:', getCachedNodeHash(boardA.rootNodeId));
```

Output:

```
post-close cached value: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

The purge is confirmed to have run (`undefined` before the timer
fires), and the value is confirmed resurrected afterward — a direct
violation of `purgeBoardNodeHashes`'s own contract ("must run while
the board is still present in `store.boards`" — the walk itself is
correct, but nothing stops a later write from landing after it).

**Bounded-vs-unbounded, per the umbrella's resource-ownership
checklist:** the `perBoard` map entry itself is bounded per the
builder's own framing (one small object per distinct board ever
opened, session-lifetime). But the **consequence** of the missing
eviction is not "a few stray bytes" — it's a correctness gap in the
purge contract every other per-board cache in this codebase honors,
on a path (switch/close a board mid-fill) the original review already
flagged as "a completely ordinary interaction." A resurrected stale
`ContentHash` entry for a NodeId that belongs to a *closed* board is
low-severity in isolation (NodeIds are UUID-style and don't collide
across boards per the state module's own header, so it can't corrupt
another board's data) — but it is an unambiguous violation of a
codebase-wide invariant (board-scope.md's headline: *torn down when
its board exits*), it is silent (no warning, no failed assertion, just
a stale Map entry nobody expects to be there), and the reviewer's own
tripwire test suite (board-completeness) cannot catch it precisely
because this is a second, uncensused store.

**Ruling: this is a REQUIREMENT, not deferrable prose.** "Deliberately
out of scope" doesn't discharge it — the disclosure undersold the
gap's nature (framed as a bound, not a race), and the race directly
undoes an existing, tested invariant (the board-close purge) rather
than merely accumulating unused memory. The fix does not need to be
elaborate: cancel the pending timer(s) and drop the board's `perBoard`
entry at board-close, via `registerBoardCloseHandler` (the same
mechanism `node-position-hashes.ts` already uses, right next to it) —
a `clearTimeout(s.timer)` + `perBoard.delete(boardId)` on the entry if
present. A regression test mirroring the probe above (assert the
post-close cache stays `undefined` after the orphaned window elapses)
should ship with it.

---

## 4. Gates (all re-run independently in this session)

- **Backend** (`cd backend && ./venv/bin/python -m pytest tests/ -q`,
  worktree venv): `725 passed, 2 skipped, 1 xfailed` — **matches** the
  builder's post-repair number.
- **Frontend, worktree HEAD (`beee7215`) directly**: `npm run build`
  clean; `npx eslint .` exit 0; `npm run test:run` → `121 files (3
  skipped) / 1533 passed, 4 skipped` — matches the builder's report.
- **`next` has moved again since the repair merge**: `git log
  HEAD..next` shows one new commit, `9391f8f8` (style: PBO Bookmarks
  new-btn surface-0 background — frontend-only, unrelated). Trial-
  merged `beee7215` into a fresh detached worktree off current `next`
  (`9391f8f8`): **zero conflicts**, clean auto-merge (23 files
  changed, all from this branch's own diff — nothing from `next`
  needed manual resolution). Re-ran the full frontend suite on that
  trial-merged tree (node_modules symlinked from the real worktree, no
  reinstall): `npm run build` clean, `npx eslint .` exit 0, `npm run
  test:run` → `121 files (3 skipped) / 1533 passed, 4 skipped` —
  identical to the pre-trial-merge numbers, confirming `9391f8f8`
  doesn't interact with this branch's changes.
- Backend pytest was not re-run against the `next`-trial-merged tree
  (the trial-merge worktree had no `venv`); `9391f8f8` is frontend-
  only per its own commit message and the backend diff is unaffected,
  so the worktree-venv run above stands for backend.

## 5. Standing checks on the repair diff (a1fa5fe4 + beee7215's own conflict-resolution hunks)

- `grep`-checked both commits' diffs directly: no `waitForTimeout`, no
  live-port references (`127.0.0.1:876x` or similar), no unniced
  chromium invocation — the repair touched no Playwright/live-witness
  code at all (both fixes are unit-level: a composable's internal
  state shape and a template radius/CSS value).

## Per-claim status, this pass

- Finding 1 (cross-board race): **ACCEPT** — WITNESSED fix, WITNESSED
  red-then-green on revert, tests pass.
- Finding 2 (ring collision): **ACCEPT** — WITNESSED in the merged
  template, both parents' hunks intact, no occlusion at any of the
  four radii.
- Eviction gap: **REJECT-worthy on its own** — WITNESSED as a stale-
  write race that resurrects a purged cache entry after `closeBoard`,
  not merely an unbounded-memory disclosure. Requires the
  `registerBoardCloseHandler` wiring (timer-cancel + map-entry-drop)
  plus a regression test before this can ship.

## Merge steps (once the eviction fix lands)

```
# In the builder's worktree, add the fix:
#   - useNodePositionHashes.ts: registerBoardCloseHandler({ label: '...',
#     run: (boardId) => { const s = perBoard.get(boardId); if (s?.timer)
#     clearTimeout(s.timer); perBoard.delete(boardId); } }) — placed near
#     the existing per-board Map declaration, imported alongside the
#     registerBoardCloseHandler already used in state/node-position-hashes.ts.
#   - Add a regression test mirroring this report's §3 probe (assert
#     getCachedNodeHash stays undefined after the orphaned debounce
#     window elapses, post-closeBoard).
#   - Extend teardown-registry-completeness.test.ts's expected label set
#     for the new registration.
#
# Then, mechanical merge (verified clean in this session):
git worktree add --detach <scratch> next
cd <scratch>
git merge --no-ff bork/feat/card-position-highlight-stageb   # 0 conflicts as of next@9391f8f8
cd backend && ./venv/bin/python -m pytest tests/ -q           # expect 725 passed, 2 skipped, 1 xfailed
cd ../frontend && npm run build && npx eslint . && npm run test:run  # expect 121 files/1533+ passed
```

## Ledger note

Per CLAUDE.md point 12: rejecting again rather than accepting-with-a-
caveat because the eviction gap is load-bearing against an existing,
codebase-wide, tested invariant (board-scope teardown completeness) —
accepting "deferred, document only" here would mean this branch is the
first per-board store in the codebase allowed to skip the teardown
discipline `board-scope.md` states as a headline invariant, on the
strength of a self-report that (in this reviewer's independent
reproduction) undersold what the gap actually does.
