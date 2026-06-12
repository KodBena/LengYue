<script setup lang="ts">
/**
 * src/components/SettingsTab.vue
 *
 * The Settings tab's surface. Hosts six sub-tabs via the
 * project's TabWidget:
 *   - Session (UI): the RegistryEditor over `store.session.ui`.
 *   - Analysis Environment: the PaletteEditor over the KataGo
 *     analysis_env, with a Force Persistence button at the top.
 *   - Card Sets: the CardSetEditor in a taller registry-container.
 *   - Advanced Registry: the RegistryEditor over profile settings.
 *   - Analysis: the AnalysisTabsEditor (Analysis-tab layout).
 *   - Keybindings: the read-only registry view (Phase 3 of
 *     docs/notes/keybindings-plan.md). Phase 4 adds Edit /
 *     Reset / Unbind.
 *
 * The first four were extracted from App.vue's prior `#settings`
 * slot; they were native <details> accordion sections under one
 * General sub-tab until the 2026-06-12 restructure flattened each
 * into its own sub-tab.
 *
 * Sub-tab state is component-local (matches ForestDirectory's
 * Decks/Browse pattern); not persisted across remounts. A future
 * arc that wants persistence would lift to `store.session.ui`
 * with a schema migration.
 *
 * `sync.forceSave()` lives on the SyncService instance owned by
 * useAppBootstrap; rather than re-instantiating or threading the
 * whole service through, this component emits `force-save` and
 * App.vue's slot binding invokes the live instance.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import TabWidget from './chrome/TabWidget.vue';
import KeybindingsView from './KeybindingsView.vue';
import PaletteEditor from './editors/PaletteEditor.vue';
import CardSetEditor from './editors/CardSetEditor.vue';
import RegistryEditor from './editors/RegistryEditor.vue';
import AnalysisTabsEditor from './editors/AnalysisTabsEditor.vue';
import { store, DEFAULTS } from '../store';
import { updateProfileAt } from '../store/profile-owner';
import { updateRegistry } from '../lib/utils';
import { cancelCapture } from '../lib/keybindings-capture';

const { t } = useI18n();

defineEmits<{
  (e: 'force-save'): void;
}>();

const activeSubTab = ref<'session' | 'analysisEnv' | 'cardSets' | 'advancedRegistry' | 'analysis' | 'keybindings'>('session');

const subTabs = computed(() => [
  { id: 'session',          label: t('settings.section.sessionUI') },
  { id: 'analysisEnv',      label: t('settings.section.analysisEnv') },
  { id: 'cardSets',         label: t('settings.section.cardSets') },
  { id: 'advancedRegistry', label: t('settings.section.advancedRegistry') },
  { id: 'analysis',         label: t('settings.subtab.analysis') },
  { id: 'keybindings',      label: t('settings.subtab.keybindings') },
]);

// With keepMounted=true on the inner TabWidget below, switching
// away from Keybindings leaves KeybindingsView mounted-but-hidden
// (v-show false). Any KeybindingRow mid-capture would otherwise
// keep its window-level keydown listener installed, silently
// intercepting keypresses meant for another sub-tab's inputs.
// Cancelling capture whenever the sub-tab leaves Keybindings
// releases the listener and clears the mode flag. (Switching INTO
// Keybindings can't have anything in capture mode by construction —
// capture is only ever started by a click inside the Keybindings
// view itself.)
watch(activeSubTab, (next) => {
  if (next !== 'keybindings') {
    cancelCapture();
  }
});

// Profile-targeting editor events route through the profile owner
// (work-status item settings-profile-mutator-owner); the owner's
// updateProfileAt carries updateRegistry's silent-create contract
// unchanged. The empty-path guard preserves the prior shape's
// no-op exactly — without it, the settings-rooted form would
// resolve to ['settings'] and replace the whole subtree.
function handleSettingsUpdate(e: { path: string[]; value: unknown }): void {
  if (e.path.length === 0) return;
  updateProfileAt(['settings', ...e.path], e.value);
}
function handleSessionUpdate(e: { path: string[]; value: unknown }): void {
  updateRegistry(store.session.ui, e.path, e.value);
}
function handleProfileUpdate(e: { path: string[]; value: unknown }): void {
  updateProfileAt(e.path, e.value);
}
</script>

<template>
  <TabWidget :tabs="subTabs" v-model="(activeSubTab as string /* widen the sub-tab id union to TabWidget's string v-model */)" :keep-mounted="true">

    <template #session>
      <div class="tab-padding">
        <div class="registry-container">
          <RegistryEditor :registry="store.session.ui" :defaults="DEFAULTS.session" @update="handleSessionUpdate"/>
        </div>
      </div>
    </template>

    <template #analysisEnv>
      <div class="tab-padding">
        <button class="toolbar-btn-sm" @click="$emit('force-save')">{{ $t('settings.button.forcePersistence') }}</button>
        <div style="margin-top: var(--space-medium);">
          <PaletteEditor :env="store.profile.settings.engine.katago.analysis_env" @update="handleSettingsUpdate"/>
        </div>
      </div>
    </template>

    <template #cardSets>
      <div class="tab-padding">
        <!-- magic-literal: clamp(500px, 70vh, 900px) — taller than the
             default `.registry-container` clamp (400/60vh/800) because Card
             Sets renders a richer table (many columns + per-row controls)
             and needs more vertical room before scrolling kicks in. 70vh
             proportional vs 60vh = card-sets gets ~17% more height share. -->
        <div class="registry-container" style="max-height: clamp(500px, 70vh, 900px); padding-bottom: var(--space-medium);">
          <CardSetEditor
            :cardSets="store.profile.cardSets"
            :activeCardSetId="store.session.ui.activeCardSetId"
            @update="handleProfileUpdate"
            @update-active="(id) => store.session.ui.activeCardSetId = id"
          />
        </div>
      </div>
    </template>

    <template #advancedRegistry>
      <div class="tab-padding">
        <div class="registry-container">
          <RegistryEditor :registry="store.profile.settings" :defaults="DEFAULTS.profile" @update="handleSettingsUpdate"/>
        </div>
      </div>
    </template>

    <template #analysis>
      <div class="tab-padding">
        <AnalysisTabsEditor :tabs="store.profile.settings.analysisTabs" @update="handleSettingsUpdate" />
      </div>
    </template>

    <template #keybindings>
      <KeybindingsView />
    </template>

  </TabWidget>
</template>
