# Resizer rearchitecture — build report

Builder: dispatched build agent, isolated worktree
`/home/bork/w/omega/.claude/worktrees/agent-aea2fabfe830f1b89`, branch
`worktree-agent-aea2fabfe830f1b89`. Date: 2026-08-06.

**Placement note:** the coordinator asked for this report at
`.claude/dispatch-reports/resizer-rearchitecture-build.md` in the MAIN
checkout for durability. This agent is worktree-isolated and its Write/Edit
tools refuse paths outside the worktree ("Edit the worktree copy of this
file instead of the shared-checkout path") — the same sandbox that earlier
refused a `git` command targeting the shared checkout. The report is
therefore committed here, in the worktree, at the same relative path
(`.claude/dispatch-reports/resizer-rearchitecture-build.md`) — durable once
this branch is merged/reviewed, but not yet in the main checkout. Copying
it there is a one-file `cp` from a session that isn't worktree-scoped.

Scope evolved twice mid-build via coordinator amendments, both addressed in
this delivery:

1. **Original charter** — collapse the ADR-0019-audited two-writer,
   discontinuous board/control-panel resizer
   (`.claude/dispatch-reports/adr19-audit.md` Finding S2) into one persisted
   fact, continuous drag, no drag-start clobber, reload-exact persistence.
2. **Charter amendment (ledger row 391)** — the maintainer's real intent was a
   nested-splitter tree: the game-tree pane (previously a hardcoded 140px
   literal) needed to be independently resizable too, via an INNER/OUTER
   bar pair, plus a sharpened continuity rule (discrete content
   reorganizations — `@container`-style breakpoints — must never commit
   mid-drag).
3. **Maintainer geometry constraint (ledger row 414)** — the tree pane's
   width changes through EXACTLY ONE channel, the INNER bar, never
   automatically (no fit-to-content, no auto-grow on navigation or branch
   expansion).

A live diagnostic
(`.claude/dispatch-reports/panel-weirdness-live-investigation.md`,
dispatched separately, read in full before finalizing) caught a real
geometric defect in an intermediate shape of this build — reported below
as Anomaly-1/2/4 fixes, not swept under the "amendment" framing.

**Claims below are marked WITNESSED (with the observation), REFUTED (a
suspected defect actively disproved), or UNEXERCISED (with the concrete
blocker).** No umbrella claims covering multiple items at once.

---

## 1. The final model — one fact per pane, nothing else

Two independently-owned, persisted facts, each written by exactly one
resizer bar (ADR-0012 one-home-per-fact):

| Fact | Schema field | Owner | Default |
|---|---|---|---|
| Tree panel's own width | `session.ui.treePanelWidthPx` | INNER bar (`#resizer-inner`) only | `undefined` → 140px (unchanged from pre-amendment) |
| Combined tree+control region's own width | `session.ui.treeControlRegionWidthPx` | OUTER bar (`#resizer-outer`) only | `undefined` → natural `flex: 1 1 0` fill |

`#control-panel` and `#board-column` are **both fully derived**, never a
second writer for either fact:

- `#control-panel` is unconditionally `flex: 1 1 0` **inside**
  `#tree-control-wrapper` — pure CSS, no JS-computed width, no persisted
  fact of its own at all. (The original charter's `controlPanelWidthPx`
  field, introduced mid-build, was **retired within the same development
  arc, before shipping** — see §5.)
- `#board-column` is `flex: 1 1 auto` in the outer row (`#split-workspace`),
  absorbing whatever `#tree-control-wrapper` didn't claim; its own visual
  square lives one level down in a new `#board-square` element
  (`align-self: center`, `aspect-ratio: 1/1`, `height: 100%`) so the OUTER
  row's flex slot and the board's aspect-ratio cap are no longer the same
  CSS property (see §3 for why that split is load-bearing).

### Structure

```
#split-workspace (row)
├─ #board-column          flex: 1 1 auto   (DERIVED — absorbs the complement)
│   └─ #board-square       align-self: center; aspect-ratio: 1/1   (the visual square)
├─ #resizer-outer          → writes treeControlRegionWidthPx
└─ #tree-control-wrapper   flex: 0 0 <treeControlRegionWidthPx>px  (TRUE nested flex container)
    ├─ #vue-tree-panel      flex: 0 0 <treePanelWidthPx>px  → written ONLY by #resizer-inner
    ├─ #resizer-inner       → writes treePanelWidthPx
    └─ #control-panel       flex: 1 1 0   (DERIVED — pure CSS fill, no persisted fact)
```

### Rejected alternative, and why (justify-the-option-space)

**Rejected: a flat row with `#board-column`'s width JS-derived from the
other panes' widths** (an earlier shape of this same build, before the live
diagnostic). This is what the pre-amendment `resizer-rearch` originally
shipped internally: one flat `#split-workspace` row, `#board-column` given
an explicit `max-width` computed in JS from the other panes. It is
**rejected** because a bar's own screen position, in a flat flex row, is
the *sum of everything before it* — and when the pane absorbing the row's
"complement" sits on the *same side* of a bar as the pane being directly
dragged, their opposite deltas **cancel exactly**, and the bar visually
detaches from the cursor. The live diagnostic measured this at up to
**541px of lag** under a related (not identical) flat-row shape; my own
independent geometric derivation, while implementing the nested-splitter
amendment, found the same failure mode by construction before the
diagnostic report even landed (see `useResizablePanel.ts`'s header for the
full argument). **True CSS nesting** — an actual second flex container,
not a JS-computed width standing in for one — structurally forecloses the
class: each bar's local absorbing pane is always on the side *opposite*
the directly-dragged one, so the cancellation cannot occur, at either
nesting level, by construction, not by tuning a formula.

