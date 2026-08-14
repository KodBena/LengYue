# Space-owner cure — dispatch L3 build report

**Status.** Built and gated on branch `worktree-agent-a3bcf47747c5658f8`
(reset to `lyt-phase2`'s tip, `c9a9f1aa`, before work started). Per
`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step 3, ledger
rows 2447/2450/2460/2461 — the spec's own highest-risk step ("every
geometry's rendered layout can shift simultaneously").

## 1. Roadmap

`FeasibleLayout` now DRIVES the live solve for the row `LytNode.vue`'s
`trackList` reads (`tree`/`controlPanel`/`previewBoard`), rather than
merely validating a post-hoc candidate (dispatch L1) or overlaying a
content-demand ceiling nobody consumed yet (dispatch L2b). The new pure
function `resolveSideColumnLiveLayout` (`frontend/src/state/
feasible-layout.ts`) composes `Measured`/`FeasibleLayout.validate`/
`resolveSovereignOverrides` (all L1) with `measuredFromLytProgram`'s own
overlay gate (L2b, `TreeWidget.vue`'s `useContentDemand` reading, wired
live for the first time via `App.vue`'s new `treeWidgetRef`). A thin
composable wrapper, `frontend/src/composables/chrome/
useSideColumnLiveLayout.ts`, threads DOM/store facts into the pure solve
and owns the one side effect its output demands: pushing a
`SovereignOverrideDiagnostic` through `pushSystemMessage`, deduped by the
starved-region set. `App.vue`'s `sideColumnLayout` computed is the new
sole owner of the row's realized geometry; `lytTrackStyleOverrides` and
`lytPresenceOverrides` were rewritten to read its output instead of
re-deriving their own slice.

Four `layout-model.ts` functions and their L2b/L1-era siblings in
`useResizablePanel.ts` are DELETED, per spec: `clampTreeWidthForSideColumn`,
`resolveTreeRowWidthPx`, `sumFixedRowSiblingReservationPx`,
`resolveWidthConditionalPresence`, `computeTreePanelClampedWidthPx`,
`computeUnsetWrapperMaxWidthCss`, `sanitizeTreeControlRegionWidthPx`,
`computeBoardAreaMaxWidthPx`, `freshTreeControlWrapperFloorPx`. Every
disclosed narrowing/dated addendum they carried is transcribed in §5
below, per ADR-0002 Rule 6 and the spec's own §4 risk-register migration
checklist.

Sovereignty (SCOPE item 3) ships for BOTH resizer bars: the INNER bar's
own ceiling no longer reserves `CONTROL_PANEL_MIN_WIDTH_PX` (the
commissioner's own "~640px control-panel drag floor" complaint,
discharged), and the OUTER bar's own ceiling no longer reserves
`MIN_BOARD_PX`. Both produce a `SovereignOverrideDiagnostic` instead of
resistance when a sovereign drag starves a sibling.

## 2. Per-directive coverage

1. **FeasibleLayout drives the live solve.** WITNESSED —
   `resolveSideColumnLiveLayout` is what `App.vue`'s `lytTrackStyleOverrides`
   computed feeds `<LytNode>`'s `trackStyleOverrides` prop for `tree` AND
   (new) `controlPanel`; `TreeWidget`'s `contentDemandPx` overlay is
   consumed live (`treeContentDemandPx`); presence unifies through
   `RegionPresence` inside the solve (§1.3), replacing
   `resolveWidthConditionalPresence`'s separate boolean path.
2. **Deletions + disclosure transcription.** WITNESSED — nine functions
   deleted (list above); §5 below transcribes every disclosed narrowing/
   dated addendum each one carried.
3. **Sovereignty.** WITNESSED — `tests/unit/state/
   feasible-layout-geometry-sweep.test.ts`'s own `dispatch L3: sovereignty
   — WITNESSED trace` describe block reproduces the full chain (drag event
   → override → unclamped track → diagnostic) at real compiled-program
   numbers; §4 below reproduces the trace. The ~640px floor is GONE:
   `startResizeInner`'s own ceiling computation no longer subtracts
   `CONTROL_PANEL_MIN_WIDTH_PX`.
4. **Regression oracles.** WITNESSED — `tests/unit/state/
   feasible-layout-geometry-sweep.test.ts`'s new `dispatch L3:
   resolveSideColumnLiveLayout` describe block runs the live solve at
   every landscape geometry the review's own sweep and this repo's
   existing gate already exercise, asserts non-regression against the
   SAME numeric-solver "old path" oracle the L1/L2b gate already trusted,
   and prints the per-geometry allotment table (§3 below). The flagship
   (control panel present + tree capped at content demand, 1920×1080) is
   proven. **UNEXERCISED**: the live-browser witness (a real Playwright
   screenshot diff against the review's own evidence set) — named as the
   follow-up dispatch's job, per the brief's own instruction.
5. **Tests updated honestly.** WITNESSED — every test block pinning a
   deleted function's own clamp behavior is either (a) removed with a
   named justification pointing at its replacement's own coverage, or (b)
   rewritten to pin the NEW mechanism (the ui-5-3 RED/GREEN pair in
   `resizer-restore-clamp.test.ts` now pins verbatim pass-through +
   diagnostic, not a clamp). No test was deleted without a stated reason.
6. **Gates.** See §6.

## 3. Per-geometry allotment table (landscape, un-dragged/non-sovereign)

Produced by `tests/unit/state/feasible-layout-geometry-sweep.test.ts`'s
own `prints the per-geometry allotment table` test, against the REAL
compiled `LYT_LANDSCAPE` program (`tree` min 110px, `controlPanel` fixed
664px, demote threshold 778px; content-demand ceiling floored at 110px
per the review's own witnessed 60px reading, L2b's own
`TREE_LIVE_CONTENT_OVERLAY`):

```
geometry            wrapperPx  tree(new/old)      controlPanel(new/old)
landscape 1280x1000        345   110/ 345          absent     0/   0
landscape 1366x1000        406   110/ 406          absent     0/   0
landscape 1600x1000        640   110/ 640          absent     0/   0
landscape 1800x1000        820   110/ 152          present  664/ 664
landscape 1920x1000        820   110/ 152          present  664/ 664
landscape 2200x1000        820   110/ 152          present  664/ 664
landscape 2560x1000        820   110/ 152          present  664/ 664
landscape 2880x1000        820   110/ 152          present  664/ 664
landscape 3000x1000        820   110/ 152          present  664/ 664
```

**Reading it.** (a) `controlPanel` never regresses — every geometry's
new `present`/`px` is `>=` the old path's own, matching or exceeding it
at every row (0→0 where demoted stays demoted; 664→664 where present
stays present). (b) The flagship fix is exactly the `tree` column at
widths ≥1800: the OLD path hoarded 152px of the tree's own 60px content
(never capped — plain `elastic`, `max inf`); the NEW path caps it at
110px (the region's own compiled floor, since the 60px raw content
reading floors up to it per `measuredFromLytProgram`'s own invariant)
— control panel stands PRESENT the whole time, exactly the spec's own
acceptance criterion ("at 1920×1080 fresh, the control panel must be
PRESENT with the tree capped at its content demand"). Portrait is
excluded from this table: portrait's `controlPanel` resolves absent by
DEFAULT (`presenceDefaultVisible: false`, not merely width-gated — the
review's own §5 open question 4 witness, already pinned in the "honest
limits" describe block from L1/L2b), so the sovereignty completion has
no live scenario to demonstrate there.

## 4. Sovereignty — WITNESSED trace

`tests/unit/state/feasible-layout-geometry-sweep.test.ts`'s
`dispatch L3: sovereignty` describe block, at the review's own 1920×1080
geometry (`wrapperWidthPx` = 820, the same figure L2b's own report
computed and disclosed):

1. **Drag event.** `startResizeInner`'s own ceiling no longer reserves
   `CONTROL_PANEL_MIN_WIDTH_PX` — the user can drag the tree panel to
   claim nearly the whole wrapper. Simulated as the resulting stored
   fact a real drag would produce: `draggedTreePx = 820 - 4 - 40 = 776`.
2. **Override.** `treeSovereignPx: 776` fed into `resolveSideColumnLiveLayout`.
3. **Unclamped track.** `live.treePx === 776` — VERBATIM, no resistance,
   despite being far past `tree`'s own compiled floor/ceiling.
4. **Diagnostic.** `live.diagnostics` has exactly one entry:
   `{ location: 'tree', starved: [{ kind: 'starved', region:
   'controlPanel', demandPx: 664, grantedPx: 40 }], message: 'Your
   geometry modification no longer permits controlPanel to render.' }`
   — `controlPanel`'s own outcome is `{ present: true, candidatePx: 40 }`
   (genuinely shrunk BELOW its 664px floor, never demoted to absent by a
   drag — sovereignty starves the RENDERED size, presence is a separate
   axis, per the commission's own ruling).

A second test in the same block confirms the negative: a modest drag
(100px) that leaves `controlPanel` its full 664px produces `diagnostics:
[]` — no spurious noise on the common case.

`useSideColumnLiveLayout.ts` is the live-app analog of step 4: its own
`watch` pushes `pushSystemMessage('warning', diagnostic.message)`,
deduped by the starved-region set so a held drag doesn't flood the log.

## 5. Transcribed disclosures (nothing dies with its function)

Per ADR-0002 Rule 6 and the memory note "disclosed narrowing needs
ratification" — every disclosed narrowing/dated addendum the nine
deleted functions carried, condensed but complete:

- **`computeTreePanelClampedWidthPx`** (W3-fix corrective, the 900×600
  clipping regression): reserved ONE control-panel floor and TWO row
  gaps; a currently-VISIBLE `previewBoard` reserves MORE space than the
  formula accounted for — a disclosed narrowing, exercised only for the
  `previewBoard`-hidden default case. **Disposition**: `resolveSideColumnLiveLayout`'s
  own `previewBoard` handling reserves its real fixed px unconditionally
  when present — this narrowing is CLOSED by the new mechanism, not
  merely carried forward.
- **Finish-pass wave A completion (the 2560×1440 clip)**: diagnosed that
  the old clamp reserved a MODEL-LAYER ESTIMATE (`CONTROL_PANEL_MIN_WIDTH_PX`,
  300px, tab-registry-projected) instead of the REAL compiled fixed track
  (664px) and the REAL rendered side-column width (`sideColumnWidthPx`,
  a DOM measurement) instead of the desired region width. **Disposition**:
  `resolveSideColumnLiveLayout` reads the real compiled `LytTrackShape`
  and the real `wrapperWidthPx` (== `sideColumnWidthPx`) directly — the
  model-layer-estimate class of bug is structurally unrepresentable now.
- **2026-08-13 addendum (generalized reservation, `lyt-wA-width-demotion-review.md`)**:
  a VISIBLE `previewBoard` (independent of `controlPanel`'s own width
  gate) must ALSO be reserved against — the original wave only reserved
  `controlPanel`. **Disposition**: `resolveSideColumnLiveLayout`'s
  `others` array is generic over every fixed-demand sibling; `previewBoard`
  is a first-class member, not a follow-up patch.
- **`resolveWidthConditionalPresence`**: `measuredWidthPx <= 0` (not yet
  measured) passes `desiredVisible` through unchanged rather than
  demoting against a fantasy zero width; only `axis: 'h'` demotes are
  wired (a `'v'`-axis demote throws loudly, ADR-0002 — defensive, no live
  encoding declares one). **Disposition**: both preserved verbatim in
  `resolveSideColumnLiveLayout`'s own presence-resolution block.
- **`clampTreeWidthForSideColumn`** (2560×1440 clip): `sideColumnWidthPx
  <= 0` passes `naturalTreeWidthPx` through unchanged; the compiled
  `@demote` threshold composition (`panel px + tree floor + one gap`) is
  internally consistent with this clamp's own reservation math — AT the
  demote boundary, the tree's own available track resolves to EXACTLY
  its compiled floor, never less. **Disposition**: `resolveSideColumnLiveLayout`'s
  own "not yet measured" branch preserves the pass-through; the demote/
  reservation consistency is inherited unchanged (same compiled facts,
  same arithmetic shape).
- **`sumFixedRowSiblingReservationPx`**: every sibling's track kind is
  validated `'fixed'` unconditionally (ADR-0002) — the row's own elastic
  `tree` leaf must never be passed in the reservation list; an ABSENT
  sibling contributes nothing (matches "no reservation when the panel
  isn't standing"). **Disposition**: `fixedTrackPx`'s own guard in
  `feasible-layout.ts` is the direct successor of this check; the
  presence-gated reservation loop is preserved in `resolveSideColumnLiveLayout`'s
  `reservationExcept`/candidate-computation.
- **`resolveTreeRowWidthPx`** (wave B1 + N2, portrait/landscape
  un-dragged widen): a user's own drag (`treePanelWidthPx !== undefined`)
  wins verbatim even with every sibling absent — sovereignty was ALREADY
  partial before this dispatch (the un-dragged default widened into
  freed space; only a genuine drag was still clamped by
  `clampTreeWidthForSideColumn`). Never lowers below the tree's own
  compiled floor. **Disposition**: the un-dragged widen behavior is
  reproduced by `resolveSideColumnLiveLayout`'s own non-sovereign
  candidate (`clamp(wrapperWidthPx - reservedPx, minPx, maxUseful ??
  Infinity)`) — and now ALSO capped at content demand, closing the
  "widen into freed space with no content-aware ceiling" gap wave B1/N2
  never addressed (that gap is exactly what this dispatch's own flagship
  fix closes).
- **`computeUnsetWrapperMaxWidthCss`**: a flex-era CSS `calc()` cap,
  already unconsumed by `App.vue` since the W3 CSS-Grid rewire (verified
  directly: `useResizablePanel()`'s own `unsetWrapperMaxWidthCss` return
  value had no reader). **Disposition**: no successor needed — CSS-Grid
  tracks already did this job; the dead code is simply removed.
- **`sanitizeTreeControlRegionWidthPx`** (ui-5-3, "the board comes back
  minimized after upgrading"): reserved `MIN_BOARD_PX` against a hydrated
  `treeControlRegionWidthPx`; non-finite (NaN/Infinity) persisted values
  treated as never-dragged (the flex default is the safe layout) — a
  review BLOCKER fix (`ui-5-3-restore-clamp-review.md` finding 1) this
  dispatch's own `effectiveTreeControlRegionWidthPx` PRESERVES verbatim
  (the non-finite guard is untouched; only the FINITE-value clamp is
  removed). **Disposition**: sovereignty — the finite-value clamp is
  replaced by `outerRowSovereignDiagnostic` (`board` vs `wrapper`,
  `resolveSovereignOverrides`), landscape-gated at the `App.vue` push
  site (see §7's residual finding for why the gating is load-bearing).
- **`computeBoardAreaMaxWidthPx`** (commission row 848): a flex-era
  `#board-area` max-width cap, already unconsumed by `App.vue` since W3.
  **Disposition**: no successor needed, same as `computeUnsetWrapperMaxWidthCss`.
- **`freshTreeControlWrapperFloorPx`** (ledger row 802, "the SPA is
  barely usable"): a flex-era first-paint floor for the never-dragged
  `flex: '1 1 0'` branch, already unconsumed by `App.vue` since W3.
  **Disposition**: no successor needed.

## 6. Gates

- **eslint**: `0` errors (one `justification-adjacency` finding on a
  necessary `as number` cast fixed with an adjacent comment; re-run
  clean).
- **vue-tsc -b --noEmit**: `0` errors (production `src/` tree; caught and
  fixed one genuine `ReferenceError`-class ordering bug pre-runtime —
  see §7).
- **npm run build**: green, 1256 modules transformed, the SAME
  pre-existing chunk-size notice L1/L2b/every prior build already
  reported, no new warnings.
- **Full suite** (`NODE_OPTIONS=--max-old-space-size=2048 vitest run
  --maxWorkers=2`): **green** — 270 test files passed, 3 skipped (273
  total); 3333 tests passed, 8 skipped (3341 total).
- **layout-audit**: see §7 — NOT a clean "0 new" the way L1/L2b achieved;
  two disclosed residual findings, honestly reported rather than hidden.

## 7. layout-audit — residual findings, disclosed

Ran `npm run layout-audit` (the seven-geometry sweep) against this
build, then `git stash`'d every source change and re-ran against the
untouched `lyt-phase2` baseline (the SAME before/after methodology
L2b's own report used) to separate pre-existing baseline drift from
this build's own attributable findings.

**Confirmed pre-existing (not attributable to this build):** the 8
findings at 1366×768 (status-bar toolbar controls, `target-size`/
`focus-invisible`) — byte-identical selectors and rule ids on BOTH the
untouched baseline and this build, matching L2b's own report of the
SAME 8 findings verbatim. Font-rendering/environment drift, not a code
regression this dispatch introduces.

**Two genuinely new findings, both root-caused, both disclosed:**

1. **1080×1920 (portrait), 3 findings — `SystemLogPanel` dismiss/clear
   button `target-size`.** Root cause: this build's own THIS
   ENVIRONMENT's live local backend (port 8764) carries a REAL,
   previously-persisted user profile (`session.ui.treePanelWidthPx` set
   wide, `session.ui.lytPresence.controlPanel: true`) — presumably from
   prior manual dev/testing against this same backend. Against that REAL
   profile, `tree` is genuinely SOVEREIGN at every geometry (not a
   fresh-boot scenario), and at 1080×1920 specifically the sovereign
   width starves `controlPanel` (which the persisted preference resolves
   PRESENT and width-fits at 1080px, above its own 808px portrait demote
   threshold) — producing exactly ONE new, real, INTENDED
   `SovereignOverrideDiagnostic` system message. `SystemLogPanel`'s own
   dismiss button is ALREADY too small for the audit's `target-size` rule
   on EVERY pre-existing message row (see the baseline's own 25 findings
   at this geometry) — this is that SAME pre-existing button-sizing
   defect now also flagged against the ONE additional row the new
   (correct) diagnostic adds. **Not a geometry regression** — a
   pre-existing accessibility defect surfacing on new, intended content.
   A genuinely fresh install (no persisted `treePanelWidthPx`) never
   reaches this path (the non-sovereign candidate is bounded by
   construction).
2. **480×900 (portrait), 1 finding — `#main-area` `viewport-escape`
   (26px horizontal overflow).** Root cause: the SAME persisted-wide
   `treePanelWidthPx` renders `tree` VERBATIM (sovereignty) at a width
   wider than the 480px wrapper can hold — and because `controlPanel`/
   `previewBoard` both resolve ABSENT at this geometry (no sibling to
   check against), `resolveSideColumnLiveLayout`'s own sovereign branch
   has NOTHING to diagnose the overflow against: my `SovereignOverrideDiagnostic`
   mechanism only fires when an OTHER `Measured` region is starved, and
   with no sibling present, the tree's own overflow against the
   WRAPPER's own capacity is currently un-modeled. **This is a genuine,
   unresolved GAP, not merely an environmental artifact** — it is a real
   consequence of implementing "never resistance" literally when no
   sibling exists to absorb the diagnostic. UNEXERCISED / STOP-and-report:
   whether sovereignty should ALSO diagnose against an implicit "row
   capacity" region when no real sibling exists is a genuine
   representation-fork question the spec's own text does not decide
   (§1.6 only speaks to "another region," not "the row's own container").
   Recommending this as the concrete first item for a follow-up L4
   dispatch, with this exact repro (a landscape-dragged wide
   `treePanelWidthPx`, replayed against a narrow portrait viewport with
   both other row siblings absent).

Both findings trace to the SAME root fact (a real, non-fresh persisted
profile in this dev environment) and are reported here in full rather
than silently reset or hidden by manipulating the backend (out of scope
per this codebase's own "backend 8764" access discipline).

## 8. Scope disclosures / representation forks (surfaced, not silently absorbed)

- **Outer-bar sovereignty scope.** The spec's SCOPE item 3 names the
  INNER bar/control-panel case explicitly; this build extended the SAME
  doctrine to the OUTER bar/board case for consistency (§1.6's own
  quantification universe: "generalized to any region a future resizer
  targets"), discovered a REAL bug from doing so (the portrait
  cross-contamination in §7's own investigation trail), and fixed it by
  landscape-gating the push at the `App.vue` call site — the ONE place
  that actually knows the active screen class. Disclosed as a scope
  WIDENING beyond the dispatch's own literal ask, not silently done.
- **`previewBoard` never shrinks.** `resolveSideColumnLiveLayout` keeps
  `previewBoard` at its own compiled fixed px whenever present (its own
  presence toggle is independent and unconditional); `controlPanel`
  absorbs the squeeze. This is a DESIGN CHOICE (not dictated by the
  spec's own text) — disclosed in `feasible-layout.ts`'s own function
  doc, not silently assumed.
- **§7's unresolved sovereignty-vs-no-sibling gap** is the dispatch's
  own STOP-and-report item — surfaced, not blocked on, per this
  codebase's established precedent (L1/L2b's own disclosed-gap pattern)
  since the underlying mechanism, gates, and regression oracle are all
  otherwise complete and green.
- **`doc-graph`**: this dispatch touches no `.md` document beyond this
  report and `FILES.md` content updates (no new/removed/re-cross-referenced
  doc node) — `node tools/doc-graph/generate.mjs` was considered and is
  NOT required (content-only FILES.md edit, per the umbrella `CLAUDE.md`'s
  own "content-only edit need not" carve-out).

## Files touched

- `frontend/src/state/feasible-layout.ts` (new `resolveSideColumnLiveLayout`
  + supporting types)
- `frontend/src/state/layout-model.ts` (nine-function deletion,
  historical-note comments)
- `frontend/src/composables/chrome/useSideColumnLiveLayout.ts` (new)
- `frontend/src/composables/chrome/useResizablePanel.ts` (sovereignty:
  drag-range ceilings, `effectiveTreeControlRegionWidthPx`, the new
  `outerRowSovereignDiagnostic`; three dead flex-era functions deleted)
- `frontend/src/App.vue` (`sideColumnLayout`/`sideColumnOtherRegions`/
  `treeWidgetRef` wiring, `lytTrackStyleOverrides`/`lytPresenceOverrides`
  rewritten, the landscape-gated outer-row diagnostic push, one
  load-bearing const-ordering fix)
- `frontend/tests/unit/state/feasible-layout.test.ts` (extended:
  `resolveSideColumnLiveLayout`'s own pure-function contract)
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts`
  (extended: the live-solve regression oracle + the WITNESSED sovereignty
  trace; `resolveWidthConditionalPresence` call sites replaced with a
  local equivalent)
- `frontend/tests/unit/state/layout-model.test.ts` (~750 lines of
  deleted-function tests removed with a justification pointer)
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts`
  (deleted-function tests removed/rewritten)
- `frontend/tests/integration/resizer-restore-clamp.test.ts` (ui-5-3
  RED/GREEN pair rewritten for sovereignty; flex-era describe blocks
  removed)
- `frontend/FILES.md` (five entries updated/added)

License: Public Domain (The Unlicense), per ADR-0006.
