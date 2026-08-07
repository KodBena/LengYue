# Fresh-context review: delta-panel three-mode view cycle

Branch `bork/feat/delta-view-cycle`, commit `fa533652`, base `next` (50f9ee6c).
Worktree: `.claude/worktrees/delta-view-cycle`. Builder report read LAST, per
instruction; all gates and structural claims below were independently
re-derived from the diff and re-run before the report was opened.

## Verdict: ACCEPT-WITH-NITS

The core structural claim holds under an actual counterexample search, the
hard move-click-semantics constraint is untouched, the persistence idiom is
followed exactly, the migration is clean against current `next`, and all
three gates are independently WITNESSED green in the worktree. One process
violation (item 5 below) is a real finding but does not invalidate
correctness — it downgrades the evidentiary weight of the builder's own
screenshots, which I re-derived by other means.

## Findings

### 1. Structural claim (obligation 1) — WITNESSED, holds

Read `useDeltaViewMode.ts`, `MergedDeltaPanel.vue` in full, and
`BaseChart.vue`'s click/hover wiring (lines ~560–580).

- `seriesForMode(black, white, mode)` is genuinely the single projection:
  `mergedSeries` (the chart-series build, line ~134) and `colorAt` (the
  click-dispatch function, line ~299) both read exclusively through
  `effectiveBlackSeries` / `effectiveWhiteSeries`, which are both
  `computed(() => seriesForMode(...))`. Neither function reads
  `blackSeries.value` / `whiteSeries.value` directly anymore — confirmed by
  grep, no stray direct reference survives in the diff.
- Counterexample search across every path that could resolve a click:
  - **Click/hover dispatch**: `BaseChart.vue`'s `zr.on('click'/'mousemove')`
    handlers do pure pixel→data coordinate conversion
    (`convertFromPixel`) and emit `(rawIdx, y)` — they never touch series
    data directly. The only place series data is consulted for dispatch is
    `colorAt`, which reads the mode-filtered computeds. In `black` mode,
    `effectiveWhiteSeries.value` is `[]`; the `for (const s of series)` loop
    is a no-op; `colorAt` returns `null` for any candidate resolving to
    white. This is structural absence, not a post-hoc rejection.
  - **Legend**: `globalLegendState` (BaseChart.vue) is a name-keyed
    visibility toggle over whatever series actually exist in the ECharts
    option. In a per-colour mode the hidden colour's series never enters
    `mergedSeries`'s output, so its legend entry doesn't exist to toggle —
    confirmed both by code reading and by the builder's screenshots
    (`03-mode-black.png`: "White Delta" legend entry absent, not greyed).
  - **Tooltip**: reads off the same `mergedSeries` array via ECharts'
    tooltip formatter — same structural absence.
  - **dataZoom**: only affects the visible x-range, not which series exist;
    no interaction with click resolution.
  - **Keyboard nav**: grepped `BaseChart.vue`, `MergedDeltaPanel.vue`,
    `AnalysisChartPanel.vue` for `keydown`/`keyup`/`Arrow*` — none exist.
    The chart itself has no keyboard-driven move-selection path; only the
    new mode-cycle `<button>` is keyboard-reachable (native Tab/Enter/Space,
    no custom handler to audit).
  - No counterexample found. The claim as stated in the spec is correct.

### 2. Shared-mode identity — WITNESSED, holds

`seriesForMode` returns `black` / `white` **by reference** (not a copy) in
`shared` mode — verified by reading the function body directly:
`{ black: mode === 'white' ? [] : black, white: mode === 'black' ? [] : white }`.
For `mode === 'shared'` both ternaries fall through to the identity, so
`effectiveBlackSeries.value === blackSeries.value` by reference. The
builder's own Tier-1 test asserts this with `toBe` (not `toEqual`), which is
the correct assertion for this property (I re-ran this suite, see gates
below — green). This is a stronger guarantee than diffing a built option
payload would be, and I did not find a reason to doubt it structurally.

### 3. Move-click semantics — WITNESSED, unchanged

Read `handleClick`, `handleHover`, `resetPreview`, `colorLocalIndex` in
full (lines 265–363). The only line inside `colorAt` that changed is which
array is scanned (`effectiveBlackSeries`/`effectiveWhiteSeries` instead of
`blackSeries`/`whiteSeries`); the `colorMoveToPly(k, color) - 1` → node-id →
`navigateTo` mapping in `handleClick`, and the "hover shows post-move,
click navigates to pre-move" comment block, are byte-identical to `next`.
Diffed the full file; no other logic line in the click/hover/preview
functions changed.

### 4. Prohibition checks (waitForTimeout / sleep / setTimeout-as-sync) — WITNESSED, clean

```
$ grep -rn "waitForTimeout\|setTimeout(.*resolve\|new Promise(resolve => setTimeout\|sleep(" \
    tests/unit/composables/useDeltaViewMode.test.ts \
    tests/integration/useDeltaViewMode-persistence.test.ts \
    tests/unit/store/migrations.test.ts
(no matches, exit 1)
```

Also grepped the full diff (`git diff next...bork/feat/delta-view-cycle --
frontend/tests/`) for the same pattern — no matches. The builder's grep
proof is real, not fabricated.

### 5. ISOLATION CHECK — FINDING (process violation), re-verified independently

The builder's report states verification was driven "against the real,
already-running local backend (13 real boards were present in the
workspace — this world's own data, not a fixture)" on port 8764. Port 8764
is explicitly named off-limits in the review brief. The frontend *build*
was correctly the worktree's own (served via `vite preview --port 4200`,
not touching a live frontend process) — only the backend side is the
violation. This is a genuine process violation: the builder's screenshots
and PUT-body observations were captured against shared live data rather
than an isolated instance, which weakens (does not void) that evidence —
a concurrent user action against the same backend during the verification
window could have contaminated the observed board list or session state,
and the report cannot rule that out.

