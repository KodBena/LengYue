# qEUBO Frontend — Bookmarks UI Panel

- **Status:** Shipped on branch
  `frontend/qeubo-bookmarks-ui`, 2026-04-28.
  `npm run build` green; UI smoke pending the user's HMR run.
- **Genre:** Worklog entry — fifth and final frontend slice in
  the qEUBO arc. Lands the saved-bookmark panel and the
  bookmark CRUD methods on `useQeubo`'s public surface.
- **Date:** 2026-04-28.
- **Origin:** Parameter-meta editor merged in PR #34. Final
  remaining slice per the qEUBO note's status table.

## Context

The toolbar's Pin button (PR #33) creates bookmarks but
exposes no way to view, rename, delete, or apply them — until
this PR. Per dispatch v1.2 §3.6, the bookmarks panel:

- Lives independently of qEUBO experiment state (bookmarks
  survive experiment changes / aborts).
- Shows each bookmark with name, creation date, parameter
  summary.
- Per-row actions: Apply / Rename / Delete.
- Includes a "New from current applied" affordance for
  checkpointing outside the toolbar's Pin flow.

This PR closes the frontend half of the qEUBO integration.
Once it merges and the user runs an end-to-end UI smoke, the
qEUBO note transitions from `living-doc` to
`design-note: implemented` per its maintenance contract.

## Approach

### `frontend/src/composables/useQeubo.ts` (edited)

Two new methods on the public surface:

- **`renameBookmark(id, newName)`** — synchronous. Trims the
  new name; throws on empty (per ADR-0002, won't silently
  accept blank names). Surfaces `pushSystemMessage('error', ...)`
  if the id doesn't exist (defensive — UI should always pass
  a valid id from the list).
- **`deleteBookmark(id)`** — synchronous. Splices the entry
  out of the reactive array. Surfaces a system message error
  on missing id.

