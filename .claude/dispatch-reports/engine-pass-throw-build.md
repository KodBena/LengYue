# Build: `engine-pass-throw` — usePlayFromPosition/playEngineMatch no longer throws on an engine-recommended pass

- **Builder:** isolated worktree agent, base `next` @ `0c21780d` (base
  check performed at dispatch per row 2599 — worktree HEAD was found
  stale at `dc8e3b12`; `git reset --hard 0c21780d` applied and
  verified before any other act; no local work was on top of the
  stale HEAD other than an untracked `.claude/logs/` directory).
- **Source finding:** `.claude/dispatch-reports/pass-support-review.md`,
  finding 5 ("Self-play-harness engine-pass throw"), read in full.

## The bug

`frontend/src/composables/board/usePlayFromPosition.ts` treats a
`null` return from `gtpToBoard(best.move)` — the engine's own way of
saying "the top-ranked move is a pass" — as a hard failure and throws.
Per the codebase's own founding move-semantics distinction (KataProxy
move semantics: a move IS a state transition; the review's finding 5
names this explicitly), a pass is a legitimate member of the engine's
move vocabulary, not an error condition. This is user-reachable:
`EngineMatchModal.vue` → `App.vue`'s `handleStartMatch` →
`usePlayMatch(activeBoardId).start` → `playEngineMatch`, whose
per-player `MatchPlayer` overrides (`MatchPlayerOverridesConfig.vue`)
can plausibly steer a side toward passing (e.g. a weak/policy-only
override). Before this fix, that configuration crashes the match with
an uncaught `Error` instead of ending or continuing gracefully.

## Fix

`playEngineMatch`'s throw site (`frontend/src/composables/board/usePlayFromPosition.ts`,
was line 704) now applies the pass via `applyPass` (`frontend/src/logic.ts`)
instead of throwing:

```ts
const coords = gtpToBoard(best.move);
const previousPointer = matchBoard.currentNodeId;
const next = coords ? applyGoMove(matchBoard, coords.x, coords.y) : applyPass(matchBoard);
if (!next) {
  throw new Error(`playEngineMatch: engine's top move ${best.move} is illegal at turn ${expectedTurn}`);
}
```

`applyPass` never returns `null` (unlike `applyGoMove`, which can
reject an illegal placement), so the existing `if (!next) throw`
guard is preserved verbatim for the genuinely-illegal-move case
(ADR-0002: that failure mode still fails loudly) and cannot
spuriously fire on the pass branch. The existing-child-reuse /
new-node discrimination and `EngineMoveApplied`/`MatchMoveApplied`
delta emission downstream are unaffected — `applyPass` follows the
identical dedup-or-create shape `applyGoMove` does.

## ADR-0000 sibling sweep (ledger item mandates this be named)

The class: *"engine move vocabulary includes pass; a consumer that
enumerates only coordinate moves fails open at pass."* Every
`gtpToBoard(...)` call site in `frontend/src` was checked:

| Site | Consumption shape | Disposition |
|---|---|---|
| `usePlayFromPosition.ts::playEngineMatch` (line ~702) | Applies the engine's move to advance a match | **Mandated fix, applied** (above). |
| `usePlayFromPosition.ts::playEngineMoves` (line ~423) | Applies the engine's move to advance the single-engine self-play loop | **Fixed — one-line-identical sibling, disclosed per the ledger item's instruction.** Structurally the same shape as `playEngineMatch` (same `applyGoMove`-or-throw pattern, same `EngineMoveApplied` delta-emission contract this file documents as `playEngineMatch`'s sibling); the identical one-line change (`coords ? applyGoMove(...) : applyPass(...)`) applies with no adaptation. This is also the literal composable the ledger item names (`usePlayFromPosition.start` drives `playEngineMoves`), so the witness test below exercises this site directly. |
| `usePlayFromPosition.ts::queryEngineMove` (line ~488) | One-shot: returns `EngineMoveResult { x, y, gtp, packet }` for a caller (the harness's human-simulator, which feeds the coords into `useReviewSession.processUserMove`) — does **not** itself apply any move | **Checked, not fixed.** The return contract has no pass-shaped variant (`x`/`y` are required numbers); representing a pass would need a new discriminated return shape, not a one-line change, and no current caller is documented as needing it. Left as a named, honest limitation (same disposition the original design doc's "otherwise leave as a named, documented limitation" option space anticipated) — a distinct ledger item if a caller needs it. |
| `useReviewSession.ts` (line ~919-926), the post-user-move engine-reply follow-through | `if (coords) { applyGoMove(...); updateBoardState(...); }` with **no `else`** — a `null` coords (engine recommends pass) is silently dropped: the engine's reply move never lands and the review session proceeds to `AWAITING_MOVE` as if the engine had played nothing | **Checked, not fixed.** Different failure mode from the mandated class (silent no-op, not a throw) and a different consumption context (the review-session grading/state-machine loop, well outside this task's fence — "only the pass-consumption path; no StatusBar/toolbar/divider/LYT/sink/proxy" plus the umbrella's scope discipline argue against reaching into the review-session state machine for an unrelated ledger item). Worth a follow-on ledger item; named here per the "surface every sibling" instruction, not fixed. |
| `use-move-suggestions.ts` (lines 142, 171), suggestion-disk and PV-line rendering | `if (!coords) return [] / continue;` — filters a pass out of a drawable-move list | **Not a bug.** A pass has no board coordinate to draw a disk/PV-line at; filtering it from a rendering list is the correct behaviour, not the same "fails open" class (nothing is silently *applied* incorrectly — it's an intentional visual filter). |
| `useLearnPath.ts` (line 867), engine self-explore-tree growth | `if (!coords) { unplayableCount++; continue; }`, with an inline comment: "Pass (or another unplayable GTP token). Counted, not dropped." | **Not a bug — already correctly handled.** This sibling was built pass-aware from the start; no fix needed. |

## Witnesses

**Tier: Tier-3 composable integration** (per `frontend/tests/CLAUDE.md`,
read in full before authoring), new file
`frontend/tests/integration/usePlayFromPosition-engine-pass.test.ts`,
mirroring the existing `usePlayFromPosition-cursor-independence.test.ts`
step-driven mock-`WebSocket` harness (read in full before authoring).
Drives the **real** `usePlayFromPosition` composable (→ real
`playEngineMoves`) against a mock proxy scripted to recommend `pass`
on the first turn. Asserts:

- the run settles with `player.lastError.value === null` and
  `isRunning.value === false` (no thrown error surfaces);
- the board actually advances (`getPath(...).length` grows from 1 to
  2, `currentNodeId` changes from root);
- the new node is a **genuine pass**, not a no-op: `move.type ===
  'pass'`, `move.color` equals the color that was to move, the SGF
  property shape is `{ [turn]: [''] }` (per `applyPass`'s own
  contract in `src/logic.ts`), and `turn` flips to the other color.

**Red/green verified by hand**, per the ledger item's mandate:

- Reverted the fix locally (`git stash push -- src/composables/board/usePlayFromPosition.ts`):
  the new test fails with `Error: playEngineMoves: engine recommended
  pass at turn 0` thrown from the pre-fix throw site — confirming the
  test actually exercises the unfixed shape and would have caught the
  original bug.
- Restored the fix (`git stash pop`): the test passes.

This is a **test-level witness**, not a live-engine witness — the
proxy is mocked (step-driven `WebSocket`, same pattern as the existing
cursor-independence suite), not `ws://192.168.122.68:1235`. Honest
disclosure per the ledger item's tier language: a mock-proxy
integration test is sufficient here because the bug is purely in this
module's local branching on `gtpToBoard`'s return, not in anything a
live engine's actual search behaviour would reveal differently from a
scripted "recommends pass" packet.

