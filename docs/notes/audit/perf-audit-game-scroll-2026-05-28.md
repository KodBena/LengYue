# Performance Audit — Game-Scroll Navigation (2026-05-28)

Profile-substantiated diagnosis of the per-navigation cost during
fast move-by-move scrolling, plus the staged fix plan. Investigation
was read-only; this note is the **before** anchor for the
before/after arc that follows (ADR-0009 acceptance criteria), the
memorisation aid for the implementation, and the audit-trail record
of which regime each finding belongs to.

Authored 2026-05-28/29. Per the ADR-0002 documentation corollary,
all `file:line` citations are re-checked against current code at fix
time.

## Profile

- `~/perf-profiles/game_scroll_ee1ae205.json.gz` — 2.0 MB gzipped,
  8.024s wall, captured 2026-05-28 at HEAD `ee1ae20`.
- **Scenario:** range analysis obtained over the game first (so board
  overlays render — a deliberate "max objects" stress), one warm-up
  scroll to settle caches, then **record while holding an arrow key
  to scroll the active board move-by-move**, Analysis tab open. **Two
  boards open.**
- **No live analysis streaming during the capture.** Every analysis
  read is from the already-populated ledger. This is a *pure-navigation*
  workload (regime A below).
- Tooling per ADR-0009: `@firefox-devtools/profiler-cli` v0.2.1 +
  Vue's `app.config.performance` UserTiming markers.

## Headline numbers (regime A — pure navigation)

Main thread (`t-3`) busy 5116 ms / 8.024 s (~64%). 354 keydowns
rAF-coalesced to ~167 update cycles (~23 effective update-fps).

| Marker | n | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| RefreshObserver (whole frame) | 183 | **15.5 ms** | 23.4 | 43.1 | 43.3 |
| Perform microtasks (Vue flush) | 174 | 21.8 ms | 28.9 | 36.3 | 59.7 |
| **RootErrorBoundary patch** (= whole-tree reconcile) | 167 | **11.0 ms** | 17.0 | 22.4 | 34.3 |
| **SidebarWidget patch** (the board rail) | 167 | 3.4 ms | — | 12.8 | 17.3 |
| BoardTab render (×2 boards) | 334 | 1.4 ms | 4.0 | 8.1 | 12.6 |
| TreeWidget render | 159 | 2.15 ms | — | 5.6 | 5.9 |
| BoardWidget patch (⊇ BoardTab main board) | 159 | 2.25 ms | — | 5.3 | 6.2 |
| LongTask | 11 | — | — | — | 136 |

The median frame sits at the 60 fps cliff (15.5 ms); p95 frames drop.
Findings are sustained (median ≈ avg), not front-loaded startup.

## Root cause

**App.vue re-renders on every navigation.** Its template reads the
move cursor directly — `activeBoard.currentNodeId` (App.vue:473),
`.turn`/`.captures` (462–463), and `moveNumber` (the
node-chain-walking computed, 258/461). Those fine-grained deps fire
on every step, so App's render fn re-runs and the whole vnode tree
is re-patched (the 11 ms RootErrorBoundary patch).

**The board rail re-renders as a consequence.** Two mechanisms,
both active:

1. `SidebarWidget` carries `v-show` (App.vue:388). Vue's
   `shouldUpdateComponent` short-circuits `if (nextVNode.dirs) return
   true` — so a component vnode bearing a directive is **force-updated
   on every parent (App) re-render**, regardless of prop/listener
   stability.
2. `mutateBoard` (store/index.ts:148) does `store.boards[index] = {
   ...board }` after the in-place `fn(board)`, which writes the array
   element and so fires `SidebarWidget`'s `v-for` array dep
   independently.

The rail's expensive content is the per-tab rug-plot meter
(`BoardTab.vue` `rugPlot`, a `ledger.getRaw` + colour-LUT walk over
the whole variation path) rendered for **both** boards on every step
— the inactive board's tab is pure waste.

### Correction recorded (regime confusion)

An earlier pass mis-attributed the analysis-panel re-renders
(`AnalysisChartPanel` ×679, etc.) to "streamed KataGo packets."
There was **no streaming** in this capture. Those re-renders are
navigation-driven recompute from the *cached* ledger as the cursor
moves; the analysis subtree self-subscribes to per-position data and
re-renders at a finer cadence than the board (≈272 vs ≈167), painting
intermediate positions the board coalesces away. This vindicates the
suspicion that the Analysis tab is heavy — it is — but the mechanism
is navigation, not arrivals.

## Two regimes (kept in separate arcs for a clean trail)

- **Regime A — pure navigation** (this profile). Whole-tree re-render
  + rail re-render + analysis-subtree recompute-from-cache.
- **Regime B — navigation *during* a live range query + parallel
  tasks** (the user-perceived sluggishness; *not* captured here). A
  strictly additive regime: regime A **plus** per-packet work. The
  regime-A baseline already has ~zero frame headroom, so any
  per-packet work in B reliably drops frames — the perception is
  mechanically plausible. Substantiating it needs a regime-B capture
  (`game_scroll_during_range_*.json.gz`). The packet receive path is
  synchronous/unchunked (see `perf-audit-nav-and-pv-hover-2026-05-27.md`
  Bug C + its incidental finds); fixes there are **deferred to the
  regime-B arc**.

