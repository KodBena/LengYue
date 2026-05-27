# Performance Audit — Fast-Nav and PV-Hover Jank (2026-05-27)

Source-code diagnosis of three performance bugs reported by the
project author on 2026-05-27. Investigation was read-only and
predates any code change; this note is the memorisation aid for
the implementation arc that follows and a reference for regression
prevention.

Gathered via two parallel read-only investigation agents on
2026-05-27. Per the ADR-0002 documentation corollary, all
`file:line` citations should be re-checked against current code at
fix time — agents read source at a snapshot.

## The three bugs

| Tag | Symptom | Independent? |
|-----|---------|--------------|
| **A** | Many open boards slow fast-nav (scroll OR arrows) | Composes with B |
| **B** | Keyboard nav jankier than scroll-wheel nav | Independent of A |
| **C** | PV hover janky during range query | Independent of A and B |

A and B compose multiplicatively — fixing B alone helps but doesn't
unwind A; fixing A reduces per-step cost which alleviates B as a
side effect.

## Bug A — Many open boards slow fast-nav

**Symptom.** Holding ArrowDown or spinning the wheel feels
progressively slower as more boards are open.

**Root causes, ranked by severity:**

1. **`useVariationPath` fans out across BoardTabs — O(N²) per nav
   step.** `src/composables/board/useVariationPath.ts:22-45`. Each
   `BoardTab` in the `v-for` over `store.boards`
   (`src/components/chrome/SidebarWidget.vue:73-78`) mounts a
   `useVariationPath` computed. The computed reads
   `boardsVersion.value` (bumped by every `mutateBoard`) AND calls
   `store.boards.find(b => b.id === boardId)`. The `find()` walks
   the reactive boards array, registering reactive deps on every
   entry — so mutating ANY board re-runs all N `useVariationPath`
   computeds, each doing an O(N) find. 10 boards = 100 walks per
   nav step. Downstream `rugPlot` / `useEnrichedData` are protected
   by the fingerprint short-circuit (lines 37-39), but the per-tab
   computed itself still runs.

2. **`useAutoSaveAnalyses` global watcher iterates all boards on
   every `mutateBoard`.**
   `src/composables/useAutoSaveAnalyses.ts:144-183`. Reactive
   getter runs `for (const board of store.boards)` and calls
   `analysisPersistenceService.dirtyVersionFor(board.id)` per board.
   O(N) per nav step.

3. **`useAppBootstrap` analysis-persistence restore watchEffect
   iterates `store.boards`.**
   `src/composables/auth-app/useAppBootstrap.ts:305-322`. Inner
   work short-circuits via `restoredBoards.has(id)` after first
   restore, but the iteration itself is O(N) per nav step.

**Eliminated as cause.** `SyncService.scheduleSync` is O(1) per
step — just `clearTimeout` + `setTimeout`. The expensive
`JSON.stringify` of the full store fires only after the 1s debounce
settles, and fast-nav coalesces into one PUT.
(`src/services/sync-service.ts:200-216, 257-286`.)

## Bug B — Keyboard nav jankier than scroll-wheel

**Symptom.** Holding ArrowDown stutters more than scrolling the
wheel, even with few boards open.

**Root cause.** Scroll handler rAF-coalesces; keydown handler
doesn't.

- `src/composables/useScopedScroll.ts:14-30` — each wheel event
  cancels the prior `requestAnimationFrame` and reschedules; within
  a 16.7ms frame, only the last `deltaY` produces a `nav.next/prev()`
  call. Caps nav rate at 60Hz.
- `src/composables/useUserIORegistry.ts:16-126` — each `keydown`
  processes synchronously: `case 'ArrowDown': nav.next()` fires
  immediately. OS-level key repeat (~30Hz Linux default) produces
  one `mutateBoard` per repeat, each triggering Bug A's fan-out,
  the SFC re-render cascade, and (if pondering) a "Follow Me"
  `analyzeActiveNode` re-issue (`src/App.vue:121-133`).
- If per-step cost exceeds ~33ms, the keydown queue backs up →
  janky feel. Scroll's rAF coalescing structurally avoids this.

**Secondary effect.** Faster keyboard fire rate also means more
"Follow Me" ponder restarts (each cancels and re-issues a proxy
query). rAF coalescing also reduces this churn.

## Bug C — PV hover janky during range query

**Symptom.** Hovering a principal-variation suggestion is janky
during a range query; smooth otherwise.

**Root causes:**

