# LYT allocation remainder — build report

Branch `lyt-allocation-remainder`, built on top of `7c3e0dbe` (verified
at branch creation: `git log --oneline -3` showed `7c3e0dbe`, `b8991b1a`,
`829e952c`). Base reading, end to end, per ADR-0002: this ticket's own
prompt; `.claude/dispatch-reports/lyt-allocation-repair-build.md` (364
lines); `.claude/dispatch-reports/ui-shoddiness-audit-2026-08-21.md` (293
lines); `.claude/dispatch-reports/control-panel-demotion-rca.md` (666
lines); `.claude/dispatch-reports/lyt-allocation-repair-review.md` (282
lines, delivered mid-flight as a coordinator addendum). The umbrella and
frontend `CLAUDE.md` and `frontend/tests/CLAUDE.md` were read in full at
session start per the standing discipline.

**Delivery order, per the coordinator's explicit escalation:** item 1 is
delivered as this standalone commit the moment its own gates went green,
ahead of items 2–5 (S2/S3/S8/wiki-5) and every mid-flight addendum. A
second commit/report covers whatever of the remainder budget allows;
several addenda below are recorded NOT-DONE and named for a follow-up
session, per this ticket's own "STOP and report the concrete blocker"
discipline rather than a silent drop.

**Gates (this commit).** `nice -n 19 npm run build` → exit 0.
`nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
--changed=7c3e0dbe --maxWorkers=2` → **22 files / 301 tests passed, 0
failed.**

---

## Item 1 (PRIORITY) — region-owned presence (ledger row 2532, the ruled
demotion remedy)

**Status: IMPLEMENTED, WITNESSED (unit + integration), UNEXERCISED live.**

### Root cause (verified against the RCA, not merely cited)

