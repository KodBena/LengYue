/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/library/LibraryPreviewPane.vue
 *
 * The Library tab's right-hand pane: mini-board rendered from the
 * preview composable's parsed board + scrub slider + metadata
 * readout + action buttons (Open in board, Delete from library).
 *
 * The mini-board reuses the existing `renderBoardToSvg` engine
 * helper that the card-tree thumbnails use, so the visual style
 * is consistent across surfaces.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { renderBoardToSvg } from '../../engine/board-renderer';
import { getBoardSize } from '../../engine/util';
const props = defineProps();
const emit = defineEmits();
const previewSvg = computed(() => {
    const board = props.preview.parsedBoard.value;
    if (!board)
        return '';
    const currentNode = board.nodes[board.currentNodeId];
    const size = getBoardSize(board);
    return renderBoardToSvg({
        size,
        stones: board.stones,
        lastMove: currentNode?.move ?? null,
        showMarker: true,
        uid: `library-preview-${props.preview.selectedRow.value?.id ?? 'none'}`,
    });
});
const hasSelection = computed(() => props.preview.selectedRow.value !== null);
const hasGame = computed(() => props.preview.selectedGame.value !== null);
// Slider's max — scrubPosition's domain is [0, totalMoves].
const scrubMax = computed(() => props.preview.totalMoves.value);
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
/** @type {__VLS_StyleScopedClasses['preview-board']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "library-preview" },
});
/** @type {__VLS_StyleScopedClasses['library-preview']} */ ;
if (!__VLS_ctx.hasSelection) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-empty']} */ ;
}
else if (__VLS_ctx.preview.loading.value && !__VLS_ctx.hasGame) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-empty']} */ ;
}
else if (__VLS_ctx.hasGame) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "meta-players" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-players']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-player-white" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-player-white']} */ ;
    (__VLS_ctx.preview.selectedGame.value?.playerWhite ?? '—');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-vs" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-vs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-player-black" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-player-black']} */ ;
    (__VLS_ctx.preview.selectedGame.value?.playerBlack ?? '—');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "meta-details" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-details']} */ ;
    if (__VLS_ctx.preview.selectedGame.value?.date) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.preview.selectedGame.value.date);
    }
    if (__VLS_ctx.preview.selectedGame.value?.result) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.preview.selectedGame.value.result);
    }
    if (__VLS_ctx.preview.selectedGame.value?.ruleset) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.preview.selectedGame.value.ruleset);
    }
    if (__VLS_ctx.preview.selectedGame.value?.boardSize) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.preview.selectedGame.value.boardSize);
        (__VLS_ctx.preview.selectedGame.value.boardSize);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-board" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.previewSvg) }, null, null);
    /** @type {__VLS_StyleScopedClasses['preview-board']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-scrub" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-scrub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "range",
        min: (0),
        max: (__VLS_ctx.scrubMax),
        ...{ class: "scrub-slider" },
        disabled: (__VLS_ctx.scrubMax === 0),
    });
    (__VLS_ctx.preview.scrubPosition.value);
    /** @type {__VLS_StyleScopedClasses['scrub-slider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "scrub-position" },
    });
    /** @type {__VLS_StyleScopedClasses['scrub-position']} */ ;
    (__VLS_ctx.preview.scrubPosition.value);
    (__VLS_ctx.scrubMax);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preview-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.hasSelection))
                    return;
                if (!!(__VLS_ctx.preview.loading.value && !__VLS_ctx.hasGame))
                    return;
                if (!(__VLS_ctx.hasGame))
                    return;
                __VLS_ctx.emit('open-game');
                // @ts-ignore
                [hasSelection, preview, preview, preview, preview, preview, preview, preview, preview, preview, preview, preview, preview, preview, preview, hasGame, hasGame, previewSvg, scrubMax, scrubMax, scrubMax, emit,];
            } },
        ...{ class: "preview-btn primary" },
    });
    /** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
