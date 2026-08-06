/**
 * src/composables/useNavigation.ts
 * Headless Controller for Board Navigation.
 * Provides pure domain actions for moving within the Game Tree.
 */

import { activeBoard, mutateBoard, pushSystemMessage } from '../store';
import { registerBoardCloseHandler, registerWorkspaceResetHandler } from '../store/teardown-registry';
import {
  navigateNext,
  navigatePrev,
  navigateVariation,
  navigateTo,
  navigateToggleMainLine,
} from '../engine/navigator';
import type { BranchSwitchOutcome } from '../engine/navigator';
import { getActiveVariationPath } from '../engine/util';
import { i18n } from '../i18n';
import type { BoardId, NodeId } from '../types';

/**
 * Surfaces a `BranchSwitchOutcome`'s `false` case through the existing
 * `pushSystemMessage` transient-log idiom (L4 — identity-with-
 * feedback: `navigateVariation`/`navigateToggleMainLine` return WHY
 * they no-opped rather than silently returning, and the caller's job
 * is to make that visible; a console-only signal is not enough for a
 * user-triggered keybinding — see the nav-algebra diagnosis,
 * `.claude/dispatch-reports/nav-algebra-diagnosis.md`, §3 L4). `'info'`
 * (not `'warning'`/`'error'`) because both reasons are expected
 * boundary conditions of ordinary navigation, not anomalies — the same
 * severity `sgf.saved` and `sync.workspaceLoaded` use for "this
 * completed, here's the fact" notices.
 */
function surfaceBranchSwitchNoOp(outcome: BranchSwitchOutcome): void {
  if (outcome.ok) return;
  const key = outcome.reason === 'no-fork' ? 'nav.branchSwitchNoFork' : 'nav.branchSwitchBoundary';
  pushSystemMessage('info', i18n.global.t(key));
}

// Module-scope: the toggle-history `navigateToggleMainLine` reads and
// writes, keyed `${boardId}::${forkNodeId}` inside that function.
// Shared across every `useNavigation()` call site (TreeWidget,
// BoardWidget, the keybindings catalog, autonav) deliberately — the
// toggle is a per-board-per-fork history, not a per-caller one.
// Mirrors the module-scope `pendingAnalysisAborts` map in
// `useReviewSession.ts` (see `tests/CLAUDE.md`'s "Module-scope state
// in composables" gotcha) — including that precedent's resource-
// ownership discipline: `pendingAnalysisAborts` is actively deleted
// per-`BoardId` at close/abort/finalize sites, so this Map gets the
// same treatment below rather than being left to leak (review nit,
// 2026-08-06 — the original PR cited the precedent but didn't
// actually wire the matching cleanup).
const mainLineToggleMemory = new Map<string, number>();

/**
 * Drop every `mainLineToggleMemory` entry belonging to `boardId`
 * (keys are `${boardId}::${forkNodeId}`, minted in
 * `navigateToggleMainLine`, `engine/navigator.ts`). Without this, a
 * closed board's fork-toggle history survives forever in this
 * module-scope Map — a bounded but real per-board leak (one
 * `string -> number` entry per fork ever visited on the closed
 * board), the exact resource-ownership-at-mutation-sites class
 * `frontend/CLAUDE.md` names. Registered as a `closeBoard` teardown
 * handler below; exported so it (and the registration) can be
 * exercised directly in tests without depending on keydown/component
 * wiring.
 */
export function clearMainLineToggleMemoryForBoard(boardId: BoardId): void {
  const prefix = `${boardId}::`;
  for (const key of mainLineToggleMemory.keys()) {
    if (key.startsWith(prefix)) mainLineToggleMemory.delete(key);
  }
}

/**
 * Test-only inspector — NOT part of the composable's UI-facing
 * surface. `mainLineToggleMemory` itself is deliberately not
 * exported (a mutable Map handed to arbitrary importers would invite
 * writes from outside `navigateToggleMainLine`); this narrow count
 * lets a test assert "the closing board's entries are gone" without
 * that exposure. Mirrors the shape of testing `pendingAnalysisAborts`
 * cleanup only through `abortBoardReview`'s observable effects in
 * `useReviewSession.ts` — here a direct count is clearer than an
 * indirect behavioural proxy would be, since there is no UI-facing
 * "is this fork's toggle history present" query to route through.
 */
