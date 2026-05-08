# qEUBO Frontend — Toolbar Cluster + Engine Wiring

- **Status:** Shipped on branch
  `frontend/qeubo-toolbar-cluster`, 2026-04-28.
  `npm run build` green; backend wire smoke verified end-to-end
  via curl; UI HMR smoke recipe documented for the user.
- **Genre:** Worklog entry — third frontend slice of the qEUBO
  integration dispatch. Lands the toolbar UI and the engine
  wiring that makes the audition observable.
- **Date:** 2026-04-28.
- **Origin:** Composable + service merged in PR #32; the qEUBO
  note's status table flagged "toolbar A/B cluster" as the
  natural next slice.

## Context

PR #32 landed the calibration state machine (`useQeubo`) and
the typed REST client (`qeubo-service`). With those, the
toolbar slice has two jobs:

1. Render the cluster (toggle / verdict / apply / pin / phase)
   when an experiment is active.
2. Wire the audition into the engine so toggling actually
   affects what KataGo sees during evaluation.

Both ship in this PR. No bookmarks UI panel yet (PR 4); no
parameter-meta editor (PR 5). Until the editor lands, the
user must drive `q.startNewExperiment(...)` from the dev
console to make the toolbar appear.

## Approach

### `frontend/src/components/QeuboToolbar.vue` (new, 185 lines)

Self-gating cluster: renders only when
`q.calibrationEnabled.value === true && q.experimentExists.value`.
Five buttons + one phase indicator + busy dot:

- **Segmented toggle** (Applied / A / B). Three buttons with
  one `.active` class, role="radio" semantics. Disabled when
  isBusy or (for A/B) when no pair is loaded.
- **Verdict pair** ("I prefer A" / "I prefer B"). Hidden when
  no pair. Disabled when isBusy. Calls
  `q.submitPreference(0|1)`; the composable handles the
  observation and auto-fetches the next pair.
- **Apply** ("Use this"). Hidden when toolbarView==='applied'
  (nothing to promote). Calls `q.applyEffective()` which
  copies the audition into `analysis_env.parameters` and
  resets the toolbar view.
- **Pin**. Opens `window.prompt()` for the bookmark name —
  matching the existing pattern in PaletteEditor and
  CardSetEditor. The bookmarks-UI PR will replace with a
  proper modal.
- **Phase indicator**. "init N/M" or "iter K". `?` glyph with
  a `title` tooltip explaining GP cubic-in-N cost so the user
  learns when to stop on their own.
- **Busy dot**. Pulsing `●` while a request is in flight.

Style: matches Toolbar.vue's dark theme (#252525 / #333 / #4aaef0
accent for active). Inline single-line CSS rules per the
existing convention; section sizes within ADR-0007 budget
(script ~60, template ~70, style ~25).

### `frontend/src/components/Toolbar.vue` (edited)

Imports and embeds `<QeuboToolbar />` between the engine
metrics-bar and the engine-controls cluster. The qEUBO
component handles its own visibility — Toolbar.vue passes no
props or events. Six lines added (import + tag + comment).

### `frontend/src/services/analysis-config.ts` (edited)

The load-bearing engine-wiring change. `compileAnalysisConfig`
now consults `useQeubo().effectiveParameterValues` when an
experiment is active:

```ts
const parameters = qeubo.experimentExists.value
  ? qeubo.effectiveParameterValues.value
  : env.parameters;
```

When toolbarView is 'A' or 'B', the composable's
`effectiveParameterValues` overlays the pair's decoded values
on `env.parameters`; when 'applied' or no experiment exists,
the value is identical to `env.parameters`. The
`activeConfigHash` computed picks up the dependency
automatically (Vue tracks reads), so the engine sees a new
config hash on every toggle and re-issues analyses through
the existing restart-on-config-change mechanism.

JSDoc at the top of the module records the indirection so
future readers don't have to chase the qEUBO coupling.

### `frontend/src/composables/useAppBootstrap.ts` (edited)

Three integration points:

- **Auth-state watcher**. Watches `auth.state.value`. On
  transition into 'authenticated' (cold-start
  `unknown → authenticated`, or
  `unauthenticated → authenticated` after a re-login), calls
  `qeubo.bootstrap()` to probe the new identity's experiment.
  On transition out of 'authenticated' (logout, identity
  change), calls `qeubo.reset()` to clear local state.
  SyncService handles the GlobalStore-side workspace wipe;
  this watcher handles the operational state outside the
  store.
- **Toolbar-view watcher**. Watches
  `qeubo.toolbarView.value`. Calls
  `analysisService.restartActiveAnalyses()` when it changes
  so the engine immediately reflects the audition. Mirrors
  the existing overlay-layers watcher pattern.
- **Onmount removal of explicit qeubo.bootstrap call**. The
  auth-state watcher's `unknown → authenticated` transition
  on cold start handles the initial bootstrap; calling
  bootstrap explicitly in `onMounted` was a duplicate probe.

### `frontend/src/composables/useQeubo.ts` (edited, +20 lines)

Added `reset()` method to the public surface. Synchronous
local-state clear: `_statusRef`, `_pairRef`, `_bestRef`,
`_calibrationEnabledRef`, `_isBusyRef` all set to their pre-
bootstrap defaults. Does not touch the GlobalStore — the
SyncService owns that lifecycle.

