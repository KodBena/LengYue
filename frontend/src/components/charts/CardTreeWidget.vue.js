/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, watch, nextTick, toRef } from 'vue';
import { useCardTreeProjection, cardExpandKeyFor, } from '../../composables/cards/useCardTreeProjection';
import { useCardTreeHydration } from '../../composables/cards/useCardTreeHydration';
import { useEChartsForestRender, } from '../../composables/analysis/useEChartsForestRender';
import { toEChartsNode, tooltipFor, headerLineFor, } from './card-tree-echarts';
const props = withDefaults(defineProps(), { orientation: 'vertical', maxNodes: 5000, currentCardId: null, selectedCardId: null });
const emit = defineEmits();
// Per-mount accordion-expand (per-tree section). manualExpand is a
// prop now (parent-owned and persisted via the store); the data-layer
// `useCardTreeData::reset` clears it when forest / activeSet are
// replaced, so the widget no longer needs to mirror that reset.
const expandedRootId = ref(null);
// Composable expects `Ref<Set<CardId>>` / `Ref<Set<string>>`;
// widening from the `ReadonlySet`-typed props is safe here because
// the projection is read-only over its inputs.
const forestRef = computed(() => props.forest);
const activeSetRef = computed(() => props.activeSet); // widen the ReadonlySet prop for the read-only projection (see comment above)
const manualExpandRef = computed(() => props.manualExpand); // widen the ReadonlySet prop for the read-only projection (see comment above)
const { renderForest } = useCardTreeProjection(forestRef, activeSetRef, manualExpandRef);
const { resetHydration } = useCardTreeHydration(renderForest, toRef(props, 'cards'), cardId => emit('request-card', cardId));
watch([() => props.forest, () => props.activeSet], () => {
    resetHydration();
});
// Default-expansion: pick first tree on forest change unless the
// previously-expanded one is still there (so rerunning a deck
// doesn't randomly jump the user).
watch(renderForest, forest => {
    if (forest.length === 0) {
        expandedRootId.value = null;
        return;
    }
    const stillThere = forest.some(t => t.rootCardId === expandedRootId.value);
    if (!stillThere)
        expandedRootId.value = forest[0].rootCardId;
}, { immediate: true });
function toggleExpand(rootCardId) {
    expandedRootId.value = expandedRootId.value === rootCardId ? null : rootCardId;
}
// Soft-cap warning per ADR-0002.
const totalRendered = computed(() => renderForest.value.reduce((s, t) => s + t.stats.renderedNodeCount, 0));
watch(totalRendered, n => {
    if (n > props.maxNodes)
        emit('overflow', { renderedNodeCount: n, cap: props.maxNodes });
});
// Click dispatch: cards bubble up; stubs / buckets emit
// `'toggle-manual-expand'` for the parent to wire to the persisted
// slice. The parent's mutator reassigns the array (per the named-
// mutator discipline), the `manualExpand` prop re-projects, and the
// `useCardTreeProjection` computed re-fires.
function handleClick(payload) {
    if (payload.kind === 'card') {
        emit('node-click', { cardId: payload.cardId, role: payload.role });
        return;
    }
    const key = payload.kind === 'stub'
        ? cardExpandKeyFor(payload.cardId)
        : payload.bucketId;
    emit('toggle-manual-expand', key);
}
function handleHover(payload, x, y) {
    if (payload.kind !== 'card')
        return;
    emit('node-hover', { cardId: payload.cardId, role: payload.role, x, y });
}
// `containerRefs` is intentionally a plain (non-reactive) Map: the
// `:ref` callback fires during render, and writing to a reactive
// container would dirty the component mid-render and trigger
// "Maximum recursive updates exceeded." Sync is driven by an
// explicit watch on `renderForest` that runs after `nextTick()`.
const containerRefs = new Map();
function setContainerRef(key, el) {
    if (el instanceof HTMLElement)
        containerRefs.set(key, el);
    else
        containerRefs.delete(key);
}
const { syncCharts } = useEChartsForestRender();
function buildConfigs() {
    const expanded = expandedRootId.value;
    if (expanded === null)
        return [];
    const tree = renderForest.value.find(t => t.rootCardId === expanded);
    if (!tree)
        return [];
    const el = containerRefs.get(String(tree.rootCardId));
    if (!el)
        return [];
    return [{
            treeKey: String(tree.rootCardId),
            el,
            data: toEChartsNode(tree.root, props.currentCardId, props.cards, props.selectedCardId),
            orient: props.orientation === 'vertical' ? 'TB' : 'LR',
            renderedNodeCount: tree.stats.renderedNodeCount,
            tooltipFor: payload => tooltipFor(payload, props.cards),
            onClick: handleClick,
            onHover: handleHover,
            onLeave: () => emit('node-leave'),
        }];
}
watch([renderForest, () => props.orientation, () => props.cards, expandedRootId, () => props.currentCardId, () => props.selectedCardId], async () => { await nextTick(); syncCharts(buildConfigs()); }, { immediate: true });
const __VLS_defaults = { orientation: 'vertical', maxNodes: 5000, currentCardId: null, selectedCardId: null };
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
/** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-tree-widget" },
});
/** @type {__VLS_StyleScopedClasses['card-tree-widget']} */ ;
for (const [tree] of __VLS_vFor((__VLS_ctx.renderForest))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (tree.rootCardId),
        ...{ class: "tree-section" },
        ...{ class: ({ expanded: tree.rootCardId === __VLS_ctx.expandedRootId }) },
    });
    /** @type {__VLS_StyleScopedClasses['tree-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.toggleExpand(tree.rootCardId);
                // @ts-ignore
                [renderForest, expandedRootId, toggleExpand,];
            } },
        ...{ class: "tree-header" },
    });
    /** @type {__VLS_StyleScopedClasses['tree-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "chevron" },
    });
    /** @type {__VLS_StyleScopedClasses['chevron']} */ ;
    (tree.rootCardId === __VLS_ctx.expandedRootId ? '▼' : '▶');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "title" },
        title: (__VLS_ctx.headerLineFor(tree, props.forestStats).titleTooltip),
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_ctx.headerLineFor(tree, props.forestStats).title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "meta" },
    });
    /** @type {__VLS_StyleScopedClasses['meta']} */ ;
    (__VLS_ctx.headerLineFor(tree, props.forestStats).meta);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "counts" },
    });
    /** @type {__VLS_StyleScopedClasses['counts']} */ ;
    (__VLS_ctx.headerLineFor(tree, props.forestStats).counts);
    if (tree.rootCardId === __VLS_ctx.expandedRootId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(tree.rootCardId === __VLS_ctx.expandedRootId))
                        return;
                    __VLS_ctx.emit('collapse-tree', tree.rootCardId);
                    // @ts-ignore
                    [expandedRootId, expandedRootId, headerLineFor, headerLineFor, headerLineFor, headerLineFor, emit,];
                } },
            type: "button",
            ...{ class: "collapse-all-btn" },
            title: (__VLS_ctx.$t('cards.lineage.collapseAllTooltip')),
        });
        /** @type {__VLS_StyleScopedClasses['collapse-all-btn']} */ ;
        (__VLS_ctx.$t('cards.lineage.collapseAll'));
    }
    if (tree.rootCardId === __VLS_ctx.expandedRootId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: ((el) => __VLS_ctx.setContainerRef(String(tree.rootCardId), el /* Vue function-ref binds the host element-or-null; this div is a plain DOM element */)),
            ...{ class: "tree-canvas" },
        });
        /** @type {__VLS_StyleScopedClasses['tree-canvas']} */ ;
    }
    // @ts-ignore
    [expandedRootId, $t, $t, setContainerRef,];
}
if (__VLS_ctx.renderForest.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
}
// @ts-ignore
[renderForest,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
