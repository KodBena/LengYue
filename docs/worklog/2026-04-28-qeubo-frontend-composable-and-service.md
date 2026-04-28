# qEUBO Frontend — Composable + Service ACL + Dispatch v1.2

- **Status:** Shipped on branch
  `frontend/qeubo-composable-and-service`, 2026-04-28.
  `npm run build` green; end-to-end smoke deferred to the toolbar
  PR (no UI consumer in this slice).
- **Genre:** Worklog entry — second frontend slice of the qEUBO
  integration dispatch. Lands the calibration state machine and
  the typed REST client; bumps the dispatch to v1.2 to record
  the bundled-apply UX inversion as the SoT.
- **Date:** 2026-04-28.
- **Origin:** Schema foundation merged in PR #31; the qEUBO
  note's status table flagged "useQeubo composable" as the next
  frontend slice; dispatch v1.2 bundles in this PR per the
  user's instruction following PR #31's review thread.

## Context

PR #31 landed the foundation slice (types, defaults, schema
migration 5→6). The next foundation that all UI work consumes:

- A typed REST client over the six `/qeubo/experiment/*`
  endpoints (`qeubo-service.ts`).
- A reactive state machine for the calibration session
  (`useQeubo.ts`).
- The dispatch's bundled-apply UX call inverted to the user's
  decision recorded in `docs/notes/qEUBO.md`.

This PR ships all three together. No UI consumer in this slice
(the toolbar, bookmarks UI, and parameter-meta editor are
subsequent PRs); the composable's surface is what those PRs
will bind to.

The dispatch v1.2 bump lives here because the composable's API
*is* the inversion — `submitPreference` is observation-only,
`applyEffective` is the new explicit promotion. Putting the
spec amendment in the same PR as the implementation keeps the
two from drifting.

## Approach

### `frontend/src/services/qeubo-service.ts` (new)

Anti-Corruption Layer for the qEUBO REST endpoints. Same shape
as `backend-service.ts`: wire-type aliases (private to the
file), domain-type imports from `../types`, public methods that
narrow the wire shapes and translate snake_case → camelCase.

