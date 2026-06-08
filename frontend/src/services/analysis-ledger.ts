/**
 * src/services/analysis-ledger.ts
 * Provenance-stratified store of merged KataGo analysis data, split into a
 * RAW store (keyed by `RawKey` = model + engine-overrides) and an
 * ENRICHMENT store (keyed by `EnrichedKey` = model + overrides + palette),
 * with per-(key, nodeId) reactive version refs as the change-notification
 * surface. Consumers subscribe by reading via `getRaw` / `getEnrichment`
 * (which touch the relevant version ref) or `getCombined` (which touches
 * both).
 *
 * Why two stores: raw KataGo output (`moveInfos` / `rootInfo` / `ownership`
 * / `policy`) depends only on the network + engine overrides; palette
 * enrichment (`extra`) additionally depends on the palette. Keying both by
 * the full composite over-keyed the raw data, so a palette swap stranded the
 * raw board overlays (move suggestions, ownership) even though the raw bytes
 * were unchanged. Stratifying the keys makes raw survive a palette swap by
 * construction — a palette-only change re-mints `EnrichedKey` but not
 * `RawKey`, so raw consumers' version refs don't bump and they keep reading
 * their bucket. Branding the two key kinds makes a wrong-key read a compile
 * error (ADR-0002, strongest channel). Rationale and prior-art survey:
 * `docs/notes/consult/opus-consult-2026-06-08-ledger-keying-typeful-defense.md`.
 *
 * The two key spaces are distinct strings (different serialisations), so a
 * single `nodeVersions` map and a single `onLedgerFlush` channel keyed by
 * `${key}:${nodeId}` disambiguate them without tagging.
 *
 * Version-bump notifications are coalesced via requestAnimationFrame so
 * high-frequency packet floods (KataGo NN-cache hits, proxy replay-cache
 * replays) collapse into one redraw per browser frame. Data is stored
 * synchronously in record*(); only the reactive notification is batched.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, type Ref } from 'vue';
import {
  type KataExtra,
  type KataPlayerExtra,
  type KataAnalysisResponse,
  type RawAnalysis,
  type Enrichment,
} from '../engine/katago/types';
import { type NodeId, type BoardId, type RawKey, type EnrichedKey } from '../types';
import { store } from '../store';

// ── Internal storage (Key -> NodeId -> Value), one per provenance layer ──────
const rawData = new Map<RawKey, Map<NodeId, RawAnalysis>>();
const enrData = new Map<EnrichedKey, Map<NodeId, Enrichment>>();
const nodeVersions = new Map<string, Ref<number>>();

// ── Changed-key notification (for incremental consumers) ─────────────
// The per-node version refs above are the reactive surface for *pull*
// consumers (a `getRaw` / `getEnrichment` read inside a computed re-runs that
// computed when the node bumps). They don't tell a consumer *which* node
// changed — fine for a full re-derive, useless for an O(1) incremental patch.
// This listener surface carries the changed `${key}:${nodeId}` key-set to
// push consumers (useEnrichedData's incremental accumulator) so they patch
// only the nodes that moved. It fires at every bump site — the rAF-coalesced
// flush, the first-packet synchronous bump, and the purges — so the key-set
// is exhaustive. Keys use the same `${key}:${nodeId}` shape as
// `getOrCreateVersion`, where `key` is *either* a RawKey or an EnrichedKey
// string; the two spaces are disjoint, so a push consumer holding both keys
// matches a changed key against either and re-reads the relevant store.
type LedgerFlushListener = (changedKeys: ReadonlySet<string>) => void;
const flushListeners = new Set<LedgerFlushListener>();

/** Subscribe to changed-key notifications. Returns an unsubscribe fn. */
export function onLedgerFlush(fn: LedgerFlushListener): () => void {
  flushListeners.add(fn);
  return () => { flushListeners.delete(fn); };
}

function emitChanged(keys: ReadonlySet<string>): void {
  if (keys.size === 0 || flushListeners.size === 0) return;
  for (const fn of flushListeners) fn(keys);
}

