/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, watch } from 'vue';
import { provideAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import { useAnalysisTabs } from '../../composables/analysis/useAnalysisTabs';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import AnalysisTimelinePanel from './AnalysisTimelinePanel.vue';
import { ANALYSIS_PANELS_BY_ID } from './panel-registry';
const props = defineProps();
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
// Resolve the active tab's panelIds to registry descriptors. A panelId not
// in the registry (a removed/renamed panel orphaning a saved tab) is
// dropped with a warning rather than crashing the render — ADR-0002
// non-fatal degradation.
const activePanels = computed(() => {
    const t = activeTab.value;
    if (!t)
        return [];
    const out = [];
    for (const id of t.panelIds) {
        const d = ANALYSIS_PANELS_BY_ID.get(id);
        if (d)
            out.push(d);
        else
            console.warn(`[AnalysisDashboard] tab "${t.label}" references unknown panel id "${id}" — dropping.`);
    }
    return out;
});
function onTabClick(id) {
    setActiveTab(id);
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "dashboard" },
});
/** @type {__VLS_StyleScopedClasses['dashboard']} */ ;
const __VLS_0 = AnalysisTimelinePanel;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
if (__VLS_ctx.tabs.length > 1) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-strip" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['tab-strip']} */ ;
    for (const [tab] of __VLS_vFor((__VLS_ctx.tabs))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.tabs.length > 1))
                        return;
                    __VLS_ctx.onTabClick(tab.id);
                    // @ts-ignore
                    [tabs, tabs, onTabClick,];
                } },
            key: (tab.id),
            type: "button",
            role: "tab",
            ...{ class: "tab" },
            ...{ class: ({ active: tab.id === __VLS_ctx.activeTab?.id }) },
            'aria-selected': (tab.id === __VLS_ctx.activeTab?.id),
        });
        /** @type {__VLS_StyleScopedClasses['tab']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (tab.label);
        // @ts-ignore
        [activeTab, activeTab,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "scrollable-content" },
});
/** @type {__VLS_StyleScopedClasses['scrollable-content']} */ ;
for (const [panel] of __VLS_vFor((__VLS_ctx.activePanels))) {
    const __VLS_5 = (panel.component);
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        key: (panel.id),
    }));
    const __VLS_7 = __VLS_6({
        key: (panel.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    // @ts-ignore
    [activePanels,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
