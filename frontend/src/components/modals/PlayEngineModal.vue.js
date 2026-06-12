/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, activeBoard } from '../../store';
const { t } = useI18n();
const isOpen = ref(false);
const userColor = ref('B');
const engineModel = ref(undefined);
const engineVisits = ref(500);
// SELECTOR-mode dropdown gate — identical to EngineMatchModal.
// In LEAF / non-SELECTOR mode the engine is whichever singleton
// the user is connected to; no per-game model choice to surface.
const isSelectorMode = computed(() => {
    const caps = store.engine.info.capabilities;
    return caps !== null && 'selector' in caps;
});
const availableModels = computed(() => store.engine.info.availableModels);
const singleEngineLabel = computed(() => store.engine.info.internalName ?? availableModels.value[0]?.label ?? '—');
// Move number for a given node — walks parents counting `place`
// moves. Used to label active-game entries ("Move N — you play
// …"). Local helper rather than a util import because no other
// caller needs it yet; promote if a second consumer surfaces.
function getMoveNumber(board, nodeId) {
    let count = 0;
    let cur = nodeId;
    while (cur !== null) {
        // Explicit annotation breaks TS7022 circular inference (same
        // shape as App.vue's `moveNumber` computed, post-ADR-0001 the
        // readonly hint that previously broke the cycle is gone).
        const node = board.nodes[cur];
        if (node?.move?.type === 'place')
            count++;
        cur = node?.parent ?? null;
    }
    return count;
}
// Active games on the current board, sorted by start move number
// for stable display. Re-evaluates reactively as `activeBoard.games`
// changes (the store's reactive proxy + `Object.entries` walk).
// Each row shows the START position (the session's stable identity)
// and the CURRENT HEAD position (the single green ring's location;
// moves forward as the game progresses).
const activeGames = computed(() => {
    const board = activeBoard.value;
    if (!board)
        return [];
    return Object.entries(board.games)
        .map(([startNodeId, session]) => ({
        startNodeId: startNodeId, // re-brand: board.games is keyed by NodeId; Object.entries widens to string
        config: session.config,
        startMoveNumber: getMoveNumber(board, startNodeId), // same NodeId re-brand of the games-map key
        headMoveNumber: getMoveNumber(board, session.currentHeadNodeId),
    }))
        .sort((a, b) => a.startMoveNumber - b.startMoveNumber);
});
const emit = defineEmits();
const __VLS_exposed = {
    open() {
        // Prefill model from the user's current SELECTOR selection;
        // visits keeps its last-used value so back-to-back game
        // starts don't re-prompt for the same number.
        const current = store.engine.selectedModel ?? availableModels.value[0]?.label;
        engineModel.value = current ?? undefined;
        isOpen.value = true;
    },
};
defineExpose(__VLS_exposed);
function close() {
    isOpen.value = false;
}
function submit() {
    emit('start-game', {
        userColor: userColor.value,
        engineMaxVisits: engineVisits.value,
        engineModel: isSelectorMode.value ? (engineModel.value ?? null) : null,
    });
    close();
}
function endGame(nodeId) {
    emit('end-game', nodeId);
}
const canSubmit = computed(() => {
    if (engineVisits.value < 1)
        return false;
    if (isSelectorMode.value && !engineModel.value)
        return false;
    return true;
});
function colorLabel(c) {
    return c === 'B'
        ? t('playEngine.userColorBlack')
        : t('playEngine.userColorWhite');
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
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['end-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
if (__VLS_ctx.isOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.close) },
        ...{ class: "modal-backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-content" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.t('playEngine.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.t('playEngine.subtitle'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
    (__VLS_ctx.t('playEngine.activeGamesHeading'));
    if (__VLS_ctx.activeGames.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
        (__VLS_ctx.t('playEngine.activeGamesEmpty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "active-games-list" },
        });
        /** @type {__VLS_StyleScopedClasses['active-games-list']} */ ;
        for (const [g] of __VLS_vFor((__VLS_ctx.activeGames))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (g.startNodeId),
                ...{ class: "active-game-row" },
            });
            /** @type {__VLS_StyleScopedClasses['active-game-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "active-game-label" },
            });
            /** @type {__VLS_StyleScopedClasses['active-game-label']} */ ;
            (__VLS_ctx.t('playEngine.activeGameLabel', {
                start: g.startMoveNumber,
                head: g.headMoveNumber,
                color: __VLS_ctx.colorLabel(g.config.userColor),
                visits: g.config.engineMaxVisits,
            }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isOpen))
                            return;
                        if (!!(__VLS_ctx.activeGames.length === 0))
                            return;
                        __VLS_ctx.endGame(g.startNodeId);
                        // @ts-ignore
                        [isOpen, close, close, t, t, t, t, t, activeGames, activeGames, colorLabel, endGame,];
                    } },
                ...{ class: "end-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['end-btn']} */ ;
            (__VLS_ctx.t('playEngine.activeGameEndBtn'));
            // @ts-ignore
            [t,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
    (__VLS_ctx.t('playEngine.startHeading'));
    if (!__VLS_ctx.isSelectorMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "single-engine-note" },
        });
        /** @type {__VLS_StyleScopedClasses['single-engine-note']} */ ;
        (__VLS_ctx.t('playEngine.singleEngineNote', { label: __VLS_ctx.singleEngineLabel }));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.t('playEngine.field.userColor'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_ctx.userColor),
        ...{ class: "dark-select" },
    });
    /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "B",
    });
    (__VLS_ctx.t('playEngine.userColorBlack'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "W",
    });
    (__VLS_ctx.t('playEngine.userColorWhite'));
    if (__VLS_ctx.isSelectorMode) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.t('playEngine.field.engineModel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.engineModel),
            ...{ class: "dark-select" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        for (const [m] of __VLS_vFor((__VLS_ctx.availableModels))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (m.label),
                value: (m.label),
            });
            (m.label);
            // @ts-ignore
            [t, t, t, t, t, t, isSelectorMode, isSelectorMode, singleEngineLabel, userColor, engineModel, availableModels,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.t('playEngine.field.engineVisits'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        step: "100",
        ...{ class: "dark-input" },
    });
    (__VLS_ctx.engineVisits);
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "btn-cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    (__VLS_ctx.t('playEngine.button.cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "btn-submit" },
        disabled: (!__VLS_ctx.canSubmit),
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.t('playEngine.button.start'));
}
// @ts-ignore
[close, t, t, t, engineVisits, submit, canSubmit,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
});
export default {};
