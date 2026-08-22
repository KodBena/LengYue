# Divider-mechanics re-land — build report (rows 2538/2541/2556/2559)

## Base

`next` at dispatch: `c2185fa3` (`git log --oneline -1 next`), confirmed
unmoved at the end of this session (re-checked via a throwaway ref fetch
of the shared repo's `next`, not a `git -C` cross-worktree call — this
worktree is isolated and its own git operations must stay inside it).
Worktree `HEAD` was `dc8e3b12` at session start; fast-forward-merged to
`c2185fa3` before any work (clean, no conflicts).

## What was re-landed

Cherry-picked `e72970bd` (the original divider-mechanics fix,
subsequently merged as `98d60b6f` and reverted as `d62148ef`) onto
`c2185fa3`. One conflict, in `frontend/src/App.vue`: intervening
Library/Cards-promotion work (`83a1a903`) had rewritten the same
`#exclusive-controlPanel` template comment/structure the fix's item 2
also touches. Resolved by hand — kept the newer (post-promotion)
`right-panel-surface-overlay` doc prose, applied the fix's actual code
move (`#resizer-inner` relocated into the new `#exclusive-divider-
controlPanel` slot, `v-if="activeScreenClassId === 'landscape'"`), and
wrote a short pointer comment at the old call site explaining where the
divider moved and why. No other file conflicted.

The four disclosed items, unchanged from the original fix's own
description:
1. Divider hit-zone centering (CSS-only, `.lyt-resizer-vertical`/`::before`).
2. `#resizer-inner` moved to an always-rendered, never-Teleported
   `#exclusive-divider-controlPanel` slot (`LytNode.vue`), landscape-gated
   in `App.vue` — active beside an absent `controlPanel`.
3. `computeRootSplitSideColumnCeilingPx` (`state/feasible-layout.ts`) as
   the one region-owned bound both `startResizeOuter` (drag-time) and
   `resolveRootSplitLiveLayout` (render-time) now read.
4. `assertSingleFloorBearingRegion`, wired at `useSideColumnLiveLayout.ts`
   (the production `others` registry construction site).

## Snap-on-grab: reproduction attempt, honestly reported

The inherited diagnosis (`layout-residue-build.md`, a hypothesis, never
live-confirmed) named the ceiling-unification or presence-slot changes
as the likely cause, disclosed hit-zone CSS as cosmetic-only. Per the
brief, I reproduced live before touching anything, then tried
specifically to reproduce the snap by stress-testing exactly the code
paths items 2 and 3 touch.

**Environment**: isolated backend (fresh SQLite,
`/home/bork/scratchpad/venv`, `127.0.0.1:19764`), `vite` dev server
(`frontend/` as cwd, `0.0.0.0:19173`), `frontend/scratch-shot.mjs`
(committed) driving a headless Chromium via CDP. `window.store` is
exposed in dev builds (`main.ts`), used here to set
`session.ui.lytPresence.boardRail`, `session.ui.treeControlRegionWidthPx`,
and `session.ui.activeTab` directly rather than clicking through the UI
for each scenario.

**Method**: for each scenario, read geometry *before* mousedown, read it
again immediately after mousedown with **zero mouse movement** (the
literal acceptance criterion — "grab-and-hold = zero jump"), then apply a
real, small mouse movement and read again, comparing the delta against
the expected linear response.

**Scenarios tried** (all post-fix, on the resolved cherry-pick):

| # | Scenario | Grab, zero movement | First real move |
|---|----------|---------------------|------------------|
| 1 | Default state, `boardRail` off, `#resizer-outer` | wrapper 640→640 (no jump) | −10px mouse → +12px wrapper (linear) |
| 2 | `boardRail` **on** (reserves 168+12px — the exact live fact item 3 threads in), `#resizer-outer`, 1600px viewport | wrapper 460→460 | −10px mouse → wrapper 460→472 (linear) |
| 3 | `controlPanel` **absent** (`activeTab: 'library'`), `#resizer-inner` — the new capability item 2 makes reachable | tree 77→77 | +20px mouse → tree 77→140 (clamped at `TREE_PANEL_MIN_WIDTH_PX`, see below) |
| 4 | Sovereign override (`treeControlRegionWidthPx: 900`) wider than the current (tight) ceiling, `boardRail` on, narrow (1100px) viewport — the exact scenario item 3's ceiling-unification is about | render pre-clamped to 608 (ceiling, not 900); grab: 608→608 | −10px mouse → stays at 608 (correctly clamped at the SAME ceiling render already enforces — no decoupling, no snap) |

None of the four scenarios produced a jump at grab (mousedown, zero
movement always left every measured geometry unchanged), and none
produced a discontinuity on the first real movement beyond the expected,
documented floor/ceiling clamps.

**One false positive along the way, disclosed rather than buried**: my
first attempt at scenario 2 used a hardcoded absolute mouse-move
coordinate computed from the no-`boardRail` divider position. Turning
`boardRail` on shifted `#resizer-outer` ~180px to the right; the
hardcoded coordinate was then ~190px away from the actual divider,
producing an apparent "snap" (wrapper 460→652) that was purely a test-
harness coordinate mistake, not a product bug — caught by re-deriving
the mouse position from the live DOM rather than a remembered constant.
Naming this because it is the exact *shape* of mistake a human tester
grabbing a divider right after some other layout change (e.g. toggling a
presence checkbox) could also make, which is my best remaining guess at
what the original report may have been — I cannot confirm this from
here, only disclose it as the most plausible innocent explanation I
found while trying to reproduce the real thing.

