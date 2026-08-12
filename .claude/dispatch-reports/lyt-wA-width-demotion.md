Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish-pass wave A — width-conditional demotion

Commission: realize width-conditional demotion for the `controlPanel`
Exclusive (findings F1/F2-partial,
`.claude/worktrees/agent-a126687b695c7f544/.claude/dispatch-reports/lyt-finish-pass.md`,
read in full before starting).

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `8973e5d3` — the
commit named in the commission. This agent's worktree
(`worktree-agent-a7258127f21e13c64`) started on an unrelated branch at
`3378806f` (`git merge-base --is-ancestor 8973e5d3 HEAD` exit 1).
Hard-reset the worktree branch onto `8973e5d3`; re-verified exit 0.
Working tree was clean apart from an untracked `.claude/` (harness
state).

**HEAD after this wave's commit: `3fa062a1f5d647186e4ff9fb8d614fe4c3debcbc`.**

## 2. What was missing, precisely

The compiled `controlPanel` Exclusive already carried
`demote: { axis: "h", belowPx: 778 }` (landscape) /
`{ axis: "h", belowPx: 808 }` (portrait) — P1's derived thresholds,
threaded through the compiler and emitter (P2a). P2b built the
class-default absence mechanism and the summon-popover Teleport in
`LytNode.vue`, generically for any Exclusive node. **Nothing evaluated
the threshold against the actual granted width at runtime** — `grep
demote` across `frontend/src` before this wave showed the field
declared in every `.gen.ts` and documented in every relevant header
comment, but read by exactly zero consumers for the `controlPanel`
case (a *different*, already-shipped mechanism,
`lyt-capability-registry.ts`'s `LYT_CAPABILITY_REALIZATION.demoted`,
already consults a **leaf**-level `demote` for `A_app`'s 616px
threshold — that data path is unrelated and untouched by this wave).

## 3. What this wave built

- **`frontend/src/composables/chrome/useLytProgramIndex.ts`** — the
  program walk now also captures `demoteByWidget`: a `widget id ->
  LytDemotion` map for blackbox/exclusive nodes (P2a's own
  already-emitted fact). Leaf-level `demote` (e.g. `A_app`'s 616px) is
  deliberately **not** captured here — that's the pre-existing
  capability-registry consumer's own concern, out of this wave's named
  scope (`controlPanel`).
- **`frontend/src/state/layout-model.ts`** —
  `resolveWidthConditionalPresence(measuredWidthPx, demote,
  desiredVisible)`, a pure function: `demote === null` or
  `measuredWidthPx <= 0` (not yet measured) pass `desiredVisible`
  through unchanged; otherwise `fits = measuredWidthPx >=
  demote.belowPx`, and the result is `fits ? desiredVisible : false`
  — width only ever narrows a `true` down to `false`, never the
  reverse. Throws (ADR-0002) on a `demote.axis !== 'h'`, since this
  evaluator only knows how to read a horizontal measurement; no
  current `.lyt` program declares a vertical `controlPanel` demote, so
  this is a defensive guard, not a live path.
- **`frontend/src/composables/chrome/useResizablePanel.ts`** — a
  second `ResizeObserver`, co-located with the existing
  `#split-workspace` one (same two-phase cold-load-gate attach,
  same `onMounted`/`onUnmounted` lifecycle), measures
  `#tree-control-wrapper`'s own live width and exposes it as
  `sideColumnWidthPx`. This element is the `H(tree, T(CP-*),
  previewBoard)` row — its width **is** the side column's true
  rendered track, whichever mechanism produced it (the compiled
  `board-priority-clamp` CSS calc, or a resizer-drag override) — a
  genuine DOM measurement rather than trusting either source to already
  agree with the model's own structural assumption (which the original
  finish pass found it did not).
