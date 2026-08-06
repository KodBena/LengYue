/**
 * src/composables/cards/useNodePositionHashes.ts
 *
 * Fill orchestration over the node-position-hashes state module
 * (`src/state/node-position-hashes.ts`). Card-position-annotations
 * Stage B (see `.claude/dispatch-reports/card-position-annotations-design.md`,
 * §5 "Cost at 250+ nodes"). Mirrors `useKnownPositions.ts` /
 * `useThumbnailCache.ts`'s split from their sibling state modules:
 * the state module owns the reactive `NodeId -> ContentHash` payload
 * and its teardown; this composable owns the one effectful operation
 * that fills it.
 *
 * ── Viewport-driven, not eager whole-tree ─────────────────────────────────
 * The design's §5 explicitly rejects eagerly hashing every node in a
 * 250+-node tree (250+ concurrent requests, mostly for offscreen
 * nodes). `requestHashFill` is called from `TreeWidget`'s own `watch`
 * on its already-viewport-bounded `nodeList` (nodes actually laid out
 * — collapsed variations never appear there), so the node-id set this
 * composable ever sees is already bounded to what's rendered or about
 * to be, the same `ensureVisible`-gated set other expensive per-node
 * work in TreeWidget already uses.
 *
 * ── Debounced batching ─────────────────────────────────────────────────────
 * Fast tree expansion/scroll can call `requestHashFill` several times
 * in quick succession as `nodeList` churns. Requests coalesce into one
 * `hashPositionsBatch` round trip per 150ms window (ledger assumption
 * row 535 — the design names no numeric interval), deduplicated
 * against both the cache (already-hashed nodes) and the in-flight
 * pending set (already-requested-this-window nodes).
 *
 * ── Failure honesty (ADR-0002) ────────────────────────────────────────────
 * A failed batch call leaves every requested node's cache entry
 * ABSENT — never a stale or partial write — and surfaces one
 * non-blocking `pushSystemMessage` notice. The notice is deliberately
 * throttled to at most once per failure *episode*: repeated debounce
 * ticks against a still-down backend do not re-notify (a 150ms retry
 * storm would otherwise spam the message log); a later SUCCESSFUL
 * flush resets the throttle, so a fresh failure after a recovery
 * notifies again.
 *
 * License: Public Domain (The Unlicense)
 */

import { backendService } from '../../services/backend-service';
import { pushSystemMessage } from '../../services/system-message-sink';
import { serializeActivePath } from '../../engine/sgf-writer';
import { cacheNodeHash, hasCachedNodeHash } from '../../state/node-position-hashes';
import type { BoardState, NodeId } from '../../types';
import { i18n } from '../../i18n';

const DEBOUNCE_MS = 150; // ledger assumption row 535

export interface NodePositionHashFillHandle {
  /**
   * Request hashes for `nodeIds` against `state` (the board they
   * belong to). Already-cached and already-pending ids are filtered
   * out before scheduling; a no-op call (everything already known)
   * schedules nothing. Safe to call on every `nodeList` recompute —
   * the debounce + dedup make repeated calls cheap.
   */
  requestHashFill: (nodeIds: readonly NodeId[], state: BoardState) => void;
}

export function useNodePositionHashes(): NodePositionHashFillHandle {
  const pending = new Set<NodeId>();
  let latestState: BoardState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let notifiedThisEpisode = false;

  function requestHashFill(nodeIds: readonly NodeId[], state: BoardState): void {
    let scheduledAny = false;
    for (const id of nodeIds) {
      if (hasCachedNodeHash(id) || pending.has(id)) continue;
      pending.add(id);
      scheduledAny = true;
    }
    if (!scheduledAny) return;

    latestState = state; // same board for the whole debounce window (see below)
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
  }

  async function flush(): Promise<void> {
    timer = null;
    const ids = [...pending];
    pending.clear();
    const state = latestState;
    if (ids.length === 0 || !state) return;

    try {
      // Serialization can itself throw (getPath's fail-loud posture on a
      // NodeId no longer present in `state.nodes`) — inside the try so a
      // stale-NodeId race is treated as the same failure-honesty case as
      // a network error, not an unhandled rejection.
      const rawContents = ids.map(id => serializeActivePath(state, id));
      const hashes = await backendService.hashPositionsBatch(rawContents);
      ids.forEach((id, i) => cacheNodeHash(id, hashes[i]));
      notifiedThisEpisode = false; // recovered — a future failure notifies again
    } catch {
      // ADR-0002 failure-honesty: nothing is cached (ABSENT highlight,
      // never a partial/stale one). One notice per failure episode.
      if (!notifiedThisEpisode) {
        notifiedThisEpisode = true;
        pushSystemMessage('warning', i18n.global.t('cards.knownPositionHashFillFailed'));
      }
    }
  }

  return { requestHashFill };
}
