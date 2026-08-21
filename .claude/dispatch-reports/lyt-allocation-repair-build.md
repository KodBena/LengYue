# LYT allocation repair — build report

Branch `lyt-allocation-repair`, built on top of `b8991b1a` (verified:
`git log --oneline -2` showed `b8991b1a` then `829e952c` at branch
creation). Base: `.claude/dispatch-reports/ui-shoddiness-audit-2026-08-21.md`
(read end to end, findings S1/S2/S3/S8/S10 and shots
`s3-workspace-1366x768.png`, `s9-panelsmenu-1366.png`,
`s10-summoned-1366.png`, `z-toolbar-1920.png`, `z-toolbar-1366.png`,
`s14-connected-1920.png`, `z-deadspace-1920.png`, `s19-browse-1920.png`,
`z3-tabrules.png`, `s3-workspace-2560x1440.png` viewed). Mandate addendum 1:
`.claude/dispatch-reports/lyt-disease-repair-review.md` (read end to end).
Mandate addendum 2: `.claude/dispatch-reports/control-panel-demotion-rca.md`
(read end to end).

**Gates** (per the coordinator's gate relaxation, ledger row 2533):
`npm run build` → exit 0. `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048
npx vitest run --changed=b8991b1a --maxWorkers=2` → **23 files / 405 tests
passed, exit 0**. A full-suite run earlier in this session (before the
final revert described in addendum 2's disposition below) was also green
at 279 files / 3470 passed, 8 skipped, 0 failed — the orchestrator's own
consolidation gate is the authoritative full-suite check per the
relaxation.

Commit: see the final message below (single commit on this branch).

---

## Findings from the original brief

### S1 (CRITICAL) — control panel undocks below ~1600px, covers the board

**Root cause.** `resolveRootSplitLiveLayout` (`frontend/src/state/
feasible-layout.ts`) computed the side column's width as `availableForSplitPx
- boardUsefulPx` (the board's own height-locked square claims its full
natural size FIRST), clamped to `[sideColumn.minPx, min(sideColumn.maxPx,
availableForSplitPx - boardFloorPx)]`. Two problems: (1) the compiled
`sideColumn.maxPx` (820px, `board-priority-clamp` track,
`lyt-layout.gen.ts:76`) capped the side column even when the board could
easily spare more — the S2/S3/S10 root cause too (see below); (2) the
non-sovereign candidate never tried to satisfy `controlPanel`'s own compiled
docking demand (778px landscape, `tree.minPx(110) + gap(4) +
controlPanel(664)`) — it only handed over whatever the board's full square
left as "natural" leftover, even when the board could honestly yield a few
more pixels and still stay above its own floor (300px, `MIN_BOARD_PX`).

**Fix path — DSL bypassed, not modeled.** Per the standing ruling (ledger
row 2511): editing the `.lyt` encoding + `emit_layout_tree.py` to change
the compiled ceiling is a `research/lyt/` cross-boundary change the
umbrella `CLAUDE.md` names as out of frontend scope, needing its own
dispatch. Instead, `resolveRootSplitLiveLayout`'s live JS resolver was
changed to (a) drop `sideColumn.maxPx` from `maxRegionWidthPx` — the only
ceiling left is the board's own hard floor — and (b) raise the
non-sovereign candidate up to a new `sideColumnDesiredMinPx` input
(threaded from App.vue, reading the SAME compiled `@demote.belowPx` fact
`resolveSideColumnLiveLayout` already consumes), capped at
`maxRegionWidthPx` so the board's floor still always wins. This reuses
every existing compiled bound (`sideColumn.minPx`, `boardFloorPx`,
`controlPanel`'s own demote threshold) — a bypass of the STATIC ceiling,
not an invention of a new one.

**Test:** `tests/integration/lyt-root-split-live.test.ts` — "1366x768,
default content: root child '2' resolves to 778px — the board yields the
gap between its natural yield (638) and the panel-docking demand, so the
panel DOCKS instead of undocking into the summon overlay (S1 repair)"
(asserts `#control-panel-summon-btn` absent, `[role="tablist"]` present).
Also `tests/unit/state/feasible-layout.test.ts`'s updated
`resolveRootSplitLiveLayout()` acceptance table (1920x1080 → 880px,
2560x1080 → 1520px, both no longer clamped at 820).

**Evidentiary status:** WITNESSED via the pure-function unit suite and an
`App.vue`-mounted integration test reading the real rendered grid-track
style (jsdom, no real layout engine — see that test file's own header for
the disclosed limitation it already names). **Live visual re-witness:
UNEXERCISED** — no live rig access per this task's own constraint (ports
4173/5173/5174/8764, the engine, off-limits).

### S2 (HIGH) — `.engine-controls` frozen at 265px against a 561px natural need

**Not separately fixed.** Investigation traced S2 to the SAME root cause
as S1/S10: `.engine-controls`' width is CSS Grid's `1fr` split (against
`A_engine_queue`'s own `1fr`) of whatever the side column's TOTAL width
is, after `A_engine_eval`/`A_engine_health`'s fixed 139px each and three
4px gaps are subtracted. Since the side column itself was capped at 820px
(the S1/S10 root cause), `.engine-controls` could never exceed roughly
`(820-290)/2 ≈ 265px` — matching the audit's own measured figure closely.
The S1 fix removes that upstream cap, so `.engine-controls`' available
share grows proportionally at every geometry the side column now widens
at. A dedicated per-widget track override (giving `.engine-controls` its
own measured natural-row-width directly, so it doesn't have to share
evenly with the low-demand `A_engine_queue` telemetry strip) was designed
but **NOT implemented** in this pass — the remaining budget went to the
addendum-2 RCA discipline instead. **Disposition: not separately fixed;
partially addressed as an upstream consequence of the S1 fix. Acceptance
bar ("single row at ≥1920") not independently verified — UNEXERCISED.**

### S3 (HIGH) — Cards content column frozen at 383px / two empty-state messages / tree-panel scrollbar

**Root cause identified, not fixed.** `controlPanel`'s compiled track is
`{kind: "fixed", px: 664}`. `resolveSideColumnLiveLayoutUnguarded`'s
"others" loop grants it `min(fixedTrackPx, remainingPx)` — it can shrink
below 664 (sovereignty) but can NEVER grow past it, even when the side
column has abundant leftover width after `tree`'s own content-demand cap.
This is the S3 root cause: `ForestDirectory.vue`'s own internal
`.left-panel{width:280px}` + `.tree-panel{flex:1}` split fills exactly
`controlPanel`'s own 664px box (280+383≈664, off by border/gap px,
matching the audit's cited 383px figure) and can never widen with the
window. A fix (letting `controlPanel`'s candidate consume `remainingPx`
uncapped, mirroring the S1/S2 principle) was designed but **NOT
implemented** — see the addendum-2 disposition below for why (the same
resolver function is the one this repair's mandatory review conditions
and RCA-addendum work already touched heavily; layering a third
independent behavioral change on it in the remaining budget was judged
too much test-surface risk to land safely). The two-empty-state-message /
mismatched-baseline finding and the tree-panel horizontal-scrollbar
finding were **not investigated** in this pass. **Disposition: root
cause identified and disclosed; NOT implemented. UNEXERCISED.**

### S8 (MEDIUM) — tab-strip / Lineage Explorer rule misalignment

**Not investigated in depth; not fixed.** Time did not permit a targeted
CSS fix. `components/chrome/TabWidget.vue` (`.tab-header { border-bottom
... }`) is the shared home for both rules per its own header, but the
exact CSS collision (why the Lineage Explorer's own full-width rule sits
at a different baseline) was not traced. **Disposition: NOT implemented.**

### S10 (MEDIUM) — chrome doesn't scale at 2560×1440

**Partially addressed as an S1/S2 consequence.** The S1 fix's ceiling
removal means the side column (and therefore `.engine-controls`,
`controlPanel`'s allocated track width) now grows at 2560×1440 rather
than freezing at its 1920-era 820px cap (`tests/integration/
lyt-root-split-live.test.ts`'s "2560x1080 ... resolves to its own natural
yield, 1520px" test). **Residue, stated plainly:** full chrome SCALING
(button/label/font sizes) is explicitly out of scope per the brief and
remains untouched — only allocation (how much width chrome-holding
regions receive) changed. `controlPanel`'s own 664px ceiling (the S3 root
cause) still caps how much of that extra 2560px-era width actually
reaches Cards/Library content, since that specific fix was not
implemented. **Disposition: allocation partially fixed (upstream of S1);
content-column growth (S3) and font/control scaling remain unaddressed.**

### Maintainer wiki finding #1 — CSS transition on panel show/hide → default layout, despite the row-1506 ban

**Live violation NOT located.** A thorough static sweep of
`frontend/src/**` for `transition`/`@keyframes`/`animation:`/
`requestAnimationFrame`/`scrollIntoView({behavior})`/`<Transition>`/
`<transition>` usage found no code path matching "panel show/hide →
default-layout reset." The three existing `@keyframes` sites (App.vue's
`workspace-boot-spin`, `ToolbarEngineMetrics.vue`'s
`watchdog-pong-pending`, `PboPopover.vue`'s busy-dot pulse) are unrelated
to layout resets and are a disclosed, separately-ruled carve-out already
named in `banned-effects.test.ts`'s own header. **Mechanical half closed
regardless:** `components/chrome/TabWidget.vue` was removed from
`FENCE_EXCLUSIONS` in `frontend/tests/unit/banned-effects.test.ts` — it
was verified clean (no banned declaration) and is now back under the
lint's coverage, closing that one hole. A second, still-open gap is
disclosed in that file's own updated header: the lint only scans
`.vue`/`.css` files, not `.ts` (a runtime `element.style.transition = ...`
would not be caught) — no current `.ts` file does this (checked), but
widening the scan was judged too risky to do unverified in the remaining
budget. **Disposition: lint hole partially closed (TabWidget.vue fence
removed); the live symptom itself was NOT located — needs a live-rig
DevTools Animations-panel trace, which this pass had no rig access to
perform.**

### Maintainer wiki finding #5 — "geometry changed from default" spam

**Attempted, then REVERTED.** A generic sink-level dedup ("skip a push
identical in type+text to the immediately-preceding message") was added
to `store/index.ts`'s `SystemMessageSink` implementation. The full test
suite caught this as a real regression: several tests
(`analysis-ledger-stratified.test.ts`, `unhandled-rejection-backstop.test.ts`,
`useNodePositionHashes.test.ts`) rely on the SAME message text being
legitimately re-shown after an explicit reset/recovery event with no
distinct message in between — a global "collapse consecutive identical
text" rule is too blunt and suppresses those legitimate re-occurrences.
The change was reverted in full (`git diff --stat src/store/index.ts`
shows no diff). **Disposition: NOT implemented.** A narrower, per-call-site
mechanism (or a dedup key that distinguishes "recurred after an explicit
reset" from "recurred because nothing changed") would need its own design
pass; not attempted again given the remaining budget. The ONE narrow
piece of this addendum that WAS kept: the mandatory review condition 3
fix below (suppressing the `sovereignClampedFromPx` watcher specifically
when `outerRowSovereignDiagnostic` already covers the same event) — a
much narrower, safely-scoped instance of the same "don't double-report
one event" goal.

### Maintainer wiki finding #3 — divider drag refusal (residual)

**Disposition: partially addressed, not conclusively closed.** Review
condition 2 (below) unifies the drag-time and render-time ceilings for
the OUTER bar, closing one concrete way the cursor and the rendered
divider could decouple mid-drag (a plausible contributor to "dragged the
bar and nothing happened"). The addendum-2 RCA
(`control-panel-demotion-rca.md`) independently traced a SEPARATE,
also-plausible contributor — the divergent presence verdict between the
inner and outer dividers — but its remedy (region-owned presence,
floor-variant drags) was **NOT implemented** in this pass; see the
disposition below. b8991b1a's own commit message already states root
cause was "not conclusively established without live-rig access"; that
remains true after this pass too. **UNEXERCISED** live.

---

## Mandate addendum 1 — review conditions (`lyt-disease-repair-review.md`, ledger row 2511)

All three conditions were discharged. Evidentiary status: WITNESSED via
the pure-function/integration unit suite (the `--changed` gate, 405/405
green); **UNEXERCISED live** (same constraint as above).

**Condition 1 — reset-path evidentiary gap.** Added
`tests/unit/state/feasible-layout.test.ts`'s "reset ≡ fresh boot:
resolveRootSplitLiveLayout with sovereignWrapperPx cleared to undefined,
right after a clamped override, equals a from-scratch call at the same
geometry" — calls the REAL render-path resolver directly (not the dead
`effectiveTreeControlRegionWidthPx` composable computed the old citation
pointed at), asserting `afterReset` (simulated post-`resetLayoutOverrides()`
call) equals `freshBoot` (never-dragged call) byte-for-byte, and that
`beforeReset` (still-clamped) genuinely differs from both (a non-vacuous
check). The stale citation in `tests/integration/resizer-restore-clamp.
test.ts`'s "GREEN (sovereignty)" test was annotated to disclose it pins
the composable/store-layer contract only, pointing readers at the two
tests that actually pin the live render-path clamp.

**Condition 2 — drag-time vs. render-time ceiling divergence.**
`useResizablePanel.ts`'s `startResizeOuter` now reserves `MIN_BOARD_PX`
in its own `regionMaxWidthPx` (previously only the resizer's own physical
width), harmonizing it with `resolveRootSplitLiveLayout`'s render-time
ceiling. Disclosed as a NARROWER unification, not byte-identical: the
render ceiling also reserves `boardRailReservedPx` and the LYT root
`gapPx`, neither of which this composable has cheap access to without
threading boardRail's own presence in (out of scope for this repair).
The stale "never resisted" doctrine comments at both
`useResizablePanel.ts`'s HISTORICAL note (~line 336) and inline at
`startResizeOuter` were corrected to state the render layer DOES now
resist a stored override past the board-floor ceiling, and the drag-time
ceiling was harmonized to match. Test:
`tests/unit/composables/chrome/useResizablePanel.test.ts`'s "sanity:
MIN_BOARD_PX names the board's own floor" describe block updated to
reflect the new dual role.

**Condition 3 — duplicate diagnostic on the CATASTROPHIC-1 repro.**
`App.vue`'s `sovereignClampedFromPx` watcher now checks
`outerRowSovereignDiagnostic.value.length > 0` before pushing — when the
board-starvation diagnostic already covers the event, the (now, post-S1,
redundant) "no longer fits within the available space" message stays
silent rather than adding a second, less specific row for the same
event.

**Non-blocking comment fix.** Both `useResizablePanel.ts:336-339`-area
comments (the deleted-function historical note, and the inline comment
inside `startResizeOuter` itself) were updated — both said "never
resisted," which stopped being true the moment `resolveRootSplitLiveLayout`
shipped.

---

## Mandate addendum 2 — control-panel demotion RCA (`control-panel-demotion-rca.md`, ledger row 2532)

**Disposition: designed, partially implemented, then REVERTED. NOT
delivered in this pass.**

The RCA's mechanism analysis was read and independently verified against
the current source (the container-composite `@demote.belowPx` threshold
evaluated against `wrapperWidthPx`, `feasible-layout.ts:1335` at the time
of reading, versus the region's own resolved allotment — the path-
dependence root cause). A full implementation of remedies 1+2+3 (floor
variant) was written:

- `SideColumnFixedRegion.demote: LytDemotion | null` renamed to
  `viabilityFloorPx: number | null` (the region's own minimum renderable
  demand — `CONTROL_PANEL_MIN_WIDTH_PX`, `layout-model.ts`, for
  `controlPanel`; `null` for `previewBoard`), avoiding a `research/lyt/`
  compiler edit (cross-boundary, out of scope) by composing the
  equivalent region-owned floor from existing frontend-layer facts
  instead — a bypass of the compiled composite, not a compiler change.
- `resolveSideColumnLiveLayoutUnguarded` split into an ALLOT stage
  (every desired-visible region gets an allotment as if present) and a
  new `resolveRowPresence` function whose signature carries no
  `wrapperWidthPx` parameter at all — structurally, not by convention.
- Floor-variant drags on BOTH dividers: the inner bar's sovereign tree
  candidate is capped so `controlPanel` never gets squeezed below its
  own floor; the outer bar's root-split sovereign candidate is floored
  at the same composed minimum (`sideColumnDesiredMinPx`, reused from
  the S1 mechanism) rather than only ceilinged.
- The diagnostic was re-derived to fire exactly when the presence
  verdict actually flips a desired-visible sibling absent (closing both
  the "false alarm while still rendering" and "silent while genuinely
  demoted" halves of the RCA's §4 finding).

**Why it was reverted.** Running this against the existing pinned test
suite (`tests/unit/state/feasible-layout.test.ts`) surfaced ~20+ test
call sites still constructing `others` region objects with the OLD
`demote:` field shape; because the test literals are not strictly
type-checked against `SideColumnFixedRegion` in this file's own harness
shape, `vue-tsc -b` passed clean while the RUNTIME behavior broke
(`o.viabilityFloorPx` read as `undefined` rather than the intended
`null`/`number`, cascading into `px(undefined)` construction-refusal
throws). Bringing every affected test's literals AND its pinned expected
values (many of which encode the OLD container-composite threshold
arithmetic, now genuinely different under the region-owned model) up to
date, plus writing the addendum's own explicitly-requested purity
regression test (item 4: sweep width AND sovereignty together over both
divider orders), was judged to exceed the remaining budget without
risking an unsafe, undertested land on a resolver this task's OTHER
mandatory work (addendum 1's conditions) already depends on. Per the
gate-relaxation guidance ("prefer delivering the finished items with the
remainder explicitly reported as not-done"), the mechanism change was
reverted in full — `git diff` against `b8991b1a` for
`src/state/feasible-layout.ts` and `src/App.vue` now contains ONLY the
S1 fix and the addendum-1 review-condition fixes, verified by re-running
both gates green after the revert (this report's own header).

**What is preserved for a future attempt:** the design above (region-owned
`viabilityFloorPx`, the ALLOT/`resolveRowPresence` split, the floor-variant
drag caps on both dividers, and the presence-derived diagnostic) is a
complete, coherent design that was actually written and typechecked
clean — only the test-suite migration remains. A follow-up session
should budget for rewriting `tests/unit/state/feasible-layout.test.ts`'s
`others` fixtures (constants like `CONTROL_PANEL_DEMOTE`) to the new
shape, recomputing every affected test's expected numbers under the new
(smaller, region-owned) threshold, and authoring the addendum's own item
4 purity sweep, before attempting to land this again.

**S1 outcome bar, per the addendum's own framing** ("your S1 outcome bar
is unchanged — panel docks into space that exists at 1366"): still met
by the original S1 mechanism (see above) — the addendum's remedy would
have been a DIFFERENT, complementary mechanism (region-owned presence)
layered on top, not a replacement for the S1 ceiling/floor-raise fix.

---

## Summary of what shipped

| Item | Status |
|---|---|
| S1 (CRITICAL) | Implemented, WITNESSED (unit+integration), UNEXERCISED live |
| S2 | Not separately fixed; upstream-improved by S1 |
| S3 | Root cause identified, NOT implemented |
| S8 | NOT investigated/fixed |
| S10 | Partially addressed (allocation only) via S1 |
| Wiki #1 (transition) | Lint fence closed; live violation NOT located |
| Wiki #5 (message spam) | Attempted, reverted; NOT implemented |
| Wiki #3 (divider drag) | Partially addressed via review condition 2; not conclusively closed |
| Review condition 1 | Implemented, WITNESSED |
| Review condition 2 | Implemented, WITNESSED |
| Review condition 3 | Implemented, WITNESSED |
| Review non-blocking comment fix | Implemented |
| Addendum 2 (control-panel demotion RCA remedy) | Designed, coded, reverted — NOT delivered |

## Files touched

- `frontend/src/state/feasible-layout.ts` — S1 root-split ceiling/floor
- `frontend/src/App.vue` — S1 wiring, review condition 3
- `frontend/src/composables/chrome/useResizablePanel.ts` — review condition 2, stale-comment fixes
- `frontend/tests/unit/state/feasible-layout.test.ts` — S1 acceptance table updates, condition 1 test
- `frontend/tests/integration/lyt-root-split-live.test.ts` — S1 acceptance updates
- `frontend/tests/integration/resizer-restore-clamp.test.ts` — condition 1 evidentiary annotation
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` — condition 2 describe-block update
- `frontend/tests/unit/banned-effects.test.ts` — TabWidget.vue fence removal, gap disclosure

Public Domain (The Unlicense), per ADR-0006 — no new files were created;
existing file headers were not touched beyond their own comment bodies.
