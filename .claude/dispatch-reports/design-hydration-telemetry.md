# Chart hydration Heisenbug: hypothesis survey + flight-recorder telemetry proposal

**Status:** proposal only, no implementation. **Audience:** commissioner.
**Author posture:** READ-ONLY design pass over `frontend/`; every claim below
is either a direct code citation (file:line) or explicitly flagged as
inference/uncertain. Read in full: `frontend/CLAUDE.md`, `frontend/FILES.md`
(lookup), ADR-0010 (render locality / canvas / imperative-escape), ADR-0021
(witness-construction discipline), `docs/handoff-current.md`'s Operational
notes.

---

## 0. Framing: what "multi-tasking" plausibly means

The bug report doesn't disambiguate, and the two readings point at
different code paths. Both are covered below rather than picked between,
since the telemetry design in Part 2 is built to discriminate them after
the fact rather than requiring the diagnosis up front:

- **(a) In-app tab switching** — the user flips between the SPA's own tabs
  (Library / Cards / Settings / Analysis / Other via `TabWidget`, or
  between open board tabs in the sidebar rail) while working.
- **(b) OS/browser-level backgrounding** — the user alt-tabs away from the
  browser entirely, or to another browser tab, while KataGo analysis keeps
  streaming in the background over the WebSocket.

---

## 1. Hypothesis survey

### H1 — `BaseChart`'s init-retry timer is never cancelled on unmount (HIGH confidence)

`src/components/charts/BaseChart.vue:517-525`:

```js
const initChart = async () => {
  await nextTick();
  if (!chartRef.value || chartRef.value.clientHeight === 0) {
    setTimeout(initChart, CHART_INIT_RETRY_MS);   // <- id never captured
    return;
  }
  chartInstance = echarts.init(chartRef.value, 'dark');
  ...
```

`onUnmounted` (`BaseChart.vue:600-614`) clears `markerTimer` and the
`dataThrottle`, disconnects the `ResizeObserver`, and disposes
`chartInstance` — but never clears this retry `setTimeout`. Compare the
sibling `src/components/charts/HeatmapChart.vue`, which does this
correctly: `initTimeout` is captured at `HeatmapChart.vue:205`
(`initTimeout = window.setTimeout(initChart, CHART_INIT_RETRY_MS)`) and
released at `HeatmapChart.vue:264` (`if (initTimeout)
clearTimeout(initTimeout)`). `BaseChart` has no `initTimeout` variable at
all — the two files diverge on exactly the resource `frontend/CLAUDE.md`'s
own "Resource ownership at mutation sites" section names as mandatory to
release.

**Mechanism.** `AnalysisControls` sits behind `TabWidget`'s default
`keepMounted: false` (`src/components/chrome/TabWidget.vue:16-30`, wired
at `src/App.vue:389` with no `keep-mounted` prop passed) — switching away
from the Analysis tab fully **unmounts** it (`v-if="keepMounted ||
modelValue === tab.id"`, `TabWidget.vue:69`), and switching back
**remounts** it fresh. Separately, `src/App.vue:331-333` remounts the
whole board panel via `v-if="activeBoard" :key="activeBoard.id"` on every
board-tab switch. Either path is a plausible reading of "multi-tasking":
flipping between the app's own tabs, or between open boards, while
analysis streams.

