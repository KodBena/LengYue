# Per-turn analysis substrate — extension guide

- **Status:** `reference` — entry point for researchers /
  tinkerers extending the per-turn analysis surfaces
  (mistake-finder, distribution charts, stability surface,
  cross-correlations). Written in the same register as
  `backend/docs/tree-dsl.md` and the proxy's `FRAMEWORK.md`:
  describe the substrate, give recipes, name the extension
  surfaces and their limits.
- **Audience:** Go researchers and serious students who want
  to experiment with the analysis surface — add an extractor,
  try a new stability metric, mount a custom panel, build
  cross-cutting views over the existing data. Assumes you
  know Vue 3 + TypeScript at a contributor level; doesn't
  assume familiarity with the design-note exploration arc.
- **Companion documents:** the design notes
  (`mistake-finder-design-space.md`,
  `stability-surface-design-space.md`,
  `mistake-finder-pedagogy-and-followups.md`,
  `mistake-stability-surface-synthesis.md`) carry the
  exploratory rationale; this guide is the operational
  reference. Open extension arcs and brittleness caveats
  live in `deferred-items.md`.

## What the substrate does

KataGo emits a stream of analysis packets per position
(turn) — both intermediate previews (`isDuringSearch=true`)
and a final at the configured visit budget. The substrate
folds that stream into three composable views:

- **Per-move deltas**: each player's per-move evaluation
  quality scalar (`extra.<color>.deltas`), surfaced as the
  merged-delta chart and as mistake dots when the palette's
  `delta_ordering` orients severity past a per-board
  quantile threshold.
- **Per-turn stability**: a V-axis change-point trajectory
  per (config, extractor, turn), aggregated into a [0, 1]
  stability scalar by one of four metric functions.
- **Distribution views**: KDE of per-color deltas + histogram
  of own-color mistake-gap distances, both via a generic
  primitive component.

Plus a cross-correlation panel that auto-iterates the
extractor / metric registries to compare which axes carry
similar signal on a given game.

## Data flow

```
KataGo wire packet (one per analysis emission)
            │
            ▼
analysis-service.onAnalysisUpdate
            │
            ├──► ledger.record(hash, nodeId, packet)
            │       (single merged packet per (hash, nodeId);
            │        feeds useEnrichedData → delta charts +
            │        mistake-finder)
            │
            └──► stabilityTrajectoryStore.record(hash, nodeId, packet)
                    │
                    ▼
                for each (extractorId, extractor) in STABILITY_EXTRACTORS:
                    Q = extractor(packet)          # may be null
                    V = packet.rootInfo.visits
                    appendObservation(trajectory, V, Q)
                    (changepoint-compressed; per-key reactive
                     bump via rAF coalesce)

Composables that read the stores:
            │
            ▼
useEnrichedData(path)         → per-turn delta series  → MergedDeltaPanel
useMistakeFinder(enriched)    → per-move mistake dots  → MergedDeltaPanel overlay
useStabilityMetrics(path, e, m) → per-turn stability   → StabilityPanel
useStabilityCrossCorrelations(...) → extractor/metric matrices → StabilityCrossCorrelationPanel
```

Two key separations to internalise:
- **Ledger** stores one merged packet per `(hash, nodeId)` —
  the last-write-wins view of the engine's evaluation at each
  turn. Used by delta charts and the mistake-finder.
- **Trajectory store** stores the full V-axis history per
  `(hash, extractor, nodeId)` — change-point compressed, so
  memory stays bounded even with many packets. Used only by
  stability views.

The two are populated from the same packet stream but answer
different questions ("what does the engine think now" vs.
"how did the engine's opinion evolve").

## Registry-driven extension (the cheap path)

Three substrates expose a `Map<id, fn>` extension point. Adding
to any of them is a 3-step recipe and zero consumer-side
change.

### Adding a stability extractor

