# 'n' keybinding to toggle move numbers

- **Status:** Branch `frontend/n-toggle-move-numbers`; awaiting
  user end-to-end test before PR open.
- **Genre:** Quick-win addition. Single-file edit in
  `src/composables/useUserIORegistry.ts`.
- **Date:** 2026-05-27.

## Context

Per `todo_local.gitignore` new #8a — a single keybinding for the
existing `showStoneMoveNumbers` toggle. The toggle was already
surfaced as a "#" button in `StatusBar.vue:74` but lacked a
keyboard affordance. The accompanying "user-configurable
keybindings substrate" half of #8 is a separate, larger arc and
not in scope here.

## Shape of the change

Two edits inside the existing `useUserIORegistry.ts` switch:

1. Added `'n', 'N'` to the `HANDLED_KEYS` Set (so the synchronous
   `preventDefault` pre-switch fires for these keys and the
   composable claims them from the browser-default key handling).
2. Added a `case 'n': case 'N':` clause adjacent to the existing
   `'m'/'M'` clause — both are board-display toggles, sibling
   affordances. The clause flips
   `store.session.ui.showStoneMoveNumbers`, the same flag the
   StatusBar's "#" button toggles, so keyboard and chrome stay in
   lockstep.

Per the existing structure, the toggle is NOT added to
`COALESCED_NAV_KEYS` — toggles execute synchronously (one press
is one toggle), matching the `m / c / d / l / space` policy.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged baseline).

User-side validation: load a board with played moves, press 'n'
(uppercase or lowercase) — move-number annotations on stones
toggle visibility. Cross-check: the StatusBar's "#" button
shows the same active/inactive state and toggles the same flag.

## What follows

The user-configurable keybindings substrate (new #8b) would
extend `HANDLED_KEYS` and `COALESCED_NAV_KEYS` from constants
into user-editable sets, with the dispatch shape staying the
same. Out of scope for this quick-win PR.

License: Public Domain (The Unlicense)