function getOrCreateVersion(key: string, nodeId: NodeId): Ref<number> {
  const vkey = `${key}:${nodeId}`;
  let v = nodeVersions.get(vkey);
  if (!v) {
    v = ref(0);
    nodeVersions.set(vkey, v);
  }
  return v;
}

// ── Batched version-bump scheduler ────────────────────────────────────────────
// Coalesces per-node version bumps into one flush per browser frame so that
// high-frequency packet arrivals (NN-cache hits, proxy replay-cache replays)
// don't saturate the main thread re-running every consumer's computed and
// re-firing every chart's setOption. Data is updated synchronously in
// record*(); only the reactive notification is deferred. Multiple packets
// for the same (key, nodeId) within a frame collapse to one bump; multiple
// distinct keys each bump exactly once at flush time.
//
// Two cases bypass the rAF coalescing and bump synchronously, both for the
// same reason — they are one-shot transitions where immediate visual
// feedback is the whole point:
//
//   - purgeBoard / purgeAll: user action wiping data; the cleared state
//     must paint without one-frame lag.
//   - First packet for a (key, nodeId): the no-data → has-data transition.
//     The user pressed space (or branched out of a game) and is waiting to
//     see what the engine thinks; a one-frame rAF delay is specifically what
//     they notice. Flood-coalescing is the wrong shape for a single packet
//     arriving against an empty cache. See
//     `docs/worklog/2026-05-15-ledger-first-packet-sync-bump.md`.

const pendingBumps = new Set<string>();
let flushScheduled = false;

function scheduleBumpFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const key of pendingBumps) {
      const v = nodeVersions.get(key);
      if (v) v.value++;
    }
    // Notify push consumers of the coalesced change-set before clearing.
    emitChanged(pendingBumps);
    pendingBumps.clear();
  });
}

// Shared bump logic for both stores: the first packet for a (key, nodeId)
// bumps synchronously (UX-critical first-paint); subsequent packets coalesce
// to the rAF flush. Both raw and enrichment first-packets bump synchronously
// — a measured claw-back that deferred enrichment first-packets to the rAF
// path regressed render ops ~2-6% (full-stress battery, 2026-06-08): Vue's
// scheduler already coalesces the synchronous raw+enrichment double-bump into
// one render per tick, so deferring enrichment merely de-batches it across two
// frames. Keeping both synchronous is the win.
function bump(key: string, nodeId: NodeId, firstPacket: boolean, isRaw: boolean): void {
  const version = getOrCreateVersion(key, nodeId);
  if (firstPacket) {
    version.value++;
    emitChanged(new Set([`${key}:${nodeId}`]));
    // RB-3 (ADR-0009): count first-packet synchronous bumps on the RAW path
    // — each queues a render Vue flushes inside the receiving task (vs the
    // rAF-coalesced subsequent path). Raw is the overlay-blocking path the
    // lever-2 perf decision gates on. DEV-only; dead-code-eliminated in prod.
    if (isRaw && import.meta.env.DEV) performance.mark('rb3:firstBump');
  } else {
    pendingBumps.add(`${key}:${nodeId}`);
    scheduleBumpFlush();
  }
}

