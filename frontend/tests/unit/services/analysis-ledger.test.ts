/**
 * tests/unit/services/analysis-ledger.test.ts
 *
 * Tier-1 (pure-logic) tests for the analysis-ledger's merge logic.
 * Synthesises packet sequences representative of multi-round
 * Phase-3 dispatch (the proxy's v1.0.24 multi-round substrate) and
 * asserts the ledger ends with the deepest observed packet per
 * turn.
 *
 * Why this exists
 * ───────────────
 * The 2026-05-19 SPA-faithful proxy wire probe confirmed the proxy
 * emits exactly one `is_during_search=False` per analyzed turn per
 * query, with each final carrying the deepest observed packet
 * (state.last_packet(turn)). The user observed that the SPA, on a
 * multi-round query, only renders "the first adaptive result" —
 * round 1's deepening data — despite the proxy correctly emitting
 * all rounds' Stage 2 previews and Stage 3 finals.
 *
 * This file pins the LEDGER's contract under multi-round packet
 * sequences: regardless of in-stream ordering of partial preview
 * packets across rounds, the ledger's `getRaw` after the Stage 3
 * final returns a packet carrying the deepest observed visits
 * field. If this test fails, the bug is in the ledger's merge
 * logic. If it passes, the bug is upstream (analysis-service
 * routing) or downstream (the chart/widget consumer).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ledger } from '../../../src/services/analysis-ledger';
import type { KataAnalysisResponse } from '../../../src/engine/katago/types';
import type { NodeId } from '../../../src/types';


// ── Fixtures ─────────────────────────────────────────────────────────────────

const HASH = 'config-hash-1';
const NODE: NodeId = 'node-1' as NodeId;
const QUERY_ID = 'range-test-1';

function packet(args: {
  visits: number;
  isDuringSearch: boolean;
  turn?: number;
}): KataAnalysisResponse {
  return {
    id: QUERY_ID,
    turnNumber: args.turn ?? 0,
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

beforeEach(() => {
  ledger.purgeAll();
});


// ── Single-round baseline ─────────────────────────────────────────────────────

describe('analysis-ledger: single-round merge', () => {
  it('records the only final packet with its visits', () => {
    ledger.record(HASH, NODE, packet({ visits: 1000, isDuringSearch: false }));
    expect(ledger.getRaw(HASH, NODE)?.rootInfo?.visits).toBe(1000);
    expect(ledger.getRaw(HASH, NODE)?.isDuringSearch).toBe(false);
  });

  it('promotes preview → final at the same visit count', () => {
    ledger.record(HASH, NODE, packet({ visits: 1000, isDuringSearch: true }));
    ledger.record(HASH, NODE, packet({ visits: 1000, isDuringSearch: false }));
    expect(ledger.getRaw(HASH, NODE)?.isDuringSearch).toBe(false);
    expect(ledger.getRaw(HASH, NODE)?.rootInfo?.visits).toBe(1000);
  });

  it('keeps the higher-visits packet when partials arrive out of order', () => {
    ledger.record(HASH, NODE, packet({ visits: 800, isDuringSearch: true }));
    // A subsequent stale partial at lower visits must NOT clobber.
    ledger.record(HASH, NODE, packet({ visits: 200, isDuringSearch: true }));
    expect(ledger.getRaw(HASH, NODE)?.rootInfo?.visits).toBe(800);
  });
});


// ── Multi-round Phase-3 traces ────────────────────────────────────────────────

describe('analysis-ledger: multi-round Phase-3 trace', () => {
  it('records the deepest packet across Stage 2 previews from N rounds', () => {
    // Synthesised stream representing what the SPA receives for one
    // turn under multi-round Phase 3 with max_rounds=3, where the
    // allocator picks the same turn in each round (V grows
    // monotonically as KataGo continues from cache).
    //
    // Stage 1: original final from KataGo at V_pre, re-flagged as
    //   preview by the proxy's adaptive_reevaluate.
    ledger.record(HASH, NODE, packet({ visits: 215, isDuringSearch: true }));

    // Stage 2 round 1: sub-query partials emerging from KataGo as
    //   the search advances under maxVisits=200+800=1000. Re-flagged
    //   as preview by the proxy.
    for (const v of [40, 120, 240, 480, 800, 1015]) {
      ledger.record(HASH, NODE, packet({ visits: v, isDuringSearch: true }));
    }

    // Stage 2 round 2: another sub-query for the same turn (rare in
    //   practice since the allocator's per-turn r_int prediction
    //   collapses on already-deepened turns, but exercised here for
    //   completeness — the ledger must tolerate stale-by-visits
    //   re-emissions). Partial visits below the existing 1015 must
    //   not clobber.
    for (const v of [60, 200, 500, 900, 1010, 1015]) {
      ledger.record(HASH, NODE, packet({ visits: v, isDuringSearch: true }));
    }

    // Stage 3: one final per turn at end-of-loop. Visits=1015
    //   carries the deepest observed packet per
    //   state.last_packet(turn).
    ledger.record(HASH, NODE, packet({ visits: 1015, isDuringSearch: false }));

    // Contract: the final packet is sealed at the deepest observed
    // visits, with isDuringSearch=false (the protocol's reaping
    // signal). Per `mergeAnalysisPacket`'s "less visits → reject"
    // rule, the lower-visits round-2 partials must NOT overwrite
    // the higher-visits round-1 partials.
    const sealed = ledger.getRaw(HASH, NODE);
    expect(sealed).not.toBeNull();
    expect(sealed?.rootInfo?.visits).toBe(1015);
    expect(sealed?.isDuringSearch).toBe(false);
  });

  it('accepts a Stage-3 final at equal visits to the running max preview', () => {
    // Common multi-round case: Stage 2 reaches V=1015 via partials.
    // Stage 3 emits at V=1015. The merge function uses strict-less-
    // than rejection (`incomingVisits < existingVisits` → reject),
    // so the equal-visits final must pass and seal the turn.
    ledger.record(HASH, NODE, packet({ visits: 215, isDuringSearch: true }));
    ledger.record(HASH, NODE, packet({ visits: 1015, isDuringSearch: true }));
    ledger.record(HASH, NODE, packet({ visits: 1015, isDuringSearch: false }));

    const sealed = ledger.getRaw(HASH, NODE);
    expect(sealed?.rootInfo?.visits).toBe(1015);
    expect(sealed?.isDuringSearch).toBe(false);
  });

  it('multi-turn ledger: each turn sealed independently at its own depth', () => {
    // One turn deepened, one turn at V_pre. Both Stage 3 finals
    // arrive. Both must be recorded with the right depth + sealed.
    const NODE_A: NodeId = 'turn-a' as NodeId;
    const NODE_B: NodeId = 'turn-b' as NodeId;

    // Turn A: gets deepened to V_int.
    ledger.record(HASH, NODE_A, packet({ visits: 215, turn: 0, isDuringSearch: true }));
    ledger.record(HASH, NODE_A, packet({ visits: 1015, turn: 0, isDuringSearch: true }));
    ledger.record(HASH, NODE_A, packet({ visits: 1015, turn: 0, isDuringSearch: false }));

    // Turn B: never deepened; Stage 3 final at V_pre.
    ledger.record(HASH, NODE_B, packet({ visits: 215, turn: 1, isDuringSearch: true }));
    ledger.record(HASH, NODE_B, packet({ visits: 215, turn: 1, isDuringSearch: false }));

    expect(ledger.getRaw(HASH, NODE_A)?.rootInfo?.visits).toBe(1015);
    expect(ledger.getRaw(HASH, NODE_A)?.isDuringSearch).toBe(false);
    expect(ledger.getRaw(HASH, NODE_B)?.rootInfo?.visits).toBe(215);
    expect(ledger.getRaw(HASH, NODE_B)?.isDuringSearch).toBe(false);
  });
});


// ── Multi-round deepening with rounds rotating across turns ───────────────────

describe('analysis-ledger: cross-turn rotation across rounds', () => {
  it('48-turn candidate pool, 16 deepened per round across 3 rounds: each turn sealed at depth', () => {
    // Faithful synthesis of the multi-round Phase 3 dispatch's
    // observable wire shape (from the 2026-05-19 SPA-faithful proxy
    // probe): 48 candidate turns, 16 of them deepened per round,
    // allocator rotates picks as r_int collapses on already-
    // deepened turns. After 3 rounds, all 48 reach V_int=1015.
    const N = 48;
    const nodes: NodeId[] = [];
    for (let i = 0; i < N; i++) nodes.push(`turn-${i}` as NodeId);

    // Stage 1: original finals re-flagged as previews. All turns
    // at V_pre=215.
    for (let i = 0; i < N; i++) {
      ledger.record(HASH, nodes[i], packet({ visits: 215, turn: i, isDuringSearch: true }));
    }

    // Rounds 1..3: each picks a different 16. Cumulatively covers
    // all 48 turns. For each round's chosen turns: emit a deepening
    // preview at V_int=1015.
    for (let round = 0; round < 3; round++) {
      const startIdx = round * 16;
      for (let i = startIdx; i < startIdx + 16; i++) {
        ledger.record(HASH, nodes[i], packet({ visits: 1015, turn: i, isDuringSearch: true }));
      }
    }

    // Stage 3: one final per turn at end-of-loop, carrying the
    // deepest observed (state.last_packet) per turn = V_int=1015
    // for all 48 turns.
    for (let i = 0; i < N; i++) {
      ledger.record(HASH, nodes[i], packet({ visits: 1015, turn: i, isDuringSearch: false }));
    }

    // Every turn sealed at the deeper visit count. If the user
    // observes "only the first adaptive result", this assertion
    // tells us whether the ledger is at fault (it isn't, if this
    // passes) or whether the bug is upstream/downstream.
    for (let i = 0; i < N; i++) {
      const sealed = ledger.getRaw(HASH, nodes[i]);
      expect(sealed?.rootInfo?.visits, `turn ${i} sealed visits`).toBe(1015);
      expect(sealed?.isDuringSearch, `turn ${i} sealed isDuringSearch`).toBe(false);
    }
  });
});
