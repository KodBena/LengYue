/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/library/LibraryTab.vue
 *
 * The Library tab's surface. Holds the four composable instances
 * (useLibraryQuery, useLibraryPlayerSuggest, useLibraryPreview,
 * useLibraryImport) and arranges them into a master-detail
 * layout with the import panel above.
 *
 * The dirty-board guard (the modal + actionOnDirtyBoard
 * preference) is held by App.vue per the existing pattern; this
 * tab emits `open-library-game` up to App.vue when the preview's
 * "Open in board" button is clicked. App.vue's handler calls
 * `useDirtyBoardGuard.handleLoadLibraryGame`.
 *
 * License: Public Domain (The Unlicense)
 */
import { onMounted } from 'vue';
import LibraryImportPanel from './LibraryImportPanel.vue';
import LibraryPlayerFilter from './LibraryPlayerFilter.vue';
import LibraryPreviewPane from './LibraryPreviewPane.vue';
import LibraryTable from './LibraryTable.vue';
import { useLibraryImport } from '../../composables/library/useLibraryImport';
import { useLibraryPlayerSuggest } from '../../composables/library/useLibraryPlayerSuggest';
import { useLibraryPreview } from '../../composables/library/useLibraryPreview';
import { useLibraryQuery } from '../../composables/library/useLibraryQuery';
const emit = defineEmits();
const query = useLibraryQuery();
const suggest = useLibraryPlayerSuggest();
const preview = useLibraryPreview();
// onImportComplete fires the two refreshes the SPA needs to
// reflect a just-completed import: new rows in the table, new
// names in the autocomplete cache.
const importer = useLibraryImport(() => {
    void query.refresh();
    void suggest.refresh();
});
onMounted(() => {
    void query.refresh();
    void suggest.refresh();
});
function onSelect(row) {
    preview.selectedRow.value = row;
}
// Double-click on a row: select for preview AND open on the board.
// The preview composable will fetch the full LibraryGame via its
// watcher on selectedRow; we also fetch here directly so the
// open-emit has a concrete game in hand without racing the watcher.
// Two GET requests for the same id is a benign duplicate at hobby
// scale; the alternative (await-the-watcher) requires plumbing a
// resolution signal back out of useLibraryPreview, and the existing
// "Open in board" button uses the watcher's selectedGame anyway —
// the double-click and the button stay alignable that way.
async function onOpen(row) {
    preview.selectedRow.value = row;
    const game = await preview.fetchGame(row.id);
    if (game !== null)
        emit('open-library-game', game);
}
function onOpenFromPreview() {
    const game = preview.selectedGame.value;
    if (game !== null)
        emit('open-library-game', game);
}
// "Open in new tab" path from LibraryTable's middle-click /
// Ctrl-click. Don't touch the preview selection — the new-tab
// affordance is "open without disturbing the active context".
async function onOpenNewTab(row) {
    const game = await preview.fetchGame(row.id);
    if (game !== null)
        emit('open-library-game-new-tab', game);
}
// Click a player chip in the "All players" accordion → fill the
// any-color Player filter with that name and clear the per-color
// filters. "Show me X's games" is the natural intent, regardless
// of which color X played; the per-color inputs above remain for
// the explicit "X as White" / "X as Black" cases the user can
// reach by typing into them directly. Clearing prevents the chip
// click from silently composing with leftover per-color filters
// in ways the user doesn't expect. The disclosure stays open —
// the user folds it manually per their stated workflow.
function onPlayerChipClick(name) {
    query.filter.playerLike = name;
    query.filter.playerWhiteLike = null;
    query.filter.playerBlackLike = null;
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
/** @type {__VLS_StyleScopedClasses['library-players-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['library-players-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['library-players']} */ ;
/** @type {__VLS_StyleScopedClasses['library-players-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['library-player-row']} */ ;
/** @type {__VLS_StyleScopedClasses['library-player-row']} */ ;
/** @type {__VLS_StyleScopedClasses['library-player-count']} */ ;
/** @type {__VLS_StyleScopedClasses['library-split']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-tab" },
});
/** @type {__VLS_StyleScopedClasses['library-tab']} */ ;
const __VLS_0 = LibraryImportPanel;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    imp: (__VLS_ctx.importer),
    ...{ class: "library-import-zone" },
}));
const __VLS_2 = __VLS_1({
    imp: (__VLS_ctx.importer),
    ...{ class: "library-import-zone" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['library-import-zone']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-filters" },
});
/** @type {__VLS_StyleScopedClasses['library-filters']} */ ;
const __VLS_5 = LibraryPlayerFilter;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerLike),
    label: "Player (any color)",
    placeholder: "e.g. Cho",
    suggest: (__VLS_ctx.suggest.suggest),
}));
const __VLS_7 = __VLS_6({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerLike),
    label: "Player (any color)",
    placeholder: "e.g. Cho",
    suggest: (__VLS_ctx.suggest.suggest),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_10;
const __VLS_11 = {
    ...{ 'update:modelValue': {} },
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.query.filter.playerLike = $event;
        // @ts-ignore
        [importer, query, query, suggest,];
    },
};
var __VLS_8;
var __VLS_9;
const __VLS_12 = LibraryPlayerFilter;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerWhiteLike),
    label: "White",
    placeholder: "e.g. Cho",
    suggest: (__VLS_ctx.suggest.suggest),
}));
const __VLS_14 = __VLS_13({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerWhiteLike),
    label: "White",
    placeholder: "e.g. Cho",
    suggest: (__VLS_ctx.suggest.suggest),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_17;
const __VLS_18 = {
    ...{ 'update:modelValue': {} },
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.query.filter.playerWhiteLike = $event;
        // @ts-ignore
        [query, query, suggest,];
    },
};
var __VLS_15;
var __VLS_16;
const __VLS_19 = LibraryPlayerFilter;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerBlackLike),
    label: "Black",
    placeholder: "e.g. Lee",
    suggest: (__VLS_ctx.suggest.suggest),
}));
const __VLS_21 = __VLS_20({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.query.filter.playerBlackLike),
    label: "Black",
    placeholder: "e.g. Lee",
    suggest: (__VLS_ctx.suggest.suggest),
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_24;
const __VLS_25 = {
    ...{ 'update:modelValue': {} },
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.query.filter.playerBlackLike = $event;
        // @ts-ignore
        [query, query, suggest,];
    },
};
var __VLS_22;
var __VLS_23;
__VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
    ...{ class: "library-players" },
});
/** @type {__VLS_StyleScopedClasses['library-players']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({
    ...{ class: "library-players-summary" },
});
/** @type {__VLS_StyleScopedClasses['library-players-summary']} */ ;
(__VLS_ctx.suggest.players.value?.length ?? 0);
if (__VLS_ctx.suggest.players.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "library-players-list" },
    });
    /** @type {__VLS_StyleScopedClasses['library-players-list']} */ ;
    for (const [p] of __VLS_vFor((__VLS_ctx.suggest.players.value))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.suggest.players.value))
                        return;
                    __VLS_ctx.onPlayerChipClick(p.name);
                    // @ts-ignore
                    [suggest, suggest, suggest, onPlayerChipClick,];
                } },
            key: (p.name),
            ...{ class: "library-player-row" },
        });
        /** @type {__VLS_StyleScopedClasses['library-player-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "library-player-name" },
        });
        /** @type {__VLS_StyleScopedClasses['library-player-name']} */ ;
        (p.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "library-player-count" },
        });
        /** @type {__VLS_StyleScopedClasses['library-player-count']} */ ;
        (p.count);
        // @ts-ignore
        [];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-split" },
});
/** @type {__VLS_StyleScopedClasses['library-split']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-split-list" },
});
/** @type {__VLS_StyleScopedClasses['library-split-list']} */ ;
const __VLS_26 = LibraryTable;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
    ...{ 'onUpdate:sort': {} },
    ...{ 'onUpdate:direction': {} },
    ...{ 'onSelect': {} },
    ...{ 'onOpen': {} },
    ...{ 'onOpenNewTab': {} },
    ...{ 'onVisibleRange': {} },
    totalCount: (__VLS_ctx.query.totalCount.value),
    rowAt: (__VLS_ctx.query.rowAt),
    isRowLoading: (__VLS_ctx.query.isRowLoading),
    sort: (__VLS_ctx.query.sort.value),
    direction: (__VLS_ctx.query.direction.value),
    selectedId: (__VLS_ctx.preview.selectedRow.value?.id ?? null),
}));
const __VLS_28 = __VLS_27({
    ...{ 'onUpdate:sort': {} },
    ...{ 'onUpdate:direction': {} },
    ...{ 'onSelect': {} },
    ...{ 'onOpen': {} },
    ...{ 'onOpenNewTab': {} },
    ...{ 'onVisibleRange': {} },
    totalCount: (__VLS_ctx.query.totalCount.value),
    rowAt: (__VLS_ctx.query.rowAt),
    isRowLoading: (__VLS_ctx.query.isRowLoading),
    sort: (__VLS_ctx.query.sort.value),
    direction: (__VLS_ctx.query.direction.value),
    selectedId: (__VLS_ctx.preview.selectedRow.value?.id ?? null),
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
let __VLS_31;
const __VLS_32 = {
    ...{ 'update:sort': {} },
    'onUpdate:sort': (...[$event]) => {
        __VLS_ctx.query.sort.value = $event;
        // @ts-ignore
        [query, query, query, query, query, query, preview,];
    },
    ...{ 'update:direction': {} },
    'onUpdate:direction': (...[$event]) => {
        __VLS_ctx.query.direction.value = $event;
        // @ts-ignore
        [query,];
    },
    ...{ select: {} },
    onSelect: (__VLS_ctx.onSelect),
    ...{ open: {} },
    onOpen: (__VLS_ctx.onOpen),
    ...{ openNewTab: {} },
    onOpenNewTab: (__VLS_ctx.onOpenNewTab),
    ...{ visibleRange: {} },
    onVisibleRange: ((s, e) => __VLS_ctx.query.ensureRange(s, e)),
};
var __VLS_29;
var __VLS_30;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-split-preview" },
});
/** @type {__VLS_StyleScopedClasses['library-split-preview']} */ ;
const __VLS_33 = LibraryPreviewPane;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
    ...{ 'onOpenGame': {} },
    preview: (__VLS_ctx.preview),
}));
const __VLS_35 = __VLS_34({
    ...{ 'onOpenGame': {} },
    preview: (__VLS_ctx.preview),
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
let __VLS_38;
const __VLS_39 = {
    ...{ openGame: {} },
    onOpenGame: (__VLS_ctx.onOpenFromPreview),
};
var __VLS_36;
var __VLS_37;
// @ts-ignore
[query, preview, onSelect, onOpen, onOpenNewTab, onOpenFromPreview,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
