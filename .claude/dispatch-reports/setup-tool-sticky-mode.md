# setup-tool-sticky-mode — build report

Commission (ledger row 914, verbatim): "you can only click on the board,
clicking anywhere else collapses the tool. That violates ADR-0019 (e.g.
cgoban, q5go)." The prior fix (`setup-palette-defects`, commission row 756)
exempted only `BoardWidget.vue`'s root (`data-setup-tool-surface`) from
`SetupToolPalette.vue`'s document-level outside-click dismiss; every other
click (game tree, control panel, toolbar) still disarmed the tool. Ruling: a
selected setup tool is a STICKY MODE per the genre exemplars (cgoban, q5go) —
it persists until the user explicitly ends it.

Branch: `bork/fix/setup-tool-sticky-mode`, based on local `next` /
`origin/next` (`f906ae0d`) — this worktree's HEAD was stale (`3378806f`) at
session start; fast-forwarded to the shared repo's `next` ref, then confirmed
(`git merge-base --is-ancestor next HEAD`) that HEAD already contained
everything on both local `next` and `origin/next` before branching off.

## Required behavior — claim by claim

**1. Delete the outside-click dismiss mechanism entirely.** WITNESSED.
`SetupToolPalette.vue`'s `onDocumentPointerDown` function, its
`document.addEventListener('pointerdown', ..., true)` /
`removeEventListener` calls (in the `watch(paletteOpen, ...)` handler and
`onBeforeUnmount`), and `BoardWidget.vue`'s `data-setup-tool-surface="true"`
marker (plus its explanatory comment) are all removed.
`grep -rn "data-setup-tool-surface\|onDocumentPointerDown"` over `src/`
confirms zero remaining production references (the only surviving mentions
are in `SetupToolPalette.vue`'s own header comment, narrating the removal for
history, and in `LocalePicker.vue`, an unrelated component with its own
independent `onDocumentPointerDown`).

**2. Explicit ends of the mode only.** WITNESSED — all four verified by
direct test:
  - Re-clicking the armed tool's own button toggles it off
    (`useSetupTools.selectTool` — unchanged, already correct).
  - Selecting a different tool switches (`selectTool` — unchanged).
  - Closing the palette via its own toolbar button ends the mode
    (`togglePalette` — unchanged, already deselects on close).
  - Escape disarms, added/verified: `SetupToolPalette.vue`'s Escape handler
    survives (it already existed) but is now gated on
    `useModalKeyboard`'s exported `anyModalOpen` — `if (anyModalOpen.value)
    return;` before calling `closePalette()`. Verified the modal-priority
    case explicitly: a real `ResetAllKeybindingsModal` opened while a tool is
    armed, Escape dispatched on `document` (so it bubbles through both
    `SetupToolPalette`'s `document`-scoped listener and
    `useModalKeyboard`'s `window`-scoped listener, in that real order) closes
    the modal (`open()` resolves `false`) and leaves the tool armed —
    "modal wins, mode stays," exactly as specified.

**3. Visibly armed while sticky.** WITNESSED, no new chrome needed.
`useSetupTools`'s own state machine enforces the invariant `activeTool !==
null ⟹ paletteOpen === true` at every mutation site (`selectTool`,
`togglePalette`, `closePalette` all either set both or neither) — a tool can
never be armed while the palette is closed, so the palette's existing
`.tool-armed` highlight on `.setup-trigger` (and the `.active` highlight on
the selected `.tool-btn`) is always on-screen whenever the mode is armed;
verified by test (both `activeTool.value` and the `.tool-armed` class
checked together after arming and after an outside click). Checked whether
the palette itself could scroll out of view: `SetupToolPalette` lives inside
`Toolbar.vue`, which lives in `App.vue`'s `.top-nav-bar`
(`flex-shrink: 0`, outside `#split-workspace`'s scrollable content), so the
toolbar — and the armed-tool highlight inside it — is never scrolled away;
only the content panels below it scroll. No board-cursor or other new
affordance was needed or added.

**4. Board clicks still apply the tool.** WITNESSED, no regression. The two
pre-existing routing tests (armed tool + board click → `applySetup`'s
effect, never a routed `move`; palette-closed → ordinary `move`) both still
pass unchanged.

## Tests

