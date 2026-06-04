# Worklog — timing-literals consolidation (2026-06-04)

## Trigger

Work-status item `scattered-timing-literals` (frontend / small) — the
**decision** the 2026-06-03 inventory worklog
(`docs/worklog/2026-06-03-scattered-timing-literals-decision.md`) deferred to
the maintainer. The maintainer's call: **consolidate all of them**, into one
catalog.

## The decision, and the reasoning that unblocked it

The 2026-06-03 framing posed leave / sibling-catalog / sectioned-`timing.ts`,
and weighed a consolidation against `timing.ts`'s "family discipline" (don't
couple unrelated tuning). The unblocking realization: **co-location is not
collapse.** A catalog where every constant is its own named export with its own
value does not couple anything — the family discipline only forbids making
*unrelated constants share a value*, not listing them in one place. So the
broadest option (one complete catalog) is also safe, and is exactly what
`timing.ts`'s own rationale ("no single place to audit or tune the
application's timing behaviour") argues toward. `timing.ts`'s prior
"coalescing-windows-only" scope was the artificial boundary; this dissolves it.

## What changed

`src/lib/timing.ts` rescoped from the coalescing-window catalog to the
**complete application-timing catalog**, sectioned:

- §1 reactivity-coalescing windows (unchanged) [B1]
- §2 interaction-dismiss grace [B1] — `INTERACTION_DISMISS_DELAY_MS` (150),
  collapsing **four** duplicated literals (hover-popover close grace +
  tag/player suggestion-hide in `CardMetadataPanel` / `LibraryPlayerFilter` /
  `MintCardModal`).
- §3 display durations [B1] — `TRANSIENT_LOG_REVEAL_MS`.
- §4 chart render-retry [B1] — `CHART_INIT_RETRY_MS` (100, collapsing the
  `BaseChart` + `HeatmapChart` hand-synced pair) and `FOREST_RENDER_RETRY_MS`
  (50, distinct consumer/value, kept independent).
- §5 micro-scheduling [B1] — `NEXT_TICK_DEFER_MS`.
- §6 dev-only perf harness [B1, DEV] — `POPOVER_STRESS_HALF_PERIOD_MS`
  (collapsing `HALF_PERIOD_MS` / `DEFAULT_HALF_PERIOD_MS`), `AUTONAV_TARGET_HZ`,
  `AUTONAV_MIN_STEP_INTERVAL_MS`.
- §7 engine-coupled timing [B2/B3] — `KATAGO_ANALYSIS_TIMEOUT_MS`,
  `ENGINE_PLAY_MOVE_TIMEOUT_MS` (was the generic `DEFAULT_TIMEOUT_MS`),
  `QUERY_ETA_TICK_MS`, `ENGINE_METRICS_TICK_MS`, `ENGINE_HEARTBEAT_POLL_MS`,
  and `KATAGO_FIRST_REPORT_FLOOR_S` (relocated from the now-deleted
  `src/engine/katago/limits.ts`).

Every independent value is preserved exactly; only the genuine duplicates (150
× 4, 100 × 2, 250 × 2) collapse to a shared export. ~18 consumer files
repointed to the catalog; `src/engine/katago/limits.ts` deleted (its sole
export moved); `store/defaults.ts` and a `types.ts` docstring repointed.

## Band-coherence handling (ADR-0003 / the pre-merge checklist's §B)

Pulling engine-coupled timing into the catalog crosses a band boundary, so it
is made **explicit, not silent** (the failure mode
`docs/pre-merge-checklist.md` and the toolbar-popover postmortem name): §7 is
labelled engine-coupled (band-2/3), separated from the band-1 substrate
timing. `timing.ts` itself imports nothing domain-specific, so it stays
structurally `[B1]` in `frontend/FILES.md`, with the entry noting that §7
catalogs band-2/3 timing *values*.

## Not consolidated (structural, pointers only)

User-configurable cadences (`store/defaults.ts`: persistence debounce, KataGo
report cadences, persisted PV-animation timings, the move-suggestions fade
knob) are runtime-user-owned settings, not constants; CSS `--duration-*` are
theme tokens unreachable from TS; `waitForAnalysis`'s timeout is
caller-supplied. The catalog points at these at its foot rather than owning
them. The frozen `archived-migrations.ts` mentions of `limits.ts` were left
untouched per the rolling-archive discipline.

## Verification

`npm run build` (vue-tsc -b && vite build) exit 0; `npx eslint .` exit 0.
Pure rename/relocate — values and call shapes unchanged, so runtime behaviour
is identical.
