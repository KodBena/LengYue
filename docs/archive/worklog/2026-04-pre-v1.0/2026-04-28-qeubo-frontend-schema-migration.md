# qEUBO Frontend — Schema Migration 5→6 (Foundation)

- **Status:** Shipped on branch
  `frontend/qeubo-schema-migration`, 2026-04-28.
  `npm run build` green; manual smoke deferred to the next
  composable + toolbar PR (no consumer of the new fields lands
  in this one).
- **Genre:** Worklog entry — first frontend slice of the qEUBO
  integration dispatch.
- **Date:** 2026-04-28.
- **Origin:** Backend half of the integration dispatch shipped
  in PR #30 (status dispatch at
  `docs/dispatch/backend-to-frontend-qeubo-status.md`); the
  qEUBO note's status table flagged "Frontend schema migration
  5→6" as the natural foundation slice for the frontend half.

## Context

`docs/dispatch/frontend-to-backend-qeubo-integration.md` v1.1
specifies five frontend deliverables:

1. Schema migration 5→6 (this PR).
2. `useQeubo` composable.
3. Toolbar A/B cluster.
4. Bookmarks UI.
5. Parameter-meta editor extension (in PaletteEditor).

The five are largely independent and can ship in separate
PRs. The schema migration is the foundation — it lands the
type and storage shape that the other four consume — so it
ships first, alone, on its own branch with no UI consumer
yet. This composes with the project's "branch + PR per work
unit" convention and keeps the review surface tight.

The session also resolved one open dispatch item before code
landed: the **bundled-apply verdict UX** is now decided
**separable**, recorded in `docs/notes/qEUBO.md`'s open-items
section. User's reasoning: the audition needs to be toggle-
able back and forth before deciding; bundling the verdict
with the parameter write would force duplicate A/B button
clusters (one for testing, one for verdict). The toolbar
will surface three actions, not two: a non-destructive
toggle (Applied / A / B), a verdict ("I prefer A/B"), and an
explicit apply ("Use this") — see the qEUBO note for the
shape. Implication for the forthcoming `useQeubo`: dispatch
v1.1's `submitPreference` becomes observation-only; a sibling
apply method handles the parameter write.

## Approach

Three files touched. No consumer of the new fields exists
yet, so the changes are purely shape additions plus the
forward migration that brings v5 blobs up to v6.

### `frontend/src/types.ts`

Type additions per dispatch §3.1, with one project-style
adjustment (the bookmark id is branded, matching the
codebase's `BoardId`/`NodeId`/`ProfileId`/`SessionId`/`CardId`
convention; the dispatch wrote `id: string` but the same
section's §3.4 already used `BookmarkId` in
`applyBookmark`'s signature, so the brand is consistent
end-to-end).

- `BookmarkId = Brand<string, 'BookmarkId'>` near the other
  brands.
- `ParameterMeta { range?, qeubo_controlled? }` interface,
  alongside `AnalysisPalette`. Snake_case matches the
  surrounding `analysis_env` subtree convention (sibling to
  `parameters`, `symbols`).
- `parameter_meta?: Record<string, ParameterMeta>` field on
  `AnalysisEnvironment`.
- `QeuboBookmark { id, name, createdAt, parameters }`
  interface near `ProfileState`. State-container category
  (mutated through bookmarks UI), so no `readonly`
  annotations per ADR-0001.
- `qeuboPinnedBookmarks?: QeuboBookmark[]` field on
  `ProfileState`.
- `qeuboToolbarView?: 'applied' | 'A' | 'B'` field on
  `UISession`.

All new fields are typed optional (`?`). The migration
ensures populated values at runtime; the optionality is for
consumers that defensively access via `?.` — preserves the
discriminated-union ergonomics that ADR-0002 favours.

### `frontend/src/store/defaults.ts`

Three seed values, matching the migration's defaults:

- `analysis_env.parameter_meta: {}` inside `defaultSettings`.
- `qeuboPinnedBookmarks: []` on `defaultProfile`.
- `qeuboToolbarView: 'applied'` on `defaultSessionUI`.

A fresh install picks up the v6 shape on first save (the
sync layer stamps `schemaVersion: 6` via
`buildPersistencePayload`); the migration is for blobs in
the wild already at v5.

### `frontend/src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumped 5 → 6. Migration appended at
index 4 of the `migrations` array.

The migration is idempotent and defensive against malformed
hand-edited values. Each field check is "missing or
malformed" rather than "missing" alone, because the
registry editor lets the user write arbitrary values into
the persisted blob, and the consumer should see a clean
seed rather than a corrupt value:

