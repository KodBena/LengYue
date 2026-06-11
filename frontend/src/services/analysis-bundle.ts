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
import type { BoardId, NodeId, RawKey, EnrichedKey } from '../types';
import { asBoardId } from '../store/board-factory';
import { ledger } from './analysis-ledger';
import { store } from '../store';
import { ApiError } from './api-client';

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
// `GET /analysis-bundles` (list). storedByteSize is the post-
// transcoding count — the same value the per-user quota check sums
// against, so a frontend storage panel summing storedByteSize
// across the list shows the same number that would trigger a 413
// on next save.
//
// uncompressedByteSize and formatDescriptor are populated for v2
// stored bundles (the cross/analysis-bundle-compression-v2 arc);
// v1 bundles surface null for both because the backend doesn't
// track those quantities under v1's codec dispatch. The storage
// panel renders null as "—" (unknown / not applicable) rather than
// zero.
export type AnalysisBundleSummary = {
  readonly boardId: BoardId;
  readonly recordCount: number;
  readonly storedScheme: string;
  readonly storedByteSize: number;
  readonly updatedAt: string; // ISO-8601
  readonly uncompressedByteSize: number | null;
  readonly formatDescriptor: Readonly<Record<string, unknown>> | null;
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
 * Parse the `ApiError` thrown by `api-client.ts` into a typed
 * `AnalysisBundleStorageError`, if the status + body shape match one
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
  if (!(err instanceof ApiError)) return null;
  // api-client throws ApiError carrying the HTTP status and raw body.
  // The body is whatever FastAPI put on the wire — typically JSON with
  // a top-level `detail` field carrying our discriminated body. Anything
  // that isn't JSON / doesn't carry the expected envelope returns null.
  const status = err.status;
  const bodyText = err.body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  // Read `detail` off the checked non-null parsed body as `unknown`.
  const detail = (parsed as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return null;
  // Checked non-null object above; treat as an open record for field reads
  // (each field is type-checked below before use — decode frontier).
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

/**
 * Recognise an `AnalysisBundleStorageError` regardless of which throw
 * shape it arrives in. The persistence service's two throw sites are
 * NOT symmetric:
 *
 *   - `rethrowAsStorageError` (analysis-persistence-service.ts) throws
 *     the ALREADY-PARSED structural union — a plain `{kind,status,…}`
 *     POJO, deliberately not an `Error` subclass (the contract the
 *     service header, AnalysisControls.vue's `isStorageError`, and the
 *     only-throw-error inline-disable in eslint.config.js all lean on).
 *     `parseStorageError` rejects this shape at its `instanceof ApiError`
 *     gate, so a consumer that only called `parseStorageError` could
 *     never see the real service's terminal storage failures (the
 *     autosave-pause-unreachable defect).
 *   - a raw `ApiError` can still reach a consumer where the wrapping
 *     `try/catch` is absent (and is what the Tier-1 unit tests pin),
 *     so the fallback to `parseStorageError` is load-bearing, not
 *     defensive padding.
 *
 * This recogniser is the single seam a catch-site uses to decide
 * "is this a typed storage failure?" without having to know which of
 * the two shapes it got. It re-validates the structural-union case so
 * a malformed POJO (a `{kind}` with a missing numeric leg) is rejected
 * rather than smuggled through — symmetric with `parseStorageError`'s
 * own per-kind field checks.
 *
 * Pure function: no I/O, no side effects, no shared state.
 */
export function asStorageError(err: unknown): AnalysisBundleStorageError | null {
  // Path 1: the real-service throw — an already-parsed structural union.
  const fromUnion = recogniseStorageUnion(err);
  if (fromUnion) return fromUnion;
  // Path 2: a raw ApiError (unit-test path; any future direct rethrow).
  return parseStorageError(err);
}

/**
 * Narrow an arbitrary value to the `AnalysisBundleStorageError` union by
 * its `kind` discriminator and the per-kind required fields. Returns the
 * value re-typed when it is a well-formed member, null otherwise. Kept
 * private — `asStorageError` is the public recogniser; this is its
 * structural-union leg.
 */
function recogniseStorageUnion(err: unknown): AnalysisBundleStorageError | null {
  if (!err || typeof err !== 'object') return null;
  // Checked non-null object above; read its discriminator/required legs as
  // `unknown` through an open record (validated per-member below).
  const e = err as Record<string, unknown>;
  // Each return below casts only after the discriminator + every required
  // leg of that member is runtime-checked above — the same validation
  // `parseStorageError` performs on the wire body, here on the domain
  // POJO. The cast bridges the narrowing the type system can't infer
  // through `Record<string, unknown>` indexing; it targets the branded
  // domain union, not `any`.
  if (e.kind === 'bundle_too_large' && e.status === 413) {
    if (typeof e.requestBytes !== 'number' || typeof e.capBytes !== 'number') return null;
    return err as AnalysisBundleStorageError; // validated bundle_too_large member
  }
  if (e.kind === 'user_quota_exceeded' && e.status === 413) {
    if (typeof e.currentBytes !== 'number' || typeof e.quotaBytes !== 'number') return null;
    return err as AnalysisBundleStorageError; // validated user_quota_exceeded member
  }
  if (e.kind === 'unknown_scheme' && e.status === 500) {
    if (typeof e.scheme !== 'string') return null;
    return err as AnalysisBundleStorageError; // validated unknown_scheme member
  }
  return null;
}

// `asBoardId` is re-exported from the factory so consumers needing
// to brand an incoming UUID string (e.g., the ACL projecting a wire
// `board_id`) don't have to import from store internals.
export { asBoardId };

// The provenance-stratified ledger holds two stores keyed by two distinct
// key spaces (raw vs enriched). The wire bundle is a single flat `records`
// list of `{configHash, nodeId, packet}` (unchanged so the v1 + v2 encoder
// schemes don't need to track this), so we serialise the two stores as
// independent records disambiguated by a self-describing `configHash` prefix:
//
//   - `r:<rawKey>`       — a raw half; `packet` is the `RawAnalysis` (no `extra`).
//   - `e:<enrichedKey>`  — an enrichment half; `packet` carries the enrichment
//     under `extra`, with an empty raw placeholder so the record satisfies the
//     `KataAnalysisResponse` shape the encoders dereference (replay reads only
//     `packet.extra` from these). The wire `schema_version` stays `1`
//     (backend-gated literal); the prefix is what distinguishes the new
//     encoding from legacy bare-hash records.
//   - bare `<hash>` (no prefix) — a LEGACY pre-stratification record whose
//     `configHash` is the old composite hash (== the enriched key). On replay
//     its enrichment restores under that key; its raw half is dropped (the raw
//     key is underivable from the one-way composite hash) and re-fetches live
//     on next navigation. See `replayBundleIntoLedger`.
//
// Prefix-collision audit, answered SAFE (2026-06-10 history-lessons audit
// §3.5; work-status item `keyed-cache-brand-at-construction`): the prefixes
// mint in exactly one function (`projectLedgerToBundle`) and parse in exactly
// one (`replayBundleIntoLedger`), both in this file — no other module reads
// or writes the prefixed configHash encoding. Legacy persisted values are
// bare DJB2 hex (`hashConfig`'s `(hash >>> 0).toString(16)`, alphabet
// 0-9a-f) or the literal 'default'; neither can carry ':' at index 1, so no
// legacy value can ever match the `r:`/`e:` startsWith dispatch in replay.
// Any future third record kind must preserve all three properties: single
// mint site, single parse site, prefix disjoint from bare-hex/'default'.
const RAW_PREFIX = 'r:';
const ENR_PREFIX = 'e:';

// Empty raw placeholder for enrichment-only records (see above). Honest
// "no raw signal" values; replay never reads them.
const ENRICHMENT_PLACEHOLDER_RAW = {
  id: '',
  turnNumber: 0,
  isDuringSearch: false,
  moveInfos: [],
  rootInfo: { winrate: 0, scoreLead: 0, visits: 0, currentPlayer: 'B' as const },
};

/**
 * Project the AnalysisLedger into a flat bundle for the given board. Emits one
 * record per raw entry (`r:` prefix) and one per enrichment entry (`e:`
 * prefix) the ledger holds for this board's nodes, across every key. The two
 * stores are persisted independently — no pairing — and reassembled at read
 * time by the consumers via `activeAnalysisKeys`. Record order unspecified.
 *
 * One-shot snapshot for upload, not a reactive view; no version-ref
 * subscriptions are registered.
 *
 * Returns an empty bundle if the boardId is unknown — fail-quiet here is
 * intentional (the natural caller is a UI button that should produce an
 * empty-but-valid bundle for an empty board).
 */
export function projectLedgerToBundle(boardId: BoardId): AnalysisBundle {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) {
    return { schemaVersion: BUNDLE_SCHEMA_VERSION, records: [] };
  }
  // board.nodes is a Record<NodeId, …>, so its own keys are NodeIds (the
  // Object.keys widening to string[] is undone by this re-brand).
  const nodeIds = Object.keys(board.nodes) as NodeId[];
  const rawRecords: AnalysisRecord[] = ledger.listRawForNodes(nodeIds).map(r => ({
    configHash: `${RAW_PREFIX}${r.rawKey}`,
    nodeId: r.nodeId,
    packet: r.raw,
  }));
  const enrichmentRecords: AnalysisRecord[] = ledger.listEnrichmentForNodes(nodeIds).map(e => ({
    configHash: `${ENR_PREFIX}${e.enrichedKey}`,
    nodeId: e.nodeId,
    packet: { ...ENRICHMENT_PLACEHOLDER_RAW, extra: e.enr },
  }));
  return { schemaVersion: BUNDLE_SCHEMA_VERSION, records: [...rawRecords, ...enrichmentRecords] };
}

/**
 * Replay a bundle into the AnalysisLedger's two stores. Each record routes by
 * its `configHash` prefix (see the prefix note above): `r:` → `recordRaw`,
 * `e:` → `recordEnrichment`, bare → legacy combined record (enrichment
 * restored under the composite key, raw dropped + warned). The per-store merge
 * logic preserves the higher-visit raw packet and additively merges
 * enrichment, so replay-after-live-analysis is safe.
 *
 * Unknown schema versions throw — silent skip would let the user believe their
 * analyses hydrated when in fact they didn't (the exact silent-failure
 * ADR-0002 forbids).
 */
export function replayBundleIntoLedger(bundle: AnalysisBundle): void {
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `analysis-bundle: unsupported schemaVersion ${bundle.schemaVersion}; ` +
      `this client supports up to ${BUNDLE_SCHEMA_VERSION}`,
    );
  }
  let legacyRawDropped = 0;
  for (const r of bundle.records) {
    if (r.configHash.startsWith(RAW_PREFIX)) {
      // Stripped the `r:` prefix off a confirmed raw-record hash; the
      // remainder is a RawKey by the bundle's key-prefix contract.
      const rawKey = r.configHash.slice(RAW_PREFIX.length) as RawKey;
      const { extra: _extra, ...raw } = r.packet;
      ledger.recordRaw(rawKey, r.nodeId, raw);
    } else if (r.configHash.startsWith(ENR_PREFIX)) {
      // Stripped the `e:` prefix off a confirmed enrichment-record hash; the
      // remainder is an EnrichedKey by the bundle's key-prefix contract.
      const enrichedKey = r.configHash.slice(ENR_PREFIX.length) as EnrichedKey;
      if (r.packet.extra) ledger.recordEnrichment(enrichedKey, r.nodeId, r.packet.extra);
    } else {
      // Legacy pre-stratification record: the bare configHash is the old
      // composite hash, which equals today's enriched key. Restore the
      // enrichment under it; drop the raw half (its raw key cannot be derived
      // from the one-way composite hash) — it re-fetches live on navigation.
      // Recording the legacy raw under the composite key would re-strand it
      // from the raw-key consumers, reintroducing the very bug this fixes.
      const enrichedKey = r.configHash as EnrichedKey;
      if (r.packet.extra) ledger.recordEnrichment(enrichedKey, r.nodeId, r.packet.extra);
      legacyRawDropped++;
    }
  }
  if (legacyRawDropped > 0) {
    console.warn(
      `[analysis-bundle] legacy bundle: restored enrichment for ${legacyRawDropped} ` +
      `record(s); their raw analyses re-fetch on navigation (raw key not derivable ` +
      `from the pre-stratification composite hash).`,
    );
  }
}
