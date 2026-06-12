/**
 * src/composables/review/useReviewSession.ts
 * Orchestrates the Spaced Repetition (Ebisu) Sparring flow.
 * Now fully multi-tenant, projecting state from the GlobalStore.
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
/**
 * Returns true when the review session is in a transient state where
 * board interaction (click-to-play or paste-PV) would race the SR
 * lifecycle: LOADING positions the board from the card SGF; ANALYZING
 * reads the just-played position to compute the per-move grade.
 * Mutating the board tree in either state would corrupt the analysis
 * anchor or the grade read. Used by App.vue's handleBoardMove and
 * handlePastePv to gate both entry points with the same predicate.
 *
 * ADR-0011 Rule 4: the predicate quantifies over the class (the
 * ReviewStatus type) rather than being an inline copy at each call
 * site — a new entry point that should be blocked needs to add a
 * call, not another copy of the LOADING/ANALYZING literals.
 */
export function isReviewTransientState(status) {
    return status === 'LOADING' || status === 'ANALYZING';
}
import { store, addBoard, mutateBoard, updateBoardState, mutateReviewSession, pushSystemMessage } from '../../store';
import { i18n } from '../../i18n';
import { backendService } from '../../services/backend-service';
import { analysisService } from '../../services/analysis-service';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys, deriveAnalysisKeys, } from '../../state/analysis-config';
import { waitForAnalysis, AnalysisWaitError } from '../analysis/wait-for-analysis';
import { blindModePrefs } from './blind-mode-prefs';
import { KATAGO_ANALYSIS_TIMEOUT_MS } from '../../lib/timing';
// @ts-ignore
import sgf from '@sabaki/sgf';
import { loadSgf } from '../../engine/sgf-loader';
import { getPath, navigateTo } from '../../engine/navigator';
import { getActiveVariationPath } from '../../engine/util';
import { scorePerMoveDelta } from '../../engine/analysis/review-scoring';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from '../board/use-move-suggestions';
/**
 * Absolute fallback used when a card somehow arrives without a
 * `defaultVisits` value AND the user hasn't set an override. Should
 * be rare in practice — all cards minted through the current flow
 * carry a default_visits from the minting modal.
 */
const ABSOLUTE_FALLBACK_VISITS = 1000;
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
const pendingAnalysisAborts = new Map();
/**
 * Abort the in-flight analysis-wait for `boardId`, if any. The
 * waitForAnalysis promise rejects with `AnalysisWaitError('aborted')`
 * which processUserMove's catch silent-returns on — no toast, no
 * reviews-row resurrection. Safe to call when no wait is in flight
 * (no-op).
 */
export function abortBoardReview(boardId) {
    const controller = pendingAnalysisAborts.get(boardId);
    if (controller) {
        controller.abort();
        pendingAnalysisAborts.delete(boardId);
    }
    // Blind-mode prefs: no explicit release here. The snapshot owner's
    // release is watcher-driven (blind-mode-prefs.ts): its exit
    // predicate reads the owner board's `store.session.reviews` row,
    // and closeBoard — this helper's only caller — deletes that row
    // via the BOARD_SCOPED_STORE_CELLS drain BEFORE invoking this
    // helper, so the snapshot is already released by the time this
    // runs. (The prior explicit release(boardId) call here was one of
    // the three hand-enumerated exit hooks PR #382's out-of-frame
    // audit found non-quantifying; the watcher replaces the set.)
}
/**
 * Abort every in-flight analysis-wait. Used by `resetWorkspace` on
 * identity flip so prior-identity timeouts can't fire 30s into the
 * new identity's session and pollute its `store.session.reviews`
 * with phantom rows keyed to the prior identity's BoardIds.
 */
