# Deck repetition — build report

BUILD agent delivery for the commissioner-adjudicated design at
`.claude/dispatch-reports/deck-repeat-design.md`, option (a): a module-scope,
board-keyed, per-visit snapshot map (mirroring the `pendingAnalysisAborts`
idiom), plain-value JSON round-trip cloning so NodeIds survive verbatim,
FINISHED cards restore view-only, Retry is the only re-grade path, and
`submitReview` is structurally un-double-fireable.

Read end to end before starting: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
the ratified design doc, `useReviewSession.ts`, `useBoardMoveRouting.ts`,
`ReviewSessionPanel.vue`, `blind-mode-prefs.ts`, `store/index.ts`
(`updateBoardState`/`closeBoard`/`addBoard`), `store/teardown-registry.ts`,
`types/cards.ts`, `types/game.ts`. **Worktree note:** the design doc did not
exist in this worktree's tree (or on the branch it was created from) — it
lives uncommitted in the shared checkout at `/home/bork/w/omega`. Copied it
into this worktree at the same path (also committed here) so the deliverable
is self-contained; not otherwise relied on from outside this worktree.

## 1. Interfaces

`ReviewStatus` (`types/cards.ts`) gains `'REVIEWED'` — a restored per-visit
snapshot, distinct from live `FINISHED`: FINISHED still allows free play
(existing intermission pedagogy); REVIEWED is structurally view-only.

`useReviewSession.ts` gains a module-scope `visitSnapshots: Map<BoardId,
Map<number, CardVisitSnapshot>>`, keyed by queue index (not CardId — the
queue can repeat a card). `CardVisitSnapshot` is exactly the design's
enumerated field set: `status` ('AWAITING_MOVE' | 'FINISHED'),
`userMovesCount`, `userMoveScores`, `visitsOverride`, `startingNodeId`,
`board` (a plain-value clone).

New composable surface: `goBack()`, `goForward()`, `jumpTo(index)`
(booleans — the session-position model is still `currentIndex` on
`ReviewSessionData`, unchanged), `retryCard()`, `canGoBack`/`canGoForward`
computeds.

## 2. Capture / restore

