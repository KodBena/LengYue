<!--
  src/components/wizard/steps/WizardStepPvAnimation.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (f) — PV-DISPLAY ANIMATION. Cycles through the three
 * `usePvAnimation` modes (`instant` / `sequential` / `window`) and
 * the `annotation` (numbering) setting, naming the relevant knobs as
 * each mode shows. Every control here writes
 * `session.ui.pvAnimation` — the SAME cell `BoardWidget.vue` /
 * `MoveSuggestions.vue` read on every real board via
 * `usePvAnimation`'s `getConfig` (ADR-0012: one fact, one home).
 *
 * Scope decision (recorded per the umbrella's "load-bearing decision
 * names what was rejected" convention): the live preview below drives
 * its OWN `usePvAnimation()` instance against the demo board's top
 * move's captured PV (`useSetupWizardDemoBoard.ts`'s `topPv`),
 * rendered as a simple fading coordinate list — NOT a synthetic mouse
 * hover injected into `MoveSuggestions.vue`'s real hover-driven PV
 * trigger. Rejected: reusing `MoveSuggestions` directly, because its
 * PV reveal is hover-event-driven with no imperative "start" entry
 * point, and faking `mouseenter`/`mouseleave` DOM events on its
 * internal suggestion elements would mean reaching into a sibling
 * component's private event wiring rather than composing its public
 * surface — exactly the kind of forked-internals coupling ADR-0010's
 * "reuse the real component" instruction is aimed at avoiding. The
 * config cell is the one real fact and IS reused; only the render of
 * "watch it animate" is step-local. A real hover on the demo board's
 * own suggestion markers (step d, when `showMoveSuggestions` is on)
 * shows the SAME config applied through the real component too.
 */
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { usePvAnimation, type PvMode, type PvAnnotation, type PvMove } from '../../../composables/board/use-pv-animation';
import { useSetupWizardDemoBoard } from '../../../composables/useSetupWizardDemoBoard';
import { fromGtp } from '../../../engine/util';
import { store, touchSession } from '../../../store';

const PV_MODES: readonly PvMode[] = ['instant', 'sequential', 'window'];
const ANNOTATIONS: readonly PvAnnotation[] = ['none', 'from1', 'fromCurrent'];
const AUTO_ADVANCE_MS = 4000;

const { board, topPv } = useSetupWizardDemoBoard();

const pvMoves = computed<PvMove[]>(() => {
  if (!board.value) return [];
  let color = board.value.turn;
  const out: PvMove[] = [];
  topPv.value.forEach((coord, i) => {
    const xy = fromGtp(coord, 19);
    if (xy) out.push({ x: xy.x, y: xy.y, color, moveNumber: i + 1 });
    color = color === 'B' ? 'W' : 'B';
  });
  return out;
});

const { startPv, stopPv, displayStones } = usePvAnimation(() => store.session.ui.pvAnimation);

const mode = computed<PvMode>({
  get: () => store.session.ui.pvAnimation.mode,
  set: (v) => { store.session.ui.pvAnimation.mode = v; touchSession(); },
});
const annotation = computed<PvAnnotation>({
  get: () => store.session.ui.pvAnimation.annotation,
  set: (v) => { store.session.ui.pvAnimation.annotation = v; touchSession(); },
});

const modeIndex = computed(() => PV_MODES.indexOf(mode.value));

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

// Restart the preview whenever the mode (or the PV itself, once the
// demo board finishes loading) changes — a mode switch with no
// restart would leave the OLD mode's schedule finishing out.
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
  <div class="wizard-step-pv-animation">
    <p class="step-description">{{ $t('wizard.step.pvAnimation.description') }}</p>

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
        {{ annotation !== 'none' ? s.moveNumber : '' }}
      </span>
      <span v-if="pvMoves.length === 0" class="pv-empty">{{ $t('wizard.pvAnimation.noPreview') }}</span>
    </div>

    <label class="field-label" for="wizard-pv-annotation">{{ $t('wizard.pvAnimation.annotationLabel') }}</label>
    <select id="wizard-pv-annotation" v-model="annotation" class="dark-select">
      <option v-for="a in ANNOTATIONS" :key="a" :value="a">{{ $t(`wizard.pvAnimation.annotation.${a}`) }}</option>
    </select>
  </div>
</template>

<style scoped>
.wizard-step-pv-animation { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; }

.mode-switcher { display: flex; align-items: center; gap: var(--space-default); justify-content: center; }
.nav-btn {
  width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-3);
  background: var(--surface-1); color: var(--text-0); font-size: var(--text-heading); cursor: pointer;
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

.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}
</style>
