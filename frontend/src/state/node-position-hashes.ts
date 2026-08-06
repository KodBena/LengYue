/**
 * src/state/node-position-hashes.ts
 *
 * Per-node `NodeId -> ContentHash` cache: "what content_hash would this
 * tree node's root->node position hash to." Card-position-annotations
 * Stage B (see `.claude/dispatch-reports/card-position-annotations-design.md`,
 * §4 "Annotation render" — the design's own recommendation to reuse
 * `thumbnail-render-resources.ts`'s `BoardSnapshot` cache *shape*: keyed
 * on NodeId alone, invalidated by the same board-close / identity-flip
 * hooks).
 *
 * ── Why a NodeId's hash is cacheable forever (until invalidated) ─────────
 * A node's root->node path is immutable under a stable NodeId — the same
 * invariant `thumbnail-render-resources.ts`'s snapshot cache leans on (see
 * that file's header). `serializeActivePath(state, nodeId)` is therefore a
 * pure function of `nodeId` for the node's lifetime, so the content hash
 * derived from it is too: compute once per NodeId, cache forever (module
 * lifetime), same caller-less `applySetup`-mutation caveat the thumbnail
 * cache's `invalidateNodeSnapshots` header documents (this module has no
 * analogous hook yet — nothing in this codebase mutates an existing node's
 * content today; if that changes, invalidate here too, alongside the
 * thumbnail cache).
 *
 * ── Reactivity ─────────────────────────────────────────────────────────
 * `ref(Map)`, not a plain `Map` — a consumer reading `getCachedNodeHash`
 * inside a `computed` must re-evaluate when a later fill populates the key
 * it read (same reactivity note as `thumbnail-render-resources.ts`'s
 * `snapshotCache` and `known-positions.ts`'s `knownPositions`).
 *
 * ── Invalidation ───────────────────────────────────────────────────────
 * `purgeBoardNodeHashes(boardId)` — board lifecycle (closeBoard, mirrors
 * `purgeBoardThumbnails` / audit pair O4: walks the closing board's
 * `nodes` keys while the board is still present in `store.boards`).
 * `purgeAllNodeHashes()` — identity flip (mirrors `purgeAllThumbnails` /
 * audit pair O9: NodeIds are UUID-style, no cross-user collision, so this
 * is memory hygiene, not a privacy concern the way `known-positions.ts`'s
 * purge is).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import type { BoardId, ContentHash, NodeId } from '../types';
import { store } from '../store';
import {
  registerBoardCloseHandler,
  registerWorkspaceResetHandler,
} from '../store/teardown-registry';
// Self-import, same rationale as `known-positions.ts`: a same-module
// function-declaration export is a live binding resolved at the
// declaration site, so a consumer's `vi.spyOn(nodePositionHashesModule,
// 'purgeAllNodeHashes')` does NOT intercept a same-module call written as
// a bare `purgeAllNodeHashes()` — the external spy patches a different
// object than the closure's direct reference. Routing the teardown
// handlers' `run` callbacks through this self-imported namespace makes
// the call resolve dynamically through the (possibly spied) export.
import * as self from './node-position-hashes';

// Reactive `ref(Map)` — see file header's reactivity note.
const nodeHashes: Ref<Map<NodeId, ContentHash>> = ref(new Map<NodeId, ContentHash>());

/** Synchronous cache read; `undefined` on a miss (not yet hashed, or hashing failed). */
export function getCachedNodeHash(nodeId: NodeId): ContentHash | undefined {
  return nodeHashes.value.get(nodeId);
}

/** Cache a node's content hash (the single write path). */
export function cacheNodeHash(nodeId: NodeId, hash: ContentHash): void {
  nodeHashes.value.set(nodeId, hash);
}

/** True iff `nodeId` has a cached hash already (used to skip re-requesting it). */
export function hasCachedNodeHash(nodeId: NodeId): boolean {
  return nodeHashes.value.has(nodeId);
}

/**
 * Drop every cached hash for the given board's nodes. Called from
 * `closeBoard` when the board exits the workspace (mirrors
 * `purgeBoardThumbnails`; audit pair O4). Walks `board.nodes` — must run
 * while the board is still present in `store.boards`, i.e. before
 * closeBoard's splice, which the registry's before-splice run position
 * preserves.
 */
export function purgeBoardNodeHashes(boardId: BoardId): void {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) return;
  // Object.keys widens Record<NodeId,…> keys to string[] (the TS "Category C"
  // boundary, IDENTIFIERS.md NodeId row); re-brand the keys.
  for (const nodeId of Object.keys(board.nodes) as NodeId[]) {
    nodeHashes.value.delete(nodeId);
  }
}

/**
 * Drop every cached hash. Called from `resetWorkspace` on identity flip
 * so the cache doesn't accumulate dead entries across the session
 * boundary (mirrors `purgeAllThumbnails`; audit pair O9 — memory
 * hygiene, not privacy: NodeIds don't collide across users, and a
 * content hash alone identifies a *position*, not who owns a card at
 * it — the known-positions map, not this one, carries the
 * user-identifying CardId).
 */
export function purgeAllNodeHashes(): void {
  nodeHashes.value.clear();
}

/** Test-only: the number of distinct node hashes currently cached. */
export function nodeHashCount(): number {
  return nodeHashes.value.size;
}

registerBoardCloseHandler({
  label: 'node-position-hashes:purge-board',
  run: (boardId) => self.purgeBoardNodeHashes(boardId),
});
registerWorkspaceResetHandler({
  label: 'node-position-hashes',
  run: () => self.purgeAllNodeHashes(),
});
