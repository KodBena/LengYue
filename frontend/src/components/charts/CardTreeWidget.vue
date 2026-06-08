<!--
  src/components/charts/CardTreeWidget.vue
  Card-tree widget per docs/archive/notes/card-tree-frontend-spec.md.

  Renders a forest of `CardLineageTree`s as one ECharts tree-series
  per tree, vertically stacked with per-tree headers. The
  active/context/stub/bucket projection lives in
  `useCardTreeProjection`; chart lifecycle in
  `useEChartsForestRender`; the ECharts shape adapter in
  `card-tree-echarts.ts`.

  Pure presenter: manual-expand state arrives as a `ReadonlySet<string>`
  prop and stub / bucket clicks emit `'toggle-manual-expand'` for the
  parent to wire (typically `useCardTreeData::toggleManualExpand`,
  which writes to the persisted `session.ui.cardTreeNav[boardId]`
  slice — schema-version 45). Per-mount component state is limited to
  accordion-expand (per-tree section) and lazy-hydration bookkeeping.

  Lazy card-hydration requests, click dispatch, and presentation
  chrome remain owned here.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef } from 'vue';
import type {
  CardId,
  CardLineageTree,
  ForestStat,
  ReviewCard,
  CardTreeExpandKey,
} from '../../types';
import {
  useCardTreeProjection,
  cardExpandKeyFor,
} from '../../composables/cards/useCardTreeProjection';
import { useCardTreeHydration } from '../../composables/cards/useCardTreeHydration';
import {
  useEChartsForestRender,
  type ForestChartConfig,
} from '../../composables/analysis/useEChartsForestRender';
import {
  toEChartsNode,
  tooltipFor,
  headerLineFor,
  type NodePayload,
} from './card-tree-echarts';

const props = withDefaults(
  defineProps<{
    forest: CardLineageTree[];
    activeSet: ReadonlySet<CardId>;
    cards: ReadonlyMap<CardId, ReviewCard>;
    forestStats: ReadonlyMap<CardId, ForestStat>;
    // Manual-expand axis the widget projects against. Owned by the
    // parent (via `useCardTreeData::manualExpand`, which reads from
    // `store.session.ui.cardTreeNav[boardId]` — schema-version 45);
    // stub / bucket clicks emit `'toggle-manual-expand'` for the
    // parent to wire. Pure data-in / event-out shape, matching the
    // other inputs to this widget.
    manualExpand: ReadonlySet<CardTreeExpandKey>;
    orientation?: 'horizontal' | 'vertical';
    maxNodes?: number;
    // Optional render-time overlay: when set, the matching `card` or
    // `stub` node paints in `--review-current-card` (orange via the
    // CTA accent) instead of the role-derived chrome color. The
    // spec's 4-role partition stays exhaustive; this is decoration,
    // not a fifth role. Consumers typically pass the active board's
    // review-session current card id so the user can track SR
    // progress against the rendered forest. `null` (default) means
    // no overlay.
    currentCardId?: CardId | null;
    // Second render-time overlay: the card the user clicked to load
    // into the inline-edit metadata panel. Painted in
    // `--state-success` (green) and wins over `currentCardId` when
    // both apply — the user's immediate Browse-side action takes
    // visual priority over the session-running highlight. `null`
    // (default) means nothing's been clicked to edit.
    selectedCardId?: CardId | null;
  }>(),
  { orientation: 'vertical', maxNodes: 5000, currentCardId: null, selectedCardId: null },
);

const emit = defineEmits<{
  (e: 'node-click', payload: { cardId: CardId; role: 'active' | 'context' }): void;
  (e: 'node-hover', payload: { cardId: CardId; role: 'active' | 'context'; x: number; y: number }): void;
  (e: 'node-leave'): void;
  (e: 'request-card', cardId: CardId): void;
  (e: 'overflow', payload: { renderedNodeCount: number; cap: number }): void;
  // Stub or bucket click — parent toggles persisted state. Key is
  // `String(cardId)` for stubs or `bucket:${parentCardId}` for
  // buckets, matching `useCardTreeProjection::cardExpandKeyFor` /
  // `bucketIdFor`.
  (e: 'toggle-manual-expand', key: CardTreeExpandKey): void;
  // "Collapse all" click on a tree's header — parent clears every
  // manual-expand key belonging to that tree, leaving other trees'
  // expansion entries (under the same board's persisted slot)
  // intact.
  (e: 'collapse-tree', rootCardId: CardId): void;
}>();

