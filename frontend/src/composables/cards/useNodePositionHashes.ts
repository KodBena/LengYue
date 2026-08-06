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
 * notifies again. The throttle is per-board (see below) — a failure on
 * board A does not suppress board B's own first notice.
 *
 * ── Per-board scoping (review REJECT finding 1 repair) ────────────────────
 * `useNodePositionHashes()` is instantiated ONCE in `TreeWidget.vue`'s
 * `setup()`, and `TreeWidget` itself is long-lived across board-tab
 * switches (`App.vue` mounts it under `v-if="activeBoard"`, which stays
 * truthy across a switch). A single flat `pending`/`latestState` pair
 * therefore let a board switch inside the debounce window merge two
 * boards' NodeIds into one flush: `serializeActivePath` throws on a
 * NodeId absent from the OTHER board's `state.nodes`
 * (`.claude/dispatch-reports/card-position-highlight-stageB-review.md`,
 * finding 1 — witnessed via a fake-timer repro with two `BoardState`
 * objects). Because the throw happened before `hashPositionsBatch` was
 * even called, the whole flush failed — silently dropping highlights
 * for the CURRENTLY-VIEWED board too, not just the stale one.
 *
 * Fix: every piece of per-flush state (`pending`, `timer`,
 * `notifiedThisEpisode`) is now keyed by `BoardId` in `perBoard`, so
 * two boards requested within the same debounce window each get their
 * own independent timer and flush — a board switch can never merge
 * another board's NodeIds into the active board's batch call, and one
 * board's failure/notice does not touch another's.
 */

import { backendService } from '../../services/backend-service';
import { pushSystemMessage } from '../../services/system-message-sink';
import { serializeActivePath } from '../../engine/sgf-writer';
import { cacheNodeHash, hasCachedNodeHash } from '../../state/node-position-hashes';
import type { BoardId, BoardState, NodeId } from '../../types';
import { i18n } from '../../i18n';

const DEBOUNCE_MS = 150; // ledger assumption row 535

interface PerBoardFillState {
  pending: Set<NodeId>;
  timer: ReturnType<typeof setTimeout> | null;
  notifiedThisEpisode: boolean;
}

export interface NodePositionHashFillHandle {
  /**
   * Request hashes for `nodeIds` against `state` (the board they
   * belong to). Already-cached and already-pending ids are filtered
   * out before scheduling; a no-op call (everything already known)
   * schedules nothing. Safe to call on every `nodeList` recompute —
   * the debounce + dedup make repeated calls cheap. Scoped internally
   * by `state.id` — calls for different boards never interfere with
   * each other, even from the same composable instance within the
   * same debounce window (see the file header's "Per-board scoping").
   */
  requestHashFill: (nodeIds: readonly NodeId[], state: BoardState) => void;
}

export function useNodePositionHashes(): NodePositionHashFillHandle {
  // Resource-ownership note (umbrella CLAUDE.md checklist item 3,
  // "document" disposition): `perBoard` accumulates one small entry
  // (an empty-by-then `Set` + two primitives) per distinct BoardId ever
  // passed to `requestHashFill`, with no board-close eviction. Bounded
  // by "how many distinct boards this session ever opened," not by
  // node/tree size — the same order of magnitude as the number of tabs
  // a user opens in a session, not something that scales with content.
  // Deferred rather than fixed here: this composable is instantiated
  // once per TreeWidget mount (effectively app-lifetime, not
  // per-board), so wiring a `registerBoardCloseHandler` cleanup is a
  // real but separable improvement, out of scope for the review's
  // finding 1 (the correctness race), which this map exists to fix.
  const perBoard = new Map<BoardId, PerBoardFillState>();

  function stateFor(boardId: BoardId): PerBoardFillState {
    let s = perBoard.get(boardId);
    if (!s) {
      s = { pending: new Set<NodeId>(), timer: null, notifiedThisEpisode: false };
      perBoard.set(boardId, s);
    }
    return s;
  }

  function requestHashFill(nodeIds: readonly NodeId[], state: BoardState): void {
    const s = stateFor(state.id);
    let scheduledAny = false;
    for (const id of nodeIds) {
      if (hasCachedNodeHash(id) || s.pending.has(id)) continue;
      s.pending.add(id);
      scheduledAny = true;
    }
    if (!scheduledAny) return;

    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = setTimeout(() => { void flush(state); }, DEBOUNCE_MS);
  }

  async function flush(state: BoardState): Promise<void> {
    const s = stateFor(state.id);
    s.timer = null;
    const ids = [...s.pending];
    s.pending.clear();
    if (ids.length === 0) return;

    try {
      // Serialization can itself throw (getPath's fail-loud posture on a
      // NodeId no longer present in `state.nodes`) — inside the try so a
      // stale-NodeId race is treated as the same failure-honesty case as
      // a network error, not an unhandled rejection. Per-board scoping
      // (above) means `state` here is always the SAME board every id in
      // `ids` was requested against, so this should not throw in
      // practice — the try/catch is defense-in-depth, not a known gap.
      const rawContents = ids.map(id => serializeActivePath(state, id));
      const hashes = await backendService.hashPositionsBatch(rawContents);
      ids.forEach((id, i) => cacheNodeHash(id, hashes[i]));
      s.notifiedThisEpisode = false; // recovered — a future failure notifies again
    } catch {
      // ADR-0002 failure-honesty: nothing is cached (ABSENT highlight,
      // never a partial/stale one). One notice per failure episode,
      // per board.
      if (!s.notifiedThisEpisode) {
        s.notifiedThisEpisode = true;
        pushSystemMessage('warning', i18n.global.t('cards.knownPositionHashFillFailed'));
      }
    }
  }

  return { requestHashFill };
}
