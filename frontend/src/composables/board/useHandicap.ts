/**
 * src/composables/board/useHandicap.ts
 *
 * The handicap affordance's panel state and apply orchestration (wiki
 * Mechanics #4, "No handicap setup support"). Wires the pure
 * `applyHandicap` primitive (`src/engine/handicap.ts`) to the active
 * board through the SAME store-update channel the setup toolkit uses
 * (`updateBoardState` — see `useSetupTools.ts`), and turns
 * `HandicapOnStartedGameError` into a loud, user-visible system
 * message (ADR-0002) instead of an unhandled exception.
 *
 * Module-scope singleton for `panelOpen`, mirroring `useSetupTools.ts`:
 * the trigger row inside `SetupToolPalette.vue` and the `HandicapPanel.vue`
 * it reveals are two different components that must observe the SAME
 * open/closed state, and there is exactly one palette visible at a
 * time. See `useSetupTools.ts`'s header for the fuller rationale
 * (session-local UI ephemera, no store/schema footprint).
 *
 * ADR-0003 band: [B2] (game-tree-coupled — reaches into `BoardState`
 * and the SGF-property vocabulary via `applyHandicap`, but carries no
 * rendering or wire-protocol logic of its own).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { applyHandicap, validHandicapCounts, HandicapOnStartedGameError } from '../../engine/handicap';
import { getBoardSize } from '../../engine/util';
import { store, activeBoard, updateBoardState, pushSystemMessage } from '../../store';
import { invalidateNodeSnapshots } from '../cards/thumbnail-render-resources';
import { registerWorkspaceResetHandler } from '../../store/teardown-registry';
import { i18n } from '../../i18n';

// Module-scope, not per-component-instance — see file header.
const panelOpen: Ref<boolean> = ref(false);

function togglePanel(): void {
  panelOpen.value = !panelOpen.value;
}

function closePanel(): void {
  panelOpen.value = false;
}

// Resource-ownership-at-mutation-sites (frontend/CLAUDE.md): `panelOpen`
// is module-scope state that outlives any one component, so an identity
// flip (`resetWorkspace`) must release it explicitly — same shape and
// same (cosmetic, UI-only) consequence class as `useSetupTools.ts`'s
// own registration right above this file's precedent.
registerWorkspaceResetHandler({
  label: 'handicap:close-panel',
  run: () => closePanel(),
});

/**
 * The handicap counts selectable for the ACTIVE board's current size,
 * `[]` when there is no active board or its size has no handicap table
 * (`engine/handicap.ts`'s documented scope: 19×19, 13×13, 9×9 only) —
 * the panel renders no buttons and the trigger can disable itself off
 * this list being empty.
 */
function useAvailableCounts(): ComputedRef<number[]> {
  return computed(() => {
    const board = activeBoard.value;
    if (!board) return [];
    return validHandicapCounts(getBoardSize(board));
  });
}

/**
 * Applies an N-stone handicap to the active board. Returns `true` on
 * success (and closes the panel — the palette's own close, per
 * `SetupToolPalette.vue`'s existing click-outside/ESC contract,
 * additionally deselects any armed setup-toolkit tool, but that is
 * unrelated to and unaffected by this call). Returns `false` when
 * there is no active board, `n` is not valid for the board's size, or
 * `applyHandicap` refuses because the game has already started — in
 * every refusal case a `pushSystemMessage('warning', …)` names why, so
 * the caller never needs to duplicate that messaging.
 */
function selectHandicap(n: number): boolean {
  const board = activeBoard.value;
  if (!board) return false;

  const size = getBoardSize(board);
  if (!validHandicapCounts(size).includes(n)) {
    pushSystemMessage('warning', i18n.global.t('toolbar.setupToolkit.handicapInvalidCount', { n, size }));
    return false;
  }

  try {
    const next = applyHandicap(board, size, n);
    updateBoardState(store.activeBoardIndex, next);
    // Handicap rewrites the root's AB set — same caller obligation
    // `applySetup` documents (thumbnail cache invalidation). The root
    // has no children by construction here (applyHandicap's own
    // guard), so invalidating the root alone covers every affected
    // snapshot.
    invalidateNodeSnapshots([next.rootNodeId]);
    closePanel();
    return true;
  } catch (err) {
    if (err instanceof HandicapOnStartedGameError) {
      pushSystemMessage('warning', i18n.global.t('toolbar.setupToolkit.handicapRefusedStarted'));
      return false;
    }
    throw err; // an unexpected error is a real bug — ADR-0002, don't swallow it
  }
}

export interface HandicapHandle {
  readonly panelOpen: Ref<boolean>;
  readonly availableCounts: ComputedRef<number[]>;
  togglePanel: () => void;
  closePanel: () => void;
  selectHandicap: (n: number) => boolean;
}

export function useHandicap(): HandicapHandle {
  return { panelOpen, availableCounts: useAvailableCounts(), togglePanel, closePanel, selectHandicap };
}
