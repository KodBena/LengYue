<!--
  src/components/charts/AnalysisDashboard.vue
  Provider + layout for the Analysis tab's chart cluster. Creates the
  per-board AnalysisContext once and provides it to the subtree; the panels
  inject the context and read only the slices they display. This component
  reads no high-frequency reactive value in its own render, so an analysis
  packet no longer re-renders the whole subtree (the render-coupling fix —
  see useAnalysisContext and docs/notes/postmortem-render-coupling-at-
  composition-nodes-2026-05-29.md, Recommendation 2).

  Panel layout (Phase 2): the scrollable panels are organised into
  user-defined tabs (AppSettings.analysisTabs, resolved through the
  panel-registry). Only the *active* tab's panels are rendered — the v-for
  over `activePanels` unmounts the inactive tabs' panels entirely, so they
  leave the frame (the regime-B win). The timeline scrubber is the
  persistent header, above the tab strip; it is not a registry panel.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { provideAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useAnalysisTabs } from '../../composables/analysis/useAnalysisTabs';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardId, AnalysisTabId } from '../../types';
import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import { ANALYSIS_PANELS_BY_ID, type AnalysisPanelDescriptor } from './panel-registry';

const props = defineProps<{ boardId: BoardId }>();

// Create + provide the analysis context for this board. The panels below
// inject it; this component reads none of its high-frequency refs in its
// own render — that is what keeps an analysis packet from re-rendering the
// whole subtree.
const ctx = provideAnalysisContext(props.boardId);

// Thumbnail warming stays here: a side-effect tied to the dashboard's
// presence, not to any one panel. It is a watcher, not a render read, so
// it does not re-couple the provider's render to the variation path.
const { warmPath } = useThumbnailCache();
watch(ctx.variationPath, (path) => {
  warmPath(path, props.boardId);
}, { immediate: true });

// Tab layout. Render only the active tab's panels.
const { tabs, activeTab, setActiveTab } = useAnalysisTabs();

// Resolve the active tab's panelIds to registry descriptors. A panelId not
// in the registry (a removed/renamed panel orphaning a saved tab) is
// dropped with a warning rather than crashing the render — ADR-0002
// non-fatal degradation.
const activePanels = computed<AnalysisPanelDescriptor[]>(() => {
  const t = activeTab.value;
  if (!t) return [];
  const out: AnalysisPanelDescriptor[] = [];
  for (const id of t.panelIds) {
    const d = ANALYSIS_PANELS_BY_ID.get(id);
    if (d) out.push(d);
    else console.warn(`[AnalysisDashboard] tab "${t.label}" references unknown panel id "${id}" — dropping.`);
  }
  return out;
});

function onTabClick(id: AnalysisTabId): void {
  setActiveTab(id);
}
</script>

<template>
  <div class="dashboard">
    <AnalysisTimelinePanel />

    <!-- Tab strip — hidden when there is only one tab (nothing to switch). -->
    <div v-if="tabs.length > 1" class="tab-strip" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: tab.id === activeTab?.id }"
        :aria-selected="tab.id === activeTab?.id"
        @click="onTabClick(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <div class="scrollable-content">
      <component
        v-for="panel in activePanels"
        :is="panel.component"
        :key="panel.id"
      />
    </div>
  </div>
</template>

<style scoped>
/* Iter-2 audit Finding B: `height: calc(100vh - 165px)` was the
   prior shape — viewport-relative, with 165px hand-summed from the
   chrome heights (toolbar 28 + nav-bar 32 + status-bar 20 +
   tree-panel-header 20 + various). Brittle to any chrome-height
   change. Iter-12 rewires the chain to be parent-relative:
   `.tab-body → .tab-pane → AnalysisControls's .tab-padding →
   .chart-container-outer → .dashboard`, each link a flex-column
   with `flex: 1; min-height: 0`. The dashboard now takes whatever
   vertical space the analysis tab actually has, regardless of
   chrome geometry above. */
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-0);
  gap: var(--space-default);
  padding: var(--space-medium);
}
.tab-strip {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  border-bottom: 1px solid var(--surface-3);
}
.tab {
  padding: 2px 10px;
  font-size: var(--text-emphasis);
  color: var(--text-2);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color var(--duration-default), border-color var(--duration-default);
}
.tab:hover { color: var(--text-1); }
.tab.active {
  color: var(--text-0);
  border-bottom-color: var(--accent-primary);
}
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-medium);
}
</style>
