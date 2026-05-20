# Session state — 2026-05-20

Paper-trail snapshot of the research-branch investigation, written
so resumption (`claude --continue`) is fast even if the transcript
is unavailable. Updated as the session progresses; the live
truth-source is the conversation itself.

## Investigation arc this session

We're investigating the **learned continuous visit-scaling model**
(per-turn predictor that maps position features to a parametric
information-extraction curve `F(V; θ)`). The 2026-05-20 firewall
consultation (`research/notes/firewall-strategic-2026-05-20.md`)
ranked the next moves as:

  - **Tier 0**: bootstrap label-noise diagnostic — establishes R²
    ceiling, conditions all downstream decisions.
  - **Tier 1**: fix ResNet loss line 433 (per-position normalisation
    creates a "predict-the-mean via cancelling components" attractor);
    multi-timestep features; feature engineering (policy KL,
    ownership-derived, position-structural); F-at-anchors
    architectural alternative.
  - **Tier 2**: more positions, different parametric family
    (deferred).
  - **Tier 3**: per-class regressors — actively recommended against
    in favour of class-like FEATURES.

## User's canonical "extremely volatile" positions (cards.db cross-ref)

The user identified **5 cards** in `cards.db` (game_source 2649) as
their canonical "Igo Hatsuyoron-level difficult" volatile positions:

  - card 1429 (spar length 7)
  - card 2893 (spar length 8)
  - card 2935 (spar length 9)
  - card 3197 (spar length 5)
  - card 3534 (spar length 6)

**Critical**: `num_moves` is the sparring length (number of moves the
user plays against KataGo), NOT a position-move-number address into
the SGF. The card's position is the **last move of the SGF** — a
deep middlegame/endgame board state, not an early-fuseki one. See
the memory `project_cards_db_semantics.md` for the full semantics.

The user has beaten KataGo on a derivative of one of these. That's
the strongest possible ground-truth signal for the "needs more
search" discrimination problem.

The SGFs are saved at `~/volatile_sgfs/` as `card_<id>_move<n>_r<r>.sgf`.

**Pending work using these:** pipe each through the trajectory
collector at its `num_moves` snapshot (GPU-bound; user has
authorized GPU use for this purpose specifically), fit hyperbolic
on the resulting visit-scaling trajectory, and compare:
  - (H, κ) location vs research-corpus distribution — these
    positions should be in the "informative" extreme.
  - cleanness-classifier probability — should be near 1 on these
    positions (clean visit_entropy fit).
  - bootstrap variance — should be characteristic of "real signal,
    not label noise" if our diagnostics are right.

Reusable SQL: `research/cards_query.sql` (parameterized recursive
CTE for card→game_source linkage via card_source chain).

## What we ran this session

1. **Bootstrap label-noise diagnostic** (Tier 0) on hyperbolic family
   only, 389 positions × 50 iterations. Results in
   `~/plots/bootstrap_summary.txt` and persisted at
   `research/data/bootstrap_noise.csv`.

   **Headline:** `scoreLead_drift|H` has R²_ceiling = **+0.283**;
   our prior LGBM OOF was +0.119 → ~2.4× headroom remaining.
   `L2_joint_drift|H` has R²_ceiling = **+0.700** (untested in
   regression — biggest untapped target). `visit_entropy_reduction`
   and `winrate_drift` come out with **negative ceilings** in raw
   space — caveat below.

   **Caveat:** the bootstrap variance was computed in raw-label
   space; the regression OOF R² we have was computed in
   signed_log1p-label space. Not directly comparable. Re-running in
   log-space (~5 min) is queued.

2. **(H, κ) joint-distribution diagnostic** on averaged-trajectory
   fits (`diagnose_hk_distribution.py`).

   **Headline:** the firewall's curve_fit-identifiability
   hypothesis is **refuted**. ρ(H, log κ) is *positively* correlated
   (+0.34 to +0.56) across all four targets — substantive position
   structure, not a degenerate ridge. κ is well-behaved (log10 κ
   median 3.3-3.5, IQR 3.0-3.8, no boundary pinning). H is heavily
   right-skewed (most positions are "boring" with low yield, a few
   are very rich).

   Implication: ResNet's all-negative-κ outputs are **architectural**
   (line 433 loss or κ head), not a data artifact.

   Artifacts: `~/plots/diagnose_hk_scatter_hyperbolic.png`,
   `~/plots/diagnose_hk_marginals_hyperbolic.png`,
   `~/plots/diagnose_hk_summary_hyperbolic.txt`.

