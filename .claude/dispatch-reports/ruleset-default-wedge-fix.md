# FIX report — ruleset default-instead-of-block, and the review-session query-refusal wedge

Maintainer live-testing adjudication superseding the shipped
`rulesets-build.md` design (fail-loud arm) and its addendum. Two
independent fixes: (1) an unrecognized/absent `RU` now DEFAULTS to
Tromp-Taylor instead of blocking queries; (2) a query construction
refusal (of ANY cause, not just the vetoed ruleset-block) no longer
wedges a review session in a dead-end state.

## Fix 1 — ruleset defaulting

`RulesetResolution` (`frontend/src/engine/rulesets.ts`) reshaped from
`{ kind: 'resolved', name } | { kind: 'unknown', raw }` to
`{ name: RulesetName; source: 'ru' | 'defaulted' }`. `normalizeRuleset`
is still total, but the "could not resolve" arm is gone — it now
resolves to `{ name: 'Tromp-Taylor', source: 'defaulted' }` instead of
refusing. `source` is the represented fact (not silent coercion): a
recognized `RU` gets `source: 'ru'`; a missing/unrecognized one gets
`source: 'defaulted'`.

Consumers updated:

- `src/engine/util.ts` (`getRulesetResolution`) — docstring only, no
  logic change (pure passthrough of `normalizeRuleset`).
- `src/services/analysis-service.ts` — removed both fail-loud gates
  (`analyzeRange` and `analyzeActiveNode`): `rulesetResolution.name` is
  now always defined, so both query builders proceed unconditionally
  and send `rulesetToWireName(rulesetResolution.name)` (Tromp-Taylor's
  wire spelling `'tromp-taylor'` on a defaulted board). Also dropped
  the now-dead `analysis.rulesetUnrecognized` i18n key and its
  `pushSystemMessage('error', ...)` call at both sites.
- `src/components/board/StatusBar.vue` — dropdown's bound `:value` is
  now `rulesetResolution.name` unconditionally (always one of the four
  names, so no disabled placeholder option is needed); the
  `unrecognized`-CSS-state / disabled "unrecognized — choose" `<option>`
  are removed. A `.defaulted` class (italic, `--text-2`, no warning
  accent) plus a swapped tooltip (`statusBar.rulesDefaulted`) is the
  minimal honest hint for `source === 'defaulted'` — informational, not
  alarming, since the query proceeds either way.
- `src/App.vue`'s `handleUpdateRules` — **unchanged**. It already only
  writes canonical `RU` on explicit user selection (never on default),
  which is exactly what the adjudication requires — no auto-write-back
  on default.
- `src/store/board-factory.ts` — comment-only update (the RU-authored
  fresh board now resolves with `source: 'ru'`, not the removed
  "unknown-blocks-analysis" concept).
- `src/locales/en.json` — removed `analysis.rulesetUnrecognized` and
  `statusBar.rulesUnrecognized`; added `statusBar.rulesDefaulted` and
  `review.queryRefused` (fix 2).

## Fix 2 — the wedge

**Diagnosis (`src/composables/review/useReviewSession.ts`,
`processUserMove`, pre-fix around what is now line ~671–681):**
`analysisService.analyzeRange(...)` can refuse query construction
synchronously and return `null` (pre-fix-1: an unresolved ruleset;
post-fix-1: the remaining real trigger is the engine disconnecting
between the click and the call, or any other guard inside
`analyzeRange`/`analyzeActiveNode` — `!board`,
`store.engine.status !== 'connected'`, `fullPath.length === 0`). The
pre-fix code did NOT check `reviewQueryId` before falling into
`await Promise.all([waitForAnalysis(keys.rawKey, s_0_id, ...),
waitForAnalysis(keys.rawKey, s_1_id, ...)])` — a wait keyed to a query
that was never issued. In production this wait sits pending until
`KATAGO_ANALYSIS_TIMEOUT_MS` (30s) elapses, at which point the catch's
`timeout` branch drops the session to a terminal `IDLE`
(`useReviewSession.ts` catch block, `err.reason === 'timeout'`).
`IDLE` has no path back to the SAME attempted move: by that point the
board had already advanced to `nextBoard` (s_1, via the unconditional
`updateBoardState` call earlier in `processUserMove`) and
`userMovesCount` had already been incremented (also earlier,
unconditional) — so even once the refusal's cause clears, the user's
next click is scored as a DIFFERENT move against the card, not a retry
of the refused one. That is the wedge: no dead ends is violated (C8).

