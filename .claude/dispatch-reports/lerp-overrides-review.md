# Fresh-context review — visits LERP + per-query overrides

Branch `bork/feat/lerp-visit-counts` @ `eb45fcf8`, worktree
`/home/bork/w/omega/.claude/worktrees/lerp-visit-counts`. Base `next`
was re-checked at current head `a9808651` (post resizer + nav-algebra
merges); a trial merge was run against that head (see "Trial merge"
below).

## Provenance check (ledger)

`./autoharn led show 510` / `511` / `503` / `504` read directly, not
taken on the builder's word. Row 510 (commission) and 511
(work_opened) are commissioner-sourced, verbatim-transcribed, and
name feature 2 explicitly ("wanted-feature 2 assigned to the LERP
builder: a JSON interface of per-query options appended to EVERY
analysis query"). Rows 503/504 do the same for feature 1. **Both
features are genuinely commissioned** — the builder's "charter
extension, please confirm" flag is resolved: confirmed, not a
hallucinated or self-assigned scope expansion.

## Findings

**1. Seam singularity — Feature 1 (WITNESSED).** Grepped every
`analyzeRange`/`analyzeActiveNode` call site in `src/`
(`useReviewSession.ts`, `useAnalysisTimeline.ts`,
`useFollowMePonder.ts`, `keybindings-catalog.ts`, the `perf/` harness
files). Only `useReviewSession.ts::processUserMove` feeds a **card's
specific** visit count (`effectiveVisits` = sticky override ??
`card.defaultVisits` ?? fallback) into a query. `useAnalysisTimeline`'s
`analyzeSelection(visits)` is fed by a local `ref(200)` UI input in
`AnalysisTimelinePanel.vue`, not a card's count. `useFollowMePonder`
and the keybinding both call `analyzeActiveNode(id, 'ponder')`, which
uses `ponderMaxVisits`, a structurally different budget. The perf
harness (`composables/perf/*`) uses its own `DEFAULT_VISITS`/config
values, not card counts, and is a benchmarking tool, not a user path.
One seam, confirmed by exhaustive grep, not by trusting the report's
claim.

**2. Seam singularity — Feature 2 (WITNESSED).** `finalizeAnalysisRouting`
in `query-routing.ts` is a hard compile-time+lint choke point: its
return type `RoutedAnalysisQuery` is a brand mintable *only* inside
that function (lint-fenced `no-restricted-syntax` on the cast
elsewhere), and `KataGoClient.subscribe<Q extends RoutedAnalysisQuery |
KataGoActionQuery>` accepts analysis traffic only in that branded
shape. Grepped all four call sites the report names
(`analysis-service.ts` ×2, `useKomiCalibration.ts`,
`usePlayFromPosition.ts`) — each imports and calls
`finalizeAnalysisRouting`; none constructs a `RoutedAnalysisQuery` any
other way. The merge (`mergeQueryOverrides`) is folded inside that one
function, so genuinely every outgoing analysis query passes through
it. This is a stronger guarantee than "the builder remembered to call
it in four places" — a fifth builder that skipped the seam would fail
to *compile*, not just fail to apply overrides.

**3. Ephemerality (WITNESSED).** Both `src/state/visits-lerp.ts` and
`src/state/per-query-overrides.ts` are plain module-scope `ref`/
`reactive` — no `GlobalStore` field, confirmed by `git diff
next...HEAD -- src/store/` returning empty (no migration, no schema
touch). Neither module is referenced from `SyncService`, the
workspace-document serializer, or `RegistryEditor`'s persisted
registry (grepped; no hits). Both ship a `vi.resetModules()`-based
test proving a fresh module instance starts at the identity value
regardless of prior mutation — the correct way to test "no persistence
channel" without a browser.

**4. ADR-0002 (never half-apply) (WITNESSED).** `parsePerQueryOverrides`
rejects malformed JSON and non-object JSON (array/string/number/null)
with a structured error; `setPerQueryOverridesText` only writes
`_state.applied` on the `ok` branch — on `error` it updates `text`
(so keystrokes aren't lost) but leaves `applied` untouched. Traced this
by hand, not just read the docstring's claim: there is no code path
where `applied` is written from an invalid parse result. The
stale-apply hazard (an invalid edit silently reverting or corrupting
a previously-good override) does not exist — `applied` is written
exactly once, on the `ok` branch, full stop.

**5. Precedence and merge semantics (WITNESSED).** `mergeQueryOverrides`
is a shallow merge: `{ ...query, overrideSettings: { ...(query.overrideSettings
?? {}), ...overrides } }`. User JSON wins on key collision (spread
order). The decision and the rejected alternative (root-level merge)
are documented in the module docstring with reasoning, not just
asserted. The PDA acceptance test
(`tests/unit/engine/katago/query-routing.test.ts:83-86`) asserts
against `finalizeAnalysisRouting`'s **return value** — the actual
`RoutedAnalysisQuery` that reaches `KataGoClient.subscribe` — not an
intermediate merged object a test constructs itself. Not tautological.

**6. Identity locks (WITNESSED, re-run).** `lerpVisits(x, DEFAULT)`
tested byte-identical for representative `x`. At the integration
layer, `tests/integration/useReviewSession.test.ts` asserts
`fakeAnalysisService.analyzeRange.mock.calls[0]?.[4]` — the actual
argument position the fake spy recorded — equals `1000` (=
`defaultVisits`, no transform) at defaults, `2100` for `a=2,b=100`,
`1` for the negative-b floor, and `600` for LERP-on-top-of-a-sticky-
override (`3 * 200`). These are assertions against a spy's recorded
call args, not internal echoes of the same computation — genuine
regression coverage, not tautology. Similarly `mergeQueryOverrides`'s
empty-overrides no-op returns the **same object reference** (`toBe(query)`,
not `toEqual`), matching the report's "byte-identical" claim.

**7. Display/edit non-interference (WITNESSED, not just report-trusted).**
`ReviewSessionPanel.vue:246` binds `:value="reviewSession.effectiveVisits.value"`
— the raw, un-LERP'd value — confirming the report's claim that the
transform applies only at the query-construction seam, not at the
computed the panel displays/edits. No double-apply-on-re-edit hazard.

**8. UI idiom (WITNESSED).** `VisitsLerpConfig.vue` follows the
`.field` label+numeric-input shape used elsewhere on the Other tab
(matches `CardMetadataPanel.vue`'s idiom) with a disabled-at-default
Reset button. `PerQueryOverridesConfig.vue`'s textarea follows
`RegistryEditor.vue`'s freeform-expression-input class
(`expression-input`). Both add only `en.json` keys (other locale
catalogs untouched, correctly deferred to translators). No novel
widget introduced (ADR-0019).

**9. Standing checks (WITNESSED).** `git diff next...HEAD | grep -i
waitForTimeout|sleep(|chromium|puppeteer` — no hits. The two `as`
casts (`PerQueryOverridesConfig.vue`'s DOM `e.target as
HTMLTextAreaElement`, `per-query-overrides.ts`'s post-guard `parsed as
PerQueryOverridesObject`) both carry adjacent justification comments
naming why the cast is sound (standard DOM-event narrowing; a
non-null/non-array `object` guard already ran).

**10. Gates, this worktree (WITNESSED, re-run, not taken from the
builder's report):**
- `npm run build` (`vue-tsc -b && vite build`) — green.
- `npx eslint .` — clean, zero output.
- `npm run test:run` — **1388 passed, 4 skipped, 110 files passed / 3
  skipped**, matching the builder's reported numbers exactly.

**11. Trial merge against current `next` (WITNESSED).** `next` has
advanced past the branch's original base (resizer + nav-algebra
merges landed; head is now `a9808651`). Ran the trial merge **twice**
independently in scratch worktrees (`git worktree add ... next`, `git
merge --no-commit --no-ff bork/feat/lerp-visit-counts`) — first run's
worktree was unexpectedly wiped mid-session by something outside this
review's control (its files vanished between commands; environment
has many concurrent agent worktrees under `.claude/worktrees/`, cause
undetermined but not this branch's fault), so the merge was repeated
from scratch in a second worktree to get a clean, uninterrupted
result. Both runs: **automatic merge succeeded, zero conflicts** —
`frontend/FILES.md`, `frontend/src/App.vue`, `frontend/src/locales/en.json`
all auto-merged cleanly despite being the predicted collision zone
(App.vue's Settings/Other tab was touched by the resizer merge too).
In the second run: `npm install` + `npm run test:run` in the merged
tree — **1479 passed, 4 skipped, 113 files passed / 3 skipped** (the
larger count reflects tests added by the resizer/nav-algebra merges
already in `next`, on top of this branch's own tests — consistent
with a clean union, not a silent drop). Merge worktree and scratch
branch were deleted after verification; nothing pushed.

## Verdict: ACCEPT

No findings rise to REJECT or even a nit. Both seams are genuinely
singular (Feature 2's is compile-enforced, stronger than "the builder
remembered"), ephemerality is real (no persistence channel touched,
proven not just asserted), ADR-0002 is honored with a traced
never-half-apply invariant, the merge precedence is documented with a
real rejected-alternative discussion, the identity/regression locks
assert against actual spy call arguments and object references (not
tautologies), the UI follows existing idiom, and all gates — build,
lint, full suite, and a trial merge against the current `next` head —
are green, independently re-run rather than taken from the builder's
self-report. The "charter extension" provenance concern the builder
flagged is resolved: ledger rows 510/511 confirm it was genuinely
commissioned.

Compose as-is; no changes requested.
