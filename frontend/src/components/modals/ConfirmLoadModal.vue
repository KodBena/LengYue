<script setup lang="ts">
/**
 * src/components/modals/ConfirmLoadModal.vue
 * Modal dialog presented when the user attempts to load a card while
 * the active board has non-trivial state. Resolves to a structured
 * { action, remember } pair; the caller is responsible for honoring
 * the remember flag (typically by persisting `action` as the user's
 * default for the next dirty-board encounter).
 *
 * License: Public Domain (The Unlicense).
 */
import { ref } from 'vue';

type LoadAction = 'new' | 'overwrite' | 'cancel';
export interface LoadResult {
  readonly action: LoadAction;
  readonly remember: boolean;
}

const isOpen = ref(false);
const remember = ref(false);
let resolvePromise: ((result: LoadResult) => void) | null = null;

defineExpose({
  open(): Promise<LoadResult> {
    isOpen.value = true;
    remember.value = false;
    return new Promise(resolve => {
      resolvePromise = resolve;
    });
  }
});

function handle(action: LoadAction) {
  isOpen.value = false;
  if (resolvePromise) {
    resolvePromise({
      action,
      remember: remember.value && action !== 'cancel',
    });
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="handle('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('confirmLoad.title') }}</h2>
      </div>
      <div class="modal-body">
        <p>{{ $t('confirmLoad.body') }}</p>

        <div class="checkbox-row">
          <input type="checkbox" id="remember-cb" v-model="remember" />
          <label for="remember-cb">{{ $t('confirmLoad.rememberLabel') }}</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="handle('cancel')">{{ $t('confirmLoad.button.cancel') }}</button>
        <button class="btn-overwrite" @click="handle('overwrite')">{{ $t('confirmLoad.button.overwrite') }}</button>
        <button class="btn-submit" @click="handle('new')">{{ $t('confirmLoad.button.openInNewTab') }}</button>
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
   MintCardModal.vue (same value); narrow enough to feel focused on
   non-tiny screens, wide enough for typical form content. LoginModal
   uses 360px for its narrower auth form. Modal-width substrate not
   pursued — 3 sites at 2 distinct values is a thin cluster. */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; }
.modal-body { padding: var(--space-medium); color: var(--text-1); font-size: var(--text-emphasis); }
.checkbox-row { margin-top: var(--space-medium); display: flex; align-items: center; gap: var(--space-default); }
.checkbox-row label { cursor: pointer; color: var(--text-1); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-overwrite { background: transparent; border: 1px solid var(--state-attention); color: var(--state-attention); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
</style>
