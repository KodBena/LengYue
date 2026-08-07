<!--
  src/components/wizard/steps/PvAnimationPreview.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * The ANIMATED half of the wizard's PV-display step, isolated into its
 * own leaf per ADR-0010's render-locality corollary (commission row
 * 748/749 defect 5): `displayStones` re-renders on every animation
 * frame and the auto-advance interval writes `mode` every few seconds
 * — with both read in the parent step's template, every tick re-ran
 * the whole step's render and Vue's <select> value-sync reset the
 * annotation dropdown mid-interaction (the UI #1 model-select flicker
 * class, different tick source, same cure: the high-frequency reads
 * live HERE, the parent renders this leaf once and never re-renders
 * on animation state). EngineModelSelect.vue is the worked precedent.
 */
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { usePvAnimation, type PvMode, type PvMove } from '../../../composables/board/use-pv-animation';
import { store, touchSession } from '../../../store';

const props = defineProps<{
  /** Getter, not a reactive array read in the PARENT's render — the
   *  parent template passes the function once and never subscribes. */
  getPvMoves: () => PvMove[];
}>();

const PV_MODES: readonly PvMode[] = ['instant', 'sequential', 'window'];
const AUTO_ADVANCE_MS = 4000;

const { startPv, stopPv, displayStones } = usePvAnimation(() => store.session.ui.pvAnimation);

const mode = computed<PvMode>({
  get: () => store.session.ui.pvAnimation.mode,
  set: (v) => { store.session.ui.pvAnimation.mode = v; touchSession(); },
});
const modeIndex = computed(() => PV_MODES.indexOf(mode.value));
const showNumbers = computed(() => store.session.ui.pvAnimation.annotation !== 'none');
const pvMoves = computed(() => props.getPvMoves());

function replay(): void {
  if (pvMoves.value.length === 0) return;
  startPv(pvMoves.value);
}

function goToMode(index: number): void {
  const wrapped = ((index % PV_MODES.length) + PV_MODES.length) % PV_MODES.length;
  mode.value = PV_MODES[wrapped];
}
function nextMode(): void { goToMode(modeIndex.value + 1); }
function prevMode(): void { goToMode(modeIndex.value - 1); }

// Restart whenever the mode or the PV (numbering base included)
// changes — a mode switch with no restart would let the OLD mode's
// schedule finish out.
watch([mode, pvMoves], () => replay(), { immediate: true });

let autoAdvanceTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  // Production-only animation interval — never awaited by a test
  // (tests drive `nextMode`/`prevMode` directly under fake timers).
  autoAdvanceTimer = setInterval(nextMode, AUTO_ADVANCE_MS);
});
onUnmounted(() => {
  if (autoAdvanceTimer !== null) clearInterval(autoAdvanceTimer);
  stopPv();
});
</script>

<template>
  <div class="pv-animation-preview">
    <div class="mode-switcher">
      <button type="button" class="nav-btn" @click="prevMode">‹</button>
      <div class="mode-label">
        <span class="mode-name">{{ $t(`wizard.pvAnimation.mode.${mode}`) }}</span>
        <span class="mode-settings">{{ $t(`wizard.pvAnimation.mode.${mode}.settings`) }}</span>
      </div>
      <button type="button" class="nav-btn" @click="nextMode">›</button>
    </div>

    <div class="pv-preview" aria-live="polite">
      <span
        v-for="s in displayStones"
        :key="s.moveNumber"
        class="pv-stone"
        :class="s.color === 'B' ? 'is-black' : 'is-white'"
        :style="{ opacity: s.opacity }"
      >
        {{ showNumbers ? s.moveNumber : '' }}
      </span>
      <span v-if="pvMoves.length === 0" class="pv-empty">{{ $t('wizard.pvAnimation.noPreview') }}</span>
    </div>
  </div>
</template>

<style scoped>
.pv-animation-preview { display: flex; flex-direction: column; gap: var(--space-default); }

.mode-switcher { display: flex; align-items: center; gap: var(--space-default); justify-content: center; }
.nav-btn {
  width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-3);
  background: var(--surface-0); color: var(--text-0); font-size: var(--text-heading); cursor: pointer; /* surface-0 per rows 681/742 */
}
.mode-label { display: flex; flex-direction: column; align-items: center; min-width: 220px; }
.mode-name { color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase; font-weight: bold; }
.mode-settings { color: var(--text-2); font-size: var(--text-emphasis); text-align: center; }

.pv-preview {
  display: flex; gap: var(--space-tight); flex-wrap: wrap; justify-content: center;
  min-height: 32px; padding: var(--space-default); border: 1px solid var(--border-2); border-radius: var(--radius-default);
}
.pv-stone {
  width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: var(--text-emphasis); transition: opacity 200ms ease;
}
.pv-stone.is-black { background: #000; color: #fff; border: 1px solid var(--border-3); }
.pv-stone.is-white { background: #fff; color: #000; border: 1px solid var(--border-3); }
.pv-empty { color: var(--text-2); font-size: var(--text-emphasis); }
</style>
