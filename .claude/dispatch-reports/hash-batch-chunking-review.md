# hash-batch-chunking-review.md

FOCUSED REVIEW, ledger row 637. Branch `bork/fix/hash-batch-chunking` @
`29109111`, worktree
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/hash-batch-chunking-wt`
(verified genuine `git worktree` of `/home/bork/w/omega`, branched off
`dab7f993`). Builder report read last, per instructions:
`.claude/dispatch-reports/hash-batch-chunking-fix.md`.

## VERDICT: ACCEPT (with one documentation nit — not blocking)

## The retry-gap ruling (VERIFY item asked to settle this)

**WITNESSED correct.** The builder's claim holds: a chunk that fails does
NOT get its ids re-added to `s.pending` inside `flush`'s `catch` block —
`s.pending` was already drained at the top of `flush`, and re-adding
without re-arming a timer would leave them inert (`requestHashFill`'s own
dedup treats "already in `pending`" as "already scheduled" and skips
re-arming a timer for them). The actual retry path is: the failed/unsent
ids simply stay un-cached, and `TreeWidget.vue`'s `watch(nodeList, ...)`
(lines 348–352) fires on every `nodeList` recompute — Vue's default
`watch` uses reference (`!==`) comparison against the watched value, and
`nodeList` is a `computed` that returns a **new array** on every
recompute (`TreeWidget.vue:287`), so the watch callback re-fires on any
recompute, not just a structural tree change. Each re-fire calls
`requestHashFill` with the same bounded id set; `hasCachedNodeHash`
filters out everything the earlier, successful chunks already cached, so
only the still-uncached gap gets re-added to a fresh `pending` and a
fresh timer. **No permanent suppression exists** — `notifiedThisEpisode`
gates the *notice*, not re-scheduling, and nothing else (no other flag)
touches whether an id can re-enter `pending`. This was witnessed directly
in test 2 ("a mid-sequence chunk failure... a later fill retries only
the gap"), which drives a real second `requestHashFill` call and asserts
the retry request has length 50 (only the gap) — not a mocked-out
assertion of intent.

**Nit — self-contradictory documentation (fix, don't reject on):** the
new file-header block "Chunked partial-failure semantics" states the
un-cached ids **"go back into `s.pending`"** — this is factually wrong
and contradicts the code-level comment three paragraphs below it in the
*same diff*, which correctly says the ids are **"deliberately NOT
re-added to `s.pending`."** The header's stated mechanism is wrong even
though its stated *conclusion* ("the NEXT `requestHashFill` naturally
re-requests exactly the gap") happens to still be true by the actual
(different) mechanism. This is exactly the kind of drift ADR-0017 (Zero-
Context Reader) exists to catch: a future reader who trusts only the
header (a very reasonable thing to do) walks away with a wrong model of
how retry works. Recommend a one-line fix to the header prose before
merge — swap "go back into `s.pending`" for something matching the code
comment (e.g., "are simply left un-cached; the next natural
`requestHashFill` call re-adds them"). Not REJECT-grade: it is a doc-only
inconsistency, not a functional defect, and the runtime behavior verified
above is correct and covered by a real (not mocked-intent) test.

## Verification performed

1. **Partition math.** `partitionIntoChunks` (`useNodePositionHashes.ts`,
   new function) traced by hand: 200 items -> one chunk of 200 (loop
   condition `i < ids.length` stops after `i=0`, no spurious empty
   second chunk); 201 items -> `[200, 1]`; last chunk is whatever
   `slice` leaves, always ≤200. **Sequential, not parallel:** the flush
   loop is a plain `for` with `await backendService.hashPositionsBatch`
   inside it — no `Promise.all`/`Promise.allSettled` anywhere in the
   diff. **Per-chunk `perBoard.has` guard on both paths:** present at
   the top of every loop iteration (pre-dispatch), again immediately
   after a successful `await` (before caching), and again at the top of
   the `catch` block (before notifying) — three checkpoints per chunk,
   confirmed by reading the diff directly. **Loop-stop on close:** the
   top-of-loop guard does `return`, not `continue`, so a close between
   chunks N and N+1 stops the entire flush, never dispatching N+1.

2. **The three new tests — run and reverted.** Ran
   `npx vitest run tests/integration/useNodePositionHashes.test.ts` in
   the worktree: **WITNESSED 11/11 passed** (8 pre-existing + 3 new).
   Then `git checkout dab7f993 -- src/composables/cards/useNodePositionHashes.ts`
   (reverting only the source fix, keeping the new tests) and reran:
   **WITNESSED 3/3 new chunking tests RED**, each failing with `expected
   "vi.fn()" to be called 2 times, but got 1 times` — the pre-fix single-
   request `flush` never issues a second call, exactly as claimed.
   Restored via `git checkout HEAD -- ...`; `git status --short` clean
   afterward — no stray diff left in the worktree.

3. **Prior-round guarantees still hold.** Same test run (full file, 11
   tests) includes the untouched eviction-on-close tests ("cancels the
   pending debounce timer on close...", "discards an in-flight fetch's
   result for a board that closed while the fetch was outstanding...")
   and the cross-board-isolation tests — **all still pass**, unmodified.

4. **Notice semantics — once per episode, not once per chunk.**
   Confirmed by code path: the `catch` block calls `pushSystemMessage`
   and then unconditionally `return`s, so a single flush can trip the
   notice at most once (the first failing chunk ends the flush
   immediately — there is no scenario where two chunks in the same
   flush both reach the `catch` block). Test 2 explicitly drives a
   250-id fill with chunk 1 success / chunk 2 failure and asserts
   `store.engine.messages.length` is `1` — WITNESSED passing.

5. **Gates — WITNESSED in the worktree (matches builder's claims):**
   - `npx eslint .` — clean, exit 0.
   - `npm run build` (`vue-tsc -b && vite build`) — green, 1113 modules.
   - `npm run test:run` — **1538 passed | 4 skipped (1542)**, matches
     builder report exactly.

6. **Trial-merge vs current `next` (mandatory per brief — `next` moved
   past this branch's `dab7f993` base, picking up setup-stones-toolkit
   and the prev-card hotkey merge).** Built a detached worktree at
   `next` (`04e4d491`) and ran `git merge --no-commit --no-ff
   bork/fix/hash-batch-chunking`: **auto-merge succeeded, zero
   conflicts**, and the merge touched only the two expected files
   (`useNodePositionHashes.ts`, its test file) — confirmed via `git diff
   --cached --stat`. Ran the full suite there:
   **WITNESSED 1575 passed | 4 skipped (1579)**, in line with the
   brief's "~1572-ish" expectation (the extra tests come from `next`'s
   own newer merges). `npx eslint .` clean there too. Merge aborted and
   trial worktree removed afterward — no residue.

7. **Standing.** No `waitForTimeout`/`chromium`/Playwright usage
   anywhere in the touched test file — fake timers
   (`vi.advanceTimersByTimeAsync`) throughout, consistent with the rest
   of this composable's existing test style. Proportionality: exactly 2
   files touched (the composable + its test file), matching the diff
   stat (`git diff dab7f993 29109111 --stat`).

## Findings summary

- No functional defects found. The retry-gap concern the brief asked to
  settle is **not a bug** — verified against the actual dedup/watch
  mechanism, not just the builder's self-report.
- One doc-only nit: the new file-header prose in
  `useNodePositionHashes.ts` ("Chunked partial-failure semantics")
  misdescribes the retry mechanism and contradicts the code comment
  three paragraphs later in the same diff. Worth a one-line fix before
  or shortly after merge; does not block ACCEPT.
