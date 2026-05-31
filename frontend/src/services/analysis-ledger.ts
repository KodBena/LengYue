/**
 * src/services/analysis-ledger.ts
 * Per-(configHash, nodeId) store of merged KataGo analysis packets,
 * with per-node reactive version refs as the change-notification
 * surface. Consumers (composables, charts) subscribe by reading via
 * `getRaw`, which touches the relevant version ref.
 *
 * Version-bump notifications are coalesced via requestAnimationFrame
 * so high-frequency packet floods (KataGo NN-cache hits, proxy
 * replay-cache replays) collapse into one redraw per browser frame.
 * The merged packet is stored synchronously in record(); only the
 * reactive notification is batched.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, type Ref } from 'vue';
import { type KataAnalysisResponse, type KataExtra, type KataPlayerExtra } from '../engine/katago/types';
import { type NodeId, type BoardId } from '../types';
import { store } from '../store';

// ── Internal storage (Hash -> NodeId -> Packet) ──────────────────────

const data = new Map<string, Map<NodeId, KataAnalysisResponse>>();
const nodeVersions = new Map<string, Ref<number>>();

// ── Changed-key notification (for incremental consumers) ─────────────
// The per-node version refs above are the reactive surface for *pull*
// consumers (a `getRaw` read inside a computed re-runs that computed when
// the node bumps). They don't tell a consumer *which* node changed — fine
// for a full re-derive, useless for an O(1) incremental patch. This
// listener surface carries the changed `${hash}:${nodeId}` key-set to push
// consumers (useEnrichedData's incremental accumulator) so they patch only
// the nodes that moved. It fires at every bump site — the rAF-coalesced
// flush, the first-packet synchronous bump, and the purges — so the key-set
// is exhaustive. Keys use the same `${hash}:${nodeId}` shape as
// `getOrCreateVersion`.
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

function getOrCreateVersion(hash: string, nodeId: NodeId): Ref<number> {
  const key = `${hash}:${nodeId}`;
  let v = nodeVersions.get(key);
  if (!v) {
    v = ref(0);
    nodeVersions.set(key, v);
  }
  return v;
}

// ── Batched version-bump scheduler ────────────────────────────────────────────
// Coalesces per-node version bumps into one flush per browser frame so that
// high-frequency packet arrivals (NN-cache hits, proxy replay-cache replays)
// don't saturate the main thread re-running every consumer's computed and
// re-firing every chart's setOption. Data is updated synchronously in
// record(); only the reactive notification is deferred. Multiple packets
// for the same (hash, nodeId) within a frame collapse to one bump; multiple
// distinct keys each bump exactly once at flush time.
//
// Two cases bypass the rAF coalescing and bump synchronously, both for the
// same reason — they are one-shot transitions where immediate visual
// feedback is the whole point:
//
//   - purgeBoard / purgeAll: user action wiping data; the cleared state
//     must paint without one-frame lag.
//   - First packet for a (hash, nodeId): the no-data → has-data
//     transition. The user pressed space (or branched out of a game) and
//     is waiting to see what the engine thinks; a one-frame rAF delay is
//     specifically what they notice. Flood-coalescing is the wrong shape
//     for a single packet arriving against an empty cache. See
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

export function mergeAnalysisPacket(existing: KataAnalysisResponse | null | undefined, incoming: KataAnalysisResponse): KataAnalysisResponse {
  if (!existing) return incoming;
  const existingVisits = existing.rootInfo?.visits ?? 0;
  const incomingVisits = incoming.rootInfo?.visits ?? 0;
  if (incomingVisits < existingVisits) return existing;
  return { ...incoming, extra: mergeKataExtra(existing.extra, incoming.extra) };
}

// ── Public API ────────────────────────────────────────────────────────────────

export class AnalysisLedger {
  public record(hash: string, nodeId: NodeId, packet: KataAnalysisResponse): void {
    if (!data.has(hash)) data.set(hash, new Map());
    const hashData = data.get(hash)!;

    const existing = hashData.get(nodeId);
    const merged = mergeAnalysisPacket(existing, packet);
    hashData.set(nodeId, merged);

    const version = getOrCreateVersion(hash, nodeId);
    if (existing === undefined) {
      // First packet for this (hash, nodeId): bump synchronously so the
      // first paint lands without the rAF coalescer's one-frame delay.
      // The flood-protection rationale documented above applies to
      // sustained packet streams against an already-populated cache; a
      // single packet arriving against an empty cache is the case where
      // the user just pressed space (or branched off-game) and is
      // waiting to see what the engine thinks. Same shape as the
      // purgeBoard / purgeAll synchronous-bump bypass at the other end
      // of the data lifecycle.
      version.value++;
      emitChanged(new Set([`${hash}:${nodeId}`]));
      // RB-3 (ADR-0009): count first-packet synchronous bumps — each queues
      // a render Vue flushes inside the receiving task (vs the rAF-coalesced
      // subsequent path below). Frequency here gates lever 2 (defer
      // first-bumps to rAF). DEV-only; dead-code-eliminated in prod.
      if (import.meta.env.DEV) performance.mark('rb3:firstBump');
    } else {
      // Subsequent packets coalesce: data is updated synchronously above
      // (mergeAnalysisPacket has already run); only the reactive
      // notification defers to next-frame flush. NN-cache hits and
      // proxy replay-cache replays go through this path.
      pendingBumps.add(`${hash}:${nodeId}`);
      scheduleBumpFlush();
    }
  }

  public getRaw(hash: string, nodeId: NodeId): KataAnalysisResponse | null {
    getOrCreateVersion(hash, nodeId).value;
    return data.get(hash)?.get(nodeId) ?? null;
  }

  /**
   * Non-reactive batch read across every configHash, restricted
   * to the given nodeIds. Intended for one-shot snapshots like
   * the analysis-persistence bundle export, not for reactive
   * views (no version-ref subscriptions are registered). Order
   * of returned entries is unspecified.
   */
  public listEntriesForNodes(
    nodeIds: readonly NodeId[]
  ): readonly { configHash: string; nodeId: NodeId; packet: KataAnalysisResponse }[] {
    const wantedNodes = new Set<NodeId>(nodeIds);
    const out: { configHash: string; nodeId: NodeId; packet: KataAnalysisResponse }[] = [];
    for (const [hash, hashMap] of data.entries()) {
      for (const [nodeId, packet] of hashMap.entries()) {
        if (wantedNodes.has(nodeId)) {
          out.push({ configHash: hash, nodeId, packet });
        }
      }
    }
    return out;
  }

  /**
   * Drop every cached packet and per-node version ref. Called from
   * `resetWorkspace` on identity flip so the prior identity's
   * analysis state doesn't accumulate in the singleton across
   * the session boundary.
   *
   * Bumps every existing version ref before clearing so any
   * subscribed consumer's computed re-runs and observes the
   * cleared data — same bump-then-delete contract as `purgeBoard`,
   * applied to all entries at once. Consumers re-attach to fresh
   * refs through `getOrCreateVersion` on their next compute run
   * (the pattern getRaw uses).
   *
   * Resource-ownership audit O8. NodeIds are UUID-style and don't
   * collide across users, so this is bounded-memory hygiene rather
   * than the privacy concern that motivates the useCardThumbnail
   * clear (O10).
   */
  public purgeAll(): void {
    const cleared = new Set(nodeVersions.keys());
    for (const v of nodeVersions.values()) {
      v.value++;
    }
    data.clear();
    nodeVersions.clear();
    // Notify push consumers so their accumulators clear the purged nodes
    // (a subsequent getRaw returns null → the node's contribution drops).
    emitChanged(cleared);
  }

  public purgeBoard(boardId: BoardId): void {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return;
    const nodeIds = Object.keys(board.nodes) as NodeId[];

    const cleared = new Set<string>();
    for (const [hash, hashMap] of data.entries()) {
      for (const nodeId of nodeIds) {
        if (hashMap.has(nodeId)) {
          hashMap.delete(nodeId);
          const key = `${hash}:${nodeId}`;
          const v = nodeVersions.get(key);
          if (v) {
            // Bump first so any subscribed consumer's computed re-runs
            // and observes the cleared data, then drop the ref so it
            // isn't retained for nodes that no longer have data. A
            // re-record on the same nodeId creates a fresh ref via
            // getOrCreateVersion; consumers re-attach through the same
            // call inside their read body (see getRaw above).
            v.value++;
            nodeVersions.delete(key);
          }
          cleared.add(key);
        }
      }
    }
    emitChanged(cleared);
  }
}

export const ledger = new AnalysisLedger();
