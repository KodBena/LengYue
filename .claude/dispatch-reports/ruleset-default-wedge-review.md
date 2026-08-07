# Fresh-context review: ruleset-default-wedge fix

Branch `worktree-agent-a5b9a44300c392711` @ e2d8f3fe, base `next`. Worktree:
`/home/bork/w/omega/.claude/worktrees/agent-a5b9a44300c392711`.

## VERDICT: ACCEPT

## Gate runs (WITNESSED)

All run directly in the worktree, this session, not taken from the builder's
self-report.

- `npm install` — WITNESSED, clean (333 packages).
- `npm run build` (`vue-tsc -b && vite build`) — WITNESSED, green. Typecheck
  passes (so no leftover `.kind`/`.raw` call site could have slipped past
  the type system), Vite build succeeds.
- `npx eslint .` — WITNESSED, zero output, zero findings.
- `npm run test:run` — WITNESSED: **1322 passed, 4 skipped (105 files, 3
  skipped)**. The skips are pre-existing — no file containing a `.skip`/`.todo`
  is touched by this diff, and no test file's skip count changed as part of
  this change; not introduced by the change under review.

## Item 1 — ruleset defaulting

`RulesetResolution` is reshaped from the discriminated
`{kind:'resolved',name}|{kind:'unknown',raw}` union to
`{name: RulesetName; source: 'ru' | 'defaulted'}` — a total function, no
refusal arm, matching the spec's required shape exactly.

- `normalizeRuleset` (`frontend/src/engine/rulesets.ts`): unrecognized input
  now falls through to `{name:'Tromp-Taylor', source:'defaulted'}` instead of
  `{kind:'unknown', raw}`. Case-insensitive alias resolution is unchanged for
  the four recognized names.
- Both `AnalysisService` query-builder call sites (`analyzeRange`,
  `analyzeActiveNode` in `frontend/src/services/analysis-service.ts`) had
  their `if (rulesetResolution.kind === 'unknown') { pushSystemMessage(...); return null; }`
  gates deleted outright — `.name` is used unconditionally now. Verified by
  reading the full diff hunks, not just the removed lines.
- Grepped the entire worktree `src/` and `tests/` trees for
  `.kind ===`/`kind: 'resolved'`/`kind: 'unknown'`/`.raw` in ruleset context:
  zero hits outside a historical-narrative comment in `rulesets.ts`'s own
  header describing the *old*, superseded shape. No stale call site treats
  the resolution as the old union.
