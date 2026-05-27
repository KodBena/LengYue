<!--
  src/components/tree/TreeWidget.vue
  SVG-based Game Tree viewer.
  Enforces the "current-node-is-always-visible" UX invariant via
  `expansion.ensureVisible` on mount and on every currentNodeId
  change. Covers PV paste (Vue batches the multi-step navigation
  into a single watcher firing on the new leaf), SPA reload (the
  immediate-flag fires the watcher on mount with the hydrated
  currentNodeId), and lateral navigation to hidden variations.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, toRef, watch, nextTick } from 'vue';
import { useTreeLayout }    from '../../composables/forest/useTreeLayout';
import { useTreeExpansion } from '../../composables/forest/useTreeExpansion';
import { useScopedScroll }  from '../../composables/useScopedScroll';
import { useNavigation }    from '../../composables/useNavigation';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { themeColor }        from '../../utils/theme-color';
import FloatingThumbnail    from '../chrome/FloatingThumbnail.vue';
import type { GameNode, NodeId, BoardId } from '../../types';

/**
 * ─── Branded-type signature discipline (Commit 2-extension) ──────────────────
 * The previous prop and emit signatures used loose `string` and
 * `Record<string, GameNode>` for what are always branded values from the
 * store. The branded forms (NodeId, BoardId, Record<NodeId, GameNode>)
 * match the actual upstream types and propagate compile-time honesty
 * through to the consumer (App.vue).
 *
 * Caller side: App.vue passes `activeBoard.nodes` (already
 * Record<NodeId, GameNode>), `activeBoard.currentNodeId` (NodeId), and
 * `activeBoard.id` (BoardId). All three already match the new signature
 * with no caller-side change needed.
 *
 * The select-node emit's `nodeId` is now NodeId, which forces the
 * App.vue handler to receive NodeId — closing one of the looseness
 * leaks at the component boundary.
 * ──────────────────────────────────────────────────────────────────────────
 */
const props = withDefaults(
  defineProps<{
    nodes: Record<NodeId, GameNode>;
    currentNodeId: NodeId;
    boardId: BoardId;
    orientation?: 'vertical' | 'horizontal';
    // Set of NodeIds that are current "game heads" — the single
    // green-ring position per "play vs engine" session on this
    // board (each session has exactly one head; the head advances
    // as the game progresses). Each head node renders a green
    // ring, distinct from the current-node's accent ring. Reads
    // `board.games[*].currentHeadNodeId` upstream; per-session
    // config is opaque here — the tree only needs identity.
    gameHeadIds?: ReadonlySet<NodeId>;
  }>(),
  { orientation: 'vertical' },
);

const emit = defineEmits<{
  (e: 'select-node', nodeId: NodeId): void;
}>();

// ── Rendering constants ───────────────────────────────────────────────────────

const CELL        = 24; 
const PAD         = 18;
const NODE_R      = 5;
const BOX_SIZE    = 10;
const SIDE_OFFSET = 12; 

// ── Composables ───────────────────────────────────────────────────────────────

const outerRef = ref<HTMLElement | null>(null);
const thumbRef = ref<InstanceType<typeof FloatingThumbnail> | null>(null);
const nav      = useNavigation();
useScopedScroll(outerRef, deltaY => {
  if (deltaY > 0) nav.next();
  else nav.prev();
});

const expansion = useTreeExpansion();
const { getVariationThumbnail } = useThumbnailCache();

const nodesRef  = toRef(props, 'nodes');
const { layout } = useTreeLayout(nodesRef, undefined, expansion);

// ── Variation Hover Logic ─────────────────────────────────────────────────────

async function onToggleEnter(e: MouseEvent, nodeId: NodeId) {
  if (!thumbRef.value) return;
  const svg = await getVariationThumbnail(nodeId, props.boardId);
  thumbRef.value.show(svg, e.clientX, e.clientY);
}

function onToggleLeave() {
  thumbRef.value?.hide();
}

// ── Node-circle fill / stroke helpers (chrome via themeColor; B/W
//    stones stay literal as domain colors per ADR-0003 plan §D). ─────────────

function nodeFill(item: { move?: GameNode['move'] }): string {
  if (!item.move) return themeColor('--border-3');
  // Stone colors are domain-meaningful (board pieces); not chrome.
  return item.move.color === 'B' ? '#111' : '#eee';
}

function nodeStroke(item: { move?: GameNode['move'] }): string {
  return item.move ? themeColor('--border-3') : themeColor('--border-2');
}

// ── Coordinate mapping ────────────────────────────────────────────────────────

