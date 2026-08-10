<!--
  src/components/wizard/steps/WizardStepDemoBoard.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (d) — DEMO BOARD + PV PLAYBACK, the centerpiece. Merges
 * the former separate "Try the analysis overlays" step and
 * "Principal-variation display" step into ONE screen (commissioner,
 * ledger rows 1357/1358 verbatim: "so it's clear to the user that
 * they can see and test the result of the PV options live"). Both
 * halves already shared the SAME `useSetupWizardDemoBoard()`
 * module-memoised board instance and the SAME `session.ui.pvAnimation`
 * store cell before the merge — see that composable's header and
 * `MoveSuggestions.vue` — so this is a real merge of one screen's
 * worth of state, not two screens papered over.
 *
 * Hydrates a real board (`useSetupWizardDemoBoard.ts`, from the
 * static asset — ZERO network, ZERO engine) and reuses the SAME
 * interactive `BoardWidget.vue` every real board mounts (ADR-0010: a
 * real board leaf, never a forked mini-board). Every checkbox,
 * slider, and PV control on this step writes the SAME store cell the
 * real Session-UI registry / toolbar-slider-popover / PV-hover path
 * own — ADR-0012, one fact, one home; this step is a VIEW over those
 * cells, never a second home.
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
 *
 * ── THE LIVE PV-FEEDBACK MECHANISM (found, not assumed) ──────────
 * `BoardWidget.vue` mounts the real `MoveSuggestions.vue` whenever
 * `store.session.ui.showMoveSuggestions` is true (default `true` per
 * `store/defaults.ts`) and passes it `:pv-config="store.session.ui.
 * pvAnimation"` — the EXACT cell the mode/annotation controls below
 * write. `MoveSuggestions.vue` starts the real `usePvAnimation`
 * playback on `mouseenter` of a suggestion disc, reading that same
 * cfg. So on THIS demo board, with move suggestions on (the default),
 * hovering any suggestion disc plays the PV in whichever mode/
 * annotation was just picked below — genuine live feedback through
 * the real component, not a simulated one. That mechanism needed no
 * new wiring; it already existed because both former steps read/wrote
 * the same cell. The `PvAnimationPreview` leaf below is kept
 * alongside it as a NO-HOVER-REQUIRED preview (auto-replays on every
 * mode/annotation change against the demo position's captured top
 * move, `topPv` below) so a PV-option change is visibly reflected
 * immediately even before the user hovers a suggestion — belt and
 * braces for the one property the commission is about.
 */
import { computed } from 'vue';
import BoardWidget from '../../board/BoardWidget.vue';
import KnobSlider from '../../knobs/KnobSlider.vue';
import PvAnimationPreview from './PvAnimationPreview.vue';
import { useSetupWizardDemoBoard } from '../../../composables/useSetupWizardDemoBoard';
import { type PvAnnotation, type PvMode, type PvMove } from '../../../composables/board/use-pv-animation';
import { fromGtp } from '../../../engine/util';
import { store, touchSession } from '../../../store';
import type { KnobId } from '../../../types';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';

// R7 measure cap — see `WizardStepEngineUri.vue`'s header comment for
// the shared rationale and why a `[data-prose-measure-ch]` attribute
// accompanies the `v-bind` CSS binding below.
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);

const { board, provenance, loadError, topPv } = useSetupWizardDemoBoard();

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

// ── PV playback (formerly WizardStepPvAnimation.vue) ───────────────
//
// Scope decision (recorded per the umbrella's "load-bearing decision
// names what was rejected" convention): the `PvAnimationPreview`
// below drives its OWN `usePvAnimation()` instance against the demo
// board's top move's captured PV (`topPv`), rendered as a simple
// fading coordinate list — NOT a synthetic mouse hover injected into
// `MoveSuggestions.vue`'s real hover-driven PV trigger. Rejected:
// reusing `MoveSuggestions` directly for the auto-preview, because its
// PV reveal is hover-event-driven with no imperative "start" entry
// point, and faking `mouseenter`/`mouseleave` DOM events on its
// internal suggestion elements would mean reaching into a sibling
// component's private event wiring rather than composing its public
// surface — exactly the kind of forked-internals coupling ADR-0010's
// "reuse the real component" instruction is aimed at avoiding. The
// config cell is the one real fact and IS reused by both paths; only
// the render of "watch it animate with no hover" is step-local. A
// real hover on this SAME demo board's own suggestion markers (when
// `showMoveSuggestions` is on, the default) shows the SAME config
// applied through the real component too — see file header.
const ANNOTATIONS: readonly PvAnnotation[] = ['none', 'from1', 'fromCurrent'];
const PV_MODES: readonly PvMode[] = ['instant', 'sequential', 'window'];

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

// Same computed-setter + touchSession() pattern as `annotation` above —
// one fact, one home (ADR-0012): this writes the exact cell both
// `PvAnimationPreview`'s `usePvAnimation(() => store.session.ui.pvAnimation)`
// AND the real `MoveSuggestions`' hover-driven playback already watch,
// so picking a mode here restarts the preview AND changes what a
// suggestion-hover plays next.
const mode = computed<PvMode>({
  get: () => store.session.ui.pvAnimation.mode,
  set: (v) => { store.session.ui.pvAnimation.mode = v; touchSession(); },
});

// The animated preview lives in PvAnimationPreview (leaf isolation,
// commission row 748/749 defect 5, extended by row 795): this parent's
// template reads NO animation-frame state, so the mode and annotation
// <select>s below are never re-rendered by an animation frame. The PV
// list is passed as a GETTER for the same reason.
function getPvMoves(): PvMove[] {
  return pvMoves.value;
}
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

        <fieldset class="control-group">
          <legend>{{ $t('wizard.pvAnimation.legend') }}</legend>
          <p class="pv-step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.pvAnimation.description') }}</p>

          <PvAnimationPreview :get-pv-moves="getPvMoves" />

          <label class="field-label" for="wizard-pv-mode">{{ $t('wizard.pvAnimation.modeLabel') }}</label>
          <select id="wizard-pv-mode" v-model="mode" class="dark-select">
            <option v-for="m in PV_MODES" :key="m" :value="m">{{ $t(`wizard.pvAnimation.mode.${m}`) }}</option>
          </select>
          <p class="mode-settings" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t(`wizard.pvAnimation.mode.${mode}.settings`) }}</p>

          <label class="field-label" for="wizard-pv-annotation">{{ $t('wizard.pvAnimation.annotationLabel') }}</label>
          <select id="wizard-pv-annotation" v-model="annotation" class="dark-select">
            <option v-for="a in ANNOTATIONS" :key="a" :value="a">{{ $t(`wizard.pvAnimation.annotation.${a}`) }}</option>
          </select>
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

.pv-step-description { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}
.mode-settings { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
