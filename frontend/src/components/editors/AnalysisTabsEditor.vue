<script setup lang="ts">
/**
 * src/components/editors/AnalysisTabsEditor.vue
 *
 * Controlled editor for the Analysis-tab layout (`AppSettings.analysisTabs`):
 * add / rename / reorder / delete tabs, and assign panels to tabs. Each
 * panel lives in at most one tab (a partition); unassigned panels are
 * hidden from the dashboard and surfaced here so they are never silently
 * lost. Reorder is via up/down buttons (no drag-drop dependency).
 *
 * Controlled like the other Settings editors: props in, and on every
 * mutation it emits `update({ path: ['analysisTabs'], value: nextTabs })`
 * (PaletteEditor's wholesale pattern); the host applies it via
 * `updateRegistry`. The editor knows nothing about its host — it is
 * mounted in a Settings sub-tab today, but relocating it is a one-line
 * change at the mount site, never a change here.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ANALYSIS_PANELS } from '../charts/panel-registry';
import type { AnalysisTab, AnalysisTabId, AnalysisPanelId } from '../../types';

const props = defineProps<{ tabs: AnalysisTab[] }>();
const emit = defineEmits<{ (e: 'update', payload: { path: string[]; value: unknown }): void }>();

const { t } = useI18n();

function commit(next: AnalysisTab[]): void {
  emit('update', { path: ['analysisTabs'], value: next });
}

const panelLabel = (id: AnalysisPanelId): string =>
  ANALYSIS_PANELS.find((p) => p.id === id)?.label ?? String(id);

/** Panels not in any tab — hidden from the dashboard. */
const unassigned = computed<AnalysisPanelId[]>(() => {
  const assigned = new Set(props.tabs.flatMap((tab) => tab.panelIds));
  return ANALYSIS_PANELS.map((p) => p.id).filter((id) => !assigned.has(id));
});

function addTab(): void {
  // crypto.randomUUID is the stable unique tab id. The cast brands it —
  // this editor is a canonical construction site for AnalysisTabId.
  const id = crypto.randomUUID() as AnalysisTabId;
  commit([...props.tabs, { id, label: t('analysisTabs.newTabName'), panelIds: [] }]);
}

function deleteTab(id: AnalysisTabId): void {
  if (props.tabs.length <= 1) return; // never delete the last tab
  commit(props.tabs.filter((tab) => tab.id !== id)); // its panels fall to Unassigned
}

function renameTab(id: AnalysisTabId, label: string): void {
  commit(props.tabs.map((tab) => (tab.id === id ? { ...tab, label } : tab)));
}

function moveTab(index: number, dir: -1 | 1): void {
  const j = index + dir;
  if (j < 0 || j >= props.tabs.length) return;
  const next = props.tabs.slice();
  [next[index], next[j]] = [next[j], next[index]];
  commit(next);
}

function movePanel(tabId: AnalysisTabId, index: number, dir: -1 | 1): void {
  commit(
    props.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const j = index + dir;
      if (j < 0 || j >= tab.panelIds.length) return tab;
      const panelIds = tab.panelIds.slice();
      [panelIds[index], panelIds[j]] = [panelIds[j], panelIds[index]];
      return { ...tab, panelIds };
    }),
  );
}

/**
 * Reassign a panel to `toTabId` (`''` = unassign/hide). Move semantics:
 * strip it from every tab first (preserving the partition), then append
 * to the target tab.
 */
function reassignPanel(panelId: AnalysisPanelId, toTabId: string): void {
  const stripped = props.tabs.map((tab) => ({
    ...tab,
    panelIds: tab.panelIds.filter((p) => p !== panelId),
  }));
  commit(
    toTabId === ''
      ? stripped
      : stripped.map((tab) => (tab.id === toTabId ? { ...tab, panelIds: [...tab.panelIds, panelId] } : tab)),
  );
}
</script>