The wire schema's `phase: string` is narrowed to `'init' |
'optimization'` via a `narrowPhase` helper that throws on
anything outside that set, per ADR-0002. The `BestResponse`
wire shape becomes domain `QeuboBest`; renamed from the
dispatch v1.1's notional `QeuboPoint` to avoid collision with
the field named `point` inside the same shape.

Three HTTP status codes get classified into a `QeuboError`
discriminated class (declared in `../types` for accessibility,
runtime-owned by this service):

- **503** → `kind: 'disabled'` — `QEUBO_ENABLED=False` on this
  backend; surfaces from any `/qeubo/*` route. The composable's
  `bootstrap` clears state and sets `calibrationEnabled` to
  false on this kind.
- **404** → `kind: 'no-experiment'` — no experiment exists for
  this user. Composable maps to `experimentExists === false`.
- **409** (only from `/best`) → `kind: 'init-not-ready'` —
  posterior model not yet fitted; composable surfaces as an
  info system message and clears the cached best.

Other errors propagate as `api-client.ts`'s generic
`Error("API Error N: body")`. The status extractor in this
file (`extractStatus`) parses that message format; if the
format is ever changed in api-client.ts, the regex would silent-
fail and the QeuboError mapping wouldn't fire — captured as a
known coupling.

### `frontend/src/composables/useQeubo.ts` (new)

Module-scoped singleton, same shape as `useAuth`. Six private
refs (`_statusRef`, `_pairRef`, `_bestRef`,
`_calibrationEnabledRef`, `_isBusyRef`, plus a writable
computed `_toolbarView` proxying `session.ui.qeuboToolbarView`)
and ten computeds / methods on the public surface.

`bootstrap()` is idempotent (no run-once gate); each call
re-probes `/status` and overwrites the reactive view with the
latest server-side truth. Three terminal outcomes set
`calibrationEnabled` (true on 200/404, false on 503); other
errors leave it at the prior value and surface a system
message. The bootstrap also fetches the pending pair if one
exists, so the toolbar (PR 3) renders immediately on App.vue
mount.

`submitPreference(0|1)` — per the v1.2 inversion — records the
qEUBO observation only; does not write to
`analysis_env.parameters`. Auto-fetches the next pair inside
the same `_isBusyRef.value = true` block to keep the spinner
flag stable through the submit-then-refetch flow (a finally
gap would briefly flash `isBusy` to false between calls).

`applyEffective()` is the v1.2-introduced explicit promotion:
copies the currently-effective audition (base parameters
overlaid with A or B's decoded values) into
`analysis_env.parameters`, then resets `toolbarView` to
`'applied'`. No-op when already `'applied'`.

`effectiveParameterValues` is the load-bearing computed that
PR 3 will wire into analysis-service so the engine sees the
audition during evaluation. The computed is defensive: when
`toolbarView` is `'A'` or `'B'` but no pair is loaded, it
silently falls back to the base parameters (the toolbar UI
should prevent this state, but the computed's contract holds
regardless).

`startNewExperiment(controlledParams)` reads
`parameter_meta` to derive `parameter_ranges`; throws if any
controlled parameter lacks a range. Auto-fetches the first
pair so the toolbar surfaces A/B immediately on creation.

`abortExperiment()` swallows 404 (already-gone) but
re-raises other errors; resets toolbarView to `'applied'`.

`pinCurrent(name)` and `applyBookmark(id)` round out the
bookmark surface. Rename / delete are deferred to the
bookmarks-UI PR (`useQeubo`'s API will gain those methods
alongside the panel that consumes them).

### `frontend/src/types.ts`

Eight new domain types alongside the existing
`AnalysisEnvironment` block:

- `QeuboPhase = 'init' | 'optimization'`
- `QeuboExperiment`, `QeuboStatus`, `QeuboPair`, `QeuboBest`,
  `QeuboPreferenceResult`, `QeuboHistory`, `QeuboCreateInput`
- `QeuboErrorKind = 'disabled' | 'no-experiment' | 'init-not-ready'`
- `QeuboError extends Error` (class, with `kind` and `status`
  fields declared as ordinary class properties — TS's
  `erasableSyntaxOnly` flag forbids constructor-parameter
  shorthand here, so the class assigns the fields manually).

### `frontend/src/types/backend.ts`

Regenerated against the live backend at
`http://192.168.122.68:8764/openapi.json` (the user's libvirt
backend; the package.json's `gen:api` script targets
127.0.0.1:8764, which the frontend dev environment will pick
up once the backend binds locally — out of scope for this PR).
The regeneration adds the qEUBO Pydantic schemas
(`CreateExperimentRequest`, `CreateExperimentResponse`,
`StatusResponse`, `PairResponse`, `PreferenceRequest`,
`PreferenceResponse`, `BestResponse`, `HistoryResponse`,
`ConfigOverrides`) plus their endpoint operations. No other
shapes changed.

### `docs/dispatch/frontend-to-backend-qeubo-integration.md`

Bumped to v1.2. Five sections amended:

- §1 user-facing-behaviour summary: verdict bullet rewritten
  (no longer "bundle two effects").
- §2.4 POST /preference response paragraph: the route is
  single-purpose; the apply flow is frontend-only.
- §3.4 useQeubo public API: `submitPreference` is observation-
  only; new `applyEffective`; new `bootstrap`, `refreshPair`,
  `calibrationEnabled`, `isBusy` exposed. `QeuboPoint` →
  `QeuboBest` rename in the type signature.
- §3.5 toolbar layout: gains "Use this" apply button next to
  the verdict pair, hidden when `toolbarView === 'applied'`.
- §5 verification case 4: rewritten for separable flow.
- Summary review-focus item 2: marked resolved (struck the
  bundled-apply question; preserved the line as historical
  record per ADR-0005).
- Revision history: v1.2 entry added describing the inversion
  and listing the corrections.

## Critical files

- **Created:** `frontend/src/services/qeubo-service.ts` (~200
  lines, including JSDoc).
- **Created:** `frontend/src/composables/useQeubo.ts` (~330
  lines, including JSDoc — at the upper edge of ADR-0007's
  state-machine budget; further extraction would split state
  from actions but isn't earned at this size).
- **Edited:** `frontend/src/types.ts` (+ ~110 lines: phase
  union, eight domain interfaces, `QeuboErrorKind` union,
  `QeuboError` class).
- **Edited:** `frontend/src/types/backend.ts` (regenerated; +
  ~150 lines for qEUBO schemas).
- **Edited:**
  `docs/dispatch/frontend-to-backend-qeubo-integration.md`
  (v1.2 amendments across five sections plus revision-history
  entry).
- **Edited:** `docs/notes/qEUBO.md` (status-table updates).

## Reused existing surface

- `api.request<T>(method, path, body?)` from
  `services/api-client.ts` — the HTTP wrapper. JWT injection,
  401 silent retry, error surfacing via system messages all
  inherit transparently.
- `pushSystemMessage` for user-visible warnings on bootstrap
  failure and 'init-not-ready' on `/best`.
- `store.profile.settings.engine.katago.analysis_env.*`
  direct reactive mutation pattern (matches AnalysisControls
  and PaletteEditor's existing access shape).
- `crypto.randomUUID()` for bookmark id generation; modern
  browsers only (the codebase already targets ES2022+).

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.86s, 848 modules). Bundle
   size unchanged at 2,753.83 kB — vite tree-shakes the new
   `useQeubo` and `qeuboService` exports because nothing
   imports them yet. The toolbar PR will be the first
   consumer; bundle growth lands there.

2. **Codegen sanity.** `npx openapi-typescript
   http://192.168.122.68:8764/openapi.json -o
   src/types/backend.ts` succeeded against the live backend
   (QEUBO_ENABLED=True presumably; the dispatch wire shapes
   are present whether enabled or not — Pydantic models are
   declared regardless of the runtime gate).

3. **Mental walk-through of the failure paths.**
   - 503 from `/status` → `bootstrap` sets
     `calibrationEnabled = false`, clears state. ✓
   - 404 from `/status` → `calibrationEnabled = true`,
     `_statusRef = null`, `experimentExists === false`. ✓
   - Network error from `/status` → calibrationEnabled
     unchanged (null on first call); system message
     surfaces; user can retry. ✓
   - 404 from `DELETE /experiment` (no experiment) →
     swallowed in `abortExperiment` (already gone).
     Other DELETE errors propagate. ✓
   - 409 from `/best` (init phase) → `refreshBest` clears
     `_bestRef`, surfaces info system message; does not
     throw. ✓
   - Verdict submit with no pending pair → throws
     synchronously before the network call. ✓

4. **End-to-end smoke deferred.** Without a UI consumer the
   end-to-end requires a console-driven invocation; the
   toolbar PR's HMR smoke is the load-bearing verification
   step. Manual recipes the user could run in the dev console
   if they want to exercise this PR ahead of the toolbar
   landing:

   ```ts
   // After login completes:
   const q = (await import('/src/composables/useQeubo.ts')).useQeubo();
   await q.bootstrap();
   console.log({
     enabled: q.calibrationEnabled.value,
     exists: q.experimentExists.value,
     phase: q.phase.value,
   });
   // If experiment doesn't exist:
   await q.startNewExperiment(['alpha']);  // requires parameter_meta.alpha.range
   console.log(q.currentPair.value);
   ```

## Outcomes

- All `/qeubo/experiment/*` endpoints have a typed frontend
  client; wire shapes can no longer drift silently. A backend
  rename of any field becomes a TypeScript compile error at
  exactly the `qeubo-service.ts` mapping site.
- The calibration state machine is in place. The toolbar PR
  consumes its public surface; no further coordination is
  required between the two PRs beyond the shape exported here.
- Dispatch v1.1's bundled-apply default is officially
  retired. v1.2 is the SoT. The `useQeubo` composable's
  `submitPreference` and `applyEffective` are the two halves
  of the formerly-bundled flow.
- `calibrationEnabled` gives the toolbar a single boolean
  signal to gate its rendering on; PR 3's
  `v-if="calibrationEnabled === true"` is the wiring.

## Out of scope (explicitly)

- **Toolbar A/B cluster.** Next PR. Three actions per the
  v1.2 dispatch (toggle / verdict / apply); plus pin button
  and phase indicator. Wires `effectiveParameterValues` into
  analysis-service so the engine sees the audition.
- **Bookmarks UI panel.** Subsequent PR. Adds rename / delete
  methods to `useQeubo`'s public surface.
- **Parameter-meta editor extension.** Subsequent PR. Edits
  `analysis_env.parameter_meta` from the PaletteEditor; calls
  `startNewExperiment` when `qeubo_controlled` toggles.
- **App.vue wiring.** The composable is module-scoped but
  needs an explicit `bootstrap()` call somewhere — natural
  home is `useAppBootstrap` after authentication completes.
  Lands with the toolbar PR.
- **Identity-change reset.** When the user logs out and
  logs in as a different identity, the composable's state
  should clear. The next PR (toolbar wiring) will hook into
  useAuth's identity change to re-bootstrap; for this PR the
  composable just exposes idempotent state transitions.
- **`gen:api` URL fix.** `package.json`'s script hardcodes
  `127.0.0.1:8764`; the user's backend binds on
  `192.168.122.68:8764` (libvirt). Was overridden manually for
  this PR's regeneration. A general fix (env-var override
  or a wrapper script) is independent.

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md`: status table updated. PR #31 marked
  Merged; new rows for "Dispatch v1.2" and "Frontend
  `useQeubo` composable + `qeubo-service.ts` ACL" both In
  review. KeyDB → Redis label correction in the verification
  row.
- `docs/dispatch/frontend-to-backend-qeubo-integration.md`:
  v1.2 amendments + revision-history entry.
- `docs/TODO.md`: no entry yet — the table tracks Completed
  only.

## Branch + PR workflow

Branched off `main` at `1aa1279` (post-merge of PR #31).
Single PR to main. Establishes the calibration state
machine; no UI consumer; no behaviour change visible to the
user without the toolbar PR landing.
