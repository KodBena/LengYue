/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseChart from './charts/BaseChart.vue';
import CardMetadataPanel from './CardMetadataPanel.vue';
import { useReviewSession } from '../composables/review/useReviewSession';
import { useCardMetadata } from '../composables/cards/useCardMetadata';
import { activeBoard, mutateBoard, mutateReviewSession, store, pushSystemMessage } from '../store';
import { getActiveVariationPath } from '../engine/util';
import { navigateTo } from '../engine/navigator';
import { themeColor } from '../utils/theme-color';
const { t } = useI18n();
const cardMetadata = useCardMetadata();
// The composable is per-board: it projects the active board's
// `store.session.reviews[boardId]` slot. ForestDirectory composes
// the projection over `activeBoard`'s id so a tab switch swaps the
// session content. ReviewSessionPanel reads through the same
// projection — instantiating the composable here independently is
// safe because the per-board state lives in the store
// (`store.session.reviews`) and the per-board ephemeral aborts map
// is module-scope (`pendingAnalysisAborts` in useReviewSession);
// two composable instances against the same board work against the
// same underlying state.
const activeBoardId = computed(() => activeBoard.value?.id);
const reviewSession = useReviewSession(activeBoardId);
// Intermission chart series — only meaningful in FINISHED state.
// Lifted from the prior App.vue inline binding without behaviour
// change.
const intermissionSeries = computed(() => {
    if (reviewSession.state.value !== 'FINISHED')
        return [];
    const accentSecondary = themeColor('--accent-secondary');
    const data = reviewSession.userMoveScores.value.map((score, index) => {
        return { value: [index + 1, score], itemStyle: { color: accentSecondary } };
    });
    return [{ name: t('review.session.moveScoreDelta'), data, color: accentSecondary, showPoints: true }];
});
// State-name lookup so the status line displays a translated label
// rather than the raw machine-state enum. The keys mirror the
// `ReviewState` discriminator in `useReviewSession` (LOADING /
// AWAITING_USER / ANALYZING / EVALUATING / FINISHED). When the
// state machine adds a new variant, add a key here in the same
// pass — the template's `t(stateLabelKey(...))` will fall through
// to the raw enum if the key is missing (vue-i18n missingWarn fires
// loudly under ADR-0002).
function stateLabelKey(state) {
    return `review.session.state.${state}`;
}
function handleVisitsOverrideChange(e) {
    // Thin DOM-string-to-number adapter; validation lives in
    // setVisitsOverride itself.
    const raw = e.target.value;
    const n = Number(raw);
    reviewSession.setVisitsOverride(n);
}
/**
 * Click on the intermission chart → navigate the board to the
 * position the user faced when making the k-th move (1-indexed
 * along the chart's x-axis). Same "navigate to position BEFORE
 * the move" semantics as `useChartNavigation::handlePlayerClick`
 * for the per-player delta charts on the analysis tab.
 *
 * Sequencing: in a review session, each user move is followed by
 * the engine's best-move response (`processUserMove` calls
 * `applyGoMove` for both, in sequence). The active variation
 * path therefore advances 2 plies per user move from
 * `startingNodeId`. Position before user move k = path index
 * `startIdx + 2(k-1)`.
 *
 * Reads `store.session.reviews[bId].startingNodeId` directly
 * rather than threading the value through the composable's
 * return — same cheap-projection pattern ForestDirectory uses.
 *
 * No-op when the path doesn't include `startingNodeId` (defensive
 * guard for the unlikely case of a navigation that severs the
 * post-rewind active variation), or when the target index is
 * out of bounds.
 */
