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
import { i18n } from './i18n';

// Expose the reactive store to the browser console for verification ONLY in DEV.
if (import.meta.env.DEV) {
  (window as any).store = store;
  (window as any).Writer = { serializeBoard, serializeActivePath };
}

const app = createApp(App);

// vue-i18n plugin. Initialised at DEFAULT_LOCALE; useAppBootstrap's
// watch on `store.profile.settings.appearance.locale` flips it to
// the (post-hydration or default) workspace value once Vue mounts.
app.use(i18n);

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
    // Localised error wrapper; English `${msg}` passes through per the
    // (a) backend-error approach (frontend/docs/i18n.md). i18n.global
    // is the Composition-API surface on the plugin instance.
    pushSystemMessage('error', i18n.global.t('errors.unhandled', { msg }));
  } catch (pushErr) {
    console.error('[App] pushSystemMessage failed:', pushErr);
  }
};

app.mount('#app');
