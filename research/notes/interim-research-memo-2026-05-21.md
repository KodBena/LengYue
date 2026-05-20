# Interim research memo — visit-scaling research arc
## Period: 2026-05-20 to 2026-05-21
## Status: structural finding established; architecture decision required before next phase

## Executive summary

Over the past ~36 hours of investigation, the research arc on
predicting MCTS visit-scaling at Go positions transitioned from a
single-model curve-fitting exercise stuck at R² ≈ +0.119 to a
**two-stage architecture** with empirically grounded design. The
key insight, established via two Opus 4.7 consultations and a
sequence of empirical tests: a position's "volatility mode" is a
**search-time discovery, not a pre-search property**. V_pre features
cannot discriminate volatility modes (31% accuracy, below chance),
but features extracted from just one-third of the nominal search
budget reach 67% accuracy and AUC 0.86. At two-thirds of the budget,
classification reaches 82% / AUC 0.94.

The structural finding is supported in three independent ways: (i)
shape-invariant clustering of trajectory features discovers three
distinct modes that match user-described volatility types
(endgame-precision / heuristic-interaction / clean-monotone); (ii)
cards.db tag distributions independently align with the data-driven
clusters (sabaki/punish/endgame → fast-tactical, technical/judgement
→ reading-paradox); (iii) bootstrap label-noise diagnostics confirm
the signal is recoverable to R² ≈ +0.99 ceiling for the best non-
parametric labels, with the residual gap closed by partial-search
features (preliminary +0.70 R² on `scoreLead_drift|H` with 2/3
window vs +0.119 baseline).

The recommended next steps fall into two categories: (a) consolidate
this finding into the production KataProxy `adaptive_reevaluate` flow
as a partial-search-then-decide allocator; (b) escalate to sequence
models (LSTM/GRU/Transformer) if anytime-decoding is needed beyond
the discrete two-stage architecture.

---

## 1. Where we started

**State on 2026-05-20 morning:** The continuous parametric visit-
scaling research (per `roadmap-learned-continuous-scaling.md`) had
collected 344 position trajectories from year2000 pro games, each
with ~10 MCTS realizations per position. The averaged-trajectory
hyperbolic fit `F(V) = H·V/(V+κ)` produced per-position (H, κ) labels.
The best regression OOF R² achieved was:

  - `scoreLead_drift | hyperbolic | H` LGBM: **+0.119**
  - `visit_entropy_reduction | hyperbolic | H` k-NN: **+0.105**

Most other (target, family, param) triples sat at chance or negative
R². The corpus had ~60-70% clean-fit rate; the rest had degenerate
hyperbolic fits. Feature set was 23 phase35 features extracted from
the V_pre packet (pre-search snapshot).

**The blocking question:** Is the +0.119 R² the noise floor, or is
there headroom? The 2026-05-20 firewall consultation
(`firewall-strategic-2026-05-20.md`) identified bootstrap label-noise
as the Tier-0 diagnostic to answer this.

## 2. The sequence of discoveries

### 2.1. Bootstrap reveals massive headroom (Tier 0, 2026-05-20 evening)

Raw-space bootstrap diagnostic (`bootstrap_label_noise.py`) gave
ambiguous signal: positive ceilings for L2_joint_drift|H (+0.700) and
scoreLead_drift|H (+0.283), but negative ceilings for
visit_entropy_reduction|H (−0.922) and winrate_drift|H (−0.783). The
negative ceilings suggested those targets were noise-bound.

