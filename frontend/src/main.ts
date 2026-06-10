/**
 * src/main.ts
 * License: Public Domain (The Unlicense)
 */

import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { store, pushSystemMessage } from './store';
import { serializeBoard, serializeActivePath } from './engine/sgf-writer';
import { installPerfScenarios } from './composables/perf/scenarios';
import { i18n } from './i18n';

// Expose the reactive store to the browser console for verification ONLY in DEV.
// Justified `as any` (ADR-0002 Rule 2 — untyped-global interop): these are
// deliberately untyped DEV-only console debug handles. Scope of unsafety:
// the two writes below and whatever a developer types at the console. A
// `declare global` Window augmentation was considered and rejected — it
// would advertise the debug fields tree-wide as typed surface, inviting
// the production reads this DEV gate exists to prevent. Not a band
// boundary (ADR-0003): window is outside the band vocabulary entirely.
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-restricted-syntax -- DEV-only untyped console debug handle (see block comment above)
  (window as any).store = store;
  // eslint-disable-next-line no-restricted-syntax -- DEV-only untyped console debug handle (see block comment above)
  (window as any).Writer = { serializeBoard, serializeActivePath };
  // Install `window.__perfScenario` so the Playwright capture driver (and
  // the dev-toolbar picker) can launch pluggable perf scenarios by name.
  installPerfScenarios();
}

const app = createApp(App);

// ADR-0009: emit Vue's performance.mark() / performance.measure()
// points (component setup, render, patch, unmount) so Firefox
// DevTools Performance profiles attribute per-frame work to
// specific components. Dev-only; no effect in production builds.
if (import.meta.env.DEV) {
  app.config.performance = true;
}

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