`frontend/tests/integration/setup-tool-board-click-routing.test.ts` — kept
the two pre-existing routing tests (relabeled `(d)`) and added a new `sticky
mode (setup-tool-sticky-mode, commission row 914)` describe block:

- **(a)** a real `pointerdown`+`click` on a plain DOM element standing in for
  "a tree node or a panel button" (outside both the palette and the board)
  leaves `activeTool`/`paletteOpen` unchanged AND the outside element's own
  click handler fires. **Red-without/green-with, WITNESSED**: reverted both
  source files to their pre-fix (`HEAD`) content via scratch-directory copies
  (no `git stash`), reran — this test failed with `expected null to be
  'stone-black'` (the outside click disarmed the tool, exactly the
  commissioner's complaint); restored the fix, reran — green.
- **(b)** two Escape tests: plain Escape (no modal) disarms; the modal-open
  case (`ResetAllKeybindingsModal` open) — Escape closes the modal, tool
  stays armed. **Red-without/green-with, WITNESSED** for the modal case in
  the same revert pass: against pre-fix source (no `anyModalOpen` gate at
  all) this test also failed with `expected null to be 'stone-black'` (the
  un-gated Escape handler disarmed the tool even though a modal had priority);
  green after restoring the fix.
- **(c)** toggle-off, switch, and palette-close-via-toolbar-button each end
  the mode — three small direct tests against `useSetupTools()`'s exported
  refs.
- **(d)** the two pre-existing board-click-routing tests, unchanged.

Full revert-and-rerun transcript (both failing assertions, `expected null to
be 'stone-black'`) is in this session's tool history; not reproduced here
verbatim for space, but the failure text above is copied from the actual
observed output, not paraphrased.

## Standing-rules verification (exit codes)

Run with `nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` per the standing rules. No live
ports touched (4173/5173/5174/8764/19080-19082 untouched), no `git stash`
(scratch copies in `/tmp/claude-1000/.../scratchpad/` used for the
red-without check instead), no sub-agents spawned, `useLearnPath.ts`/
learn-path files untouched (verified via `git diff --stat` — only the three
files below changed).

- `npx vue-tsc --noEmit`: **exit 0**. WITNESSED, no output (clean).
- `npx vitest run` (full suite, `--silent=true`): **exit 0**. WITNESSED —
  `Test Files  154 passed | 3 skipped (157)`, `Tests  1858 passed | 4 skipped
  (1862)`. No regressions; the sticky-mode suite's 8 tests (2 new-describe-
  block failures on the reverted source, both fixed) are included in the
  154/1858 passing counts.

## Files touched

- `frontend/src/components/chrome/SetupToolPalette.vue` — deleted the
  outside-click dismiss (`onDocumentPointerDown` + its listener
  registration); Escape handler kept, gated on `anyModalOpen`; header
  comment rewritten to document the sticky-mode contract and the ADR-0019
  rationale for the deletion.
- `frontend/src/components/board/BoardWidget.vue` — removed the
  `data-setup-tool-surface` marker and its explanatory comment (dead code:
  nothing else in `src/` or `tests/` referenced it after the palette-side
  removal — confirmed by grep before deleting).
- `frontend/tests/integration/setup-tool-board-click-routing.test.ts` —
  rewrote the header to describe both the original no-op-defect arc and the
  new sticky-mode arc; added the `sticky mode` describe block covering (a),
  (b) including the modal-priority case, and (c); kept both pre-existing (d)
  tests.

No `FILES.md` update needed — no file created, moved, or deleted; no band
re-tag applies.

## Deviations from the brief

- No `.claude/dispatch-reports/setup-palette-defects-review.md` exists (only
  a `-build.md` report was found for the prior arc) — read what was
  available; noted here per the umbrella's documentation-consumption
  discipline rather than silently treating the brief's file list as
  satisfied.
- `frontend/node_modules` was absent in this worktree at session start
  (fresh worktree, never had `npm install` run); ran `npm ci` before any
  gate command. Not a scope deviation, but noted since it wasn't itself named
  in the brief.

## Branch / commit

Branch: `bork/fix/setup-tool-sticky-mode`.
Base: `next`/`origin/next` @ `f906ae0d` (this worktree's HEAD, confirmed
already containing everything on both refs before branching).
