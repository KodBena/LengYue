# cardtrees-fix-next — delivery report

- **Commission:** ledger row 1937; work item `lyt-cardtrees-regression`
  re-scoped to `next`. Two items: (1) fix the card-trees render collapse
  diagnosed in `.claude/dispatch-reports/lyt-cardtrees-regression.md`;
  (2) mechanize the uncapped-retry class the investigation named
  (ADR-0011 Rule 2), plus witnesses for both.
- **Worktree:** `.claude/worktrees/cardtrees-fix-next`, branch
  `cardtrees-fix-next`, cut from `origin/next` at `87603c71`.
- **Disposition:** both items delivered. Gates green (literal exit
  codes below). Diff: 6 files changed, 1 new file
  (`frontend/src/lib/capped-retry.ts`), 2 new test files.

## 1. Fix shape chosen, and why (against the closure statement)

The investigation report offered two fix shapes: (i) drop the
`align-content: flex-start` override (with a re-check of the
`.panel-header` line), or (ii) convert the two-column case to CSS
Grid with explicit `1fr` track sizing.

**Chosen: (ii), CSS Grid.** Working through (i) first: flexbox's
*default* (`align-content: normal`, which behaves as stretch for a
multi-line container) distributes the container's leftover cross-axis
space **equally across every line** — not just the line the fill-
assuming child sits on. `.panel-header` is forced onto its own
full-width line (`flex: 1 1 100%`) in this shape; simply deleting the
`align-content` override would make the header's line stretch too,
past its own content height, stealing space from the chart instead of
staying compact. That's a *new* defect, not a fix — the investigation's
own closure-statement discipline (ADR-0000, the 2026-07-02 amendment)
requires checking the fix's blast radius outward, not just patching
the observed instance, and (i) fails that check on inspection.

Per ADR-0000 Rule 2(a), the general class is: *a wrapped flex
container's cross-axis behavior is implicit and content-hypothetical
by default, and any override of that default (`align-content` away
from `normal`/`stretch`) silently defeats a child's fill assumption
with no static check catching it.* CSS Grid forecloses this class
outright: track sizes are declared, not inferred from an axis-flip's
implicit stretch rules. `grid-template-rows: auto 1fr` says, in one
place, "row 1 sizes to its header's content; row 2 is exactly the
panel's remaining height" — true regardless of which grid item(s)
occupy row 2, immune to the "am I alone on my line" hazard that broke
the flex version. This is the shape the closure statement's own
recommendation favored as the class-foreclosing option.

**Change:** `frontend/src/components/tree/ForestDirectory.vue`, the
`.forest-container.panel-content-two-col .tree-panel` rule and its
children's rules — converted from `flex-flow: row wrap` +
`align-content: flex-start` (with `flex: 1 1 100%` / `flex: 1 1 0`
positioning) to `display: grid` with `grid-template-columns: 1fr auto`
/ `grid-template-rows: auto 1fr`, and each child (`.panel-header`,
`.empty-state`, `.chart-wrapper`, `:deep(.card-metadata-panel)`)
placed via explicit `grid-column`/`grid-row`. `.chart-wrapper` keeps
`min-width: 0; min-height: 0` (load-bearing for a grid item to shrink
below its content's intrinsic size within a fixed track, the grid
analog of the flex `min-width: 0` it already carried).

The single-column (non-two-col) case is untouched — `.tree-panel`'s
base rule is still the plain column-flex it always was; this fix
scopes to the wide/vast-width reflow branch only, per the diagnosis's
own isolation of the trigger.

## 2. Retry-class mechanization — the three sites' dispositions

