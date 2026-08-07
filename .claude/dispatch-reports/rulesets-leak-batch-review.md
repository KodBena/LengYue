# Fresh-context batch review — rulesets + BaseChart timer leak

Reviewer: fresh-context, independent of both builds. Read ADR-0021 and
`frontend/CLAUDE.md` in full before reviewing.

## TARGET 1 — ruleset selection (branch `worktree-agent-ae9e1b0d0e686b564`, 921bae4b → advanced to b4fbeb1f mid-review)

**Verdict: ACCEPT**

### Addendum commit b4fbeb1f (commissioner decree, ledger row 213)

WITNESSED — `createInitialBoard` (`frontend/src/store/board-factory.ts:57`)
now literally authors `RU: ['Tromp-Taylor']` into root `properties`
alongside the pre-existing `SZ`/`GM`/`FF` literal; comment names the
decree and states plainly it authors a record rather than coercing
input. Confirmed nothing else in the diff: `git diff 921bae4b..b4fbeb1f`
touches only `board-factory.ts` (the mint site, +1 canonical-spelling
key) and two test files. New tests are the correct inverse of the
existing unknown-refusal tests, not a rewrite of them:
`util.test.ts` asserts `getRulesetResolution(createInitialBoard())` is
`{kind:'resolved', name:'Tromp-Taylor'}`; the integration test asserts
`analyzeActiveNode` on a fresh (non-SGF) board now actually sends a
query (`queryId` non-null, one query on the wire, `rules: 'tromp-taylor'`)
— the affirmative case the fail-loud gate previously left fresh boards
unable to clear. SGF-loaded unknown-`RU` behavior is untouched (the
pre-existing unknown-refusal tests still pass unmodified). Re-ran all
gates on the new head myself: build clean, eslint clean,
`npm run test:run` — 83 files / 1142 passed (2 new), 0 failed, 4 skipped.

1. **Licensing** — WITNESSED. `src/engine/rulesets.ts` alias table
   (`aga`/`chinese`/`japanese`/`tromptaylor`, folded key) and all comments
   contain no prose lifted from `lightvector.github.io/KataGo/rules.html`
   (fetched the page directly to check: it discusses area/territory
   scoring semantics, "Chinese-like"/"Japanese-like" framing, etc. — none
   of that language appears in the diff). Wire spellings are the
   lowercase of the four display names, explicitly documented as derived
   from the pre-existing `'tromp-taylor'` literal, not the KataGo docs.
   URL is cited, not quoted. Clean.
2. **Totality/case-handling** — WITNESSED (unit tests run, 122 tests
   green). Fold strips whitespace/hyphens then lowercases, so `"Tromp
   Taylor"`, `"TROMPTAYLOR"`, `"tromp-taylor"` all resolve; `"chinese
   rules v2"`, `"aga2"`, `"New Zealand"`, `""`, `undefined` all fall to
   `'unknown'`. Boundary is defensible: alias table is exact recognized
   spellings only, no fuzzy/prefix matching, consistent with "no silent
   coercion."
3. **Unknown-blocks-query** — WITNESSED. Both `analyzeRange` and
   `analyzeActiveNode` gate on `getRulesetResolution` before any other
   side effect (including the visit-target write) and `return null` on
   `'unknown'` — traced both call sites, no half-built query escapes.
   Integration test confirms `ws.sent` has zero analysis queries and a
   `pushSystemMessage('error', ...)` fires with the raw value
   interpolated (`analysis.rulesetUnrecognized`), which is
   user-actionable text ("choose a ruleset in the status bar").
4. **Fixture edits** — WITNESSED, legitimate. Both edited fixtures
   (`error-packet-narrowing`, `restart-thunk`) just added `RU[Chinese]`
   to an otherwise-unrelated SGF so the new fail-loud gate doesn't block
   them; each edit carries an inline comment naming why. Not masking a
   behavior change — those suites still pass and their own subject
   (packet narrowing / restart-thunk reap) is untouched.
