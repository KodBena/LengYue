# LYT disease repair — build report

**Builder:** fresh-context session, worktree
`/home/bork/w/omega/.claude/worktrees/agent-acf4bdae7edb0c794`, base
`lyt-phase2` @ `829e952c` (the worktree's own branch had drifted to an
ancestor commit, `3378806f`; fast-forwarded via `git reset --hard
829e952c` before any edit — that commit is a strict ancestor of
`829e952c`, so nothing local was discarded).

**Source of truth read end to end before any edit:**
`.claude/dispatch-reports/lyt-second-opus-review.md` (685 lines, all
read). Standing ruling: ledger row 2511 (pragmatic fixes; bypass the LYT
DSL where it obstructs, model cheaply where it fits — state plainly
which path each fix took).

All four defects are fixed. Per-defect account below.

---

## 1. CATASTROPHIC — cold boot at 1366×768 renders no board (review N2)

**Root cause.** `resolveRootSplitLiveLayout` (`src/state/feasible-layout.ts`,
GAP A / the root split resolver) had a sovereign (dragged/persisted)
branch that returned `Math.max(0, Math.round(sovereignWrapperPx))`
**verbatim, with no ceiling at all** — the non-sovereign branch right
below it already reserves `boardFloorPx` against the row's own live
width, but the sovereign branch never consulted that bound. A
`treeControlRegionWidthPx` override taken at a wide monitor (e.g.
1200px) was carried byte-identical into every narrower geometry,
including cold boots the user never dragged at, starving `#board-area`
to exactly 0.

**Fix taken: DSL-modeled, not bypassed.** The sovereign branch now
clamps to the **same** `maxRegionWidthPx` bound the non-sovereign
branch already computes (`max(sideColumn.minPx, min(sideColumn.maxPx,
availableForSplitPx - boardFloorPx))`) — reusing existing compiled
bounds and an existing derivation, not inventing new DSL surface or a
parallel clamp. This guarantees the board always keeps at least its own
floor. The existing starvation diagnostic
(`outerRowSovereignDiagnostic`, `useResizablePanel.ts`) is untouched and
still fires off the *raw* stored value, so the user still sees "your
geometry modification no longer permits board to render" even though
the board itself now keeps rendering.

