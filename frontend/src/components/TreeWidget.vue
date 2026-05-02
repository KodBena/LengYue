<!-- 
  src/components/TreeWidget.vue 
  SVG-based Game Tree viewer.
  Added: Auto-expand hidden variations upon lateral navigation.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, toRef, watch, nextTick } from 'vue';
import { useTreeLayout }    from '../composables/useTreeLayout';
import { useTreeExpansion } from '../composables/useTreeExpansion';
import { useScopedScroll }  from '../composables/useScopedScroll';
import { useNavigation }    from '../composables/useNavigation';
import { useThumbnailCache } from '../composables/useThumbnailCache';
import FloatingThumbnail    from './FloatingThumbnail.vue';
import type { GameNode, NodeId, BoardId } from '../types';

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

watch(() => props.currentNodeId, async (newId, _oldId) => {
  
  // 1. AUTO-EXPAND GUARD: If we navigated to a lateral variation that is currently hidden,
  //    we MUST expand the parent before doing layout/centering logic.
  const parentId = props.nodes[newId]?.parent;
  if (parentId) {
    const parentNode = props.nodes[parentId];
    // If the active node is not the mainline child, and the parent is collapsed...
    if (parentNode.children.indexOf(newId) > 0 && !expansion.isExpanded(parentId)) {
      expansion.expandMany([parentId]);
    }
  }

  // 2. Wait for Vue to trigger useTreeLayout and patch the DOM
  await nextTick();
  
  // 3. Center the newly revealed node
  const pos = layout.value.positions.get(newId);
  if (!pos || !outerRef.value) return;
  const { x, y } = toPixels(pos.gx, pos.gy);
  const el = outerRef.value;
  const outOfBounds = x < el.scrollLeft + 50 || x > el.scrollLeft + el.clientWidth - 50 || y < el.scrollTop + 50 || y > el.scrollTop + el.clientHeight - 50;
  if (outOfBounds) {
    el.scrollTo({ left: x - el.clientWidth / 2, top: y - el.clientHeight / 2, behavior: 'smooth' });
  }
});

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
      parentIdForToggle // Pass to template
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
        <g fill="none" stroke="#444" stroke-width="1.2" stroke-linecap="round">
          <path v-for="edge in edges" :key="edge.id" :d="edge.d" />
        </g>

        <g v-for="item in nodeList" :key="item.id" v-memo="[item.id === currentNodeId, item.move?.color, item.isBranching, item.isExpanded]">
          <circle v-if="item.id === currentNodeId" :cx="item.px" :cy="item.py" :r="NODE_R + 3" fill="rgba(74, 174, 240, 0.15)" stroke="#4aaef0" stroke-width="1" />
          <circle :cx="item.px" :cy="item.py" :r="NODE_R" :fill="item.move ? (item.move.color === 'B' ? '#111' : '#eee') : '#555'" :stroke="item.move ? '#444' : '#333'" stroke-width="1" class="node-circle" @click="emit('select-node', item.id)" />

          <g v-if="item.isBranching" class="toggle-group" @click.stop="expansion.toggle(item.parentIdForToggle)" @mouseenter="e => onToggleEnter(e, item.parentIdForToggle as NodeId)" @mouseleave="onToggleLeave">
            <line :x1="item.px" :y1="item.py" :x2="item.ix" :y2="item.iy" stroke="#444" stroke-width="1" stroke-dasharray="2,1" />
            <rect :x="item.ix - BOX_SIZE/2" :y="item.iy - BOX_SIZE/2" :width="BOX_SIZE" :height="BOX_SIZE" fill="#181818" stroke="#555" stroke-width="1" rx="1" />
            <line :x1="item.ix - 2.5" :y1="item.iy" :x2="item.ix + 2.5" :y2="item.iy" stroke="#888" stroke-width="1" />
            <line v-if="!item.isExpanded" :x1="item.ix" :y1="item.iy - 2.5" :x2="item.ix" :y2="item.iy + 2.5" stroke="#888" stroke-width="1" />
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
.node-circle { cursor: pointer; transition: filter 0.1s; }
.node-circle:hover { filter: brightness(1.4) drop-shadow(0 0 3px var(--accent-primary)); }
.toggle-group { cursor: pointer; }
.toggle-group rect { transition: stroke 0.1s, fill 0.1s; }
.toggle-group:hover rect { stroke: var(--accent-primary); fill: var(--surface-3); }
.toggle-group:hover line { stroke: var(--text-0); }
.hit-area { pointer-events: all; }
</style>
