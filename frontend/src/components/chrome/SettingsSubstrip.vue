<script setup lang="ts">
/**
 * src/components/chrome/SettingsSubstrip.vue
 *
 * Work item `lyt-settings-live-opening` (ledger rows 2007/2009/2001),
 * SettingsTab/TabWidget composition-boundary refactor. Mounts at the
 * encoding's own `settingsSubstrip` leaf (`V(settingsSubstrip,
 * SP_session)` (formerly `settingsPane`), `research/lyt/encodings/lengyue_landscape.lyt` /
 * `lengyue_portrait.lyt` — the flow-envelope-declared, wrap-capable sub-tab
 * strip that used to be `SettingsTab.vue`'s own internal `<TabWidget>`
 * header half. The SAME `TabWidget.vue` still owns every tab-strip
 * concern (ARIA, keyboard, active-tab highlighting) — this component drives
 * it with `part="header"` (see that file's own header, "Split composition,
 * `part`") and `wrap` (see that file's own header, "Wrap" — CSS flex-wrap
 * realizes the SAME greedy left-to-right packing
 * `research/lyt/flow.py`'s offline derivation computes for the encoding's
 * declared `{60px}` 2-row height reservation).
 *
 * Active-tab state is shared with the sibling `SettingsPane.vue` mount via
 * `useSettingsSubTab.ts`'s own module-singleton ref — see that file's
 * header for why a singleton, not a persisted store field.
 *
 * DISCLOSED SCOPE NARROWING (vertical orientation): the flow-envelope
 * modeling and the LYT encoding's own `V(settingsSubstrip, SP_session)`
 * shape are HORIZONTAL-strip-shaped — SPEC.md §8.2's own resolution names
 * horizontal as the modeled default, the vertical variant a separate,
 * unscheduled "second solve." When `store.session.ui.settingsTabsOrientation
 * === 'vertical'`, this leaf renders NOTHING (an empty, zero-content div —
 * its LYT-declared 60px track reserves standing space regardless, a small,
 * honestly-disclosed cost for a quiet, non-default option) and
 * `SettingsPane.vue` renders the FULL strip+body TabWidget (`part="both"`,
 * `orientation="vertical"`) in its own track instead — functionally
 * unchanged from the pre-refactor `SettingsTab.vue`'s single-component
 * vertical rendering, just relocated to the pane leaf. This is a genuine,
 * deliberate narrowing of the commission's live-opening scope for the
 * ALREADY-quiet, non-default vertical option — named here rather than
 * silently degraded or silently overreached into a second flow-modeling
 * pass this session's budget does not extend to.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TabWidget from './TabWidget.vue';
import { store } from '../../store';
import { useSettingsSubTab, settingsSubTabs, type SettingsSubTabId } from '../../composables/chrome/useSettingsSubTab';

const { t } = useI18n();
const { activeSettingsSubTab } = useSettingsSubTab();

const subTabs = computed(() => settingsSubTabs(t));

const isHorizontal = computed(() => store.session.ui.settingsTabsOrientation !== 'vertical');

// TabWidget's `modelValue` is a plain `string` (it hosts arbitrary tab id
// unions across many call sites); `activeSettingsSubTab` is narrower
// (`SettingsSubTabId`, a composable-owned Ref shared with the sibling
// SettingsPane.vue instance — see useSettingsSubTab.ts's header). A local
// writable computed is the widening seam: `v-model` on a Ref DESTRUCTURED
// from an external composable (as opposed to a `ref()` declared directly
// in this component's own <script setup>) is ambiguous to the SFC
// compiler's static ref-binding analysis, and combining that ambiguity
// with an inline `as string` cast in the v-model expression itself
// produced an invalid compiled assignment target (`_unref(x) as string =
// $event`) — a genuine Vue/rolldown compiler edge case, not a runtime
// bug. A plain local `computed` with a get/set pair is an unambiguous
// SFC-root-scope binding the compiler handles the ordinary way, and does
// the widening/narrowing cast in one named place instead of inline.
const activeSubTabModel = computed<string>({
  get: () => activeSettingsSubTab.value,
  set: (v) => {
    activeSettingsSubTab.value = v as SettingsSubTabId; // safe: v always originates from TabWidget's own `tab.id`, itself sourced from `settingsSubTabs`'s `SettingsSubTabId`-typed ids
  },
});
</script>

<template>
  <TabWidget
    v-if="isHorizontal"
    :tabs="subTabs"
    v-model="activeSubTabModel"
    part="header"
    wrap
    orientation="horizontal"
  />
</template>
