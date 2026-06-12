/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, activeBoard, pushSystemMessage } from '../../store';
import { useCardTreeData } from '../../composables/cards/useCardTreeData';
import { useCardMetadata } from '../../composables/cards/useCardMetadata';
import { useForestNavigation } from '../../composables/forest/useForestNavigation';
import { useForestBrowsePolicy } from '../../composables/forest/useForestBrowsePolicy';
import { useForestStats } from '../../composables/forest/useForestStats';
import { useReviewSession } from '../../composables/review/useReviewSession';
import { expandContextIdMacros } from '../../utils/context-id-macros';
import CardTreeWidget from '../charts/CardTreeWidget.vue';
import ForestTreeNav from './ForestTreeNav.vue';
import ReviewSessionPanel from '../ReviewSessionPanel.vue';
import CardMetadataPanel from '../CardMetadataPanel.vue';
import TabWidget from '../chrome/TabWidget.vue';
import HyperparamPromptModal from '../modals/HyperparamPromptModal.vue';
const { t } = useI18n();
const emit = defineEmits();
// Decks / Browse sub-tab strip, driven by the shared TabWidget (the
// pattern every other tab strip in the app uses). `activeTab` widens
// to `string` because TabWidget's `update:modelValue` contract is
// `string`, not a per-call literal union — the small precision loss
// the unification trades for one tab-strip implementation. The
// labels recompute reactively so a locale switch retitles the strip.
const activeTab = ref('decks');
const tabs = computed(() => [
    { id: 'decks', label: t('cards.tab.decks') },
    { id: 'browse', label: t('cards.tab.browse') },
]);
// Browse-pane state. `roots` is the source for both the navigator
// (`useForestNavigation` consumes it) and the chart's tooltip
// header composer (`tree.setForestStats(roots.value)` populates the
// per-CardId Map). `browseError` is a UX-level signal, distinct
// from `tree.error` (fetch failures): set when game-node selection
// exceeds `MULTI_ROOT_DISPLAY_CAP` to nudge the user toward
// sub-selection.
const roots = ref([]);
const isLoadingRoots = ref(false);
const browseError = ref(null);
// Per-board projection: the composable reads/writes against the
// active board's slot in `board-card-trees.ts`. Switching boards
// (active-tab change in the workspace) atomically swaps what the
// widget displays — same shape as `useReviewSession(boardIdRef)`.
const boardIdRef = computed(() => activeBoard.value?.id ?? null);
const tree = useCardTreeData(boardIdRef);
// `roots` (the navigator tree) is workspace-global; `boardIdRef` keys the
// per-board selection axis (schema 59 — board-scope audit P0).
const nav = useForestNavigation(roots, boardIdRef);
const forestStats = useForestStats();
const cardMetadata = useCardMetadata();
const reviewSession = useReviewSession(boardIdRef);
const selectedDeckId = ref(store.session.ui.activeCardSetId);
const orientation = ref('vertical');
// "In-session" gating for the Decks panel: when a session is running
// against the active board, the Decks left panel hosts the
// ReviewSessionPanel in place of the deck-config form. Mirrors the
// pre-merge SR tab's gating: deck-config form when IDLE / LOADING,
// in-session controls when a current card exists. Per
// `cards-tab-merge-plan.md`'s "in-session state" section.
const inReviewSession = computed(() => reviewSession.currentCard.value !== null);
// Render-time overlay: highlight the active board's current review
// card in orange against the forest's blue active-set rendering.
// Routes through `reviewSession.currentCard` rather than reading
// `store.session.reviews` directly because the composable's
// projection already does the boardId-keyed lookup; passing through
// keeps one source of truth for "what card is the user reviewing".
const currentCardId = computed(() => {
    const card = reviewSession.currentCard.value;
    return card ? card.id : null;
});
function toggleOrientation() {
    orientation.value = orientation.value === 'horizontal' ? 'vertical' : 'horizontal';
}
onMounted(async () => {
    isLoadingRoots.value = true;
    try {
        roots.value = await forestStats.fetchForestStats();
        tree.setForestStats(roots.value);
        // The selection watcher below (immediate: true) drives the
        // right pane from the persisted `nav.selection` once roots
        // load. No auto-select — fresh users land on a fully
        // collapsed nav and pick what they want; returning users
        // resume their last selection.
    }
    catch (err) {
        console.error('Failed to load Forest Directory:', err);
    }
    finally {
        isLoadingRoots.value = false;
    }
});
// Re-seed forestStats into the active board's slot when the board
// changes (the slot may be empty if it's a never-explored board).
// The roots list itself is workspace-global, so we don't reload it.
watch(boardIdRef, () => {
    if (roots.value.length > 0)
        tree.setForestStats(roots.value);
});
// Re-hydrate the forest from the active board's review queue when
// the queue is non-empty but the slot's forest hasn't been
// populated yet — the cross-session re-hydrate path. The review
// queue persists via SyncService so a browser reload restores it
// from the backend; the forest doesn't (`board-card-trees.ts`
// holds it as ephemeral analysis-shaped data, not synced). Without
// this watcher the user lands mid-session with `inReviewSession`
// true (panel visible, status correct) but the Lineage Explorer
// empty — no view of where they are in the deck.
//
// `tree.seedFromQueue` is internally idempotent (short-circuits
// when the slot's forest is already populated), so the watcher
// can fire freely on any board switch or queue mutation. The
// `immediate: true` flag covers the mount-time case where the
// queue is already in the store from SyncService's hydrate.
//
// Reads the queue from the store directly rather than instantiating
// `useReviewSession` for this single read — same cheap-projection
// pattern the rest of this file uses for `currentCardId`.
watch([boardIdRef, () => {
        const id = boardIdRef.value;
        return id ? store.session.reviews[id]?.queue ?? [] : [];
    }], ([id, queue]) => {
    if (id && queue.length > 0) {
        void tree.seedFromQueue(queue);
    }
}, { immediate: true });
// Selection → right-pane policy lives in its own composable so the
// orchestration is named and findable. The policy writes
// `browseError` for UX-cap messages; the right-pane empty-state
// cascade below reads it alongside `tree.error`. Slot ownership
// (deck-pipeline / review vs browse) is enforced inside `clearBrowse`,
// not here — see `useCardTreeData`; this fixes the forest vanishing on
// tab-away/back for both review and pipeline-preview content.
useForestBrowsePolicy(nav, tree, browseError);
async function reloadRoots() {
    roots.value = await forestStats.fetchForestStats();
    tree.setForestStats(roots.value);
}
// Bind-time prompt for the deck's hyperparameter harness. Resolves
// to a `Record<name, value>` on submit or `null` on cancel; when the
// deck declares no hyperparameters, we skip the modal entirely and
// pass `{}` through to `runPipeline`. The modal lives in the
// component layer — composables stay UI-free per the layering tenet.
const harnessModalRef = ref(null);
async function collectHyperparameters(deck) {
    if (!deck.hyperparameters || deck.hyperparameters.length === 0)
        return 'skipped';
    if (!harnessModalRef.value)
        return 'cancelled';
    const result = await harnessModalRef.value.open(
    // The deck's hyperparameters carry the `{name}` shape the modal's open()
    // expects; narrow to its exact parameter type (the structural overlap the
    // generic deck signature can't express).
    deck.hyperparameters);
    return result ?? 'cancelled';
}
async function runDeck() {
    const deck = store.profile.cardSets[selectedDeckId.value];
    if (!deck)
        return;
    const collected = await collectHyperparameters(deck);
    if (collected === 'cancelled')
        return;
    const values = collected === 'skipped' ? {} : collected;
    // Single ephemeral context (schema-version 16): the deck is a pure
    // strategy, the context lives on `cardsContextIds`. The matched-cards
    // return value is unused here — this codepath is browse-only,
    // distinct from the start-review-session flow that consumes it.
    await tree.runPipeline(deck, store.session.ui.cardsContextIds, values);
}
/**
 * Start a review session from the currently-selected deck-config.
 * The cards-tab-merge arc collapses two backend round-trips
 * (pipeline + start-session) to one — `tree.runPipeline` populates
 * the forest visualisation AND returns the matched cards;
 * `reviewSession.startSession` consumes the queue directly without
 * a second fetch. The forest's active set and the review queue are
 * by-construction the same set of cards.
 *
 * If the deck declares hyperparameters, the harness prompt modal
 * opens first; cancelling skips the session start. Empty pipeline
 * result still routes through `startSession` short-circuit to IDLE.
 */
