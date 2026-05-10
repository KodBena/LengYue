// @vitest-environment node

/**
 * tests/e2e/autonomous-srs-loop.test.ts
 *
 * First-slice runner for the autonomous SRS loop, per
 * `docs/notes/autonomous-srs-loop-revised.md`. Drives the real
 * `useReviewSession` composable against a real backend and proxy with
 * a `fixedNetworkPolicy` standing in for the autonomous "player."
 * Logs per-move and per-card results to a JSONL file plus stdout.
 *
 * Env-var-gated and Vitest-shaped to match
 * `tests/e2e/review-session-harness.test.ts` — same node-env pragma,
 * same skipIf gate, same seed/auth pattern. Distinction: the harness
 * asserts on score correctness and is bounded to one card; this runner
 * iterates a configurable card pool, records to JSONL, and asserts
 * only on driver invariants (it ran to completion without throwing).
 *
 * Invocation:
 *
 *     AUTONOMOUS_PROXY=ws://192.168.122.1:1235 \
 *     AUTONOMOUS_NUM_CARDS=10 \
 *     AUTONOMOUS_MOVES_PER_CARD=5 \
 *     AUTONOMOUS_POLICY_VISITS=30 \
 *     AUTONOMOUS_REVIEW_VISITS=100 \
 *     AUTONOMOUS_MODEL=weak \
 *     AUTONOMOUS_LOG_PATH=./autonomous-srs-results.jsonl \
 *       npm run test:run -- tests/e2e/autonomous-srs-loop.test.ts
 *
 * Only AUTONOMOUS_PROXY is required; the rest carry first-slice
 * defaults named in the file body. AUTONOMOUS_MODEL is honoured only
 * when the proxy is in SELECTOR mode (otherwise the field is omitted
 * from queries and the proxy's role-native dispatch handles it).
 *
 * Per the design note this is the "Node script via Vitest harness
 * pattern" first-slice shape; the truly long-running variant
 * (standalone tsx, hours-long sessions) extracts later if needed.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref } from 'vue';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, openSync, closeSync } from 'node:fs';

import {
  store,
  addBoard,
  resetWorkspace,
} from '../../src/store';
import { backendService } from '../../src/services/backend-service';
import { analysisService } from '../../src/services/analysis-service';
import { createInitialBoard } from '../../src/store/board-factory';
import { serializeActivePath } from '../../src/engine/sgf-writer';
import type { BoardId, ReviewCard } from '../../src/types';

import { playEngineMoves } from '../../src/composables/usePlayFromPosition';
import {
  fixedNetworkPolicy,
  runAutonomousDriver,
  type Recorder,
  type RecorderEntry,
} from '../../src/composables/autonomous-srs';
import { seedTestUser, seedTestCard } from './seed';

// ── Configuration ────────────────────────────────────────────────────────────

const PROXY_URL = process.env.AUTONOMOUS_PROXY;
const MODEL_LABEL = process.env.AUTONOMOUS_MODEL || undefined;

// First-slice defaults: small enough to validate the loop end-to-end
// in a few minutes, large enough that the per-move overhead amortizes
// past the per-card setup cost. Override via env when running longer.
const NUM_CARDS = Number(process.env.AUTONOMOUS_NUM_CARDS ?? '10');
const MOVES_PER_CARD = Number(process.env.AUTONOMOUS_MOVES_PER_CARD ?? '5');
const POLICY_VISITS = Number(process.env.AUTONOMOUS_POLICY_VISITS ?? '30');
const REVIEW_VISITS = Number(process.env.AUTONOMOUS_REVIEW_VISITS ?? '100');
const POSITION_GEN_VISITS = Number(process.env.AUTONOMOUS_POSITION_GEN_VISITS ?? '50');
const POSITION_GEN_DEPTH = Number(process.env.AUTONOMOUS_POSITION_GEN_DEPTH ?? '10');
const LOG_PATH = process.env.AUTONOMOUS_LOG_PATH ?? './autonomous-srs-results.jsonl';

// Liberal — bounded by GPU latency × moves_per_card × num_cards.
const PER_TEST_TIMEOUT_MS = 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function mark(s: string): void {
  process.stderr.write(`[autonomous ${new Date().toISOString().slice(11, 23)}] ${s}\n`);
}

/**
 * Same flat-palette shape the existing harness uses — directly
 * interpretable scores against `moveInfos.visits`. The autonomous
 * loop's policy is independent of palette choice (it doesn't read
 * deltas, only `moveInfos[0].move`); this palette is what the review
 * session uses to score the policy's moves.
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
 * Simple JSONL recorder. Appends one line per RecorderEntry; closes
 * the underlying file descriptor on `close()`. Node-only by
 * construction (uses `node:fs`); kept inline rather than in
 * `src/composables/` so the autonomous-srs module stays browser-
 * importable for the future in-browser observer slice.
 *
 * Mirror prints to stdout for live observation. The full JSON is on
 * each line for post-hoc analysis; the stdout summary is one line per
 * entry, eyeball-readable.
 */
