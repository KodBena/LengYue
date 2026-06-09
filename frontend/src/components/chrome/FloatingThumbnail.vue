<!--
  src/components/chrome/FloatingThumbnail.vue
  Cursor-anchored hover thumbnail. Imperative show(svg, x, y) / hide() API,
  driven now only by TreeWidget's variation-toggle hover (the sidebar board-tab
  preview moved to a docked, reactive pane in SidebarWidget.vue). The component
  owns its own visibility arbitration — see the HIDE_RADIUS_PX note — so hosts
  need only call show()/hide() from their enter/leave handlers.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
const svgContent = ref('');
const posX = ref(0);
const posY = ref(0);
const visible = ref(false);

// Iter-1 audit: caller passes (clientX + 20, clientY - 60); the
// inline `+ 20` offsets in the template added another nudge so the
// thumbnail appeared to the right and slightly above the cursor.
// Without clamping, hovers near the right or top viewport edge
// painted the 150×150 thumbnail partially offscreen. Clamp at
// show()-time using window inner dimensions — corner case of
// window resize mid-hover is ignored (thumbnail is hidden on
// mouseleave anyway).

// magic-literal: 154 = thumbnail outer box. Sum of the inner 150px
// (CSS `.floating-thumb { width: 150px; height: 150px }` below) +
// 2px border on each side (the `border: 2px solid` in the same
// rule). If the .floating-thumb width/height/border changes, this
// constant must track them — they have no shared substrate token.
const THUMB_BOX = 154;

// magic-literal: 20px cursor-offset for thumbnail anchor. Composes
// with the caller's own cursor offset so the thumbnail lands to the
// right of, and slightly below, the cursor. (TreeWidget passes the
// raw cursor; the former SidebarWidget caller added its own nudge
// before that host moved to the docked pane.) If you retune the
// pair, retune both.
const CURSOR_OFFSET_PX = 20;

// magic-literal: 80px hide-radius — the seam-level backstop for a LOST
// mouseleave, which is the dominant (and nondeterministic) source of the
// "lingers forever" finickiness. show() records the cursor position the host
// anchored at; while the pointer stays within this radius the preview holds,
// and the first pointer movement beyond it hides the preview. The reason a
// plain `mouseleave` is not enough: TreeWidget's `.toggle-group` <g> elements
// are re-created on every tree re-render, and a pointer on (or moving off) a
// <g> that is removed/replaced under it never receives the element-level
// `mouseleave`, so the host's hide() never fires and the box is stranded.
// Anchoring visibility to the live pointer rather than trusting the per-element
// leave converts "lingers forever" into "hides as soon as the pointer moves
// away" — and, as a side effect, neutralises the async show/hide ordering
// hazard (an await-late show() with the pointer already elsewhere is hidden by
// the next pointermove). This COMPOSES with the host's mouseleave (still the
// fast path on a clean leave); it does not replace it. The listener is bound
// only while visible, so there is no always-on document-listener cost.
// Tunable by eye: large enough that in-element jitter does not false-hide,
// small enough that leaving the element hides promptly.
const HIDE_RADIUS_PX = 80;

let anchorX = 0;
let anchorY = 0;

function onDocPointerMove(e: PointerEvent): void {
  if (!visible.value) return;
  const dx = e.clientX - anchorX;
  const dy = e.clientY - anchorY;
  if (dx * dx + dy * dy > HIDE_RADIUS_PX * HIDE_RADIUS_PX) {
    hide();
  }
}

function hide(): void {
  visible.value = false;
  document.removeEventListener('pointermove', onDocPointerMove);
}

defineExpose({
  show: (svg: string, x: number, y: number) => {
    svgContent.value = svg;
    anchorX = x;
    anchorY = y;
    const proposedX = x + CURSOR_OFFSET_PX;
    const proposedY = y + CURSOR_OFFSET_PX;
    const maxX = window.innerWidth - THUMB_BOX;
    const maxY = window.innerHeight - THUMB_BOX;
    posX.value = Math.max(0, Math.min(proposedX, maxX));
    posY.value = Math.max(0, Math.min(proposedY, maxY));
    visible.value = true;
    // Idempotent: addEventListener dedupes an identical (type, fn) pair, so a
    // re-anchoring show() while already visible does not stack listeners.
    document.addEventListener('pointermove', onDocPointerMove);
  },
  hide,
});

// Safety net: if the host unmounts (e.g. the tree panel closes) while the
// thumbnail is still visible, hide() never runs and the document listener would
// leak. Drop it on teardown.
onUnmounted(() => {
  document.removeEventListener('pointermove', onDocPointerMove);
});
</script>

<template>
  <div v-if="visible" class="floating-thumb" :style="{ left: posX + 'px', top: posY + 'px' }">
    <!-- eslint-disable-next-line vue/no-v-html -- deliberate board-SVG string projection from the trusted board-geometry renderer (no user-authored HTML); see ADR-0010 string-vs-reactive board projection -->
    <div v-html="svgContent" class="svg-wrap"></div>
  </div>
</template>

<style scoped>
.floating-thumb {
  position: fixed;
  z-index: var(--z-modal);
  width: 150px;
  height: 150px;
  background: var(--surface-2);
  border: 2px solid var(--accent-primary);
  border-radius: var(--radius-default);
  pointer-events: none;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.svg-wrap { width: 100%; height: 100%; }
</style>