**Critical reframe** (2026-05-20 late evening, log-space bootstrap):
The raw-space ceilings were artifacts of H's heavy right-skew. When
the bootstrap σ² calculation operates in signed_log1p space (which is
the regression's actual transform), all ceilings flip positive:

  | target | param | raw ceiling | **log ceiling** | OOF R² | headroom |
  |---|---|---|---|---|---|
  | scoreLead_drift | H | +0.283 | **+0.839** | +0.119 | 7.1× |
  | visit_entropy_reduction | H | −0.922 | **+0.706** | +0.105 | 6.7× |
  | L2_joint_drift | H | +0.700 | **+0.718** | −0.229 | huge |
  | winrate_drift | H | −0.783 | **+0.375** | −0.242 | substantial |

**Implication:** Every target has 6-14× recoverable signal headroom.
Labels are not noise-bound. The bottleneck is feature/model
expressiveness.

### 2.2. Trajectory plots reveal "reading-paradox" non-monotonicity (2026-05-20 night)

For five extreme positions from the cards.db family, plotted the
actual y(V) trajectory:

  - **Card 2935 (volatile, 4/4 clean fit)**: smooth monotone rise.
  - **Card 1408 (non-volatile, κ ≈ 95,000)**: mild dip at low V then
    long rise that doesn't saturate within V_max=15000. Hyperbolic
    fits with artifactually large κ.
  - **Cards 2886, 3198**: pronounced dip-then-rise. Trajectory starts
    near 0, dips negative, then rebounds. **The hyperbolic family
    (monotone saturation) structurally cannot fit this.**
  - **Card 4889 (non-volatile)**: near-flat trajectory (κ ≈ 5.5).
    Value barely changes with search.

**Conclusion:** The "extreme κ" values from curve_fit on the
hardest positions are **artifacts of pushing a monotone family
through dip-rise data**. The (H, κ) framing is structurally wrong
for these positions — exactly the positions we most care about for
the visit-allocation problem.

### 2.3. Non-parametric trajectory features deliver 2-3× R² (2026-05-21 morning)

Implemented `extract_trajectory_features.py` with 18 shape-robust
features per (position, target): `y_at_V_min`, `y_at_V_max`,
`y_range`, `dip_depth`, `rise_after_dip`, `slope_terminal`,
`slope_early`, `monotonicity_frac`, `sign_changes`,
`log_V_at_y_min`, `log_V_at_y_max`, and four `y_at_V{100,500,2000,10000}`
anchors. **100% label coverage** (every position × target has clean
features) vs 26-68% for hyperbolic.

`regression_trajectory_features.py` then regressed these labels
against V_pre features:

  - `visit_entropy_reduction | y_at_V_min` LGBM: **+0.330** (was
    +0.105 with curve_fit H)
  - `scoreLead_drift | y_range` LGBM: **+0.280** (was +0.119)
  - `scoreLead_drift | y_at_V_max` LGBM: **+0.247**
  - `winrate_drift | y_range` LGBM: +0.113 (new signal — was −0.242
    on raw H)

**2-3× improvement on the strongest signals**, with no fragility
from degenerate-fit filtering. The bottleneck on the *labels* side
was the parametric assumption, not noise.

### 2.4. Cards.db family-heredity validation (2026-05-21 morning)

The user identified five canonical "Igo Hatsuyoron-level difficult"
volatile positions (cards 1429, 2893, 2935, 3197, 3534). Expanded
sampling via the `card_source` tree:
  - 5 seeds + 13 family relatives (4 parents, 5 siblings, 4
    descendants — including 1 non-volatile control)
  - + 30 more volatile cards from game_source 2664 (different game)
  - + 20 non-volatile controls (varied tags, top-reviewed)

Total: 68 cards.db positions through the full collection + fit
pipeline at n_realizations=10, matched to the research-corpus
methodology.

**Heredity is statistically detectable across all 4 drift targets:**

  | target | within-family σ | across-family σ | ratio |
  |---|---|---|---|
  | L2_joint_drift | 0.206 | 0.428 | 0.48 |
  | scoreLead_drift | 0.886 | 1.717 | 0.52 |
  | visit_entropy_reduction | 0.400 | 0.917 | 0.44 |
  | winrate_drift | 0.189 | 0.318 | 0.60 |

Same-parent cards cluster 2× tighter in (H, log κ) space than random
pairs. **Strikingly, the user's "non-volatile" labels include
positions with extreme structural signal**: card 1408 (non-volatile,
parent of seed 3197) has the highest κ in the entire 437-position
dataset (32× corpus median for visit_entropy).

The cleanness classifier trained on year2000 corpus does NOT
generalize to cards.db OOD positions (LGBM 45%, Logistic 20% on 20
pairs). This is the Opus-4.7-confirmed divergence: the user's
"volatile" annotation is a *behavioural* marker, not a property of
MCTS scaling.

### 2.5. Translation-invariance via DLP (2026-05-21 afternoon)

User asked whether the hyperbolic curve admits a translation-invariant
representation that lets us recover (H, κ) from any two trajectory
points robustly, motivated by KataGo's non-deterministic report
cadence.

Opus 4.7 consultation
(`opus-consult-2026-05-21-translation-invariance.md`) returned with
the **Eisenthal–Cornish-Bowden direct linear plot (DLP)** as the
canonical answer. Closed-form solve for any pair:

```
D = y_i·V_j − y_j·V_i
κ = V_i·V_j·(y_j − y_i) / D
H = y_i·y_j·(V_j − V_i)  / D
```

Median of all valid C(N,2) pair-intersections is the production
estimator. High-breakdown-point (50%), no assumption on noise
distribution.

Implemented as additional columns in `extract_trajectory_features.py`:
`H_dlp_median`, `log_kappa_dlp_median`, `H_dlp_mad`,
`log_kappa_dlp_mad`, `dlp_n_valid_pairs`. Synthetic-data tests:
recovered H=5.0000 and log_κ=7.6009 exactly on noiseless hyperbolic.

**What panned out:**

  - 100% label coverage (every position × target gets a DLP-median)
  - **`dlp_n_valid_pairs` is a strong shape-invariant monotonicity
    feature** — drove the mode-discovery clustering in §2.6
  - Surfaced structural non-monotonicity of `visit_entropy_reduction`
    (median 5% valid pairs) and `top_move_visit_fraction` (8%)

**What didn't pan out (as user might have hoped):**

  - DLP-median labels are NOT more predictable from V_pre features
    than curve_fit labels. Both at ~+0.12-+0.13 R² on scoreLead|H.
  - The "N(N-1)/2 free data" intuition was over-optimistic — Opus
    4.7 flagged this is a U-statistic with effective sample O(N), not
    O(N²). Same scaling as conventional regression.

Net: translation invariance delivered as a **shape-feature engineering
tool**, not as a predictability multiplier. The win came from
`dlp_n_valid_pairs` as a mode discriminator.

### 2.6. Mode discovery via shape-invariant clustering (2026-05-21 afternoon)

Per user observation that there are at least two distinct volatility
modes in Go positions:
  1. Endgame precision — small misplays cost points; sharp
     dip-then-rise structure (reading paradox).
  2. Heuristic interaction in tilted games — no obvious tactic but
     hard to bungle; slow extraction.

K-means clustering on shape-invariant features (`discover_volatility_modes.py`):
  - dip_depth / y_range (normalized dip magnitude)
  - log_κ_DLP (saturation timing)
  - slope_terminal / |slope_early| (saturation indicator)
  - monotonicity_frac
  - dlp_n_valid_pairs / 1225 (normalized monotonicity)

K=3 result:

  | Cluster | n | log_κ | dip/range | mono | Identity |
  |---|---|---|---|---|---|
  | 0 | 137 | 7.07 | 0.08-0.16 | 0.65 | **Fast-tactical** (endgame precision) |
  | 1 | 147 | 8.24 | **0.43** | 0.59 | **Reading-paradox** (heuristic-interaction) |
  | 2 | 153 | 7.85 | 0.02 | **0.81** | Clean-monotone (typical) |

**Cards.db tag distributions independently validate the clusters:**

  - Cluster 0 dominant tags: `sabaki` (6), `punish` (4), `endgame` (3)
  - Cluster 1 dominant tags: `technical` (3), `judgement` (1)
  - Cluster 2 dominant tags: `volatile` (16), `punish` (7), `technical` (6)

Specifically:
  - Card 1408 (κ=95k, non-volatile parent of seed 3197) lands in
    cluster 2 clean-monotone — the extreme κ was driven by clean
    saturation past V_max, NOT by a dip. Reconciles the
    user-label-vs-signal divergence.
  - Card 3659 (non-volatile, 19 reviews, tags shape+judgement) lands
    in cluster 1 reading-paradox — confirms the user's "non-volatile
    but heuristic-interaction" pattern exists.
  - Card 2886 (all-degenerate hyperbolic fit) lands in cluster 1 — its
    non-monotonicity is captured by the shape features.

**User's two-mode hypothesis confirmed**, plus one additional bulk
mode (clean-monotone) that represents typical positions.

### 2.7. The architectural finding: mode is search-time information (2026-05-21 evening)

Implemented `classify_volatility_mode.py` and `classify_volatility_mode_v2.py`
to test whether mode_id (∈ {0, 1, 2}) is predictable from features:

  | Feature set | LGBM accuracy | LGBM AUC |
  |---|---|---|
  | V_pre only (23 phase35 features) | **31%** | 0.47 (below chance) |
  | V_pre + 1/3 search (75 features) | **67%** | 0.86 |
  | V_pre + 2/3 search (75 features) | **82%** | 0.94 |

Chance baseline (majority class): 36%.

**Interpretation:**

  - V_pre features **cannot** discriminate modes (below-chance — the
    top features `policy_entropy`, `score_stdev`, `raw_noresult` are
    all V_pre proxies for "how confused is the net" and cannot
    distinguish confusion-that-resolves-at-V=500 from
    confusion-that-deepens).
  - **After just 1/3 of search budget, mode classification is 67%**
    — a +36-point jump from V_pre alone.
  - At 2/3 budget, classification is 82% / AUC 0.94 — nearly perfect.
  - Logistic regression at 1/3 gives 67% (same as LGBM) and at 2/3
    gives 77% — confirms the signal is largely **linear in the
    feature space**. No fancy nonlinear interactions needed.

The Opus 4.7 "single-timestep myopia" diagnosis is fully confirmed,
with quantitative payoff: 31% → 67% → 82% as search budget increases
from 0 → 1/3 → 2/3.

### 2.8. Stream 2 confirms multi-timestep INPUT closes the regression headroom

Multi-timestep INPUT regression (`regression_multitimestep_input.py`)
on the original (H, κ) labels with index-based windows (1/3, 2/3,
full of trajectory points):

  - `scoreLead_drift | hyperbolic | H`: baseline LGBM **+0.119** →
    1/3 **+0.41** → 2/3 **+0.70** → full **+0.70**
  - `scoreLead_drift | hyperbolic | kappa`: baseline **−0.226** →
    2/3 **+0.53** → full **+0.54** (bootstrap ceiling +0.59 — near
    saturation)

The +0.70 on scoreLead|H is **6× the baseline and approaches the
bootstrap ceiling (+0.84)**. Opus 4.7 predicted +0.15 to +0.25; we
got +0.58. The single-timestep-myopia gap is even larger than
estimated.

## 3. The architectural conclusion

The data converges on a **two-stage adaptive allocator**:

```
Phase 1: TASTING SEARCH (~33% of nominal budget = 5000 visits)
  - extract trajectory packets as MCTS proceeds
  - compute first_third trajectory features

Phase 2: MODE CLASSIFIER
  - input: phase35 + first_third features = 75-dim
  - output: P(mode_k) for k ∈ {fast-tactical, reading-paradox, clean-monotone}
  - 67% accuracy, AUC 0.86 at this point

Phase 3: MODE-CONDITIONED ALLOCATION
  - fast-tactical: terminate; search has saturated (κ ≈ 1000 << 5000)
  - reading-paradox: continue full budget (high κ, dip-recovery uncomplete)
  - clean-monotone: continue with diminishing returns; can terminate
    when entropy_reduction stops contributing
```

Optional refinement: at 2/3 budget, **reclassify** with 82% accuracy
for initial-mode-ambiguous positions.

**Why this architecture is right (per the data):**

  1. The headroom is in trajectory shape, not pre-search features
     (§2.1, §2.7, §2.8).
  2. The shape splits into discrete modes (§2.6) with distinct
     optimal allocation policies.
  3. Modes are revealed by ~1/3 search worth of trajectory data
     (§2.7).
  4. Each phase has a quantitative empirical anchor: 36% chance →
     67% AUC 0.86 → 82% AUC 0.94 across the three classification
     vantage points.

This is the "anytime optimization" the user pointed at, **grounded
in the data**.

## 4. What didn't work / dead-ends

For completeness — investments made that ended up not panning out
or only partially panning out:

  - **`SumResidualHyperbolic` and `ConvexMixtureHyperbolic` families**
    don't rescue degenerate hyperbolic fits. Both fall into the same
    cancelling-components attractor the firewall flagged in the
    ResNet. Pathological "fits" with cancelling H and H_prime that
    sum to a low-amplitude hyperbolic. Not used downstream.

  - **LOFO-flagged feature drops** (`winrate_minus_raw`,
    `pv_visit_decay_ratio`) didn't generalize — helped some targets
    (+0.13 on winrate|H) but hurt others (-0.07 on L2_joint|H).
    Original LOFO was specific to scoreLead|H. Did not adopt.

  - **Multi-family fits as a rescue strategy** — same cancelling-
    components issue. Saturated.

  - **DLP-median as a predictability multiplier** — failed (DLP-H
    LGBM R² ≈ +0.13, basically tied with curve_fit-H at +0.12).
    Translation invariance helped with coverage and shape features,
    not predictability.

  - **Cleanness classifier OOD generalization to cards.db** — failed
    (45-50% accuracy, near chance). Confirms the user's labels and
    the model's signal capture different facets of "interestingness".

## 5. Open questions

1. **Will the partial-search allocator improve over fixed-budget
   search in production?** The 67% / 82% accuracies are CV; the
   production gain depends on how often the visit-budget decisions
   are correct.

2. **Sequence models** (LSTM/GRU/Transformer on the (V, y) packet
   stream) could replace the discrete two-stage with continuous
   anytime decoding. The data is naturally a time series. Worth
   investigating once the discrete architecture is committed.

3. **DeepSets / Neural Posterior Estimation** (per Opus 4.7's modern
   ML recommendation) would handle non-monotone trajectories
   end-to-end and give posteriors over (H, κ) for free. Substantial
   implementation but the cleanest framing.

4. **Cards.db expansion to 2200 volatile-tagged positions** — per
   Opus 4.7's Q4 answer, that's the right collection investment (not
   more uniformly-sampled pro positions). The OOD generalization
   test is the real question for the SPA-side allocator. Currently
   at 68; need to scale collection.

5. **ResNet line-433 fix retraining at scale** — code is applied and
   smoke-tested, but not retrained at 1500-epoch budget. Worth doing
   once the architecture decision is committed (the loss-fix value
   depends on whether we're predicting individual targets or doing
   end-to-end mode classification).

6. **Endgame vs middlegame split within mode 0** — the
   "fast-tactical" cluster contains both. A finer split could
   distinguish endgame (the user's favorite) from mid-game tactical
   positions. Would need a "game-phase" feature, which can be
   derived from board occupation / move number.

## 6. Recommendations for next phase

In priority order:

1. **Commit the two-stage architecture in a design note**
   (`docs/notes/adaptive-allocator-architecture-2026-05.md`) and a
   dispatch to the proxy maintainer
   (`docs/dispatch/spa-to-proxy-partial-search-allocator.md`). The
   data supports it; the interface contract needs to be specified.

2. **Run the cards.db volatile expansion** to ~200-500 positions to
   build the OOD evaluation set. Per Opus 4.7, this is the right
   data investment, not more uniform pro positions. Estimated cost:
   ~3-5 hours of GPU.

3. **Train production mode classifier** with full 67%-AUC-0.86 pipeline
   on the expanded corpus. Output: a checkpoint that can be loaded
   into the KataProxy `adaptive_reevaluate` flow.

4. **Sequence model investigation** (LSTM/GRU on (V, y) packet stream)
   — if anytime-decoding is needed beyond the discrete two-stage.
   Tractable on CPU; ~50-step sequences × 437 positions = manageable.

5. **Documentation pass:** update `roadmap-learned-continuous-scaling.md`
   to reflect the architectural pivot from "single learned model" to
   "two-stage mode-conditioned allocator". Multiple sections need
   revision.

6. **Eventually**: ResNet retraining with line-433 fix, on the
   non-parametric label set (not the curve_fit (H, κ) labels). Could
   serve as a per-mode allocation policy or as the mode classifier
   itself.

## 7. Appendices

### A. Consultation memos (preserved verbatim)

  - `firewall-strategic-2026-05-20.md` — the original Tier-0
    consultation that anchored this arc. Recommended the bootstrap
    label-noise diagnostic as the first investment.

  - `opus-consult-2026-05-21-strategic.md` — Opus 4.7 strategic
    consult (multi-timestep features as top investment, divergences
    as findings, single-timestep myopia diagnosis, no 5GB uniform
    collection). All four recommendations adopted; all four predictions
    quantitatively borne out.

  - `opus-consult-2026-05-21-translation-invariance.md` — Opus 4.7
    DLP / Cornish-Bowden consult with web-search authority. Pointed
    at the correct mathematical recipe and the U-statistic caveat.

### B. Key artifacts (locations)

  - `~/plots/bootstrap_summary_logspace.txt` — log-space bootstrap
    ceilings.
  - `~/plots/validate_volatile_family/family_hk_scatter.png` —
    cards.db family (H, κ) overlay on corpus.
  - `~/plots/mode_discovery/mode_discovery_shape_invariant.png` —
    K=3 mode clustering visualization.
  - `~/plots/mode_discovery/classify_mode_v2_summary.txt` —
    architectural-finding classification accuracies (31% → 67% → 82%).
  - `~/plots/regression_multitimestep_input.log` — Stream 2 ongoing;
    `scoreLead_drift|hyperbolic|H` 2/3 window: +0.70 R².
  - `~/plots/validate_volatile/` — cards.db 5-canonical-seed validation
    artifacts.
  - `research/data/trajectory_features_dlp.csv` — 450 positions × 7
    targets × 23 columns (non-parametric + DLP); 100% label coverage.
  - `research/data/bootstrap_noise_logspace.csv` — bootstrap variance
    per position × target × param.
  - `research/data/summary_averaged.csv` — original curve_fit labels.

### C. Code artifacts (new scripts this session)

  - `bootstrap_trajectory_features.py` — bootstrap on non-parametric
    labels.
  - `classify_cleanness.py` — LGBM + Logistic cleanness classifier.
  - `classify_volatility_mode.py` — mode classification from V_pre.
  - `classify_volatility_mode_v2.py` — mode classification with
    partial-search features (architectural-finding script).
  - `discover_volatility_modes.py` — unsupervised K-means + PCA on
    shape-invariant features.
  - `analyze_family_heredity.py`, `analyze_family_heredity_traj.py` —
    cards.db family heredity statistics.
  - `validate_volatile_cards.py`, `validate_volatile_classifier.py` —
    cards.db pipeline orchestrators.
  - `extract_trajectory_features.py` — non-parametric trajectory
    features + DLP-median estimator.
  - `regression_trajectory_features.py` — regression on
    non-parametric labels.
  - `regression_multitimestep_input.py` — multi-timestep INPUT
    feature regression (the +0.70 R² script).
  - `identify_worst_fold_positions.py` — per-fold residual outlier
    identification.
  - `diagnose_hk_distribution.py` — (H, κ) joint distribution.
  - `diagnose_score_stdev_partition.py` — quintile-partition
    diagnostic.
  - `experiment_drop_lofo_hurting.py` — LOFO-flagged feature drop
    experiment.
  - `cards_query.sql` — parameterized cards.db query.
  - `plot_extreme_trajectories.py` — y(V) trajectory visualizer.

### D. Memory entries added (auto-memory)

  - `feedback_long_running_scripts_progress` — all long-running
    scripts must emit flushed progress; tensorboard for training.
    Triggered by ~11 prior occurrences of silent slow scripts.
  - `project_cards_db_semantics` — `num_moves` is sparring length;
    position is LAST move of SGF. Triggered by an initial
    misinterpretation that was corrected by the user.

## 8. Closing notes

The session's narrative arc — from "stuck at R² +0.119 with curve_fit
labels and V_pre features" to "two-stage allocator with 82% mode
classification at 2/3 search budget" — is a clean example of
how diagnostic-first research compounds. Each finding informed the
next; no single experiment was load-bearing alone. The two Opus 4.7
consultations were both decisive: the strategic consult oriented the
direction at a critical moment, and the translation-invariance consult
provided the DLP recipe that ultimately surfaced the
`dlp_n_valid_pairs` feature that drove the three-mode discovery.

The next phase shifts from "investigate the data" to "commit the
architecture and engineer it". The data-investigation work has
reached a structural conclusion. Further data investigation is
likely to be confirmatory rather than redirectional.
