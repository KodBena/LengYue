/**
 * src/engine/navigator.ts
 * LCA-based tree traversal with setup and capture tracking.
 * Strictly typed with NodeId and BoardId.
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode, NodeId, RootToCurrentPath, RootedPath } from '../types';
import { getActiveVariationPath } from './util';

/**
 * Walks `targetId` back to root via `parent` and returns the lineage
 * root → target as `RootToCurrentPath` — a mint site for that brand
 * (the other is `rootToCurrentPrefix` below). The position is an
 * explicit parameter by design: "current" in the brand name is the
 * canonical role (the cursor is the usual target), not a hidden read
 * of cursor state. For the active line as a whole (root → leaf), use
 * `getActiveVariationPath` (`engine/util.ts`) — confusing the two
 * shapes is the bug class the brands exist to close (rationale at the
 * declarations in `src/types/game.ts`).
 */
export function getPath(nodes: Record<NodeId, GameNode>, targetId: NodeId): RootToCurrentPath {
  const path: NodeId[] = [];
  let curr: NodeId | null = targetId;
  while (curr) {
    path.unshift(curr);
    curr = nodes[curr].parent;
  }
  // Brand mint, justified: the walk collected `targetId`'s lineage back
  // to root, so `path` is root→target by construction.
  return path as RootToCurrentPath;
}

/**
 * Named re-brand for the prefix of a root-anchored line: the slice of
 * `path` up to and including `indexInclusive` is by construction a
 * root → position path for the node at that index. Array operations
 * (`slice` here) erase the path brands, so this conversion is the
 * sanctioned way to derive a `RootToCurrentPath` from a wider line —
 * an inline `as` at the call site would be the silent widening the
 * brands exist to forbid. The caller owns the claim that
 * `path[indexInclusive]` is the position it means to act at.
 */
export function rootToCurrentPrefix(path: RootedPath, indexInclusive: number): RootToCurrentPath {
  // Brand mint, justified: a prefix of a root-anchored path ending at a
  // named index is root→that-position by construction.
  return path.slice(0, indexInclusive + 1) as RootToCurrentPath;
}

export function navigateTo(state: BoardState, targetNodeId: NodeId): void {
  if (state.currentNodeId === targetNodeId) return;

  const currentPath = getPath(state.nodes, state.currentNodeId);
  const targetPath = getPath(state.nodes, targetNodeId);

  let lcaIndex = 0;
  while (
    lcaIndex < currentPath.length &&
    lcaIndex < targetPath.length &&
    currentPath[lcaIndex] === targetPath[lcaIndex]
  ) {
    lcaIndex++;
  }

  // 1. Undo (Backwards from Current to LCA)
  for (let i = currentPath.length - 1; i >= lcaIndex; i--) {
    const node = state.nodes[currentPath[i]];
    if (!node.delta) continue;

    if (node.move && node.move.type === 'place') {
      delete state.stones[`${node.move.x},${node.move.y}`];
      const enemyColor = node.move.color === 'B' ? 'W' : 'B';
      for (const capKey of node.delta.captures) {
        state.stones[capKey] = enemyColor;
        state.captures[node.move.color] -= 1;
      }
    }

    for (const [posKey, prevColor] of Object.entries(node.delta.setupOverwritten ?? {})) {
      if (prevColor === null) delete state.stones[posKey];
      else state.stones[posKey] = prevColor;
    }

    state.koPoint = node.delta.prevKoPoint;
    state.turn = node.move ? node.move.color : state.turn;
  }

  // 2. Replay (Forwards from LCA to Target)
  const size = parseInt(state.nodes[state.rootNodeId].properties['SZ']?.[0] ?? '19', 10);
  for (let i = lcaIndex; i < targetPath.length; i++) {
    const node = state.nodes[targetPath[i]];

    if (node.parent) {
      const parent = state.nodes[node.parent];
      const childIdx = parent.children.indexOf(node.id);
      if (childIdx !== -1) parent.activeChildIndex = childIdx;
    }

    if (!node.delta) continue;

    // Apply Setup (Forward)
    for (const posKey of Object.keys(node.delta.setupOverwritten ?? {})) {
      const [x, y] = posKey.split(',').map(Number);
      const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
      
      if (node.properties.AB?.includes(sgfCoord)) state.stones[posKey] = 'B';
      else if (node.properties.AW?.includes(sgfCoord)) state.stones[posKey] = 'W';
      else if (node.properties.AE?.includes(sgfCoord)) delete state.stones[posKey];
    }

    // Apply Move (Forward)
    if (node.move) {
      const { x, y, color, type } = node.move;
      if (type === 'place') {
        state.stones[`${x},${y}`] = color;
        for (const capKey of node.delta.captures) {
          delete state.stones[capKey];
          state.captures[color] += 1;
        }
      }
      state.turn = color === 'B' ? 'W' : 'B';
    }
    
    state.koPoint = node.delta.newKoPoint;
  }

  state.currentNodeId = targetNodeId;

  // Branch-head write-through (2026-08-06 branch-switch-semantics veto):
  // every ancestor of the new cursor position (root..target inclusive —
  // `targetPath` was already computed above for the replay loop, no
  // extra walk) remembers `targetNodeId` as the last node visited
  // within ITS OWN subtree. This is a fact of moving the cursor, not a
  // switch-time special case — writing it here, once, at the navigator's
  // single choke point, is what lets `navigateVariation` /
  // `navigateToggleMainLine` restore the exact node a branch was left
  // at instead of always landing back on the branch's immediate child.
  // See `GameNode.lastVisitedDescendant`'s doc comment (`types/game.ts`)
  // for the field's contract and `resolveBranchTarget` below for the
  // read-side validity check.
  for (const ancestorId of targetPath) {
    state.nodes[ancestorId].lastVisitedDescendant = targetNodeId;
  }
}

