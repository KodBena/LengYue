/**
 * tests/unit/engine/sgf-writer-setup-roundtrip.test.ts
 *
 * Tier-1 (pure-logic) round-trip test for the setup toolkit's data
 * layer (ledger rows 603/604): load an SGF → edit via `applySetup` /
 * `applyMarkup` → serialize via `serializeBoard` → reload → the AB /
 * AW / TR properties survive. `serializeBoard` (`src/engine/sgf-
 * writer.ts`) has NO prior test coverage at all (only the narrower
 * `setSgfRootKomi` string-surgery helper is tested); this is the
 * first test of the writer's actual tree-serialization path, and the
 * commission's explicit round-trip requirement.
 *
 * `applySetup`/`applyMarkup` write raw SGF properties directly onto
 * `GameNode.properties` (no new writer code needed — `serializeBoard`
 * already dumps `node.properties` verbatim), so this test also stands
 * as the writer's load-bearing proof that property-level round-trip
 * genuinely holds for the setup toolkit's write path, not just for
 * properties the loader itself produced.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore — @sabaki/sgf has no published types declaration; mirrors
// sgf-loader.test.ts's suppression.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../../src/engine/sgf-loader';
import { serializeBoard } from '../../../src/engine/sgf-writer';
import { navigateTo } from '../../../src/engine/navigator';
import { applySetup, applyMarkup } from '../../../src/logic';
import type { BoardState } from '../../../src/types';

function load(source: string): BoardState {
  return loadSgf(sgf.parse(source));
}

describe('serializeBoard — setup-toolkit round trip', () => {
  it('preserves a freshly-applied AB (black setup stone) through save → reload', () => {
    const board = load('(;FF[4]GM[1]SZ[19])');
    const edited = applySetup(board, 3, 3, 'B');

    const saved = serializeBoard(edited);
    const reloaded = load(saved);

    expect(reloaded.stones['3,3']).toBe('B');
  });

  it('preserves a freshly-applied AW (white setup stone) through save → reload', () => {
    const board = load('(;FF[4]GM[1]SZ[19])');
    const edited = applySetup(board, 5, 5, 'W');

    const reloaded = load(serializeBoard(edited));

    expect(reloaded.stones['5,5']).toBe('W');
  });

  it('preserves a freshly-applied TR (triangle mark) through save → reload', () => {
    const board = load('(;FF[4]GM[1]SZ[19])');
    const edited = applyMarkup(board, 4, 4, 'TR');

    const saved = serializeBoard(edited);
    const reloaded = load(saved);

    // The loader passes unrecognized properties (TR) through verbatim
    // into GameNode.properties — it never interprets markup, only
    // AB/AW/AE/moves. Assert on the raw property, the loader's actual
    // contract surface for a non-board-state property.
    expect(reloaded.nodes[reloaded.rootNodeId].properties.TR).toBeDefined();
    expect(reloaded.nodes[reloaded.rootNodeId].properties.TR).toEqual(
      edited.nodes[edited.currentNodeId].properties.TR,
    );
  });

  it('preserves AB + AW + TR together, and a toggled-off setup stone stays off', () => {
    const board = load('(;FF[4]GM[1]SZ[19])');
    let edited = applySetup(board, 3, 3, 'B');
    edited = applySetup(edited, 15, 15, 'W');
    edited = applyMarkup(edited, 3, 3, 'TR');
    // Place then remove a stone at (9,9) — the removed one must NOT
    // resurrect on reload.
    edited = applySetup(edited, 9, 9, 'B');
    edited = applySetup(edited, 9, 9, 'B'); // toggle off

    const reloaded = load(serializeBoard(edited));

    expect(reloaded.stones['3,3']).toBe('B');
    expect(reloaded.stones['15,15']).toBe('W');
    expect(reloaded.stones['9,9']).toBeUndefined();
    expect(reloaded.nodes[reloaded.rootNodeId].properties.TR).toBeDefined();
  });

  it('preserves setup edits applied on a NON-ROOT (mid-tree) node', () => {
    // A played move first, then a setup edit on that move's node —
    // the "current node has a played move" case the commission names.
    const board = load('(;FF[4]GM[1]SZ[19];B[pd])');
    const moveNodeId = board.nodes[board.rootNodeId].children[0];
    const boardAtMove: BoardState = { ...board, currentNodeId: moveNodeId };

    const edited = applySetup(boardAtMove, 3, 3, 'W');
    const saved = serializeBoard(edited);
    const reloaded = load(saved);

    const reloadedMoveNodeId = reloaded.nodes[reloaded.rootNodeId].children[0];
    expect(reloaded.nodes[reloadedMoveNodeId].properties.AW).toBeDefined();
    // `loadSgf` only ever projects the ROOT's own setup stones into the
    // freshly-loaded `state.stones` (the cursor starts at root); a
    // mid-tree AW only reaches the projection once the cursor actually
    // navigates there — `navigateTo`'s forward-replay loop is the
    // production code path that does this (BoardWidget mounts at
    // whatever `currentNodeId` a restored session left the board at).
    navigateTo(reloaded, reloadedMoveNodeId);
    expect(reloaded.stones['3,3']).toBe('W');
  });
});
