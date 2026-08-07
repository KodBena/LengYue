# setup-palette-defects — build report

Commission row 756 (ledger slug `setup-palette-defects`): two live defects in the
setup-stones toolkit (shipped 2026-08-06, merge `cad93794`). Branch:
`bork/fix/setup-palette-defects`, based on local `next` at `9bdb771f` (the commit
named as the required base; local `next` sits ahead of `origin/next` and both the
setup-stones-toolkit merge `cad93794` and `9bdb771f` are its ancestors — confirmed
via `git merge-base --is-ancestor`).

## Defect 1 — no-op tools (WITNESSED)

**Diagnosed break.** `src/components/chrome/SetupToolPalette.vue`'s outside-click
dismiss (`onDocumentPointerDown`, present unchanged since the feature's first
commit `a90ecee9` — confirmed via `git diff a90ecee9 9bdb771f -- .../SetupToolPalette.vue`,
which shows no touch to that function across the whole toolkit's life). It listens
on `document`'s `pointerdown` in the **capture phase** so it can beat an
in-palette click handler, and treats any target NOT inside the palette's own
`rootRef` as "outside → dismiss". The board is, by construction, always outside
that root. Sequence on a real click:

1. `pointerdown` fires on the board first (browsers fire `pointerdown` before
   `click`), reaches `document`'s capture-phase listener, and — because the board
   is "outside" — `closePalette()` runs synchronously, which per
   `useSetupTools.ts`'s documented contract ALSO clears `activeTool` to `null`.
2. `click` fires on the board afterward. `BoardWidget.vue`'s `onBoardClick` calls
   `setupTools.applyToolAt(x, y)`, which now sees no tool armed, returns `false`,
   and falls through to `emit('move', x, y)` — a normal Go move, not the setup
   edit the user selected. On an already-occupied point (the common setup-editing
   case) `applyGoMove` itself no-ops, which is exactly the "clicking the board
   places NOTHING" symptom.

This was never caught because `tests/integration/useSetupTools.test.ts` (the
suite that shipped with the feature) drives `tools.applyToolAt(x, y)` directly
against the composable — it never exercises the real `pointerdown`→`click` DOM
sequence across the two sibling components, so the routing bug had no test
surface. Confirmed by checking out the *initial* toolkit merge and its
handicap-affordance and pass-support successors' diffs against `BoardWidget.vue` /
`useSetupTools.ts` / `useBoardMoveRouting.ts`: none of those later merges touched
the click-routing code at all — `BoardWidget.vue`'s `onBoardClick` guard
(`if (setupTools.applyToolAt(x, y)) return;`) has been correct since day one. The
defect is not a later merge shadowing the routing guard (the task's leading
suspect) — it is the outside-click dismiss's DOM-event-ordering bug, present
since the feature's first commit.

**Fix.** `BoardWidget.vue`'s root now carries `data-setup-tool-surface="true"`.
`SetupToolPalette.vue`'s `onDocumentPointerDown` exempts any pointerdown whose
target `.closest('[data-setup-tool-surface]')` — the board is no longer treated
as "outside" for dismiss purposes, while every other outside-click target (other
toolbar chrome, page background) still dismisses exactly as before.

**Evidentiary status: WITNESSED.** `tests/integration/setup-tool-board-click-routing.test.ts`
mounts the real `SetupToolPalette` and `BoardWidget` components attached to
`document.body` (load-bearing — `document`-level listeners never see events from
an unattached tree, so the test would false-pass without `attachTo`), arms a
tool via real clicks, dispatches a real `pointerdown` on the board root, then
drives `BoardDisplay`'s `click` emit. Verified the test is a real witness, not a
tautology: reverted both source files (`git stash`) and reran — the "tool armed +
click" test goes RED (`expected undefined to be 'B'`, i.e. the setup stone never
lands); popped the stash, reran, both tests green. Full output below.

## Defect 2 — occlusion (WITNESSED)

**Placement decision.** The palette was `position: absolute; top: 100%; right: 0`
inside `.setup-toolkit`, i.e. a floating popover anchored to the toolbar trigger
button, dropping down over whatever sits below it — the board, at the toolbar's
usual position directly above `#board-column` (`App.vue`'s `#top-nav-bar` →
`#split-workspace` → `#board-column` layout). No absolute-positioned anchor is
overlay-safe across every viewport width and board-column layout, so re-anchoring
the popover elsewhere would only relocate the occlusion.

Fix: dock it in-flow. `.setup-toolkit` (`SetupToolPalette.vue`) is now
`flex-direction: column` instead of a row — the trigger button and (when open)
the palette panel stack vertically within the component's own box, in normal
document flow. `.setup-palette` is `position: static` (no longer absolute; no
`z-index` needed since it no longer layers over anything). Opening the palette
grows `.setup-toolkit`'s own height, which grows the toolbar row it sits in
(`Toolbar.vue`'s `.toolbar` already tolerates vertical growth — the same
`flex-wrap` mechanism it uses at narrow viewports), which pushes `#board-column`
down. The palette never draws over any board pixel at any viewport width, so
every intersection stays clickable while a tool is armed — satisfying the
"entire board stays clickable" requirement unconditionally, not just at the
tested viewport.