/**
 * Walk from `nodeId` upward via `parent` — checking `nodeId` itself
 * first, then each ancestor in turn — to the nearest node (self or
 * ancestor) with more than one child: the fork `navigateVariation` and
 * `navigateToggleMainLine` both act on. Returns `null` when no node
 * from `nodeId` up to the root has more than one child (no fork exists
 * to switch at anywhere on the path).
 *
 * This generalizes both primitives to fire from anywhere in the
 * current line, not only from a fork's immediate child (the maintainer
 * veto's "switch from anywhere" requirement) — the nearest ancestor
 * fork is the natural reading, and it was already the established
 * convention here: `navigateToggleMainLine`'s prior self-then-ancestor
 * walk is promoted unchanged into this shared helper rather than
 * inventing a second convention for `navigateVariation`.
 */
function findNearestFork(state: BoardState, nodeId: NodeId): GameNode | null {
  let node = state.nodes[nodeId];
  for (;;) {
    if (node.children.length > 1) return node;
    if (!node.parent) return null;
    node = state.nodes[node.parent];
  }
}

/**
 * True iff `nodeId` is `ancestorId` itself or a descendant of it,
 * walked via `parent`. The validity check `resolveBranchTarget` uses
 * to confirm a remembered node still belongs to the subtree it claims
 * to.
 */
function isWithinSubtree(state: BoardState, nodeId: NodeId, ancestorId: NodeId): boolean {
  let curr: NodeId | null = nodeId;
  while (curr) {
    if (curr === ancestorId) return true;
    curr = state.nodes[curr]?.parent ?? null;
  }
  return false;
}

/**
 * Resolve the node a switch onto `branchHead` (a fork's child — the
 * root of one branch) should actually land the cursor on: the
 * branch's remembered cursor position (`GameNode.lastVisitedDescendant`)
 * when one exists, is still present in `state.nodes` (not pruned), and
 * is still genuinely within `branchHead`'s own subtree — the invariant
 * a stale or cross-subtree memory would otherwise violate silently.
 * Falls back to `branchHead` itself (the branch's own head node) in
 * every other case, loudly: a `console.warn` names the fork and the
 * dangling id so a pruned-and-still-referenced remembered node is
 * visible rather than silently sending the cursor to the wrong place
 * (ADR-0002 fail-loudly). Never-visited branches (no memory recorded
 * yet) take this same fallback path with no warning — that is the
 * expected, non-exceptional case.
 *
 * Single home for the restore semantics (ADR-0012 P1): both
 * `navigateVariation` and `navigateToggleMainLine` call this — and
 * only this — to decide where a branch switch lands, so the "restore
 * the actual last node" behavior cannot drift between the two
 * primitives.
 */
