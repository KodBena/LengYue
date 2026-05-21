# Overnight allocator simulation — 2026-05-21

Tier-0 follow-up from `firewall-strategic-2026-05-21.md`. The
regression head has cleared the OOD transfer gate; this is the
end-to-end test of whether the prediction translates into a
learned allocator that beats the 'always V_max' baseline on a
Pareto curve of (visits-spent, top-1 agreement).

**Pre-committed decision rules from the firewall consult §5 Tier 0:**

- If the learned allocator's Pareto curve dominates the baseline → architecture wins, proceed to feature engineering + delta-reframe + capability dispatch.
- If the curves are roughly tied → predictor is the bottleneck; feature engineering and delta-reframe are warranted next.
- If the baseline strictly dominates → architecture is wrong at a level deeper than predictor quality; rethink target or escalate to sequence models.

---

## 1. Allocator simulation Pareto curves

Train on year2k, evaluate on cards.db OOD slice. Predictor: LightGBM on phase35 + trajectory window features over `V ≤ V_floor` (binary policy) or `V ≤ V_mid` (3-stage policy).

Pareto axes: avg visits spent vs top-1 move agreement against modal-top-1-across-realizations at V_max.

### scoreLead_drift — baseline (phase35 + trajectory windows)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 14982 | +0.9065 | 0.13% |
| -0.500 | 14965 | +0.9065 | 0.26% |
| -0.250 | 14859 | +0.9069 | 1.04% |
| +0.000 | 14772 | +0.9054 | 1.68% |
| +0.250 | 12018 | +0.8710 | 22.15% |
| +0.500 | 8343 | +0.8315 | 49.48% |
| +0.750 | 5919 | +0.8001 | 67.49% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for scoreLead_drift](file:///home/bork/plots/allocator_pareto/binary_scoreLead_drift.png)

![3stage Pareto for scoreLead_drift](file:///home/bork/plots/allocator_pareto/3stage_scoreLead_drift.png)

![combined Pareto for scoreLead_drift](file:///home/bork/plots/allocator_pareto/combined_scoreLead_drift.png)


Summary file: `~/plots/allocator_pareto/summary_scoreLead_drift.txt`

### scoreLead_drift — enriched (+ ownership + policy distribution at 5 V-checkpoints)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 14947 | +0.9065 | 0.39% |
| -0.500 | 14947 | +0.9065 | 0.39% |
| -0.250 | 14894 | +0.9069 | 0.78% |
| +0.000 | 14736 | +0.9078 | 1.94% |
| +0.250 | 12052 | +0.8760 | 21.89% |
| +0.500 | 8047 | +0.8259 | 51.68% |
| +0.750 | 5501 | +0.7988 | 70.60% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for scoreLead_drift_enriched](file:///home/bork/plots/allocator_pareto/binary_scoreLead_drift_enriched.png)

![3stage Pareto for scoreLead_drift_enriched](file:///home/bork/plots/allocator_pareto/3stage_scoreLead_drift_enriched.png)

![combined Pareto for scoreLead_drift_enriched](file:///home/bork/plots/allocator_pareto/combined_scoreLead_drift_enriched.png)


Summary file: `~/plots/allocator_pareto/summary_scoreLead_drift_enriched.txt`

### winrate_drift — baseline (phase35 + trajectory windows)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 15000 | +0.9065 | 0.00% |
| +0.000 | 13281 | +0.8885 | 12.82% |
| +0.250 | 1798 | +0.7556 | 98.06% |
| +0.500 | 1534 | +0.7541 | 100.00% |
| +0.750 | 1534 | +0.7541 | 100.00% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for winrate_drift](file:///home/bork/plots/allocator_pareto/binary_winrate_drift.png)

![3stage Pareto for winrate_drift](file:///home/bork/plots/allocator_pareto/3stage_winrate_drift.png)

![combined Pareto for winrate_drift](file:///home/bork/plots/allocator_pareto/combined_winrate_drift.png)


Summary file: `~/plots/allocator_pareto/summary_winrate_drift.txt`

### winrate_drift — enriched (+ ownership + policy distribution at 5 V-checkpoints)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 15000 | +0.9065 | 0.00% |
| +0.000 | 13796 | +0.8949 | 8.94% |
| +0.250 | 1746 | +0.7569 | 98.45% |
| +0.500 | 1534 | +0.7541 | 100.00% |
| +0.750 | 1534 | +0.7541 | 100.00% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/binary_winrate_drift_enriched.png)

![3stage Pareto for winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/3stage_winrate_drift_enriched.png)

![combined Pareto for winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/combined_winrate_drift_enriched.png)


Summary file: `~/plots/allocator_pareto/summary_winrate_drift_enriched.txt`

### visit_entropy_reduction — baseline (phase35 + trajectory windows)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 15000 | +0.9065 | 0.00% |
| +0.000 | 14930 | +0.9058 | 0.52% |
| +0.250 | 12849 | +0.9004 | 15.93% |
| +0.500 | 10365 | +0.8865 | 34.33% |
| +0.750 | 9302 | +0.8758 | 42.23% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for visit_entropy_reduction](file:///home/bork/plots/allocator_pareto/binary_visit_entropy_reduction.png)

![3stage Pareto for visit_entropy_reduction](file:///home/bork/plots/allocator_pareto/3stage_visit_entropy_reduction.png)

![combined Pareto for visit_entropy_reduction](file:///home/bork/plots/allocator_pareto/combined_visit_entropy_reduction.png)


Summary file: `~/plots/allocator_pareto/summary_visit_entropy_reduction.txt`

### visit_entropy_reduction — enriched (+ ownership + policy distribution at 5 V-checkpoints)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 15000 | +0.9065 | 0.00% |
| +0.000 | 15000 | +0.9065 | 0.00% |
| +0.250 | 12759 | +0.8983 | 16.58% |
| +0.500 | 10486 | +0.8869 | 33.42% |
| +0.750 | 9336 | +0.8802 | 41.97% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for visit_entropy_reduction_enriched](file:///home/bork/plots/allocator_pareto/binary_visit_entropy_reduction_enriched.png)

![3stage Pareto for visit_entropy_reduction_enriched](file:///home/bork/plots/allocator_pareto/3stage_visit_entropy_reduction_enriched.png)

![combined Pareto for visit_entropy_reduction_enriched](file:///home/bork/plots/allocator_pareto/combined_visit_entropy_reduction_enriched.png)


Summary file: `~/plots/allocator_pareto/summary_visit_entropy_reduction_enriched.txt`

### L2_joint_drift — baseline (phase35 + trajectory windows)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 15000 | +0.9065 | 0.00% |
| +0.000 | 14112 | +0.8865 | 6.61% |
| +0.250 | 3130 | +0.7687 | 88.21% |
| +0.500 | 2113 | +0.7604 | 95.73% |
| +0.750 | 1780 | +0.7565 | 98.19% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for L2_joint_drift](file:///home/bork/plots/allocator_pareto/binary_L2_joint_drift.png)

![3stage Pareto for L2_joint_drift](file:///home/bork/plots/allocator_pareto/3stage_L2_joint_drift.png)

![combined Pareto for L2_joint_drift](file:///home/bork/plots/allocator_pareto/combined_L2_joint_drift.png)


Summary file: `~/plots/allocator_pareto/summary_L2_joint_drift.txt`

### L2_joint_drift — enriched (+ ownership + policy distribution at 5 V-checkpoints)

**Always-V_max reference:** avg_visits = 15000,  agreement = 0.9065,  n = 772

**Binary policy** (V_floor → V_max) — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 15000 | +0.9065 | 0.00% |
| -0.250 | 14982 | +0.9065 | 0.13% |
| +0.000 | 13986 | +0.8977 | 7.51% |
| +0.250 | 2640 | +0.7653 | 91.84% |
| +0.500 | 1938 | +0.7584 | 97.02% |
| +0.750 | 1694 | +0.7554 | 98.83% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for L2_joint_drift_enriched](file:///home/bork/plots/allocator_pareto/binary_L2_joint_drift_enriched.png)

![3stage Pareto for L2_joint_drift_enriched](file:///home/bork/plots/allocator_pareto/3stage_L2_joint_drift_enriched.png)

![combined Pareto for L2_joint_drift_enriched](file:///home/bork/plots/allocator_pareto/combined_L2_joint_drift_enriched.png)


Summary file: `~/plots/allocator_pareto/summary_L2_joint_drift_enriched.txt`

---

## 2. Delta-prediction reframe (Tier 1 from firewall consult)

Per the firewall's Tier 1 spec: predict `(y(V_target) - y(V_current)) / σ_position` at K=3 anchor `V_target` values per `V_current`. Loss: MSE on per-position-normalized delta. Labels: averaged across realizations. `n_realizations` exposed as a feature.

```
# regression_delta_reframe — per-V_current, K=3 V_target anchors
# target: scoreLead_drift  V_floor: 500.0
# delta normalized by per-position σ; label averaged across realizations

   V_current   V_target  n_total   n_y2k n_cards   within_R2    OOD_R2  OOD/within
        2000      V_c×4     1161     389     772     +0.1495   -0.1674     -1.1197
        2000     V_c×16     1161     389     772     +0.1767   -0.2168     -1.2267
        2000    V_c×max     1161     389     772     +0.1767   -0.2168     -1.2267
        8000      V_c×4     1161     389     772     +0.0294   -0.0709     -2.4107
        8000     V_c×16     1161     389     772     +0.0294   -0.0709     -2.4107
        8000    V_c×max     1161     389     772     +0.0294   -0.0709     -2.4107

```

---

## 3. Prior session's OOD R² baseline (reference)

From `~/plots/ood_regression.txt`, run earlier this session. Hyperbolic-H regression targets, multi-timestep INPUT features. **CAUTION:** the `full` window row has feature/label coupling (`y_at_V_max` ~ H by construction); within-corpus and OOD ratios are still meaningful but absolute magnitudes there overstate the regression's difficulty.

```
# year2000 → cards.db OOD R² test
# n_year2k=389  n_cards=718
# label: hyperbolic.H ∈ signed_log1p, regressor: LightGBM (same hyperparams as multi-timestep run)

  target                     window              n_y2k  n_cards  n_holdout   within_R2    OOD_R2     NF_R2   NF_std  OOD/within
  -----------------------------------------------------------------------------------------------------------------------------
  scoreLead_drift            baseline_phase35      269      480         97     +0.1114   +0.1188   -0.0631   0.0813     +1.0670
  scoreLead_drift            first_third           269      480         97     +0.4875   +0.5104   +0.4432   0.0682     +1.0470
  scoreLead_drift            first_two_thirds      269      480         97     +0.6915   +0.7449   +0.6711   0.1347     +1.0772
  scoreLead_drift            full                  269      480         97     +0.7016   +0.7850   +0.7495   0.0859     +1.1188
  winrate_drift              baseline_phase35      261      490         97     -0.0069   -0.2311   -0.0568   0.1703        +nan
  winrate_drift              first_third           261      490         97     +0.1234   +0.0947   +0.2122   0.1181     +0.7680
  winrate_drift              first_two_thirds      261      490         97     +0.3360   +0.2789   +0.3528   0.0911     +0.8302
  winrate_drift              full                  261      490         97     +0.4184   +0.3812   +0.2049   0.6123     +0.9111
  visit_entropy_reduction    baseline_phase35       98      175         97     -0.2668   -0.2522   -0.3951   0.4234        +nan
  visit_entropy_reduction    first_third            98      175         97     +0.0475   +0.1912   -0.0605   0.3461     +4.0231
  visit_entropy_reduction    first_two_thirds       98      175         97     +0.2358   +0.4498   +0.3290   0.3640     +1.9080
  visit_entropy_reduction    full                   98      175         97     +0.5114   +0.6032   +0.3183   0.1520     +1.1794
  L2_joint_drift             baseline_phase35      271      509         97     -0.1430   -0.1874   -0.3016   0.2699        +nan
  L2_joint_drift             first_third           271      509         97     -0.0334   +0.1610   -0.0817   0.6119        +nan
  L2_joint_drift             first_two_thirds      271      509         97     +0.3782   +0.2721   +0.3542   0.1680     +0.7194
  L2_joint_drift             full                  271      509         97     +0.2397   +0.1669   +0.0330   0.2415     +0.6965

```

---

## 4. Where to read further

- `research/notes/firewall-strategic-2026-05-21.md` — the 2-turn firewall consult that anchored Tier 0; pre-committed decision rules and target reframe specifications.
- `research/notes/interim-research-memo-2026-05-21.md` — comprehensive synthesis of the arc through 2026-05-21 mid-day.
- `research/notes/session-handoff-2026-05-21.md` — handoff brief that introduced the mode-as-feature finding.
- `research/data/trajectory_cache.npz` — substrate used by all overnight sims; produced by `cache_trajectories.py` with the bundled-fetch optimization.
- `research/data/advanced_multitimestep.csv` — ownership + policy distribution features at 5 V-checkpoints; produced by `extract_advanced_multitimestep.py`. Available for future enriched-regression retraining.

---

License: Public Domain (The Unlicense)
