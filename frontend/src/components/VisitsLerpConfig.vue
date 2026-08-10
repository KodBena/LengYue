<!--
  src/components/VisitsLerpConfig.vue
  "Other" tab config surface for the session-ephemeral a/b LERP
  override on card-specific visit counts (wiki wanted-feature 3,
  ledger rows 503/504). See `state/visits-lerp.ts` for the transform,
  the session-ephemeral rationale, and why this deliberately does NOT
  persist via the qeuboToolbarView idiom.

  Idiom: follows the Other tab's existing CardMetadataPanel-style
  `.field` (label + numeric input) shape and KeybindingRow-style
  reset-button affordance — no novelty (ADR-0019).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  visitsLerpParams,
  visitsLerpAError,
  setVisitsLerpA,
  setVisitsLerpB,
  resetVisitsLerp,
  DEFAULT_VISITS_LERP,
} from '../state/visits-lerp';

const { t } = useI18n();

const a = computed({
  get: () => visitsLerpParams.value.a,
  set: (v: number) => setVisitsLerpA(v),
});
const b = computed({
  get: () => visitsLerpParams.value.b,
  set: (v: number) => setVisitsLerpB(v),
});

const isDefault = computed(
  () => visitsLerpParams.value.a === DEFAULT_VISITS_LERP.a
     && visitsLerpParams.value.b === DEFAULT_VISITS_LERP.b,
);
</script>

<template>
  <div class="visits-lerp-config">
    <p class="hint">{{ t('visitsLerp.hint') }}</p>

    <!-- M21 (audit finding, ledger row 1292): plain domain names in
         the labels; the a/b coefficient letters (and the a·x + b
         formula) demoted to `title` tooltips, matching the app's
         existing tooltip convention. -->
    <div class="field">
      <label :title="t('visitsLerp.multiplierHint')">{{ t('visitsLerp.multiplierLabel') }}</label>
      <input
        v-model.number="a"
        type="number"
        step="0.01"
        class="dark-input num-input"
        :title="t('visitsLerp.multiplierHint')"
      />
    </div>
    <!-- wiki2-card-visit-ranges: explicate the allowed range next to each
         input as plain math-style text — a ∈ (0, ∞), i.e. a positive
         multiplier (zero or negative would floor every result to the
         minimum visits count via lerpVisits's clamp, defeating the
         multiplier's purpose). ENFORCED, not just a hint (ledger row
         1625) — see visits-lerp.ts's setVisitsLerpA. -->
    <p class="range-hint">{{ t('visitsLerp.multiplierRange') }}</p>

    <!-- ENFORCEMENT amendment (ledger row 1625): setVisitsLerpA refuses
         a non-positive/non-finite a loudly (structured error, not a
         silent clamp) — surface that refusal here, same shape as
         PerQueryOverridesConfig.vue's error-line. -->
    <p v-if="visitsLerpAError" class="error-line" role="alert">
      {{ t('visitsLerp.multiplierError', { message: visitsLerpAError }) }}
    </p>

    <div class="field">
      <label :title="t('visitsLerp.offsetHint')">{{ t('visitsLerp.offsetLabel') }}</label>
      <input
        v-model.number="b"
        type="number"
        step="1"
        class="dark-input num-input"
        :title="t('visitsLerp.offsetHint')"
      />
    </div>
    <!-- b ∈ (−∞, ∞): unlike a, b is unrestricted — a negative offset is
         a deliberately supported subtraction (see visits-lerp.ts's
         clamp discipline for how a below-1 raw result floors safely). -->
    <p class="range-hint">{{ t('visitsLerp.offsetRange') }}</p>

    <div class="actions">
      <button
        type="button"
        class="action-btn reset-btn"
        :disabled="isDefault"
        :title="t('visitsLerp.resetTooltip')"
        @click="resetVisitsLerp"
      >{{ t('visitsLerp.resetButton') }}</button>
    </div>
  </div>
</template>

<style scoped>
.visits-lerp-config { font-family: 'Consolas', monospace; }
.hint { font-size: var(--text-body); color: var(--text-0); line-height: 1.5; margin: 0 0 var(--space-medium) 0; }
.field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-medium); margin-bottom: var(--space-tight); }
.field label { font-size: var(--text-emphasis); color: var(--text-0); }
.num-input { width: 100px; }
/* wiki2-card-visit-ranges: allowed-range hint under each field's input.
   --text-0 per the max-contrast rule (de-emphasis is by size, not by a
   dimmer color token — --text-1/--text-2 no longer exist). */
.range-hint { font-size: var(--text-body); color: var(--text-0); margin: 0 0 var(--space-medium) 0; text-align: right; }
.error-line { color: var(--state-error); font-size: var(--text-body); margin: 0 0 var(--space-medium) 0; text-align: right; }
.actions { margin-top: var(--space-medium); }
.action-btn.reset-btn { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.action-btn.reset-btn:disabled { opacity: 0.5; cursor: default; }
</style>
