# ui-fix-56 — resizer post-saturation shrink + control-panel-disabled centering

FIX dispatch for `.claude/dispatch-reports/ui-defects-investigation.md`'s
Defect 5 ("control-panel resizer can't reach the right edge") and Defect 6
("disabling the control panel leaves dead space instead of centering the
board"), deliberately paired per that report's own partition table (same
`App.vue` region, same underlying gap: freed horizontal row space in
`#split-workspace` is never reflected visually).

## Docs read (per frontend/CLAUDE.md's read-end-to-end discipline)

- `frontend/CLAUDE.md` — read in full.
- `frontend/tests/CLAUDE.md` — read in full.
- `.claude/dispatch-reports/ui-defects-investigation.md` — read in full;
  Defect 5 and Defect 6 sections are this dispatch's spec.
- `frontend/src/composables/chrome/useResizablePanel.ts` — read in full
  before editing (required by the dispatch brief).
- The relevant slice of `frontend/src/App.vue` (script setup imports,
  `#split-workspace`/`#board-column`/`#vue-tree-panel`/`#control-panel`
  template + style) — read in full.
- `frontend/src/store/schema.ts` around `UISession` — read to check for an
  existing store field before inventing new persisted state (found
  `controlPanelWidth: number`, unused elsewhere except `defaults.ts` and one
  migration-roundtrip fixture; deliberately NOT reused — see "Decisions"
  below).

## What changed

- `frontend/src/composables/chrome/useResizablePanel.ts` — the drag math.
- `frontend/src/App.vue` — wiring: `#split-workspace`'s conditional
  `justify-content: center`, `#control-panel`'s conditional explicit width,
  and the shared `CONTROL_PANEL_MIN_WIDTH_PX` constant (replacing two
  independent `'220px'` literals with one source).

## Defect 6 — centering when the control panel is disabled

