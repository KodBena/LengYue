# Investigation — perf re-profile of the regime-B cluster (2026-06-11)

Measurement-only re-profile discharging the **re-profile-first** clauses on
three open work-status items, per ADR-0009 (a perf claim — including a null
finding — is honest only when a capture substantiates it) and the
2026-06-10 deferral-harvest annotations that each item carries:

- `nav-during-range-query-perf` — *"whether the regime-B frame cost is fully
  retired wants a re-profile (ADR-0009)."*
- `pv-hover-jank-range-query` — *"cause #1 shipped as perf-fix3 … the residual
  is causes C.2/C.3. Re-profile the symptom on the current base before
  building any lever."*
- `many-boards-open-slowness` — *"Re-profile the symptom on the current base
  before building any lever (rb3 lesson: ~99 ms re-measured vs ~2.35 s
  attributed)."*

No code changed. No lever was built. No perf claim is made beyond the
captures recorded here. The "rb3 lesson" each item cites — the
`rb3-packet-receive-chunking` re-measurement that found ~99 ms where ~2.35 s
had been attributed — is the precedent for *measuring before building*; this
note is that measurement for the residual cluster.

## Method

- **Tooling (ADR-0009 canonical, Chrome/CDP path).** `frontend/scripts/
  perf-capture.mjs` drives the pluggable scenario harness
  (`frontend/src/composables/perf/`) in a real headless Chromium via CDP
  `Tracing`; `frontend/scripts/perf-trace-parse.mjs` produces the
  count-based comparable. Per the 2026-06-11 ADR-0009 amendment, **counts —
  per-component `render`/`patch` operation counts normalized on the
  scenario-proxy marks — are this path's comparable; duration percentiles
  (RefreshDriverTick p50, the 05-29 Firefox-profiler metric) are *not*
  available on the Chromium path** (`profiler-cli` cannot ingest a Chrome
  trace). This is the same comparable the 2026-06-10
  `multi-writer-slots-get-owners` null-check used, named there as a loud
  deviation from "per-frame medians" commission wording; the same deviation
  applies here and is named the same way.
- **Base.** Current `main` at `36fdb59` (this worktree's base; the running
  `:5173` dev server is served from `/home/bork/w/omega/frontend` at the
  identical SHA, clean working tree — verified empty `git diff` on
  `frontend/src`). So the captures profile current main, not the worktree.
- **Engine.** SELECTOR proxy `ws://127.0.0.1:1235`, model `b10c128`, 1000
  visits/move, adaptive OFF, cold cache per scenario (`clearCache()` in the
  analysis preamble) — the green-arc protocol the harness pins. Engine
  health confirmed by non-trivial packet volume (`rb3:handler` 101–131 per
  capture); the 2026-06-10 "no healthy upstream" failure mode (which would
  show near-zero packets) did **not** recur — the `b10c128` upstream was
  healthy throughout.
