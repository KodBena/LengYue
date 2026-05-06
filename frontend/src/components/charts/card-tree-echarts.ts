/**
 * src/components/charts/card-tree-echarts.ts
 *
 * Pure adapter: render-side `RenderNode` → ECharts tree-series node
 * shape, plus the tooltip formatter. Sibling helper for
 * `CardTreeWidget.vue`; kept here so the SFC stays under the
 * ADR-0007 line budget.
 *
 * License: Public Domain (The Unlicense)
 */

import type { CardId, ForestStat, ReviewCard } from '../../types';
import type { RenderNode, RenderTree } from '../../composables/useCardTreeProjection';
import { getCardThumbnailSync } from '../../composables/useCardThumbnail';
import { themeColor } from '../../utils/theme-color';

// Per-node payload travelled with each ECharts datum. Click and
// hover handlers read this back to dispatch the right behaviour
// (expand / load-card / etc.).
export type NodePayload =
  | { kind: 'card'; cardId: CardId; role: 'active' | 'context' }
  | { kind: 'stub'; cardId: CardId }
  | { kind: 'bucket'; bucketId: string; parentCardId: CardId };

export interface EChartsTreeNode {
  name: string;
  children?: EChartsTreeNode[];
  itemStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
  symbolSize?: number;
  payload: NodePayload;
}

// Palette: cyan accent (--accent-primary) is the codebase's primary;
// cold nodes sit in the chrome substrate's surface tones. Stub
// borders pick up the active accent when their head card is in the
// active set — the spec's 4-role partition is preserved (the role
// stays 'stub') but the visual signal "matched but summarized" is
// recoverable. Read at use time via themeColor() so the values track
// theme.css changes.
const colors = {
  get active()             { return themeColor('--accent-primary'); },
  get activeBorder()       { return themeColor('--text-0'); },
  get context()            { return themeColor('--surface-3'); },
  get contextBorder()      { return themeColor('--text-2'); },
  get stub()               { return themeColor('--surface-2'); },
  get stubBorder()         { return themeColor('--border-3'); },
  get stubActiveBorder()   { return themeColor('--accent-primary'); },
  get bucket()             { return themeColor('--surface-0'); },
  get bucketBorder()       { return themeColor('--border-2'); },
};

export function toEChartsNode(node: RenderNode): EChartsTreeNode {
  if (node.kind === 'card') {
    return {
      name: `Card ${node.cardId}`,
      payload: { kind: 'card', cardId: node.cardId, role: node.role },
      symbolSize: node.role === 'active' ? 12 : 8,
      itemStyle: {
        color: node.role === 'active' ? colors.active : colors.context,
        borderColor:
          node.role === 'active' ? colors.activeBorder : colors.contextBorder,
        borderWidth: node.role === 'active' ? 2 : 1,
      },
      children: node.children.map(toEChartsNode),
    };
  }
  if (node.kind === 'stub') {
    return {
      name: `+${node.subtreeSize}`,
      payload: { kind: 'stub', cardId: node.cardId },
      symbolSize: 9,
      itemStyle: {
        color: colors.stub,
        borderColor: node.isHeadActive
          ? colors.stubActiveBorder
          : colors.stubBorder,
        borderWidth: node.isHeadActive ? 1.5 : 1,
        borderType: 'dashed',
      },
      label: {
        show: true,
        position: 'right',
        color: themeColor('--text-2'),
        fontSize: 10,
        formatter: `+${node.subtreeSize}`,
      },
    };
  }
  return {
    name: `×${node.childCardIds.length}`,
    payload: {
      kind: 'bucket',
      bucketId: node.bucketId,
      parentCardId: node.parentCardId,
    },
    symbolSize: 7,
    itemStyle: {
      color: colors.bucket,
      borderColor: colors.bucketBorder,
      borderWidth: 1,
      borderType: 'dotted',
    },
    label: {
      show: true,
      position: 'right',
      color: themeColor('--text-2'),
      fontSize: 10,
      formatter: `×${node.childCardIds.length}`,
    },
  };
}

/**
 * Tooltip HTML for one node. The card branch reuses
 * `getCardThumbnailSync` (sync, memoized) when the card is hydrated;
 * shows a "Loading…" placeholder otherwise. The widget re-renders
 * the chart when the cards map updates, so a subsequent hover
 * picks up the freshly-rendered SVG.
 */
export function tooltipFor(
  payload: NodePayload,
  cards: ReadonlyMap<CardId, ReviewCard>,
): string {
  const cText1 = themeColor('--text-1');
  const cText2 = themeColor('--text-2');
  const cAccent = themeColor('--accent-primary');
  const cBorder2 = themeColor('--border-2');
  const cSurface0 = themeColor('--surface-0');
  if (payload.kind === 'stub') {
    return `<div style="padding:6px; font-size:var(--text-emphasis); color:${cText1};">
      <b style="color:${cAccent};">Card ${payload.cardId}</b><br/>
      <span style="color:${cText2};">Subtree summary — click to expand.</span>
    </div>`;
  }
  if (payload.kind === 'bucket') {
    return `<div style="padding:6px; font-size:var(--text-emphasis); color:${cText1};">
      <b style="color:${cAccent};">Bucket of cold leaves</b><br/>
      <span style="color:${cText2};">Click to expand individual cards.</span>
    </div>`;
  }
  const card = cards.get(payload.cardId);
  if (!card) {
    return `<div style="padding:6px; font-size:var(--text-emphasis); color:${cText2};">
      <b style="color:${cAccent};">Card ${payload.cardId}</b><br/>
      Loading…
    </div>`;
  }
  // The cardId widening matches LineageTreeChart's existing pattern;
  // `getCardThumbnailSync` keys its memo cache by raw number.
  const svg = getCardThumbnailSync(card.id as unknown as number, card.sgf);
  const ebisuT = card.model.t.toFixed(4);
  return `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="font-weight:bold; color:${cAccent}; text-transform:uppercase;">
        Card #${card.id}${payload.role === 'active' ? ' · active' : ''}
      </div>
      <div style="width:140px; height:140px; border:1px solid ${cBorder2}; background:${cSurface0};">
        ${svg}
      </div>
      <div style="font-size:var(--text-body); color:${cText2};">
        Reviews: ${card.numReviews} · Ebisu T: ${ebisuT}
      </div>
      <div style="color:${cAccent}; font-size:var(--text-tiny);">Click to load position</div>
    </div>`;
}

// ── Per-tree header line ─────────────────────────────────────────────────────

export interface HeaderLine {
  title: string;
  meta: string;
  counts: string;
}

/**
 * Composes the per-tree header row from `RenderTree` stats and the
 * matching `ForestStat`. Date is intentionally omitted for v1 — the
 * ForestStat wire shape doesn't expose it; deferred per the dispatch
 * back to the backend.
 */
export function headerLineFor(
  tree: RenderTree,
  forestStats: ReadonlyMap<CardId, ForestStat>,
): HeaderLine {
  const stat = forestStats.get(tree.rootCardId);
  const title = stat?.description?.trim() || `Game source #${tree.gameSourceId}`;
  const players =
    stat?.player_black || stat?.player_white
      ? `${stat?.player_black || '?'} vs ${stat?.player_white || '?'}`
      : '';
  const counts =
    `${tree.stats.renderedNodeCount} rendered · ${tree.stats.totalCardNodes} total` +
    (tree.stats.activeCount > 0 ? ` · ${tree.stats.activeCount} active` : '');
  return { title, meta: players, counts };
}
