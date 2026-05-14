/**
 * src/composables/auth-app/useAppBootstrap.ts
 * Owns the SyncService instance and the cold-start sequence run in
 * App.vue's onMounted: auth-first auto-login, sync hydration,
 * resource preloading, and the tag-dictionary fetch.
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
import { onMounted, watch, watchEffect } from 'vue';
import { SyncService } from '../../services/sync-service';
import { resourceService } from '../../services/resource-service';
import { backendService } from '../../services/backend-service';
import { analysisService } from '../../services/analysis-service';
import { analysisPersistenceService } from '../../services/analysis-persistence-service';
import { setIntensityHueShift } from '../../engine/suggestion-colors';
import { validateRegistry } from '../../lib/knobs';
import { store } from '../../store';
import { i18n } from '../../i18n';
import { isSupportedLocale, DEFAULT_LOCALE } from '../../i18n/locales';
import type { BoardId } from '../../types';
import { useQeubo } from '../useQeubo';
import type { useAuth } from './useAuth';

export function useAppBootstrap(
  auth: ReturnType<typeof useAuth>,
): { sync: SyncService } {
  const sync = new SyncService('user_workspace_01', auth);
  const qeubo = useQeubo();

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

  // Propagate the user's intensity-gradient hue offset into the
  // suggestion-colors module. `immediate: true` syncs the engine to
  // the current store value at composable-setup time; subsequent
  // changes (slider moves, hydration overrides) re-fire and rebuild
  // the gradient closure. The early-return inside
  // rebuildIntensityColorFn handles the pre-distribution case
  // gracefully — the value is recorded; the rebuild happens once
  // resourceService.loadVisitDistribution() lands.
  watch(
    () => store.profile.settings.appearance.intensityHueShift,
    (deg) => setIntensityHueShift(deg),
    { immediate: true },
  );

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
        qeubo.bootstrap();
      } else if (!isAuth && wasAuth) {
        qeubo.reset();
      }
    },
  );

  // Restart active analyses whenever the qEUBO audition toggle
  // changes the parameters the engine should see. The
  // analysis-service's `activeConfigHash` is reactive on
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
      }
      // Identity-out cleanup is handled by SyncService's
      // resetWorkspace branch, which calls
      // analysisPersistenceService.forgetAll() (audit pair O13).
      // The restoredBoards Set below is cleared in the watchEffect
      // below when auth flips to non-authenticated.
    },
  );

  const restoredBoards = new Set<BoardId>();
  watchEffect(() => {
    if (auth.state.value.kind !== 'authenticated') {
      restoredBoards.clear();
      return;
    }
    // Touch the reactive boards array and the reactive summaries
    // Map (via summaryFor). The effect re-fires when either
    // changes — so a hydrate that populates boards AND a separate
    // refreshSummaries that populates the cache both converge on
    // the same restore loop without duplicate dispatches.
    for (const board of store.boards) {
      const id = board.id;
      if (restoredBoards.has(id)) continue;
      if (!analysisPersistenceService.summaryFor(id)) continue;
      restoredBoards.add(id);
      analysisPersistenceService.restore(id).catch(() => { /* surfaced via api-client */ });
    }
  });

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
    resourceService.loadVisitDistribution();
    try {
      const tags = await backendService.getTags();
      store.profile = { ...store.profile, knownTags: tags.map(t => t.name) };
    } catch (err) {
      console.warn('Could not load tag dictionary:', err);
    }
  });

  return { sync };
}
