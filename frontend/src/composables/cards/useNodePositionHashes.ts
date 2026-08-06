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
 *
 * ── perBoard eviction (re-review REJECT, eviction gap) ────────────────────
 * `perBoard` is module-scope, not per-`useNodePositionHashes()`-call —
 * matching the "instantiated once, effectively app-lifetime" reality
 * described above, and required for the board-close handler below to
 * be registered exactly once (a handler registered inside the
 * composable body would re-register on every call, which the
 * board-completeness census — `teardown-registry-completeness.test.ts`
 * — would catch as a duplicate label, and which would multiply
 * pointlessly under repeated test-file instantiation).
 *
 * Without eviction, a board closed mid-debounce leaves its `setTimeout`
 * orphaned: `closeBoard` purges `node-position-hashes.ts`'s cache
 * synchronously (via `purgeBoardNodeHashes`, registered separately in
 * that module), but does nothing about THIS module's pending timer —
 * `closeBoard` does not clear `board.nodes`, only splices the board out
 * of `store.boards`, so the detached `BoardState` the orphaned timer's
 * closure holds is still intact when the timer fires later.
 * `serializeActivePath` and `hashPositionsBatch` both succeed against
 * it, and `cacheNodeHash` writes the result back into the shared cache
 * for a NodeId belonging to an already-closed, already-purged board —
 * resurrecting a stale entry after teardown
 * (`.claude/dispatch-reports/card-position-highlight-stageB-rereview.md`
 * §3). The board-close handler below cancels the pending timer AND
 * drops the `perBoard` entry; `flush`'s own post-await guard (see its
 * body) additionally discards an in-flight fetch's result if the board
 * closed while the fetch was outstanding — a `clearTimeout` alone
 * cannot reach a fetch already past the `await`.
 *
 * ── Chunked flush (ledger row 637) ────────────────────────────────────────
 * A single board's pending set can exceed the backend's per-request cap
 * (`config.POSITIONS_HASH_BATCH_MAX`, `backend/core/config.py:211` — 200
 * as of this writing): selecting a card loads a full game tree, and
 * `TreeWidget`'s viewport-bounded `nodeList` (see "Viewport-driven, not
 * eager whole-tree" above) can still exceed 200 nodes for a tall or wide
 * expanded region. Before this fix, `flush` sent every pending id in ONE
 * `hashPositionsBatch` call; over the cap, the backend 413s
 * (`backend/api/routes/positions.py:121`) and the WHOLE fill failed —
 * including the ids that were comfortably under the cap.
 *
 * `HASH_BATCH_MAX_ITEMS` mirrors `config.POSITIONS_HASH_BATCH_MAX`
 * (backend/core/config.py:211) — the two constants are NOT wired
 * together (no shared source across the frontend/backend boundary), so
 * a drift between them silently reopens the 413: raising the backend
 * cap without raising this one only wastes round trips (chunks stay
 * smaller than necessary, still correct); LOWERING the backend cap
 * without lowering this one reintroduces the exact bug this fix repairs
 * (a chunk sized to the old, larger cap 413s again). Keep them in sync
 * by hand when either changes.
 *
 * `flush` partitions `ids` into chunks of at most `HASH_BATCH_MAX_ITEMS`
 * and awaits each chunk's `hashPositionsBatch` call SEQUENTIALLY, not in
 * parallel — the 150ms debounce above already coalesces same-window
 * requests into one flush; firing every chunk of that flush concurrently
 * would still hammer the backend with N/200 simultaneous requests for a
 * single huge fill. Each chunk's results are cached as soon as that
 * chunk lands, so a failure partway through (see "Chunked partial-
 * failure semantics" below) never discards a chunk that already
 * succeeded.
 *
 * ── Chunked partial-failure semantics (ADR-0002) ───────────────────────────
 * A chunk that succeeds before a later chunk fails keeps its cached
 * results — they are correct, and discarding them on a later chunk's
 * failure would be dishonest in the other direction (silently throwing
 * away known-good data). The failure notice still fires at most once per
 * episode (the existing per-board throttle, unchanged): the first
 * failing chunk in a flush trips it, and the loop then stops issuing
 * further chunks for that flush — a flush that hit a down backend does
 * not try three more chunks against the same down backend. The
 * remaining un-cached ids (the failed chunk's own ids, plus every chunk
 * after it that was never sent) go back into `s.pending`, so the NEXT
 * `requestHashFill` naturally re-requests exactly the gap: already-
 * cached ids are filtered by `hasCachedNodeHash`, so a retry never
 * re-covers ground the earlier chunks already won.
 */

import { backendService } from '../../services/backend-service';
import { pushSystemMessage } from '../../services/system-message-sink';
import { serializeActivePath } from '../../engine/sgf-writer';
import { cacheNodeHash, hasCachedNodeHash } from '../../state/node-position-hashes';
import { registerBoardCloseHandler } from '../../store/teardown-registry';
import type { BoardId, BoardState, NodeId } from '../../types';
import { i18n } from '../../i18n';

const DEBOUNCE_MS = 150; // ledger assumption row 535

// Mirrors backend `config.POSITIONS_HASH_BATCH_MAX`
// (backend/core/config.py:211). See the file header's "Chunked flush"
// note for what drifting the two apart breaks (a 413 -> degraded
// highlight fill, never data corruption).
const HASH_BATCH_MAX_ITEMS = 200;

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

// Module-scope — see the file header's "perBoard eviction" note: shared
// across every `useNodePositionHashes()` call so the board-close handler
// below can be registered exactly once, at module init.
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

// Splits `ids` into consecutive chunks of at most `HASH_BATCH_MAX_ITEMS`
// each — pure partitioning, no I/O. `ids.length === 0` yields `[]`, not
// `[[]]` (callers never see a spurious empty chunk).
function partitionIntoChunks(ids: readonly NodeId[]): NodeId[][] {
  const chunks: NodeId[][] = [];
  for (let i = 0; i < ids.length; i += HASH_BATCH_MAX_ITEMS) {
    chunks.push(ids.slice(i, i + HASH_BATCH_MAX_ITEMS));
  }
  return chunks;
}

async function flush(state: BoardState): Promise<void> {
  const s = stateFor(state.id);
  s.timer = null;
  const ids = [...s.pending];
  s.pending.clear();
  if (ids.length === 0) return;

  // Chunked flush (ledger row 637 — see file header): the backend caps
  // a single hash-batch request at HASH_BATCH_MAX_ITEMS. Chunks are
  // awaited SEQUENTIALLY (never Promise.all — the debounce above already
  // coalesces a burst into one flush; firing every chunk concurrently
  // would still hammer the backend for one huge fill). A chunk's results
  // are cached immediately on landing, so a later chunk's failure never
  // touches an earlier chunk's already-cached, correct results.
  const chunks = partitionIntoChunks(ids);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    // Per-chunk board-close guard: a board close can land between any
    // two chunks (or during one's in-flight fetch), not just once per
    // flush. Checking before EVERY chunk — not just once up front —
    // stops issuing further requests for a closed board and discards
    // whatever chunk was about to run, matching the single-request
    // guard's discipline (re-review, eviction gap) at chunk granularity.
    if (!perBoard.has(state.id)) return;

    const chunk = chunks[chunkIndex];
    try {
      // Serialization can itself throw (getPath's fail-loud posture on a
      // NodeId no longer present in `state.nodes`) — inside the try so a
      // stale-NodeId race is treated as the same failure-honesty case as
      // a network error, not an unhandled rejection. Per-board scoping
      // (above) means `state` here is always the SAME board every id in
      // `ids` was requested against, so this should not throw in
      // practice — the try/catch is defense-in-depth, not a known gap.
      const rawContents = chunk.map(id => serializeActivePath(state, id));
      const hashes = await backendService.hashPositionsBatch(rawContents);

      // Board-close guard (re-review, eviction gap): `closeBoard` may
      // have run WHILE this fetch was in flight — a `clearTimeout` can't
      // reach a fetch already past its `await`. The board-close handler
      // below deletes `state.id`'s `perBoard` entry synchronously on
      // close, so its absence here means the board closed under us;
      // discard this chunk's result (and stop, via the loop-top check
      // above) rather than writing a resurrected entry into the
      // (already purged) `node-position-hashes.ts` cache for a closed
      // board.
      if (!perBoard.has(state.id)) return;

      chunk.forEach((id, i) => cacheNodeHash(id, hashes[i]));
      s.notifiedThisEpisode = false; // recovered — a future failure notifies again
    } catch {
      // Same board-close guard as the success path: don't surface a
      // failure notice for a board the user already closed.
      if (!perBoard.has(state.id)) return;

      // Partial-failure semantics (ADR-0002, ledger row 637): every
      // chunk before this one already landed and stays cached. THIS
      // chunk's ids, and every chunk after it that was never sent, are
      // deliberately NOT re-added to `s.pending` here — `s.pending` was
      // already drained (and its timer cleared) at the top of `flush`,
      // and re-adding them without also re-arming a timer would leave
      // them stuck (`requestHashFill`'s own dedup treats "already in
      // pending" as "already scheduled" and skips re-arming). Instead,
      // the un-cached ids simply stay un-cached: the NEXT
      // `requestHashFill` call for these ids — `TreeWidget`'s `watch`
      // fires on every `nodeList` recompute, so this happens naturally —
      // sees `hasCachedNodeHash` return false for them, re-adds them to
      // a fresh `pending`, and arms a fresh timer. That retry request
      // only re-covers the gap: ids the earlier chunks already cached
      // are filtered out by that same `hasCachedNodeHash` check.
      // ADR-0002 failure-honesty: nothing from this chunk (or any
      // un-sent chunk after it) is cached — ABSENT highlight, never a
      // partial/stale one. One notice per failure episode, per board;
      // the loop then stops issuing further chunks for this flush.
      if (!s.notifiedThisEpisode) {
        s.notifiedThisEpisode = true;
        pushSystemMessage('warning', i18n.global.t('cards.knownPositionHashFillFailed'));
      }
      return;
    }
  }
}

export function useNodePositionHashes(): NodePositionHashFillHandle {
  return { requestHashFill };
}

// Board-close teardown (re-review REJECT, eviction gap — see file header):
// cancel the closing board's pending debounce timer (a no-op `clearTimeout`
// if none is scheduled) and drop its `perBoard` entry, so neither an
// orphaned timer nor an in-flight fetch's resolution (guarded above, in
// `flush`) can write into `node-position-hashes.ts`'s cache for a board
// that no longer exists. DEFAULT band (order-independent of the ENGINE_STOP
// / LEDGER_PURGE bands — this only touches this module's own fill-state
// map, never the ledger or the analysis subscription), same as the sibling
// `node-position-hashes:purge-board` handler this map feeds.
registerBoardCloseHandler({
  label: 'node-position-hash-fill:cancel-pending',
  run: (boardId) => {
    const s = perBoard.get(boardId);
    if (s?.timer !== null && s?.timer !== undefined) clearTimeout(s.timer);
    perBoard.delete(boardId);
  },
});
