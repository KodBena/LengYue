# Worklog — extract ToolbarEngineMetrics leaf (2026-05-30)

*(Backfilled the same day from commit `6683b6d`.)*

Render-coupling at a composition node
(`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`),
on the toolbar. `Toolbar` read `rootInfo` (`ledger.getRaw`, per packet) and
`metrics` (per tick) in its own render, so the whole toolbar shell — every
button, the three popover mounts, the title — re-rendered on every packet
during a streaming range query (614× in capture J). This is the main-thread
saturation that starves popover / slider interaction (see the popover-stress
harness worklog, which surfaced it).

## What shipped

Extract the live-telemetry strip (version / model / winrate / scoreLead /
PPS / latency / watchdog / queue) into a self-sourcing
`<ToolbarEngineMetrics>` leaf, mounted `v-if="isConnected"`. The leaf sources
`metrics` (via `useEngineControls`) and `rootInfo` (via the ledger) itself;
everything moved verbatim from `Toolbar.vue`. `Toolbar` now reads only
`isConnected` in its render, so it re-renders only on connect / disconnect /
match-state / dev-toggle — the per-packet telemetry re-renders isolate to the
leaf (correct: it is what displays them) and are cheaper per render than the
old whole-shell diff.

## Validation (count-based, ADR-0009)

Capture K (popover-stress while a range query streams), component renders:

| component | before | after |
|---|---|---|
| `<Toolbar>` | 614 | 1 |
| `<ToolbarEngineMetrics>` | — | 567 |

`Toolbar` also drops ~458 → ~190 lines, back under the ADR-0007 SFC budget.
It carries the popover-stress dev button (whose harness is the prior commit,
`1f62c3d`).

## Next lever

The extraction *isolated* the per-packet telemetry but did not *reduce* it —
`<ToolbarEngineMetrics>` now absorbs the whole-shell coupling's render rate
(567 here; 716 in the later capture L). That made the leaf the largest
per-packet renderer remaining and the next green candidate: throttle its
displayed scalars to ~4 Hz via the `lib/timing` catalog. Taken as the
immediate follow-up on this branch — see
`docs/worklog/2026-05-30-perf-toolbar-metrics-throttle.md` (validated 716 →
127 renders, 9× load-normalized).

## Docs

- `FILES.md`: new `ToolbarEngineMetrics.vue` entry; `Toolbar.vue` purpose line
  retagged (now a presentational shell).
- No `FEATURES.md` change — the metrics strip displays the same information;
  only its place in the component tree changed.

License: Public Domain (The Unlicense).
