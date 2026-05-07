/**
 * src/composables/useReviewSession.ts
 * Orchestrates the Spaced Repetition (Ebisu) Sparring flow.
 * Now fully multi-tenant, projecting state from the GlobalStore.
 * License: Public Domain (The Unlicense)
 */

import { computed, type Ref } from 'vue';
import type { ReviewCard, NodeId, BoardId, ReviewStatus } from '../types';
import { store, addBoard, mutateBoard, updateBoardState, mutateReviewSession, pushSystemMessage } from '../store';
import { i18n } from '../i18n';
import { backendService } from '../services/backend-service';
import { analysisService } from '../services/analysis-service';
import { activeConfigHash, hashConfig } from '../services/analysis-config';
import { waitForAnalysis, AnalysisWaitError } from './wait-for-analysis';

// @ts-ignore
import sgf from '@sabaki/sgf';
import { loadSgf } from '../engine/sgf-loader';
import { navigateTo } from '../engine/navigator';
import { getActiveVariationPath } from '../engine/util';
import { applyGoMove } from '../logic';
import { gtpToBoard } from './use-move-suggestions';

/**
 * Absolute fallback used when a card somehow arrives without a
 * `defaultVisits` value AND the user hasn't set an override. Should
 * be rare in practice — all cards minted through the current flow
 * carry a default_visits from the minting modal.
 */
const ABSOLUTE_FALLBACK_VISITS = 1000;

/**
 * Maximum time we wait for KataGo to return a final analysis packet
 * for a user's submitted move. Exceeding this is treated as a hang:
 * we cancel the review entirely (status → IDLE), surface a warning
 * to the system log, and let the user decide whether to restart.
 *
 * Auto-retry is deliberately NOT implemented — it would mask real
 * engine problems (e.g., a mis-configured KataGo backend) behind
 * silent repeated timeouts.
 */
const KATAGO_ANALYSIS_TIMEOUT_MS = 30_000;

/**
 * Per-board in-flight analysis-wait controllers.
 *
 * Module-scope rather than per-composable-instance: the composable
 * is instantiated once per App.vue setup, so a module-scope Map
 * matches the runtime reality of "one canonical registry across
 * the app." Module-scoping is also what lets `closeBoard` and
 * `resetWorkspace` reach in to abort entries — the abort
 * affordance is exposed via `abortBoardReview` and `abortAllReviews`
 * below.
 *
 * Keyed by BoardId rather than using a single controller because
 * the composable serves all boards (boardIdRef.value changes as
 * the user switches tabs). A single-slot controller would let
 * loadCard on board B abort an in-flight wait on board A,
 * silently wedging A in ANALYZING. The per-board map keeps each
 * board's cancellation scope isolated.
 *
 * Lifetime: an entry is added when processUserMove starts a wait,
 * and deleted when the wait settles (success, timeout, or abort).
 * loadCard aborts and deletes an entry as part of transitioning
 * into a new card. closeBoard and resetWorkspace abort entries
 * for the boards they're tearing down — without that, the
 * AbortController would persist until the 30s timeout fires, at
 * which point the timeout branch would surface a "KataGo did not
 * respond" toast for a closed board AND resurrect the just-deleted
 * `store.session.reviews[boardId]` row via `mutateReviewSession`'s
 * lazy initialization. Resource-ownership audit O5 / O11.
 */
const pendingAnalysisAborts = new Map<BoardId, AbortController>();

/**
 * Abort the in-flight analysis-wait for `boardId`, if any. The
 * waitForAnalysis promise rejects with `AnalysisWaitError('aborted')`
 * which processUserMove's catch silent-returns on — no toast, no
 * reviews-row resurrection. Safe to call when no wait is in flight
 * (no-op).
 */
export function abortBoardReview(boardId: BoardId): void {
  const controller = pendingAnalysisAborts.get(boardId);
  if (controller) {
    controller.abort();
    pendingAnalysisAborts.delete(boardId);
  }
}

/**
 * Abort every in-flight analysis-wait. Used by `resetWorkspace` on
 * identity flip so prior-identity timeouts can't fire 30s into the
 * new identity's session and pollute its `store.session.reviews`
 * with phantom rows keyed to the prior identity's BoardIds.
 */
export function abortAllReviews(): void {
  for (const controller of pendingAnalysisAborts.values()) {
    controller.abort();
  }
  pendingAnalysisAborts.clear();
}

