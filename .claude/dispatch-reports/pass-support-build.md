# Build report: pass support (Option A)

- **Author:** FIX/BUILD agent, isolated worktree
- **Date:** 2026-08-06
- **Commission:** ledger rows 630/631, wiki Mechanics#3 pass half — build Option A of
  `.claude/dispatch-reports/design-engine-features.md` (PASS SUPPORT section), sequenced
  C → B → game-end signal per the design's own recommendation.
- **Branch:** `bork/feat/pass-support`, built in an isolated `git worktree` at
  `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/pass-support-wt`
  (branched off `next`). **Not merged, not pushed.** No process/port outside the worktree
  was touched; ports 4173/5173/5174/8764 were never used by this session.
- **Head commit:** `96674258e60f73b73591280071d45ab35d6a999c` — "feat(frontend): pass
  support — applyPass mutator, routing, board affordance, tree render, game-end signal"

## Scope delivered

### C — pass-node display fix (TreeWidget.vue)

WITNESSED: `frontend/src/components/tree/TreeWidget.vue` — `nodeFill()` now returns the
neutral `--border-3` tone (not a B/W stone color) for a `type: 'pass'` node, and the
template renders a "P" glyph (`<text class="pass-glyph">`) centered on the node circle
for any node whose `move.type === 'pass'`. This is a real, distinguishable marker (glyph,
not merely fill color) per ADR-0019 appendix C18's no-color-only rule. `v-memo`'s key
list gained `item.move?.type` so a pass-vs-place transition on an existing node id still
busts the per-item memo.

**Note on scope overlap with an already-merged fix:** the design doc's own diagnosis
citation (`.claude/dispatch-reports/sgf-pass-diagnosis.md`) also names a *separate*,
already-merged defect — `board-renderer.ts` drawing a spurious last-move marker for a
pass leaf (fixed in commit `bfa49573`, present in `next` before this dispatch started).
That fix is NOT part of "C" as the design defines it (C is specifically "fix
`TreeWidget.vue` to render an existing pass node distinctly") — confirmed by re-reading
`board-renderer.ts` in the worktree: the `lastMove.type === 'place'` guard and the
`Move`-typed (not bare `Point`) parameter are already there, untouched by this build.

### B — real pass moves

- **`applyPass` mutator** (`frontend/src/logic.ts`): structurally parallel to
  `applyGoMove` — existing-child reuse, parent/child bookkeeping — but skips
  `validateMove`/capture entirely (a pass is always legal, never touches the stones
  projection). The new node's property is `{ [turn]: [''] }`, the exact empty-value shape
  `sgfToMove` (`engine/util.ts:57-60`) already decodes back into a pass, and
  `serializeProperties` (`sgf-writer.ts`) already re-emits losslessly (an empty-string
  *value*, `values.length === 1`, is not the "empty array" case that function skips).
  koPoint clears on a pass (matches GTP/SGF convention — a ko threat lapses when a player
  passes instead of playing it).
- **Routing** (`frontend/src/composables/board/useBoardMoveRouting.ts`): new `handlePass`
  reproduces `handleBoardMove`'s exact four-arm gate (AWAITING_MOVE → graded session path;
  LOADING/ANALYZING → no-op; REVIEWED → no-op; IDLE/FINISHED → free play, with the
  game-head engine-responder trigger firing on a pass exactly as it does on a placed
  move — passing off a green-ringed head is still a real move in that session).
- **Board affordance** (`frontend/src/components/board/StatusBar.vue`): an always-visible
  "Pass" text-labeled button in the status bar's right cluster, disabled (not hidden) via
  a `canPass` prop App.vue derives from the review session's transient/REVIEWED states —
  the button's enabled-ness never lies about what a click would do. Genre citation (per
  the design's own survey, reproduced here as the rationale for this placement/shape):
  Sabaki/KaTrain/OGS converge on "an always-visible, clearly-labeled pass control
  (button, not a hidden/modifier-only hotkey), separate from resign" — satisfied; a
  hidden-menu or modifier-only affordance was considered and rejected as the named
  deviation the design itself flags.
- **Keybinding** (`frontend/src/composables/keybindings-catalog.ts`): new
  `ACTIONS.boardPass` (`board.pass`), default key `'p'` — collision-checked against the
  full existing default-key set (ArrowDown/Up/Left/Right, Home, End, u, space, `[`, `]`,
  m, n, c, d, l, `.`, k — `p` was unused) via the suite's own "no two actions share a
  default key" test, which passes. Wired through a new module-scope signal
  (`usePassSignal.ts`, `requestPass()`/`passRequestCount`) — the exact shape
  `useMintDialogSignal.ts` already established for the same problem (the catalog is
  module-scope and has no component instance to call `handlePass` directly, since
  `handlePass` closes over `reviewSession`/`engineResponder`, both App-setup-scoped).
