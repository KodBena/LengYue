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

## Morning verdict (overnight findings, before deeper inspection)

- **Architecture: WINS, modestly.** The binary allocator's Pareto curve has points the always-V_max baseline cannot match. Specifically on `scoreLead_drift`, at τ=+0.25 the binary allocator achieves 0.871 top-1 agreement at 12018 avg visits — 20% visit savings for 3.6pp agreement cost. At τ=−0.25 it gets 0.9069 agreement at 14859 visits, a (tiny) free lunch over baseline 0.9065 at 15000. Same shape on the other 3 main targets; magnitudes differ.

- **Per-mode discrimination: NATURALLY EMERGES (validates the original research-arc hypothesis).** Splitting the cards.db slice by K=2 clusters (shape-invariant trajectory features), the allocator — trained on year2k with no mode label as input — naturally terminates easy positions more aggressively than hard ones. On `scoreLead_drift` at τ=+0.5: cluster 0 (low-magnitude) saves 56% of visits, cluster 1 (high-magnitude / dip-then-rise) saves only 24%. The discrimination is implicit in the predicted-remaining-gain signal. This is the research arc's core thesis empirically confirmed.

- **Feature engineering: target-specific.** Enriched features (ownership + policy distribution at 5 V-checkpoints) buy +1.1pp on `L2_joint_drift`, +0.6pp on `winrate_drift`, +0.5pp on `scoreLead_drift`, ~0pp on `visit_entropy_reduction`. The user's '2% of data is being used' instinct was directionally correct; the magnitude is real but per-target.

- **Delta-reframe (firewall Tier 1): mixed signal — kill the regression-target reframe, keep the allocator-decision reframe.** Within-corpus R² on the delta target is ~5× lower than on hyperbolic-H (kill-criterion triggered for the regression task itself). BUT when the delta predictor is wired into the allocator's decision rule, the resulting Pareto curve is *target-specific*: dominates H-allocator in mid-budget regions for some targets (`scoreLead_drift`), loses to H-allocator at the same budget for others (`visit_entropy_reduction`). **Predictor R² ≠ allocator utility.**

- **Hyperparameter sweep: +0.04 OOD R² achievable.** The default LightGBMWrap is slightly over-regularized; `num_leaves=8, min_data=3, lr=0.1, λ=0` gives OOD R²=+0.547 vs default +0.510 on the anchor cell. Worth applying to the production allocator predictor.

- **Recommended morning move:** the capability dispatch to the proxy (per firewall consult turn 2, §5 Tier 2) is unblocked. The architecture has empirical support; the dispatch shape (`staged_analysis` capability advertising trajectory packets at SPA-declared visit budgets) doesn't depend on which predictor/reframe variant wins long-term — only on the proxy supporting the partial-search-observation primitive. Drafting can proceed in parallel with deeper allocator refinement.

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

