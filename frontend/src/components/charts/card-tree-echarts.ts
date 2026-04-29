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

// Palette: cyan accent (#4aaef0) is the codebase's primary; cold
// nodes sit in the existing dark-theme greys. Stub borders pick up
// the active accent when their head card is in the active set —
// the spec's 4-role partition is preserved (the role stays 'stub')
// but the visual signal "matched but summarized" is recoverable.
const COLOR_ACTIVE = '#4aaef0';
const COLOR_ACTIVE_BORDER = '#ffffff';
const COLOR_CONTEXT = '#222222';
const COLOR_CONTEXT_BORDER = '#666666';
const COLOR_STUB = '#1a1a1a';
const COLOR_STUB_BORDER = '#444444';
const COLOR_STUB_ACTIVE_BORDER = '#4aaef0';
const COLOR_BUCKET = '#0a0a0a';
const COLOR_BUCKET_BORDER = '#333333';

export function toEChartsNode(node: RenderNode): EChartsTreeNode {
  if (node.kind === 'card') {
    return {
      name: `Card ${node.cardId}`,
      payload: { kind: 'card', cardId: node.cardId, role: node.role },
      symbolSize: node.role === 'active' ? 12 : 8,
      itemStyle: {
        color: node.role === 'active' ? COLOR_ACTIVE : COLOR_CONTEXT,
        borderColor:
          node.role === 'active' ? COLOR_ACTIVE_BORDER : COLOR_CONTEXT_BORDER,
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
        color: COLOR_STUB,
        borderColor: node.isHeadActive
          ? COLOR_STUB_ACTIVE_BORDER
          : COLOR_STUB_BORDER,
        borderWidth: node.isHeadActive ? 1.5 : 1,
        borderType: 'dashed',
      },
      label: {
        show: true,
        position: 'right',
        color: '#888',
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
      color: COLOR_BUCKET,
      borderColor: COLOR_BUCKET_BORDER,
      borderWidth: 1,
      borderType: 'dotted',
    },
    label: {
      show: true,
      position: 'right',
      color: '#666',
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
  if (payload.kind === 'stub') {
    return `<div style="padding:6px; font-size:11px; color:#ccc;">
      <b style="color:#4aaef0;">Card ${payload.cardId}</b><br/>
      <span style="color:#888;">Subtree summary — click to expand.</span>
    </div>`;
  }
  if (payload.kind === 'bucket') {
    return `<div style="padding:6px; font-size:11px; color:#ccc;">
      <b style="color:#888;">Bucket of cold leaves</b><br/>
      <span style="color:#666;">Click to expand individual cards.</span>
    </div>`;
  }
  const card = cards.get(payload.cardId);
  if (!card) {
    return `<div style="padding:6px; font-size:11px; color:#888;">
      <b style="color:#4aaef0;">Card ${payload.cardId}</b><br/>
      Loading…
    </div>`;
  }
  // The cardId widening matches LineageTreeChart's existing pattern;
  // `getCardThumbnailSync` keys its memo cache by raw number.
  const svg = getCardThumbnailSync(card.id as unknown as number, card.sgf);
  const ebisuT = card.model.t.toFixed(4);
  return `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="font-weight:bold; color:#4aaef0; text-transform:uppercase;">
        Card #${card.id}${payload.role === 'active' ? ' · active' : ''}
      </div>
      <div style="width:140px; height:140px; border:1px solid #333; background:#000;">
        ${svg}
      </div>
      <div style="font-size:10px; color:#888;">
        Reviews: ${card.numReviews} · Ebisu T: ${ebisuT}
      </div>
      <div style="color:#4aaef0; font-size:9px;">Click to load position</div>
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
