# Top-Level Frontend Error Boundary (Auditor #5)

- **Status:** Shipped on branch `frontend/root-error-boundary`,
  2026-04-27. `npm run build` green; manual smoke confirmed by
  user (no-regression visual + synthetic-error trigger via
  `store.boards = null`).
- **Genre:** Worklog entry — closes auditor-notes item #5; a
  concrete application of ADR-0002 (fail loudly via the
  strongest channel that fits — user-visible system message
  plus UI fallback).
- **Date:** 2026-04-27.
- **Origin:** `docs/notes/auditor-notes.md` item #5.

## Context

The auditor named the gap: "An unhandled render exception in a
deep component white-screens the app — silent from the user's
perspective even though it's loud in the console." Per ADR-0002
the loudness hierarchy prefers user-visible signals where the
type system can't catch the failure; an unhandled render error
sits at the worst tier (silent in production, visible only in
DevTools). A root-level boundary closes the gap.

## Approach

Two complementary mechanisms — a component-level boundary for
the common case (descendant render errors) and a global handler
as the last-resort backstop.

### A — `RootErrorBoundary.vue` (new component)

Uses Vue 3's `onErrorCaptured` hook to catch errors propagating
from descendant components. The hook fires for renders,
watchers, lifecycle hooks, event handlers, and `setup()` calls
in descendants (per Vue 3's documented sources).

On catch:
1. `console.error` for the developer-side surface.
2. `pushSystemMessage('error', ...)` for the user-side surface,
   wrapped in `try/catch` to avoid recursion if
   `pushSystemMessage` itself throws.
3. Sets a local `error` ref to the captured error; the
   template's `v-if="!error"` flips to the fallback overlay.
4. Returns `false` to stop further propagation.

Public API: a single default `<slot />`.

Fallback UI: a fixed-position overlay over the entire viewport
(`z-index: 99999`), a centered panel with a heading, brief
explanatory text, the error message in a `<pre>` block (technical
context for the user), and a single "Reload page" button calling
`location.reload()`. Single-action UX deliberately — a "Try to
recover" alternative would set `error.value = null` and
re-render the slot, which loops if the underlying error is
persistent. Once the boundary trips, the path forward is a
fresh page load.

### B — `app.config.errorHandler` backstop in `main.ts`

`createApp(App).mount('#app')` was refactored to capture the
app instance, install
`app.config.errorHandler = (err, _instance, info) => {…}`,
then mount. The handler:

1. `console.error` — same as the component-level surface.
2. `pushSystemMessage('error', ...)` — surfaces to system log.

This fires for errors not caught by any component boundary
(App.vue's own setup, mount-time errors, etc.). The boundary
catches the common case; the global handler is purely a
last-resort surface for residual cases. No fallback UI here —
those errors are likely fatal to render anyway.

### C — App.vue wrap

The root `<div id="main-area">` is wrapped:

```vue
<template>
  <RootErrorBoundary>
    <div id="main-area">
      ... (existing content unchanged)
    </div>
  </RootErrorBoundary>
</template>
```

`RootErrorBoundary` is render-only — no extra DOM element. In
the normal-render case the output HTML is identical to before.

## Critical files

- **Created:** `frontend/src/components/RootErrorBoundary.vue`
  (~80 lines including styles + ADR-0006 header).
- **Edited:** `frontend/src/main.ts` — refactor to capture
  `app` instance, add `app.config.errorHandler`.
- **Edited:** `frontend/src/App.vue` — import the boundary
  component; wrap root template content.

## Reused existing surface

- `pushSystemMessage` from `../store` — both the boundary and
  the global handler use it as the user-side surface.
- Vue 3's `onErrorCaptured` and `app.config.errorHandler` —
  built-in primitives, no new deps.

No new types, no new services, no new dependencies.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.88s, 842 modules).

2. **No-regression visual smoke.** The SPA loads identically;
   the boundary adds no DOM element in the normal case.
   Tab-switching, card-loading, force-persistence, and the
   auth lifecycle all worked unchanged. ✓

3. **Synthetic boundary trigger.** Console:
   ```js
   store.boards = null;
   ```
   The next reactive cycle's render fails on any component
   reading `store.boards`; `onErrorCaptured` fires; the overlay
   appears with a `<pre>`-rendered error message and a "Reload
   page" button; the system log gains an error entry. Reload
   restores backend-hydrated valid state. ✓

4. **Backstop check.** Throw from console:
   `throw new Error('test')`. This is OUTSIDE Vue's render
   cycle, so the boundary correctly does NOT catch it (the
   error reaches the browser console only). Confirms the
   boundary isn't over-catching. ✓

## Outcomes

- The white-screen failure mode is closed: any unhandled error
  inside Vue's reactivity surfaces to the user via system log
  + fallback overlay, with a clear reload affordance.
- ADR-0002's loudness hierarchy gains its top-tier user-visible
  surface for production render errors.
- Auditor's #5 retires.

## Out of scope (explicitly)

- **`window.addEventListener('unhandledrejection', ...)`** for
  promise rejections OUTSIDE Vue's reactivity. The auditor's
  concern was Vue render exceptions; non-Vue async errors are
  a separate (worth-doing-eventually) concern.
- **Sentry / structured error reporting integration.** ADR-0002
  Revisit-when section names this as a future trigger; this
  PR uses pushSystemMessage as the user-side surface and
  console.error as the dev-side surface. Sentry would be its
  own RFC.
- **Per-component error boundaries** for finer-grained
  recovery. Single root boundary is the minimum viable.
- **Error reporting back-channel** (POST to /telemetry).
  Privacy-sensitive; out of scope.
- **"Try to recover" button.** Would loop on persistent
  errors; reload is the cleaner UX.

## Documentation follow-up

- This worklog entry.
- `docs/notes/auditor-notes.md` — item #5 retired in-place per
  the ledger's discipline; heading stays as historical record.
- `docs/notes/deferred-items.md` — no entries retired or
  added.
- No ADR amendment. The boundary is a concrete application
  of ADR-0002, not a change to the tenet.

## Branch + PR workflow

Branched off main post-PR-#12 merge (`1ce6975`). Single PR.