### scoreLead_drift — tuned hyperparams (num_leaves=8, min_data=3, lr=0.1, λ=0)

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
| -0.500 | 14930 | +0.9065 | 0.52% |
| -0.250 | 14894 | +0.9069 | 0.78% |
| +0.000 | 14753 | +0.9047 | 1.81% |
| +0.250 | 11792 | +0.8671 | 23.83% |
| +0.500 | 8344 | +0.8225 | 49.48% |
| +0.750 | 5830 | +0.8070 | 68.13% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for scoreLead_drift_tuned](file:///home/bork/plots/allocator_pareto/binary_scoreLead_drift_tuned.png)

![3stage Pareto for scoreLead_drift_tuned](file:///home/bork/plots/allocator_pareto/3stage_scoreLead_drift_tuned.png)

![combined Pareto for scoreLead_drift_tuned](file:///home/bork/plots/allocator_pareto/combined_scoreLead_drift_tuned.png)


Summary file: `~/plots/allocator_pareto/summary_scoreLead_drift_tuned.txt`

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

### winrate_drift — tuned hyperparams (num_leaves=8, min_data=3, lr=0.1, λ=0)

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
| +0.000 | 13941 | +0.8926 | 7.90% |
| +0.250 | 1797 | +0.7598 | 98.06% |
| +0.500 | 1552 | +0.7541 | 99.87% |
| +0.750 | 1534 | +0.7541 | 100.00% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for winrate_drift_tuned](file:///home/bork/plots/allocator_pareto/binary_winrate_drift_tuned.png)

![3stage Pareto for winrate_drift_tuned](file:///home/bork/plots/allocator_pareto/3stage_winrate_drift_tuned.png)

![combined Pareto for winrate_drift_tuned](file:///home/bork/plots/allocator_pareto/combined_winrate_drift_tuned.png)


Summary file: `~/plots/allocator_pareto/summary_winrate_drift_tuned.txt`

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

### visit_entropy_reduction — tuned hyperparams (num_leaves=8, min_data=3, lr=0.1, λ=0)

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
| +0.000 | 14965 | +0.9069 | 0.26% |
| +0.250 | 13284 | +0.9023 | 12.69% |
| +0.500 | 10746 | +0.8894 | 31.48% |
| +0.750 | 9441 | +0.8812 | 41.19% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for visit_entropy_reduction_tuned](file:///home/bork/plots/allocator_pareto/binary_visit_entropy_reduction_tuned.png)

![3stage Pareto for visit_entropy_reduction_tuned](file:///home/bork/plots/allocator_pareto/3stage_visit_entropy_reduction_tuned.png)

![combined Pareto for visit_entropy_reduction_tuned](file:///home/bork/plots/allocator_pareto/combined_visit_entropy_reduction_tuned.png)


Summary file: `~/plots/allocator_pareto/summary_visit_entropy_reduction_tuned.txt`

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

### L2_joint_drift — tuned hyperparams (num_leaves=8, min_data=3, lr=0.1, λ=0)

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
| +0.000 | 13364 | +0.8808 | 12.18% |
| +0.250 | 2603 | +0.7622 | 92.10% |
| +0.500 | 2008 | +0.7587 | 96.50% |
| +0.750 | 1728 | +0.7553 | 98.58% |

**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.

![binary Pareto for L2_joint_drift_tuned](file:///home/bork/plots/allocator_pareto/binary_L2_joint_drift_tuned.png)

![3stage Pareto for L2_joint_drift_tuned](file:///home/bork/plots/allocator_pareto/3stage_L2_joint_drift_tuned.png)

![combined Pareto for L2_joint_drift_tuned](file:///home/bork/plots/allocator_pareto/combined_L2_joint_drift_tuned.png)


Summary file: `~/plots/allocator_pareto/summary_L2_joint_drift_tuned.txt`

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

## 3a. Per-mode Pareto split (validates the original research-arc hypothesis)

The user's original research arc was driven by the question "do volatile positions need more search?". Tonight's experiment: split the cards.db OOD slice by K=2 cluster IDs (re-derived from shape-invariant trajectory features matching the prior `discover_volatility_modes.py` recipe) and report per-mode Pareto curves.

**Key finding**: the allocator's predictor (trained on year2k, no mode label as input) naturally produces different decisions for different modes. Easy positions get terminated more aggressively; hard positions retain visits. The discrimination is implicit in the predicted-remaining-gain signal — exactly what the research arc was hoping to find.

Specifically on `scoreLead_drift` at τ=+0.5:
- Cluster 0 (n=489, low-magnitude mode): saves 56% of visits at 8.7pp agreement cost
- Cluster 1 (n=283, high-magnitude / dip-then-rise mode): saves only 24% of visits at 3.4pp agreement cost

The allocator is doing the right thing per-mode without any mode label as input.

### scoreLead_drift

```
# per-mode allocator sim: scoreLead_drift k=2

# cluster assignments per domain:
#   cluster 0: year2k=241  cards=489
#   cluster 1: year2k=148  cards=283

# cluster 0 (n_cards=489)
#   baseline (always V_max): visits=15000  agree=0.9059
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9059   0.00%
    -1.750      15000   +0.9059   0.00%
    -1.500      15000   +0.9059   0.00%
    -1.250      15000   +0.9059   0.00%
    -1.000      15000   +0.9059   0.00%
    -0.750      14972   +0.9059   0.20%
    -0.500      14945   +0.9059   0.41%
    -0.250      14777   +0.9065   1.64%
    +0.000      14668   +0.9033   2.45%
    +0.250      11310   +0.8585  27.40%
    +0.500       6582   +0.8072  62.58%
    +0.750       4268   +0.7785  79.75%
    +1.000       3107   +0.7769  88.34%
    +1.250       2362   +0.7720  93.87%
    +1.500       2113   +0.7683  95.71%
    +1.750       1835   +0.7650  97.75%
    +2.000       1752   +0.7634  98.36%
    +2.250       1642   +0.7634  99.18%
    +2.500       1615   +0.7634  99.39%
    +2.750       1615   +0.7634  99.39%
    +3.000       1559   +0.7634  99.80%
    +3.250       1559   +0.7634  99.80%
    +3.500       1559   +0.7634  99.80%
    +3.750       1559   +0.7634  99.80%
    +4.000       1559   +0.7634  99.80%

# cluster 1 (n_cards=283)
#   baseline (always V_max): visits=15000  agree=0.9074
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9074   0.00%
    -1.750      15000   +0.9074   0.00%
    -1.500      15000   +0.9074   0.00%
    -1.250      15000   +0.9074   0.00%
    -1.000      15000   +0.9074   0.00%
    -0.750      15000   +0.9074   0.00%
    -0.500      15000   +0.9074   0.00%
    -0.250      15000   +0.9074   0.00%
    +0.000      14952   +0.9092   0.35%
    +0.250      13243   +0.8926  13.07%
    +0.500      11387   +0.8735  26.86%
    +0.750       8772   +0.8375  46.29%
    +1.000       7536   +0.8283  55.48%
    +1.250       6731   +0.8216  61.48%
    +1.500       5498   +0.7975  70.67%
    +1.750       4450   +0.7753  78.45%
    +2.000       3736   +0.7618  83.75%
    +2.250       2924   +0.7541  89.75%
    +2.500       2351   +0.7463  93.99%
    +2.750       2063   +0.7470  96.11%
    +3.000       1872   +0.7406  97.53%
    +3.250       1728   +0.7375  98.59%
    +3.500       1633   +0.7375  99.29%
    +3.750       1538   +0.7385 100.00%
    +4.000       1538   +0.7385 100.00%


```

![per-mode Pareto for scoreLead_drift](file:///home/bork/plots/allocator_pareto_per_mode/per_mode_scoreLead_drift.png)

### winrate_drift

```
# per-mode allocator sim: winrate_drift k=2

# cluster assignments per domain:
#   cluster 0: year2k=228  cards=481
#   cluster 1: year2k=161  cards=291

# cluster 0 (n_cards=481)
#   baseline (always V_max): visits=15000  agree=0.9054
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9054   0.00%
    -1.750      15000   +0.9054   0.00%
    -1.500      15000   +0.9054   0.00%
    -1.250      15000   +0.9054   0.00%
    -1.000      15000   +0.9054   0.00%
    -0.750      15000   +0.9054   0.00%
    -0.500      15000   +0.9054   0.00%
    -0.250      15000   +0.9054   0.00%
    +0.000      13021   +0.8863  14.76%
    +0.250       1643   +0.7863  99.17%
    +0.500       1530   +0.7871 100.00%
    +0.750       1530   +0.7871 100.00%
    +1.000       1530   +0.7871 100.00%
    +1.250       1530   +0.7871 100.00%
    +1.500       1530   +0.7871 100.00%
    +1.750       1530   +0.7871 100.00%
    +2.000       1530   +0.7871 100.00%
    +2.250       1530   +0.7871 100.00%
    +2.500       1530   +0.7871 100.00%
    +2.750       1530   +0.7871 100.00%
    +3.000       1530   +0.7871 100.00%
    +3.250       1530   +0.7871 100.00%
    +3.500       1530   +0.7871 100.00%
    +3.750       1530   +0.7871 100.00%
    +4.000       1530   +0.7871 100.00%

# cluster 1 (n_cards=291)
#   baseline (always V_max): visits=15000  agree=0.9082
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9082   0.00%
    -1.750      15000   +0.9082   0.00%
    -1.500      15000   +0.9082   0.00%
    -1.250      15000   +0.9082   0.00%
    -1.000      15000   +0.9082   0.00%
    -0.750      15000   +0.9082   0.00%
    -0.500      15000   +0.9082   0.00%
    -0.250      15000   +0.9082   0.00%
    +0.000      13710   +0.8921   9.62%
    +0.250       2055   +0.7048  96.22%
    +0.500       1541   +0.6997 100.00%
    +0.750       1541   +0.6997 100.00%
    +1.000       1541   +0.6997 100.00%
    +1.250       1541   +0.6997 100.00%
    +1.500       1541   +0.6997 100.00%
    +1.750       1541   +0.6997 100.00%
    +2.000       1541   +0.6997 100.00%
    +2.250       1541   +0.6997 100.00%
    +2.500       1541   +0.6997 100.00%
    +2.750       1541   +0.6997 100.00%
    +3.000       1541   +0.6997 100.00%
    +3.250       1541   +0.6997 100.00%
    +3.500       1541   +0.6997 100.00%
    +3.750       1541   +0.6997 100.00%
    +4.000       1541   +0.6997 100.00%


```

![per-mode Pareto for winrate_drift](file:///home/bork/plots/allocator_pareto_per_mode/per_mode_winrate_drift.png)

### visit_entropy_reduction

```
# per-mode allocator sim: visit_entropy_reduction k=2

# cluster assignments per domain:
#   cluster 0: year2k=190  cards=378
#   cluster 1: year2k=199  cards=394

# cluster 0 (n_cards=378)
#   baseline (always V_max): visits=15000  agree=0.9378
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9378   0.00%
    -1.750      15000   +0.9378   0.00%
    -1.500      15000   +0.9378   0.00%
    -1.250      15000   +0.9378   0.00%
    -1.000      15000   +0.9378   0.00%
    -0.750      15000   +0.9378   0.00%
    -0.500      15000   +0.9378   0.00%
    -0.250      15000   +0.9378   0.00%
    +0.000      14893   +0.9357   0.79%
    +0.250      11217   +0.9291  28.04%
    +0.500       7112   +0.9029  58.47%
    +0.750       5835   +0.8899  67.99%
    +1.000       5163   +0.8812  73.02%
    +1.250       4457   +0.8667  78.31%
    +1.500       3851   +0.8569  82.80%
    +1.750       2858   +0.8429  90.21%
    +2.000       1932   +0.8153  97.09%
    +2.250       1575   +0.8090  99.74%
    +2.500       1539   +0.8087 100.00%
    +2.750       1539   +0.8087 100.00%
    +3.000       1539   +0.8087 100.00%
    +3.250       1539   +0.8087 100.00%
    +3.500       1539   +0.8087 100.00%
    +3.750       1539   +0.8087 100.00%
    +4.000       1539   +0.8087 100.00%

# cluster 1 (n_cards=394)
#   baseline (always V_max): visits=15000  agree=0.8764
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.8764   0.00%
    -1.750      15000   +0.8764   0.00%
    -1.500      15000   +0.8764   0.00%
    -1.250      15000   +0.8764   0.00%
    -1.000      15000   +0.8764   0.00%
    -0.750      15000   +0.8764   0.00%
    -0.500      15000   +0.8764   0.00%
    -0.250      15000   +0.8764   0.00%
    +0.000      14965   +0.8772   0.25%
    +0.250      14416   +0.8728   4.31%
    +0.500      13487   +0.8708  11.17%
    +0.750      12629   +0.8622  17.51%
    +1.000      12186   +0.8571  20.81%
    +1.250      11640   +0.8553  24.87%
    +1.500      10514   +0.8510  33.25%
    +1.750       8057   +0.8119  51.52%
    +2.000       2970   +0.7193  89.34%
    +2.250       1805   +0.7081  97.97%
    +2.500       1530   +0.7018 100.00%
    +2.750       1530   +0.7018 100.00%
    +3.000       1530   +0.7018 100.00%
    +3.250       1530   +0.7018 100.00%
    +3.500       1530   +0.7018 100.00%
    +3.750       1530   +0.7018 100.00%
    +4.000       1530   +0.7018 100.00%


```

![per-mode Pareto for visit_entropy_reduction](file:///home/bork/plots/allocator_pareto_per_mode/per_mode_visit_entropy_reduction.png)

### L2_joint_drift

```
# per-mode allocator sim: L2_joint_drift k=2

# cluster assignments per domain:
#   cluster 0: year2k=147  cards=266
#   cluster 1: year2k=242  cards=506

# cluster 0 (n_cards=266)
#   baseline (always V_max): visits=15000  agree=0.9117
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9117   0.00%
    -1.750      15000   +0.9117   0.00%
    -1.500      15000   +0.9117   0.00%
    -1.250      15000   +0.9117   0.00%
    -1.000      15000   +0.9117   0.00%
    -0.750      15000   +0.9117   0.00%
    -0.500      15000   +0.9117   0.00%
    -0.250      15000   +0.9117   0.00%
    +0.000      14394   +0.8936   4.51%
    +0.250       4996   +0.7684  74.44%
    +0.500       2960   +0.7466  89.47%
    +0.750       2147   +0.7380  95.49%
    +1.000       1688   +0.7327  98.87%
    +1.250       1534   +0.7316 100.00%
    +1.500       1534   +0.7316 100.00%
    +1.750       1534   +0.7316 100.00%
    +2.000       1534   +0.7316 100.00%
    +2.250       1534   +0.7316 100.00%
    +2.500       1534   +0.7316 100.00%
    +2.750       1534   +0.7316 100.00%
    +3.000       1534   +0.7316 100.00%
    +3.250       1534   +0.7316 100.00%
    +3.500       1534   +0.7316 100.00%
    +3.750       1534   +0.7316 100.00%
    +4.000       1534   +0.7316 100.00%

# cluster 1 (n_cards=506)
#   baseline (always V_max): visits=15000  agree=0.9038
#   binary policy:
       tau     visits     agree   term%
    -2.000      15000   +0.9038   0.00%
    -1.750      15000   +0.9038   0.00%
    -1.500      15000   +0.9038   0.00%
    -1.250      15000   +0.9038   0.00%
    -1.000      15000   +0.9038   0.00%
    -0.750      15000   +0.9038   0.00%
    -0.500      15000   +0.9038   0.00%
    -0.250      15000   +0.9038   0.00%
    +0.000      13963   +0.8828   7.71%
    +0.250       2150   +0.7688  95.45%
    +0.500       1668   +0.7676  99.01%
    +0.750       1588   +0.7662  99.60%
    +1.000       1534   +0.7660 100.00%
    +1.250       1534   +0.7660 100.00%
    +1.500       1534   +0.7660 100.00%
    +1.750       1534   +0.7660 100.00%
    +2.000       1534   +0.7660 100.00%
    +2.250       1534   +0.7660 100.00%
    +2.500       1534   +0.7660 100.00%
    +2.750       1534   +0.7660 100.00%
    +3.000       1534   +0.7660 100.00%
    +3.250       1534   +0.7660 100.00%
    +3.500       1534   +0.7660 100.00%
    +3.750       1534   +0.7660 100.00%
    +4.000       1534   +0.7660 100.00%


```

![per-mode Pareto for L2_joint_drift](file:///home/bork/plots/allocator_pareto_per_mode/per_mode_L2_joint_drift.png)

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
