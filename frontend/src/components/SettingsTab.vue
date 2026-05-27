<script setup lang="ts">
/**
 * src/components/SettingsTab.vue
 *
 * The Settings tab's surface. Hosts two sub-tabs via the
 * project's TabWidget:
 *   - General: the four discloseable sections (analysis env,
 *     card sets, advanced registry, session UI) extracted from
 *     App.vue's prior `#settings` slot.
 *   - Keybindings: the read-only registry view (Phase 3 of
 *     docs/notes/keybindings-plan.md). Phase 4 adds Edit /
 *     Reset / Unbind.
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
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TabWidget from './chrome/TabWidget.vue';
import KeybindingsView from './KeybindingsView.vue';
import PaletteEditor from './editors/PaletteEditor.vue';
import CardSetEditor from './editors/CardSetEditor.vue';
import RegistryEditor from './editors/RegistryEditor.vue';
import { store, DEFAULTS } from '../store';
import { updateRegistry } from '../engine/util';

const { t } = useI18n();

defineEmits<{
  (e: 'force-save'): void;
}>();

const activeSubTab = ref<'general' | 'keybindings'>('general');

const subTabs = computed(() => [
  { id: 'general',     label: t('settings.subtab.general') },
  { id: 'keybindings', label: t('settings.subtab.keybindings') },
]);

function handleSettingsUpdate(e: { path: string[]; value: unknown }): void {
  updateRegistry(store.profile.settings, e.path, e.value);
}
function handleSessionUpdate(e: { path: string[]; value: unknown }): void {
  updateRegistry(store.session.ui, e.path, e.value);
}
function handleProfileUpdate(e: { path: string[]; value: unknown }): void {
  updateRegistry(store.profile, e.path, e.value);
}
</script>

<template>
  <TabWidget :tabs="subTabs" v-model="(activeSubTab as string)" :keep-mounted="true">

    <template #general>
      <!--
        Each subsection is a native <details> disclosure. Open by
        default — no behavior change for users opening the tab the
        first time after this lands; collapsing is purely an
        opt-in space-saver. @click.stop on the Force Persistence
        button keeps clicks from bubbling up to <summary>'s
        toggle.
      -->
      <div class="tab-padding">
        <details class="settings-section" open>
          <summary>
            <h3 class="sub-header">{{ $t('settings.section.analysisEnv') }}</h3>
            <button class="toolbar-btn-sm" @click.stop="$emit('force-save')">{{ $t('settings.button.forcePersistence') }}</button>
          </summary>
          <div style="margin-top: var(--space-medium);">
            <PaletteEditor :env="store.profile.settings.engine.katago.analysis_env" @update="handleSettingsUpdate"/>
          </div>
        </details>

        <details class="settings-section section-divider" open>
          <summary><h3 class="sub-header">{{ $t('settings.section.cardSets') }}</h3></summary>
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
        </details>

        <details class="settings-section section-divider" open>
          <summary><h3 class="sub-header">{{ $t('settings.section.advancedRegistry') }}</h3></summary>
          <div class="registry-container">
            <RegistryEditor :registry="store.profile.settings" :defaults="DEFAULTS.profile" @update="handleSettingsUpdate"/>
          </div>
        </details>

        <details class="settings-section section-divider" open>
          <summary><h3 class="sub-header">{{ $t('settings.section.sessionUI') }}</h3></summary>
          <div class="registry-container">
            <RegistryEditor :registry="store.session.ui" :defaults="DEFAULTS.session" @update="handleSessionUpdate"/>
          </div>
        </details>
      </div>
    </template>

    <template #keybindings>
      <KeybindingsView />
    </template>

  </TabWidget>
</template>