- **`frontend/src/App.vue`** — `lytPresenceOverrides`'s `controlPanel`
  entry is now **always** the width-resolved value (never left
  `undefined` for LytNode's own fallback to re-derive): `desired =
  persisted ?? classDefault ?? true`, then
  `resolveWidthConditionalPresence(sideColumnWidthPx, controlPanelDemote,
  desired)`. Both `LytNode.vue`'s grid render and App.vue's own
  `controlPanelIsPresent` (summon-trigger visibility) read this one
  computed, so they cannot disagree (ADR-0012 P1). A new
  `controlPanelForcedAbsent` computed (`desired && !resolved`) feeds
  the presence-menu disclosure below.
- **`frontend/src/composables/chrome/useLytPresenceMenu.ts` /
  `frontend/src/components/chrome/LytPresenceMenu.vue`** — a new
  `forcedAbsent` option/prop, additive to the existing `classDefaults`
  shape. The checkbox stays **enabled** in this state (distinct from
  the last-remaining-panel guard's own disable) — toggling still writes
  the real preference, it just doesn't render until width allows — with
  a small inline hint (`app.chrome.presence.widthDemotedHint`, English
  only — **disclosed narrowing**: ja/ko/zh-CN were not translated in
  this pass; the i18n compile tripwire
  (`tests/unit/i18n-messages-compile.test.ts`) only walks `en.json`, so
  this doesn't fail CI, but it is a real, named gap for a follow-up).

**No hysteresis, and why that's not an omission:** toggling
`controlPanel`'s own presence does not change `#tree-control-wrapper`'s
own measured width — that width is set by the side column Split's own
track (CSS calc or drag override), which does not depend on which of
its *grandchild* row's children are present. The self-referential
feedback loop hysteresis exists to damp is therefore structurally
absent, not merely unencountered in testing — verified by the repeat
run in §6 producing byte-identical `wrapperRect`/`wrapperGridColumns`
values across two independent process launches.

## 4. Gates

| Gate | Result |
|---|---|
| `vue-tsc -b` | exit 0, no errors |
| `npm run build` (`vue-tsc -b && vite build`) | exit 0 |
| `eslint .` | 0 errors, 0 warnings |
| `npx vitest run` (full suite) | **3201 passed**, 8 skipped, 257 files passed / 3 skipped — matches the commission's named baseline exactly |
| Targeted re-run (useResizablePanel, useLytPresenceMenu, LytNode-presence-toggle, LytNode-exclusive-rendering, lyt-path-key-regression, App-boot, i18n-messages-compile) | 89/89 passed |
| `research/lyt` pytest | **NOT RUN** — no `.lyt` encoding or Python file was touched by this wave (`git diff` confirms; only `frontend/src/**` changed), so the "if encodings touched" trigger does not apply. Disclosed anyway: this environment has no `ortools`-equipped venv (checked `backend/venv`, `proxy/.venv`, both lack it; a cached wheel exists at `/tmp/ortools-*.whl` but no venv installs it) — if a future wave **does** touch an encoding, that gap needs closing first. |

One incidental cleanup: the first `vue-tsc -b` invocation in this
worktree (before `node_modules` existed here — see §5) emitted 345
untracked `*.vue.js`/`*.js` shadow files into `frontend/src/` (a
stale-`tsBuildInfo`/incremental-build artifact, not a source change).
Removed before committing; `git status` confirms only the 7 intended
files are modified.

## 5. Rig (isolation)

Ports, each probed dead via `/dev/tcp` before AND after use:

```
before: 19120 DEAD   19121 DEAD   19122 DEAD
after:  19120 DEAD-GOOD   19121 DEAD-GOOD   19122 DEAD-GOOD (never contacted)
```

- **`frontend/node_modules`** was empty in this fresh worktree;
  symlinked from the main checkout after diffing `package-lock.json`
  (`LOCK-IDENTICAL`) — the same precedent the prior finish-pass report
  used. `vue-tsc -b`'s incremental-build cache
  (`node_modules/.tmp/*.tsbuildinfo`) is regenerable and was cleared
  after use; no source file in the shared checkout was touched.
- **Backend** `127.0.0.1:19120` — main checkout's venv
  (`/home/bork/w/omega/backend/venv/bin/python -m fastapi run`),
  `DATABASE_URI=sqlite+aiosqlite:///…/wA-rig/cards.rig.db`, a **copy**
  of `backend/samples/cards.sample.db`. The real `cards.db` was never
  opened. `QEUBO_ENABLED=false`. Verified live: `GET /docs` → 200.
- **Frontend** `127.0.0.1:19121` — `vite --strictPort`,
  `VITE_API_BASE_URL=http://127.0.0.1:19120`,
  `VITE_KATAGO_WS_URL=ws://127.0.0.1:19122`.
- **Engine** `127.0.0.1:19122` — verified dead before and after;
  never contacted.
- None of 4173/5173/5174/8764/1235/1242/195xx was touched. Only this
  session's own PIDs were started and killed (confirmed via `ps aux`
  + explicit `kill`, then re-probed dead).
