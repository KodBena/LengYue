# NN-cache-context build report

Builder session, frontend/ only, branch `lyt-phase2`. Base verified:
worktree started at commit `829e952c` (matches the brief's stated
base — local `lyt-phase2` branch tip; `origin/lyt-phase2` is one
unrelated commit ahead, not used).

## What was built

### New files

- `frontend/src/engine/katago/cache-context.ts` [B3] — `EngineCacheContext`
  brand + `translateEngineCacheContext(rawContext, username)`: the
  sole translate-and-validate site composing `<username>.<context>`
  and checking it against KataGo's grammar (ASCII letters/digits/
  `.`/`_`/`-`, 1–128 chars, not `.`/`..`). Refuses, never rewrites.
- `frontend/src/state/nncache-context.ts` [B1] — session-ephemeral
  reactive slot (`activeAttachedContext`) for the currently attached
  wire context. Sole writer: `nncache-session.ts`. Exists as its own
  `state/` leaf specifically to let `query-routing.ts` read it
  without an import cycle back through `analysis-service.ts` (see the
  file's own header for the cycle diagram).
- `frontend/src/services/nncache-session.ts` [B3] — the lifecycle
  driver: `enable`/`disable`/`transition`/`endSession`, quiescing the
  SPA's own tracked queries (`analysisService.stopAllBoardAnalyses()`)
  before every session-boundary wire action, no automatic retry on
  refusal. Registers a best-effort disconnect hook (dump+detach) with
  `analysisService`'s new `registerDisconnectHook` port.
- `frontend/src/composables/chrome/useNncacheControl.ts` [B1] — thin
  wrapper the component layer uses to reach the driver (components
  are deny-by-default on `src/services/**`).
- `frontend/src/components/chrome/EngineNncacheControl.vue` [B1] —
  checkbox + text field, mounted beside `EngineModelSelect.vue` in
  `ToolbarEngineMetrics.vue`'s eval popover.
- `frontend/tests/unit/engine/katago/cache-context.test.ts` — grammar
  ACL unit tests (12 cases: legal/illegal chars, length boundary at
  exactly 128, no-username, empty, whitespace-only, unicode,
  path-traversal-shaped input, never-rewrites).
- `frontend/tests/integration/nncache-session.test.ts` — driver
  lifecycle tests against the fake `analysisService` (14 cases):
  quiesce-before-attach ordering, bare-attach wire shape, attach
  success/refusal + revert, disable discard semantics, transition's
  three-call dump→detach→attach ordering and mid-sequence refusal
  handling, endSession's dump→detach-without-discard, no-op cases.

### Edited files

- `frontend/src/engine/katago/types.ts` — `cacheContext?: EngineCacheContext`
  on `KataGoAnalysisQuery`; four new `KataGoActionQuery` variants
  (`cache_attach`/`cache_detach`/`cache_dump`/`cache_stats`) with
  `CacheLevel0Admission`/`CacheDumpAdmission`/`CacheDumpWhat`; the
  matching response fields on `KataActionResponse` (typed to what the
  driver actually reads, per this file's existing "type what the SPA
  consumes" discipline).
- `frontend/src/engine/katago/query-routing.ts` — `UnroutedAnalysisQuery`
  now fences `cacheContext` alongside `model`; `finalizeAnalysisRouting`
  auto-stamps `cacheContext` from `state/nncache-context.ts` on every
  routed query, same choke-point idiom as the per-query-overrides
  merge already there. **No signature change** — every existing call
  site (`analysis-service.ts`'s four builders) is unaffected.
- `frontend/src/state/analysis-config.ts` — comment-only addition at
  `deriveAnalysisKeys` explaining the deliberate `cacheContext`
  exclusion from the ledger keys (attribution, not content).
- `frontend/src/services/analysis-service.ts` — `sendActionCommand`
  (thin pass-through to the private `KataGoClient`), `hasActiveQueries`,
  `registerDisconnectHook` + hook-firing in `disconnect()`. All
  additive; no existing method's behaviour changed.
- `frontend/src/composables/review/useReviewSession.ts` — `loadCard`
  calls `transition('card-<id>')` unconditionally on every card
  advance (force re-enable, per the ratified spec); `endSession` calls
  `endSession()` (dump+detach, not discard).
- `frontend/src/components/chrome/ToolbarEngineMetrics.vue` — mounts
  `EngineNncacheControl` as a sibling row to `EngineModelSelect` in
  the eval popover.
- `frontend/src/locales/en.json` — new `toolbar.nncache.*` /
  `nncache.*` keys. **Disclosed scope**: added to `en.json` only, not
  `zh-CN`/`ja`/`ko` — the existing catalogs already lag `en.json`
  (548 vs 865 lines pre-change) and vue-i18n falls back to the
  fallback locale for a missing key, so this is a UX-safe, disclosed
  gap rather than a broken flow. Not a STOP-and-report: no ratified
  requirement named full translation, and the codebase already
  tolerates this gap elsewhere.
- `frontend/tests/fakes/analysis-service.ts` — added
  `registerDisconnectHook`/`hasActiveQueries`/`sendActionCommand`
  spies (the driver calls the first at module-load time, so every
  test that transitively imports `useReviewSession` needed it).
- `frontend/tests/unit/engine/katago/query-routing.test.ts` — added a
  `describe` block for the cacheContext auto-stamp (4 cases).
- `FEATURES.md` — new `[experimental]` bullet under "Move analysis
  (KataGo)".
- `frontend/FILES.md` — entries for all 5 new files.

## Claims

- **WITNESSED**: `nice -n 19 npm run build` (`vue-tsc -b && vite build`)
  — exit 0, three separate runs across the session (after initial
  wiring, after the eslint-driven component/composable split, and
  final). Last run: `✓ built in 2.75s`, no type errors.
- **WITNESSED**: `nice -n 19 npx vitest run --maxWorkers=2` (full
  suite) — exit 0 on the final run: **279 files passed, 3 skipped;
  3482 tests passed, 8 skipped, 0 failed**. Includes the 26 new tests
  this build added (12 grammar + 14 driver-lifecycle) plus the 4 new
  query-routing cases, all passing.
- **WITNESSED**: `nice -n 19 npx eslint .` (whole frontend tree) —
  clean, no errors/warnings, after fixing two violations the first
  pass surfaced (component→services import ban; two unjustified `as`
  casts) by extracting `useNncacheControl.ts` and adding same-line
  justification comments matching `EngineModelSelect.vue`'s own
  precedent.
- **WITNESSED**: `node -e "JSON.parse(...)"` on `src/locales/en.json`
  — parses clean (no trailing-comma / syntax break from the new keys).
- **REFUSED-AS-EXPECTED** (by design, per the ratified spec's own
  "vanilla upstream labels will refuse cache verbs" framing): no live
  engine or proxy was contacted at any point — ports 4173/5173/5174/
  8764 and the live proxy at 192.168.122.68:1235 are off-limits to
  builders. The four cache_* wire actions, the quiesce-then-send
  ordering, and the refusal-surfacing path are exercised only against
  the fake `analysisService` in `nncache-session.test.ts`.
- **UNEXERCISED**: live-engine validation of the actual `cache_attach`/
  `cache_detach`/`cache_dump`/`cache_stats` round-trip against a real
  KataGo build with `nnCacheDir` configured. Blocker: live services
  are off-limits to builders per the dispatch brief; this is
  UNEXERCISED by design, not a gap in the implementation. The wire
  shapes are typed directly from `Analysis_Engine.md`'s per-action
  field lists (read end to end before writing `types.ts`'s additions).
- **UNEXERCISED**: the proxy-side forwarding of the four cache verbs.
  `docs/handoff-current.md`... **discrepancy found and disclosed
  (not a STOP-and-report — see below)**: `proxy-fable/README.md`'s
  "Client impact — 2026-08 cache & model-selection arc" §4 states
  *"The proxy does not forward cache verbs (`cache_attach` etc.) —
  they now draw the structured refusal of item 1 instead of hanging"*
  on the branch that README describes (`fable-branch`,
  `2812423..0eca42b`), which is NOT necessarily the same code as the
  pinned proxy submodule (v1.0.27, per the umbrella CLAUDE.md's proxy
  arc — the submodule itself is uninitialized in this worktree, so its
  exact deployed behaviour could not be inspected either). If the
  currently-deployed proxy does refuse cache verbs outright, that
  refusal comes back as an ordinary `KataErrorResponse` — exactly the
  shape item 7 of the ratified spec already requires this UI to
  surface loudly and never probe around. No code path in this build
  assumes proxy forwarding works; the fail-loud refusal handling is
  identical whether the refusal comes from "vanilla upstream refuses
  the verb" or "the proxy doesn't forward it." This did not change
  what was built, only what a live end-to-end witness would show —
  disclosed per the umbrella's cross-boundary-visibility discipline,
  not narrowed around.

## Deviations from the ratified scope

None beyond the disclosed en.json-only i18n scope above, which is not
a narrowing of the ratified feature (every UI string exists in
English; missing translations are a pre-existing, codebase-wide
pattern this build did not introduce).

One implementation judgment call worth naming explicitly (not a
narrowing, a design decision within the brief's stated freedom to
choose the driver's shape): "quiescence" is implemented as
`analysisService.stopAllBoardAnalyses()` (terminate every SPA-tracked
query, synchronous bookkeeping release) rather than an await-natural-
completion path, per the brief's own "terminate/await" wording
(read as terminate OR await) and because `AnalysisService`'s
`activeQueries` map only ever empties via `stopQuery`'s synchronous
release (natural packet completion does not remove the entry — see
`nncache-session.ts`'s header for the full trace). This is a
synchronous, condition-free step; no wall-clock sleep appears
anywhere in the driver.

## Commit

`b66a8a60` — "feat(frontend): NN-cache-context control + KataGo
persisted-cache session driver", worktree branch
`worktree-agent-a26f56978371be255` (cut from local `lyt-phase2` at
`829e952c`). 19 files changed, 1506 insertions(+), 4 deletions(-).

Final gate exit codes (all re-run after this file's first draft, to
witness the actually-committed tree):
- `nice -n 19 npm run build` → exit 0.
- `nice -n 19 npx vitest run --maxWorkers=2` → exit 0 (279 files
  passed, 3 skipped; 3482 tests passed, 8 skipped, 0 failed).
