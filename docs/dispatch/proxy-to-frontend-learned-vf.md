# Dispatch: proxy → frontend — learned value-function wire shape

- **From:** proxy (KataProxy)
- **To:** frontend (SPA, Vue 3 + TypeScript)
- **Topic:** Phase 3.5 LightGBM-supervised value function — wire shape and capability shape for the SPA's range-adaptive-reevaluate UI surface.
- **Status:** Open. Pins the wire shape ahead of any implementation work on either side. Both PRs (proxy v1.0.26 + umbrella submodule bump + SPA changes) reference this dispatch.
- **Date:** 2026-05-18.

## Why this dispatch exists

Per the proxy's CLAUDE.md: "Do not unilaterally widen the wire to satisfy a consumer." Per the frontend's CLAUDE.md: the proxy's wire vocabulary is bounded by `src/engine/katago/types.ts`. The Phase 3.5 retrospective + SPA-integration roadmap (`docs/notes/retrospective-phase3.5-learned-vf-2026-05.md`, `docs/notes/roadmap-phase3.5-spa-integration.md`) name a UI surface (a dropdown in the same subwidget that toggles `adaptiveReevaluate.enabled`) but defer the wire-shape decisions to this dispatch.

The wire shape needs to be pinned before either side codes:

- The SPA needs to know which capability fields to set so the dropdown's "learned" option engages the right substrate path.
- The proxy needs to know the namespace convention so the substrate's eager validation correctly distinguishes user-authored value_fn symbols from proxy-hosted predictors.

Both sides have referenced this dispatch in their respective sub-project roadmaps. The body of this document is binding.

## Wire shape, settled

### Capability advertisement (proxy → SPA)

The proxy's `query_version` response includes a per-capability metadata object. Today it advertises `adaptive_reevaluate` as a key whose value carries the capability's parameters (e.g., `extra_visits`, `worst_quantile`). Extend the advertised shape:

```json
{
  "version": "1.0.26",
  "capabilities": {
    "adaptive_reevaluate": {
      "extra_visits": "<int>",
      "worst_quantile": "<float>",
      "available_value_bindings": ["learned_v1"]
    }
  }
}
```

The `available_value_bindings` array enumerates **proxy-hosted predictor names** that the SPA can request. Absent / empty array = proxy does not host any learned predictor; SPA should not show the "learned" option in the dropdown.

Versioned names (`learned_v1`, `learned_v2`, …) let the proxy ship a new model without breaking SPA versions that requested an older one. The SPA picks the highest version it knows about; the proxy advertises all versions it can serve (typically just the latest, unless the proxy intentionally retains older ones).

### Per-query opt-in (SPA → proxy)

When the user selects "learned" in the dropdown and the analyze query is dispatched, the SPA's capability injection sets:

```json
{
  "capabilities": {
    "adaptive_reevaluate": {
      "extra_visits": "<int from user setting>",
      "worst_quantile": "<float from user setting>",
      "value_binding": "learned_v1",
      "visit_scaling_model": "monte_carlo_sqrt",
      "allocation_algorithm": "greedy_eig"
    }
  }
}
```

`value_binding: "learned_v1"` is the **proxy-hosted predictor name**. The `learned_` prefix is the reserved namespace marker; any string starting with `learned_` bypasses the substrate's normal symbol-table lookup and dispatches to a hard-wired predictor by name.

### Important non-changes

- `analysis_config` is **optional** when `value_binding` is a `learned_*` name. The substrate's current eager validation requires `analysis_config.bindings.value_fn` to match `value_binding`, sourced from `analysis_config.symbols`. That check is bypassed for the `learned_*` namespace — the predictor is server-side code, not a user-authored expression.
- The other three Phase 3 capability fields (`visit_scaling_model`, `allocation_algorithm`, `extra_visits`) are unchanged. The SPA's dropdown surfaces only the value-function choice; the other fields keep their existing controls or defaults.
- **MVP uses single-value-function path.** The substrate's `AllocationAlgorithm.allocate(...)` consumes one `Callable[[TurnView], float]`. The Phase 3.5 model has TWO sub-models (r_full + r_int) and the principled efficiency at 0.93-0.97 uses both via piecewise water-fill. The MVP wire shape exposes only the r_full prediction (paired with `monte_carlo_sqrt` scaling → analytical sqrt-water-fill ≈ `greedy_eig` in the limit), giving ~0.76-0.78 efficiency modern-held-out. Lifting to the full piecewise path requires a substrate extension (a second `Callable` for r_int) and is deferred to a follow-up arc (Phase 3.5.1 / v1.0.27 candidate).

