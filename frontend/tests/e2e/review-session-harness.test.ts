// @vitest-environment node

/**
 * tests/e2e/review-session-harness.test.ts
 *
 * End-to-end fuzzing harness for `useReviewSession`. Drives the real
 * composable against a real backend and a real KataProxy, with a
 * "strong" and a "weak" engine playing the two roles below.
 *
 * The strong/weak pair is sourced one of two ways, depending on the
 * proxy topology of the standing dev stack:
 *
 *   - SELECTOR mode (the default — the standing dev stack runs only
 *     the SELECTOR on 127.0.0.1:1235 with a labelled upstream pool).
 *     Both roles connect to the one SELECTOR URL and differ only in
 *     the per-query `model` label the SELECTOR routes on. The SELECTOR
 *     refuses any analysis query that carries no `model` field
 *     (`{"error": "missing 'model' field for SELECTOR routing"}`), so
 *     the label must be threaded through every engine-move path —
 *     position generation, the human-simulator, AND `analysisService`'s
 *     review-time analysis (via `store.engine.selectedModel`). The two
 *     labels are configurable; the defaults are two healthy upstreams
 *     discovered from the live `query_models` response.
 *
 *   - LEAF-pair mode (the original topology — two distinct LEAF
 *     proxies on two URLs, each serving a single network, no `model`
 *     field on the wire). Set both URL env vars to opt into it; the
 *     `model` labels are then omitted from every query.
 *
 * The two engine roles, however the pair is sourced:
 *
 *   - Strong: used by `analysisService` for review-time analysis
 *     (REVIEW_VISITS per user move) and by the position generator
 *     (POSITION_GEN_VISITS per setup move).
 *
 *   - Weak: used by the human-simulator (HUMAN_SIM_VISITS per "user"
 *     move). Lower visits → the simulator more often plays a
 *     non-engine-top move, which exercises the full delta range across
 *     the card. In SELECTOR mode the strong/weak label split layers a
 *     network-strength difference on top of the visit-budget
 *     difference; in LEAF-pair mode the visit budget is the only lever
 *     unless the two LEAFs serve different networks.
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
 * Gating: skipped unless an engine endpoint is configured. A normal
 * `npm run test:run` is unaffected. Two opt-in shapes:
 *
 *   SELECTOR mode (the standing dev stack — one SELECTOR, two labels):
 *
 *     REVIEW_E2E_SELECTOR=ws://127.0.0.1:1235 \
 *       npm run test:run -- tests/e2e/review-session-harness.test.ts
 *
 *   The labels default to two healthy upstreams (`REVIEW_E2E_STRONG_MODEL`
 *   defaults to `b28c512nbt`, `REVIEW_E2E_WEAK_MODEL` to `b10c128`).
 *   Discover the live label set — and which are `healthy: true` — with
 *   a `query_models` probe (the parser lives in
 *   `src/engine/katago/version-probe.ts`); override either env var to
 *   route the two roles at a different healthy pair.
 *
 *   LEAF-pair mode (two distinct LEAF proxies, no `model` on the wire):
 *
 *     REVIEW_E2E_STRONG=ws://192.168.122.1:1234 \
 *     REVIEW_E2E_WEAK=ws://192.168.122.1:1235 \
 *       npm run test:run -- tests/e2e/review-session-harness.test.ts
 *
 * When `REVIEW_E2E_SELECTOR` is set it takes precedence; the LEAF-pair
 * URL vars are the fallback the original topology used.
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
import { ledger } from '../../src/state/analysis-ledger';
import { useReviewSession } from '../../src/composables/review/useReviewSession';
import { createInitialBoard } from '../../src/store/board-factory';
import {
  deriveAnalysisKeys,
  activeAnalysisKeys,
} from '../../src/state/analysis-config';
import { serializeActivePath } from '../../src/engine/sgf-writer';
import { applyGoMove } from '../../src/logic';
import { gtpToBoard } from '../../src/composables/board/use-move-suggestions';
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
} from '../../src/composables/board/usePlayFromPosition';
import { seedTestUser, seedTestCard } from './seed';

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * One resolved engine role: the proxy URL to connect to and the
 * SELECTOR routing label to thread on every query (null in LEAF-pair
 * mode, where the wire carries no `model` field). The harness reads
 * `url` for the WebSocket and passes `model ?? undefined` to the
 * `playEngineMoves` / `queryEngineMove` `model` parameter so an
 * absent label is omitted from the query rather than sent as the
 * string `"null"`.
 */
interface EngineRole {
  readonly url: string;
  readonly model: string | null;
}

const SELECTOR_URL = process.env.REVIEW_E2E_SELECTOR;
const LEAF_STRONG_URL = process.env.REVIEW_E2E_STRONG;
const LEAF_WEAK_URL = process.env.REVIEW_E2E_WEAK;