- **Review-session pass handling** (`frontend/src/composables/review/useReviewSession.ts`):
  the design's touched-file inventory left this open ("processUserMove-adjacent path (or
  a parallel processUserPass)"; no further detail given in the design doc's PASS SUPPORT
  section beyond that line) — **decision made in this build**: a pass during review is
  scored by the identical s_0→s_1 delta machinery as any other move (KataGo already wires
  a pass correctly, so no pass-specific grading branch is needed). Refactored the shared
  body of `processUserMove` into `processUserTurn(bId, nextBoard, s_0_idx, s_0_id)`; added
  `processUserPass()` as a thin sibling that produces `nextBoard` via `applyPass` instead
  of `applyGoMove(x, y)`. Both are exported from the composable's return surface.

### Game-end signal

`getGameEndStatus` (`frontend/src/engine/util.ts`) — a discriminated union
(`{kind:'in-progress'}` | `{kind:'ended-by-pass', lastMoveColor}`), evaluated positionally
off whatever `path` is passed in (StatusBar passes root→current via `getPath`), matching
the design's sketch verbatim and its "no new persistent state" requirement — it's a pure
function of `nodes` + `path`, nothing is stored. Surfaced in `StatusBar.vue` as a status
message ("Game ended — two consecutive passes"), status-only per the maintainer ruling —
**no scoring/territory code was written anywhere in this build.**

## Engine wire (KataGo)