**Fix:** immediately after the `analyzeRange` call, check
`reviewQueryId === null` and, if so, undo both prior mutations —
`mutateBoard(bId, draft => navigateTo(draft, s_0_id))` (restores
stones/captures/turn to the pre-move position; `navigateTo` fully
recomputes board state, not just the cursor) and
`draft.userMovesCount = Math.max(0, draft.userMovesCount - 1)` — set
`status` back to `AWAITING_MOVE`, push a `review.queryRefused` warning,
and `return` before ever reaching the `Promise.all`/`waitForAnalysis`
call. The session lands in exactly the state it was in before the
click, so retrying the identical `(x, y)` click is a genuine retry.

**Red-leg honesty note (per the brief's instruction to trace
precisely):** the test forces the wedge by mocking
`fakeAnalysisService.analyzeRange` to return `null` once, rather than
via the (now-defaulted, non-refusing) ruleset path. Against the
pre-fix code in jsdom, the test goes red — but NOT via the literal
30-second `KATAGO_ANALYSIS_TIMEOUT_MS` hang (that would require
faking timers and a `waitForAnalysis` mock that hangs until abort).
The suite's `waitForAnalysis` mock (`vi.fn()`, no default
implementation) returns `undefined` synchronously; `Promise.all`
wraps that as an already-resolved value, so `s_1_packet` becomes
`undefined` and the code falls into the SEPARATE
`scored.kind === 'missing'` branch (no per-move delta found), which
also lands on `status: 'IDLE'` with a warning message. The observed
red assertion is `expected 'IDLE' to be 'AWAITING_MOVE'` — proving the
same class of bug (continuing past a null `reviewQueryId` reaches a
terminal, non-resumable IDLE with the board/count already advanced),
via a different one of the two now-parallel jsdom-reachable IDLE
sinks rather than the literal timeout path. Verified live: stashed
just the composable fix, reran the test, confirmed the exact failure
above, then restored the fix and confirmed green (see the commit
history / testing note below — the stash/pop round-trip is not itself
committed).

## Test names

- `tests/unit/engine/rulesets.test.ts` — rewrote the case-insensitive
  suite to assert `{ name, source: 'ru' }`; replaced the vetoed
  `'unknown' arm` describe block with `normalizeRuleset — unrecognized
  input defaults to Tromp-Taylor (live-testing adjudication)` (5
  cases: unrecognized name, empty string, undefined, near-miss
  garbage, "never widens into a DIFFERENT name" over 4 inputs).
- `tests/unit/engine/util.test.ts` — `getRulesetResolution`: replaced
  the two "explicit unknown arm" cases with "defaults to Tromp-Taylor
  (source: defaulted)" (missing / unrecognized RU); the fresh-board
  case now asserts `source: 'ru'` (authored, not defaulted).
- `tests/integration/analysis-service-ruleset.test.ts` —
  delete-with-justification comments mark the two vetoed
  refusal-expectation tests per describe block (`analyzeRange`,
  `analyzeActiveNode`); replaced with "defaults to Tromp-Taylor and
  proceeds ... (no refusal, no system message)" pairs asserting
  `queryId !== null`, one query sent, `rules: 'tromp-taylor'`, and an
  unchanged message count.
- `tests/integration/useReviewSession.test.ts` — new describe
  `useReviewSession.processUserMove — query-refused recovery (the
  wedge fix)`, test `recovers to AWAITING_MOVE at the pre-move
  position when analyzeRange refuses (returns null); the SAME move
  then succeeds once conditions clear` — asserts AWAITING_MOVE,
  `userMovesCount` back to 0, board back at root with no stones,
  `waitForAnalysis` never called, a warning message pushed, then
  drives a second `processUserMove(3, 3)` (analyzeRange re-armed,
  `waitForAnalysis` resolving) and asserts it succeeds
  (`userMovesCount` → 1, second `analyzeRange` call).

## Gate tails

```
$ npm run build
✓ 1093 modules transformed.
✓ built in 1.77s

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  105 passed | 3 skipped (108)
      Tests  1322 passed | 4 skipped (1326)
```

License: Public Domain (The Unlicense)