**Default-layout reset.** Verified structurally, not newly built:
`resetLayoutOverrides()` (`useResizablePanel.ts`) already clears
`store.session.ui.treeControlRegionWidthPx` — the exact field
`resolveRootSplitLiveLayout` reads as `sovereignWrapperPx` — to
`undefined`, which the resolver treats identically to a fresh boot (the
non-sovereign branch, a pure function of live geometry only). This is
pre-existing behavior at `829e952c`, already regression-tested
(`tests/integration/lyt-default-layout.test.ts`, "post-reset widths
equal the LIVE-COMPUTED default for the CURRENT geometry"); no code
change was needed for this half. **Disclosed residual:** the review's
own N2/Class-3 narrative also describes a *persistence-race* variant
("the override reappeared in the next fresh context after the button
had been clicked") that would live in `SyncService`'s save-debounce
timing versus a page reload — outside what a clamp on the resolver can
fix, not investigated further here (would need live-rig reproduction to
confirm it's real, which is the orchestrator's rig, not mine).

**Regression tests** (`tests/unit/state/feasible-layout.test.ts`, new
`describe` blocks):
- "sovereign clamp: a stored override can never starve the board below
  boardFloorPx (CATASTROPHIC-1 repair)" — pins the review's own 1200px-
  at-1366×768 repro, a five-geometry sweep (2560→900) all keeping at
  least `boardFloorPx` for the board, and the compiled `[minPx,maxPx]`
  envelope.
- "not yet measured + sovereign override" — the one tick before the row
  measures no longer ships the raw override unclamped either.

**Evidentiary status: WITNESSED** at the pure-function/unit-test layer
(63→65 tests in this file, all green — see suite run below). A real
1366×768 cold-boot-with-board-visible witness is the orchestrator's
rig, not mine — **UNEXERCISED** in a live browser.

---

## 2. Presence-toggle leak (review N3)

**Root cause, traced to `src/components/tree/TreeWidget.vue`.** The
tree's own `contentDemandPx` (feeding
`resolveSideColumnLiveLayout`'s non-sovereign candidate ceiling) was
`useContentDemand(outerRef, 'h')` — `outerRef.scrollWidth`. `scrollWidth`
of a *non-overflowing* element (content narrower than its box — the
ordinary case for a small game tree) equals the **box's own rendered
width**, not the content's true intrinsic size (`.tree-widget-outer {
width: 100%; overflow: auto }`). That value round-trips: a presence
toggle (e.g. "Preview Board") that momentarily narrows the tree's box
gets that narrower box "remembered" as the tree's own content demand,
capping the *next* resolve at the same width even once the toggle
reverses and room frees back up — a measure-render-remeasure feedback
loop, matching the review's own ~31px-per-cycle monotonic decay
(486→...→123 over eight cycles) and its own cited "60px single column"
figure (`layout.value.cols * CELL(24) + PAD(18)*2 = 60` for a root-only
tree, in the component's default vertical orientation).

**Fix taken: bypassed the DOM-measurement composable, not the DSL.**
`TreeWidget.vue`'s own `svgWidth` computed (`layout.value.rows/cols *
CELL + PAD * 2`) is already the tree's intrinsic, structure-only width —
a pure function of the game tree's shape, never of the box it renders
into. `contentDemandPx` now reads `computed(() => px(svgWidth.value))`
directly instead of `useContentDemand(outerRef, 'h')`; `outerRef`
remains in use for scroll/viewport-follow, untouched.
`resolveSideColumnLiveLayout` itself (the FeasibleLayout DSL machinery)
was never the bug — it was always a pure function of its inputs; the
leak lived entirely in what the caller fed it. No DSL surgery was
needed or attempted.

**Regression tests:**
- `tests/unit/state/feasible-layout.test.ts`, "presence-toggle
  idempotence (N3 repair)" — two `describe` blocks proving that GIVEN a
  stable `tree.maxUsefulPx` (what the TreeWidget fix now guarantees),
  eight on/off cycles at the review's own geometry (and a second,
  structurally different unbounded-widen scenario) return the tree
  panel to its **exact** starting width every cycle, never drifting.
- `tests/integration/TreeWidget-content-demand.test.ts` (new file) —
  component-level pin: a root-only tree reports exactly 60px (the
  review's own cited figure); the value is identical across independent
  mounts (jsdom never computes real layout, so this also proves the
  value isn't reading an inert 0); a tree with a genuinely
  navigated-into second branch column reports a larger value (proving
  it tracks structure, not a constant); and a source-level check that
  the component's `<script>` block no longer imports
  `useContentDemand`.

**Evidentiary status: WITNESSED** at both the pure-function and
component-mount layers (69 total new/updated assertions across the two
files, all green). jsdom cannot compute real CSS layout, so it could
never have reproduced the *old* bug directly either — the live 8-cycle,
real-pixel walk is the orchestrator's rig's to confirm;
**UNEXERCISED** live.

---

## 3. Divider one-way drag (review N4)

**Root cause: not conclusively established without live-rig access.**
The pure drag math (`computePaneWidthPx` / `computeTreeControlRegionWidthPx`,
`useResizablePanel.ts`) is exhaustively tested for continuity,
monotonicity, and range-pinning in both directions
(`tests/unit/composables/chrome/useResizablePanel.test.ts`) and is
symmetric by construction — dragging right and left both trace the same
`dragOriginPx + sign*totalDeltaPx` formula, clamped identically at both
ends. I could not reproduce or pin the exact live-browser mechanism
behind "changed nothing at all, with no system message" from source
reading and reasoning alone, and this task has no live-rig access to
verify against (validation is suite+build only, per brief). Rather than
guess at a live-DOM cause and ship a speculative patch for it, I took
the alternative the brief itself sanctions: **"either both directions
work within honest bounds, or the refusal produces the graceful
diagnostic the drag system already has."**

**Fix taken: DSL-modeled (extends an existing diagnostic contract, not
a new mechanism).** `resolveRootSplitLiveLayout`'s result now carries
`sovereignClampedFromPx: number | null` — non-null exactly when defect
1's own clamp (above) actually reduced a stored override below what it
literally asked for, naming the raw value it was clamped from. This
covers a case `outerRowSovereignDiagnostic` (board-starvation-only) does
not: the side column's own compiled ceiling (`sideColumn.maxPx`)
frequently binds well before the board's floor ever would (verified:
at 1920×1080, ceiling=820 binds against a board-floor-reserving bound of
1608) — exactly the geometry the review's own N4 repro cites
(root `[168px 528px 1200px]`, board comfortably non-zero). Without this
signal, a drag that overshoots the panel's own designed range rendered
visibly "stuck" with no explanation — the silent-refusal shape ADR-0002
forbids, and the review's own words for it. `App.vue` wires a new
dedup'd watcher (mirroring the existing `outerRowSovereignPushGate`
pattern exactly) that pushes the same warning/remediation/nextAction
shape whenever this fires.

This composes with, and is partly subsumed by, defect 1's own clamp:
before the fix, a sovereign override could reach values far outside the
region's own renderable envelope (1200 against a compiled ceiling of
820) with the render reflecting that raw, unbounded value — after the
fix, the *rendered* geometry is always sane and in-bounds, which
removes the most likely trigger for a subsequent drag's own
`getBoundingClientRect()`-based origin measurement landing somewhere
pathological. I flag honestly that this is the strongest defensible
account I could build without a browser, not a confirmed root-cause
narrative.

**Regression tests** (`tests/unit/state/feasible-layout.test.ts`,
"sovereignClampedFromPx: names the refusal..."): null when unclamped;
null on the non-sovereign path (clamping is only ever a refusal of an
explicit override); fires when the side column's own ceiling binds
(not only board starvation); clears once a subsequent, in-bounds
override supersedes it.

**Evidentiary status: UNEXERCISED live** — this is explicitly the item
where I could not establish ground truth without the orchestrator's
rig. The diagnostic-push mechanism and its pure-function trigger are
WITNESSED at the unit-test layer; whether it actually resolves the
originally-witnessed one-way stuck feel in a real browser is not
something I can confirm from here. If the rig re-witness shows the
symptom persists, the next step is a live console/DOM trace of the
SECOND mousedown's own measured `regionDragOriginPx` versus the stored
value, which needs the rig this task doesn't have.

---

## 4. Diagnostic leaks raw token + mixed-locale text (review N/Class 5)

**Root cause.** `SystemLogPanel.vue` rendered `msg.nextAction` (a
machine token, the closed-set literal `'open-default-layout-control'`
minted in three places in `feasible-layout.ts`) **verbatim**, next to a
correctly-localized `$t('systemLog.nextAction')` label — producing the
witnessed `次のアクション: open-default-layout-control` (translated
label, untranslated English token).

**Fix taken: bypassed nothing — pure locale-layer fix, in scope
already.** Added `nextActionLabel(token)` in `SystemLogPanel.vue`,
resolving the closed token set through a new locale key
(`systemLog.nextActionToken.open-default-layout-control`) added to all
four catalogs (en/ja/zh-CN/ko, real translations, not `[TODO]`
placeholders — this is a small, contained, one-entry addition, not the
larger pre-existing `[TODO]`-debt pattern elsewhere in those files). An
unrecognized future token degrades to the raw string (never throws) but
logs loudly via `console.error` (ADR-0002) rather than silently
shipping a second leak. **Disclosed, explicitly out of scope:**
`msg.text`/`msg.remediation` themselves are producer-authored English
strings (`feasible-layout.ts`) — localizing every system-message
producer across the app is a materially larger effort than this one
leaking-token fix and was not attempted.

**Regression tests:**
- `tests/integration/SystemLogPanel-next-action.test.ts` (new file) —
  mounts the real component with real i18n: en renders a human label
  (not the raw token); ja renders both the label AND the resolved value
  in Japanese (the exact mixed-locale artifact, now closed); a message
  with no `nextAction` is unaffected; an unrecognized token degrades to
  the raw string and logs exactly once.
- `tests/unit/m8-m11-locale-parity.test.ts` — extended the existing
  M8/M11 key list with the new locale key, so a future translation
  regression (or a new token shipped without a catalog entry) fails the
  same parity net every other structured-diagnostic key already relies
  on.

**Evidentiary status: WITNESSED** — real component mount, real
`vue-i18n`, real locale switch, all four new/extended test files green.

---

## Discipline notes

- ADR-0006 headers: all four touched source files
  (`App.vue`, `SystemLogPanel.vue`, `TreeWidget.vue`, `feasible-layout.ts`)
  already carried compliant headers; each touched section gained an
  inline repair comment naming this dispatch, no header retrofit
  needed. The two new test files carry full path + License headers.
- No banned CSS touched (no box-shadow/transition/blur added); no new
  color tokens introduced.
- No live-service contact: no ports, no `192.168.122.68:1235`. All
  validation is suite + build, run under `nice -n 19` /
  `NODE_OPTIONS=--max-old-space-size=2048` / `vitest --maxWorkers=2` as
  required.
- Scope discipline: only the four named defects were touched. No
  DSL-surgery was required for any of them — three were cheap,
  existing-shape extensions inside `feasible-layout.ts` (defects 1, 3)
  or a caller-side bypass of a DOM-measurement composable in favor of an
  already-computed intrinsic value (defect 2); defect 4 is a pure
  locale-layer fix. Nothing here is a STOP-and-report item.

## Verification (literal exit codes, this session)

- `nice -n 19 npx vitest run --maxWorkers=2` (full suite,
  `NODE_OPTIONS=--max-old-space-size=2048`): **exit 0** — 279 files
  passed, 3 skipped (282 total); 3468 tests passed, 8 skipped (3476
  total); 0 failed.
- `nice -n 19 npm run build` (`vue-tsc -b && vite build`,
  `NODE_OPTIONS=--max-old-space-size=2048`): **exit 0**.
