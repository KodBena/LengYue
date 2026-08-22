# Drag-regression-0c21 — build report (ledger rows 2597/2598/2619/2620)

## Base

`next` at dispatch: `0c21780d` (`fix(frontend): settle-aware fit assertion —
report only violations persisting past grid-track settling`, row 2591
ruling), confirmed via `git log --oneline -1 next` and reset to exactly
that hash as the worktree's first act. Mid-session `next` advanced to
`63a0155d` (`docs(reports): preview-board autosize diagnosis... + board
dead-space REFUTED-FIXED verdict`) — three commits, none touching any
fenced file (`git diff --stat 0c21780d 63a0155d` touches
`usePlayFromPosition.ts`, `FILES.md`, `cards.sample.db`, two new
integration tests, and four new dispatch reports only). Fast-forward
merged cleanly (`git merge FETCH_HEAD --no-edit`), no conflicts, and the
full gate suite below is run on the merged tip.

`frontend/node_modules` symlinked to the shared checkout's, per the
disk-tight instruction — no `npm install` run.

Claimed on the autoharn ledger from the main repo root:
`./autoharn led work open drag-regression-0c21 "..."` → row 2619;
`./autoharn led work claim drag-regression-0c21` → row 2620.

## Escalation received mid-session

The commissioner escalated after this session's diagnosis was already
underway: the failure is a **recurrence** of ledger row 2538's class
("divider inactive beside absent region"), sharpened to its true width
per ADR-0000 — not "the divider activates beside an absent region" (too
narrow) but **"the divider's drag RANGE is non-degenerate — its
enforced minimum sits strictly below the current allotment whenever
reclaimable free space exists — at EVERY geometry."** This report's
closure statement (below) is written at that width, and the mandated
ADR-0011 Rule 2 mechanized net is delivered (the geometry-matrix test,
below) rather than a fix without one.

## Diagnosis

Read end to end before diagnosing: `.claude/dispatch-reports/
tree-floor-jump-build.md` (row 2578's INNER-bar fix, the brief's own
prime suspect) and `.claude/dispatch-reports/divider-reland-build.md`
(the re-land this arc builds on, whose own scenario 3 is the closest
prior repro of a similarly-shaped geometry). Also read
`frontend/src/state/feasible-layout.ts` and
`frontend/src/composables/chrome/useResizablePanel.ts` in full.

**The brief's own prime suspect, checked and REFUTED.** `treeFloorPx`
(row 2578's own field, `SideColumnLiveLayoutResult`) is computed
identically at all three return paths of
`resolveSideColumnLiveLayout`/`resolveSideColumnLiveLayoutUnguarded` —
always `effectiveTreeMinPx` (the compiled `elastic` track's floor,
lowered only by a genuine live content-demand undercut,
`resolveEffectiveDemand`) or the compiled default on a not-yet-measured/
degraded path. It is **never** derived from the current rendered
`treePx`, sovereign or not — confirmed by reading every return
statement and by the existing `treeFloorPx` test block
(`feasible-layout.test.ts`), which already pins "sovereign: treeFloorPx
still reflects the honest live floor, even though treePx itself renders
verbatim past it." A parallel investigation also confirmed
`TreeWidget.vue`'s own `contentDemandPx` (the live content-demand
reading `treeFloorPx` can lower to) is **not** circularly bound to the
container's current width — it derives from `useTreeLayout`'s pure
`rows`/`cols` layout shape plus a fixed, mount-time-measured scrollbar-
gutter constant, a previously-fixed defect (`TreeWidget.vue`'s own
inline history comment names the exact ~31px-leak-per-cycle class this
superseded). **Row 2578's own fix, and the INNER bar it repairs, are
sound.** The conflation is real, but it lives one level up.

**Reproduced live, root cause located precisely.** Environment per
`.claude/dispatch-reports/lytnode-recursion-fix-build.md`'s recipe:
isolated backend (fresh SQLite, `127.0.0.1:19764`), `vite --port 19173
--strictPort --host 0.0.0.0` with `frontend/` as the process cwd,
`frontend/scratch-shot.mjs` (extended this session with a
`mousemoveby` relative-delta action type and per-listener timing hooks
— both additive, the file's existing scratch-tool status, left
uncommitted per precedent) driving headless Chromium via CDP.

