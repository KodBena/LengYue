<!--
  src/components/tree/ForestDirectory.vue
  Master-Detail view for Database Exploration. Hosts the card-tree
  widget (per docs/archive/notes/card-tree-frontend-spec.md) in two modes:
  Decks tab drives the active-set rendering from a CardSet pipeline
  result; Browse tab drives a file-manager-style hierarchical
  navigator (game_sources → roots) via `useForestNavigation` +
  `ForestTreeNav.vue`, with selection driving the right pane through
  `useCardTreeData`'s loadBrowse / loadBrowseForest entry points.
  The per-board data state lives in `board-card-trees.ts`; this SFC
  reads it via `useCardTreeData(boardIdRef)`.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, activeBoard, pushSystemMessage } from '../../store';
import { backendService } from '../../services/backend-service';
import type { BoardId, CardId, CardMetadataPatch, ForestStat, ReviewCard } from '../../types';
import { useCardTreeData } from '../../composables/cards/useCardTreeData';
import { useForestNavigation } from '../../composables/forest/useForestNavigation';
import { useForestBrowsePolicy } from '../../composables/forest/useForestBrowsePolicy';
import { useReviewSession } from '../../composables/review/useReviewSession';
import { expandContextIdMacros } from '../../utils/context-id-macros';
import CardTreeWidget from '../charts/CardTreeWidget.vue';
import ForestTreeNav from './ForestTreeNav.vue';
import ReviewSessionPanel from '../ReviewSessionPanel.vue';
import CardMetadataPanel from '../CardMetadataPanel.vue';
import HyperparamPromptModal, { type HyperparamValues } from '../modals/HyperparamPromptModal.vue';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'load-card', card: ReviewCard): void;
}>();

const activeTab = ref<'decks' | 'browse'>('decks');

// Browse-pane state. `roots` is the source for both the navigator
// (`useForestNavigation` consumes it) and the chart's tooltip
// header composer (`tree.setForestStats(roots.value)` populates the
// per-CardId Map). `browseError` is a UX-level signal, distinct
// from `tree.error` (fetch failures): set when game-node selection
// exceeds `MULTI_ROOT_DISPLAY_CAP` to nudge the user toward
// sub-selection.
const roots = ref<ForestStat[]>([]);
const isLoadingRoots = ref(false);
const browseError = ref<string | null>(null);

// Per-board projection: the composable reads/writes against the
// active board's slot in `board-card-trees.ts`. Switching boards
// (active-tab change in the workspace) atomically swaps what the
// widget displays — same shape as `useReviewSession(boardIdRef)`.
const boardIdRef = computed<BoardId | null>(() => activeBoard.value?.id ?? null);
const tree = useCardTreeData(boardIdRef);
const nav = useForestNavigation(roots);
const reviewSession = useReviewSession(boardIdRef);
const selectedDeckId = ref<string>(store.session.ui.activeCardSetId);
const orientation = ref<'horizontal' | 'vertical'>('vertical');

// "In-session" gating for the Decks panel: when a session is running
// against the active board, the Decks left panel hosts the
// ReviewSessionPanel in place of the deck-config form. Mirrors the
// pre-merge SR tab's gating: deck-config form when IDLE / LOADING,
// in-session controls when a current card exists. Per
// `cards-tab-merge-plan.md`'s "in-session state" section.
const inReviewSession = computed<boolean>(() =>
  reviewSession.currentCard.value !== null
);

// Render-time overlay: highlight the active board's current review
// card in orange against the forest's blue active-set rendering.
// Routes through `reviewSession.currentCard` rather than reading
// `store.session.reviews` directly because the composable's
// projection already does the boardId-keyed lookup; passing through
// keeps one source of truth for "what card is the user reviewing".
const currentCardId = computed<CardId | null>(() => {
  const card = reviewSession.currentCard.value;
  return card ? card.id : null;
});

function toggleOrientation(): void {
  orientation.value = orientation.value === 'horizontal' ? 'vertical' : 'horizontal';
}

onMounted(async () => {
  isLoadingRoots.value = true;
  try {
    roots.value = await backendService.getForestStats();
    tree.setForestStats(roots.value);
    // The selection watcher below (immediate: true) drives the
    // right pane from the persisted `nav.selection` once roots
    // load. No auto-select — fresh users land on a fully
    // collapsed nav and pick what they want; returning users
    // resume their last selection.
  } catch (err) {
    console.error('Failed to load Forest Directory:', err);
  } finally {
    isLoadingRoots.value = false;
  }
});

