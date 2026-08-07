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
import { computed } from 'vue';
import { type PvAnnotation, type PvMove } from '../../../composables/board/use-pv-animation';
import PvAnimationPreview from './PvAnimationPreview.vue';
import { useSetupWizardDemoBoard } from '../../../composables/useSetupWizardDemoBoard';
import { fromGtp } from '../../../engine/util';
import { store, touchSession } from '../../../store';

const ANNOTATIONS: readonly PvAnnotation[] = ['none', 'from1', 'fromCurrent'];

const { board, topPv, provenance } = useSetupWizardDemoBoard();

// Base for 'fromCurrent' numbering: the demo position's own move
// number (the analysed turn from the asset's provenance). Commission
// row 748 defect 4: the preview numbered 1..N in BOTH modes, making
// the "from 1" / "from current move" dropdown a visible no-op — the
// exact thing this step exists to demonstrate.
const currentMoveBase = computed<number>(() => provenance.value?.selectedTurn ?? 0);

const pvMoves = computed<PvMove[]>(() => {
  if (!board.value) return [];
  const base =
    store.session.ui.pvAnimation.annotation === 'fromCurrent' ? currentMoveBase.value : 0;
  let color = board.value.turn;
  const out: PvMove[] = [];
  topPv.value.forEach((coord, i) => {
    const xy = fromGtp(coord, 19);
    if (xy) out.push({ x: xy.x, y: xy.y, color, moveNumber: base + i + 1 });
    color = color === 'B' ? 'W' : 'B';
  });
  return out;
});

const annotation = computed<PvAnnotation>({
  get: () => store.session.ui.pvAnimation.annotation,
  set: (v) => { store.session.ui.pvAnimation.annotation = v; touchSession(); },
});

// The animated preview + mode switcher live in PvAnimationPreview
// (leaf isolation, commission row 748/749 defect 5): this parent's
// template reads NO animation state, so the annotation <select> below
// is never re-rendered by an animation frame or the auto-advance
// interval. The PV list is passed as a GETTER for the same reason.
function getPvMoves(): PvMove[] {
  return pvMoves.value;
}
</script>

<template>
  <div class="wizard-step-pv-animation">
    <p class="step-description">{{ $t('wizard.step.pvAnimation.description') }}</p>

    <PvAnimationPreview :get-pv-moves="getPvMoves" />

    <label class="field-label" for="wizard-pv-annotation">{{ $t('wizard.pvAnimation.annotationLabel') }}</label>
    <select id="wizard-pv-annotation" v-model="annotation" class="dark-select">
      <option v-for="a in ANNOTATIONS" :key="a" :value="a">{{ $t(`wizard.pvAnimation.annotation.${a}`) }}</option>
    </select>
  </div>
</template>

<style scoped>
.wizard-step-pv-animation { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; }

.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}
</style>
