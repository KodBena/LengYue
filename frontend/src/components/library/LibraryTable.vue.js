/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/library/LibraryTable.vue
 *
 * Virtual-scrolled library list. Sortable column headers,
 * fixed-row-height rendering via `useVirtualRowList`. Emits
 * `select` on row click, `open` on row dblclick, and
 * `visible-range` whenever the rendered window changes so the
 * parent can call `ensureRange` on its `useLibraryQuery`.
 *
 * Thin renderer. Data flow:
 *   parent (LibraryTab)
 *     → owns useLibraryQuery
 *     → passes totalCount, rowAt, isRowLoading, sort, direction in
 *     → listens for visible-range to call ensureRange on the
 *       composable
 *     → listens for sort changes to update the query
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useVirtualRowList } from '../../composables/library/useVirtualRowList';
import { isPasteClick, isMiddleButtonMousedown } from '../../utils/modifier-key';
const props = defineProps();
const emit = defineEmits();
// Magic-literal: 32 px row height. Matches the body-text line
// height (~16 px) plus 8 px vertical padding × 2; calibrated by
// eye against the existing table-like surfaces (CardSet editor,
// ForestDirectory rows). If body text size changes globally,
// retune. Substrate token candidate if a second consumer needs
// the same height.
const ROW_HEIGHT_PX = 32;
const scrollContainer = ref(null);
const scrollTop = ref(0);
const containerHeight = ref(0);
// totalCount as a Ref so useVirtualRowList can observe it.
const totalCountRef = computed(() => props.totalCount);
const v = useVirtualRowList({
    totalCount: totalCountRef,
    rowHeightPx: ROW_HEIGHT_PX,
    containerHeightPx: containerHeight,
    scrollTopPx: scrollTop,
});
// Emit visible-range whenever it changes so parent can fetch.
watch([v.visibleStart, v.visibleEnd], ([s, e]) => emit('visible-range', s, e), { immediate: true });
let resizeObserver = null;
function onScroll() {
    const el = scrollContainer.value;
    if (el)
        scrollTop.value = el.scrollTop;
}
onMounted(() => {
    const el = scrollContainer.value;
    if (!el)
        return;
    containerHeight.value = el.clientHeight;
    el.addEventListener('scroll', onScroll, { passive: true });
    resizeObserver = new ResizeObserver(() => {
        containerHeight.value = el.clientHeight;
    });
    resizeObserver.observe(el);
});
onUnmounted(() => {
    resizeObserver?.disconnect();
    scrollContainer.value?.removeEventListener('scroll', onScroll);
});
// Render-loop helper: an array of indices currently in the
// visible window. Length = visibleEnd - visibleStart.
const visibleIndices = computed(() => {
    const arr = [];
    for (let i = v.visibleStart.value; i < v.visibleEnd.value; i++)
        arr.push(i);
    return arr;
});
function onHeaderClick(col) {
    if (props.sort === col) {
        emit('update:direction', props.direction === 'asc' ? 'desc' : 'asc');
    }
    else {
        emit('update:sort', col);
    }
}
function sortIndicator(col) {
    if (props.sort !== col)
        return '';
    return props.direction === 'asc' ? ' ▲' : ' ▼';
}
function onRowClick(event, idx) {
    const row = props.rowAt(idx);
    if (!row)
        return;
    // Ctrl/Cmd-click → "open in new tab" semantics. Same modifier
    // convention as browser links and the MoveSuggestions PV-paste
    // affordance.
    if (isPasteClick(event)) {
        emit('open-new-tab', row);
        return;
    }
    emit('select', row);
}
function onRowDblclick(idx) {
    const row = props.rowAt(idx);
    if (row)
        emit('open', row);
}
function onRowMousedown(event, idx) {
    if (!isMiddleButtonMousedown(event))
        return;
    // Middle-click also gets "open in new tab" semantics. `mousedown`
    // (not `click` / `auxclick`) for cross-browser portability —
    // matches the MoveSuggestions middle-button pattern. The
    // `preventDefault()` suppresses the platform's middle-button
    // auto-scroll cursor on Win/Linux.
    event.preventDefault();
    const row = props.rowAt(idx);
    if (row)
        emit('open-new-tab', row);
}
// Native-title tooltip on each row — shows every column the
// rendered grid drops (Ruleset, Size) plus the truncated bits of
// the visible columns. Long player names that ellipsis off in the
// row stay readable on hover this way. Empty fields render as
// `—` to keep the layout legible.
function rowTitle(idx) {
    const r = props.rowAt(idx);
    if (!r)
        return '';
    return [
        `Black:  ${r.playerBlack ?? '—'}`,
        `White:  ${r.playerWhite ?? '—'}`,
        `Date:   ${r.date ?? '—'}`,
        `Result: ${r.result ?? '—'}`,
        `Rules:  ${r.ruleset ?? '—'}`,
        `Size:   ${r.boardSize ?? '—'}`,
    ].join('\n');
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
/** @type {__VLS_StyleScopedClasses['th']} */ ;
/** @type {__VLS_StyleScopedClasses['library-row']} */ ;
/** @type {__VLS_StyleScopedClasses['library-row']} */ ;
/** @type {__VLS_StyleScopedClasses['library-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-table" },
});
/** @type {__VLS_StyleScopedClasses['library-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-table-header" },
});
/** @type {__VLS_StyleScopedClasses['library-table-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.onHeaderClick('playerBlack');
            // @ts-ignore
            [onHeaderClick,];
        } },
    ...{ class: "th col-player" },
});
/** @type {__VLS_StyleScopedClasses['th']} */ ;
/** @type {__VLS_StyleScopedClasses['col-player']} */ ;
(__VLS_ctx.sortIndicator('playerBlack'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.onHeaderClick('playerWhite');
            // @ts-ignore
            [onHeaderClick, sortIndicator,];
        } },
    ...{ class: "th col-player" },
});
/** @type {__VLS_StyleScopedClasses['th']} */ ;
/** @type {__VLS_StyleScopedClasses['col-player']} */ ;
(__VLS_ctx.sortIndicator('playerWhite'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.onHeaderClick('date');
            // @ts-ignore
            [onHeaderClick, sortIndicator,];
        } },
    ...{ class: "th col-date" },
});
/** @type {__VLS_StyleScopedClasses['th']} */ ;
/** @type {__VLS_StyleScopedClasses['col-date']} */ ;
(__VLS_ctx.sortIndicator('date'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.onHeaderClick('result');
            // @ts-ignore
            [onHeaderClick, sortIndicator,];
        } },
    ...{ class: "th col-result" },
});
/** @type {__VLS_StyleScopedClasses['th']} */ ;
/** @type {__VLS_StyleScopedClasses['col-result']} */ ;
(__VLS_ctx.sortIndicator('result'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "scrollContainer",
    ...{ class: "library-table-scroll" },
});
/** @type {__VLS_StyleScopedClasses['library-table-scroll']} */ ;
if (__VLS_ctx.totalCount === null) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "library-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['library-empty']} */ ;
}
else if (__VLS_ctx.totalCount === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "library-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['library-empty']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "library-table-spacer" },
        ...{ style: ({ height: __VLS_ctx.v.totalHeightPx.value + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['library-table-spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "library-table-rows" },
        ...{ style: ({ transform: `translateY(${__VLS_ctx.v.topSpacerPx.value}px)` }) },
    });
    /** @type {__VLS_StyleScopedClasses['library-table-rows']} */ ;
    for (const [i] of __VLS_vFor((__VLS_ctx.visibleIndices))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: ((e) => __VLS_ctx.onRowClick(e, i)) },
            ...{ onDblclick: (...[$event]) => {
                    if (!!(__VLS_ctx.totalCount === null))
                        return;
                    if (!!(__VLS_ctx.totalCount === 0))
                        return;
                    __VLS_ctx.onRowDblclick(i);
                    // @ts-ignore
                    [sortIndicator, totalCount, totalCount, v, v, visibleIndices, onRowClick, onRowDblclick,];
                } },
            ...{ onMousedown: ((e) => __VLS_ctx.onRowMousedown(e, i)) },
            key: (i),
            ...{ class: "library-row" },
            ...{ class: ({
                    loading: __VLS_ctx.isRowLoading(i),
                    selected: __VLS_ctx.rowAt(i)?.id === __VLS_ctx.selectedId,
                }) },
            ...{ style: ({ height: __VLS_ctx.ROW_HEIGHT_PX + 'px' }) },
            title: (__VLS_ctx.rowTitle(i)),
        });
        /** @type {__VLS_StyleScopedClasses['library-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['loading']} */ ;
        /** @type {__VLS_StyleScopedClasses['selected']} */ ;
        if (__VLS_ctx.rowAt(i)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "td col-player" },
            });
            /** @type {__VLS_StyleScopedClasses['td']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-player']} */ ;
            (__VLS_ctx.rowAt(i)?.playerBlack ?? '—');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "td col-player" },
            });
            /** @type {__VLS_StyleScopedClasses['td']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-player']} */ ;
            (__VLS_ctx.rowAt(i)?.playerWhite ?? '—');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "td col-date" },
            });
            /** @type {__VLS_StyleScopedClasses['td']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-date']} */ ;
            (__VLS_ctx.rowAt(i)?.date ?? '—');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "td col-result" },
            });
            /** @type {__VLS_StyleScopedClasses['td']} */ ;
            /** @type {__VLS_StyleScopedClasses['col-result']} */ ;
            (__VLS_ctx.rowAt(i)?.result ?? '—');
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "td loading-cell" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['td']} */ ;
            /** @type {__VLS_StyleScopedClasses['loading-cell']} */ ;
        }
        // @ts-ignore
        [onRowMousedown, isRowLoading, rowAt, rowAt, rowAt, rowAt, rowAt, rowAt, selectedId, ROW_HEIGHT_PX, rowTitle,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