function toPixels(gx: number, gy: number): { x: number; y: number } {
  return props.orientation === 'horizontal'
    ? { x: PAD + gy * CELL, y: PAD + gx * CELL }
    : { x: PAD + gx * CELL, y: PAD + gy * CELL };
}

function indicatorPixels(gx: number, gy: number): { x: number; y: number } {
  const base = toPixels(gx, gy);
  return props.orientation === 'horizontal'
    ? { x: base.x, y: base.y + SIDE_OFFSET }
    : { x: base.x + SIDE_OFFSET, y: base.y };
}

const svgWidth = computed(() =>
  props.orientation === 'horizontal'
    ? layout.value.rows * CELL + PAD * 2
    : layout.value.cols * CELL + PAD * 2,
);

const svgHeight = computed(() =>
  props.orientation === 'horizontal'
    ? layout.value.cols * CELL + PAD * 2
    : layout.value.rows * CELL + PAD * 2,
);

// ── Viewport Centering & Auto-Expand ──────────────────────────────────────────
//
// `immediate: true` so the invariant fires on mount (the SPA-reload
// case, where currentNodeId is hydrated to a mid-variation node and
// no change event ever happens). `ensureVisible` walks up from the
// new node and unions every ancestor into the expansion set — this
// is the load-bearing piece of the "current-node-is-always-visible"
// invariant the composable's header documents. Covers all three
// trigger cases (mount, lateral nav, multi-step PV paste) uniformly.

watch(() => props.currentNodeId, async (newId, _oldId) => {
  expansion.ensureVisible(props.nodes, newId);

  // Wait for Vue to trigger useTreeLayout and patch the DOM.
  await nextTick();

  // Center the newly revealed node. On the initial-mount run
  // outerRef is null and the early return is the right behaviour;
  // first paint scrolls to its own default and subsequent navigation
  // takes over.
  const pos = layout.value.positions.get(newId);
  if (!pos || !outerRef.value) return;
  const { x, y } = toPixels(pos.gx, pos.gy);
  const el = outerRef.value;
  const outOfBounds = x < el.scrollLeft + 50 || x > el.scrollLeft + el.clientWidth - 50 || y < el.scrollTop + 50 || y > el.scrollTop + el.clientHeight - 50;
  if (outOfBounds) {
    el.scrollTo({ left: x - el.clientWidth / 2, top: y - el.clientHeight / 2, behavior: 'smooth' });
  }
}, { immediate: true });

// ── Derived display lists ─────────────────────────────────────────────────────

const nodeList = computed(() => {
  // `parentIdForToggle` is added to the type literal because the loop
  // unconditionally assigns it (line below). The previous omission was
  // a partial type that the strict-mode typecheck flagged as a missing
  // property in the array element literal at the items.push site.
  // It's NodeId | '' (the empty string is the sentinel "no toggle owner";
  // when isBranching is true, the value is a real NodeId).
  const items: Array<{
    id: NodeId; px: number; py: number; ix: number; iy: number;
    move: GameNode['move']; isBranching: boolean; isExpanded: boolean;
    parentIdForToggle: NodeId | '';
    isGameHead: boolean;
  }> = [];

  layout.value.positions.forEach((pos, id) => {
    const node = props.nodes[id];
    if (!node) return;
    const { x: px, y: py } = toPixels(pos.gx, pos.gy);
    const { x: ix, y: iy } = indicatorPixels(pos.gx, pos.gy);

    // --- NEW LOGIC: Attach to the mainline child instead of the parent ---
    let hasSiblings = false;
    let parentIdForToggle: NodeId | '' = '';
    let isParentExpanded = false;

    if (node.parent) {
      const parentNode = props.nodes[node.parent];
      // If this node is the FIRST child (mainline) and its parent has variations
      if (parentNode && parentNode.children.length > 1 && parentNode.children[0] === id) {
        hasSiblings = true;
        parentIdForToggle = node.parent;
        isParentExpanded = expansion.isExpanded(node.parent);
      }
    }

    items.push({
      id, px, py, ix, iy,
      move: node.move,
      isBranching: hasSiblings,
      isExpanded: isParentExpanded,
      parentIdForToggle, // Pass to template
      isGameHead: !!props.gameHeadIds?.has(id),
    });
  });
  return items;
});

