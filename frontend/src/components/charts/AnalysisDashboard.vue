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

  Tab-strip idiom (M19, ledger row 1292, audit menus-ui-audit/report.md):
  this strip used to be a bespoke borderless-underline `<button>` row —
  the second of three coexisting tab idioms the audit found (top-level +
  Settings already rendered through the shared `TabWidget`; the Cards
  Decks/Browse strip has since converged too, ledger row 928 commit
  10b6e9aa). Converged here by actually rendering through `TabWidget`
  (ADR-0012 — one component, one idiom) rather than visually matching it,
  since the tab model fits `TabWidget`'s `{id,label}[]` + `modelValue`
  contract exactly (`AnalysisTab` is a strict superset). `keepMounted`
  stays at its default `false` so switching tabs still unmounts the
  inactive tab's panels entirely — the same "regime-B win" this
  docstring's first paragraph describes; TabWidget's own `v-if` on each
  named slot reproduces it (only the active tab's slot content ever
  renders — see TabWidget.vue's tab-pane loop). The strip is hidden
  below TabWidget's own scroll-affordance when there's only one tab, same
  as before (`v-if="tabs.length > 1"`), so a single-tab dashboard shows
  no strip at all.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { provideAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useAnalysisTabs } from '../../composables/analysis/useAnalysisTabs';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import type { BoardId, AnalysisTab, AnalysisTabId } from '../../types';
import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import TabWidget from '../chrome/TabWidget.vue';
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

// Resolve a tab's panelIds to registry descriptors. A panelId not in the
// registry (a removed/renamed panel orphaning a saved tab) is dropped
// with a warning rather than crashing the render — ADR-0002 non-fatal
// degradation. Named per-tab (not just "the active tab") because
// TabWidget's template below calls this once per tab's named slot; only
// the active slot's `v-if` actually renders, so in practice this still
// only ever runs for the active tab (see the M19 docstring above).
function resolvePanels(tab: AnalysisTab): AnalysisPanelDescriptor[] {
  const out: AnalysisPanelDescriptor[] = [];
  for (const id of tab.panelIds) {
    const d = ANALYSIS_PANELS_BY_ID.get(id);
    if (d) out.push(d);
    else console.warn(`[AnalysisDashboard] tab "${tab.label}" references unknown panel id "${id}" — dropping.`);
  }
  return out;
}

// Single-tab fallback: TabWidget is only mounted when there's something
// to switch between (`tabs.length > 1`, matching the strip's prior
// visibility rule); with exactly one tab its panels render directly.
const soloTabPanels = computed<AnalysisPanelDescriptor[]>(() => {
  const t = activeTab.value;
  return t ? resolvePanels(t) : [];
});

function onTabModelUpdate(id: string): void {
  // Re-brand: TabWidget is a generic {id,label}[] widget over plain
  // strings; the ids it emits here originate from `tabs` (AnalysisTab[]),
  // so every value TabWidget can hand back is already an AnalysisTabId
  // string under the hood — this is the domain boundary re-minting it.
  setActiveTab(id as AnalysisTabId);
}
</script>

<template>
  <div class="dashboard">
    <AnalysisTimelinePanel />

    <!-- Tab strip — hidden when there is only one tab (nothing to
         switch), same visibility rule as before. M19: rendered through
         the shared TabWidget (see script-block docstring) rather than
         a bespoke strip, so this converges with the top-level and
         Settings strips onto the one incumbent idiom. -->
    <TabWidget
      v-if="tabs.length > 1"
      class="analysis-tabwidget"
      :tabs="tabs"
      :model-value="activeTab?.id ?? ''"
      @update:model-value="onTabModelUpdate"
    >
      <template v-for="tab in tabs" :key="tab.id" #[tab.id]>
        <div class="scrollable-content">
          <component
            v-for="panel in resolvePanels(tab)"
            :is="panel.component"
            :key="panel.id"
          />
        </div>
      </template>
    </TabWidget>

    <div v-else class="scrollable-content">
      <component
        v-for="panel in soloTabPanels"
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
/* M19: the strip's own visual idiom (bordered box, accent underline,
   hover state) now lives entirely in TabWidget.vue — no bespoke
   `.tab`/`.tab-strip` rules here. `.analysis-tabwidget` only sizes
   TabWidget's root within `.dashboard`'s flex column (TabWidget's own
   `.vue-tabs` root is `height: 100%`, which needs a `flex: 1;
   min-height: 0` sizing parent the same way `.scrollable-content` used
   to provide directly). */
.analysis-tabwidget {
  flex: 1;
  min-height: 0;
}
.scrollable-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-medium);
}
</style>
