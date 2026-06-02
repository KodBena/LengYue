# Roadmap: Phase 3.5 learned-VF SPA integration

- **Status:** Planned. Drafted 2026-05-18 after the Phase 3.5
  retrospective; pending proxy-side scaffolding for SPA-visible
  surface.
- **Scope:** Enable users to opt into the LightGBM-supervised
  value function from the SPA's range-adaptive-reevaluate
  subwidget. First-cut deployment: experimental opt-in alongside
  the existing hand-crafted alternatives.

Companion: `docs/notes/retrospective/retrospective-phase3.5-learned-vf-2026-05.md`.

---

## User-facing surface

Per the project author's direction (2026-05-18): a **drop-down
in the same subwidget that toggles whether a turn-range should be
adaptively re-evaluated**. Concretely, the dropdown gives the
user four choices for the value function:

  - **lcb_spread** *(default; universal)* — current best
    hand-crafted; cross-NN-invariant per the Phase 3 benchmark.
  - **score_stdev** — alternative hand-crafted; near-uniform on
    the per-turn evaluation but kept for completeness.
  - **policy_entropy** — alternative hand-crafted; performs
    poorly on the principled metric but exposed so the user can
    experiment.
  - **learned** `[experimental]` — the Phase 3.5 LightGBM-pair.
    Tooltip / disclosure: *"Optimized for modern game positions
    (~2000+). Historical professional records (Shusaku, Dosaku,
    Go Seigen, Huang Longshi, Fan Xiping, etc.) may benefit
    from `lcb_spread` instead. Diverse-corpus retraining
    pending."*

The `[experimental]` tag matches FEATURES.md's state-qualifier
discipline (the immature-feature allowance noted in the umbrella
CLAUDE.md). Promote to non-experimental when the diverse-corpus
retraining pass lands and the historical-OOD gap closes to
within ~0.04 efficiency.

### Sketch of the widget shape

```
[ ] adaptively re-evaluate this turn range
    value function: [ learned (experimental) ▾ ]
                     │
                     ├── lcb_spread (default)
                     ├── score_stdev
                     ├── policy_entropy
                     └── learned (experimental)
```

The dropdown is hidden / disabled when the checkbox is off
(value function only matters when adaptive re-evaluation is
engaged). When the checkbox is on, the dropdown defaults to
`lcb_spread` for fresh sessions; user choice persists per
analysis range (or globally — TBD per existing
range-configuration patterns).

---

## Wire shape

The v1.0.25 substrate's capability negotiation already supports
per-query value-function binding via
`capabilities.adaptive_reevaluate.value_binding` + the
`analysis_config.symbols` /
`analysis_config.bindings.value_fn` map. For hand-crafted
options, the SPA already (or will) author the binding as a
small expression — e.g., `policy_entropy` maps to a symbol that
computes Shannon entropy over `policy`.

The **learned** option needs a different wire shape because a
LightGBM model isn't expressible as an `analysis_config.symbols`
formula. Three deployment options were considered:

  1. **Proxy-hosted prediction** *(recommended)*. The proxy loads
     the model at startup. A new capability — e.g.,
     `capabilities.adaptive_reevaluate.value_binding:
     "learned_v1"` — dispatches to a hard-wired predictor that
     extracts V=200 features from the per-turn responses and
     calls `model.predict`. No `analysis_config.symbols` for
     this path; the binding is a name only.
  2. **SPA-side prediction** with a JS port (or ONNX) of the
     LightGBM model. SPA extracts features client-side from the
     V=200 analyze response, runs inference, then passes the
     per-turn predicted `r` values into the wire query via
     `analysis_config.symbols` as a constant lookup table.
  3. **Hybrid**: SPA extracts features from the V=200 response
     and ships them to the proxy via a new capability; proxy
     runs the model.

**Choice: (1).** Reasons:
  - The proxy already has the V=200 state and the feature-
    extraction code (~/benchmark_allocation/extract_features.py is
    the reference implementation; will be ported into the proxy's
    middleware module).
  - The model file is ~200 KB; bundling at proxy build time is
    fine. No SPA-bundle bloat.
  - Versioning the binding (`learned_v1`, `learned_v2`, …)
    cleanly handles future retraining without breaking earlier
    SPA versions.
  - Inference is 287 µs/cell — negligible against the proxy's
    other per-query work.

