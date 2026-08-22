# Tree-floor-drag-jump repair — build report (ledger row 2578)

## Base

`next` at dispatch: `f1e3bb7d` (`fix(frontend): re-land divider mechanics —
centered hit-zones, presence-independent inner divider, unified
root-split ceiling, single-floor guard`), confirmed unmoved
(`git log --oneline -1 next`) immediately before the final gates below.
Worktree merged cleanly to this hash before any work (fast-forward
merge of `next`'s own tip into the worktree's branch, no conflicts).
`node_modules` symlinked to the shared checkout's, per the disk-tight
instruction — no `npm install` run.

Claimed on the autoharn ledger: `./autoharn led work claim
tree-floor-drag-jump` → row 2579.

## Diagnosis

Read end to end before diagnosing: `.claude/dispatch-reports/
divider-reland-build.md` (its scenario 3 is the exact repro geometry —
tree naturally rendering at 77px, below the 140px drag floor, in a
narrow `library`-overlay layout) and `.claude/dispatch-reports/
divider-mechanics-build.md` (the drag-math and ceiling-unification
precedent this repair mirrors, item 3). Also read
`frontend/src/state/feasible-layout.ts` and
`frontend/src/composables/chrome/useResizablePanel.ts` in full.

**Two authorities for one quantity (ADR-0000 framing), located precisely:**

- The RENDER authority: `resolveSideColumnLiveLayout`
  (`state/feasible-layout.ts`) computes the tree region's own honest,
  live floor per render — `effectiveTreeMinPx`, derived from
  `resolveEffectiveDemand(treeTrack.minPx, tree.maxUsefulPx)`. This is
  the compiled `elastic` track's own `minPx` (110px in the shipped LYT
  program — confirmed by reading `lyt-layout.gen.ts`'s own `tree` leaf
  track, `{ kind: "elastic", minPx: 110, frWeight: 1 }`), further
  lowered when a live content-demand reading (`TreeWidget`'s
  `useContentDemand`) genuinely undercuts it — this is the deliberate,
  heavily-documented row-2501 repair ("live truth wins"). The
  non-sovereign candidate (`allot()`'s own arithmetic) is always
  clamped to be `>= effectiveTreeMinPx`, so a render can legitimately
  sit anywhere in `[effectiveTreeMinPx, ceiling]` — including well below
  the static 140.

- The DRAG authority: `useResizablePanel.ts`'s `startResizeInner` used
  the hardcoded module constant `TREE_PANEL_MIN_WIDTH_PX = 140`
  (`state/layout-model.ts`, a readability-guarantee literal, explicitly
  and deliberately EXCLUDED from the `lyt-constants-swap` — see that
  file's own comment — because it disagrees with the compiled solve at
  every measured size) as the INNER bar's floor, entirely independent of
  whatever the render actually computed.

Because the render's floor (`effectiveTreeMinPx`, ≤ 110 always given
the shipped program) is always `<= 140`, a render that lands anywhere in
`[110, 140)` — which the row 2501 content-demand rule, or simply a
narrow side column with present siblings, both produce routinely — sits
BELOW the drag floor. `computePaneWidthPx`'s own `Math.max(minWidthPx,
...)` fires the instant a `mousemove` event arrives, independent of how
small the delta is, because the ORIGIN itself is already below
`minWidthPx`. That is the "instant snap on dragging" defect: not a
resistance-then-release, a genuine discontinuity on the very first
pixel of movement.

## Which authority wins, and why

Per the brief's framing: **the drag floor now derives from the render's
own live floor**, not the other direction. Reasons this is the ratified
shape rather than the alternative ("render never below floor"):

1. The row-2501 repair (`resolveEffectiveDemand`'s own extensive header,
   `state/feasible-layout.ts`) is a DELIBERATE, previously-reviewed
   decision that a content-dependent region's live demand should be
   allowed to undercut its own compiled floor — "the compiled floor is a
   disclosed, solver-only relaxation... live truth wins." Forcing the
   render to never go below 140 would directly undo that ratified
   design and reintroduce the exact hoarding/crash-avoidance problem
   that repair closed.
2. `TREE_PANEL_MIN_WIDTH_PX` was already, explicitly, excluded from
   being kept in sync with the compiled LYT solve (`layout-model.ts`'s
   own `lyt-constants-swap` comment: "large, viewport-varying
   divergence... none of these four qualify"). It is a legacy
   readability target, not a currently-enforced floor the render
   actually honors — the render already renders narrower than it, in
   the ordinary case (110 < 140), without any content-demand narrowing
   at all.
3. This is structurally the SAME shape as divider-mechanics item 3
   (`computeRootSplitSideColumnCeilingPx` unifying the OUTER bar's
   drag-time ceiling with the render-time solve): a composable-level
   constant that used to approximate a quantity the pure solver now
   computes authoritatively, threaded through as an explicit parameter
   at the one composable that needs it, defaulting to the old constant
   only for callers with no live geometry to supply.

This was NOT ambiguous enough to warrant stopping and asking — the
codebase's own prior review history (row 2501/2511) already settled
"live truth wins" as the standing doctrine for this region; this repair
only extends that same doctrine to the ONE remaining place
(`useResizablePanel.ts`'s drag floor) that hadn't caught up to it.

## Fix

- **`frontend/src/state/feasible-layout.ts`** — `SideColumnLiveLayoutResult`
  gains `treeFloorPx: number`: the SAME `effectiveTreeMinPx` the
  non-sovereign candidate is already clamped against, populated on
  every return path of `resolveSideColumnLiveLayout` (measured,
  not-yet-measured, and the `MeasurementRefusalError` degrade-gracefully
  fallback — the latter two use the compiled track's own `minPx`, the
  same "not yet measured" convention every sibling default in this
  module already follows).
- **`frontend/src/composables/chrome/useResizablePanel.ts`** —
  `computeTreePanelWidthPx` gains a 4th, OPTIONAL parameter
  (`minWidthPx: number = TREE_PANEL_MIN_WIDTH_PX`) — a trailing default,
  so `computeTreePanelWidthPx.length === 3` stays true (the existing
  pin in `useResizablePanel.test.ts` is unaffected: a parameter with a
  default initializer does not count toward `Function.prototype.length`).
  `startResizeInner` gains an optional `treeFloorPx?: number` parameter,
  captured into a new module-scope `treeMinWidthPx` local (mirroring the
  existing `treeMaxWidthPx` pattern) and threaded into
  `computeTreePanelWidthPx`'s new parameter inside `onMouseMoveInner`.
  Omitting `treeFloorPx` reproduces the pre-repair static floor exactly
  — no behavior change for any caller that cannot supply the live fact
  (`sync-session-version.test.ts`'s direct one-argument
  `startResizeInner(...)` call).
- **`frontend/src/App.vue`** — the `#resizer-inner` mousedown handler
  now threads `sideColumnLayout.treeFloorPx` (the SAME reactive layout
  result App.vue already reads for `treePx`/`others`) into
  `startResizeInner`, mirroring exactly how the OUTER bar's mousedown
  handler already threads `boardRailReservedPx`/`gapPx` into
  `startResizeOuter` (divider-mechanics item 3). Doc comments added at
  both the interface field and the two call sites per ADR-0002.

