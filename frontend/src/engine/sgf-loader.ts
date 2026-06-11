/**
 * src/engine/sgf-loader.ts
 * SGF → BoardState loader: the file-trust boundary (ADR-0002).
 *
 * This module is where untrusted *file* data (a parsed SGF tree)
 * becomes internal `BoardState`. Per the umbrella's file-trust
 * calibration, ADR-0002's UI-input-validation exception does NOT apply
 * here: a corrupt file is not a structurally-impossible UI input, so
 * the boundary refuses malformation loudly rather than coercing it.
 * Two failure classes, two channels:
 *
 *   - Unparseable *geometry* (`SZ`) or a malformed *coordinate*
 *     (`sgfToMove`) → throw (loudness level 3). The throw propagates to
 *     each `loadSgf` caller's existing catch; the two user-facing
 *     callers (`useSgfLoader`, `useReviewSession.loadCard`) surface it
 *     via `pushSystemMessage` (level 4). A board that returns from
 *     `loadSgf` is therefore geometry-clean by construction — post-load
 *     re-readers (`getInitialStones` at analysis time) must NOT re-throw
 *     on it, or the boundary moves to the wrong layer.
 *   - An *illegal move* in an otherwise-loadable file (a move on an
 *     occupied point, a ko violation) → per-node `console.warn` (level
 *     5, prod-visible), skipping that one move. The board still renders
 *     minus the bad move; this matches the in-file `decodeBoardArray`
 *     precedent (`engine/util.ts`) for renderable-but-anomalous data.
 *
 * License: Public Domain (The Unlicense)
 */
import { sgfToMove } from './util';
import { generateUUID } from '../lib/utils';
import { validateMove } from './rules';
import type { BoardState, GameNode, NodeId, StoneColor, Point } from '../types';

const uuid = () => Math.random().toString(36).substring(2, 7);

/**
 * Thrown when an SGF's board-size (`SZ`) property is present but
 * unparseable. Distinct from `SgfCoordinateError` (a per-point fault) —
 * a bad `SZ` corrupts the *geometry* every coordinate is interpreted
 * against, so there is no salvageable board to return.
 *
 * Why throw here when `getKomi` falls back to 6.5: komi is a scalar
 * scoring parameter — a wrong default degrades one number and the board
 * is still playable. `SZ` is load-bearing geometry: `NaN` propagates
 * into every `sgfToMove` decode, the stones-map keys, and the rules
 * engine's neighbour arithmetic, producing a board that is structurally
 * corrupt rather than merely mis-scored. Guessing "probably 19" for a
 * file that declared a malformed size is exactly the "recover by
 * guessing what the caller meant" anti-pattern ADR-0002 names.
 */
export class SgfSizeError extends Error {
  readonly raw: string;

  constructor(raw: string) {
    super(`Malformed SGF board size SZ[${raw}] — not a positive integer`);
    this.name = 'SgfSizeError';
    this.raw = raw;
  }
}

/**
 * Parse an SGF `SZ` value into a board size, defaulting to 19 only when
 * the property is *absent*. A present-but-unparseable `SZ` (e.g.
 * `SZ[garbage]`) throws `SgfSizeError` rather than coercing to `NaN` —
 * the absent case is legitimately a default (19×19 is SGF's
 * convention), the malformed case is corrupt file data.
 *
 * SGF also permits non-square `SZ[w:h]`; this loader has only ever
 * modelled square boards (the rest of the engine indexes on a single
 * `size`). A `w:h` value is treated as malformed here rather than
 * silently truncated — surfacing the unsupported shape is the
 * fail-loud move. (If non-square support is ever wanted it is a
 * deliberate feature, not a coercion.)
 */
function parseBoardSize(raw: string | undefined): number {
  if (raw === undefined) return 19;
  const size = parseInt(raw, 10);
  // `parseInt` returns NaN for non-numeric input and tolerates trailing
  // garbage (`parseInt('19:13')` → 19), so guard both: reject NaN /
  // non-positive, and reject any value whose round-trip doesn't match
  // (catches `19:13`, `19x`, ` 19 ` with embedded junk).
  if (!Number.isInteger(size) || size <= 0 || String(size) !== raw.trim()) {
    throw new SgfSizeError(raw);
  }
  return size;
}

export function loadSgf(sabakiOutput: any): BoardState {
  const sabakiRoot = sabakiOutput[0];
  const nodes: Record<NodeId, GameNode> = {};

  const size = parseBoardSize(sabakiRoot.data['SZ']?.[0]);

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
  // `as unknown as BoardState` cast was hiding (after schema 52)
  // the `games` field — the missing `games`
  // surfaced as a runtime "can't convert undefined to object"
  // when a freshly-loaded board flowed into App.vue's
  // `activeBoardGameHeadIds` computed.
  const state: BoardState = {
    id: generateUUID() as unknown as BoardState['id'], // BoardId is UUID-shaped (migration 24 → 25)
    rootNodeId: rootId, // already branded: `transform` mints NodeId at its single id-construction site
    stones: {},
    captures: { B: 0, W: 0 },
    currentNodeId: rootId,
    nodes,
    koPoint: null,
    turn: 'B',
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
  parentId: NodeId | null,
  nodes: Record<NodeId, GameNode>,
  size: number
): NodeId {
  // Justified brand mint (ADR-0002 Rule 2): this Band-3 SGF loader is the
  // sole construction site for loader-minted node ids, branding the fresh
  // `node-` string into the Band-2 NodeId vocabulary (ADR-0003 band
  // boundary — Band 3 loader minting a Band 2 branded id). Safe by
  // construction: the id is created here and registered in `nodes` below.
  const id = ('node-' + uuid()) as NodeId;
  const props = sabakiNode.data;

  let move = null;
  if (props.B) move = sgfToMove(props.B[0], 'B', size);
  else if (props.W) move = sgfToMove(props.W[0], 'W', size);

  const node: GameNode = {
    id,
    parent: parentId,
    children: [],
    activeChildIndex: 0,
    properties: props,
    move
  };

  nodes[id] = node;

  if (sabakiNode.children) {
    for (const child of sabakiNode.children) {
      const childId = transform(child, id, nodes, size);
      node.children.push(childId);
    }
  }

  return id;
}

function hydrate(
  nodeId: NodeId,
  nodes: Record<NodeId, GameNode>,
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
      // Prod-visible (ADR-0002 level 5): the prior `import.meta.env.DEV`
      // gate meant production silently dropped illegal moves from loaded
      // files. The notice now fires in every environment so the
      // anomaly is recorded where it is retrievable (DevTools console).
      // Per-node detail is kept deliberately — node id, coordinate, and
      // the rules-engine reason — rather than collapsing to a bare count:
      // ADR-0002 Revisit-when #2 warns that aggregating distinct
      // anomalies into one message loses the specificity that makes the
      // record actionable. The move is skipped, not coerced; the board
      // still renders minus this move (the renderable-but-anomalous
      // class, as with `decodeBoardArray` in engine/util.ts).
      console.warn(
        `[SgfLoader] illegal move skipped at node=${nodeId} ` +
        `(${node.move.x},${node.move.y}, ${node.move.color}) — ${result.reason ?? 'rejected by rules engine'}`,
      );
    }
  }

  node.delta = { captures, setupOverwritten, prevKoPoint: koPoint, newKoPoint: nextKo };

  for (const childId of node.children) {
    hydrate(childId, nodes, nextStones, nextKo, size);
  }
}
