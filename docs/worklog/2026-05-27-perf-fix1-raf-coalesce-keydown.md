# Perf Fix #1 — rAF-coalesce keydown nav handler (Bug B)

- **Status:** Branch `frontend/perf-fix1-raf-coalesce-keydown`;
  awaiting user end-to-end test before PR open.
- **Genre:** Composable refactor. Single-file behaviour change in
  `src/composables/useUserIORegistry.ts`, no new types, no store
  surface change.
- **Date:** 2026-05-27.
- **Diagnostic substrate:**
  `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug B —
  the keyboard-vs-scroll-wheel jank asymmetry. First of four
  sequenced fixes from that audit; each ships as its own PR per
  the user's bisectability preference.

## Context

The audit doc named the asymmetry: `useScopedScroll.ts:14-30`
rAF-coalesces wheel events (each new wheel cancels the prior
rAF and schedules a new one — only the last `deltaY` per frame
runs `onScroll`), while `useUserIORegistry.ts`'s keydown
handler processed each `keydown` synchronously. Under OS key
repeat (~30 Hz Linux default), holding ArrowDown produced one
`mutateBoard` per repeat; when per-step downstream cost exceeded
~33 ms (composing with Bug A's O(N) and O(N²) reactivity work),
the keydown queue backed up and feel turned janky/delayed. The
wheel path's rAF coalesce structurally avoided this.

The fix mirrors `useScopedScroll`'s rAF-coalesce posture on the
navigation subset of the keydown switch. Toggles stay
synchronous — one press is one toggle, and an rAF coalesce on
toggles would unpredictably drop presses depending on frame
boundaries.

## Shape of the change

### Pre-switch membership predicate (`HANDLED_KEYS`)

`preventDefault` must run synchronously — the browser's
default-action decision happens before the event loop returns
to us, so the suppress cannot be deferred into the rAF tick.
The original handler computed `handled` inside the switch and
called `preventDefault` after; rAF-coalescing the action
required lifting the suppress decision pre-switch.

`HANDLED_KEYS = Set<string>` enumerates the 16 key strings
this composable owns (six nav keys + ten toggle keys
including upper/lower-case duplicates). Membership decides
both (a) whether to `preventDefault` and (b) whether to route
to the action dispatch at all. Unknown keys early-return
before any work.

### Coalesced subset (`COALESCED_NAV_KEYS`)

`COALESCED_NAV_KEYS` is the six-element nav subset
(ArrowDown/Up/Left/Right, Home, End). Toggles
(space / m / c / d / l) stay outside this set and dispatch
synchronously.

The rationale for splitting rather than coalescing
everything: holding a nav key under OS repeat is the
intended use case and benefits from rAF back-pressure;
holding a toggle key flicker-flips the toggle and isn't an
intended use case, but if a user does press two toggles
within one frame an rAF coalesce would silently drop the
first — synchronous dispatch gives every press a determinate
effect.

### `runAction(key)` dispatch helper

The original switch (12 cases — six nav, six toggle counting
case-pair duplicates) lifts unchanged into a `runAction`
helper. Called either synchronously (toggles) or from inside
an rAF callback (nav). Re-reads `activeBoard.value` at
execution time, matching `useScopedScroll`'s posture of
reading current state at fire time rather than capturing at
event time — the rAF tick fires one frame after the keydown,
and the active board may (rarely) have changed.

### rAF coalesce state + unmount cleanup

Two module-scope variables inside the composable:

```ts
let rafId: number | null = null;
let pendingNavKey: string | null = null;
```

Each nav keydown replaces `pendingNavKey` with the latest
key, cancels any prior `rafId`, and schedules a new
`requestAnimationFrame` that runs `runAction(pendingNavKey)`
and clears both slots. `onUnmounted` cancels any in-flight
rAF and clears `pendingNavKey`, paired with the schedule
in the handler — without this, the rAF callback would fire
after the listener is removed and execute against a teardown
state the closure no longer rightly reaches.

### Behaviour expectations

- **Single keypress** — one `nav.next/prev/variation/home/end`
  call, delayed by up to one frame (~16.7 ms). User-imperceptible.
- **Held ArrowDown at 30 Hz** — one nav step per OS repeat
  event, each aligned to a browser frame. Total step rate
  unchanged in the common case; the alignment lets the
  browser paint between steps and gives back-pressure when
  downstream cost spikes.
- **Burst (events faster than rAF)** — intermediate keys
  drop; only the latest pending key in a frame runs.
  Acceptable for holding because the user can't realistically
  press faster than 60 Hz with intent.
- **Toggle keys** — unchanged from the original synchronous
  behaviour.

## Multi-tasking preservation

Verified SAFE in the audit doc's per-fix evaluation. The
keyboard handler only runs for the active board (the
`if (!activeBoard.value) return` guard precedes the switch);
it never reaches the packet receive path, the ledger, or
any background-board state. Range / ponder queries on
background boards are unaffected.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics,
  `vite build` produces `dist/` (warning unchanged — chunk
  size pre-existing).
- `npm run test:run` — 654 frontend tests pass, 3 skipped
  (unchanged from pre-fix baseline).

User-side validation remains the gate: open the SPA, open
several boards (≥ 5), hold ArrowDown on the active board,
confirm the nav feels smoother than pre-fix. Cross-check:
single ArrowDown press still navigates; pressing 'm' / 'c' /
'd' / 'l' / space still toggles synchronously; range query
on a background board continues running and the activity
indicator continues updating when the user switches focus
back.

## What stays

The substrate is the rAF-coalesce pattern itself — applied
twice now (wheel in `useScopedScroll`, keydown here). A
future user-configurable keybindings substrate (named in
`todo_local.gitignore` new item 8b) would extend
`HANDLED_KEYS` and `COALESCED_NAV_KEYS` from constants into
user-configurable sets; the dispatch shape stays the same.

## What follows

Bug A primary fix (Fix #2 — `useVariationPath` O(1) lookup +
`boardsById` store map) is the next PR in the sequence. Fix
#1 already reduces user-perceived nav jank as a standalone
ship (the rAF alignment + back-pressure helps even before A
is addressed), but the O(N²) reactivity is the larger
structural cost; Fix #2 amplifies the visible win.

License: Public Domain (The Unlicense)
