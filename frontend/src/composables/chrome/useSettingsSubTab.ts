/**
 * src/composables/chrome/useSettingsSubTab.ts
 *
 * Work item `lyt-settings-live-opening` (ledger rows 2007/2009/2001).
 * The settings interior's composition-boundary refactor
 * (`SettingsTab.vue` retired, split into `SettingsSubstrip.vue` /
 * `SettingsPane.vue`, mounted at two SEPARATE LYT leaves — see
 * `state/lyt-widget-registry.ts`'s own entries) needs the active
 * sub-tab id shared between two sibling component INSTANCES, not one
 * parent-owned `ref()` the way `SettingsTab.vue`'s own local
 * `activeSubTab` used to be (that shape assumed one component owned
 * both the strip and the body — it no longer does).
 *
 * A module-scope singleton `ref`, not a `store.session.ui` field: the
 * retired `SettingsTab.vue`'s own header explicitly documented this
 * state as "component-local ... not persisted across remounts" —
 * promoting it to a persisted, migrated store field would be a
 * genuine behavior change (surviving a full page reload) this work
 * item's own commission does not ask for, and would cost a schema
 * migration (`store/migrations.ts`'s own rolling-archive discipline)
 * for a fact this codebase already decided doesn't need persistence.
 * A module-scope ref is the honest, narrower shape: it survives
 * exactly as long as the app instance does (matching the pre-refactor
 * behavior), shared correctly between the two sibling mounts because
 * `export const` module state is a genuine singleton (the
 * `<script setup>`-compiles-to-`setup()` footgun, frontend/CLAUDE.md's
 * "Module-intent state" checklist entry, does NOT apply here — this
 * declaration lives in a plain module, never inside a component's
 * `setup()`).
 *
 * `SETTINGS_SUB_TAB_IDS`/`settingsSubTabs` (ADR-0012 P1, single source of
 * truth): `SettingsSubstrip.vue` (the strip) and `SettingsPane.vue` (the
 * body) are now two SEPARATE component instances — each needs the SAME
 * `{id, label}` array to hand `TabWidget.vue` (both a `part="header"` and a
 * `part="body"` instance must agree on tab identity and order), so this one
 * array is that array's single home rather than two independently-typed
 * copies that could drift.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref } from 'vue';
import type { ComposerTranslation } from 'vue-i18n';

export type SettingsSubTabId =
  | 'session'
  | 'analysisEnv'
  | 'cardSets'
  | 'advancedRegistry'
  | 'analysis'
  | 'keybindings';

export const SETTINGS_SUB_TAB_IDS: readonly SettingsSubTabId[] = [
  'session',
  'analysisEnv',
  'cardSets',
  'advancedRegistry',
  'analysis',
  'keybindings',
];

const SETTINGS_SUB_TAB_LABEL_KEYS: Readonly<Record<SettingsSubTabId, string>> = {
  session: 'settings.section.sessionUI',
  analysisEnv: 'settings.section.analysisEnv',
  cardSets: 'settings.section.cardSets',
  advancedRegistry: 'settings.section.advancedRegistry',
  analysis: 'settings.subtab.analysis',
  keybindings: 'settings.subtab.keybindings',
};

/** The `{id, label}[]` shape `TabWidget.vue`'s `tabs` prop needs, resolved
 *  through the caller's own `useI18n()` `t` (avoiding a direct `useI18n()`
 *  dependency inside this plain composable module — the same "translation
 *  stays the component's own concern" seam `LytNode.vue`'s
 *  `translateLabel` callback prop already uses). */
export function settingsSubTabs(t: ComposerTranslation): { id: SettingsSubTabId; label: string }[] {
  return SETTINGS_SUB_TAB_IDS.map((id) => ({ id, label: t(SETTINGS_SUB_TAB_LABEL_KEYS[id]) }));
}

/** Module-scope singleton — see the file header for why not per-instance
 *  and not a persisted store field. */
const activeSettingsSubTab = ref<SettingsSubTabId>('session');

export function useSettingsSubTab() {
  return { activeSettingsSubTab };
}
