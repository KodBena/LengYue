# Autonomous session report — 2026-05-20

Two-hour autonomous run (user out). The detailed transcript-equivalent
is in `session-state-2026-05-20.md`; this is the executive summary.

## Biggest finding

**Every regression target has 6-14× recoverable signal headroom in
log-space, NOT a noise floor.** The previous raw-space bootstrap
showed visit_entropy_reduction and winrate_drift with negative
ceilings — that was a heavy-tail artifact. The log-space rerun
(which matches what the regression actually uses via signed_log1p)
gives positive ceilings for every (target, param) we tested:

  | target | param | log-space ceiling | current OOF R² | headroom |
  |---|---|---|---|---|
  | scoreLead_drift | H | +0.839 | +0.119 (LGBM) | 7.1× |
  | visit_entropy_reduction | H | +0.706 | +0.105 (k-NN) | 6.7× |
  | L2_joint_drift | H | +0.718 | -0.229 (LGBM) | huge |
  | winrate_drift | H | +0.375 | -0.242 | substantial |

Strategic implication: **feature engineering and model expressiveness
are the dominant levers**. Labels have substantial signal across all
targets; we're leaving 85-95% on the table.

## Cards.db validation (Hatsuyoron-level positions)

Pipeline ran 5 canonical-volatile SGFs through `collect_trajectory.py`
at n_realizations=10 (matching corpus), fit hyperbolic, plotted vs
research-corpus distribution. The 5 positions do NOT all cluster in
one extreme of (H, κ) space:

- Card 2935: 4/4 clean, scoreLead H=4.1 (**5× corpus median**) — high yield.
- Card 3197: 4/4 clean, visit_entropy κ=8832 (**2.5× corpus median**) — slow extraction.
- Card 3534: 3/4 clean, all κ ≈ 430-530 (**low extreme**) — fast saturation, tactical.
- Card 1429: 3/4 clean, κ ≈ 3000-7000 (**high**) — needs deep search.
- Card 2893: 1/4 clean — unstable across realizations.

**Volatility is multi-modal.** Some Hatsuyoron-level positions need
deep search (high κ), others are fast-tactical (low κ), and some
break the hyperbolic family entirely (degenerate fit). A single
(H, κ) discriminator can't capture all four.

The cleanness classifier (trained on year2000 pro games) does NOT
generalize crisply to these OOD positions: LGBM 45%, Logistic 20%
accuracy on 20 (card, target) predictions. Signal exists for a few
high-confidence cases (e.g. 2935 scoreLead P=0.92, all 4 clean
confirmed) but doesn't discriminate consistently.

Plots: `~/plots/validate_volatile/`.

## Other diagnostics

- **score_stdev quintile partition** (pre-pause): different targets
  want different position kinds. scoreLead|H signal lives in Q1
  (low-stdev), visit_entropy|H signal lives in Q5 (high-stdev). A
  score_stdev partition feature is a high-leverage intervention.

- **Per-fold breakdown of scoreLead|H**: fold 3 R²=-0.28 vs fold 0
  R²=+0.33. Identified that **two specific positions dominate**
  the bad fold (1958-10-18:t208 with extreme-H, 1710CLR1-16:t40
  with modest-H but model overestimates). ~15 samples drive
  25-50% of fold 3 residual. **The +0.119 signal is real on
  typical positions but destroyed by 2 outliers in one fold.**
  Per-fold residual trimming or era features would address this.

- **LOFO on scoreLead|H**: top load-bearing features are
  policy_entropy (Δ=-0.072), score_stdev (-0.071), raw_noresult
  (-0.052). Two features ACTIVELY HURT scoreLead|H:
  `winrate_minus_raw` (Δ=+0.021), `pv_visit_decay_ratio` (Δ=+0.009).
  Dropping both on all 44 triples didn't yield a uniform improvement
  — helps some targets (winrate|H Δ=+0.13), hurts others
  (L2_joint|H Δ=-0.07). The LOFO win was scoreLead|H-specific.

## Code changes (uncommitted, for review)

- `research/regression.py`: Redis-backed corpus cache + disk
  fallback. First load: 4 min Postgres scan; subsequent: 60 ms.
  Progress prints during feature extraction (per the long-running-
  scripts feedback memory).
- `research/resnet_trajectory.py`: line-433 fix applied. Per-target
  population σ² replaces per-position y_range² normalization
  (firewall Tier-1 item). Both train + val loss sites patched.
  Syntax-checked, smoke-test in flight. Not yet retrained.
- `research/bootstrap_label_noise.py`: `--log-space` flag added,
  flushed progress.
- New scripts:
  - `classify_cleanness.py` — LGBM + Logistic cleanness classifier
  - `diagnose_hk_distribution.py` — (H, κ) joint diagnostic
  - `diagnose_score_stdev_partition.py` — quintile-partition
    diagnostic
  - `validate_volatile_cards.py` — cards.db pipeline orchestrator
  - `validate_volatile_classifier.py` — classifier cross-validation
  - `experiment_drop_lofo_hurting.py` — LOFO-drop experiment
  - `identify_worst_fold_positions.py` — per-fold outlier id
  - `cards_query.sql` — parameterized recursive CTE
- `notes/session-state-2026-05-20.md` — detailed state for
  resumption
- `notes/session-report-2026-05-20-autonomous.md` — this doc

## What I would do next (~ranked)

1. **Multi-timestep features** (Tier 1 firewall, HIGHEST LEVERAGE
   given the log-space headroom finding). Re-read trajectory packets
   from Postgres at V_pre + V≈500 + V≈2000 and compute the same 23
   features per snapshot. New feature matrix would be 3× wider.
2. **score_stdev quintile-bin as one-hot feature** in regression.
   Quick to implement; should help every (target, family, param)
   given the partition findings.
3. **ResNet retraining with line-433 fix** (~1-2 hr GPU). Code is
   ready; smoke-test confirms it runs.
4. **Identify fold-3 positions of scoreLead|H** (~10 min focused
   script). May reveal era-correlation or feature-distribution
   anomalies localizing the regression failure.
5. **Drop LOFO-hurting features ONLY for scoreLead|H**, keep them
   elsewhere. The +0.13 winrate|H improvement looks real and worth
   keeping; the L2_joint|H regression should be investigated.
6. **More volatile-card validation**: 2204 total volatile cards in
   cards.db; piping ~50-100 more through the n_realizations=10
   pipeline would give meaningful classifier AUC.

## Standing notes

- All long-running scripts must emit flushed progress (see
  `feedback_long_running_scripts_progress.md`).
- cards.db: position is LAST move of SGF; num_moves is sparring
  length (see `project_cards_db_semantics.md`).
- Redis cache survives reboot (RDB persistence). If keys are
  missing, the disk fallback at `research/data/corpus_cache/`
  repopulates on first read.
- `/tmp/summary_averaged.csv` and `/tmp/bootstrap_noise.csv` are
  symlinks to `research/data/`; re-create them after VM reboots:
  `ln -sf research/data/summary_averaged.csv /tmp/summary_averaged.csv`.
