# Fresh-context review: card-start-marker

**Verdict: ACCEPT**

Branch `bork/feat/card-start-marker`, head `6726b75c`, base `next` at
`b2e6de10`. Reviewed against the spec (ledger rows 503/506/524, zero-I/O
start marker sourced from `ReviewSessionData.startingNodeId`, rendered
like the `game-head-ring` precedent), against law (ADR-0000, 0002, 0004,
0010, 0012, 0019+appendix, 0021), and against `frontend/CLAUDE.md` /
`frontend/tests/CLAUDE.md`. All findings below are WITNESSED unless
marked otherwise.

## Scope sanity (builder's Part 1/Part 2 framing)

The builder report's Part 1 is a stop-finding (investigation only, no
diff) that correctly identified the original two-glyph "known-position
highlight" ask as requiring a per-node network round trip (no
`NodeId -> ContentHash` cache exists in the SPA). Part 2 is the actual
delivery, built after re-adjudication to the zero-I/O fallback. I
verified the diff matches Part 2's claims and contains none of Part
1's rejected machinery: `git diff next...HEAD | grep -iE
"hash|batch|known-position|waitForTimeout|chromium|playwright"` — no
hits. WITNESSED: no scope creep from the sibling Stage B build
(`bork/feat/card-position-highlight-stageb`, confirmed as a separate
branch in `git worktree list`, not touched by this diff).

## 1. Render locality (ADR-0010)

`TreeWidget.vue`'s diff adds `isReviewStart: isReviewStartNode(id,
props.reviewStartNodeId)` inside the same `nodeList` computed that
already derives `isGameHead: !!props.gameHeadIds?.has(id)` — same
per-node membership-check shape, no new reactive read introduced at
the composition layer, no per-node watcher. `isReviewStartNode` itself
(`frontend/src/composables/forest/tree-review-marker.ts`) is a genuinely
pure function (`nodeId: NodeId, startNodeId: NodeId | null | undefined)
=> boolean`, single equality check, no imports beyond a type-only
`NodeId`) — Tier-1 by construction. `item.isReviewStart` was added to
the `v-memo` key array alongside `item.isGameHead`, so per-node memo
granularity is preserved (not a whole-list memo). This matches the
`gameHeadIds` precedent's reactivity cost exactly, as claimed.

## 2. Lifecycle honesty (ADR-0002)

Traced `startingNodeId`: set at `useReviewSession.ts:549`
(`draft.startingNodeId = targetLeafId` inside `loadCard`), cleared at
`useReviewSession.ts:1088` (`draft.startingNodeId = null` inside
`endSession`). The exposed `startingNodeId` computed
(`useReviewSession.ts:366`) reads `reviewData.value?.startingNodeId ??
null`, and `reviewData` (`useReviewSession.ts:349-352`) is itself
`computed(() => store.session.reviews[boardIdRef.value])` — keyed by
`boardIdRef`, which `App.vue:90` binds as `useReviewSession(activeBoardId)`,
the same board-id ref `activeBoardGameHeadIds` uses. Board-switch
correctness confirmed structurally: switching boards changes
`activeBoardId.value`, `reviewData` recomputes against the new board's
own `store.session.reviews[newBoardId]` row, and the marker cannot leak
a stale node id from the previously active board — there is no
module-scope cache here to leak, only the reactive per-board store
read. The `restoreSlot`/`captureSlot` snapshot-and-restore machinery
(the deck-repeat-visit feature, unrelated to this change) also writes
`draft.startingNodeId = snap.startingNodeId` on restore
(`useReviewSession.ts:226`) — consistent with the same field, no
divergent write path found.

## 3. Visual coexistence

`game-head-ring` at `NODE_R+5`, `review-start-ring` at `NODE_R+7` —
concentric, both `v-if`-gated independently, drawn in sequence
(game-head first, review-start second, node-circle last) so neither
occludes the other and the fill circle sits innermost. Color:
`--accent-secondary`, distinct from `--state-success` (game-head) and
`--accent-primary` (active-cursor ring) — confirmed defined in both
`[data-theme="dark"]` (`theme.css:131`) and `[data-theme="cluster"]`
(`theme.css:227`, mapped to a distinct maximin-optimized palette
entry). Checked the opt-in high-contrast-text override block
(`theme.css`, the `data-contrast-text` mechanism) — it overrides only
`--text-2` and `--accent-primary`, not `--accent-secondary`, so the
marker's visibility is unaffected by that toggle.

## 4. FILES.md / ADR-0006

`frontend/FILES.md` gained one row for `tree-review-marker.ts` (`[B2]`,
correctly banded — the module reads only `NodeId`, a game-tree-coupled
type, no Go-domain coupling). The new file carries a full JSDoc header
(pathname, purpose, precedent citation, license) per ADR-0006.

## 5. Tests

Unit (`tree-review-marker.test.ts`): 5 cases, non-tautological — match,
mismatch, `null`, `undefined`, and a "marks exactly one node across a
set" case. Straightforward but not vacuous; each asserts a real branch
of the one-line derivation.

Integration (`useReviewSession.test.ts`, new `describe` block): drives
the real production store shape — `mutateReviewSession(boardId, draft
=> ...)` and the composable's own `endSession()`, not a hand-rolled
fake. Confirmed against source: `mutateReviewSession` is the same
mutator `loadCard`/`endSession` use internally
(`useReviewSession.ts`), so the test exercises the actual reactive
path, not a parallel one. Four cases: null-before-load, reflects a
written `startingNodeId`, clears on `endSession` (the "must disappear
reactively" case named in the dispatch brief), and null when the
board has no review row at all (covers the board-switch-to-a-board-
with-no-review case structurally, matching the lifecycle analysis in
§2 above).

## 6. Standing checks / proportionality (ADR-0004)

No `waitForTimeout`, no chromium/Playwright references in the diff
(grepped, see Scope sanity above). Files touched: 8 — composable
(`tree-review-marker.ts`), `TreeWidget.vue`, `useReviewSession.ts`,
`App.vue`, 2 test files, `FILES.md`, `FEATURES.md`. This is exactly
the dispatch brief's own enumerated expectation ("6 files expected:
composable, TreeWidget, App.vue, new module, tests, FILES.md" —
read literally that's already 6 distinct artifacts before counting
FEATURES.md, which the brief's own point 4 on documentation discipline
requires for a user-facing capability addition). Nothing beyond scope.

`FEATURES.md` entry: placed under "### Review sessions", accurately
describes the capability, no marketing language, consistent with the
umbrella CLAUDE.md's FEATURES.md discipline (state qualifiers,
tour-not-marketing).

## 7. Gates (worktree, WITNESSED — rerun independently, not taken from
builder self-report)

In `.claude/worktrees/card-start-marker` (branch tip `6726b75c`):
- `npm run build` (`vue-tsc -b && vite build`): green, `1097 modules
  transformed`, built in 3.92s.
- `npx eslint .`: exit 0, no output.
- `npm run test:run`: `109 passed | 3 skipped (112)` test files,
  `1365 passed | 4 skipped (1369)` tests.

**Trial merge against current `next`** (head `a9808651`, which has
advanced past this branch's `b2e6de10` base with the resizer
rearchitecture and the nav-algebra-fix merges): performed in an
isolated detached worktree (`/tmp/omega-card-start-marker-trial`),
`git merge --no-commit --no-ff 6726b75c` onto `a9808651`. Merge was
fully automatic — `Auto-merging frontend/FILES.md` and `Auto-merging
frontend/src/App.vue`, "Automatic merge went well," no conflict
markers, no manual resolution needed. Checked whether `TreeWidget.vue`
itself collided with the resizer work: `git diff b2e6de10 a9808651 --
frontend/src/components/tree/TreeWidget.vue` is empty — the resizer/
nav-algebra arc never actually touched this file net-of-merges, so the
only real dual-side files were `App.vue` (one added line, `:review-
start-node-id="..."`, no semantic conflict with the resizer's
unrelated edits to the same file) and `FILES.md` (append-only row).

Ran all three gates again in the merged worktree:
- `npm run build`: green, `1098 modules transformed`, built in 2.90s.
- `npx eslint .`: exit 0.
- `npm run test:run`: `112 passed | 3 skipped (115)` files, `1456
  passed | 4 skipped (1460)` tests (higher counts than the pre-merge
  run because `next` has since gained its own new tests from the
  resizer/nav-algebra work — no regression, no new failures).

## Summary

The build matches its own report accurately: a genuinely zero-I/O
marker, same reactivity shape and cost as the existing `game-head-ring`
precedent, correctly scoped per-board with no leak path, visually
non-occluding and theme-safe, tested at the right tier with
non-tautological cases against the real store mutator, proportionate
file count, and clean on both a standalone build/lint/test pass and a
trial merge against the current tip of `next`. No defects found.
Recommend merging as-is — no compose steps needed beyond the ordinary
merge (which I've already verified goes through with zero conflicts).