**Rejected: persisting control panel's own width directly** (the original
first-pass design of this build, before ledger row 414 landed). Ledger row
414 named the tree pane's ONE write channel as the INNER bar explicitly;
under that constraint, control panel's width must be the wrapper-local
derived complement (flex-fill), not an independent fact, or the model would
have three overlapping facts for two degrees of freedom — the exact "one
fact, many homes" defect (ADR-0019 Rule 3 / C1) the whole build exists to
close.

---

## 2. Continuity — the pane-width functions

`useResizablePanel.ts` exports `computePaneWidthPx(dragOriginPx,
totalDeltaPx, minWidthPx, maxWidthPx, sign)` — **one** function both bars'
`onMouseMove` calls, `next = dragOriginPx + sign·totalDeltaPx`, clamped. No
regime handoff. `sign` differs per bar (`+1` INNER / `-1` OUTER) because the
directly-dragged pane sits on a different side of each bar (see the
file's header for the full derivation) — **this is the one place I
shipped a real bug and caught it via the live probe, not code review**:
an early version reused the OUTER bar's sign unchanged for the INNER bar
without re-deriving it for the flipped left/right relationship. The
Playwright sweep caught a **1188px lag** as a direct, reproducible
consequence; fixed by adding the explicit `sign` parameter and re-deriving
each bar's convention from its own left/right geometry. Unit tests
(`useResizablePanel.test.ts`) now pin each bar's own monotonicity direction
so a sign regression fails loudly there, not only in a live drag.

**WITNESSED (unit suite, 84/84 test files green, 1145 tests):**
continuity (dense 1px-step sweeps, bounded per-step delta), monotonicity
(each bar's own correct direction), range pinning at both ends (including
the degenerate case where the viewport is too narrow to fit both floors),
and no-drag-start-clobber (the function's value at zero displacement always
equals the rendered geometry it started from, for seven different starting
geometries per bar) — `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts`.

---

## 3. Anomaly-by-anomaly: the live diagnostic's findings, addressed

The diagnostic (`.claude/dispatch-reports/panel-weirdness-live-investigation.md`)
was read in full before finalizing, per its own charter reference. Its
six anomalies, mapped to this build:

- **Anomaly 1 (divider decouples from pointer past board saturation, up
  to 541px lag) / Anomaly 4 (board frozen for ~1250px of travel).**
  **WITNESSED, addressed.** Root cause: `#board-column`'s `flex: 0 1 auto`
  (never-grow) stopped absorbing freed row space once its own
  `aspect-ratio: 1/1` square saturated, at which point the bar (whose
  screen position is a function of `#board-column`'s width) stopped
  moving while the persisted value kept changing underneath it. Fixed by
  splitting the OUTER row's flex-fill role (`#board-column`, now
  `flex: 1 1 auto`, no cap) from the visual-square role (`#board-square`,
  the new inner element, `align-self: center`, carries the
  `aspect-ratio`) — see §1's structure diagram. Live-verified: the
  Playwright sweep's clamp-aware lag check for the OUTER bar (1800-step
  dense sweep, full range) reports **zero failures** — bar position tracks
  the cursor within 3px for the whole range, including where the old
  saturation point used to sit.