### Refusal surface

If the SPA opts in to `value_binding: "learned_v1"` but the proxy isn't advertising it (model file not bundled, or the binding name isn't recognised), the substrate refuses the query with the existing `allocation_invalid` error code. Detail:

```json
{
  "code": "allocation_invalid",
  "value_binding": "learned_v1",
  "issue": "proxy does not advertise this learned predictor; check query_version.capabilities.adaptive_reevaluate.available_value_bindings",
  "available": ["learned_v0", "..."]
}
```

The SPA should NOT silently downgrade to a hand-crafted binding on this error — it surfaces in the analysis pane so the user can see what happened. (The capability-detection flow above prevents this for compliant SPA versions; the refusal exists for misconfigured queries.)

## Model registry convention (proxy-internal)

The proxy bundles model files at:

```
proxy/models/learned_value_fn/v1/
    r_full.txt      # LightGBM native format, 196 trees, ~580 KB
    r_int.txt       # LightGBM native format, 244 trees, ~730 KB
    metadata.json   # version + training-corpus signature + feature-name list
```

`metadata.json` carries the feature-name list so the runtime predictor can validate that incoming feature vectors match the trained model's expected shape. Mismatch → refuse the binding at startup (logged at ERROR; the binding doesn't get advertised in `query_version`).

Future versions sit alongside: `proxy/models/learned_value_fn/v2/...`. The proxy may advertise multiple versions simultaneously; the SPA picks the highest it knows about.

## Substrate dispatch logic (proxy-internal)

The substrate's `_validate_and_resolve_phase3_config` function (currently in `middleware/adaptive_reevaluate.py` around line 1680) gains a branch:

```python
if value_binding.startswith("learned_"):
    # Proxy-hosted predictor path: skip analysis_config validation,
    # look up the predictor by name in the loaded registry.
    predictor = _learned_value_fn_registry.get(value_binding)
    if predictor is None:
        raise AdaptiveConfigurationError(
            code="allocation_invalid",
            detail={
                "value_binding": value_binding,
                "issue": (
                    "proxy does not advertise this learned predictor; "
                    "check query_version.capabilities."
                    "adaptive_reevaluate.available_value_bindings"
                ),
                "available": sorted(_learned_value_fn_registry),
            },
        )
    value_fn = predictor  # already a Callable[[TurnView], float]
    # The other Phase 3 co-fields (visit_scaling_model,
    # allocation_algorithm) keep their existing validation.
else:
    # Existing user-authored path: validate analysis_config, look up
    # symbol, get_value_fn(), etc. Unchanged from v1.0.25.
    ...
```

The user-authored path stays intact. Existing SPA versions that send `value_binding` as a symbol name keep working; the new `learned_*` namespace is purely additive.

## Implementation notes (proxy side)

- **New module**: `proxy/middleware/learned_value_fn.py`. Loads LightGBM models at proxy startup. Exposes:
  - `LearnedValueFnRegistry` — singleton, maps `learned_v1` etc. to predictor instances.
  - `LearnedValueFn` — implements `Callable[[TurnView], float]`. Loads its model file at construction; pre-computes range-level features lazily on first call within an allocation (cached by cell id).
- **Feature extractor port**: pure-Python module at `proxy/learned_vf_features.py`. Faithfully reproduces `~/benchmark_allocation/extract_features.py`'s per-turn + range-level features. The model bundle's `metadata.json` carries the expected feature-name list; the predictor asserts shape match at construction.
- **Lifecycle**: registry built at `ProxyServer(...)` construction. Failure to load any bundled model logs at ERROR but does not abort startup — the affected version is just absent from `available_value_bindings`. (Fail-loud applies; the structured event is `Event.STARTUP_WARNING` with the loading error attached.)
- **Tests**:
  - Unit: feature-extractor produces the expected shape on a fixture cell.
  - Unit: predictor returns finite floats on a fixture TurnView; raises on malformed input.
  - Integration: the substrate's dispatch routes `value_binding: "learned_v1"` to the registry; `value_binding: "learned_nonexistent"` raises `allocation_invalid`.
  - Regression: loading a corrupted model file logs the error and the version is missing from `available_value_bindings` advertisement.

