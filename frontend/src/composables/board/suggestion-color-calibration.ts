/**
 * src/composables/board/suggestion-color-calibration.ts
 *
 * Domain init for the suggestion-color gradient: wires the two
 * runtime configuration inputs of `engine/suggestion-colors` to
 * their sources. Extracted from useAppBootstrap so the generic
 * resource verb (`getResource<T>` in services/resource-service)
 * stays domain-free and the KataGo-calibration orchestration lives
 * on the Go-bound side of the seam (audit item
 * `resource-service-calibration-seam`).
 *
 * `initSuggestionColorCalibration()` is called exactly once, from
 * useAppBootstrap's setup body (App.vue's setup scope), so the
 * watcher it installs lives for the App's lifetime — the same
 * shape as the bootstrap's other app-lifetime watchers.
 *
 * Ordering tolerance (deliberate, preserved from the prior wiring):
 * the hue-shift watch fires immediately at setup time, ahead of the
 * visit-distribution fetch completing — `rebuildIntensityColorFn`'s
 * early return records the hue value and the ECDF rebuild happens
 * once the distribution lands, in either arrival order. The fetch is
 * fire-and-forget: a failure is surfaced to the system log by
 * api.request and must not crash the bootstrap flow.
 *
 * License: Public Domain (The Unlicense).
 */

import { watch } from 'vue';
import { getResource } from '../../services/resource-service';
import {
  setVisitDistribution,
  setIntensityHueShift,
  type VisitDistributionData,
} from '../../engine/suggestion-colors';
import { store } from '../../store';

/**
 * Loads the KataGo visit-distribution calibration data and hands it
 * to the suggestion-color module. Fire-and-forget — a failure here
 * emits a system-log message (via api.request) but must not crash
 * the app's startup flow, hence the catch. The /resources endpoint
 * is unauthenticated, so this does not depend on the bootstrap's
 * auth-first sequencing.
 */
async function loadVisitDistribution(): Promise<void> {
  try {
    const data = await getResource<VisitDistributionData>('visit-distribution');
    setVisitDistribution(data);
  } catch (err) {
    // api.request has already pushed the HTTP-level error to the
    // system log; this catch just prevents the unhandled rejection
    // from escaping into the bootstrap's startup flow.
    console.error('[suggestion-color-calibration] Failed to load distribution:', err);
  }
}

/**
 * Single named domain-init for the suggestion-color gradient.
 * Installs the hue-shift watcher and kicks off the calibration
 * fetch. Call once from useAppBootstrap's setup body.
 */
export function initSuggestionColorCalibration(): void {
  // Propagate the user's intensity-gradient hue offset into the
  // suggestion-colors module. `immediate: true` syncs the engine to
  // the current store value at setup time; subsequent changes
  // (slider moves, hydration overrides) re-fire and rebuild the
  // gradient closure. The early-return inside
  // rebuildIntensityColorFn handles the pre-distribution case
  // gracefully — the value is recorded; the rebuild happens once
  // loadVisitDistribution() lands.
  watch(
    () => store.profile.settings.appearance.intensityHueShift,
    (deg) => setIntensityHueShift(deg),
    { immediate: true },
  );

  // Fire-and-forget; loadVisitDistribution self-handles (catches + logs).
  void loadVisitDistribution();
}
