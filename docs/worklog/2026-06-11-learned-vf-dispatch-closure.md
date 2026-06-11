# Worklog — learned-vf dispatch closure (2026-06-11)

> Delivery record for work-status item `learned-vf-dispatch-closure`.
> The 2026-06-10 status note in
> `docs/dispatch/proxy-to-frontend-learned-vf.md` recorded both sides
> shipped against the learned-vf wire contract but named two residual
> items as below-the-line leads: the FEATURES.md one-liner for the
> value-function dropdown, and the non-`en` locale catalogs'
> `analysis.adaptive.valueBinding.*` keys. This arc closes both, plus
> authors the consumed-status dispatch.

## The change

### Leg 1 — FEATURES.md

No standalone adaptive-reevaluate entry existed in FEATURES.md (the
word appeared only in the engine-controls capability list at line 153).
Deviation from spec: the instruction said "find the existing
adaptive-reevaluate description" — one did not exist. The resolution
was to add a new bullet in the Analysis charts section (adjacent to
"Range-selection re-analysis") that covers both the basic concept and
the value-function dropdown in a single sentence, matching the tour's
descriptive voice. The `[experimental]` tag is placed inline on the
learned-predictor clause.

Added sentence (exact text):

> When adaptive re-evaluation is enabled, the user can pick the
> analysis value function used for worst-turn selection;
> proxy-hosted learned predictors (`learned_v1`) appear as options
> when the connected proxy advertises them `[experimental]`.

### Leg 2 — locale keys (ja / ko / zh-CN)

All three catalogs are actively populated (not stubs). The four
`analysis.adaptive.valueBinding.*` keys were added after the
`analysis.adaptive.hint` entry in each catalog.

Standard JSON does not support inline comments. Translations are
machine-drafted and flagged here as `[unreviewed translation]`,
listed key by key:

- `analysis.adaptive.valueBinding.label`
  - ja: `評価関数` [unreviewed translation]
  - ko: `평가 함수` [unreviewed translation]
  - zh-CN: `评估函数` [unreviewed translation]

- `analysis.adaptive.valueBinding.default`
  - ja: `デフォルト (組み込み)` [unreviewed translation]
  - ko: `기본값 (내장)` [unreviewed translation]
  - zh-CN: `默认（内置）` [unreviewed translation]

- `analysis.adaptive.valueBinding.learnedLabel`
  - ja: `{version} [実験的]` [unreviewed translation]
  - ko: `{version} [실험적]` [unreviewed translation]
  - zh-CN: `{version} [实验性]` [unreviewed translation]

- `analysis.adaptive.valueBinding.experimentalTooltip`
  - ja: Phase 3.5 LightGBM predictor description, Japanese
    [unreviewed translation]
  - ko: Phase 3.5 LightGBM predictor description, Korean
    [unreviewed translation]
  - zh-CN: Phase 3.5 LightGBM predictor description, Simplified
    Chinese [unreviewed translation]

Native-speaker review is the remaining gate per locale, consistent
with the existing machine-translation notice in each catalog's
`localePicker.machineTranslatedNotice` key.

### Leg 3 — consumed-status dispatch

`docs/dispatch/frontend-to-proxy-learned-vf-consumed.md` authored
following the format of
`docs/dispatch/frontend-to-backend-card-metadata-inline-edit-arc1-consumed.md`.
Ships under the autonomous-session convention; maintainer reviews
post-merge.

## Verification

- `npm run build` (vue-tsc strict + vite): ✓
- `npm run test:run`: 1002 passed, 4 skipped (69 files)
- `npx eslint .`: exit 0
- `node tools/doc-graph/generate.mjs`: 471 nodes, 2282 edges
  (structural doc change — new dispatch file)

## Deviations

1. **No existing adaptive-reevaluate entry in FEATURES.md.** The spec
   said "find the adaptive-reevaluate description" — it did not exist.
   A new one-sentence bullet was added rather than appending to a
   non-existent entry. The placement (Analysis charts section, after
   range-selection re-analysis) is the closest natural home given that
   the controls live in `AnalysisControls.vue` alongside the
   chart cluster's controls.

---

License: Public Domain (The Unlicense).
