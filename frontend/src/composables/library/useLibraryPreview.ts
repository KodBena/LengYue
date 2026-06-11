/**
 * src/composables/library/useLibraryPreview.ts
 *
 * Owns the Library's preview pane: selected-row state, lazy
 * fetch of the full SGF body, parsed board for rendering, and
 * scrub state for the mini-board's move slider.
 *
 * Component writes `selectedRow` (typically wired to a row-click
 * in the virtual-scrolled table). The composable watches the
 * change, fetches the corresponding `LibraryGame` via
 * `libraryService.getGame`, parses its `rawContent` once, and
 * exposes:
 *
 *   - `selectedGame`: the full row (metadata + raw_content),
 *     null until the fetch resolves.
 *   - `parsedBoard`: a `BoardState` mutated in-place to the
 *     scrub position. Components reading this re-trigger when
 *     the user moves the slider; the mini-board widget renders
 *     `parsedBoard.stones` at whatever node `parsedBoard.currentNodeId`
 *     points to.
 *   - `variationPath`: root → leaf along the main line; the
 *     slider's domain is `[0, variationPath.length - 1]`.
 *   - `scrubPosition`: index into `variationPath`. Writing it
 *     navigates the parsed board to that node.
 *
 * Generation counter protects against races: rapid selection
 * changes (the user arrow-keying through the list) cause
 * earlier fetches to be discarded on completion if a newer
 * selection has already fired.
 *
 * License: Public Domain (The Unlicense)
 */

