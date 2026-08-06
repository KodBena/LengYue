/**
 * src/logic.ts
 * License: Public Domain (The Unlicense)
 */

import { validateMove } from './engine/rules';
import { pointToKey } from './engine/util';
import type { BoardState, GameNode, StoneColor, NodeId } from './types';

/**
 * Adds a setup stone (AB/AW/AE) to the current node.
 * This maintains the SGF property list and updates the projection.
 *
 * CALLER OBLIGATION (caller-less at HEAD): this is the one code path that
 * mutates an EXISTING node's position-relevant content under a stable
 * NodeId, which breaks the node-content-immutability invariant the shared
 * thumbnail snapshot cache rests on (hydration-residue audit,
 * docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md §3.2). Any
 * future caller (a setup-edit mode) must invalidate the edited node and its
 * descendants via `invalidateNodeSnapshots` — or the coarse
 * `purgeBoardThumbnails(boardId)` — in
 * src/composables/cards/thumbnail-render-resources.ts at the commit site.
 */
export function applySetup(state: BoardState, x: number, y: number, color: StoneColor | null): BoardState {
  const size = parseInt(state.nodes[state.rootNodeId].properties['SZ']?.[0] ?? '19', 10);
  const posKey = pointToKey(x, y);
  const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
  
  const nextNodes = { ...state.nodes };
  const currentNode = { ...nextNodes[state.currentNodeId] };
  const properties = { ...currentNode.properties };

  // 1. Update Properties (AB, AW, AE)
  // Ensure we don't have the same coord in multiple setup properties
  ['AB', 'AW', 'AE'].forEach(p => {
    properties[p] = properties[p]?.filter(v => v !== sgfCoord);
    if (properties[p]?.length === 0) delete properties[p];
  });

  if (color === 'B') properties.AB = [...(properties.AB ?? []), sgfCoord];
  else if (color === 'W') properties.AW = [...(properties.AW ?? []), sgfCoord];
  else properties.AE = [...(properties.AE ?? []), sgfCoord];

  currentNode.properties = properties;

  // 2. Update Delta (To allow navigation to/from this setup)
  const setupOverwritten = { ...currentNode.delta?.setupOverwritten };
  if (!(posKey in setupOverwritten)) {
    setupOverwritten[posKey] = state.stones[posKey] ?? null;
  }
  
  currentNode.delta = {
    captures: currentNode.delta?.captures ?? [],
    setupOverwritten,
    prevKoPoint: state.koPoint,
    newKoPoint: state.koPoint
  };

  nextNodes[state.currentNodeId] = currentNode;

  // 3. Update Projection
  const nextStones = { ...state.stones };
  if (color) nextStones[posKey] = color;
  else delete nextStones[posKey];

  return {
    ...state,
    stones: nextStones,
    nodes: nextNodes
  };
}

/**
 * Applies a pass: consumes the turn, captures nothing, and appends a
 * `type: 'pass'` `GameNode` to the tree — the mutator named in the
 * pass-support design (`.claude/dispatch-reports/
 * design-engine-features.md`, PASS SUPPORT §B). Structurally parallel
 * to `applyGoMove` (existing-child reuse, parent/child bookkeeping,
 * ko/delta shape) but skips `validateMove`/capture entirely: a pass
 * is always legal and never touches the stones projection.
 *
 * SGF round-trip: the new node's property is `{ [turn]: [''] }` — an
 * empty-value property, matching the exact shape `sgfToMove`
 * (`engine/util.ts:57-60`) already decodes back into a pass move, and
 * that `sgf-writer.ts::serializeProperties` already re-serializes
 * losslessly (an empty-string *value* still has `values.length === 1`,
 * so it is NOT the "empty values array" case that function skips —
 * only an absent/zero-length array is dropped). This is the same
 * property shape a real SGF's `B[]`/`W[]` pass marker parses into, so
 * a pass played here and a pass loaded from a file are indistinguishable
 * once in the tree.
 */
