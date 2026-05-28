# Worklog — Perf Nav Arc 2: App-decouple from the move cursor (2026-05-29)

Arc 2 of the staged fix plan in
`docs/notes/perf-audit-game-scroll-2026-05-28.md`. Stops App.vue
re-rendering the whole component tree on navigation. Follows Arc 1
(board-rail localization, `2026-05-29-perf-nav-arc1-rail-localization.md`)
on the same branch. Regime A (pure navigation); regime-B packet path
remains queued (`docs/TODO.md`).

## Change

The root cause (from the audit): App.vue's template read the move
cursor directly (`activeBoard.currentNodeId`, `.turn`, `.captures`,
`moveNumber`), so App's render fn re-ran on every navigation step and
re-patched the whole tree — including `v-show`-bearing children like
`SidebarWidget`, which Vue's `shouldUpdateComponent` force-updates on
each parent render. Arc 2 moves those reads into the leaf components
that display them, so App's template reads only nav-stable values.

- **`frontend/src/components/board/StatusBar.vue`** — takes `:board`
  (the whole board, passed by reference — stable identity after Arc 1's
  in-place `mutateBoard`) plus `:metadata`, and derives `turn` /
  `captures` / `moveNumber` internally (the `moveNumber` node-walk
  moved here verbatim from App.vue). `metadata` stays a prop — it is
  board-root-derived (`useMetadata`) and nav-stable.
- **`frontend/src/components/tree/TreeWidget.vue`** — self-sources
  `currentNodeId` from the store's `boardsById` index keyed by the
  `boardId` prop, instead of receiving `:current-node-id`. The
  `ensureVisible` / auto-centre watcher now keys off the self-sourced
  computed (guarded for the transient `undefined`); the JSDoc header
  is updated to reflect the dropped prop.
- **`frontend/src/App.vue`** — drops `:turn` / `:captures` /
  `:move-number` (now `:board`) on StatusBar, drops
  `:current-node-id` on TreeWidget, removes the `moveNumber` computed
  and the now-unused `GameNode` import.

After this, App.vue's template reads only nav-stable values
(`store.session.ui.*`, `activeBoard` identity / `.id` / `.nodes`,
`metadata`, `activeBoardGameHeadIds`, engine/match state,
`controlTabs`) — none of which change on a within-line navigation.

## Why Arc 1 is the prerequisite

`:board="activeBoard"` and `:state="activeBoard"` read `activeBoard.value`
(the computed). Only because Arc 1 made `mutateBoard` mutate in place
(no `{...board}` identity swap) does `activeBoard.value`'s identity stay
stable on navigation — so App reading it for those props does not fire.
Without Arc 1, the identity swap would re-fire `activeBoard` on every
step and App would still re-render.

## Measurement (ADR-0009)

Before/after profile pair, same scenario (two boards, hold-arrow scroll
within a line, Analysis tab open, range analysis pre-loaded, no live
streaming). Arc 2's baseline is the Arc-1 state.

- `~/perf-profiles/game_scroll_ee1ae205_after.json.gz` (Arc 1 — before)
- `~/perf-profiles/game_scroll_arc2.json.gz` (Arc 2 — after, 1.9 MB)

| Marker | Arc 1 | Arc 2 | Δ |
|---|---|---|---|
| RootErrorBoundary render (App re-renders) | 151 | **8** | −95% |
| RootErrorBoundary patch (whole-tree, sum) | 705 ms | **7 ms** | −99% |
| SidebarWidget render | 151 | 8 | rail fully nav-decoupled |
| TreeWidget render (p50 / sum) | 2.18 ms / 318 ms | 1.42 ms / 211 ms | −34% sum |
| StatusBar patch p50 | 0.33 ms | 0.16 ms | patches in isolation |
| BoardWidget render+patch | ~2.75 ms | ~2.75 ms | unchanged (genuine board update) |
| RefreshObserver (frame) p50 | 14.70 ms | 14.09 ms | −4% |
| Perform microtasks p50 | 18.14 ms | 17.61 ms | −3% |
| Total main-thread CPU | 4742 ms | 4601 ms | −3% |

**App went from re-rendering on every navigation step to 8 times total**
(only genuine structural changes — board/tab switches — not navigation).
`SidebarWidget` 151→8 independently confirms the mechanism: the rail was
re-rendering *because* App did (`v-show` force-update); with App quiet on
nav, it stops.

Cumulative across Arc 1 + Arc 2: whole-tree-reconcile-on-navigation
eliminated; frame p50 15.5 ms → 14.09 ms (−9%).

### Honest framing of the residual

The frame budget improvement is modest (−4% this arc, −9% cumulative)
because the per-frame cost is now dominated by *genuinely-needed* work,
not waste: `BoardWidget` render+patch (board + analysis overlays,
~2.75 ms), `TreeWidget`'s SVG render (~1.42 ms), `StatusBar`, plus the
analysis-panel recompute (regime A) and browser layout/paint. Arc 1+2
removed the architectural waste (the whole-tree re-render); further frame
reduction is the analysis-panel refactor's territory (the analysis
recompute) and, secondarily, board/tree render optimisation.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` — 746 passed, 3 skipped (no regressions).

## Residual findings (flag, not this arc)

- `TreeWidget` re-renders the full SVG tree per nav (~1.42 ms; the node
  `<g>` elements are already `v-memo`'d, but `nodeList`/`edges` computeds
  + the outer render run). Candidate for further memoisation; lower
  priority than the analysis refactor.
- Analysis-subtree recompute (regime A) — folded into the analysis-panel
  refactor (Future project).
- Regime B (navigation during a live range query) — still queued; needs
  its own capture.

License: Public Domain (The Unlicense).
