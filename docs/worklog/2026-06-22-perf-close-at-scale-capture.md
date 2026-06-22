# Worklog — close-at-scale capture: the board-count-scaling close path (2026-06-22)

- **Date:** 2026-06-22
- **Sub-project:** `frontend/`
- **Genre:** ADR-0009 measurement (a capture + its findings) + the band-aid
  triage for the smells it surfaced. The deep "why did this recur" analysis is
  the companion postmortem
  (`docs/notes/postmortem/postmortem-close-at-scale-tab-strip-2026-06.md`,
  commissioned same day); this worklog is the capture record and the interim
  mitigation, not the root-cause-of-the-recurrence account.

## Why

A maintainer report: with very many boards open (~220, reached by running the
jank test repeatedly), **closing or switching a board became really slow.** The
2026-06-12 jank-extended study validated the SPA at **16 boards** (p50 ~14 ms,
no regression); 220 is ~14× past anything measured. A static read pointed at the
SyncService deep-watch; the maintainer asked for an at-scale capture so the
profile could rank the costs across every system the close path touches —
"performance smells that are only visible at this scale."

## The scenario (`close-at-scale`)

New CDP-drivable `PerfScenario` (`frontend/src/composables/perf/closeAtScale.ts`,
registered in `scenarios.ts`), built on a new `setUpManyBoards` in
`jankSubstrate.ts` (samples ≤50 distinct library games, fetches their bodies
once, fills N boards by cycling them — each board parses its own independent
tree, so the per-board store/tree state is genuine while setup HTTP stays
bounded). Shape:

1. **setup** — build ~230 boards, each forwarded to move 50 (or its last move).
2. **presettle** — 2 s, so the post-setup persistence tail drains before the
   measured phase.
3. **closeall** — close every board in the **heaviest order**: always the front
   board (index 0), made active, **one close per animation frame**. Front-close
   maximises the array-splice shift (O(N)/close) *and* — as it turned out — the
   reindex storm (below); one-per-frame keeps each close a separate reactive
   flush + paint (a synchronous burst would let Vue dedupe the watchers to one
   end-of-burst flush, hiding the per-close cost). `closeBoard` floors the
   workspace at one board, so the loop ends on a single fresh board.
4. **drain** — 2 s, capturing the final debounced whole-workspace persist.
5. `finally` — `ctx.resetWorkspace()`. Additive-neutral: no rail board survives.

No analysis (no proxy): the dominant close-path costs don't need it, and
analysis on 230 boards is impractical. Run: headed Chromium on X11 `:0`, vite
8.0.8, main @ bbd4fe8b, 230 boards. Trace (374 MB, off-repo per ADR-0009):
`~/w/vdc/chromium_profiles/close-at-scale-2026-06-22T15-31-22-384Z.json`.

## Findings (the profile re-ranked the static diagnosis)

Plot: `~/plots/close-at-scale-cost-vs-remaining.png` (time + space vs. boards
still open). CSVs: `~/plots/close-at-scale-{closes,counters}.csv`.

### 1. O(N²) close-time render storm — ~78% of close-phase CPU *(the new #1)*

`BoardTab` re-rendered **26,797** times across 230 closes. The sum of "boards
remaining at each close" (∑ 231…2) is **26,795** — identical: *every close
re-renders every remaining tab.* Root cause is `index` in the tab's `v-memo`
key, `frontend/src/components/chrome/SidebarWidget.vue:137`:

```html
<BoardTab v-for="(board, index) in store.boards" :key="board.id"
  v-memo="[board, index, store.activeBoardIndex === index, getReviewState(board.id)]" … />
```

`:key` is correctly `board.id`, but closing a board reindexes every later board
→ each remaining tab's `index` changes → the memo busts for all of them → each
re-renders, doing a full variation-path walk for its rug-plot meter (~1.10
ms/tab). Per-close main-thread fit: **36 ms fixed + 1.10 ms/board** (~290 ms/close
at 230 open); **37.8 s** cumulative main-thread time to close 230 boards. Note
**render÷patch = 1.00** — this is NOT the classic render≫patch coupling the
existing nets watch for; it is a parent-memo-bust storm over an un-virtualized
O(N) list. Front-close (the heaviest order) maximises it; back-close would have
been ~O(N) total.

### 2. DOM / listener retention leak on the close path *(under-called on first pass; corrected)*

Over the run (closing 229 of 230 boards) live **DOM nodes climbed 6,669 →
105,503 (×15.8, peak 185,531)** and **JS event listeners 1,517 → 13,857 (×9.1,
peak 20,724)** — i.e. closing a board does NOT promptly reclaim its tab DOM /
listeners; they accumulate, with two batch GC teardowns (node-drops ~122k at
remaining≈131 and ~128k at remaining≈55). 105k nodes still live at **2** boards
is gross over-retention. The JS heap saw-tooths (145→121 MB, major GCs) and only
weakly tracks nodes (corr +0.34) — because DOM-node memory lives Blink/C++-side,
not in the V8 heap, so heap is not the leak signal; the `nodes` /
`jsEventListeners` counters are. The tab strip is also not virtualized (all N
BoardTabs, ~800 DOM nodes each incl. the mini-board, live at once). First-pass
read mistook the curve for a sampling artifact; the litmus (do nodes/listeners
go UP over the run? yes) refutes that. This is a resource-ownership-at-mutation-
sites class, distinct from finding #1.

### 3. Fixed per-close floor — ~22%, ~36 ms/close

The board-count-independent term: the active-board re-render on reselection (we
close the active board each iteration), the SyncService `{deep:true}` re-traverse
of per-board `store.session` cells (`src/services/sync-service.ts:188` — the
static diagnosis's #1, real but here only the floor), and the two per-board
reconcile watchers (`useAutoSaveAnalyses`, `useAppBootstrap`, on
`boardsSetVersion`). Diagnosed statically, not call-tree-split — a floor, not an
exact split.

## Band-aid mitigation (interim, low-risk)

- **#1 (78% of the cost):** drop `index` from the `v-memo` key. The only
  consumer is the "Board N" label; derive it without busting the memo — a CSS
  counter on `.thumb-list`, or a cheap separate label binding outside the memo.
  That turns a close from O(N) tab re-renders into O(1). Cheap, isolated to
  `SidebarWidget.vue`, does not touch the just-landed cycle-break close path.
- **#2:** needs the resource-ownership lens, not a one-liner — deferred to the
  postmortem + a tracked item (virtualise the strip so only visible tabs mount,
  and audit the tab/preview listener + detached-node lifecycle on close).
- **#3:** the SyncService deep-watch fix (version-counter instead of
  `deep:true` over `session`) stands from the static diagnosis; lower priority
  than #1.

Real-world note: nobody opens 200 boards, so this is not a user-facing fire —
it is recorded as a scale smell and a recurrence (see the postmortem). The
band-aid for #1 is worth taking regardless because it is nearly free.

## Status / housekeeping

- Capture is additive-neutral — the `local_user` workspace ends at one fresh
  board (the scenario's `finally` reset).
- New code build-gated: typecheck + build (1070 modules), eslint, cycle-check
  (0/0), band-conformance (30/30). Full vitest suite not yet run; not committed.
- Work-status items deferred to reconcile with the postmortem's proposals
  (filed as one coherent set once it returns).

License: Public Domain (The Unlicense).
