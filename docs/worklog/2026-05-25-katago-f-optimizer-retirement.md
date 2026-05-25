# KataGo F-optimizer — retirement against upstream fix of `#1197`

- **Status:** Shipped. The F-optimizer cohort is removed from the
  SPA; the `KATAGO_FIRST_REPORT_FLOOR_S` wire-side clamp moves to
  KataGo's protocol-documented minimum (`0.001`). Schema-version
  47 → 48 + 48 → 49 migrations walk persisted KnobDecls forward
  and clear the orphan optimizer-cache localStorage key.
- **Genre:** Workaround retirement. Closes the arc opened by
  `2026-05-15-katago-first-report-cliff-diagnosis.md` and shipped
  by `2026-05-17-katago-f-optimizer.md`. The corresponding
  retrospective `docs/notes/retrospective-katago-f-optimizer-2026-05.md`
  gains a §Retirement section pointing here.
- **Date:** 2026-05-25.

## Context

The F-optimizer was an SPA-side workaround for
[`lightvector/KataGo#1197`](https://github.com/lightvector/KataGo/issues/1197),
filed 2026-05-16. KataGo's analysis engine refused to ship the
first during-search report until the next cadence-aligned eval-
completion tick — the documented `firstReportDuringSearchAfter`
field was honoured additively (`dt = cadence_tick + F + offset`)
rather than absolutely (`dt = F + offset`). The retrospective's
§6 diagnoses the mechanism (slope-1 regression at R² > 0.998
across cleanly-characterised cells) and §7 characterises the
strip-flip bimodality at the cliff. Closing observation: *"When
KataGo fixes it, the optimizer becomes unnecessary and the 35 ms
floor can be retired."*

KataGo fixed the bug upstream against KataGo 1.16.5. The
project author re-ran the bug-report reproducers
(`reproducer.py`, `reproducer_node.mjs`, `reproducer_stdio.py`)
against the fixed binary and confirmed the cliff is gone: sub-
cliff F values are honoured directly, and the
"100 k visits before first packet" smoking-gun pattern from §6
no longer reproduces. The arc closes as anticipated.

## Shape of the change

### Wire-side floor

`frontend/src/engine/katago/limits.ts`:
- `KATAGO_FIRST_REPORT_FLOOR_S` drops from `0.035` to `0.001`,
  KataGo's protocol-documented minimum from the analysis-engine
  source.
- Doc comment rewritten: the workaround framing is gone; the
  constant is now described as the protocol-doc reference value,
  with a historical-note paragraph pointing at this worklog and
  the retrospective. The "Removal trigger" section is gone (this
  worklog is the removal).

The constant survives because the wire-layer
`Math.max(KATAGO_FIRST_REPORT_FLOOR_S, slider)` clamp in
`analysis-service.ts` is still the defence-in-depth guarantee
against direct-registry-editor writes that would bypass the
slider widget's range enforcement.

### F-optimizer cohort — deleted

| File | Lines |
|---|---:|
| `frontend/src/engine/katago/optimize-f.ts` | 578 |
| `frontend/src/engine/katago/optimize-f-live-engine.ts` | 256 |
| `frontend/src/composables/useFOptimizer.ts` | 213 |
| `frontend/src/services/optimize-f-cache.ts` | 204 |
| `frontend/src/components/FOptimizerPanel.vue` | 476 |
| `frontend/tests/unit/engine/katago/optimize-f.test.ts` | 313 |
| **Total** | **2 040** |

The four FILES.md entries for the deleted files are removed in
the same change.

### Consumer sites

`frontend/src/services/analysis-service.ts`:
- `import { effectiveFirstReportS } from './optimize-f-cache'` removed.
- Two wire-build sites (the `analyzeRange` and the single-turn
  ponder/analyze paths) collapse from
  `Math.min(cadence, effectiveFirstReportS(...) ?? Math.max(FLOOR, slider))`
  to `Math.min(cadence, Math.max(FLOOR, slider))`.
- Comment blocks rewritten to drop the optimizer-cache mention;
  protocol-doc framing for the floor takes over.

`frontend/src/App.vue`:
- `FOptimizerPanel` import removed; the `<details>` block under
  the Settings tab that hosted the panel is removed.

`frontend/src/store/defaults.ts`:
- The `engine.first-report-during-search-after` KnobDecl's static
  range lowers from `[0.01, 4.0]` to `[0.001, 4.0]` so the floor
  is reachable directly from the slider. `minFloor:
  KATAGO_FIRST_REPORT_FLOOR_S` is retained as the SSOT (now
  equal to `range[0]`, so the `KnobSlider.atFloor` marker short-
  circuits to false and no widget tooltip surfaces).
- Doc comment rewritten to drop the cliff/workaround framing.

`frontend/src/types.ts`:
- `KnobInputDecl.minFloor`'s JSDoc rewritten: the
  workaround/SPA-side-mitigation framing in the original
  "Added 2026-05-15..." paragraph is gone; the field now reads
  as a general external-constraint-induced lower bound.
- The `KataGoEngineProfile.firstReportDuringSearchAfter` JSDoc's
  range note updates `[0.01, 4.0]` → `[0.001, 4.0]`.

`frontend/src/components/knobs/KnobSlider.vue`:
- The two comment passages that named the first-report-after
  cliff as the worked example for the atFloor mechanism rewrite
  to describe the mechanism in general terms (the substrate is
  still general-purpose; only the specific example is gone).

### i18n catalogue

`frontend/src/locales/en.json`:
- 33 `fOptimizer.*` keys removed (the panel-specific catalogue).
- `settings.section.fOptimizer` removed (the Settings-tab section
  heading).
- `knobRegistry.floorTooltip.engine.first-report-during-search-after`
  removed (dead text now that the floor matches `range[0]`).

`frontend/src/locales/ja.json`, `ko.json`, `zh-CN.json`:
- The corresponding `knobRegistry.floorTooltip.*` entries
  removed. (These locales never carried the fOptimizer panel
  keys, so no further cleanup needed.)

### Schema migration

`frontend/src/store/migrations.ts`:
- `CURRENT_SCHEMA_VERSION` bumps from 47 to 49.
- New migration `47 → 48` (a) rewrites persisted
  `engine.first-report-during-search-after` decls' `minFloor`
  from any value `> 0.001` down to `0.001`, idempotent; (b)
  clears the orphan `lengyue.fOptimizerCache.v1` localStorage key.
- New migration `48 → 49` repeats the `minFloor: > 0.001 → 0.001`
  rewrite. Context: the first draft of `47 → 48` walked
  `out.settings?.knobs` instead of the correct
  `out.profile?.settings?.knobs` (cf. the 42 → 43 backfill at
  `archived-migrations.ts:1946`), silently did nothing, and
  stamped to v48 without correcting the persisted `minFloor`.
  The path is fixed in 47 → 48 above (pre-ship, so the in-place
  correction is within editorial scope); 48 → 49 catches any
  v48 blob the broken version stamped. The localStorage cleanup
  is not repeated — it was path-independent and worked
  correctly in the 47 → 48 body.
- The 45 → 46 migration rolls out of `migrations.ts` and into
  `archived-migrations.ts` per the rolling-archive discipline
  (active body retains the latest two migrations as style
  anchors; 46 → 47 and the latest 48 → 49 are kept here, 47 →
  48 is the previous-style anchor that will roll over to
  archive on the next migration that lands).

The localStorage cleanup inside the migration function is a
single side-effect departure from the migration ledger's
normal blob-only contract — noted inline in the migration's
preamble comment.

## Verification

- `npm run build` (= `vue-tsc -b && vite build`). The strict
  typecheck catches any unfound consumer of the deleted cohort.
  All passing.
- Spot-checked the `engine.first-report-during-search-after`
  slider in the registry editor: drags down to 0.001, drags back
  up; the cadence-cap binding to
  `engine.report-during-search-every` still pins the upper edge.
- The KataGo bug-report reproducers (preserved under
  `docs/archive/katago-f-optimizer/`) were re-run against
  KataGo 1.16.5 ahead of this retirement and confirm the
  cliff is gone.

## What stays

The archaeological deposit under `docs/archive/katago-f-optimizer/`
is preserved unchanged. Every numeric claim in the retrospective
remains reproducible from `sweep_results/sweep_results.csv.gz` and
the Python tooling beside it. The diagnosis and shipped-mitigation
worklogs (`2026-05-15-katago-first-report-cliff-diagnosis.md`,
`2026-05-15-katago-first-report-floor-mitigation.md`,
`2026-05-17-katago-f-optimizer.md`) stay as moment-in-time
records; their content does not get back-edited.

The retrospective doc gains the §Retirement section that points
here as its sibling worklog.

## Closing

The optimizer arc was ~1300 lines of compensation code (not
counting the data-gathering Python tooling), justified at ship
time by the median 94 ms first-paint saving over the eight
characterised cells. With KataGo's fix in place, that saving
collapses to zero — the upstream is now honouring F directly
across the parameter space the optimizer characterised. The
codebase reverts to a single small wire-side clamp at the
protocol minimum and a slider that reaches it.

License: Public Domain (The Unlicense)
