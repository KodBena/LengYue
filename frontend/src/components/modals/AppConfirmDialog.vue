<script setup lang="ts">
/**
 * src/components/modals/AppConfirmDialog.vue
 * Sanctioned in-app replacement for `window.confirm` / `window.alert`
 * (ADR-0019 audit S14). Mounted once at `App.vue` level; renders
 * whenever `useAppDialogs.ts`'s `currentDialogRequest` holds a
 * `'confirm'` request. `alert()` is the same request shape with
 * `cancelLabel === null`, rendered with a single OK button.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { currentDialogRequest, settleConfirm } from '../../composables/useAppDialogs';
import { useModalKeyboard } from '../../composables/useModalKeyboard';

const modalContentRef = ref<HTMLElement | null>(null);

const request = computed(() =>
  currentDialogRequest.value?.kind === 'confirm' ? currentDialogRequest.value : null,
);
const isOpen = computed(() => request.value !== null);

function accept(): void {
  settleConfirm(true);
}
function cancel(): void {
  settleConfirm(false);
}

// Escape → same close path as Cancel/backdrop (ADR-0019 S5); focus
// trap + initial focus + focus restoration — shared mechanism, see
// useModalKeyboard.ts. A single-button (alert) dialog has no Cancel
// path visually, but Escape must still resolve the promise, so it
// routes to `cancel()` the same as every other dialog — the caller
// never awaits a promise that can hang forever.
useModalKeyboard(modalContentRef, isOpen, cancel);
</script>

<template>
  <div v-if="request" class="modal-backdrop" @mousedown.self="cancel">
    <div
      ref="modalContentRef"
      class="modal-content"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="request.title ? 'app-confirm-title' : undefined"
      :aria-label="request.title ? undefined : request.message"
      tabindex="-1"
    >
      <div v-if="request.title" class="modal-header">
        <h2 id="app-confirm-title">{{ request.title }}</h2>
      </div>
      <div class="modal-body">
        <p>{{ request.message }}</p>
      </div>
      <div class="modal-footer">
        <button v-if="request.cancelLabel !== null" type="button" class="btn btn-secondary" @click="cancel">
          {{ request.cancelLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :class="request.danger ? 'btn-danger' : 'btn-primary'"
          @click="accept"
        >{{ request.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  /* NO backdrop tint — commissioner ruling (see SetupWizardModal.vue):
     diffuse transparent overlays are banned at ANY opacity. The
     element remains only as the centering/click-capture container. */
  background: transparent;
  display: flex; align-items: center; justify-content: center;
}
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 92vw; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); }
.modal-body { padding: var(--space-medium); color: var(--text-1); font-size: var(--text-emphasis); }
.modal-body p { margin: 0; white-space: pre-line; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-default); padding: var(--space-medium);
  border-top: 1px solid var(--surface-3);
}
/* Standard SPA button shape — same tokens as SetupWizardModal.vue's .btn/.btn-primary/.btn-secondary. */
.btn {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border: 1px solid transparent; border-radius: var(--radius-default); cursor: pointer;
}
.btn-secondary { background: var(--surface-0); border-color: var(--border-2); color: var(--text-1); }
.btn-primary { background: var(--surface-0); border-color: var(--border-2); color: var(--accent-primary); font-weight: bold; }
.btn-danger { background: var(--surface-0); border-color: var(--state-error); color: var(--state-error); font-weight: bold; }
</style>
