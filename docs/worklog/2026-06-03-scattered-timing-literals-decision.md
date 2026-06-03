# Worklog — scattered timing literals: inventory + deferred decision (2026-06-03)

## Trigger

Work-status item `scattered-timing-literals` (frontend / small) — a **decision**
item: `timing.ts` centralises the reactivity-coalescing windows, but the adjacent
timeouts / durations / interaction-delays (`KATAGO_ANALYSIS_TIMEOUT_MS`,
`DEFAULT_TIMEOUT_MS`, `REVEAL_DURATION_MS`, `DEFAULT_CLOSE_DELAY_MS`, …) live
scattered. The item framed three options: **leave / sibling catalog / sectioned
`timing.ts`**.

## Status: OPEN — decision deferred

No decision is taken here. This worklog **captures the inventory** so the call
can be made against a durable artifact rather than a one-shot search, and records
one incidental cleanup that shipped. The maintainer will review the inventory and
decide later. The framing for that decision:

- These constants are **already magic-literal compliant** — so ADR-0008 /
  magic-literal hygiene is *not* the motivating axis (an earlier draft of this
  note over-weighted it). The leverage a consolidation would buy is **tuning
  ergonomy**: one surface to see and adjust related timing behaviour, the same
  win `timing.ts` itself bought for the coalescing-window family.
- The counter-consideration is `timing.ts`'s own *family discipline*: collapsing
  constants that answer to genuinely unrelated decisions couples tuning that
  should stay independent. Whether the scattered set is one tunable family, a few
  families, or genuinely independent is exactly the judgment to make from the
  inventory below — it is not self-evident, and may not land on "leave."

## Inventory (durable — the material for the decision)

Swept from `frontend/src` on 2026-06-03. `timing.ts` itself holds the
coalescing-window family (auto-save 2000 ms; chart-marker 60 ms; timeline-selection
150 ms; and the shared 250 ms subscriber-projection redraw throttle + its per-view
constants). Everything below is the **non-coalescing** timing surface that lives
outside it.

### Timeouts
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/review/useReviewSession.ts:48` | `KATAGO_ANALYSIS_TIMEOUT_MS` | 30 000 ms | max wait for KataGo final after a user move | named const, doc'd |
| `composables/board/usePlayFromPosition.ts:55` | `DEFAULT_TIMEOUT_MS` | 60 000 ms | default per-move timeout in engine-play loop | named const, doc'd |
| `composables/analysis/wait-for-analysis.ts:128` | (param `timeoutMs`) | caller-supplied | analysis-packet materialisation wait | param-driven |

### Display duration
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/useTransientLogReveal.ts:43` | `REVEAL_DURATION_MS` | 8000 ms | auto-hide for the transient log reveal | named const, doc'd |

### Interaction delays
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/chrome/useHoverPopover.ts:54` | `DEFAULT_CLOSE_DELAY_MS` | 150 ms | hover-popover close grace window | named const, doc'd |
| `components/CardMetadataPanel.vue:160` | inline | 150 ms | tag-suggestions hide delay | `magic-literal:` comment |
| `components/library/LibraryPlayerFilter.vue:57` | inline | 150 ms | player-filter suggestions hide delay | `magic-literal:` comment |
| `components/modals/MintCardModal.vue:157` | inline | 150 ms | tag-suggestions hide delay (mint) | `magic-literal:` comment |

### Animation / transition durations (TS-side)
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/board/use-pv-animation.ts:95` | `PV_DEFAULTS.stepDelayMs` | 350 ms | delay between sequential PV stone reveals | named const, doc'd |
| `composables/board/use-pv-animation.ts:96` | `PV_DEFAULTS.windowDurationMs` | 600 ms | sliding-window PV hold | named const, doc'd |
| `composables/board/use-pv-animation.ts:97` | `PV_DEFAULTS.fadeDurationMs` | 0 ms | stone fade (default instant) | named const, doc'd |
| `store/defaults.ts:642–646` | `session.ui.pvAnimation` | mirror of the above | persisted PV-animation defaults | settings, doc'd |
| `components/board/MoveSuggestions.vue:238` | `moveSuggestionsFadeMs` | 60 ms (knob default) | suggestion ring/disk fade | knob-driven |

### Polling / cadence intervals
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/useQueryTelemetry.ts:177` | inline | 1000 ms | ETA decrement tick | `magic-literal:` comment |
| `services/analysis-service.ts:319` | inline | 1000 ms | metrics-update (packet-rate) tick | `magic-literal:` comment |
| `services/analysis-service.ts:368` | inline | 5000 ms | watchdog heartbeat interval | `magic-literal:` comment |

### Chart init / render-retry
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `components/charts/BaseChart.vue:509` | inline | 100 ms | ECharts init-retry (await layout) | `magic-literal:` comment |
| `components/charts/HeatmapChart.vue:204` | inline | 100 ms | ECharts init-retry (matches BaseChart) | `magic-literal:` comment |
| `composables/analysis/useEChartsForestRender.ts:130` | inline | 50 ms | forest-render retry | `magic-literal:` comment |

### Micro-scheduling
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/board/use-pv-animation.ts:212,220` | inline | 1 ms | next-tick visibility-flip defer | `magic-literal:` comment |

### Dev-only perf harness
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `composables/useAutoPopoverPerf.ts:39` | `HALF_PERIOD_MS` | 250 ms | popover open/close stress half-period | named const + comment |
| `composables/perf/stimuli.ts:26` | `DEFAULT_HALF_PERIOD_MS` | 250 ms | popover stress half-period | named const + comment |
| `composables/perf/autonav.ts:50` | `MIN_STEP_INTERVAL_MS` | 1000 / `TARGET_NAV_HZ` | auto-nav fixed timestep (60 Hz) | named const + comment |

### Upstream protocol limit
| file:line | name | value | purpose | compliant |
|---|---|---|---|---|
| `engine/katago/limits.ts:44` | `KATAGO_FIRST_REPORT_FLOOR_S` | 0.001 s | KataGo `firstReportDuringSearchAfter` floor | named const, doc'd |

### Out-of-scope buckets (governed elsewhere — listed for completeness)
- **CSS-side durations** (theme tokens, `assets/css/theme.css:288–289`):
  `--duration-default` 0.2 s, `--duration-slow` 1 s. Governed as theme tokens,
  not TS constants.
- **User-configurable cadences** (settings registry / `store/defaults.ts`):
  `persistence.debounceInterval` (1000 ms), `engine.katago.reportDuringSearchEvery`
  (0.15 s), `engine.katago.firstReportDuringSearchAfter` (0.05 s),
  `engine.katago.watchdogAnimationMs`. These are user-owned, not authoring
  constants.

## What changed (incidental cleanup that shipped)

`frontend/src/lib/timing.ts` header only: its scope paragraph pointed at the
deferred-items ledger (dissolved in the 2026-06-02 doc consolidation) — a dangling
reference. Replaced with an accurate note that the consolidation question is OPEN
and tracked in the SSOT, naming tuning ergonomy (not magic-literal compliance) as
the leverage at stake. No constant, value, or runtime behaviour changed.

## Verification

`npm run build` green; `eslint` clean. Comment-only change. The SSOT item remains
**open** (decision pending maintainer review of the inventory above).

License: Public Domain (The Unlicense).
