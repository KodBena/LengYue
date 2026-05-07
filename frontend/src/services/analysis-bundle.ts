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
import { asBoardId } from '../store/board-factory';
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

// Server-side metadata about a stored bundle; the response shape of
// both `PUT /analysis-bundles/{board_id}` (write) and items in
// `GET /analysis-bundles` (list). All five fields come straight from
// the wire (snake_case → camelCase, board_id branded). storedByteSize
// is the post-transcoding count — the same value the per-user quota
// check sums against, so a frontend storage panel summing
// storedByteSize across the list shows the same number that would
// trigger a 413 on next save.
export type AnalysisBundleSummary = {
  readonly boardId: BoardId;
  readonly recordCount: number;
  readonly storedScheme: string;
  readonly storedByteSize: number;
  readonly updatedAt: string; // ISO-8601
};

// ── Storage-error envelope ────────────────────────────────────────────────────
// Three terminal storage outcomes the backend communicates as
// structured error bodies (Confirmations C1 + C2 in the dispatch
// chain). The wire shape is FastAPI's outer `{"detail": {...}}`
// envelope wrapping a discriminated body. Mapped here to a
// camelCased domain union so consumers pattern-match on `kind` and
// receive the relevant numeric payloads natively typed.
//
// Two distinct HTTP statuses share two of the three kinds (413 for
// the bundle-cap and quota cases, 500 for unknown_scheme); the
// `kind` discriminator is the dispatch axis on the consumer side,
// not the status code.

export type AnalysisBundleStorageError =
  | {
      readonly kind: 'bundle_too_large';
      readonly status: 413;
      readonly requestBytes: number;
      readonly capBytes: number;
      readonly detail: string;
    }
  | {
      readonly kind: 'user_quota_exceeded';
      readonly status: 413;
      readonly currentBytes: number;
      readonly quotaBytes: number;
      readonly detail: string;
    }
  | {
      readonly kind: 'unknown_scheme';
      readonly status: 500;
      readonly scheme: string;
      readonly detail: string;
    };

/**
 * Parse the message of an `Error` thrown by `api-client.ts` into a
 * typed `AnalysisBundleStorageError`, if the body shape matches one
 * of the three storage-error envelopes.
 *
 * Returns null when the error wasn't shaped by the api-client (e.g.,
 * a thrown TypeError from a network failure), when the body isn't
 * JSON, when the JSON doesn't carry the expected envelope, or when
 * the `kind` discriminator isn't one we know. In all those cases
 * the caller should rethrow the original — losing wire-shape detail
 * for an unrecognised body would silently strip diagnostic
 * information per ADR-0002.
 *
 * Pure function: no I/O, no side effects, no shared state.
 */
export function parseStorageError(err: unknown): AnalysisBundleStorageError | null {
  if (!(err instanceof Error)) return null;
  // api-client throws with the shape "API Error <status>: <body>".
  // The body is whatever FastAPI put on the wire — typically JSON
  // with a top-level `detail` field carrying our discriminated
  // body. We match against a numeric status and JSON-shaped body;
  // anything else returns null.
  const m = err.message.match(/^API Error (\d+):\s*(.*)$/s);
  if (!m) return null;
  const status = parseInt(m[1], 10);
  const bodyText = m[2];

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const detail = (parsed as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return null;
  const body = detail as Record<string, unknown>;
  const kind = body.kind;

  if (status === 413 && kind === 'bundle_too_large') {
    if (typeof body.request_bytes !== 'number' || typeof body.cap_bytes !== 'number') return null;
    return {
      kind: 'bundle_too_large',
      status: 413,
      requestBytes: body.request_bytes,
      capBytes: body.cap_bytes,
      detail: typeof body.detail === 'string' ? body.detail : '',
    };
  }
  if (status === 413 && kind === 'user_quota_exceeded') {
    if (typeof body.current_bytes !== 'number' || typeof body.quota_bytes !== 'number') return null;
    return {
      kind: 'user_quota_exceeded',
      status: 413,
      currentBytes: body.current_bytes,
      quotaBytes: body.quota_bytes,
      detail: typeof body.detail === 'string' ? body.detail : '',
    };
  }
  if (status === 500 && kind === 'unknown_scheme') {
    if (typeof body.scheme !== 'string') return null;
    return {
      kind: 'unknown_scheme',
      status: 500,
      scheme: body.scheme,
      detail: typeof body.detail === 'string' ? body.detail : '',
    };
  }
  return null;
}

// `asBoardId` is re-exported from the factory so consumers needing
// to brand an incoming UUID string (e.g., the ACL projecting a wire
// `board_id`) don't have to import from store internals.
export { asBoardId };

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
