/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
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
 * `updateRegistry` (`lib/utils.ts`). The editor knows nothing about
 * its host — it is mounted in a Settings sub-tab today, but
 * relocating it is a one-line change at the mount site, never a
 * change here.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ANALYSIS_PANELS } from '../charts/panel-registry';
const props = defineProps();
const emit = defineEmits();
const { t } = useI18n();
function commit(next) {
    emit('update', { path: ['analysisTabs'], value: next });
}
const panelLabel = (id) => ANALYSIS_PANELS.find((p) => p.id === id)?.label ?? String(id);
/** Panels not in any tab — hidden from the dashboard. */
const unassigned = computed(() => {
    const assigned = new Set(props.tabs.flatMap((tab) => tab.panelIds));
    return ANALYSIS_PANELS.map((p) => p.id).filter((id) => !assigned.has(id));
});
function addTab() {
    // crypto.randomUUID is the stable unique tab id. The cast brands it —
    // this editor is a canonical construction site for AnalysisTabId.
    const id = crypto.randomUUID();
    commit([...props.tabs, { id, label: t('analysisTabs.newTabName'), panelIds: [] }]);
}
function deleteTab(id) {
    if (props.tabs.length <= 1)
        return; // never delete the last tab
    commit(props.tabs.filter((tab) => tab.id !== id)); // its panels fall to Unassigned
}
function renameTab(id, label) {
    commit(props.tabs.map((tab) => (tab.id === id ? { ...tab, label } : tab)));
}
function moveTab(index, dir) {
    const j = index + dir;
    if (j < 0 || j >= props.tabs.length)
        return;
    const next = props.tabs.slice();
    [next[index], next[j]] = [next[j], next[index]];
    commit(next);
}
function movePanel(tabId, index, dir) {
    commit(props.tabs.map((tab) => {
        if (tab.id !== tabId)
            return tab;
        const j = index + dir;
        if (j < 0 || j >= tab.panelIds.length)
            return tab;
        const panelIds = tab.panelIds.slice();
        [panelIds[index], panelIds[j]] = [panelIds[j], panelIds[index]];
        return { ...tab, panelIds };
    }));
}
/**
 * Reassign a panel to `toTabId` (`''` = unassign/hide). Move semantics:
 * strip it from every tab first (preserving the partition), then append
 * to the target tab.
 */
function reassignPanel(panelId, toTabId) {
    const stripped = props.tabs.map((tab) => ({
        ...tab,
        panelIds: tab.panelIds.filter((p) => p !== panelId),
    }));
    commit(toTabId === ''
        ? stripped
        : stripped.map((tab) => (tab.id === toTabId ? { ...tab, panelIds: [...tab.panelIds, panelId] } : tab)));
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
/** @type {__VLS_StyleScopedClasses['tab-name']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-name']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tabs-editor" },
});
/** @type {__VLS_StyleScopedClasses['tabs-editor']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "intro" },
});
/** @type {__VLS_StyleScopedClasses['intro']} */ ;
(__VLS_ctx.t('analysisTabs.intro'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addTab) },
    type: "button",
    ...{ class: "toolbar-btn-sm" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
(__VLS_ctx.t('analysisTabs.addTab'));
for (const [tab, ti] of __VLS_vFor((props.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (tab.id),
        ...{ class: "tab-block" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-head" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.renameTab(tab.id, $event.target /* the tab-name <input> */.value);
                // @ts-ignore
                [t, t, addTab, renameTab,];
            } },
        ...{ class: "tab-name" },
        value: (tab.label),
        placeholder: (__VLS_ctx.t('analysisTabs.tabNamePlaceholder')),
    });
    /** @type {__VLS_StyleScopedClasses['tab-name']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.moveTab(ti, -1);
                // @ts-ignore
                [t, moveTab,];
            } },
        type: "button",
        ...{ class: "icon-btn" },
        disabled: (ti === 0),
        title: (__VLS_ctx.t('analysisTabs.moveUp')),
    });
    /** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.moveTab(ti, 1);
                // @ts-ignore
                [t, moveTab,];
            } },
        type: "button",
        ...{ class: "icon-btn" },
        disabled: (ti === props.tabs.length - 1),
        title: (__VLS_ctx.t('analysisTabs.moveDown')),
    });
    /** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.deleteTab(tab.id);
                // @ts-ignore
                [t, deleteTab,];
            } },
        type: "button",
        ...{ class: "icon-btn danger" },
        disabled: (props.tabs.length <= 1),
        title: (__VLS_ctx.t('analysisTabs.deleteTab')),
    });
    /** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['danger']} */ ;
    if (tab.panelIds.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
        (__VLS_ctx.t('analysisTabs.emptyTab'));
    }
    for (const [pid, pi] of __VLS_vFor((tab.panelIds))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (pid),
            ...{ class: "panel-row" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "panel-name" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-name']} */ ;
        (__VLS_ctx.panelLabel(pid));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (...[$event]) => {
                    __VLS_ctx.reassignPanel(pid, $event.target /* the move-to <select> */.value);
                    // @ts-ignore
                    [t, t, panelLabel, reassignPanel,];
                } },
            ...{ class: "move-select" },
            value: (tab.id),
        });
        /** @type {__VLS_StyleScopedClasses['move-select']} */ ;
        for (const [opt] of __VLS_vFor((props.tabs))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (opt.id),
                value: (opt.id),
            });
            (opt.label);
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "",
        });
        (__VLS_ctx.t('analysisTabs.hide'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.movePanel(tab.id, pi, -1);
                    // @ts-ignore
                    [t, movePanel,];
                } },
            type: "button",
            ...{ class: "icon-btn" },
            disabled: (pi === 0),
            title: (__VLS_ctx.t('analysisTabs.moveUp')),
        });
        /** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.movePanel(tab.id, pi, 1);
                    // @ts-ignore
                    [t, movePanel,];
                } },
            type: "button",
            ...{ class: "icon-btn" },
            disabled: (pi === tab.panelIds.length - 1),
            title: (__VLS_ctx.t('analysisTabs.moveDown')),
        });
        /** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
        // @ts-ignore
        [t,];
    }
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "unassigned" },
});
/** @type {__VLS_StyleScopedClasses['unassigned']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "unassigned-head" },
});
/** @type {__VLS_StyleScopedClasses['unassigned-head']} */ ;
(__VLS_ctx.t('analysisTabs.unassignedHeader'));
if (__VLS_ctx.unassigned.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
    (__VLS_ctx.t('analysisTabs.allAssigned'));
}
for (const [pid] of __VLS_vFor((__VLS_ctx.unassigned))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (pid),
        ...{ class: "panel-row" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "panel-name muted" },
    });
    /** @type {__VLS_StyleScopedClasses['panel-name']} */ ;
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_ctx.panelLabel(pid));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.reassignPanel(pid, $event.target /* the assign-to <select> */.value);
                // @ts-ignore
                [t, t, panelLabel, reassignPanel, unassigned, unassigned,];
            } },
        ...{ class: "move-select" },
        value: "",
    });
    /** @type {__VLS_StyleScopedClasses['move-select']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "",
        disabled: true,
    });
    (__VLS_ctx.t('analysisTabs.assignTo'));
    for (const [opt] of __VLS_vFor((props.tabs))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (opt.id),
            value: (opt.id),
        });
        (opt.label);
        // @ts-ignore
        [t,];
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
