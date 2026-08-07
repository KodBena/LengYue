# ui-5-3: board restored minimized — independent review

**Placement note:** requested at
`.claude/dispatch-reports/ui-5-3-restore-clamp-review.md` in the MAIN
checkout; the Write tool refuses paths outside this reviewer's own
worktree, so this lands here (`.claude/worktrees/agent-aaf2744da58eaabd9/.claude/dispatch-reports/`)
instead — same fallback the builder's own report documents hitting.

Reviewer: fresh-context reviewer, isolated worktree
`/home/bork/w/omega/.claude/worktrees/agent-aaf2744da58eaabd9`.
Artifact under review: branch `worktree-agent-a0b18e4027711d895`
(worktree `/home/bork/w/omega/.claude/worktrees/agent-a0b18e4027711d895`),
fix commit `244f9376` (+ docs-only commit `234bd1be`). Posture: REFUTE —
findings below were formed by reading the diff and running the gates
myself, before opening the builder's self-report
(`.claude/dispatch-reports/ui-5-3-restore-clamp-build.md`), which was
consulted only afterward for comparison.

## Diff reviewed

```
git diff 0d6d12f6 worktree-agent-a0b18e4027711d895 -- frontend/src
 frontend/src/App.vue                                          | 18 +++-
 frontend/src/composables/chrome/useResizablePanel.ts           | 98 ++++++++++++++++++++-
```
plus the two test files (unit + integration) claimed in the commit.
`0d6d12f6` is BOTH the fix branch's parent commit and its merge-base
with `next` — i.e. this branch forked directly off `next`'s tip before
this session's later merges (interval-summary panel #445/fcaab870,
handicap affordance #446/203e1f22, board-delta overlay #448/8a6bc6e0,
Docker distribution #447/b8bb5911). Checked
`git log --oneline 0d6d12f6..next -- frontend/src/App.vue
frontend/src/composables/chrome/useResizablePanel.ts` and the
equivalent `--stat` diff: **empty on both** — none of the newly-merged
`next` commits touch either file this fix changes. **No merge/
composition risk** with the just-landed features; this is a clean
fast-forward-style delta on top of current `next`.

## Findings

### BLOCKER — `sanitizeTreeControlRegionWidthPx` does not guard against non-finite (`NaN`) persisted input, contradicting its own stated contract

The deliverable's acceptance bar is explicit: the hydrated layout must
show a usable board "regardless of what the persisted widths say
(stale, migrated, **garbage**, or from a different viewport)." The
function's own guard is only:

```ts
export function sanitizeTreeControlRegionWidthPx(
  rawWidthPx: number | undefined,
  rowWidthPx: number,
): number | undefined {
  if (rawWidthPx === undefined) return undefined;
  const maxRegionWidthPx = Math.max(
    WRAPPER_MIN_WIDTH_PX,
    Math.round(rowWidthPx - MIN_BOARD_PX - RESIZER_WIDTH_PX),
  );
  return computeTreeControlRegionWidthPx(rawWidthPx, 0, maxRegionWidthPx);
}
```

`rawWidthPx === undefined` is the only sanitized case. `NaN` is a
`number` and is not `=== undefined`, so it flows straight into
`computeTreeControlRegionWidthPx` → `computePaneWidthPx`, whose clamp
(`Math.max(lo, Math.min(next, hi))`) is NaN-poisoning: any `Math.min`/
`Math.max` call involving `NaN` returns `NaN`. **WITNESSED** — reproduced the exact
arithmetic standalone (`node -e`, same constants/logic as the source):

```
sanitizeTreeControlRegionWidthPx(NaN, 1024)       -> NaN
sanitizeTreeControlRegionWidthPx('garbage', 1024) -> NaN   (non-number persisted value, plausible after a corrupt/malformed remote blob)
sanitizeTreeControlRegionWidthPx(500, NaN)        -> NaN   (rowWidthPx side)
```

A `NaN` reaching App.vue's `:style` binding renders `width: "NaNpx"` —
CSS silently ignores an invalid length, which resolves to the
element's default sizing, i.e. the exact "board comes back minimized"
failure shape this ticket exists to close (`#tree-control-wrapper`
would fall back through `controlsExpanded` branch logic, and
`#board-column`'s flex-fill share becomes indeterminate/browser-
dependent — not the guaranteed `MIN_BOARD_PX` the acceptance criteria
promises).