// Defaults are two upstreams the live SELECTOR advertised as
// `healthy: true` (2026-06-11 `query_models` probe). Override either
// when the standing stack's healthy pair changes — an unhealthy or
// unknown label makes the SELECTOR fail the query loudly (ADR-0002),
// which surfaces through `awaitFinalPacket`'s error branch rather
// than silently substituting a different network.
const STRONG_MODEL = process.env.REVIEW_E2E_STRONG_MODEL || 'b28c512nbt';
const WEAK_MODEL = process.env.REVIEW_E2E_WEAK_MODEL || 'b10c128';

/**
 * Resolve the strong/weak engine roles from the configured topology.
 * SELECTOR mode (single URL, two labels) takes precedence; the
 * LEAF-pair fallback uses two URLs and no labels. `null` when neither
 * is configured — the suite's `skipIf` reads that to skip cleanly.
 */
function resolveRoles(): { strong: EngineRole; weak: EngineRole } | null {
  if (SELECTOR_URL) {
    return {
      strong: { url: SELECTOR_URL, model: STRONG_MODEL },
      weak: { url: SELECTOR_URL, model: WEAK_MODEL },
    };
  }
  if (LEAF_STRONG_URL && LEAF_WEAK_URL) {
    return {
      strong: { url: LEAF_STRONG_URL, model: null },
      weak: { url: LEAF_WEAK_URL, model: null },
    };
  }
  return null;
}

const ROLES = resolveRoles();

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

  // The suite's `skipIf` guards this, so ROLES is non-null whenever a
  // scenario actually runs; the assert keeps the non-null reads below
  // honest (ADR-0002) rather than papering over with `!`.
  if (!ROLES) throw new Error('runScenario invoked with no engine roles configured');
  const { strong, weak } = ROLES;
  mark(`roles: strong=${strong.url} model=${strong.model ?? '(none)'} `
    + `weak=${weak.url} model=${weak.model ?? '(none)'}`);

  // 1. Identity. Fresh open-access account each scenario.
  mark('seedTestUser');
  const seeded = await seedTestUser();
  mark(`seedTestUser ok: username=${seeded.username}`);

  // 2. Generate the starting position via engine self-play. Done
  // BEFORE analysisService.connect() so we never have two WSes open
  // to the strong proxy simultaneously (one client per proxy URL is
  // the simpler invariant; concurrent connections to the same URL
  // can race in subtle ways under load).
  mark(`playEngineMoves: ${opts.preMoveCount} moves @ ${POSITION_GEN_VISITS} visits — strong engine`);
  const generatedBoard = await playEngineMoves({
    katagoUrl: strong.url,
    startBoard: createInitialBoard(),
    untilPathLength: opts.preMoveCount + 1,
    maxVisits: POSITION_GEN_VISITS,
    // SELECTOR routing label for the strong engine; undefined (omitted
    // from the query) in LEAF-pair mode.
    model: strong.model ?? undefined,
  });
  const generatedSgf = serializeActivePath(generatedBoard);
  mark(`playEngineMoves ok: sgf.length=${generatedSgf.length}`);

  // 3. Connect analysisService to the strong engine now that the
  // position-gen client is gone. In SELECTOR mode the review-time
  // analysis queries must carry the strong label too — the service
  // injects `model: store.engine.selectedModel` on every query (see
  // analysis-service.ts), so setting it here is what routes the
  // review session's per-move analyze through the strong upstream.
  // Without it the SELECTOR would auto-select its first advertised
  // label, which need not be the strong one. (In LEAF-pair mode the
  // label is null and the field is omitted, matching the original
  // behaviour.)
  mark(`analysisService.connect: url=${strong.url} model=${strong.model ?? '(none)'}`);
  store.profile.settings.engine.katago.url = strong.url;
  store.engine.selectedModel = strong.model;
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
  const sessionKeys = configOverride
    ? deriveAnalysisKeys(configOverride, overrideSettings, store.engine.selectedModel ?? undefined)
    : activeAnalysisKeys.value;

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

    mark(`turn ${turn}: state=${session.state.value} queryEngineMove (weak engine)`);
    const move = await queryEngineMove({
      katagoUrl: weak.url,
      board: preBoard,
      maxVisits: HUMAN_SIM_VISITS,
      // SELECTOR routing label for the weak engine; undefined in
      // LEAF-pair mode.
      model: weak.model ?? undefined,
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
    // Producer-branded RootToLeafPath; the former `as NodeId[]`
    // widening was redundant.
    const postPath = getActiveVariationPath(postBoard);
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
      const enr = ledger.getEnrichment(sessionKeys.enrichedKey, nodeId);
      if (!enr) return { nodeId, presence: null as null };
      const value = enr[colorKey]?.deltas?.[n];
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
    const s0Packet = ledger.getRaw(sessionKeys.rawKey, s0NodeId);
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
      const s1Packet = ledger.getRaw(sessionKeys.rawKey, s1NodeId);
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

describe.skipIf(!ROLES)(
  'review-session e2e harness (real backend + SELECTOR or LEAF-pair)',
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
