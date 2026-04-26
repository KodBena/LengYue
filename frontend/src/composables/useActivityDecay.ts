/**
 * src/composables/useActivityDecay.ts
 * Implements a Leaky Integrator / Exponential Decay model.
 * Fast Attack (instant), Slow Decay (diffusion-like).
 */
import { ref, watch, onUnmounted } from 'vue';

export function useActivityDecay(trigger: () => number, decayRate = 0.95) {
  const energy = ref(0);
  let rafId: number | null = null;

  const update = () => {
    if (energy.value > 0.01) {
      energy.value *= decayRate; // Exponential dissipation
      rafId = requestAnimationFrame(update);
    } else {
      energy.value = 0;
      rafId = null;
    }
  };

  watch(trigger, () => {
    energy.value = 1.0; // Instant "Energize"
    if (rafId === null) rafId = requestAnimationFrame(update);
  });

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  return energy;
}