This is reachable, not merely theoretical: `updateFromRemote`
(`frontend/src/store/index.ts:832`) applies a hydrated blob via
`deepMerge(store.session, migrated.session)` with **no numeric
validation** on `treeControlRegionWidthPx` — confirmed by reading the
function in full. Any prior schema-migration arithmetic bug, a
division that could hit `0/0`, or simply a hand-edited/corrupted
persistence row reaches this field unchecked; `NaN` is exactly the
"garbage" class the deliverable text names, and the reviewer's probe
brief named it explicitly ("zero/negative/NaN persisted values").

Contrast with what the fix DOES handle correctly (confirmed by both
reading and the pure-math tests): `undefined` → passthrough,
negative values → floored at `WRAPPER_MIN_WIDTH_PX` (via
`Math.min`/`Math.max`'s ordinary numeric comparison, which works fine
for negative-but-finite numbers), `rowWidthPx = 0` → floored
correctly. Only the non-finite case is unguarded.

**Compose step to close:** guard on `Number.isFinite(rawWidthPx)`
(treating a non-finite raw value the same as `undefined`, or clamping
it directly to `WRAPPER_MIN_WIDTH_PX`/board-safe default) inside
`sanitizeTreeControlRegionWidthPx`, plus a regression test asserting
`sanitizeTreeControlRegionWidthPx(NaN, 1024)` (and a non-number cast)
resolve to a finite, board-safe width rather than `NaN`. This is a
one-line production fix with a low blast radius — recommend landing it
before merge rather than as a fast-follow, since it sits exactly on
the acceptance criterion's own "garbage" clause.

### ADVISORY — window-resize-mid-drag could momentarily disagree between drag-time and render-time clamps