// Per-mount accordion-expand (per-tree section). manualExpand is a
// prop now (parent-owned and persisted via the store); the data-layer
// `useCardTreeData::reset` clears it when forest / activeSet are
// replaced, so the widget no longer needs to mirror that reset.

const expandedRootId = ref<CardId | null>(null);

// Composable expects `Ref<Set<CardId>>` / `Ref<Set<string>>`;
// widening from the `ReadonlySet`-typed props is safe here because
// the projection is read-only over its inputs.
const forestRef = computed(() => props.forest);
const activeSetRef = computed(() => props.activeSet as Set<CardId>);
const manualExpandRef = computed(() => props.manualExpand as Set<CardTreeExpandKey>);
const { renderForest } = useCardTreeProjection(forestRef, activeSetRef, manualExpandRef);

const { resetHydration } = useCardTreeHydration(
  renderForest,
  toRef(props, 'cards'),
  cardId => emit('request-card', cardId),
);

watch([() => props.forest, () => props.activeSet], () => {
  resetHydration();
});

// Default-expansion: pick first tree on forest change unless the
// previously-expanded one is still there (so rerunning a deck
// doesn't randomly jump the user).
watch(renderForest, forest => {
  if (forest.length === 0) { expandedRootId.value = null; return; }
  const stillThere = forest.some(t => t.rootCardId === expandedRootId.value);
  if (!stillThere) expandedRootId.value = forest[0].rootCardId;
}, { immediate: true });

function toggleExpand(rootCardId: CardId): void {
  expandedRootId.value = expandedRootId.value === rootCardId ? null : rootCardId;
}

// Soft-cap warning per ADR-0002.
const totalRendered = computed(() =>
  renderForest.value.reduce((s, t) => s + t.stats.renderedNodeCount, 0),
);
watch(totalRendered, n => {
  if (n > props.maxNodes) emit('overflow', { renderedNodeCount: n, cap: props.maxNodes });
});

// Click dispatch: cards bubble up; stubs / buckets emit
// `'toggle-manual-expand'` for the parent to wire to the persisted
// slice. The parent's mutator reassigns the array (per the named-
// mutator discipline), the `manualExpand` prop re-projects, and the
// `useCardTreeProjection` computed re-fires.
function handleClick(payload: NodePayload): void {
  if (payload.kind === 'card') {
    emit('node-click', { cardId: payload.cardId, role: payload.role });
    return;
  }
  const key = payload.kind === 'stub'
    ? cardExpandKeyFor(payload.cardId)
    : payload.bucketId;
  emit('toggle-manual-expand', key);
}

function handleHover(payload: NodePayload, x: number, y: number): void {
  if (payload.kind !== 'card') return;
  emit('node-hover', { cardId: payload.cardId, role: payload.role, x, y });
}

// `containerRefs` is intentionally a plain (non-reactive) Map: the
// `:ref` callback fires during render, and writing to a reactive
// container would dirty the component mid-render and trigger
// "Maximum recursive updates exceeded." Sync is driven by an
// explicit watch on `renderForest` that runs after `nextTick()`.

const containerRefs = new Map<string, HTMLElement>();

function setContainerRef(key: string, el: Element | null): void {
  if (el instanceof HTMLElement) containerRefs.set(key, el);
  else containerRefs.delete(key);
}

const { syncCharts } = useEChartsForestRender<NodePayload>();

function buildConfigs(): ForestChartConfig<NodePayload>[] {
  const expanded = expandedRootId.value;
  if (expanded === null) return [];
  const tree = renderForest.value.find(t => t.rootCardId === expanded);
  if (!tree) return [];
  const el = containerRefs.get(String(tree.rootCardId));
  if (!el) return [];
  return [{
    treeKey: String(tree.rootCardId),
    el,
    data: toEChartsNode(tree.root, props.currentCardId, props.cards, props.selectedCardId),
    orient: props.orientation === 'vertical' ? 'TB' : 'LR',
    renderedNodeCount: tree.stats.renderedNodeCount,
    tooltipFor: payload => tooltipFor(payload, props.cards),
    onClick: handleClick,
    onHover: handleHover,
    onLeave: () => emit('node-leave'),
  }];
}

watch(
  [renderForest, () => props.orientation, () => props.cards, expandedRootId, () => props.currentCardId, () => props.selectedCardId],
  async () => { await nextTick(); syncCharts(buildConfigs()); },
  { immediate: true },
);
</script>

