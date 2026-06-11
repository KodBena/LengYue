# Learned value-function wire contract — frontend consumed

- **Date:** 2026-06-11
- **From:** frontend
- **To:** proxy (KataProxy)
- **Type:** reciprocal consumed-status notification — the frontend
  confirms consumption of the learned-vf wire contract specified in
  `docs/dispatch/proxy-to-frontend-learned-vf.md`.
- **Status:** shipped; closes the open contract in the originating
  dispatch.

## TL;DR

The frontend has consumed the learned-vf wire shape in full. The
originating dispatch's 2026-06-10 status note records the ship on
both sides; this dispatch is the frontend's formal acknowledgement.
Work-status item: `learned-vf-dispatch-closure`.

## What was consumed

The following surfaces shipped against the wire contract as recorded in
`proxy-to-frontend-learned-vf.md`:

- **Typed capability mirror.** `AdaptiveReevaluateAdvertisedMetadata`
  and `CapabilityAdvertisement` in `frontend/src/engine/katago/types.ts`
  declare `available_value_bindings?: readonly string[]` on the
  advertisement side. `AdaptiveReevaluateQueryMetadata` /
  `PerQueryCapabilities` cover the per-query opt-in side. The
  typed-capability-metadata-mirror arc (work-status item
  `typed-capability-metadata-mirror`) closed the open cast pattern
  the dispatch anticipated; `parseVersionResponse` in `version-probe.ts`
  validates the advertisement once and degrades that one capability
  loudly on mismatch rather than refusing the connection.

- **Value-function dropdown.** `AnalysisControls.vue` renders the
  dropdown under the adaptive-fields block. Options are "default
  (built-in)" (no Phase 3 fields sent — byte-for-byte compatible with
  pre-v1.0.26 proxies) and one row per `learned_*` version advertised
  by the connected proxy. The `learned_v1` row is conditionally shown
  only when `available_value_bindings` includes it.

- **Per-query capability injection.** `capability-injection.ts`
  includes `value_binding` and `allocation_algorithm: "learned_piecewise"`
  in the injected `adaptive_reevaluate` metadata when the user has
  selected a `learned_*` binding. `visit_scaling_model` is omitted on
  the learned path per the dispatch's Q3 resolution. When the user has
  selected the default option, no Phase 3 fields are added.

- **Store field.** `engine.katago.adaptiveReevaluate.valueBinding:
  string` (default `"lcb_spread"` as shipped; corrected to
  `"default"` to match the `default (built-in)` option in the same
  arc). Schema version 31 migration adds the field with its default
  value.

- **`en` locale keys.** `analysis.adaptive.valueBinding.label`,
  `analysis.adaptive.valueBinding.default`,
  `analysis.adaptive.valueBinding.learnedLabel`, and
  `analysis.adaptive.valueBinding.experimentalTooltip` are present in
  `frontend/src/locales/en.json`.

## Residue closed in this PR

Two items from the originating dispatch's 2026-06-10 status note
remained unshipped at that point:

- **FEATURES.md one-liner.** A new "Adaptive re-evaluation controls"
  bullet added to FEATURES.md in the Analysis charts section, noting
  the value-function dropdown and the `[experimental]` tag on the
  learned-predictor option.

- **Non-`en` locale keys.** `ja`, `ko`, and `zh-CN` catalogs receive
  the four `analysis.adaptive.valueBinding.*` keys as machine-drafted
  translations (flagged `[unreviewed translation]` in the worklog).
  Standard JSON does not support inline comments; the flag lives in
  `docs/worklog/2026-06-11-learned-vf-dispatch-closure.md`.

## What this dispatch is NOT addressing

- The `allocation_invalid` error surfacing in the analysis pane — that
  is proxy-side behaviour; the SPA displays the structured error when
  the proxy refuses the query.
- Diverse-corpus retraining to `learned_v2` — a separate data-collection
  arc independent of this dispatch.
- The `[experimental]` tag on `learned_v1` being retired — that
  happens when end-to-end validation with the model bundle is complete.

## Reply

No reply requested. The maintainer reviews this response post-merge
(autonomous-session convention). The work-status item
`learned-vf-dispatch-closure` records the closure.

License: Public Domain (The Unlicense).
