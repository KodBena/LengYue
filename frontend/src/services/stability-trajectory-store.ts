/**
 * src/services/stability-trajectory-store.ts
 *
 * Per-(rawKey, extractorId, nodeId) stability-trajectory store with per-key
 * reactive version refs as the change-notification surface — same shape as
 * `analysis-ledger.ts` so consumers use the same observe-via-getter pattern.
 *
 * Keyed by `RawKey` (model + engine overrides), NOT the full enriched
 * descriptor: every extractor in `STABILITY_EXTRACTORS` reads only RAW packet
 * fields (`rootInfo` / `moveInfos`), which are palette-independent — so a
 * palette-only swap must not strand a node's trajectory. This mirrors the
 * ledger's raw store (the 2026-06-08 provenance-stratification arc); keying by
 * the enriched/composite hash here was the same latent bug.
 *
 * Ingestion flow: `record(rawKey, nodeId, packet)` is called from
 * `analysis-service.ts::onAnalysisUpdate` for every arriving packet (preview
 * or final). For each extractor in `STABILITY_EXTRACTORS`, the packet is
 * dispatched through it and the resulting Q (or null) is appended to that
 * extractor's trajectory for (rawKey, nodeId). The trajectory's change-point
 * compression keeps storage compact across many packets — only V values where
 * Q changes are kept.
 *
 * Per-key reactivity: each (rawKey, extractorId, nodeId) carries its own
 * `Ref<number>` that gets bumped whenever the trajectory grows. Composables
 * observe by calling `getTrajectory(...)` inside a `computed`; Vue tracks the
 * ref read transparently. Version bumps are coalesced via rAF, mirroring the
 * ledger's flood-protection pattern — many packets in one frame collapse to
 * one redraw per consumer.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import type { KataAnalysisResponse } from '../engine/katago/types';
import type { NodeId, BoardId, RawKey } from '../types';
import {
  STABILITY_EXTRACTORS,
  type StabilityExtractor,
} from '../engine/analysis/stability-extractors';
import {
  appendObservation,
  emptyTrajectory,
  type StabilityTrajectory,
  type StabilityValue,
} from '../lib/stability-trajectory';
import { store } from '../store';

// ── Internal storage ──────────────────────────────────────────────────────────

type Key = string; // `${rawKey}|${extractorId}|${nodeId}`

const trajectories = new Map<Key, StabilityTrajectory<StabilityValue>>();
const trajectoryVersions = new Map<Key, Ref<number>>();

function keyOf(rawKey: RawKey, extractorId: string, nodeId: NodeId): Key {
  return `${rawKey}|${extractorId}|${nodeId}`;
}

function getOrCreateVersion(key: Key): Ref<number> {
  let v = trajectoryVersions.get(key);
  if (!v) {
    v = ref(0);
    trajectoryVersions.set(key, v);
  }
  return v;
}

function getOrCreateTrajectory(key: Key): StabilityTrajectory<StabilityValue> {
  let t = trajectories.get(key);
  if (!t) {
    t = emptyTrajectory<StabilityValue>();
    trajectories.set(key, t);
  }
  return t;
}

// ── Coalesced version-bump scheduler ──────────────────────────────────────────
// Mirrors `analysis-ledger.ts`'s rAF coalescing: many packets within a frame
// collapse to one redraw per consumer. Synchronous data update + deferred
// reactive notification.

const pendingBumps = new Set<Key>();
let flushScheduled = false;

function scheduleBumpFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const key of pendingBumps) {
      const v = trajectoryVersions.get(key);
      if (v) v.value++;
    }
    pendingBumps.clear();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export class StabilityTrajectoryStore {
  /**
   * Append the packet's V + extracted Q (one per registered extractor)
   * to the corresponding per-key trajectory. Called for every arriving
   * packet at a known nodeId regardless of `isDuringSearch` — finals
   * carry the highest-V observation and matter as much as previews
   * for the V-axis trajectory.
   *
   * V is read from `packet.rootInfo.visits` — the design note's
   * canonical V scale. Packets without a finite visits count are
   * skipped (can't place them on the V-axis).
   *
   * Keyed by `rawKey`: the extracted Q comes from raw packet fields only
   * (palette-independent), so a palette swap must keep the trajectory
   * reachable — see the file header.
   */
  public record(rawKey: RawKey, nodeId: NodeId, packet: KataAnalysisResponse): void {
    const V = packet.rootInfo?.visits;
    if (V === undefined || V === null || !Number.isFinite(V) || V <= 0) return;

    for (const [extractorId, extract] of STABILITY_EXTRACTORS.entries()) {
      const value = (extract as StabilityExtractor)(packet);
      const key = keyOf(rawKey, extractorId, nodeId);
      const t = getOrCreateTrajectory(key);
      const hadObservations = t.n_packets > 0;
      appendObservation(t, V, value);
      // Touch the version ref to register that this key exists, then
      // bump (synchronously on the first observation for visual feedback
      // on the no-data → has-data transition, otherwise coalesced).
      const version = getOrCreateVersion(key);
      if (!hadObservations) {
        version.value++;
      } else {
        pendingBumps.add(key);
        scheduleBumpFlush();
      }
    }
  }

  /**
   * Reactive read: returns the trajectory for the given key, or null
   * if no observations have been recorded. Touches the per-key
   * version ref so Vue tracks the read as a dependency.
   */
  public getTrajectory(
    rawKey: RawKey,
    extractorId: string,
    nodeId: NodeId,
  ): StabilityTrajectory<StabilityValue> | null {
    const key = keyOf(rawKey, extractorId, nodeId);
    getOrCreateVersion(key).value; // tracking
    return trajectories.get(key) ?? null;
  }

  /**
   * Drop every cached trajectory and per-key version ref. Called from
   * `resetWorkspace` on identity flip — mirrors the analysis-ledger's
   * `purgeAll` contract. Bumps every existing version ref before
   * clearing so subscribed consumers' computeds re-run and observe
   * the cleared state.
   */
  public purgeAll(): void {
    for (const v of trajectoryVersions.values()) {
      v.value++;
    }
    trajectories.clear();
    trajectoryVersions.clear();
  }

  /**
   * Drop every trajectory whose nodeId belongs to the given board.
   * Mirrors `analysis-ledger::purgeBoard`'s bump-then-delete contract:
   * subscribed consumers see the cleared data before the version ref
   * is dropped, then re-attach to fresh refs on the next read via
   * `getOrCreateVersion`.
   */
  public purgeBoard(boardId: BoardId): void {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return;
    const nodeIds = new Set<NodeId>(Object.keys(board.nodes) as NodeId[]);

    for (const key of Array.from(trajectories.keys())) {
      // Key shape: `${hash}|${extractorId}|${nodeId}` — the last
      // segment is the nodeId. NodeIds are UUIDs (no '|' in them),
      // so the last split-segment is unambiguous.
      const nodeId = key.substring(key.lastIndexOf('|') + 1) as NodeId;
      if (nodeIds.has(nodeId)) {
        trajectories.delete(key);
        const v = trajectoryVersions.get(key);
        if (v) {
          v.value++;
          trajectoryVersions.delete(key);
        }
      }
    }
  }
}

export const stabilityTrajectoryStore = new StabilityTrajectoryStore();
