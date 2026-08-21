# Badge → toolbar strip, tree horizontal-scrollbar micro-build

Date: 2026-08-21
Branch: lyt-phase2 (checked out fresh at tip `4b4b14d2` — the worktree's
own branch was stale at `3378806f`, well behind; rebased onto the real
tip via stash + `git reset --hard lyt-phase2` + stash pop, resolving
merge conflicts by hand).

## 1. User badge → toolbar strip

The signed-in `UserBadge` lived in `StatusBar.vue`'s `.status-right`,
where a G12 narrow-mode collapse (`display: none` at <=700px) could hide
it entirely on resize — the witnessed defect. Per the commissioner
ruling, identity chrome must stay visible at every width.

- Removed `<UserBadge />` and its import from
  `frontend/src/components/board/StatusBar.vue`; removed the
  `:deep(.user-badge)` selector from the narrow-mode `display: none`
  rule (now orphaned) and updated the surrounding doc comments that
  described it as a collapsed segment.
- Added `<UserBadge />` to
  `frontend/src/components/chrome/ToolbarAppCluster.vue` — the actual
  component (post-LYT-reencode) that hosts the engine URI editor,
  the sliders/PBO popovers, and `LocalePicker`, i.e. exactly the
  "ENGINE URI / SLIDERS / language select" row the brief named. Badge
  sits after `LocalePicker`, same rendered content/i18n/tokens, no new
  CSS. This cluster's own `flex-wrap: wrap` (never `display: none`)
  keeps the badge visible at every width — narrow allocations wrap it
  onto a new row instead of hiding it.

Collateral fix: removing the third selector from StatusBar's narrow-mode
rule left `.move-numbers-btn` immediately before `{`, which an existing
fragile-regex test (`tests/unit/pointer-target-minimum-size.test.ts`)
latched onto instead of the intended base rule further down the file.
Fixed by reordering the two remaining selectors in that rule (no
behavior change, no other builder's territory touched).

## 2. Tree: no horizontal scrollbar at default layout

`TreeWidget.vue`'s `.tree-widget-outer` used `overflow: auto` on both
axes. Root cause of the false-positive scrollbar at default (unexpanded)
allocation: the classic scrollbar-collision — a vertical scrollbar
(near-certain for any real game, since `svgHeight` grows with move
count) silently eats ~15-17px of horizontal budget only while it happens
to be showing, turning content that fits into content that overflows,
non-deterministically. Fixed with `scrollbar-gutter: stable`, which
reserves that gutter unconditionally so the horizontal budget is
constant across mount/collapse/expand cycles. `overflow-x: auto` is
kept — once the user genuinely expands past the default budget (more
manual variation-toggles than the "1-2 side variations" default
promise), a scrollbar is still the correct affordance.

Threading the tree's own `contentDemandPx` (already exposed via
`defineExpose`, per commit b8991b1a) into the LYT allocation solver
(`resolveSideColumnLiveLayout`) was found to be a *prior* dispatch's
deliberate, disclosed scope narrowing — out of bounds here per "no
layout-engine rewrites." The fix stays entirely inside this component's
own CSS.

Test: `frontend/tests/integration/TreeWidget.default-layout-overflow.test.ts`
(new). jsdom runs no real layout/paint pipeline and this project's
vitest config runs with `css: false`, so neither a `scrollWidth >
clientWidth` DOM check nor a `getComputedStyle` read of
`scrollbar-gutter` would be honest here (both documented in the test's
own header). Instead it pins `TreeWidget`'s own contract with the
solver: `contentDemandPx` stays at the documented default ceiling
(cols <= 3, "1-2 side variations" via `ensureVisible` auto-reveal, no
user toggle) and genuinely exceeds it once the user manually expands a
collapsed branch. Two cases, both green.

## Gates

- `nice -n 19 npm run build`: exit 0.
- `NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 npx vitest run --changed=main --maxWorkers=2`: exit 0 — 268 test files passed, 3 skipped; 3267 tests passed, 8 skipped; 0 failed.

## Files touched

- `frontend/src/components/board/StatusBar.vue`
- `frontend/src/components/chrome/ToolbarAppCluster.vue`
- `frontend/src/components/tree/TreeWidget.vue`
- `frontend/tests/integration/TreeWidget.default-layout-overflow.test.ts` (new)