`control-panel-demotion-rca.md` traced the "control panel reports too
small while half the viewport sits empty" complaint to a single line,
`feasible-layout.ts`'s old `presentByWidgetId` loop: `fits =
wrapperWidthPx >= demote.belowPx + reservationExcept(...)`. The compiled
`demote.belowPx` (778px landscape) is a CONTAINER-scale composite —
`tree.min (110) + gap (4) + controlPanel's own COMPILED FIXED TRACK
(664)` — evaluated against the row's raw container width regardless of
what `tree` is actually claiming. On the inner-divider (sovereign tree)
path, `tree`'s claim can diverge arbitrarily from the 110px the
threshold assumes, while the predicate keeps asking the CONTAINER-scale
question — producing two different presence verdicts for the identical
realized panel width, depending only on which divider produced it.

### Fix — region-owned presence, ALLOT/presence split

`frontend/src/state/feasible-layout.ts`:

- `SideColumnFixedRegion.demote: LytDemotion | null` → `viabilityFloorPx:
  number | null` — the region's own minimum renderable demand
  (`CONTROL_PANEL_MIN_WIDTH_PX`, `state/layout-model.ts`, 300px
  landscape — a frontend-composed fact, not a `research/lyt/` compiler
  edit; `previewBoard` keeps `null`, its presence toggle stays
  unconditional).
- `resolveSideColumnLiveLayoutUnguarded` restructured into a declared
  two-pass fixpoint: `allot()` (given a presence guess, compute what
  `tree` and every `others` entry would actually be granted) → a new
  standalone `resolveRowPresence(allotment, regions)` whose signature
  carries **only the resolved allotment** — `wrapperWidthPx` is
  structurally absent from its parameter list, not merely unused → a
  second `allot()` pass with the corrected presence verdict, which is
  the function's final, rendered output. This satisfies the mandate's
  "container width structurally absent from the presence stage's
  signature" literally, not by convention.
- **Drags floor, never demote to absent** (the ruled remedy, the pinned
  doctrine at `feasible-layout-geometry-sweep.test.ts:742-780` — "never
  demoted to absent by a drag" — now extended to "floored, not
  demoted"): `allot()`'s sovereign branch reserves
  `viabilityFloorPx + gapPx` for every desired, floor-bearing sibling
  BEFORE letting `tree`'s raw sovereign value bind — `treePx =
  floorReservationPx > 0 ? min(rawTreePx, max(0, wrapperWidthPx -
  floorReservationPx)) : rawTreePx` (the guard on `floorReservationPx >
  0` matters: with NO floor-bearing sibling present, sovereignty stays
  fully verbatim, unresisted, exactly as before — the reservation cap
  only ever protects something that needs protecting). Each floor-bearing
  sibling's own candidate is then floored a second time
  (`Math.max(viabilityFloorPx, cappedPx)`, sovereign-only) as a
  degenerate-wrapper backstop for the case even the tree-side
  reservation can't fully satisfy — in that rare case the row's own
  total claim can genuinely exceed `wrapperWidthPx`, which the
  pre-existing `sideColumnCapacityStarvation` mechanism (dispatch L4)
  is the correct, already-built diagnostic for.
- **Presence-derived diagnostic, fires iff actually absent** (Remedy 3):
  a `SovereignOverrideDiagnostic` is now synthesized directly whenever a
  desired, floor-bearing region resolves absent — on BOTH the sovereign
  and non-sovereign path, closing the RCA's own §4 "genuine demotion on
  the outer path emits no diagnostic at all" bug. The OLD
  `resolveSovereignOverrides`-based per-sibling starvation check (which
  compared a squeezed-but-present region against its full COMPILED
  track, the source of the RCA's OTHER §4 finding — "false alarm on the
  inner path") is removed for floor-bearing regions entirely: presence
  itself now IS the floor check, so a region that stays present can
  never, by construction, have fallen below its own floor — nothing is
  left to falsely diagnose.

`frontend/src/App.vue`: `sideColumnOtherRegions` threads
`viabilityFloorPx: CONTROL_PANEL_MIN_WIDTH_PX` (controlPanel) /
`viabilityFloorPx: null` (previewBoard). The root split's own
`sideColumnDesiredMinPx` floor-raise (S1's own mechanism) now reads a
NEW `controlPanelViabilityThresholdPx` computed — `tree.min + gap +
CONTROL_PANEL_MIN_WIDTH_PX` (414px landscape) — replacing the retired
`controlPanelDemote.value.belowPx` (778px). This is a **strict
improvement over the S1 fix**, not a rename: at 1366×768 the side
column's own natural yield (638px) now clears the region-owned
threshold outright, so the board yields **nothing** to dock the panel
(previously it yielded 140px to close a 778px gap) — reproduced directly
in `tests/integration/lyt-root-split-live.test.ts`.

### Also fixed in the same pass (Probe 5, addendum item 1)

`App.vue`'s `sovereignClampedFromPx` watcher wrote its dedup key
(`lastPushedRootSplitClampFromPx`) BEFORE the `outerRowSovereignDiagnostic`
suppression check — a suppressed attempt could poison the key and
permanently silence a later push that should fire alone (reviewer's
Probe 5, `.claude/dispatch-reports/lyt-allocation-repair-review.md`).
**Not subsumed by item 1's own presence diagnostic** — this watcher
covers the OUTER root split's board-floor clamp, a different mechanism
from the interior region-owned presence this ticket's item 1 targets, so
the fix is a direct four-line reorder (the key now latches only on an
actual push), not a removal.

### Tests

Unit: `tests/unit/state/feasible-layout.test.ts` — every `demote:`
construction site migrated to `viabilityFloorPx:`; the retired
"unsupported demote axis" throw-guard test removed (the guard itself is
gone — `viabilityFloorPx` has no axis, so the caller-contract violation
it caught is now unrepresentable in the type, not merely unchecked); the
778px demote-boundary describe block rewritten around the new 414px
region-owned threshold with the arithmetic shown inline; the
previewBoard-reservation test rewritten around its own new 578px
threshold; the dispatch-L4 capacity tests rewritten (a floor-bearing
sibling can no longer be "starved while present," so the "both real at
once" scenario is reproduced instead via a non-floor-bearing sibling's
own unconditional reservation surviving the floor guarantee); the
Infinity defense-in-depth probe re-scoped to a non-floor-bearing sibling
(a floor-bearing one now makes a corrupted Infinity override SAFE by
construction — a positive side effect, not a gap). Every migrated
expectation carries an inline "MIGRATED per ledger row 2532" comment
naming why the new value is the contract.

`tests/unit/state/feasible-layout-geometry-sweep.test.ts` — the
sovereignty describe block's "commissioner's ~640px drag floor is GONE"
test rewritten as "the ruled demotion remedy: floors at 300px, never
demotes, never falsely diagnoses"; a new continuous-drag-tracking test
(addendum item 3, see below) added.

`tests/unit/state/feasible-layout-purity.test.ts` — construction sites
migrated; §C's sanity check re-derived (a floor-bearing sibling alone
can no longer produce a diagnosable overflow at ANY geometry in the
traversal — the row's own arithmetic balances exactly by construction —
so the override/fixture was re-scoped to include `previewBoard` present
too, whose unconditional reservation is the only remaining overflow
source). **New §G describe block** — the RCA's own item-4 purity
requirement ("a purity test sweeping width AND sovereignty together over
both divider orders"): builds an OUTER-divider outcome set (wrapperWidthPx
swept, non-sovereign — including two values composed end-to-end through
`resolveRootSplitLiveLayout` with boardRail absent/present, the
coordinator's own live-witness addendum) and an INNER-divider outcome
set (treeSovereignPx swept at a fixed wide wrapper), then asserts the
RELATION itself: every pair with the SAME realized `controlPanel`
candidatePx has the SAME presence verdict — the exact invariant the RCA
found structurally unrepresentable in the existing suite. A third test
proves the relation is unaffected by reversing either sweep's own
traversal order (both divider orders).

`tests/integration/lyt-root-split-live.test.ts` — the two `778px`-based
DOM-level acceptance tests updated to the new numbers (700px/638px), with
the boardRail-present test's own interior track-sum assertion corrected
for a pre-existing (unrelated to this ticket) DOM fact: `LytNode.vue`'s
`trackList` always emits three literal grid-template-columns entries for
this row, so an absent `previewBoard` still consumes one `column-gap` —
disclosed inline, not silently patched around.

### Addendum items addressed in this delivery

- **Addendum 1 (Probe 5 ordering bug):** fixed, see above. Not subsumed
  by item 1's own diagnostic (different mechanism).
- **Addendum 3 (continuous drag tracking, commissioner shot
  `8b66_instant_snap_on_dragging_control_panel_resizer.png`):** a new
  pure-function regression test (`feasible-layout-geometry-sweep.test.ts`)
  sweeps `treeSovereignPx` at 1px steps across the full wrapper width and
  asserts neither `treePx` nor `controlPanel.candidatePx` ever jumps more
  than 1px per step — proving the floor-reservation mechanism this
  ticket introduces does not itself create a discontinuity. **UNEXERCISED
  live** — no browser/mouse-event rig available to this pass; this is
  the strongest evidence obtainable without one.
- **Coordinator's live-witness addenda (board-rail-present demotion,
  card-selection hiding the tree, library rendering as an overlay at
  ample width):** the board-rail-present case is now a swept input in
  §G's own purity relation (both `boardRailReservedPx=0` and `=180`
  compose into the same proven invariant) and is the DIRECT predicted
  fix for that witness (the container-composite threshold no longer
  exists to misfire). The "clicking a card hides the tree" and
  "library renders as an overlay at ~2290px" witnesses were **NOT
  investigated** — I have no live-rig access to reproduce them, and (a)
  in particular reads as a plausibly SEPARATE mechanism (a content-demand
  or active-tab interaction, not obviously this ticket's presence
  predicate) that I did not want to guess a fix for blind. Both need a
  dedicated live-DOM investigation before a fix is attempted; naming this
  rather than papering over it, per ADR-0002.

### Addendum items NOT addressed in this delivery (deferred to the second batch or a follow-up)

- **Addendum 2 (drag-time/render-time ceiling full unification, Probe
  4):** NOT completed. `startResizeOuter`'s drag-time ceiling still
  diverges from the render-time ceiling by `boardRailReservedPx + gapPx
  − RESIZER_WIDTH_PX`, as the review disclosed — item 1's own mechanism
  did not touch this seam (the floor guarantee this ticket adds is a
  RENDER-time concern, not a drag-time ceiling; the two were already
  independently coupled before this ticket). The doctrine comment at
  `useResizablePanel.ts` around `startResizeOuter` already states the
  divergence honestly (unchanged by this session), so no comment
  correction was needed beyond what the reviewer already found correct.
  Concrete next step: thread `boardRailReservedPx`/root `gapPx` into
  `useResizablePanel`'s outer-resize ceiling computation.
- **Divider hit-zone/pointer-alignment addendum:** NOT investigated —
  needs live DOM/CSS measurement of the resizer element's own hit-box vs.
  its painted rule, which this pass has no rig access to perform.
- **Addendum: controlPanel-absent tree-divider inactivity ("resizing
  into free space")**: NOT implemented — a genuine, distinct mechanism
  (the divider's own drag-time ceiling/activation gate in
  `useResizablePanel.ts`, not the resolver this ticket's item 1 touches).
  Needs its own design pass: the divider must stay active when its
  neighbor is absent and let the adjacent region claim the freed track,
  which is a drag-time wiring change, not a presence-predicate one.
- **Preview-board fixed-track sizing (overruled "deliberate trade-off"):**
  NOT implemented in this delivery — explicitly assigned to the second
  batch alongside S2/S3/S8.

---

## Items 2–5 (S2/S3/S8/wiki-5) and remaining addenda

**NOT ATTEMPTED in this delivery**, per the coordinator's explicit
instruction to land item 1 standalone the moment its own gates went
green, ahead of everything else. If session budget remains after this
report, a second commit will attempt these and report their own
evidentiary status; if not, they are formally NOT-DONE, not silently
dropped, and are enumerated above (and in the original mandate) for a
follow-up session's own scoping pass.

---

## Files touched (this commit)

- `frontend/src/state/feasible-layout.ts` — item 1: region-owned
  presence, ALLOT/presence split, floor-variant sovereign drag,
  presence-derived diagnostics.
- `frontend/src/App.vue` — item 1 wiring (`viabilityFloorPx`,
  `controlPanelViabilityThresholdPx`); addendum-1 dedup-ordering fix.
- `frontend/tests/unit/state/feasible-layout.test.ts` — item 1 field
  migration + value-mismatch migrations, each with inline rationale.
- `frontend/tests/unit/state/feasible-layout-geometry-sweep.test.ts` —
  item 1 field migration, sovereignty-describe-block migration,
  continuous-drag-tracking test (addendum 3).
- `frontend/tests/unit/state/feasible-layout-purity.test.ts` — item 1
  field migration, §C re-scoping, new §G relational purity test (RCA
  item 4 + boardRail-presence sweep).
- `frontend/tests/integration/lyt-root-split-live.test.ts` — item 1
  DOM-level acceptance updates.

Public Domain (The Unlicense), per ADR-0006 — no new files were
created; existing file headers were not touched beyond their own
comment bodies.