If a `BaseChart` instance's *first* `clientHeight` read comes back `0`
(plausible immediately post-remount, before flex layout has settled — a
known race independent of any tab-visibility mechanism) and the component
is unmounted again before the 100ms retry fires (a second quick switch),
`chartRef.value` is now permanently `null` for that dead closure. The
retry reschedules itself **forever**: it never satisfies `chartRef.value`
(the instance is gone) and nothing ever cancels it. Each such occurrence
leaks one perpetually-rescheduling closure holding onto the dead
instance's `props` capture. Under heavy tab-flipping ("multi-tasking" read
literally), these stack — directly analogous to the GC-lag finding in the
close-at-scale postmortem (`f0a518ac`, referenced in this repo's recent
git log). This doesn't just leak memory; a chart that hits this path
**never calls `echarts.init()` for that mount** — that specific hydration
silently never happens, which is exactly the reported symptom, and the
accumulation of orphaned timers doing `nextTick()` + forced-layout
`clientHeight` reads on a congested main thread is a plausible mechanism
for why a *later* mount's own retry gets delayed enough to be user-visible
as "won't hydrate" (a genuine Heisenbug: reproduction depends on switch
timing relative to the browser's own layout/paint schedule).

**Fixability note (not proposed here, flagged for the commissioner):**
this is a same-shape, same-file-pair fix as `HeatmapChart` already has —
capture the timer id, clear it in `onUnmounted`. Cheap, well-precedented,
independent of the telemetry work in Part 2.

### H2 — `active`/visibility composition gap: ResizeObserver-cached 0×0 dims (MEDIUM confidence)

This is the mechanism the task brief points at directly (ADR-0010's
imperative-escape pattern, step 3: "dimensions read once on resize... a
hidden tab has zero dimensions").

`BaseChart`'s `active` prop (`BaseChart.vue:27-118`) gates the
`setOption` paths but is wired **only** from `AnalysisChartPanel`'s own
per-panel header-collapse (`active-index-accessor` etc. bound at
`AnalysisChartPanel.vue:102`, `:active="expanded"`). It is **not**
composed with the ancestor chrome toggles at `src/App.vue:324`
(`v-show="store.session.ui.boardExpanded"`), `:346`
(`treeExpanded`), or `:370`/`:384` (`controlsExpanded`, the ancestor of
the entire `TabWidget` that hosts `AnalysisControls`). A chart that is
mounted and `active !== false` continues to receive `props.series`
updates and run `updateOptions` → `chartInstance.setOption(...)`
(`BaseChart.vue:299-418`) even while `controlsExpanded` is `false` and the
container is `display:none` (0×0). ECharts caches whatever size it was
last told; the only path back to correct dimensions is the
`ResizeObserver` on `chartRef.value` (`BaseChart.vue:530-533`) firing
`chartInstance?.resize()` when the ancestor becomes visible again.

Per spec this *should* fire reliably (an element transitioning from a
collapsed/`display:none` ancestor to a real rendered box is a genuine
content-box-size change), but this survey did not verify actual
browser behavior across engines for RO firing timing under an
ancestor-visibility toggle specifically — flagged as the actual open
question, not asserted as broken. If it does NOT fire promptly (or is
coalesced/delayed), the chart stays visually stuck at its last-known size
until an unrelated resize nudges it — a plausible, code-grounded
"hydration didn't happen" symptom that composes with either reading of
"multi-tasking" in §0.

### H3 — Timer/rAF throttling in a genuinely backgrounded browser tab (LOW-MEDIUM confidence)

`BaseChart`'s data-redraw throttle (`BASE_CHART_REDRAW_THROTTLE_MS`,
`src/composables/useThrottledSnapshot.ts:57-77`, `createTrailingThrottle`)
and the init-retry loop (H1) are both `setTimeout`-based, not
`requestAnimationFrame`-based — `grep` across `src/` found **zero** uses
of `visibilitychange`, `IntersectionObserver`, `document.hidden`, or
`visibilityState` anywhere in the frontend. Chrome and other engines clamp
background-tab timers (informally throttled toward ~1/s after the tab has
been hidden for roughly a minute); this would **delay** catch-up rather
than permanently prevent it, and would self-heal once the user returns and
the next timer fires. This is a plausible contributor to "seems broken"
if the user looks immediately upon returning, but a weaker root-cause
candidate than H1/H2 since it isn't a correctness bug, just a latency one
— worth instrumenting for (Part 2 does), not worth ranking above H1/H2 on
priors.

### H4 — A `watch` firing into a disposed chart post-unmount (LOW confidence, largely pre-mitigated)

Checked directly: `BaseChart.vue:600-614` already clears `markerTimer`
and cancels `dataThrottle` in `onUnmounted`, and every write path
(`updateOptions`, `updateMarker`, `updateAxisOnly`) null-guards on
`chartInstance`. This class is the one the codebase's own resource-
ownership discipline already caught for `BaseChart` — except for the
init-retry timer (H1), which is the one instance that discipline missed.
No further live watch-into-disposed-instance path was found in the read
window.

### Likelihood ranking

1. **H1** (leaked init-retry timer) — HIGH. Directly evidenced by a
   file-pair diff against `HeatmapChart`'s correct handling of the
   identical pattern; explains both a genuine "this mount never
   hydrated" case and a plausible aggravating mechanism for others.
2. **H2** (ancestor-visibility/RO composition gap) — MEDIUM. Matches the
   brief's own named footgun; the RO-firing-reliability half is
   unverified in this pass.
3. **H3** (background-tab timer throttling) — LOW-MEDIUM. Real effect,
   weaker fit to a **persistent** hydration failure vs. a transient lag.
4. **H4** (post-unmount watch) — LOW. Largely already mitigated; included
   for completeness per the brief's own suggested mechanism list.

---

## 2. Telemetry design: an in-SPA chart flight recorder

### Goal restated

No telemetry backend exists and none is proposed. The maintainer wants
enough recorded state that *after* the Heisenbug is next observed, a
developer can reconstruct what happened — not a live dashboard, not a
backend integration. Per ADR-0021 (witness-construction discipline), the
recorder must **observe the property directly** — chart lifecycle state
at the moment it changes, not a downstream symptom — so it can tell H1
from H2 from H3 apart after the fact, not just confirm "something was
wrong."

### Option space (justified, one recommendation)

| Option | Shape | Verdict |
|---|---|---|
| A. `console.debug` calls only, no aggregation | Sprinkle logs at existing sites (matches "loud console" ethos) | **Rejected as sole mechanism.** Console output is not retained past the devtools buffer's own cap and the user has to have devtools open *before* the bug occurs — defeats "reconstruct after the fact" for a Heisenbug that isn't anticipated. Still valuable as a *supplement* (see below). |
| B. Global mutable array on `window`, no service abstraction | `window.__chartEvents = []` pushed directly from `BaseChart.vue` | **Rejected.** No capacity bound (unbounded growth is its own leak, ironic for a leak-hunting tool), no branded event types, bypasses the project's type-driven-design and layering conventions for no benefit over C. |
| C. Service singleton (ring buffer) + thin composable wrapper for component call-sites | New `src/services/chart-flight-recorder.ts` (the effectful singleton: bounded buffer + `record()`), consumed via a thin `src/composables/analysis/useChartTelemetry.ts` (B1) so `BaseChart.vue`/`HeatmapChart.vue` call a composable, not a service, from a component — resolving the "no direct service calls from components" rule the same way `pushSystemMessage`'s producer/sink split does | **Recommended.** |
| D. `performance.mark`/`measure` + Performance panel only | Use the browser's own performance timeline | **Rejected as sole mechanism.** Marks don't survive a page reload, aren't queryable by the recorder's own logic (can't filter/join across chart instances programmatically without re-parsing the timeline), and most technical users won't have the Performance panel recording at the moment a Heisenbug happens. Could *complement* C (see below) but doesn't replace it. |

**Recommendation: C, supplemented by A's console-namespace convention for
discoverability and D's `performance.mark` calls as a free cross-check
for anyone who does have the Performance panel open.**

### Why a service, and why this specific split

`frontend/CLAUDE.md`'s layering: "Effects do not live in composables (they
live in services and are called from composables)"; "Components... No
direct service calls." Recording an event is exactly the "debounced
persistence"-shaped effect the Services layer already owns (the ACL
example is `backend-service.ts`; `system-message-sink.ts` is the more
directly analogous producer/sink pattern — many producers scattered
across services/state, one owner of the actual mutable list). The
recorder needs call-sites *inside* `BaseChart.vue`'s imperative
`initChart`/`updateOptions`/the `ResizeObserver` callback — i.e. directly
in a component's `<script setup>`, not behind a `watch`. The ESLint
import-boundary restricts `src/services/*` imports from `.vue` files, so
the same producer/consumer split `system-message-sink.ts` uses for
`pushSystemMessage` is the natural fit here too: a thin composable
(`useChartTelemetry()`) is the only thing `BaseChart.vue` imports; it
forwards to the service singleton. This is a one-file addition on each
side, not a new architectural pattern.

