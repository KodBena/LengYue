import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { type KataAnalysisResponse, type KataExtra, type KataPlayerExtra } from '../engine/katago/types';
import { type NodeId, type BoardId } from '../types';
import { store } from '../store';

export type MetricKernel = (
  sequence: (KataAnalysisResponse | null)[],
  index: number
) => number | null;

// ── Internal storage (Hash -> NodeId -> Packet) ──────────────────────

const data = new Map<string, Map<NodeId, KataAnalysisResponse>>();
const nodeVersions = new Map<string, Ref<number>>();

function getOrCreateVersion(hash: string, nodeId: NodeId): Ref<number> {
  const key = `${hash}:${nodeId}`;
  let v = nodeVersions.get(key);
  if (!v) {
    v = ref(0);
    nodeVersions.set(key, v);
  }
  return v;
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
    getOrCreateVersion(hash, nodeId).value++;
  }

  public getRaw(hash: string, nodeId: NodeId): KataAnalysisResponse | null {
    getOrCreateVersion(hash, nodeId).value;
    return data.get(hash)?.get(nodeId) ?? null;
  }

  public getProjectedSequence(
    hash: string,
    nodeIds: NodeId[],
    filter?: (packet: KataAnalysisResponse) => boolean,
    compress: boolean = false
  ): ComputedRef<(KataAnalysisResponse | null)[]> {
    nodeIds.forEach(id => getOrCreateVersion(hash, id));

    return computed(() => {
      for (const id of nodeIds) {
        const v = nodeVersions.get(`${hash}:${id}`);
        if (v) v.value;
      }
      const raw = nodeIds.map(id => data.get(hash)?.get(id) ?? null);
      const filtered = raw.map(packet => packet && (!filter || filter(packet)) ? packet : null);
      return compress ? (filtered.filter((p): p is KataAnalysisResponse => p !== null)) : filtered;
    });
  }

  public compute(
    hash: string,
    nodeIds: NodeId[],
    kernel: MetricKernel,
    filter?: (packet: KataAnalysisResponse) => boolean,
    compress: boolean = false
  ): ComputedRef<(number | null)[]> {
    const seqRef = this.getProjectedSequence(hash, nodeIds, filter, compress);
    return computed(() => seqRef.value.map((_, i) => kernel(seqRef.value, i)));
  }

  public purgeBoard(boardId: BoardId): void {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return;
    const nodeIds = Object.keys(board.nodes) as NodeId[];
    
    for (const [hash, hashMap] of data.entries()) {
      for (const nodeId of nodeIds) {
        if (hashMap.has(nodeId)) {
          hashMap.delete(nodeId);
          const v = nodeVersions.get(`${hash}:${nodeId}`);
          if (v) v.value++;
        }
      }
    }
  }
}

export const ledger = new AnalysisLedger();
