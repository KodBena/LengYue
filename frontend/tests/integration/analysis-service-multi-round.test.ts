/**
 * tests/integration/analysis-service-multi-round.test.ts
 *
 * Tier-2 (composable/service integration) tests for the
 * analysis-service's response-handling path under a multi-round
 * Phase-3 packet stream.
 *
 * The 2026-05-19 SPA-faithful proxy wire probe confirmed the proxy
 * emits exactly one `is_during_search=False` per analyzed turn per
 * query, with each final carrying the deepest observed packet
 * (state.last_packet(turn)). The user observed that the SPA, on a
 * multi-round query, only renders "the first adaptive result" —
 * round 1's deepening data — despite the proxy correctly emitting
 * all rounds' Stage 2 previews and Stage 3 finals.
 *
 * This file drives `analysisService['onAnalysisUpdate']` directly
 * with a synthesised queryInfo (bypassing the WebSocket layer) and
 * verifies the per-turn ledger state. It pins the boundary between
 * the WS receive path (KataGoClient routes responses to subscribers)
 * and the ledger record path (analysis-service normalises and
 * forwards to `ledger.record`). If this test passes, the bug lives
 * downstream of the ledger (chart/widget rendering); if it fails,
 * the bug is in `onAnalysisUpdate`'s lookup / normalize / record
 * logic.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { analysisService } from '../../src/services/analysis-service';
import { ledger } from '../../src/services/analysis-ledger';
import { resetWorkspace } from '../../src/store';
import type { KataAnalysisResponse } from '../../src/engine/katago/types';
import type { NodeId, BoardId } from '../../src/types';


// ── Test infrastructure ──────────────────────────────────────────────────────

// Bracket-access cast: onAnalysisUpdate and activeQueries are
// `private`, but JS/TS allow access via bracket notation. This test
// is the design-pinning consumer of those internals; if they get
// renamed or restructured, the test naturally surfaces it.
type SvcInternals = {
  activeQueries: Map<string, {
    boardId: BoardId;
    mode: 'analyze' | 'ponder';
    path: readonly NodeId[];
    hash: string;
    framing: 'BLACK' | 'WHITE' | 'SIDETOMOVE';
    startedAt: number;
    ponderCeiling?: number;
  }>;
  onAnalysisUpdate: (response: KataAnalysisResponse, queryId: string) => void;
};
const SVC = analysisService as unknown as SvcInternals;


function packet(args: {
  queryId: string;
  turn: number;
  visits: number;
  isDuringSearch: boolean;
}): KataAnalysisResponse {
  return {
    id: args.queryId,
    turnNumber: args.turn,
    isDuringSearch: args.isDuringSearch,
    moveInfos: [],
    rootInfo: {
      visits: args.visits,
      winrate: 0.5,
      scoreLead: 0,
      scoreStdev: 1.0,
      currentPlayer: 'B',
    } as KataAnalysisResponse['rootInfo'],
  };
}


/**
 * Construct + register a synthetic queryInfo for testing
 * onAnalysisUpdate's lookup → normalize → ledger path. Returns the
 * pieces tests need to assert on the ledger.
 */
function setupQuery(opts: {
  queryId?: string;
  hash?: string;
  numTurns?: number;
}): { queryId: string; hash: string; nodes: readonly NodeId[] } {
  const queryId = opts.queryId ?? `test-${Date.now()}`;
  const hash = opts.hash ?? `hash-${Date.now()}`;
  const numTurns = opts.numTurns ?? 6;
  const nodes: NodeId[] = Array.from(
    { length: numTurns },
    (_, i) => `synth-node-${queryId}-${i}` as NodeId,
  );
  SVC.activeQueries.set(queryId, {
    boardId: 'synth-board' as BoardId,
    mode: 'analyze',
    path: nodes,
    hash,
    framing: 'WHITE',
    startedAt: performance.now(),
  });
  return { queryId, hash, nodes };
}


