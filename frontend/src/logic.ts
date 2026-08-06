/**
 * src/logic.ts
 * License: Public Domain (The Unlicense)
 */

import { validateMove } from './engine/rules';
import { pointToKey } from './engine/util';
import type { BoardState, GameNode, StoneColor, NodeId } from './types';

/**
 * Adds (or toggles off) a setup stone (AB/AW/AE) at (x, y) on the
 * CURRENT node. This maintains the SGF property list and updates the
 * projection.
 *
 * Toggle semantics (classic Go-editor convention — q5go / cgoban /
 * Sabaki lineage, ADR-0019: the genre is the spec): placing the SAME
 * color that already occupies the point REMOVES it; placing the
 * OPPOSITE color REPLACES it. The toggle test reads `state.stones`
 * (what the point currently projects as), not the property list —
 * that is the single decision site both the property update and the
 * board projection below derive from, so the two cannot diverge
 * (ADR-0012 P1). `color === null` (the `AE`/erase case) is exempt
 * from the toggle test — an explicit erase always erases, matching
 * `applyMarkup`'s independent "always exactly what was asked"
 * contract, since the three toolkit tools this codebase wires today
 * (black stone / white stone / triangle) never call this with `null`;
 * an eraser tool is a named future seam, not built here.
 *
 * Fixed 2026-08-06 (setup-toolkit build, ledger rows 603/604): the
 * prior body read `color` — the raw requested color — at BOTH the
 * property-update step and the projection step, independently, with
 * no toggle test at all; a same-color re-click cleared then
 * immediately re-added the identical property, so two clicks looked
 * like one and there was no way to remove a stone once placed. Two
 * writers of the same "what color ends up here" decision, and neither
 * one implemented the toggle the commission's genre survey requires —
 * the two-question reflex's answer: the type is `effectiveColor`, a
 * single site both steps below read.
 *
 * CALLER OBLIGATION (caller-less at HEAD until this commit): this is
 * the one code path that mutates an EXISTING node's position-relevant
 * content under a stable NodeId, which breaks the node-content-
 * immutability invariant the shared thumbnail snapshot cache rests on
 * (hydration-residue audit,
 * docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md §3.2).
 * Every caller invalidates the edited node and its descendants via
 * `invalidateNodeSnapshots` — or the coarse
 * `purgeBoardThumbnails(boardId)` — in
 * src/composables/cards/thumbnail-render-resources.ts at the commit
 * site; `useSetupTools.applyToolAt` (`src/composables/board/`) is the
 * first production caller and discharges this obligation.
 */
export function applySetup(state: BoardState, x: number, y: number, color: StoneColor | null): BoardState {
  const size = parseInt(state.nodes[state.rootNodeId].properties['SZ']?.[0] ?? '19', 10);
  const posKey = pointToKey(x, y);
  const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));

  // The one toggle-test site (see doc comment above): re-clicking the
  // color already projected at this point erases it instead of
  // re-affirming it.
  const effectiveColor: StoneColor | null =
    color !== null && state.stones[posKey] === color ? null : color;

  const nextNodes = { ...state.nodes };
  const currentNode = { ...nextNodes[state.currentNodeId] };
  const properties = { ...currentNode.properties };

  // 1. Update Properties (AB, AW, AE)
  // Ensure we don't have the same coord in multiple setup properties.
  // `delete` (not an `undefined` assignment) when a filter empties an
  // array — an own key holding `undefined` is exactly what
  // `sgf-writer.ts::serializeProperties` warns and skips over, noise
  // this loop was minting on every single-property edit before this
  // fix.
  ['AB', 'AW', 'AE'].forEach(p => {
    const filtered = properties[p]?.filter(v => v !== sgfCoord);
    if (!filtered || filtered.length === 0) delete properties[p];
    else properties[p] = filtered;
  });

  if (effectiveColor === 'B') properties.AB = [...(properties.AB ?? []), sgfCoord];
  else if (effectiveColor === 'W') properties.AW = [...(properties.AW ?? []), sgfCoord];
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

  // 3. Update Projection — reads the SAME `effectiveColor` step 1 used.
  const nextStones = { ...state.stones };
  if (effectiveColor) nextStones[posKey] = effectiveColor;
  else delete nextStones[posKey];

  return {
    ...state,
    stones: nextStones,
    nodes: nextNodes
  };
}

/**
 * SGF markup-property keys this codebase can toggle via the setup
 * toolkit. Deliberately narrow today (only `TR` — triangle — is
 * wired to a UI tool); the type is the seam a future square/circle/
 * label tool widens (`SQ` / `CR` / `LB`), named here rather than
 * left to a bare-string call site (ADR-0000 Rule 1).
 */
export type SetupMarkupKey = 'TR';

/**
 * Toggles a markup mark (currently only `TR` — triangle) at (x, y) on
 * the CURRENT node's SGF properties. Unlike `applySetup`, this never
 * touches `state.stones`, `state.delta.setupOverwritten`, or the ko/
 * capture machinery: SGF markup is a per-node annotation with no
 * carry-forward to descendants (the SGF spec scopes TR/SQ/CR/LB to
 * the node that declares them), so there is no board-state projection
 * to maintain and no navigator.ts involvement — reading
 * `node.properties.TR` at render time for whichever node is current
 * is the whole contract.
 *
 * Toggle semantics: present at (x, y) → removed; absent → added.
 * Mirrors `applySetup`'s per-property toggle shape one property
 * simpler (no cross-property exclusivity to enforce — a point can
 * carry a triangle independently of what stone occupies it).
 *
 * CALLER OBLIGATION: same node-content-mutation hazard `applySetup`
 * documents — this mutates an EXISTING node under a stable NodeId, so
 * a caller wiring this into an edit mode invalidates that node's
 * cached thumbnail snapshot (`invalidateNodeSnapshots` in
 * `src/composables/cards/thumbnail-render-resources.ts`). Descendants
 * do NOT need invalidation here (contrast `applySetup`, which does):
 * a markup mark has no board-state carry-forward, so no descendant's
 * derived snapshot depends on it.
 */
export function applyMarkup(state: BoardState, x: number, y: number, key: SetupMarkupKey): BoardState {
  const size = parseInt(state.nodes[state.rootNodeId].properties['SZ']?.[0] ?? '19', 10);
  const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));

  const nextNodes = { ...state.nodes };
  const currentNode = { ...nextNodes[state.currentNodeId] };
  const properties = { ...currentNode.properties };

  const existing = properties[key] ?? [];
  if (existing.includes(sgfCoord)) {
    const filtered = existing.filter(v => v !== sgfCoord);
    if (filtered.length === 0) delete properties[key];
    else properties[key] = filtered;
  } else {
    properties[key] = [...existing, sgfCoord];
  }

  currentNode.properties = properties;
  nextNodes[state.currentNodeId] = currentNode;

  return {
    ...state,
    nodes: nextNodes,
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
