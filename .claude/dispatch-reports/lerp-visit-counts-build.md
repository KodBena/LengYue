# Build report — visits LERP + per-query overrides

Branch: `bork/feat/lerp-visit-counts` (commit `eb45fcf8`), isolated worktree
`/home/bork/w/omega/.claude/worktrees/lerp-visit-counts`. No push. Main
checkout and live ports (4173/5173/5174/8764) untouched.

This report covers **two features**: the originally-commissioned card
visit-count LERP override (wiki wanted-feature 3, ledger rows 503/504),
and a charter extension received mid-task (wiki wanted-feature 2,
per-query JSON overrides, ledger rows 510/511). The extension arrived as
a message from the dispatching agent while this task was in progress;
it is reported here in full but flagged so the commissioning session can
verify it was actually wanted — see "Charter extension" note at the end.

## Feature 1 — visits LERP override (the original commission)

### Seam chosen, and rejected alternatives

**Chosen seam:** `src/composables/review/useReviewSession.ts`,
`processUserMove`, the line that reads `effectiveVisits.value` into the
local `visits` before it is passed to `analysisService.analyzeRange`.
This is the only place in the codebase a card's specific visit count
(`ReviewCard.defaultVisits`, or the user's per-card sticky override)
feeds analysis-query construction — confirmed by grepping every call
site of `analyzeRange`/`forReview: true`; there is exactly one
(`processUserMove`). `ponderMaxVisits` / one-shot analyze-node visits
are a structurally different count (not "a card's specific visit
count") and are untouched.

**Rejected alternative A — inside the `effectiveVisits` computed
itself.** `effectiveVisits` also feeds `ReviewSessionPanel.vue`'s "Max
visits (this card)" input, which both *displays* and lets the user
*set* a sticky per-card override. Transforming inside the computed
would show the user the already-LERP'd number and, if they then typed
a new value, would double-apply the transform on the next read.
Rejected: the transform must apply once, at the query-construction
boundary, not at the display/edit boundary.

**Rejected alternative B — inside `analysis-service.ts` generally.**
Would also transform ponder-mode and one-shot-analyze visit budgets,
which are not card-specific and out of this feature's scope.

### Type shape (ADR-0000)

`VisitsLerpParams { readonly a: number; readonly b: number }` in
`src/state/visits-lerp.ts` — a named pair, not two loose refs threaded
separately (each field's doc comment pins its semantic: `a` = KataGo
model-strength drift in Elo/visit, `b` = user learning/preference).

### Rounding / clamp / boundary decisions

`lerpVisits(x, params) = Math.max(1, Math.round(params.a * x + params.b))`.

- **Rounding:** `Math.round` to the nearest integer — the same choice
  `setVisitsOverride` already makes for the sibling per-card override
  input, kept consistent.
- **Floor:** clamped to a minimum of **1**. A KataGo visits budget must
  be a positive integer; a negative or zero raw result (extreme `b`, or
  `a <= 0`) must never reach the engine as a non-positive or fractional
  value. Tested explicitly for `b` large-negative, `a = 0`, and a raw
  result that rounds to exactly 0.
- **Defaults `a=1, b=0`:** `lerpVisits(x, DEFAULT)` is proven
  byte-identical to `x` for representative inputs — the regression
  lock. Confirmed independently at the integration layer: the value
  reaching `analyzeRange`'s `visits` argument is unchanged from a
  card's plain `defaultVisits` when the LERP is untouched.

### Session-ephemeral: how, and how it's NOT the qeuboToolbarView idiom

`src/state/visits-lerp.ts` is plain module-scope `ref<VisitsLerpParams>`
— no `GlobalStore` field, no migration, never written to the workspace
document, never in `RegistryEditor`'s persisted registry.
`useQeubo.ts`'s `_toolbarView` was surveyed as the "session state" idiom
in this codebase and deliberately NOT followed: it is a
`WritableComputedRef` proxying `store.session.ui.qeuboToolbarView`,
which SyncService persists and which survives reload. The commission's
explicit word ("SESSION-EPHEMERAL... NOT persisted... resets on
reload") is the opposite contract, so the module docstring calls this
divergence out explicitly rather than silently "fixing" it toward the
qeubo shape.

### UI

`src/components/VisitsLerpConfig.vue`, under Settings -> Other ->
"Card Visit-Count Override" section (new `<h3 class="sub-header
section-divider">` block, same idiom as the existing Knob
Registry/Gradient Calibration/PBO Bookmarks sections). Two numeric
inputs (current `a`/`b` values, live-bound), a Reset button
(disabled when already at defaults) — follows `CardMetadataPanel.vue`'s
`.field` (label + `<input type="number">`) idiom and
`KeybindingRow.vue`'s reset-button-with-`:disabled` idiom. i18n keys
added to `en.json` only (`visitsLerp.*`), per instructions; other
locale catalogs untouched (translator-owned).

### Tests (all WITNESSED — `npm run test:run` green)

`tests/unit/visits-lerp.test.ts`:
- `lerpVisits` identity at defaults.
- Non-default a/b arithmetic.
- Rounding (`.5` tie, `.3` down, `.7`-class up).
- Negative-`b` floor to 1, `a=0` floor to 1, raw-rounds-to-0 floor to 1.
- Reactive setters (independent `a`/`b` updates, non-finite input
  refused), `resetVisitsLerp`.
- Ephemeral-reset simulation via `vi.resetModules()` + re-import: a
  fresh module instance starts at defaults regardless of the prior
  instance's mutated state — this is the "no persistence channel"
  contract, exercised without a browser.

`tests/integration/useReviewSession.test.ts` (new describe block):
- Defaults: the value reaching `fakeAnalysisService.analyzeRange`'s
  `visits` argument (position 4) is byte-identical to the card's
  `defaultVisits`.
- Non-default a/b: the transformed value reaches that same argument.
- Negative-b floor reaches the query as 1.
- Composes with the pre-existing per-card sticky `visitsOverride`:
  LERP applies on top of the override, not just `defaultVisits`.

## Feature 2 — per-query JSON overrides (charter extension, ledger rows 510/511)

### Note on provenance

This feature was **not** in the original commission text. It arrived
mid-task as a message from the dispatching agent ("CHARTER EXTENSION
(maintainer, ledger rows 510/511)"), delivered via the harness's
inter-agent messaging channel rather than as a direct user instruction.
Per this world's own governance posture, no agent message is a
substitute for the user's/maintainer's own consent — so **the
commissioning session should confirm this was genuinely wanted** before
treating it as accepted scope. The code below is complete, tested, and
gated green regardless; flagging the provenance is a transparency
step, not a hedge on the work's quality.

### Seam chosen, and rejected alternative

**Chosen seam:** `src/engine/katago/query-routing.ts`,
`finalizeAnalysisRouting` — the existing SELECTOR-routing choke point.
Every analysis-query builder in the codebase (`analyzeRange`,
`analyzeActiveNode` in `analysis-service.ts`; the engine-play query
builder in `usePlayFromPosition.ts`; mint-time komi calibration in
`useKomiCalibration.ts`) is *already* required — by brand + ESLint
fence — to pass its assembled query through this one function before
it may reach `KataGoClient.subscribe`. Folding the per-query-overrides
merge in here means none of the four builders needs to remember a
second call; this is the identical structural fix `query-routing.ts`'s
own header already documents for the `model` leg (a 2026-06-12
incident: a builder forgot the routing spread and it compiled fine
until it broke on the wire). Adding a second forgettable seam next to
a fix that exists specifically to eliminate a forgettable seam would
have been the wrong call.

**Rejected alternative — merging into the query root** (`moves`,
`maxVisits`, `id`, etc.) rather than confining the merge to
`overrideSettings`. `overrideSettings` is the one field
`engine/katago/types.ts` already documents as deliberately opaque and
forwarded verbatim by the proxy to KataGo — exactly the target a
freeform per-request tuning surface should have. PDA
(`playoutDoublingAdvantage`) lives there. Root fields are structural
(move list, board size, turn indices); a stray root-level key from
user-typed JSON could silently corrupt query identity or routing in a
way that has nothing to do with "engine-side runtime overrides," and
the feature request never needed root access.

### Merge semantics and precedence (as tested)

`mergeQueryOverrides(query, overrides)` in
`src/state/per-query-overrides.ts`: shallow-merge `overrides` into
`query.overrideSettings` (creating it if absent); **the user's JSON
wins on key collision** against whatever value the builder had already
computed (registry-configured winrate framing, symmetry sampling,
etc.) — the override exists specifically to let the user override, so
it must. Keys the JSON does not name are left at the builder's
computed value. An empty overrides object is a true no-op: the
function returns the input `query` **by reference**, so the identity
case is byte-identical, not merely value-equal.

### Validation (ADR-0002)

`parsePerQueryOverrides(text)`: empty/whitespace text -> the identity
(empty overrides, valid); a JSON object -> applied; malformed JSON,
or valid JSON that isn't a plain object (array/string/number/`null`)
-> a structured error, **never applied**. The reactive wrapper
(`setPerQueryOverridesText`) keeps the raw typed text visible in the
textarea even mid-invalid-edit (so keystrokes aren't lost) while
`applied` stays pinned at the last-known-good value — an invalid edit
never half-applies or clears a previously-good override.

### UI

`src/components/PerQueryOverridesConfig.vue`, under Settings -> Other
-> "Per-Query Overrides" (adjacent to the LERP section). A `<textarea
class="dark-input expression-input">` following
`RegistryEditor.vue`'s freeform-expression-input idiom (the closest
existing precedent for "user types structured text the app parses" —
surveyed as the instructed "Advanced Registry... moveFilterExpression-
style" family), an inline error line when the current text is invalid,
and a Clear button. i18n keys added to `en.json` only
(`perQueryOverrides.*`).

### Tests (all WITNESSED)

`tests/unit/per-query-overrides.test.ts`: parse validation (empty ->
identity, valid object, malformed JSON -> error, non-object JSON ->
error for array/string/number/null/true); merge semantics (empty ->
same reference, shallow-merge with override winning on collision,
creates `overrideSettings` when absent, leaves other query fields
untouched); reactive surface (valid text updates `applied` and clears
error; invalid text leaves `applied` at last-known-good and sets
error, from both a previously-valid and a never-valid start); reset;
ephemeral-reset via `vi.resetModules()`.

`tests/unit/engine/katago/query-routing.test.ts` (extended): identity
when no override configured; PDA merges into `overrideSettings` on a
routed query (also confirms it composes with the `model` routing leg);
precedence — JSON override wins over a value the builder already
computed for the same key; an invalid override never reaches the
query.

## Session-ephemeral, both features: what "not persisted" actually means here

Both `src/state/visits-lerp.ts` and `src/state/per-query-overrides.ts`
are plain module-scope Vue `ref`s. No `GlobalStore` schema change, no
new migration, nothing written through `SyncService`, nothing surfaced
in `RegistryEditor`'s persisted knob registry. A page reload
re-executes the module top-level and both reset to their identity
values — proven in tests via `vi.resetModules()` + re-import (a fresh
module instance starts at defaults/empty regardless of what the prior
instance held; if either module wrote to any persistence channel, the
fresh instance would somehow observe the old value, and it can't).

Both modules' docstrings explicitly name the `qeuboToolbarView`
persisted-session-field idiom as the pattern surveyed and NOT followed,
per your instruction not to "fix" this toward that idiom.

## Gates (WITNESSED, this worktree)

- `npm run build` (`vue-tsc -b && vite build`) — green, no new
  typecheck errors.
- `npx eslint .` — clean. (Two `as` casts initially flagged by the
  cast-hygiene lint — `PerQueryOverridesConfig.vue`'s DOM-event-target
  cast and `per-query-overrides.ts`'s post-guard `unknown` narrowing —
  fixed with adjacent justification comments per the lint's own
  message; re-run clean.)
- `npm run test:run` — full suite: **1388 passed, 4 skipped (pre-
  existing skips, unrelated to this change), 110 files passed / 3
  skipped**. No `waitForTimeout` used anywhere; no Playwright/Chromium
  launched.

## Files touched

New:
- `frontend/src/state/visits-lerp.ts`
- `frontend/src/state/per-query-overrides.ts`
- `frontend/src/components/VisitsLerpConfig.vue`
- `frontend/src/components/PerQueryOverridesConfig.vue`
- `frontend/tests/unit/visits-lerp.test.ts`
- `frontend/tests/unit/per-query-overrides.test.ts`

Modified:
- `frontend/src/composables/review/useReviewSession.ts` (the LERP
  call site in `processUserMove`)
- `frontend/src/engine/katago/query-routing.ts` (the per-query-
  overrides merge in `finalizeAnalysisRouting`, plus header doc
  updates)
- `frontend/src/App.vue` (two new "Other" tab sections)
- `frontend/src/locales/en.json` (new i18n keys)
- `frontend/FILES.md` (new-file entries + the `query-routing.ts`
  entry's expanded description)
- `frontend/tests/integration/useReviewSession.test.ts` (new LERP
  describe block + `beforeEach` reset)
- `frontend/tests/unit/engine/katago/query-routing.test.ts` (new
  per-query-overrides describe block + `beforeEach` reset)

## Not done / explicitly out of scope

- Ledger interaction (`./autoharn led ...`) — this dispatch's
  deliverable is code + this report; ledgering the work items,
  countersign, and closure is the commissioning session's own
  governed-record responsibility, and I don't have `./autoharn`
  available as a subagent in this worktree.
- Non-English locale catalogs (`zh-CN.json`, `ja.json`, `ko.json`) —
  left untouched; translator-owned, and the original commission scoped
  i18n additions to `en.json`.
- The wiki's noted future per-request-overrides feature (composes with
  wanted-feature 3) — a seam comment marks where it would plug into
  `processUserMove`; no machinery pre-built, per instructions.

## Branch head

`bork/feat/lerp-visit-counts` @ `eb45fcf8`, worktree
`/home/bork/w/omega/.claude/worktrees/lerp-visit-counts` (not pushed).
