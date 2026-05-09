// @vitest-environment node

/**
 * tests/e2e/review-session-harness.test.ts
 *
 * End-to-end fuzzing harness for `useReviewSession`. Drives the real
 * composable against a real backend and two real KataProxy instances:
 *
 *   - REVIEW_E2E_STRONG (env): the strong proxy. Used by
 *     `analysisService` for review-time analysis (20 visits per user
 *     move) and by the position generator (100 visits per setup move).
 *
 *   - REVIEW_E2E_WEAK (env): the weak proxy. Used by the human-
 *     simulator (10 visits per "user" move). Lower visits → the
 *     simulator more often plays a non-engine-top move, which
 *     exercises the full delta range across the 7-move card.
 *
 * The harness scores each user-move under the FLAT `visit_ratio`
 * palette (`uservisits / maxvisits`). The flat metric is directly
 * interpretable against the analysis tab's `moveInfos` overlay:
 * playing the engine's most-visited candidate scores 1.0; a move
 * KataGo never sampled scores 0. The assertion is that every
 * `userMoveScore` recorded by the review session matches the score
 * independently computed from the captured pre-move packet.
 *
 * Diagnostic intent: a mismatch isolates a divergence between what
 * the proxy emits and what the review session reads — the failure
 * mode the prior `delta = 0.5` silent fallback was masking, which
 * the path-scan in `useReviewSession` now fixes.
 *
 * Environment: `// @vitest-environment node` is load-bearing.
 * jsdom's WebSocket wrapper has a known defect — it wraps undici and
 * re-dispatches `open` via `setTimeout(() => fireAnEvent("open"), 0)`,
 * but the IDL `onopen` handler set via `ws.onopen = fn` never fires
 * (only `addEventListener` does). `KataGoClient.connect` uses the IDL
 * property, so under jsdom the connection promise never resolves.
 * Node 24's native WebSocket dispatches IDL handlers correctly.
 *
 * Gating: skipped unless BOTH env URLs are set. A normal
 * `npm run test:run` is unaffected; opt in with
 *
 *     REVIEW_E2E_STRONG=ws://192.168.122.1:1234 \
 *     REVIEW_E2E_WEAK=ws://192.168.122.1:1235 \
 *       npm run test:run -- tests/e2e
 *
 * License: Public Domain (The Unlicense)
 */

import { ref } from 'vue';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  store,
  addBoard,
  resetWorkspace,
  mutateReviewSession,
  updateBoardState,
} from '../../src/store';
import { backendService } from '../../src/services/backend-service';
import { analysisService } from '../../src/services/analysis-service';
import { ledger } from '../../src/services/analysis-ledger';
import { useReviewSession } from '../../src/composables/useReviewSession';
import { createInitialBoard } from '../../src/store/board-factory';
import {
  hashConfig,
  compileAnalysisDescriptorFromParts,
} from '../../src/services/analysis-config';
import { serializeActivePath } from '../../src/engine/sgf-writer';
import { applyGoMove } from '../../src/logic';
import { gtpToBoard } from '../../src/composables/use-move-suggestions';
import { getActiveVariationPath } from '../../src/engine/util';
import type {
  BoardId,
  NodeId,
  ReviewCard,
  KataAnalysisResponse,
} from '../../src/types';

import {
  playEngineMoves,
  queryEngineMove,
} from '../../src/composables/usePlayFromPosition';
import { seedTestUser, seedTestCard } from './seed';

// ── Configuration ────────────────────────────────────────────────────────────

const STRONG_URL = process.env.REVIEW_E2E_STRONG;
const WEAK_URL = process.env.REVIEW_E2E_WEAK;

const NUM_PLAY_MOVES = 20;
const REVIEW_VISITS = 100;
const POSITION_GEN_VISITS = 100;
const HUMAN_SIM_VISITS = 30;

