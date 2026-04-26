<script setup lang="ts">
import { ref } from 'vue';
const svgContent = ref('');
const posX = ref(0);
const posY = ref(0);
const visible = ref(false);

defineExpose({
  show: (svg: string, x: number, y: number) => {
    svgContent.value = svg;
    posX.value = x;
    posY.value = y;
    visible.value = true;
  },
  hide: () => { visible.value = false; }
});
</script>

<template>
  <div v-if="visible" class="floating-thumb" :style="{ left: posX + 20 + 'px', top: posY + 20 + 'px' }">
    <div v-html="svgContent" class="svg-wrap"></div>
  </div>
</template>

<style scoped>
.floating-thumb {
  position: fixed;
  z-index: 9999;
  width: 150px;
  height: 150px;
  background: #1a1a1a;
  border: 2px solid #4aaef0;
  border-radius: 4px;
  pointer-events: none;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.svg-wrap { width: 100%; height: 100%; }
</style>
