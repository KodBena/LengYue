/**
 * src/composables/useAppBootstrap.ts
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
import { onMounted, watch } from 'vue';
import { SyncService } from '../services/sync-service';
import { resourceService } from '../services/resource-service';
import { backendService } from '../services/backend-service';
import { analysisService } from '../services/analysis-service';
import { setIntensityHueShift } from '../engine/suggestion-colors';
import { store } from '../store';
import { useQeubo } from './useQeubo';
import type { useAuth } from './useAuth';

export function useAppBootstrap(
  auth: ReturnType<typeof useAuth>,
): { sync: SyncService } {
  const sync = new SyncService('user_workspace_01', auth);
  const qeubo = useQeubo();

  // Restart active analyses whenever an overlay layer toggles. The flag
  // gates a wire-level field (e.g. `includeOwnership`) that's set at
  // query construction; in-flight queries don't pick up the new flag
  // value, so a clean stop-then-reissue is the discipline-correct
  // refresh. Deep watch so future overlay layers (policy, extension-
  // provided metrics) inherit the same restart behaviour.
  watch(
    () => store.session.ui.overlayLayers,
    () => analysisService.restartActiveAnalyses(),
    { deep: true },
  );

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
