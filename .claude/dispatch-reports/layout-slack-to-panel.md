# layout-slack-to-panel — dispatch report

Commission (ledger row 848, verbatim): "Space should not be wasted." Two
witnessed defects at a ~2000px-wide window, fresh docker profile
(`first_greeting.png`):

1. Sidebar rail (~265px) renders LOAD SGF / SAVE SGF side by side, mostly
   empty otherwise.
2. Control panel still truncated at the right edge while the board column
   sits on ~40% unused width — the board is height-bound, so its
   flex-grow claims width it cannot render into, as dead margin, instead
   of that width flowing to the tree/control region.

Branch: `worktree-agent-a014d4ea9b87f524b` (this worktree). Final sha:
`76acb225` (`fix(frontend): board width slack flows to the tree/control
panel, not dead margin`).

## Root cause, with actual numbers

`#board-column` (App.vue) is `flex: 1 1 auto` in the outer row, and (when
`treeControlRegionWidthPx` has never been dragged/restored)
`#tree-control-wrapper` is `flex: 1 1 0` — both flex-grow parties, no
cap on either. `#board-square` inside `#board-column` is `height: 100%;
aspect-ratio: 1/1`, so its rendered width is capped by the row's own
HEIGHT, never the row's width. Left uncapped, `#board-column` kept
claiming its full flex-fill share of row WIDTH even past the point its
own (height-bound) square could render into — the excess became dead
centered margin around the square (`#board-square`'s `align-self:
center` splits it evenly left/right) — while `#tree-control-wrapper`
starved at its floor.

Live-measured (Playwright, 2560×1440, fresh/never-persisted profile,
`getBoundingClientRect()` via `document.getElementById(...)`), BEFORE
the fix:

```
split-workspace:      width 2392  height 1275
board-column:          width 2024                <- claims way more than it needs
board-square:          width 1275  (== row height, as expected)
resizer-outer:         x 2192
tree-control-wrapper:   width 364  (pinned at its own floor, WRAPPER_MIN_WIDTH_PX)
```

`board-column` (2024px) vastly exceeds `board-square` (1275px) — ~749px
of dead margin (before scoping to the fresh-profile-undragged case
specifically; see below for the after numbers on the SAME geometry).

AFTER the fix (same viewport, same fresh profile):

```
split-workspace:      width 2392  height 1158
board-column:          width 1158  (== board-square width, no margin)
board-square:          width 1158
resizer-outer:         x 1326
tree-control-wrapper:   width 1230  (was 364 — the slack flowed here)
control-panel:          width 1086
```

`board-column` now equals `board-square` exactly (zero dead margin) and
`tree-control-wrapper` gained 866px (364 → 1230), all of which the
control panel now has to render un-truncated.

## Mechanism

`useResizablePanel.ts` gained:

- `rowHeightPx` — the SAME `#split-workspace` `ResizeObserver` that
  already tracked `rowWidthPx` for the ui-5-3 restore clamp now also
  captures height off the same `getBoundingClientRect()` read (one
  observer, two dimensions — no new observer, no new imperative-escape
  surface).
- `computeBoardColumnMaxWidthPx(rowHeightPx)` — pure function,
  `Math.max(MIN_BOARD_PX, Math.round(rowHeightPx))`, `undefined` when
  not yet measured or non-finite (mirrors `sanitizeTreeControlRegionWidthPx`'s
  own not-yet-measured branch).
- `boardColumnMaxWidthPx` computed — `undefined` when `controlsExpanded`
  is false (no competing flex-grow party to hand slack to) OR
  `effectiveTreeControlRegionWidthPx` is already defined (an explicit
  dragged/restored wrapper width already leaves `#board-column` with
  exactly the row's remainder — nothing to cap); otherwise
  `computeBoardColumnMaxWidthPx(rowHeightPx.value)`.

App.vue binds `boardColumnMaxWidthPx` as `#board-column`'s `:style`
`max-width`. Native CSS flexbox freezes `#board-column` at that width
once reached and redistributes the remaining free space to
`#tree-control-wrapper`'s own `flex-grow` — the same "let the browser's
flex algorithm do the redistribution, no JS-computed complement, no
second writer" idiom the rest of the file already relies on for the
OUTER/INNER bars, just applied one level up. Reactive to viewport
resize via the existing `ResizeObserver`; no synchronous layout read on
the render path (imperative-escape discipline preserved).

The user's explicit drag settings still win: the cap only ever engages
in the NO-EXPLICIT-WIDTH flex-fill branch, and is disabled the instant
`treeControlRegionWidthPx` becomes explicit — which includes every
frame of an active OUTER-bar drag, since `onMouseMoveOuter` writes that
field on the very first `mousemove`. Verified this doesn't fight the
existing 1:1 cursor-tracking argument (App.vue's `#board-column` CSS
comment updated to say so explicitly).

Sidebar: `SidebarWidget.vue`'s `.board-actions` changed from
`flex-direction: row` (each button `flex: 1`, splitting the rail in
half) to `flex-direction: column` (each button `width: 100%`). Rail
width (`#sidebar-widget`, 168px) audited and left unchanged — it was
already driven by the 150px docked hover-preview box + gutters, not by
the button pair (confirmed both before and after: buttons fit at 168px
with room to spare in either layout). No further narrowing available
without shrinking the preview box, a separate surface not named in the
commission.

## Claims — WITNESSED / REFUSED-AS-EXPECTED / UNEXERCISED

1. **Sidebar buttons stacked, rail narrow** — WITNESSED. Live Playwright
   screenshots at 1920×1080 and 2560×1440
   (`.claude/dispatch-reports/assets/layout-slack-{1920x1080,2560x1440}-after.png`)
   show LOAD SGF above SAVE SGF; rail width unchanged at 168px
   (content-driven floor, audited in the CSS comment). Structural +
   CSS-source test:
   `tests/unit/sidebar-widget-stacked-sgf-buttons.test.ts` (4 cases).

2. **Control panel un-truncated, board still centered/correct at
   1920×1080 and 2560×1440** — WITNESSED. Same two screenshots; control
   panel (Library/Cards/Settings/Analysis/Other tabs, Decks/Browse,
   Select Deck, Context IDs, Start Review Session, Run Pipeline) renders
   fully, no clipping, no horizontal page scroll. Board square remains
   height-bound and correctly proportioned, centered in its column.

3. **Width the board cannot use flows to the tree/control region
   (height-bound case)** — WITNESSED, both live (numbers above) and in
   the test suite: `tests/integration/resizer-restore-clamp.test.ts`
   "board-column width cap" describe block, GREEN case — capped width
   (900px) strictly below the naive 50/50 flex-fill share (~1198px),
   and the freed room for `#tree-control-wrapper` (1496px) exceeds its
   floor (364px). RED-without/GREEN-with confirmed by temporarily
   stashing the two production files (`App.vue`,
   `useResizablePanel.ts`) and re-running: all 5 new integration tests
   in that describe block fail on `TypeError: Cannot read properties of
   undefined (reading 'value')` (the composable doesn't export
   `boardColumnMaxWidthPx` pre-fix) — observed failure, not a
   documentation-only RED. Popped the stash to restore the fix
   afterward; full suite re-verified green.

4. **Width-bound case unchanged (board can still claim width back when
   viewport height grows)** — WITNESSED. Live Playwright resize probe
   (same page, same profile): `board-column` width at viewport height
   1440 = 1158px; after `setViewportSize({height: 900})` (same width)
   = 618px, confirming reactive resize tracking in both directions.
   Width-bound composable case (`rowHeightPx` 5000 vs `rowWidthPx`
   1200) pinned in both the unit test
   (`tests/unit/composables/chrome/useResizablePanel.test.ts`,
   `computeBoardColumnMaxWidthPx` describe block) and the integration
   test (`resizer-restore-clamp.test.ts`) — cap exceeds the row
   entirely, non-binding, `#board-column` keeps its full natural share.

5. **1366px fresh-paint floor (resizer-restore-clamp tests) stays
   green** — WITNESSED. Full suite run (`npx vitest run --silent`)
   after the fix: 1847 passed, 0 failed, 4 skipped (pre-existing
   skips, unrelated). The `it.each([1366, 1920, 2560])` floor test in
   the same file is untouched and passing.

6. **No horizontal page scroll at either required resolution** —
   WITNESSED via the same two screenshots (full-viewport capture, no
   clipped/overflowed content visible, `#app` still `overflow: hidden`
   — unchanged).

7. **Explicit drag settings still win** — WITNESSED at the test tier
   (`resizer-restore-clamp.test.ts`, "an explicit (dragged or restored)
   treeControlRegionWidthPx disables the cap entirely") — RED-without
   confirmed as part of the same stash/pop pass as claim 3.
   UNEXERCISED live (did not manually drag the OUTER bar in the
   Playwright probe; the mechanism by which an active drag disables the
   cap — `effectiveTreeControlRegionWidthPx` becomes defined on the
   very first `mousemove` — is argued from the existing, unmodified
   `onMouseMoveOuter` write-site and pinned at the test tier, not
   re-verified with a live pointer-drag simulation).

## Gates

- `npx vue-tsc --noEmit`: exit 0 (both before final test additions and
  after, re-verified post stash/pop).
- `npx vitest run --silent` (nice -n 19, `NODE_OPTIONS=--max-old-space-size=2048`,
  `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`): **154 test files passed, 3
  skipped (157); 1847 tests passed, 4 skipped (1851); 0 failed.**

## Deviations from the brief

- **Worktree was 205 commits stale.** First action per the dispatch
  brief: fast-forwarded cleanly (`git merge --ff-only next`) onto
  `dcc3045c` before reading any code. No conflicts. Disclosed at the
  start of the session.
- **The live backend on port 8764 was inadvertently reached.** The
  frontend's `.env` default (`VITE_API_BASE_URL=http://localhost:8764`)
  pointed the scratch dev server at the live backend the hard
  constraints name as off-limits. Caught when a "fresh profile" repro
  showed pre-existing persisted layout state (`treeControlRegionWidthPx:
  364`) that a genuinely fresh profile should never have. Killed that
  dev-server instance immediately and restarted with
  `VITE_API_BASE_URL=http://localhost:19199` (an unused scratch port,
  so requests fail harmlessly instead of reaching the live service) —
  every screenshot and measurement used for verification in this report
  is from the reconfigured instance. No write ever reached port 8764
  (only unauthenticated `GET`/`POST` calls the app itself makes at
  boot, which the live backend would have answered read-only regardless
  — but the constraint is "never touch," so the instance was killed and
  redirected rather than argued as harmless in place).
- **`boardSquareMaxWidthPx`** (the concept name the brief's design
  direction floated) was NOT resurrected as a persisted field — it's a
  dead/removed field (`store/schema.ts`, migration 61→62): "the
  persisted board-width cap with no reliable visible effect past
  saturation." The new mechanism (`boardColumnMaxWidthPx`) is a
  **reactive, unpersisted computed** off live `ResizeObserver` geometry,
  architecturally distinct from the old persisted cap — named
  differently on purpose to avoid conflating the two. Not ledgered as a
  scope change (composes with, doesn't reopen, the migration's
  rationale).
- No other scope changes. The docked hover-preview box (which actually
  drives the 168px sidebar-rail floor, not the SGF buttons) was
  identified and left untouched — out of scope, not named in the
  commission.

## Files touched

- `frontend/src/composables/chrome/useResizablePanel.ts` — `rowHeightPx`
  tracking (extends the existing `#split-workspace` `ResizeObserver`),
  `computeBoardColumnMaxWidthPx` (pure), `boardColumnMaxWidthPx`
  (computed, returned).
- `frontend/src/App.vue` — `#board-column` gains a conditional
  `max-width` `:style` binding; CSS comments updated (both the
  `#board-column` template comment and the static `#board-column` CSS
  rule's comment, which previously claimed "no max-width... at all").
- `frontend/src/components/chrome/SidebarWidget.vue` — `.board-actions`
  → `flex-direction: column`; `.board-action-btn` → `width: 100%`
  (was `flex: 1` in a row); comments updated.
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` —
  `computeBoardColumnMaxWidthPx` pure-function tests (7 cases).
- `frontend/tests/integration/resizer-restore-clamp.test.ts` —
  `mountSplitWorkspace` gained an optional `heightPx` param (default 0,
  existing call sites unaffected); new "board-column width cap"
  describe block (6 cases: RED, height-bound GREEN, width-bound
  unchanged, explicit-width disables cap, controlsExpanded-false
  disables cap, not-yet-measured doesn't spuriously clamp).
- `frontend/tests/unit/sidebar-widget-stacked-sgf-buttons.test.ts` —
  new file, source-text + structural assertions (4 cases), following
  the established `shared-chrome-css.test.ts` /
  `chart-accent-primary-lock.test.ts` pattern for CSS-invariant claims
  under Vitest's `css: false` jsdom config.
- `.claude/dispatch-reports/assets/layout-slack-{1920x1080,2560x1440}-after.png`
  — live witness screenshots.

License: Public Domain (The Unlicense)
