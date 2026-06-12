/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
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
const __VLS_emit = defineEmits();
const activeSubTab = ref('general');
const subTabs = computed(() => [
    { id: 'general', label: t('settings.subtab.general') },
    { id: 'analysis', label: t('settings.subtab.analysis') },
    { id: 'keybindings', label: t('settings.subtab.keybindings') },
]);
// With keepMounted=true on the inner TabWidget below, switching
// from Keybindings to General leaves KeybindingsView mounted-but-
// hidden (v-show false). Any KeybindingRow mid-capture would
// otherwise keep its window-level keydown listener installed,
// silently intercepting keypresses meant for the General view's
// inputs. Cancelling capture whenever the sub-tab leaves
// Keybindings releases the listener and clears the mode flag.
// (Switching INTO Keybindings can't have anything in capture
// mode by construction — capture is only ever started by a click
// inside the Keybindings view itself.)
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
function handleSettingsUpdate(e) {
    if (e.path.length === 0)
        return;
    updateProfileAt(['settings', ...e.path], e.value);
}
function handleSessionUpdate(e) {
    updateRegistry(store.session.ui, e.path, e.value);
}
function handleProfileUpdate(e) {
    updateProfileAt(e.path, e.value);
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
const __VLS_0 = TabWidget || TabWidget;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    tabs: (__VLS_ctx.subTabs),
    modelValue: __VLS_ctx.activeSubTab /* widen the sub-tab id union to TabWidget's string v-model */,
    keepMounted: (true),
}));
const __VLS_2 = __VLS_1({
    tabs: (__VLS_ctx.subTabs),
    modelValue: __VLS_ctx.activeSubTab /* widen the sub-tab id union to TabWidget's string v-model */,
    keepMounted: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
const { default: __VLS_6 } = __VLS_3.slots;
{
    const { general: __VLS_7 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-padding" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-padding']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
        ...{ class: "settings-section" },
        open: true,
    });
    /** @type {__VLS_StyleScopedClasses['settings-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.$t('settings.section.analysisEnv'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('force-save');
                // @ts-ignore
                [subTabs, activeSubTab, $t, $emit,];
            } },
        ...{ class: "toolbar-btn-sm" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
    (__VLS_ctx.$t('settings.button.forcePersistence'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    const __VLS_8 = PaletteEditor;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
        ...{ 'onUpdate': {} },
        env: (__VLS_ctx.store.profile.settings.engine.katago.analysis_env),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onUpdate': {} },
        env: (__VLS_ctx.store.profile.settings.engine.katago.analysis_env),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_13;
    const __VLS_14 = {
        ...{ update: {} },
        onUpdate: (__VLS_ctx.handleSettingsUpdate),
    };
    var __VLS_11;
    var __VLS_12;
    __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
        ...{ class: "settings-section section-divider" },
        open: true,
    });
    /** @type {__VLS_StyleScopedClasses['settings-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.$t('settings.section.cardSets'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "registry-container" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['registry-container']} */ ;
    const __VLS_15 = CardSetEditor;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        ...{ 'onUpdate': {} },
        ...{ 'onUpdateActive': {} },
        cardSets: (__VLS_ctx.store.profile.cardSets),
        activeCardSetId: (__VLS_ctx.store.session.ui.activeCardSetId),
    }));
    const __VLS_17 = __VLS_16({
        ...{ 'onUpdate': {} },
        ...{ 'onUpdateActive': {} },
        cardSets: (__VLS_ctx.store.profile.cardSets),
        activeCardSetId: (__VLS_ctx.store.session.ui.activeCardSetId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    let __VLS_20;
    const __VLS_21 = {
        ...{ update: {} },
        onUpdate: (__VLS_ctx.handleProfileUpdate),
        ...{ updateActive: {} },
        onUpdateActive: ((id) => __VLS_ctx.store.session.ui.activeCardSetId = id),
    };
    var __VLS_18;
    var __VLS_19;
    __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
        ...{ class: "settings-section section-divider" },
        open: true,
    });
    /** @type {__VLS_StyleScopedClasses['settings-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.$t('settings.section.advancedRegistry'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "registry-container" },
    });
    /** @type {__VLS_StyleScopedClasses['registry-container']} */ ;
    const __VLS_22 = RegistryEditor;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
        ...{ 'onUpdate': {} },
        registry: (__VLS_ctx.store.profile.settings),
        defaults: (__VLS_ctx.DEFAULTS.profile),
    }));
    const __VLS_24 = __VLS_23({
        ...{ 'onUpdate': {} },
        registry: (__VLS_ctx.store.profile.settings),
        defaults: (__VLS_ctx.DEFAULTS.profile),
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    let __VLS_27;
    const __VLS_28 = {
        ...{ update: {} },
        onUpdate: (__VLS_ctx.handleSettingsUpdate),
    };
    var __VLS_25;
    var __VLS_26;
    __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
        ...{ class: "settings-section section-divider" },
        open: true,
    });
    /** @type {__VLS_StyleScopedClasses['settings-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.$t('settings.section.sessionUI'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "registry-container" },
    });
    /** @type {__VLS_StyleScopedClasses['registry-container']} */ ;
    const __VLS_29 = RegistryEditor;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
        ...{ 'onUpdate': {} },
        registry: (__VLS_ctx.store.session.ui),
        defaults: (__VLS_ctx.DEFAULTS.session),
    }));
    const __VLS_31 = __VLS_30({
        ...{ 'onUpdate': {} },
        registry: (__VLS_ctx.store.session.ui),
        defaults: (__VLS_ctx.DEFAULTS.session),
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    let __VLS_34;
    const __VLS_35 = {
        ...{ update: {} },
        onUpdate: (__VLS_ctx.handleSessionUpdate),
    };
    var __VLS_32;
    var __VLS_33;
    // @ts-ignore
    [$t, $t, $t, $t, store, store, store, store, store, store, handleSettingsUpdate, handleSettingsUpdate, handleProfileUpdate, DEFAULTS, DEFAULTS, handleSessionUpdate,];
}
{
    const { analysis: __VLS_36 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-padding" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-padding']} */ ;
    const __VLS_37 = AnalysisTabsEditor;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        ...{ 'onUpdate': {} },
        tabs: (__VLS_ctx.store.profile.settings.analysisTabs),
    }));
    const __VLS_39 = __VLS_38({
        ...{ 'onUpdate': {} },
        tabs: (__VLS_ctx.store.profile.settings.analysisTabs),
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    let __VLS_42;
    const __VLS_43 = {
        ...{ update: {} },
        onUpdate: (__VLS_ctx.handleSettingsUpdate),
    };
    var __VLS_40;
    var __VLS_41;
    // @ts-ignore
    [store, handleSettingsUpdate,];
}
{
    const { keybindings: __VLS_44 } = __VLS_3.slots;
    const __VLS_45 = KeybindingsView;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({}));
    const __VLS_47 = __VLS_46({}, ...__VLS_functionalComponentArgsRest(__VLS_46));
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
