# Re-review 2: card-position known-position highlight (Stage B) — eviction-fix verification

Focused verification pass of the eviction fix (`ae646328`, stacked on
`beee7215`), implementing `card-position-highlight-stageB-rereview.md`
§3's merge steps exactly. Nothing else from either prior review is
re-litigated.

## VERDICT: ACCEPT

---

## 1. `useNodePositionHashes.ts` — guard covers both the timer and in-flight variants

`perBoard` moved to module scope (was created fresh inside
`useNodePositionHashes()` per call before). A single
`registerBoardCloseHandler({ label: 'node-position-hash-fill:cancel-pending',
run: (boardId) => { ...clearTimeout...; perBoard.delete(boardId); } })`
call sits at the bottom of the file, at module top level — this runs
exactly once, at first module import, not per `useNodePositionHashes()`
call (the function body is now just `return { requestHashFill }`, no
registration inside it). Correct shape: a handler registered inside the
composable body would re-register on every mount/test-instantiation,
which the board-completeness census would (and should) catch as a
duplicate label — this doesn't.

Two failure paths, both checked:

- **Orphaned pending timer** (my original resurrection scenario —
  close happens before the debounce timer fires): the board-close
  handler does `clearTimeout(s.timer)` and `perBoard.delete(boardId)`
  synchronously inside `closeBoard`. Since JS is single-threaded and
  `closeBoard` runs to completion before any timer callback can fire,
  a timer cancelled here never invokes `flush`. Verified — see §3.