### Ring buffer shape

- **Fixed-capacity circular buffer**, not an unbounded array — this is a
  diagnostic tool for a leak-adjacent bug; it must not itself be a leak
  vector. Recommend **2000 events** capacity (a session with heavy
  tab-flipping across a handful of charts × dozens of events each stays
  well inside this before wrapping; each event is a small flat object,
  ballpark 150-300 bytes serialized, so worst case ~500KB resident —
  negligible against the SPA's existing per-board state).
- Implementation: array of fixed length + write index, overwrite oldest —
  no `Array.shift()` (O(n) per push at 2000 elements, avoidable).
- **Every event field is a plain, already-domain-typed value** — no PII,
  no move/position content, no SGF/user-authored text. See Privacy below.

### Event vocabulary (discriminated union, per the project's type-driven-design convention)

```ts
// Illustrative shape, not final — the point is the discriminant set and
// the fields each event carries, per ADR-0021's "observe the property
// directly" requirement: every event that could matter to H1/H2/H3/H4
// gets its own kind, not a generic "chart thing happened" bucket.

type ChartFlightEvent =
  | { kind: 'chart-mount';       chartId: ChartInstanceId; label: string; t: FlightTimestamp }
  | { kind: 'chart-unmount';     chartId: ChartInstanceId; t: FlightTimestamp }
  | { kind: 'init-attempt';      chartId: ChartInstanceId; attempt: number; dims: Dims; t: FlightTimestamp }
  | { kind: 'init-deferred';     chartId: ChartInstanceId; attempt: number; reason: 'zero-height'; t: FlightTimestamp }
  | { kind: 'init-success';      chartId: ChartInstanceId; attempt: number; dims: Dims; t: FlightTimestamp }
  | { kind: 'resize-observed';   chartId: ChartInstanceId; dims: Dims; t: FlightTimestamp }
  | { kind: 'set-option';        chartId: ChartInstanceId; path: 'full' | 'data' | 'axes' | 'marker'; seriesCount: number; t: FlightTimestamp }
  | { kind: 'active-changed';    chartId: ChartInstanceId; active: boolean; t: FlightTimestamp }
  | { kind: 'document-visibility'; hidden: boolean; state: DocumentVisibilityState; t: FlightTimestamp };

// Every event (not just 'document-visibility') is stamped with the
// document's CURRENT visibility at record time — cross-cutting this onto
// every row, not just the dedicated visibility event, is what lets a
// post-hoc read filter/join "what was happening while backgrounded"
// without reconstructing state from the nearest preceding visibility
// event by hand. This is the single field that discriminates H3 from
// H1/H2/H4: if init-deferred/resize-observed events cluster while
// hidden===true and never resolve after hidden flips back to false
// within a reasonable window, that's H2/H3; if an init-attempt sequence
// simply stops (no matching init-success, ever, for a chartId whose
// chart-unmount already fired) with hidden===false throughout, that's H1.

interface FlightTimestamp {
  readonly monotonicMs: number;   // performance.now() — ordering/deltas
  readonly wallClockIso: string;  // new Date().toISOString() — "around 3pm" correlation
}
interface Dims { readonly w: number; readonly h: number; }
```

`ChartInstanceId` — a branded, client-local, monotonic counter minted
once per `BaseChart`/`HeatmapChart` `setup()` call (module-scope counter,
per-instance id — not the "module-intent state in `<script setup>`"
footgun, since the *counter* is legitimately shared module state; what's
per-instance is the *value it hands out*). `label` on `chart-mount`
carries the human-legible panel name (`AnalysisChartPanel` already has a
`label` prop, e.g. "Score Lead", "Player Delta") so a dump is readable
without cross-referencing ids by hand.

### How each hypothesis is confirmed or killed (ADR-0021: observe the property, not a symptom)

- **H1 (leaked retry timer):** a `chart-mount` with a matching
  `chart-unmount` but **no** `init-success` between them, followed by
  `init-attempt` events continuing to append **after** the
  `chart-unmount` timestamp for the same `chartId` — that continuation
  past unmount is the tripwire; its mere presence (any post-unmount
  `init-attempt` for a dead `chartId`) is unambiguous, since correct code
  has none. Confirms H1 outright; its absence across a captured session
  kills it.
- **H2 (ancestor-visibility/RO gap):** a `set-option` event for a
  `chartId` whose most recent `resize-observed` (or `init-success`)
  `dims` is `{w:0,h:0}` (or below a sane floor), **not** immediately
  followed by a fresh `resize-observed` with real dims before the next
  `set-option` — i.e., data kept being pushed into a chart the recorder
  can see was sized zero, and no resize ever corrected it. Confirms H2;
  if every zero-dims window is promptly followed by a corrective
  `resize-observed`, H2 is killed regardless of how often the ancestor
  toggles.
- **H3 (background-tab throttling):** `init-attempt`/`set-option` gaps
  (delta between consecutive `monotonicMs` for the same `chartId`)
  materially exceeding their configured interval (`CHART_INIT_RETRY_MS`,
  `BASE_CHART_REDRAW_THROTTLE_MS`) **specifically and only** while
  `document-visibility.hidden === true` throughout the gap — confirms a
  throttling delay; if the chart still reaches `init-success` shortly
  after the matching `document-visibility{hidden:false}` event, it kills
  H3 as a *persistent*-failure explanation (demotes it to "expected
  latency," not a bug).
- **H4 (post-unmount watch):** any `set-option` event timestamped after
  that `chartId`'s `chart-unmount` — same tripwire shape as H1 but on the
  data-path instead of the init-path. Its absence (which the codebase's
  existing `dataThrottle.cancel()`/`markerTimer` cleanup predicts) kills
  it; presence would mean a mitigation regressed.

This is exactly the "convert a negative claim into a positive
observation" move ADR-0021 Rule 2 names: instead of trying to prove "the
chart never re-hydrates" (unobservable directly), each hypothesis gets a
concrete, present-tense event pattern whose *appearance* is the
confirmation.

### Dump mechanism

Two channels, both driven off the same buffer read (no duplicated
capture logic):

1. **Console command** (primary, zero-friction, matches the project's
   own stated preference for "loud, filterable observability" and its
   existing namespacing convention, `kataproxy.*`, for per-subsystem
   filtering): expose a single namespaced global, e.g.
   `window.lengyue.chartRecorder.dump()`, printing via
   `console.table(events)` for scan-ability and returning the raw array
   for `copy(...)` / further filtering in devtools. This is the
   developer/technical-user-facing path the maintainer's own framing
   ("collect telemetry... reconstruct what is happening") points at
   directly.
2. **Settings-tab button** (secondary, discoverable without opening
   devtools): a "Copy Chart Diagnostics" button next to the existing
   "Force Persistence" button (`src/components/SettingsTab.vue:121`,
   established precedent for a debug-affordance in this exact panel).
   Serializes the buffer to JSON, writes to clipboard, and — per the
   project's console/system-log convention — pushes a `pushSystemMessage(
   'info', ...)` confirming the dump happened (visible in the existing
   `SystemLogPanel` surface, `App.vue:318-321`), rather than succeeding
   silently.

### Privacy and performance constraints

- **No board/game/SGF content, no move data, no user-authored text** in
  any event — only lifecycle metadata (dims, timestamps, counts, boolean
  flags, the panel's static `label`). `series` arrays and analysis
  payloads are never touched by the recorder.
- **Bounded memory** — fixed-capacity ring buffer (§ above), no
  unbounded growth; the recorder must not itself become a leak while
  hunting one.
- **Per-event cost is O(1) and allocation-light** — push a small object
  into a preallocated slot; no `JSON.stringify` on the hot path (only at
  dump time). Given the existing throttle cadences (`BaseChart` redraws
  at ≤4Hz per `BASE_CHART_REDRAW_THROTTLE_MS`), event volume per chart
  is bounded by design already — recording adds a fixed small constant on
  top of paths that are already throttled, not a new hot loop.
- **Dev/all-environments?** Recommend always-on (not build-flag-gated):
  the target user is technical (per `docs/handoff-current.md`'s
  Operational notes) and the whole point is catching an unanticipated
  Heisenbug in the wild, which a dev-only build would miss by
  construction. The ring-buffer bound is what keeps "always on" cheap.

### Touched-file inventory (proposal only — not implemented)

- `src/services/chart-flight-recorder.ts` — **new.** Ring buffer + typed
  `record(event)` + `dump()`. Owns the single `document.visibilitychange`
  listener (the one net-new global listener this proposal adds anywhere
  in the frontend — release discipline per the resource-ownership
  checklist applies to it, same as any other document-level listener).
- `src/composables/analysis/useChartTelemetry.ts` — **new.** Thin
  pass-through so `.vue` files never import `src/services/*` directly
  (mirrors `system-message-sink.ts`'s producer split). Mints
  `ChartInstanceId`s.
- `src/types.ts` or a dedicated `src/types/chart-telemetry.ts` — **new
  types** (`ChartFlightEvent` union, `ChartInstanceId` brand,
  `FlightTimestamp`), per the project's branded-id convention
  (`frontend/IDENTIFIERS.md` gets a new row).
- `src/components/charts/BaseChart.vue` — **touched.** Call sites at
  `initChart` (mount/init-attempt/init-deferred/init-success), the
  `ResizeObserver` callback (resize-observed), `updateOptions`/
  `updateMarker`/`updateAxisOnly` (set-option), the `active` watch
  (active-changed), and `onUnmounted` (chart-unmount) — plus, per H1
  above, this is also the natural place to fix the leaked retry timer
  in the same pass, since the telemetry would otherwise just confirm the
  same leak indefinitely.
- `src/components/charts/HeatmapChart.vue` — **touched**, same event
  set, minus the fix (already correct on H1's specific bug).
- `src/components/SettingsTab.vue` — **touched.** "Copy Chart
  Diagnostics" button, mirroring the existing Force Persistence button's
  shape.
- `frontend/FILES.md` / `frontend/IDENTIFIERS.md` — **touched**, per
  the project's own same-PR documentation-update discipline for new
  files and new branded ids.

### Acceptance handles

- A synthetic test drives `BaseChart` through a mount → (forced
  zero-height) → unmount sequence and asserts, by reading the recorder's
  buffer, that no `init-attempt` for that `chartId` is recorded after its
  `chart-unmount` — this is simultaneously an acceptance check for the
  telemetry (it observed the site directly, per ADR-0021 Rule 1) and a
  regression witness for the H1 fix, once undertaken.
- `window.lengyue.chartRecorder.dump()` is exercised in a browser session
  with at least one real board and one real chart, and its output is
  manually confirmed to contain a `chart-mount` → `init-success` pair with
  plausible dims and both timestamp fields populated.
- The Settings-tab button is exercised once and confirmed to (a) write
  valid JSON to the clipboard and (b) produce exactly one `info`-level
  `SystemMessage` in the log panel, not zero and not a message per event.

---

## 3. Durable decision (this proposal's own load-bearing call)

**Decision:** recommend Option C (service singleton + composable wrapper,
ring buffer, dual dump channel) for the flight recorder; reject B (no
layering, unbounded) because it is a leak-shaped tool for a leak-adjacent
bug; reject A and D as sole mechanisms because neither survives past an
unanticipated occurrence without devtools already open and recording,
which defeats "reconstruct after the fact." A and D's specific ideas
(console-namespace discoverability; `performance.mark` as a free
cross-check) are folded into C as supplements rather than discarded.
