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

export function applyGoMove(state: BoardState, x: number, y: number): BoardState | null {
  const rootNode = state.nodes[state.rootNodeId];
  const size = parseInt(rootNode.properties['SZ']?.[0] ?? '19', 10);

  const result = validateMove(state.stones, state.koPoint, state.turn, x, y, size);
  if (!result.ok) return null;

  const nextStones = { ...state.stones };
  const nextCaptures = { ...state.captures };
  const posKey = pointToKey(x, y);
  
  nextStones[posKey] = state.turn;
  for (const capKey of result.captures) {
    delete nextStones[capKey];
    nextCaptures[state.turn] += 1;
  }

  // Single cast at the boundary: untyped string from Math.random becomes
  // a NodeId here. All four downstream uses (newNode.id, parentNode.children
  // append, nextNodes record indexing, BoardState.currentNodeId) consume the
  // already-branded value with no further casting. This is the ideal shape:
  // one cast, one comment, four sites fixed.
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
      newKoPoint: result.newKoPoint
    }
  };

  const nextNodes = { ...state.nodes };
  const parentNode = { ...nextNodes[state.currentNodeId] };
  parentNode.children = [...parentNode.children, newNodeId];
  parentNode.activeChildIndex = parentNode.children.length - 1;
  
  nextNodes[state.currentNodeId] = parentNode;
  nextNodes[newNodeId] = newNode;

  return {
    ...state,
    stones: nextStones,
    captures: nextCaptures,
    turn: state.turn === 'B' ? 'W' : 'B',
    currentNodeId: newNodeId,
    nodes: nextNodes,
    koPoint: result.newKoPoint
  };
}