**Finding: already correct, no fix needed.** `moveToKataCoord` (`engine/util.ts:155-157`)
and `AnalysisService.buildMovesAndTurnIndex` (`services/analysis-service.ts:151-174`, the
call site every query builder uses) already serialize any node whose `.move` is
non-null — placed or pass — into the wire `moves` array, with a pass encoding to the
literal `"pass"` string. This was pre-existing (the design doc's own survey flagged it as
"already round-trips correctly... if a pass GameNode ever existed in the tree" — the gap
was entirely upstream of the wire boundary, which is what B closes). The turn-index
off-by-one class diagnosed separately (`sgf-pass-diagnosis.md`'s "Invalid turn number:
249") was ALSO already fixed in `next` before this dispatch (visible in
`analysis-service.ts`'s `buildMovesAndTurnIndex` docstring, which now derives
`analyzeTurns` from the same real-move count `moves` uses, "unconstructable by
construction").

WITNESSED via a new integration test (`tests/integration/analysis-service-pass-moves.test.ts`)
against the REAL `AnalysisService` singleton and a mock `WebSocket` (same harness as the
pre-existing `analysis-service-moveless-node.test.ts`): a board with `B place → W pass →
B place` sends `moves: [["B","D4"],["W","pass"],["B","<coord>"]]` and `analyzeTurns`
covering `0..3` (the pass consumes a real turn, unlike a moveless node) — both green.

## Compose risk vs. `bork/feat/setup-stones-toolkit` (unmerged)

Built against `next`, per instruction, without merging the in-flight setup-stones branch.
Diffing `next` vs. that branch shows it currently touches (among others)
`TreeWidget.vue`, `keybindings-catalog.ts`, `App.vue`, and `locales/en.json` — all four
files this build also modifies. The branch appears stale relative to current `next` (its
diff against `next` shows only deletions, i.e. it predates several `next` commits and
hasn't been rebased), so an eventual merge/rebase of either branch onto the other will
need a real three-way resolution in at least: `TreeWidget.vue`'s node-render template/
v-memo key, `keybindings-catalog.ts`'s `ACTIONS`/`KEYBINDINGS_REGISTRY` (the setup-stones
branch's own dispatch mentioned "BoardWidget click routing was just touched there" —
this build did NOT touch `BoardWidget.vue`'s click routing, only `StatusBar.vue`/
`useBoardMoveRouting.ts`, so that specific collision is avoided, but the four files above
are real overlap). Flagging per instruction rather than merging.

## Out-of-scope, named limitation

`usePlayFromPosition.ts:409,474,681` (the engine self-play harness) still `throw`s when
KataGo's suggested best move is a pass — the design doc names this as optional
("only if self-play through game-end is in scope; otherwise leave as a named, documented
limitation"). Not touched by this build; self-play through a full game to a natural
two-pass end still errors rather than terminating cleanly. UNEXERCISED / left as the
design's own optional item.

`BoardVariationsOverlay.vue`'s pre-existing pass-aware guard
(`board-variations-markers.ts:68`, `child.move.type !== 'place'`) was checked, not
touched — it already correctly skips drawing a phantom circle for a pass child, now with
a real code path (pass children can exist post-B). No change needed.

## Tests (red-then-green, ADR-0021)

All new/updated test files, tier per `frontend/tests/CLAUDE.md`:

- `tests/unit/logic.test.ts` (tier 1) — `applyPass`: turn parity / no capture, tree-node
  shape (`move.type === 'pass'`, parent/child linkage), a pass mid-game leaves the stones
  projection untouched, two-consecutive-pass turn alternation, existing-child reuse
  (dedup), and an SGF round-trip through the REAL `serializeBoard` + `loadSgf` (asserts
  the written SGF contains a literal `;W[]` and that reloading it decodes back to
  `{x:0,y:0,color:'W',type:'pass'}`).
- `tests/unit/engine/util.test.ts` (tier 1) — `getGameEndStatus` truth table: fresh
  board, single move, pass-then-move (not ended), pass-pass (ended, correct
  `lastMoveColor`), a placed move after two passes (reverts to in-progress), branch
  switching (a sibling branch that doesn't end in two passes reads in-progress
  independent of a cousin branch that does), positional re-read after navigating back
  one step, and a moveless trailing node (SGF `TW`/`TB`-shaped) reading in-progress at
  its own position.
- `tests/integration/useBoardMoveRouting.test.ts` (tier 3) — `handlePass` mirrored
  against every one of `handleBoardMove`'s existing gating tests: AWAITING_MOVE routes to
  the graded pass handler (analyzeRange fires, move counted, node is `type: 'pass'`),
  LOADING/ANALYZING/REVIEWED are no-ops, IDLE plays freely (turn flips, no stone),
  FINISHED allows the pass without counting it as a review move, and a pass from a
  game-head fires the engine responder.
- `tests/integration/useReviewSession.test.ts` (tier 3) — `processUserPass`: same
  deterministic-timeout-settle shape as the pre-existing `processUserMove` timeout test,
  asserting the board actually advanced via a pass (no stones, `move.type === 'pass'`)
  and the same grading query (`analyzeRange`) fired.
- `tests/integration/analysis-service-pass-moves.test.ts` (new, tier 3) — engine-wire
  check described above.
- `tests/unit/composables/keybindings-catalog.test.ts` (tier 1) — updated the pinned
  18-action-id list (was 17), the closed domain set (`board` added), and added a test
  that `board.pass`'s handler bumps `passRequestCount` and its default key is `'p'`.

## Gates (WITNESSED, run in the worktree)

- `npm run build` (`vue-tsc -b && vite build`) — **PASS**, clean, no new warnings beyond
  the pre-existing >500kB chunk-size advisory (unrelated to this change).
- `npx eslint .` — **PASS**, zero problems. (One `local/justification-adjacency` hit was
  found and fixed during this build: `applyPass`'s `NodeId` cast needed an adjacent
  comment, same idiom as `applyGoMove`'s precedent.)
- `npm run test:run` — **PASS**: 122 passed / 3 skipped test files (125 total), 1560
  passed / 4 skipped tests (1564 total). No chromium, no `waitForTimeout` used anywhere
  in the new tests (all async settling goes through `flushPromises()` / mocked
  `waitForAnalysis` rejections, per the tests/CLAUDE.md idiom and the row-450 prohibition).

**Build-environment note (not part of the diff):** the worktree's `node_modules` was a
symlink to the main checkout's (read-only reuse, no npm install run); an early `vue-tsc -b`
cold-build emitted ~269 stray `*.vue.js`/`.js` compilation artifacts directly into
`frontend/src/` (a `.tmp`/tsbuildinfo cache-state artifact of the symlinked setup, not
something the production build normally does) — these were identified via `git status`
(all untracked, none overlapping this dispatch's two genuinely new files) and deleted
before the final gate run; the final `npm run build` recorded above produced no stray
files. Not committed.

## Per-claim evidentiary status

- Option A delivered end-to-end (C, B, game-end signal): **WITNESSED** — code diff +
  green gates above.
- Engine wire already correct (no fix needed): **WITNESSED** — new integration test
  against the real `AnalysisService` + mock WebSocket.
- Pass button genre-convention placement: **WITNESSED** — matches the design's own
  genre survey citations (Sabaki/KaTrain/OGS), reasoning reproduced above.
- Compose risk vs. setup-stones-toolkit: **WITNESSED** (file-list overlap via `git diff`),
  not merged/resolved (out of this dispatch's instruction).
- Self-play-harness pass-throw fix: **UNEXERCISED** — named-optional in the design,
  left untouched, documented here as a limitation.

## Summary

Built Option A of the ratified pass-support design end-to-end (C: TreeWidget pass-node
display; B: `applyPass` mutator + routing + board button + keybinding + review-session
handling; game-end signal: status-only two-pass check, no scoring) on branch
`bork/feat/pass-support`, isolated worktree off `next`, not merged/not pushed. Confirmed
the KataGo engine wire already handles pass moves correctly (both the pass-serialization
and the previously-diagnosed turn-index off-by-one were already fixed in `next`) and
pinned that with a new integration test. Flagged real file-overlap compose risk against
the unmerged `bork/feat/setup-stones-toolkit` branch without attempting a merge. All
three gates (`npm run build`, `npx eslint .`, `npm run test:run`) are green.

**Branch head:** `bork/feat/pass-support` @ `96674258e60f73b73591280071d45ab35d6a999c`

**Gates:** build PASS · eslint PASS (0 problems) · test:run PASS (1560 passed / 4 skipped)
