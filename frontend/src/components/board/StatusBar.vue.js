/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import UserBadge from '../chrome/UserBadge.vue';
import { useTransientHint } from '../../composables/useTransientHint';
import { store } from '../../store';
const props = defineProps();
const emit = defineEmits();
const { hint } = useTransientHint();
const turn = computed(() => props.board.turn);
const captures = computed(() => props.board.captures);
// Move number = count of 'place' moves from root to the current node.
// Moved verbatim from App.vue's template-consumed computed (Arc 2).
const moveNumber = computed(() => {
    let count = 0;
    let currId = props.board.currentNodeId;
    while (currId) {
        const node = props.board.nodes[currId];
        if (node?.move?.type === 'place')
            count++;
        currId = node?.parent ?? null;
    }
    return count;
});
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
/** @type {__VLS_StyleScopedClasses['stone-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
/** @type {__VLS_StyleScopedClasses['move-numbers-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['move-numbers-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "status-bar" },
});
/** @type {__VLS_StyleScopedClasses['status-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "status-left" },
});
/** @type {__VLS_StyleScopedClasses['status-left']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "move-badge" },
});
/** @type {__VLS_StyleScopedClasses['move-badge']} */ ;
(__VLS_ctx.$t('statusBar.move', { n: __VLS_ctx.moveNumber }));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "player-names" },
});
/** @type {__VLS_StyleScopedClasses['player-names']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stone-chip stone-chip--black" },
    ...{ class: ({ active: __VLS_ctx.turn === 'B' }) },
    'aria-label': (__VLS_ctx.turn === 'B' ? __VLS_ctx.$t('statusBar.blackToPlay') : undefined),
});
/** @type {__VLS_StyleScopedClasses['stone-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['stone-chip--black']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
(__VLS_ctx.metadata?.blackName);
(__VLS_ctx.$t('statusBar.versus'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "stone-chip stone-chip--white" },
    ...{ class: ({ active: __VLS_ctx.turn === 'W' }) },
    'aria-label': (__VLS_ctx.turn === 'W' ? __VLS_ctx.$t('statusBar.whiteToPlay') : undefined),
});
/** @type {__VLS_StyleScopedClasses['stone-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['stone-chip--white']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
(__VLS_ctx.metadata?.whiteName);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "game-info" },
});
/** @type {__VLS_StyleScopedClasses['game-info']} */ ;
(__VLS_ctx.metadata?.rules);
(__VLS_ctx.$t('statusBar.komi'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: ((e) => __VLS_ctx.emit('update-komi', parseFloat(e.target /* bound on the komi <input> */.value))) },
    type: "number",
    ...{ class: "komi-input" },
    value: (__VLS_ctx.metadata?.komi),
    step: "0.5",
    title: (__VLS_ctx.$t('statusBar.editKomi')),
});
/** @type {__VLS_StyleScopedClasses['komi-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "status-right" },
});
/** @type {__VLS_StyleScopedClasses['status-right']} */ ;
if (__VLS_ctx.hint) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "transient-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['transient-hint']} */ ;
    (__VLS_ctx.hint);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.store.session.ui.showStoneMoveNumbers = !__VLS_ctx.store.session.ui.showStoneMoveNumbers;
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, moveNumber, turn, turn, turn, turn, metadata, metadata, metadata, metadata, emit, hint, hint, store, store,];
        } },
    ...{ class: "move-numbers-btn" },
    ...{ class: ({ active: __VLS_ctx.store.session.ui.showStoneMoveNumbers }) },
    title: (__VLS_ctx.$t('statusBar.toggleMoveNumbers')),
});
/** @type {__VLS_StyleScopedClasses['move-numbers-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "caps" },
});
/** @type {__VLS_StyleScopedClasses['caps']} */ ;
(__VLS_ctx.captures.B);
(__VLS_ctx.captures.W);
const __VLS_0 = UserBadge;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
// @ts-ignore
[$t, store, captures, captures,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
