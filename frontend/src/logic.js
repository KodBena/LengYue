/**
 * src/logic.ts
 * License: Public Domain (The Unlicense)
 */
import { validateMove } from './engine/rules';
import { pointToKey } from './engine/util';
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
export function applySetup(state, x, y, color) {
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
        if (properties[p]?.length === 0)
            delete properties[p];
    });
    if (color === 'B')
        properties.AB = [...(properties.AB ?? []), sgfCoord];
    else if (color === 'W')
        properties.AW = [...(properties.AW ?? []), sgfCoord];
    else
        properties.AE = [...(properties.AE ?? []), sgfCoord];
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
    if (color)
        nextStones[posKey] = color;
    else
        delete nextStones[posKey];
    return {
        ...state,
        stones: nextStones,
        nodes: nextNodes
    };
}
export function applyGoMove(state, x, y) {
    const rootNode = state.nodes[state.rootNodeId];
    const size = parseInt(rootNode.properties['SZ']?.[0] ?? '19', 10);
    const result = validateMove(state.stones, state.koPoint, state.turn, x, y, size);
    if (!result.ok)
        return null;
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
    let nextCurrentNodeId;
    if (existingChildId) {
        // Reuse path: update activeChildIndex on parent so the existing
        // child becomes the active variation.
        parentNode.activeChildIndex = parentNode.children.indexOf(existingChildId);
        nextCurrentNodeId = existingChildId;
    }
    else {
        // New-node path. Single cast at the boundary: untyped string from
        // Math.random becomes a NodeId here.
        const newNodeId = ('node-' + Math.random().toString(36).substring(2, 7));
        const sgfCoord = String.fromCharCode(97 + x) + String.fromCharCode(97 + (size - 1 - y));
        const newNode = {
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
