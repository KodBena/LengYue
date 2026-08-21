# Divider-mechanics build report

Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a97d1410d8a7908eb`
(`lyt-phase2` tip at start: `2be85ff6`).

## Item 1 — Divider hit-zone centering

`frontend/src/App.vue`'s `.lyt-resizer-vertical`/`::before` CSS (the
shared class both `#resizer-outer` and `#resizer-inner` use).

Pre-repair: the div itself painted the 1px line at `left: 0; width:
1px`; `::before` added a 4px pointer-target overhang at the SAME `left:
0`. The union of hit regions was `[0, 4)` — the line's own center
(`0.5`) nowhere near that union's center (`2`): a grab zone entirely to
the right of the line, never symmetric.

A straddling negative-offset fix (`left: -1.5px`, centered on the line)
is unavailable: it is the identical shape a prior fix already found
un-hit-testable on `#resizer-inner`'s own anchor (`#control-panel`'s
`overflow: auto` clips any absolutely-positioned descendant rendered
outside its own padding box).

Fix: inverted which element is the full hit-zone. `.lyt-resizer-vertical`
is now the entire 4px grab zone itself (`left: 0; width: 4px`, cursor on
the whole box — never a negative offset, so the hit-test constraint
stays intact). The painted line moved to `::before`, positioned at the
zone's own center (`left: 1.5px; width: 1px`). Union of boxes is now
just the div's own `[0, 4)`; its center (`2`) equals the line's own
center (`1.5 + 0.5 = 2`) — the grab zone is geometrically centered on
the visible rule, symmetric on both sides, for both dividers via one
shared class.

Cosmetic effect: the 1px line's own rendered position shifts 1.5px
right of where it painted before (anchor's literal edge → the grab
zone's own center) — the same "visually indistinguishable at this
hairline width" tolerance the file already accepted for a prior,
never-shipped straddle attempt. The boundary a drag actually moves is
unchanged (still driven by `startResizeOuter`/`startResizeInner`'s own
measured origins).

No DOM test: jsdom does not evaluate pseudo-element computed geometry
reliably enough for this to be a meaningful assertion (confirmed by
inspecting existing suites — no prior test in this codebase asserts
`.lyt-resizer` pseudo-element geometry). CSS geometry is stated above
and in the file's own inline comment (`frontend/src/App.vue`, the
`.lyt-resizer`/`.lyt-resizer-vertical` block).

## Item 2 — Divider active beside absent region

Root cause: `#resizer-inner` lived inside App.vue's `#exclusive-
controlPanel` slot, and `LytNode.vue`'s Exclusive branch only renders
that slot's content when the Exclusive is `isPresent(...) ||
isExclusiveSummoned(...)`. When `controlPanel` demotes to absent, the
whole slot — resizer included — unmounts, so the tree side of the row
has no divider to drag into the freed (0px) track without also moving
the OUTER (board vs. side-column) bar.

Fix:
- `frontend/src/components/chrome/LytNode.vue` — the Exclusive branch
  gained a second, always-rendered, never-Teleported slot outlet,
  `#exclusive-divider-<widget>`, rendered unconditionally inside the
  Exclusive's own wrapper div (which itself already renders
  unconditionally — "Always present" per the file's own header) and
  outside the presence-gated `<Teleport>`/`v-if` block.
- `frontend/src/App.vue` — `#resizer-inner` moved out of
  `#exclusive-controlPanel` into the new `#exclusive-divider-
  controlPanel` slot, gated by `v-if="activeScreenClassId ===
  'landscape'"` (mirroring `#resizer-outer`'s own existing landscape-
  only gate). This gate turned out to be load-bearing: without it, a
  regression surfaced in `lyt-root-split-live.test.ts`'s existing
  portrait-resize test — portrait demotes `controlPanel` by default
  (repetition-first mobile disposition) and previously relied on the
  SAME presence gate to also hide `#resizer-inner`; portrait has no
  side-by-side row for this bar to mean anything against, so the fix
  is scoped to landscape only, restoring that absence on purpose.
