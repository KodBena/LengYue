# Worklog — Perf Nav Arc 1: board-rail re-render localization (2026-05-29)

Arc 1 of the staged fix plan in
`docs/notes/perf-audit-game-scroll-2026-05-28.md`. Localizes the
board-rail's per-navigation re-render cost. Regime A (pure
navigation); the App-decouple (Arc 2) and the regime-B packet path
are separate, queued arcs (`docs/TODO.md`, Medium).

## Change

Two edits, plus the before-anchor note (committed in the same change):

- **`frontend/src/store/index.ts`** — `mutateBoard` drops the
  `store.boards[index] = { ...board }` shallow-copy identity swap,
  keeping the in-place `fn(board)` mutation and the
  `boardsVersion.value++` bump. The in-place mutation already fires
  the fine-grained field deps every reader needs; the identity swap
  additionally fired the *array* dep, which invalidated every coarse
  reader of "the board" / "the boards array" (App.vue, the
  `SidebarWidget` `v-for`). `boardsVersion` remains the explicit
  coarse signal SyncService watches for debounced persistence (it
  keys on the counter, not identity).
- **`frontend/src/components/chrome/SidebarWidget.vue`** — `v-memo` on
  the `BoardTab` `v-for`, keyed on the parent-driven inputs a tab
  cannot self-source: `[board, index, store.activeBoardIndex ===
  index, getReviewState(board.id)]`. Cursor / analysis-depth / geiger
  updates flow through `BoardTab`'s own reactive effects, which
  `v-memo` does not block (it suppresses parent-driven patches only).

## Why it works (mechanism)

App.vue re-renders on every navigation (it reads the cursor directly).
`SidebarWidget` carries `v-show`, so Vue's `shouldUpdateComponent`
force-updates it on each parent render (`if (nextVNode.dirs) return
true`). Before, that forced a re-render of every `BoardTab` — including
the expensive per-tab rug-plot meter (a ledger walk over the whole
variation path) — for boards whose visible content had not changed.
The `v-memo` now reuses the cached tab vnodes when the parent-driven
key is unchanged; the active board's rug-plot is invariant under
*within-line* navigation (`useVariationPath` is root → active leaf, a
function of `activeChildIndex`, not `currentNodeId`), so it correctly
does not re-render either. Dropping `{...board}` keeps `:state`'s proxy
identity stable so a tab's own-effect reads still fire on in-place
mutation.

## ADR-0004 consumer audit

Confirmed safe before the store edit (full audit recorded in the
before-anchor note): `navigate*` mutate `state` purely in place; no
`watch` keyed on `activeBoard` identity; SyncService keys on
`boardsVersion`; `useVariationPath` no longer reads `boardsVersion`;
the two board `watchEffect`s don't touch identity.

## Measurement (ADR-0009)

Before/after profile pair, same scenario (two boards, hold-arrow
scroll within a line, Analysis tab open, range analysis pre-loaded,
no live streaming). Normalized per nav-cycle (before 167, after 151):

- `~/perf-profiles/game_scroll_ee1ae205.json.gz` (before, 2.0 MB)
- `~/perf-profiles/game_scroll_ee1ae205_after.json.gz` (after, 1.9 MB)

| Marker (per nav-step) | Before | After | Δ |
|---|---|---|---|
| SidebarWidget patch | 3.41 ms | 0.03 ms | −99% |
| RootErrorBoundary patch (whole-tree) | 10.98 ms | 4.72 ms | −57% |
| BoardTab render (occurrences) | 334 | 0 | eliminated |
| Perform microtasks (Vue flush) p50 | 21.84 ms | 18.14 ms | −17% |
| RefreshObserver (frame) p50 | 15.5 ms | 14.7 ms | −5% |

The 334 before-renders of `BoardTab` produced identical output (the
active variation, and thus the rug-plot, is invariant under within-line
scrolling) — they were pure forced-re-render waste, now eliminated.

The frame-budget improvement is modest (−5% on `RefreshObserver` p50)
because the per-frame cost is now dominated by App's own whole-tree
re-render (Arc 2) and the analysis-panel / board-overlay recompute (the
analysis-panel refactor). This validates the staged plan: Arc 1 cleared
the rail; the headline frame cost now points at Arc 2 and the refactor.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped (no regressions; nothing
  depended on the identity swap).

## Not in scope

App-decouple (Arc 2) and the regime-B packet-path investigation are
queued in `docs/TODO.md` (Medium). The analysis-subtree over-render is
folded into the analysis-panel refactor (Future project).

License: Public Domain (The Unlicense).
