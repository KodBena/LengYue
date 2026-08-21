# Fresh-context review — Learn Path walk drives the engine (commission ledger row 881)

Reviewer posture: REFUTE, fresh context — findings formed before reading the
builder's own dispatch report.

Reviewed artifact: branch `worktree-agent-ab88ba79bd9cfd4d8`, feature commit
`1edbd051` (+ report `7a1a4ce9`), merged onto CURRENT `next` (`57b27c5b`) in a
scratch ref (`review-next-scratch`, `git merge --no-edit`, clean auto-merge,
9 files changed / 932 insertions / 23 deletions). Builder's report read only
after independent findings were formed (`.claude/dispatch-reports/learn-path-drives-engine.md`).

## Verdict: ACCEPT-WITH-NITS

## Basis

The delivery satisfies commission row 881's letter and spirit: every visited
position with no recorded analysis is now analyzed on demand through the
existing `analysisService.analyzeActiveNode` one-shot machinery, the walk
awaits the same `waitForAnalysis` primitive `useReviewSession` uses, ranks
`moveInfos` in the unchanged row-706 order, and continues. "Analyzing" is a
distinct, honestly-signalled live state (a `TreeWidget` ring, a modal status
line) driven off a genuinely in-flight query, not wall-clock fakery.
"Frontier" is reserved for a synchronous refusal or a bounded wait-timeout —
never "we never asked." Engine-not-connected is a loud, synchronous,
pre-mutation refusal. No new unratified scope narrowing was found; the one
historical unratified restriction (row 660's "no new engine queries") is the
thing row 881 explicitly repeals, and this delivery repeals it uniformly
(every walk step, not just the spine or just deviations).

Typecheck and the full test suite are clean on the merged result. Two
targeted mutation-falsifications (disabling the on-demand request entirely;
removing the `stopQuery` abort-release) both turned the expected tests red,
confirming the tests exercise the real code paths, not tautologies.

The nits below are non-blocking: they degrade safely (bounded timeout, no
data corruption, no silent success reported as failure) rather than
violating the "not hang, not rank against the wrong key" bar the brief set,
but none of them were caught by the delivery's own tests or report, so they
are recorded as independent findings.

## Findings

### Finding 1 (MEDIUM, non-blocking) — stale `rawKey` capture races a mid-walk config/model change

`explore()` captures `rawKey = activeAnalysisKeys.value.rawKey` **once**,
before the walk starts (`useLearnPath.ts:792`), and reuses that same
variable as the `waitForAnalysis` key for every on-demand query issued
during the whole walk. But `analysisService.analyzeActiveNode` derives its
**own** `rawKey` fresh, from the live `activeAnalysisKeys.value` (or a
config override), at the moment each query fires (`analysis-service.ts`,
~line 1003), and records the resulting packet under *that* key
(`ledger.recordRaw(queryInfo.rawKey, ...)`, ~line 1350).

`RawKey = hash(overrideSettings + model)` (`state/analysis-config.ts`,
`deriveAnalysisKeys` / `compileRawDescriptorFromParts`) — palette-independent
by design, but NOT independent of the KataGo override-settings panel or the
SELECTOR model dropdown, both of which are live-editable while the Learn
Path modal is open (they're not gated by any "walk in progress" lock). If
the user edits either mid-walk, a later on-demand query's response lands
under the NEW `rawKey`, while the walk's `waitForAnalysis` call is still
watching the OLD one it captured at `explore()` start. The wait can never
match, so it silently rides out the full `KATAGO_ANALYSIS_TIMEOUT_MS`
(30s) and converts to a `pendingFrontiers` entry — reported to the user as
"the engine refused analysis (or didn't respond in time)," when in fact the
engine answered successfully, just under a key the walk stopped listening
for.

This satisfies the review brief's literal bar (no hang — bounded by the
30s timeout; no ranking against the wrong key — the mismatch is exactly
why it never resolves) but not fully its spirit: a real, successful engine
answer is silently discarded and mis-reported as a refusal, for a
config-change class of event distinct from "the engine actually said no."
Not mentioned in the builder's own report or covered by any new test (the
new on-demand describe block exercises `ok` / `refused` / `aborted`, never
this race or the plain `timeout` outcome). Recommend either re-deriving
`rawKey` per on-demand query (matching what `analyzeActiveNode` will
actually key its answer under) or documenting this as an accepted,
reasoned limitation the way the module header does for other edge cases —
currently it's neither fixed nor named.

### Finding 2 (LOW, disclosed, non-blocking) — teardown-registry completeness gap

`learn-path-progress.ts`'s `learn-path-progress:remove` /
`learn-path-progress` handlers, and `useLearnPath.ts`'s new
`learn-path:abort-query` / `learn-path:abort-query-all` handlers, are not
listed in `src/store/teardown-registrations.ts`'s manual bootstrap or in
`teardown-registry-completeness.test.ts`'s expected-label arrays — so
`teardown-registry-completeness.test.ts` (the suite whose own header calls
itself "the load-guarantee... deliberately UN-MOCKED... a regression...
fails HERE, loudly") provides **no actual coverage** of these two new
modules' board-close/workspace-reset wiring. Confirmed by running the
completeness suite standalone: it passes trivially because it only
transitively imports `teardown-registrations.ts`, never `useLearnPath.ts`
or `learn-path-progress.ts`.

In production this is currently harmless — both modules load transitively
via `App.vue` → `LearnPathModal.vue` → `useLearnPath.ts` / (`App.vue`
also imports `learn-path-progress.ts` directly for the `analyzingNodeId`
prop), so the module-init `register*Handler` calls do run before any
`closeBoard`/`resetWorkspace` fires in the live app. But this is exactly
the precedent-inherited state the sibling `learn-path-pending-markers.ts`
was already in **before** this change (verified: that file is untouched
by this diff and its own handlers are equally absent from the bootstrap/
completeness lists) — the builder's report discloses this precedent
honestly and declines to fix it as out-of-scope, which this review
agrees is a reasonable scope call for a row-881-scoped dispatch. Recorded
here because the review brief specifically asked to verify this
composition, and the honest answer is: it does not fully compose with the
documented discipline, for pre-existing reasons this delivery inherits
rather than introduces.

### Finding 3 (LOW, non-blocking) — `timeout` outcome untested

`OnDemandAnalysisResult`'s `'timeout'` branch (a real `AnalysisWaitError`
with `reason !== 'aborted'`) is code-identical in its handling to
`'refused'` (both push a `pendingFrontiers` entry), so it's a low-risk
gap, but no test in the new on-demand describe block exercises it — worth
a fake-timers-driven test for completeness, not because the current
behavior looks wrong.