(2) was tempting for "SPA self-contained" reasons but adds JS-side
inference complexity and a separate model-shipping path. (3) is
mostly the worst of both worlds. Stay with (1).

### Versioning

The capability name carries a version suffix:
`value_binding: "learned_v1"`. Each retraining bumps the suffix
(`learned_v2`, …). SPA UI shows the active version as part of
the dropdown label (or a small `(v1)` indicator) so users
encountering different proxy versions get unambiguous behaviour.

---

## Default behaviour

Until the diverse-corpus retraining lands:

  - SPA default: `lcb_spread`. Cross-NN-invariant per the Phase 3
    benchmark. Era-neutral; works for historical and modern games
    alike.
  - `learned_v1` available but marked `[experimental]`.
  - Tooltip warns about the era-OOD finding from the Phase 3.5
    held-out validation.

After diverse-corpus retraining:

  - Re-validate `learned_v2` on both modern and historical
    held-out.
  - If cross-context efficiency stratification is within ~0.04
    (vs. current ~0.08-0.15), promote `learned_v2` to
    non-experimental and consider it as the SPA's universal
    default.
  - `lcb_spread` retained as a fallback for users who explicitly
    want a hand-crafted policy or for proxy versions that don't
    ship a learned model.

---

## Concrete next steps

### Proxy side (v1.0.26 candidate)

1. **Add a learned-VF substrate module** —
   `proxy/middleware/learned_value_fn.py`:
   - Loads the LightGBM model from a bundled file at proxy
     startup (or via env var pointing at the model path).
   - Exposes a `LearnedValueFn` class implementing the substrate's
     `value_fn` protocol: `Callable[[TurnView], float]`.
   - Internally caches per-cell feature extraction (key: cell id +
     turn) so the same `TurnView` isn't re-featurised across the
     allocator's iterations.
2. **Port the feature extractor** from
   `~/benchmark_allocation/extract_features.py` into proxy code.
   Two halves:
   - Per-turn extractor: scalar `rootInfo` fields, top-K
     `moveInfos` stats, PV decay, policy entropy. All from one
     analyze response.
   - Range-level summarizer: mean/std/min/max across the
     analyzed turns. Operates on the full set of per-turn vectors.
3. **Wire the capability**:
   - `capabilities.adaptive_reevaluate.value_binding: "learned_v1"`
     dispatches the `LearnedValueFn`.
   - Eager validation refuses with `allocation_invalid` if the
     model file isn't loaded (e.g., misconfigured proxy).
   - `query_version` response advertises `learned_v1` in the
     capabilities object so the SPA can detect availability.
4. **Bundle the model file** at `proxy/data/learned_value_fn_v1.txt`.
   Two LightGBM boosters per binding (r_full + r_int); the
   `_efficiency_piecewise` allocation needs both, but we can store
   them concatenated or as separate files.
5. **Tests**: smoke test that feeds a fixture cell through
   `LearnedValueFn.allocate()` and verifies the allocation is
   non-empty and sums to budget. Regression test that loads the
   model on a held-out feature vector and asserts the prediction
   matches the offline `evaluate_learned_vf.py` output to within
   ε.
6. **Substrate docs**: extend
   `proxy/docs/roadmap-info-theoretic-allocation.md` with a
   §3.6.7 "Learned value function (Phase 3.5)" subsection that
   documents the binding shape, the feature extractor, and the
   versioning convention.
7. **Release as v1.0.26**.

### Umbrella / SPA side

1. **Bump the proxy submodule** after v1.0.26 lands (separate
   umbrella PR per established discipline).
2. **Frontend dropdown** in the adaptive-reevaluate subwidget:
   - Vue component changes (small).
   - State management: persist user's value-fn choice per range
     (alongside the checkbox state) using the same persistence
     mechanism as the rest of the range configuration.
   - Wire to the analyze query: when the checkbox is on and the
     dropdown is `learned`, set
     `capabilities.adaptive_reevaluate.value_binding: "learned_v1"`
     (or whichever version the proxy advertises). When the
     dropdown is `lcb_spread` / `score_stdev` / `policy_entropy`,
     set the matching `analysis_config.symbols` payload.