3. **Cleanness classifier** (LGBM, 12 (target, family) pairs).
   User asked specifically whether features can predict which
   positions get clean fits for `visit_entropy_reduction|hyperbolic`
   (since its cleanness rate is only 25.6%).

   **Headline:** `visit_entropy_reduction|hyperbolic` AUC = **+0.6063**
   under LGBM (per-fold: +0.634, +0.568, +0.686, +0.655, +0.499).
   Other 11 pairs are essentially at chance (AUC 0.47-0.55).
   Top feature is `policy_entropy` with huge gain (~1.4× the next
   feature), matching the intuition that low-policy-entropy
   (forced/clear) positions are the ones whose visit_entropy curve
   collapses to degenerate.

   Yellow flag: logloss_lift is **negative** (-0.32) — AUC ranking
   is meaningful, but probabilities are miscalibrated by the
   `scale_pos_weight` rebalancing. Fine as a *ranking feature*,
   not as a hard gate.

   Artifacts:
   `~/plots/classify_cleanness_summary.txt`,
   `~/plots/classify_clean_*.png`.

4. **Logistic-regression validator added** to the cleanness
   classifier (`classify_cleanness.py`). For `visit_entropy_reduction
   |hyperbolic`: Logistic AUC=+0.5932 (vs LGBM +0.6063), AP +0.326
   (vs +0.304), logloss_lift -0.11 (vs -0.32). Linear model
   confirms the signal AND is far better calibrated than LGBM's
   scale_pos_weight-inflated probabilities. For
   `L2_joint_drift|hyperbolic` and `scoreLead_drift|hyperbolic`,
   Logistic AUC > LGBM AUC (+0.53 vs +0.47/+0.48) — LGBM is
   overfitting position-specific noise that GroupKFold then
   penalises.

5. **Re-ran `regression.py` on cached corpus.** Two pre-existing
   SIGNAL results unchanged: `scoreLead_drift|hyperbolic|H` LGBM
   +0.119, `visit_entropy_reduction|hyperbolic|H` k-NN +0.105.
   One new WEAK: `winrate_drift|convex_mixture_hyperbolic|H1` LGBM
   +0.016. **L2_joint_drift|H is negative in every model** (-0.099
   to -0.321) despite its +0.700 bootstrap ceiling — large gap.

6. **score_stdev quintile partition** (`diagnose_score_stdev_partition.py`).
   Per-target signal partitions by per-position MCTS-disagreement:
   - `scoreLead_drift|H` signal concentrates in LOW-stdev positions
     (Q1 R²=+0.59 vs overall +0.12) — the regression works best
     where MCTS agrees with itself.
   - `visit_entropy_reduction|H` signal concentrates in HIGH-stdev
     positions (Q5 R²=+0.37 vs overall +0.10) — opposite pattern.
   - `L2_joint_drift|H` is negative in every quintile (no signal
     anywhere); the +0.700 bootstrap ceiling is misleading.
   - Implication: different targets want different position kinds.
     A score_stdev partition feature (or per-quintile models) is
     a high-leverage intervention.
   Artifacts: `~/plots/diagnose_stdev_partition_*.png`,
   `~/plots/diagnose_stdev_partition_summary.txt`.

7. **Corpus caching** (Redis @ 127.0.0.1:6379 + disk fallback at
   `research/data/corpus_cache/`). Switched `load_corpus()` from
   per-call Postgres connection (4-min tax) to Redis-first cache;
   subsequent loads are ~60 ms. Disk fallback survives Redis
   restarts.