**One orthogonal, pre-existing discontinuity, out of scope**: scenario 3
(and a same-shape isolated re-run of it) shows the tree panel's *natural*
render width (77px in the `library`-overlay narrow layout used here) sit
below `TREE_PANEL_MIN_WIDTH_PX` (140px) — so the *first* pixel of an
inner-divider drag jumps the tree straight to its 140px floor. This is
real and could read as "the divider snapped when I grabbed it," but it
is **not** touched by any of the four disclosed items:
`computeTreePanelWidthPx`/`computePaneWidthPx` and
`TREE_PANEL_MIN_WIDTH_PX` are unchanged by this cherry-pick (confirmed:
`git diff c2185fa3` touches none of that arithmetic), and the same floor
existed identically before this fix, before the revert, and after. Not
fixed here — outside the four bounded items this task re-lands, and
"the natural render width can sit below the drag floor" is a separate,
pre-existing defect class that would need its own brief.

**Conclusion**: I could not reproduce a snap caused by this fix's own
four items, despite deliberately targeting the exact code paths (item
2's new reachable state, item 3's ceiling divergence) the inherited
hypothesis named. Per the brief's "do not fix what you have not
reproduced," no additional change was made beyond the clean cherry-pick
+ conflict resolution. If the snap recurs live post-merge, the two
leads above (a stale mouse-position assumption across an intervening
layout change; the pre-existing natural-width-below-floor jump) are
where I'd look first.

## Regression tests added

`frontend/tests/unit/state/feasible-layout.test.ts` — the cherry-pick's
own `computeRootSplitSideColumnCeilingPx` and `assertSingleFloorBearingRegion`
had no direct unit coverage (only indirectly, through
`resolveRootSplitLiveLayout`'s acceptance numbers). Added:
- `computeRootSplitSideColumnCeilingPx()`: the exact arithmetic
  (`rowWidthPx - boardRailReservedPx - gapPx - boardFloorPx`), the
  `boardRailReservedPx: 0` reduction, the floor-at-0 refusal of negative
  CSS widths, and the "omitting a reservation can only widen, never
  narrow" property `useResizablePanel.ts`'s own optional-arg default
  relies on.
- `assertSingleFloorBearingRegion()`: silent for 0 and 1 floor-bearing
  regions (including the pure solver's own "row 2501 defense in depth"
  zero-floor fixtures), throws naming both widget ids for 2.

The existing `computeTreePanelWidthPx`/`computeTreeControlRegionWidthPx`
"no drag-start clobber" tests (`tests/unit/composables/chrome/
useResizablePanel.test.ts`, pre-existing, untouched) already pin the
delta-0-identity property at the pure-function level — the same
"grab-and-hold = zero jump" invariant the live witnesses above confirm
end-to-end.

`frontend/tests/integration/lyt-root-split-live.test.ts` — brought in
unchanged from the original fix's own cherry-picked diff (93 lines,
12 tests total, all passing).

## Live witnesses

Screenshots and raw geometry logs saved under
`/tmp/claude-1000/-home-bork-w-omega/34662d1c-abab-419f-acb0-b36c9a5e7de0/scratchpad/divider-repro/`
(not committed — scratch, per this session's own scratchpad convention):
`01-baseline.png` (pre-fix reverted-state baseline, hit-zone width 1px),
`02-fix-applied.png` (post-fix, hit-zone width 4px — item 1 visible),
`06-drag-boardrail-correct.png` / `09-sovereign.png` /
`11-sovereign-move.png` (item 3's ceiling unification exercised, incl.
the starvation diagnostic firing correctly when a sovereign override
can no longer fit), `08-inner-drag-correct.png` (item 2's presence-
independent inner divider, `controlPanel` absent).

## Fence compliance

- `StatusBar.vue`: untouched.
- The system-message sink / store push path: untouched — confirmed
  `git diff c2185fa3 -- frontend/src/services/system-message-sink.ts
  frontend/tests/unit/services/system-message-sink.test.ts` is empty.
- The two-column machinery: untouched.
- `proxy/`: untouched.
- No file overlap observed with a concurrent Settings-substrip builder.

## Gates (synchronous, foreground, output read)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output.
- `npx vitest run` — **3582 passed, 8 skipped, 1 failed** (291 files
  passed, 1 failed, 3 skipped; 295 total). The one failure —
  `tests/unit/services/system-message-sink.test.ts`, "a SystemLogPanel-
  shaped subscriber runs exactly once per push, INCLUDING dedup-hit
  pushes" (an off-by-one in the recorded `runs` count) — is **pre-
  existing and out of fence**: `git diff c2185fa3` against both the
  source file and its test is empty, and re-running the file in
  isolation reproduces the same failure deterministically. Not touched,
  per the brief's explicit fence on the system-message sink / store push
  path.
- `npm run build` (`vue-tsc -b && vite build`) — succeeds, exit 0. One
  pre-existing "chunk larger than 500 kB" advisory, unrelated.

## What was honestly NOT done

- The pre-existing `system-message-sink.test.ts` failure — fenced off,
  disclosed above, not fixed.
- The orthogonal tree-panel natural-width-below-floor jump (scenario 3
  above) — named as a candidate explanation for a *future* snap report,
  not fixed here; it predates this fix and isn't one of the four
  disclosed items.
- A dedicated jsdom/component-level test asserting the CSS hit-zone
  geometry (item 1) — the original fix's own report already disclosed
  jsdom cannot assert pseudo-element geometry reliably; unchanged here.