`captureSlot(boardId, index)` snapshots the CURRENT slot only when settled
(`AWAITING_MOVE` or `FINISHED` — never `LOADING`/`ANALYZING`, matching the
design's "a snapshot is only ever taken at a settled instant"). Wired at
**advance time** inside `loadCard` itself (captures the outgoing index
before its own reset), not only in `goBack`/`goForward` — this is what
makes an ordinary forward walk (`nextCard`) produce a walkable-back trail,
not just explicit back/forward calls. `nextCard` itself now routes through
`goForward()` rather than calling `loadCard` directly (byte-identical
behaviour for a never-visited next slot — `goForward`'s own fallback is the
same `loadCard` call — but correctly *restores* instead of silently
re-parsing when the next slot was already visited, e.g. after a back-nav).

The clone: `JSON.parse(JSON.stringify(toRaw(board)))` — the codebase's
sanctioned deep-clone idiom (`frontend/CLAUDE.md`'s `structuredClone`-cannot-
clone-reactive-state footgun). `restoreSlot` re-clones the snapshot's board
on *every* install (not the snapshot's own object graph) — installing the
snapshot's own `nodes`/`stones`/`games` objects would alias them into the
live reactive board, and a later in-place navigation (`rewindToStart`, the
intermission-chart click-to-navigate — both reachable from REVIEWED) would
silently corrupt the archived snapshot the next `goBack` to that index
reads. This aliasing hazard was found and closed during implementation, not
called out explicitly in the design doc.

A restored `FINISHED` snapshot re-enters as `REVIEWED`; a restored
`AWAITING_MOVE` snapshot resumes as `AWAITING_MOVE` exactly as left (never
graded, so continuing is today's semantics).

## 3. View-only enforcement (the double-fire tripwire)

`useBoardMoveRouting.ts` gets an explicit `REVIEWED` arm in both
`handleBoardMove` and `handlePastePv` — added loudly as its own arm (not
folded into `isReviewTransientState`, a different failure class: racing the
SR lifecycle vs. structural immutability). Silent no-op, matching the
existing AWAITING_MOVE/transient-state refusal style (no system-message
toast — not called for by the design, and the established gate pattern here
doesn't toast on refusal). This is what makes `submitReview`'s missing
idempotency guard (design doc §1d) structurally unreachable twice: REVIEWED
has no path to `processUserMove`/`finishCard` except `retryCard`, which
discards the snapshot and re-enters via `loadCard` first.

`blind-mode-prefs.ts`'s exhaustive `isReviewSessionExited` switch gets a
`REVIEWED` case (compiler-enforced `never`-default) — not an exit, same as
FINISHED.

## 4. Retry

`retryCard()`: no-op outside REVIEWED; otherwise deletes the current
snapshot and re-enters via `loadCard` (fresh attempt, graded once). The
confirm lives in the UI layer (`ReviewSessionPanel.handleRetry`), using
`window.confirm` — the codebase's established minimal-touch destructive-
confirm idiom (`CardMetadataPanel.vue`, `QeuboBookmarks.vue`); I could not
locate a "C10" convention row anywhere in this repo's docs (grepped
`docs/`, `frontend/`) to confirm that literal label, so I used the nearest
established in-tree precedent instead of inventing new UX. Flagging this as
an unresolved citation rather than silently assuming it matched.

## 5. Resource ownership

Two new teardown registrations in `useReviewSession.ts`:
`registerBoardCloseHandler('review:visit-snapshots', ...)` drops the
closing board's snapshot map; `registerWorkspaceResetHandler
('review:visit-snapshots-clear-all', ...)` drops all boards' maps on
identity flip. `endSession()` also drops the board's map directly (a
session ending without a close/reset). Both new labels are pinned into
`tests/integration/teardown-registry-completeness.test.ts`'s exact-order
arrays (inserted right after `review:abort`/`review:abort-all`, matching
registration order), and `review:visit-snapshots-clear-all` is added to
`auth-lifecycle.test.ts`'s `NON_CACHE_RESET_LABELS` (same shape as
`review:abort-all` — a closure-internal Map drop, not a spy-able module
cache). Memory is uncapped within a session per the design's own call
("bounded by deck length … a session is bounded").

## 6. UI (ReviewSessionPanel.vue)

Back/Forward buttons (disabled, not hidden, at queue edges — matches the
panel's always-mounted chrome). Retry button, visible only in REVIEWED.
Header text and the read-only display shape (intermission chart, hidden
moves-made/visits-override rows) now cover both FINISHED and REVIEWED via
a new `isReadOnlyDisplay` computed. New i18n keys under `review.session.*`
(`reviewed`, `goBack`, `goForward`, `retry`, `retryConfirm`,
`state.REVIEWED`).

**File-size note (ADR-0007):** the SFC was already at 262 lines before this
change (over the ≤250 target); it's now 316. I kept the addition to the
smallest reasonable diff (reused existing CSS classes where possible, no
new sub-component) rather than opening an unscoped extraction refactor —
flagging the growth honestly rather than silently absorbing it or silently
expanding scope to fix a pre-existing overage.

## 7. Hotkey (design doc §5) — deliberately NOT wired

The design's own note says the prev-card hotkey binding belongs to the
batch hotkeys work item. I checked: a `hotkeys-batch-build.md` report
exists (in a *different* worktree, `agent-aef22b08f64e3954b`) that already
wired `review.nextCard` to `.`. That report's own text says its worktree
"was branched from an older commit than the shared checkout" and its
`keybindings-catalog.ts` differs from this worktree's — i.e., not trivially
consistent, by that report's own admission. Per the brief's own
conditional, I left the `,` binding to follow-up and am saying so here;
`keybindings-catalog.ts` has no `review.*` actions in this worktree at all
yet, so there's nothing to collide with locally either.

## 8. Tests (`tests/integration/useReviewSession-deck-repeat.test.ts`, new)

Six tests, real `startSession`/`loadCard`/`processUserMove` path against
service fakes (same split as the existing `useReviewSession.test.ts`):

1. `goBack` restores the exact NodeId set, stones, and scores after
   advancing past a FINISHED card, with **no new `analyzeRange` call**
   (ledger cache hit) — the design's acceptance handle #2.
2. `goForward` resumes an `AWAITING_MOVE` snapshot mid-attempt (score/move
   count preserved, not reset).
3. The routing-gate tripwire: `handleBoardMove`/`handlePastePv` are both
   no-ops against a REVIEWED board (board unchanged, no new `analyzeRange`,
   no new `submitReview`, no engine-responder fire).
4. The double-fire tripwire: a pathological back/forward/no-op-goBack dance
   leaves `submitReview` at exactly 1 call; `retryCard` then a genuine
   second attempt brings it to exactly 2, with the two calls' score arrays
   distinct — proving the dance itself never re-fires and Retry's own
   attempt is a legitimate, separate call.
5. `retryCard` is a no-op outside REVIEWED (defensive).
6. `endSession` clears the board's retained snapshots (a fresh session over
   the same board starts with `canGoBack === false`).

**Red-leg verification (WITNESSED):** temporarily short-circuited
`captureSlot` to an unconditional `return;`, re-ran the new suite — 4 of 6
tests failed loudly (`goBack`/`goForward` fall through to `loadCard`'s
fresh-parse fallback, landing `AWAITING_MOVE` instead of `REVIEWED`, since
nothing was ever captured to restore). Reverted before the final gate run
below.

## Gates (WITNESSED)

**Typecheck** (`npx vue-tsc -b`): clean, no output.

**Build** (`npm run build`):
```
✓ 1080 modules transformed.
dist/assets/index-BcYAM-cy.js   2,923.59 kB │ gzip: 1,033.24 kB
✓ built in 2.94s
```
(pre-existing >500kB chunk-size advisory only, unrelated.)

**ESLint** (`npx eslint .`): clean, no output.

**Tests** (`npm run test:run`):
```
Test Files  82 passed | 3 skipped (85)
     Tests  1107 passed | 4 skipped (1111)
```
(1101→1107: the 6 new deck-repeat tests; no regressions in the other 81
files, including the two teardown-registry-completeness assertions and the
auth-lifecycle drain pin updated for the two new teardown labels.)

## Files touched

- `frontend/src/types/cards.ts` — `ReviewStatus` gains `'REVIEWED'`.
- `frontend/src/composables/review/useReviewSession.ts` — `visitSnapshots`
  map, `captureSlot`/`restoreSlot`, `goBack`/`goForward`/`jumpTo`/
  `retryCard`/`canGoBack`/`canGoForward`, capture-at-entry in `loadCard`,
  `nextCard` routed through `goForward`, `endSession` snapshot-map clear,
  two new teardown registrations.
- `frontend/src/composables/board/useBoardMoveRouting.ts` — explicit
  REVIEWED refusal arm in both entry points.
- `frontend/src/composables/review/blind-mode-prefs.ts` — REVIEWED case in
  the exhaustive exit-predicate switch.
- `frontend/src/components/chrome/SidebarWidget.vue` — REVIEWED maps to the
  INTERMISSION tab-badge bucket.
- `frontend/src/components/ReviewSessionPanel.vue` — Back/Forward/Retry UI,
  `isReadOnlyDisplay`, `handleRetry`.
- `frontend/src/locales/en.json` — new `review.session.*` keys.
- `frontend/tests/integration/teardown-registry-completeness.test.ts` —
  pinned arrays extended with the two new labels.
- `frontend/tests/integration/auth-lifecycle.test.ts` —
  `NON_CACHE_RESET_LABELS` extended.
- `frontend/tests/integration/useReviewSession-deck-repeat.test.ts` — new,
  six tests (§8 above).
- `frontend/FILES.md` — three purpose-line refreshes (no band/path change).
- `FEATURES.md` — new "Back / Forward (deck repeat)" tour entry under
  Review sessions.
- `.claude/dispatch-reports/deck-repeat-design.md` — copied into this
  worktree (see the worktree note above).

## Addendum — review response (`deck-repeat-review.md`, ACCEPT-WITH-NITS)

Fresh-context review confirmed the SRS-integrity/double-fire property with
its own independent red-leg and adversarial sequence, and confirmed the
aliasing fix's *code* was correct but flagged three items: two merge
blockers and one should-fix.

**Blocker 1 — `touchSession()` "removed" from `blind-mode-prefs.ts`.**
Investigated: this branch's own commit (`5648dff6`) never touched
`write()` or `touchSession()` — its only diff to that file was the
`REVIEWED` case in the exhaustive switch (confirmed via `git show`).
`touchSession()` did not exist ANYWHERE in this worktree at the time —
neither in `blind-mode-prefs.ts` nor in `store/index.ts`. It was
introduced by `f645ca42` ("perf(frontend): version-count store.session in
SyncService instead of deep-watching it"), a `next`-only commit that
post-dates this branch's merge-base (`3378806f`) by many commits. So the
finding was real but the framing was off: nothing was "dropped" by this
branch's diff — this branch's copy of the file simply pre-dated the
feature, and comparing it against current `next` (as the reviewer's own
finding #9 independently establishes the branch needed to do) reads as a
removal when it's a staleness gap. Resolved by blocker 2's merge, which
auto-merged `blind-mode-prefs.ts` cleanly — both the `REVIEWED` case and
`touchSession()` are present in the merged result (verified directly:
`write()` calls `touchSession()` after the `uiPrefs()[k] = value` write,
exactly as `f645ca42` shipped it).

**Blocker 2 — merge `next` in, reconcile both teardown-label sets.**
Merged local `next` (`56a3d7e3`, 52 commits ahead of the merge-base) into
this branch. `teardown-registry-completeness.test.ts` auto-merged cleanly
(non-overlapping array insertions — `review:visit-snapshots[-*]` and
`nav:clear-toggle-memory[-all]` both present, in the two files' existing
registration order). `auth-lifecycle.test.ts` had one real textual
conflict (both sides added a `NON_CACHE_RESET_LABELS` entry with
adjacent doc comments) — resolved by hand, keeping both comment blocks and
folding the Set to `['review:abort-all', 'review:visit-snapshots-clear-all',
'nav:clear-toggle-memory-all']`. No other files conflicted (`blind-mode-
prefs.ts`, `FEATURES.md`, `FILES.md`, `SidebarWidget.vue`, `en.json` all
auto-merged). Verified no stray `<<<<<<<`/`=======`/`>>>>>>>` markers
remain anywhere in the tree post-merge.

**Should-fix — aliasing witness.** Added
`_visitSnapshotStonesForTesting(boardId, index)`, a narrow test-only
inspector exported from `useReviewSession.ts` (module-private
`visitSnapshots` stays unexported; this returns a defensive shallow copy
of one stored snapshot's `stones` record) — the same shape as
`useNavigation.ts`'s `_mainLineToggleMemoryKeyCountForBoard`, which `next`
had already established as this codebase's precedent for exactly this
problem (a module-scope Map with no UI-facing query to route a test
through instead). New test in
`useReviewSession-deck-repeat.test.ts`: restore an `AWAITING_MOVE`
snapshot (card0, one move played, stone on the board), then — WITHOUT
navigating away again (any navigate-away re-captures the outgoing slot
fresh from the live board regardless of the bug, which is what makes the
property otherwise unfalsifiable through the public API alone) — mutate
the live board in place via `mutateBoard`/`navigateTo` (the same
mechanism `rewindToStart` and the intermission-chart click use; it
deletes/sets `stones` entries in place, not a full-board replacement),
then read the archived snapshot back through the inspector and assert it
is untouched. **Red-leg verified:** temporarily reverted `restoreSlot`'s
re-clone to a shallow spread of `snap.board` directly — the test failed
loudly (`expected {} to deeply equal { '3,3': 'B' }`, i.e. the in-place
mutation was visible in the archived copy); reverted before the final
gate run.

**Gates, re-run on the merged result (WITNESSED):**

```
vue-tsc -b        clean, no output
eslint .          clean, no output
npm run build     ✓ 1091 modules transformed, built in 1.76s
                  (pre-existing >500kB chunk-size advisory only)
npm run test:run  Test Files  102 passed | 3 skipped (105)
                       Tests  1299 passed | 4 skipped (1303)
```

(1107→1299 reflects `next`'s own test growth across the merge, plus the
one new aliasing-witness test — 6→7 in this file.)

Additional files touched by the addendum:
- `frontend/src/composables/review/useReviewSession.ts` —
  `_visitSnapshotStonesForTesting` test-only export.
- `frontend/tests/integration/useReviewSession-deck-repeat.test.ts` —
  aliasing-witness test (7th test).
- `frontend/tests/integration/auth-lifecycle.test.ts` — merge conflict
  resolved, both `NON_CACHE_RESET_LABELS` entries retained.
- Merge commit bringing `next` (`56a3d7e3`) into this branch — brings in
  the hotkeys (`nav.toggleMainLine`), modals, collapsibles, and
  high-contrast-tokens work, none of which this deliverable's diff
  otherwise touches.