// Plenty of headroom — the harness is bounded by network + GPU
// latency, not by the test suite's usual sub-second expectations.
const PER_TEST_TIMEOUT_MS = 10 * 60 * 1000;

// ── Inlined helpers (small, harness-only — no need for separate files) ───────

/**
 * The flat `visit_ratio` palette. Binds `delta_fn: 'visit_ratio'`
 * (proxy stdlib: `_uservisits(x[0]) / _maxvisits(x[0])`) so each
 * user-move score is the unsmoothed visits ratio against the engine's
 * top-visited candidate from the pre-move position. Compared to the
 * production "quality" palette which smooths via `decisiveness ** alpha`,
 * the raw ratio is what we need for differential diagnostics.
 */
function buildFlatVisitRatioPalette() {
  return {
    bindings: {
      delta_fn: 'visit_ratio',
      state_fns: { 'Win Probability': 'winrate' },
      summary_fn: 'min_summary',
    },
    parameters: { alpha: 0.25 },
    symbols: {
      visit_ratio: '_uservisits(x[0]) / _maxvisits(x[0])',
      winrate: 'x["rootInfo"]["winrate"]',
      min_summary: 'float(min(x))',
    },
  };
}

/**
 * Compute the expected `visit_ratio` score for a user-move played
 * from the position whose final settled packet is `packet`. Returns
 * `userVisits / maxVisits`, where `userVisits` is 0 when the move
 * isn't in moveInfos (engine never sampled it at this visit budget).
 */
function expectedVisitRatioDelta(
  packet: KataAnalysisResponse,
  userMoveGtp: string,
): number {
  if (!packet.moveInfos || packet.moveInfos.length === 0) {
    throw new Error(`expectedVisitRatioDelta: packet has no moveInfos (turn=${packet.turnNumber})`);
  }
  const maxVisits = packet.moveInfos.reduce((a, m) => (m.visits > a ? m.visits : a), 0);
  if (maxVisits === 0) {
    throw new Error(`expectedVisitRatioDelta: every moveInfo has visits=0 (turn=${packet.turnNumber})`);
  }
  const userInfo = packet.moveInfos.find((m) => m.move === userMoveGtp);
  return (userInfo?.visits ?? 0) / maxVisits;
}

// stderr is flushed live by Vitest; console.log is buffered until
// test completion. mark() is the diagnostic spine — each major step
// writes a `[harness] …` line so a hang's location is visible in the
// test output stream.
function mark(s: string): void {
  process.stderr.write(`[harness ${new Date().toISOString().slice(11, 23)}] ${s}\n`);
}

// ── Scenario driver ──────────────────────────────────────────────────────────

interface TurnDiagnostic {
  readonly turn: number;
  readonly userColor: 'B' | 'W';
  readonly n: number;
  readonly userMoveGtp: string;
  /** Wall-clock duration of `processUserMove` in milliseconds. */
  readonly elapsedMs: number;
  readonly status: 'ok' | 'missing-delta' | 'timeout' | 'other';
  readonly expected: number | null;
  readonly recorded: number | null;
  /**
   * Per-node, presence of the (colorKey, n) delta key in the
   * packet's `extra`. `null` = no packet in ledger; `false` =
   * packet present but no key; `true` = key present (with value).
   */
  readonly perPathDeltaPresence: readonly { nodeId: NodeId; presence: null | false | true; value?: number }[];
  /** System message text if the turn failed loudly. */
  readonly failureMessage?: string;
}

interface ScenarioResult {
  readonly turns: readonly TurnDiagnostic[];
}

/**
 * Drive a single full review session. `preMoveCount` is the number
 * of pre-loaded moves in the card's SGF (20 → user plays first as
 * Black; 21 → first as White).
 */