## Critical files

- **Created:**
  `frontend/src/components/QeuboToolbar.vue` (185 lines).
- **Edited:**
  `frontend/src/components/Toolbar.vue` (+6 lines).
- **Edited:**
  `frontend/src/services/analysis-config.ts` (+18 lines for
  the qEUBO branch + JSDoc).
- **Edited:**
  `frontend/src/composables/useAppBootstrap.ts` (+30 lines:
  auth-state watcher, toolbar-view watcher, comment cleanup).
- **Edited:**
  `frontend/src/composables/useQeubo.ts` (+20 lines for
  `reset()` method and exports).

## Reused existing surface

- `Toolbar.vue`'s flexbox layout — the qEUBO cluster fits
  between metrics and engine-controls without new layout
  primitives.
- `analysis-service.restartActiveAnalyses()` — the existing
  config-change restart mechanism. The qEUBO toggle reuses
  it the same way overlay-layers do.
- `pushSystemMessage` for verdict / apply / pin error
  surfacing.
- `window.prompt` for the bookmark name — matches the existing
  pattern in PaletteEditor and CardSetEditor.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.99s, 853 modules — five new
   modules: QeuboToolbar.vue plus four edited modules picking
   up new imports). Bundle 2,764.59 kB (+10.8 kB over PR #32's
   baseline).

2. **Backend wire smoke.** Verified end-to-end via curl
   against the live backend at `192.168.122.68:8764`:

   ```
   POST /auth/token (local_user) → 200, JWT
   GET /qeubo/experiment/status   → 404 (no experiment)
   POST /qeubo/experiment         → 200 (alpha range [0,1])
                                     phase=init, num_init_queries=4
   GET /qeubo/experiment/pair     → 200 (point_a, point_b, values_a, values_b)
   POST /qeubo/experiment/preference (preferred=0)
                                  → 200, init_index=1, total_responses=1
   GET /qeubo/experiment/status   → 200, init_index=1
   GET /qeubo/experiment/best     → 409 (still in init phase)
   DELETE /qeubo/experiment       → 200
   ```

   Wire shapes match dispatch §2.4 exactly; phase narrowing
   in `qeubo-service.ts` (`narrowPhase`) handles the actual
   string values; the 404 / 409 / 503 → QeuboError mapping is
   the right shape for what the backend returns.

3. **HMR smoke recipe (deferred to user).** Pasteable in the
   browser console while the dev server is running:

   ```js
   const { useQeubo } = await import('/src/composables/useQeubo.ts');
   const { store } = await import('/src/store/index.ts');
   const q = useQeubo();
   console.log({
     enabled: q.calibrationEnabled.value,
     exists: q.experimentExists.value,
   });
   // Configure parameter_meta so startNewExperiment has a range.
   store.profile.settings.engine.katago.analysis_env.parameter_meta = {
     alpha: { range: [0, 1], qeubo_controlled: true },
   };
   await q.startNewExperiment(['alpha']);
   // Toolbar cluster now visible. Use UI buttons or:
   q.toolbarView.value = 'A';      // engine restarts with A's alpha
   await q.submitPreference(0);     // I prefer A; auto-fetches next pair
   q.toolbarView.value = 'B';
   q.applyEffective();             // promote B's alpha to persistent
   q.pinCurrent('first calibration');
   await q.abortExperiment();
   ```

## Outcomes

- The qEUBO calibration loop is **observable end-to-end** for
  the first time. Toggle the toolbar, the engine sees the
  audition. Submit a verdict, the next pair appears.
- The audition is **non-destructive by default**, the apply
  is **explicit**, the verdict is **decoupled from the
  apply** — exactly the v1.2 UX the user specified.
- Identity changes (logout / re-login as a different user)
  cleanly reset the composable's operational state; the
  next authenticated identity's experiment is probed via the
  auth-state watcher.

## Out of scope (explicitly)

- **Bookmarks UI panel.** Subsequent PR. Will land alongside
  rename / delete methods on `useQeubo`'s public surface.
- **Parameter-meta editor extension** in `PaletteEditor.vue`.
  Subsequent PR. Lets the user toggle `qeubo_controlled` per
  parameter, edit ranges, and triggers `startNewExperiment`
  on toggle.
- **Replacing `window.prompt` for the pin name with a proper
  modal**. Lands with the bookmarks-UI PR.
- **A "Start calibration" button in the toolbar for users
  with `qeubo_controlled` parameters but no active
  experiment.** With the editor not landed yet, this would be
  speculative; revisit when the editor is wired.
- **End-to-end UI smoke under HMR.** The user's hands-on test
  via the recipe above is the load-bearing verification step;
  this entry will be updated post-smoke.

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md` status table updated. Composable +
  service rows merged via PR #32; toolbar row "In review";
  end-to-end verification row reads "Partial" (wire verified,
  UI pending).
- No ADR amendment.
- No `deferred-items.md` entry.

## Branch + PR workflow

Branched off `main` at the post-#32 merge commit. Single PR
to main. The next PR (bookmarks UI) can branch off either
this one (stacked) or wait for merge — the bookmark surface
is independent of the toolbar's; either ordering works.