A stability extractor is a per-packet pure function
`(packet: KataAnalysisResponse) => Q | null` where Q is a
primitive-comparable type (`string | number | boolean`).
`null` means "this packet doesn't permit a reliable
observation" (truncated moveInfos, required field missing) —
recorded as an `UNKNOWN` gap that drops from stability
computations rather than voting against stability.

Recipe:

1. Implement the extractor in
   `src/engine/analysis/stability-extractors.ts` next to
   the existing six. Return `null` defensively when packet
   fields are missing.
2. Register in `STABILITY_EXTRACTORS` at the bottom of the
   same file.
3. Add a human-readable label to `STABILITY_EXTRACTOR_LABELS`.

That's it. The trajectory store auto-runs the new extractor
on every packet; the panel's dropdown auto-includes it; the
cross-correlation panel's extractor matrix auto-grows by one
row/column.

Worked examples in the file: `extractTop3Set` (returns a
canonical sorted-joined string to preserve the
primitive-equality contract for composite quantities);
`extractTop2MarginQuintile` (visit-confidence quintiles
independent of top-1 identity).

**Composite quantities (frozensets, vectors).** The trajectory's
equality contract is `===` on `Q`. For composite quantities
(e.g., "top-3 set"), serialise to a canonical string inside
the extractor — sort the components, join with a separator,
return the string. Don't return `Set` or array literals;
their `===` is reference-identity, not structural.

**Stateful extractors.** The research catalogue includes
`extract_winrate_change_threshold_factory(δ)` — a factory
producing a closure that remembers the first packet's value
as a reference. The TS registry stores zero-arg extractor
functions today, but a stateful factory can be added by
constructing a fresh extractor per `(board, node)` and
registering it dynamically — the registry's `ReadonlyMap`
shape doesn't prohibit this, it just hasn't been needed yet.

### Adding a stability metric

