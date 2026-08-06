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

    <div class="field">
      <label>{{ t('visitsLerp.multiplierLabel') }}</label>
      <input
        v-model.number="a"
        type="number"
        step="0.01"
        class="dark-input num-input"
      />
    </div>

    <div class="field">
      <label>{{ t('visitsLerp.offsetLabel') }}</label>
      <input
        v-model.number="b"
        type="number"
        step="1"
        class="dark-input num-input"
      />
    </div>

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
.hint { font-size: var(--text-body); color: var(--text-2); line-height: 1.5; margin: 0 0 var(--space-medium) 0; }
.field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-medium); margin-bottom: var(--space-tight); }
.field label { font-size: var(--text-emphasis); color: var(--text-1); }
.num-input { width: 100px; }
.actions { margin-top: var(--space-medium); }
.action-btn.reset-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.action-btn.reset-btn:disabled { opacity: 0.5; cursor: default; }
</style>
