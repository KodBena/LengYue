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
import type { RenderNode, RenderTree } from '../../composables/cards/useCardTreeProjection';
import { getCardThumbnailSync } from '../../composables/cards/useCardThumbnail';
import { themeColor } from '../../utils/theme-color';
import { i18n } from '../../i18n';

// Module-level i18n: this is a pure adapter, not a Vue component, so
// `useI18n()` (which requires a setup context) isn't available. The
// `i18n.global.t(...)` accessor reads the same active locale ref the
// component-side `t` reads, so labels re-render correctly when the
// store-driven locale flips. Pattern shared with services/ and the
// module-level composables that wrap pushSystemMessage().
const t = i18n.global.t;

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
//
// `--player-white` is the orange-anchored substrate handle introduced
// for review-state highlighting (its literal value is the orange
// `#f0a04a` matching App.vue's start button and intermission accent).
// Used here as the "current review card" overlay — the spec's 4-role
// partition (active / context / stub / bucket) stays exhaustive; the
// orange paint is a render-time decoration on top of `active` or
// `stub`, not a fifth role.
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
  get current()            { return themeColor('--player-white'); },
  get currentBorder()      { return themeColor('--text-0'); },
};

export function toEChartsNode(
  node: RenderNode,
  currentCardId: CardId | null = null,
): EChartsTreeNode {
  if (node.kind === 'card') {
    const isCurrent = currentCardId !== null && node.cardId === currentCardId;
    return {
      name: `Card ${node.cardId}`,
      payload: { kind: 'card', cardId: node.cardId, role: node.role },
      symbolSize: node.role === 'active' ? 12 : 8,
      itemStyle: {
        color: isCurrent
          ? colors.current
          : (node.role === 'active' ? colors.active : colors.context),
        borderColor: isCurrent
          ? colors.currentBorder
          : (node.role === 'active' ? colors.activeBorder : colors.contextBorder),
        borderWidth: node.role === 'active' ? 2 : 1,
      },
      children: node.children.map(child => toEChartsNode(child, currentCardId)),
    };
  }
  if (node.kind === 'stub') {
    const isCurrent = currentCardId !== null && node.cardId === currentCardId;
    // When the stub's head card is in the active set (an active
    // leaf with cold descendants — the spec's "hot but not warm"
    // case), paint the fill in the active color so the matched
    // card is recognisable at a glance. The dashed border is
    // preserved as the stub-shape signal — clicking still expands
    // the underlying subtree. Without this, an active stub looks
    // like an inactive stub plus a thin colored border, which
    // reads as "barely a different gray glyph" rather than
    // "matched card with hidden descendants" — the long-standing
    // visual-confusion bug surfaced during the cards-tab-merge
    // arc's review.
    return {
      name: `+${node.subtreeSize}`,
      payload: { kind: 'stub', cardId: node.cardId },
      symbolSize: 9,
      itemStyle: {
        color: isCurrent
          ? colors.current
          : (node.isHeadActive ? colors.active : colors.stub),
        borderColor: isCurrent
          ? colors.currentBorder
          : (node.isHeadActive ? colors.activeBorder : colors.stubBorder),
        borderWidth: isCurrent || node.isHeadActive ? 1.5 : 1,
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
      <b style="color:${cAccent};">${t('cardTree.tooltip.cardHeader', { id: payload.cardId })}</b><br/>
      <span style="color:${cText2};">${t('cardTree.tooltip.subtreeSummary')}</span>
    </div>`;
  }
  if (payload.kind === 'bucket') {
    return `<div style="padding:6px; font-size:var(--text-emphasis); color:${cText1};">
      <b style="color:${cAccent};">${t('cardTree.tooltip.bucketHeader')}</b><br/>
      <span style="color:${cText2};">${t('cardTree.tooltip.bucketBody')}</span>
    </div>`;
  }
  const card = cards.get(payload.cardId);
  if (!card) {
    return `<div style="padding:6px; font-size:var(--text-emphasis); color:${cText2};">
      <b style="color:${cAccent};">${t('cardTree.tooltip.cardHeader', { id: payload.cardId })}</b><br/>
      ${t('cardTree.tooltip.loading')}
    </div>`;
  }
  // The cardId widening matches LineageTreeChart's existing pattern;
  // `getCardThumbnailSync` keys its memo cache by raw number.
  const svg = getCardThumbnailSync(card.id as unknown as number, card.sgf);
  const ebisuT = card.model.t.toFixed(4);
  const cardHeaderKey = payload.role === 'active'
    ? 'cardTree.tooltip.cardHeaderActive'
    : 'cardTree.tooltip.cardHeaderInactive';
  return `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="font-weight:bold; color:${cAccent}; text-transform:uppercase;">
        ${t(cardHeaderKey, { id: card.id })}
      </div>
      <div style="width:140px; height:140px; border:1px solid ${cBorder2}; background:${cSurface0};">
        ${svg}
      </div>
      <div style="font-size:var(--text-body); color:${cText2};">
        ${t('cardTree.tooltip.reviewsAndT', { n: card.numReviews, t: ebisuT })}
      </div>
      <div style="color:${cAccent}; font-size:var(--text-tiny);">${t('cardTree.tooltip.clickToLoad')}</div>
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
  const title = stat?.description?.trim()
    || t('cardTree.header.gameSourceFallback', { id: tree.gameSourceId });
  const unknownPlayer = t('cardTree.header.unknownPlayer');
  const players =
    stat?.playerBlack || stat?.playerWhite
      ? t('cardTree.header.versus', {
          black: stat?.playerBlack || unknownPlayer,
          white: stat?.playerWhite || unknownPlayer,
        })
      : '';
  const counts = tree.stats.activeCount > 0
    ? t('cardTree.header.countsWithActive', {
        rendered: tree.stats.renderedNodeCount,
        total:    tree.stats.totalCardNodes,
        active:   tree.stats.activeCount,
      })
    : t('cardTree.header.counts', {
        rendered: tree.stats.renderedNodeCount,
        total:    tree.stats.totalCardNodes,
      });
  return { title, meta: players, counts };
}
