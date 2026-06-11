# Worklog — perf re-profile of the regime-B cluster (2026-06-11)

> Measurement-only arc with no item of its own: it discharges the
> **re-profile-first** clauses on three open work-status items —
> `nav-during-range-query-perf`, `pv-hover-jank-range-query`, and
> `many-boards-open-slowness`. Branch `bork/docs/perf-reprofile-2026-06-11`,
> PR #TBD. Deliverable is the investigation note
> `docs/notes/investigation-perf-reprofile-2026-06-11.md`; this worklog is
> its audit trail. No code changed; no perf claim beyond the captures in the
> note; the todo DB was read-only (the DB appends the note stages are for the
> maintainer to apply on sign-off).

## What ran

Four headless-Chromium captures via `frontend/scripts/perf-capture.mjs`
against current main (`36fdb59`, the running `:5173` dev server served from
`/home/bork/w/omega/frontend` at the identical SHA), SELECTOR
`ws://127.0.0.1:1235` model `b10c128`, 1000 visits/move, cold cache, adaptive
off — the green-arc protocol the harness pins:

- `nav-range` ×2 (regime-B: autonav while a full-game range analysis streams)
- `nav-only` (regime-A baseline)
- `full-stress` (regime-B + concurrent popover churn)

Parsed by `frontend/scripts/perf-trace-parse.mjs` (count comparable) plus an
ad-hoc `autonav:step`-detail partition to confirm all three analysis captures
were **pure regime-B** (100/100 steps under a live range query). Traces under
`~/w/vdc/chromium_profiles/` per the ADR-0009 off-tree share convention;
filenames + sizes in the note.

## Findings (one line each; full reasoning in the note)

- **nav-during-range-query-perf:** reproduces; per-packet analysis-panel
  render rate (~1.7× AnalysisChartPanel/BaseChart) stable and unchanged from
  the 2026-06-10 baseline; RB-1/RB-2 corroborated landed; residual is the
  known RB-2 thrash. The 05-29 ~47 ms frame-p50 is **not measurable** on the
  Chromium count path. NO count-axis lever indicated.
- **pv-hover-jank-range-query:** C.1 (per-packet PV rebuild) **retired** —
  MoveSuggestions renders ≈ once per nav step, not per packet (perf-fix3
  guard holds). C.2 (useEnrichedData cascade) structurally retired by the
  2026-05-31 incremental-enriched-projection arc — no per-packet cascade into
  the nav-leaf path. C.3 (non-WHITE ownership alloc) **not exercised** (WHITE
  default). NO build blind; a faithful PV-hover repro is the prerequisite.
- **many-boards-open-slowness:** **BLOCKED** — the harness opens exactly one
  board; no multi-board scenario exists, so Bug A is unreproducible. The two
  05-27 root causes are structurally addressed by inspection (Fix #2
  boardsById, Fix #4 per-board watchers). Next step is a HARNESS sub-arc, not
  an app lever.

## Deviations (recorded loudly)

1. **"Per-frame medians" → counts.** The commission and the protocol name
   per-frame medians (RefreshDriverTick p50), a **Firefox-profiler** metric.
   The ADR-0009 Chromium/CDP path's documented comparable is **counts, not
   wall-clock** (`perf-trace-parse.mjs` header; the 2026-06-11 ADR-0009
   amendment). The commission specified `perf-capture.mjs` (the Chromium
   path) and `~/w/vdc/chromium_profiles/` (the Chromium trace location), so
   the count comparable is the correct one for the tool named — but it means
   the 05-29 frame-ms headline cannot be re-confirmed on this path. Named in
   the note's Method and in every per-symptom outcome. This is the same
   deviation the 2026-06-10 `multi-writer-slots-get-owners` null-check
   recorded, under the same ADR-0009 split.
2. **many-boards is BLOCKED, not measured.** The commission asked to "run the
   perf battery … for the scenarios covering the three symptoms." There is no
   scenario covering Bug A; rather than fabricate a proxy, the note records
   the blocked outcome and recommends a harness sub-arc. Delivered as
   blocked-with-reason per the commission's own fallback clause.
3. **pv-hover is render-count-confirmed, not felt-latency-confirmed.** The
   harness has no PV-hover stimulus and headless has no vsync, so the
   *felt* symptom was not reproduced; only the C.1 per-packet-rebuild
   mechanism (absent) and the C.2 cascade (absent) were measured. Named in
   the note's Gaps.

## Documentation audit

- **Work-status store:** read-only this session per the commission. The note
  **stages** (does not apply) a description append for each of the three
  items in its final section; applying them is the maintainer's call.
- **handoff-current.md:** read end to end; no orientation surface it carries
  is affected (it does not describe regime-B internals or these items'
  status). No edit.
- **FEATURES.md:** no edit — no user-facing capability changed.
- **FILES.md / IDENTIFIERS.md:** no edit — no source file or branded id added,
  moved, or removed (docs-only change).
- **ADR-0009 "Revisit when…":** no trigger satisfied — this arc *uses* the
  tooling as-is; it does not replace the tool surface or extend the metric
  vocabulary. (The "no PV-hover stimulus / no many-boards scenario" gaps are
  recorded as future *harness* work in the note, not as ADR amendments.)
- **Doc-graph:** the investigation note and this worklog are new nodes —
  regenerated via `node tools/doc-graph/generate.mjs` in the same change;
  committed `docs/doc-graph.json` + `docs/doc-graph.md`.
- **Dispatch ledger:** no open dispatch addressed to the frontend bears on
  this arc.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite, exit 0); `npx eslint .`
exit 0; `npm run test:run` 888 passed / 4 skipped (unchanged from main — this
is a docs-only change; the suite is run per the campaign discipline, not
because behaviour changed).

License: Public Domain (The Unlicense).
</content>
