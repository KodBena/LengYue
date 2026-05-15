/**
 * src/composables/sgf/useSgfLoader.ts
 * Self-contained SGF file-loading composable.
 *
 * ## Contract
 * Exposes a single action: `openFileDialog()`. Calling it creates a
 * transient `<input type="file">` element, opens the OS file picker,
 * reads the selected file, parses the SGF, and pushes the resulting
 * board into the store — then destroys itself.
 *
 * The transient-element pattern keeps the composable fully self-contained:
 * it requires no template ref, no `<input>` in App.vue's markup, and no
 * lifecycle coupling to any parent component.
 *
 * License: Public Domain (The Unlicense)
 */

// @ts-ignore — @sabaki/sgf has no type declarations
import sgf from '@sabaki/sgf';
import { loadSgf } from '../../engine/sgf-loader';
import { navigateTo } from '../../engine/navigator';
import { getActiveVariationPath } from '../../engine/util';
import { addBoard, store } from '../../store';

// ── Public contract ───────────────────────────────────────────────────────────

export interface SgfLoaderActions {
  /** Opens the OS file picker and loads the selected SGF into the store. */
  openFileDialog: () => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSgfLoader(): SgfLoaderActions {
  async function loadFile(file: File): Promise<void> {
    try {
      const content = await file.text();
      const sabakiTrees = sgf.parse(content);
      const newBoard = loadSgf(sabakiTrees);
      // Stamp the source filename onto the board. `loadSgf` lives in
      // `engine/` and doesn't see the File API — this composable is the
      // boundary where the user's chosen filename is observable. Read
      // by `resolveGameName` (`engine/util.ts`) as the third rung of
      // the description fallback ladder. The raw filename (with
      // extension) is stored; the ladder strips `.sgf` for display.
      newBoard.sourceFileName = file.name;
      // Optional post-walk to the leaf of the active variation: when
      // the user has opted in via `session.ui.loadSgfAtLastNode`, the
      // freshly-loaded board cursor lands on the final mainline
      // position rather than the root. Scoped to file uploads only —
      // card-load (`useDirtyBoardGuard.handleLoadCard`) and review-
      // session (`useReviewSession.loadCard`) flows start at the
      // card's recorded position by intent, and we don't want to
      // override that with a "load at last node" rule.
      if (store.session.ui.loadSgfAtLastNode) {
        const path = getActiveVariationPath(newBoard);
        if (path.length > 0) navigateTo(newBoard, path[path.length - 1]);
      }
      addBoard(newBoard);
    } catch (err) {
      console.error('[useSgfLoader] Failed to load SGF:', err);
    }
  }

  function openFileDialog(): void {
    // A transient input element: created on demand, garbage-collected after use.
    // This avoids any template coupling — the composable owns its entire lifecycle.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sgf';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) void loadFile(file);
    };
    input.click();
  }

  return { openFileDialog };
}