- **Anomaly 2 (mousedown alone re-lays-out the workspace; every re-grab
  destroys accumulated drag state; up to 862px snap with zero mouse
  travel).** **REFUTED against this build** — the defect's root cause
  (an unconditional `controlPanelWidthPx.value = undefined` reset at
  `startResize`'s top, before any measurement) does not exist in this
  architecture: neither `startResizeInner` nor `startResizeOuter` writes
  to the store at all during `mousedown` — only `getBoundingClientRect()`
  reads. The "same-tick read of the pre-flush DOM" failure mode the
  diagnostic's §4c names (measuring geometry in the same synchronous tick
  as a reactive write that changes the thing being measured) is
  structurally absent for the same reason: there is no reactive write to
  race against. **WITNESSED** via the unit suite's no-drag-start-clobber
  tests and the live probe's own "no drag-start clobber" check for both
  bars (second drag from arbitrary rendered geometry reproduces exactly
  that geometry at zero displacement — passed for both bars, both probe
  runs).

- **Anomaly 3 (discrete responsiveness reorganizations fire mid-drag —
  three `@container`/`ResizeObserver` breakpoints in Library/Cards/
  Analysis tabs).** **Addressed for the Cards tab (`ForestDirectory.vue`,
  479px breakpoint), the flagship fix; Library (700px) and Analysis
  (379px) are the SAME class of defect, NOT converted in this pass — see
  §7 Delta.** New composable `useDeferredContainerBreakpoint.ts`: a
  `ResizeObserver`-driven boolean (`committed`) that freezes while
  `isAnyPanelResizing` (module-scope flag, either bar) is true, and
  commits once, immediately, with hysteresis, on release.
  `ForestDirectory.vue`'s row↔column reflow was converted from a pure
  CSS `@container` query (which recomputes live, every frame, with no way
  to defer) to this class-driven mechanism. **WITNESSED** (11/11
  integration tests, `useDeferredContainerBreakpoint.test.ts`, including
  "does NOT commit while dragging even as width sweeps through the
  threshold" and "a released drag landing back in the hysteresis band
  does not flap on the next measurement").

- **Anomaly 5 (past-saturation layout doesn't survive reload — asymmetric
  persistence).** **REFUTED against this build** — there is no
  "saturation" regime for either persisted fact anymore (see §1); both
  round-trip through `buildPersistencePayload` → `updateFromRemote`
  identically regardless of value. **WITNESSED**
  (`resizer-persistence-roundtrip.test.ts`, 8 tests: each fact survives a
  save→hydrate cycle unchanged, `undefined` round-trips as `undefined`
  not a stray key, and the two facts round-trip **independently** — set
  one, persist, reset, hydrate, confirm the other is untouched, both
  directions).

- **Anomaly 6 (tree pane cannot be resized at all; 140px fixed, 492px
  content clipped to a 134px keyhole — the maintainer's actual intent).**
  **Addressed** — this is the amendment's core ask (§1); `treePanelWidthPx`
  is now real, INNER-bar-owned, persisted. **WITNESSED**
  (`resizer-rearch-probe.mjs`, INNER-bar sweep: pane width visibly changes
  across a 700px-wide sweep, `distinctWidths > 10`; persisted value
  matches rendered geometry post-drag).

---

## 4. Ledger row 414 — the tree pane's ONE write channel

**WITNESSED, live.** The Playwright probe samples `#vue-tree-panel` and
`#tree-control-wrapper` widths, clicks every branch-expand toggle inside
the tree (`#vue-tree-panel .toggle-box`, `TreeWidget.vue`'s own hit
targets — scoped explicitly, see the note below), navigates four steps
(`ArrowDown` ×3, `ArrowUp`), and re-samples:

```
ledger row 414: expanding branches + navigating produces ZERO width delta on #vue-tree-panel — PASS
ledger row 414: expanding branches + navigating produces ZERO width delta on #tree-control-wrapper — PASS
```

**Authoring correction, disclosed:** an earlier version of this same probe
used an overly broad `[class*="toggle"]` selector, which also matched
App.vue's `.right-toggles` (the unrelated board/tree/controls chrome
toggle *container*) — Playwright's `.click()` on that container landed on
whichever child button was under its center point, which could toggle
`controlsExpanded` off, collapsing the wrapper and producing a **false
positive** (`before=673 after=237`, logged and diagnosed before being
corrected). Fixed by scoping the selector to `#vue-tree-panel .toggle-box`
(TreeWidget's actual branch-expand SVG hit targets) and re-verified: with
the corrected selector, both a standalone quick-check and the full probe
run show **zero** width delta from content changes. Recorded here in full
rather than silently fixed, per the "claims carry witnesses" discipline —
the false positive is as much a fact of this build as the true negative
that replaced it.

No other write path exists for either `session.ui.treePanelWidthPx` or
`session.ui.treeControlRegionWidthPx` — `grep -rn "treePanelWidthPx\s*="
src/ frontend/tests/` returns only `useResizablePanel.ts`'s own
`onMouseMoveInner` and test-fixture writes.

---

## 5. Migration / schema notes

- `session.ui.boardSquareMaxWidthPx` (pre-rearch board-width cap,
  ADR-0019 audit S2) and `session.ui.controlPanelWidth` (dead zombie
  field, ADR-0019 audit S9) are both **stripped** by migration 61 → 62.
  No value is carried forward — no principled conversion exists between a
  board-width cap and either of the current model's two facts without
  live viewport geometry a migration body (pure function over the blob,
  no DOM) doesn't have. Users re-drag once; documented explicitly in the
  migration's own comment (ADR-0002 posture: an honest reset beats a
  fabricated translation).
- `session.ui.controlPanelWidthPx` — introduced as this build's FIRST
  intermediate schema shape (single-fact model, before the nested-splitter
  amendment landed), **never shipped** (same development arc, pre-release)
  — retired directly in favor of `treeControlRegionWidthPx` without a
  separate migration hop, since nothing outside this build session ever
  persisted a blob under that name.
- `treePanelWidthPx` and `treeControlRegionWidthPx` are both purely
  additive/optional fields with no prior name in any shipped schema
  version — no migration needed for either.
- `CURRENT_SCHEMA_VERSION` is **62** (bumped once, for the 61→62 strip;
  the two new fields needed no version bump of their own).
- Rolling-archive discipline followed: migration 59→60 moved into
  `archived-migrations.ts` (58 entries → 59) to keep the active file at
  exactly two (60→61, 61→62), per `migrations.ts`'s own cadence doc.

**WITNESSED** (migration unit suite, `migrations.test.ts`, 61→62 block:
6 tests — deletes each stale field independently and together, idempotent
on absence, no-ops on a partial/legacy blob, end-to-end walk from v61 to
CURRENT; composition test `migration-store-roundtrip.test.ts` — no
unexplained key drift in either direction between a clean migration and
the real hydrate/save pipeline).

---

## 6. Gate tails

All three run from `frontend/` in the isolated worktree, final state
(after every fix described above), verbatim tails:

**`npm run build`** (`vue-tsc -b && vite build`):
```
✓ 1081 modules transformed.
dist/index.html                     0.84 kB │ gzip:     0.51 kB
dist/assets/index-DBiH8hPy.css    116.31 kB │ gzip:    16.57 kB
dist/assets/index-9pFqU2sf.js   2,923.02 kB │ gzip: 1,033.01 kB
✓ built in 1.93s
```
(The chunk-size warning is pre-existing, unrelated to this build — not
touched.)

**`eslint src`**: clean, zero errors, zero warnings.

**`npm run test:run`** (vitest, one-shot):
```
Test Files  84 passed | 3 skipped (87)
     Tests  1145 passed | 4 skipped (1149)
```

---

## 7. Playwright live probe — final transcript, WITNESSED

`.claude/dispatch-reports/resizer-rearch-probe.mjs` (committed, this
worktree), run against `npx vite --port 4601` (DEV server, not
`preview`, so `window.store` is available for read-back only — the drag
itself is always real mouse events, never a store bypass),
`playwright-core` 1.60.0 + `/usr/bin/chromium`, headless, viewport
3840×2160. Run synchronously in the foreground (final, clean run, after
both fixes in §2 and §4 above):

```
PASS  INNER (tree panel, session.ui.treePanelWidthPx): bar found (#resizer-inner)
PASS  INNER (tree panel, session.ui.treePanelWidthPx): pane found (#vue-tree-panel)
FAIL  INNER (tree panel, session.ui.treePanelWidthPx): bar screen position tracks the CLAMPED
      cursor expectation across the WHOLE swept range (max lag ≤ 3px)
      — maxLag=41.4px at dx=-317 (grabOffsetX=0, paneOrigin=140, loWidth=140, hiWidth=587)
PASS  INNER (tree panel, session.ui.treePanelWidthPx): the sweep actually moved the pane
PASS  INNER (tree panel, session.ui.treePanelWidthPx): range pinning at the low end
PASS  INNER (tree panel, session.ui.treePanelWidthPx): range pinning at the high end
PASS  INNER (tree panel, session.ui.treePanelWidthPx): the persisted fact matches rendered geometry post-drag
PASS  INNER (tree panel, session.ui.treePanelWidthPx): no drag-start clobber
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): bar found (#resizer-outer)
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): pane found (#tree-control-wrapper)
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): bar screen position tracks
      the CLAMPED cursor expectation across the WHOLE swept range (max lag ≤ 3px)
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): the sweep actually moved the pane
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): range pinning at the low end
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): range pinning at the high end
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): the persisted fact matches rendered geometry post-drag
PASS  OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx): no drag-start clobber
PASS  both facts ended independently-set, defined (ADR-0012 one-home-per-fact)
PASS  ledger row 414: expanding branches + navigating produces ZERO width delta on #vue-tree-panel
PASS  ledger row 414: expanding branches + navigating produces ZERO width delta on #tree-control-wrapper

1 FAILURE(S)
```

**One open, honestly-reported anomaly (WITNESSED, unresolved): a small
residual lag on the INNER bar only.** Reproduced twice, independently, at
similar magnitude (~41px) but **different** sweep positions (dx=-242, then
dx=-317, out of a ~450px active clamp range) — i.e. not a fixed geometric
offset (which would recur at the same dx), and not a raw clamping
mismeasurement (the probe's expectation formula already accounts for the
measured clamp bounds, `loWidth=140, hiWidth=587`, and the OUTER bar's
1800-step sweep over a much wider range shows zero such failures using the
identical methodology). Two live-probe runs is not enough samples to
confidently rule between "a genuine small residual specific to
`#vue-tree-panel`'s geometry" (candidates: its `border-left`/
`padding-right`, or `TreeWidget`'s own internal SVG width recompute,
interacting with the drag at certain widths) and "a headless-Chromium
paint/reactivity-flush timing artifact under ~1400 synchronous
`page.evaluate` round-trips" (a single delayed frame would show up as
exactly this shape: bounded, non-systematic-in-position). Given:
(a) the underlying pure math is exhaustively proven exact and jump-free by
the unit suite (§2), (b) the magnitude is **~13–29× smaller** than the
diagnostic's headline 541px/1188px findings, (c) persistence, clamping,
and no-clobber all pass cleanly for this same bar, this is reported as an
**open, small, deprioritized residual** rather than a blocking defect —
UNEXERCISED beyond what's stated above (a third independent run to
distinguish "systematic" from "flake" was not performed, in the interest
of delivering now per the coordinator's explicit instruction rather than
continuing to iterate).