At 1920×1080, with `controlPanel` explicitly toggled off
(`store.session.ui.lytPresence.controlPanel = false` — the "Library" /
"Cards" / "Match" browsing mode the shot's own screenshot shows), the
side column's row solve (`resolveSideColumnLiveLayoutUnguarded`) gives:

| Region | Value |
|---|---|
| `tree` (natural, non-sovereign, content-capped) | 77px |
| `#tree-control-wrapper` (the OUTER split's own root-derived allotment, `rootSplitLayout.value.sideColumnPx`) | 880px |
| `#board-area` | 1016px |

880px of wrapper, 77px of tree, `controlPanel` present:false (0px) —
**803px of pure dead space** inside the wrapper, matching the shot's
"vast free middle space." The interior solve (`allot()`) is already
honest here: it correctly renders `tree` at its own content-capped
minimum and reserves nothing for the absent `controlPanel` — the
render-side authority was never the problem.

The DRAG-side authority for the OUTER bar, `useResizablePanel.ts`'s
`startResizeOuter`, used the hardcoded module constant
`WRAPPER_MIN_WIDTH_PX` (`state/layout-model.ts`:
`TREE_PANEL_MIN_WIDTH_PX(140) + RESIZER_WIDTH_PX(1) +
CONTROL_PANEL_MIN_WIDTH_PX(188)` = 329) as the drag's floor,
**unconditionally** — the SAME shape of bug row 2578 fixed for the
INNER bar, but never carried one level up to the OUTER bar. Live-drag
confirmed: from the 880px origin, the OUTER bar shrinks the wrapper
smoothly down to exactly 329px and then **refuses to go any
further**, no matter how far the mouse continues — stranding
`329 - 77 = 252px` of genuinely reclaimable width (~244px live-witnessed
figure the commissioner's own screenshot geometry implies) that the
render itself has already proven is safe to give back (nothing renders
into it). This is the "cannot diminish game tree width nor increase
middle panel size despite plenty of available space" symptom, precisely:
the divider *does* move, but its enforced minimum sits **way above**
the current allotment's true floor whenever `controlPanel` is absent —
non-degenerate in form, degenerate in effect, since a static constant
that assumes `controlPanel` is always going to claim its floor is wrong
the instant it isn't.

**Why this reads as a "recurrence" of row 2538's class, and why it
isn't literally the same bug.** Row 2538 was about presence-gating the
INNER divider's own *reachability* (it didn't render at all beside an
absent `controlPanel`) — already re-landed and re-verified
(`divider-reland-build.md`). This regression is about the OUTER
divider's own *range*: fully reachable, but with a presence-blind
floor. Same family (a container-scale quantity computed independently
of the region's own resolved presence), different divider, different
specific field — which is exactly why the escalation's sharper naming
("drag range non-degenerate at every geometry," not "divider active
beside absent region") is the correct level to close the class at.

## Fix

Per the escalation's item 3: `SideColumnLiveLayoutResult` now carries
`treeFloorPx` and `wrapperFloorPx` as **two separately-named fields**,
never one field doing double duty — the type-level separation the
escalation asked me to consider, adopted.

- **`frontend/src/state/feasible-layout.ts`**
  - `SideColumnLiveLayoutResult` gains `wrapperFloorPx: number` — the
    WRAPPER's own honest minimum, one level up from `treeFloorPx`.
  - New `computeWrapperFloorPx(treeFloorPx, gapPx, others,
    presentByWidgetId, widthOf)` — the ONE place the quantity is
    computed: `treeFloorPx` plus one `gapPx` and one reserved width
    (`viabilityFloorPx` when floor-bearing) per `others` entry that
    resolved **actually present**. Populated on all three return paths
    of `resolveSideColumnLiveLayout`/`Unguarded` (not-yet-measured,
    the `MeasurementRefusalError` degrade-gracefully catch, and the
    final post-fixpoint return), each choosing the presence map that
    path actually has available (`desiredVisible` where no fixpoint has
    run yet, `finalPresentByWidgetId` — the ACTUAL resolved presence,
    never the merely-desired one — at the final return).
- **`frontend/src/composables/chrome/useResizablePanel.ts`**
  - `computeTreeControlRegionWidthPx` gains a 4th, OPTIONAL parameter
    (`minWidthPx: number = WRAPPER_MIN_WIDTH_PX`) — a trailing default,
    so its arity stays 3 (the existing "pure function of its own three
    arguments" pin, `useResizablePanel.test.ts`, is unaffected).
  - `startResizeOuter` gains an optional `wrapperFloorPx?: number`
    parameter, captured into a new module-scope `regionMinWidthPx`
    local (mirroring `treeMinWidthPx`'s identical row-2578 pattern) and
    threaded into `computeTreeControlRegionWidthPx`'s new parameter
    inside `onMouseMoveOuter`. Omitting it reproduces the pre-repair
    static floor exactly — no behavior change for any caller that
    cannot supply the live fact (`sync-session-version.test.ts`'s
    direct `startResizeOuter(...)` calls).
- **`frontend/src/App.vue`** — the `#resizer-outer` mousedown handler
  now threads `sideColumnLayout.wrapperFloorPx` (the SAME reactive
  layout result App.vue already reads) into `startResizeOuter`,
  alongside the existing `rootSplitCeiling` object — the exact
  threading shape row 2578 established for the INNER bar's own
  `treeFloorPx`, mirrored one level up.

No sink/store-push path touched, no `StatusBar`, no `proxy/` — within
fence.

## Live witness (measured before/after)

Same environment as above; `window.store` (dev-only global) to set
geometry, native `MouseEvent` dispatch via `scratch-shot.mjs`'s
`mousemoveto`/`mousemoveby` actions.

**Before fix** (git-stashed the three source files back to `0c21780d`,
reloaded, same actions, then restored):

| Step | Measured |
|---|---|
| Natural render (`controlPanel` off) | tree=77px, wrapper=880px, board=1016px |
| Drag OUTER bar as far as it goes (900px of mouse movement) | wrapper stops at **329px** (`WRAPPER_MIN_WIDTH_PX`), board reaches 1567px — 252px of the reclaimable 803px never reached |

**After fix** (current worktree state, same actions):

| Step | Measured |
|---|---|
| Natural render | tree=77px, wrapper=880px, board=1016px |
| Grab OUTER bar, zero mouse movement | wrapper=880px (no jump) |
| First 1px shrink | wrapper=879px (linear, not a jump to any static bound) |
| Continue dragging (900px more) | wrapper reaches **77px** (== tree's own honest floor), board reaches **1819px** — the full 803px reclaimed |

## Regression check: no-snap behavior holds, both directions, both bars

Per the brief's explicit requirement, re-witnessed live in both
directions on both dividers, starting from an origin BELOW the old
static floor:

- **OUTER bar**, origin 77px (`controlPanel` off,
  `treeControlRegionWidthPx` sovereign-set to 77): grab-and-hold → 77px
  (no jump); 1px grow attempt → 80px (a ~3px real-cursor-delta move,
  tracked linearly, no snap to the old 329px floor).
- **INNER bar**, origin 200px (sovereign): grab-and-hold → 200px; 1px
  grow → 201px; 1px shrink (net −2 from the grown value) → 199px —
  clean linear tracking both directions.
- **INNER bar**, origin 77px (`controlPanel` off, non-sovereign, tree
  pinned at both its floor AND ceiling since `resolveEffectiveDemand`
  sets `maxUsefulPx` to the exact live content-demand reading): a grow
  attempt correctly STAYS at 77px — this is NOT a regression, it is the
  row-2501 anti-hoarding doctrine working as designed (a fresh/empty
  game tree's own content genuinely cannot render wider than its
  measured demand without a sovereign override); disclosed here so it
  isn't mistaken for a stuck divider.

## The ADR-0011 Rule 2 mechanized net

`frontend/tests/unit/state/feasible-layout.test.ts` — new
`wrapperFloorPx` describe block, a geometry matrix over presence ×
sovereign-override × width class, exactly per the escalation's item 2:

- **Presence axis**: `controlPanel` explicitly desired absent (the live
  regression's own geometry); desired present at ample width (resolves
  present, reserves its own floor only); desired present but
  auto-demoted at a narrow width (the fixpoint's ACTUAL resolved
  presence, never the merely-desired one).
- **Sovereign axis**: `treeSovereignPx` ∈ {undefined, 5, 900} — off, a
  low in-progress drag, a high one.
- **Width axis**: narrow (200px, below even `controlPanel`'s own
  floor), medium (500px), wide (2000px, ample room).

Assertions per cell: `wrapperFloorPx === treeFloorPx` (no reservation)
whenever `controlPanel` resolves absent, regardless of width or
sovereignty — the exact non-degeneracy property the live regression
violated; `wrapperFloorPx === treeFloorPx + gapPx +
CONTROL_PANEL_VIABILITY_FLOOR_PX` whenever it resolves present; and a
universal invariant that `wrapperFloorPx` is never larger than the
presence-blind static reservation (`110 + gap + viabilityFloor`) — "this
can only ever LOWER the enforced floor, never raise it." 24 new test
cases in this block.

`frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` —
mirrors row 2578's own `computeTreePanelWidthPx — optional minWidthPx`
block for `computeTreeControlRegionWidthPx`: default-preserving,
arity-pin, a direct reproduction of the live regression at the
pure-function level (77-origin, 1px shrink attempt, no floor supplied →
pinned at `WRAPPER_MIN_WIDTH_PX`, "hundreds of px above the true
minimum"), the fix confirmed (77-origin grows linearly to 78 off the
honest floor, and a shrink attempt from 77 correctly clamps AT 77, not
at the static constant), grab-and-hold, a floor-above-origin sanity
case, and an explicit non-degeneracy reach test (a drag from 880 with
803px of movement lands exactly on the 77px honest floor — the full
reclaimable range is reachable). 8 new test cases.

## Sluggishness investigation (item 2)

Measured, not vibed, per the brief's explicit instruction. Method: a
scripted 100-step drag against `#resizer-outer` — real `MouseEvent`s
dispatched directly on the element (not through Playwright's own IPC
per step, to avoid contaminating the measurement with driver overhead),
one `requestAnimationFrame` awaited between each step to capture the
FULL per-move cost (synchronous handler + Vue's reactive flush + the
browser's own CSS Grid layout/paint), not just the synchronous handler.

- **Synchronous handler cost alone** (wrapped `addEventListener`
  timing around the production `onMouseMoveOuter` listener): avg
  **0.14ms**, max 0.8ms over 100 events. Negligible — not the
  bottleneck.
- **Full per-move cost, DEV** (`vite` dev server, `controlPanel` off):
  avg 24.3ms, p50 23.8ms, p95 33.7ms, max 36ms.
- **Full per-move cost, DEV, default geometry** (`controlPanel`
  present, for an apples-to-apples comparison with the prod run below,
  since prod has no dev-only `window.store` to toggle it off): avg
  27.7ms, p50 30.8ms, p95 46.6ms, max 57.5ms.
- **Full per-move cost, PRODUCTION** (`npm run build` + `vite preview`,
  same default geometry): avg **31.9ms**, p50 33.2ms, p95 50ms, max
  62.9ms — comparable to, if anything marginally WORSE than, dev.
- **DOM mutation count** (`MutationObserver` on `document.body`,
  `attributes`/`childList`/`characterData`, subtree): ~1.02 mutation
  records per move — a single, minimal write per step, not a mutation
  storm.

**Conclusion, reported honestly per the brief's own escape valve:** the
"dev-mode-only overhead" hypothesis is **REFUTED** — production
measured comparably to dev, not faster. No single crisp dominant-cost
bug was found either: the handler itself is sub-millisecond, and the
per-move cost (typically ~1-2 rendered frames, occasionally 2-3 under
this tight one-move-per-rAF synthetic cadence) is the browser's own CSS
Grid layout/paint pass propagating the `trackStyleOverrides` write
across the nested `<LytNode>` tree — an inherent cost of the "true
nesting" architecture `useResizablePanel.ts`'s own header documents as
the DELIBERATE fix for the OLD flat-derivation cursor-lag bug (up to
541px of lag, per that file's own citation). rAF-throttling the drag
handler would not move this: the handler is already far cheaper than a
frame budget, and the browser already coalesces native `mousemove`
delivery to roughly once per rendered frame in practice, so Vue's own
microtask-batched reactivity is already capped at ~one flush per frame
regardless of raw input rate — there is no unthrottled-handler bug to
throttle. Restructuring the nested-grid architecture to reduce the
per-move paint fan-out is a real, larger undertaking outside this
delivery's reasonable scope, and risks reopening the exact cursor-lag
defect the nesting was built to close. Not fixed here; named as a
residual, pre-existing property of the architecture rather than a
regression this session's fenced files caused or can respons­ibly patch.

## Gates (synchronous, foreground, outputs read)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output. (Re-checked
  after the `next` merge to `63a0155d` — still clean.)
- `npx vitest run` on the targeted suites (feasible-layout,
  useResizablePanel, useLytFitAssertion, lyt-root-split-live,
  LytNode-fit-assertion, feasible-layout-geometry-sweep,
  sync-session-version) — **227 passed, 7 files, 0 failed.**
- `npx vitest run` (full suite, BEFORE the `next` merge, on `0c21780d`)
  — **3623 passed, 8 skipped, 1 failed** (291 files passed, 1 failed, 3
  skipped; 295 total). The one failure —
  `tests/unit/services/system-message-sink.test.ts`, "a SystemLogPanel-
  shaped subscriber runs exactly once per push, INCLUDING dedup-hit
  pushes" (an off-by-one in the recorded `runs` count) — is
  **pre-existing, out of fence, and FLAKY** (order/timing-sensitive,
  not this session's doing): `git diff` against both the source file
  and its test is empty; the SAME failure is named as pre-existing/
  out-of-fence in `divider-reland-build.md` (a prior session's own
  report); it reproduces deterministically when that ONE file is run
  in isolation (confirmed, `expected 4 to be 3`); and it does NOT
  reproduce in the full-suite run below on the merged tip — a timing/
  ordering-dependent flake in an unrelated, un-fenced file, disclosed
  rather than silently classified.
- `npx vitest run` (full suite, AFTER the `next` merge, on `63a0155d`)
  — **3628 passed, 8 skipped, 0 failed** (294 files passed, 3 skipped;
  297 total). Fully green.
- `npm run build` (`vue-tsc -b && vite build`) — exit 0, both before
  and after the `next` merge. Same pre-existing "chunk larger than
  500 kB" advisory as every prior report in this arc, unrelated.
- `next` re-checked at dispatch (`0c21780d`) and merged when it moved
  to `63a0155d` mid-session (three commits, no fenced-file overlap);
  all gates above are run on the merged tip.

## Closure statement (per the escalation's own naming)

The class this repair forecloses: **a divider's drag range degenerates
whenever its enforced minimum is computed independently of the row's
own resolved presence, rather than from the SAME presence-aware fact
the render just used** — not "a divider activates beside an absent
region" (row 2538's own narrower framing), but "the enforced minimum
sits strictly below the current allotment whenever reclaimable free
space exists, at every geometry." Verified across the enumerated
universe (presence: `controlPanel` absent / present-at-ample-width /
present-but-auto-demoted-at-narrow-width; sovereignty: off / low
in-progress / high in-progress; width: narrow / medium / wide) — 24 new
`wrapperFloorPx` cases plus 8 new `computeTreeControlRegionWidthPx`
cases, all passing, all asserting the non-degeneracy property or its
exact presence-derived formula. `treeFloorPx` and `wrapperFloorPx` are
now two separately-named fields on `SideColumnLiveLayoutResult` — the
conflation this class instantiates (a floor computed from something
OTHER than the region's own live minimum) is representable at the type
level only as two DISTINCT quantities, never one field standing in for
both a floor and an allotment. A future third divider in this family
inherits the same obligation: thread its own honest, presence-aware
floor from the SAME solve, never a fresh static constant.

## Honest not-done

- `WRAPPER_MIN_WIDTH_PX` itself is unchanged and still the fallback
  floor for callers with no live geometry (composable-level tests) and
  `computeTreeControlRegionDefaultWidthPx`'s conceptual sibling
  constants elsewhere in `layout-model.ts` — this repair does not
  attempt a broader reconciliation of that constant with the compiled
  solve; it only closes the ONE place (`startResizeOuter`'s drag floor)
  where the disagreement produced the live, user-visible stranding.
- The sluggishness investigation (item 2) found no fix to ship — see
  above for the full, honest account of what was measured and why no
  change was made.
- No `FILES.md`/`FEATURES.md` update judged necessary — a geometry
  correctness fix restoring intended drag behavior, not a new
  user-facing capability, and no file was added, moved, or removed.
- `frontend/scratch-shot.mjs`'s extensions (the `mousemoveby` action
  type, the per-listener timing hook used for the handler-cost
  measurement above) are left uncommitted, per this file's own
  established scratch-tool convention (prior sessions' own reports
  name the same posture).