3. **Capability-detection in the SPA**: on session start, the SPA
   already calls `query_version`; extend the parser to recognise
   `learned_v1` (and future versions) in the capabilities object.
   If absent, hide the "learned" option from the dropdown (the
   proxy doesn't support it).
4. **FEATURES.md update**: add the new option to the
   range-adaptive-reevaluate entry with the `[experimental]` tag.
5. **Tooltip / disclosure text**: standard SPA pattern for opt-in
   experimental features. Body should be honest about:
   - The ~0.85-0.90 expected efficiency on modern games.
   - The era-OOD caveat for pre-2000 professional records.
   - The fact that this is a learned model that's updated
     periodically (so behaviour may shift on proxy upgrades).
6. **E2E test**: select the `learned (experimental)` option in
   the dropdown, trigger an analysis, verify the proxy receives
   the correct `capabilities` shape.

### Coordination

Two PRs land together:
  - Proxy-side v1.0.26 (substrate change + model file +
    capability registration + tests).
  - Umbrella-side submodule bump + SPA dropdown + e2e test.

Pre-PR: a brief proxy-to-frontend dispatch under
`docs/dispatch/proxy-to-frontend-learned-vf.md` that pins the
final wire shape ahead of SPA code changes. The umbrella's
CLAUDE.md anticipates this for cross-sub-project work.

---

## Open questions to settle before code

1. **Capability name shape**. `value_binding: "learned_v1"` vs.
   `allocation_algorithm: "learned_v1"` vs. some entirely new
   capability key. The substrate's current `value_binding`
   accepts a symbol name from `analysis_config.symbols`; the
   `learned_v1` shape is a *name* without a symbol entry, which
   slightly extends the contract. Either:
   - Reuse `value_binding` with a special-cased name namespace
     (`learned_*` is reserved for proxy-hosted predictors).
   - OR add a sibling field
     `capabilities.adaptive_reevaluate.value_provider: "learned_v1"`
     that's mutually exclusive with `value_binding`.

   The first option is less invasive. The second is more
   honest about the type distinction. Settle in the dispatch.

2. **Where the model file lives in the proxy repo**.
   - `proxy/data/learned_value_fn_v1.txt` (proxy-internal).
   - OR `proxy/models/v1/{r_full.txt, r_int.txt}` (anticipates
     a model registry).

   Either fine. Prefer the registry layout for forward
   compatibility.

3. **Model retraining trigger**. The Phase 3.5 retrospective
   filed diverse-corpus retraining as the immediate next data
   collection arc. When that lands, do we ship `learned_v2`
   immediately, or only after the held-out re-validation
   confirms the era-OOD gap closed?

   Recommendation: **only after re-validation**, and only as
   non-experimental once the gap is within ~0.04. Versioning
   lets us ship `learned_v2` as `[experimental]` first if the
   author wants to expose it early.

4. **What happens when the user authors a custom value
   function**. The existing `analysis_config.symbols` mechanism
   allows users to author arbitrary expressions. The dropdown's
   four options should NOT lock out custom authorship. Probably
   the dropdown reflects "preset" choices, and a separate "Custom
   (advanced)…" path exposes the existing symbols editor. Defer
   the precise UX to the SPA implementation.

---

## Out of scope for the first integration

- A model-management UI in the SPA. The model is bundled with the
  proxy; users can't swap it out via the SPA.
- Telemetry of "which value function did the user pick, and were
  they satisfied?" — would inform future retraining priorities,
  but adds a feedback loop that needs its own design.
- Inference acceleration (lleaves, ONNX, batch-prediction
  proxy-side). The 287 µs / cell baseline is comfortable.
- Per-user model fine-tuning. Far future.

---

## Where the artefacts live

| Artefact | Path | Status |
|---|---|---|
| Phase 3.5 retrospective | `docs/notes/retrospective/retrospective-phase3.5-learned-vf-2026-05.md` | Shipped (PR #260) |
| Phase 3.5 archive (planned) | `docs/archive/phase3.5-learned-vf/` | TODO |
| This roadmap | `docs/notes/roadmap-phase3.5-spa-integration.md` | This file |
| Proxy substrate design note | `proxy/docs/roadmap-info-theoretic-allocation.md` | Shipped in v1.0.25 |
| Pre-implementation dispatch (planned) | `docs/dispatch/proxy-to-frontend-learned-vf.md` | TODO before SPA work starts |

License: Public Domain (The Unlicense)
