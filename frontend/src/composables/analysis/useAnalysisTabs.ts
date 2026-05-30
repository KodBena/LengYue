/**
 * src/composables/analysis/useAnalysisTabs.ts
 *
 * Tab state for the Analysis dashboard: the persisted tab list
 * (`AppSettings.analysisTabs`), the reactive active tab (ephemeral —
 * resets on reload, per the Phase-2 scope), and a setter. Panel-id →
 * component resolution is the component layer's job
 * (`AnalysisDashboard`), so this composable holds no component imports.
 *
 * Also exposes a dev-only, module-scoped forced-tab override
 * (`__devForceActiveAnalysisTab`) used by the perf-capture harness
 * (`useAutoNavigatePerf`) to pin a known tab for replicable captures.
 * It does not change the production per-instance selection below;
 * `import.meta.env.DEV` dead-code-eliminates it in production.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, computed } from 'vue';
import { store } from '../../store';
import type { AnalysisTab, AnalysisTabId } from '../../types';

// DEV-only forced active-tab override. Module-scoped so it is shared across
// the single dashboard instance and settable from outside (the perf-capture
// harness). Pins the dashboard to a known tab so a capture renders a fixed
// panel set for replicability. It deliberately does NOT touch the
// per-instance `activeTabId` below, whose reset-to-first-tab on dashboard
// remount may be intentional ("Basic" is the most-used default). The DEV
// guard folds the override read to a constant `null` in production builds,
// so the branch and the setter dead-code-eliminate.
const devForcedTabId = ref<string | null>(null);

/**
 * DEV-only: pin (id) or release (null) the active analysis tab from outside
 * the dashboard — used by the perf-capture harness. No-op in production.
 */
export function __devForceActiveAnalysisTab(id: string | null): void {
  if (import.meta.env.DEV) devForcedTabId.value = id;
}

export function useAnalysisTabs() {
  const tabs = computed<AnalysisTab[]>(() => store.profile.settings.analysisTabs ?? []);

  // Ephemeral active-tab selection (not persisted). Falls back to the
  // first tab when unset, or when the selected id is no longer present
  // (e.g. the tab was deleted in the Settings editor).
  const activeTabId = ref<AnalysisTabId | null>(null);
  const activeTab = computed<AnalysisTab | null>(() => {
    const list = tabs.value;
    if (list.length === 0) return null;
    // DEV-only override (perf-capture harness); DCE'd in production.
    if (import.meta.env.DEV && devForcedTabId.value !== null) {
      const forced = list.find((t) => t.id === devForcedTabId.value);
      if (forced) return forced;
    }
    return list.find((t) => t.id === activeTabId.value) ?? list[0];
  });

  function setActiveTab(id: AnalysisTabId): void {
    activeTabId.value = id;
  }

  return { tabs, activeTab, setActiveTab };
}