8. **Log-space bootstrap variant** (`bootstrap_label_noise.py
   --log-space`) — applies signed_log1p to bootstrap samples
   before computing σ_within/σ_across, so the R²_ceiling becomes
   directly comparable to regression OOF R² (which is computed
   in signed_log1p space).

   **Major reframe.** The previous raw-space "noise-bound" verdicts
   for visit_entropy_reduction and winrate_drift were ARTIFACTS of
   H's heavy right-skew. In log-space (which is what regression
   actually uses), every target has substantial positive ceiling:

   | target | param | raw-ceiling | log-ceiling | current OOF | headroom |
   |---|---|---|---|---|---|
   | scoreLead_drift | H | +0.283 | **+0.839** | +0.119 (LGBM) | **7.1×** |
   | scoreLead_drift | κ | +0.145 | +0.587 | -0.226 | huge |
   | visit_entropy_reduction | H | -0.922 | **+0.706** | +0.105 (k-NN) | **6.7×** |
   | visit_entropy_reduction | κ | -0.584 | +0.767 | -0.211 | huge |
   | L2_joint_drift | H | +0.700 | **+0.718** | -0.229 | huge |
   | L2_joint_drift | κ | +0.221 | +0.563 | -0.247 | huge |
   | winrate_drift | H | -0.783 | **+0.375** | -0.242 | substantial |
   | winrate_drift | κ | -2.100 | +0.564 | -0.141 | huge |

   **Strategic implication:** NO target is noise-bound. Every
   target has 6-14× headroom over current regression performance.
   The bottleneck is features + model expressiveness, not labels.
   This dramatically elevates the priority of Tier-1 firewall items
   (multi-timestep features, policy KL, ownership-derived,
   ResNet line-433 fix).

   Artifacts: `~/plots/bootstrap_summary_logspace.txt`,
   `research/data/bootstrap_noise_logspace.csv`.

9. **Per-fold worst-fold diagnostic on scoreLead_drift|H**.
   Per-fold breakdown of the +0.119 LGBM signal:
   - Fold 0: +0.329, Fold 1: +0.107, Fold 2: +0.259,
     **Fold 3: −0.283**, Fold 4: +0.138.
   - One fold (fold 3) drags the mean down. Identifying which
     positions populate it would localise the residual structure.

   LOFO results (most load-bearing features):
   1. policy_entropy   Δ=-0.072 (removing it drops R² by 7.2%)
   2. score_stdev      Δ=-0.071
   3. raw_noresult     Δ=-0.052
   4. score_lead_minus_raw Δ=-0.036
   5. prior_entropy    Δ=-0.030

   Two features ACTIVELY HURT the regression (R² improves when
   removed):
   - `winrate_minus_raw`        Δ=+0.021
   - `pv_visit_decay_ratio`     Δ=+0.009

   Dropping these two could yield ~+0.03 R² for free.