beforeEach(() => {
  resetWorkspace();
  ledger.purgeAll();
  SVC.activeQueries.clear();
});


// ── Baseline: single-turn single-round ───────────────────────────────────────

describe('analysis-service.onAnalysisUpdate: single-turn baseline', () => {
  it('records a final into the ledger keyed by (hash, nodeId)', () => {
    const { queryId, hash, nodes } = setupQuery({ numTurns: 1 });
    SVC.onAnalysisUpdate(
      packet({ queryId, turn: 0, visits: 1000, isDuringSearch: false }),
      queryId,
    );
    expect(ledger.getRaw(hash, nodes[0])?.rootInfo?.visits).toBe(1000);
    expect(ledger.getRaw(hash, nodes[0])?.isDuringSearch).toBe(false);
  });

  it('drops a packet whose queryId has no active query (post-stop)', () => {
    const { queryId, hash, nodes } = setupQuery({ numTurns: 1 });
    SVC.activeQueries.clear();   // simulate stopQuery firing in flight
    SVC.onAnalysisUpdate(
      packet({ queryId, turn: 0, visits: 1000, isDuringSearch: false }),
      queryId,
    );
    expect(ledger.getRaw(hash, nodes[0])).toBeNull();
  });

  it('drops a packet whose turnNumber is out of path range', () => {
    const { queryId, hash, nodes } = setupQuery({ numTurns: 3 });
    SVC.onAnalysisUpdate(
      packet({ queryId, turn: 99, visits: 1000, isDuringSearch: false }),
      queryId,
    );
    // No ledger entry for any of the path's nodes — the response
    // landed in a slot the path doesn't cover.
    for (const n of nodes) {
      expect(ledger.getRaw(hash, n)).toBeNull();
    }
  });
});


// ── Multi-round multi-turn: the user's symptom surface ────────────────────────