- **Theme.** `profile.settings.appearance.theme` is backend-synced,
  not `localStorage` — a first attempt seeding `localStorage` directly
  (mirroring the prior finish-pass report's own approach) silently did
  nothing (screenshot confirmed dark theme). Corrected: drove the real
  Settings UI (`#session-theme-select`, `SettingsPane.vue`) to select
  `cluster` ("Light" in the UI) after boot. Every capture confirms
  `data-theme="cluster"` and the pink `--surface`/`--text-0` palette
  (see screenshots).
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G --
  node --max-old-space-size=1024`, chromium at `/usr/bin/chromium`
  (via `playwright-core`, no `@playwright/test` package installed in
  this tree). One browser instance per run, closed in a `finally`.
  **No wall-clock waits** — every wait is `waitForSelector` /
  `waitForFunction` on a real DOM condition, except one `50ms`
  `waitForTimeout` after a tab-strip click (DOM-settle, not a data
  wait — disclosed rather than silently used).
- Verified deterministic: ran the full 3-size script twice
  independently; `wrapperRect`, `wrapperGridColumns`, and every
  hit-test result were byte-identical across both runs.

## 6. Per-size verification results

### (a) 1920×1080 — CLOSED

- `#tree-control-wrapper` measured width: **614px** (< 778px
  threshold) → `controlPanel` correctly resolves **absent**.
  `wrapperGridColumns`: `"230px 0px 0px"` — `controlPanel` and
  `previewBoard` tracks both genuinely 0px (not merely visually
  hidden).
- `#main-area`: `scrollWidth === clientWidth === 1920`, `overflow-x:
  hidden` — **no overflow, nothing clipped**. (Before this wave, per
  the finish-pass report: 284px unreachable at this exact size.)
- Summon button exists and works: clicking it opens the popover with
  the full Settings tab, `Theme: Light` visible, **"Re-run setup
  wizard" hit-tested reachable** (`elementFromPoint` returns the
  button itself).
