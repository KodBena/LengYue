/**
 * src/composables/cards/useCardThumbnail.ts
 * Memoized SGF-to-SVG renderer for flashcard tooltips. Designed to
 * execute synchronously inside ECharts tooltip formatters; the
 * module-scope cache makes the second-and-later renders of a card
 * O(1).
 *
 * Cache lifetime is identity-scoped, not session-scoped: the
 * `clearCardThumbnailCache` export below is invoked from
 * `resetWorkspace` on identity flip (logout, identity change). The
 * cache key is the raw `CardId` integer, which auto-increments
 * per-tenant on the backend — without the identity-flip clear, a
 * collision on the same numeric id between two users would serve
 * the prior user's card render to the next user. Clearing on
 * identity flip closes that path.
 *
 * License: Public Domain (The Unlicense)
 */

// @ts-ignore
import sgf from '@sabaki/sgf';
import { loadSgf } from '../../engine/sgf-loader';
import { getActiveVariationPath, getBoardSize } from '../../engine/util';
import { renderBoardToSvg } from '../../engine/board-renderer';
import { navigateTo } from '../../engine/navigator';
import type { CardId } from '../../types';

const cache = new Map<CardId, string>();

/**
 * Drop every cached card thumbnail. Called from `resetWorkspace` on
 * identity flip so the next user's session doesn't serve the prior
 * user's renders for collision-prone integer CardIds. Safe to call
 * unconditionally — `Map.clear()` on an empty cache is a no-op.
 */
export function clearCardThumbnailCache(): void {
  cache.clear();
}

/**
 * Parses a standalone SGF, plays it to the end, and returns an SVG
 * string. Result is cached by Card ID for the lifetime of the
 * current identity; see file header for the identity-flip clear
 * contract.
 */
export function getCardThumbnailSync(cardId: CardId, cardSgf: string): string {
  if (cache.has(cardId)) {
    return cache.get(cardId)!;
  }

  try {
    const trees = sgf.parse(cardSgf);
    const board = loadSgf(trees);
    // Root→leaf is the genuine shape: the thumbnail renders the card's
    // final position. Branded by the producer; the former `as NodeId`
    // re-cast on the element is retired.
    const path = getActiveVariationPath(board);

    const leafId = path[path.length - 1];
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
    return `<div style="color:red; font-size:var(--text-body);">Render Error</div>`;
  }
}