// Drop the given nodeIds from a store map, bumping-then-deleting each
// affected version ref (so subscribed consumers re-run and observe cleared
// data) and accumulating the cleared keys for the push-consumer notify.
function purgeNodesFrom<K extends string, V>(
  m: Map<K, Map<NodeId, V>>,
  nodeIds: readonly NodeId[],
  cleared: Set<string>,
): void {
  for (const [key, hashMap] of m.entries()) {
    for (const nodeId of nodeIds) {
      if (hashMap.has(nodeId)) {
        hashMap.delete(nodeId);
        const vkey = `${key}:${nodeId}`;
        const v = nodeVersions.get(vkey);
        if (v) {
          v.value++;
          nodeVersions.delete(vkey);
        }
        cleared.add(vkey);
      }
    }
  }
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeRecords<T extends Record<string, unknown>>(existing?: T, incoming?: T): T | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

type TriangularData = readonly [[number, number], number][];

function mergeTriangular(existing?: TriangularData, incoming?: TriangularData): TriangularData | undefined {
  if (!existing || existing.length === 0) return incoming;
  if (!incoming || incoming.length === 0) return existing;
  const incomingKeys = new Set<string>(incoming.map(([[x, y]]) => `${x},${y}`));
  const retained = existing.filter(([[x, y]]) => !incomingKeys.has(`${x},${y}`));
  return retained.length === 0 ? incoming : [...retained, ...incoming];
}

function mergePlayerExtra(existing?: KataPlayerExtra, incoming?: KataPlayerExtra): KataPlayerExtra | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    triangular: mergeTriangular(existing.triangular, incoming.triangular),
    deltas: mergeRecords(
      existing.deltas as Record<string, unknown> | undefined,
      incoming.deltas as Record<string, unknown> | undefined
    ) as Record<string, number> | undefined,
    cwt: mergeRecords(existing.cwt as Record<string, unknown> | undefined, incoming.cwt as Record<string, unknown> | undefined),
  };
}

function mergeKataExtra(existing?: KataExtra, incoming?: KataExtra): KataExtra | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    state: mergeRecords(
      existing.state as Record<string, unknown> | undefined,
      incoming.state as Record<string, unknown> | undefined
    ) as Record<string, Record<string, number>> | undefined,
    black: mergePlayerExtra(existing.black, incoming.black),
    white: mergePlayerExtra(existing.white, incoming.white),
  };
}

/**
 * Raw merge — gated by `rootInfo.visits`: a lower-visit packet (a stale
 * during-search update arriving after a deeper result) is discarded in
 * favour of the existing one. Raw fields *are* the visit-gated content.
 */
export function mergeRawAnalysis(existing: RawAnalysis | null | undefined, incoming: RawAnalysis): RawAnalysis {
  if (!existing) return incoming;
  const existingVisits = existing.rootInfo?.visits ?? 0;
  const incomingVisits = incoming.rootInfo?.visits ?? 0;
  if (incomingVisits < existingVisits) return existing;
  return incoming;
}

/**
 * Enrichment merge — additive, last-writer-wins per leaf, NO visit gate. The
 * enrichment store cannot see `rootInfo.visits` (a raw field) after the
 * split, and re-coupling the stores to thread it through would defeat the
 * stratification. This is exactly the behaviour the old combined merge ran
 * inside its success branch, minus the raw-visit gate that could previously
 * discard a whole enrichment update. Acceptable because enrichment is
 * ~monotone and the accumulator's last-path-order-wins arbitration already
 * tolerates minor disagreement.
 */
