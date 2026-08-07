# ui-5-3: board restored minimized — build report

**Placement note:** requested at
`.claude/dispatch-reports/ui-5-3-restore-clamp-build.md` in the MAIN
checkout for durability. This agent is worktree-isolated and its
Write/Edit tools refuse paths outside the worktree ("Edit the worktree
copy of this file instead of the shared-checkout path") — the same
sandbox `resizer-rearchitecture-build.md` (this same repo, 2026-08-06)
hit and documented. The report is therefore committed here, in the
worktree, at the same relative path — durable once this branch is
merged/reviewed, but not yet in the main checkout. Copying it there is
a one-file `cp` from a session that isn't worktree-scoped.

Builder: dispatched build agent, isolated worktree
`/home/bork/w/omega/.claude/worktrees/agent-a0b18e4027711d895`, branch
`worktree-agent-a0b18e4027711d895`. Date: 2026-08-07.

## Root cause

The nested-splitter resizer rearch (`94eab0f1`, merged `2f3b709f`)
persists the OUTER bar's fact as `session.ui.treeControlRegionWidthPx`
— `#tree-control-wrapper`'s own width in px — and App.vue's `:style`
binding applied that number **directly**, with no bound against the
current viewport:

```
:style="store.session.ui.controlsExpanded && store.session.ui.treeControlRegionWidthPx !== undefined
  ? { flex: '0 0 auto', width: store.session.ui.treeControlRegionWidthPx + 'px' }
  : ..."
```

The only place this value is ever clamped against live geometry is
`startResizeOuter` (`useResizablePanel.ts`), and only at the START of
an interactive drag (`regionMaxWidthPx` derived from
`#split-workspace`'s `getBoundingClientRect().width` at `mousedown`).
A value that reaches the render path any other way — hydrated on a
narrower viewport than the one it was saved from, carried forward from
a pre-rearch install (though migration 65→66 strips the two pre-rearch
homes and leaves the new fields `undefined` for a clean upgrade), or
simply stale after a window resize — was rendered verbatim. Since
`#board-column` is pure `flex: 1 1 auto` (absorbs whatever the wrapper
doesn't claim), a wrapper width close to or larger than the row's
actual width leaves the board a sliver or nothing at all — "restored
minimized" until the user thinks to drag the OUTER bar back down,
exactly the commissioned symptom.

## Fix shape

**Clamp at render/derivation time, not a one-shot migration** (per the
charter's stated preference):

- `useResizablePanel.ts` now tracks `#split-workspace`'s live width via
  a `ResizeObserver` (the same imperative-escape idiom the file's own
  drag-math header already documents and the codebase's `frontend/
  CLAUDE.md` canonizes) into a `rowWidthPx` ref — measured once on
  mount, refreshed on any resize of the row, released on unmount.
- A new pure function, `sanitizeTreeControlRegionWidthPx(rawWidthPx,
  rowWidthPx)`, re-derives the SAME bound `startResizeOuter` computes
  (`rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX`, floored at
  `WRAPPER_MIN_WIDTH_PX`) and clamps the raw value through the
  existing `computeTreeControlRegionWidthPx` at zero displacement.
  `undefined` in → `undefined` out (preserves the "never dragged"
  flex-fill default).
- The composable exposes `effectiveTreeControlRegionWidthPx`, a
  `computed` combining the store's raw value with the live
  `rowWidthPx`. App.vue's `:style` binding on `#tree-control-wrapper`
  now reads this computed instead of the raw store value.

**Why clamp over migration:** a migration can only repair a SNAPSHOT
of today's known-bad persisted values, and only once, at the moment it
runs. The actual defect class is "a px width recorded against one
viewport, replayed against a different (usually narrower) one" — that
can recur on every future load (a user resizes their window, switches
monitors, or opens the app on a different machine) without any new
persisted-schema change at all. A migration has no way to reach that
case; a render-time clamp, re-evaluated against the CURRENT live
geometry on every hydrate/resize, closes it structurally and for good.
`migrations.ts`/`archived-migrations.ts` (read in full before this
work; both files' rolling-archive-discipline headers were read
end-to-end) were not touched — no schema-shape change was needed since
both fields (`treeControlRegionWidthPx`, `treePanelWidthPx`) are
already optional/additive; `CURRENT_SCHEMA_VERSION` stays at 67.

**Scope note (assumption, not silently expanded):** the OUTER bar
(board-vs-tree/control region) is the field this ticket names and the
one whose failure mode is user-visible as "the board". The INNER bar
(`treePanelWidthPx`, tree-vs-control-panel) has the identical
structural vulnerability in principle, but its failure mode (a
squeezed control panel, not a vanished board) is out of the
commissioner's stated scope ("Fix wiki issue UI #5.3" / "board
restored minimized"); left unfixed here rather than gold-plated in.
Flagging this as a natural, low-cost follow-up rather than silently
folding it in.

## Files touched

- `frontend/src/composables/chrome/useResizablePanel.ts` — added
  `sanitizeTreeControlRegionWidthPx` (pure), the ResizeObserver-backed
  `rowWidthPx` tracking, and the `effectiveTreeControlRegionWidthPx`
  computed; composable now returns it alongside `startResizeInner` /
  `startResizeOuter`.
- `frontend/src/App.vue` — `#tree-control-wrapper`'s `:style` binding
  reads `effectiveTreeControlRegionWidthPx` instead of the raw store
  field; comment updated in place.
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` —
  extended with a `sanitizeTreeControlRegionWidthPx` describe block
  (no-DOM pure-math coverage: the bug's arithmetic documented directly,
  no-op on healthy values, `WRAPPER_MIN_WIDTH_PX` floor on garbage/
  negative input, `undefined` passthrough, the `rowWidthPx = 0`
  pre-measurement safety case, agreement with the existing drag-math
  function at zero displacement).
- `frontend/tests/integration/resizer-restore-clamp.test.ts` (new) —
  reproduces the actual hydrate path: a store snapshot (via
  `updateFromRemote`, the same entry point `SyncService` uses) carrying
  a wide-viewport `treeControlRegionWidthPx`, hydrated against a mocked
  narrow `#split-workspace` (`getBoundingClientRect` stubbed — jsdom's
  layout engine always reports zero-size boxes), asserting the board
  keeps `MIN_BOARD_PX`. Mirrors `resizer-persistence-roundtrip.test.ts`'s
  service-mock preamble and `sync-session-version.test.ts`'s established
  `withSetup(() => useResizablePanel())` pattern (both already exist and
  pass in the full suite, confirming the pattern is sound).

`frontend/FILES.md` — **not updated**: no new file was added under
`src/` (the composable and App.vue are existing, already-listed
entries; the new test file is under `tests/`, which FILES.md's own
scope note excludes — "every TypeScript and Vue source file under
`frontend/src/`").

## Per-claim evidentiary status

1. **Root cause (raw store value rendered unclamped)** — WITNESSED.
   Read `useResizablePanel.ts` and the relevant `App.vue` region in
   full before the fix; the direct `:style` binding to
   `store.session.ui.treeControlRegionWidthPx` with no render-time
   clamp is quoted above from the pre-fix source.

2. **RED: regression tests fail against the pre-fix code** — WITNESSED.
   `git stash` isolated `src/App.vue` and `src/composables/chrome/
   useResizablePanel.ts` (keeping the new/extended test files), then:

   ```
   npx vitest run tests/integration/resizer-restore-clamp.test.ts \
     tests/unit/composables/chrome/useResizablePanel.test.ts
   ```

   Observed output (excerpt):
   ```
   ❯ tests/integration/resizer-restore-clamp.test.ts (4 tests | 3 failed)
       × GREEN: effectiveTreeControlRegionWidthPx clamps the same hydrated value so the board keeps MIN_BOARD_PX
         TypeError: Cannot read properties of undefined (reading 'value')
       × a workspace that was NEVER dragged (undefined) keeps its flex-fill default — fresh installs are unaffected
       × a value already comfortably narrower than the row is left unchanged (no-op on the common/healthy case)
   ❯ tests/unit/composables/chrome/useResizablePanel.test.ts (29 tests | 7 failed)
       × GREEN: sanitizes the same stale/wide value down so the board keeps at least MIN_BOARD_PX
         TypeError: sanitizeTreeControlRegionWidthPx is not a function
       (... 5 more, all "sanitizeTreeControlRegionWidthPx is not a function")

   Test Files  2 failed (2)
        Tests  10 failed | 23 passed (33)
   ```
   `git stash pop` restored the fix before proceeding.

3. **GREEN: same regression tests pass against the fix** — WITNESSED.
   Same two files, fix restored:
   ```
   Test Files  2 passed (2)
        Tests  33 passed (33)
   ```

4. **Fresh installs unchanged** — WITNESSED. Both test files assert
   the `undefined`-in → `undefined`-out passthrough explicitly (unit:
   "undefined (never dragged) stays undefined"; integration: "a
   workspace that was NEVER dragged (undefined) keeps its flex-fill
   default — fresh installs are unaffected") and both pass. No change
   to `defaults.ts` or the migration set — `CURRENT_SCHEMA_VERSION`
   stays 67, both fields remain absent from a fresh `defaultSessionUI`
   the same as before.

5. **Full suite green** — WITNESSED.
   ```
   npm run test:run
   ```
   exit code: **0**. Output tail:
   ```
   Test Files  127 passed | 3 skipped (130)
        Tests  1612 passed | 4 skipped (1616)
   ```

6. **Build green** — WITNESSED.
   ```
   npm run build
   ```
   exit code: **0** (`vue-tsc -b && vite build`, 1118 modules
   transformed, no type errors).

7. **Lint clean on touched files** — WITNESSED.
   ```
   npx eslint src/App.vue src/composables/chrome/useResizablePanel.ts \
     tests/integration/resizer-restore-clamp.test.ts \
     tests/unit/composables/chrome/useResizablePanel.test.ts
   ```
   exit code: **0**, no output.

8. **No other call site broken by the composable's added return field**
   — WITNESSED via `grep -rn "useResizablePanel"` across `src/` and
   `tests/`: the only destructuring call site is `App.vue`'s
   `const { startResizeInner, startResizeOuter, ... }`, updated in the
   same change; `sync-session-version.test.ts` and
   `useDeferredContainerBreakpoint.test.ts` import other named exports
   only (`useResizablePanel`, `isAnyPanelResizing`) and both pass in
   the full-suite run above.

9. **Inner-bar (tree/control) analog left unfixed** — declared scope
   boundary, not a tested claim (see "Scope note" above); no test
   asserts on `treePanelWidthPx` sanitization because none was added.

## Environment note (not a claim about the fix, recorded for the
## successor)

The shared filesystem (`/dev/vdb`, mounted at `/home/bork/w`) was at
100% full at the start of this session, which aborted an initial `git
rebase` onto the local `next` tip mid-write. Recovered by clearing
`/home/bork/w/pip_cache` (a regenerable cache, 2.6G reclaimed) and
removing a handful of resulting zero-byte stray files the aborted
checkout had left under `backend/` before completing a `git reset
--hard 0d6d12f6` (safe: this worktree's branch had zero commits unique
relative to local `next`, confirmed via `git log --oneline HEAD..
0d6d12f6` / `0d6d12f6..HEAD` before resetting). No source files were
lost; this is unrelated to the ui-5-3 fix itself but is recorded here
per the "stopping is a ledgered act" / resumability convention in case
disk pressure recurs for a sibling dispatch.

## Branch / commit

- Branch: `worktree-agent-a0b18e4027711d895`
- Commit: `244f9376` — "fix(frontend): clamp hydrated
  treeControlRegionWidthPx so the board is never restored minimized
  (ui-5-3)"

## Exit codes (summary)

| Command | Exit code |
|---|---|
| `npx vitest run <two files>` (pre-fix, RED) | 1 |
| `npx vitest run <two files>` (post-fix, GREEN) | 0 |
| `npm run test:run` (full suite) | 0 |
| `npm run build` | 0 |
| `npx eslint <touched files>` | 0 |
