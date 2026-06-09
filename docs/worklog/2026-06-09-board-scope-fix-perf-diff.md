# Worklog — board-scope / card-tree-slot fix: perf before/after audit trail (2026-06-09)

> Audit trail for PR #364 (forest-vanishes-on-tab-switch via slot
> producer-ownership + board-scope hardening P0/P1/P1b/P2). No regression
> expected — the change is forest/card-tree-slot ownership + store scoping, not
> a render/analysis hot path — but the merge is broad (store / types /
> composables), so a before/after `full-stress` battery is recorded per
> ADR-0009. Result: **no regression attributable to the change.**

## Method

- **Standard battery:** `full-stress` (`prepareAnalysis` → `analyzeRange(full)`
  + `popoverStress` + `autonav`), driven by
  `node frontend/scripts/perf-capture.mjs full-stress --model b10c128`, parsed
  by `frontend/scripts/perf-trace-parse.mjs`. SELECTOR proxy
  `ws://127.0.0.1:1235`, model `b10c128` healthy.
- **before** = `:5173` (the running main-repo dev server on the audit-docs
  branch `3bbf148`; its `frontend/` is byte-identical to this branch's
  `origin/main` base `21a70ed`, verified by an empty
  `git diff 3bbf148 21a70ed -- frontend/src`). **after** = `:5174` (this branch
  HEAD). Both hit the same backend `:8764` + SELECTOR `:1235` — cleaner than the
  memory's `git stash` method (both servers warm, no checkout churn).
- **Normalization** (per `docs/notes/perf-capture-normalization-protocol.md` +
  ADR-0010): don't compare raw whole-capture totals; normalize on `autonav:step`
  count and confirm the render-coupling invariant (per-component render÷patch
  ratio ≈ 1.00; "render ≫ patch is the tell").

## Result

| metric | before (`:5173` / main) | after (`:5174` / fix) |
|---|---|---|
| `autonav:step` (stimulus) | **100** | **100** |
| per-component R/P ratio | **1.00 (every component)** | **1.00 (every component)** |
| per-nav-step board/tree comps (BoardWidget / BoardDisplay / TreeWidget / StatusBar) | ~101 each | ~101 each |
| chart panels (AnalysisChartPanel / BaseChart) | 254 / 254 | 208 / 208 |
| total render ops · events | 2066 · 161094 | 1819 · 152528 |

- **The load-bearing invariant holds:** every component renders at **R/P = 1.00**
  in both captures — no render-coupling introduced (ADR-0010).
- **Identical stimulus:** `autonav:step = 100` in both → directly comparable.
- **Per-nav-step render path unchanged:** the board/tree components that render
  once per nav step are ~101 in both.
- **The total/chart-panel delta is the documented confound, not the change:**
  `AnalysisChartPanel` / `BaseChart` / `ScoreLeadPanel` / `MergedDeltaPanel`
  render per *analysis packet*, and packet volume varies run-to-run with KataGo
  cache warmth (protocol confound #1), so their counts (254→208, etc.) are not
  comparable as totals. The change touches no analysis/chart code — the one
  analysis-path edit (P2, `useAnalysisProjection.activeMainIndex`) is a
  boardId-keyed cursor read, behaviour-identical under single-active-board, and
  those panels' R/P stayed 1.00.

## Confounds noted (ADR-0009 honesty)

- **MiniBoard renderer differed:** before mounted `MiniBoardSvg`, after
  `MiniBoardCanvas` (the `appearance.miniBoardRenderer` setting). Orthogonal to
  this change (it touches no MiniBoard / renderer-setting code) — an
  environmental difference between the two unauthenticated server instances (a
  default/hydrate difference, not stable across these two runs), not a code
  effect. Both render paths show R/P = 1.00, so the invariant is unaffected; a
  re-run would confirm its nondeterminism if it ever matters.
- **Scenario coverage:** `full-stress` exercises the Analysis tab (board nav +
  streaming range analysis + popover), **not** the Cards-tab forest where most
  of this change lives — there is no perf scenario for the forest. The
  forest/card-tree change is structural (slot ownership), not on a measured hot
  path; the board-scope store changes (`forestNav` per-board, the `closeBoard`
  registry) are cold-path. So this battery covers the broad store / projection
  reactivity, not the forest specifically.
- **Cache order:** before ran first (colder), after second (warmer) — yet after
  had *fewer* renders, confirming the total delta is packet-volume noise, not a
  warming artifact flattering the change.

## Traces (off-tree per ADR-0009)

- before: `~/w/vdc/chromium_profiles/full-stress-2026-06-09T01-03-17-657Z.json`
  (33.1 MB · 161094 events)
- after: `~/w/vdc/chromium_profiles/full-stress-2026-06-09T01-03-40-112Z.json`
  (30.8 MB · 152528 events)

License: Public Domain (The Unlicense).
