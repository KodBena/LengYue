<!--
  src/components/wizard/steps/WizardStepDemoBoard.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (d) — DEMO BOARD, the centerpiece. Hydrates a real
 * board (`useSetupWizardDemoBoard.ts`, from the static asset —
 * ZERO network, ZERO engine) and reuses the SAME interactive
 * `BoardWidget.vue` every real board mounts (ADR-0010: a real board
 * leaf, never a forked mini-board). Every checkbox and slider on
 * this step writes the SAME store cell the real Session-UI registry
 * / toolbar-slider-popover own — ADR-0012, one fact, one home; this
 * step is a VIEW over those cells, never a second home.
 *
 * Also covers step (e) — the move-suggestion-filter slider: it is
 * `display.move-filter-threshold`, priority-0 (first) in the knob
 * registry, so it is already the first of the five sliders below.
 * Per the commission's fold-in-and-say-so instruction, step (e) is
 * NOT a separate step.
 *
 * The five sliders are the registry's first five scalar
 * (`inputs.length === 1`) KnobDecls IN ASCENDING PRIORITY ORDER —
 * verified directly against `store/defaults.ts`'s `knobs` object
 * (priorities 0/10/20/30/40), the same ordering
 * `ToolbarSliderPopover.vue` renders. That order differs from the
 * commission text's listed order (which put hue-offset third); the
 * registry is the source of truth and is what's reused here.
 */
import { computed } from 'vue';
import BoardWidget from '../../board/BoardWidget.vue';
import KnobSlider from '../../knobs/KnobSlider.vue';
import { useSetupWizardDemoBoard } from '../../../composables/useSetupWizardDemoBoard';
import { store, touchSession } from '../../../store';
import type { KnobId } from '../../../types';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

const { board, provenance, loadError } = useSetupWizardDemoBoard();

// Sole cast site for this literal list — KnobId brand mint, same
// pattern as `defaults.ts`'s `maxFromKnob` literal. Order verified
// against `store/defaults.ts`'s `knobs` registry (see file header).
const FIRST_FIVE_KNOB_IDS: readonly KnobId[] = [
  'display.move-filter-threshold' as KnobId, // KnobId brand mint: static registry-key literal
  'display.ownership-opacity-ceiling' as KnobId, // KnobId brand mint: static registry-key literal
  'display.ownership-deadband-threshold' as KnobId, // KnobId brand mint: static registry-key literal
  'display.liveness-threshold' as KnobId, // KnobId brand mint: static registry-key literal
  'display.hue-offset' as KnobId, // KnobId brand mint: static registry-key literal
];

const showMoveSuggestions = computed({
  get: () => store.session.ui.showMoveSuggestions,
  set: (v: boolean) => { store.session.ui.showMoveSuggestions = v; touchSession(); },
});
const ownershipContinuous = computed({
  get: () => store.session.ui.overlayLayers.ownership.continuous,
  set: (v: boolean) => { store.session.ui.overlayLayers.ownership.continuous = v; touchSession(); },
});
const ownershipLiveness = computed({
  get: () => store.session.ui.overlayLayers.ownership.liveness,
  set: (v: boolean) => { store.session.ui.overlayLayers.ownership.liveness = v; touchSession(); },
});
</script>

<template>
  <div class="wizard-step-demo-board">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.demoBoard.description') }}</p>

    <p v-if="loadError" class="load-error" role="alert">
      {{ $t('wizard.demoBoard.loadError', { message: loadError }) }}
    </p>

    <div v-else-if="board" class="demo-board-layout">
      <div class="demo-board-mount">
        <BoardWidget :key="board.id" :state="board" />
        <p v-if="provenance" class="demo-provenance">
          {{ $t('wizard.demoBoard.provenance', {
            model: provenance.model, turn: provenance.selectedTurn,
            visits: provenance.analysisVisits,
          }) }}
        </p>
      </div>

      <div class="demo-board-controls">
        <fieldset class="control-group">
          <legend>{{ $t('wizard.demoBoard.togglesLegend') }}</legend>
          <label class="checkbox-row">
            <input type="checkbox" v-model="showMoveSuggestions" />
            {{ $t('wizard.demoBoard.toggle.moveSuggestions') }}
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="ownershipLiveness" />
            {{ $t('wizard.demoBoard.toggle.liveness') }}
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="ownershipContinuous" />
            {{ $t('wizard.demoBoard.toggle.ownershipContinuous') }}
          </label>
        </fieldset>

        <fieldset class="control-group">
          <legend>{{ $t('wizard.demoBoard.slidersLegend') }}</legend>
          <KnobSlider v-for="id in FIRST_FIVE_KNOB_IDS" :key="id" :knob-id="id" />
        </fieldset>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-step-demo-board { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
.load-error { color: var(--state-error); font-weight: bold; }

.demo-board-layout { display: flex; gap: var(--space-medium); align-items: flex-start; flex-wrap: wrap; }
.demo-board-mount { flex: 1 1 320px; min-width: 260px; max-width: 420px; }
.demo-provenance { color: var(--text-2); font-size: var(--text-emphasis); margin: var(--space-tight) 0 0 0; }

.demo-board-controls { flex: 1 1 240px; min-width: 220px; display: flex; flex-direction: column; gap: var(--space-medium); }
.control-group { border: 1px solid var(--border-2); border-radius: var(--radius-default); padding: var(--space-default); display: flex; flex-direction: column; gap: var(--space-tight); }
.control-group legend { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; padding: 0 var(--space-tight); }
.checkbox-row { display: flex; align-items: center; gap: var(--space-tight); color: var(--text-1); font-size: var(--text-emphasis); }
</style>
