/**
 * src/services/analysis-bundle.ts
 * Pure projection / replay between the AnalysisLedger and the
 * persistence wire shape (the per-BoardId bundle).
 *
 * No side effects, no network. The two functions below are the
 * entire frontend↔wire surface for analysis persistence; if the
 * ledger's internal key tuple ever changes (e.g., a future
 * (modelVersion, configHash, nodeId) discrimination per the
 * dispatch's forward-compat note), exactly these two sites and
 * the AnalysisRecord type below need to track the change. Keep
 * them narrow.
 *
 * The wire shape mirrors the backend dispatch
 * (docs/dispatch/frontend-to-backend-analysis-persistence.md);
 * adjust together if either evolves.
 *
 * License: Public Domain (The Unlicense)
 */

import type { KataAnalysisResponse } from '../engine/katago/types';
import type { BoardId, NodeId } from '../types';
import { ledger } from './analysis-ledger';
import { store } from '../store';

export const BUNDLE_SCHEMA_VERSION = 1 as const;
export type BundleSchemaVersion = typeof BUNDLE_SCHEMA_VERSION;

export type AnalysisRecord = {
  readonly configHash: string;
  readonly nodeId: NodeId;
  readonly packet: KataAnalysisResponse;
};

export type AnalysisBundle = {
  readonly schemaVersion: BundleSchemaVersion;
  readonly records: readonly AnalysisRecord[];
};

/**
 * Project the AnalysisLedger into a flat bundle for the given
 * board. The bundle contains every (configHash, nodeId, packet)
 * triple the ledger holds for nodes belonging to this board,
 * across every configHash. Record order is unspecified.
 *
 * One-shot snapshot for upload, not a reactive view; no
 * version-ref subscriptions are registered.
 *
 * Returns an empty bundle if the boardId is unknown — fail-quiet
 * here is intentional, because the natural caller is a UI button
 * that should produce an empty-but-valid bundle for an empty
 * board. Distinguish from a missing-board error at the call site
 * if it matters.
 */
export function projectLedgerToBundle(boardId: BoardId): AnalysisBundle {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) {
    return { schemaVersion: BUNDLE_SCHEMA_VERSION, records: [] };
  }
  const nodeIds = Object.keys(board.nodes) as NodeId[];
  const records = ledger.listEntriesForNodes(nodeIds);
  return { schemaVersion: BUNDLE_SCHEMA_VERSION, records };
}

/**
 * Replay a bundle into the AnalysisLedger via the existing
 * record() API. Each record yields one ledger.record() call;
 * the ledger's merge logic (see mergeAnalysisPacket) preserves
 * the higher-visit packet if a fresher record happens to be
 * already present, so replay-after-live-analysis is safe.
 *
 * Unknown schema versions throw — silent skip would let the user
 * believe their analyses hydrated when in fact they didn't (the
 * exact silent-failure ADR-0002 forbids).
 */
export function replayBundleIntoLedger(bundle: AnalysisBundle): void {
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `analysis-bundle: unsupported schemaVersion ${bundle.schemaVersion}; ` +
      `this client supports up to ${BUNDLE_SCHEMA_VERSION}`,
    );
  }
  for (const r of bundle.records) {
    ledger.record(r.configHash, r.nodeId, r.packet);
  }
}