## Implementation notes (frontend side)

- **`src/engine/katago/types.ts`**: extend the `AdaptiveReevaluateCapability` type with `available_value_bindings?: string[]` (proxy → SPA advertisement).
- **`src/engine/katago/capability-injection.ts`**: when the user has selected a `learned_*` binding via the dropdown, include `value_binding`, `visit_scaling_model`, `allocation_algorithm` in the injected `adaptive_reevaluate` capability metadata.
- **`src/components/editors/AnalysisControls.vue`**: under the `adaptive-fields` block (currently lines ~170-191), add a `<select>` for value-function choice. Options:
  - `lcb_spread` *(default; universal)*
  - `score_stdev`
  - `policy_entropy`
  - `learned_v1` `[experimental]` — only shown if the proxy's `available_value_bindings` includes it
- **Store**: `engine.katago.adaptiveReevaluate.valueBinding: string` (default `"lcb_spread"`). Migration N+1 adds the field with default value.
- **i18n**: new keys `analysis.adaptive.valueBinding.label`, `analysis.adaptive.valueBinding.options.{lcb_spread,score_stdev,policy_entropy,learned_v1}`, `analysis.adaptive.valueBinding.experimentalTooltip`.
- **FILES.md**: no new files; modify existing entries' purpose lines only if they materially change (likely just `AnalysisControls.vue`).
- **FEATURES.md**: add a one-line entry to the existing adaptive-reevaluate description noting the dropdown's existence and the `[experimental]` tag on the learned option.
- **Tests**:
  - Unit (tests/unit/): capability-injection produces the right shape when `valueBinding` is set.
  - Integration (tests/integration/): selecting "learned_v1" + opening an analysis flow → analyze query carries the right capability shape.

## Pre-implementation open questions, settled here

1. **Capability name shape.** Settled: reuse `value_binding` with the `learned_*` namespace convention. Rationale: keeps the existing wire field; adds a string-prefix convention that's documented here and won't drift. No new field added.
2. **Where the model file lives.** Settled: `proxy/models/learned_value_fn/v1/`. Forward-compatible with multiple versions.
3. **Model retraining trigger.** Settled: ship `learned_v1` as `[experimental]` after the diverse-corpus retraining lands. The retraining pass is what makes the model "ready for opt-in"; pre-retraining (the current state) is too era-OOD on b18/b28 to ship cleanly. The proxy can advertise `learned_v1` once the model bundle exists; the SPA's `[experimental]` tag and tooltip are the user-facing honesty about the OOD caveats.
4. **Custom value-fn authorship preservation.** Settled: the dropdown shows "preset" choices (`lcb_spread`, `score_stdev`, `policy_entropy`, `learned_v1`); a separate "Custom (advanced)…" path retains the existing `analysis_config.symbols` editor for power users. The dropdown does not lock out hand-authored expressions; it's a convenience layer.

## What this dispatch is NOT settling

- The piecewise-water-fill path (r_full + r_int both) requires a substrate extension and is filed as Phase 3.5.1 (v1.0.27 candidate). MVP is sqrt-water-fill on r_full predictions only.
- The diverse-corpus retraining itself — that's a data-collection arc independent of this dispatch. The model bundle's `metadata.json` will carry a training-corpus signature so the SPA can tell which model is loaded.
- Telemetry of "which value function did the user pick, was the user satisfied" — separate design.

## References

- `docs/notes/retrospective-phase3.5-learned-vf-2026-05.md` — Phase 3.5 retrospective.
- `docs/notes/roadmap-phase3.5-spa-integration.md` — SPA-integration roadmap.
- `docs/notes/retrospective-phase3-policy-benchmark-2026-05.md` — Phase 3 benchmark (the upstream).
- `docs/archive/phase3.5-learned-vf/` — reproducibility deposit (model files, scripts, validation data).
- `proxy/CLAUDE.md` — proxy's architecture + release discipline.
- `frontend/CLAUDE.md` — frontend's architecture + testing posture.

## Status of this dispatch

Open for response. Either sub-project may request adjustments before implementation begins; the body of this document is otherwise binding once both PRs reference it.

License: Public Domain (The Unlicense).
