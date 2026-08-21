/**
 * src/composables/board/useSetupTools.ts
 *
 * The setup toolkit's tool-selection state and apply primitive — the
 * classic Go-editor "setup mode" (q5go / cgoban / Sabaki lineage,
 * ADR-0019: the genre is the spec). Deliberately a SKELETON per the
 * maintainer's scope ruling (ledger rows 603/604): three tools wired
 * end-to-end (BLACK / WHITE setup stone, TRIANGLE mark), no eraser,
 * no square/circle/label tools, no drag-painting. `SetupTool`'s union
 * and `applyToolAt`'s switch are exactly where a future tool adds a
 * case — the seam is the type, not a comment.
 *
 * Module-scope singleton (mirrors `useHoverPopover`'s / the toggle-
 * memory `Map` in `navigator.ts`'s callers): the toolbar palette (which
 * selects a tool) and the board (which applies it on click) are two
 * different components that must observe the SAME active tool, and
 * there is exactly one board visible at a time. `activeTool` is
 * deliberately NOT store state — it is session-local UI ephemera (per
 * the commission's framing: "the SGF data lives in the game tree, not
 * the persisted settings blob") with no cross-reload persistence
 * requirement, so it lives in a plain module-scope `ref`, not
 * `GlobalStore` — no schema migration, no `touchSession()` call.
 *
 * ADR-0003 band: [B2] (game-tree-coupled — `SetupTool` and
 * `applyToolAt` reach into `BoardState`/`logic.ts`, but carry no Go
 * rules of their own; a chess/shogi fork keeps this file, swapping
 * only what `applySetup`/`applyMarkup` do underneath).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { applySetup, applyMarkup } from '../../logic';
import { collectSubtreeIds } from '../../engine/util';
import { store, activeBoard, updateBoardState } from '../../store';
import { invalidateNodeSnapshots } from '../cards/thumbnail-render-resources';
import { registerWorkspaceResetHandler } from '../../store/teardown-registry';
import type { BoardState, NodeId } from '../../types';

/**
 * The setup toolkit's tool vocabulary. Widen this union (and
 * `applyToolAt`'s switch below) to add a tool — never a bare string
 * threaded through the palette and the click handler separately,
 * which would let the two drift (ADR-0012 P1).
 */
export type SetupTool = 'stone-black' | 'stone-white' | 'triangle';

/**
 * Shared i18n key per tool — single source so a persistent mode
 * indicator (StatusBar.vue's `.setup-mode-chip`, M8(b), menus-ui
 * audit row 1291) and the palette's own tool buttons
 * (SetupToolPalette.vue) never drift on the tool→label mapping.
 */
export const SETUP_TOOL_LABEL_KEYS: Readonly<Record<SetupTool, string>> = {
  'stone-black': 'toolbar.setupToolkit.stoneBlack',
  'stone-white': 'toolbar.setupToolkit.stoneWhite',
  'triangle':    'toolbar.setupToolkit.triangle',
};

// Module-scope, not per-component-instance: see file header.
const activeTool: Ref<SetupTool | null> = ref(null);
const paletteOpen: Ref<boolean> = ref(false);

/**
 * Select (or, on a repeat click, deselect) a tool. Selecting a tool
 * does not by itself open or close the palette — the palette's own
 * open/close is `togglePalette`'s job — so a tool pick inside an
 * already-open palette just swaps which tool is armed.
 */
function selectTool(tool: SetupTool): void {
  activeTool.value = activeTool.value === tool ? null : tool;
}

/**
 * The toolbar button's click handler: open ↔ close the palette.
 * Closing — by this toggle OR by `closePalette` (ESC / outside-click)
 * below — ALWAYS deselects the active tool ("closing auto-deselects
 * any tool and returns to normal mode", the commission's exact
 * interaction spec) so a stray board click after the palette closes
 * can never silently place a leftover setup stone.
 */
function togglePalette(): void {
  paletteOpen.value = !paletteOpen.value;
  if (!paletteOpen.value) activeTool.value = null;
}

/** ESC / outside-click dismiss path — same deselect-on-close contract as `togglePalette`. */
function closePalette(): void {
  paletteOpen.value = false;
  activeTool.value = null;
}

// Resource-ownership-at-mutation-sites (frontend/CLAUDE.md): `activeTool` /
// `paletteOpen` are module-scope state that outlives any one component, so
// an identity flip (`resetWorkspace`) must release it explicitly — a stale
// armed tool surviving into a freshly-loaded identity's workspace is a
// (low-severity, UI-only) cross-identity leak of the same SHAPE the
// registry's other handlers exist to close, even though the CONSEQUENCE
// here is cosmetic rather than a data leak. Registered once at module
// init, mirroring every other owner in this file's import (`store/
// teardown-registry.ts`'s header names the inversion this achieves).
registerWorkspaceResetHandler({
  label: 'setup-tools:close-palette',
  run: () => closePalette(),
});

/**
 * Apply the currently-armed tool at board coordinate (x, y) against
 * the active board, persist the result through the same
 * `updateBoardState` channel `applyGoMove`'s callers use (board-
 * content mutation; already covered by SyncService's `boardsVersion`
 * save-coverage — no new persistence wiring needed), and invalidate
 * the affected node(s)' cached thumbnail snapshot per `applySetup`'s
 * and `applyMarkup`'s documented caller obligation.
 *
 * No-op (returns false) when no tool is armed or there is no active
 * board — the caller (BoardWidget) uses the boolean to decide whether
 * to fall through to normal move routing.
 */
function applyToolAt(x: number, y: number): boolean {
  const tool = activeTool.value;
  const board: BoardState | null = activeBoard.value;
  if (!tool || !board) return false;

  let next: BoardState;
  let invalidated: NodeId[];
  if (tool === 'triangle') {
    next = applyMarkup(board, x, y, 'TR');
    invalidated = [board.currentNodeId];
  } else {
    next = applySetup(board, x, y, tool === 'stone-black' ? 'B' : 'W');
    invalidated = collectSubtreeIds(board.nodes, board.currentNodeId);
  }

  updateBoardState(store.activeBoardIndex, next);
  invalidateNodeSnapshots(invalidated);
  return true;
}

export interface SetupToolsHandle {
  readonly activeTool: Ref<SetupTool | null>;
  readonly paletteOpen: Ref<boolean>;
  selectTool: (tool: SetupTool) => void;
  togglePalette: () => void;
  closePalette: () => void;
  applyToolAt: (x: number, y: number) => boolean;
}

export function useSetupTools(): SetupToolsHandle {
  return { activeTool, paletteOpen, selectTool, togglePalette, closePalette, applyToolAt };
}
