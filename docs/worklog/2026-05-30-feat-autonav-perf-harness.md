# Worklog — auto-navigate perf-capture harness (2026-05-30)

Mechanizes the *stimulus* side of the manual perf-capture protocol
(`docs/notes/perf-capture-normalization-protocol.md`): instead of holding an
arrow key under `xset r rate 195 62` and capturing a Firefox profile, a
dev-only toolbar button drives navigation to the last node at a fixed ~60/s
and tags each step with the analysis-queue state. No perf *claim* is made
here (ADR-0009) — this is the capture harness, not a measured result.

## What shipped

- **`src/composables/useAutoNavigatePerf.ts`** (new, `[B2]`). On `start()`:
  normalizes the scenario to **Analysis / Basic**, then a fixed-timestep rAF
  loop calls `useNavigation().next()` once per ~16.7 ms (`TARGET_NAV_HZ = 60`)
  until `activeBoard`'s current node has no children. Each step emits
  `performance.mark('autonav:step', { detail })`; `autonav:start` /
  `autonav:end` bracket the run. The accumulator caps per-frame catch-up so a
  janky frame doesn't burst-navigate, and pins the rate independent of the
  monitor's refresh (a 120/144 Hz panel would otherwise over-drive).
- **Marker detail** (`AutoNavMarkerDetail`): `step` (monotonic — the
  keydown-index analog the normalization protocol's fixed-window clip wants),
  `currentBoardId`, and the pure `summarizeAnalysisQueue(inFlight, boardId)`
  output — `queryOnCurrentBoard` / `queryOnOtherBoard` / `activeQueryCount` /
  `queryKinds`. So one capture partitions post-hoc into regime A (no query) /
  regime B (query on the navigated board) / analysis-on-another-board, the
  three-way distinction the manual protocol couldn't separate without
  separate sessions. `probe` / `match` kinds are excluded as non-board
  analysis load.
- **`src/composables/analysis/useAnalysisTabs.ts`**: added a dev-only,
  module-scoped forced-tab override (`__devForceActiveAnalysisTab`) so the
  harness can pin the dashboard's sub-tab to Basic. It does **not** touch the
  production per-instance `activeTabId` (whose reset-to-first-tab on dashboard
  remount may be intentional — Basic is the most-used default); the
  `import.meta.env.DEV` guard DCEs the override in production.
- **`src/components/chrome/Toolbar.vue`**: one `v-if="isDevBuild"` button
  beside the clear-cache affordance, toggling the harness. Logic stays in the
  composable (Toolbar is already over the ADR-0007 SFC budget). i18n keys
  `toolbar.autoNavPerf.{start,stop,title}`.

## Choices

- **`nav.next()` direct, not synthetic keydowns** (user call). The keydown
  dispatcher was already audited as cheap/localized (App doesn't re-render on
  nav — `perf-audit-range-query-nav-2026-05-29.md`), so skipping it loses
  almost nothing while avoiding coupling to the dispatch internals.
- **One step per ~16.7 ms frame** reproduces the *effective* held-key
  cadence: the dispatcher already rAF-coalesces nav keys to ≤1 nav/frame, so
  ~60/s matches both the observed ~58 keydowns/sec and the coalescing model.
  Fidelity to the X11 autorepeat jitter/back-pressure is intentionally
  dropped in favour of a clean, repeatable cadence.
- **Force Analysis/Basic on start** (user call) so the rendered panel set
  (ScoreLead + MergedDelta) is fixed across captures — that per-packet chart
  work is the dominant regime-B cost.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) green.
- **Validated in use.** The harness drove navigation to the leaf, the
  `autonav:*` marks landed in Firefox profiles, and the per-step queue
  detail partitioned the regimes correctly. It was exercised across a
  regime-B capture series and surfaced a real confounder (below) — which is
  the validation that matters.

## Surfaced and excised: the activity-decay geiger render-pump

The harness's first finding. `BoardTab`'s "geiger" activity dot was driven
by `useActivityDecay(() => state.lastActivity)` — a self-rescheduling
`requestAnimationFrame` loop that re-energized on every analysis packet and
decayed over ~90 frames, so during a streaming query it re-rendered
`BoardTab` (re-walking its O(path) rugplot) on essentially every frame.
Measured by render *count* (a structural proxy, not a few-ms timing claim):
~479 BoardTab renders in a regime-B capture with it live vs ~148 with it
gone — per-packet collapsing to per-nav.

Excised end to end: removed the geiger dot from `BoardTab.vue`, deleted the
orphaned `useActivityDecay.ts`, and ripped out the now-consumerless
`lastActivity` (the `BoardState` field, the per-packet write in
`analysis-service.ts`, the inits in `sgf-loader.ts` / `board-factory.ts`,
the store hydration). `vue-tsc` confirms no remaining references; the
structural argument — deleting a per-frame render pump — is the
substantiation, per ADR-0009's trivial-change exception.

A chart-update rAF-coalescing optimisation was also prototyped during this
arc and **reverted**: its local chart-patch cost dropped (~−35%) but did
not translate to a frame-level improvement once capture-to-capture
heaviness was accounted for (across four captures the frame p50
rank-ordered with a chart-independent component, not with the coalesce
flag). It leaves no code in this change.

## Docs

- `perf-capture-normalization-protocol.md` gains an "In-app capture harness
  (dev)" section and a note that `autonav:step` now supplies the keydown-index
  the fixed-window clip needs.
- `FILES.md`: new `useAutoNavigatePerf` entry; removed the deleted
  `useActivityDecay` entry; retagged `BoardTab`'s purpose line (geiger dot
  gone). No `FEATURES.md` entry — DEV-only diagnostic, not a user-facing
  surface.
- `SidebarWidget.vue`'s v-memo comment dropped its stale "geiger" reference.

License: Public Domain (The Unlicense).
