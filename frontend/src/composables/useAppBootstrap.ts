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
import { store } from '../store';
import type { useAuth } from './useAuth';

export function useAppBootstrap(
  auth: ReturnType<typeof useAuth>,
): { sync: SyncService } {
  const sync = new SyncService('user_workspace_01', auth);

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

  onMounted(async () => {
    // Establish auth identity FIRST. Subsequent calls (sync.connect's
    // hydration GET, getTags) depend on a valid JWT being present, and
    // previously each path called api.ensureAuthenticated independently
    // — a real race during cold start. Auth-first eliminates the race
    // and gives downstream code an observable identity to read.
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