- `parameter_meta`: seeds `{}` if undefined, null, non-
  object, or array.
- `qeuboPinnedBookmarks`: seeds `[]` if not an array.
- `qeuboToolbarView`: seeds `'applied'` if not one of
  `'applied' | 'A' | 'B'`.

Element-shape validation inside `qeuboPinnedBookmarks` is
deliberately not done here — that's the consumer's
boundary. The migration only normalizes the container.

## Critical files

- **Edited:** `frontend/src/types.ts` (+ ~30 lines: brand,
  two interfaces, three field additions).
- **Edited:** `frontend/src/store/defaults.ts` (+ 3 lines:
  three seeded values).
- **Edited:** `frontend/src/store/migrations.ts` (+ ~40
  lines: version bump, one new migration with comment).
- **Edited:** `docs/notes/qEUBO.md` (status-table rows
  bumped — backend rows from "In review" to "Merged" with
  PR #30 / commits 6fa4db6 and f3dac77; "Frontend schema
  migration 5→6" from "Not started" to "In review";
  bundled-apply open item resolved with a paragraph
  describing the separable shape).

## Reused existing surface

- The schema-versioning framework introduced in PR #10
  (`docs/worklog/2026-04-27-store-schema-versioning.md`).
  Append a function, bump the constant — the orchestrator
  picks the rest up automatically.
- The optional-field convention used elsewhere in the type
  graph (e.g. `gradingParameter?` on `ReviewCard`,
  `currentRecall?`, `halflifeUnits?`).
- `structuredClone` for the migration's no-mutate-input
  contract (matches every prior migration).

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 2.00s, 848 modules). No new
   strict-mode errors; the optional-field shape composes
   cleanly with existing access sites since none of them
   touch the new fields yet.

2. **Mental walk-through of the migration.** Synthetic v5
   blob with no qEUBO fields → migrate produces:
   `parameter_meta: {}`, `qeuboPinnedBookmarks: []`,
   `qeuboToolbarView: 'applied'`, `schemaVersion: 6`.
   Synthetic v5 blob with hand-corrupted
   `parameter_meta: "garbage"` → seeded to `{}`. Synthetic
   v6 blob already populated → `migrate()` no-ops since
   `version === CURRENT_SCHEMA_VERSION`.

3. **End-to-end smoke deferred.** Without a consumer of the
   new fields, an end-to-end smoke would only confirm the
   build artifact deserializes; the manual test in HMR is
   more valuable when the next PR lands the toolbar UI. The
   composable + toolbar PR will smoke the end-to-end path
   (open the Force Persistence panel, observe the v6 blob
   round-tripping; toggle the toolbar; pin a bookmark;
   etc.).

## Outcomes

- v6 is the current schema version; v5 blobs forward-
  migrate cleanly on hydrate.
- Type surface for the qEUBO calibration loop is in place;
  the next PRs (composable, toolbar, bookmarks UI,
  parameter-meta editor) build on these types without
  needing further schema bumps.
- `docs/notes/qEUBO.md` reflects the current state of every
  qEUBO track. The bundled-apply UX call is recorded as
  resolved.

## Out of scope (explicitly)

- **`useQeubo` composable.** Lives in the next PR. Its
  shape will reflect the separable-verdict UX resolution
  recorded in `docs/notes/qEUBO.md`'s open-items section,
  not dispatch v1.1's bundled-apply default. Whether
  dispatch v1.2 lands in that PR or as a separate doc-only
  amendment is a question for the next session.
- **`qeubo-service.ts` API client.** Wants the generated
  wire types from `npm run gen:api` against a backend with
  `QEUBO_ENABLED=True`; landing it independently of the
  composable adds no review value. Bundles with the
  composable.
- **Toolbar / bookmarks UI / parameter-meta editor.**
  Subsequent PRs.
- **Migration unit tests.** No test infrastructure for
  store migrations exists today; introducing one for a
  three-field seed is over-investment. The mental walk-
  through above is the substitute; the next PR's HMR
  smoke is the load-bearing verification.

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md`: status-table rows + bundled-apply
  open item updated.
- `docs/TODO.md`: no entry yet — the table tracks
  Completed only, and this PR is in review at write time.
  A row will land at merge in a separate doc-only edit
  alongside the merged-row update of the qEUBO note.
- No ADR amendment.
- No `deferred-items.md` entry.

## Branch + PR workflow

Branched off `main` at `d2ae967` (post-merge of PR #30).
Single PR to main. Establishes the schema; no behaviour
change. Sets up the next PR (composable + service + initial
toolbar wiring).
