# Worklog — `playEngineMoves` cursor-conflation twin fix (2026-06-11)

> Audit trail for work-status item
> `playenginemoves-cursor-conflation-twin`; branch
> `bork/fix/playenginemoves-cursor-conflation-twin`. Custody-transferred
> to a standalone item 2026-06-11 (the lead had no home but a closed
> item's docstring note). This discharges the latent twin recorded by
> the branded-path-types arc
> (`docs/worklog/2026-06-10-branded-path-types.md`, "Known residue")
> and originally diagnosed alongside the match arc
> (`docs/worklog/2026-05-16-match-cursor-independence.md`, "Scope").

## The bug

Structurally identical to the 2026-05-16 match-cursor bug, one
register over. `playEngineMatch` was fixed then; `playEngineMoves` —
its single-engine self-play sibling in the same file — was left
latent because it had no production UI wire (its only consumers were
e2e position-gen scenarios that read the return value and never pass
`onMoveApplied`).

The conflation: `usePlayFromPosition.start` passed the reactive store
board straight into `playEngineMoves` and mirrored each applied board
back **wholesale** via `updateBoardState(writeIdx, next)`. Two failure
modes followed, exactly as the match worklog records for its own
pre-fix shape:

1. The loop's local `board` started as the same Vue reactive proxy
   the store held.
2. `updateBoardState` re-converges object identity —
   `store.boards[index] = newState` replaces the store's slot with the
   loop's own object (`store/index.ts:530`). So even a deep clone at
   the top of the loop would be **insufficient**: after the first
   wholesale mirror, the store and the loop re-share one object graph,
   and any user navigation mid-run (`mutateBoard` / `navigateTo`)
   mutates the loop's cursor in place. The next engine query then goes
   out from where the user navigated to, not from where the loop was
   playing.

This "deep clone is INSUFFICIENT, the re-convergence is the load-
bearing fact" is precisely what PR #386's verification sharpened (the
branded-path-types worklog's "Known residue" section, and its
hack-rationalization appendix's downgrade (b)). The fix shape is the
match's `MatchMoveApplied` delta-emission contract applied to
`playEngineMoves` — a consumer-contract change, which is why it was
recorded as its own arc rather than ridden along the brand threading.

## The fix (the match's contract, one register over)

Twin fix, not a redesign. The match's delta-emission contract
(`playEngineMatch` + `usePlayMatch.start`) is transferred verbatim in
shape to the single-engine pair:

1. **`EngineMoveApplied` interface** — the single-engine register of
   `MatchMoveApplied`. Same three fields: `previousPointer` (played
   FROM), `newPointer` (now AT), `newNode` (`GameNode | null`; `null`
   on existing-child reuse).
2. **`PlayEngineMovesOptions.onMoveApplied` signature change** —
   `(board: BoardState) => void` → `(delta: EngineMoveApplied) => void`.
   The only public-surface change. The two e2e callers
   (`tests/e2e/autonomous-srs-loop.test.ts`,
   `tests/e2e/review-session-harness.test.ts`) pass `katagoUrl`,
   `startBoard`, `untilPathLength`, `maxVisits`, `model` by name and
   **never pass `onMoveApplied`** — they read the returned
   `BoardState`. Unaffected.
3. **`playEngineMoves` deep-clones `startBoard`** via
   `JSON.parse(JSON.stringify(...))` (the documented structuredClone-
   footgun workaround — `BoardState` is a pure-POJO shape; same
   rationale as the match's clone site, cross-referenced in the
   comment). It extracts `{previousPointer, newPointer, newNode}` per
   move (the `isNewNode = !board.nodes[newPointer]` discriminator is
   the mirror of the match's) and emits the delta instead of the full
   board.
4. **`usePlayFromPosition.start`'s `onMoveApplied` rewritten** from the
   wholesale `updateBoardState` mirror to the surgical `mutateBoard`
   merge with the user-tracking gate
   `if (draft.currentNodeId === previousPointer) navigateTo(draft, newPointer)`
   — copied from `usePlayMatch.start`. `mutateBoard` mutates the
   store's own reactive board in place; the loop's internal `board` is
   never re-aliased to the store object after the clone, so the
   re-convergence is structurally gone.
5. **`updateBoardState` import removed** (now unused in the file). The
   module header line that named it as the mirror mechanism was
   updated to the surgical-merge contract.

No wire-protocol change, no proxy change, no backend change — the
match worklog's "no protocol change" holds for the twin too. The
per-move queries are unchanged (`buildAnalyzeQuery` was already
root→current).

### Signature change — surfaced prominently per the commission

The commission asked to keep the public surface compatible with the
future autonomous-SRS / play-vs-engine wire "unless the contract
forces a signature change (if it does, say so prominently)." It does:
`onMoveApplied`'s parameter type changes from `BoardState` to
`EngineMoveApplied`. This is **the fix** — the wholesale-board callback
is the conflation's mechanism, so it cannot survive. The future
production caller wires the delta contract (the same one
`usePlayMatch.start` already wires), which is the shape that does not
alias the user's cursor. The two existing e2e callers don't touch the
callback, so the change is source-compatible for every caller at HEAD.

## How cursor-independence is asserted

`tests/integration/usePlayFromPosition-cursor-independence.test.ts`
(tier-3, 3 tests), driving the real `playEngineMoves` against a
**step-driven** mock global `WebSocket` (the
`vi.stubGlobal('WebSocket', …)` shape of
`analysis-service-error-packet-narrowing.test.ts`):

- **Pure level** — with no `onMoveApplied`, the loop's returned board
  advances to path length 4 while the caller-held `startBoard`'s
  cursor and node set are exactly as handed in (the loop owns an
  independent clone, doesn't mutate its argument).
- **Product level (the load-bearing one)** — `usePlayFromPosition.start`
  drives the loop against the store; the test pumps exactly two moves
  (`pumpMoves` releases one query at a time, so the loop is genuinely
  **suspended awaiting its next query** at the interruption point — not
  finished), then navigates the user back to root mid-run, then lets
  the loop finish. Asserts: the user stays at root; the engine line
  reaches path length 7 on its own variation; and that deep line
  passes through the node the user had tracked to before navigating
  away (the loop kept playing from its own cursor, not from root).
- **Tracking case** — no mid-run navigation; the user's view follows
  each move to the engine line's leaf (case-1 behaviour the match arc
  preserves).

**Step-driving is load-bearing, not incidental.** A mock that
auto-answered every query runs the whole loop to completion inside a
single `flushPromises()`, so the "mid-run" navigation lands AFTER the
loop finished and the test passes for the wrong reason. This was
caught during authoring (an earlier microtask-auto-respond mock made
the mid-run test green even with the tracking gate removed) and is the
reason the final mock is step-driven. **Guard-liveness verified
firsthand**: removing the user-tracking gate in the
`usePlayFromPosition` consumer only (leaving `usePlayMatch`'s identical
gate intact) turns the mid-run test red exactly at
`expect(liveBoard().currentNodeId).toBe(rootId)` — the unconditional
navigate drags the user from root to the loop's leaf — while the two
non-navigating tests stay green (the assertion is load-bearing and not
over-broad). Confirmed again by the out-of-frame audit's own red-probe
(appendix).

## Verification

- `npm ci` (worktree `frontend/`) — clean.
- `npm run build` (`vue-tsc -b && vite build`) — clean (the pre-existing
  >500 kB chunk-size advisory is unrelated).
- `npx eslint .` — exit 0.
- `npm run test:run` — 1005 passed / 4 skipped / 0 failed (73 files;
  the 3 new tests included; the env-gated e2e `playEngineMoves` callers
  are among the skipped, as expected without a live proxy).

## Deferrals (recorded, not filed — todo DB is read-only for this arc)

The out-of-frame hack-rationalization audit (appendix) returned
**VERDICT: general** and surfaced four findings beyond the verdict.
Three are structural and **inherited verbatim from the already-shipped
match twin** (`usePlayMatch.start` / `playEngineMatch`); closing them
in this arc would either diverge the moves consumer from the match
twin (breaking the twin symmetry the commission asked for) or refactor
the shipped match consumer (out of scope for a signed-off twin fix,
ADR-0004 minimal-touch). They are recorded here so the next twin-touch
inherits the context:

- `not-filed:extract-engine-move-delta-reconcile-helper` — the two
  consumer `onMoveApplied` bodies (`usePlayMatch.start`,
  `usePlayFromPosition.start`) are now ~35 lines of **verbatim
  duplicated** merge-and-gate logic, differing only in an error-message
  symbol and one comment word. The "one shared contract" is enforced by
  copy-paste, not by a shared function; nothing prevents the two from
  silently diverging on the next edit to one. A
  `reconcileEngineMoveDelta(boardId, delta, label)` helper would make
  it structural. Deferred: extracting it touches the shipped match
  consumer, beyond this twin fix's scope.
- `not-filed:engine-move-merge-existing-child-fail-loud` — the
  existing-child-reuse branch swallows a "child not found" case
  silently (`if (childIdx !== -1) { … }`, no `else`), inherited from
  the match twin. Contradicts the file's surrounding ADR-0002 fail-loud
  posture (every other missing-node case throws). Deferred: adding a
  `throw` to the moves consumer only would diverge it from the match
  twin; the fix belongs to both consumers (and naturally rides the
  shared-helper extraction above).
- `not-filed:engine-move-existing-child-reuse-test-coverage` — no test
  (new or e2e) exercises the `newNode === null` existing-child-reuse
  path; the `isNewNode` discriminator and the `activeChildIndex`-bump
  branch are verified only by reading. Same gap the match twin shipped
  with (its worklog notes its `onMoveApplied` has no test coverage),
  and the same `applyGoMove`-dedup shape the branded-path worklog's
  row 9 flagged as runtime-unproven. A fixture that loads a board with
  a pre-existing forward variation and self-plays into it would close
  it for both consumers.

The fourth finding (per-call `O(tree-size)` clone via
`JSON.parse(JSON.stringify)`) is a known characteristic deliberately
matched to the match twin, not a defect — no action.

## Cross-references

- `docs/worklog/2026-05-16-match-cursor-independence.md` — the match
  arc this twins; its "Scope" section recorded this exact deferral.
- `docs/worklog/2026-06-10-branded-path-types.md` — "Known residue"
  re-recorded the twin and sharpened the "clone is insufficient /
  `updateBoardState` re-converges" finding (its hack-rationalization
  appendix's downgrade (b)).
- `frontend/CLAUDE.md` "Vue/CSS footgun checklist" — the
  `structuredClone`-cannot-clone-reactive-state entry whose worked case
  is the match clone site this twins.
- `src/store/index.ts:530` — `updateBoardState`, the re-convergence
  site the fix removes from this path.

## Appendix — hack-rationalization-detector run (verbatim record)

Recorded per the standing verbatim-appendix discipline. Run
**out-of-frame** by a separate `general-purpose` subagent that did not
write the diff and had not seen the implementer's reasoning; the
deterministic halves (the tells scanner over the diff, the
`currentNodeId` writer enumeration) are script outputs gathered by the
implementer and handed to the auditor, and the auditor re-ran the
red-probe firsthand. The artifact below is reproduced verbatim.

### Commission (the skill arguments, verbatim)

> Review the uncommitted change on branch
> worktree-agent-abd0516bc61c3c061 in
> /home/bork/w/omega/.claude/worktrees/agent-abd0516bc61c3c061 (frontend
> sub-project). The change applies playEngineMatch's delta-emission
> contract to its structurally-identical twin playEngineMoves, to close
> the cursor-conflation bug (work-status item
> `playenginemoves-cursor-conflation-twin`).
>
> [What changed: (1) new `EngineMoveApplied` interface; (2)
> `onMoveApplied` signature `(board: BoardState) => void` →
> `(delta: EngineMoveApplied) => void`; (3) `playEngineMoves`
> deep-clones `startBoard` via `JSON.parse(JSON.stringify(...))` and
> emits the per-move delta; (4) the product consumer rewritten from a
> wholesale `updateBoardState` mirror to a surgical `mutateBoard` merge
> with a user-tracking gate copied from `usePlayMatch.start`; (5)
> `updateBoardState` import removed. New step-driven mock-WebSocket
> integration test.]
>
> Claims to distrust: (a) faithful twin vs redesign; (b) deep clone +
> delta emission actually closes the conflation given "a clone is
> INSUFFICIENT because updateBoardState re-converges object identity";
> (c) the user-tracking gate is a coherent slot-owner invariant, not a
> per-writer flag — the cursor slot has two writers (engine loop merge,
> user navigation); (d) the test genuinely exercises mid-run navigation
> and is a live guard; (e) the two e2e callers are unaffected by the
> signature change.
>
> [Pointers: match worklog 2026-05-16; re-convergence finding in
> branded-path-types worklog 2026-06-10 "Known residue"; updateBoardState
> at src/store/index.ts:530. Tells scanner: 0 hits. Writer enumeration of
> currentNodeId: 7 sites, only navigator.ts:127 mutates a live cursor.]

### Artifact (verbatim)

```
## Hack-rationalization review: playenginemoves-cursor-conflation-twin (uncommitted, frontend)

FRAME CHECK: Out-of-frame. Separate invocation; did not write the diff or the justification; the implementer's claims were treated as the object of suspicion. Every load-bearing claim was independently re-derived from code, and the red-probe was run firsthand.

GENERAL FIX:   *The engine loop's cursor and the user-visible store cursor are two distinct slots; the loop owns a store-independent deep clone and emits only per-move deltas, and the user's cursor advances only when the user is demonstrably tracking the loop (`currentNodeId === previousPointer`)* — one invariant over the single `currentNodeId` write seam, identical to the match twin's.
PATCH SHIPPED: `playEngineMoves` deep-clones `startBoard` (`JSON.parse(JSON.stringify)`), computes `{previousPointer, newPointer, newNode}` per move, and emits an `EngineMoveApplied` delta; the product consumer drops `updateBoardState` and does a surgical `mutateBoard` merge (append child / bump `activeChildIndex`) gated by `if (draft.currentNodeId === previousPointer) navigateTo(...)`. e2e callers untouched (they pass neither `onMoveApplied` nor a reactive board).
DOWNGRADE:     None. No general fix was named-and-bypassed. The prior worklog's "a deep clone is INSUFFICIENT" was not used to *narrow* the fix — it was the reason the fix had to go *further* than a clone (drop the `updateBoardState` re-convergence and switch to delta emission), and that is exactly what shipped. The 2026-06-10 "recorded, not fixed" deferral carried a concrete cost (it was a consumer-contract change outside the brand-threading arc's scope, filed as its own work-status item), not a discipline-word — `narrower-but-justified` at the time, now discharged.
WRITER DELTA:  claimed 1 live cursor writer vs enumerated 1. (writers: `navigator.ts:127` `state.currentNodeId = targetNodeId` inside `navigateTo` — the sole `.currentNodeId =` assignment in all of `src/`. The other 6 `currentNodeId` sites mint fresh boards (board-factory, sgf-loader, `applyGoMove`'s return literal) or are type decls — none mutate a live board's cursor.) The two *logical* writers of that slot (the engine loop via the `mutateBoard` merge, and user navigation via `navigateTo`) both funnel through that one `navigateTo` seam; the gate is a single invariant over the seam, not a per-writer flag.
RUNTIME:       Reproduced + verified. Green baseline: 3/3 pass. Red-probe (gate removed in the `usePlayFromPosition` consumer ONLY, `usePlayMatch`'s identical gate left intact): the mid-run test fails precisely at `expect(liveBoard().currentNodeId).toBe(rootId)` — the unconditional navigate dragged the user's cursor from root (`root-tchx8rj`) to the loop's leaf (`node-75sj3`); the two non-navigating tests stayed green, confirming the assertion is the load-bearing one and not over-broad. The mock WebSocket is genuinely step-driven (`pumpMoves` releases one query at a time and waits for the loop to issue its next) so the navigation lands while the loop is suspended awaiting its third query, not after it finished. File restored; SHA matches pre-probe (`871f8ff0…`); `git diff --stat` shows only the one intended source file + the untracked test.

TELLS (Step 1): 0 hits. No minimality-word sits near a named-better-fix in the diff prose. The five `updateBoardState` mentions in the consumer file are all docstring/comment references explaining the *old, rejected* path (the thing being moved away from), not a downgrade of a better fix. The import of `updateBoardState` is dropped; no live call remains.

VERDICT: general

WHY: The fix is one invariant quantified over the single cursor-write seam — the loop owns an independent clone and the user's cursor moves only when they are tracking — and it is the byte-for-byte register of the already-shipped match twin's contract, so it is one shared contract across two composables rather than N patches. The deep-clone-is-insufficient finding drove the fix deeper (delete the re-convergence, emit deltas) rather than narrowing it, and `mutateBoard` was verified to mutate the store's own reactive proxy in place with no object-identity swap, so the re-convergence the old `updateBoardState` caused is structurally gone. The red-probe reproduced the conflation and the gate removing it, against running code, not on paper.

FINDINGS BEYOND VERDICT (required):
  - **The two consumer `onMoveApplied` bodies are now duplicated verbatim** between `usePlayMatch.start` and `usePlayFromPosition.start` — ~35 lines of identical merge-and-gate logic, differing only in the error-message symbol string and one comment word ("match's" vs "loop's"). The shared contract is currently enforced by copy-paste discipline, not by a shared function. Nothing prevents the two from silently diverging on the next edit to one (e.g., a future fix to the existing-child-reuse branch applied to one composable and not the other). A `reconcileEngineMoveDelta(boardId, delta, label)` helper would make the "one contract" structural; the duplication is the residual fragility this fix does not close. (Not a hack — the duplication predates this change on the match side — but it is the place the next twin-divergence bug will live.)
  - **The existing-child-reuse branch swallows a "child not found" case silently** (`const childIdx = parent.children.indexOf(newPointer); if (childIdx !== -1) { ... }` — no `else`). If `newNode === null` (signalling the move duplicated an existing child) yet `newPointer` is not among `parent.children`, the merge does nothing and the gate may still navigate the user into an inconsistent position. This is inherited verbatim from the match twin and is not exercised by either test (both tests only hit the new-node branch — `gtpForTurn` always produces fresh, distinct points). It contradicts the file's surrounding ADR-0002 fail-loud posture (every other missing-node case throws). Worth a `throw` per ADR-0002, and worth a test that constructs the dedup-into-existing-child path, which no test in the suite currently does.
  - **No runtime coverage of the existing-child-reuse (`newNode === null`) path** anywhere in the new test or the e2e callers. The `isNewNode` discriminator and the `activeChildIndex`-bump branch are verified only by reading; the red-probe and both green tests exercise only fresh-node creation. The match twin shipped with the same gap (its worklog notes "the affected `onMoveApplied` signature on `playEngineMatch` has no test coverage today"). The class of bug that branch guards against (loop descending into a user's pre-existing variation) is the exact `applyGoMove`-dedup shape the branded-path worklog's row 9 also flagged as runtime-unproven — it remains unproven here.
  - **The clone is per-call, not incremental**: `JSON.parse(JSON.stringify(startBoard))` deep-copies the *entire* board graph once at loop start. For a self-play run launched from a deep position with a large existing tree this is an O(tree-size) copy. It is correct and matches the match twin deliberately; flagged only because the cost scales with board history and is invisible at the small sizes the test drives — not a defect, a known characteristic.
```

License: Public Domain (The Unlicense).
