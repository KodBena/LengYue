# Library: middle-click / Ctrl+click → open game in new board

- **Status:** Bundled with the 'n'-toggle quick win in
  `frontend/quick-wins-n-toggle-and-library-newtab`; awaiting
  user end-to-end test before PR open.
- **Genre:** Quick-win UX addition. Four-file change (composable
  + two SFCs + App.vue wiring).
- **Date:** 2026-05-27.

## Context

Per `todo_local.gitignore` new #2 — standard browser-link
affordance ("open in new tab" via middle-click or Ctrl/Cmd+click)
applied to library rows. Currently a row click selects for
preview and a double-click opens on the active board (consuming
the active context); there was no path to open a game in a
fresh tab without first using a confirm-load modal flow.

The MoveSuggestions PV-paste affordance already establishes the
modifier-click and middle-click conventions for the project via
`isPasteClick` / `isMiddleButtonMousedown` in
`src/utils/modifier-key.ts`. Reusing those utilities keeps the
SPA's gesture vocabulary consistent.

## Shape of the change

Four files; the new affordance threads from row to App.vue's
existing dirty-board-guard composable.

### `useDirtyBoardGuard.ts` — new public verb

`handleLoadLibraryGameInNewBoard(game)` mirrors
`handleLoadLibraryGame`'s load+stamp body but skips the
`resolveTargetBoard` step entirely: always `createBoard()`, then
load. No dirty-board guard because the user's intent is "open
without disturbing the active context" — no overwrite concern.
Library-row provenance (`clientGameId` → backend
`get_or_create_game_source_by_client_id` dedup) is preserved
identically to the existing path.

Return shape adds the new verb alongside `handleLoadCard` and
`handleLoadLibraryGame`.

### `LibraryTable.vue` — row gesture detection

- Imports `isPasteClick`, `isMiddleButtonMousedown`.
- Adds `'open-new-tab'` to the `Emits` interface.
- `onRowClick` now takes the `MouseEvent` and routes ctrl/cmd-
  click to the new emit (else falls through to the existing
  `'select'` for preview).
- New `onRowMousedown` handler: filters to middle-button via
  `isMiddleButtonMousedown`, calls `preventDefault` (suppresses
  the platform's middle-button auto-scroll cursor), emits
  `'open-new-tab'`.
- Template: row bindings updated to pass the event into the click
  handler and to add `@mousedown` for the middle-button path.

### `LibraryTab.vue` — pass-through

- Adds `'open-library-game-new-tab'` to the `Emits` interface.
- New `onOpenNewTab(row)` handler: fetches the full
  `LibraryGame` via `libraryService.getGame` (same pattern as the
  existing `onOpen`), emits up. Deliberately does NOT touch
  `preview.selectedRow.value` — the new-tab affordance leaves
  the preview pane alone, matching the "don't disturb the active
  context" intent.
- Template: adds `@open-new-tab="onOpenNewTab"` on the
  `<LibraryTable>` binding.

### `App.vue` — wiring

- Destructures the new `handleLoadLibraryGameInNewBoard` verb
  from `useDirtyBoardGuard`.
- Adds `@open-library-game-new-tab="handleLoadLibraryGameInNewBoard"`
  on the `<LibraryTab>` mount alongside the existing
  `@open-library-game` listener.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline; no test surface touched).

User-side validation:

1. Open the Library tab with several games imported.
2. **Ctrl-click (or Cmd-click on Mac) a row** → game opens in a
   new board; active context unchanged.
3. **Middle-click a row** → same behaviour; no scroll-cursor
   appears.
4. Plain click still selects for preview; double-click still
   opens on the active board via the existing dirty-board
   guard path.
5. New tab inherits the library row's `clientGameId` correctly:
   minting from the new tab dedupes against the existing
   `game_source` row (the same backend invariant the existing
   `handleLoadLibraryGame` path tested).

## Scope note (not in this PR)

The `LibraryPreviewPane.vue`'s "Open in board" button could
gain a matching "Open in new tab" sibling — natural extension.
Out of scope here; the user's report was specifically about row
clicks. If wanted later, the wiring is identical: emit a new
event, route through the same `handleLoadLibraryGameInNewBoard`.

License: Public Domain (The Unlicense)
