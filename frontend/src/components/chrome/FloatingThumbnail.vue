<script setup lang="ts">
import { ref } from 'vue';
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
// with the caller's own `clientX + 20, clientY - 60` offset
// (`SidebarWidget.vue` hover handler) so the thumbnail lands at
// (cursor + 40, cursor - 40) — right of the sidebar tab and a
// slight rise above the cursor. The two offsets were deliberately
// kept separate in iter-7 to avoid surprising the caller; if you
// retune one, retune the pair.
const CURSOR_OFFSET_PX = 20;

defineExpose({
  show: (svg: string, x: number, y: number) => {
    svgContent.value = svg;
    const proposedX = x + CURSOR_OFFSET_PX;
    const proposedY = y + CURSOR_OFFSET_PX;
    const maxX = window.innerWidth - THUMB_BOX;
    const maxY = window.innerHeight - THUMB_BOX;
    posX.value = Math.max(0, Math.min(proposedX, maxX));
    posY.value = Math.max(0, Math.min(proposedY, maxY));
    visible.value = true;
  },
  hide: () => { visible.value = false; }
});
</script>

<template>
  <div v-if="visible" class="floating-thumb" :style="{ left: posX + 'px', top: posY + 'px' }">
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
