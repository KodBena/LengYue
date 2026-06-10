/**
 * src/composables/auth-app/useAppBootstrap.ts
 * Owns the SyncService instance and the cold-start sequence run in
 * App.vue's onMounted: auth-first auto-login, sync hydration, and
 * the tag-dictionary fetch. Domain inits (currently the
 * suggestion-color calibration) are invoked once at setup time;
 * their orchestration lives with the domain, not here.
 *
 * The composable receives `auth` as a parameter rather than calling
 * `useAuth()` internally. This preserves the single-source-of-truth
 * invariant documented in useAuth.ts: the App-level `useAuth()` call
 * is the canonical instance; passing it in here ensures the
 * composable observes the same reactive state the rest of the app
 * sees, regardless of useAuth's internal sharing semantics.
 *
 * `sync` is genuinely owned: instantiated here, exposed in the
 * return shape so the template can bind `sync.forceSave()` (the
 * Settings tab's "Force Persistence" affordance).
 *
 * Public API:
 *   - sync: the SyncService instance, for template bindings.
 *
 * License: Public Domain (The Unlicense).
 */
import { onMounted, watch } from 'vue';
import { SyncService } from '../../services/sync-service';
import { backendService } from '../../services/backend-service';
import { analysisService } from '../../services/analysis-service';
import { analysisPersistenceService } from '../../services/analysis-persistence-service';
import { useAutoSaveAnalyses } from '../useAutoSaveAnalyses';
import { initSuggestionColorCalibration } from '../board/suggestion-color-calibration';
import { validateRegistry } from '../../lib/knobs';
import { validateKeybindingsRegistry } from '../../lib/keybindings';
import { KEYBINDINGS_REGISTRY } from '../keybindings-catalog';
import { store, boardsSetVersion } from '../../store';
import { i18n } from '../../i18n';
import { isSupportedLocale, DEFAULT_LOCALE } from '../../i18n/locales';
import type { BoardId } from '../../types';
import { useQeubo, reconcileQeuboKnobs, rehydrateExperimentClaims } from '../useQeubo';
import type { useAuth } from './useAuth';