export function mergeEnrichment(existing: Enrichment | undefined, incoming: Enrichment): Enrichment {
  return mergeKataExtra(existing, incoming) ?? incoming;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class AnalysisLedger {
  /** Record the raw half of a packet under its palette-independent RawKey. */
  public recordRaw(key: RawKey, nodeId: NodeId, raw: RawAnalysis): void {
    let layer = rawData.get(key);
    if (!layer) { layer = new Map(); rawData.set(key, layer); }
    const existing = layer.get(nodeId);
    layer.set(nodeId, mergeRawAnalysis(existing, raw));
    bump(key, nodeId, existing === undefined, true);
  }

  /** Record the palette-derived enrichment half under its EnrichedKey. */
  public recordEnrichment(key: EnrichedKey, nodeId: NodeId, enr: Enrichment): void {
    let layer = enrData.get(key);
    if (!layer) { layer = new Map(); enrData.set(key, layer); }
    const existing = layer.get(nodeId);
    layer.set(nodeId, mergeEnrichment(existing, enr));
    bump(key, nodeId, existing === undefined, false);
  }

  /** Read the raw half. Branded `RawKey` param — passing an EnrichedKey is a compile error. */
  public getRaw(key: RawKey, nodeId: NodeId): RawAnalysis | null {
    getOrCreateVersion(key, nodeId).value;
    return rawData.get(key)?.get(nodeId) ?? null;
  }

  /** Read the enrichment half. Branded `EnrichedKey` param — passing a RawKey is a compile error. */
  public getEnrichment(key: EnrichedKey, nodeId: NodeId): Enrichment | null {
    getOrCreateVersion(key, nodeId).value;
    return enrData.get(key)?.get(nodeId) ?? null;
  }

  /**
   * Reconstitute the full `KataAnalysisResponse` (raw + optional extra) for a
   * node, subscribing to *both* version refs. Returns `null` when no raw half
   * exists (enrichment without raw is never surfaced — the raw half is the
   * existence anchor). This is the read the enriched-accumulator consumes, so
   * its byte-equality contract is preserved unchanged.
   */
  public getCombined(rawKey: RawKey, enrichedKey: EnrichedKey, nodeId: NodeId): KataAnalysisResponse | null {
    const raw = this.getRaw(rawKey, nodeId);
    if (!raw) return null;
    const enr = this.getEnrichment(enrichedKey, nodeId);
    return enr ? { ...raw, extra: enr } : raw;
  }

  /**
   * Non-reactive batch read of the RAW store restricted to the given nodeIds,
   * for one-shot snapshots (analysis-persistence export). Order unspecified.
   */
  public listRawForNodes(
    nodeIds: readonly NodeId[]
  ): readonly { rawKey: RawKey; nodeId: NodeId; raw: RawAnalysis }[] {
    const wanted = new Set<NodeId>(nodeIds);
    const out: { rawKey: RawKey; nodeId: NodeId; raw: RawAnalysis }[] = [];
    for (const [rawKey, layer] of rawData.entries()) {
      for (const [nodeId, raw] of layer.entries()) {
        if (wanted.has(nodeId)) out.push({ rawKey, nodeId, raw });
      }
    }
    return out;
  }

  /** Non-reactive batch read of the ENRICHMENT store, restricted to nodeIds. */
  public listEnrichmentForNodes(
    nodeIds: readonly NodeId[]
  ): readonly { enrichedKey: EnrichedKey; nodeId: NodeId; enr: Enrichment }[] {
    const wanted = new Set<NodeId>(nodeIds);
    const out: { enrichedKey: EnrichedKey; nodeId: NodeId; enr: Enrichment }[] = [];
    for (const [enrichedKey, layer] of enrData.entries()) {
      for (const [nodeId, enr] of layer.entries()) {
        if (wanted.has(nodeId)) out.push({ enrichedKey, nodeId, enr });
      }
    }
    return out;
  }

  /**
   * Drop every cached entry (both stores) and per-node version ref. Called
   * from `resetWorkspace` on identity flip so the prior identity's analysis
   * state doesn't accumulate across the session boundary. Bumps every version
   * ref before clearing so subscribed consumers re-run and observe the
   * cleared data. Resource-ownership audit O8.
   */
  public purgeAll(): void {
    const cleared = new Set(nodeVersions.keys());
    for (const v of nodeVersions.values()) {
      v.value++;
    }
    rawData.clear();
    enrData.clear();
    nodeVersions.clear();
    emitChanged(cleared);
  }

  /**
   * Drop every cached entry for a board's nodes from BOTH stores, with the
   * bump-then-delete contract (consumers re-run and observe cleared data; a
   * subsequent read returns null). A re-record on the same nodeId creates a
   * fresh ref via `getOrCreateVersion`.
   */
  public purgeBoard(boardId: BoardId): void {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return;
    const nodeIds = Object.keys(board.nodes) as NodeId[];
    const cleared = new Set<string>();
    purgeNodesFrom(rawData, nodeIds, cleared);
    purgeNodesFrom(enrData, nodeIds, cleared);
    emitChanged(cleared);
  }
}

export const ledger = new AnalysisLedger();
