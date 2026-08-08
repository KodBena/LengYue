# Dispatch report — Learn Path walk drives the engine (commission ledger row 881)

Branch: `worktree-agent-ab88ba79bd9cfd4d8`
Commit: `1edbd051`

## Worktree staleness disclosure

The worktree checkout (`/home/bork/w/omega/.claude/worktrees/agent-ab88ba79bd9cfd4d8`)
was stale at session start: its HEAD (`3378806f`, "Merge pull request #444…
vite-8.0.16") was ~30 commits behind `next`'s tip in the primary checkout
(`d61de898`, "Merge port coherence…"). Fast-forwarded via
`git merge --ff-only d61de898` before reading any code. The only local
change lost to nothing (fast-forward, no conflicts) — pre-existing
`.claude/` untracked content was preserved.

A second, orthogonal path confusion: initial research (reading
`frontend/CLAUDE.md`, `useLearnPath.ts`, the analysis-service/ledger
machinery) was inadvertently done against `/home/bork/w/omega/frontend`
(the primary checkout's tree, a sibling location, NOT this worktree) before
the harness flagged it. Verified byte-identical (`diff` clean) against the
worktree's copy before any edit was made, so the research stands; all
actual edits, tests, and the commit were performed against the worktree
path only.

## Commissioned behavior — what changed

`useLearnPath.ts`'s walk (`src/composables/cards/useLearnPath.ts`)
previously treated any visited position lacking recorded analysis as an
automatic "frontier" — an executor-authored restriction from row 660 that
was never itself ratified, documented in the module header as one of
three "ratified constraints." Per commission row 881, that specific
restriction is repealed: a position with no ledger entry is now analyzed
**on demand** — the walk requests analysis through the app's existing
engine-query machinery, waits for the result, ranks it via the unchanged
`moveInfos[].order` law (row 706), and continues descending. "Frontier"
now means a **genuine** engine refusal (synchronous refusal or a
30s-timeout non-response) at a position the walk did ask about.

## Query-machinery finding (requirement 2)

Studied `analysis-service.ts`, `analysis-ledger.ts`,
`wait-for-analysis.ts`, `useReviewSession.ts`'s `processUserTurn`, and
`per-query-overrides.ts` / `useMinting.ts` before designing.

- **The existing one-shot query method is `analysisService.analyzeActiveNode(boardId, 'analyze', visits)`** — mode `'analyze'` (distinct
  from `'ponder'`) is exactly the "deep-analyze-this-node" one-shot method
  the codebase already has, and unlike `'ponder'` it doesn't implicitly
  cancel sibling queries on the same board. This is the ONLY engine-query
  call site added; no parallel/bespoke client was written.
- **`waitForAnalysis(rawKey, nodeId, turnNumber, {timeoutMs, signal})`**
  (already used by `useReviewSession.processUserTurn` to await a graded
  move's analysis) is reused verbatim to await the SAME ledger entry the
  walk's own `ledger.getRaw(rawKey, nodeId)` read already consults —
  no second read path was invented.
- **`turnNumber`** (the wire's real-move-count index, distinct from tree
  index whenever a moveless ancestor exists — see
  `analysis-service.ts`'s `buildMovesAndTurnIndex` docstring) is computed
  locally via a new `countRealMoves` helper that walks `getPath` +
  counts real-move nodes, rather than assumed equal to the walk's own
  `plyDepth` (which counts plies from the ANCHOR, not from root — the two
  diverge whenever the anchor itself sits below a moveless ancestor,
  possible since anchor resolution generalizes to any cursor position,
  row 832).
- **Query release**: `analysisService.stopQuery(queryId)` is called in a
  `finally`, mirroring `useReviewSession.processUserTurn`'s own
  request/wait/release shape — regardless of whether the wait resolves,
  times out, or is aborted.

### Visit-count governance finding (requirement 2, "check what governs a programmatic query's visit count")

The review session's per-card visit-budget override machinery
(`ReviewSessionData.visitsOverride` / `ReviewCard.defaultVisits`,
`useReviewSession.ts`'s `effectiveVisits` computed) is keyed to an
**existing minted card**. Every position this walk queries on demand is,
by construction, a position with **no card yet** — a carded position
already has recorded analysis from whatever query minted it (the walk
never re-queries a carded node). **There is no override to bypass or to
silently apply here** — the override machinery has nothing to act on at
an unminted position.

The visit count used is `store.profile.settings.minting.defaultVisits`
— the SAME profile-level setting `compileMintGradingParameter`
(`useMinting.ts`) bakes into `grading_parameter.data.default_visits` for
every card this walk (or any other mint path) creates. This means the
walk evaluates each position at exactly the visit budget the resulting
card will itself carry once minted — internally consistent, and neither
a silent bypass nor a silent application of the review-session override
machinery, since that machinery simply doesn't apply to this class of
query. Verified in a dedicated test
(`useLearnPath.test.ts`, "(a) requests analysis…") that asserts the
`visits` argument equals `store.profile.settings.minting.defaultVisits`.

## Pacing decision (requirement 3) — rejected alternatives

**Chosen**: one in-flight on-demand query at a time, strictly sequential
with the walk's own depth-first order (unchanged).

**Rejected: sibling-batch prefetch** (fire every sibling candidate's
analysis query up front, before ranking any of them). Candidates are
read from `moveInfos` on the JUST-ANALYZED PARENT position — "prefetch
the children" would mean firing queries for positions whose existence as
*ranked* candidates isn't known until the parent's own analysis (which
may itself be on-demand) has already landed. No actual parallelism
opportunity the current per-node walk shape exposes.

**Rejected: a walk-wide analysis queue draining independently of tree
growth**. Would decouple "which node is being analyzed" from "which node
the live tree cursor is on," breaking the "user watches the tree grow in
real time as results land" requirement — the cursor/growth and the
analysis wait are the SAME `await` by construction in this design.

## Cancellation (requirement 4)

`learnPathAborts` (module-scope, `BoardId`-keyed `Map<BoardId,
AbortController>`, mirroring `useReviewSession.ts`'s
`pendingAnalysisAborts`) holds an `AbortController` per in-flight walk. A
new board-close teardown handler (`learn-path:abort-query`) and a
workspace-reset handler (`learn-path:abort-query-all`), registered at
module scope in `useLearnPath.ts`, abort it; `waitForAnalysis` observes
this as `AnalysisWaitError('aborted')`, which the walk treats identically
to the pre-existing board-identity-safety abort path (`aborted = true`,
stop recursing, return the partial result — never a spurious frontier).
The in-flight engine query is released via `stopQuery` in a `finally`
regardless of outcome, so no query outlives the walk step that issued
it — and since the walk is strictly sequential, at most one query is
ever outstanding.

**Precedent note**: the sibling module `learn-path-pending-markers.ts`
registers its own board-close/workspace-reset handlers WITHOUT being
listed in `src/store/teardown-registrations.ts`'s bootstrap or the
`teardown-registry-completeness.test.ts` expected-label sets (it loads
transitively via the real app's `App.vue` → `LearnPathModal.vue` →
`useLearnPath.ts` import chain, just not through the completeness test's
narrower bootstrap-only import). The two new handlers this dispatch adds
(`learn-path:abort-query` in `useLearnPath.ts`, plus
`learn-path-progress:remove` / `learn-path-progress` in the new
`learn-path-progress.ts`) follow the SAME existing precedent — not added
to the bootstrap file or the completeness test, for consistency with the
sibling module already in that state. This is a pre-existing gap in that
test's coverage, not something this dispatch's scope covers closing.

## Progress honesty (requirement 5)

New module `src/composables/cards/learn-path-progress.ts` (module-scope,
board-keyed, mirroring `learn-path-pending-markers.ts`'s shape) tracks
the single NodeId the walk is currently awaiting an on-demand query for.
`useLearnPath.ts`'s walk calls `setAnalyzingNode`/`clearAnalyzingNode`
around each on-demand request. `TreeWidget.vue` gained a new
`analyzingNodeId` prop and a fifth ring in the existing concentric-ring
family (active/game-head/review-start/known-position/pending-mint), at
`NODE_R+13` with a distinct dash pattern and `--state-attention` color.
`App.vue` wires `activeBoardAnalyzingNodeId` through the same
module-scope-registry-read pattern as `activeBoardPendingMintIds`.
`LearnPathModal.vue` shows a distinct status line
(`learnPath.status.analyzing`) instead of the generic "growing the tree"
line while a query is in flight. No wall-clock fakery — the marker
reflects a genuinely in-flight query, cleared the instant it settles.

## Locale rewording (requirement 6)

Only `src/locales/en.json` carries the `learnPath.*` keys (`ja.json`,
`ko.json`, `zh-CN.json` don't have this feature translated — verified via
grep, zero hits in each). Reworded:

- `learnPath.explore.frontiers` / `learnPath.result.frontiers`: "no
  recorded analysis at that position" → "the engine refused analysis (or
  didn't respond in time) at that position."
- `learnPath.systemMessage.summary`: "{frontiers} frontier stop(s)" →
  "{frontiers} frontier stop(s) (engine refusal)."
- `learnPath.intro`: removed the now-false "using analysis already
  recorded for this board" claim; states the on-demand behavior and the
  engine-connection requirement.
- Added `learnPath.status.analyzing` for the new progress-honesty status
  line.

## Tests (requirement 7)

`tests/integration/useLearnPath.test.ts`, new describe block
`useLearnPath.explore — on-demand analysis (commission row 881)`, fake-
engine/fake-ledger driven, no wall-clock sleeps:

- **(a)** unanalyzed position → `analyzeActiveNode` requested (with the
  correct visit count) → the fake writes the response into the REAL
  ledger → the walk proceeds and grows the tree. Also asserts
  `stopQuery` releases the query.
- **(b)** genuine engine refusal (`analyzeActiveNode` → `null`) → a
  frontier, not a mint; also directly asserts the reworded locale
  strings (`en.json`) match `/engine refused/i`.
- **(c)** `store.engine.status !== 'connected'` → `explore()` rejects
  with `LearnPathPreconditionError` before any tree mutation (board
  node-set and cursor unchanged, no `createCard`, no
  `analyzeActiveNode` call).
- **(d)** cancellation: the fake's `analyzeActiveNode` implementation
  synchronously calls `closeBoard(boardId)` from inside the query call
  (simulating a close landing while the query is in flight) — the
  registered `learn-path:abort-query` handler aborts the walk's
  controller before `waitForAnalysis` is even constructed, so the abort
  is deterministic with no timers. Asserts `explore()` resolves (doesn't
  throw/hang), `stopQuery` still released the query, and the abort
  produced no frontier.
- **(e)** legacy: every visited position pre-seeded in the ledger →
  `analyzeActiveNode` mock throws if ever called (proving it genuinely
  never fires) → byte-identical walk/tree-growth outcome to the pre-881
  code path.

Also updated `tests/fakes/analysis-service.ts`: `analyzeActiveNode`'s
declared type was `(boardId, mode) => void` (a pre-existing drift — every
prior caller, ponder toggles, ignored the return value), widened to the
real `QueryId | null` and given a default non-null `mockReturnValue` (re-
armed in `resetFakeAnalysisService`) so `useLearnPath`'s on-demand path,
the first consumer that reads this return value, exercises correctly.
Existing consumers (`useFollowMePonder.test.ts`, `useUserIORegistry.test.ts`)
only assert on call shape, never the return value, so this is
backward-compatible.

`tests/integration/useLearnPath.test.ts`'s shared `beforeEach` now also
sets `store.engine.status = 'connected'` (the new precondition would
otherwise refuse every pre-existing test in the file) and defaults
`analyzeActiveNode` to a synchronous `null` refusal — reproducing the
OLD "missing analysis = frontier" outcome exactly (same result, same
synchronous timing, no engine round-trip) for every pre-existing fixture
in the file that has genuine gaps in its seeded ledger data on purpose.

## Per-claim evidentiary status

- WITNESSED: `npx vue-tsc --noEmit` exit 0 (see Gate verdicts below).
- WITNESSED: `npx vitest run --silent=true` — full suite, 153 files / 1835
  tests passed, 4 skipped (pre-existing skips, unrelated to this change),
  0 failed.
- WITNESSED: the 5 new on-demand-analysis tests plus the pre-existing 16
  `useLearnPath.test.ts` tests pass together (16 tests total in that
  file before this change's additions; the on-demand describe block adds
  5 more — file totals 21 `it` blocks, all green).
- WITNESSED: `npx eslint` on every touched `.ts`/`.vue` source file — 0
  errors (2 harmless "file ignored" warnings on `tests/` files, which
  the project's eslint config excludes by design).
- UNEXERCISED: a live engine / live proxy end-to-end run. Per hard
  constraints, the live engine (`ws://192.168.122.68:1235` /
  `ws://192.168.122.1:1242`) and live ports were never touched; all
  verification is against the fake-engine/fake-ledger test harness.
- WITNESSED (by inspection, not a dedicated automated check): only
  `en.json` carries `learnPath.*` keys — confirmed via `grep -c
  learnPath` returning 0 for `ja.json`/`ko.json`/`zh-CN.json`.

## Deviations from the literal requirement text

None that narrow scope. One engineering elaboration beyond the letter:
requirement 5 named "extend its vocabulary if needed" for the walk's
*existing* live-progress surface; this dispatch added a genuinely new
per-node visual (`TreeWidget`'s analyzing ring) and a new module rather
than only a vocabulary change to the modal's single status string,
because the modal's own hint text is the only pre-existing "live
progress surface" and a single string cannot distinguish "growing" from
"analyzing" at the per-node granularity the tree-growth feature already
promises ("the user watches the tree grow in real time as results
land"). Judged in-scope, not scope-expansion, since it's the minimal
honest way to surface the requirement's own example vocabulary
("analyzing…" vs "marked" vs "stopped") without misrepresenting which
node is in which state.

## Worktree environment note

`node_modules/` was absent from this worktree at session start (only the
primary checkout at `/home/bork/w/omega/frontend` had it installed,
verified `package-lock.json` byte-identical between the two). Symlinked
`frontend/node_modules -> /home/bork/w/omega/frontend/node_modules`
rather than running a fresh `npm install`, since the lockfiles matched
exactly; the symlink is `.gitignore`d (verified via `git check-ignore`)
and not part of the commit.