`pinCurrent` (already shipped in PR #32) covers "new from
current"; the panel just wires it to a button.

### `frontend/src/components/QeuboBookmarks.vue` (new, 139 lines)

List panel inside the Other tab, after Gradient Calibration.
Reactive view sorts bookmarks newest-first (most recent work
surfaced first); empty state when the list is empty; per-row
Apply / Rename / Delete buttons.

Date formatting via `Date.toLocaleString()` (locale-aware,
no library needed). Parameter summary via a small helper
that sorts keys alphabetically for stability and renders
numbers with up to 4 decimals (trailing zeros trimmed).

Inputs follow the established `window.prompt` /
`window.confirm` pattern from PaletteEditor and CardSetEditor:

- Pin name → `prompt('Bookmark name:')`
- Rename → `prompt('New name:', oldName)`
- Delete → `confirm('Delete bookmark "X"?')`

Replacing these with proper modals is a polish item; the
prompt/confirm pattern is the codebase's idiom and hasn't
been a friction point for the (technical) target user.

Style: matches the Other tab's existing dark theme. New-
button highlighted in the project's accent blue (#4aaef0)
matching the toolbar's apply-button styling. Apply / Rename
follow the standard button shape with Apply highlighted in
accent blue. Delete is `×` with red hover (#ff6b6b).

ADR-0007 budget: 139 lines total — script ~70, template ~30,
style ~30, plus header/imports. Well within the 250 SFC
budget.

### `frontend/src/App.vue` (edited)

Imports `QeuboBookmarks` and renders it in the `#other` tab
template, after the existing Gradient Calibration section
with a `section-divider` style for spacing. Two lines added.

### `docs/notes/qEUBO.md`

Status-table updates. Parameter-meta editor row moved to
Merged with PR #34 / commit c286492. Bookmarks-UI row moved
to "In review". Footnote text updated to reflect that the
arc is feature-complete pending the bookmarks-UI merge and
an end-to-end UI smoke; once both close, the note will
transition to `design-note: implemented`.

## Critical files

- **Created:**
  `frontend/src/components/QeuboBookmarks.vue` (139 lines).
- **Edited:**
  `frontend/src/composables/useQeubo.ts` (+25 lines for
  rename / delete methods + UseQeuboReturn type + return
  shape).
- **Edited:**
  `frontend/src/App.vue` (+2 lines: import + tag in #other
  template).
- **Edited:** `docs/notes/qEUBO.md` (status-table + footnote).

## Reused existing surface

- `useQeubo`'s reactive array
  `store.profile.qeuboPinnedBookmarks` — the panel reads
  through `store` directly (Vue reactivity propagates) and
  writes through the composable's methods.
- `pushSystemMessage` for user-visible feedback on save /
  apply / rename failures.
- `window.prompt` / `window.confirm` — the codebase's
  established pattern.
- `applyBookmark(id)` already shipped in PR #32. Reused
  here from the panel's Apply button.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 2.00s, 854 modules; bundle
   2,770.28 kB / +2.96 kB over PR #34).

2. **Mental walk-through.**
   - Empty state: panel renders the empty-state div with the
     hint about the toolbar's Pin and the "+ New from
     current" button. ✓
   - "+ New from current": prompt → pinCurrent → array
     mutation → reactive panel re-renders newest-first. ✓
   - Apply: applyBookmark → analysis_env.parameters
     overwritten → toolbarView reset to 'applied'. System
     message confirms. ✓
   - Rename: prompt with old name → renameBookmark mutates
     name field → reactive re-render. ✓
   - Delete: confirm → splice → reactive re-render. ✓
   - SyncService picks up bookmark changes via the same
     debounced workspace PUT path that handles every other
     `store.profile` mutation. No new persistence wiring
     needed.

3. **UI HMR smoke (deferred to user).** End-to-end recipe:

   ```
   1. Open Settings → Analysis Environment.
   2. Configure alpha with range [0, 1] and qeubo_controlled (PR #34).
   3. Switch to the toolbar; click Pin → name "first try".
   4. Open the Other tab.
   5. The bookmark "first try" should appear under qEUBO Bookmarks
      with today's date and "alpha=0.25" (or whatever value).
   6. Apply: the toolbar's view resets to 'applied'; the
      analysis_env parameter takes the bookmarked value.
   7. Rename: prompt with "first try" pre-filled; type new name → row updates.
   8. Delete: confirm → row disappears. Empty state if last bookmark.
   9. "+ New from current": prompt → new row appears with current
      analysis_env.parameters values.
   ```

## Outcomes

- **The frontend half of the qEUBO integration is feature-
  complete.** Five PRs (the schema migration, the composable
  + service, the toolbar cluster + engine wiring, the
  parameter-meta editor, the bookmarks UI) span all
  deliverables in dispatch v1.2 §3.
- The user can fully exercise qEUBO calibration through the
  UI: declare which parameters are under qEUBO control, run
  audition / verdict / apply / pin sessions from the toolbar,
  and manage saved configurations from the Other tab.
- Bookmarks survive experiment changes — they're per-user
  metadata, not per-experiment.

## Out of scope (explicitly)

- **Replacing window.prompt with proper modals.** The
  codebase's idiom uses `prompt` for short text input; matching
  it keeps the bookmarks panel consistent with PaletteEditor
  and CardSetEditor. A future polish PR could introduce a
  shared "small input modal" component if `prompt` becomes a
  friction point.
- **Drag-to-reorder bookmarks.** Sort is by createdAt
  newest-first; manual reordering would need a separate
  `order` field plus a drag handle. Skip until requested.
- **Bookmark export / import.** Bookmarks are a JSON list;
  the user could copy-paste via the Advanced Registry. A
  share-bookmarks community feature is on the umbrella's
  longer-term horizon (see `docs/handoff-current.md`'s
  closing section) and lives outside this dispatch.
- **End-to-end UI smoke verification.** This PR ships the
  surface; the smoke walk-through above is the loadbearing
  user step. The qEUBO note's status row reads "Partial"
  until the user runs the smoke.
- **qEUBO note genre transition.** The note remains a
  `living-doc` until the bookmarks-UI row reads Merged AND
  the end-to-end smoke completes. The transition is a
  one-line edit in a future PR (the user's smoke session, or
  a doc-only follow-up).

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md` status-table updated; footnote
  rewritten to reflect feature-complete-pending-merge state.
- No ADR amendment.
- No `deferred-items.md` entry.

## Branch + PR workflow

Branched off `main` post-merge of PR #34. Single PR to main.
Closes the frontend qEUBO arc.
