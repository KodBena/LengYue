<script setup lang="ts">
/**
 * src/components/modals/ResetAllKeybindingsModal.vue
 *
 * Destructive-confirm modal for the "Reset all to defaults" action
 * in the Keybindings sub-tab (Phase 4 of keybindings-plan.md).
 * Same promise-returning open() shape as ConfirmLoadModal — caller
 * awaits and acts on the boolean outcome.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref } from 'vue';

const isOpen = ref(false);
let resolvePromise: ((confirmed: boolean) => void) | null = null;

defineExpose({
  open(): Promise<boolean> {
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  },
});

function handle(confirmed: boolean): void {
  isOpen.value = false;
  if (resolvePromise !== null) {
    resolvePromise(confirmed);
    resolvePromise = null;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="handle(false)">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('keybindings.resetAll.title') }}</h2>
      </div>
      <div class="modal-body">
        <p>{{ $t('keybindings.resetAll.body') }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="handle(false)">{{ $t('keybindings.button.cancel') }}</button>
        <button class="btn-destructive" @click="handle(true)">{{ $t('keybindings.resetAll.confirm') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}
/* magic-literal: 420px modal width — design decision shared with
   ConfirmLoadModal.vue and MintCardModal.vue (same value); narrow
   enough to feel focused on non-tiny screens, wide enough for the
   destructive-confirm body text. */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; }
.modal-body { padding: var(--space-medium); color: var(--text-1); font-size: var(--text-emphasis); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-destructive { background: transparent; border: 1px solid var(--state-attention); color: var(--state-attention); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-destructive:hover { background: var(--state-attention); color: var(--surface-1); }
</style>