<template>
  <div class="tabs-editor">
    <p class="intro">{{ t('analysisTabs.intro') }}</p>
    <button type="button" class="toolbar-btn-sm" @click="addTab">{{ t('analysisTabs.addTab') }}</button>

    <div v-for="(tab, ti) in props.tabs" :key="tab.id" class="tab-block">
      <div class="tab-head">
        <input
          class="tab-name"
          :value="tab.label"
          :placeholder="t('analysisTabs.tabNamePlaceholder')"
          @change="renameTab(tab.id, ($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="icon-btn" :disabled="ti === 0" :title="t('analysisTabs.moveUp')" @click="moveTab(ti, -1)">↑</button>
        <button type="button" class="icon-btn" :disabled="ti === props.tabs.length - 1" :title="t('analysisTabs.moveDown')" @click="moveTab(ti, 1)">↓</button>
        <button type="button" class="icon-btn danger" :disabled="props.tabs.length <= 1" :title="t('analysisTabs.deleteTab')" @click="deleteTab(tab.id)">✕</button>
      </div>

      <div v-if="tab.panelIds.length === 0" class="empty-hint">{{ t('analysisTabs.emptyTab') }}</div>
      <div v-for="(pid, pi) in tab.panelIds" :key="pid" class="panel-row">
        <span class="panel-name">{{ panelLabel(pid) }}</span>
        <select class="move-select" :value="tab.id" @change="reassignPanel(pid, ($event.target as HTMLSelectElement).value)">
          <option v-for="opt in props.tabs" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          <option value="">{{ t('analysisTabs.hide') }}</option>
        </select>
        <button type="button" class="icon-btn" :disabled="pi === 0" :title="t('analysisTabs.moveUp')" @click="movePanel(tab.id, pi, -1)">↑</button>
        <button type="button" class="icon-btn" :disabled="pi === tab.panelIds.length - 1" :title="t('analysisTabs.moveDown')" @click="movePanel(tab.id, pi, 1)">↓</button>
      </div>
    </div>

    <div class="unassigned">
      <div class="unassigned-head">{{ t('analysisTabs.unassignedHeader') }}</div>
      <div v-if="unassigned.length === 0" class="empty-hint">{{ t('analysisTabs.allAssigned') }}</div>
      <div v-for="pid in unassigned" :key="pid" class="panel-row">
        <span class="panel-name muted">{{ panelLabel(pid) }}</span>
        <select class="move-select" value="" @change="reassignPanel(pid, ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>{{ t('analysisTabs.assignTo') }}</option>
          <option v-for="opt in props.tabs" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs-editor { display: flex; flex-direction: column; gap: var(--space-default); }
.intro { font-size: var(--text-small); color: var(--text-2); margin: 0 0 var(--space-default); line-height: 1.4; }
.tab-block {
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  background: var(--surface-1);
  padding: var(--space-default);
}
.tab-head { display: flex; align-items: center; gap: 4px; margin-bottom: var(--space-default); }
.tab-name {
  flex: 1;
  background: var(--surface-0);
  color: var(--text-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: 2px 8px;
  font-size: var(--text-body);
}
.tab-name:focus { outline: none; border-color: var(--accent-primary); }
.panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 2px var(--space-medium);
}
.panel-name { flex: 1; font-size: var(--text-small); color: var(--text-1); }
.panel-name.muted { color: var(--text-2); font-style: italic; }
.move-select {
  background: var(--surface-0);
  color: var(--text-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: 1px 4px;
  font-size: var(--text-tiny);
  cursor: pointer;
}
.icon-btn {
  background: transparent;
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-2);
  width: 22px; height: 22px;
  cursor: pointer;
  font-size: var(--text-tiny);
}
.icon-btn:hover:not(:disabled) { color: var(--text-0); border-color: var(--accent-primary); }
.icon-btn:disabled { opacity: 0.35; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { color: var(--state-error); border-color: var(--state-error); }
.empty-hint { font-size: var(--text-tiny); color: var(--text-2); font-style: italic; padding-left: var(--space-medium); }
.unassigned { border-top: 1px solid var(--surface-3); padding-top: var(--space-default); }
.unassigned-head {
  font-size: var(--text-tiny);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
  margin-bottom: 4px;
}
</style>