1. **`MoveSuggestions.vue`'s `watch(packet, ...)` rebuilds the PV
   on every same-node packet.**
   `src/components/board/MoveSuggestions.vue:133-137` watches the
   `packet` computed from
   `src/composables/board/use-move-suggestions.ts:77-79`. Each
   coalesced rAF flush in
   `src/composables/analysis/analysis-ledger.ts:60-72` re-fires
   `startPv` → `clearTimers()` + per-stone
   `setTimeout(setVisible, 1)` + reallocates `visible.value` Set
   (`src/composables/board/use-pv-animation.ts:142-146, 185-229`).
   With `fadeDurationMs > 0`, each rebuild restarts the CSS
   opacity transition for the same stones — directly visible as
   flicker / jank. The retained-stones short-circuit at
   `use-pv-animation.ts:199-202` doesn't help: `visible.value` is
   still reassigned, invalidating the `displayStones` computed and
   re-rendering the entire `<g v-for="stone in displayStones">`.
   The `watch(packet, ...)` was added to keep the PV current
   during pondering but doesn't distinguish ponder packets from
   range-query packets.

2. **`useEnrichedData` + `useAnalysisTimeline.visitVector`
   invalidate on every range-node packet → reactive cascade.**
   `src/composables/analysis/useEnrichedData.ts:115-148` and
   `src/composables/analysis/useAnalysisTimeline.ts:42-49` call
   `ledger.getRaw` for every NodeId in `variationPath`. A packet
   to any path node bumps that node's version ref → both
   computeds re-evaluate from scratch. The fresh `mainSeries`
   reference fires `BaseChart.vue:491`'s
   `watch(() => props.series, updateOptions)` → ECharts
   `setOption` on main thread, plus `useTriangularHeatmap`
   recompute (`useTriangularHeatmap.ts:46-87`) and HeatmapChart's
   `applyData` (`HeatmapChart.vue:186-198`, throttled). The rAF
   coalescer in `analysis-ledger.ts:36-72` batches per-frame but
   doesn't amortise across frames. Several consecutive frames of
   recompute + setOption starves the rAF tick the PV's CSS
   transition needs.

3. **(Conditional)** `normalizePacketToWhiteFraming` allocates a
   new ownership array per packet when framing is non-WHITE.
   `src/engine/katago/winrate-framing.ts:130` does
   `packet.ownership.map(negateScalar)` synchronously inside
   `onAnalysisUpdate` (`src/services/analysis-service.ts:906`).
   361 floats per packet; only relevant when
   `reportAnalysisWinratesAs` is set to non-WHITE. Seeded default
   is WHITE per the umbrella handoff doc's "The frontend" §269-316.

## Multi-tasking preservation requirements

The project author flagged on 2026-05-27 that the SPA's
multi-tasking paradigm must remain intact under any fix.
Concretely:

- Range queries AND ponder queries can run simultaneously on a
  single board, and continue running when the user switches to
  another board.
- The ledger continues consuming packets for non-active
  (background) boards.
- The activity indicator in the board list continues to update
  when packets arrive at any board, active or not.