function handleIntermissionClick(idx) {
    const bId = activeBoardId.value;
    if (!bId)
        return;
    const review = store.session.reviews[bId];
    if (!review || !review.startingNodeId)
        return;
    const board = activeBoard.value;
    if (!board)
        return;
    const path = getActiveVariationPath(board);
    const startIdx = path.indexOf(review.startingNodeId);
    if (startIdx < 0)
        return;
    const targetIdx = startIdx + 2 * (idx - 1);
    if (targetIdx < 0 || targetIdx >= path.length)
        return;
    const targetNodeId = path[targetIdx];
    mutateBoard(bId, draft => navigateTo(draft, targetNodeId));
}
// Card-metadata inline-edit arc 2 plumbing. The panel emits a
// `CardMetadataPatch` per field-level save; this handler runs
// the ACL round-trip, splices the returned `ReviewCard` back
// into the queue (so the panel re-reads the updated card on
// the next render cycle), and surfaces validation / network
// errors as system messages per ADR-0002. `cardMetadataSaving`
// disables the panel for the duration of the round-trip so
// concurrent edits can't pile up against the same card.
const cardMetadataSaving = ref(false);
async function handleCardMetadataPatch(patch) {
    const bId = activeBoardId.value;
    if (!bId)
        return;
    const card = reviewSession.currentCard.value;
    if (!card)
        return;
    cardMetadataSaving.value = true;
    try {
        const updated = await cardMetadata.updateMetadata(card.id, patch);
        // Splice the updated card into the queue at the same index.
        // `mutateReviewSession` is the named-mutator path the rest of
        // the SR composable already uses; assigning a fresh array
        // keeps Vue's reactive tracking honest.
        mutateReviewSession(bId, draft => {
            const idx = draft.queue.findIndex((c) => c.id === card.id);
            if (idx >= 0) {
                const next = [...draft.queue];
                next[idx] = updated;
                draft.queue = next;
            }
        });
    }
    catch (err) {
        pushSystemMessage('error', t('cardMetadata.saveFailed', {
            detail: err instanceof Error ? err.message : String(err),
        }));
    }
    finally {
        cardMetadataSaving.value = false;
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['review-session-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['visits-override-row']} */ ;
/** @type {__VLS_StyleScopedClasses['end-session-btn']} */ ;
if (__VLS_ctx.reviewSession.currentCard.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "review-session-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['review-session-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.reviewSession.state.value === 'FINISHED' ? __VLS_ctx.$t('review.session.intermission') : __VLS_ctx.$t('review.session.active'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint text-muted card-counter" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-counter']} */ ;
    (__VLS_ctx.$t('review.session.cardOf', {
        n: __VLS_ctx.reviewSession.queue.value.indexOf(__VLS_ctx.reviewSession.currentCard.value) + 1,
        total: __VLS_ctx.reviewSession.queue.value.length,
    }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "status-line" },
        ...{ style: ({ color: __VLS_ctx.reviewSession.state.value === 'FINISHED' ? 'var(--accent-secondary)' : 'var(--state-attention)' }) },
    });
    /** @type {__VLS_StyleScopedClasses['status-line']} */ ;
    (__VLS_ctx.$t('review.session.statusLine', { state: __VLS_ctx.$t(__VLS_ctx.stateLabelKey(__VLS_ctx.reviewSession.state.value)) }));
    if (__VLS_ctx.reviewSession.state.value === 'ANALYZING') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('review.session.ponderHint'));
    }
    if (__VLS_ctx.reviewSession.state.value === 'FINISHED') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "intermission-chart" },
        });
        /** @type {__VLS_StyleScopedClasses['intermission-chart']} */ ;
        const __VLS_0 = BaseChart;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onIndexClick': {} },
            series: (__VLS_ctx.intermissionSeries),
            zoomRange: ([1, __VLS_ctx.reviewSession.currentCard.value.numMoves]),
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onIndexClick': {} },
            series: (__VLS_ctx.intermissionSeries),
            zoomRange: ([1, __VLS_ctx.reviewSession.currentCard.value.numMoves]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            ...{ indexClick: {} },
            onIndexClick: (__VLS_ctx.handleIntermissionClick),
        };
        var __VLS_3;
        var __VLS_4;
    }
    if (__VLS_ctx.reviewSession.state.value !== 'FINISHED') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint text-muted moves-made" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['moves-made']} */ ;
        (__VLS_ctx.$t('review.session.movesMade', {
            n: __VLS_ctx.reviewSession.userMovesCount.value,
            total: __VLS_ctx.reviewSession.currentCard.value.numMoves,
        }));
    }
    if (__VLS_ctx.reviewSession.state.value !== 'FINISHED') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "visits-override-row" },
        });
        /** @type {__VLS_StyleScopedClasses['visits-override-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('review.session.maxVisitsLabel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (__VLS_ctx.handleVisitsOverrideChange) },
            type: "number",
            min: "1",
            step: "50",
            value: (__VLS_ctx.reviewSession.effectiveVisits.value),
            ...{ class: "dark-input visits-input" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['visits-input']} */ ;
    }
    const __VLS_7 = CardMetadataPanel;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        ...{ 'onPatch': {} },
        card: (__VLS_ctx.reviewSession.currentCard.value),
        disabled: (__VLS_ctx.cardMetadataSaving),
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onPatch': {} },
        card: (__VLS_ctx.reviewSession.currentCard.value),
        disabled: (__VLS_ctx.cardMetadataSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_12;
    const __VLS_13 = {
        ...{ patch: {} },
        onPatch: (__VLS_ctx.handleCardMetadataPatch),
    };
    var __VLS_10;
    var __VLS_11;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reviewSession.nextCard) },
        ...{ class: "action-btn-large advance-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['action-btn-large']} */ ;
    /** @type {__VLS_StyleScopedClasses['advance-btn']} */ ;
    (__VLS_ctx.reviewSession.state.value === 'FINISHED' ? __VLS_ctx.$t('review.session.nextCard') : __VLS_ctx.$t('review.session.skipCard'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reviewSession.rewindToStart) },
        ...{ class: "toolbar-btn-sm" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
    (__VLS_ctx.$t('review.session.rewindToStart'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reviewSession.endSession) },
        ...{ class: "toolbar-btn-sm end-session-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
    /** @type {__VLS_StyleScopedClasses['end-session-btn']} */ ;
    (__VLS_ctx.$t('review.session.endSession'));
}
// @ts-ignore
[reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, reviewSession, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, stateLabelKey, intermissionSeries, handleIntermissionClick, handleVisitsOverrideChange, cardMetadataSaving, handleCardMetadataPatch,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