`#split-workspace` now binds `justify-content: center` (via a
`splitWorkspaceCentered` computed in `App.vue`'s `<script setup>`) whenever
`!store.session.ui.controlsExpanded`. Below that, unchanged (`flex-start`).

**`!treeExpanded` does NOT participate**, by design — decided-and-justified
per the dispatch brief's explicit ask:

`#vue-tree-panel` is `width: 140px; flex-shrink: 0`, a **fixed-size** flex
sibling, never a `flex-grow` participant. With the control panel visible,
toggling the tree off doesn't strand any space — `#control-panel`'s
`flex: 1 1 0` (the row's only growing element) simply claims the freed
140px immediately, the same way it already claims any other freed space.
There is no dead-space bug in that combination to fix. The dead-space bug
is entirely a consequence of `#control-panel` — the row's one
flex-grow:1 element — being narrower than its natural share of the row;
`!controlsExpanded` (removes it outright) and the Defect 5 shrink case
below (narrows it below its natural share) are the two ways that happens,
and both are covered by the single `splitWorkspaceCentered` condition.
Adding `!treeExpanded` to the condition would be a no-op in every state
that reaches it (the only way `!treeExpanded` changes anything is via the
already-covered flex-fill behavior of `#control-panel`), so it was left
out rather than added defensively.

## Defect 5 — resizer past board-saturation

Per the report's option (b) (orchestrator-adjudicated): dragging right past
the board's height-driven saturation point now continues to shrink
`#control-panel`'s explicit width instead of no-op'ing, composing with
Defect 6's centering mechanism so the freed strip becomes margin split
symmetrically around the maxed board — which is also what makes the
previously-frozen resizer bar visibly track the cursor again: it sits
between the tree panel and the control panel inside the row `justify-
content: center` now centers as a block, so as that block's total width
shrinks (control panel narrowing), centering pushes the whole block —
resizer included — rightward.

**Mechanism** (see the composable's own header comment for the full
write-up): `useResizablePanel.ts` measures, once at drag start (not on
every `mousemove` — a hot-path `getBoundingClientRect` read would force a
synchronous reflow, per the imperative-escape discipline in
`frontend/CLAUDE.md`):

- `boardColumnSaturationPx` — the column's rendered height, i.e. the
  aspect-ratio-driven width ceiling.
- `rowWidthAtDragStartPx` / `otherFixedWidthAtDragStartPx` — `#split-
  workspace`'s total width and everything in it besides the board column
  and the control panel (tree panel + resizer + borders), so the control
  panel's "natural" (pre-shrink) share can be derived without further DOM
  reads during the drag.

Two pure functions do the actual math, exported specifically so they're
unit-testable without a DOM: `computeBoardTargetPx` (unchanged logic,
extracted) and `computeControlPanelWidthPx` (new) — the latter returns
`undefined` for every `targetPx <= boardColumnSaturationPx`, which is the
"byte-identical below saturation" requirement: `#control-panel`'s
`:style` binding falls back to the original `{ flex: '1 1 0', minWidth:
CONTROL_PANEL_MIN_WIDTH_PX + 'px' }` whenever the composable returns
`undefined`, so nothing about pre-saturation drag behavior changed.

Above saturation, `computeControlPanelWidthPx` returns
`max(CONTROL_PANEL_MIN_WIDTH_PX, naturalPanelWidthPx - overshootPx)` —
the panel shrinks 1:1 with further drag, floored at the same 220px tab-
strip-legibility constraint that already gated its `min-width` (now a
single exported constant, `CONTROL_PANEL_MIN_WIDTH_PX`, instead of two
independent `'220px'` literals in `App.vue`).

## Decisions (not pre-ledgered — see caveat below)

- **Did not reuse the existing but unwired `UISession.controlPanelWidth:
  number`** schema field (default `340`, referenced only in
  `defaults.ts` and one migration-roundtrip test fixture; grepped, no
  other consumer). Its non-optional `number` type can't represent "not
  currently shrunk" without a sentinel, and repurposing an unexplained
  pre-existing field for a different semantic than whatever it was
  originally scaffolded for seemed riskier than adding a small, clearly-
  scoped local ref. Flagging this rather than silently walking past it —
  someone should eventually decide what `controlPanelWidth` was for and
  either wire it up on its own terms or remove it; out of scope here.
- **`controlPanelWidthPx` is not persisted to the store.** It's a derived
  render hint over runtime DOM geometry (the row's available width is
  itself a fact about the current window, not durable user intent the way
  `boardSquareMaxWidthPx` is), so it resets to `undefined` (default flex
  fill) on reload until the user drags again. `boardSquareMaxWidthPx`
  itself is untouched — still persisted, still the same clamp range.

## Tests

`frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` — Tier-1
pure-logic tests (no DOM) against the two exported pure functions:

- `computeBoardTargetPx` — clamp behavior (unchanged logic).
- `computeControlPanelWidthPx` — red leg: `undefined` below/at saturation
  and when drag-start geometry is unavailable (the pre-fix "frozen, no
  observable change" behavior, preserved). Green leg: shrinks by the
  overshoot past saturation, produces a distinct value on every further px
  of drag (the reported symptom — previously frozen — now moves), floors
  at `CONTROL_PANEL_MIN_WIDTH_PX`, and reverts to `undefined` when the drag
  returns below saturation in the same gesture.

10/10 new tests pass; full suite unaffected (see gate tails below).

**Layout-centering / live DOM**: `.claude/dispatch-reports/ui-fix-56-probe.mjs`
— a playwright-core rect-probe mirroring the investigation's own witness
method (synthetic mouse drag + `getBoundingClientRect` comparison),
asserting:

1. Defect 6: `#board-column.left` shifts rightward after toggling
   `controlsExpanded` off.
2. Defect 5: `.panel-resizer`'s right edge moves after a past-saturation
   drag (previously frozen).
3. Defect 5: `#control-panel`'s width shrinks after a past-saturation
   drag.

**Unlike the sibling dispatches' documented caveat** (port 4173 on this
host serving a stale pre-fix preview build), this probe was actually run
against a **freshly rebuilt** `frontend/dist` (`npm run build` against the
fixed source) served via `vite preview --port 4599`, using
`--executable /usr/bin/chromium` (the system browser — no
`playwright install`-managed binary was present on this host; see the
script's own header). **Result: WITNESSED, all three checks PASS.**

```
PASS  Defect 6: #board-column.left shifts rightward once controlsExpanded flips false
PASS  Defect 5: resizer bar right-edge moves after a past-saturation drag (previously frozen)
PASS  Defect 5: #control-panel width shrinks after a past-saturation drag

ALL PASS
```

## Gates

- `npm run build` (`vue-tsc -b && vite build`) — clean, no type errors.
  (`node_modules` was absent in this worktree at session start; `npm
  install` was run first — 333 packages, no errors.)
- `npx eslint .` — clean, zero output.
- `npm run test:run` — `Test Files 82 passed | 3 skipped (85)`, `Tests 1111
  passed | 4 skipped (1115)`, no hang (completed in ~89s; the installed
  `vite@8.2.0` is above the `≥8.0.12 hangs vitest teardown` threshold noted
  elsewhere, but this run exited cleanly on its own — not via a timeout
  kill).

## Files touched

- `frontend/src/composables/chrome/useResizablePanel.ts`
- `frontend/src/App.vue`
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` (new)
- `.claude/dispatch-reports/ui-fix-56-probe.mjs` (new)
- `.claude/dispatch-reports/ui-fix-56-resizer-centering.md` (this file)

## Ledger caveat

This worktree-isolated session did not run `./autoharn led` commands
(commission/decomposition/assumption/decision rows) — the dispatch brief
scoped this session to source edits + tests + gates + this report, with no
ledger tooling invoked or verified reachable from this worktree. The
"Decisions" section above records the load-bearing calls in prose per the
umbrella discipline's spirit; a parent session with ledger access should
transcribe them as real `decision`/`assumption` rows if that discipline
applies to this dispatch's tracking.
