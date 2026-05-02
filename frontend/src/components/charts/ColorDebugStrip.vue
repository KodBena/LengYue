<!-- 
  src/components/charts/ColorDebugStrip.vue 
  Dual-track visualization for gradient calibration.
  Track 1: Pure Chroma (Isolated color/alpha against neutral dark)
  Track 2: Composite (Alpha interaction with board texture)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { getIntensityColor } from '../../engine/suggestion-colors';

const props = defineProps<{
  steps?: number;
}>();

const sampleCount = computed(() => props.steps || 100);

const samples = computed(() => {
  const result = [];
  const fn = getIntensityColor.value;
  for (let i = 0; i <= sampleCount.value; i++) {
    const t = i / sampleCount.value;
    result.push({ t, color: fn(t) });
  }
  return result;
});
</script>

<template>
  <div class="debug-strip-container">
    
    <!-- Track 1: Pure Chroma -->
    <div class="track-wrapper">
      <div class="track-header">
        <span class="track-label">Pure Transfer Function (Isolated)</span>
      </div>
      <div class="strip clean-bg">
        <div 
          v-for="s in samples" 
          :key="'c'+s.t" 
          class="sample"
          :style="{ backgroundColor: s.color }"
        ></div>
      </div>
    </div>

    <!-- Track 2: Texture Interaction -->
    <div class="track-wrapper">
      <div class="track-header">
        <span class="track-label">Composite Interaction (Board Texture)</span>
      </div>
      <div class="strip wood-texture">
        <div 
          v-for="s in samples" 
          :key="'w'+s.t" 
          class="sample"
          :style="{ backgroundColor: s.color }"
        ></div>
      </div>
    </div>

    <!-- Global Scale Annotations -->
    <div class="scale-footer">
      <span>0.0 (Min Intensity)</span>
      <div class="ticks">
        <span v-for="i in 5" :key="i" class="tick"></span>
      </div>
      <span>1.0 (Max Intensity)</span>
    </div>
  </div>
</template>

<style scoped>
.debug-strip-container {
  padding: 12px;
  background: var(--surface-1);
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.track-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-header {
  display: flex;
  justify-content: space-between;
}

.track-label {
  font-size: 8px;
  color: var(--border-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.strip {
  display: flex;
  height: 24px;
  width: 100%;
  border: 1px solid var(--surface-0);
  border-radius: 2px;
  overflow: hidden;
}

/* theme-exception: .clean-bg and .wood-texture are visualization
   backdrops for the intensity-LUT debug strip — per plan §E,
   ColorDebugStrip is out of scope for the chrome substrate. The
   backdrops are deliberate "neutral dark" / "board texture" choices
   tuned for LUT readability; they do not theme-swap. */
.clean-bg { background-color: #050505; }
.wood-texture {
  background-image: url('/textures/wood.jpg');
  background-size: cover;
  background-position: center;
}

.sample {
  flex: 1;
  height: 100%;
}

.scale-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 9px;
  color: var(--text-2);
  font-family: monospace;
  padding-top: 4px;
  border-top: 1px solid var(--surface-2);
}

.ticks {
  display: flex;
  gap: 20px;
  opacity: 0.3;
}

.tick {
  width: 1px;
  height: 4px;
  background: var(--text-0);
}
</style>
