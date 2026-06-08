/**
 * tests/integration/analysis-ledger-stratified.test.ts
 *
 * Proves the provenance-stratified ledger keying — the fix for board overlays
 * blanking out after a review session whose card palette differs from the
 * active palette. The headline test is the palette-swap regression: a palette
 * change re-mints the enriched key but NOT the raw key, so raw data
 * (moveInfos / rootInfo / ownership) stays reachable.
 *
 * Also covers the per-store merge semantics (raw visit-gate, enrichment
 * additive last-writer-wins) and the persistence round-trip + legacy-v1
 * replay path (enrichment restored, raw dropped, warned).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deriveAnalysisKeys } from '../../src/services/analysis-config';
import {
  ledger,
  mergeRawAnalysis,
  mergeEnrichment,
} from '../../src/services/analysis-ledger';
import {
  projectLedgerToBundle,
  replayBundleIntoLedger,
  BUNDLE_SCHEMA_VERSION,
  type AnalysisBundle,
} from '../../src/services/analysis-bundle';
import { createInitialBoard } from '../../src/store/board-factory';
import { addBoard } from '../../src/store';
import type { NodeId, RawKey, EnrichedKey, RawAnalysis, Enrichment } from '../../src/types';

const OVERRIDES = { reportAnalysisWinratesAs: 'WHITE' };
const PALETTE_A = { bindings: { delta_fn: 'a' }, parameters: {}, symbols: {} };
const PALETTE_B = { bindings: { delta_fn: 'b' }, parameters: {}, symbols: {} };

function rawAt(visits: number): RawAnalysis {
  return {
    id: 'q',
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [{ move: 'Q16', visits, winrate: 0.5, scoreLead: 0, pv: [], order: 0 }],
    rootInfo: { winrate: 0.5, scoreLead: 0, visits, currentPlayer: 'B' },
  };
}

beforeEach(() => {
  ledger.purgeAll();
});

describe('deriveAnalysisKeys — provenance stratification', () => {
  it('keeps the raw key stable across a palette-only change, re-mints the enriched key', () => {
    const a = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX');
    const b = deriveAnalysisKeys(PALETTE_B, OVERRIDES, 'modelX');
    expect(a.rawKey).toBe(b.rawKey);            // palette-independent
    expect(a.enrichedKey).not.toBe(b.enrichedKey); // palette-dependent
  });

  it('re-mints the raw key when overrides or model change', () => {
    const base = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX');
    const otherOverrides = deriveAnalysisKeys(PALETTE_A, { reportAnalysisWinratesAs: 'BLACK' }, 'modelX');
    const otherModel = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelY');
    expect(otherOverrides.rawKey).not.toBe(base.rawKey);
    expect(otherModel.rawKey).not.toBe(base.rawKey);
  });
});

describe('ledger — raw survives a palette swap (the regression)', () => {
  it('returns the raw half under the unchanged raw key after the active palette changes', () => {
    const node = 'n1' as NodeId;
    const a = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX'); // "review session" palette
    const b = deriveAnalysisKeys(PALETTE_B, OVERRIDES, 'modelX'); // "active" palette afterwards

    ledger.recordRaw(a.rawKey, node, rawAt(1000));

    // The board overlay reads the raw store by the active palette's raw key —
    // which is byte-identical to the review palette's raw key. Pre-fix this
    // read missed (it keyed by the full composite) and the overlay blanked.
    expect(ledger.getRaw(b.rawKey, node)?.rootInfo.visits).toBe(1000);
    // Enrichment buckets are independent and palette-specific.
    expect(ledger.getEnrichment(b.enrichedKey, node)).toBeNull();
  });
});

describe('ledger merge semantics', () => {
  it('mergeRawAnalysis gates on rootInfo.visits (lower-visit packet discarded)', () => {
    expect(mergeRawAnalysis(rawAt(1000), rawAt(500)).rootInfo.visits).toBe(1000);
    expect(mergeRawAnalysis(rawAt(500), rawAt(1000)).rootInfo.visits).toBe(1000);
    expect(mergeRawAnalysis(null, rawAt(250)).rootInfo.visits).toBe(250);
  });

  it('mergeEnrichment is additive last-writer-wins (no visit gate)', () => {
    const existing: Enrichment = { black: { deltas: { '0': 0.1 } } };
    const incoming: Enrichment = { black: { deltas: { '1': 0.2 } } };
    const merged = mergeEnrichment(existing, incoming);
    expect(merged.black?.deltas).toEqual({ '0': 0.1, '1': 0.2 });
  });
});

describe('persistence round-trip + legacy replay', () => {
  it('round-trips both stores through project → purge → replay', () => {
    const board = createInitialBoard();
    addBoard(board);
    const node = board.rootNodeId;
    const k = deriveAnalysisKeys(PALETTE_A, OVERRIDES, 'modelX');

    ledger.recordRaw(k.rawKey, node, rawAt(1000));
    ledger.recordEnrichment(k.enrichedKey, node, { black: { deltas: { '0': 0.7 } } });

    const bundle = projectLedgerToBundle(board.id);
    ledger.purgeAll();
    expect(ledger.getRaw(k.rawKey, node)).toBeNull();

    replayBundleIntoLedger(bundle);
    expect(ledger.getRaw(k.rawKey, node)?.rootInfo.visits).toBe(1000);
    expect(ledger.getEnrichment(k.enrichedKey, node)?.black?.deltas).toEqual({ '0': 0.7 });
  });

  it('legacy v1 bundle: restores enrichment under the composite key, drops raw, warns', () => {
    const node = 'legacy-node' as NodeId;
    const composite = 'abc123'; // bare pre-stratification hash (== the enriched key)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const legacyBundle: AnalysisBundle = {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      records: [{
        configHash: composite,
        nodeId: node,
        packet: { ...rawAt(800), extra: { black: { deltas: { '0': 0.5 } } } },
      }],
    };
    replayBundleIntoLedger(legacyBundle);

    // Enrichment restored under the composite (== enriched) key…
    expect(ledger.getEnrichment(composite as EnrichedKey, node)?.black?.deltas).toEqual({ '0': 0.5 });
    // …but the raw half is NOT recorded under the composite key (its true raw
    // key is underivable from the one-way hash) — it re-fetches live instead.
    expect(ledger.getRaw(composite as RawKey, node)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