A stability metric is a function over the trajectory:
`(t: StabilityTrajectory<Q>, V_term: number, options?) =>
StabilityMetricResult`. Returns `value ∈ [0, 1]` (1 = most
stable per the metric's semantics) plus diagnostic fields
(`anchorV`, `nChanges`, `isStable`).

Recipe:

1. Implement in `src/lib/stability-trajectory.ts` alongside
   the existing four. Reuse the shared helpers `walkWindow`
   (iterates `(prev_V, next_V, value)` sub-intervals) and
   `countChanges` (per-window transition count) — these
   capture the canonical UNKNOWN-handling and window-bounds
   conventions.
2. Register in `STABILITY_METRICS`.
3. Add label + explanation to `STABILITY_METRIC_LABELS` and
   `STABILITY_METRIC_EXPLANATIONS`. The explanation surfaces
   in the panel's `(?)` help tooltip.

The panel's metric dropdown auto-includes it; the
cross-correlation panel's metric matrix auto-grows by one
row/column.

### Adding a palette extractor (delta_ordering convention)

The mistake-finder's substrate is the palette's
`delta_ordering: 'lower_is_worse' | 'higher_is_worse'` flag
on `AnalysisPalette`. Each palette declares which direction
of its own `delta_fn`'s output counts as worse. To author a
new palette that the mistake-finder can rank moves under:
just add it to the seeded palette list in
`src/store/defaults.ts` with its direction declared.
Existing palettes carry an analogous declaration.

This isn't quite a "registry" but it's the same shape: per-
palette parametrisation that consumer code reads
generically.

## Metric equations (for reference)

The four metrics interpret the per-turn V-axis trajectory
differently. Notation:

- $\mathcal{T}$ — the per-turn trajectory, a sorted list of
  change-points $(V_i, q_i)$ where $q_i \in Q \cup \{\bot\}$
  ($\bot$ = UNKNOWN).
- $v(V)$ — value at visit count $V$: the $q_i$ of the
  rightmost change-point with $V_i \le V$.
- $[V_\text{term}, V_\text{max}]$ — the metric window. Each
  interval $[V_i, V_{i+1})$ inside the window carries a
  constant value $v(V_i)$.
- $w_i = \log(V_{i+1}/V_i)$ — the log-V weight of the
  $i$-th interval. Log-V weighting is rescale-invariant
  (the same metric reads the same shape across deployment
  visit budgets — the design note's canonical choice).
- $W_\text{known} = \sum_{v(V_i) \ne \bot} w_i$ — total
  weight of intervals with known values inside the window.

**On the name "V_term" — etymological note (uncertain).** The
variable name is inherited from the research-branch Python
original (`research/stability_trajectory.py` on branch
`bork/research/visit-scaling-memo-2026-05-21`). The author
did not document the choice in code or docstring, so what
follows is **my reading, not authoritative** — if you want
the canonical answer ask the project author directly.

My best guess: "term" stands for *early-termination*. The
research arc was investigating "for which positions can
`adaptive_reevaluate` stop the search early without losing
correctness?" — and V_term was the candidate stopping point
being evaluated. The stability fraction then answers "if we
had terminated at V=V_term, would the answer have held up
through V=V_max?" That fits the research context cleanly.

An alternative reading I considered is "*terminus of the
early/chaotic phase*" — V_term as the visit count past
which the search is presumed settled. Same window semantics,
different etymology.

In this SPA's display context, the early-stopping framing is
not load-bearing — we display stability against whatever
V_max KataGo ran to; we're not making stopping decisions.
V_term here functions as "anchor visit count" or "lower
window bound", and a future substrate-rename arc could
honestly call it `V_anchor` or `V_lower` for clarity. The
research-side name is kept here to preserve cross-reference
with the Python original; mentally rename to "anchor visit
count" if the literal "term" reads strangely.

### Anchored at V_term (canonical; design-note default)

$$
\text{anchor} = \begin{cases}
  v(V_\text{term}) & \text{if known} \\
  \text{first } v(V_i) \ne \bot \text{ with } V_i > V_\text{term} & \text{otherwise (lenient fallback)}
\end{cases}
$$

$$
S_\alpha = \frac{1}{W_\text{known}'} \sum_{V_i \in [\text{anchor}, V_\text{max}]} \mathbb{1}[v(V_i) = \text{anchor}] \cdot w_i
$$

(where $W_\text{known}'$ counts intervals starting from
$\text{anchor}$, not $V_\text{term}$, when the lenient
fallback fires.)

**Reads as:** "what fraction of the log-V window after V_term
carries the same value the engine showed at V_term?" Predicts
"does the engine's opinion at V_term survive further search?"

### Anchored at V_max (settled-early flavour)

$$
\text{anchor} = v(V_\text{max})
$$

$$
S_\beta = \frac{1}{W_\text{known}} \sum_{V_i \in [V_\text{term}, V_\text{max}]} \mathbb{1}[v(V_i) = v(V_\text{max})] \cdot w_i
$$

**Reads as:** "what fraction of the window already showed the
value that ended up being final?" High when the engine
settled early; low when the final value emerged near the end.

### Longest-run fraction (mode-fraction, anchor-independent)

$$
S_\text{longest} = \frac{\max_{q \in Q} \sum_{v(V_i)=q} w_i}{W_\text{known}}
$$

**Reads as:** "how dominant is the single most-held value?"
Robust to chaotic early flux that eventually concentrates.

### Inverse change-rate (volatility flavour, anchor-independent)

Let $C = |\{i : v(V_{i-1}) \ne v(V_i),\, v(V_{i-1}) \ne \bot,\, v(V_i) \ne \bot\}|$
be the count of value transitions in the window.

$$
S_\text{change} = \frac{1}{1 + C / \log(V_\text{max}/V_\text{term})}
$$

**Reads as:** "how few transitions per log-doubling of
visits?" Value 1.0 = no transitions; ~0.5 = roughly one
transition per log-doubling; asymptotes toward 0 as the
trajectory thrashes. Captures "how chaotic," not "how
anchored."

### UNKNOWN-handling (uniform across metrics)

Intervals where $v(V_i) = \bot$ drop from both numerator and
denominator. Absence of observation is not a vote against
stability — extractors that return `null` for legitimate
reasons (truncated moveInfos, missing field) just contribute
no information to the window.

## Mounting a new panel

The composables are the integration point. To add a panel
that uses any per-turn analysis data:

1. Create a new SFC under `src/components/charts/` mirroring
   one of the existing panels (`StabilityPanel.vue` is the
   simplest worked example).
2. Inside the SFC, call the relevant composable —
   `useStabilityMetrics(path, extractorId, metricId)` for a
   stability time-series, `useEnrichedData(path)` for raw
   delta data, `useMistakeFinder(enriched)` for mistake
   markers.
3. Mount the SFC in `AnalysisDashboard.vue` inside the
   `.scrollable-content` block.

The composables are reactive — your panel auto-updates as
new packets arrive, as the user switches palette (the
configHash changes and trajectories key on it), and as the
underlying refs (variation path, selection range, etc.)
change.

If your panel needs cross-cutting data over the whole
substrate, lift the per-turn computation into a new
composable under `src/composables/analysis/` and read the
stores directly. `useStabilityCrossCorrelations` is the worked
example — it iterates both registries and computes pairwise
correlations without changing the substrate.

## Distribution chart — extending the variant set

`DistributionChart.vue` is a generic component with a
`variant: 'histogram' | 'kde'` union prop. Adding a third
variant (say a violin or ECDF plot) means:

1. Extend the union type in the prop definition.
2. Add a `buildXSeries()` builder function for the new
   variant.
3. Add a `props.variant === '...'` branch in `buildOption()`
   that calls the new builder.
4. If the variant needs new options beyond `HistogramOptions`
   / `KdeOptions`, add a new options interface and an
   optional `xOptions?: XOptions` prop.

The pure-helper layer in `src/lib/distributions.ts` is
registry-shaped (one function per variant kind) so adding a
helper for the new variant fits cleanly there — but the
component's variant dispatch is still hardcoded. This is
acceptable for the current two variants; a true registry
would pay off only at three+ variants.

## What's registry-driven vs. hardcoded

| Surface | Extension shape | Cost to add |
|---|---|---|
| Stability extractor | Registry map | One function + two registry entries |
| Stability metric | Registry map | One function + three registry entries (impl, label, explanation) |
| Cross-correlation matrix | Auto-iterates the two registries above | Zero (extension propagates) |
| New panel using existing composables | Mount in dashboard | New SFC + dashboard mount |
| Distribution chart variant | Union type + dispatch branches | Touch the primitive |
| Mistake-finder dot rendering | Hardcoded to MergedDeltaPanel | Fork the panel |
| Palette delta_ordering value | Per-palette declaration in defaults | One field per palette |

The first three are the easy-extension zone. The last three
require modifying existing components; tractable but not
zero-cost.

## Cross-correlation panel

When you add an extractor or a metric, the cross-correlation
panel auto-picks it up — both the registry-iteration
composable (`useStabilityCrossCorrelations`) and the panel
template iterate the registries. No code change needed.

The pairwise Pearson helper (`src/lib/correlation.ts`) is
generic — if you want to add a different correlation
(Spearman, Kendall, distance correlation), implement it
there with the same `(x, y) => { value, n }` contract and
swap the call in the cross-correlation composable.

## Where each piece lives

```
src/
├── lib/
│   ├── stability-trajectory.ts        # data structure + 4 metrics + registry
│   ├── correlation.ts                 # Pearson; add Spearman etc. here
│   └── distributions.ts               # histogram + KDE helpers
│
├── engine/
│   ├── katago/types.ts                # KataMoveInfo et al. — wire-shape
│   └── analysis/
│       └── stability-extractors.ts    # 6 extractors + registry
│
├── services/
│   ├── analysis-ledger.ts             # per-(hash, nodeId) packet store
│   ├── analysis-service.ts            # onAnalysisUpdate — ingestion hub
│   └── stability-trajectory-store.ts  # per-(hash, extractor, nodeId) trajectory store
│
├── composables/analysis/
│   ├── useEnrichedData.ts             # raw delta series per color
│   ├── useMistakeFinder.ts            # mistake markers (severity + un-punished)
│   ├── useStabilityMetrics.ts         # per-turn stability scalar
│   └── useStabilityCrossCorrelations.ts  # cross-correlation matrices
│
└── components/charts/
    ├── MergedDeltaPanel.vue           # delta lines + mistake dots
    ├── DistributionChart.vue          # generic histogram/KDE primitive
    ├── StabilityPanel.vue             # per-turn stability time series
    └── StabilityCrossCorrelationPanel.vue  # collapsed-by-default
```

## Open extension arcs (see deferred-items.md)

- **Stage-5: distribution-level (information-geometric)
  stability metric.** The v1 substrate operates on
  categorical extractors. The intuition "stability = the
  visit distribution doesn't move much" is a
  distribution-level metric (cumulative KL between
  successive packets, or the Fisher–Rao information-length
  of the trajectory) — outside the categorical framework
  and requires parallel substrate (per-packet distribution
  storage without changepoint compression, distribution-
  stream metrics, sibling panel). Recorded with canonical
  references in `deferred-items.md` §"Stability surface:
  distribution-level (information-geometric) metric".

- **Mistake-finder de-brittling.** The un-punished red-flag
  heuristic uses per-board quantile thresholds; in clean
  games it false-positives on marginal moves. Four avenues
  documented: absolute-severity floor, cross-net agreement
  via the proxy's SELECTOR capability, stability-gated
  un-punished detection, cross-palette agreement. See
  `deferred-items.md` §"Mistake-finder un-punished-flag
  brittleness".

- **KDE boundary bias for bounded-support palettes.** The
  generic KDE primitive shows density past the support
  boundary for [0,1]-supported palettes. Four disciplined
  fixes documented (reflection method, boundary kernels,
  transformation method, Beta-kernel KDE) plus the
  substrate shape if implemented (per-palette `support?:
  [number, number]` field). See `deferred-items.md`
  §"KDE boundary bias for bounded-support palettes".

## Glossary

- **Packet** — one `KataAnalysisResponse` emission from
  KataGo via the proxy. Carries `rootInfo` (winrate,
  scoreLead, visits), `moveInfos` (per-candidate-move
  visit / winrate / scoreLead / prior / pv), and `extra`
  (proxy-enrichment envelope with per-color deltas, state
  fns, triangular heatmap).
- **V (visit count)** — `packet.rootInfo.visits`; the
  total MCTS visits at the time of the packet. The
  trajectory's X-axis.
- **Extractor** — `(packet) => Q | null` mapping a packet
  to a primitive-comparable value. The Q-axis of the
  trajectory.
- **Trajectory** — change-point compressed per-V history
  of extractor outputs at a single (hash, extractor,
  nodeId).
- **Metric** — `(trajectory, V_term) => [0, 1] scalar`
  aggregating the V-axis history into a stability score.
- **Anchor** — the V at which the metric's reference value
  is taken (V_term for the canonical metric, V_max for the
  final-anchor variant, undefined for anchor-independent
  metrics).
- **UNKNOWN** — sentinel for "extractor returned null at
  this packet"; intervals carrying UNKNOWN drop from
  metric numerators and denominators.
- **`delta_ordering`** — per-palette declaration of which
  direction of `delta_fn`'s output counts as worse;
  consumer-side flag the mistake-finder reads to orient
  severity.
- **`configHash`** — content-addressed hash of the active
  palette config; trajectories key on it so palette
  switches invalidate stored data correctly.
