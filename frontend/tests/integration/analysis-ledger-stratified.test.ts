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
 * additive last-writer-wins), the nested-null merge guard (the adaptive-deeper
 * postmortem's §5.5 observation: a null-bearing inner record replacing a
 * populated leaf must surface loudly), and the persistence round-trip +
 * legacy-v1 replay path (enrichment restored, raw dropped, warned).
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
import { addBoard, store, clearSystemMessages } from '../../src/store';
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

describe('mergeEnrichment — nested-null guard (adaptive-deeper postmortem §5.5)', () => {
  // Wire-origin anomaly fixture: a palette delta_fn producing NaN under
  // asteval serialises to JSON null, which the static type cannot represent
  // (`state` leaf values are typed `Record<string, number>`). The double cast
  // is justified because it constructs exactly the type-lying packet the
  // §5.5 guard exists to catch.
  const nullBearingLeaf = { Win: null, Complexity: 0.3 } as unknown as Record<string, number>;

  beforeEach(() => {
    clearSystemMessages();
  });

  it('loud-warns (structured console.warn + one system message) when a null-bearing state record replaces a populated leaf', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const existing: Enrichment = { state: { '42': { Win: 0.61, Complexity: 0.2 } } };
    const incoming: Enrichment = { state: { '42': nullBearingLeaf } };
    const merged = mergeEnrichment(existing, incoming);

    // Merge semantics unchanged: last-writer-wins per leaf — the guard
    // surfaces the anomaly, it does not block the replacement.
    expect(merged.state?.['42']).toEqual({ Win: null, Complexity: 0.3 });

    // Level-5 structured warn from the instance-blind helper, every time.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({ label: 'extra.state', key: '42', nullFields: ['Win'] });

    // Level-4 terminal: one user-visible system message, de-duplicated per
    // label so a packet flood cannot wipe the system log.
    const warnings = () => store.engine.messages.filter(m => m.type === 'warning');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0].text).toContain('extra.state');

    // A second offending merge still console.warns but adds no second message.
    mergeEnrichment(existing, incoming);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warnings()).toHaveLength(1);

    // purgeAll resets the latch with the workspace: a fresh session surfaces
    // the anomaly anew.
    ledger.purgeAll();
    mergeEnrichment(existing, incoming);
    expect(warnings()).toHaveLength(2);

    warn.mockRestore();
  });

  it('stays silent when nothing populated is lost or the incoming record is null-free', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Null-bearing record landing on an absent leaf: no populated data lost.
    mergeEnrichment({ state: { '7': { Win: 0.5 } } }, { state: { '42': nullBearingLeaf } });
    // Null-bearing record replacing an empty (unpopulated) leaf: likewise.
    mergeEnrichment({ state: { '42': {} } }, { state: { '42': nullBearingLeaf } });
    // Null-free record replacing a populated leaf: the ordinary merge.
    mergeEnrichment({ state: { '42': { Win: 0.61 } } }, { state: { '42': { Win: 0.7 } } });

    expect(warn).not.toHaveBeenCalled();
    expect(store.engine.messages.filter(m => m.type === 'warning')).toHaveLength(0);

    warn.mockRestore();
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
