/**
 * src/engine/sgf-loader.ts
 * License: Public Domain (The Unlicense)
 */
import { sgfToMove, generateUUID } from './util';
import { validateMove } from './rules';
import type { BoardState, GameNode, StoneColor, Point } from '../types';

const uuid = () => Math.random().toString(36).substring(2, 7);

export function loadSgf(sabakiOutput: any): BoardState {
  const sabakiRoot = sabakiOutput[0];
  const nodes: Record<string, GameNode> = {};

  const size = parseInt(sabakiRoot.data['SZ']?.[0] ?? '19', 10);

  const rootId = transform(sabakiRoot, null, nodes, size);

  // 1. Calculate the entire tree's deltas
  hydrate(rootId, nodes, {}, null, size);

  // 2. Create the base state. Each loadSgf call mints a fresh
  // clientGameId — two loads of the same SGF produce two distinct
  // game-source groupings on the backend, matching user intent ("I
  // re-imported the file, treat it as a separate session"). The
  // `sourceFileName` field is populated by useSgfLoader after this
  // call returns, since the filename is a File-API artifact the
  // engine layer doesn't see.
  // All required BoardState fields populated up-front; the prior
  // `as unknown as BoardState` cast was hiding `lastActivity` and
  // (after schema 52) the `games` field — the missing `games`
  // surfaced as a runtime "can't convert undefined to object"
  // when a freshly-loaded board flowed into App.vue's
  // `activeBoardGameHeadIds` computed.
  const state: BoardState = {
    id: generateUUID() as unknown as BoardState['id'], // BoardId is UUID-shaped (migration 24 → 25)
    rootNodeId: rootId as unknown as BoardState['rootNodeId'], // brand on the way in
    stones: {},
    captures: { B: 0, W: 0 },
    currentNodeId: rootId as unknown as BoardState['currentNodeId'],
    nodes: nodes as unknown as BoardState['nodes'],
    koPoint: null,
    turn: 'B',
    lastActivity: 0,
    clientGameId: generateUUID(),
    games: {},
  };

  // 3. Project root setup stones (AB/AW on the root node) into the board.
  const rootNode = nodes[rootId];
  if (rootNode.delta?.setupOverwritten) {
    for (const posKey of Object.keys(rootNode.delta.setupOverwritten)) {
      const [x, y] = posKey.split(',').map(Number);
      const sgf = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
      if (rootNode.properties.AB?.includes(sgf)) state.stones[posKey] = 'B';
      else if (rootNode.properties.AW?.includes(sgf)) state.stones[posKey] = 'W';
    }
  }

  return state;
}

function transform(
  sabakiNode: any,
  parentId: string | null,
  nodes: Record<string, GameNode>,
  size: number
): string {
  const id = 'node-' + uuid();
  const props = sabakiNode.data; 

  let move = null;
  if (props.B) move = sgfToMove(props.B[0], 'B', size);
  else if (props.W) move = sgfToMove(props.W[0], 'W', size);

  const node: GameNode = {
    id: id as any,
    parent: parentId as any,
    children: [],
    activeChildIndex: 0,
    properties: props,
    move
  };

  nodes[id] = node;

  if (sabakiNode.children) {
    for (const child of sabakiNode.children) {
      const childId = transform(child, id, nodes, size);
      node.children.push(childId as any);
    }
  }

  return id;
}

function hydrate(
  nodeId: string, 
  nodes: Record<string, GameNode>, 
  stones: Record<string, StoneColor>, 
  koPoint: Point | null,
  size: number
) {
  const node = nodes[nodeId];
  if (!node) return;

  let nextStones = { ...stones };
  let nextKo: Point | null = null;
  const setupOverwritten: Record<string, StoneColor | null> = {};

  const processSetup = (coords: string[] | undefined, color: StoneColor | null) => {
    if (!coords) return;
    for (const sgfCoord of coords) {
      const move = sgfToMove(sgfCoord, 'B', size); 
      const key = `${move.x},${move.y}`;
      if (!(key in setupOverwritten)) {
        setupOverwritten[key] = stones[key] ?? null;
      }
      if (color) nextStones[key] = color;
      else delete nextStones[key];
    }
  };

  processSetup(node.properties.AB, 'B');
  processSetup(node.properties.AW, 'W');
  processSetup(node.properties.AE, null);

  let captures: string[] = [];
  if (node.move && node.move.type === 'place') {
    const result = validateMove(nextStones, koPoint, node.move.color, node.move.x, node.move.y, size);
    if (result.ok) {
      captures = result.captures;
      nextStones[`${node.move.x},${node.move.y}`] = node.move.color;
      for (const capKey of captures) delete nextStones[capKey];
      nextKo = result.newKoPoint;
    } else {
      if (import.meta.env.DEV) {
        console.warn(`[SgfLoader] invalid move at node=${nodeId} (${node.move.x},${node.move.y}) — skipped`);
      }
    }
  }

  node.delta = { captures, setupOverwritten, prevKoPoint: koPoint, newKoPoint: nextKo };

  for (const childId of node.children) {
    hydrate(childId, nodes, nextStones, nextKo, size);
  }
}
