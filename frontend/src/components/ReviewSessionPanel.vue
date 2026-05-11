<!--
  src/components/ReviewSessionPanel.vue

  In-session review controls — the right-hand half of the cards-tab-
  merge arc. Hosts the controls that lived inline in App.vue's SR tab
  before the merge: status header, card N/M counter, intermission
  chart, moves-made line, per-card sticky visits override, Skip /
  Next / Rewind buttons.

  Used by ForestDirectory's Decks subtab in place of the deck-config
  form whenever a review session is active for the currently-active
  board (state has progressed past LOADING and a current card exists).
  The forest panel on the right of ForestDirectory remains visible
  throughout, so the user sees their review progress reflected in the
  rendered forest's orange overlay (per the PR 1 work).

  Per ADR-0006, the file header sits at the top of the script block.
  Per ADR-0007, target ≤ 250 lines with no individual section
  exceeding ~150.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseChart from './charts/BaseChart.vue';
import { useReviewSession } from '../composables/review/useReviewSession';
import { activeBoard, mutateBoard, store } from '../store';
import { getActiveVariationPath } from '../engine/util';
import { navigateTo } from '../engine/navigator';
import { themeColor } from '../utils/theme-color';
import type { BoardId } from '../types';

const { t } = useI18n();

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
const activeBoardId = computed(() => activeBoard.value?.id as BoardId | null);
const reviewSession = useReviewSession(activeBoardId);

// Intermission chart series — only meaningful in FINISHED state.
// Lifted from the prior App.vue inline binding without behaviour
// change.
const intermissionSeries = computed(() => {
  if (reviewSession.state.value !== 'FINISHED') return [];
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
function stateLabelKey(state: string): string {
  return `review.session.state.${state}`;
}

function handleVisitsOverrideChange(e: Event) {
  // Thin DOM-string-to-number adapter; validation lives in
  // setVisitsOverride itself.
  const raw = (e.target as HTMLInputElement).value;
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
function handleIntermissionClick(idx: number) {
  const bId = activeBoardId.value;
  if (!bId) return;
  const review = store.session.reviews[bId];
  if (!review || !review.startingNodeId) return;
  const board = activeBoard.value;
  if (!board) return;
  const path = getActiveVariationPath(board);
  const startIdx = path.indexOf(review.startingNodeId);
  if (startIdx < 0) return;
  const targetIdx = startIdx + 2 * (idx - 1);
  if (targetIdx < 0 || targetIdx >= path.length) return;
  const targetNodeId = path[targetIdx];
  mutateBoard(bId, draft => navigateTo(draft, targetNodeId));
}
</script>

<template>
  <div v-if="reviewSession.currentCard.value" class="review-session-panel">
    <h3>{{ reviewSession.state.value === 'FINISHED' ? $t('review.session.intermission') : $t('review.session.active') }}</h3>
    <p class="hint text-muted card-counter">
      {{ $t('review.session.cardOf', {
        n: reviewSession.queue.value.indexOf(reviewSession.currentCard.value) + 1,
        total: reviewSession.queue.value.length,
      }) }}
    </p>

    <p class="status-line"
       :style="{ color: reviewSession.state.value === 'FINISHED' ? 'var(--accent-secondary)' : 'var(--state-attention)' }">
      {{ $t('review.session.statusLine', { state: $t(stateLabelKey(reviewSession.state.value)) }) }}
      <span v-if="reviewSession.state.value === 'ANALYZING'">{{ $t('review.session.ponderHint') }}</span>
    </p>

    <div v-if="reviewSession.state.value === 'FINISHED'" class="intermission-chart">
      <BaseChart
        :series="intermissionSeries"
        :zoomRange="[1, reviewSession.currentCard.value.numMoves]"
        @index-click="handleIntermissionClick"
      />
    </div>

    <p class="hint text-muted moves-made" v-if="reviewSession.state.value !== 'FINISHED'">
      {{ $t('review.session.movesMade', {
        n: reviewSession.userMovesCount.value,
        total: reviewSession.currentCard.value.numMoves,
      }) }}
    </p>

    <!-- Per-card sticky visits override. The input shows the
         effective value (override if set, else the card's
         defaultVisits). Persists across moves within the same card;
         auto-resets on next card via loadCard. -->
    <div v-if="reviewSession.state.value !== 'FINISHED'" class="visits-override-row">
      <label>{{ $t('review.session.maxVisitsLabel') }}</label>
      <input
        type="number"
        min="1"
        step="50"
        :value="reviewSession.effectiveVisits.value"
        @change="handleVisitsOverrideChange"
        class="dark-input visits-input"
      />
    </div>

    <button class="action-btn-large advance-btn" @click="reviewSession.nextCard">
      {{ reviewSession.state.value === 'FINISHED' ? $t('review.session.nextCard') : $t('review.session.skipCard') }}
    </button>

    <button class="toolbar-btn-sm" @click="reviewSession.rewindToStart">
      {{ $t('review.session.rewindToStart') }}
    </button>

    <button class="toolbar-btn-sm end-session-btn" @click="reviewSession.endSession">
      {{ $t('review.session.endSession') }}
    </button>
  </div>
</template>

<style scoped>
.review-session-panel { padding: var(--space-default); display: flex; flex-direction: column; }
.review-session-panel h3 { margin: 0 0 var(--space-default) 0; font-size: var(--text-emphasis); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.card-counter { margin-bottom: var(--space-medium); }
.status-line { font-weight: bold; margin-bottom: var(--space-medium); }
.intermission-chart {
  height: 180px;
  width: 100%;
  margin-bottom: var(--space-loose);
  background: var(--surface-0);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
}
.moves-made { margin-bottom: var(--space-medium); }
.visits-override-row { display: flex; align-items: center; gap: var(--space-default); margin-bottom: var(--space-medium); }
.visits-override-row label { font-size: var(--text-body); color: var(--text-2); white-space: nowrap; }
.visits-input { width: 100%; }
.advance-btn { margin-bottom: var(--space-medium); margin-top: var(--space-medium); }
/* End-session affordance — de-emphasised against Skip/Next so the
   user doesn't accidentally end mid-card. Inherits the
   `--state-error` rest tone so its destructive intent is honest;
   stays muted (transparent surface, thin border) until hover. */
.end-session-btn {
  margin-top: var(--space-default);
  color: var(--state-error);
  border-color: var(--state-error);
  background: transparent;
}
.end-session-btn:hover {
  background: color-mix(in srgb, var(--state-error) 15%, transparent);
}
</style>