export function useReviewSession(boardIdRef: Ref<BoardId | null>) {
  // ── Safe Projections ──
  const reviewData = computed(() => {
    const id = boardIdRef.value;
    return id ? store.session.reviews[id] : null;
  });

  const state = computed<ReviewStatus>(() => reviewData.value?.status ?? 'IDLE');
  const queue = computed<ReviewCard[]>(() => reviewData.value?.queue ?? []);
  const currentIndex = computed(() => reviewData.value?.currentIndex ?? -1);
  const userMovesCount = computed(() => reviewData.value?.userMovesCount ?? 0);
  const userMoveScores = computed(() => reviewData.value?.userMoveScores ?? []);

  const currentCard = computed(() => 
    currentIndex.value >= 0 && currentIndex.value < queue.value.length 
      ? queue.value[currentIndex.value] 
      : null
  );

  // Module-scope `pendingAnalysisAborts` (declared at file top) is
  // the per-board in-flight analysis-wait registry; see its block
  // comment at the top of this file for the lifecycle contract and
  // the closeBoard / resetWorkspace integration shape.

  /**
   * Derived value — the maxVisits count that WILL be used on the next
   * submitted move. Resolution order (most specific to least):
   *   1. Per-card sticky override set by the user via setVisitsOverride.
   *   2. The current card's defaultVisits (from mint time).
   *   3. ABSOLUTE_FALLBACK_VISITS (safety net; should never fire in
   *      practice for a correctly-minted card).
   *
   * This is what the UI binds to for the visits input, and what
   * processUserMove passes to analysisService. Keeping resolution in
   * one place means the UI and the engine call cannot disagree about
   * which value is "active" — they read the same computed.
   */
  const effectiveVisits = computed<number>(() =>
    reviewData.value?.visitsOverride
      ?? currentCard.value?.defaultVisits
      ?? ABSOLUTE_FALLBACK_VISITS
  );

  /**
   * Set the per-card sticky visits override. Persists through every
   * subsequent move within the same card (bang-bang semantics); reset
   * to null automatically on loadCard when a new card becomes active.
   *
   * Invalid inputs (non-finite, <1) are silently refused so the UI
   * can pipe values through without its own validation layer. The
   * input's client-side `min="1"` handles the common case.
   */
  function setVisitsOverride(value: number): void {
    const bId = boardIdRef.value;
    if (!bId) return;
    if (!Number.isFinite(value) || value < 1) return;
    const clean = Math.round(value);
    mutateReviewSession(bId, draft => { draft.visitsOverride = clean; });
  }

  /**
   * Starts a new Sparring Session against a pre-fetched queue of
   * cards. The caller is responsible for running the deck pipeline
   * (typically via `useCardTreeData.runPipeline`) and handing the
   * matched cards in here. The cards-tab-merge arc collapses two
   * backend round-trips (pipeline + start-session) to one — this
   * signature is the load-bearing change.
   *
   * If `prefetchedQueue` is empty, the session goes straight to
   * IDLE without spinning up state. The caller should typically
   * surface that to the user via the slot's `error` field; this
   * composable only owns the per-board review state.
   */
  async function startSession(prefetchedQueue: ReviewCard[]) {
    const bId = boardIdRef.value;
    if (!bId) return;

    if (prefetchedQueue.length === 0) {
      mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
      return;
    }

    mutateReviewSession(bId, draft => {
      draft.status = 'LOADING';
      draft.queue = prefetchedQueue;
    });

    try {
      await loadCard(0);
    } catch (err) {
      console.error('[ReviewSession] Failed to start session:', err);
      mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
    }
  }
  
  async function loadCard(index: number) {
    const bId = boardIdRef.value;
    if (!bId) return;

    const card = queue.value[index];
    if (!card) return;

    // Cancel any in-flight analysis wait for this board before
    // starting the new card. If the previous card's processUserMove
    // is mid-wait, its promise rejects with 'aborted' and silently
    // returns — we take ownership of the status from here on.
    pendingAnalysisAborts.get(bId)?.abort();
    pendingAnalysisAborts.delete(bId);

    // Reset per-card state. `visitsOverride` goes back to null so the
    // new card's defaultVisits takes effect; the user can re-override
    // if they want a different starting point for this card.
    mutateReviewSession(bId, draft => {
      draft.status = 'LOADING';
      draft.currentIndex = index;
      draft.userMovesCount = 0;
      draft.userMoveScores = [];
      draft.visitsOverride = null;
    });

    try {
      const sabakiTrees = sgf.parse(card.sgf);
      const parsedBoard = loadSgf(sabakiTrees);
      // Stamp the lineage source onto the board so a subsequent mint
      // from this exploration session populates `parent_card_id`
      // correctly (consumed by `useMinting.prepareDraft`). Set before
      // either branch below so the addBoard fallback also carries it.
      parsedBoard.sourceCardId = card.id;

      // Mutate the active board to become the loaded card
      const existingIdx = store.boards.findIndex(b => b.id === bId);
      if (existingIdx !== -1) {
        parsedBoard.id = bId as any; // Retain the tab ID
        updateBoardState(existingIdx, parsedBoard);
      } else {
        addBoard(parsedBoard);
      }

      // Fast-forward to the end of the SGF's pre-defined mainline
      const path = getActiveVariationPath(parsedBoard);
      const targetLeafId = path[path.length - 1] as NodeId;
      
      mutateBoard(bId, draft => { 
        navigateTo(draft, targetLeafId); 
      });

      mutateReviewSession(bId, draft => {
        draft.startingNodeId = targetLeafId;
        draft.status = 'AWAITING_MOVE';
      });
      
      // Enter "Blind Mode"
      store.session.ui.showMoveSuggestions = false;
      store.session.ui.treeExpanded = false; 

    } catch (err) {
      console.error('[ReviewSession] Failed to load card SGF:', err);
      mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
    }
  }

  async function processUserMove(x: number, y: number) {
    const bId = boardIdRef.value;
    if (!bId) return;

    const board = store.boards.find(b => b.id === bId);
    if (!board) return;

    const path = getActiveVariationPath(board);
    const s_0_idx = path.indexOf(board.currentNodeId);

    const nextBoard = applyGoMove(board, x, y);
    if (!nextBoard) return; 
    
    updateBoardState(store.activeBoardIndex, nextBoard);
    mutateReviewSession(bId, draft => { 
      draft.status = 'ANALYZING'; 
      draft.userMovesCount++;
    });

    const s_1_id = nextBoard.currentNodeId as NodeId;
    const s_1_idx = s_0_idx + 1;

    const rawConfig = currentCard.value?.gradingParameter?.data?.analysis_config;
    const configOverride = rawConfig ? rawConfig : undefined;
    const hash = configOverride ? hashConfig(configOverride) : activeConfigHash.value;
    // Single source of truth for the visits count — effectiveVisits
    // encapsulates the override-vs-default precedence. See the
    // computed's docstring for the resolution order.
    const visits = effectiveVisits.value;

    const newPath = getActiveVariationPath(nextBoard) as NodeId[];
    analysisService.analyzeRange(nextBoard.id, newPath, s_0_idx, s_1_idx, visits, configOverride);

    // Set up a fresh abort controller for this wait. loadCard will
    // trigger it if the user transitions cards while we're waiting.
    // A previous controller for the same board (shouldn't exist in
    // a well-behaved state machine, but defensive) is aborted first.
    pendingAnalysisAborts.get(bId)?.abort();
    const controller = new AbortController();
    pendingAnalysisAborts.set(bId, controller);

    let s_1_packet;
    try {
      s_1_packet = await waitForAnalysis(hash, s_1_id, s_1_idx, {
        timeoutMs: KATAGO_ANALYSIS_TIMEOUT_MS,
        signal: controller.signal,
      });
    } catch (err) {
      // Clean up our map entry only if the slot is still ours (a
      // later processUserMove or loadCard may have replaced it).
      if (pendingAnalysisAborts.get(bId) === controller) {
        pendingAnalysisAborts.delete(bId);
      }

      if (err instanceof AnalysisWaitError) {
        if (err.reason === 'timeout') {
          pushSystemMessage(
            'warning',
            i18n.global.t('review.kataGoTimeout', { seconds: KATAGO_ANALYSIS_TIMEOUT_MS / 1000 }),
          );
          mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
        }
        // For 'aborted': silently return. The aborter (loadCard,
        // etc.) owns the post-abort status transition.
        return;
      }
      throw err; // unexpected — propagate
    }

    // Success path. Drop the map entry before continuing, again
    // guarded against a later replacement having overwritten us.
    if (pendingAnalysisAborts.get(bId) === controller) {
      pendingAnalysisAborts.delete(bId);
    }

    const userColor = nextBoard.nodes[s_1_id].move!.color;
    const colorKey = userColor === 'B' ? 'black' : 'white';
    
    let delta = 0.5; 
    const proxyDeltas = s_1_packet.extra?.[colorKey]?.deltas;
    
    if (proxyDeltas) {
      let colorMoveCount = 0;
      for (let i = 0; i <= s_1_idx; i++) {
        if (nextBoard.nodes[newPath[i]]?.move?.color === userColor) {
          colorMoveCount++;
        }
      }
      const n = colorMoveCount - 1;

      if (proxyDeltas[n] !== undefined) {
        delta = proxyDeltas[n];
      }
    }
    
    mutateReviewSession(bId, draft => { draft.userMoveScores.push(delta); });

    if (userMovesCount.value < currentCard.value!.numMoves) {
      // Same defensive moveInfos guard as use-move-suggestions.ts: the
      // wire type declares moveInfos required but the proxy can deliver
      // packets where it is absent. Skip best-move follow-through if so.
      const bestMoveInfo = s_1_packet.moveInfos?.find(m => m.order === 0);
      if (bestMoveInfo) {
        const coords = gtpToBoard(bestMoveInfo.move);
        if (coords) {
          const engineBoard = applyGoMove(store.boards.find(b => b.id === bId)!, coords.x, coords.y);
          if (engineBoard) updateBoardState(store.activeBoardIndex, engineBoard);
        }
      }
      mutateReviewSession(bId, draft => { draft.status = 'AWAITING_MOVE'; });
    } else {
      await finishCard();
    }
  }

  async function finishCard() {
    const bId = boardIdRef.value;
    if (!bId) return;

    mutateReviewSession(bId, draft => { draft.status = 'FINISHED'; });
    store.session.ui.showMoveSuggestions = true;

    try {
      await backendService.submitReview(currentCard.value!.id, userMoveScores.value);
      rewindToStart();
    } catch (err) {
      console.error('[ReviewSession] Failed to submit review:', err);
    }
  }

  function nextCard() {
    if (currentIndex.value + 1 < queue.value.length) {
      loadCard(currentIndex.value + 1);
    } else {
      // No more cards in the queue — end the session and let the
      // host UI return to its idle shape (deck-config form). The
      // prior implementation set status to IDLE but left
      // currentIndex/queue in place; the panel-gating predicate
      // `currentCard !== null` then stayed true and kept the
      // ReviewSessionPanel mounted with no way out. Calling
      // endSession() resets the queue and currentIndex too, so
      // the Cards tab cleanly returns to the deck-config form.
      endSession();
    }
  }

  /**
   * Stop the current review session and reset the per-board state
   * to a clean IDLE shape (empty queue, no current card, scores
   * cleared). Aborts any in-flight analysis-wait so the 30s
   * timeout can't fire later and resurrect the just-cleared row
   * via mutateReviewSession's lazy-init path.
   *
   * Used by:
   *   - The "End Session" button in `ReviewSessionPanel.vue`
   *     (visible during all non-IDLE states).
   *   - `nextCard()` past the end of the queue, replacing the
   *     prior IDLE-only-status + alert behaviour.
   *
   * Per-card review scores are submitted via `submitReview` at
   * each `finishCard` call, so ending mid-session loses only the
   * current card's in-flight scores (the moves the user has made
   * but hasn't yet completed the card on). Cards already finished
   * during the session are not affected.
   *
   * Safe to call at any time; idempotent on an already-IDLE board.
   */
  function endSession() {
    const bId = boardIdRef.value;
    if (!bId) return;

    // Cancel any in-flight analysis-wait for this board. The wait
    // promise rejects with AnalysisWaitError('aborted') which
    // processUserMove's catch silent-returns on. Same shape as
    // loadCard's pre-transition cleanup.
    pendingAnalysisAborts.get(bId)?.abort();
    pendingAnalysisAborts.delete(bId);

    mutateReviewSession(bId, draft => {
      draft.status = 'IDLE';
      draft.queue = [];
      draft.currentIndex = -1;
      draft.startingNodeId = null;
      draft.userMovesCount = 0;
      draft.userMoveScores = [];
      draft.visitsOverride = null;
    });

    // Move-suggestions visibility was flipped off by loadCard
    // ("Blind Mode") and on by finishCard. Restore the default
    // here too so the post-session board state matches a fresh
    // browse-mode session.
    store.session.ui.showMoveSuggestions = true;
  }

  function rewindToStart() {
    const bId = boardIdRef.value;
    const startId = reviewData.value?.startingNodeId;
    if (bId && startId) {
      mutateBoard(bId, draft => {
        navigateTo(draft, startId);
      });
    }
  }

  return {
    state,
    queue,
    currentCard,
    startSession,
    nextCard,
    rewindToStart,
    processUserMove,
    userMovesCount,
    userMoveScores,
    effectiveVisits,
    setVisitsOverride,
    endSession,
  };
}