export function applyPass(state: BoardState): BoardState {
  const currentNode = state.nodes[state.currentNodeId];

  // Existing-child reuse: a pass replayed from an existing subtree
  // (e.g. re-navigating an SGF-loaded pass) should descend into the
  // existing node rather than mint a duplicate sibling — same policy
  // as applyGoMove's placement dedup.
  const existingChildId = currentNode.children.find(id => {
    const m = state.nodes[id]?.move;
    return m?.type === 'pass' && m.color === state.turn;
  });

  const nextNodes = { ...state.nodes };
  const parentNode = { ...currentNode };
  let nextCurrentNodeId: NodeId;

  if (existingChildId) {
    parentNode.activeChildIndex = parentNode.children.indexOf(existingChildId);
    nextCurrentNodeId = existingChildId;
  } else {
    // Single cast at the boundary: untyped string from Math.random
    // becomes a NodeId here — same idiom as applyGoMove's new-node
    // path above.
    const newNodeId = ('node-' + Math.random().toString(36).substring(2, 7)) as NodeId;
    const newNode: GameNode = {
      id: newNodeId,
      parent: state.currentNodeId,
      children: [],
      activeChildIndex: 0,
      properties: { [state.turn]: [''] },
      move: { x: 0, y: 0, color: state.turn, type: 'pass' },
      delta: {
        captures: [],
        setupOverwritten: {},
        prevKoPoint: state.koPoint,
        // A pass clears any ko threat the way a real move would (the
        // ko point is a single-move-window restriction; passing lets
        // it lapse) — mirrors GTP/SGF engine convention.
        newKoPoint: null,
      },
    };
    parentNode.children = [...parentNode.children, newNodeId];
    parentNode.activeChildIndex = parentNode.children.length - 1;
    nextNodes[newNodeId] = newNode;
    nextCurrentNodeId = newNodeId;
  }

  nextNodes[state.currentNodeId] = parentNode;

  return {
    ...state,
    turn: state.turn === 'B' ? 'W' : 'B',
    currentNodeId: nextCurrentNodeId,
    nodes: nextNodes,
    koPoint: null,
  };
}

export function applyGoMove(state: BoardState, x: number, y: number): BoardState | null {
  const rootNode = state.nodes[state.rootNodeId];
  const size = parseInt(rootNode.properties['SZ']?.[0] ?? '19', 10);

  const result = validateMove(state.stones, state.koPoint, state.turn, x, y, size);
  if (!result.ok) return null;

  const posKey = pointToKey(x, y);
  const currentNode = state.nodes[state.currentNodeId];

  // Existing-child reuse: if a child of the current node already plays
  // this move (same coordinate, same color), navigate to it rather than
  // creating a duplicate sibling. The validation result is shared —
  // captures and newKoPoint are deterministic given the parent's
  // stones, so the freshly-computed projection is consistent with the
  // child's stored delta and we don't need to re-read it.
  const existingChildId = currentNode.children.find(id => {
    const m = state.nodes[id]?.move;
    return m?.type === 'place' && m.x === x && m.y === y && m.color === state.turn;
  });

  // Stones / captures projection — identical regardless of whether
  // we're creating a new node or descending into an existing one.
  const nextStones = { ...state.stones };
  const nextCaptures = { ...state.captures };
  nextStones[posKey] = state.turn;
  for (const capKey of result.captures) {
    delete nextStones[capKey];
    nextCaptures[state.turn] += 1;
  }

  const nextNodes = { ...state.nodes };
  const parentNode = { ...currentNode };
  let nextCurrentNodeId: NodeId;

  if (existingChildId) {
    // Reuse path: update activeChildIndex on parent so the existing
    // child becomes the active variation.
    parentNode.activeChildIndex = parentNode.children.indexOf(existingChildId);
    nextCurrentNodeId = existingChildId;
  } else {
    // New-node path. Single cast at the boundary: untyped string from
    // Math.random becomes a NodeId here.
    const newNodeId = ('node-' + Math.random().toString(36).substring(2, 7)) as NodeId;
    const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
    const newNode: GameNode = {
      id: newNodeId,
      parent: state.currentNodeId,
      children: [],
      activeChildIndex: 0,
      properties: { [state.turn]: [sgfCoord] },
      move: { x, y, color: state.turn, type: 'place' },
      delta: {
        captures: result.captures,
        setupOverwritten: {},
        prevKoPoint: state.koPoint,
        newKoPoint: result.newKoPoint,
      },
    };
    parentNode.children = [...parentNode.children, newNodeId];
    parentNode.activeChildIndex = parentNode.children.length - 1;
    nextNodes[newNodeId] = newNode;
    nextCurrentNodeId = newNodeId;
  }

  nextNodes[state.currentNodeId] = parentNode;

  return {
    ...state,
    stones: nextStones,
    captures: nextCaptures,
    turn: state.turn === 'B' ? 'W' : 'B',
    currentNodeId: nextCurrentNodeId,
    nodes: nextNodes,
    koPoint: result.newKoPoint,
  };
}