// Re-seed forestStats into the active board's slot when the board
// changes (the slot may be empty if it's a never-explored board).
// The roots list itself is workspace-global, so we don't reload it.
watch(boardIdRef, () => {
  if (roots.value.length > 0) tree.setForestStats(roots.value);
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
watch(
  [boardIdRef, () => {
    const id = boardIdRef.value;
    return id ? store.session.reviews[id]?.queue ?? [] : [];
  }],
  ([id, queue]) => {
    if (id && queue.length > 0) {
      void tree.seedFromQueue(queue);
    }
  },
  { immediate: true },
);

// Selection → right-pane policy lives in its own composable so the
// orchestration is named and findable. The policy writes
// `browseError` for UX-cap messages; the right-pane empty-state
// cascade below reads it alongside `tree.error`.
useForestBrowsePolicy(nav, tree, browseError);

async function reloadRoots(): Promise<void> {
  roots.value = await backendService.getForestStats();
  tree.setForestStats(roots.value);
}

// Bind-time prompt for the deck's hyperparameter harness. Resolves
// to a `Record<name, value>` on submit or `null` on cancel; when the
// deck declares no hyperparameters, we skip the modal entirely and
// pass `{}` through to `runPipeline`. The modal lives in the
// component layer — composables stay UI-free per the layering tenet.
const harnessModalRef = ref<InstanceType<typeof HyperparamPromptModal> | null>(null);

async function collectHyperparameters(
  deck: { hyperparameters: { name: string }[] } & { hyperparameters: unknown[] },
): Promise<HyperparamValues | 'skipped' | 'cancelled'> {
  if (!deck.hyperparameters || deck.hyperparameters.length === 0) return 'skipped';
  if (!harnessModalRef.value) return 'cancelled';
  const result = await harnessModalRef.value.open(
    deck.hyperparameters as Parameters<typeof harnessModalRef.value.open>[0],
  );
  return result ?? 'cancelled';
}

async function runDeck(): Promise<void> {
  const deck = store.profile.cardSets[selectedDeckId.value];
  if (!deck) return;
  const collected = await collectHyperparameters(deck);
  if (collected === 'cancelled') return;
  const values: HyperparamValues = collected === 'skipped' ? {} : collected;
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
async function startReviewFromConfig(): Promise<void> {
  const deck = store.profile.cardSets[selectedDeckId.value];
  if (!deck) return;
  const collected = await collectHyperparameters(deck);
  if (collected === 'cancelled') return;
  const values: HyperparamValues = collected === 'skipped' ? {} : collected;
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

function updateContextIds(val: string): void {
  // Preserve the user's literal typing in the local ref.
  contextIdInput.value = val;
  // Pre-expand `${gameSourceId, ...}` macros to the corresponding
  // root card ids, then mirror CardSetEditor's parser: split on
  // comma, parse, drop NaN. Resolution uses the same `roots` ref
  // that drives the navigator — no backend round-trip needed.
  const expanded = expandContextIdMacros(val, (gameSourceId) =>
    roots.value
      .filter(s => (s.gameSourceId as unknown as number) === gameSourceId)
      .map(s => s.rootCardId as unknown as number),
  );
  store.session.ui.cardsContextIds = expanded
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

function handleNodeClick(payload: { cardId: CardId; role: 'active' | 'context' }): void {
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
    if (fresh) emit('load-card', fresh);
  });
}

// ─── Browse-mount of the inline-edit panel ───────────────────────────
// Selection state lives locally to ForestDirectory; the active
// board may show the loaded card, but we deliberately don't tie
// the panel's subject to "what's on the board" because the
// loaded board changes via other affordances (mint, SGF load).
// The panel's selection is "what did the user click in the
// tree?" — a Browse-specific notion.
const selectedCardId = ref<CardId | null>(null);

const selectedCard = computed<ReviewCard | null>(() => {
  const id = selectedCardId.value;
  if (id === null) return null;
  return tree.cards.value.get(id) ?? null;
});

const cardMetadataSaving = ref(false);

async function handleCardMetadataPatch(patch: CardMetadataPatch): Promise<void> {
  const card = selectedCard.value;
  if (!card) return;
  cardMetadataSaving.value = true;
  try {
    const updated = await backendService.updateCardMetadata(card.id, patch);
    // Splice the updated card back into the tree composable's
    // local card map so the panel's reactive props.card picks
    // up the new values. The composable's Map is the source of
    // truth for what tooltips and the tree's per-card lookups
    // see; `setCard` keeps every Browse-side consumer
    // consistent (mirrors `requestCard`'s writeback shape).
    tree.setCard(updated);
  } catch (err) {
    pushSystemMessage('error', t('cardMetadata.saveFailed', {
      detail: err instanceof Error ? err.message : String(err),
    }));
  } finally {
    cardMetadataSaving.value = false;
  }
}
</script>

<template>
  <div class="forest-container">

    <!-- LEFT PANEL: Navigation -->
    <div class="left-panel">
      <div class="panel-header tab-switcher">
        <button :class="{ active: activeTab === 'decks' }" @click="activeTab = 'decks'">{{ $t('cards.tab.decks') }}</button>
        <button :class="{ active: activeTab === 'browse' }" @click="activeTab = 'browse'">{{ $t('cards.tab.browse') }}</button>
      </div>

      <!-- TAB 1: DECKS — deck-config form when idle, ReviewSessionPanel when a session is running -->
      <div v-if="activeTab === 'decks'" class="decks-view">
        <ReviewSessionPanel v-if="inReviewSession" />
        <div v-else class="deck-selector-box">
          <label>{{ $t('cards.decks.selectDeck') }}</label>
          <select v-model="selectedDeckId" class="dark-select deck-dropdown">
            <option v-for="set in store.profile.cardSets" :key="set.id" :value="set.id">
              {{ set.name }}
            </option>
          </select>
          <p class="hint">{{ store.profile.cardSets[selectedDeckId]?.description }}</p>

          <label style="margin-top: var(--space-default);">{{ $t('cards.decks.contextIds') }}</label>
          <input
            type="text"
            class="dark-input deck-dropdown"
            :placeholder="$t('cards.decks.contextIdsPlaceholder', ['${12}'])"
            :value="contextIdInput"
            @input="(e: any) => updateContextIds(e.target.value)"
            :title="$t('cards.decks.contextIdsTooltip', ['${N}', '${N, M, ...}'])"
          />
          <p v-if="hasContextIdMacro" class="macro-hint">
            {{ $t('cards.decks.expandsTo', { ids: store.session.ui.cardsContextIds.join(', ') || $t('cards.decks.expandsToEmpty') }) }}
          </p>

          <button
            class="action-btn-large start-review-btn"
            @click="startReviewFromConfig"
            :disabled="!store.profile.cardSets[selectedDeckId]"
            :title="$t('cards.decks.startReviewTooltip')"
          >
            {{ $t('cards.decks.startReview') }}
          </button>
          <button
            class="action-btn-large"
            @click="runDeck"
            :disabled="!store.profile.cardSets[selectedDeckId]"
            :title="$t('cards.decks.runPipelineTooltip')"
          >
            {{ $t('cards.decks.runPipeline') }}
          </button>
        </div>
      </div>

      <!-- TAB 2: BROWSE — file-manager hierarchy (games → roots) -->
      <div v-if="activeTab === 'browse'" class="browse-view">
        <div class="tools-row">
          <span style="font-size: var(--text-body); color: var(--text-2);">{{ $t('cards.browse.allGameSources') }}</span>
          <button class="reload-btn" @click="reloadRoots">↻</button>
        </div>

        <div v-if="isLoadingRoots" class="empty-state">{{ $t('cards.browse.loading') }}</div>
        <div v-else-if="roots.length === 0" class="empty-state">{{ $t('cards.browse.empty') }}</div>
        <ForestTreeNav v-else :nav="nav" />
      </div>
    </div>

    <!-- RIGHT PANEL: Card-tree widget -->
    <div class="tree-panel">
      <div class="panel-header">
        <span>{{ $t('cards.lineage.header') }}</span>
        <div class="header-controls">
          <button
            class="orient-btn"
            :title="orientation === 'horizontal' ? $t('cards.lineage.switchToVertical') : $t('cards.lineage.switchToHorizontal')"
            @click="toggleOrientation"
          >
            {{ orientation === 'horizontal' ? `⇥ ${$t('cards.lineage.orientationHorizontal')}` : `⇩ ${$t('cards.lineage.orientationVertical')}` }}
          </button>
          <span class="tree-meta" v-if="tree.forest.value.length">
            {{ $t('cards.lineage.treeCount', tree.forest.value.length) }} ·
            {{ $t('cards.lineage.activeCount', { n: tree.activeSet.value.size }) }}
          </span>
        </div>
      </div>

      <div v-if="tree.isLoading.value" class="empty-state">{{ $t('cards.lineage.loadingTree') }}</div>
      <div v-else-if="browseError" class="empty-state error">{{ browseError }}</div>
      <div v-else-if="tree.error.value" class="empty-state error">{{ tree.error.value }}</div>
      <div v-else-if="tree.forest.value.length === 0" class="empty-state">
        {{ activeTab === 'decks' ? $t('cards.lineage.emptyDecks') : $t('cards.lineage.emptyBrowse') }}
      </div>

      <div v-else class="chart-wrapper">
        <CardTreeWidget
          :forest="tree.forest.value"
          :active-set="tree.activeSet.value"
          :cards="tree.cards.value"
          :forest-stats="tree.forestStats.value"
          :orientation="orientation"
          :current-card-id="currentCardId"
          @node-click="handleNodeClick"
          @request-card="tree.requestCard"
        />
      </div>

      <!-- Inline-edit panel for the most-recently-clicked card.
           Surfaces here (Browse view) so the user can inspect /
           edit metadata without starting a review session — the
           gap that surfaced when legacy decks' suspended cards
           silently emptied review queues. -->
      <CardMetadataPanel
        v-if="selectedCard"
        :card="selectedCard"
        :disabled="cardMetadataSaving"
        @patch="handleCardMetadataPatch"
      />
    </div>

    <HyperparamPromptModal ref="harnessModalRef" />

  </div>
</template>

<style scoped>
.forest-container { display: flex; flex: 1; height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--surface-0); }
.left-panel { width: 280px; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--surface-3); flex-shrink: 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-tight) var(--space-default); border-bottom: 1px solid var(--surface-3); background: var(--surface-2); font-size: var(--text-emphasis); text-transform: uppercase; color: var(--text-0); letter-spacing: var(--tracking-default); flex-shrink: 0; }
.tab-switcher { padding: 0; display: flex; }
.tab-switcher button { flex: 1; background: transparent; border: none; color: var(--text-2); padding: var(--space-tight) 0; font-size: var(--text-body); text-transform: uppercase; letter-spacing: var(--tracking-default); cursor: pointer; border-bottom: 2px solid transparent; }
.tab-switcher button.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); background: var(--surface-2); }
.decks-view, .browse-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.deck-selector-box { padding: var(--space-default); border-bottom: 1px solid var(--surface-3); }
.deck-selector-box label { font-size: var(--text-emphasis); color: var(--text-2); display: block; margin-bottom: 3px; text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: 2px 4px; font-size: var(--text-emphasis); margin-bottom: var(--space-tight); background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2); border-radius: var(--radius-default); outline: none; }
.deck-dropdown:focus { border-color: var(--accent-primary); }
.hint { font-size: var(--text-body); color: var(--text-2); margin: 0 0 var(--space-tight) 0; }
.macro-hint { font-size: var(--text-body); color: var(--text-2); margin: 2px 0 var(--space-tight) 0; font-style: italic; word-break: break-all; }
.action-btn-large { width: 100%; background: var(--surface-2); color: var(--accent-primary); border: 1px solid var(--border-2); padding: 2px 4px; border-radius: var(--radius-default); font-size: var(--text-emphasis); cursor: pointer; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.action-btn-large:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
.start-review-btn { background: var(--accent-secondary); color: var(--surface-1); margin-bottom: var(--space-tight); }
.tools-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; border-bottom: 1px solid var(--surface-3); }
.reload-btn { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: var(--text-heading); padding: 0; line-height: 1; }
.tree-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.header-controls { display: flex; align-items: center; gap: var(--space-default); }
.orient-btn { background: var(--surface-2); color: var(--accent-primary); border: 1px solid var(--border-2); border-radius: var(--radius-default); padding: 1px 3px; font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-tight); cursor: pointer; font-family: inherit; }
.tree-meta { color: var(--accent-primary); font-size: var(--text-body); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-2); font-size: var(--text-emphasis); }
.empty-state.error { color: var(--state-error); }
.chart-wrapper { flex: 1; padding: var(--space-tight); min-height: 0; min-width: 0; overflow: hidden; display: flex; }
</style>
