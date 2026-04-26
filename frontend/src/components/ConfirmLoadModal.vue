<!-- 
  src/components/ConfirmLoadModal.vue
  Custom Vue modal to handle navigation logic with a "Remember" checkbox.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref } from 'vue';

type LoadAction = 'new' | 'overwrite' | 'cancel';

const isOpen = ref(false);
const remember = ref(false);
let resolvePromise: ((action: LoadAction) => void) | null = null;

defineExpose({
  open(): Promise<LoadAction> {
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
    // If they checked "Remember", we pass that fact out so the caller can save it.
    // We append '-saved' to the action to signal this.
    resolvePromise(remember.value && action !== 'cancel' ? (action + '-saved') as LoadAction : action);
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
  background: #111; border: 1px solid #333; border-radius: 6px;
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: 12px 15px; border-bottom: 1px solid #222; background: #181818; }
.modal-header h2 { margin: 0; font-size: 14px; color: #fff; text-transform: uppercase; }
.modal-body { padding: 15px; color: #ccc; font-size: 12px; }
.checkbox-row { margin-top: 15px; display: flex; align-items: center; gap: 8px; }
.checkbox-row label { cursor: pointer; color: #aaa; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px; padding: 12px 15px;
  border-top: 1px solid #222; background: #181818;
}
.btn-cancel { background: transparent; border: 1px solid #444; color: #aaa; padding: 6px 12px; border-radius: 3px; cursor: pointer; }
.btn-cancel:hover { background: #222; color: #fff; }
.btn-overwrite { background: transparent; border: 1px solid #ff4a4a; color: #ff4a4a; padding: 6px 12px; border-radius: 3px; cursor: pointer; }
.btn-overwrite:hover { background: rgba(255, 74, 74, 0.1); }
.btn-submit { background: #4aaef0; border: none; color: #111; font-weight: bold; padding: 6px 15px; border-radius: 3px; cursor: pointer; }
.btn-submit:hover { background: #5bc0ff; }
</style>
