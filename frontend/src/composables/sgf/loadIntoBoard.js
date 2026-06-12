/**
 * src/composables/sgf/loadIntoBoard.ts
 *
 * `loadSgfIntoBoard` — parse an SGF body, write it into an *existing*
 * target board (overwrite), and navigate to the active variation's leaf.
 * The bare load primitive, with no dirty-board / confirm-modal policy on
 * top: callers that need the guard wrap it (see
 * `composables/board/useDirtyBoardGuard.ts`); callers that drive headless
 * (the performance-scenario context, the future autonomous-loop runner)
 * call it directly.
 *
 * Distinguished from `useSgfLoader` (which *adds* a new board from a file
 * pick) — this writes into a board that already exists, by id.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). It speaks `BoardState`,
 * `NodeId`, and the navigator — game-tree vocabulary — but no Go rules.
 *
 * Fail-loud (ADR-0002): parse / load errors propagate, and a missing
 * target board throws rather than silently no-op'ing. The dirty-board
 * guard deliberately swallows-and-logs at its own call site (a parse
 * failure there must not reopen the modal); a headless driver wants the
 * failure to surface. Keeping the primitive honest and letting each
 * caller choose its error posture is the correct split.
 *
 * License: Public Domain (The Unlicense)
 */
// @ts-ignore — @sabaki/sgf has no published types
import sgf from '@sabaki/sgf';
import { store, updateBoardState, mutateBoard } from '../../store';
import { loadSgf } from '../../engine/sgf-loader';
import { navigateTo } from '../../engine/navigator';
import { getActiveVariationPath } from '../../engine/util';
/**
 * Parse `sgfContent`, write it into the board identified by
 * `targetBoardId`, and walk the cursor to the active variation's leaf.
 * The optional `stamp` callback mutates the parsed board before commit —
 * used to attach load-specific provenance (`sourceCardId` for cards,
 * `clientGameId` for library games).
 *
 * Throws if `targetBoardId` is not present in the store, or if the SGF
 * fails to parse (ADR-0002).
 */
export function loadSgfIntoBoard(targetBoardId, sgfContent, stamp) {
    const sabakiTrees = sgf.parse(sgfContent);
    const parsedBoard = loadSgf(sabakiTrees);
    // `BoardState.id` is a mutable `BoardId`; both sides are branded
    // `BoardId`, so the re-id is assignment, not a cast.
    parsedBoard.id = targetBoardId;
    stamp?.(parsedBoard);
    const idx = store.boards.findIndex(b => b.id === targetBoardId);
    if (idx === -1) {
        throw new Error(`loadSgfIntoBoard: target board ${targetBoardId} not found in store`);
    }
    updateBoardState(idx, parsedBoard);
    // Root→leaf is the genuine shape: walk the cursor to the end of the
    // loaded SGF's active line. Branded by the producer; the former
    // `as NodeId` re-cast on the element is retired.
    const path = getActiveVariationPath(parsedBoard);
    const leafId = path[path.length - 1];
    mutateBoard(targetBoardId, draft => navigateTo(draft, leafId));
}
