# useResizablePanel cleans up on unmount

- **Status:** Shipped on
  `frontend/useresizablepanel-onunmounted-stop`, 2026-05-04.
  Build green.
- **Genre:** Bug fix — component-lifecycle leak; resource-
  ownership audit O12.
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's Pass-1 inventory (PR #118) named
O12 — `useResizablePanel.ts` had no `onUnmounted` cleanup. The
composable installs document-level `mousemove` and `mouseup`
listeners and adds a `'resizing'` class to `document.body` at
`startResize`; the matching cleanup runs in `stopResize`, but
that's only called on `mouseup`. If the host SFC (App.vue, in
practice) unmounts mid-drag — HMR module reload, route change,
or any other lifecycle event — the listeners persist and the
body keeps the resizing class.

Inventory disposition: "Mirror the `HorizontalTimelineVisualizer`
shape: `onUnmounted(stopResize)`. ~3 lines."

## What changed

`frontend/src/composables/useResizablePanel.ts`. Two edits:

1. **Import**: add `onUnmounted` to the existing `vue` import.

2. **Lifecycle hook**: `onUnmounted(stopResize)` at the end of
   the composable, before the return. `stopResize` is already
   idempotent — `removeEventListener` is a no-op for unattached
   handlers, `classList.remove` is a no-op for an absent class
   — so it's safe to call when no drag is in flight.

A short comment block names the failure mode (mid-drag unmount
via HMR or route change) and points at HorizontalTimelineVisualizer
as the precedent.

## Why mirror HorizontalTimelineVisualizer specifically

HorizontalTimelineVisualizer.vue (`onUnmounted(() => stopDragging())`)
is the codebase's existing worked example of "drag composable with
global listeners installed at drag-start, removed at drag-end, plus
a safety net at unmount." useResizablePanel was the last drag-shape
composable in the codebase without that safety net; the audit's
Pass-1 walk surfaced it.

The arrow-wrapper around `stopResize` isn't needed here because
`useResizablePanel`'s `stopResize` doesn't take an event argument,
unlike `HorizontalTimelineVisualizer`'s `stopDragging(e?)` which
does. Direct reference (`onUnmounted(stopResize)`) is fine.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual reproduction (pre-fix): start dragging the resize bar,
  trigger an HMR reload mid-drag (edit any source file). Pre-fix:
  cursor stays in resize mode, `'resizing'` class persists on
  body until manual release elsewhere; document-level listeners
  remain attached to the now-unmounted handler closures.
  Post-fix: HMR reload triggers `onUnmounted` → `stopResize`,
  cursor reverts, listeners detach, body class clears.
- Non-regression: normal drag-and-release still works; the
  unmount cleanup is additive.

## Forward notes

O12 is closed. The remaining component-lifecycle pairs:

- **O13** (`BaseChart` `markerTimer` not cleared in `onUnmounted`).
  Trivial — add `if (markerTimer) clearTimeout(markerTimer)` to
  the existing onUnmounted hook. The current callback is a
  post-unmount no-op (chartInstance is null after dispose), so
  this is completeness-not-correctness.
- **O14** (`MintCardModal`'s `hideSuggestionsDelayed` setTimeout).
  Benign — Vue ref closure stable, the post-unmount write is a
  no-op. Can either ignore or store the handle and clear in
  onUnmounted; either disposition is defensible.

Both are smaller than O12 in payoff. Could ship as a single
"sweep the remaining lifecycle pairs" PR or document O14 as
an acceptable benign and ship O13 alone.

After lifecycle, the closeBoard owner's residue (O2 / O3 / O4 /
O5 / O6) and the resetWorkspace memory pairs (O8 / O9 / O11)
remain. The bisect discipline keeps each as its own commit; the
audit's framing has them as smaller wins than the four
already-shipped pairs (O1, O7, O10, O12).

The engine WS reconnect pair (O15) sits in its own corner —
verification-or-document rather than a clear fix shape.
