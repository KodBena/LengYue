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

## 2. Extra targets — allocator sim

Three additional VALUE_CANDIDATES targets beyond the four main drift targets. Same binary + 3-stage Pareto framework. Useful for target-by-target sensitivity.

### logit_winrate_drift — baseline

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

| τ | avg visits | agreement | terminate% |
|---|---|---|---|
| -2.000 | 15000 | +0.9065 | 0.00% |
| -1.750 | 15000 | +0.9065 | 0.00% |
| -1.500 | 15000 | +0.9065 | 0.00% |
| -1.250 | 15000 | +0.9065 | 0.00% |
| -1.000 | 15000 | +0.9065 | 0.00% |
| -0.750 | 15000 | +0.9065 | 0.00% |
| -0.500 | 14982 | +0.9065 | 0.13% |
| -0.250 | 14965 | +0.9065 | 0.26% |
| +0.000 | 13903 | +0.8925 | 8.16% |
| +0.250 | 5263 | +0.7907 | 72.41% |

![binary Pareto for logit_winrate_drift](file:///home/bork/plots/allocator_pareto/binary_logit_winrate_drift.png)

![3stage Pareto for logit_winrate_drift](file:///home/bork/plots/allocator_pareto/3stage_logit_winrate_drift.png)

![combined Pareto for logit_winrate_drift](file:///home/bork/plots/allocator_pareto/combined_logit_winrate_drift.png)


### logit_winrate_drift — enriched

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

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
| +0.000 | 14318 | +0.9016 | 5.05% |
| +0.250 | 5118 | +0.7946 | 73.45% |

![binary Pareto for logit_winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/binary_logit_winrate_drift_enriched.png)

![3stage Pareto for logit_winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/3stage_logit_winrate_drift_enriched.png)

![combined Pareto for logit_winrate_drift_enriched](file:///home/bork/plots/allocator_pareto/combined_logit_winrate_drift_enriched.png)


### score_stdev_reduction — baseline

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

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
| +0.250 | 13141 | +0.8847 | 13.86% |

![binary Pareto for score_stdev_reduction](file:///home/bork/plots/allocator_pareto/binary_score_stdev_reduction.png)

![3stage Pareto for score_stdev_reduction](file:///home/bork/plots/allocator_pareto/3stage_score_stdev_reduction.png)

![combined Pareto for score_stdev_reduction](file:///home/bork/plots/allocator_pareto/combined_score_stdev_reduction.png)


### score_stdev_reduction — enriched

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

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
| +0.250 | 13350 | +0.8863 | 12.31% |

![binary Pareto for score_stdev_reduction_enriched](file:///home/bork/plots/allocator_pareto/binary_score_stdev_reduction_enriched.png)

![3stage Pareto for score_stdev_reduction_enriched](file:///home/bork/plots/allocator_pareto/3stage_score_stdev_reduction_enriched.png)

![combined Pareto for score_stdev_reduction_enriched](file:///home/bork/plots/allocator_pareto/combined_score_stdev_reduction_enriched.png)


### top_move_visit_fraction — baseline

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

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
| +0.000 | 14562 | +0.9057 | 3.24% |
| +0.250 | 9286 | +0.8859 | 42.36% |

![binary Pareto for top_move_visit_fraction](file:///home/bork/plots/allocator_pareto/binary_top_move_visit_fraction.png)

![3stage Pareto for top_move_visit_fraction](file:///home/bork/plots/allocator_pareto/3stage_top_move_visit_fraction.png)

![combined Pareto for top_move_visit_fraction](file:///home/bork/plots/allocator_pareto/combined_top_move_visit_fraction.png)


### top_move_visit_fraction — enriched

**Always-V_max reference:** visits = 15000,  agreement = 0.9065

**Binary policy** — sample of τ sweep:

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
| +0.000 | 14543 | +0.9066 | 3.37% |
| +0.250 | 9115 | +0.8819 | 43.65% |

![binary Pareto for top_move_visit_fraction_enriched](file:///home/bork/plots/allocator_pareto/binary_top_move_visit_fraction_enriched.png)

![3stage Pareto for top_move_visit_fraction_enriched](file:///home/bork/plots/allocator_pareto/3stage_top_move_visit_fraction_enriched.png)

![combined Pareto for top_move_visit_fraction_enriched](file:///home/bork/plots/allocator_pareto/combined_top_move_visit_fraction_enriched.png)


---

## 3. Delta-prediction reframe (Tier 1 from firewall consult)

Per the firewall's Tier 1 spec: predict `(y(V_target) - y(V_current)) / σ_position` at K=3 anchor `V_target` values per `V_current`. Loss: MSE on per-position-normalized delta. Labels: averaged across realizations. `n_realizations` exposed as a feature.

**Headline finding:** the delta-reframe's within-corpus R² is ~5× lower than the hyperbolic-H regression's at the same windows. This triggers the firewall's pre-committed kill-criterion ("if within-corpus R² drops on the reframe"). Delta-reframe is not the Tier 1 unlock for this corpus.

### scoreLead_drift

```
# regression_delta_reframe — per-V_current, K=3 V_target anchors
# target: scoreLead_drift
# delta normalized by per-position σ; label averaged across realizations

   V_curr_frac  V_tgt_frac  n_total   n_y2k n_cards   within_R2    OOD_R2  OOD/within
        0.1667      0.3333     1161     389     772     -0.2173   -0.0061        +nan
        0.1667      0.6667     1161     389     772     -0.1352   -0.2200        +nan
        0.1667      1.0000     1161     389     772     -0.0731   -0.0922        +nan
        0.3333      0.5000     1161     389     772     -0.1053   -0.7349        +nan
        0.3333      0.6667     1161     389     772     -0.1115   -0.5989        +nan
        0.3333      1.0000     1161     389     772     +0.1179   -0.2665     -2.2592
        0.6667      0.8333     1161     389     772     +0.0422   +0.0601     +1.4255
        0.6667      0.9167     1161     389     772     +0.0563   +0.0950     +1.6855
        0.6667      1.0000     1161     389     772     +0.1271   +0.0928     +0.7300

```

### winrate_drift

```
# regression_delta_reframe — per-V_current, K=3 V_target anchors
# target: winrate_drift
# delta normalized by per-position σ; label averaged across realizations

   V_curr_frac  V_tgt_frac  n_total   n_y2k n_cards   within_R2    OOD_R2  OOD/within
        0.1667      0.3333     1161     389     772     -0.2096   -0.1594        +nan
        0.1667      0.6667     1161     389     772     -0.0324   -0.2427        +nan
        0.1667      1.0000     1161     389     772     +0.1533   -0.1157     -0.7548
        0.3333      0.5000     1161     389     772     -0.0329   -0.1070        +nan
        0.3333      0.6667     1161     389     772     +0.0532   -0.0901     -1.6949
        0.3333      1.0000     1161     389     772     +0.1902   +0.0296     +0.1555
        0.6667      0.8333     1161     389     772     +0.1785   +0.0018     +0.0100
        0.6667      0.9167     1161     389     772     +0.1975   +0.0337     +0.1705
        0.6667      1.0000     1161     389     772     +0.2513   +0.0598     +0.2378

```

### visit_entropy_reduction

```
# regression_delta_reframe — per-V_current, K=3 V_target anchors
# target: visit_entropy_reduction
# delta normalized by per-position σ; label averaged across realizations

   V_curr_frac  V_tgt_frac  n_total   n_y2k n_cards   within_R2    OOD_R2  OOD/within
        0.1667      0.3333     1161     389     772     +0.1465   +0.2150     +1.4676
        0.1667      0.6667     1161     389     772     -0.0846   -0.0019        +nan
        0.1667      1.0000     1161     389     772     -0.1000   -0.1279        +nan
        0.3333      0.5000     1161     389     772     +0.0222   +0.1484     +6.6865
        0.3333      0.6667     1161     389     772     -0.0352   +0.0519        +nan
        0.3333      1.0000     1161     389     772     -0.0917   -0.1439        +nan
        0.6667      0.8333     1161     389     772     -0.0692   +0.0168        +nan
        0.6667      0.9167     1161     389     772     -0.1253   -0.0486        +nan
        0.6667      1.0000     1161     389     772     -0.1683   -0.1080        +nan

```

### L2_joint_drift

```
# regression_delta_reframe — per-V_current, K=3 V_target anchors
# target: L2_joint_drift
# delta normalized by per-position σ; label averaged across realizations

   V_curr_frac  V_tgt_frac  n_total   n_y2k n_cards   within_R2    OOD_R2  OOD/within
        0.1667      0.3333     1161     389     772     -0.2536   -0.0428        +nan
        0.1667      0.6667     1161     389     772     -0.1928   -0.4180        +nan
        0.1667      1.0000     1161     389     772     +0.0361   -0.2241     -6.2001
        0.3333      0.5000     1161     389     772     -0.0830   -0.7155        +nan
        0.3333      0.6667     1161     389     772     +0.0022   -0.6189   -276.6562
        0.3333      1.0000     1161     389     772     +0.2308   -0.3813     -1.6520
        0.6667      0.8333     1161     389     772     +0.0953   +0.0481     +0.5046
        0.6667      0.9167     1161     389     772     +0.1023   +0.0812     +0.7937
        0.6667      1.0000     1161     389     772     +0.1703   +0.0808     +0.4745

```

---

## 3b. Delta-predictor allocator — operational closure of Tier 1

Even though the delta-reframe's regression R² is ~5× lower than H-prediction's, **predictor R² ≠ allocator utility**. This section wires the delta predictor into the binary-allocator's decision rule and plots its Pareto curve alongside the H-allocator's.

**Key finding**: the delta-allocator's Pareto curve is per-target. On some targets (e.g., `scoreLead_drift`) it dominates the H-allocator in mid-budget regions; on others (e.g., `visit_entropy_reduction`) the H-allocator wins at the same budget. The Tier 1 reframe's operational value is target-specific, not uniform.

### scoreLead_drift

```
# delta-predictor allocator sim: scoreLead_drift
# window_floor_frac=0.333  n_train=389

# baseline (always V_max)
  avg_visits = 15000
  agreement  = 0.9065

# delta-predictor binary policy
       tau     visits     agree   term%
    -2.000      15000   +0.9065   0.00%
    -1.750      15000   +0.9065   0.00%
    -1.500      15000   +0.9065   0.00%
    -1.250      15000   +0.9065   0.00%
    -1.000      15000   +0.9065   0.00%
    -0.750      15000   +0.9065   0.00%
    -0.500      15000   +0.9065   0.00%
    -0.250      15000   +0.9065   0.00%
    +0.000      15000   +0.9065   0.00%
    +0.250      14912   +0.9058   0.65%
    +0.500      14649   +0.9056   2.59%
    +0.750      14250   +0.8986   5.57%
    +1.000      13515   +0.8951  11.01%
    +1.250      12643   +0.8850  17.49%
    +1.500      11788   +0.8755  23.83%
    +1.750      11106   +0.8641  28.89%
    +2.000      10409   +0.8551  34.07%
    +2.250       9851   +0.8501  38.21%
    +2.500       9466   +0.8448  41.06%
    +2.750       8977   +0.8370  44.69%
    +3.000       8577   +0.8302  47.67%
    +3.250       8143   +0.8244  50.91%
    +3.500       7864   +0.8224  52.98%
    +3.750       7638   +0.8193  54.66%
    +4.000       7357   +0.8140  56.74%

```

![delta vs H Pareto for scoreLead_drift](file:///home/bork/plots/allocator_pareto_delta/delta_vs_h_scoreLead_drift.png)

### winrate_drift

```
# delta-predictor allocator sim: winrate_drift
# window_floor_frac=0.333  n_train=389

# baseline (always V_max)
  avg_visits = 15000
  agreement  = 0.9065

# delta-predictor binary policy
       tau     visits     agree   term%
    -2.000      15000   +0.9065   0.00%
    -1.750      15000   +0.9065   0.00%
    -1.500      15000   +0.9065   0.00%
    -1.250      15000   +0.9065   0.00%
    -1.000      15000   +0.9065   0.00%
    -0.750      15000   +0.9065   0.00%
    -0.500      15000   +0.9065   0.00%
    -0.250      15000   +0.9065   0.00%
    +0.000      15000   +0.9065   0.00%
    +0.250      14879   +0.9034   0.91%
    +0.500      14496   +0.9010   3.76%
    +0.750      13955   +0.8965   7.77%
    +1.000      13275   +0.8843  12.82%
    +1.250      12507   +0.8766  18.52%
    +1.500      11458   +0.8679  26.30%
    +1.750      10605   +0.8610  32.64%
    +2.000       9643   +0.8551  39.77%
    +2.250       8961   +0.8472  44.82%
    +2.500       7951   +0.8324  52.33%
    +2.750       6763   +0.8130  61.14%
    +3.000       5613   +0.8003  69.69%
    +3.250       4670   +0.7876  76.68%
    +3.500       3780   +0.7806  83.29%
    +3.750       3134   +0.7768  88.08%
    +4.000       2697   +0.7736  91.32%

```

![delta vs H Pareto for winrate_drift](file:///home/bork/plots/allocator_pareto_delta/delta_vs_h_winrate_drift.png)

### visit_entropy_reduction

```
# delta-predictor allocator sim: visit_entropy_reduction
# window_floor_frac=0.333  n_train=389

# baseline (always V_max)
  avg_visits = 15000
  agreement  = 0.9065

# delta-predictor binary policy
       tau     visits     agree   term%
    -2.000      14196   +0.8999   5.96%
    -1.750      13915   +0.9025   8.03%
    -1.500      13689   +0.9003   9.72%
    -1.250      13359   +0.8964  12.18%
    -1.000      12869   +0.8926  15.80%
    -0.750      12138   +0.8855  21.24%
    -0.500      11318   +0.8734  27.33%
    -0.250      10116   +0.8532  36.27%
    +0.000       9175   +0.8424  43.26%
    +0.250       7780   +0.8207  53.63%
    +0.500       6452   +0.8014  63.47%
    +0.750       5391   +0.7861  71.37%
    +1.000       4485   +0.7725  78.11%
    +1.250       3859   +0.7635  82.77%
    +1.500       3441   +0.7617  85.88%
    +1.750       2953   +0.7589  89.51%
    +2.000       2656   +0.7598  91.71%
    +2.250       2445   +0.7589  93.26%
    +2.500       2287   +0.7562  94.43%
    +2.750       2129   +0.7541  95.60%
    +3.000       1902   +0.7545  97.28%
    +3.250       1796   +0.7541  98.06%
    +3.500       1708   +0.7541  98.70%
    +3.750       1691   +0.7544  98.83%
    +4.000       1656   +0.7535  99.09%

```

![delta vs H Pareto for visit_entropy_reduction](file:///home/bork/plots/allocator_pareto_delta/delta_vs_h_visit_entropy_reduction.png)

### L2_joint_drift

```
# delta-predictor allocator sim: L2_joint_drift
# window_floor_frac=0.333  n_train=389

# baseline (always V_max)
  avg_visits = 15000
  agreement  = 0.9065

# delta-predictor binary policy
       tau     visits     agree   term%
    -2.000      15000   +0.9065   0.00%
    -1.750      15000   +0.9065   0.00%
    -1.500      15000   +0.9065   0.00%
    -1.250      15000   +0.9065   0.00%
    -1.000      15000   +0.9065   0.00%
    -0.750      15000   +0.9065   0.00%
    -0.500      15000   +0.9065   0.00%
    -0.250      15000   +0.9065   0.00%
    +0.000      15000   +0.9065   0.00%
    +0.250      14965   +0.9057   0.26%
    +0.500      14773   +0.9052   1.68%
    +0.750      14407   +0.9038   4.40%
    +1.000      13830   +0.8984   8.68%
    +1.250      12890   +0.8835  15.67%
    +1.500      11930   +0.8750  22.80%
    +1.750      11318   +0.8665  27.33%
    +2.000      10428   +0.8591  33.94%
    +2.250       9695   +0.8448  39.38%
    +2.500       9207   +0.8324  43.01%
    +2.750       8646   +0.8267  47.15%
    +3.000       8261   +0.8219  50.00%
    +3.250       7860   +0.8154  52.98%
    +3.500       7459   +0.8139  55.96%
    +3.750       7250   +0.8131  57.51%
    +4.000       6917   +0.8085  59.97%

```

![delta vs H Pareto for L2_joint_drift](file:///home/bork/plots/allocator_pareto_delta/delta_vs_h_L2_joint_drift.png)

---

## 4. Hyperparameter sweep

LightGBM hyperparameter sweep on the anchor cell `scoreLead_drift × window_floor_frac=1/3`. 108 configs across `num_leaves × min_data_in_leaf × learning_rate × lambda_l2`. Tensorboard run at `~/w/vdc/tensorboard/hyperparam_sweep/`.

**Best OOD config:**

- `best OOD config: idx=6 within=+0.4611 OOD=+0.5474`
- `{'num_leaves': 8, 'min_data': 3, 'learning_rate': 0.1, 'lambda_l2': 0.0, 'n_estimators': 200}`

Full sweep file: `~/plots/hyperparam_sweep.txt`

---

## 5. Prior session's OOD R² baseline (reference)

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

## 6. Where to read further

- `research/notes/firewall-strategic-2026-05-21.md` — the 2-turn firewall consult that anchored Tier 0; pre-committed decision rules and target reframe specifications.
- `research/notes/interim-research-memo-2026-05-21.md` — comprehensive synthesis of the arc through 2026-05-21 mid-day.
- `research/notes/session-handoff-2026-05-21.md` — handoff brief that introduced the mode-as-feature finding.
- `research/data/trajectory_cache.npz` — substrate used by all overnight sims; produced by `cache_trajectories.py` with the bundled-fetch optimization.
- `research/data/advanced_multitimestep.csv` — ownership + policy distribution features at 5 V-checkpoints; produced by `extract_advanced_multitimestep.py`. Available for future enriched-regression retraining.

---

License: Public Domain (The Unlicense)
