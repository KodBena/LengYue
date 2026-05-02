<script setup lang="ts">
/**
 * src/components/RootErrorBoundary.vue
 * Catches errors propagating from descendant components — render,
 * watcher, lifecycle, event handler, and setup errors — surfaces them
 * via the system log per ADR-0002, and displays a fallback UI with a
 * reload button so the user is not left staring at a white screen.
 *
 * Wraps App.vue's root content in a single boundary at the top of
 * the component tree. Vue 3's `onErrorCaptured` returns false to stop
 * propagation; the global `app.config.errorHandler` in main.ts is the
 * last-resort backstop for errors that don't propagate through this
 * boundary (App.vue's own setup, mount-time errors).
 *
 * Closes auditor-notes.md item #5.
 *
 * License: Public Domain (The Unlicense).
 */
import { ref, onErrorCaptured } from 'vue';
import { pushSystemMessage } from '../store';

const error = ref<Error | null>(null);

onErrorCaptured((err, _instance, info) => {
  console.error('[RootErrorBoundary] Caught error:', err, info);

  const msg = err instanceof Error ? err.message : String(err);
  // pushSystemMessage is mutating store state; if it itself throws
  // (e.g., a future regression in store wiring), don't recurse — log
  // and proceed.
  try {
    pushSystemMessage('error', `Unhandled UI error: ${msg}.`);
  } catch (pushErr) {
    console.error('[RootErrorBoundary] pushSystemMessage failed:', pushErr);
  }

  error.value = err instanceof Error ? err : new Error(msg);

  // Stop propagation. The global errorHandler in main.ts handles
  // anything that escapes this boundary (App.vue setup, mount).
  return false;
});

function reload(): void {
  location.reload();
}
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="reb-overlay">
    <div class="reb-panel">
      <h2 class="reb-title">Something went wrong</h2>
      <p class="reb-text">
        The application hit an unexpected error. The system log has
        the details. Reload the page to continue.
      </p>
      <pre v-if="error.message" class="reb-message">{{ error.message }}</pre>
      <button @click="reload" class="reb-reload">Reload page</button>
    </div>
  </div>
</template>

<style scoped>
.reb-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 99999;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.reb-panel {
  background: var(--surface-2); border: 1px solid var(--state-attention); border-radius: 6px;
  width: min(560px, 92vw); padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.9);
  color: var(--text-0);
}
/* theme-exception: .reb-title and .reb-message use lightened-attention
   variants (#ff7070, #ff8888) — not in the substrate. The error
   panel's distinct urgency-but-readable text colors aren't covered
   by the saturated --state-attention anchor. */
.reb-title { margin: 0 0 12px; font-size: 18px; color: #ff7070; }
.reb-text { margin: 0 0 14px; font-size: 13px; color: var(--text-1); line-height: 1.5; }
.reb-message {
  background: var(--surface-0); border: 1px solid var(--border-1); border-radius: 3px;
  padding: 10px 12px; font-family: monospace; font-size: 12px;
  color: #ff8888; white-space: pre-wrap; word-break: break-word;
  max-height: 180px; overflow: auto; margin: 0 0 18px;
}
/* theme-exception: .reb-reload:hover #5bc0ff is the same lightened-
   accent variant as MintCardModal's btn-submit hover. */
.reb-reload {
  background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold;
  padding: 8px 18px; border-radius: 3px; cursor: pointer; font-size: 13px;
}
.reb-reload:hover { background: #5bc0ff; }
</style>
