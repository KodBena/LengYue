# wf6-summary-analysis-basic — build report

Wiki Wanted feature #6: display summary analysis over the set interval in
the Basic analysis tab by default, without requiring the multiresolution
panel (enabled or not) or a cell hover.

Branch: `worktree-agent-ac489426e197cecb0`
Commit: `c6b8e37d` — "feat(frontend): interval summary panel in the Basic
analysis tab (wf6)"

## Where the shared kernel lives

`src/composables/analysis/useTriangularHeatmap.ts` is the shared kernel.
`useTriangularHeatmap(variationPath)` returns the accumulated `matrix` of
`HeatmapCell`s (`{ color, s, t, value }`) — the exact same computed value
`MultiresolutionIntervalPanel.vue` renders as heatmap cells and reads on
hover (`src/components/charts/MultiresolutionIntervalPanel.vue:42`,
`:127-129`). `value` is whatever the proxy's `Triangular()` query computed
server-side (min or mean of the delta stream, palette-dependent — see that
file's header comment); the frontend never recomputes it.

The new composable, `src/composables/analysis/useIntervalSummary.ts`, is a
LOOKUP over that same matrix, not a second aggregation:

1. It calls `useTriangularHeatmap(variationPath)` itself — same composable
   instance shape as the panel.
2. It projects the current `selectionRange: [PlyIndex, PlyIndex]` onto each
   colour's local move-index sub-range via a new pure function,
   `plyRangeToColorMoveRange` (added to `useTriangularHeatmap.ts`, next to
   its forward sibling `colorMoveToPly`, as the single authority for the
   PlyIndex ↔ ColorMoveIndex invariant per that file's existing docstring
   convention). This is the same projection the proxy applies server-side
   when an arbitrary both-colours ply range is analysed via
   `analyzeSelection` (`useAnalysisTimeline.ts`).
3. It finds the cell in the matrix whose `(color, s, t)` matches the
   projected range and returns that `HeatmapCell` verbatim (or `null` if
   that exact sub-range hasn't been analysed yet — the matrix is sparse,
   populated only by ranges actually queried; this mirrors "hover an
   unpopulated cell shows nothing").

No new arithmetic over `deltas` / `state` / raw packets was written
anywhere in this change.

## What the summary shows and why

`src/components/charts/IntervalSummaryPanel.vue` — a compact two-row table
(Black / White), each row showing:

- **Interval** — `moves s–t` (colour-local), same vocabulary
  `MultiresolutionIntervalPanel`'s hover caption already uses.
- **Value** — the looked-up `HeatmapCell.value`, `.toFixed(3)`, or
  `"no data"` when the projected sub-range has no recorded cell.

Registered as `PANEL_ID.intervalSummary` (`panel-ids.ts`,
`panel-registry.ts`) and placed **first** in the default `'basic'`
analysis tab (`src/store/defaults.ts`), so it is on by default per the
commission. Styled with `--surface-0` / `--surface-2` / `--surface-3`
tokens, matching `MultiresolutionIntervalPanel`'s existing section/header
convention — no new design system introduced.

Reads `variationPath` and `selectionRange` from the injected
`AnalysisContext` (`injectAnalysisContext()`), the same self-sourcing
pattern every other registry panel uses; no logic lives in the SFC beyond
wiring and a display-formatting `computed`.

### Existing-user backfill

`defaults.ts`'s new default only reaches fresh installs. Added migration
`61 → 62` in `src/store/migrations.ts`: inserts `'interval-summary'` at
the front of a persisted `'basic'` tab's `panelIds` if not already present
(idempotent; scoped to the tab literally id'd `'basic'`, so a
user-renamed/deleted Basic tab is left alone). Per the rolling-archive
discipline (`migrations.ts`'s own docstring — keep exactly the latest two
migrations active), the now-aged-out `59 → 60` migration was moved
verbatim into `src/store/archived-migrations.ts` (frozen body, cut-and-
paste only) and that file's header scope comment updated.
`CURRENT_SCHEMA_VERSION` bumped 61 → 62.

## Evidentiary status per claim

- **Shared-kernel equality, not parallel recompute** — WITNESSED.
  `tests/integration/useIntervalSummary.test.ts`, test "resolves to the
  exact HeatmapCell useTriangularHeatmap produces for the projected
  interval": records one `ledger.recordEnrichment` call with a Black and
  a White triangular entry, reads the value through both
  `useTriangularHeatmap` directly and through `useIntervalSummary`, and
  asserts `toEqual` (full object equality, not just numeric) plus the
  exact expected numbers (`0.42`, `-0.13`). Passed:
  ```
  Test Files  2 passed (2)
       Tests  7 passed (7)
  ```
  (that run scoped to the two new test files; full-suite run below.)

- **Updates on selection-range change** — WITNESSED. Same test file,
  second test: narrows `selectionRange` from the full 6-move line to
  Black's first move only, awaits `nextTick()`, and asserts the summary
  correctly flips both rows to "no data" (proving it re-derives from the
  live ref rather than caching the prior projection's result).

- **Reverse ply↔colour-move projection is correct** — WITNESSED.
  `tests/unit/composables/plyRangeToColorMoveRange.test.ts`, 5 cases:
  exact round-trip through the existing forward `colorMoveToPly`, a
  both-colours range projecting cleanly to both colours' full sub-ranges,
  a range that only partially contains one colour's last move, and two
  null-return (no-data) cases including the empty root selection.

- **`npm run build` exit 0** — WITNESSED.
  ```
  BUILD_EXIT=0
  ✓ built in 1.74s
  ```
  (ran twice, once before and once after the eslint cast-hygiene fixes
  below; both exit 0.)

- **`npm run test:run` exit 0** — WITNESSED.
  ```
  TEST_EXIT=0
  Test Files  83 passed | 3 skipped (86)
       Tests  1108 passed | 4 skipped (1112)
  ```
  Includes the pre-existing `tests/unit/store/migrations.test.ts` (asserts
  `migrations.length === CURRENT_SCHEMA_VERSION - 1`, which the archive
  move + new migration keep true) and
  `tests/integration/migration-store-roundtrip.test.ts` (the composition
  guard against a silently-no-oping backfill) — both re-run in isolation
  and green (261/261).

- **`eslint .` clean** — WITNESSED. Not one of the pre-registered
  acceptance items, but CI gates on it
  (`frontend/CLAUDE.md`'s testing-posture section) so it was checked:
  `npx eslint .` produced no output (clean) after fixing two
  cast-hygiene findings the local `justification-adjacency` rule caught
  — a per-line brand-erasure comment on the two `as number` casts in
  `plyRangeToColorMoveRange`, and, in `IntervalSummaryPanel.vue`, deleting
  a redundant `as 'B' | 'W'` cast (the source type is already the
  `'B' | 'W'` union) and giving the display-row `computed` an explicit
  return type instead of an `as number | null` widening cast.

- **FILES.md updated** — WITNESSED. Entries added for
  `IntervalSummaryPanel.vue` and `useIntervalSummary.ts`;
  `useTriangularHeatmap.ts`'s existing entry extended to mention it is
  now also the reverse-projection authority.

No UNEXERCISED or REFUSED-AS-EXPECTED items — playwright was not needed
(no browser-driven verification was in scope for this change), and no
live port was touched.

## Files touched

- `frontend/src/composables/analysis/useTriangularHeatmap.ts` (new
  `plyRangeToColorMoveRange` export)
- `frontend/src/composables/analysis/useIntervalSummary.ts` (new)
- `frontend/src/components/charts/IntervalSummaryPanel.vue` (new)
- `frontend/src/components/charts/panel-ids.ts`,
  `panel-registry.ts` (registration)
- `frontend/src/store/defaults.ts` (Basic tab default)
- `frontend/src/store/migrations.ts`,
  `frontend/src/store/archived-migrations.ts` (61 → 62 migration +
  rolling-archive move)
- `frontend/FILES.md`
- `frontend/tests/unit/composables/plyRangeToColorMoveRange.test.ts` (new)
- `frontend/tests/integration/useIntervalSummary.test.ts` (new)