function makeJsonlRecorder(path: string): Recorder {
  const fd = openSync(path, 'a');
  return {
    async record(entry: RecorderEntry): Promise<void> {
      appendFileSync(fd, JSON.stringify(entry) + '\n');
      // Pretty stdout summary per entry.
      if (entry.kind === 'move') {
        const score = entry.recordedScore === null ? 'null' : entry.recordedScore.toFixed(4);
        process.stdout.write(
          `  card[${entry.cardIndex}] move ${entry.moveOrdinal} ${entry.userColor} ${entry.userMoveGtp.padEnd(4)} `
          + `score=${score} elapsed=${entry.elapsedMs}ms\n`,
        );
      } else if (entry.kind === 'card-end') {
        const mean = entry.meanScore === null ? 'null' : entry.meanScore.toFixed(4);
        const failure = entry.failureMessage ? ` (${entry.failureMessage.slice(0, 80)})` : '';
        process.stdout.write(
          `  card[${entry.cardIndex}] end ${entry.status.padEnd(8)} `
          + `moves=${entry.movesPlayed} mean=${mean}${failure}\n`,
        );
      } else if (entry.kind === 'run-end') {
        process.stdout.write(
          `\n[autonomous] run-end attempted=${entry.cardsAttempted} `
          + `finished=${entry.cardsFinished} stop=${entry.stopReason}\n`,
        );
      }
    },
    async close(): Promise<void> {
      closeSync(fd);
    },
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!PROXY_URL)(
  'autonomous SRS loop (first-slice runner)',
  () => {
    beforeEach(() => {
      try { analysisService.disconnect(); } catch { /* idempotent */ }
      localStorage.clear();
      resetWorkspace();
    });

    afterEach(() => {
      try { analysisService.disconnect(); } catch { /* idempotent */ }
    });

    it(
      `runs ${NUM_CARDS} cards × ${MOVES_PER_CARD} moves with FixedNetworkPolicy`,
      async () => {
        mark(`config: proxy=${PROXY_URL} model=${MODEL_LABEL ?? '(none)'} `
          + `cards=${NUM_CARDS} moves/card=${MOVES_PER_CARD} `
          + `policy_visits=${POLICY_VISITS} review_visits=${REVIEW_VISITS}`);

        // 1. Identity. Fresh autonomous-only account; never reuses a
        //    human user's identity per the design note's framing.
        mark('seedTestUser');
        const seeded = await seedTestUser();
        mark(`seedTestUser ok: username=${seeded.username}`);

        // 2. Generate one starting position via short engine self-play.
        //    All cards in this run share the position; the policy's
        //    response variance (low-visit run-to-run randomness) plus
        //    the per-card review-session lifetime gives each card a
        //    distinct game. First-slice simplification — varied
        //    starting positions per card become a follow-on once the
        //    orchestration is solid.
        mark(`playEngineMoves: ${POSITION_GEN_DEPTH} moves @ ${POSITION_GEN_VISITS} visits — position-gen via proxy`);
        const generatedBoard = await playEngineMoves({
          katagoUrl: PROXY_URL!,
          startBoard: createInitialBoard(),
          untilPathLength: POSITION_GEN_DEPTH + 1,
          maxVisits: POSITION_GEN_VISITS,
          model: MODEL_LABEL,
        });
        const generatedSgf = serializeActivePath(generatedBoard);
        mark(`playEngineMoves ok: sgf.length=${generatedSgf.length}`);

        // 3. Connect the singleton analysis service. The review
        //    session's per-move analysis flows through this — the
        //    policy uses its own ephemeral connection via
        //    `queryEngineMove`, so the two never share a WebSocket.
        mark(`analysisService.connect: url=${PROXY_URL}`);
        store.profile.settings.engine.katago.url = PROXY_URL!;
        if (MODEL_LABEL) {
          // Set the SELECTOR target so the singleton's review-session
          // queries hit the same network the policy uses. (For
          // single-network policies the "same network for both" choice
          // is the simplest matched-pair shape.)
          store.engine.selectedModel = MODEL_LABEL;
        }
        analysisService.connect();
        mark('analysisService.connect: returned (ws opens async)');

        // 4. Seed N cards, all sharing the same starting SGF + flat
        //    palette + numMoves budget.
        mark(`seedTestCard × ${NUM_CARDS}`);
        const cards: ReviewCard[] = [];
        for (let i = 0; i < NUM_CARDS; i++) {
          const cardId = await seedTestCard({
            sgf: generatedSgf,
            numMoves: MOVES_PER_CARD,
            defaultVisits: REVIEW_VISITS,
            gamma: 0.9,
            analysis_config: buildFlatVisitRatioPalette(),
            description: `autonomous run card #${i + 1}`,
          });
          const card = await backendService.fetchCard(cardId);
          cards.push(card);
        }
        mark(`seedTestCard ok: ${cards.length} cards seeded`);

        // 5. Add a fresh board the session writes to. addBoard sets
        //    activeBoardIndex so subsequent store reads see this board.
        const board = createInitialBoard();
        addBoard(board);
        const boardId: BoardId = board.id;

        // 6. Construct the policy + recorder. The policy uses the same
        //    proxy URL as the singleton (and the same SELECTOR model
        //    when in play); the recorder writes to the configured
        //    JSONL path.
        const policy = fixedNetworkPolicy({
          katagoUrl: PROXY_URL!,
          maxVisits: POLICY_VISITS,
          model: MODEL_LABEL,
        });
        const recorder = makeJsonlRecorder(LOG_PATH);
        mark(`recorder: appending to ${LOG_PATH}`);

        // 7. Cooperative-stop wiring. SIGINT is handled by the runtime
        //    (Vitest will catch and tear the suite down); this
        //    in-process flag is for the driver's own per-iteration
        //    shouldStop hook. Only test-side stop conditions today —
        //    no manual interrupt from inside the test.
        const stopRef = ref(false);
        const installSigint = () => {
          process.once('SIGINT', () => {
            mark('SIGINT received; requesting cooperative stop');
            stopRef.value = true;
          });
        };
        installSigint();

        // 8. Run the driver.
        mark('runAutonomousDriver: starting');
        const result = await runAutonomousDriver({
          boardId,
          cards,
          policy,
          recorder,
          shouldStop: () => stopRef.value,
        });
        mark(`runAutonomousDriver: returned attempted=${result.cardsAttempted} `
          + `finished=${result.cardsFinished} stop=${result.stopReason}`);

        // Driver invariant: at least one card was attempted (a
        // zero-card run means the queue was wrong). All other behavior
        // is best-effort; we surface results via the JSONL log and
        // stdout, not via assertions.
        expect(result.cardsAttempted).toBeGreaterThan(0);
      },
      PER_TEST_TIMEOUT_MS,
    );
  },
);
