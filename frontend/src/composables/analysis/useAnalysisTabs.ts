/**
 * src/composables/analysis/useAnalysisTabs.ts
 *
 * Tab state for the Analysis dashboard: the persisted tab list
 * (`AppSettings.analysisTabs`), the reactive active tab (ephemeral —
 * resets on reload, per the Phase-2 scope), and a setter. Panel-id →
 * component resolution is the component layer's job
 * (`AnalysisDashboard`), so this composable holds no component imports.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, computed } from 'vue';
import { store } from '../../store';
import type { AnalysisTab, AnalysisTabId } from '../../types';

export function useAnalysisTabs() {
  const tabs = computed<AnalysisTab[]>(() => store.profile.settings.analysisTabs ?? []);

  // Ephemeral active-tab selection (not persisted). Falls back to the
  // first tab when unset, or when the selected id is no longer present
  // (e.g. the tab was deleted in the Settings editor).
  const activeTabId = ref<AnalysisTabId | null>(null);
  const activeTab = computed<AnalysisTab | null>(() => {
    const list = tabs.value;
    if (list.length === 0) return null;
    return list.find((t) => t.id === activeTabId.value) ?? list[0];
  });

  function setActiveTab(id: AnalysisTabId): void {
    activeTabId.value = id;
  }

  return { tabs, activeTab, setActiveTab };
}
