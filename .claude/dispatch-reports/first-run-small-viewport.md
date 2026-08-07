# first-run-small-viewport.md

Commission (ledger row 802): a fresh profile's first paint at a common
viewport width was reported barely usable — the right control panel's
content clipped off the right edge of the screen (Cards tab header cut
mid-word, action buttons half off-screen), witnessed by the
commissioner on a VM. Branch: `worktree-agent-a5ec195e6e6239656`.
Final commit: `16bfe877` ("fix(frontend): floor the tree+control
wrapper's flex-fill width on a fresh-profile first paint").

## Worktree currency (first action, per dispatch instructions)

The worktree's `HEAD` (`3378806f`) was 168 commits behind `next`'s tip
(`f727f0b3`) at session start. `git merge next --no-edit` fast-forwarded
cleanly (no conflicts, no merge commit — a pure fast-forward) before any
code was read. Disclosed per the dispatch instructions.

## Root cause, with the actual numbers

`#tree-control-wrapper` (App.vue, the combined tree+control region) has
three width states depending on `session.ui.treeControlRegionWidthPx`:

1. **A drag in progress** — `computeTreeControlRegionWidthPx` clamps to
   `[WRAPPER_MIN_WIDTH_PX, regionMaxWidthPx]`.
2. **A persisted/restored width** — `effectiveTreeControlRegionWidthPx`
   (via `sanitizeTreeControlRegionWidthPx`) re-clamps the same way
   against the live row width on every render (the ui-5-3 fix).
3. **Never dragged, nothing to restore (a fresh profile's first
   paint)** — `effectiveTreeControlRegionWidthPx` is `undefined` by
   design ("fresh installs are unaffected"), and App.vue fell back to
   pure CSS `flex: '1 1 0'` with **no width floor at all**.

State 3 was the gap. `#tree-control-wrapper`'s stylesheet rule carries
`min-width: 0` (needed so states 1/2 above can shrink the wrapper to an
explicit px smaller than its content) — and that same override applies
in state 3, where there is no explicit width to protect the floor.  On
a first paint whose flex-share (after `#board-column`'s `flex: 1 1
auto` share, driven by the board's aspect-ratio square) comes out
narrower than the wrapper's own content floor (`#vue-tree-panel`'s
fixed 140px + the 4px inner resizer + `#control-panel`'s own
`min-width: 220px`, i.e. `WRAPPER_MIN_WIDTH_PX` = 364px), the browser's
flex algorithm still only *allocates* the wrapper its shrunk flex-share
— but `#control-panel`'s own hard 220px floor doesn't let it shrink
further, so it overflows past the wrapper's box and off the viewport's
right edge, since nothing clips or scrolls horizontally.

**Witnessed live** (dev server + `playwright-core` against
`#split-workspace`/`#control-panel` `getBoundingClientRect()`, fresh
profile simulated by setting `session.ui.treeControlRegionWidthPx` /
`treePanelWidthPx` to `undefined` and `activeTab` to `'cards'`):

| viewport | wrapper rendered width | wrapper's own content floor | overflow |
|---|---|---|---|
| 1366×768 (pre-fix) | 311.2px | 364px | **`#control-panel` right edge at 1418.8px — 52.8px past the 1366px viewport** |
| 1920×1080 | 416.3px | 364px | none (share > floor) |
| 2560×1440 | 606.1px | 364px | none (share > floor) |

1366px is the width where it broke; 1920/2560 already had enough
natural flex-share that the floor never engaged — which is presumably
why the bug read as intermittent/viewport-dependent rather than
universal (a window not fully maximized to 1920, or a lower-DPI VM
default, lands in the same gap).

## Fix

`frontend/src/composables/chrome/useResizablePanel.ts` — new pure
function `freshTreeControlWrapperFloorPx(treeExpanded: boolean):
number`, returning `WRAPPER_MIN_WIDTH_PX` (364, tree also expanded) or
`CONTROL_PANEL_MIN_WIDTH_PX` (220, tree collapsed — so a tree-collapsed
first paint doesn't over-reserve room for a hidden tree panel). Exposed
reactively as `freshTreeControlWrapperMinWidthPx` (a `computed` off
`store.session.ui.treeExpanded`) from `useResizablePanel()`.

`frontend/src/App.vue` — the flex-fill branch of `#tree-control-wrapper`'s
`:style` binding (`effectiveTreeControlRegionWidthPx === undefined`,
i.e. never dragged/nothing to restore) now carries
`minWidth: freshTreeControlWrapperMinWidthPx + 'px'` alongside the
existing `flex: '1 1 0'`. Inline `min-width` wins over the stylesheet's
`min-width: 0`, so the browser's own flex allocation now respects the
floor at layout time — no re-architecture, no new measurement/observer,
the existing drag-clamp and restore-clamp branches (states 1/2 above)
are untouched.

This is a **DEFAULTS/clamping fix**, matching the dispatch's framing:
it does not touch `useResizablePanel.ts`'s nested-splitter drag math,
the ui-5-3 restore clamp, or the sign/geometry argument in that file's
header — it closes the one branch (never-dragged first paint) that had
no floor.

## Claims — per-item WITNESSED / REFUSED-AS-EXPECTED / UNEXERCISED

- **WITNESSED** — root cause: the 1366×768 fresh-profile first paint
  overflowed `#control-panel` 52.8px past the viewport before the fix
  (`playwright-core` rect probe against the live dev server, numbers
  above).
- **WITNESSED** — fix closes it: same probe, same viewport, post-fix —
  `#control-panel`'s right edge lands exactly at 1366px (the row's own
  right edge), tabs/dropdown/buttons all rendered fully on-screen
  (screenshot inspected).
- **WITNESSED** — 1920×1080 and 2560×1440 render byte-identically
  before/after the fix (same rect values in both runs) — the floor
  never engages there because the natural flex-share already exceeds
  it, confirming "no behavior change where it already fits."
- **WITNESSED** — `npx vue-tsc --noEmit` exits 0.
- **WITNESSED** — `npx vitest run --silent` (`NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `nice -n 19`): 147 files / 3
  skipped, 1790 tests passed / 4 skipped, 0 failures — including the
  pre-existing `tests/integration/resizer-restore-clamp.test.ts` suite
  (wider-profile-restored-on-narrower-screen clamp, the ui-5-3 live
  regression, and all the pre-fix RED/GREEN pairs), unmodified in
  behavior, still green.
- **WITNESSED** — new tests added to the same file (`resizer-restore-clamp.test.ts`):
  `freshTreeControlWrapperFloorPx` pinned against `WRAPPER_MIN_WIDTH_PX`
  / `CONTROL_PANEL_MIN_WIDTH_PX` / their constituent constants, the
  composable's reactive exposure, and a parametrized
  1366/1920/2560 arithmetic check that `#board-column` always keeps at
  least `MIN_BOARD_PX` of room after reserving the fresh-paint floor —
  all passing.
- **UNEXERCISED** — a real (non-simulated) fresh backend profile: the
  dev server's `local_user` account already had persisted boards/session
  state server-side, so "fresh profile" was simulated by forcing
  `treeControlRegionWidthPx`/`treePanelWidthPx` to `undefined` in the
  live page via `page.evaluate` rather than a genuinely new backend
  account. This exercises exactly the code path the bug and fix live in
  (the `effectiveTreeControlRegionWidthPx === undefined` branch), so the
  simulation is faithful to the defect, but a true fresh-account
  end-to-end run was not performed.
- **REFUSED-AS-EXPECTED** — none encountered (no destructive/blocked
  operation was attempted).

## Deviations from the dispatch

- Live verification used a temporary `vite` dev server on port 5199 and
  a throwaway Chromium `--user-data-dir` (not the standing 4173/5173/
  5174/8764 ports, which were all confirmed live/in-use and left
  untouched) plus `playwright-core` (already vendored in
  `frontend/node_modules`, same tool the prior `resizer-rearch-probe.mjs`
  precedent uses) — not explicitly named in the dispatch's "Tests"
  section (which described jsdom-only verification), but used in
  addition to, not instead of, the required jsdom test extension, to
  root-cause the defect against real browser flex layout before writing
  the fix (jsdom does not compute real CSS layout, so the jsdom tests
  alone could not have located the overflow). The dev server and its
  profile directory were torn down before finishing (port confirmed
  freed).
- `npm ci` was required (no `node_modules` present in this worktree
  before this session); it resolved from cache in ~5s, no network
  surprises.

## Gate verdicts

- `npx vue-tsc --noEmit` — exit 0.
- `npx vitest run --silent` — exit 0 (147 passed / 3 skipped files,
  1790 passed / 4 skipped tests).

License: Public Domain (The Unlicense)
