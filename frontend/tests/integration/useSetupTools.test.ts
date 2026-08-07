/**
 * tests/integration/useSetupTools.test.ts
 *
 * Tier-3 (composable / store integration) coverage for the setup
 * toolkit's tool-selection state machine and board-apply primitive
 * (`src/composables/board/useSetupTools.ts`, ledger rows 603/604).
 * Drives the REAL store (`resetWorkspace`, `addBoard`) and the real
 * `applySetup`/`applyMarkup` — no fakes needed, no network boundary
 * crossed (mirrors `useNavigation-toggle-memory-cleanup.test.ts`'s
 * shape).
 *
 * Three claims under test, matching the commission's own list:
 *   1. palette state machine — open/select/close deselects, and ESC/
 *      re-click/outside-click all route through the SAME deselect
 *      contract (`closePalette`/`togglePalette`'s shared behaviour —
 *      the component wires the DOM listeners, this composable owns
 *      the state transition both call into).
 *   2. `applyToolAt` writes through to the active board and returns
 *      `false` (a pure no-op) when no tool is armed, which is exactly
 *      what lets BoardWidget fall through to normal move routing.
 *   3. `activeTool` is module-scope shared state — the palette (one
 *      component) and the board (a different component) observe the
 *      SAME selection, which is the whole point of NOT scoping it
 *      per-component.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetWorkspace, store, addBoard, activeBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import { useSetupTools } from '../../src/composables/board/useSetupTools';

beforeEach(() => {
  // `activeTool` / `paletteOpen` are module-scope (see the composable's
  // header); `resetWorkspace` drains them via the registered
  // workspace-reset handler (`useSetupTools.ts`'s own
  // `registerWorkspaceResetHandler` call) — this beforeEach IS this
  // suite's own regression witness for that handler firing, alongside
  // the dedicated test below.
  resetWorkspace();
});

describe('useSetupTools — palette state machine', () => {
  it('togglePalette opens then closes, and closing deselects the active tool', () => {
    const tools = useSetupTools();
    expect(tools.paletteOpen.value).toBe(false);

    tools.togglePalette();
    expect(tools.paletteOpen.value).toBe(true);

    tools.selectTool('stone-black');
    expect(tools.activeTool.value).toBe('stone-black');

    tools.togglePalette(); // close via the same trigger
    expect(tools.paletteOpen.value).toBe(false);
    expect(tools.activeTool.value).toBeNull(); // auto-deselect on close
  });

  it('closePalette (the ESC / outside-click path) also deselects', () => {
    const tools = useSetupTools();
    tools.togglePalette();
    tools.selectTool('triangle');
    expect(tools.activeTool.value).toBe('triangle');

    tools.closePalette();
    expect(tools.paletteOpen.value).toBe(false);
    expect(tools.activeTool.value).toBeNull();
  });

  it('selecting the same tool twice deselects it without closing the palette', () => {
    const tools = useSetupTools();
    tools.togglePalette();
    tools.selectTool('stone-white');
    expect(tools.activeTool.value).toBe('stone-white');

    tools.selectTool('stone-white'); // second click on the same tool
    expect(tools.activeTool.value).toBeNull();
    expect(tools.paletteOpen.value).toBe(true); // palette itself stays open
  });

  it('activeTool is shared across independent useSetupTools() call sites (module-scope)', () => {
    const paletteHandle = useSetupTools();
    const boardHandle = useSetupTools();

    paletteHandle.selectTool('stone-black');
    expect(boardHandle.activeTool.value).toBe('stone-black');
  });

  it('resetWorkspace (identity flip) releases a still-armed tool via the registered handler', () => {
    const tools = useSetupTools();
    tools.togglePalette();
    tools.selectTool('stone-white');
    expect(tools.activeTool.value).toBe('stone-white');
    expect(tools.paletteOpen.value).toBe(true);

    resetWorkspace();

    expect(tools.activeTool.value).toBeNull();
    expect(tools.paletteOpen.value).toBe(false);
  });
});

describe('useSetupTools — applyToolAt', () => {
  it('returns false and does not mutate the board when no tool is armed', () => {
    addBoard(createInitialBoard());
    const tools = useSetupTools();
    const boardsVersionBefore = store.boards[store.activeBoardIndex].stones;

    const applied = tools.applyToolAt(3, 3);

    expect(applied).toBe(false);
    expect(store.boards[store.activeBoardIndex].stones).toBe(boardsVersionBefore);
  });

  it('places a black setup stone on the active board and updates it in the store', () => {
    addBoard(createInitialBoard());
    const tools = useSetupTools();
    tools.selectTool('stone-black');

    const applied = tools.applyToolAt(4, 4);

    expect(applied).toBe(true);
    expect(activeBoard.value?.stones['4,4']).toBe('B');
  });

  it('places a triangle mark on the current node without touching stones', () => {
    addBoard(createInitialBoard());
    const tools = useSetupTools();
    tools.selectTool('triangle');

    tools.applyToolAt(6, 6);

    const board = activeBoard.value!;
    expect(board.nodes[board.currentNodeId].properties.TR).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(board.stones['6,6']).toBeUndefined();
  });

  it('a second click with the SAME armed tool toggles the setup stone off', () => {
    addBoard(createInitialBoard());
    const tools = useSetupTools();
    tools.selectTool('stone-white');

    tools.applyToolAt(2, 2);
    expect(activeBoard.value?.stones['2,2']).toBe('W');

    tools.applyToolAt(2, 2);
    expect(activeBoard.value?.stones['2,2']).toBeUndefined();
  });
});