## Gates run (synchronous, foreground, outputs read in full)

- `vue-tsc -b --noEmit` — clean, no errors.
- Targeted `vitest run` — the new witness suite plus every existing
  suite that imports `usePlayFromPosition`, `playEngineMatch`,
  `playEngineMoves`, or `src/logic.ts` (import-graph reach; 17 files):
  `usePlayFromPosition-engine-pass.test.ts`,
  `usePlayFromPosition-cursor-independence.test.ts`,
  `engine-move-delta-reconcile.test.ts`,
  `autonomous-srs-loop.test.ts` (e2e),
  `review-session-harness.test.ts` (e2e),
  `analysis-service-handicap-query.test.ts`,
  `analysis-service-mid-tree-setup-notice.test.ts`,
  `analysis-service-pass-moves.test.ts`,
  `useFollowMePonder.test.ts`, `useLearnPath.test.ts`,
  `useUserIORegistry-nav-home-end.test.ts`,
  `useUserIORegistry-pass-mid-game.test.ts`, `useUserIORegistry.test.ts`,
  `autonomous-srs-policies.test.ts`,
  `board-mutation-entry-point.test.ts` (eslint-rule unit test),
  `logic-setup.test.ts`, `logic.test.ts` —
  **15 files passed, 2 pre-existing skips (unrelated to this
  change), 117 tests passed, 0 failed.**
- `npm run build` (`vue-tsc -b && vite build`) — clean; the diff
  touches non-test source (`usePlayFromPosition.ts`), so this gate
  was mandatory per the brief. Only pre-existing informational
  warning (chunk size > 500kB, unrelated to this change).

## Documentation

- `frontend/FILES.md`: updated the `usePlayFromPosition.ts` row —
  was "looped applyGoMove against a KataGo URL", now names the
  `applyPass` branch and the ledger item, since the file's actual
  behaviour (and its dependency on `logic.ts::applyPass`) changed.
- `FEATURES.md`: no change. The existing "Engine-vs-engine match"
  entry doesn't promise or deny pass-handling either way, and this
  is a defect closure (crash → graceful continuation), not a new
  describable capability — nothing in the tour became inaccurate.
- Work-status: **not** written to the `todo` Postgres DB (retired
  prototype per the 2026-08-13 correction). This build does not run
  `./autoharn` itself — the CLI is not present in this isolated
  worktree (only the coordinator's main-repo checkout has it, per
  the umbrella's autoharn-governance note). The ledger close
  (`--review-deferred` per the brief) is for the coordinator to run
  from the main repo root, using this report as the witness record.

## Closure statement

Fixed the mandated site (`playEngineMatch`'s pass-throw, reachable
from `EngineMatchModal`'s per-player overrides) and its
one-line-identical sibling (`playEngineMoves`, the literal
`usePlayFromPosition` self-play loop). Checked every other
`gtpToBoard(...)` consumer in `frontend/src` for the same blindness:
`queryEngineMove` (different, non-move-applying return contract —
left as a named limitation), `useReviewSession.ts`'s engine-reply
follow-through (different failure mode — silent no-op, not a throw;
out of this task's fence — left as a named limitation for a follow-on
item), `use-move-suggestions.ts` (correct as-is — filtering a pass
from a drawable-move list isn't the bug class), `useLearnPath.ts`
(already pass-aware, no fix needed). No StatusBar/toolbar/divider/
LYT/sink/proxy touched. Witness: new Tier-3 composable-integration
test, verified red-on-revert/green-on-fix by hand. Gates: tsc clean,
targeted vitest (117 passed / 0 failed across the full import-graph
reach), build clean.