5. **StatusBar wiring** — WITNESSED, parallels komi exactly:
   `update-rules` emit → `App.vue: handleUpdateRules` → root `RU` write,
   same shape as `update-komi`/`handleUpdateKomi`. Dropdown sources
   `getRulesetResolution(props.board)` directly, not `metadata.rules`
   (correctly avoids `useMetadata`'s silently-defaulting passthrough).
6. **Gates** — WITNESSED, ran myself in the worktree: `npm run build`
   clean, `eslint .` clean, `npm run test:run` — 83 files / 1140 passed,
   0 failed, 4 skipped (pre-existing skips, unrelated).
7. **Compose vs current `next`** — WITNESSED (attempted
   `git merge --no-commit --no-ff next`): conflicts in `StatusBar.vue`
   and `analysis-service.ts` against the UI#1 leaf-merge series that
   landed on `next` since this branch's base — both textual (adjacent
   edits to files both branches touched), not semantic; resolvable on
   merge, flagged for the mechanic doing the merge, not a review defect.

Nit only: the fresh-board-blocks-analysis consequence (any board lacking
a resolvable `RU`, including freshly-created ones with no `RU` at all,
can never be analyzed until the user picks a ruleset) is the
commissioner's own ruling being carried out faithfully, not a builder
defect — noted per the dispatch instruction, not scored against the
build.

## TARGET 2 — BaseChart init-retry timer leak (branch `worktree-agent-a3ece8ce4cc06c138`, 3df8b233)

**Verdict: ACCEPT**

- **Diff minimal** — WITNESSED: 15 lines in `BaseChart.vue` (capture
  `initTimeout`, clear in `onUnmounted`), same shape as `HeatmapChart`'s
  existing `initTimeout`/`clearTimeout` pair.
- **markerTimer/dataThrottle/ResizeObserver already handled** —
  WITNESSED by reading `BaseChart.vue` in full: `onUnmounted` already
  cleared `markerTimer`, called `dataThrottle.cancel()`, and disconnected
  `resizeObserver` before this change; the only gap was the uncaptured
  retry timer. Builder's claim confirmed, not just repeated.
- **Tripwire red-for-the-right-reason** — WITNESSED directly: reverted
  `BaseChart.vue` to the pre-fix (parent-commit) body, kept the new test,
  and ran it — failed with `setTimeout` called once post-unmount with
  args `[initChart, 100]`, i.e. the spy fired because the retry itself
  re-armed after unmount, not an unrelated crash. Restored the fix,
  re-ran — green. Both polarities directly observed by me, not taken on
  the builder's word.
- **Resource-ownership comment convention** — followed: the declaration
  site names the resource and failure mode (per-mutation-site
  discipline), the `onUnmounted` line names the same plus the
  `HeatmapChart.vue` precedent it mirrors.
- **Gates** — WITNESSED, ran myself: build clean, `eslint .` clean,
  `npm run test:run` — 82 files / 1102 passed, 0 failed, 4 skipped.
- **Compose vs `next`** — WITNESSED: `git merge --no-commit --no-ff next`
  merged cleanly, no conflicts.

## Merge order

**Target 2 first** (BaseChart), then **Target 1** (rulesets, merge at
b4fbeb1f — the addendum commit is on the same branch, so target 1 is
merged as a single unit, no need to stage the addendum separately) —
target 2 merges cleanly into `next`; target 1's conflicts are against
files (`StatusBar.vue`, `analysis-service.ts`) target 2 doesn't touch
(`board-factory.ts` from the addendum merges clean, confirmed by
re-running the same `git merge --no-commit --no-ff next` check at
b4fbeb1f), so merging target 2 first doesn't add conflict surface, and
resolving target 1's known conflicts against the already-updated `next`
(post-UI#1 leaf merge) is a single, isolated step.
