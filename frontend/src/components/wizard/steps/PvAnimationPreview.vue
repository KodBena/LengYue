<!--
  src/components/wizard/steps/PvAnimationPreview.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * The ANIMATED half of the wizard's PV-display step, isolated into its
 * own leaf per ADR-0010's render-locality corollary (commission row
 * 748/749 defect 5): `displayStones` re-renders on every animation
 * frame, and if a mode/annotation `<select>` were read in the same
 * template, every tick would re-run the whole step's render and
 * Vue's <select> value-sync would reset an open dropdown mid-
 * interaction (the UI #1 model-select flicker class, different tick
 * source, same cure: the high-frequency reads live HERE, the parent
 * renders this leaf once and never re-renders on animation state).
 * EngineModelSelect.vue is the worked precedent.
 *
 * Commission row 795: the mode was previously chosen by a ‹/›
 * button pair here, auto-advancing every AUTO_ADVANCE_MS on a
 * setInterval — both jarring (commissioner verbatim) and, worse, a
 * hazard for this leaf's own render-locality contract: an interval
 * that WRITES `mode` on its own schedule is exactly the kind of
 * high-frequency state this leaf isolation was built to keep out of
 * a template that also renders a `<select>`. The mode picker (a
 * `<select>`) now lives in the PARENT — formerly `WizardStepPvAnimation.vue`,
 * merged into `WizardStepDemoBoard.vue` (ledger rows 1357/1358, so
 * the demo board and the PV controls read as one screen) — alongside
 * the annotation `<select>` it already hosts safely, because the
 * parent's template reads no animation-frame state — see that file's
 * header for why co-locating the two selects there is the
 * isolation-preserving placement. This leaf only READS the mode (to
 * know when to restart the preview) and never renders it.
 */
import { computed, onUnmounted, watch } from 'vue';
import { usePvAnimation, type PvMode, type PvMove } from '../../../composables/board/use-pv-animation';
import { store } from '../../../store';

const props = defineProps<{
  /** Getter, not a reactive array read in the PARENT's render — the
   *  parent template passes the function once and never subscribes. */
  getPvMoves: () => PvMove[];
}>();

const { startPv, stopPv, displayStones } = usePvAnimation(() => store.session.ui.pvAnimation);

// Read-only here — the mode is SET by the parent's <select> (writing
// `store.session.ui.pvAnimation.mode`, the same cell `usePvAnimation`'s
// `getConfig` already watches above). This leaf only reads it to know
// when to restart the preview animation; it never renders it, so a
// mode change re-runs this computed but not any `<select>`'s render.
const mode = computed<PvMode>(() => store.session.ui.pvAnimation.mode);
const showNumbers = computed(() => store.session.ui.pvAnimation.annotation !== 'none');
const pvMoves = computed(() => props.getPvMoves());

function replay(): void {
  if (pvMoves.value.length === 0) return;
  startPv(pvMoves.value);
}

// Restart whenever the mode or the PV (numbering base included)
// changes — a mode switch with no restart would let the OLD mode's
// schedule finish out.
watch([mode, pvMoves], () => replay(), { immediate: true });

onUnmounted(() => {
  stopPv();
});
</script>

<template>
  <div class="pv-animation-preview">
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

.pv-preview {
  display: flex; gap: var(--space-tight); flex-wrap: wrap; justify-content: center;
  min-height: 32px; padding: var(--space-default); border: 1px solid var(--border-2); border-radius: var(--radius-default);
}
.pv-stone {
  width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: var(--text-emphasis);
}
.pv-stone.is-black { background: #000; color: #fff; border: 1px solid var(--border-3); }
.pv-stone.is-white { background: #fff; color: #000; border: 1px solid var(--border-3); }
.pv-empty { color: var(--text-2); font-size: var(--text-emphasis); }
</style>