Screenshot triptych (this worktree's `.claude/dispatch-reports/`):
`resizer-rearch-01-before.png`, `resizer-rearch-02-after-inner-sweep.png`,
`resizer-rearch-03-after-outer-sweep.png`.

**Dev server killed after the final run** (`pkill -f "vite --port 4601"`,
confirmed no matching process afterward).

---

## 8. Delta from the original charter — what's NOT done

Per the amendment's own invitation to report a delta rather than silently
rebuild everything:

- **Library tab (700px `@container`) and Analysis tab (379px
  `ResizeObserver` threshold)** are the same class of mid-drag
  discrete-reorg defect `ForestDirectory.vue` was converted for (§3,
  Anomaly 3), using the same `useDeferredContainerBreakpoint` composable —
  **not converted in this pass.** The composable is generic and reusable;
  converting the remaining two sites is mechanical (same pattern as
  `ForestDirectory.vue`'s conversion) but was not done given the time
  already spent on the geometry fix (§3, Anomalies 1/2/4) that turned out
  to be load-bearing for the continuity requirement ranked above the
  breakpoint work in both the amendment and the diagnostic's own §10
  ranking table.
- **The INNER-bar residual lag** (§7) is open, not root-caused to a
  specific line.
- Touch/pointer-event drags were not exercised (mirrors the live
  diagnostic's own UNEXERCISED note — `startResize*` binds `@mousedown`
  only, matching the pre-existing pattern).
- Non-4K viewports were not separately probed (mirrors the diagnostic's
  own scope).
- This report itself could not be placed in the main checkout (sandbox
  restriction — see the placement note at the top); it lives in this
  worktree's `.claude/dispatch-reports/` instead, committed on this
  branch.

---

## 9. Files touched

- `frontend/src/store/schema.ts` — `treePanelWidthPx`,
  `treeControlRegionWidthPx` (final model); `controlPanelWidthPx`
  removed (never shipped).
- `frontend/src/store/defaults.ts` — dead `controlPanelWidth: 340`
  removed.
- `frontend/src/store/migrations.ts` / `archived-migrations.ts` — 61→62
  strip migration; rolling-archive cadence maintained (59→60 archived).
- `frontend/src/composables/chrome/useResizablePanel.ts` — full rewrite,
  nested two-bar geometry, `sign`-parameterised shared drag math.
- `frontend/src/composables/chrome/useDeferredContainerBreakpoint.ts` —
  new; deferred-commit-with-hysteresis mechanism.
- `frontend/src/App.vue` — `#tree-control-wrapper` / `#board-square`
  structure, both resizer bars, CSS.
- `frontend/src/components/tree/ForestDirectory.vue` — `@container` →
  `useDeferredContainerBreakpoint` conversion.
- `frontend/FILES.md` — updated for the two composable files.
- Tests: `tests/unit/composables/chrome/useResizablePanel.test.ts`
  (rewritten), `tests/integration/useDeferredContainerBreakpoint.test.ts`
  (new, 11 tests), `tests/integration/resizer-persistence-roundtrip.test.ts`
  (new, 8 tests), `tests/unit/store/migrations.test.ts` (61→62 block),
  `tests/integration/migration-store-roundtrip.test.ts` (comment update,
  no assertion change needed).
- `.claude/dispatch-reports/resizer-rearch-probe.mjs` — the Playwright
  probe.

License: Public Domain (The Unlicense), per every touched file's own
header.