`startResizeOuter` captures `regionMaxWidthPx` once at `mousedown` from
`#split-workspace`'s width at that instant; `effectiveTreeControlRegionWidthPx`
re-derives its own bound from the ResizeObserver-tracked `rowWidthPx`,
which **can** update mid-drag if the browser window itself is resized
while the OUTER bar is held down (an actual `ResizeObserver` firing on
`#split-workspace`, not just a re-render). In that narrow window the
value `onMouseMoveOuter` writes (clamped against the stale
mousedown-time bound) and the value the computed renders (re-clamped
against the fresh live bound) can momentarily diverge. This is a
pre-existing category of drag-vs-live-geometry skew the codebase's own
header comments already accept for the analogous INNER-bar case
("`maxWidthPx` ... is measured once at `mousedown`, not on every
`mousemove`"), and it self-corrects on `mouseup`/next render. Not a
regression this fix introduces and not user-visible in the common
case; flagging only because the probe brief asked about it directly.
No action required to merge.

### ADVISORY — the unit-level "RED" test in `useResizablePanel.test.ts` doesn't exercise decayed behavior; only the integration RED test and the full-file revert do

`useResizablePanel.test.ts`'s own "RED (documents the bug)" case
(lines 266–272) computes `narrowRowWidthPx - staleWidePx -
RESIZER_WIDTH_PX` directly in the test body rather than calling any
pre-fix production function — it is arithmetic documentation, not a
regression probe against the old code path (there IS no old function
to call; `sanitizeTreeControlRegionWidthPx` didn't exist before this
change). The GREEN cases in the same file and the integration test's
GREEN case do genuinely exercise the new code. This is a naming/
framing nit, not a functional gap — the reviewer's own file-level
revert (see Verification below) is the load-bearing red-then-green
witness, and it fails correctly. No action required.

### No findings on: ResizeObserver lifecycle, SSR/jsdom safety, persisted-write-path integrity, or the imperative-escape pattern's four steps

- **Lifecycle**: `grep -rn "useResizablePanel"` across `src/` and
  `tests/` (excluding `*.test.ts`) shows exactly one call site
  (`App.vue`'s root `setup()`). One `onMounted` registration, one
  `onUnmounted` release (`rowObserver?.disconnect(); rowObserver =
  null;`) — matches `frontend/CLAUDE.md`'s imperative-escape pattern's
  step 4 verbatim (static element read, no high-frequency reactive
  read in the registration itself, cached geometry, matching release).
  No leak risk from repeated mount/unmount since there is only ever one
  instance.
- **SSR/jsdom safety**: guarded with `typeof ResizeObserver !==
  'undefined'` before construction; jsdom (used by the test suite) does
  not ship `ResizeObserver` natively, and the integration test
  correctly stubs `getBoundingClientRect` rather than relying on a real
  observer firing — confirmed by reading `resizer-restore-clamp.test.ts`
  in full.
- **Persisted-write path unaffected**: `onMouseMoveOuter` still writes
  the RAW (drag-time-clamped, not render-time-sanitized) value to
  `store.session.ui.treeControlRegionWidthPx` and calls `touchSession()`
  exactly as before this change — the sanitize/computed layer is
  read-only display derivation, never a second writer of the persisted
  fact (consistent with the file's own ADR-0012 "one-home-per-fact"
  discipline, which the header explicitly cites). Confirmed by reading
  `onMouseMoveOuter` unchanged in the diff.
- **Fresh installs**: `undefined` in → `undefined` out, both by
  reading the guard clause and by the passing
  "workspace that was NEVER dragged" test.

## Gates — run myself, memory-capped

All commands run from
`/home/bork/w/omega/.claude/worktrees/agent-a0b18e4027711d895/frontend`
with `nice -n 19` and `NODE_OPTIONS=--max-old-space-size=2048`
(`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` for the suite run), exit
codes checked directly (never grepped):

| Gate | Exit code | Notes |
|---|---|---|
| `npm run build` | **0** | `vue-tsc -b && vite build`, 1118 modules, no type errors |
| `npm run test:run` (full suite) | **0** | `Test Files 127 passed \| 3 skipped (130)`, `Tests 1612 passed \| 4 skipped (1616)` — matches the builder's own reported numbers |
| `npx eslint .` | **0** | no output |

## Red-then-green — witnessed independently, not from the builder's report

Reverted `frontend/src/App.vue` and
`frontend/src/composables/chrome/useResizablePanel.ts` to their
`0d6d12f6` (pre-fix, merge-base) content via `git show
0d6d12f6:<path>` (kept both new/extended test files at the fix
commit's content), then ran the two regression test files:

```
npx vitest run tests/unit/composables/chrome/useResizablePanel.test.ts \
  tests/integration/resizer-restore-clamp.test.ts
```

**RED — exit code 1.** `Test Files 2 failed (2)`, `Tests 10 failed |
23 passed (33)` — failures are `sanitizeTreeControlRegionWidthPx is
not a function` (unit) and `useResizablePanel`/`effectiveTreeControlRegionWidthPx`
lookup failures (integration), i.e. the regression tests fail for the
right reason — the sanitization surface genuinely does not exist
pre-fix, not a flaky/unrelated failure.

Restored both files to the fix commit's exact content (`git show
worktree-agent-a0b18e4027711d895:<path>`, byte-diffed against the
worktree afterward — identical), then re-ran the same two files:

**GREEN — exit code 0.** `Test Files 2 passed (2)`, `Tests 33 passed
(33)`.

The working tree was left in its original (fixed) state; both touched
files are byte-identical to the artifact branch's tip after this
review's revert/restore cycle.

## Comparison with the builder's self-report

Read `.claude/dispatch-reports/ui-5-3-restore-clamp-build.md` only
after the findings above were formed. It independently reports the
same build/test/lint exit codes and the same red-then-green shape
(via a `git stash`/`git stash pop` cycle rather than my
revert-via-`git show` approach — same effect, different mechanism). It
does **not** surface the `NaN`/non-finite-input gap above; its own
"Per-claim evidentiary status" section claims coverage for
"stale/migrated/garbage" values but the only garbage case actually
tested is negative numbers (`sanitizeTreeControlRegionWidthPx(-500,
1600)`), not non-finite ones. The self-report's "Inner-bar left
unfixed" scope note (item 9) is a reasonable, explicitly-declared scope
boundary — the ticket names "the board," not the tree/control split —
and I agree it's correctly out of scope rather than gold-plating.

## Verdict: MERGE-WITH-FIXES

The core mechanism (render-time re-derivation of the drag-time clamp,
via a pure sanitize function + ResizeObserver-cached live geometry,
imperative-escape pattern correctly applied including the release)
is sound, well-documented, composes cleanly with `next`'s current tip
(no touched-file overlap with the three just-merged features), and is
backed by a genuinely red-then-green-witnessed regression test. Build,
full suite, and lint are all green. The one BLOCKER — `NaN`/non-finite
persisted input silently defeating the sanitizer — is narrow and
cheap to close (one `Number.isFinite` guard + one test case) but
directly contradicts the deliverable's own "regardless of ... garbage"
acceptance language, so it should be closed before merge rather than
deferred.

**Required before merge:** add the `Number.isFinite` (or equivalent)
guard to `sanitizeTreeControlRegionWidthPx` in
`frontend/src/composables/chrome/useResizablePanel.ts`, with a
regression test pinning `sanitizeTreeControlRegionWidthPx(NaN, <any
finite rowWidthPx>)` (and ideally a non-number cast) to a finite,
board-safe result.
