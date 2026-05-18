# Retrospective: the Phase 3.5 learned-value-function arc

- **Status:** Closed for the day. Model + validation suite in place;
  SPA integration deferred to the next session.
- **Date:** 2026-05-18.
- **Scope:** From the Phase 3 benchmark's "hand-crafted policies cap
  at ~0.62 efficiency" finding through the LightGBM-supervised
  follow-up, including the validation-set design that prevented us
  from over-claiming, and ending at a grounded estimate of what
  the SPA can realistically expect to ship. Sibling artefacts
  preserved at `~/benchmark_allocation/`.

The companion retrospective
`docs/notes/retrospective-phase3-policy-benchmark-2026-05.md`
covers the upstream Phase 3 substrate benchmark. This one starts
from there.

---

## Why a learned value function

The hand-crafted Phase 3 policies plateau at ~0.62 efficiency on
the principled metric (realised / optimal info gain, piecewise
scaling). The gap from 0.62 to 1.0 is **predictable signal in the
V=200 pre-state that hand-crafted value functions miss**:
`score_stdev` was approximately constant across consecutive turns
(CV ≈ 0.03) and gave the allocator nothing to differentiate;
`lcb_spread` captured some signal but ignored other available
fields (`weight`, `raw_var_time_left`, prior distribution shape,
PV decay statistics).

The natural fix: train a small regressor that maps the full V=200
feature vector to the per-turn `r_full` target (visit-distribution
entropy reduction at V=5000), then use the predicted `r_full` as
the value function. The substrate's `value_fn` binding accepts any
`Callable[[TurnView], float]`, so a learned model plugs in with no
substrate-side change.

The author's firewall pass on this approach landed cleanly: at our
data scale (~435 cells), supervised regression on per-turn targets
gives a denser gradient than end-to-end policy-gradient on a
continuous K-simplex action. Trees-on-tabular generally beat
NN-on-tabular below ~10K-100K rows (Grinsztajn et al. 2022). End
of architecture deliberation.

---

## The arc, in chronological shape