**Verification gate.** Before any fix that converts global
`boards` watchers to per-board watchers (Fix #4 below), confirm:

- The per-board watcher is set up at every board-open, not only
  at the active board's mount
- The watcher fires on packet-driven dirty changes regardless of
  active-board state
- The cleanup at `closeBoard` / `resetWorkspace` correctly tears
  down the per-board watcher (composes with audit pair O13 at
  `src/store/index.ts`)
- The activity indicator's reactivity source remains
  board-agnostic (likely reads from a per-board packet-arrival
  timestamp)

**Verification results (read-only investigation, 2026-05-27).**

*Activity indicator.* The "geiger dot" in
`src/components/board/BoardTab.vue:137-142`, rendered one per board
in `src/components/chrome/SidebarWidget.vue:73-84`'s v-for over all
`store.boards`. Powered by `useActivityDecay`
(`src/composables/analysis/useActivityDecay.ts:22-26`) watching the
reactive `state.lastActivity` timestamp on each board, regardless of
`activeBoard`.

*Packet receive path.* `AnalysisService.onAnalysisUpdate`
(`src/services/analysis-service.ts:874-950`) resolves the target via
`queryInfo.boardId`, not `activeBoard`. Three per-packet sinks:
`ledger.record` (keyed by `(configHash, nodeId)`),
`board.lastActivity = Date.now()`, and
`analysisPersistenceService.markDirty(boardId)` on authoritative
finals. Grep for `activeBoard|activeBoardIndex` in
`analysis-service.ts` returns zero hits. **Confirmed board-agnostic.**

*Per-fix safety:*

| # | Verdict | Condition |
|---|---------|-----------|
| 1 | SAFE | Keyboard handler only runs for active board (`useUserIORegistry.ts:33`); never reaches packet path. |
| 2 | SAFE | Pure read of board state. CONDITION: the `boardsById` dictionary must be kept in sync at every mutation site that currently bumps `boardsVersion` — `addBoard`, `closeBoard`, `updateBoardState`, `updateFromRemote`, `resetWorkspace`, and `mutateBoard`'s spread-assign. Omitting any is a silent staleness bug. |
| 3 | SAFE | `MoveSuggestions` is mounted only on the active board (`App.vue:333-336` v-if). |
| 4 | RISKY-CONDITIONAL | Auto-save is load-bearing for background boards. Per-board conversion preserves the property iff: (a) every board-introduction path installs the watcher — `addBoard` (`:202`), `updateFromRemote`'s reassign (`:515`), `resetWorkspace`'s reset (`:485`), and the initial-board literal (`:49`); (b) every board-removal path tears it down — `closeBoard`, `updateFromRemote` bulk, `resetWorkspace` bulk; (c) the per-board watcher reads `dirtyVersionFor(boardId)` reactively (don't regress to non-reactive access). |

*Fix #4 implementation sketch.* Pair a `registerBoardWatchers(boardId)`
helper with a `boardWatcherStops: Map<BoardId, () => void>` module
map inside each composable. `closeBoard` gains audit pair O15
(per-board watcher dispose + pending-timer cancellation; ordering:
cancel timer **before** dispose so a queued microtask can't race);
`resetWorkspace` gains O16 (bulk variant before the
`store.boards = [createInitialBoard()]` reset). `updateFromRemote`'s
bulk reassign is the trickiest case — likely tear-down-all + rebuild
via diff over old vs new board IDs.

*Runtime gaps closed only by live observation:*
- `updateFromRemote`'s transient-window behaviour during a hydrate
  (whether the current global watcher silently re-converges, or
  there's a window where old-boards dirty versions still influence
  scheduling). DevTools observation of `pendingTimers` across a
  hydrate would close.
- Vue `Map` reactivity granularity — whether
  `watch(() => svc.dirtyVersionFor(b.id))` for a key not-yet-present
  fires when first inserted. A Vitest integration test would close.
- Fix #1's `preventDefault` synchronicity inside rAF — the `handled`
  flag in `useUserIORegistry.ts:36-125` is set inside the switch;
  `preventDefault` may need to move pre-switch with a coarser
  predicate. Implementation detail, not a multi-tasking concern.

## Proposed fix sequence

| # | Fix | Bug | Files | Notes |
|---|-----|-----|-------|-------|
| 1 | rAF-coalesce the keydown nav | B | `useUserIORegistry.ts` | Mirror `useScopedScroll`'s pattern; single-file |
| 2 | `useVariationPath` → O(1) lookup | A.1 | `useVariationPath.ts` + small store addition | Highest impact; structural addition to store |
| 3 | PV hover packet-watch guard | C.1 | `MoveSuggestions.vue` + maybe `use-pv-animation.ts` | Don't restart timers when PV structurally unchanged |
| 4 | Global → per-board watchers | A.2 + A.3 | `useAutoSaveAnalyses.ts` + `useAppBootstrap.ts` + `closeBoard` cleanup | Gated on multi-tasking verification |

#1 + #2 likely resolve the bulk of user-perceived nav jank.
#3 independent. #4 gated on the verification above.

## Open questions

- **Regression or always-been-there?** Cause A.2
  (`useAutoSaveAnalyses`) was introduced when analysis-persistence
  shipped. If slowness recently worsened, that's the proximate
  cause. If always there, the `useVariationPath` O(N²) (A.1) is
  older.
- **Does PV-hover jank also happen during ordinary pondering
  (no range query)?** If yes, fix is "guard the watcher to only
  fire on actual PV changes" — same fix applies. If no, range
  queries have an extra path worth checking.
- **Verification gate for Fix #4** — see above.

## Incidental finds (flag, don't fix now)

- `mutateBoard` triggers reactivity through both
  `store.boards[i] = ...` shallow spread AND `boardsVersion.value++`
  (`src/store/index.ts:103-110`). Two trigger paths for the same
  logical change; any optimisation that suppresses notifications
  must skip both.
- The "Follow Me" watcher (`src/App.vue:121-133`) doesn't
  throttle — one proxy stop+start per keystroke when pondering.
- `MoveSuggestions.vue:249` re-evaluates inline `pointerEvents`
  style on every disc per packet because `suggestions` array
  reference changes (`use-move-suggestions.ts:92` is `flatMap`).
- `use-pv-animation.ts:148-181`'s `scheduleWindow` self-schedules
  cycle timers; `clearTimers()` mid-cycle wipes them, visible as
  an animation "reset". Unrelated to hover-jank symptom but a
  sibling issue.
- No `requestIdleCallback` or work-chunking anywhere in the
  packet receive path — every packet's normalisation + merge is
  synchronous in the WS handler.

## References

- ADR-0002 (fail loudly) — applies to perf regressions too
- ADR-0004 (minimal-touch) — Fix #2's store addition needs full
  visibility into the store's shape before edit
- The frontend `CLAUDE.md`'s "Resource ownership at mutation sites"
  section — load-bearing for Fix #4
- The umbrella handoff doc's "The frontend" section —
  architectural baseline
- The 2026-05-22 responsive-design audit under `docs/notes/` —
  sibling shape of "audit-then-incremental-fix-sequence"