- **Connect** hit-tested reachable (it lives in the always-present
  `A_engine` toolbar cluster above the tree/panel row, unaffected by
  `controlPanel`'s own demotion).
- Screenshots: `vp1920x1080-01-initial.png` (clean board + toolbar,
  visible dead space to the right of the tree column — see §7),
  `vp1920x1080-02-panel-state.png` (summoned popover, Settings tab,
  setup wizard button, Theme dropdown).

### (b) 1280×1024 — PARTIALLY CLOSED

- `#tree-control-wrapper` measured width: **441px** (< 778px) →
  `controlPanel` correctly resolves **absent**.
  `wrapperGridColumns`: `"140px 0px 0px"` (tree at its 140px floor).
- `#main-area`: `scrollWidth === clientWidth === 1280` — **no
  overflow**. F1's own clipping symptom at this size is closed.
- Summon works; **"Re-run setup wizard" hit-tested reachable**.
- **Tree does not take the row** — its track stays pinned at 140px
  (the resizer machinery's own never-dragged default, driven by
  `effectiveTreePanelWidthPx`, which the trackList override applies
  **unconditionally**, independent of a sibling's presence). 301px of
  the 441px row renders as unclaimed grid space rather than being
  reclaimed by the tree. See §7 for why this wasn't fixed here.
- **Connect hit-tested UNREACHABLE** (`elementFromPoint` lands on a
  `DIV`, not the button) — this is the **separate, pre-existing F2
  toolbar-cluster defect**: `Connect` lives in `A_engine`, which
  (per B2a's own ratified L15 disposition) declares `activity
  sustained` and is therefore **forbidden from demoting at all** — no
  width-conditional mechanism this wave built (or could build within
  its named scope) touches it. The cluster's own reserved-height/clip-
  rect mismatch (named in the original finish-pass F2 finding) is
  unchanged by this wave. Screenshot
  `vp1280x1024-02-panel-state.png` shows the toolbar cut off after
  `MATCH` — no visible `CONNECT` row at all at this size.

### (c) 2560×1440 — NOT CLOSED (model-side gap)

- `#tree-control-wrapper` measured width: **819px** (**≥** 778px
  threshold) → `controlPanel` correctly resolves **present**, per the
  compiled program's own stated intent.
- But the realized composition still overflows:
  `wrapperGridColumns`: `"307px 664px 0px"` — tree's own **default**
  (never-dragged) width is 307px at this viewport (a *fraction* of
  row width, not its 110/140px structural floor), so
  `307 + 664 = 971px` is asked of an 819px track.
  `#control-panel`'s own `getBoundingClientRect()`: `x=2052,
  width=664, right=2716` — **156px past both the wrapper's own right
  edge (2560) and the viewport's own right edge**.
  `#main-area`: `scrollWidth=2716 > clientWidth=2560`,
  `overflow-x: hidden` — **the same "excess permanently unreachable,
  no scrollbar" shape F1 originally named**, still present at this
  one size.
- Screenshot `vp2560x1440-01-initial.png` shows a visually clean
  layout with no obviously truncated text in the Settings/Session(UI)
  tab specifically — the overflow is real (confirmed by the DOM
  measurement above) but happens not to manifest as visible text
  truncation in this particular tab; a wider-content tab (Library,
  Cards — matching the original report's F12 finding) would very
  plausibly still show it, not independently re-checked here.

**Root cause, and why this is the MODEL-SIDE half the commission
named:** the compiled `778px` threshold was derived (per P1) against
an assumed tree floor (~140px: `140 + 4 + 664 = 808`, the finish-pass
report's own arithmetic). But the **realization** layer's tree track,
when never dragged, is not that floor — it is
`computeTreePanelDefaultWidthPx`, a **fraction of the row's own live
width** (`TREE_PANEL_DEFAULT_WIDTH_FRACTION`), which *grows* with
viewport size (230px at 1920, 307px at 2560). The compiled threshold
is a single flat number; the realized demand it's meant to bound is
not. At 1920 and 1280 the demoted-vs-present boundary happens to fall
on the right side anyway (614 and 441 are both comfortably under 778).
At 2560, the boundary is on the wrong side: 819 clears 778, but the
realized demand (307 + 664 = 971) does not fit in 819 regardless.

## 7. Model-side half: NOT taken, with reasons

The commission named two possible outcomes for the model-side half:
re-ground the landscape side-column floor fact in the encoding
(feasibility-checked via `coverage_matrix`, deltas named), or accept
that some previously-INFEASIBLE size legitimately becomes the demoted
state. **Neither was attempted in this wave.** Two independent
reasons, both disclosed rather than papered over:

1. **Environmental blocker.** `research/lyt`'s CP-SAT solver requires
   `ortools`; no venv in this checkout has it installed
   (`backend/venv`, `proxy/.venv`, `backend/.venv-pyinstaller*` all
   checked — none). A cached wheel exists at
   `/tmp/ortools-9.15.6755-*.whl` but installing it into a venv and
   re-running `research/lyt/tests/test_lyt.py` /
   `coverage_matrix.py` is itself an environment-provisioning step
   this session did not take (it would also need ratification that
   installing a new wheel into a shared venv, or creating a new one,
   is in scope for a runtime-realization wave).
2. **Deeper than the commission's own framing anticipated.** The
   commission's conditional text framed the risk as "the track derives
   from a stale floor" (i.e., a single flat number needing correction).
   What §6(c) actually found is that the REALIZATION layer's tree
   default is not a flat number at all — it scales with viewport width
   — so a single corrected flat threshold (778 → some other px) cannot
   fully close this gap; the model would need either a
   viewport-relative threshold (a language extension, not a value
   change) or the realization's tree-default formula would need to
   defer to the panel's own presence before computing its own default
   width (the tension named in the next paragraph). Deciding between
   those is a genuine fork, not a number to pick.

**Also disclosed as a fork, not resolved unilaterally:** "tree widens
into the freed space" (named explicitly in the commission) does not
happen at 1920 or 1280 either — `useResizablePanel.ts`'s own header
documents a **standing, deliberate invariant** ("the tree pane's width
changes through EXACTLY that one channel [the INNER resizer bar],
never automatically — no fit-to-content, no auto-grow on branch
expansion or navigation", ledger row 414) that this wave's fix does
**not** override — `lytTrackStyleOverrides` unconditionally supplies a
track-style override for the tree leaf's path regardless of a sibling
Exclusive's presence, which is exactly what defeats B2a's own
"tree is the residual-holding sibling, `pref: 1fr`" model intent the
moment a sibling collapses. Making tree auto-widen when a sibling
demotes would mean teaching the resizer-override mechanism to consult
sibling presence — a real behavior change to a heavily-tested,
explicitly-documented "never automatic" invariant, not something this
wave's named scope (realize the demotion *evaluation*) authorizes
unilaterally. **STOP-and-report: this needs a commissioner ruling** —
either accept the freed space as unclaimed dead grid area (current
behavior, disclosed, not a regression from before-this-wave since
tree was equally pinned then), or ratify extending the resizer-override
mechanism to yield when a sibling collapses.

## 8. Style/discipline checks

- No hardcoded demote thresholds — `778`/`808`/`616` never appear as
  literals in the new code; every comparison reads the compiled
  program's own `demote.belowPx` (px norm, ledger row 2047).
- No new `as` casts without justification; `vue-tsc -b` and `eslint`
  both clean.
- `resolveWidthConditionalPresence` is a pure, directly-unit-testable
  function per `frontend/CLAUDE.md`'s "pure logic before effectful
  glue" — **not independently unit-tested in this wave** (a disclosed
  gap: the full-suite pass exercises it only transitively through
  `App-boot.test.ts` and the existing presence-toggle integration
  tests, neither of which drives the width-measurement path directly
  since jsdom's `ResizeObserver` is a stub in that tier per
  `tests/CLAUDE.md`'s render-count-harness note). A dedicated
  `tests/unit/state/layout-model-width-demotion.test.ts` covering the
  four branches (`demote: null`, not-yet-measured, fits, doesn't-fit)
  would close this — flagged as owed, not silently skipped.

## 9. STOP-and-report summary

1. **Model-side half not taken** — environmental blocker (`ortools`
   unavailable) plus scope depth beyond a single-number correction
   (§7).
2. **"Tree widens" does not happen** — conflicts with a standing,
   deliberately-documented invariant (ledger row 414); needs a
   commissioner ruling on whether to extend that mechanism (§7).
3. **Connect unreachable at 1280×1024** — the separate, pre-existing
   F2 toolbar-cluster defect (A_engine's own reserved-space/clip-rect
   mismatch); `A_engine` cannot demote by design (L15, `activity
   sustained`), so no mechanism this wave built bears on it.
4. **Portrait (808px threshold) not screenshot-verified** — the
   commission's own named verification sizes are all landscape;
   the code path is identical (same `resolveWidthConditionalPresence`
   call, same `activeLytProgramIndex.demoteByWidget` read) but this
   was not independently exercised against the portrait `.gen.ts`
   program in this pass.
5. **ja/ko/zh-CN translations for the new presence-menu hint string
   were not added** — English only, disclosed in §3.
6. **No dedicated unit test for `resolveWidthConditionalPresence`** —
   disclosed in §8.

## 10. Gate exit codes (literal, for the record)

- `npx vue-tsc -b` → `0`
- `npm run build` → `0`
- `npx eslint .` → `0` (0 errors, 0 warnings)
- `npx vitest run` → `0` (3201 passed, 8 skipped)

## 11. Completion pass (2026-08-13)

Commission: close 2560x1440 (STOP-and-report item 1), add unit tests for
`resolveWidthConditionalPresence`/the new clamp (item 6), and land the
ja/ko/zh-CN translations for the presence-menu hint (item 5). Items 2
("tree widens"), 3 (`A_engine` Connect unreachable at 1280x1024), and 4
(portrait not screenshot-verified) are UNCHANGED — none were in this
pass's named scope, and none of this pass's edits touch the mechanisms
those items name (§7's ledger-row-414 invariant is untouched by
construction — see below).

### 11.1 Base freshness

Worked directly in the already-checked-out worktree
(`worktree-agent-a7258127f21e13c64`), HEAD `e8e41f8b` at start — already
an ancestor of this report's own §1 commit (`3fa062a1f`); no reset
needed.

### 11.2 The fix

Root cause, confirmed against the compiled program directly
(`lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts`): the `controlPanel`
Exclusive's own compiled track is a FIXED **664px**, and the `tree`
leaf's own compiled floor is **110px** (landscape) / **140px**
(portrait) — the SAME two facts the compiled `@demote` threshold is
itself composed from (`664+110+4=778`, `664+140+4=808`, one row gap).
`useResizablePanel.ts`'s existing tree-width clamp
(`computeTreePanelClampedWidthPx`, the W3-fix corrective for the 900x600
regression) reserves `CONTROL_PANEL_MIN_WIDTH_PX` instead — a
model-layer estimate (300px, projected from the tab registry) that has
nothing to do with this row's real content — against
`effectiveTreeControlRegionWidthPx` (a DESIRED region width), not
`sideColumnWidthPx` (the row's REAL rendered width). At 2560x1440 this
under-reserved by 364px, so the tree's own 307px viewport-scaled default
was never clamped down, and `307 + 664 = 971px` was asked of an 819px
track.

**`clampTreeWidthForSideColumn`** (new, `state/layout-model.ts`) is a
second clamp pass, composing with (not forking) the existing clamp
discipline: `min(natural, max(floor, sideColumnWidthPx - reservedPx))`,
where `reservedPx`/`floor` are read off the compiled program's OWN
`controlPanel`/`tree` tracks (via a new `trackByWidget` fact on
`useLytProgramIndex.ts`'s walk, mirroring its existing
`widgetDefaultVisible`/`demoteByWidget` facts) rather than re-derived
model-layer numbers. Gated by `controlPanelIsPresent` — when the panel
is width-demoted, nothing is reserved against its (0px-rendered) track.
Kept as its own function rather than widening
`computeTreePanelClampedWidthPx`'s own signature: that function's
existing 2-argument contract is exercised directly by
`layout-model.test.ts`'s own W3-fix suite (the 900x600 regression), and
widening it would graft an unrelated concern onto an already-shipped
contract (ADR-0004 minimal-touch) rather than simplify anything.
Applied in `App.vue`'s `lytTrackStyleOverrides` (the ONE place that
already has both `activeLytProgramIndex` and `sideColumnWidthPx` in
scope), as a second pass over `effectiveTreePanelWidthPx.value` before
it's written into the tree leaf's track override.

**No auto-widen, ledger row 414 untouched.** This clamp only ever
SHRINKS the natural tree width down to fit; it never grows it into
freed space. §7's own disclosed fork ("tree widens when a sibling
demotes") remains exactly as disclosed — this pass does not touch
`lytTrackStyleOverrides`' unconditional tree-leaf override or
`useResizablePanel.ts`'s own "never automatic" invariant in any way
that would resolve that fork; it is still a commissioner decision, not
made here.

**Generalizes to portrait for free.** Portrait's own compiled program
carries the identical structural shape (`controlPanel` fixed 664px,
`tree` floor 140px, one row gap, `demote` 808px = 664+140+4) at a
DIFFERENT H-row (`path "5"`, no `previewBoard` sibling there) — since
`clampTreeWidthForSideColumn` reads everything off the active compiled
program via `activeLytProgramIndex`, the fix applies identically in
portrait without a class branch. Not independently screenshot-verified
in this pass (STOP item 4, still open) — pinned by a dedicated unit
test instead (`tests/unit/lyt-path-key-regression.test.ts`, portrait's
own `trackByWidget` facts) and exercised structurally by
`clampTreeWidthForSideColumn`'s own portrait-fixture test case in
`layout-model.test.ts`.

### 11.3 Unit tests added

- `tests/unit/state/layout-model.test.ts` — two new `describe` blocks:
  - `resolveWidthConditionalPresence`: demote-null pass-through,
    not-yet-measured pass-through, above/at/below the threshold
    (inclusive `>=` boundary), the `forcedAbsent`
    explicit-visible-but-width-cannot-grant case, the "narrows true to
    false, never promotes false to true" sovereignty direction, and the
    `axis !== 'h'` throw.
  - `clampTreeWidthForSideColumn`: no-op when already fits; the EXACT
    reported 2560x1440 numbers (307 natural / 819 measured -> clamps to
    151, which plus the panel + one gap sums to exactly 819, no slack);
    the demote-boundary consistency property (at `sideColumnWidthPx ===
    belowPx`, clamps to exactly the tree's own floor); never-shrinks-
    below-floor; never-grows-above-natural (ledger row 414); the
    `controlPanelPresent === false` no-reservation case; not-yet-
    measured pass-through; portrait's own fixture reproducing its own
    808px boundary; and the two ADR-0002 throw branches (wrong track
    kind for either input).
- `tests/unit/lyt-path-key-regression.test.ts` — one new assertion
  pinning `trackByWidget.controlPanel`/`.tree` against the literal
  numbers read directly off both `.gen.ts` files (not re-derived from
  the index under test), in both classes.

All expectations were derived from the compiled program's own literal
numbers and the function's documented contract, not from reading back
the implementation — e.g. the 151px expectation is `819 - 664 - 4`,
computed independently before running the test, not copied from a
debug print.

### 11.4 i18n

`app.chrome.presence.widthDemotedHint` added to `ja.json`/`ko.json`/
`zh-CN.json`. Checked the file's own convention for a new,
not-yet-translated string first (rather than guessing): the `sync.*`
recovery-banner keys added in a prior pass carry a literal `"[TODO] "`
prefix ahead of the English source string, identically across all
three locale files — followed that convention verbatim rather than
inventing a different marker or a real (unreviewed) translation. The
pre-existing `app.chrome.presence.A_setup` gap in the same three files
(added by an earlier, unrelated wave) was left untouched — out of this
pass's named scope.

### 11.5 Re-verification (isolated rig)

Ports `19200`/`19201`/`19202`, each probed dead via `/dev/tcp` before
use and confirmed dead again after teardown. Backend: main checkout's
venv, `DATABASE_URI` pointed at a **copy** of
`backend/samples/cards.sample.db` in scratchpad (`QEUBO_ENABLED=false`);
verified live via `GET /docs` -> 200. Frontend: `vite --strictPort`,
`VITE_KATAGO_WS_URL` pointed at `19202`, which was never contacted
(confirmed dead before AND after). None of 4173/5173/5174/8764/1235/
1242/195xx touched — only this session's own three PIDs were started
and explicitly killed at the end.
`frontend/node_modules` symlinked from the main checkout after diffing
`package-lock.json` (`LOCK-IDENTICAL`), same precedent as every prior
LYT rig.

**Theme.** `'light'` is retired (migrates to `'dark'` — `schema.ts`
confirms). Drove the real Settings UI (`#session-theme-select`) to
`'cluster'` after boot, via the summon popover where the panel starts
demoted. Every capture confirms `data-theme="cluster"`.

**Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- node
--max-old-space-size=1024`, chromium at `/usr/bin/chromium` with
`--js-flags=--max-old-space-size=1024` (playwright-core, no
`@playwright/test`), one browser per run, closed in a `finally`. No
wall-clock waits except one disclosed `50ms` DOM-settle after a
tab-strip click (mirrors the prior wave's own one instance) — every
other wait is `waitForSelector`/`waitForFunction` on a real DOM
condition, including a poll on `#tree-control-wrapper`'s own measured
width settling across two consecutive reads (letting both
ResizeObservers reach their steady-state reading before measuring).

**Per-size results** (screenshots under
`…/scratchpad/wA-completion-rig/shots/`, not committed — established
LYT convention):

| Size | `controlPanelIsPresent` | `gridTemplateColumns` | `#main-area` overflow | Re-run setup wizard | Registry ↺ reset | Registry selects |
|---|---|---|---|---|---|---|
| 1920x1080 | false (unchanged) | `230px 0px 0px` | `scrollWidth === clientWidth === 1920`, no overflow | reachable (via summon popover) | n/a | n/a |
| 1280x1024 | false (unchanged) | `140px 0px 0px` | `scrollWidth === clientWidth === 1280`, no overflow | reachable (via summon popover) | n/a | n/a |
| 2560x1440 | **true** | `151px 664px 0px` | `scrollWidth === clientWidth === 2560`, **no overflow (was 2716 before this pass)** | reachable | reachable | 4 of 6 reachable (see below) |

2560x1440 is the fix's own target: tree clamped from its natural 307px
down to exactly **151px** — `151 + 664 (panel) + 4 (gap) = 819`, the
row's own measured width, with **zero slack and zero overflow**.
`#control-panel`'s own `getBoundingClientRect()`: `x=1896, width=664,
right=2560` — flush with the viewport's own right edge, not past it.

**Disclosed, out of this fix's scope**: 2 of the 6 visible Advanced
Registry selects at 2560x1440 are NOT hit-test-reachable
(`atPointTag: null`) — but their own rects sit at `y=1431`/`y=1632`,
below the 1440px viewport's own bottom edge. This is a VERTICAL
scroll-position fact (the registry's own content is taller than the
viewport), unrelated to the HORIZONTAL width-demotion clip this pass
fixes — not a regression from this pass (the same rows would need the
same scroll before AND after this fix), and not investigated further
here.

1280x1024's own pre-existing F2 defect (`A_engine`'s `Connect` button
unreachable) and 1920x1080's own portrait/F4 items are unrelated to
this pass and were not re-probed (STOP items 2/3/4 above remain the
authoritative disposition).

### 11.6 Gate exit codes (literal, this pass)

- `npx vue-tsc -b` → `0`
- `npm run build` → `0`
- `npx eslint .` → `0` (0 errors, 0 warnings)
- `npx vitest run` → `0` (**3220** passed, 8 skipped — 3201 baseline +
  19 new: 8 for `resolveWidthConditionalPresence`, 10 for
  `clampTreeWidthForSideColumn`, 1 for `trackByWidget`)
- `npx vitest run tests/integration/App-boot.test.ts` (isolated) → `0`
  (5 passed)

### 11.7 STOP-and-report (this pass)

Nothing new. The three items carried over from §9 (tree-widens fork,
`A_engine` Connect defect, portrait not screenshot-verified) are
unchanged in disposition — this pass's own scope (the 2560x1440 clip,
the two test suites, the three locale entries) is fully closed with no
new forks discovered.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