export function useAppBootstrap(
  auth: ReturnType<typeof useAuth>,
): { sync: SyncService } {
  // Defensive ship-time validation of the keybindings catalog —
  // throws if any default-key conflict or duplicate id sneaks in.
  // The substrate validator takes the catalog as input (the
  // substrate/catalog split keeps it registry-agnostic); the
  // catalog is module-static (doesn't change at runtime), so a
  // single setup-time call suffices. Per the keybindings-plan
  // Phase 1; reuses the ADR-0002 fail-loudly posture the knob
  // registry's validation also uses.
  validateKeybindingsRegistry(KEYBINDINGS_REGISTRY);

  const sync = new SyncService('user_workspace_01', auth);
  const qeubo = useQeubo();

  // Mount the auto-save policy once at bootstrap. The composable
  // returns a `stop()` we never call: the watcher and its timers
  // live for the App's lifetime, matching the SyncService / qeubo
  // shape above. Identity-flip resets are handled inside the
  // composable via the gating + persistenceService.forgetAll()
  // already wired into resetWorkspace's audit pair.
  useAutoSaveAnalyses();

  // ── Overlay-layer toggles are UI-only ──────────────────────────────
  // No watcher on `store.session.ui.overlayLayers` here, deliberately.
  //
  // An earlier version of this composable carried a `deep: true`
  // watcher that called `analysisService.restartActiveAnalyses()` on
  // any change to the overlay tree. The justification was "the flag
  // gates a wire-level field (`includeOwnership`); in-flight queries
  // don't pick up the new flag value, so stop-then-reissue is the
  // discipline-correct refresh."
  //
  // Two problems with that posture:
  //
  //   1. Some overlay sub-modes are entirely SPA-side projections of
  //      data that's already in the cached packet. `liveness` reads
  //      `decodedOwnership` (computed from `packet.ownership`) and
  //      filters per stone-position; toggling it while `continuous`
  //      or `dots` is already on changes nothing about the wire query
  //      (`needsOwnership` stays true), but the unconditional restart
  //      stops and re-issues the in-flight analysis anyway. Visible
  //      to the user as analysis progress dropping back to zero on
  //      a UI checkbox flip.
  //
  //   2. More fundamentally, a config-toggle that auto-fires an
  //      expensive engine query is a costly-and-unexpected side
  //      effect of the kind ADR-0002 is shaped to make explicit.
  //      Display preferences should not initiate work the user
  //      didn't ask for; the user re-triggers analysis when they
  //      want fresh data.
  //
  // The consumer side is already wired for the "toggle is UI-only"
  // semantics: `BoardWidget.vue`'s `continuousCells` / `dotsCells` /
  // `livenessCells` all gate on both the toggle state AND on
  // `decodedOwnership` being non-null. Toggle off → empty list →
  // nothing renders. Toggle on with `ownership` in the packet →
  // renders. Toggle on without `ownership` in the packet (because
  // the original query went out without `includeOwnership: true`)
  // → empty list → nothing renders. The user then runs a fresh
  // analysis to fetch ownership data, which is the explicit
  // re-trigger the user opted out of with the original toggle-off
  // state.
  //
  // The separate qEUBO toolbar watcher below (Applied / A / B) is a
  // different shape — clicking A is asking for analysis under
  // proposal A's parameters, a genuine data-change request rather
  // than a display preference — and stays as-is.

  // Suggestion-color gradient calibration: installs the hue-shift
  // watcher (immediate, same setup-time semantics as before the
  // extraction) and kicks off the fire-and-forget visit-distribution
  // fetch. The orchestration lives with the domain —
  // composables/board/suggestion-color-calibration.ts — so this
  // bootstrap only makes the single named domain-init call.
  initSuggestionColorCalibration();

  // Mirror the active chrome theme onto `<html data-theme="...">` so
  // theme.css's [data-theme="X"] blocks resolve their base color
  // anchors per the user's choice. The initial value is baked into
  // index.html to prevent FOUC during cold-start; this watcher takes
  // over once Vue mounts. `immediate: true` syncs at setup-time so the
  // pre-hydration store-default (`'dark'`) lands as a no-op write
  // matching the HTML default. Post-hydration, if the user has saved
  // a different theme, the attribute flips and CSS resolves the
  // alternative block on the next style recalc.
  //
  // themeColor() in src/utils/theme-color.ts reads from
  // documentElement via getComputedStyle, so TS-side consumers
  // (ECharts adapters, board-renderer SVG strings that don't
  // evaluate var()) pick up the active theme's values transparently
  // — no per-consumer rewiring needed.
  watch(
    () => store.profile.settings.appearance.theme,
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    { immediate: true },
  );

  // qEUBO knob-registry reconcile (knob-registry Phase 6). Watches
  // `analysis_env.parameter_meta` deep so a user authoring a range
  // or toggling `qeubo_controlled` via PaletteEditor's Analysis
  // Environment view triggers the corresponding `qeubo.*` KnobDecl
  // to be added / updated / removed in `profile.settings.knobs`.
  // Without this watcher, the registry only learns about parameter_
  // meta entries at migration time or on `startNewExperiment` — a
  // mid-session range edit wouldn't surface the new knob in the
  // KnobRegistryEditor until the user restarted the experiment or
  // reloaded the page (the bug the Phase 6 reconcile arc closes).
  //
  // `immediate: true` runs once at composable setup so a fresh-
  // install profile with seeded parameter_meta gets its registry
  // populated before the user touches anything. `deep: true` so
  // edits inside individual parameter_meta entries (range nudges,
  // qeubo_controlled toggles) fire the watcher.
  //
  // Also re-fires `rehydrateExperimentClaims` so the PBO claim
  // map stays in sync with the persisted source of truth across
  // the SyncService hydrate boundary. `qeubo.bootstrap()` runs
  // immediately on auth-state flip and calls rehydrate against
  // whatever `parameter_meta` is in the store at that moment —
  // but `/qeubo/experiment/status` typically returns BEFORE
  // SyncService's `/documents/{key}` hydrate completes, so the
  // bootstrap-time rehydrate sees the default (empty) parameter_
  // meta and claims nothing. This watcher catches the post-
  // hydrate replacement of `store.profile` (the path-walked
  // value changes identity, the watcher refires) and runs
  // rehydrate again against the populated data. `rehydrate` is
  // idempotent (guarded by `_statusRef.value !== null` and
  // `_claimedKnobIds.has(knobId)` short-circuits), so the
  // common case where bootstrap-time rehydrate already claimed
  // everything is a no-op here.
  watch(
    () => store.profile.settings.engine.katago.analysis_env.parameter_meta,
    () => {
      reconcileQeuboKnobs();
      rehydrateExperimentClaims();
    },
    { immediate: true, deep: true },
  );

  // Knob-registry coherence check (knob-registry Phase 3b). Validates
  // that every KnobDecl's output paths resolve to numeric leaves on
  // the live store, and that each transform's dimensions agree with
  // the decl's inputs/outputs. The check runs at composable setup
  // time (so a defaults-only fresh install is validated against
  // defaults), then re-runs every time the registry mutates (so the
  // post-hydrate registry from a persisted blob is validated, and
  // any runtime mutation through a future decl-editor surface
  // triggers a re-check). Failures are logged loudly per ADR-0002
  // but don't throw — a malformed decl shouldn't take down the app's
  // boot path. The substrate-side write surface (`writeKnobValue`)
  // re-validates each call so an unfixable decl can't silently
  // misbehave.
  watch(
    () => store.profile.settings.knobs,
    (registry) => {
      try {
        validateRegistry(store, registry);
      } catch (err) {
        console.error(
          '[knob-registry] validateRegistry failed — at least one ' +
          'KnobDecl is incoherent against the current store. The ' +
          'cross-domain editor and policy-aware writes for affected ' +
          'knobs may misbehave until the decl is corrected.',
          err,
        );
      }
    },
    { immediate: true, deep: true },
  );

  // Mirror the active UI locale onto vue-i18n's runtime locale ref
  // and onto `<html lang="...">` for assistive tech / browser
  // language inference. Same shape as the theme watcher above —
  // immediate: true syncs at setup-time so the pre-hydration store
  // default ('en') lands as the starting locale matching i18n's
  // own initial config; post-hydration the watcher takes over.
  //
  // Defensive resolver per ADR-0002: if the persisted value is
  // somehow outside the supported set (hand-edited blob, future
  // code path that bypasses the migration), fall back to
  // DEFAULT_LOCALE rather than letting vue-i18n's silent fallback
  // chain hide the bad value. The store-side value is left
  // untouched — surfacing the divergence to DevTools rather than
  // overwriting user data.
  watch(
    () => store.profile.settings.appearance.locale,
    (loc) => {
      const resolved = isSupportedLocale(loc) ? loc : DEFAULT_LOCALE;
      i18n.global.locale.value = resolved;
      document.documentElement.setAttribute('lang', resolved);
    },
    { immediate: true },
  );

  // Identity-aware qEUBO bootstrap. When auth flips into
  // 'authenticated', probe the new identity's experiment state.
  // When it flips out (logout, identity change), clear the
  // composable's local state synchronously — SyncService handles
  // the GlobalStore-side workspace wipe; this clears the
  // operational state (status, pair, best, calibrationEnabled)
  // that lives outside the store.
  watch(
    () => auth.state.value,
    (next, prev) => {
      const wasAuth = prev?.kind === 'authenticated';
      const isAuth = next.kind === 'authenticated';
      if (isAuth && !wasAuth) {
        // Fire-and-forget reaction; bootstrap self-handles its errors
        // (QeuboError kinds + generic). void = intentional non-await.
        void qeubo.bootstrap();
      } else if (!isAuth && wasAuth) {
        qeubo.reset();
      }
    },
  );

  // Restart active analyses whenever the qEUBO audition toggle
  // changes the parameters the engine should see. The
  // analysis-service's `activeAnalysisKeys` is reactive on
  // qeubo.effectiveParameterValues (via compileAnalysisConfig), so
  // the existing restart-on-config-change mechanism would fire
  // anyway — but the explicit watcher here makes the dependency
  // legible and matches the overlay-layers pattern above.
  watch(
    () => qeubo.toolbarView.value,
    () => analysisService.restartActiveAnalyses(),
  );

  // ── Analysis-persistence hydration ──────────────────────────────────────
  //
  // Two-stage bootstrap. Server probes don't need boards loaded;
  // per-board restore does, but boards arrive asynchronously via
  // SyncService.hydrate. Splitting the work matches the qEUBO
  // bootstrap shape (auth-state watcher fires the server probe)
  // plus a watchEffect that handles per-board work as boards
  // become visible.
  //
  // Stage 1 (auth-state watcher below): on `authenticated` flip-in,
  // refresh the summaries cache from `GET /analysis-bundles`.
  // Pure server probe, no board dependency.
  //
  // Stage 2 (watchEffect below): for each board currently in
  // store.boards that has a summary in the cache and hasn't yet
  // been restored this session, kick off `restore(id)`. The
  // dedup `Set` prevents re-restore on subsequent boards-array
  // mutations (a user adding a fresh board fires the effect; the
  // Set's miss for the new id paired with the absent summary
  // makes it a no-op). Cleared on identity-out so a later
  // re-login as the same user can re-hydrate fresh.
  //
  // Both stages best-effort: failures are surfaced via
  // api-client's system-message push, no blocking UX impact on
  // bootstrap.
  watch(
    () => auth.state.value,
    (next, prev) => {
      const wasAuth = prev?.kind === 'authenticated';
      const isAuth = next.kind === 'authenticated';
      if (isAuth && !wasAuth) {
        analysisPersistenceService.refreshSummaries().catch(() => { /* surfaced via api-client */ });
      } else if (!isAuth && wasAuth) {
        // Identity-out: clear the per-board restore dedup so a
        // re-login as the same user can re-hydrate fresh. The
        // service-side caches are cleared via SyncService's
        // resetWorkspace branch (which calls
        // analysisPersistenceService.forgetAll() — audit tag
        // O13, persisted-analysis-bundles). The per-board restore watchers themselves are
        // torn down via the reconcile below once resetWorkspace
        // bumps `boardsSetVersion`.
        restoredBoards.clear();
      }
    },
  );

  // Per-board restore watcher state. `restoredBoards` dedups across
  // the session (cleared on identity-out by the auth watcher above);
  // `restoreWatcherStops` holds per-board dispose callables for the
  // reconcile to manage. Audit pair O16 — paired with the reconcile
  // teardown below.
  //
  // The prior shape (a single `watchEffect` iterating `store.boards`
  // and reading `summaryFor(id)` per board) re-fired on every
  // `mutateBoard` because the iteration registered reactive deps on
  // every board entry — O(N) work per nav step. The per-board
  // pattern subscribes each watcher to ONE key in the reactive
  // `summaries` Map, so `mutateBoard` doesn't fire any of them; only
  // the actual `summaries.set(boardId, ...)` from `refreshSummaries`
  // or `save` does. Diagnosed in
  // `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
  // (secondary causes).
  const restoredBoards = new Set<BoardId>();
  const restoreWatcherStops = new Map<BoardId, () => void>();

  function setupRestoreWatcher(boardId: BoardId): void {
    if (restoreWatcherStops.has(boardId)) return;
    const stop = watch(
      // Vue 3 reactive Map fires the per-key dep on every
      // set/delete for this key — including the first set after
      // the key was previously absent, which is the "hydrate
      // populated this board's summary, kick off restore" case
      // the prior watchEffect handled implicitly.
      () => analysisPersistenceService.summaryFor(boardId),
      (summary) => {
        if (auth.state.value.kind !== 'authenticated') return;
        if (restoredBoards.has(boardId)) return;
        if (!summary) return;
        restoredBoards.add(boardId);
        analysisPersistenceService.restore(boardId).catch(() => { /* surfaced via api-client */ });
      },
      { immediate: true },
    );
    restoreWatcherStops.set(boardId, stop);
  }

  function teardownRestoreWatcher(boardId: BoardId): void {
    restoreWatcherStops.get(boardId)?.();
    restoreWatcherStops.delete(boardId);
    // Don't remove from `restoredBoards` — if the same id comes
    // back later in this session, dedup is still wanted. The
    // identity-flip clear in the auth watcher above covers the
    // legitimate re-hydrate-fresh case.
  }

  // Reconcile per-board restore watchers against the current board
  // set. Fires immediately to set up watchers for boards present at
  // composable mount, then on every board-set change
  // (`boardsSetVersion` bumps) — NOT on per-board content mutations.
  // Same shape as `useAutoSaveAnalyses`'s reconcile; the two
  // composables subscribe to the same signal.
  watch(
    boardsSetVersion,
    () => {
      const currentIds = new Set<BoardId>();
      for (const board of store.boards) currentIds.add(board.id);

      // Snapshot keys before iterating because teardown mutates
      // the map.
      for (const boardId of [...restoreWatcherStops.keys()]) {
        if (!currentIds.has(boardId)) teardownRestoreWatcher(boardId);
      }
      for (const id of currentIds) {
        if (!restoreWatcherStops.has(id)) setupRestoreWatcher(id);
      }
    },
    { immediate: true },
  );

  onMounted(async () => {
    // Establish auth identity FIRST. Subsequent calls (sync.connect's
    // hydration GET, getTags) depend on a valid JWT being present, and
    // previously each path called api.ensureAuthenticated independently
    // — a real race during cold start. Auth-first eliminates the race
    // and gives downstream code an observable identity to read.
    //
    // qEUBO bootstrap is driven by the auth-state watcher above: when
    // auth.state transitions to 'authenticated' (from the initial
    // 'unknown' on cold-start, or from 'unauthenticated' after a
    // login), the watcher fires qeubo.bootstrap(). Calling it here as
    // well would just duplicate the /status probe.
    await auth.tryAutoLogin();

    sync.connect();
    try {
      const tags = await backendService.getTags();
      // Write the non-persisted top-level tag dictionary, NOT
      // store.profile. The prior `store.profile = { ...store.profile,
      // knownTags }` raced sync.connect()'s un-awaited hydration: if
      // getTags won, hydration's deepMerge reverted knownTags to the
      // persisted snapshot (tags-fetch-hydration-race). Moving knownTags
      // out of the persisted profile makes the two writes target
      // different fields, so order no longer matters.
      store.knownTags = tags.map(t => t.name);
    } catch (err) {
      console.warn('Could not load tag dictionary:', err);
    }
  });

  return { sync };
}