<template>
  <div class="card-tree-widget">
    <div
      v-for="tree in renderForest"
      :key="tree.rootCardId"
      class="tree-section"
      :class="{ expanded: tree.rootCardId === expandedRootId }"
    >
      <div class="tree-header" @click="toggleExpand(tree.rootCardId)">
        <span class="chevron">{{ tree.rootCardId === expandedRootId ? '▼' : '▶' }}</span>
        <div
          class="title"
          :title="headerLineFor(tree, props.forestStats).titleTooltip"
        >{{ headerLineFor(tree, props.forestStats).title }}</div>
        <div class="meta">{{ headerLineFor(tree, props.forestStats).meta }}</div>
        <div class="counts">{{ headerLineFor(tree, props.forestStats).counts }}</div>
        <!-- "Collapse all" — shown only on the currently-expanded
             tree-section's header. Clears every manual-expand key
             belonging to this tree (other trees' entries under the
             same board are preserved). `.stop` so the click doesn't
             also toggle the accordion. -->
        <button
          v-if="tree.rootCardId === expandedRootId"
          type="button"
          class="collapse-all-btn"
          :title="$t('cards.lineage.collapseAllTooltip')"
          @click.stop="emit('collapse-tree', tree.rootCardId)"
        >{{ $t('cards.lineage.collapseAll') }}</button>
      </div>
      <div
        v-if="tree.rootCardId === expandedRootId"
        :ref="(el) => setContainerRef(String(tree.rootCardId), el as Element | null)"
        class="tree-canvas"
      ></div>
    </div>
    <div v-if="renderForest.length === 0" class="empty-state">
      No trees to display.
    </div>
  </div>
</template>

<style scoped>
.card-tree-widget {
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--surface-0);
  padding: var(--space-default);
}
.tree-section {
  display: flex;
  flex-direction: column;
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  flex-shrink: 0;
  min-height: 0;
  min-width: 0;
  /* `overflow: hidden` is load-bearing for responsiveness: at small
     panel heights the expanded section would otherwise let its
     ECharts canvas render at content-natural-size and spill out
     horizontally (the chart's `roam: true` mode lets it grow past
     the viewport). Clipping at the section boundary keeps the
     chart inside its allotted box; the ResizeObserver on
     .tree-canvas then triggers ECharts.resize() at the right
     dimensions. */
  overflow: hidden;
}
/* `min-height: 0` (rather than the prior 280px floor) lets the
   expanded section shrink with the panel — the user can drag the
   panel-resizer to small heights without the chart being pushed
   outside its container. */
.tree-section.expanded { flex: 1; min-height: 0; }
/* `flex-wrap: wrap` + `row-gap` (iter-20): the header row hosts
   chevron + title (shrinks via ellipsis) + meta + counts +
   collapse-all-btn. All non-title children carry `white-space: nowrap`
   and most have `flex-shrink: 0`, so at narrow tree-panel widths
   (1024×768 stacked layout from iter-17, or any narrow control-panel
   width) the right end overflows. Parent `.tree-section { overflow:
   hidden }` (load-bearing for ECharts containment) then clipped the
   collapse-all button on the right edge. Wrap lets the counts +
   collapse-all-btn drop to a second row when room runs out; on the
   wrapped row, `.counts { margin-left: auto }` keeps the trailing
   pair pushed to the right edge as before. */
.tree-header {
  padding: var(--space-default) var(--space-medium);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-medium);
  row-gap: var(--space-tight);
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}
.tree-section.expanded .tree-header { border-bottom: 1px solid var(--surface-2); }
.tree-header .chevron { font-size: var(--text-tiny); color: var(--text-2); width: 10px; flex-shrink: 0; }
.tree-header .title { font-size: var(--text-emphasis); color: var(--text-0); font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-header .meta { font-size: var(--text-body); color: var(--text-2); white-space: nowrap; }
.tree-header .counts { margin-left: auto; font-size: var(--text-body); color: var(--accent-primary); white-space: nowrap; }
/* "Collapse all" button on the expanded tree-section's header.
   Matches the toolbar-btn aesthetic (compact, monospace, accent
   colour) so it reads as a chrome action rather than a content
   element. Visible only on the expanded tree; renders flush to
   the right edge of the header beside `counts`. */
.collapse-all-btn { background: var(--surface-2); color: var(--accent-primary); border: 1px solid var(--border-2); border-radius: var(--radius-default); padding: 1px 6px; font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-tight); cursor: pointer; font-family: 'Courier New', monospace; flex-shrink: 0; }
.tree-canvas { flex: 1; min-height: 0; width: 100%; cursor: crosshair; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--border-3); font-size: var(--text-emphasis); }
</style>
