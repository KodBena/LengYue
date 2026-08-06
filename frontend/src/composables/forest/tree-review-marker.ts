/**
 * src/composables/forest/tree-review-marker.ts
 *
 * Pure derivation for the game-tree's "review start" marker (wanted-
 * feature 4 / ledger row 524's re-adjudicated build). Extracted out of
 * `TreeWidget.vue` for the same reason `nodeFill`/`nodeStroke` sit in
 * that file as plain functions rather than inline template
 * expressions — a one-line boolean is trivial, but the maintainer
 * adjudication asked for a logic-level test of the marker derivation,
 * and `<script setup>` cannot export a named binding a test file can
 * import (see `frontend/CLAUDE.md`'s "module-intent state in
 * `<script setup>`" footgun note — the SFC block compiles into
 * `setup()`, so nothing declared there is reachable from outside a
 * mounted instance). A tiny standalone module is the SFC-free
 * escape hatch: the function itself is one equality check, but the
 * behaviour under test — "no marker when there's no active review
 * session, exactly one marker at the session's starting node,
 * disappears when the session ends" — is worth pinning independently
 * of TreeWidget's render.
 *
 * The precedent this mirrors: `TreeWidget.vue`'s `isGameHead` field
 * (`props.gameHeadIds?.has(id)`, `TreeWidget.vue:307`) — a per-node
 * boolean derived synchronously from already-loaded reactive state,
 * no network I/O, no per-node cache. `isReviewStartNode` is the same
 * shape one level simpler: a single nullable `NodeId` instead of a
 * `Set`, because a board has at most one active review session and
 * therefore at most one start marker (`ReviewSessionData.startingNodeId`
 * is `NodeId | null`, not a collection — see
 * `frontend/src/types/cards.ts:284` and
 * `useReviewSession.ts`'s `loadCard`/`endSession`).
 *
 * License: Public Domain (The Unlicense)
 */

import type { NodeId } from '../../types';

/**
 * True iff `nodeId` is the active review session's starting node —
 * the position `useReviewSession.loadCard` fast-forwarded to when the
 * current card's SGF was loaded (`useReviewSession.ts:534-541`,
 * `targetLeafId`), and which `rewindToStart` navigates back to
 * (`useReviewSession.ts:1087-1095`). `startNodeId` is `null`/
 * `undefined` whenever no review session is active on the board
 * (`ReviewSessionData.startingNodeId` starts `null` and
 * `endSession` resets it to `null` — `useReviewSession.ts:1080`), so
 * the marker set is naturally empty outside a review session and
 * naturally reappears/disappears as a session starts/ends or advances
 * to a new card — no separate invalidation wiring needed, the same
 * property `TreeWidget`'s `isGameHead` leans on for `board.games`.
 */
export function isReviewStartNode(
  nodeId: NodeId,
  startNodeId: NodeId | null | undefined,
): boolean {
  return startNodeId != null && startNodeId === nodeId;
}
