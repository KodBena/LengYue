<!--
  src/components/PerQueryOverridesConfig.vue
  "Other" tab config surface for the session-ephemeral blanket JSON
  override merged into every outgoing analysis query's engine
  overrideSettings (wiki wanted-feature 2, ledger rows 510/511) — PDA
  (`playoutDoublingAdvantage`) is the motivating example. See
  `state/per-query-overrides.ts` for the merge semantics, validation,
  and session-ephemeral rationale.

  Idiom: the freeform-JSON textarea follows RegistryEditor's
  `expression-input` idiom (`components/editors/RegistryEditor.vue`,
  the `moveFilterExpression`-style freeform text field) — the closest
  existing precedent for "the user types structured text the app
  parses," rather than inventing a new widget (ADR-0019).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  perQueryOverridesText,
  perQueryOverridesError,
  setPerQueryOverridesText,
  resetPerQueryOverrides,
} from '../state/per-query-overrides';

const { t } = useI18n();

function handleInput(e: Event): void {
  // DOM cast: the template's only listener on this handler is the
  // textarea's native `input` event, so `e.target` is always this
  // element — standard `Event` → concrete-element narrowing, not a
  // domain-shape coercion.
  setPerQueryOverridesText((e.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="per-query-overrides-config">
    <p class="hint">{{ t('perQueryOverrides.hint') }}</p>

    <textarea
      class="dark-input expression-input"
      spellcheck="false"
      :placeholder="t('perQueryOverrides.placeholder')"
      :value="perQueryOverridesText"
      @input="handleInput"
    ></textarea>

    <p v-if="perQueryOverridesError" class="error-line" role="alert">
      {{ t('perQueryOverrides.error', { message: perQueryOverridesError }) }}
    </p>

    <div class="actions">
      <button
        type="button"
        class="action-btn reset-btn"
        :disabled="perQueryOverridesText.length === 0"
        :title="t('perQueryOverrides.resetTooltip')"
        @click="resetPerQueryOverrides"
      >{{ t('perQueryOverrides.resetButton') }}</button>
    </div>
  </div>
</template>

<style scoped>
.per-query-overrides-config { font-family: 'Consolas', monospace; }
.hint { font-size: var(--text-body); color: var(--text-2); line-height: 1.5; margin: 0 0 var(--space-medium) 0; }
.expression-input { width: 100%; min-height: 4.5em; box-sizing: border-box; resize: vertical; font-family: 'Consolas', monospace; font-size: var(--text-body); }
.error-line { color: var(--state-error); font-size: var(--text-body); margin: var(--space-tight) 0 0 0; }
.actions { margin-top: var(--space-medium); }
.action-btn.reset-btn { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-1); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.action-btn.reset-btn:disabled { opacity: 0.5; cursor: default; }
</style>
