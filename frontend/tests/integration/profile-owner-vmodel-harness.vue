<script setup lang="ts">
/**
 * tests/integration/profile-owner-vmodel-harness.vue
 *
 * Test harness mirroring `AnalysisControls.vue`'s owner-routed
 * v-model wiring shape exactly (a WritableComputed whose getter
 * reads the store leaf and whose setter routes the identical leaf
 * assignment through `mutateProfile`), compiled by the real SFC
 * pipeline so the test drives Vue's actual v-model code paths —
 * including the `.number` modifier's coercion — rather than a
 * hand-rolled reimplementation. Consumed by
 * `profile-owner.test.ts` only.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { store } from '../../src/store';
import { mutateProfile } from '../../src/store/profile-owner';

const adaptiveEnabled = computed({
  get: () => store.profile.settings.engine.katago.adaptiveReevaluate.enabled,
  set: (v: boolean) => mutateProfile((p) => {
    p.settings.engine.katago.adaptiveReevaluate.enabled = v;
  }),
});

const adaptiveWorstQuantile = computed({
  get: () => store.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile,
  set: (v: number) => mutateProfile((p) => {
    p.settings.engine.katago.adaptiveReevaluate.worstQuantile = v;
  }),
});
</script>

<template>
  <input class="enabled" type="checkbox" v-model="adaptiveEnabled" />
  <input class="quantile" type="number" v-model.number="adaptiveWorstQuantile" />
</template>
