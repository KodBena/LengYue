/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { store, setActiveBoard, createBoard, closeBoard } from '../../store';
import BoardTab from '../board/BoardTab.vue';
import MiniBoard from '../board/MiniBoard.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { useJankTest } from '../../composables/perf/useJankTest';
// Dev-only "jank test" affordance (below). import.meta.env.DEV is statically
// folded, so the button and its composable dead-code-eliminate from prod
// builds — the harness must never ship to users.
const isDevBuild = import.meta.env.DEV;
const jankTest = useJankTest();
const __VLS_emit = defineEmits();
const { getSnapshot, getSnapshotSync } = useThumbnailCache();
// ── Docked hover preview ────────────────────────────────────────────────────
// The board-tab hover preview is a DOCKED pane at the foot of the rail, not a
// cursor-following floating thumbnail. That redesign dissolves the two
// long-standing complaints about the old FloatingThumbnail at the root rather
// than guarding around them:
//
//   - "lingers forever": the floating thumbnail was shown via an async
//     `await getThumbnailSvg(...) → show()` while `hide()` ran synchronously on
//     mouseleave. A leave that raced the fetch — or, more often, a `mouseleave`
//     that was simply lost when the tab re-rendered under the pointer — left a
//     visible box with no pending hide, stranding it. Here the *visible state*
//     is `previewBoardId`, set and cleared synchronously; the rendered snapshot
//     is DERIVED from it (computed below). A late fetch only populates the
//     shared cache — it never writes the visible state — so it cannot resurrect
//     a cleared preview. Clearing the id empties the pane immediately and it
//     stays empty. No generation token, no imperative show/hide, no race to
//     guard.
//   - "moves around unpredictably": the pane is docked, so there is nothing to
//     reposition at the cursor.
//
// TreeWidget keeps the floating FloatingThumbnail for variation previews (it is
// contextual to the tree); that surface is hardened in FloatingThumbnail.vue
// itself rather than redesigned.
//
// We store the board *id*, not the BoardState object: `updateBoardState`
// replaces the object on navigation, so re-finding off the live store keeps the
// preview reading the board's current node.
const previewBoardId = ref(null);
const previewSnapshot = computed(() => {
    const id = previewBoardId.value;
    if (!id)
        return null;
    const board = store.boards.find(b => b.id === id);
    if (!board)
        return null;
    // Synchronous, reactive read of the shared snapshot cache. The cache Map is
    // reactive, so this re-evaluates when the warm in onHoverEnter populates the
    // entry; it returns null on a miss, so the first frame of an as-yet-uncached
    // hover is the empty placeholder, filled in once the warm resolves.
    return getSnapshotSync(board.currentNodeId);
});
function handleAdd() {
    createBoard();
}
function getReviewState(boardId) {
    const status = store.session.reviews[boardId]?.status;
    if (!status)
        return null;
    if (status === 'AWAITING_MOVE' || status === 'ANALYZING' || status === 'LOADING')
        return 'ACTIVE';
    if (status === 'FINISHED')
        return 'INTERMISSION';
    return null;
}
function onHoverEnter(board) {
    previewBoardId.value = board.id;
    // Fire-and-forget warm of the shared cache for that board's current node.
    // The reactive `previewSnapshot` picks the result up; we deliberately do NOT
    // assign the awaited value to any visible state — that async write-back is
    // exactly the race this redesign removes.
    void getSnapshot(board.currentNodeId, board.id);
}
function onHoverLeave() {
    previewBoardId.value = null;
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
/** @type {__VLS_StyleScopedClasses['jank-test-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "sidebar-widget",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "board-actions" },
});
/** @type {__VLS_StyleScopedClasses['board-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('load-sgf');
            // @ts-ignore
            [$emit,];
        } },
    ...{ class: "board-action-btn" },
});
/** @type {__VLS_StyleScopedClasses['board-action-btn']} */ ;
(__VLS_ctx.$t('sidebar.loadSgf'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('save-sgf');
            // @ts-ignore
            [$emit, $t,];
        } },
    ...{ class: "board-action-btn" },
});
/** @type {__VLS_StyleScopedClasses['board-action-btn']} */ ;
(__VLS_ctx.$t('sidebar.saveSgf'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "thumb-list" },
});
/** @type {__VLS_StyleScopedClasses['thumb-list']} */ ;
for (const [board, index] of __VLS_vFor((__VLS_ctx.store.boards))) {
    const __VLS_0 = BoardTab;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        ...{ 'onClose': {} },
        ...{ 'onHoverEnter': {} },
        ...{ 'onHoverLeave': {} },
        key: (board.id),
        state: (board),
        index: (index),
        isActive: (__VLS_ctx.store.activeBoardIndex === index),
        reviewState: (__VLS_ctx.getReviewState(board.id)),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        ...{ 'onClose': {} },
        ...{ 'onHoverEnter': {} },
        ...{ 'onHoverLeave': {} },
        key: (board.id),
        state: (board),
        index: (index),
        isActive: (__VLS_ctx.store.activeBoardIndex === index),
        reviewState: (__VLS_ctx.getReviewState(board.id)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        ...{ click: {} },
        onClick: (...[$event]) => {
            __VLS_ctx.setActiveBoard(index);
            // @ts-ignore
            [$t, store, store, getReviewState, setActiveBoard,];
        },
        ...{ close: {} },
        onClose: (...[$event]) => {
            __VLS_ctx.closeBoard(board.id);
            // @ts-ignore
            [closeBoard,];
        },
        ...{ hoverEnter: {} },
        onHoverEnter: (...[$event]) => {
            __VLS_ctx.onHoverEnter(board);
            // @ts-ignore
            [onHoverEnter,];
        },
        ...{ hoverLeave: {} },
        onHoverLeave: (__VLS_ctx.onHoverLeave),
    };
    __VLS_asFunctionalDirective(__VLS_directives.vMemo, {})(null, { ...__VLS_directiveBindingRestFields, value: ([board, index, __VLS_ctx.store.activeBoardIndex === index, __VLS_ctx.getReviewState(board.id)]) }, null, null);
    var __VLS_3;
    var __VLS_4;
    // @ts-ignore
    [store, getReviewState, onHoverLeave,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleAdd) },
    ...{ class: "tab-add-btn" },
    title: (__VLS_ctx.$t('sidebar.newBoard')),
});
/** @type {__VLS_StyleScopedClasses['tab-add-btn']} */ ;
if (__VLS_ctx.isDevBuild) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isDevBuild))
                    return;
                __VLS_ctx.jankTest.toggle();
                // @ts-ignore
                [$t, handleAdd, isDevBuild, jankTest,];
            } },
        ...{ class: "jank-test-btn" },
        ...{ class: ({ running: __VLS_ctx.jankTest.isRunning.value }) },
        title: ('Dev: stress the thumbnail-preview render (loads 16 boards, auto-navs the long Shusaku game, scrubs the hover preview). Click again to stop.'),
    });
    /** @type {__VLS_StyleScopedClasses['jank-test-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['running']} */ ;
    (__VLS_ctx.jankTest.isRunning.value ? 'jank test (stop)' : 'jank test');
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "board-preview" },
});
/** @type {__VLS_StyleScopedClasses['board-preview']} */ ;
if (__VLS_ctx.previewSnapshot) {
    const __VLS_7 = MiniBoard;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        snapshot: (__VLS_ctx.previewSnapshot),
    }));
    const __VLS_9 = __VLS_8({
        snapshot: (__VLS_ctx.previewSnapshot),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
// @ts-ignore
[jankTest, jankTest, previewSnapshot, previewSnapshot,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
