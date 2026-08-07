<!--
  src/components/wizard/WizardStepIndicator.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Compact numbered step indicator (ADR-0019 wizard-genre convention).
 * Purely presentational — reads the step machine's public fields and
 * emits a jump request; owns no navigation logic itself. Every dot
 * other than the current one is clickable, in both directions:
 * nothing gates forward progression (see `useSetupWizard.ts`'s
 * header — `goTo` accepts any index), so a numbered "jump forward"
 * control accurately reflects that the later steps aren't locked.
 * All dots share one neutral styling; the current step carries the
 * sole distinguishing marker (accent border + bold) for orientation.
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
      {{ i + 1 }}
    </button>
  </div>
</template>

<style scoped>
.wizard-step-indicator {
  display: flex; align-items: center; gap: var(--space-tight);
}
.step-dot {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px solid var(--border-3); background: var(--surface-0); color: var(--text-2); /* surface-0 per rows 681/742 */
  font-size: var(--text-emphasis); font-family: inherit; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: default; padding: 0;
}
.step-dot.is-clickable { cursor: pointer; }
.step-dot.is-current { border-color: var(--accent-primary); color: var(--text-0); font-weight: bold; }
</style>
