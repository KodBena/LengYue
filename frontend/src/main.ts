/**
 * src/main.ts
 * License: Public Domain (The Unlicense)
 */

import './jquery-bridge';
import 'jquery-ui-dist/jquery-ui';
import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { store, pushSystemMessage } from './store';
import { serializeBoard, serializeActivePath } from './engine/sgf-writer';

// Expose the reactive store to the browser console for verification ONLY in DEV.
if (import.meta.env.DEV) {
  (window as any).store = store;
  (window as any).Writer = { serializeBoard, serializeActivePath };
}

const app = createApp(App);

// Last-resort error handler for errors that escape every component
// boundary (App.vue's own setup, mount-time errors, etc.). The
// component-level boundary at RootErrorBoundary covers descendant
// render/watcher/lifecycle/event-handler errors and provides the
// reload-affordance UI; this hook is purely a system-log surface
// for the residual cases where no component boundary fires.
app.config.errorHandler = (err, _instance, info) => {
  console.error('[App] Error not captured by any boundary:', err, info);
  try {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `Unhandled error: ${msg}.`);
  } catch (pushErr) {
    console.error('[App] pushSystemMessage failed:', pushErr);
  }
};

app.mount('#app');