- The dead `.control-panel-popover #resizer-inner { display: none; }`
  CSS rule (which hid the bar when Teleported into the popover — no
  longer applicable since the bar is never Teleported now) is removed,
  replaced with a HISTORICAL comment per ADR-0002.

The drag MATH (`useResizablePanel.ts`'s `startResizeInner`/
`onMouseMoveInner`, and `feasible-layout.ts`'s `allot()`) already
supported this correctly — `treeMaxWidthPx` is derived from
`#tree-control-wrapper`'s own live width regardless of `controlPanel`'s
presence, and the sovereign branch of `allot()` only reserves space for
PRESENT floor-bearing siblings. The bug was purely DOM-side (the
divider element itself never mounted); this closes that gap without
touching the math.

Test (new, `frontend/tests/integration/lyt-root-split-live.test.ts`,
appended describe block "App.vue — #resizer-inner stays active beside
an absent controlPanel"):
- `#resizer-inner` renders when `controlPanel` is desired-absent
  (landscape).
- A simulated mousedown/mousemove/mouseup drag on `#resizer-inner`
  while `controlPanel` is absent grows `treePanelWidthPx` by exactly
  the drag delta, while `treeControlRegionWidthPx` (the OUTER/board
  split's own persisted fact) stays `undefined` and `#split-
  workspace`'s own rendered grid-track style is byte-identical before
  and after the drag — "board split unmoved."

## Item 3 — Drag-time/render-time ceiling unification

`frontend/src/state/feasible-layout.ts` gained an exported pure
function, `computeRootSplitSideColumnCeilingPx({ rowWidthPx,
boardRailReservedPx, gapPx, boardFloorPx })` — `rowWidthPx -
boardRailReservedPx - gapPx - boardFloorPx`, floored at `0`. Both
occurrences of the ceiling arithmetic inside `resolveRootSplitLiveLayout`
(sovereign and non-sovereign branches) now call it, removing the
duplicated inline expression.

`frontend/src/composables/chrome/useResizablePanel.ts`'s
`startResizeOuter` now accepts an optional second parameter,
`rootSplitCeiling?: { boardRailReservedPx, gapPx }`, and calls the SAME
`computeRootSplitSideColumnCeilingPx` instead of the old approximation
(`rowWidthPx - RESIZER_WIDTH_PX - MIN_BOARD_PX`, which stood in for
`boardRailReservedPx + gapPx` with the resizer bar's own physical
width — a value with no principled relationship to boardRail's
reservation, diverging whenever boardRail was genuinely visible). The
prior inline comment documenting this as a "disclosed NARROWER
unification, not byte-identical" is removed (transcribed into the new
function's own header per ADR-0002) since the gap it disclosed no
longer exists.

`frontend/src/App.vue`'s `#resizer-outer` mousedown handler now threads
the SAME live `boardRailReservedPx`/`activeLytProgram.root.gapPx`
facts `rootSplitLayout` (the render-time solve) already reads:
`@mousedown="(e) => startResizeOuter(e, { boardRailReservedPx, gapPx:
activeLytProgram.root.gapPx })"`.

The optional-parameter default (`{ boardRailReservedPx: 0, gapPx: 0 }`)
exists only so `sync-session-version.test.ts`'s existing direct
composable call (`resizer.startResizeOuter(new MouseEvent(...))`, one
argument) still compiles and drags correctly — at a WIDER (never
narrower) ceiling than production, never a silent reintroduction of the
old `RESIZER_WIDTH_PX` approximation.

## Item 4 — Single-floor guard

New exported function `assertSingleFloorBearingRegion(others)` in
`frontend/src/state/feasible-layout.ts`: throws loudly (plain `Error`,
ADR-0002) when more than one region in the registry carries a non-null
`viabilityFloorPx`, naming the offending widget ids and pointing at the
ALLOT/presence two-pass fixpoint (`resolveSideColumnLiveLayoutUnguarded`'s
`allot()`) as the mechanism only proven correct for a single
floor-bearing region — widening to a second needs its own N-pass (or
genuinely iterative) convergence-loop treatment, named explicitly in the
message.

Deliberately NOT folded into `resolveSideColumnLiveLayout` itself:
`feasible-layout.test.ts`'s own "row 2501 defense in depth" block
deliberately constructs `others` arrays with ZERO floor-bearing regions
to probe an unrelated refusal path (a broken/undefined track) — a
universal "at most one" precondition inside the pure solver would have
misfired on those pre-existing, still-valid fixtures for a reason
unrelated to what they test. Instead, the guard is called from
`frontend/src/composables/chrome/useSideColumnLiveLayout.ts` — the
actual PRODUCTION construction site for the region registry (App.vue's
`sideColumnOtherRegions` feeds it straight through) — re-checked on
every reactive recompute of `others`.

Today `controlPanel` is the only region App.vue constructs with a
non-null `viabilityFloorPx` (`previewBoard`'s is `null`), so the guard
is currently a no-op in production; it fires loudly the moment a second
floor-bearing region is added without the accompanying convergence-loop
work.

## Gates

- `nice -n 19 npm run build` — **exit 0** (confirmed twice, most
  recently after all edits including the item-2 portrait-gate fix and
  the new test file).
- Per the coordinator's mid-session policy change (machine-health/
  concurrent-gate load), the vitest gate is **not part of this
  delivery's authoritative record** — the orchestrator runs the one
  authoritative vitest pass centrally after merge. For what it's worth,
  before that policy change landed, the full `--changed=<base>` suite
  (`nice -n 19 NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --changed=2be85ff6c786fc77344ab266b64edc1d7605db52 --maxWorkers=2`)
  ran green at **343/343 tests, 30/30 files** after the item-2
  portrait-gate fix (one failure surfaced and was fixed before that
  green run: the new always-rendered divider slot initially broke
  `lyt-root-split-live.test.ts`'s existing portrait-resize test, fixed
  by the `activeScreenClassId === 'landscape'` gate described above).
  The new test file (`lyt-root-split-live.test.ts`'s appended describe
  block) was also run standalone (`npx vitest run
  tests/integration/lyt-root-split-live.test.ts`) and passed (12/12)
  in that same pre-policy-change window — ships **uncommitted-verified**
  per the policy change's own framing (verified by me, not re-verified
  by the now-build-only gate).
- No `git merge` of the current `lyt-phase2` tip was performed before
  final gates, per the coordinator's explicit time-cut instruction
  (skip that step; the orchestrator merges and gates centrally).

## Per-item status

| Item | Status |
|---|---|
| 1. Divider hit-zone centering | Done — CSS geometry fix, documented above; no DOM test (jsdom pseudo-element geometry not reliably assertable) |
| 2. Divider active beside absent region | Done — LytNode.vue new slot outlet + App.vue rewiring + landscape gate; new integration test, passed standalone |
| 3. Drag-time/render-time ceiling unification | Done — shared `computeRootSplitSideColumnCeilingPx`, both call sites now byte-identical |
| 4. Single-floor guard | Done — `assertSingleFloorBearingRegion`, wired at the composable (production construction site), not the pure solver |

## Files touched

- `frontend/src/App.vue`
- `frontend/src/components/chrome/LytNode.vue`
- `frontend/src/composables/chrome/useResizablePanel.ts`
- `frontend/src/composables/chrome/useSideColumnLiveLayout.ts`
- `frontend/src/state/feasible-layout.ts`
- `frontend/tests/integration/lyt-root-split-live.test.ts` (new test
  block, plus a small rect-stub helper)

No new files created; no `FILES.md`/`FEATURES.md` update judged
necessary — these are geometry/behavior corrections restoring intended
divider behavior, not new user-facing capabilities, and no file was
added, moved, or removed.
