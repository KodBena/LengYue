<!--
  src/components/knobs/KnobSlider.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Scalar-knob slider widget — the unified UI primitive for every
 * `inputs.length === 1` KnobDecl in the registry (knob-registry
 * Phase 3b). One-dimensional UI control over a one-dimensional
 * quantity per the plan §6's widget dispatch policy.
 *
 * Reads the current value via the substrate's path walk; writes
 * through `writeKnobValue` so the policy dispatch machinery (claim
 * state, soft-release-on-manual-write) engages on every drag. The
 * disabled state and tooltip derive from the per-knob claim — a
 * hard-claimed knob renders the slider disabled, with the holder's
 * `consumerId` (and optional `reason`) surfaced in the title.
 *
 * The widget is widget-only — no business logic, no domain
 * knowledge, no Go-specific vocabulary. Band 1 per ADR-0003;
 * displaceable to any future cross-domain editor surface without
 * modification.
 */

import { computed, onUnmounted, ref } from 'vue';
import { store } from '../../store';
import {
  readKnob,
  writeKnobValue,
  currentClaim,
  onClaimChange,
} from '../../lib/knobs';
import type { ConsumerClaim, KnobId } from '../../types';

const props = defineProps<{
  /** Registry key of the KnobDecl this slider drives. */
  knobId: KnobId;
}>();

// Reactive registry lookup — picks up post-hydrate seeding and any
// future user-side decl mutations without re-mounting the widget.
const decl = computed(() =>
  store.profile.settings.knobs[props.knobId] ?? null,
);

const range = computed<readonly [number, number]>(() => {
  const r = decl.value?.inputs[0]?.range;
  return r ?? ([0, 1] as const);
});

const path = computed(() => decl.value?.outputs[0]?.path ?? '');

/**
 * Step size derived from the range span — small enough to feel
 * smooth, coarse enough to land on tidy values. Three buckets:
 *
 *   span ≤ 2  → 0.01  (e.g. opacity 0..1, threshold 0..1)
 *   span ≤ 50 → 0.1   (e.g. small float-range tunings)
 *   else      → 1     (e.g. hue offset -180..180, watchdog 50..5000)
 *
 * A future `KnobInputDecl.step` field would override; for v1 the
 * heuristic covers every motivating scalar.
 */
const step = computed(() => {
  const span = range.value[1] - range.value[0];
  if (span <= 2) return 0.01;
  if (span <= 50) return 0.1;
  return 1;
});

const precision = computed(() => {
  const s = step.value;
  if (s >= 1) return 0;
  if (s >= 0.1) return 1;
  return 2;
});

const value = computed(() => {
  if (!path.value) return 0;
  try {
    return readKnob(store, path.value);
  } catch {
    // The registry decl points at a path that doesn't resolve.
    // The render shouldn't break; `validateRegistry` (wired in
    // bootstrap) raises this loudly elsewhere. Return the range
    // lo so the slider sits at a sensible default until the path
    // is fixed.
    return range.value[0];
  }
});

const displayValue = computed(() => value.value.toFixed(precision.value));

// ── Claim-state reactivity ───────────────────────────────────────

const claim = ref<ConsumerClaim | null>(currentClaim(props.knobId));
const unsubscribe = onClaimChange((event) => {
  if (event.knobId === props.knobId) {
    claim.value = event.next;
  }
});
onUnmounted(unsubscribe);

const disabled = computed(() => claim.value?.policy === 'hard');
const disabledTitle = computed(() => {
  if (!disabled.value) return '';
  const c = claim.value!;
  const reason = c.reason ? ` (${c.reason})` : '';
  return `Controlled by ${c.consumerId}${reason}`;
});

// ── User input ───────────────────────────────────────────────────

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  // The substrate's policy machinery decides: write succeeds against
  // an unclaimed knob, refuses loudly against a hard-claimed knob (the
  // belt-and-braces guard for the disabled-widget case), and releases
  // a soft claim before writing. The return value names which path
  // ran but the widget doesn't need to surface it — the value
  // computed re-reads on the next tick.
  writeKnobValue(
    store,
    store.profile.settings.knobs,
    props.knobId,
    [n],
    { kind: 'manual' },
  );
}
</script>

<template>
  <div v-if="decl" class="knob-slider-row">
    <label class="knob-slider-label">
      <span>{{ decl.label ?? decl.id }}</span>
      <span class="knob-slider-value">{{ displayValue }}</span>
    </label>
    <input
      type="range"
      :min="range[0]"
      :max="range[1]"
      :step="step"
      :value="value"
      :disabled="disabled"
      :title="disabledTitle"
      class="knob-slider-input"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.knob-slider-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  margin-bottom: var(--space-default);
}
.knob-slider-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-emphasis);
  color: var(--text-1);
}
.knob-slider-value {
  font-family: monospace;
  color: var(--text-0);
}
.knob-slider-input {
  width: 100%;
}
.knob-slider-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