const edges = computed(() => {
  const result: Array<{ d: string; id: string }> = [];
  layout.value.positions.forEach((pos, nodeId) => {
    const node = props.nodes[nodeId];
    if (!node) return;
    const start = toPixels(pos.gx, pos.gy);
    for (const childId of node.children) {
      const childPos = layout.value.positions.get(childId);
      if (!childPos) continue; 
      const end = toPixels(childPos.gx, childPos.gy);
      let d = childPos.gx === pos.gx ? `M${start.x},${start.y} L${end.x},${end.y}` :
             (props.orientation === 'horizontal' ? `M${start.x},${start.y} L${start.x + CELL/2},${start.y} L${start.x + CELL/2},${end.y} L${end.x},${end.y}` :
             `M${start.x},${start.y} L${start.x},${(start.y+end.y)/2} L${end.x},${(start.y+end.y)/2} L${end.x},${end.y}`);
      result.push({ d, id: `${nodeId}-${childId}` });
    }
  });
  return result;
});
</script>

<template>
  <div class="tree-widget-wrapper">
    <div ref="outerRef" class="tree-widget-outer">
      <svg :width="svgWidth" :height="svgHeight" class="tree-svg">
        <g class="tree-edges" stroke-width="1.2" stroke-linecap="round">
          <path v-for="edge in edges" :key="edge.id" :d="edge.d" />
        </g>

        <g v-for="item in nodeList" :key="item.id" v-memo="[item.id === currentNodeId, item.isGameHead, item.move?.color, item.isBranching, item.isExpanded]">
          <!-- Game-head marker — outermost ring (NODE_R + 5) so it
               stays visible when the active-ring (NODE_R + 3) also
               applies on the current node. Green = "play vs engine
               session's head — engine will respond to your next
               move from here". Exactly one head per session;
               the head advances as the game progresses, so
               previously-green nodes no longer render the ring.
               See PlayEngineModal / useEngineResponder for the
               lifecycle. -->
          <circle v-if="item.isGameHead" :cx="item.px" :cy="item.py" :r="NODE_R + 5" class="game-head-ring" stroke-width="1.5" />
          <circle v-if="item.id === currentNodeId" :cx="item.px" :cy="item.py" :r="NODE_R + 3" class="active-ring" stroke-width="1" />
          <circle :cx="item.px" :cy="item.py" :r="NODE_R" :fill="nodeFill(item)" :stroke="nodeStroke(item)" stroke-width="1" class="node-circle" @click="emit('select-node', item.id)" />

          <g v-if="item.isBranching" class="toggle-group" @click.stop="expansion.toggle(item.parentIdForToggle)" @mouseenter="e => onToggleEnter(e, item.parentIdForToggle as NodeId)" @mouseleave="onToggleLeave">
            <line :x1="item.px" :y1="item.py" :x2="item.ix" :y2="item.iy" class="toggle-leader" stroke-width="1" stroke-dasharray="2,1" />
            <rect :x="item.ix - BOX_SIZE/2" :y="item.iy - BOX_SIZE/2" :width="BOX_SIZE" :height="BOX_SIZE" class="toggle-box" stroke-width="1" rx="1" />
            <line :x1="item.ix - 2.5" :y1="item.iy" :x2="item.ix + 2.5" :y2="item.iy" class="toggle-mark" stroke-width="1" />
            <line v-if="!item.isExpanded" :x1="item.ix" :y1="item.iy - 2.5" :x2="item.ix" :y2="item.iy + 2.5" class="toggle-mark" stroke-width="1" />
            <rect :x="item.ix - 7" :y="item.iy - 7" width="14" height="14" fill="transparent" class="hit-area" />
          </g>
        </g>
      </svg>
    </div>

    <!-- Tooltip Overlay -->
    <FloatingThumbnail ref="thumbRef" />
  </div>
</template>

<style scoped>
.tree-widget-wrapper { position: relative; width: 100%; height: 100%; background: var(--surface-2); }
.tree-widget-outer { width: 100%; height: 100%; overflow: auto; }
.tree-svg { display: block; }
.tree-edges { fill: none; stroke: var(--border-3); }
.active-ring { fill: color-mix(in srgb, var(--accent-primary) 15%, transparent); stroke: var(--accent-primary); }
.game-head-ring { fill: color-mix(in srgb, var(--state-success) 15%, transparent); stroke: var(--state-success); }
.node-circle { cursor: pointer; transition: filter var(--duration-default); }
.node-circle:hover { filter: brightness(1.4) drop-shadow(0 0 3px var(--accent-primary)); }
.toggle-group { cursor: pointer; }
.toggle-group rect { transition: stroke var(--duration-default), fill var(--duration-default); }
.toggle-leader { stroke: var(--border-3); }
.toggle-box { fill: var(--surface-2); stroke: var(--border-3); }
.toggle-mark { stroke: var(--text-2); }
.toggle-group:hover .toggle-box { stroke: var(--accent-primary); fill: var(--surface-3); }
.toggle-group:hover .toggle-mark { stroke: var(--text-0); }
.hit-area { pointer-events: all; }
</style>
