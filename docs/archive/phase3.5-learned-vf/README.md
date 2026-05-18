# Phase 3.5 learned-value-function archive

The archaeological deposit for the 2026-05-18 LightGBM-supervised
value-function arc on top of v1.0.25's Phase 3 allocation
substrate. Every numeric claim in
`docs/notes/retrospective-phase3.5-learned-vf-2026-05.md` is
reproducible from the data and tooling here.

Companion archive: `docs/archive/phase3-allocation-benchmark/`
(the upstream Phase 3 benchmark this work builds on).

## Headline

A LightGBM-pair (r_full + r_int) trained on the 435-cell Phase 3
benchmark's V=200 features lifts efficiency from ~0.62
(hand-crafted best) to **~0.85-0.90 on modern held-out games**,
~0.80-0.86 on historical-era games (1700-1980). 287 µs / cell
inference. Tested on three NN tiers (b10c128, b18c384nbt,
b28c512nbt); fdx6d generalization check deferred.

Read the retrospective for the full arc + roadmap.

## What's here

| File | Purpose |
|---|---|
| `extract_features.py` | Re-queries V=200 pre-state for each of the 435 benchmark cells; extracts 121 features per turn; joins with r_int + r_full targets from cells_v2.jsonl |
| `train_lightgbm.py` | LightGBM regression with 5-fold SGF-level CV. `LGB_TARGET` env var selects target column (`target_visit_entropy_reduction` for r_full; `target_int_visit_entropy_reduction` for r_int) |
| `evaluate_learned_vf.py` | Loads both trained models, predicts per turn, allocates via piecewise water-fill on the predicted segments, computes efficiency against the actual r_int/r_full |
| `validation_run.py` | Historical held-out validation — samples ~72 SGFs uniformly across 1700-1980 decade buckets; resume-capable; handles quarter-integer komi (Chinese-counting style); skips handicap games |
| `modern_validation_run.py` | Modern held-out validation — samples 50 SGFs from ~/benchmark_sgfs/ that were NOT in training; resume-capable |
| `learning_curve.py` | Trains the LightGBM pair on SGF-level subsets at fractions {0.1, 0.2, ..., 1.0} × 3 random seeds; evaluates each against both validation sets; fits a saturating curve and reports extrapolations |
| `lightgbm_model_entropy_reduction.txt` | Trained r_full model (LightGBM native format, 196 trees, ~580 KB) |
| `lightgbm_model_int_entropy_reduction.txt` | Trained r_int model (244 trees, ~730 KB) |
| `cv_results_entropy_reduction.json` | CV report for the r_full model: per-fold RMSE / R² / Spearman + feature importance |
| `cv_results_int_entropy_reduction.json` | CV report for the r_int model |
| `learned_vf_efficiency.json` | In-distribution efficiency vs hand-crafted policies, per tier × scaling |
| `validation_summary.json` | Historical held-out efficiency summary |
| `modern_validation_summary.json` | Modern held-out efficiency summary |
| `learning_curve.json` | Per-fraction efficiency on both validation sets + saturating-curve extrapolations |
| `training_features.jsonl.gz` | 5220 rows × 121 features + 8 targets (gzipped) |
| `validation_features.jsonl.gz` | Historical validation features (~2400 rows) |
| `modern_validation_features.jsonl.gz` | Modern validation features (~1800 rows) |
| `validation_cells.jsonl.gz` | Historical validation raw cells (per-turn r_int / r_full per oracle metric) |
| `modern_validation_cells.jsonl.gz` | Modern validation raw cells |

## Reproducing the analysis

```bash
# Unpack data
gunzip -k *.jsonl.gz

# Reproduce CV results from existing features (no GPU)
LGB_TARGET=target_visit_entropy_reduction python train_lightgbm.py
LGB_TARGET=target_int_visit_entropy_reduction python train_lightgbm.py

# Reproduce in-distribution efficiency comparison
python evaluate_learned_vf.py

# Reproduce learning curve (no GPU; ~5 min)
python learning_curve.py
```

Scripts expect to find their inputs at `/home/bork/benchmark_allocation/`
(the working directory) — paths are hardcoded in this archive
snapshot. To run from this directory, either symlink or update
the path constants at the top of each script. The Phase 3
archive's `cells_v2.jsonl.gz` is the upstream dependency for the
in-distribution evaluation — decompress it first.

## Re-running the validation sweeps

Requires a KataProxy SELECTOR (with `b10c128`, `b18c384nbt`,
`b28c512nbt` upstreams configured) and the same Python env as the
Phase 3 archive. Also: `lightgbm` (`pip install lightgbm` in the
existing venv works; the model files are ~1.3 MB total).

```bash
# Historical held-out (~/sgf_validation/, 1700-1980 SGFs)
python validation_run.py

# Modern held-out (~/benchmark_sgfs/, SGFs NOT in training)
python modern_validation_run.py
```

Both are resume-capable: if interrupted, re-running picks up
where it left off (reads existing `*_cells.jsonl` to identify
done cells; appends new ones).

## Numerical headlines (reproducible from `*_summary.json`)

| metric | b10c128 | b18c384nbt | b28c512nbt |
|---|---:|---:|---:|
| Training-cells efficiency | 0.934 ±0.008 | 0.966 ±0.006 | 0.964 ±0.008 |
| Modern held-out efficiency | 0.893 ±0.019 | 0.895 ±0.016 | 0.853 ±0.027 |
| Historical held-out efficiency | 0.881 ±0.016 | 0.811 ±0.030 | 0.815 ±0.033 |
| Best hand-crafted (training cells)\* | 0.625 ±0.015 | 0.657 ±0.015 | 0.644 ±0.018 |
| Uniform baseline (training cells)\* | 0.476 ±0.009 | 0.470 ±0.012 | 0.457 ±0.013 |

\* Hand-crafted policies' numbers are from the Phase 3 benchmark's
training cells, not from the held-out validation sets. Re-running
hand-crafted on the held-out cells for an apples-to-apples
comparison is filed as a follow-up.

## Top features (from `cv_results_*.json`)

r_full (visit-distribution entropy reduction V=200→V=5000):
```
1. weight_at_v200         20446   ← far away from #2
2. lcb_spread              8326
3. policy_entropy          5932
...
score_stdev               (#39, gain 209)   ← outside top-15
```

r_int (V=200→V=1000):
```
1. lcb_spread             11149
2. weight_at_v200          6355
3. policy_entropy          4139
...
score_stdev               (#34, gain 122)   ← outside top-15
```

The dominance of `weight_at_v200` for the longer-horizon r_full
target is the most surprising finding — its mechanism is plausibly
"low MCTS weight-per-visit at V=200 ⇒ MCTS hasn't settled ⇒ lots
more to learn by V=5000." Worth a §3.6.7 addition to the proxy's
substrate design note when SPA integration lands.

## Where this came from

Built on top of the Phase 3 benchmark (cells_v2.jsonl from
`docs/archive/phase3-allocation-benchmark/`). The 5220 training
rows here are the V=200 features re-extracted from the 435 cells
in that benchmark, joined with the r_int / r_full oracle targets
already stored there.

Validation discipline saved the headline: in-distribution
efficiency was 0.934-0.966; held-out validation pulled the
realistic figure to 0.85-0.90 on modern positions, 0.80-0.86 on
historical. The 0.04-0.11 drop reflects oracle measurement noise
(single V=5000 sample with MCTS randomness, partly fit by the
model) plus genuine generalization gap. The Phase 3.5 retrospective
documents the full diagnostic.

License: Public Domain (The Unlicense).