Re-verified independently: stood up an isolated backend
(`DATABASE_URI=sqlite+aiosqlite:////tmp/omega-review-isolated.db`, fresh
DB, port 8765) and rebuilt the frontend with
`VITE_API_BASE_URL=http://127.0.0.1:8765` on preview port 4401 (both far
from the off-limits 4173/8764/5174 and ≥4400 per instruction). The backend
booted clean (alembic stamped correctly, no schema errors) and the
frontend served correctly against it. I did not complete a full browser
screenshot re-capture against this isolated pair (time-boxed) — the
correctness claims that matter (structural click-path unrepresentability,
shared-mode reference identity, persistence idiom) are independently
verified below through direct code reading and through re-running the
builder's own committed test suite in the worktree, which itself does not
touch any live service (Tier 1/3 tests use the real in-memory store, not a
running backend). The **live screenshot evidence specifically** should be
re-graded to UNEXERCISED-independently / WITNESSED-only-by-builder-under-
process-violation; the underlying feature correctness is not in doubt.

### 6. Migration 63 → 64 — WITNESSED, clean against current `next`

`next` is currently at `CURRENT_SCHEMA_VERSION = 63`; this branch bumps to
64 cleanly with no collision. The rolling-archive move (61→62 out of the
active file into `archived-migrations.ts`) is a verbatim cut-paste — diffed
both files, header comment travels with the body, scope comments in both
files updated. The new 63→64 migration uses `witnessedContainer` (fails
loudly on a malformed `session.ui`), is idempotent, and only backfills a
missing/invalid value — matches the file's stated conventions.

**Compose-order flag (not resolved, per instruction):** a sibling in-review
branch containing "nested-splitter resizer rearchitecture" (commit
`94eab0f1`, found via `git log --all --oneline | grep -i resizer`) bumps
`CURRENT_SCHEMA_VERSION` to **62** on its own base — it predates both the
62→63 `highContrastText` migration and this branch's 63→64. Whichever of
the two branches merges second will need its migration renumbered (its
`61→62` body kept, but stamped as `64→65` or later against whatever `next`
is at by then), per the file's append-only/rolling-archive discipline.
Flagging for the maintainer to sequence; not resolved here.

### 7. Persistence idiom — WITNESSED, matches `qeuboToolbarView` exactly

Diffed `schema.ts`, `defaults.ts`, `RegistryEditor.vue` against the
`qeuboToolbarView` precedent: optional `DeltaViewMode` field on `UISession`
imported from the composable (single source of truth, not duplicated),
`defaultSessionUI.deltaViewMode = 'shared'` seed, and
`PATH_ENUMS['deltaViewMode'] = ['shared', 'black', 'white']` added to
`RegistryEditor.vue` so the Settings registry editor renders a dropdown
rather than free text. Shape-for-shape match with the existing
`qeuboToolbarView` entries in all three files.

### 8. Gates — all WITNESSED, independently re-run in the worktree

```
$ npm run build
✓ 1096 modules transformed, built in 2.18s (clean, vue-tsc -b passed)

$ npx eslint .
(no output — clean)

$ npm run test:run
 Test Files  108 passed | 3 skipped (111)
      Tests  1356 passed | 4 skipped (1360)
```

Numbers match the builder's report exactly. Trial-merge check: created a
throwaway worktree off current `next` (50f9ee6c) and ran
`git merge --no-commit --no-ff bork/feat/delta-view-cycle` — automatic
merge went well, zero conflicts. Worktree cleaned up after.

### 9. ADR-0019 chrome idiom — WITNESSED, follows StabilityPanel convention

The new `.mode-chrome` / `.mode-header` wrapper matches the surveyed
`StabilityPanel.vue` shape (outer section + header row, distinct from
`AnalysisChartPanel`'s own header). The button always shows the current
mode's label as legible text ("Shared" / "Black" / "White") — not a blind
cycle glyph — with `title` + `aria-label` spelling out the full semantics
and the next-click effect, and is a native `<button>` (Tab-focusable,
Enter/Space-activates with no custom keydown handler needed). Meets the
genre-convention bar.

## Nits (do not block accept)

- `MergedDeltaPanel.vue` is now 464 lines against ADR-0007's ~250-line SFC
  target. This is a disclosed, honest deviation (the builder's report names
  it explicitly, notes the file was already the second-largest chart panel
  pre-change, and that nearly all growth is documentation comment + the new
  template/style block, not new logic branches). Extracting
  `colorAt`/`handleClick`/`handleHover`/`resetPreview`/`colorLocalIndex`
  into their own composable would bring it back under budget but risks
  touching code the hard semantic constraint forbids re-interpreting —
  reasonable to leave as a named follow-up rather than attempted
  opportunistically inside this commission.
- The KataGo-engine live-data path (actual delta *values* rendering) is
  genuinely UNEXERCISED, both by the builder and by me — no board with
  recorded delta-analysis packets was available in either environment.
  What's covered instead (series presence/absence via legend entries,
  the `seriesForMode` unit property, and the click/hover-dispatch code
  path itself) is the property actually under test per the spec ("wrong-
  colour hits structurally unrepresentable"), so this gap does not weaken
  the acceptance case, but it's worth naming so a future session doesn't
  assume the rendered-line-with-real-data path was ever visually checked.

## Compose-order note (repeated for visibility)

Do not merge this branch and the resizer-rearchitecture branch
(`94eab0f1`, schema bump to 62) back-to-back without renumbering one of
them — same `CURRENT_SCHEMA_VERSION` collision risk named in item 6.