1. **Feature extraction.** Re-queried V=200 pre-state for the 435
   cells of the Phase 3 benchmark (~4 minutes total on warm
   KataGo). 121 features per turn: scalar fields from `rootInfo`
   (`scoreStdev`, `scoreLead`, `winrate`, `rawWinrate`,
   `rawScoreSelfplay`, **`rawVarTimeLeft`** corrected from
   author's nudge, `weight`, etc.), moveInfos top-5 statistics
   (visits distribution entropy / Gini / top-1 mass, prior
   entropy, `utilityLcb` spread, top-1/top-2 score and winrate
   gaps), PV length and `pvVisits` decay, full-policy entropy,
   color-to-play, plus range-level mean/std/min/max summaries
   over all per-turn features and context features (turn number
   relative to game length, komi, board size). 5220 (cell, turn)
   training rows from 145 distinct SGFs across 3 NN tiers.

2. **Training (r_full).** LightGBM regression with 5-fold SGF-
   level cross-validation (no leakage between train/val turns of
   the same game). Targets:
   `target_visit_entropy_reduction` (the V=200→V=5000 entropy
   reduction). CV mean RMSE = 0.768, **R² = 0.679**, Spearman of
   predictions vs. truth = **0.809**.

3. **Top-features finding.**
   ```
   1.  weight_at_v200          20446   ← far away from #2
   2.  lcb_spread               8326
   3.  policy_entropy           5932
   4.  winrate                  1866
   5.  to_play_is_black         1858   ← color matters via komi/handicap
   6.  raw_var_time_left        1210
   7.  winrate_gap_top1_top2    1057
   ...
   ```
   `score_stdev` did not crack the top-15 — three independent
   confirmations now of "score_stdev is weak signal on this
   problem." The dominance of `weight_at_v200` is the surprise;
   the author's investigation of the field's meaning landed on
   "KataGo's `weight` is approximately the same as visits but
   accounts for sample down-weighting, transposition, and other
   MCTS effects. Low weight-per-visit at V=200 = MCTS hasn't
   settled = lots more to learn by V=5000." Worth its own §3.6.7
   addition to the substrate's design note.

4. **Training (r_int).** Same training data, target
   `target_int_visit_entropy_reduction` (the V=200→V=1000 entropy
   reduction). CV mean R² = 0.699, Spearman = **0.827**. Feature
   importance reshuffles: `lcb_spread` becomes #1 for the
   shorter-horizon target while `weight_at_v200` drops to #2.
   Coherent with the mechanism hypothesis: short-horizon entropy
   reduction reflects immediate move-choice ambiguity
   (`lcb_spread`), longer-horizon reflects deeper search
   convergence (`weight_at_v200`).

5. **In-distribution evaluation.** For each of the 435 training
   cells, predicted r_full + r_int, ran piecewise water-fill on
   the predicted segments, computed efficiency under piecewise
   scaling against the actual r_full (cells_v2.jsonl from the
   benchmark). Result:

   | tier | efficiency | SE | n |
   |---|---:|---:|---:|
   | b10c128 | 0.934 | 0.008 | 145 |
   | b18c384nbt | 0.966 | 0.006 | 142 |
   | b28c512nbt | 0.964 | 0.008 | 142 |

   The figure was striking enough that the author requested
   honest validation before propagating it. This was correct.

6. **Held-out validation #1 (historical, OOD).** Sampled ~72 SGFs
   from `~/sgf_validation/` (3492 records spanning 1700-1980,
   uniform across decade buckets). Quarter-integer komi values
   (Chinese-counting style — `KM=3.75` means real komi 7.5) were
   doubled; handicap games (HA≥2) were skipped; a handful of
   1700s-1720s games with illegal-under-modern-rules moves were
   skipped on KataGo's "Illegal move" rejection. Final n=64-67
   per tier:

   | tier | training | historical held-out | Δ |
   |---|---:|---:|---:|
   | b10c128 | 0.934 | 0.881 ±0.016 | −0.053 |
   | b18c384nbt | 0.966 | 0.811 ±0.030 | −0.155 |
   | b28c512nbt | 0.964 | 0.815 ±0.033 | −0.149 |

   The b18/b28 drops were dramatic enough to motivate a second
   validation pass that disentangles era-OOD from
   generalization-gap-in-general.

7. **Held-out validation #2 (modern, in-distribution-but-not-trained).**
   Sampled 50 SGFs from `~/benchmark_sgfs/` (3913 records) that
   were NOT in the training set (the training pass used 145 of
   the 3913). Same V=200/1000/5000 pipeline:

   | tier | training | modern held-out | historical held-out |
   |---|---:|---:|---:|
   | b10c128 | 0.934 | **0.893 ±0.019** | 0.881 |
   | b18c384nbt | 0.966 | **0.895 ±0.016** | 0.811 |
   | b28c512nbt | 0.964 | **0.853 ±0.027** | 0.815 |

   The drop-decomposition:
   - **b18c384nbt**: 0.071 of the drop is genuine generalization,
     0.084 of the drop is era-OOD.
   - **b28c512nbt**: 0.111 of the drop is generalization, 0.038
     era.
   - **b10c128**: essentially indistinguishable modern vs
     historical — the smaller network is era-insensitive.

   **The SPA-realistic number is 0.85-0.90 on modern professional
   games** across all three tested tiers.

8. **Learning curve.** Trained on SGF-level random subsets at
   fractions {0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0}
   with 3 random seeds each. Evaluated on both validation sets.
   Modern held-out doubled-data deltas:

   | from f → to f | Δ b10 | Δ b18 | Δ b28 |
   |---|---:|---:|---:|
   | 0.5 → 1.0 (2× data) | +0.014 | +0.013 | −0.004 |
   | 0.85 → 1.0 (1.2× data) | −0.004 | −0.005 | −0.019 |

   Modern validation is **near saturation** in the current
   training distribution — clearly saturated for b10 (latest
   doubling negative), plateauing for b18 (gain ≤ 0.013 per
   doubling), and too noisy to call confidently for b28 (the f=0.7
   → 0.85 → 1.0 trajectory oscillates ±0.02 around 0.85). Naïve
   eyeballing of the doubling deltas: 4× modern training data
   probably gives 0.88-0.91 modern efficiency. 10× probably
   0.90-0.92. The parametric
   `eff(n) = a − b·n^(−c)` fits hit upper bounds (a=1.5,
   unphysical), confirming the parametric form can't separate
   "saturating at ~0.90" from "slowly approaching 1.0."

   Historical validation is still slowly rising at f=1.0 but at
   ~0.02 gain per doubling — extrapolating to a plateau around
   0.83-0.86 for the larger nets.

9. **Cloud-GPU rental decision.** With learning curves saturating
   at 0.88-0.91 modern-held-out, the headline 0.93-0.97 was
   in-distribution noise (cells with random V=5000 sample noise
   matching what the model could fit). 10× more training data
   would buy 2-5 percentage points. At our ~3h47min single-GPU
   wall time for the original 435 cells, 10× is ~38 hours = ~$50-
   100 of A100/H100 rental. **Not worth the rental** for that
   margin. The bigger lever is **measurement methodology**
   (multiple V=5000 samples per cell to drive down the oracle
   noise floor) rather than corpus size. The author's instinct
   to rent before measuring was specifically interrupted by this
   analysis — the firewall pattern saved compute spend.

---

## Headline findings

### What ships (working, validated)

A LightGBM-pair (r_full + r_int) that, fed V=200 features from any
of the three tested NN tiers, predicts per-turn entropy reduction
with Spearman 0.80-0.86 against the actual measured oracle. Piped
through piecewise water-filling on the predicted segments,
produces allocations that capture **40-50% of the gap above
uniform** on modern held-out positions (per-tier: b10c128 ~50%,
b18c384nbt ~45%, b28c512nbt ~40%) vs hand-crafted's 28-35%
*measured on training cells, not on the modern held-out set* —
see the asterisk under "Realistic SPA-side numbers" below.

Inference cost: **287 µs per cell** for both models combined.
LightGBM with 196 trees (r_full) + 244 trees (r_int), ~200 KB
total on disk. Plugs directly into the Phase 3 substrate's
`value_fn` binding via `Callable[[TurnView], float]`.

### Realistic SPA-side numbers

| context | expected efficiency |
|---|---|
| modern professional / amateur game review | **0.85-0.90** |
| historical professional game review (Shusaku, Dosaku, Go Seigen, Huang Longshi, Fan Xiping) | **0.80-0.86** |
| best alternative (`greedy_eig + monte_carlo_sqrt + lcb_spread`)\* | 0.62-0.66 |
| no Phase 3 at all (uniform)\* | 0.46-0.48 |

\* **The hand-crafted alternatives' 0.62-0.66 number was measured on
the original benchmark's training cells, not on the modern
held-out set the learned VF was evaluated against.** A clean
apples-to-apples comparison would re-run `lcb_spread` on the modern
held-out positions; that's filed as a follow-up. If hand-crafted is
equally OOD-robust the lift stands; if hand-crafted also degrades
on held-out, the lift is larger than reported; if it somehow
improves OOD, the lift shrinks. Treating the headline lift as a
"~doubling of the gap-above-uniform" is honest in direction; the
exact magnitude has this asterisk.

The model is **a real and substantial improvement on hand-crafted
across all observed cases**. It's not "0.93-0.97 magic" — those
were the in-distribution numbers, inflated by V=5000 oracle noise
that the model partly fit through random correlations. The held-
out drops range 0.04 (b10c128) to 0.11 (b28c512nbt); b10's drop is
the smallest of the three, so the original headline summary of
"~0.05-0.11 below" was unfairly tight on b10. The corrected range
is **0.04-0.11**, with the smaller network being more robust.

### What the validation pass corrected vs. the headline number

The in-distribution headline of 0.93-0.97 was the model's training-
distribution efficiency. The actual SPA-relevant performance sits
~0.05-0.11 below that. The validation pass was specifically the
author's "extraordinary claims need extraordinary evidence"
intervention; without it, the model would have been documented at
0.93-0.97. The gap between in-distribution and held-out is the
**combination of**:
- Oracle measurement noise (single V=5000 sample with MCTS
  randomness; partly fit by the model on training cells).
- Genuine generalization gap to new positions.
- Era-OOD effect (significant on b18/b28, small on b10).

Future work should not regress on the validation discipline.

---

## What this means for the SPA integration

### Don't ship this model as the universal default

The model is trained on a specific slice of `~/benchmark_sgfs/`
which is modern professional and amateur games. Serious players
DO study historical records — Shusaku, Dosaku, Go Seigen, Huang Longshi, Fan Xiping — and
the b18/b28 efficiency drops 0.04-0.08 on those positions. **A
universal "learned VF" default would silently degrade analysis
quality on historical games.**

Concrete proposals:
- Ship the learned VF as an **opt-in** value-function recipe
  initially. Hand-crafted `lcb_spread` remains the universal
  default; users analyzing modern games get a "switch to learned"
  toggle.
- OR: bundle TWO learned models — a modern-only one and a
  diverse-corpus one trained on a mix that includes historical
  professional records. Auto-select based on game date if SGF
  metadata supports it; fall back to the diverse model when
  uncertain.
- OR: defer SPA integration until a diverse-corpus retraining
  pass has been done.

### Plumbing

The substrate's `value_fn` binding via `analysis_config.bindings`
expects a Python expression evaluated against `TurnView`. A
LightGBM model doesn't fit that shape. Two paths:

1. **Proxy-hosted prediction**: extend the proxy with a
   `learned_value_fn` capability. The proxy loads the model on
   startup; `capabilities.adaptive_reevaluate.value_fn:
   "learned"` engages it. Features extracted server-side from
   the V=200 response.
2. **SPA-side prediction with synthetic value_fn shim**: SPA
   does inference client-side (a JS-port of LightGBM or a
   precompiled ONNX/JSON model), passes per-turn predicted r
   values via the existing `analysis_config.symbols` mechanism.
   `value_fn` becomes a constant lookup table per turn.

(1) is cleaner architecturally; the proxy already knows the V=200
state. (2) keeps SPA self-contained but adds JS-side inference
complexity. Defer the choice to the SPA integration session.

---

## Roadmap

### Immediate (next session, before SPA integration)

1. **Diverse-corpus retraining pass.** Sample ~200 SGFs from a
   mix of:
   - Modern professional games (`~/benchmark_sgfs/`)
   - Historical professional games (`~/sgf_validation/`)
   - Amateur games (TBD source)

   Train r_full + r_int on the combined corpus. Re-validate on
   both modern and historical held-out. Target: efficiency
   stratification between contexts under ~0.04 (not 0.08-0.15).
   GPU compute: ~5-7 hours on the current 3-tier setup. With
   reduced `nnCacheSizePowerOfTwo` (recommended: 21) the memory
   profile fits in 32G comfortably.

2. **Multi-sample oracle (optional).** Take K=3-5 V=5000 samples
   per cell, average them. Drives down the oracle noise floor;
   ought to be measurable as a CEILING shift in efficiency
   (current ceiling 0.88-0.91 modern; multi-sample ceiling may
   be higher because the noise floor is lower). Compute: 3-5×
   the original ~3h47min oracle compute = 11-19 hours. Only do
   this if (1) doesn't already saturate the gap; the learning
   curve says modern is near-saturated, so a higher ceiling
   from less-noisy targets would be the next lever.

### Medium-term

3. **fdx6d generalization check.** The original "does this hold
   on the strongest net" question is still open. ~3-4 hours on
   warm KataGo for a 25-cell sample. After the diverse-corpus
   retraining; tests whether the learned model's cross-NN
   invariance holds at the strongest network.

4. **Feature engineering extensions.** LightGBM operates on
   provided features, doesn't synthesize new ones. Worth trying:
   - Full ownership map statistics (requires `includeOwnership`
     in queries; bumps response size and oracle compute slightly).
   - Deeper moveInfos (top-15 instead of top-5).
   - Search-tree shape (PV branching factor, transposition
     density). Requires `includePV` to capture more PV depth.
   - Per-cell visit-distribution-entropy *time series* across
     multiple internal V values (would require dumping
     during-search packets too).

   Each is pure-Python extraction work on top of the existing
   oracle responses (no new GPU compute unless adding ownership).
   Estimate gain: 0.01-0.05 per added feature group; diminishing
   returns expected.

5. **Inference compilation via lleaves
   (https://github.com/siboehm/lleaves).** lleaves compiles
   LightGBM models to native code for 5-10× faster inference.
   At our current 287 µs/cell baseline, this is NOT a bottleneck
   for SPA-style request-per-click flows. Note for the
   architecture: if proxy-side hosting ever becomes high-volume
   (many concurrent users), lleaves is the natural optimization.

### Deferred / lower priority

6. **Phase 3.7 — end-to-end PG NN.** Filed in
   `~/benchmark_allocation/NOTES.md`; gated on having ~30K
   training cells (we have 435). At the data-scale we'd need
   for this to make sense, we'd also need to revisit the
   architecture choice (transformer for dynamic ranges, ResNet
   with masking, or DeepSet). Not before the diverse-corpus
   retraining lands.

7. **Phase 4 — Bayesian-bandit multi-iteration allocator.**
   Filed in NOTES.md. Composes with Phase 3.5 (learned VF as
   GP prior). Substrate v1.0.25 ready; the agent is the new
   piece. Worth a focused arc once Phase 3.5 ships in the SPA.

8. **KeepAliveMiddleware contract revision (proxy-side).**
   Documented separately in the v1.0.25 benchmark retrospective.
   25s message-level idle timeout punishes naive clients running
   long analyses; TCP/WS-level liveness would be more
   appropriate. Filed for a follow-up dispatch in
   `proxy/docs/dispatch/`.

---

## Where the artefacts live

| Artefact | Path | Status |
|---|---|---|
| Feature extractor | `~/benchmark_allocation/extract_features.py` | Live |
| LightGBM trainer | `~/benchmark_allocation/train_lightgbm.py` | Live; `LGB_TARGET` env var selects target column |
| Evaluator (in-dist) | `~/benchmark_allocation/evaluate_learned_vf.py` | Live |
| Historical validation runner | `~/benchmark_allocation/validation_run.py` | Live; resume-capable |
| Modern validation runner | `~/benchmark_allocation/modern_validation_run.py` | Live; resume-capable |
| Learning-curve analyzer | `~/benchmark_allocation/learning_curve.py` | Live; runs in seconds-to-minutes |
| Trained r_full model | `~/benchmark_allocation/lightgbm_model_entropy_reduction.txt` | LightGBM native format, 196 trees, ~200 KB |
| Trained r_int model | `~/benchmark_allocation/lightgbm_model_int_entropy_reduction.txt` | LightGBM native format, 244 trees |
| Training features | `~/benchmark_allocation/training_features.jsonl` | 5220 rows × 121 features + 8 targets |
| Historical val features | `~/benchmark_allocation/validation_features.jsonl` | ~2400 rows |
| Modern val features | `~/benchmark_allocation/modern_validation_features.jsonl` | ~1800 rows |
| Phase 3 retrospective | `docs/notes/retrospective-phase3-policy-benchmark-2026-05.md` | Shipped, PRs #258 + #259 |
| Phase 3 archive | `docs/archive/phase3-allocation-benchmark/` | Shipped, PR #259 |
| This retrospective | `docs/notes/retrospective-phase3.5-learned-vf-2026-05.md` | This file |

**Archival follow-up**: when Phase 3.5 ships, expand
`docs/archive/phase3-allocation-benchmark/` (or create a sibling
`docs/archive/phase3.5-learned-vf/`) with the four new scripts,
the two trained model files, and the three feature files. Match
the F-optimizer arc's archival discipline.

---

## Closing observation

The benchmark retrospective closed with "Phase 3 ships a substrate
plus a default that uses it well." Phase 3.5 didn't change that
sentence's grammar but it sharpened the *default*: the learned VF
is the new candidate, with 0.85-0.90 modern-held-out efficiency vs
0.62-0.66 for the best hand-crafted alternative. The ceiling on
hand-crafted features was real; the supervised lift was real;
neither was magic.

The validation discipline this session enforced — historical
held-out, modern held-out, learning-curve extrapolation — is the
load-bearing piece. **Without it, we would have shipped a model
documented at 0.93-0.97 efficiency, and the b18/b28 era-OOD
silently degrading historical-game analysis would have been a
production-side mystery.** Three validation passes added ~2 hours
of GPU compute and got us a defensible production estimate plus
a clear roadmap for what's next.

ADR-0002's fail-loud tenet manifested here in two registers:
- The author's "extraordinary claims need extraordinary evidence"
  instinct, which forced the held-out validation.
- The firewall pattern, applied to the RL-from-scratch
  architectural proposal, which prevented a wild goose chase
  before any compute was committed.

Both instances of fail-loud cost negligible time and saved both
compute spend and a worse production answer. The pattern earned
its weight twice over.

License: Public Domain (The Unlicense)