### Non-finding — render-locality (ADR-0010)

`TreeWidget`'s new `analyzingNodeId` prop and ring follow the exact same
shape as the already-accepted `pendingMintIds` prop/ring (a `computed` at
the `App.vue` composition-node level reading a module-scope registry, a
single low-frequency value threaded through the `v-memo` array, no
per-frame or per-packet read). No render-count regression guard was added
specifically for `analyzingNodeId`, but none exists for `pendingMintIds`
either — consistent with existing practice, not a new gap. The existing
`TreeWidget.render-count.test.ts` guards (nav-within-visible-territory ⇒ 0
renders; structure change ⇒ ≥1 render) both pass unmodified on the merged
tree.

## Witnesses

| # | Claim | Status |
|---|---|---|
| 1 | Merge of `worktree-agent-ab88ba79bd9cfd4d8` onto current `next` (`57b27c5b`) is clean | WITNESSED — `git merge --no-edit`, no conflicts, 9 files / 932(+) / 23(-) |
| 2 | `npx vue-tsc --noEmit` on merged result | WITNESSED — exit 0, no output |
| 3 | `npx vitest run --silent` on merged result | WITNESSED — 154 files / 1852 tests passed, 3 files / 4 tests skipped (pre-existing, unrelated), 0 failed |
| 4 | `TreeWidget.render-count.test.ts` guards still pass (nav ⇒ 0 renders; structure ⇒ ≥1) | WITNESSED — both green, verbose run |
| 5 | `teardown-registry-completeness.test.ts` passes | WITNESSED — but see Finding 2: passing is not coverage here |
| 6 | Engine-not-connected refusal happens before any tree mutation / anchor mint | WITNESSED — code read (`explore()`'s connectivity check precedes `resolveAnchor`, the first `await`/mutation site) + test (c) green |
| 7 | Mid-walk disconnect (after a query is already in flight) fails clean, not silently | WITNESSED (by trace, not by a new test) — nothing actively rejects the in-flight wait on disconnect; it rides the 30s `KATAGO_ANALYSIS_TIMEOUT_MS` to a `timeout` outcome → frontier. Matches the module header's own documented claim ("typically a timeout"). No hang; bounded. |
| 8 | Wrong-`RawKey` mid-walk race (config/model change) does not hang and does not rank against the wrong key | WITNESSED (by trace) — see Finding 1: it degrades to a mis-attributed frontier after the full timeout, not a hang, not a wrong-key mint. Not exercised by any test. |
| 9 | Mutation-falsify: disabling the on-demand request | WITNESSED — 3 of 5 new tests went red as expected ((a), (b), (d)) |
| 10 | Mutation-falsify: removing the abort-release (`stopQuery` in `finally`) | WITNESSED — 2 of 5 new tests went red as expected ((a), (d)) |
| 11 | `fakeAnalysisService.analyzeActiveNode`'s widened return type / new default `mockReturnValue` doesn't weaken other consumers | WITNESSED — `useFollowMePonder.test.ts` and `useUserIORegistry.test.ts` (the only other fake consumers) assert call-shape only, never the return value; full-suite pass (Witness 3) covers both files green |
| 12 | Fresh-context, no findings pre-loaded, report read only after independent findings formed | WITNESSED (self-report of process — see this document's own read order) |

## Scope-restrictions list and ratification status

- **On-demand analysis applies uniformly to every walk step** (spine and
  deviations alike), not narrowed to one class of node — RATIFIED (this
  is the commission's own requirement; verified by code read: the
  ledger-miss branch sits at the top of `walk()`, unconditioned on role).
- **One in-flight on-demand query at a time (strict sequential pacing)** —
  an engineering choice, not a scope reduction; rejected alternatives
  (sibling-batch prefetch, decoupled analysis queue) are named in the
  module header per durable-843 / ADR-0013. Does not need separate
  ratification — it doesn't narrow anything the commission promised
  (live sequential growth was itself part of the ask).
- **Visit count = `store.profile.settings.minting.defaultVisits`, not the
  review-session per-card override** — a finding, not a narrowing: the
  override machinery is keyed to an existing card and has nothing to
  apply to at an as-yet-unminted position. Documented and test-verified.
- **Timeout = `KATAGO_ANALYSIS_TIMEOUT_MS` (30s), the existing shared
  constant** — reused, not newly narrowed.
- **No de-scopes found beyond the one row 881 itself repeals** (row 660's
  "no new engine queries" restriction) — that repeal is executed
  correctly and completely.

No unratified scope reduction was found in this review. Findings 1–3 above
are correctness/coverage/discipline gaps, not scope narrowings.

License: Public Domain (The Unlicense)