No sink/store-push path touched, no `StatusBar`, no `proxy/` — within
fence.

## Live witness (measured before/after)

Environment per `.claude/dispatch-reports/lytnode-recursion-fix-build.md`:
isolated backend (`/home/bork/scratchpad/venv`, fresh SQLite,
`127.0.0.1:19764`), `vite --port 19173 --strictPort` with `frontend/` as
root, `frontend/scratch-shot.mjs` driving headless Chromium via CDP,
`window.store` (dev-only global) to set geometry and read back via
`getBoundingClientRect()`.

Repro geometry: setting `session.ui.treeControlRegionWidthPx = 300`
(a narrow side column, both siblings present at default width/reservation)
naturally rendered the tree panel at **77px** — no content-demand
overlay manipulation needed; this geometry alone already sits the
compiled solve below the static 140px floor. This is the same 77px
figure `divider-reland-build.md`'s own scenario 3 reports.

**Before fix** (git-stashed the three source files back to `f1e3bb7d`,
reloaded, same actions, then restored):

| Step | Measured |
|---|---|
| Natural render, before grab | tree = 77px |
| Grab, zero mouse movement | tree = 77px (no jump yet — no write happens until an actual `mousemove`) |
| First 1px mouse movement | `session.ui.treePanelWidthPx` **snaps to 140** (rendered tree width itself further clamped to 108 by the row's own capacity — irrelevant to the point: the STORED value discontinuously jumped from a 77px origin to 140 on a 1px gesture) |
| 10 more px of movement | stays at 140 (no further tracking — a large chunk of the drag's own range is dead) |

**After fix** (current worktree state, same actions):

| Step | Measured |
|---|---|
| Natural render, before grab | tree = 77px |
| Grab, zero mouse movement | tree = 77px |
| First 1px mouse movement | tree = 78px, `treePanelWidthPx` = 78 — exactly `origin + delta`, linear |
| 10 more px of movement | tree = 88px, `treePanelWidthPx` = 88 — continues tracking linearly |

Screenshots and the actions/eval scripts used are under
`/tmp/claude-1000/-home-bork-w-omega/34662d1c-abab-419f-acb0-b36c9a5e7de0/scratchpad/tree-floor-repro/`
(scratch, not committed): `03-after-fix.png`/`04-before-fix.png`/
`05-after-fix-restored.png` are the three drag witnesses; `actions-drag.json`
is the driver script.

## Regression check: the four re-landed divider items still hold

- **Grab-and-hold zero jump (OUTER bar)**: re-witnessed live at the same
  narrow-wrapper geometry — `#resizer-outer` grab left `#tree-control-wrapper`
  unchanged (300→300px) at zero mouse movement, then tracked continuously
  on a real movement (no snap to any static bound). Untouched by this
  fix (this repair only touches the INNER bar's floor).
- **Divider active beside absent region (item 2)** and **ceiling
  unification (item 3)**: not touched by this fix's diff (confirmed:
  the diff to `App.vue`/`LytNode.vue`'s presence-slot machinery and
  `computeRootSplitSideColumnCeilingPx` is empty); the full suite
  (below) re-runs `lyt-root-split-live.test.ts`'s own coverage for both,
  green.
- **Single-floor guard (item 4)**: untouched; `assertSingleFloorBearingRegion`'s
  own suite is unmodified and green.

## Tests added

- `frontend/tests/unit/state/feasible-layout.test.ts` — new
  `describe('treeFloorPx: ...')` block: the ordinary case
  (`treeFloorPx === 110`, matching the compiled track), the row-2501
  content-demand-undercut case (`treeFloorPx` follows `treePx` down to
  109, and the `treePx >= treeFloorPx` invariant holds), the
  demand-of-0 special case (pins to 110, never 0), the sovereign case
  (floor stays honest even though `treePx` itself renders verbatim past
  it — relevant to a SUBSEQUENT drag-start), and the not-yet-measured
  default.
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` —
  new `describe('computeTreePanelWidthPx — optional minWidthPx ...')`
  block: the default-preserving case, the arity pin
  (`computeTreePanelWidthPx.length === 3`, confirming the trailing
  default parameter doesn't widen it), a reproduction of the pre-repair
  jump when the caller omits the live floor (77-origin, 1px move → 140),
  the fix confirmed at the pure-function level (77-origin, 1px move,
  77-floor → 78, linear), the grab-and-hold-with-live-floor case, and a
  floor-above-origin sanity case (the parameter changes WHICH floor
  binds, not whether one does).

## Gates (synchronous, foreground, outputs read)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output.
- `npx vitest run` — **3594 passed, 8 skipped, exit 0** (292 files
  passed, 3 skipped, 295 total). No failures this run — nothing to
  isolate/re-run.
- `npm run build` (`vue-tsc -b && vite build`) — exit 0. Same
  pre-existing "chunk larger than 500 kB" advisory as every prior
  report in this arc, unrelated to this change.
- `next` re-checked immediately before these gates: still `f1e3bb7d`,
  unmoved — no absorb/regate needed.

## Closure statement

The tree panel's drag floor and its own render floor are now derived
from the ONE `effectiveTreeMinPx`/`treeFloorPx` fact
(`state/feasible-layout.ts`), read by both the render (`allot()`'s own
clamp) and the drag-start (`useResizablePanel.ts`'s `startResizeInner`).
No clamp hides the disagreement — the disagreement is closed at its
source. Live-witnessed: grab at natural (77px) width, first 1px movement
tracks linearly to 78px, no snap. The re-landed divider-mechanics items
(hit-zone centering, presence-independent inner divider, ceiling
unification, single-floor guard) are unaffected and re-verified green.

## Honest not-done

- The static `TREE_PANEL_MIN_WIDTH_PX = 140` constant itself is
  unchanged and still used as the fallback floor for callers with no
  live geometry (composable-level tests) and as `computeTreePanelDefaultWidthPx`'s
  own floor (`state/layout-model.ts`) — this repair does not attempt to
  reconcile that constant with the compiled LYT solve's 110px more
  broadly (an explicitly out-of-scope divergence per that file's own
  `lyt-constants-swap` comment); it only closes the ONE place
  (`startResizeInner`'s drag floor) where the disagreement produced a
  live, user-visible discontinuity.
- No `FILES.md`/`FEATURES.md` update judged necessary — a geometry
  correctness fix restoring intended drag behavior, not a new
  user-facing capability, and no file was added, moved, or removed.
