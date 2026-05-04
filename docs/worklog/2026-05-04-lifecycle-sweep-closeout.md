# Lifecycle-owner sweep close-out (O13 + O14)

- **Status:** Shipped on `frontend/lifecycle-sweep-closeout`,
  2026-05-04. Build green. Two commits in one PR per the audit's
  bisect discipline.
- **Genre:** Bug fix — completeness-not-correctness; resource-
  ownership audit O13 + O14, closing the component-lifecycle
  owner sweep.
- **Date:** 2026-05-04.

## Context

The resource-ownership audit's component-lifecycle owner had
three pairs in the Pass-1 inventory: O12 (useResizablePanel,
shipped in PR #123), O13 (BaseChart markerTimer), and O14
(MintCardModal setTimeout). O12 was the only one with an
observable failure mode (mid-drag unmount via HMR or route
change leaves global listeners attached). O13 and O14 are
completeness-not-correctness fixes — the prior behavior
produced no user-visible bug, just timer closures that lived
slightly past the unmount they should have followed.

This PR ships O13 and O14 paired (one PR, two commits) to close
the lifecycle-owner sweep. The two commits remain bisect-
isolated per the audit's discipline.

## What changed

### Commit 1: O13 — BaseChart markerTimer

`frontend/src/components/charts/BaseChart.vue`. One-line
addition to the existing `onUnmounted` hook:

```ts
onUnmounted(() => {
  if (markerTimer) clearTimeout(markerTimer);   // new
  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value);
    resizeObserver.disconnect();
  }
  chartInstance?.dispose();
});
```

Placed first in the cleanup so the callback can't fire
mid-teardown — ahead of the ResizeObserver disconnect and the
chart dispose. Brief comment names the failure mode (post-
unmount fire reading a now-disposed chartInstance, currently a
no-op via the existing null-check) and the discipline argument
for releasing eagerly anyway.

### Commit 2: O14 — MintCardModal hideSuggestionsDelayed

`frontend/src/components/MintCardModal.vue`. Three edits:

1. **Import** `onUnmounted` from 'vue' alongside the existing
   `ref`, `computed`.

2. **Timer-handle bookkeeping**:

   ```ts
   let suggestionsHideTimer: number | null = null;
   ```

   Stores the in-flight setTimeout handle so it can be cleared
   on unmount (and on overlapping schedules — a rapid
   blur-focus-blur sequence would otherwise queue duplicate
   callbacks).

3. **`hideSuggestionsDelayed` body**: clears any existing
   timer before scheduling a new one; nulls the handle from
   inside the callback after it fires; new `onUnmounted`
   clears any pending handle.

```ts
function hideSuggestionsDelayed() {
  if (suggestionsHideTimer !== null) {
    clearTimeout(suggestionsHideTimer);
  }
  suggestionsHideTimer = window.setTimeout(() => {
    showSuggestions.value = false;
    suggestionsHideTimer = null;
  }, 150);
}

onUnmounted(() => {
  if (suggestionsHideTimer !== null) clearTimeout(suggestionsHideTimer);
});
```

The 150ms magic-literal comment is preserved; it documents the
debounce rationale and is still load-bearing.

The audit's inventory framed O14 as "either ignore or store
the handle and clear in `onUnmounted`; either disposition is
defensible." Picking the latter because the bookkeeping also
closes the secondary issue of overlapping schedules — a small
correctness improvement on top of the completeness fix.

## Why one PR with two commits

The audit's bisect discipline says "each owner-resource pair
gets its own commit, even when multiple pairs share an owner."
O13 and O14 are different files and different concerns, just
both lifecycle owners. The bisect-honest shape is two commits.

The user requested they ship paired ("finish lifecycle"). One
PR with two commits honors both: bisect retains pair-level
isolation; the PR groups the lifecycle-owner sweep close-out
into a single review unit.

This is a small deviation from the prior PR-per-commit pattern
(#119-#123). The deviation feels right when:
- Each fix is trivial enough that a regression in either is
  implausible.
- The fixes are conceptually paired (closing one owner's sweep).
- The user explicitly requested pairing.

For non-trivial fixes or fixes that cross owner boundaries, the
single-PR-per-commit pattern stays the default.

## Verification

- `npm run build` (vue-tsc + vite build) clean after each
  commit.
- O13 manual: open a board with active analysis, navigate
  through the timeline (which fires the marker debouncer
  rapidly), close the tab. Pre-fix: a pending marker timer
  could fire post-unmount; the callback short-circuited via
  null-check on `chartInstance`. Post-fix: the timer is
  cleared at unmount, so no post-unmount fire occurs.
- O14 manual: open MintCardModal, focus the tag input,
  trigger blur (click outside), reopen the modal within
  150ms. Pre-fix: two timers race — the prior one fires on
  the new modal instance, briefly hiding suggestions on the
  fresh state. Post-fix: the prior timer is cleared on
  unmount; the new modal starts clean.
- Non-regression: normal flow (focus, type, blur, wait 150ms)
  is unchanged. The clearTimeout on overlapping schedules is
  additive correctness, not a behavior change.

## Forward notes

The component-lifecycle owner sweep is closed. After this PR:

- **closeBoard owner:** O1 closed (#119, #120). O2-O6 open.
- **Identity / resetWorkspace owner:** O7 closed (#121), O10
  closed (#122). O8, O9, O11 open.
- **Component lifecycle owner:** O12 closed (#123), O13 +
  O14 closed (this PR). **Sweep complete.**
- **Engine WS reconnect owner:** O15 open.

Six audit pairs closed across one session (#119-#124, plus
the inventory PR #118). Remaining ten pairs are smaller in
payoff and many are deliberate doc-the-deferral choices
(O5 / O8 / O9 / O11 / O15) rather than fixes.

The closeBoard residue (O2 / O3 / O4 / O5 / O6) and the
remaining identity-flip memory pairs (O8 / O9 / O11) are the
natural next sweep candidates if continuing. O15 (WS
reconnect) needs a Pass-2 trace before a fix shape is
chosen — verification work, not editing work.

After the audit's open pairs are addressed, Pass 3 (forward-
authoring discipline — the inline-comment convention and the
authoring checklist) closes the audit. The Pass-1 closeout
notes flagged the recurring shape: "per-entity Map/Set state
in a service or composable singleton reliably gets a
dispose/disconnect cleanup path, but inconsistently gets an
entity-removal cleanup path." That's the discipline Pass 3
will codify.