- **In-flight fetch past its `await`** (a variant my original probe
  didn't drive, correctly named in the dispatch as the harder case):
  `clearTimeout` cannot reach code already past `await
  backendService.hashPositionsBatch(...)`. `flush`'s continuation
  (both the success branch, before `cacheNodeHash`, and the catch
  branch, before the notify) now checks `if (!perBoard.has(state.id))
  return;` — since the board-close handler deletes the entry
  synchronously at close time, a fetch that resolves after close finds
  its entry gone and discards the result instead of writing back into
  the (already purged) `node-position-hashes.ts` cache or surfacing a
  notice for a board the user no longer has open. Verified — see §3.

One thing I checked and is fine: `stateFor(state.id)` at the top of
`flush` will *re-mint* an entry if called for a `boardId` with no
existing entry (e.g., a legitimately reopened board reusing an id,
which doesn't happen in practice — board ids aren't reused per
`board-factory.ts`). This isn't exercised by the close-race path,
since `flush`'s `const s = stateFor(state.id)` line runs synchronously
before the `await`, i.e., always before `closeBoard` could possibly
have deleted the entry mid-flush (JS is single-threaded — the only way
`closeBoard` can interleave with a `flush` call is during that `await`
gap, which is exactly where the new guard sits). No gap between the
guard and the resurrection path.

**Module-scope registration is the right shape** — confirmed no
duplicate-registration risk: `perBoard` and the `registerBoardCloseHandler`
call are both top-level module statements, executed once per module
instantiation (ES modules are singleton-cached), independent of how
many times `useNodePositionHashes()` itself is called from different
`TreeWidget` mounts or test files importing the module.

## 2. `teardown-registrations.ts` import + census

Confirmed the import-direction claim by reading `node-position-hashes.ts`
(the state module) in full (again, already read in the prior pass):
it imports nothing from `composables/cards/useNodePositionHashes.ts` —
the dependency runs the other way (the composable imports
`cacheNodeHash`/`hasCachedNodeHash` *from* the state module). So the
existing `import '../state/node-position-hashes';` line in
`teardown-registrations.ts` does NOT transitively load the composable
module, and its board-close handler would never register without an
explicit import. The diff adds exactly that:

```
+import '../composables/cards/useNodePositionHashes';
```

with an inline comment stating this same direction-of-import
reasoning. Claim verified correct.

**Ran the census test** (`teardown-registry-completeness.test.ts`):
passes, and its assertion is exactly the "genuinely loads and sees the
handler" check the dispatch asked for — the test imports the real
bootstrap (`teardown-registrations.ts`) and asserts the *actual*
registered label array equals the expected list, which now includes
`'node-position-hash-fill:cancel-pending'`. A green run here is only
possible if the module actually loaded and the handler actually fired
its top-level registration call; confirmed by reverting the two source
files in §3 below, where removing the import made this exact test fail
(label missing from the actual list).

## 3. Regression tests, resurrection repro re-run, and red-on-revert spot-check

**The two new regression tests** (`useNodePositionHashes.test.ts`,
describe block `eviction on board close (re-review REJECT, eviction
gap)`): both pass. Ran alongside the full existing file and the
census test — 12/12 pass
(`tests/integration/useNodePositionHashes.test.ts` +
`tests/integration/teardown-registry-completeness.test.ts`).

**Re-ran my original resurrection repro verbatim** (fake timers, real
`store`/`closeBoard`, mocked `hashPositionsBatch`) against the fixed
tree:

```
post-close cached value: undefined
```

(was `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
before the fix, in the first re-review). Stays purged — the exact
scenario named in the dispatch now holds.

**Red-on-revert spot-check**: `git checkout beee7215 --
src/composables/cards/useNodePositionHashes.ts
src/store/teardown-registrations.ts` in the actual worktree (not a
separate scratch copy — restored immediately after via `git checkout
ae646328 -- <same paths>`, confirmed `git status --short` clean before
and after), then ran the same test files:

```
Test Files  2 failed (2)
     Tests  3 failed | 9 passed (12)
```

The three failures match the defect exactly:
1. `cancels the pending debounce timer on close...` — `hashPositionsBatch`
   called once when it should never have been (orphaned timer fired).
2. `discards an in-flight fetch's result for a board that closed...` —
   cache holds the resurrected hash instead of `undefined`.
3. The census test (`every resource owner registers its board-close
   handler...`) — fails on the expected-vs-actual array comparison
   (the new label absent from the actual registered set, since the
   import was reverted too).

Matches the builder's "3 failures matching the defect" claim exactly.
Restored the fix files; worktree confirmed clean (`git status
--short`, `git diff --stat` both empty) before proceeding.

## 4. Gates

- **Backend** (worktree venv): `725 passed, 2 skipped, 1 xfailed` —
  unaffected (this fix touches frontend only).
- **Frontend, worktree HEAD (`ae646328`)**: `npm run build` clean
  (same pre-existing >500kB chunk warning); `npx eslint .` exit 0, no
  output; `npm run test:run` → `121 files (3 skipped) / 1535 passed, 4
  skipped` — **matches the builder's claimed 1535 exactly**.
- **Trial merge vs current `next`**: `next` has not moved since the
  first re-review's trial merge (still `9391f8f8`). Fresh detached
  scratch worktree off `next`, `git merge --no-ff ae646328`: **zero
  conflicts**, clean auto-merge (23 files, all additive from this
  branch's own diff, same file set as the previous trial merge plus
  the eviction fix's own touched files). Ran the frontend suite there
  (node_modules symlinked, no reinstall): `npm run build` clean, `npx
  eslint .` exit 0, `npm run test:run` → `121 files (3 skipped) / 1535
  passed, 4 skipped` — identical to the pre-trial-merge run. Backend
  gate not re-run against the trial-merge tree (no venv there, same as
  the prior pass) — the worktree-venv run above stands, since nothing
  in `next`'s one new commit (`9391f8f8`, frontend-only style change)
  or in this fix touches backend.

## Final verdict

**ACCEPT.** Both original findings (cross-board race, ring collision)
were repaired and hold under this session's independent
re-verification (unchanged from the first re-review). The eviction gap
raised in `card-position-highlight-stageB-rereview.md` §3 is now fixed
correctly: module-scope `perBoard` with a single board-close
registration covers both the orphaned-timer path (`clearTimeout`) and
the in-flight-fetch-past-`await` path (a post-await `perBoard.has()`
guard in both `flush` branches) — I independently reproduced the
original resurrection bug staying fixed, and independently reproduced
the pre-fix code failing for the right reasons on revert. All gates
green at the exact numbers claimed (725 backend / 1535 frontend), and
the branch merges cleanly into current `next` with the full suite
green there too.

### Merge steps (for the merging session)

```
git worktree add --detach <scratch> next
cd <scratch>
git merge --no-ff bork/feat/card-position-highlight-stageb   # 0 conflicts as of next@9391f8f8, head ae646328
cd backend && ./venv/bin/python -m pytest tests/ -q            # expect 725 passed, 2 skipped, 1 xfailed
cd ../frontend && npm run build && npx eslint . && npm run test:run  # expect 121 files (3 skipped) / 1535 passed, 4 skipped
```

No further changes needed before merge.