async function runScenario(opts: {
  preMoveCount: number;
  description: string;
}): Promise<ScenarioResult> {
  mark(`scenario start: preMoveCount=${opts.preMoveCount} desc="${opts.description}"`);

  // 1. Identity. Fresh open-access account each scenario.
  mark('seedTestUser');
  const seeded = await seedTestUser();
  mark(`seedTestUser ok: username=${seeded.username}`);

  // 2. Generate the starting position via engine self-play. Done
  // BEFORE analysisService.connect() so we never have two WSes open
  // to the strong proxy simultaneously (one client per proxy URL is
  // the simpler invariant; concurrent connections to the same URL
  // can race in subtle ways under load).
  mark(`playEngineMoves: ${opts.preMoveCount} moves @ ${POSITION_GEN_VISITS} visits — strong proxy`);
  const generatedBoard = await playEngineMoves({
    katagoUrl: STRONG_URL!,
    startBoard: createInitialBoard(),
    untilPathLength: opts.preMoveCount + 1,
    maxVisits: POSITION_GEN_VISITS,
  });
  const generatedSgf = serializeActivePath(generatedBoard);
  mark(`playEngineMoves ok: sgf.length=${generatedSgf.length}`);

  // 3. Connect analysisService to the strong proxy now that the
  // position-gen client is gone.
  mark(`analysisService.connect: url=${STRONG_URL}`);
  store.profile.settings.engine.katago.url = STRONG_URL!;
  analysisService.connect();
  mark('analysisService.connect: returned (ws opens async)');

  // 4. Build the flat palette and create the test card.
  mark('seedTestCard');
  const cardId = await seedTestCard({
    sgf: generatedSgf,
    numMoves: NUM_PLAY_MOVES,
    defaultVisits: REVIEW_VISITS,
    gamma: 0.9,
    analysis_config: buildFlatVisitRatioPalette(),
    description: opts.description,
  });
  mark(`seedTestCard ok: cardId=${cardId}`);

  // 5. Hydrate the card via the same backend path the production UI
  // uses, so the curated `gradingParameter` blob (including the
  // post-rewrite `analysis_config`) is what the review session reads.
  mark('fetchCard');
  const card: ReviewCard = await backendService.fetchCard(cardId);
  mark(`fetchCard ok: numMoves=${card.numMoves} defaultVisits=${card.defaultVisits}`);

  // 6. Add a fresh board the review session will mutate. startSession
  // → loadCard re-uses the active board's id, so the board added
  // here becomes "the board the session lives on."
  const board = createInitialBoard();
  addBoard(board);
  const boardId: BoardId = board.id;

  const boardIdRef = ref<BoardId | null>(boardId);
  const session = useReviewSession(boardIdRef);

  mark('session.startSession');
  await session.startSession([card]);
  mark(`session.startSession ok: state=${session.state.value}`);

  // 7. Mirror the configHash computation in `useReviewSession`
  // (lines 311-315) so our ledger reads target the same bucket the
  // session writes to.
  const data = (card.gradingParameter as Record<string, unknown> | null)?.['data'] as
    | Record<string, unknown>
    | undefined;
  const configOverride = data?.['analysis_config'] as Record<string, unknown> | undefined;
  const overrideSettings = data?.['overrideSettings'] as Record<string, unknown> | undefined;
  const sessionHash = configOverride
    ? hashConfig(compileAnalysisDescriptorFromParts(configOverride, overrideSettings))
    : 'default';

  // 8. Drive NUM_PLAY_MOVES turns. Per turn:
  //    a. Snapshot the pre-move (s_0) nodeId and active path.
  //    b. Query the weak proxy for the human-simulator's move.
  //    c. processUserMove(x, y) — fires the strong-proxy analyze,
  //       waits for s_1, runs the path-scan delta lookup.
  //    d. Capture diagnostic — per-node delta-key presence, status,
  //       elapsed time. On loud-failure (state=IDLE), recover by
  //       playing the engine follow-through manually so the harness
  //       can keep going and surface the full failure pattern.
  const turns: TurnDiagnostic[] = [];

  for (let turn = 0; turn < NUM_PLAY_MOVES; turn++) {
    const preBoard = store.boards.find((b) => b.id === boardId);
    if (!preBoard) throw new Error(`Harness: board ${boardId} disappeared mid-session (turn ${turn})`);
    const s0NodeId = preBoard.currentNodeId as NodeId;

    mark(`turn ${turn}: state=${session.state.value} queryEngineMove (weak proxy)`);
    const move = await queryEngineMove({
      katagoUrl: WEAK_URL!,
      board: preBoard,
      maxVisits: HUMAN_SIM_VISITS,
    });
    mark(`turn ${turn}: weak chose ${move.gtp}`);

    const recordedBefore = session.userMoveScores.value.length;
    const messagesBefore = store.engine.messages.length;
    const t0 = Date.now();
    mark(`turn ${turn}: processUserMove(${move.x},${move.y})`);
    await session.processUserMove(move.x, move.y);
    const elapsedMs = Date.now() - t0;
    mark(`turn ${turn}: processUserMove returned in ${elapsedMs}ms, state=${session.state.value}`);

    // Snapshot the post-move active path. The user's move is now
    // applied (regardless of failure mode); the engine follow-through
    // is the only thing the loud-failure branch skips.
    const postBoard = store.boards.find((b) => b.id === boardId)!;
    const postPath = getActiveVariationPath(postBoard) as NodeId[];
    const userColor = postBoard.nodes[postBoard.currentNodeId]?.move?.color as 'B' | 'W';
    const colorKey = userColor === 'B' ? 'black' : 'white';

    // Reproduce the per-color index `n` the production code computes.
    let colorMoveCount = 0;
    for (const nodeId of postPath) {
      if (postBoard.nodes[nodeId]?.move?.color === userColor) colorMoveCount++;
    }
    const n = colorMoveCount - 1;

    // Per-path delta-key presence — the same set of nodes the
    // production path-scan iterates.
    const perPathDeltaPresence = postPath.map((nodeId) => {
      const packet = ledger.getRaw(sessionHash, nodeId);
      if (!packet) return { nodeId, presence: null as null };
      const value = packet.extra?.[colorKey]?.deltas?.[n];
      return value !== undefined
        ? { nodeId, presence: true as true, value }
        : { nodeId, presence: false as false };
    });

    const recordedAfter = session.userMoveScores.value.length;
    const recorded = recordedAfter > recordedBefore
      ? session.userMoveScores.value[recordedAfter - 1]
      : null;

    // Always read s_0 from the ledger to compute expected — the
    // expected score is what the proxy SHOULD have given us, computed
    // independently from the s_0 packet's moveInfos. If the s_0
    // packet itself is missing, expected becomes null too (which is
    // its own diagnostic signal).
    const s0Packet = ledger.getRaw(sessionHash, s0NodeId);
    const expected = s0Packet ? expectedVisitRatioDelta(s0Packet, move.gtp) : null;

    let status: TurnDiagnostic['status'] = 'ok';
    let failureMessage: string | undefined;
    if (session.state.value === 'IDLE') {
      const lastMsg = messagesBefore < store.engine.messages.length ? store.engine.messages[0] : undefined;
      failureMessage = lastMsg?.text;
      if (failureMessage?.includes('per-move')) status = 'missing-delta';
      else if (failureMessage?.toLowerCase().includes('timeout') || failureMessage?.includes('did not respond')) status = 'timeout';
      else status = 'other';

      // Recover: replay the engine follow-through manually using s_1
      // packet's moveInfos[order=0], then reset the session state to
      // AWAITING_MOVE so the next iteration can run.
      const s1NodeId = postBoard.currentNodeId as NodeId;
      const s1Packet = ledger.getRaw(sessionHash, s1NodeId);
      const bestMove = s1Packet?.moveInfos?.find((m) => m.order === 0);
      if (bestMove) {
        const coords = gtpToBoard(bestMove.move);
        if (coords) {
          const engineBoard = applyGoMove(postBoard, coords.x, coords.y);
          if (engineBoard) {
            const idx = store.boards.findIndex((b) => b.id === boardId);
            if (idx !== -1) updateBoardState(idx, engineBoard);
          }
        }
      }
      mutateReviewSession(boardId, (draft) => { draft.status = 'AWAITING_MOVE'; });
    }

    turns.push({
      turn,
      userColor,
      n,
      userMoveGtp: move.gtp,
      elapsedMs,
      status,
      expected,
      recorded,
      perPathDeltaPresence,
      failureMessage,
    });

    mark(`turn ${turn}: ${status} expected=${expected} recorded=${recorded} elapsed=${elapsedMs}ms n=${n} color=${colorKey}`);
  }

  return { turns };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!STRONG_URL || !WEAK_URL)(
  'review-session e2e harness (real backend + two KataProxies)',
  () => {
    beforeEach(() => {
      try { analysisService.disconnect(); } catch { /* first iter / idempotent */ }
      localStorage.clear();
      resetWorkspace();
    });

    afterEach(() => {
      try { analysisService.disconnect(); } catch { /* idempotent */ }
    });

    it.each([
      { preMoveCount: 20, label: 'Black-to-move @ depth 20' },
      { preMoveCount: 21, label: 'White-to-move @ depth 21' },
    ])(
      '$label: every userMoveScore matches the s_0 visit_ratio',
      async ({ preMoveCount, label }) => {
        const result = await runScenario({
          preMoveCount,
          description: `e2e ${label} (flat palette)`,
        });

        // Per-turn diagnostic table. Surfaces (in order):
        //   - the user's move + (color, n) it was scored against
        //   - elapsed processUserMove time (cache hits show as <50ms)
        //   - the loud-failure branch hit, if any
        //   - per-node delta-key presence: ✓ found / × no key /
        //     · no packet
        // eslint-disable-next-line no-console
        console.log(
          `\n[${label}] per-turn diagnostic:\n`
          + result.turns.map((t) => {
            const presence = t.perPathDeltaPresence
              .map((p) => p.presence === true ? '✓' : p.presence === false ? '×' : '·')
              .join('');
            const exp = t.expected === null ? 'null' : t.expected.toFixed(4);
            const rec = t.recorded === null ? 'null' : t.recorded.toFixed(4);
            return `  turn ${t.turn.toString().padStart(2)} ${t.userColor} n=${t.n.toString().padStart(2)} ${t.userMoveGtp.padEnd(4)} ${t.elapsedMs.toString().padStart(4)}ms ${t.status.padEnd(13)} exp=${exp} rec=${rec} path=${presence}`
              + (t.failureMessage ? `\n        ${t.failureMessage.slice(0, 120)}` : '');
          }).join('\n'),
        );

        // Summary stats.
        const statusCounts = result.turns.reduce<Record<string, number>>((acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        }, {});
        // eslint-disable-next-line no-console
        console.log(`[${label}] summary: ${JSON.stringify(statusCounts)}`);

        expect(result.turns.length).toBe(NUM_PLAY_MOVES);
        // Hard assertion: every successful turn must have its recorded
        // score match expected to 6 decimals. Loud-failure turns are
        // surfaced via the diagnostic table; the assertion below counts
        // them as failures so the test still flags the run.
        for (const t of result.turns) {
          if (t.status === 'ok') {
            expect(t.recorded).not.toBeNull();
            expect(t.expected).not.toBeNull();
            expect(t.recorded!).toBeCloseTo(t.expected!, 6);
          }
        }
        // The harness's purpose is to surface non-deterministic missing-
        // delta failures. Currently FAIL the run on any such failure so
        // the diagnostic table is published and the bug stays visible.
        const failingTurns = result.turns.filter((t) => t.status !== 'ok');
        expect(failingTurns).toEqual([]);
      },
      PER_TEST_TIMEOUT_MS,
    );
  },
);