- **Normalization (per `docs/notes/perf-capture-normalization-protocol.md`,
  read end to end).** Do not compare whole-capture totals (they scale with
  cache warmth and capture length — confound #1/#2). Assert comparability on
  the scenario proxies *first* (`autonav:step` ≈ navigation volume;
  `rb3:handler` ≈ packet/analysis volume), then read **per-packet- and
  per-nav-normalized counts**. The `autonav:step` marker detail partitions
  each capture into regime A / regime B post-hoc (`queryOnCurrentBoard`).
- **Scenarios.** `nav-range` (regime-B: autonav while a full-game range
  analysis streams on the navigated board — the direct match for
  nav-during-range-query and the C.2/C.3 residual of pv-hover);
  `full-stress` (regime-B + concurrent popover churn — the closest available
  proxy for *a concurrent interaction layered on the range query*, which is
  the pv-hover symptom's shape); `nav-only` (regime-A baseline, to size the
  regime-B delta). Two `nav-range` runs for within-run count stability.

### Captures (off-tree per ADR-0009; reference by path + size)

All under `~/w/vdc/chromium_profiles/`:

| Scenario | File | Size | `autonav:step` | regime | `rb3:handler` |
|---|---|---|---|---|---|
| nav-range #1 | `nav-range-2026-06-11T00-49-59-264Z.json` | 30.6 MB | 100 | 100 B / 0 A | 131 |
| nav-range #2 | `nav-range-2026-06-11T00-51-07-089Z.json` | 31.4 MB | 100 | 100 B / 0 A | 112 |
| nav-only (A) | `nav-only-2026-06-11T00-51-22-201Z.json` | 21.5 MB | 100 | 0 B / 100 A | 0 |
| full-stress | `full-stress-2026-06-11T00-51-30-130Z.json` | 30.6 MB | 100 | 100 B / 0 A | 101 |

Comparability confirmed before reading costs: `autonav:step = 100` in every
capture (identical navigation stimulus); the three regime-B captures are
**pure** regime-B — all 100 steps carried `queryOnCurrentBoard = true,
queryKinds = ["range"]` from step 0 to step 99 (the range query covered the
entire nav window, the worst case for the symptom). `rb3:handler` packet
volume varies 101–131 across the regime-B captures (cache/visit jitter,
confound #1), so the analysis-coupled counts are read **per-packet**, not as
totals.

## Headline — the load-bearing invariant and the per-packet rate

Across all four captures **every component renders at R/P = 1.00** — no
render-coupling anywhere (ADR-0010's `render ≫ patch` tell is absent). The
nav-leaf path is regime-invariant; the regime-B extra cost is concentrated
in the analysis chart panels rendering per packet, at a per-packet rate that
matches the post-program baseline.

Per-component render counts, windowed to the scenario bracket:

| Component | nav-only (A) | nav-range #1 (B) | nav-range #2 (B) | full-stress (B) | reading |
|---|---|---|---|---|---|
| MoveSuggestions | 101 | 105 | 101 | 103 | **≈ nav steps in both regimes — the PV is NOT rebuilt per packet** (Bug C.1 / perf-fix3 guard holds) |
| TreeWidget | 101 | 101 | 101 | 101 | regime-invariant (per-nav only) |
| BoardDisplay | 101 | 101 | 101 | 101 | regime-invariant |
| StatusBar | 101 | 101 | 101 | 101 | regime-invariant |
| BoardWidget | 101 | 105 | 101 | 103 | ≈ nav steps |
| AnalysisChartPanel | **4** | 214 | 200 | 170 | per-packet (regime-B only) |
| BaseChart | 2 | 212 | 200 | 170 | per-packet |
| ScoreLeadPanel | 1 | 106 | 100 | 85 | per-packet |
| MergedDeltaPanel | 1 | 106 | 100 | 85 | per-packet |

Per-packet-normalized (the protocol's comparable for the analysis-coupled
counts):

| Per-packet rate | nav-range #1 | nav-range #2 | full-stress |
|---|---|---|---|
| AnalysisChartPanel renders / packet | 1.63 | 1.79 | 1.68 |
| BaseChart renders / packet | 1.62 | 1.79 | 1.68 |
| ScoreLeadPanel renders / packet | 0.81 | 0.89 | 0.84 |
| MergedDeltaPanel renders / packet | 0.81 | 0.89 | 0.84 |

This is **stable within-run** and matches the 2026-06-10
`multi-writer-slots-get-owners` null-check baseline almost exactly
(AnalysisChartPanel ≈ 1.75–1.78 / packet there). The ~1.7× "thrash" on
AnalysisChartPanel — the analysis panel rendering more than once per packet
— is the same residual the 05-29 audit's RB-2 row named ("AnalysisChartPanel
also thrashes ~2.6× per update"; since reduced toward ~1.7× by the streaming
coalesce / incremental-projection arcs), unchanged by the audit program.

Memory (UpdateCounters, intra-run — GC sawtooth, NOT a leak metric): heap
20–32 → 39–67 MB, peak 45–70 MB; DOM nodes 4211–5149 peak; JS listeners
602–629 peak. Flat across captures; no leak signal (consistent with the
2026-06-01 leak-free `perf-heap` finding for the board/analysis lifecycle).

## Per symptom

### 1. `nav-during-range-query-perf` (regime B)

**Does it reproduce on the current base?** Yes, structurally — regime-B is
reproducible (100/100 steps under a live range query) and the analysis-panel
per-packet render work is real and present. **At what magnitude?** The
ADR-0009 Chromium-path comparable does **not** carry the 05-29 headline
("median frame ~47 ms, ~3.3× the 60 fps budget") — that is a
RefreshDriverTick p50, a Firefox-profiler metric this path cannot reproduce.
What this re-profile *can* assert: the per-packet analysis-panel render
count (~1.7× on AnalysisChartPanel/BaseChart, ~0.85× on the score/delta
panels) is **stable and unchanged** from the post-RB-1/RB-2 baseline. The
nav-leaf path (TreeWidget/BoardDisplay/StatusBar = 101 each) is
regime-invariant — navigation does not pay extra per-packet cost beyond the
chart panels.

**Does the 05-29 attribution still hold post-program?** Partially, and the
shape has narrowed:
- RB-1 (App↔engine-metrics decouple) **shipped** (`rb1-toolbar-metrics-
  decouple`, closed/shipped) — corroborated: `RootErrorBoundary` renders
  1–2× per capture (was 531×), `ToolbarEngineMetrics` self-sources at 14–20×
  (the genuine live-metric display), App no longer whole-tree re-renders on
  metric ticks.
- RB-2 (analysis-panel chart coalescing) **shipped** (`rb2-analysis-panel-
  coalescing`, closed/shipped) — the per-packet panel rate is down from the
  05-29 ~2.6× toward ~1.7×, but the panels still render >1× per packet. The
  residual *is* the RB-2 surface, not retired to 1.0.
- RB-3 (packet-receive chunking) was **dropped** (`rb3-packet-receive-
  chunking`, closed/dropped) — re-measured at ~99 ms, never the bottleneck.
  Nothing in this re-profile contradicts that.

**Outcome class (ADR-0009 §Calibration).** This is **case 1** for the
RB-1/RB-2 levers (measurement substantiates that they landed and the
per-packet cost is at its post-program floor). For the *open question the
item poses* — "is the regime-B frame cost fully retired?" — the honest answer
is **measurement-finds-no-new-signal on the count axis, and the frame-cost
axis is unmeasurable on this tooling path**. The count comparable shows no
regression and the per-packet rate at the documented post-program floor.

**Build / no-build recommendation: NO BUILD on the count evidence; a
frame-axis re-confirm is a separate, tooling-gated decision.** The count
re-profile gives no new lever to build — the analysis-panel ~1.7× thrash is
the only residual it surfaces, and that is the *already-known* RB-2 surface
whose further reduction the 05-29 audit itself characterized as diminishing
returns short of Vapor Mode ("the structural lever is Vapor Mode; further
micro-opts are diminishing returns"). If the maintainer wants the *frame-ms*
question answered (the 47 ms → ?), that needs a **manual Firefox-DevTools +
profiler-cli capture** (the canonical path for RefreshDriverTick p50), which
is out of scope for this automated-path measurement and would be its own
arc. Recommendation for the item: **keep open, re-scope its residual to "the
analysis-panel >1×/packet thrash (RB-2 floor) and the unmeasured frame-ms
axis," and gate any further lever on a Firefox-path frame capture** — do not
build a count-axis lever, there is none indicated.

### 2. `pv-hover-jank-range-query` (Bug C)

**Does it reproduce on the current base?** The *specific C.1 mechanism is not
reproduced* — and that is the finding. MoveSuggestions (the PV-hosting
component) renders 101–105× in regime-B, identical to nav-only's 101× —
i.e. **once per nav step, NOT once per range-query packet.** The 05-27 C.1
root cause (`MoveSuggestions`'s `watch(packet, …)` rebuilding the PV on every
same-node packet, restarting the per-stone CSS transition) is the one that
shipped as **perf-fix3** (`pv-hover-jank-range-query`'s deferral note records
this), and the guard holds: the PV is not being torn down and rebuilt per
packet. The capture does not directly *hover* a PV (no PV-hover stimulus
exists in the harness — see Gaps), but the per-packet rebuild that fix-3
targeted is provably absent at the component-render level.

**Does the C.2 / C.3 attribution still hold post-program?**
- **C.2 (`useEnrichedData` + `visitVector` cascade) — substantially
  retired.** The 05-27 C.2 mechanism was a per-frame O(path-length)
  re-derive of `enriched` that, via the fresh `mainSeries` reference, fired
  `BaseChart`'s series watch and starved the rAF tick the PV transition
  needs. The **2026-05-31 incremental-enriched-projection arc**
  (`docs/worklog/2026-05-31-perf-incremental-enriched-projection.md`) made
  that derivation **O(1) incremental** (a packet patches only changed
  on-path nodes). The re-profile corroborates the structural effect: the
  nav-leaf path (TreeWidget/BoardDisplay/StatusBar) is regime-invariant at
  101× and shows **no** per-packet cascade — the C.2 fan-out into the
  nav/board path is gone. What remains is the *direct* chart-panel render
  per packet (the BaseChart series watch still fires per packet — the
  ~1.7× rate), which is the RB-2 residual, not the C.2 cascade.
- **C.3 (ownership-normalization alloc) — not on the measured path under the
  protocol.** C.3 was conditional ("only when `reportAnalysisWinratesAs` is
  non-WHITE"; the seeded default is WHITE). The capture runs the WHITE
  default, so `normalizePacketToWhiteFraming`'s `ownership.map(negateScalar)`
  361-float alloc is not exercised. C.3 cannot be confirmed or refuted by a
  WHITE-default capture; it remains a **latent conditional cost** only
  reachable under a non-WHITE framing preference. This is a measurement gap,
  named loudly: the protocol's default configuration does not cover C.3.

**Outcome class (ADR-0009 §Calibration).** **Case 2 for C.1
(measurement-finds-nothing on the per-packet-rebuild axis — the perf-fix3
guard removed it)**, narrowing-confirmed for C.2 (the cascade is structurally
retired by the incremental-projection arc; the residual chart render is RB-2,
not C.2), and **measurement-not-attempted for C.3** (conditional, off the
default path).

**Build / no-build recommendation: NO BUILD pending a faithful PV-hover
repro.** Two reasons. (a) The C.1/C.2 residuals this re-profile can see are
absent or reattributed to RB-2; building against them would be building a
lever the measurement does not indicate. (b) The symptom as the user reports
it — *jank while hovering a PV during a range query* — is a **felt-latency,
interaction-during-streaming** symptom, and the harness has no PV-hover
stimulus and the headless path has no real compositor/vsync (the
perf-capture header names headless as "least faithful to felt latency"). A
faithful re-confirm would need either a `pv-hover` harness stimulus
(new stimulus alongside `popoverStress`) captured `--headed`/`--connect` on
X11, or a manual Firefox-DevTools session hovering a PV during a range
query. Recommendation for the item: **keep open, record that C.1 is retired
(perf-fix3) and C.2 is structurally retired (incremental-projection), and
re-scope the residual to "either build a faithful PV-hover repro before any
further lever, or confirm the C.3 non-WHITE conditional alloc is the
remaining surface."** Do not build blind.

### 3. `many-boards-open-slowness` (Bug A)

**Does it reproduce on the current base? — BLOCKED, named loudly.** The
harness **cannot reproduce this symptom.** Every built-in scenario opens
**exactly one board** (`loadAndHome` → `ctx.loadSgf` creates a single board);
Bug A is by definition a *many-boards* scaling symptom ("with many boards
open the whole application gets slower"). There is no multi-board scenario in
`frontend/src/composables/perf/scenarios.ts`, so this measurement-only arc
**could not profile Bug A's residual at all.** Recording this as the blocked
outcome rather than papering over it (ADR-0002 applied to the epistemic
state: the absence of a scenario is itself the finding).

**Does the 05-27 attribution still hold post-program?** The two enumerated
root causes are both **structurally addressed** (verified by source
inspection, not by profile — so this is a structural reading, not a perf
claim):
- A.1 (`useVariationPath` O(N²) fan-out across BoardTabs) — **Fix #2
  shipped**: `useVariationPath.ts` now reads `boardsById.value[boardId]`
  (the O(1) derived index in `store/index.ts`), replacing the
  `store.boards.find(…)` walk. Inspection-confirmed.
- A.2 / A.3 (global `useAutoSaveAnalyses` / `useAppBootstrap` watchers
  iterating all boards per nav step) — **Fix #4 shipped**:
  `useAutoSaveAnalyses.ts` carries a per-board `boardWatcherStops` map with
  `setupBoardWatcher` / teardown keyed on `BoardId`. Inspection-confirmed.

So the *known* O(N) / O(N²) fan-outs the 05-27 audit attributed are removed.
Whether a *residual* many-boards scaling cost remains (a different,
un-enumerated path) is **unmeasured** — and unmeasurable without a
multi-board scenario.

**Build / no-build recommendation: NO LEVER without a repro first — and the
first build, if any, is a HARNESS build (a many-boards scenario), not an
app-code lever.** The 05-27 root causes are retired; building another app
lever blind would risk the exact "~99 ms re-measured vs ~2.35 s attributed"
mis-attribution the item's own note warns against. Recommendation for the
item: **keep open; its true blocker is a missing measurement substrate.**
The right next step is a tooling sub-arc — a `many-boards` scenario factory
(open N boards, autonav one while the others sit with retained analysis
state) — so the symptom becomes reproducible and the residual (if any) is
measurable. Only then does an app-code lever have a substantiation to build
against. This is an ADR-0009 outcome-class-undetermined state: not case 1/2/3
because *no measurement was possible*.

## Gaps and confounds (ADR-0009 honesty)

- **No frame-ms axis.** The Chromium/CDP count comparable cannot reproduce
  the 05-29 RefreshDriverTick p50 (~47 ms) headline. Any "is the frame cost
  retired?" question on the *millisecond* axis needs the Firefox path. Named
  in every per-symptom outcome above.
- **No PV-hover stimulus.** The harness drives autonav + popover churn, not
  PV hover. pv-hover's C.1 was confirmed *absent at the render-count level*
  but the felt-latency symptom was not directly reproduced.
- **No many-boards scenario.** Bug A is unreproducible on the current
  harness — the single largest gap, and the reason its arc is blocked.
- **C.3 off the default path.** The WHITE framing default means the
  non-WHITE ownership alloc is never exercised; C.3 is neither confirmed nor
  refuted.
- **Headless faithfulness.** Captures are headless (no real compositor /
  vsync) — fine for *count* comparables (the operations happen regardless of
  paint), but not for felt-latency questions, which would want
  `--headed`/`--connect` on X11.
- **Cache/visit jitter.** Packet volume 101–131 across regime-B captures;
  handled by per-packet normalization, but the absolute counts are not
  cross-comparable as totals (confound #1).

## Staged work-status DB description appends (NOT executed — for maintainer review)

Per the commission, these are **staged, not applied** — the todo DB was
read-only this session. Each is an append to the existing `description`
preserving the prior text; the maintainer applies on sign-off. (SQL shape:
`UPDATE items SET description = description || E'\n\n<append>' WHERE id =
'<id>';` — verify the `\n\n` join against the live value before running.)

**`nav-during-range-query-perf`** — append:

> [2026-06-11 re-profile (docs/notes/investigation-perf-reprofile-2026-06-11.md):
> regime-B reproduces on main @36fdb59 (100/100 nav steps under a live range
> query). Chromium/CDP count comparable shows the analysis-panel per-packet
> render rate (~1.7x AnalysisChartPanel/BaseChart, ~0.85x score/delta panels)
> STABLE and unchanged from the 2026-06-10 baseline; nav-leaf path
> (TreeWidget/BoardDisplay/StatusBar=101/100 steps) is regime-invariant — no
> cascade. RB-1/RB-2 corroborated landed; the residual IS the RB-2
> analysis-panel >1x/packet thrash (05-29 audit characterized further
> reduction as diminishing-returns short of Vapor Mode). The 05-29 ~47 ms
> frame-p50 headline is NOT measurable on the Chromium path (counts only).
> No count-axis lever indicated — NO BUILD; if the frame-ms axis matters,
> gate a separate Firefox-DevTools+profiler-cli capture arc first.]

**`pv-hover-jank-range-query`** — append:

> [2026-06-11 re-profile (docs/notes/investigation-perf-reprofile-2026-06-11.md):
> C.1 (MoveSuggestions per-packet PV rebuild) RETIRED — MoveSuggestions
> renders ~ once per nav step in regime-B (101–105), identical to regime-A
> (101), NOT per packet; the perf-fix3 watch-guard holds. C.2
> (useEnrichedData/visitVector cascade) structurally retired by the
> 2026-05-31 incremental-enriched-projection arc — the nav-leaf path shows no
> per-packet cascade; the only per-packet chart render left is the RB-2
> surface, not C.2. C.3 (non-WHITE ownership-normalization alloc) NOT
> exercised — capture ran the WHITE default; remains a latent conditional
> cost. The felt-latency PV-hover symptom was not directly reproduced (no
> PV-hover harness stimulus; headless = no vsync). NO BUILD blind: re-scope
> residual to "build a faithful PV-hover repro (headed/--connect, or manual
> Firefox) OR confirm the C.3 non-WHITE alloc" before any lever.]

**`many-boards-open-slowness`** — append:

> [2026-06-11 re-profile (docs/notes/investigation-perf-reprofile-2026-06-11.md):
> BLOCKED — the perf harness cannot reproduce this symptom. Every built-in
> scenario opens exactly one board; Bug A is a many-boards scaling symptom,
> and no multi-board scenario exists in
> frontend/src/composables/perf/scenarios.ts. The two 05-27 root causes are
> structurally addressed (inspection, not profile): A.1 useVariationPath now
> O(1) via boardsById (Fix #2 shipped); A.2/A.3 useAutoSaveAnalyses now
> per-board boardWatcherStops (Fix #4 shipped). Whether a residual,
> un-enumerated many-boards scaling cost remains is UNMEASURED and
> unmeasurable without a scenario. Next step is a HARNESS sub-arc (a
> many-boards scenario factory), NOT an app-code lever — building a lever
> blind risks the "~99 ms re-measured vs ~2.35 s attributed" mis-attribution
> this item already warns against. Outcome-class-undetermined (no measurement
> was possible).]

## References (all read end to end for this investigation)

- `docs/adr/0009-performance-investigation-discipline.md` — the discipline;
  the three outcome classes; the 2026-06-11 counts-comparable amendment.
- `docs/notes/perf-capture-normalization-protocol.md` — confound control,
  per-packet/per-nav normalization, the `autonav:step` regime partition.
- `docs/notes/audit/perf-audit-nav-and-pv-hover-2026-05-27.md` — the prior
  diagnosis (Bugs A/B/C, the C.1/C.2/C.3 enumeration, the fix sequence).
- `docs/notes/audit/perf-audit-range-query-nav-2026-05-29.md` — the regime-B
  audit (the ~47 ms headline, RB-1/RB-2/RB-3).
- `frontend/scripts/perf-capture.mjs`, `frontend/scripts/perf-trace-parse.mjs`,
  `frontend/src/composables/perf/{scenarios,autonav}.ts` — the capture path.
- `docs/worklog/2026-05-31-perf-incremental-enriched-projection.md` — the C.2
  retirement.
- `docs/worklog/2026-06-10-multi-writer-slots-get-owners.md` — the prior
  count-comparable baseline this re-profile matches.

License: Public Domain (The Unlicense).
