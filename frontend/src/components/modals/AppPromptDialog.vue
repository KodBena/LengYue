<script setup lang="ts">
/**
 * src/components/modals/AppPromptDialog.vue
 * Sanctioned in-app replacement for `window.prompt` (ADR-0019 audit
 * S14). Mounted once at `App.vue` level; renders whenever
 * `useAppDialogs.ts`'s `currentDialogRequest` holds a `'prompt'`
 * request. Resolves to the entered string (possibly empty — matches
 * native `prompt()`'s "OK on an empty field returns ''") or `null` on
 * Cancel/Escape/backdrop, the same three-way outcome the 6 renamed
 * call sites already branch on.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { currentDialogRequest, settlePrompt } from '../../composables/useAppDialogs';
import { useModalKeyboard } from '../../composables/useModalKeyboard';

const { t } = useI18n();

const modalContentRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const value = ref('');

const request = computed(() =>
  currentDialogRequest.value?.kind === 'prompt' ? currentDialogRequest.value : null,
);
const isOpen = computed(() => request.value !== null);

// The input's accessible name (review finding, ADR-0019 C20): the
// prior template rendered the prompt's message as a plain <p>, which
// gives the <input> no programmatic label at all — several call sites
// pass no `placeholder` either, so those inputs had zero accessible
// name for assistive tech. A real `<label for>` on the visible prompt
// text (message, falling back to title, falling back to a generic
// catalog string) closes this for EVERY call site at once, per
// `HyperparamPromptModal.vue`'s existing `<label :for>` precedent —
// no call site has to remember to pass a label itself.
const INPUT_ID = 'app-prompt-input';
const inputLabel = computed(() => request.value?.message || request.value?.title || t('dialogs.prompt.defaultLabel'));

// Seed the draft from `defaultValue` each time a NEW request opens
// (mirrors native `prompt(message, defaultValue)`). Re-seeding is
// scoped to the open transition, not every re-render, so a value the
// user is mid-typing is never clobbered by the same request's own
// reactivity — the request object itself is replaced wholesale by
// `useAppDialogs`, so `request` only changes identity on a new call.
watch(request, (req) => {
  if (req === null) return;
  value.value = req.defaultValue;
  // useModalKeyboard's own nextTick already focuses the first
  // focusable element (this input); select its seeded text so typing
  // replaces it, matching native prompt()'s pre-selected default.
  void nextTick(() => inputRef.value?.select());
});

function submit(): void {
  settlePrompt(value.value);
}
function cancel(): void {
  settlePrompt(null);
}

useModalKeyboard(modalContentRef, isOpen, cancel);
</script>

<template>
  <div v-if="request" class="modal-backdrop" @mousedown.self="cancel">
    <div
      ref="modalContentRef"
      class="modal-content"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="request.title ? 'app-prompt-title' : undefined"
      :aria-label="request.title ? undefined : request.message"
      tabindex="-1"
    >
      <div v-if="request.title" class="modal-header">
        <h2 id="app-prompt-title">{{ request.title }}</h2>
      </div>
      <div class="modal-body">
        <label :for="INPUT_ID" class="prompt-label">{{ inputLabel }}</label>
        <input
          :id="INPUT_ID"
          ref="inputRef"
          v-model="value"
          type="text"
          class="dark-input"
          :placeholder="request.placeholder"
          @keydown.enter="submit"
        />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="cancel">{{ request.cancelLabel }}</button>
        <button type="button" class="btn btn-primary" @click="submit">{{ request.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  /* NO backdrop tint — commissioner ruling (see SetupWizardModal.vue). */
  background: transparent;
  display: flex; align-items: center; justify-content: center;
}
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 92vw;
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); }
.modal-body { padding: var(--space-medium); color: var(--text-0); font-size: var(--text-emphasis); display: flex; flex-direction: column; gap: var(--space-default); }
.prompt-label { display: block; margin: 0; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); border-radius: var(--radius-default);
  font-family: inherit; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-default); padding: var(--space-medium);
  border-top: 1px solid var(--surface-3);
}
.btn {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border: 1px solid transparent; border-radius: var(--radius-default); cursor: pointer;
}
.btn-secondary { background: var(--surface-0); border-color: var(--border-2); color: var(--text-0); }
.btn-primary { background: var(--surface-0); border-color: var(--border-2); color: var(--accent-primary); font-weight: bold; }
</style>