function resolveBranchTarget(state: BoardState, branchHead: GameNode): NodeId {
  const remembered = branchHead.lastVisitedDescendant;
  if (remembered === undefined) return branchHead.id;

  const rememberedNode: GameNode | undefined = state.nodes[remembered];
  if (!rememberedNode || !isWithinSubtree(state, remembered, branchHead.id)) {
    console.warn(
      `[navigator] branch-head memory for fork child ${branchHead.id} pointed at ` +
      `${remembered}, which no longer exists in that subtree (pruned?) — falling back ` +
      `to the branch head.`,
    );
    return branchHead.id;
  }
  return remembered;
}

/**
 * The one primitive `navigateVariation` and `navigateToggleMainLine`
 * both route through to actually perform a branch switch, once each
 * has picked `fork` and `targetIdx` by its own selection rule (see
 * their docstrings for how those rules differ). Restores
 * `fork.children[targetIdx]`'s remembered cursor node via
 * `resolveBranchTarget` rather than always landing on the immediate
 * child — the maintainer veto's core fix, applied exactly once so it
 * cannot diverge between the two call sites (ADR-0012 P1: no three
 * parallel implementations).
 */
function switchToBranch(state: BoardState, fork: GameNode, targetIdx: number): void {
  const branchHead = state.nodes[fork.children[targetIdx]];
  navigateTo(state, resolveBranchTarget(state, branchHead));
}

export function navigateNext(state: BoardState) {
  const curr = state.nodes[state.currentNodeId];
  if (curr.children.length > 0) {
    const nextId = curr.children[curr.activeChildIndex] ?? curr.children[0];
    navigateTo(state, nextId);
  }
}

export function navigatePrev(state: BoardState) {
  const curr = state.nodes[state.currentNodeId];
  if (curr.parent) navigateTo(state, curr.parent);
}

/**
 * Move to the adjacent sibling branch at the nearest fork — self or
 * ancestor of the current node, per `findNearestFork` — ordered by
 * child index, clamping at the ends (no-op past the first/last
 * sibling; this preserves the primitive's pre-existing convention, the
 * "or clamping per existing convention" half of the maintainer's veto
 * — `navigateToggleMainLine`'s wrap-on-first-use is a distinct,
 * intentional convention for the toggle reading, not something this
 * primitive inherits). "Adjacent" is relative to the fork's
 * `activeChildIndex`, which always names the branch the current
 * node's path actually descends through — `navigateTo`'s forward-
 * replay loop keeps every ancestor's `activeChildIndex` in sync with
 * `currentNodeId` on every call, so no separate indexOf search is
 * needed even when `state.currentNodeId` sits deep inside that branch
 * rather than at its immediate child.
 *
 * Restores the target branch's remembered cursor node via
 * `switchToBranch` (the shared primitive `navigateToggleMainLine` also
 * routes through) rather than always landing on the branch's immediate
 * child — the maintainer veto's core fix, applied identically here.
 */
export function navigateVariation(state: BoardState, direction: number) {
  const fork = findNearestFork(state, state.currentNodeId);
  if (!fork) return;
  const targetIdx = fork.activeChildIndex + direction;
  if (targetIdx >= 0 && targetIdx < fork.children.length) {
    switchToBranch(state, fork, targetIdx);
  }
}