export function _mainLineToggleMemoryKeyCountForBoard(boardId: BoardId): number {
  const prefix = `${boardId}::`;
  let count = 0;
  for (const key of mainLineToggleMemory.keys()) {
    if (key.startsWith(prefix)) count++;
  }
  return count;
}

// ── Teardown registration (ADR-0012 dependency inversion) ────────────────────
// `store/index.ts` no longer imports composables to drive closeBoard's
// cleanup (see `teardown-registry.ts`'s header); this module registers
// its own handler instead, loaded via the `teardown-registrations.ts`
// bootstrap (mirrors `useReviewSession.ts`'s `review:abort`
// registration — same pattern, same file). Order-independent
// (DEFAULT band): this Map holds no external resource another
// handler's ordering could race against, just local bookkeeping.
registerBoardCloseHandler({
  label: 'nav:clear-toggle-memory',
  run: (boardId) => clearMainLineToggleMemoryForBoard(boardId),
});
// Identity flip: drop every board's toggle history wholesale, the same
// class of cleanup `review:abort-all` does for `pendingAnalysisAborts`
// (frontend/CLAUDE.md's checklist names both closeBoard AND
// resetWorkspace as mutation sites an entity's owner must release
// resources at — this extends the closeBoard fix to the sibling site
// rather than leaving resetWorkspace's identity flip to leak every
// still-open board's entries).
registerWorkspaceResetHandler({
  label: 'nav:clear-toggle-memory-all',
  run: () => mainLineToggleMemory.clear(),
});

export function useNavigation() {
  const next = () => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigateNext(draft));
    }
  };

  const prev = () => {
    if (activeBoard.value) {
      mutateBoard(activeBoard.value.id, draft => navigatePrev(draft));
    }
  };

  const variation = (dir: number) => {
    if (!activeBoard.value) return;
    let outcome: BranchSwitchOutcome | undefined;
    mutateBoard(activeBoard.value.id, draft => { outcome = navigateVariation(draft, dir); });
    if (outcome) surfaceBranchSwitchNoOp(outcome);
  };

  // Jump to the first node of the active variation path (the root).
  // Home-key + UI affordance for "go to the beginning of the game."
  const home = () => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => {
      const path = getActiveVariationPath(draft);
      if (path.length > 0) navigateTo(draft, path[0]);
    });
  };

  // Jump to the last node of the active variation path (the leaf
  // along the user-selected line). End-key + UI affordance for
  // "go to the latest position on this line."
  const end = () => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => {
      const path = getActiveVariationPath(draft);
      if (path.length > 0) navigateTo(draft, path[path.length - 1]);
    });
  };

  // Generic per-node navigation, used by the shift-click handler in
  // BoardWidget that resolves a clicked vertex to a placement node
  // via `findPlacementOnActivePath`. Caller is responsible for
  // ensuring the target node exists on the active board's tree —
  // `navigateTo` will silently no-op on `currentNodeId === target`
  // but throws on a missing node.
  const goTo = (nodeId: NodeId) => {
    if (!activeBoard.value) return;
    mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
  };

  // "Toggle main line variation" — switch the active line at the
  // nearest ancestor fork between the two most recent choices there,
  // and back. See `navigateToggleMainLine`'s docstring (`engine/navigator.ts`)
  // for the fork-search and toggle-memory semantics, and its
  // ambiguity note for the reading this implements.
  const toggleMainLine = () => {
    if (!activeBoard.value) return;
    let outcome: BranchSwitchOutcome | undefined;
    mutateBoard(activeBoard.value.id, draft => {
      outcome = navigateToggleMainLine(draft, mainLineToggleMemory);
    });
    if (outcome) surfaceBranchSwitchNoOp(outcome);
  };

  return { next, prev, variation, home, end, goTo, toggleMainLine };
}