// @ts-ignore — @sabaki/sgf has no published types
import sgf from '@sabaki/sgf';
import { computed, ref, shallowReadonly, shallowRef, triggerRef, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { libraryService } from '../../services/library-service';
import { loadSgf } from '../../engine/sgf-loader';
import { navigateTo } from '../../engine/navigator';
import { getActiveVariationPath } from '../../engine/util';
import type {
  BoardState,
  GameSourceId,
  LibraryGame,
  LibraryGameListItem,
  NodeId,
} from '../../types';

export interface LibraryPreview {
  /** Selected row in the list. Writable — components v-model this. */
  readonly selectedRow: Ref<LibraryGameListItem | null>;

  /**
   * Full row (with rawContent) for the selected entry. `null`
   * when no selection OR while the fetch is in flight.
   */
  readonly selectedGame: Readonly<Ref<LibraryGame | null>>;

  /**
   * Parsed board, mutated in-place to the scrub position. The
   * mini-board widget renders this directly — `stones`, captures,
   * koPoint reflect the position at `parsedBoard.currentNodeId`.
   * `null` until the SGF parse completes.
   */
  readonly parsedBoard: Readonly<Ref<BoardState | null>>;

  /**
   * Root → leaf node ids along the main variation. The slider's
   * domain is `[0, variationPath.length - 1]`. Empty when no
   * board parsed yet.
   */
  readonly variationPath: Readonly<Ref<readonly NodeId[]>>;

  /**
   * Scrub position — index into `variationPath`. Writing
   * navigates the parsed board to that node. Clamped to a valid
   * range on write.
   */
  readonly scrubPosition: Ref<number>;

  /** `variationPath.length - 1` — the slider's max value. */
  readonly totalMoves: ComputedRef<number>;

  /** `true` while a getGame fetch is in flight. */
  readonly loading: Readonly<Ref<boolean>>;

  /**
   * Fetch a full `LibraryGame` by id, bypassing the selection watcher —
   * for open-on-board paths that need the game in hand without racing
   * `selectedRow`. The same call the watcher uses; keeps the
   * `libraryService` import inside the composable so components don't
   * cross the effectful-service boundary (frontend CLAUDE.md layering).
   */
  fetchGame(id: GameSourceId): Promise<LibraryGame | null>;
}

export function useLibraryPreview(): LibraryPreview {
  const selectedRow = ref<LibraryGameListItem | null>(null);
  const selectedGame = ref<LibraryGame | null>(null);
  // shallowRef for the parsed board — we mutate it in-place during
  // scrubbing rather than reactively rebuilding, but the component
  // reads `parsedBoard.value.stones` and friends. ShallowRef means
  // we don't deep-track every cell; we explicitly trigger by
  // reassigning when the parse completes or selection clears.
  const parsedBoard = shallowRef<BoardState | null>(null);
  const variationPath = ref<readonly NodeId[]>([]);
  const scrubPosition = ref(0);
  const loading = ref(false);

  // Generation counter — see useLibraryQuery for the same pattern.
  // Rapid selection changes (arrow-key scrubbing through a list)
  // could have multiple getGame fetches in flight; only the most
  // recent one's result is committed.
  let generation = 0;

  // When the selection changes, fetch + parse the new SGF and
  // reset scrub to 0.
  watch(selectedRow, async (row) => {
    if (row === null) {
      selectedGame.value = null;
      parsedBoard.value = null;
      variationPath.value = [];
      scrubPosition.value = 0;
      return;
    }
    generation++;
    const myGen = generation;
    loading.value = true;
    try {
      const game = await libraryService.getGame(row.id);
      if (myGen !== generation) return;  // newer selection superseded us
      selectedGame.value = game;
      if (game === null) {
        parsedBoard.value = null;
        variationPath.value = [];
        scrubPosition.value = 0;
        return;
      }
      try {
        const sabakiTrees = sgf.parse(game.rawContent);
        const board = loadSgf(sabakiTrees);
        // Root→leaf is the genuine shape: the scrubber spans the whole
        // game line. The exposed `variationPath` ref stays a plain
        // `readonly NodeId[]` (its empty-state writes would otherwise
        // need brand mints); the shape is recorded here at the fill
        // site instead.
        const path = getActiveVariationPath(board);
        // Start at the root so the user sees the empty board first
        // and moves through. The component can override via
        // scrubPosition write if it prefers a different default.
        if (path.length > 0) {
          navigateTo(board, path[0]);
        }
        if (myGen !== generation) return;
        parsedBoard.value = board;
        variationPath.value = path;
        scrubPosition.value = 0;
      } catch (err) {
        // Bad SGF — render a placeholder; the underlying library
        // row was successfully fetched, only the parse failed.
        // Surface to the console per the existing useSgfLoader
        // pattern.
        console.error('[useLibraryPreview] SGF parse failed:', err);
        parsedBoard.value = null;
        variationPath.value = [];
        scrubPosition.value = 0;
      }
    } finally {
      if (myGen === generation) loading.value = false;
    }
  });

  // When the scrub position changes, navigate the parsed board.
  // The shallowRef's value identity stays the same after an in-place
  // mutation, so a `parsedBoard.value = parsedBoard.value` self-
  // assign would no-op (Vue 3.5's ref setter does an `Object.is`
  // check and skips the trigger when old === new). `triggerRef`
  // is the documented primitive for forcing dependents to re-run
  // against a shallowRef whose internal state has been mutated.
  watch(scrubPosition, (pos) => {
    const board = parsedBoard.value;
    const path = variationPath.value;
    if (board === null || path.length === 0) return;
    const clamped = Math.max(0, Math.min(pos, path.length - 1));
    navigateTo(board, path[clamped]);
    triggerRef(parsedBoard);
  });

  const totalMoves = computed(() =>
    Math.max(0, variationPath.value.length - 1),
  );

  function fetchGame(id: GameSourceId): Promise<LibraryGame | null> {
    return libraryService.getGame(id);
  }

  return {
    selectedRow,
    selectedGame: shallowReadonly(selectedGame),
    parsedBoard: shallowReadonly(parsedBoard),
    variationPath: shallowReadonly(variationPath),
    scrubPosition,
    totalMoves,
    loading: shallowReadonly(loading),
    fetchGame,
  };
}
