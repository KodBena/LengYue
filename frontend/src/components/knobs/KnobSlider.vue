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
import { useI18n } from 'vue-i18n';
import { store } from '../../store';
import {
  readKnob,
  writeKnobValue,
  currentClaim,
  onClaimChange,
} from '../../lib/knobs';
import type { ConsumerClaim, KnobId } from '../../types';

const { t } = useI18n();

const props = withDefaults(defineProps<{
  /** Registry key of the KnobDecl this slider drives. */
  knobId: KnobId;
  /**
   * Compact horizontal layout — label / slider / value in one row.
   * Used by the toolbar quick-access popover where vertical space
   * is scarce. The Other-tab editor uses the default (compact:
   * false) layout, which stacks label-above-slider for more
   * generous reading.
   */
  compact?: boolean;
}>(), {
  compact: false,
});

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
 * Cross-knob constraint: when `decl.inputs[0].maxFromKnob` is
 * set, the slider's effective max is
 * `min(static-range-max, linked-knob-value)`. The linked-knob
 * read is reactive so a change to the linked knob's stored
 * value reflows the slider's max here. The substrate's
 * `validateRegistry` checks the reference resolves at startup
 * (ADR-0002); this widget is defensive — if the reference
 * silently dangles at render time (e.g. an experiment-time
 * dynamic decl), fall back to the static max rather than
 * throwing on the render path.
 *
 * The stored leaf is NOT auto-clamped when the linked knob's
 * value decreases below it; user preference is preserved. The
 * wire-layer consumer (`analysis-service.ts` for the cadence
 * knobs) applies `Math.min` at send time so the contract
 * reaching the engine is always coherent regardless of stored-
 * leaf state.
 */
const linkedMax = computed<number | null>(() => {
  const linked = decl.value?.inputs[0]?.maxFromKnob;
  if (!linked) return null;
  const linkedDecl = store.profile.settings.knobs[linked];
  if (!linkedDecl) return null;
  const linkedPath = linkedDecl.outputs[0]?.path;
  if (!linkedPath) return null;
  try {
    const v = readKnob(store, linkedPath);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
});

const effectiveMax = computed(() => {
  const linked = linkedMax.value;
  return linked === null ? range.value[1] : Math.min(range.value[1], linked);
});

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

// Display clamped to effectiveMax so the badge agrees with the
// slider thumb's pinned position when the linked-knob constraint
// caps the bound below the stored value. Stored leaf preserves
// the user's preference; only the display is clamped.
const displayValue = computed(() => {
  const clamped = Math.min(value.value, effectiveMax.value);
  return clamped.toFixed(precision.value);
});

/**
 * Resolve the knob's user-facing label through i18n. The convention
 * is `knobRegistry.label.<knobId>` — when the catalog carries that
 * key, the translated string wins. The fallback chain:
 *
 *   1. i18n hit on `knobRegistry.label.<id>` — translated string.
 *   2. `decl.label` — the English literal seeded in defaults /
 *      migrations.
 *   3. `decl.id` — last resort so something always renders.
 *
 * Mirrors `KnobRegistryEditor.vue::domainLabel`'s hint-or-derive
 * pattern; runtime-added decls (e.g. `qeubo.<param>` for
 * user-named parameters) skip step 1 since no catalog entry
 * exists for arbitrary param names, and fall through to `label`
 * (which the migration / `ensureKnobDecl` set to the param name).
 */
const displayLabel = computed<string>(() => {
  if (!decl.value) return '';
  const key = `knobRegistry.label.${decl.value.id}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return decl.value.label ?? decl.value.id;
});

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
  return t('knobRegistry.lockedTooltip', {
    holder: c.consumerId,
    reason: c.reason ? ` (${c.reason})` : '',
  });
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
  <div v-if="decl" :class="['knob-slider-row', { 'knob-slider-compact': compact }]">
    <span class="knob-slider-label-text" :title="displayLabel">{{ displayLabel }}</span>
    <input
      type="range"
      :min="range[0]"
      :max="effectiveMax"
      :step="step"
      :value="value"
      :disabled="disabled"
      :title="disabledTitle"
      class="knob-slider-input"
      @input="onInput"
    />
    <span class="knob-slider-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
/* Default (spacious) layout — used by the Other tab's
   KnobRegistryEditor. Label sits above the slider; value badge
   shares the label row at the right edge via the order property
   below. */
.knob-slider-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "label value" "slider slider";
  column-gap: var(--space-default);
  row-gap: var(--space-tight);
  margin-bottom: var(--space-default);
  font-size: var(--text-emphasis);
}
.knob-slider-label-text {
  grid-area: label;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.knob-slider-value {
  grid-area: value;
  font-family: monospace;
  color: var(--text-0);
}
.knob-slider-input {
  grid-area: slider;
  width: 100%;
}
.knob-slider-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Compact layout — single row, label/slider/value side by side,
   tight margins. Used by ToolbarSliderPopover so the popover fits
   many knobs in minimal vertical space. */
.knob-slider-compact {
  grid-template-columns: minmax(0, 1fr) minmax(120px, 2fr) auto;
  grid-template-areas: "label slider value";
  column-gap: var(--space-default);
  row-gap: 0;
  margin-bottom: var(--space-tight);
  align-items: center;
  font-size: var(--text-body);
}
.knob-slider-compact .knob-slider-input { min-width: 0; }
</style>