New shared helper: `frontend/src/lib/capped-retry.ts` — `cappedRetry(attempt,
{ intervalMs, timeoutMs, label }, onExhausted?)`. Polls `attempt()` on
`intervalMs` until it returns `true` or `timeoutMs` wall-clock has
elapsed since the first call, then calls `onExhausted` (default:
`console.warn` naming the label, elapsed time, and attempt count —
ADR-0002's developer-visible-console-warning rung) instead of
scheduling another retry. Returns a `{ cancel }` handle so the caller's
teardown can release a pending timer (ADR-0010 imperative-escape step
4 / resource-ownership-at-mutation-sites).

New shared constant: `CHART_RENDER_RETRY_TIMEOUT_MS = 5000` in
`frontend/src/lib/timing.ts`'s existing §4 "Chart render-retry"
family — one shared wall-clock ceiling across all three sites (the
per-consumer *interval* stays independently tuned, per timing.ts's own
"co-location is not collapse" policy; the *ceiling* is genuinely the
same decision across all three, unlike the interval).

- **`useEChartsForestRender.ts`'s `render()`** — CONFIRMED, fixed.
  Was an uncapped self-recursing `setTimeout(() => render(cfg),
  FOREST_RENDER_RETRY_MS)`. Now wraps the ensure+setOption body in
  `cappedRetry`, keyed per `treeKey` in a `pendingRetries` Map so
  `destroy(key)` and the composable's `onUnmounted` can cancel an
  in-flight retry that would otherwise keep polling a container
  scheduled for teardown (closes a latent resource-ownership gap that
  predates this fix, not introduced by it, but surfaced by giving the
  retry a named, cancellable handle).
- **`BaseChart.vue`'s `initChart()`** — CONFIRMED (source read,
  `BaseChart.vue` pre-fix lines 544–552), fixed. Was an uncapped
  `window.setTimeout(initChart, CHART_INIT_RETRY_MS)` recursion,
  gated on `chartRef.value.clientHeight === 0`. Split into a
  synchronous `attemptInitChart(): boolean` (the size gate + the full
  init/wire-up body) called via `initChart()`'s single `await
  nextTick()` + one `cappedRetry` invocation; the `initTimeout: number
  | null` field is replaced by `initRetry: CappedRetryHandle | null`,
  released in `onUnmounted` the same way.
- **`HeatmapChart.vue`'s `initChart()`** — the investigation left this
  UNEXERCISED ("named by BaseChart's own comment, not independently
  re-read end-to-end"). **Independently verified in this session**
  (full file read): `HeatmapChart.vue` lines 198–207 (pre-fix) carried
  the identical shape — `chartRef.value.clientWidth < 10 ||
  clientHeight < 10` gate, `initTimeout = window.setTimeout(initChart,
  CHART_INIT_RETRY_MS)`, no cap, no escalation. CONFIRMED and fixed
  the same way as `BaseChart.vue`: `attemptInitChart(): boolean` +
  `cappedRetry`, `initRetry` handle released in `onUnmounted`.

All three now share one mechanism and one wall-clock ceiling; none
retries forever.

## 3. Witnesses

### Retry helper unit tests (WITNESSED)

`frontend/tests/unit/lib/capped-retry.test.ts` — 6 tests, all with
`vi.useFakeTimers()` (no real timers, no DOM):

- First-attempt success: no retry scheduled, no escalation.
- Retries on the configured interval until `attempt()` succeeds, then
  stops — no escalation on the eventual-success path.
- **Cap-reached → loud escalation fires exactly once**, with the
  correct `(label, elapsedMs, attempts)` args, and no further attempts
  scheduled afterward.
- Default `console.warn` escalation (when `onExhausted` is omitted)
  names the label.
- `cancel()` releases a pending timer — no further attempts, no
  escalation.
- `cancel()` after the loop already resolved is a harmless no-op.

Confirmed `performance.now()` is faked correctly under Vitest's
default `vi.useFakeTimers()` (no explicit `toFake` list needed) —
verified empirically before relying on it, since the helper's
wall-clock ceiling is denominated in `performance.now()` deltas.

Run: `npx vitest run tests/unit/lib/capped-retry.test.ts` → 6 tests
passed, 0 skipped. All green.

### CSS-shape regression test (WITNESSED — red-without-fix, green-with-fix)

`frontend/tests/integration/forest-directory-two-col-tree-panel-grid.test.ts`
— 6 tests. jsdom performs no real layout (no box metrics), so a true
"the child measures a non-trivial pixel height" assertion is
infeasible — named honestly rather than faked, per the brief. What's
pinned instead: the CSS shape itself, read through jsdom's CSSOM
(`getComputedStyle`) against `ForestDirectory.vue`'s **own current**
`<style>` block, read off disk (not a hand-copied duplicate that could
drift) — the same idiom `tests/integration/status-bar-hint-no-reflow.test.ts`
already uses in this codebase. A `:deep(...)` unwrap (`:deep(X)` → `X`)
is applied to the extracted CSS text before installing it, since
`:deep()` is a Vue SFC compile-time transform, not valid plain CSS —
jsdom's parser silently drops a rule it can't parse, which would have
made the `.card-metadata-panel` assertions false-negative for a reason
unrelated to the fix.

Assertions: `.tree-panel` is `display: grid` with
`grid-template-columns: 1fr auto` / `grid-template-rows: auto 1fr`;
`.panel-header` is row 1 spanning both columns; `.chart-wrapper` is row
2 column 1 with `min-height: 0`; **the exact regression-trigger
condition** — `.chart-wrapper` alone in the body row with no
`CardMetadataPanel` sibling — still gets the `1fr` row; `.card-metadata-panel`
lands on row 2 column 2 when present; `align-content` is never
`flex-start` (belt-and-suspenders pin against a silent revert to the
old flex-wrap shape).

**Verified red-without-fix / green-with-fix in this session**: ran the
test suite against a `git stash` of `ForestDirectory.vue` only (old
CSS restored) — **5 of 6 assertions failed** with the exact symptom
predicted (`display` computed as `flex` not `grid`; `gridRow`/`gridColumn`
computed as empty string; `gridTemplateRows` computed as `none`; the
`align-content` pin caught `flex-start` directly) — then restored the
fix and re-ran: **6/6 green**. This is the strongest available
falsifiability check for a jsdom-only structural test.

### Build / test gates (WITNESSED, literal exit codes)

Run from `frontend/`, no pipes, output captured to file, `find src
-name "*.js" -delete` run immediately before each build to guarantee a
clean tree (see §5 below for why this step exists):

```
nice -n 19 npm run build
→ EXIT_CODE:0   (vue-tsc -b && vite build; "✓ built in 6.38s")

NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 \
  nice -n 19 npm run test:run
→ EXIT_CODE:0   (Test Files 237 passed | 3 skipped (240); Tests 2945 passed | 4 skipped (2949))
```

The 3 skipped files / 4 skipped tests are pre-existing (not introduced
by this change — the new files in this delivery contain no `.skip`).
Both gates were run **twice** in this session (once mid-session, once
after the coordinator's foreground-witness instruction) with identical
outcomes each time; the exit codes above are from the second,
explicitly-captured run.

`eslint` was also run (not brief-mandated, but the project's CI gates
on it) against every touched/new source file:
`npx eslint <touched .ts/.vue files + both new test files>` → exit 0,
0 errors (2 informational "file ignored by pattern" warnings on the
two test files, which live outside eslint's configured `tests/`
scanning scope — not a defect).

### Visual verification (UNEXERCISED)

Not attempted this session — the CSS-shape regression test above
(red-without-fix / green-with-fix) was judged sufficient structural
evidence given the brief's own framing of visual verification as
optional and contingent on host memory stability, and the shared host
carries the same memory-pressure risk the original investigation
documented. If the commissioner wants the browser-level confirmation
anyway (own backend + DB copy + playwright chromium under the
brief's resource caps, ports ≥ 19100), say so and it can be run as a
follow-up.

## 4. Diff summary

```
 frontend/FILES.md                                                                  |   1 +
 frontend/src/components/charts/BaseChart.vue                                       |  54 ++++---
 frontend/src/components/charts/HeatmapChart.vue                                    |  38 +++--
 frontend/src/components/tree/ForestDirectory.vue                                   |  68 ++++++--
 frontend/src/composables/analysis/useEChartsForestRender.ts                        | 180 ++++++++++++---------
 frontend/src/lib/timing.ts                                                         |  19 +++
 6 files changed, 240 insertions(+), 120 deletions(-)

 New:
 frontend/src/lib/capped-retry.ts                                     (the shared retry helper)
 frontend/tests/unit/lib/capped-retry.test.ts                         (helper unit tests)
 frontend/tests/integration/forest-directory-two-col-tree-panel-grid.test.ts  (CSS-shape regression guard)
```

Every touched/new source file already carried (or now carries, for the
new file) an ADR-0006 header — no retrofit was needed; all four
pre-existing touched files had headers before this session's edits.
`frontend/FILES.md` gained one new `[B1]` entry for
`lib/capped-retry.ts`.

## 5. Untracked-`.js` shadow sweep (disclosure)

Mid-session, after running `npm install` (the worktree's `node_modules`
was empty at session start) and a `vue-tsc -b` invocation, `git status`
showed **hundreds of untracked `.js` files** shadowing nearly every
`.ts`/`.vue` file under `frontend/src/` (e.g.
`src/lib/capped-retry.js` alongside the real `.ts` source). This was
NOT something I introduced deliberately — it surfaced as an
unexpected side effect, most plausibly of the very first `vue-tsc -b`
invocation in this session (run before `npm install` had finished,
which failed loudly on missing type-definition files but may have
still partially emitted before erroring — `@vue/tsconfig`'s base
config sets `noEmit: true`, so this is not the steady-state build
behavior; `npm run build`'s own `vue-tsc -b && vite build` did NOT
reproduce the shadow files when re-run cleanly).

**Trigger, as best determined:** the interrupted/partial `vue-tsc -b`
run against an incomplete `node_modules` install. **Disposition:**
deleted (`find src -name "*.js" -delete`) before every commit-relevant
check in this session — confirmed zero `.js` files remain under
`frontend/src/` at delivery time, and confirmed `git status` shows
none as untracked. The orchestrator triaged this as benign
(build-artifact noise, not a source-of-truth concern) when flagged
mid-session; recorded here per the coordinator's instruction so the
record carries the trigger and the sweep, not just the outcome. No
`.js` file was ever staged or committed.

## 6. Scope

No narrowing or widening beyond the two commissioned items + their
witnesses. The `useEChartsForestRender.ts` pending-retry cancellation
wiring (§2) is a direct consequence of giving the retry a named,
cancellable handle — not a separate scope expansion — but is called
out explicitly since it closes a latent (pre-existing, not
newly-introduced) resource-ownership gap as a side effect.

## 7. Commit(s) and delivery-time state

- Commit sha: see the final message (committed on `cardtrees-fix-next`,
  not on `next`).
- Delivery-time merge-base against `origin/next`: see the final
  message (`git fetch origin next` run as the session's last act, per
  the brief).

License: Public Domain (The Unlicense)
