<script setup lang="ts">
/**
 * src/components/SettingsTab.vue
 *
 * The Settings tab's surface. Hosts six sub-tabs via the project's
 * TabWidget. Orientation (ledger rows 1404/1427, side/default per
 * 1505/1509/1515/1516) is now a QUIET, user-owned, persisted choice
 * — `store.session.ui.settingsTabsOrientation` — rather than
 * hardcoded. Default `'horizontal'` (the commissioner's ruling:
 * keep vertical tabs available, but "leave it quietly as an option
 * ... default to the bad old times with horizontal tabs") restores
 * the pre-vtabs strip for everyone who hasn't opted in via the
 * Session (UI) pane's "Settings tabs layout" select (below). Opting
 * into `'vertical'` renders a right-hand rail beside the pane it
 * controls (TabWidget.vue's own header documents the orientation +
 * side contract) — replacing the horizontal strip's overflow-scroll
 * for users who find six sub-tabs cramped at a reasonable width.
 * The control-panel strip, ForestDirectory, and AnalysisDashboard
 * remain horizontal and unchanged; this is still the only TabWidget
 * consumer with a vertical option at all:
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
import { store, DEFAULTS, touchSession } from '../store';
import { mutateProfile } from '../store/profile-owner';
import { updateProfileAt } from '../store/profile-owner';
import { updateRegistry } from '../lib/utils';
import { cancelCapture } from '../lib/keybindings-capture';
import { openSetupWizard } from '../composables/useSetupWizardSignal';
import ProxyUpstreamSettingField from './ProxyUpstreamSettingField.vue';

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
  // Generic-path write into `store.session.ui` — bump the session counter
  // SyncService keys persistence on (it no longer deep-watches
  // `store.session`; see `sessionVersion` in `store/index.ts`).
  touchSession();
}
function handleProfileUpdate(e: { path: string[]; value: unknown }): void {
  updateProfileAt(e.path, e.value);
}
// Active card-set is a persisted `session.ui` field — write + bump the
// session counter (same reason as `handleSessionUpdate`).
function handleActiveCardSet(id: string): void {
  store.session.ui.activeCardSetId = id;
  touchSession();
}

// Session (UI) theme selector — writes the SAME cell the Advanced
// Registry and the setup wizard edit (one fact, one home; row 748).
function setTheme(theme: 'dark' | 'cluster'): void {
  mutateProfile((profile) => {
    profile.settings.appearance.theme = theme;
  });
}

// Settings sub-tab strip orientation (ledger rows 1505/1509/1515/1516):
// a persisted `session.ui` field, so write + bump the session counter —
// same idiom as `handleActiveCardSet` above (direct assignment then
// `touchSession()`), NOT the `deltaViewMode` accessor's bare
// `set: (v) => { store.session.ui.deltaViewMode = v; }` (a known defect —
// that setter never bumps the session counter, so the change silently
// doesn't persist until some other write happens to touch the session).
function setSettingsTabsOrientation(orientation: 'horizontal' | 'vertical'): void {
  store.session.ui.settingsTabsOrientation = orientation;
  touchSession();
}
</script>

<template>
  <TabWidget :tabs="subTabs" v-model="(activeSubTab as string /* widen the sub-tab id union to TabWidget's string v-model */)" :keep-mounted="true" :orientation="store.session.ui.settingsTabsOrientation">

    <template #session>
      <div class="tab-padding settings-fill-pane">
        <!-- Re-run entry point for the first-run setup wizard (ledger
             slug swz-setup-wizard) — re-running never resets
             `profile.settings.onboarding.completed`; see
             `useSetupWizardSignal.ts`. -->
        <button class="toolbar-btn-sm" @click="openSetupWizard">{{ $t('settings.button.rerunWizard') }}</button>
        <!-- Theme selector, restored per commission row 748 ("what
             happened to the theme selector in Session(UI)?"). A second
             VIEW of profile.settings.appearance.theme (same cell the
             Advanced Registry + wizard edit — one fact, one home). -->
        <div class="theme-row">
          <label for="session-theme-select">{{ $t('settings.label.theme') }}</label>
          <select
            id="session-theme-select"
            :value="store.profile.settings.appearance.theme"
            @change="setTheme(($event.target as HTMLSelectElement).value as 'dark' | 'cluster')"
          >
            <option value="cluster">{{ $t('wizard.theme.cluster') }}</option>
            <option value="dark">{{ $t('wizard.theme.dark') }}</option>
          </select>
        </div>
        <!-- Settings sub-tab strip layout (ledger rows 1505/1509/1515/1516):
             quiet, default-horizontal opt-in for the vertical right-rail.
             Matches .theme-row's own idiom immediately above (label +
             native select, same row layout). -->
        <div class="orientation-row">
          <label for="settings-tabs-orientation-select">{{ $t('settings.label.settingsTabsOrientation') }}</label>
          <select
            id="settings-tabs-orientation-select"
            :value="store.session.ui.settingsTabsOrientation"
            @change="setSettingsTabsOrientation(($event.target as HTMLSelectElement).value as 'horizontal' | 'vertical')"
          >
            <option value="horizontal">{{ $t('settings.option.settingsTabsOrientation.horizontal') }}</option>
            <option value="vertical">{{ $t('settings.option.settingsTabsOrientation.vertical') }}</option>
          </select>
        </div>
        <!-- Desktop-only: bundled-proxy upstream (ledger rows 860-862).
             Same cell — and the SAME shared field component —
             WizardStepEngineUri.vue mounts (one rendering, one home;
             see ProxyUpstreamSettingField.vue's header). -->
        <ProxyUpstreamSettingField field-id="settings-proxy-upstream" class="proxy-upstream-row" />
        <div class="registry-container" style="margin-top: var(--space-medium);">
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
            @update-active="handleActiveCardSet"
          />
        </div>
      </div>
    </template>

    <template #advancedRegistry>
      <div class="tab-padding settings-fill-pane">
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

<style scoped>
/* M3 (audit finding, ledger row 1290): makes the Session and Advanced
   Registry sub-tabs' `.tab-padding` wrapper itself a bounded flex
   column reaching TabWidget's `.tab-pane` full height, rather than
   the plain block box `.tab-padding` is everywhere else it's used
   (a flex item of a column flex container sizes to CONTENT height by
   default — `flex-grow: 0` — so without this the wrapper never
   actually reached the pane's available height for
   `.registry-container`'s own `flex: 1 1 auto` (shared-chrome.css) to
   fill). Scoped to THIS file only (Vue's scoped-attribute selector),
   so it does not touch `.tab-padding`'s other consumers
   (KeybindingsView.vue, AnalysisControls.vue, AnalysisDashboard.vue,
   App.vue's own tab-panes) — deliberately not a global `.tab-padding`
   change, which would have reflowed panes outside this pass's
   registry/session-pane charter. Applied to Session (whose registry
   sits below a button/theme-row/proxy-field, all default
   flex-grow:0 so they keep their natural height while the trailing
   `.registry-container` absorbs the remainder) and Advanced Registry
   (a single flex child, so it gets the whole pane). NOT applied to
   Card Sets, whose registry-container keeps its own inline
   `clamp(500px, 70vh, 900px)` override untouched (see that class's
   comment in shared-chrome.css). */
.settings-fill-pane { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }

/* Session (UI) theme selector row (row 748). surface-0 control per rows 681/742. */
.theme-row { display: flex; align-items: center; gap: var(--space-default); margin-top: var(--space-medium); }
.theme-row label { color: var(--text-1); font-size: var(--text-emphasis); }
.theme-row select {
  background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2);
  border-radius: var(--radius-default); padding: 2px var(--space-tight); font-family: inherit;
}
/* Settings tabs layout row (rows 1505/1509/1515/1516) — same row shape
   as .theme-row above, surface-0 control per rows 681/742. */
.orientation-row { display: flex; align-items: center; gap: var(--space-default); margin-top: var(--space-medium); }
.orientation-row label { color: var(--text-1); font-size: var(--text-emphasis); }
.orientation-row select {
  background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2);
  border-radius: var(--radius-default); padding: 2px var(--space-tight); font-family: inherit;
}
/* Desktop-only proxy-upstream field (ledger rows 860-862). The field's
   own label/input/message styling lives in ProxyUpstreamSettingField.vue
   (scoped there — a parent's `<style scoped>` cannot reach INTO a child
   component's template, only its root element); this rule only
   positions that child's root within Session's layout, same family as
   .theme-row above. */
.proxy-upstream-row { margin-top: var(--space-medium); max-width: 32rem; }
</style>
