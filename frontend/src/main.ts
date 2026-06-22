/**
 * src/main.ts
 * License: Public Domain (The Unlicense)
 */

import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { store, pushSystemMessage } from './store';
// Side-effect import: loads every resource owner so its board-close /
// workspace-reset teardown handler is registered before any closeBoard /
// resetWorkspace fires (ADR-0012 P2/P3 dependency inversion — the store no
// longer imports the owners; this bootstrap is the load-guarantee that the
// handler set is present). Must run early, before any workspace mutation. See
// `store/teardown-registrations.ts` for the rationale.
import './store/teardown-registrations';
import { serializeBoard, serializeActivePath } from './engine/sgf-writer';
import { installPerfScenarios } from './composables/perf/scenarios';
import { i18n } from './i18n';
import { createRejectionBackstop } from './lib/unhandled-rejection-backstop';

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

// Window-level `unhandledrejection` backstop. The errorHandler above
// and RootErrorBoundary cover errors that flow through Vue's reactivity;
// a promise that rejects with no `.catch` OUTSIDE Vue's render cycle
// escapes both and reaches only the console — invisible to the user.
// This closes the gap the root-error-boundary worklog named as
// out-of-scope-but-worth-doing (the `window.addEventListener(
// 'unhandledrejection')` bullet). De-dup logic + posture rationale live
// in `lib/unhandled-rejection-backstop.ts`; the real sinks are wired
// here (the bootstrap/wiring surface, sibling to the errorHandler).
//
// Resource ownership (frontend/CLAUDE.md "Resource ownership at mutation
// sites"): this registers ONE document-level listener that must live for
// the entire app lifetime. There is no owning entity that is created and
// destroyed, and no `onUnmounted`/teardown site — main.ts is the app
// root, below any component, and the process owns the listener until the
// document is torn down (page unload / reload), which releases it for
// free. So the resource is named here and the deliberate NON-removal is
// the correct call, not a missing cleanup: an unhandledrejection that
// fires during the brief shutdown window should still surface, and there
// is no later-arriving consumer with a different lifecycle (the class
// the discipline guards) — the listener has exactly one lifetime, the
// app's. The de-dup latch lives inside the closure; it likewise GCs with
// the document on unload. (Contrast the imperative-escape ResizeObservers,
// which a remounting leaf owns and MUST release in onUnmounted.)
const rejectionBackstop = createRejectionBackstop({
  pushSystemMessage,
  // i18n.global is the Composition-API surface on the plugin instance,
  // same as the errorHandler above.
  translate: (key, params) => i18n.global.t(key, params ?? {}),
  logError: (...args) => { console.error(...args); },
});
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  rejectionBackstop.handle(event.reason);
});

app.mount('#app');