- Write-back check: `App.vue`'s `handleUpdateRules` (`root.properties['RU'] =
  [newRules]`) is untouched by this diff — it is the sole RU-mutation site
  and fires only on explicit user selection from the StatusBar dropdown.
  Defaulting (`getRulesetResolution` / `normalizeRuleset`) never writes to
  `properties['RU']` — confirmed by reading both functions; they are pure
  reads.
- `board-factory.ts`'s `createInitialBoard` authors `RU: ['Tromp-Taylor']` at
  construction, so a fresh board resolves with `source: 'ru'` (authored), a
  case the tests correctly distinguish from `source: 'defaulted'` (a loaded
  SGF with no/unrecognized RU that never touches the file).
- StatusBar.vue's dropdown always has a selectable value now (`:value`
  unconditionally `rulesetResolution.name`); the removed `<option value=""
  disabled>` "Unrecognized — choose" placeholder is gone, replaced by a
  `.defaulted` (italic, muted) style class distinct from the old
  `.unrecognized` warning-accent class — correctly downgrades a represented
  fact from a warning-styled refusal to an informational hint, matching the
  spec's "indicate defaulted, don't block" requirement.
- i18n: `statusBar.rulesUnrecognized` and `analysis.rulesetUnrecognized` keys
  are removed and no longer referenced anywhere (grepped); replacement keys
  `statusBar.rulesDefaulted` and `review.queryRefused` are both used exactly
  once at their respective call sites.

No remaining path where an unrecognized RU blocks or throws. No accidental
RU[Tromp-Taylor] write-back on defaulting.

## Item 2 — review-session wedge

Read `useReviewSession.processUserMove` in full (not just the diff hunk),
lines 574–800, plus `applyGoMove` (`frontend/src/engine/logic.ts`) and
`navigateTo` (`frontend/src/engine/navigator.ts`) that the recovery path
calls.

- **Mechanism, confirmed correct**: `processUserMove` calls `applyGoMove`
  (advances board + `currentNodeId` to the new node, `updateBoardState`),
  increments `draft.userMovesCount`, *then* calls `analyzeRange`. Pre-fix,
  a `null` return (query construction refused) fell straight into
  `Promise.all([waitForAnalysis(s_0...), waitForAnalysis(s_1...)])` keyed to
  a query that was never issued — unrecoverable until
  `KATAGO_ANALYSIS_TIMEOUT_MS` elapsed, and even then landed at terminal
  `IDLE` with the board already advanced and the move already counted: a
  genuine dead end, matching the spec's description exactly.
- **The fix**: on `reviewQueryId === null`, short-circuits *before* the
  `Promise.all` wait: `mutateBoard(bId, draft => navigateTo(draft, s_0_id))`
  + `userMovesCount = max(0, userMovesCount - 1)` + `status = 'AWAITING_MOVE'`
  + a warning system message, then `return`.
- **Undo completeness, checked mechanically, not by inspection alone**:
  `navigateTo` is the same pre-existing tree-navigation primitive used
  throughout the codebase for ordinary back/forward navigation (e.g. line
  ~537's `mutateBoard(bId, draft => navigateTo(draft, targetLeafId))`), not
  new machinery written for this fix. Reading its body: it reverses
  stone placement, restores captured stones from `node.delta.captures`,
  restores `koPoint` from `node.delta.prevKoPoint`, and restores `turn` from
  the undone node's own move color — i.e. captures, ko, and turn parity are
  all covered, not just `currentNodeId`. `userMovesCount`'s only mutation
  site in the whole codebase is this composable (`grep`-enumerated: 7 write
  sites, all in `useReviewSession.ts`, none elsewhere) — the increment this
  fix undoes is the only increment on this path, so the `-1` is a complete,
  correct inverse, not a partial one.
- **Retry correctness**: `applyGoMove`'s "existing-child reuse" branch means
  a retried identical `(x,y)` click after the undo descends into the
  *same* child node rather than minting a duplicate sibling/branch — so the
  recovery doesn't leave a stray dead node in the tree on retry.
- **Coverage of other paths into the same wedge**: `analyzeRange` has three
  synchronous null-return guards (`!board || status !== 'connected'`;
  `fullPath.length === 0 || endTurn < startTurn`; pre-fix, the ruleset gate).
  The fix keys on `reviewQueryId === null` generically, not on "ruleset
  refused" specifically — so it covers all three causes uniformly, including
  the ones that survive after fix 1 removes the ruleset gate (e.g. engine
  disconnecting between click and call). Checked whether any other
  `analyzeRange`/`analyzeFullGame`/`analyzeActiveNode` caller has the same
  "mutate-then-block-wait" shape that could wedge the same way:
  `useFollowMePonder.ts` and `useAnalysisTimeline.ts` both fire-and-forget
  (no `Promise.all` wait, no prior state mutation to undo) — not the same
  bug class, correctly out of scope.
- **Witness quality (ADR-0021)**: the new test in
  `frontend/tests/integration/useReviewSession.test.ts`
  (`fakeAnalysisService.analyzeRange.mockReturnValueOnce(null)`) reproduces
  the actual wedge mechanism — a null return from `analyzeRange` — not a
  symptom (it does not go through an unrecognized-RU board, which is
  correctly noted in the test's own comment as no longer able to produce a
  refusal post-fix-1). It asserts the full recovery contract: state returns
  to `AWAITING_MOVE`, `userMovesCount` reverts to 0, board `currentNodeId`
  reverts to root, stones are empty, `waitForAnalysis` was never called
  (confirms the short-circuit happens before the wedge-causing wait, not
  just that it eventually recovers), and that a subsequent identical click
  succeeds and counts as one move. This is a good-faith reproduction of the
  right mechanism, not a rebadged old test.

## Hack-rationalization pass (skill run, out-of-frame — this reviewer did not
write the diff or its report)

- `grep_tells.py` over the dispatch report and the commit message: no
  minimality-word co-located with a named-and-downgraded better fix in
  either.
- Independent writer enumeration for `userMovesCount`
  (`enumerate_writers.py`): 9 candidate hits, all inside
  `useReviewSession.ts` (types/store defaults aside) — single owner, single
  increment site, matches what the fix assumes. No missed writer.
- The recovery fix is stated as one invariant ("on `reviewQueryId === null`,
  undo the two mutations this same call performed and return to
  `AWAITING_MOVE`"), not a set of per-cause patches — it does not special-
  case "ruleset refusal" vs. "disconnected engine," which is why it still
  covers the wedge after fix 1 removes the ruleset-refusal cause entirely.
  No `UNDISCHARGED-HACK` signal found.

## Scope check

No scope creep found: no component-rules model added, no fifth ruleset name,
no change to `RULESET_NAMES`, no change to KataGo wire-value derivation
beyond the reshape. `FILES.md`/`IDENTIFIERS.md` were not touched — correctly,
since no file was added/moved/deleted and `RulesetResolution` is a value
shape, not a branded identifier.

## Findings beyond verdict

- None load-bearing. Minor: `review.queryRefused`'s copy ("the engine may be
  disconnected") is now the dominant-but-not-only cause of a null
  `analyzeRange` return (the `fullPath.length === 0 || endTurn < startTurn`
  guard is the other, effectively unreachable from this call site given
  `s_0_idx`/`s_1_idx` are always adjacent integers here) — accurate enough,
  not misleading, not a defect.

## Bottom line

Both spec items are implemented as specified, with no leftover old-shape
call sites, no accidental RU write-back on defaulting, a mechanically
verified complete undo (captures/ko/turn parity) in the wedge fix, a
witness that reproduces the actual defect mechanism, and green
build/lint/test gates run directly by this reviewer. ACCEPT.
