<script setup lang="ts">
/**
 * src/components/ConfirmLoadModal.vue
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
        <h2>Board in Use</h2>
      </div>
      <div class="modal-body">
        <p>The current board has moves. How would you like to load this position?</p>
        
        <div class="checkbox-row">
          <input type="checkbox" id="remember-cb" v-model="remember" />
          <label for="remember-cb">Remember my decision</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="handle('cancel')">Cancel</button>
        <button class="btn-overwrite" @click="handle('overwrite')">Overwrite Current</button>
        <button class="btn-submit" @click="handle('new')">Open in New Tab</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.modal-content {
  background: var(--surface-1); border: 1px solid var(--border-2); border-radius: 6px;
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: 12px 15px; border-bottom: 1px solid var(--surface-3); background: var(--surface-2); }
.modal-header h2 { margin: 0; font-size: 14px; color: var(--text-0); text-transform: uppercase; }
.modal-body { padding: 15px; color: var(--text-1); font-size: 12px; }
.checkbox-row { margin-top: 15px; display: flex; align-items: center; gap: 8px; }
.checkbox-row label { cursor: pointer; color: var(--text-1); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px; padding: 12px 15px;
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: 6px 12px; border-radius: 3px; cursor: pointer; }
.btn-cancel:hover { background: var(--surface-3); color: var(--text-0); }
.btn-overwrite { background: transparent; border: 1px solid var(--state-attention); color: var(--state-attention); padding: 6px 12px; border-radius: 3px; cursor: pointer; }
.btn-overwrite:hover { background: color-mix(in srgb, var(--state-attention) 10%, transparent); }
/* theme-exception: .btn-submit:hover #5bc0ff is a lightened-accent
   variant; same rationale as MintCardModal's btn-submit hover. */
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: 6px 15px; border-radius: 3px; cursor: pointer; }
.btn-submit:hover { background: #5bc0ff; }
</style>