async function startReviewFromConfig() {
    const deck = store.profile.cardSets[selectedDeckId.value];
    if (!deck)
        return;
    const collected = await collectHyperparameters(deck);
    if (collected === 'cancelled')
        return;
    const values = collected === 'skipped' ? {} : collected;
    const matched = await tree.runPipeline(deck, store.session.ui.cardsContextIds, values);
    if (matched.length > 0) {
        await reviewSession.startSession(matched);
    }
}
// The context-id input is a local-ref-owned display because
// `:value="store.session.ui.cardsContextIds.join(', ')"` would
// reset the DOM whenever the parser dropped non-digit chars
// (the parsed-then-formatted value differs from the user's
// raw typing, so Vue's reactivity stomps the input). Writes
// flow input → store one-way: every keystroke updates the
// local ref (preserving typing) and re-parses into the store
// in expanded form. The store-side ref is the source of truth
// for the deck pipeline; the local ref is the source of truth
// for what the user sees.
const contextIdInput = ref(store.session.ui.cardsContextIds.join(', '));
// Whether the current input contains a macro — gates the
// "→ Expands to" hint below the input so the user can see
// what the macro resolved to (since the input itself now
// shows their literal typing rather than the parsed form).
const hasContextIdMacro = computed(() => /\$\{/.test(contextIdInput.value));
function updateContextIds(val) {
    // Preserve the user's literal typing in the local ref.
    contextIdInput.value = val;
    // Pre-expand `${gameSourceId, ...}` macros to the corresponding
    // root card ids, then mirror CardSetEditor's parser: split on
    // comma, parse, drop NaN. Resolution uses the same `roots` ref
    // that drives the navigator — no backend round-trip needed.
    const expanded = expandContextIdMacros(val, (gameSourceId) => roots.value
        // Brand-strip GameSourceId/CardId → raw number to compare against the
        // numeric macro arg / build the numeric context-id list; documented
        // debt, IDENTIFIERS.md erosion (b) (maintainer-directed re-brand helper).
        .filter(s => s.gameSourceId === gameSourceId)
        .map(s => s.rootCardId));
    store.session.ui.cardsContextIds = expanded
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
}
function handleNodeClick(payload) {
    // Track the clicked card as the inline-edit panel's subject in
    // addition to loading it onto the board. The metadata panel
    // below the tree binds to this selection so the user can
    // inspect / edit metadata without starting a review session
    // (which is the gap that surfaced when suspended cards in
    // legacy decks silently emptied review queues).
    selectedCardId.value = payload.cardId;
    const card = tree.cards.value.get(payload.cardId);
    if (card) {
        emit('load-card', card);
        return;
    }
    // Card not yet hydrated — fetch then load.
    tree.requestCard(payload.cardId).then(() => {
        const fresh = tree.cards.value.get(payload.cardId);
        if (fresh)
            emit('load-card', fresh);
    });
}
// ─── Browse-mount of the inline-edit panel ───────────────────────────
// Selection state lives locally to ForestDirectory; the active
// board may show the loaded card, but we deliberately don't tie
// the panel's subject to "what's on the board" because the
// loaded board changes via other affordances (mint, SGF load).
// The panel's selection is "what did the user click in the
// tree?" — a Browse-specific notion.
const selectedCardId = ref(null);
const selectedCard = computed(() => {
    const id = selectedCardId.value;
    if (id === null)
        return null;
    return tree.cards.value.get(id) ?? null;
});
const cardMetadataSaving = ref(false);
async function handleCardMetadataPatch(patch) {
    const card = selectedCard.value;
    if (!card)
        return;
    cardMetadataSaving.value = true;
    try {
        const updated = await cardMetadata.updateMetadata(card.id, patch);
        // Splice the updated card back into the tree composable's
        // local card map so the panel's reactive props.card picks
        // up the new values. The composable's Map is the source of
        // truth for what tooltips and the tree's per-card lookups
        // see; `setCard` keeps every Browse-side consumer
        // consistent (mirrors `requestCard`'s writeback shape).
        tree.setCard(updated);
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
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['forest-container']} */ ;
/** @type {__VLS_StyleScopedClasses['left-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-selector-box']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn-large']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "forest-cq-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['forest-cq-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "forest-container" },
});
/** @type {__VLS_StyleScopedClasses['forest-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "left-panel" },
});
/** @type {__VLS_StyleScopedClasses['left-panel']} */ ;
const __VLS_0 = TabWidget || TabWidget;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    tabs: (__VLS_ctx.tabs),
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_2 = __VLS_1({
    tabs: (__VLS_ctx.tabs),
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
{
    const { decks: __VLS_6 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "decks-view" },
    });
    /** @type {__VLS_StyleScopedClasses['decks-view']} */ ;
    if (__VLS_ctx.inReviewSession) {
        const __VLS_7 = ReviewSessionPanel;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({}));
        const __VLS_9 = __VLS_8({}, ...__VLS_functionalComponentArgsRest(__VLS_8));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "deck-selector-box" },
        });
        /** @type {__VLS_StyleScopedClasses['deck-selector-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('cards.decks.selectDeck'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.selectedDeckId),
            ...{ class: "dark-select deck-dropdown" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        /** @type {__VLS_StyleScopedClasses['deck-dropdown']} */ ;
        for (const [set] of __VLS_vFor((__VLS_ctx.store.profile.cardSets))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (set.id),
                value: (set.id),
            });
            (set.name);
            // @ts-ignore
            [tabs, activeTab, inReviewSession, $t, selectedDeckId, store,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.store.profile.cardSets[__VLS_ctx.selectedDeckId]?.description);
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ style: {} },
        });
        (__VLS_ctx.$t('cards.decks.contextIds'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateContextIds(e.target.value)) },
            type: "text",
            ...{ class: "dark-input deck-dropdown" },
            placeholder: (__VLS_ctx.$t('cards.decks.contextIdsPlaceholder', ['${12}'])),
            value: (__VLS_ctx.contextIdInput),
            title: (__VLS_ctx.$t('cards.decks.contextIdsTooltip', ['${N}', '${N, M, ...}'])),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['deck-dropdown']} */ ;
        if (__VLS_ctx.hasContextIdMacro) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "macro-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['macro-hint']} */ ;
            (__VLS_ctx.$t('cards.decks.expandsTo', { ids: __VLS_ctx.store.session.ui.cardsContextIds.join(', ') || __VLS_ctx.$t('cards.decks.expandsToEmpty') }));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.startReviewFromConfig) },
            ...{ class: "action-btn-large start-review-btn" },
            disabled: (!__VLS_ctx.store.profile.cardSets[__VLS_ctx.selectedDeckId]),
            title: (__VLS_ctx.$t('cards.decks.startReviewTooltip')),
        });
        /** @type {__VLS_StyleScopedClasses['action-btn-large']} */ ;
        /** @type {__VLS_StyleScopedClasses['start-review-btn']} */ ;
        (__VLS_ctx.$t('cards.decks.startReview'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.runDeck) },
            ...{ class: "action-btn-large" },
            disabled: (!__VLS_ctx.store.profile.cardSets[__VLS_ctx.selectedDeckId]),
            title: (__VLS_ctx.$t('cards.decks.runPipelineTooltip')),
        });
        /** @type {__VLS_StyleScopedClasses['action-btn-large']} */ ;
        (__VLS_ctx.$t('cards.decks.runPipeline'));
    }
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, $t, selectedDeckId, selectedDeckId, selectedDeckId, store, store, store, store, updateContextIds, contextIdInput, hasContextIdMacro, startReviewFromConfig, runDeck,];
}
{
    const { browse: __VLS_12 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "browse-view" },
    });
    /** @type {__VLS_StyleScopedClasses['browse-view']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tools-row" },
    });
    /** @type {__VLS_StyleScopedClasses['tools-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.$t('cards.browse.allGameSources'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.reloadRoots) },
        ...{ class: "reload-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['reload-btn']} */ ;
    if (__VLS_ctx.isLoadingRoots) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
        (__VLS_ctx.$t('cards.browse.loading'));
    }
    else if (__VLS_ctx.roots.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-state" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
        (__VLS_ctx.$t('cards.browse.empty'));
    }
    else {
        const __VLS_13 = ForestTreeNav;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
            nav: (__VLS_ctx.nav),
        }));
        const __VLS_15 = __VLS_14({
            nav: (__VLS_ctx.nav),
        }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    }
    // @ts-ignore
    [$t, $t, $t, reloadRoots, isLoadingRoots, roots, nav,];
}
// @ts-ignore
[];
var __VLS_3;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tree-panel" },
});
/** @type {__VLS_StyleScopedClasses['tree-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "panel-header" },
});
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.$t('cards.lineage.header'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-controls" },
});
/** @type {__VLS_StyleScopedClasses['header-controls']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.toggleOrientation) },
    ...{ class: "orient-btn" },
    title: (__VLS_ctx.orientation === 'horizontal' ? __VLS_ctx.$t('cards.lineage.switchToVertical') : __VLS_ctx.$t('cards.lineage.switchToHorizontal')),
});
/** @type {__VLS_StyleScopedClasses['orient-btn']} */ ;
(__VLS_ctx.orientation === 'horizontal' ? `⇥ ${__VLS_ctx.$t('cards.lineage.orientationHorizontal')}` : `⇩ ${__VLS_ctx.$t('cards.lineage.orientationVertical')}`);
if (__VLS_ctx.tree.forest.value.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tree-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['tree-meta']} */ ;
    (__VLS_ctx.$t('cards.lineage.treeCount', __VLS_ctx.tree.forest.value.length));
    (__VLS_ctx.$t('cards.lineage.activeCount', { n: __VLS_ctx.tree.activeSet.value.size }));
}
if (__VLS_ctx.tree.isLoading.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    (__VLS_ctx.$t('cards.lineage.loadingTree'));
}
else if (__VLS_ctx.browseError) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state error" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.browseError);
}
else if (__VLS_ctx.tree.error.value) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state error" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.tree.error.value);
}
else if (__VLS_ctx.tree.forest.value.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    (__VLS_ctx.activeTab === 'decks' ? __VLS_ctx.$t('cards.lineage.emptyDecks') : __VLS_ctx.$t('cards.lineage.emptyBrowse'));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "chart-wrapper" },
    });
    /** @type {__VLS_StyleScopedClasses['chart-wrapper']} */ ;
    const __VLS_18 = CardTreeWidget;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
        ...{ 'onNodeClick': {} },
        ...{ 'onRequestCard': {} },
        ...{ 'onToggleManualExpand': {} },
        ...{ 'onCollapseTree': {} },
        forest: (__VLS_ctx.tree.forest.value),
        activeSet: (__VLS_ctx.tree.activeSet.value),
        cards: (__VLS_ctx.tree.cards.value),
        forestStats: (__VLS_ctx.tree.forestStats.value),
        manualExpand: (__VLS_ctx.tree.manualExpand.value),
        orientation: (__VLS_ctx.orientation),
        currentCardId: (__VLS_ctx.currentCardId),
        selectedCardId: (__VLS_ctx.selectedCardId),
    }));
    const __VLS_20 = __VLS_19({
        ...{ 'onNodeClick': {} },
        ...{ 'onRequestCard': {} },
        ...{ 'onToggleManualExpand': {} },
        ...{ 'onCollapseTree': {} },
        forest: (__VLS_ctx.tree.forest.value),
        activeSet: (__VLS_ctx.tree.activeSet.value),
        cards: (__VLS_ctx.tree.cards.value),
        forestStats: (__VLS_ctx.tree.forestStats.value),
        manualExpand: (__VLS_ctx.tree.manualExpand.value),
        orientation: (__VLS_ctx.orientation),
        currentCardId: (__VLS_ctx.currentCardId),
        selectedCardId: (__VLS_ctx.selectedCardId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    let __VLS_23;
    const __VLS_24 = {
        ...{ nodeClick: {} },
        onNodeClick: (__VLS_ctx.handleNodeClick),
        ...{ requestCard: {} },
        onRequestCard: (__VLS_ctx.tree.requestCard),
        ...{ toggleManualExpand: {} },
        onToggleManualExpand: (__VLS_ctx.tree.toggleManualExpand),
        ...{ collapseTree: {} },
        onCollapseTree: (__VLS_ctx.tree.clearManualExpandForTree),
    };
    var __VLS_21;
    var __VLS_22;
}
if (__VLS_ctx.selectedCard) {
    const __VLS_25 = CardMetadataPanel;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        ...{ 'onPatch': {} },
        card: (__VLS_ctx.selectedCard),
        disabled: (__VLS_ctx.cardMetadataSaving),
    }));
    const __VLS_27 = __VLS_26({
        ...{ 'onPatch': {} },
        card: (__VLS_ctx.selectedCard),
        disabled: (__VLS_ctx.cardMetadataSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    let __VLS_30;
    const __VLS_31 = {
        ...{ patch: {} },
        onPatch: (__VLS_ctx.handleCardMetadataPatch),
    };
    var __VLS_28;
    var __VLS_29;
}
const __VLS_32 = HyperparamPromptModal;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
    ref: "harnessModalRef",
}));
const __VLS_34 = __VLS_33({
    ref: "harnessModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_37;
var __VLS_35;
// @ts-ignore
var __VLS_38 = __VLS_37;
// @ts-ignore
[activeTab, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, toggleOrientation, orientation, orientation, orientation, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, tree, browseError, browseError, currentCardId, selectedCardId, handleNodeClick, selectedCard, selectedCard, cardMetadataSaving, handleCardMetadataPatch,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
