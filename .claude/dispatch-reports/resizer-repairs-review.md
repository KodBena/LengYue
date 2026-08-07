# Resizer rearchitecture — focused re-review of the four repairs

Reviewer: dispatched focused re-review agent (REFUTE posture on the repairs
only — the architecture itself was already accepted by the prior
fresh-context review, `resizer-rearchitecture-review.md`, and is not
re-litigated here). Branch `worktree-agent-aea2fabfe830f1b89`
(worktree `/home/bork/w/omega/.claude/worktrees/agent-aea2fabfe830f1b89`),
head `b0ded2f8` (repair commits `7fd0b499`, `033c1604`, `b0ded2f8`), against
`next` head `b2e6de10` (one merge — the browse-leak-fix closure — ahead of
`033c1604`'s own merge parent, `b5732042`; the coordinator's flag that `next`
had already taken schema version 65, `browse-leak` `forestNav`-clear, is
confirmed).

Every claim below is **WITNESSED** (with the observation), or **UNEXERCISED**
(with the concrete blocker). The build-report addendum
(`.claude/dispatch-reports/resizer-rearchitecture-build.md`, in the worktree)
was read first per the charter, then verified independently rather than
trusted.

---

## VERDICT: ACCEPT

All four repairs hold up under independent re-verification, own-run gates,
and an own-run trial merge against **current** `next` (not the stale
`b5732042` snapshot the branch's own merge commit used). One new, small
merge conflict surfaced against current `next` (the schema-version collision
the coordinator had already flagged) — mechanically resolved below, with the
exact recipe a merging session should follow. One documentation nit
(pre-existing, not introduced by this branch) is noted but does not block.

---

## 1. `touchSession()` at both resizer write sites — WITNESSED, own red-then-green

Confirmed both write sites in `useResizablePanel.ts` (`onMouseMoveInner`,
`onMouseMoveOuter`) call `touchSession()` immediately after their store
write, and the file header prose was updated to describe the current
(shallow-`sessionVersion`-counter) reality rather than the stale deep-watch
claim.

`tests/integration/sync-session-version.test.ts` was extended with a new
`describe('SyncService save-coverage — resizer-rearch nested-splitter
(ledger row 391/414, review §2)')` block, two cases, both driving the
**production** `useResizablePanel()` handlers end-to-end via synthetic
`mousedown`/`mousemove`/`mouseup` (not an inline store write) through the
real `SyncService` watcher → debounce → stubbed-fetch `PUT` path.

**I performed my own red-then-green witness**, not the builder's transcript:
green baseline (`npx vitest run tests/integration/sync-session-version.test.ts`
→ 15/15 passed) → `sed -i '/^\s*touchSession();\s*$/d'` deleted both call
sites from a live copy of `useResizablePanel.ts` in the worktree → re-ran →
**both new cases failed** (`AssertionError: expected false to be true`,
exactly the two `it(...)` blocks added for this repair, nothing else red) →
restored the file from a pre-edit backup (`git diff --stat` confirmed zero
diff after restore) → re-ran → 15/15 passed again. Red for the right reason,
at the right site, cleanly reverted.

## 2. The 8-file merge composition (`033c1604`) — WITNESSED, correctly composed

Diffed the merge against both parents (`git diff 7fd0b499 033c1604 --
<file>` and `git diff b5732042 033c1604 -- <file>` for each of the 8
conflicted files):

- **`migrations.ts` / `archived-migrations.ts` / `migrations.test.ts`**:
  renumbered exactly as disclosed — resizer-strip `61→62` → `64→65`,
  `CURRENT_SCHEMA_VERSION` → 65, `next`'s independently-shipped `62→63`
  (`highContrastText`) moved into the archive. Confirmed the archive header
  count (62 entries, `1→2` through `62→63`) matches an actual grep-count of
  `// N → N+1` markers in `archived-migrations.ts` (excluding two unrelated
  prose cross-references inside the 59→60 body's comment, which are not
  migration headers). Active file holds exactly two migrations post-merge.
  Test block renumbered `step(61)` → `step(64)` correctly; `next`'s own
  `61→62`/`63→64` blocks kept unchanged.
- **`App.vue` (5-hunk file)**: confirmed **composed, not picked** —
  `next`'s ADR-0019 cold-load gate (`v-if="workspaceLoadState.kind ===
  'loaded'"` with `v-else-if` loading/error siblings, lines 324/344/589/600)
  is intact; `toggleChrome()`/writable `activeTab` computed are wired
  (`v-model="activeTab"` at line 542, `toggleChrome('sidebarExpanded')` etc.
  at 346/361/364/367); the relocated single `.right-toggles` block sits
  inside `.top-nav-bar` with **no duplicate** elsewhere in the file (grepped
  for a second occurrence — found none); `@update-rules="handleUpdateRules"`
  is wired on `StatusBar` (confirmed against `StatusBar.vue`'s real
  `defineEmits`); the branch's full nested-splitter resizer structure
  (`#board-column`/`#board-square`/`#resizer-outer`/`#tree-control-wrapper`/
  `#resizer-inner`/`#control-panel`) is preserved wholesale. The disclosed
  dropped-`</div>` catch (caught by `vite build`'s SFC parser, not
  `vue-tsc`) is real and already fixed — I checked for siblings of that
  mistake (unbalanced tags via a clean `npm run build`, which would fail
  loudly on any remaining tag-balance defect; orphaned CSS selectors via
  reading the full `<style scoped>` block) and found none.
- **`useResizablePanel.ts` / `.test.ts` (add/add)**: confirmed `next`'s
  side was byte-identical to the pre-rearch `ui-fix-56` baseline before
  being discarded (`git diff b5732042 033c1604 -- ...ts` and the
  branch-vs-`.test.ts` diff both empty against the branch's own side,
  confirming a straight "took wholesale" resolution, not silent narrowing).
- **`ForestDirectory.vue`**: trivial adjacent-import conflict, both
  `touchSession` (next) and `useDeferredContainerBreakpoint` (branch) kept;
  rest of the file (including `next`'s own `touchSession()` call at the
  `cardsContextIds` write site) merged clean.
- **`FILES.md`**: both sides' new rows composed correctly. **One
  pre-existing documentation nit, not introduced by this merge**: the
  `archived-migrations.ts` row's freeform description still says
  "(1→2 .. 59→60)", which was already stale in *both* merge parents
  (`b5732042`'s side said "57→58", the branch's said "59→60" — neither
  matched the file's own actual `62→63` scope at merge time). The
  resolution kept the branch's already-wrong number verbatim rather than
  correcting it; low severity, does not block, but worth a follow-up note
  for whoever next touches `FILES.md`'s migrations-archive row.

**Post-merge gates, re-run by me from scratch** (build `1097 modules`,
eslint clean, `test:run` 110 files/1392 tests passed | 3 files/4 tests
skipped) — all match the build-report addendum's own numbers exactly.

## 3. Migration renumbering — KNOWN STALE at hand-off, now current; trial merge performed

Confirmed the coordinator's flag: current `next` (`b2e6de10`) is one merge
ahead of `033c1604`'s own merge-base (`b5732042`) — the browse-leak-fix
closure added its own migration, `64 → 65` (clear `session.ui.
forestNav.selection` for every board), landing on top of the branch's
already-merged `64 → 65` resizer-strip. **Trial merge performed** at
`/tmp/omega-resizer-repairs-trial-merge` (`git worktree add -B
trial-merge-resizer-repairs-scratch /tmp/omega-resizer-repairs-trial-merge
next`, then `git merge --no-commit --no-ff worktree-agent-aea2fabfe830f1b89`
— **not** committed, **not** pushed, **not** touching real `next`).

**Only 2 files conflicted this time** (not 8 — the prior merge already
resolved App.vue/ForestDirectory.vue/useResizablePanel.ts/.test.ts/FILES.md,
and `next`'s browse-leak-fix commits didn't touch any of those on the
frontend side): `migrations.ts` and `archived-migrations.ts`.

**Resolution applied** (the exact recipe for whoever lands this):

1. Keep `next`'s `64 → 65` (`forestNav.selection` clear, browse-leak-fix) as
   migration index 64→65, unchanged.
2. Renumber the branch's resizer-strip migration from `64 → 65` to
   **`65 → 66`**, appended after the browse-leak-fix migration.
3. Bump `CURRENT_SCHEMA_VERSION` to **66**.
4. Move the now-third-from-current migration, `63 → 64`
   (`session.ui.deltaViewMode` backfill, delta-panel), out of the active
   file into `archived-migrations.ts` (rolling-archive discipline: exactly
   two migrations stay active). Update the archive's own header comment
   from "62 entries, 1→2 through 62→63" to **"63 entries, 1→2 through
   63→64"**, and `migrations.ts`'s own "first N entries" comment likewise.
5. Renumber `migrations.test.ts`'s resizer-strip test block from
   `step(64)` / `schemaVersion: 64` to **`step(65)` / `schemaVersion: 65`**
   (the array-index convention: `migrations[i]` migrates `(i+1)→(i+2)`, so
   the 65→66 migration is at array index 65, addressed via `step(65)`).
   The `describe(...)` title was updated to `'65 → 66: ...'`.
6. No test block exists for `next`'s own `64 → 65` forestNav-clear
   migration — confirmed via `git show next:frontend/tests/unit/store/
   migrations.test.ts`, this gap is **pre-existing in `next` itself**, not
   introduced by this merge or its resolution. Out of scope for this repair
   pass; flagging for whoever next touches that migration.

**Gates re-run against the resolved trial-merge tree, by me, from a fresh
`git worktree`** (symlinked `node_modules` from the main checkout since
`package.json`/`package-lock.json` had zero diff on this merge — confirmed
via `git status --short | grep package` returning nothing):

- **`npm run build`**: `✓ 1097 modules transformed`, `✓ built in 2.62s`.
- **`npx eslint .`**: clean, zero output.
- **`npm run test:run`**: `Test Files 110 passed | 3 skipped (113)`,
  `Tests 1392 passed | 4 skipped (1396)` — identical counts to the
  `033c1604` merge (the intervening browse-leak-fix commits are backend/
  routing-focused and didn't add or remove frontend test files).

The resolved tree is left uncommitted at
`/tmp/omega-resizer-repairs-trial-merge` for inspection; **not** pushed
anywhere, real `next` untouched.

## 4. `waitForTimeout` / sleep-as-sync — WITNESSED, zero tolerance held

`grep -n "waitForTimeout\|setTimeout(" .claude/dispatch-reports/
resizer-rearch-probe.mjs` returns nothing — the probe's condition-wait
replacement (two consecutive `requestAnimationFrame`s reporting an
identical geometry snapshot for `#vue-tree-panel` and
`#tree-control-wrapper`) is in place, confirmed by reading the diff
directly.

A repo-wide grep for `waitForTimeout`/`setTimeout(` does find hits in
*other* probe scripts (`ui-fix-56-probe.mjs`, `ui-fix-4-probe.mjs`,
`shot-close-btn.mjs`, etc.) and in production debounce/throttle code
(`sync-service.ts`, `useHoverPopover.ts`, etc.) — all confirmed via `git
log --oneline -- <path>` to be **pre-existing files from unrelated prior
commissions**, not touched by any commit on this branch. Zero tolerance
held for the files actually in scope.

## 5. Live continuity probe — WITNESSED, own run, exceeds the claimed bound

**`ulimit -v` deviation, approved by the coordinator mid-task**: the
standing `ulimit -v 4194304` directive reliably crashed Chromium with
`SIGTRAP` on this host (reproduced twice, once at 4 GiB and once at 8 GiB —
ruling out an under-provisioned cap and pointing at virtual-address-space
reservation behavior, not RSS). Per the coordinator's live correction, ran
**without** `ulimit -v`, `nice -n 19` retained, one browser instance, closed
in the probe script's own `finally`.

Own dev server (`npx vite --port 4737`, own port, killed after), own run of
the builder's probe script (`node resizer-rearch-probe-scratch.mjs --url
http://127.0.0.1:4737` — a scratch copy inside `frontend/` for Node ESM
module resolution, deleted after the run, not committed):

```
PASS  INNER: bar found / pane found
PASS  INNER: bar screen position tracks the CLAMPED cursor expectation
      across the WHOLE swept range (max lag ≤ 3px)
PASS  INNER: sweep moved the pane / range pinning (both ends) /
      persisted fact matches rendered geometry / no drag-start clobber
PASS  OUTER: ALL checks (bar found, pane found, ≤3px lag across the WHOLE
      swept range, sweep moved the pane, range pinning both ends,
      persisted fact matches geometry, no drag-start clobber)
PASS  both facts ended independently-set, defined (ADR-0012)
PASS  ledger row 414: ZERO width delta on #vue-tree-panel from
      branch-expand + navigation
PASS  ledger row 414: ZERO width delta on #tree-control-wrapper from
      branch-expand + navigation

ALL PASS (exit code 0)
```

**Both bars tracked within the claimed 3px bound on this run — including
the INNER bar**, which the build-report addendum's own last run (post-merge,
on a different port/instance) measured at 41–116px of residual lag across
three separate runs. This is not a contradiction of the repair — my run
adds a **fourth** data point (0 failures, ≤3px) to the same "timing-artifact,
not geometry-defect" pattern the build report already flagged: the
magnitude and even presence of the INNER-bar lag varies run-to-run
(41px → 41px → 116px → **0px, this run**), which is inconsistent with a
fixed CSS box-sizing offset (which would recur at a stable magnitude every
time) and consistent with a headless-Chromium paint/reactivity-flush timing
artifact under whatever load the host happened to be under during a given
run. Persistence (`sessionVersion` bump on drag, both facts' persisted
values matching rendered geometry post-drag) is witnessed directly in the
PASS lines above, not inferred.

## 6. Residual INNER-bar lag — confirmed documented, not silently claimed fixed

The build-report addendum's §A4/§A5 explicitly carries the residual forward
as **open**, reproduced three times at three different magnitudes
(41.4px → 41.4px → 116.1px), root cause not isolated, with the
"timing-artifact over geometry-defect" hypothesis stated as strengthened
but not confirmed (a controlled N≥5 repeat-run study is named as
**UNEXERCISED**, deliberately deferred per the coordinator's explicit
instruction to deliver the repair now rather than keep iterating on an
already-small, already-disclosed, non-blocking residual). Nothing in the
addendum claims this is fixed. My own run (§5, 0 failures) is consistent
with — and adds evidence toward — the timing-artifact hypothesis, but does
not itself close the open item; recorded here as an additional data point,
not a resolution.

---

## Summary — what a merging session needs to do

1. **Repairs §1 (touchSession), §2 (8-file composition), §4 (waitForTimeout)
   are done and verified** — no further action needed on those.
2. **Migration renumbering must be redone against whatever `next` HEAD is
   at actual merge time** (this review's own trial merge is itself now a
   snapshot, same class of staleness the coordinator flagged against the
   prior review). The recipe in §3 above (renumber resizer-strip to
   `N→N+1` immediately after whatever `next`'s own latest migration is at
   merge time, archive the resulting third-from-current entry, renumber
   its `step(N)` test references, update both header comments) is
   mechanical and repeatable — apply it fresh rather than copying today's
   specific numbers if `next` has moved again.
3. **Nits, non-blocking**: `FILES.md`'s `archived-migrations.ts` row is
   stale (pre-existing, not from this branch); no test coverage exists for
   `next`'s own `64→65` forestNav-clear migration (pre-existing in `next`).
   Neither blocks this merge.
4. **The ~0–116px INNER-bar residual lag stays open and documented**,
   correctly not claimed fixed. Acceptable to ship as a tracked residual
   per the original review's own §7 disposition (the persistence regression
   it was conditioned on, §2/repair-§1, is now fixed).

**Overall: ACCEPT.** All four repairs verified independently, own-run,
red-then-green where applicable; the merge composition holds under a fresh
trial merge against current `next`; the live probe exceeds its own claimed
bound on this run.