Genre precedent: q5go/cgoban dock their setup toolstrip to the chrome, never as
a layer over the grid.

**Rejected alternatives** (named in `SetupToolPalette.vue`'s header, "Placement"
paragraph):
- Keep `position: absolute`, move the anchor point — doesn't remove the
  occlusion class, only relocates it; no anchor is safe at every width/layout.
- Dock the panel beside `#board-column` itself (an `App.vue`-level layout slot)
  — correct in spirit, but couples this leaf's open/closed UI state into the
  App-level layout grid for no gain the in-toolbar vertical growth doesn't
  already give. Rejected for locality (minimal-touch, ADR-0004): the fix stays
  inside the one component that owns the defect.
- A modal/backdrop dialog — explicitly banned by the commissioner (no
  transparent overlay backdrops) and wrong genre besides: a modal would block
  the very board clicks the tool exists to receive.

**Evidentiary status: WITNESSED for the CSS mechanism** (verified by reading the
resulting cascade: `.setup-toolkit` column layout + `.setup-palette` static
positioning removes the only `position: absolute` rule that was capable of
overlaying board content; `npm run build` and the full test suite both pass with
the change, confirming no other rule depends on the removed `position: absolute`
/ `top` / `right` / `z-index` declarations). **UNEXERCISED for a rendered
pixel-level screenshot** — no `run`/browser-driven visual capture was taken in
this session (blocker: task scope was a build dispatch with `npx eslint`/
`vitest`/`vite build` exit-code gates named as the verification surface; no
`playwright`/live-app screenshot tool was authorized per the standing rules
["no playwright"] and no live port was to be touched). The CSS-mechanism read is
the load-bearing evidence for this claim; a follow-up visual QA pass (the kind
the `ui-defect-*` dispatch reports in this same directory used) would upgrade
this to a rendered witness.

## Files touched

- `frontend/src/components/chrome/SetupToolPalette.vue` — outside-click dismiss
  exemption for `[data-setup-tool-surface]`; palette layout changed from
  absolute-popover to in-flow column dock; header comment documents both fixes
  and the rejected placement alternatives.
- `frontend/src/components/board/BoardWidget.vue` — `data-setup-tool-surface="true"`
  marker added to the board's root container, with an inline comment pointing at
  the palette-side contract.
- `frontend/tests/integration/setup-tool-board-click-routing.test.ts` (new) —
  routing-level regression guard: setup tool armed + real board click →
  `applySetup`'s effect, never a routed `move`; and the reverse (palette closed →
  ordinary `move`, never a setup stone). Falsified against the pre-fix source via
  `git stash` to confirm it is a real witness, not a tautology (see Defect 1
  evidentiary note above).

No `FILES.md` update needed — no `src/` file was created, moved, or deleted;
only two existing entries' implementations changed, no band re-tag applies (both
stay [B2]/component-layer, unchanged coupling).

## Standing-rules verification (exit codes)

Run with `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` per the standing rules. No live ports
touched, no playwright, no background processes, no git stash left applied (the
diagnostic stash/pop pair above was popped back before any other work).

- `npm run build` (`vue-tsc -b && vite build`): **exit 0**. WITNESSED —
  `✓ 1178 modules transformed`, `✓ built in 2.33s`. Pre-existing chunk-size
  warning (>500kB bundle) is unrelated to this change, present on the
  unmodified base too.
- `npm run test:run` (full suite): **exit 0**. WITNESSED — `Test Files  144
  passed | 3 skipped (147)`, `Tests  1771 passed | 4 skipped (1775)`. Includes
  the 2 new routing tests and the pre-existing `useSetupTools.test.ts` (10
  tests, unaffected — composable-level behaviour didn't change, only the DOM
  event-handling around it).
- `npx eslint .`: **exit 1**, but the 2 reported errors are in
  `src/components/SettingsTab.vue:137` (a pre-existing, unrelated `as`-cast
  justification lint), confirmed via `git blame` against base commit `9bdb771f`
  — untouched by this diff. WITNESSED clean on the files this change actually
  touches: `npx eslint src/components/chrome/SetupToolPalette.vue
  src/components/board/BoardWidget.vue tests/integration/setup-tool-board-click-routing.test.ts`
  → exit 0 (one informational "file ignored" warning on the test file, 0
  errors).

## Branch / commit

Branch: `bork/fix/setup-palette-defects` (worktree
`/home/bork/w/omega/.claude/worktrees/agent-a6dcecafa224fc28b`).
Base: local `next` @ `9bdb771f` (fast-forwarded from the worktree's stale base
per the task's instruction; `origin/next` was, at session start, an *ancestor*
of local `next`, not the other way round — used local `next` since it is the
more-advanced ref actually containing the required commit and the setup-stones
toolkit).
