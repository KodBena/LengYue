<!--
  src/components/wizard/WizardStepIndicator.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Numbered + NAMED step indicator (ADR-0019 wizard-genre convention —
 * macOS Setup Assistant / JetBrains wizards label every step, not
 * just the current one; audit M18, ledger rows 1390/1397). Purely
 * presentational — reads the step machine's public fields and emits
 * a jump request; owns no navigation logic itself. Every dot other
 * than the current one is clickable, in both directions: nothing
 * gates forward progression (see `useSetupWizard.ts`'s header —
 * `goTo` accepts any index), so a numbered "jump forward" control
 * accurately reflects that the later steps aren't locked. All dots
 * share one neutral styling; the current step carries the sole
 * distinguishing marker (accent border + bold, on both the digit and
 * its label) for orientation. `.step-dot` remains the outer clickable
 * button (a column: digit circle above, name below) so existing
 * `is-current` / `is-clickable` assertions elsewhere (e.g.
 * `SetupWizardModal.test.ts`) keep working unchanged.
 */
import { WIZARD_STEPS } from '../../composables/useSetupWizard';

const props = defineProps<{
  currentIndex: number;
}>();

const emit = defineEmits<{
  (e: 'jump', index: number): void;
}>();

function onDotClick(index: number): void {
  if (index !== props.currentIndex) emit('jump', index);
}
</script>

<template>
  <div class="wizard-step-indicator" role="tablist" :aria-label="$t('wizard.stepIndicator.ariaLabel')">
    <button
      v-for="(id, i) in WIZARD_STEPS"
      :key="id"
      type="button"
      class="step-dot"
      :class="{ 'is-current': i === currentIndex, 'is-clickable': i !== currentIndex }"
      role="tab"
      :aria-selected="i === currentIndex"
      :title="$t(`wizard.step.${id}.title`)"
      @click="onDotClick(i)"
    >
      <span class="step-digit">{{ i + 1 }}</span>
      <span class="step-label">{{ $t(`wizard.step.${id}.title`) }}</span>
    </button>
  </div>
</template>

<style scoped>
.wizard-step-indicator {
  display: flex; align-items: flex-start; gap: var(--space-tight);
}
.step-dot {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; align-items: center; gap: var(--space-tight);
  border: none; background: none; color: var(--text-2); font-family: inherit;
  cursor: default; padding: 0;
}
.step-dot.is-clickable { cursor: pointer; }
.step-digit {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px solid var(--border-3); background: var(--surface-0); color: var(--text-2); /* surface-0 per rows 681/742 */
  font-size: var(--text-emphasis); line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.step-label {
  font-size: var(--text-tiny); color: var(--text-2); text-align: center;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.step-dot.is-current .step-digit { border-color: var(--accent-primary); color: var(--text-0); font-weight: bold; }
.step-dot.is-current .step-label { color: var(--text-0); font-weight: bold; }
</style>