10. **Cards.db volatile-position pipeline validation** (`validate_volatile_cards.py`).
    Pipes the 5 canonical SGFs (cards 1429, 2893, 2935, 3197, 3534
    from cards.db game_source 2649) through `collect_trajectory.py`
    at their last-move position (sparring-length aside, see
    `project_cards_db_semantics`), fits hyperbolic, plots against
    research-corpus distribution.

    **First pass at n_realizations=3** (vs corpus's 10): three
    sub-clusters:
    - **Card 2935 + 3197**: well-fit, sit in main cluster of
      corpus distribution. Hatsuyoron-level but trajectories look
      "normal".
    - **Card 2893 + 3534**: very low κ (~100-150), in the
      low-κ extreme of the corpus. "Fast-saturation" tactical
      positions — information captured at low V.
    - **Card 1429**: ALL FOUR targets degenerate. The hyperbolic
      family can't fit. The hardest position in the set.

    **Critical reframe:** the volatile cards are NOT in the
    upper-H extreme of the corpus distribution. "Volatile" appears
    to mean "low κ" (fast saturation) or "family-mismatch"
    (hyperbolic can't fit), NOT "high H" (rich asymptote).

    **Classifier cross-validation at n=3** showed essentially
    chance accuracy (LGBM 50%, Logistic 35% on 20 predictions),
    but with a confound: the corpus was collected at n=10
    realizations so its averaged labels are less noisy than the
    n=3 volatile labels.

    **Apples-to-apples rerun at n_realizations=10 — completed.**
    Picture changed substantially with proper averaging:

    | card | scoreLead | visit_entropy | L2_joint | winrate |
    |---|---|---|---|---|
    | 1429 | clean H=1.0 κ=6932 | degen | clean H=0.04 κ=5415 | clean H=0.02 κ=3172 |
    | 2893 | degen | degen | degen | clean H=0.02 κ=2963 |
    | 2935 | clean H=4.1 κ=5727 | clean H=0.56 κ=1907 | clean H=0.24 κ=4994 | clean H=0.17 κ=4347 |
    | 3197 | clean H=2.0 κ=1789 | clean H=1.38 κ=8832 | clean H=0.07 κ=1907 | clean H=0.03 κ=2452 |
    | 3534 | clean H=1.6 κ=533 | degen | clean H=0.06 κ=530 | clean H=0.01 κ=428 |

    **Card 1429 went from all-degenerate at n=3 to 3/4 clean at
    n=10** — the n=3 "degenerate" was averaging noise, not
    unfittability. Per-card pattern at n=10:
    - Card 2935: 4/4 clean, scoreLead H=4.1 is **high** vs corpus
      median 0.79 (5× extreme).
    - Card 3197: 4/4 clean, visit_entropy κ=8832 is **very high**
      vs corpus median 3500 (2.5× extreme).
    - Card 3534: 3/4 clean, all κ values **very low** (428-533)
      vs corpus median ~2200 — fast-saturation tactical pattern.
    - Card 1429: 3/4 clean, all κ values **high** (3172-6932) —
      needs many visits, consistent with Hatsuyoron difficulty.
    - Card 2893: 1/4 clean — unstable across realizations,
      hyperbolic fit fragile.

    **No unified "volatile cluster"** — the 5 cards do NOT all
    sit in the same extreme of (H, κ) space. Volatility manifests
    in multiple distinct ways: high-κ (need deep search),
    low-κ (fast tactical extraction), or family-mismatch
    (hyperbolic doesn't fit). The user's "extremely volatile"
    label is multi-modal in our parameterization.

    **Cleanness classifier accuracy at n=10**: LGBM 45%, Logistic
    20% on 20 (card, target) predictions — essentially chance.
    LGBM does correctly predict CLEAN with high confidence for
    cards 2935 and 3197 scoreLead (P>0.85, all 4/4 clean), so
    some signal is present but the classifier doesn't generalize
    crisply to OOD positions. The cleanness classifier as
    trained on year2000 pro games does not transfer to
    Hatsuyoron-level positions from cards.db.

    Artifacts:
    - `~/plots/validate_volatile/validate_volatile_summary.txt` (n=10)
    - `~/plots/validate_volatile/validate_volatile_hk_scatter.png` (n=10)
    - `~/plots/validate_volatile/validate_volatile_classifier_n10.txt`
    - n=3 preliminary copies preserved with `_n3` suffix

11. **ResNet line 433 fix** (Tier 1 firewall, applied to
    `resnet_trajectory.py`). Replaced per-position
    `y_range²` normalization with per-target population-σ²
    normalization (σ² computed once on training set, used as
    constant denominator). Drops the "predict-the-mean via
    cancelling components" attractor while preserving cross-target
    scale invariance. Both train (line ~433) and val (line ~471)
    loss sites patched; checkpoint-resume safe because σ² is a
    deterministic function of (train_idx, samples) which are both
    reproduced on resume. Syntax-checked, smoke-tested (still
    loading dataset at session end — verify completes cleanly
    next session). NOT YET RETRAINED at scale (would need ~1-2 hr
    GPU; deferred to next session).

12. **`load_dataset()` progress prints** (`resnet_trajectory.py`).
    Same long-running-script silent-stdout problem as the original
    `load_corpus`: ~4-5 min Postgres iteration with no output.
    Now emits progress every 250 samples + an upfront total
    estimate. Per the `feedback_long_running_scripts_progress`
    memory.

13. **Worst-fold position identification** for scoreLead|H
    (`identify_worst_fold_positions.py`). Fold 3 (R²=-0.28) has
    46 unique positions × 10 realizations = 460 samples, but **two
    specific positions dominate the worst residuals**:
    - **1958-10-18:t208**: 10 samples in top-15 worst residuals,
      actual log_y=+3.418 (H≈29.5, top corpus extreme), predicted
      ~+1.0-1.4. Model has no path: sparse decade (only 3 1950s
      positions in corpus), extreme H value.
    - **1710CLR1-16:t40**: 5 samples in top-15, actual
      log_y=+0.307 (H≈0.36, modest), predicted ~+2.3-2.4. Big
      overestimate.
    These 15 samples explain ~25-50% of fold 3 sum-squared
    residual. **The +0.119 LGBM signal is real on typical
    positions but destroyed by 2 outliers in one fold**.
    Possible interventions:
    - Per-fold residual trimming (drop top-N outliers per fold)
    - Era/decade feature so model can partition cross-era extremes
    - Drop the few non-standard stems with "2940s"/"2950s"-like
      prefixes (likely SGF naming anomalies; flagged for audit)

    Artifacts: `~/plots/worst_fold_scoreLead_drift_hyperbolic_H.png`,
    `~/plots/identify_worst_fold.log`.

14b. **Mode discovery via unsupervised clustering** (2026-05-21).
    Tested the user's two-mode volatility hypothesis (endgame
    precision vs heuristic-interaction-in-tilted-games) via
    shape-invariant K-means in trajectory-feature space.

    Features used (5 per target × 4 drift targets = 20 dims, all
    SHAPE-INVARIANT — no magnitude):
      - dip_depth / y_range
      - log_kappa_dlp_median
      - slope_terminal / |slope_early|
      - monotonicity_frac
      - dlp_n_valid_pairs / 1225

    **K=3 result:** clean separation into 3 modes matching the
    user's hypothesis + one bulk mode:

    | Cluster | n | log_κ | dip/range | mono | Mode |
    |---|---|---|---|---|---|
    | 0 | 137 | 7.07 (low) | 0.08-0.16 | 0.65 | **Fast-tactical / endgame** |
    | 1 | 147 | 8.24 (high) | **0.43** | 0.59 | **Reading-paradox / heuristic** |
    | 2 | 153 | 7.85 | 0.02 | **0.81** | Clean monotone (bulk) |

    **Validation by tags:** cards.db tags cross-align with clusters:
      - Cluster 0 dominant tags: sabaki (6), punish (4), endgame (3)
      - Cluster 1 dominant tags: technical (3), judgement (1)
      - Cluster 2 dominant tags: volatile (16), punish (7), technical (6)

    The `volatile` tag is multi-modal (10 / 8 / 16 across the three
    clusters). The user's tagging system encodes mode-specific tags
    (sabaki, technical, judgement) more cleanly than the umbrella
    `volatile` tag — and those mode-specific tags align with the
    data-driven clusters.

    **Specific confirmations:**
      - Card 1408 (κ=95k extreme): cluster 2 clean-monotone (the
        extreme κ was driven by clean saturation extending past
        V_max, NOT by a paradox dip).
      - Card 3659 (non-volatile, 19 reviews, tags shape+judgement):
        cluster 1 reading-paradox. Confirms "non-volatile but
        heuristic-interaction" pattern is real.
      - Card 2886 (all-degenerate fit-pathology): cluster 1 reading-
        paradox. Its non-monotonicity is captured.

    Implication: a downstream model could exploit the 3-cluster
    structure as a categorical feature, or train per-cluster
    sub-models. This is genuine multi-modal structure to design
    against.

    Artifacts:
      - `~/plots/mode_discovery/mode_discovery_pca.png` (magnitude-mixed)
      - `~/plots/mode_discovery/mode_discovery_shape_invariant.png`
      - `~/plots/mode_discovery/mode_discovery_summary.txt`

14. **Cards.db family-heredity validation** (`analyze_family_heredity.py`).
    User's insight: by heredity, familial relations among cited cards
    (parents, siblings, descendants via card_source.card_source_id
    chain) yield additional info. Selected 13 family cards (4
    non-volatile parents, 5 siblings of seeds, 4 descendants
    including 1 non-volatile control), collected at
    n_realizations=10, fit hyperbolic, compared against 5 seeds +
    research-corpus distribution.

    **Heredity is statistically detectable across all 4 targets**:

    | target | within-family σ | across-family σ | ratio |
    |---|---|---|---|
    | L2_joint_drift | 0.206 | 0.428 | 0.48 |
    | scoreLead_drift | 0.886 | 1.717 | 0.52 |
    | visit_entropy_reduction | 0.400 | 0.917 | 0.44 |
    | winrate_drift | 0.189 | 0.318 | 0.60 |

    Same-parent cards cluster 2× tighter in (H, log κ) than random
    pairs.

    **Three standout findings:**
    - **Card 1408 (non-volatile parent of 3197)** is the most
      extreme position in our entire dataset for
      visit_entropy_reduction: κ ≈ 95,640 (32× corpus median).
      User didn't tag it volatile but the (H, κ) signal flags it.
      User's label and our discriminator diverge — possibly
      because the position is "boring-looking" (no obvious
      tactics) but slow-to-extract.
    - **Card 4889 (non-volatile descendant of 2935)** has
      scoreLead κ=5.5 vs parent 2935's κ=5727 — three orders of
      magnitude apart. Volatility is position-specific even one
      move away.
    - **Card 2886 (sibling of 2893, same parent 1429)**: 0/4
      clean fits. Same fit-pathology as 2893. There's a
      hereditary "fit-mismatch" pattern in 1429's descendant
      subgroup that hyperbolic can't capture.

    Card metadata + tree structure documented in
    `analyze_family_heredity.py` CARD_META dict.

    Artifacts:
    - `~/plots/validate_volatile_family/family_hk_scatter.png`
    - `~/plots/validate_volatile_family/family_heredity_summary.txt`
    - `~/plots/validate_volatile_family/validate_volatile_summary.txt`
      (full per-card fit details)

15. **LOFO-hurting-feature drop experiment**
    (`experiment_drop_lofo_hurting.py`). Tested whether removing
    `winrate_minus_raw` + `pv_visit_decay_ratio` (the two features
    with positive LOFO Δ on scoreLead|H) improves all 44 (target,
    family, param) triples:
    - mean Δ: k-NN -0.008, Ridge +0.002, LGBM +0.002 — near-zero
    - 16/44, 33/44, 23/44 improved respectively
    - **Standout**: winrate_drift|hyperbolic|H LGBM Δ=+0.13
      (substantial improvement: -0.24 → -0.11)
    - **Cost**: L2_joint_drift|hyperbolic|H LGBM Δ=-0.07
      (substantial regression: -0.23 → -0.30)
    - scoreLead_drift|H (the original LOFO motivator) Δ=-0.004
      (no improvement, possibly LOFO was a CV-noise artifact)
    - Not a uniform win; the dropped features carry information
      that helps some targets even while hurting scoreLead|H.

## Persistent locations (survives VM restart)

  - **Conversation transcript**: `~/.claude/projects/-home-bork-w-omega/*.jsonl`
  - **Auto-memory**: `~/.claude/projects/-home-bork-w-omega/memory/`
  - **Code**: `~/w/omega/research/` (feat/learned-value-fn branch)
  - **Plots**: `~/plots/`
  - **Persisted data**: `~/w/omega/research/data/`
    - `summary_averaged.csv` — averaged-trajectory hyperbolic fits
      (4128 rows, 344 positions × 4 targets × 3 families)
    - `bootstrap_noise.csv` — per-position bootstrap variance per
      param
    - `bootstrap_noise.log` — full stdout from the bootstrap run

## Ephemeral things (lost on restart)

  - All background processes (Monitor tasks, in-flight scripts) —
    none currently running at the time of this writing.
  - `/tmp/*` — generally lost. The CSV files have been copied to
    `~/w/omega/research/data/`. Scripts that read `/tmp/summary_averaged.csv`
    by default may need `--labels-csv research/data/summary_averaged.csv`
    after restart, or symlink restoration: `ln -s
    ~/w/omega/research/data/summary_averaged.csv /tmp/summary_averaged.csv`.

## Queued — work for next session

GPU authorized for research-grade work. Policy reframe based on
post-pause findings: **every target has 6-14× recoverable signal
headroom in log-space**, so feature engineering and model
expressiveness are now the dominant levers. The per-fold and LOFO
diagnostics give specific actionable targets.

Priority order:

1. **Multi-timestep features** (Tier 1, HIGHEST LEVERAGE).
   Add V_pre + V≈500 + V≈2000 feature snapshots to the regression
   corpus and rerun. The log-space bootstrap shows every target
   has +0.4 to +0.84 ceiling; the 23 single-timestep features
   reach 0.10-0.12. Multi-timestep is the firewall's first
   recommendation, the LOFO shows our load-bearing features
   (policy_entropy, score_stdev, raw_noresult) are themselves
   single-timestep proxies. Trajectory data is already in
   Postgres (mcts_packet table); just re-read at chosen V values
   and extract the same per_turn_features at each.

2. **Drop LOFO-actively-hurting features**. Two features had
   positive LOFO delta on scoreLead_drift|H (R² improved when
   removed):
   - `winrate_minus_raw` (Δ=+0.021)
   - `pv_visit_decay_ratio` (Δ=+0.009)
   Expected +0.03 R² for free. Experiment script:
   `experiment_drop_lofo_hurting.py` — runs at next-session
   start to verify the improvement generalises across targets,
   not just scoreLead|H.

3. **score_stdev quintile-bin as a feature**. The partition
   diagnostic showed Q1 vs Q5 R² varies by 0.4+ for scoreLead|H
   (+0.59 vs +0.15) and visit_entropy|H (+0.11 vs +0.37). Adding
   one-hot quintile-bin features lets LGBM exploit the
   nonlinear-by-stdev pattern directly. Or train per-quintile
   models and ensemble. ~30 min experiment.

4. **Retrain ResNet with line-433 fix** (CODE APPLIED, NOT YET
   TRAINED). Per-target population σ² replaces per-position
   y_range² normalization, removing the cancelling-components
   attractor. ~1-2 hr GPU. Now-substantive because the labels
   have substantial signal (no longer noise-bound).

5. **Pipeline validation for non-research-corpus positions**.
   The cards.db classifier validation showed our 23-feature
   discriminator doesn't generalize OOD. Two follow-ups:
   - Extend the volatile-card SGF set (cards.db has 2204 volatile
     cards total; we used 5). With more, AUC becomes meaningful.
   - The trajectory-based (H, κ) extraction works correctly at
     n_realizations=10; the n=3 noise was the original confound.
     If we want to validate against more cards, use n≥10.

6. **Identify fold-3 positions** of scoreLead_drift|H. The per-
   fold breakdown showed Fold 3 R²=-0.28 vs Fold 0 R²=+0.33.
   Identifying which 460 positions populate the worst fold
   would localize where the regression fails — possibly
   decade-correlated, era-correlated, or feature-distribution
   anomalies. ~10 min focused script.

7. **Read regression.py + curve_families.py +
   resnet_trajectory.py end-to-end audit** (~30 min) — verify
   no other unflushed-stdout / partial-write / silent-failure
   patterns. Per the long-running-scripts feedback memory.

8. **Task #15** (revise design note §4.5 — lossless-capture cost):
   pure documentation work, lowest priority.

## Standing constraints

- All long-running scripts (>1 min) must emit flushed progress.
  See `feedback_long_running_scripts_progress.md`.
- Cards.db semantics: position is LAST move of SGF; num_moves is
  sparring length. See `project_cards_db_semantics.md`.

## Constraints

  - **No GPU-bound data collection** (old GPU, user wants to
    monitor temperatures personally). ResNet *training* is OK
    because it's bursty and not the same load profile as
    continuous-collection MCTS.
  - **All long-running scripts must emit flushed progress** (see
    `~/.claude/projects/-home-bork-w-omega/memory/feedback_long_running_scripts_progress.md`).
    Banner at start with totals; progress every N items where N
    is chosen so first feedback lands within 60 s; elapsed + ETA
    in each line.
  - **Write incremental outputs** so a kill mid-run doesn't lose
    everything (the bootstrap script learned this; apply the
    pattern to anything new).

## To resume

  1. `cd ~/w/omega/research`
  2. `claude --continue`
  3. (If `/tmp/summary_averaged.csv` is gone) `ln -s
     ~/w/omega/research/data/summary_averaged.csv /tmp/summary_averaged.csv`
     — many scripts default to that path.

The transcript carries my full context. Don't over-explain on
resume; ask "where did we leave off and what's the queue?"
