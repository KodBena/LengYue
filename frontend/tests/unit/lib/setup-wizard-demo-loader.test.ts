/**
 * tests/unit/lib/setup-wizard-demo-loader.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/setup-wizard-demo-loader.ts`
 * — the first-run setup wizard's demo-board hydration (ledger slug
 * swz-setup-wizard). Covers: the real bundled asset loads and
 * replays to a real BoardState (happy path), and a malformed asset
 * fails LOUDLY (ADR-0002) rather than producing a blank/partial
 * board — the commission's explicit instruction.
 *
 * No DOM, no fakes, no Vue reactivity — pure JS through pure
 * functions through assertions.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { loadSetupWizardDemo } from '../../../src/lib/setup-wizard-demo-loader';
import { fromGtp, toGtp } from '../../../src/engine/util';

function validAsset(overrides: Record<string, unknown> = {}) {
  return {
    provenance: {
      origin: 'synthetic-self-play (test fixture)', model: 'test-model',
      selfPlayVisitsPerMove: 10, analysisVisits: 100, rules: 'japanese',
      komi: 6.5, selection: 'max entropy over turns 1..2',
      selectedTurn: 2, entropyBits: 1.5, capturedAt: '2026-08-07',
    },
    moves: [['B', 'Q16'], ['W', 'D4']],
    analysis: {
      id: 'x', isDuringSearch: false, turnNumber: 2,
      moveInfos: [{ move: 'D16', visits: 10, winrate: 0.5, scoreLead: 0, pv: ['D16'], order: 0 }],
      ownership: new Array(361).fill(0),
      policy: new Array(362).fill(0),
      rootInfo: { winrate: 0.5, scoreLead: 0, visits: 10, currentPlayer: 'B' },
    },
    ...overrides,
  };
}

describe('loadSetupWizardDemo — happy path (real bundled asset)', () => {
  it('loads and replays the real asset to a real BoardState', () => {
    const demo = loadSetupWizardDemo();
    expect(demo.board.nodes[demo.board.rootNodeId]).toBeDefined();
    expect(demo.board.currentNodeId).not.toBe(demo.board.rootNodeId);
    expect(demo.nodeId).toBe(demo.board.currentNodeId);
    expect(demo.rawAnalysis.moveInfos.length).toBeGreaterThan(0);
    expect(demo.rawAnalysis.ownership?.length).toBe(361);
    // Synthetic self-play asset (ledger row 735) — assert against the
    // new provenance shape, not any game-record naming.
    expect(demo.provenance.origin).toContain('synthetic-self-play');
    expect(demo.provenance.model).toBe('b11c768h12nbt3tflrs');
    expect(demo.provenance.selectedTurn).toBeGreaterThan(0);
  });

  it('sets komi and ruleset from provenance on the root node', () => {
    const demo = loadSetupWizardDemo();
    const root = demo.board.nodes[demo.board.rootNodeId];
    expect(root.properties['KM']).toEqual([String(demo.provenance.komi)]);
    expect(root.properties['RU']).toEqual(['Japanese']);
  });
});

describe('loadSetupWizardDemo — injected fixtures', () => {
  it('accepts a hand-built valid asset (proves the injection seam works)', () => {
    const demo = loadSetupWizardDemo(validAsset());
    expect(demo.board.currentNodeId).not.toBe(demo.board.rootNodeId);
  });
});

describe('loadSetupWizardDemo — malformed asset fails loudly (ADR-0002)', () => {
  it('throws when "moves" is missing', () => {
    const asset = validAsset();
    delete (asset as any).moves;
    expect(() => loadSetupWizardDemo(asset)).toThrow(/moves/);
  });

  it('throws when "moves" is empty', () => {
    expect(() => loadSetupWizardDemo(validAsset({ moves: [] }))).toThrow(/moves/);
  });

  it('throws when ownership has the wrong length', () => {
    const asset = validAsset();
    (asset.analysis as any).ownership = [0, 0, 0];
    expect(() => loadSetupWizardDemo(asset)).toThrow(/ownership/);
  });

  it('throws when "analysis" is missing entirely', () => {
    const asset = validAsset();
    delete (asset as any).analysis;
    expect(() => loadSetupWizardDemo(asset)).toThrow(/analysis/);
  });

  it('throws when a recorded move coordinate is illegal for the position reached', () => {
    // Same intersection played twice in a row for the SAME color is
    // rejected by the rules engine (occupied point) — a defect the
    // shape check can't catch, so the rules-engine replay itself is
    // the second, load-bearing loud-failure layer.
    const asset = validAsset({ moves: [['B', 'Q16'], ['W', 'Q16']] });
    expect(() => loadSetupWizardDemo(asset)).toThrow();
  });

  it('does not silently produce a partial board on failure (throws before returning)', () => {
    const asset = validAsset({ moves: [] });
    let threw = false;
    try {
      loadSetupWizardDemo(asset);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('fromGtp / toGtp round-trip (engine/util.ts)', () => {
  it('round-trips every on-board coordinate for a 19x19 board', () => {
    for (let x = 0; x < 19; x++) {
      for (let y = 0; y < 19; y++) {
        const coord = toGtp(x, y);
        expect(fromGtp(coord, 19)).toEqual({ x, y });
      }
    }
  });

  it('parses "pass" (any case) as null', () => {
    expect(fromGtp('pass', 19)).toBeNull();
    expect(fromGtp('PASS', 19)).toBeNull();
  });

  it('throws on an unrecognized column letter', () => {
    expect(() => fromGtp('Z16', 19)).toThrow();
  });

  it('throws on a row out of range for the board size', () => {
    expect(() => fromGtp('Q99', 19)).toThrow();
  });

  it('skips "I" the same way toGtp does', () => {
    // toGtp's alphabet skips 'I'; column index 8 is 'J', not 'I'.
    expect(toGtp(8, 0)).toBe('J1');
    expect(fromGtp('J1', 19)).toEqual({ x: 8, y: 0 });
  });
});