describe('analysis-service.onAnalysisUpdate: multi-round Phase-3 trace', () => {
  it('each turn lands at its deepest observed packet (Stage-3 finalization)', () => {
    // Synthesised wire trace matching the 2026-05-19 SPA-faithful
    // probe's observable shape: 6 analyzed turns, 3 of them
    // deepened across 3 rounds (allocator rotates picks). Each
    // deepened turn ends at V_int=1015; each un-deepened turn
    // sticks at V_pre=215. Stage 3 emits one final per turn at
    // end-of-loop.
    const { queryId, hash, nodes } = setupQuery({ numTurns: 6 });

    // Stage 1: parent originals re-flagged as previews. All 6
    // turns at V_pre=215.
    for (let t = 0; t < 6; t++) {
      SVC.onAnalysisUpdate(
        packet({ queryId, turn: t, visits: 215, isDuringSearch: true }),
        queryId,
      );
    }
    // After Stage 1, ledger has all 6 turns at V_pre.
    for (let t = 0; t < 6; t++) {
      expect(ledger.getRaw(hash, nodes[t])?.rootInfo?.visits).toBe(215);
    }

    // Rounds 1..3: deepen 1 turn per round, rotating across
    // turns 0, 1, 2. Each round's spawn emits partials at
    // increasing visits + a sub-query final at V_int=1015.
    const ROUND_TURNS = [0, 1, 2];
    for (const turn of ROUND_TURNS) {
      // Sub-query partials (re-flagged as preview).
      for (const v of [40, 120, 400, 800, 1000]) {
        SVC.onAnalysisUpdate(
          packet({ queryId, turn, visits: v, isDuringSearch: true }),
          queryId,
        );
      }
      // Sub-query's KataGo final, re-flagged as preview by Stage 2.
      SVC.onAnalysisUpdate(
        packet({ queryId, turn, visits: 1015, isDuringSearch: true }),
        queryId,
      );
    }

    // Stage 3: one final per turn at end-of-loop. Deepened turns
    // carry V_int=1015; un-deepened turns carry V_pre=215.
    for (let t = 0; t < 6; t++) {
      const finalVisits = ROUND_TURNS.includes(t) ? 1015 : 215;
      SVC.onAnalysisUpdate(
        packet({ queryId, turn: t, visits: finalVisits, isDuringSearch: false }),
        queryId,
      );
    }

    // Contract: each turn sealed at the right depth.
    for (let t = 0; t < 6; t++) {
      const expectedV = ROUND_TURNS.includes(t) ? 1015 : 215;
      const sealed = ledger.getRaw(hash, nodes[t]);
      expect(sealed?.rootInfo?.visits, `turn ${t} sealed visits`).toBe(expectedV);
      expect(sealed?.isDuringSearch, `turn ${t} sealed isDuringSearch`).toBe(false);
    }
  });

  it('80-round burst (the user-reported scenario): every turn sealed at correct depth', () => {
    // Direct synthesis of the user's 80-round / 12800-extra setup.
    // 48 candidate turns; allocator deepens 16 per round; after
    // ~3 rounds all 48 are at V_int; rounds 4..80 re-spawn cache
    // hits (more partials at V_int for the same turns). Stage 3
    // emits one final per analyzed turn (all 96 turns total; 48
    // candidates were deepened, 48 were not).
    const TOTAL_TURNS = 96;
    const DEEPENED = new Set<number>();
    for (let i = 0; i < 48; i++) DEEPENED.add(i * 2);  // arbitrary spread

    const { queryId, hash, nodes } = setupQuery({ numTurns: TOTAL_TURNS });

    // Stage 1: V_pre previews for all turns.
    for (let t = 0; t < TOTAL_TURNS; t++) {
      SVC.onAnalysisUpdate(
        packet({ queryId, turn: t, visits: 215, isDuringSearch: true }),
        queryId,
      );
    }

    // Rounds 1..80: each round, the allocator picks 16 of the 48
    // candidates. Synthesise this by re-emitting deepening previews
    // for each candidate turn across the rounds. For cache-hit
    // re-spawns (rounds 4..80), partials land at V=1015 (cache
    // replay only returns the final under replay_final_only=true).
    for (let round = 0; round < 80; round++) {
      const picks = [...DEEPENED].slice(
        (round * 16) % DEEPENED.size,
        (round * 16) % DEEPENED.size + 16,
      );
      for (const turn of picks) {
        // First-time deepening emits partials; cache replays
        // emit only the final. Simulate both shapes.
        if (round < 3) {
          for (const v of [60, 200, 500, 900]) {
            SVC.onAnalysisUpdate(
              packet({ queryId, turn, visits: v, isDuringSearch: true }),
              queryId,
            );
          }
        }
        SVC.onAnalysisUpdate(
          packet({ queryId, turn, visits: 1015, isDuringSearch: true }),
          queryId,
        );
      }
    }

    // Stage 3: one final per turn.
    for (let t = 0; t < TOTAL_TURNS; t++) {
      const finalVisits = DEEPENED.has(t) ? 1015 : 215;
      SVC.onAnalysisUpdate(
        packet({ queryId, turn: t, visits: finalVisits, isDuringSearch: false }),
        queryId,
      );
    }

    // Every turn sealed at the correct depth.
    let deepenedCount = 0;
    let preCount = 0;
    for (let t = 0; t < TOTAL_TURNS; t++) {
      const sealed = ledger.getRaw(hash, nodes[t]);
      const expectedV = DEEPENED.has(t) ? 1015 : 215;
      expect(sealed?.rootInfo?.visits, `turn ${t}`).toBe(expectedV);
      expect(sealed?.isDuringSearch, `turn ${t}`).toBe(false);
      if (DEEPENED.has(t)) deepenedCount++;
      else preCount++;
    }
    expect(deepenedCount).toBe(48);
    expect(preCount).toBe(48);
  });
});
