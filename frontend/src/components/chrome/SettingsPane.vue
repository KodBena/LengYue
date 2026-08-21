<script setup lang="ts">
/**
 * src/components/chrome/SettingsPane.vue
 *
 * Work item `lyt-settings-live-opening` (ledger rows 2007/2009/2001),
 * SettingsTab/TabWidget composition-boundary refactor. Mounts at the
 * encoding's own `SP_session` (formerly `settingsPane`) leaf (`V(settingsSubstrip, SP_session)`)
 * — the six settings sub-tab BODIES, moved verbatim from the retired
 * `SettingsTab.vue`. The sibling `SettingsSubstrip.vue` owns the STRIP half
 * (`TabWidget.vue`'s own `part="header"`); this component drives the SAME
 * `TabWidget.vue` with `part="body"` (horizontal, the modeled default) so
 * there remains exactly ONE tab implementation (TabWidget.vue) — see that
 * file's own header, "Split composition, `part`" — sharing the active
 * sub-tab id via `useSettingsSubTab.ts`'s own module-singleton ref.
 *
 * Derived overflow: this leaf's own `content unbounded, scroll v`
 * declaration (the encoding's disclosed worst-case-superset classification
 * — see `lengyue_landscape.lyt`'s own header) makes `LytNode.vue`'s
 * generic leaf-cell rendering apply `overflow-y: auto` to the OUTER cell
 * wrapping this whole component (`useLytOverflowCss.ts`'s
 * `leafOverflowStyle`) — so the driven `TabWidget` instance below is told
 * `owns-scroll="false"` (horizontal mode): its own `.tab-body` carries NO
 * further forced overflow, keeping the outer leaf cell the SOLE scroll
 * owner on this path (L5b). **DISCLOSED RESIDUAL, SEVERITY CORRECTED
 * (2026-08-12, independent review, `.claude/dispatch-reports/
 * lyt-settings-live-review.md` Finding 2):** the ratified per-pane
 * classification (§8.4's table: Session (UI)/Analysis Environment/Card
 * Sets/Advanced Registry "no-scroll at declared demand", only Advanced
 * Registry + Keybindings "scroll-owned" — Session (UI) itself belongs to
 * the NO-scroll group) is NOT fully re-derived at the component-CSS
 * level this work item — and the review's own live Playwright
 * measurement at the pinned OPTIMAL size 1920×1080 found this is not a
 * theoretical gap: **the Session (UI) pane — the DEFAULT-ACTIVE tab, the
 * one most users see first — genuinely scrolls today**
 * (`scrollHeight=1086 > clientHeight=755`), a direct breach of its own
 * ratified "no-scroll" classification, not merely a "possible... BOTH
 * simultaneously" edge case (the phrasing this comment originally used,
 * which understated the finding — corrected here per the review's own
 * instruction not to accept "disclosed" as "authorized"). The mechanism
 * is exactly as described above (all six panes share ONE `scrollAxes:
 * [v]` declaration because the encoding still models `SP_session` (formerly `settingsPane`) as
 * ONE opaque leaf); what changed is the severity record, not the cause.
 * Filed as a deferral to the model-implementation wave (a second
 * encoding-level opening of `SP_session` (formerly `settingsPane`) into a `T` of six named
 * panes, each carrying its own true classification — the SAME residual
 * the Option C wave's own encoding header already discloses), per
 * orchestrator adjudication — NOT fixed in this pass.
 *
 * DISCLOSED SCOPE NARROWING (vertical orientation): when
 * `store.session.ui.settingsTabsOrientation === 'vertical'`, this
 * component drives TabWidget with `part="both"` and
 * `orientation="vertical"` instead — the FULL strip+body widget renders
 * here, in this leaf's own track, and the sibling `SettingsSubstrip.vue`
 * renders nothing (see that file's own header for the full rationale).
 * `owns-scroll` reverts to its default `true` in that branch, matching
 * the pre-refactor `SettingsTab.vue`'s own self-contained vertical
 * behavior exactly.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import TabWidget from './TabWidget.vue';
import KeybindingsView from '../KeybindingsView.vue';
import PaletteEditor from '../editors/PaletteEditor.vue';
import CardSetEditor from '../editors/CardSetEditor.vue';
import RegistryEditor from '../editors/RegistryEditor.vue';
import AnalysisTabsEditor from '../editors/AnalysisTabsEditor.vue';
import { store, DEFAULTS, touchSession } from '../../store';
import { mutateProfile, updateProfileAt } from '../../store/profile-owner';
import { updateRegistry } from '../../lib/utils';
import { cancelCapture } from '../../lib/keybindings-capture';
import { openSetupWizard } from '../../composables/useSetupWizardSignal';
import ProxyUpstreamSettingField from '../ProxyUpstreamSettingField.vue';
import { useSettingsSubTab, settingsSubTabs, type SettingsSubTabId } from '../../composables/chrome/useSettingsSubTab';

const { t } = useI18n();
defineEmits<{
  (e: 'force-save'): void;
}>();

const { activeSettingsSubTab } = useSettingsSubTab();
const subTabs = computed(() => settingsSubTabs(t));
const isHorizontal = computed(() => store.session.ui.settingsTabsOrientation !== 'vertical');

// See SettingsSubstrip.vue's own comment on this same seam — the
// destructured-composable-Ref-plus-inline-cast v-model shape is a
// compiler edge case; a local writable computed sidesteps it.
const activeSubTabModel = computed<string>({
  get: () => activeSettingsSubTab.value,
  set: (v) => {
    activeSettingsSubTab.value = v as SettingsSubTabId; // safe: v always originates from TabWidget's own `tab.id`, itself sourced from `settingsSubTabs`'s `SettingsSubTabId`-typed ids
  },
});

// With keepMounted=true, switching away from Keybindings leaves
// KeybindingsView mounted-but-hidden (v-show false). Any KeybindingRow
// mid-capture would otherwise keep its window-level keydown listener
// installed, silently intercepting keypresses meant for another sub-tab's
// inputs. Cancelling capture whenever the sub-tab leaves Keybindings
// releases the listener and clears the mode flag. (Switching INTO
// Keybindings can't have anything in capture mode by construction —
// capture is only ever started by a click inside the Keybindings view
// itself.)
watch(activeSettingsSubTab, (next) => {
  if (next !== 'keybindings') {
    cancelCapture();
  }
});

// Profile-targeting editor events route through the profile owner
// (work-status item settings-profile-mutator-owner); the owner's
// updateProfileAt carries updateRegistry's silent-create contract
// unchanged. The empty-path guard preserves the prior shape's no-op
// exactly — without it, the settings-rooted form would resolve to
// ['settings'] and replace the whole subtree.
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

// Session (UI) theme selector — writes the SAME cell the Advanced Registry
// and the setup wizard edit (one fact, one home; row 748).
function setTheme(theme: 'dark' | 'cluster'): void {
  mutateProfile((profile) => {
    profile.settings.appearance.theme = theme;
  });
}

// Settings sub-tab strip orientation (ledger rows 1505/1509/1515/1516): a
// persisted `session.ui` field, so write + bump the session counter — same
// idiom as `handleActiveCardSet` above (direct assignment then
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
  <TabWidget
    :tabs="subTabs"
    v-model="activeSubTabModel"
    :part="isHorizontal ? 'body' : 'both'"
    :orientation="isHorizontal ? 'horizontal' : 'vertical'"
    :owns-scroll="!isHorizontal"
    :keep-mounted="true"
  >

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
            @change="setTheme(($event.target as HTMLSelectElement /* bound on the theme <select> */).value as 'dark' | 'cluster' /* the two <option> values above are the only legal strings */)"
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
            @change="setSettingsTabsOrientation(($event.target as HTMLSelectElement /* bound on the orientation <select> */).value as 'horizontal' | 'vertical' /* the two <option> values above are the only legal strings */)"
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
        <!-- wiki2-registry-group-label: a heading above the scrollable
             registry container, so it doesn't read as an unlabelled
             continuation of the non-scrolling rows above it (theme
             select / tabs-layout select / proxy-upstream field). Same
             heading idiom as KnobRegistryEditor.vue's per-domain
             `.knob-registry-domain-label` (uppercase, --text-emphasis,
             600 weight) — this is the same "labelled group heading"
             genre, just one level up (labelling the whole registry
             pane rather than a domain bucket within it). -->
        <h4 class="registry-group-label" style="margin-top: var(--space-medium);">{{ $t('settings.label.sessionRegistry') }}</h4>
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
.theme-row label { color: var(--text-0); font-size: var(--text-emphasis); }
.theme-row select {
  background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2);
  border-radius: var(--radius-default); padding: 2px var(--space-tight); font-family: inherit;
}
/* Settings tabs layout row (rows 1505/1509/1515/1516) — same row shape
   as .theme-row above, surface-0 control per rows 681/742. */
.orientation-row { display: flex; align-items: center; gap: var(--space-default); margin-top: var(--space-medium); }
.orientation-row label { color: var(--text-0); font-size: var(--text-emphasis); }
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

/* wiki2-registry-group-label: same heading idiom as KnobRegistryEditor.vue's
   `.knob-registry-domain-label` (uppercase, --text-emphasis, 600 weight) —
   consistent "labelled group heading" look across the two registry-adjacent
   surfaces. */
.registry-group-label {
  margin: 0 0 var(--space-tight) 0;
  font-size: var(--text-emphasis);
  font-weight: 600;
  color: var(--text-0);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}
</style>