/**
 * Toggle the active line at the nearest fork — self or ancestor of the
 * current node, per `findNearestFork`, so this fires from anywhere in
 * the line, not only from a fork's immediate child — between the two
 * most recently distinct branches taken there. The "switch to the
 * nearest alternative branch (uncle/cousin) and back" keybinding
 * semantics (`nav.toggleMainLine`).
 *
 * At the fork, picks the target branch by a plain advance-by-one,
 * wrapping (`(currentIdx + 1) % fork.children.length`) on first use —
 * there is no "other" to return to yet — or the last-remembered "other"
 * branch on a repeat press at the same fork; then restores that
 * branch's remembered cursor node via the shared `switchToBranch`
 * primitive (`navigateVariation` routes through the same primitive) —
 * the exact node the cursor last occupied in that branch, not always
 * its immediate child (2026-08-06 branch-switch-semantics veto: the
 * prior "always land on the immediate child" behavior was the defect
 * this function existed to fix). No-ops when no node from the current
 * position up to the root has more than one child (no fork exists to
 * toggle anywhere on the path).
 *
 * `memory` is keyed `${state.id}::${forkNodeId}` — `NodeId`s are
 * board-local and can collide across boards (see `IDENTIFIERS.md`),
 * so the key must carry the board id; `state.id` supplies it. Each
 * entry records the branch index the toggle switched FROM, so the
 * next press at the SAME fork returns to it — a true two-value
 * toggle between the two most recent choices, not a cycle through
 * every sibling (that's `navigateVariation`'s job, one level only).
 * This memory is deliberately separate from `GameNode.lastVisitedDescendant`
 * (`types/game.ts`): the former is this operation's own two-value
 * toggle history (which branch did the LAST toggle come from), the
 * latter is the per-branch cursor-position fact every navigation
 * write-throughs regardless of which primitive moved the cursor.
 * `navigateVariation`'s plain step doesn't touch this Map — only a
 * toggle press has a "came from" to remember.
 * Caller owns the `Map`'s lifetime (module-scope in
 * `useNavigation.ts`, shared across every `useNavigation()` call site
 * so the toggle history is per-board-per-fork, not per-caller; that
 * module also registers a `closeBoard` teardown handler that drops
 * every entry keyed to the closing board — see its
 * `nav:clear-toggle-memory` registration).
 */
export function navigateToggleMainLine(state: BoardState, memory: Map<string, number>): void {
  const fork = findNearestFork(state, state.currentNodeId);
  if (!fork) return;

  const key = `${state.id}::${fork.id}`;
  const currentIdx = fork.activeChildIndex;
  const rememberedIdx = memory.get(key);
  const targetIdx = rememberedIdx !== undefined && rememberedIdx !== currentIdx
    ? rememberedIdx
    : (currentIdx + 1) % fork.children.length;
  memory.set(key, currentIdx);
  switchToBranch(state, fork, targetIdx);
}

/**
 * Find the active-path node closest to current where a move
 * placed a stone at the clicked vertex (x, y). Searches backward
 * first — the "where did this stone come from?" reading — then
 * forward to handle empty intersections the active path will play
 * later. Returns null when (x, y) is never played on the active
 * path's move sequence.
 *
 * Notes:
 *   - A stone placed at index N and later captured at N+k leaves
 *     (x, y) visually empty for currentIdx > N+k. Backward search
 *     still returns N (the placement) — the user sees the move
 *     that placed the now-captured stone and can step forward to
 *     observe the capture.
 *   - The active path is the user-selected line via
 *     `navigateVariation`; this helper does not search sibling
 *     variations.
 *   - Root setup stones (AB / AW properties for handicap and
 *     problem-position imports) are not currently in the search
 *     domain. Adding them is a single conditional on the root
 *     node + the SGF-coord encoding navigator's setup-stone path
 *     already uses, when a handicap use case surfaces.
 */
export function findPlacementOnActivePath(
  state: BoardState,
  x: number,
  y: number,
): NodeId | null {
  const path = getActiveVariationPath(state);
  if (path.length === 0) return null;
  const currentIdx = path.indexOf(state.currentNodeId);
  if (currentIdx === -1) return null;

  function isPlacementAt(nodeId: NodeId): boolean {
    const node = state.nodes[nodeId];
    if (!node) return false;
    return node.move?.type === 'place'
        && node.move.x === x
        && node.move.y === y;
  }

  // Backward — inclusive of current so shift-clicking the
  // current-move's own vertex resolves to current (a coherent
  // no-op rather than a fall-through to a forward search).
  for (let i = currentIdx; i >= 0; i--) {
    if (isPlacementAt(path[i])) return path[i];
  }
  // Forward — empty intersection the active path will play later.
  for (let i = currentIdx + 1; i < path.length; i++) {
    if (isPlacementAt(path[i])) return path[i];
  }
  return null;
}
