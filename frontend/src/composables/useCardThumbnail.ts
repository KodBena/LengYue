/**
 * src/composables/useCardThumbnail.ts
 * Pure, memoized SGF to SVG renderer for Flashcard Tooltips.
 * Designed to execute synchronously inside ECharts tooltip formatters.
 * License: Public Domain (The Unlicense)
 */

// @ts-ignore
import sgf from '@sabaki/sgf';
import { loadSgf } from '../engine/sgf-loader';
import { getActiveVariationPath, getBoardSize } from '../engine/util';
import { renderBoardToSvg } from '../engine/board-renderer';
import { navigateTo } from '../engine/navigator';
import type { NodeId } from '../types';

const cache = new Map<number, string>();

/**
 * Parses a standalone SGF, plays it to the end, and returns an SVG string.
 * Result is permanently cached by Card ID.
 */
export function getCardThumbnailSync(cardId: number, cardSgf: string): string {
  if (cache.has(cardId)) {
    return cache.get(cardId)!;
  }

  try {
    const trees = sgf.parse(cardSgf);
    const board = loadSgf(trees);
    const path = getActiveVariationPath(board);
    
    const leafId = path[path.length - 1] as NodeId;
    navigateTo(board, leafId);
    
    const size = getBoardSize(board);
    const svg = renderBoardToSvg({
      size,
      stones: board.stones,
      lastMove: board.nodes[leafId].move,
      showMarker: true,
      uid: `card-${cardId}`
    });

    cache.set(cardId, svg);
    return svg;
  } catch (err) {
    console.error(`[ThumbnailCache] Failed to render Card ${cardId}:`, err);
    return `<div style="color:red; font-size:10px;">Render Error</div>`;
  }
}