## Separability verdict

| Finding | Regime-A attributable | Separable from packets | Disposition |
|---|---|---|---|
| `{...board}` identity-replace → array-dep churn | yes | **yes** — packet path mutates `board.lastActivity` *directly* (analysis-service.ts:919), never via `mutateBoard` | **Arc 1** |
| Rail re-renders all BoardTabs per nav | yes | yes | **Arc 1** (v-memo) |
| App whole-tree re-render (11 ms patch) | yes | yes | **Arc 2** (App-decouple) |
| Analysis-subtree over-render (uncoalesced; `AnalysisChartPanel` ~2.5×/step) | yes (A) | **no** — re-renders on *both* cursor change and ledger change; shared machinery | **Analysis-panel refactor** (its baseline is this profile too) |

## ADR-0004 consumer audit (for the store edit)

Confirmed **safe** to drop `store.boards[index] = { ...board }` while
keeping `boardsVersion.value++`:

- `navigateTo`/`navigateNext`/`navigatePrev`/`navigateVariation`
  (engine/navigator.ts) mutate `state` purely **in place** — no
  reliance on the caller's shallow copy.
- **No `watch` is keyed on `activeBoard` identity.** Every
  `activeBoard.value` use is a field read, a null-guard, or a
  local-variable identity check in `handlePastePv` (App.vue:360).
- **SyncService** watches `boardsVersion.value` (the counter), not
  identity (sync-service.ts:182–199, with a confirming comment) —
  keeping the bump preserves debounced persistence exactly.
- `useVariationPath` no longer reads `boardsVersion` (the prior
  2026-05-27 O(1) `boardsById` fix removed that).
- The two board `watchEffect`s (autonomous-srs `waitForCondition`,
  use-pv-animation config-sync) do not touch board identity.

`updateBoardState` (store/index.ts:425, the move-play path) and the
reset/hydrate sites still replace identity — intentional and out of
this arc's scope (the profiled workload is navigation via
`mutateBoard`).

## v-memo safety (for the rail edit)

`useActivityDecay` (composables/analysis/useActivityDecay.ts) decays
the geiger-dot `energy` via its own `requestAnimationFrame` loop.
`v-memo` only skips **parent-driven** patches when its key is
unchanged — it does **not** disable a child component's own reactive
render effect. So the geiger keeps animating off `BoardTab`'s own
effect; `v-memo` only suppresses the wasteful forced re-render
`SidebarWidget` pushes down when App re-renders. The rug-plot
likewise updates via `BoardTab`'s own deps. The memo key carries only
the parent-driven inputs `BoardTab` cannot self-source: `[board,
index, store.activeBoardIndex === index, getReviewState(board.id)]`
— `board` (object identity) catches structural replacement
(move-play); the rest catch label / active-highlight / review-border.
Dropping `{...board}` is the prerequisite that keeps `:state`'s proxy
identity stable so the own-effects fire on in-place mutation.

## Staged fix plan

- **Arc 1 (this arc — low risk, contained).**
  1. `mutateBoard`: drop `store.boards[index] = { ...board }`, keep
     `boardsVersion.value++`.
  2. `SidebarWidget`: `v-memo` the `BoardTab` `v-for`.
  Expected: rail per-nav cost goes O(open-boards) → O(1) (the inactive
  tabs stop re-rendering), `boardsById`/`activeBoard` stop churning.
  App still re-renders (Arc 2 territory). **Measure** against this
  profile.
- **Arc 2 (App-decouple — moderate).** Move the cursor reads
  (`turn`/`captures`/`moveNumber`/`currentNodeId`) out of App.vue into
  `StatusBar`/`TreeWidget` so App stops re-rendering on navigation →
  kills the 11 ms whole-tree patch and the `v-show` force-updates.
  Requires Arc 1. Own before/after.
- **Regime-B arc (packet path).** Capture-during-range-query;
  attribute the per-packet cost; address the synchronous/unchunked
  receive path. Deferred until after Arc 1/2.

## Acceptance (ADR-0009)

- **Before:** `game_scroll_ee1ae205.json.gz` (above).
- **After (Arc 1):** to be captured under the same scenario (two
  boards, hold-arrow scroll, Analysis tab open, range analysis
  pre-loaded) once Arc 1 lands. Comparison axis: SidebarWidget patch
  count/duration and BoardTab render count (expect the inactive
  board's ~167 renders to disappear).

## References

- `docs/adr/0009-performance-investigation-discipline.md`
- `docs/notes/audit/perf-audit-nav-and-pv-hover-2026-05-27.md` — sibling
  arc; its Bug C + incidental finds are the regime-B substrate.
- ADR-0004 (minimal-touch) — gated the store edit above.

License: Public Domain (The Unlicense).