export function abortAllReviews() {
    for (const controller of pendingAnalysisAborts.values()) {
        controller.abort();
    }
    pendingAnalysisAborts.clear();
    // Identity flip / workspace reset: release the blind-mode pref
    // snapshot EXPLICITLY, not via the owner's exit watcher — the one
    // deliberately-kept manual release, justified by a real ordering
    // hazard. resetWorkspace calls this helper BEFORE replacing
    // `store.session`; left to the watcher, the release would fire
    // only at the replacement and restore the prior identity's pref
    // values into the NEW session's ui. The explicit releaseAll
    // restores into the outgoing session record, which the replacement
    // then discards wholesale — the identity-flip-correct order.
    // Idempotent against the watcher: the watcher observes a null
    // snapshot afterwards and no-ops.
    blindModePrefs.releaseAll();
}
export function useReviewSession(boardIdRef) {
    // ── Safe Projections ──
    const reviewData = computed(() => {
        const id = boardIdRef.value;
        return id ? store.session.reviews[id] : null;
    });
    const state = computed(() => reviewData.value?.status ?? 'IDLE');
    const queue = computed(() => reviewData.value?.queue ?? []);
    const currentIndex = computed(() => reviewData.value?.currentIndex ?? -1);
    const userMovesCount = computed(() => reviewData.value?.userMovesCount ?? 0);
    const userMoveScores = computed(() => reviewData.value?.userMoveScores ?? []);
    const currentCard = computed(() => currentIndex.value >= 0 && currentIndex.value < queue.value.length
        ? queue.value[currentIndex.value]
        : null);
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
    const effectiveVisits = computed(() => reviewData.value?.visitsOverride
        ?? currentCard.value?.defaultVisits
        ?? ABSOLUTE_FALLBACK_VISITS);
    /**
     * Set the per-card sticky visits override. Persists through every
     * subsequent move within the same card (bang-bang semantics); reset
     * to null automatically on loadCard when a new card becomes active.
     *
     * Invalid inputs (non-finite, <1) are silently refused so the UI
     * can pipe values through without its own validation layer. The
     * input's client-side `min="1"` handles the common case.
     */
    function setVisitsOverride(value) {
        const bId = boardIdRef.value;
        if (!bId)
            return;
        if (!Number.isFinite(value) || value < 1)
            return;
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
    async function startSession(prefetchedQueue) {
        const bId = boardIdRef.value;
        if (!bId)
            return;
        // Card-metadata inline-edit arc 2 (2026-05-13): drop suspended
        // cards from the review queue before starting. The pipeline DSL
        // doesn't currently express suspension as a predicate, so the
        // filter lives here at the queue boundary — applies uniformly
        // whether the queue came from `tree.runPipeline` (the
        // ForestDirectory deck-run path) or from the autonomous-SR
        // driver. If the deck DSL eventually grows a `~$suspended`
        // virtual tag, this filter becomes a defensive fallback.
        const filtered = prefetchedQueue.filter(c => !c.suspended);
        const dropped = prefetchedQueue.length - filtered.length;
        if (filtered.length === 0) {
            // Loud failure (ADR-0002): silently IDLEing when every matched
            // card was suspended makes the UI look broken — the user sees
            // their pipeline produce a non-empty active set in the forest
            // but "Start Review Session" does nothing. Surface the
            // "every card suspended" case explicitly so the user knows
            // what happened and where to look. The empty-queue case
            // (prefetchedQueue itself was empty) keeps the silent IDLE
            // since the pipeline already gave nothing to act on.
            if (prefetchedQueue.length > 0) {
                pushSystemMessage('warning', i18n.global.t('review.session.allSuspended', {
                    n: prefetchedQueue.length,
                }));
            }
            mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
            return;
        }
        if (dropped > 0) {
            // Partial suspension — surface the count so the user knows the
            // queue is smaller than the forest's active set indicates.
            pushSystemMessage('info', i18n.global.t('review.session.someSuspended', {
                dropped,
                total: prefetchedQueue.length,
            }));
        }
        mutateReviewSession(bId, draft => {
            draft.status = 'LOADING';
            draft.queue = filtered;
        });
        try {
            await loadCard(0);
        }
        catch (err) {
            console.error('[ReviewSession] Failed to start session:', err);
            mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
        }
    }
    async function loadCard(index) {
        const bId = boardIdRef.value;
        if (!bId)
            return;
        const card = queue.value[index];
        if (!card)
            return;
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
            const sabakiTrees = sgf.parse(card.canonicalContent);
            const parsedBoard = loadSgf(sabakiTrees);
            // Stamp the lineage source onto the board so a subsequent mint
            // from this exploration session populates `parent_card_id`
            // correctly (consumed by `useMinting.prepareDraft`). Set before
            // either branch below so the addBoard fallback also carries it.
            parsedBoard.sourceCardId = card.id;
            // Mutate the active board to become the loaded card
            const existingIdx = store.boards.findIndex(b => b.id === bId);
            if (existingIdx !== -1) {
                // Retain the tab ID: both sides are BoardId (loadSgf mints a fresh
                // branded id; we overwrite it with the existing tab's), so no cast.
                parsedBoard.id = bId;
                updateBoardState(existingIdx, parsedBoard);
            }
            else {
                addBoard(parsedBoard);
            }
            // Fast-forward to the end of the SGF's pre-defined mainline —
            // root→leaf is the genuine shape here (the card-load leaf of the
            // branded-path arc; the brand arrives from the producer).
            const path = getActiveVariationPath(parsedBoard);
            const targetLeafId = path[path.length - 1];
            mutateBoard(bId, draft => {
                navigateTo(draft, targetLeafId);
            });
            mutateReviewSession(bId, draft => {
                draft.startingNodeId = targetLeafId;
                draft.status = 'AWAITING_MOVE';
            });
            // Enter "Blind Mode" through the pref owner: snapshot the
            // user's pre-review values once per session (capture is
            // idempotent across the session's loadCard calls), then apply
            // the blind overrides as owned writes. Release is watcher-
            // driven: capture arms a sync watcher on this board's review
            // status, and ANY exit out of the active states — endSession's
            // IDLE, every failure-path IDLE in this file, closeBoard's
            // row deletion — restores the snapshot; there is no per-exit
            // release call to forget. A manual mid-review toggle updates
            // the snapshot (the user's new choice wins). See
            // blind-mode-prefs.ts.
            blindModePrefs.capture(bId);
            blindModePrefs.write('showMoveSuggestions', false);
            blindModePrefs.write('treeExpanded', false);
        }
        catch (err) {
            // Surface a corrupt card SGF to the user (ADR-0002 level 4): the
            // card's stored content failed to parse / load (unparseable tree,
            // bad SZ geometry, or a malformed coordinate `loadSgf` rejects).
            // The status reset alone left the user staring at an unchanged
            // board with no explanation; the message names the fault. Same
            // file-trust boundary as the file-pick path in `useSgfLoader`.
            const detail = err instanceof Error ? err.message : String(err);
            pushSystemMessage('error', i18n.global.t('sgf.loadFailed', { detail }));
            console.error('[ReviewSession] Failed to load card SGF:', err);
            mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
        }
    }
    async function processUserMove(x, y) {
        const bId = boardIdRef.value;
        if (!bId)
            return;
        const board = store.boards.find(b => b.id === bId);
        if (!board)
            return;
        // The cursor's turn index is a root→current question ("how many
        // nodes from root to the position the user is playing from?") —
        // the prior `getActiveVariationPath(...).indexOf(current)` walked
        // the whole active line to answer it (equivalent value, wrong
        // shape; history-lessons audit §3.4 / match postmortem §5b).
        const s_0_idx = getPath(board.nodes, board.currentNodeId).length - 1;
        const s_0_id = board.currentNodeId;
        const nextBoard = applyGoMove(board, x, y);
        if (!nextBoard)
            return;
        updateBoardState(store.activeBoardIndex, nextBoard);
        mutateReviewSession(bId, draft => {
            draft.status = 'ANALYZING';
            draft.userMovesCount++;
        });
        const s_1_id = nextBoard.currentNodeId;
        const s_1_idx = s_0_idx + 1;
        // Two-leg replay descriptor: palette (`analysis_config`) +
        // KataGo runtime overrides (`overrideSettings`). The hash
        // combines both via the descriptor helper so cards minted under
        // different overrides (e.g. a 'WHITE'-framed card vs. a
        // 'BLACK'-framed one) bucket separately in the ledger. Legacy
        // cards minted before the overrideSettings field existed leave
        // `rawOverrides` undefined, which the analyze-service interprets
        // as "no overrides on the wire" — preserving the no-overrides
        // analysis posture the card was minted under instead of bleeding
        // the user's current registry overrideSettings into the replay.
        const rawConfig = currentCard.value?.gradingParameter?.data?.analysis_config;
        const rawOverrides = currentCard.value?.gradingParameter?.data?.overrideSettings;
        const configOverride = rawConfig ? rawConfig : undefined;
        const overrideSettingsOverride = configOverride !== undefined &&
            rawOverrides &&
            typeof rawOverrides === 'object' &&
            !Array.isArray(rawOverrides)
            ? rawOverrides // checked non-null non-array object above; narrow the untyped overrides blob to a record
            : undefined;
        // Read the current SELECTOR target live so a card replay under a
        // different network buckets separately in the ledger from a prior
        // replay under another network. `activeAnalysisKeys` already
        // accounts for this in the no-configOverride branch (its source
        // reads `store.engine.selectedModel` too). `rawKey` keys the raw
        // waits below; `enrichedKey` keys the per-move delta lookup.
        const keys = configOverride
            ? deriveAnalysisKeys(configOverride, overrideSettingsOverride, store.engine.selectedModel ?? undefined)
            : activeAnalysisKeys.value;
        // Single source of truth for the visits count — effectiveVisits
        // encapsulates the override-vs-default precedence. See the
        // computed's docstring for the resolution order.
        const visits = effectiveVisits.value;
        // Root→current (of `nextBoard`, whose cursor is the just-played
        // s_1): the analyzed range ends at s_1 and the engine's move list
        // must stop there. The prior `getActiveVariationPath(nextBoard)`
        // coincided with this in the common case (a fresh user move makes
        // s_1 the leaf) but would have included pre-existing forward
        // variation past s_1 when `applyGoMove` dedups into an existing
        // child — the same root→leaf-vs-root→current confusion class as
        // the match postmortem's Bug B, here latent rather than biting.
        const newPath = getPath(nextBoard.nodes, nextBoard.currentNodeId);
        // Two trailing booleans documented at the call site:
        //   forReview=true: visit count is load-bearing for grading
        //     (delta read against the card's defaultVisits), so
        //     adaptive_reevaluate's deeper-pass visit-count inflation
        //     must NOT engage on this query. Independent of whether
        //     the card carries a recorded analysis_config — legacy
        //     cards (configOverride undefined) are still review
        //     sessions and need the same protection.
        //   isRealtime=false: no `reportDuringSearchEvery` on the wire
        //     so the proxy doesn't emit during-search packets the
        //     review session never reads (waitForAnalysis filters on
        //     isDuringSearch=false; the intermediate packets just
        //     churn the ledger).
        // Capture the queryId so the post-wait cleanup can release the
        // analysis-service entry explicitly. The implicit
        // `stopBoardAnalysis`-at-the-head pattern that previously did
        // this cleanup was removed when range / ponder / replay became
        // coexistable on the same board (per
        // `docs/notes/per-board-multi-query-model-plan.md`'s
        // "Review-session audit"). All three terminal branches below
        // (success, timeout, abort) call `analysisService.stopQuery`
        // before transitioning so a leftover `activeQueries` entry can
        // never accumulate across moves, and so the timeout branch
        // actively terminates the hung query on the proxy side rather
        // than letting it consume KataGo compute indefinitely.
        const reviewQueryId = analysisService.analyzeRange(nextBoard.id, newPath, s_0_idx, s_1_idx, visits, configOverride, overrideSettingsOverride, true, false);
        // Set up a fresh abort controller for this wait. loadCard will
        // trigger it if the user transitions cards while we're waiting.
        // A previous controller for the same board (shouldn't exist in
        // a well-behaved state machine, but defensive) is aborted first.
        pendingAnalysisAborts.get(bId)?.abort();
        const controller = new AbortController();
        pendingAnalysisAborts.set(bId, controller);
        let s_1_packet;
        try {
            // Wait for BOTH s_0 and s_1 final (raw) packets. The proxy attaches
            // the per-move delta to whichever packet on the analyzed range
            // it chose — most often the s_0 packet (the position the move
            // was played FROM, since the delta_fn references `x[0]` = the
            // pre-move state). KataGo can emit the s_1 final packet before
            // s_0 under cache hits and parallel-search races; if we only
            // awaited s_1, the enrichment path-scan below would miss a delta
            // that's about to land on s_0. Promise.all rejects on the first
            // failure (timeout / abort), preserving the existing catch
            // handling. The fuzzing harness in `tests/e2e/` reproducibly
            // surfaces this race when only s_1 is awaited. The wait keys by
            // `rawKey` (the raw final packet is the existence/settle anchor and
            // carries `moveInfos` for the best-move follow-through below); the
            // per-move delta is read from the enrichment store. Both halves are
            // recorded in the same `onAnalysisUpdate` tick, so the enrichment is
            // present once the raw final has settled.
            const waitOpts = { timeoutMs: KATAGO_ANALYSIS_TIMEOUT_MS, signal: controller.signal };
            const [, s1] = await Promise.all([
                waitForAnalysis(keys.rawKey, s_0_id, s_0_idx, waitOpts),
                waitForAnalysis(keys.rawKey, s_1_id, s_1_idx, waitOpts),
            ]);
            s_1_packet = s1;
        }
        catch (err) {
            // Clean up our map entry only if the slot is still ours (a
            // later processUserMove or loadCard may have replaced it).
            if (pendingAnalysisAborts.get(bId) === controller) {
                pendingAnalysisAborts.delete(bId);
            }
            // Release the analysis-service entry. In the timeout branch
            // this terminates the hung query on the proxy side; in the
            // abort branch the wait was cancelled by the next
            // loadCard/endSession/closeBoard and the query is now stale.
            // `stopQuery` is idempotent on an already-released queryId
            // (defensive against the rare case where closeBoard / disconnect
            // raced the wait and already released the entry via the bulk
            // path).
            if (reviewQueryId !== null) {
                analysisService.stopQuery(reviewQueryId);
            }
            if (err instanceof AnalysisWaitError) {
                if (err.reason === 'timeout') {
                    pushSystemMessage('warning', i18n.global.t('review.kataGoTimeout', { seconds: KATAGO_ANALYSIS_TIMEOUT_MS / 1000 }));
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
        // Release the analysis-service entry on success too. Both
        // `waitForAnalysis` promises resolved on `isDuringSearch=false`
        // packets, so the proxy has finished emitting for this query;
        // the `terminate` wire packet `stopQuery` sends is a no-op on
        // the proxy side but releases the SPA-side bookkeeping
        // (`activeQueries`, `activeSubscriptions`, `restartCallbacks`,
        // `boardToQueries`, telemetry).
        if (reviewQueryId !== null) {
            analysisService.stopQuery(reviewQueryId);
        }
        // Per-move delta scoring is the named engine seam (ADR-0003:
        // "the orchestration is portable; the scoring extraction is
        // not") — `scorePerMoveDelta` in `engine/analysis/review-scoring.ts`
        // owns the per-colour indexing and the load-bearing
        // s_1-fast-path-then-path-scan lookup order. The enrichment read
        // is passed as an accessor so the engine band stays
        // services-clean: the ledger import (and the `enrichedKey`
        // binding) stays on this side of the seam.
        const scored = scorePerMoveDelta(nextBoard.nodes, newPath, s_1_idx, s_1_id, nodeId => ledger.getEnrichment(keys.enrichedKey, nodeId));
        if (scored.kind === 'missing') {
            // Structured loud failure from the scoring seam — a missing
            // per-move delta is a wire-boundary contract failure, never a
            // default score (ADR-0002 rationale at the `missing` branch in
            // review-scoring.ts). Surface, cancel the session, and let the
            // user investigate before any score is persisted.
            pushSystemMessage('warning', i18n.global.t('review.missingPerMoveDelta', {
                color: scored.color,
                index: scored.perColorIndex,
            }));
            mutateReviewSession(bId, draft => { draft.status = 'IDLE'; });
            return;
        }
        mutateReviewSession(bId, draft => { draft.userMoveScores.push(scored.delta); });
        if (userMovesCount.value < currentCard.value.numMoves) {
            // Same defensive moveInfos guard as use-move-suggestions.ts: the
            // wire type declares moveInfos required but the proxy can deliver
            // packets where it is absent. Skip best-move follow-through if so.
            const bestMoveInfo = s_1_packet.moveInfos?.find(m => m.order === 0);
            if (bestMoveInfo) {
                const coords = gtpToBoard(bestMoveInfo.move);
                if (coords) {
                    const engineBoard = applyGoMove(store.boards.find(b => b.id === bId), coords.x, coords.y);
                    if (engineBoard)
                        updateBoardState(store.activeBoardIndex, engineBoard);
                }
            }
            mutateReviewSession(bId, draft => { draft.status = 'AWAITING_MOVE'; });
        }
        else {
            await finishCard();
        }
    }
    async function finishCard() {
        const bId = boardIdRef.value;
        if (!bId)
            return;
        mutateReviewSession(bId, draft => { draft.status = 'FINISHED'; });
        // Intermission reveal — deliberate pedagogy, maintainer-approved
        // 2026-06-10 (history-lessons audit §7.3): after the blind
        // attempt, suggestions become visible so the user can study the
        // engine's view of their moves. An owned write, NOT a restore —
        // the user's pre-review `showMoveSuggestions` comes back at
        // endSession / abort. `treeExpanded`, by contrast, IS restored to
        // the user's pre-review value here: the tree carries no grading
        // reveal, so the intermission has no claim over it.
        blindModePrefs.write('showMoveSuggestions', true);
        blindModePrefs.restoreKeys(['treeExpanded']);
        try {
            await backendService.submitReview(currentCard.value.id, userMoveScores.value);
            rewindToStart();
        }
        catch (err) {
            console.error('[ReviewSession] Failed to submit review:', err);
        }
    }
    function nextCard() {
        if (currentIndex.value + 1 < queue.value.length) {
            // Fire-and-forget; loadCard self-handles (catch → status IDLE).
            void loadCard(currentIndex.value + 1);
        }
        else {
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
        if (!bId)
            return;
        // Cancel any in-flight analysis-wait for this board. The wait
        // promise rejects with AnalysisWaitError('aborted') which
        // processUserMove's catch silent-returns on. Same shape as
        // loadCard's pre-transition cleanup.
        pendingAnalysisAborts.get(bId)?.abort();
        pendingAnalysisAborts.delete(bId);
        // The status→IDLE write below is also the blind-mode release:
        // the pref owner's exit watcher fires on it synchronously
        // (blind-mode-prefs.ts) and every key the session flipped
        // (loadCard's blind writes, finishCard's reveal) returns to the
        // user's pre-review value — these are persisted prefs, so the
        // old unconditional force-true clobbered an off preference and
        // the clobber survived reloads (history-lessons audit §3.7
        // leg (ii)). A manual mid-review toggle updated the snapshot, so
        // the restore lands on the user's latest choice.
        mutateReviewSession(bId, draft => {
            draft.status = 'IDLE';
            draft.queue = [];
            draft.currentIndex = -1;
            draft.startingNodeId = null;
            draft.userMovesCount = 0;
            draft.userMoveScores = [];
            draft.visitsOverride = null;
        });
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
