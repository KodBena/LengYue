# Strategic firewall consultation — 2026-05-20

Independent-opinion pass on the visit-scaling research arc, asking
qualitative direction-setting rather than per-decision critique. The
arc state at the time of consultation:

- 392 positions, 3890 complete realizations, 10 GB Postgres corpus.
- Stage 1 sanity, Stage 2 expansion, refactor to pluggable parametric
  families, and the diagnostic of the first positive R² had all
  landed; the question was where to invest next.
- Two positive R² results: `scoreLead_drift|hyperbolic|H` LGBM OOF
  R²=+0.119 (n=2320), `visit_entropy_reduction|hyperbolic|H` k-NN OOF
  R²=+0.105 (n=880). All κ predictions negative across the board.

This document carries:
1. The brief sent to the firewall (verbatim).
2. The firewall's response (verbatim).
3. My distillation of actionable recommendations with pointers back
   to the supporting passages in (2).

Filing this under `research/notes/` so it can be referenced
historically — once we act on any of these recommendations, the
supporting reasoning should be findable here.

---

## 1. The brief sent to the firewall

(verbatim; sent via the Agent tool with subagent_type=general-purpose,
model=opus)

> You're being asked for an independent strategic opinion. Brief is self-contained; you can read referenced files if you want depth.
>
> This isn't a critique pass (though independent critique where warranted is welcome). The user wants **qualitative guidance** on where the research arc should go next to get "stable ground under our feet" — how to allocate limited compute and time to get the modeling on solid footing, what theoretically can be expected at this scale, and reactions to several specific directions they're considering.
>
> ## Setting
>
> We're building a visit-scaling predictor for adaptive-deepening MCTS-Go analysis (full design note at `/home/bork/w/omega/proxy/docs/roadmap-learned-continuous-scaling.md`, ~800 lines). The architecture goal is: a per-turn predictor that maps position features to a continuous "information-extraction curve" `F(V; θ)`, used downstream in an EIG-decomposition allocator. We've implemented a multi-target panel (4 candidate `value(V)` definitions: `visit_entropy_reduction`, `winrate_drift`, `scoreLead_drift`, `L2_joint_drift`) and three parametric families for F: pure `hyperbolic` (H·V/(V+κ)), `sum_residual_hyperbolic` (two hyperbolics, second sign-flexible), `convex_mixture_hyperbolic` (gated mixture).
>
> Per-position data collection pipeline: ~10 independent MCTS realizations per position on a small KataGo network (b10c128) at `maxVisits=15000`, `reportDuringSearchEvery=0.02s`. Each realization produces ~50-800 sample packets, each containing the full lossless KataGo response (rootInfo with 18 fields, moveInfos with 20 fields per move, full 362-element policy prior, full 361-element ownership map). All stored durably in Postgres (`mcts_packet` table, BYTEA pickle blobs).
>
> Current corpus: **392 positions, 3890 complete realizations, 10 GB Postgres on `192.168.122.1`**, stratified by decade across `~/benchmark_sgfs/` and `~/sgf_validation/`. Sampling is uniform-over-positions within decade; 2 SGFs auto-marked poison after KataGo input-validation errors.
>
> ## Empirical state
>
> **Curve-fit step.** For each position, `value(V)` is computed per the 4 candidate definitions on the trajectory; for each `(position, target, family)` we curve_fit the parametric form and tag the result `clean` (fit residuals + monotonicity criteria pass) or `degenerate`. On 344 positions (averaged trajectories):
>
> | target | hyperbolic clean% | sum_residual_hyperbolic clean% | convex_mixture_hyperbolic clean% |
> |---|---|---|---|
> | visit_entropy_reduction | 25.6 | 76.7 | 71.8 |
> | winrate_drift | 64.8 | 54.7 | 46.5 |
> | scoreLead_drift | 67.4 | 55.2 | 48.3 |
> | L2_joint_drift | 68.3 | 55.2 | 45.9 |
>
> Sum-residual unlocks visit_entropy (its non-monotonicity at small V is the diagnosed cause); plain hyperbolic dominates on the value-head-derived targets.
>
> **Regression step.** Features = the Phase-3.5 23-feature extractor on the V_pre packet (first emission, V ≈ 80). Code at `research/feature_extraction.py`; feature names listed in `research/regression.py`. Three regressors run in parallel: k-NN (k=3, distance-weighted), Ridge (RidgeCV α-tuned), LightGBM (regularized — num_leaves=15, min_data=5, lambda_l2=0.1). Target is `signed_log1p(param_value)`. CV is GroupKFold (5-fold) by position so realizations of the same position never split across train/test.
>
> Sample expansion: averaged-trajectory labels (one per position per target/family) are replicated across all 10 of the position's realizations' feature vectors (n≈2300-2700 per regression).
>
> **Results on 344 positions:**
>
> Most (target, family, param) combinations: R² < 0. **Two positive R² results:**
>
> 1. `scoreLead_drift | hyperbolic | H` → LGBM OOF R² = **+0.119**, n=2320. Per-fold R² spans -0.28 to +0.33 (median +0.14). Top features by gain: `score_stdev`, `policy_entropy`, `score_lead_minus_raw`, `raw_noresult`, `raw_lead`, `score_lead`, `raw_winrate`, `score_gap_top1_top2`. Leave-one-feature-out: 13 features have ΔR² < -0.01; max single-feature ΔR² = -0.072 (`policy_entropy`); no single feature dominates.
>
> 2. `visit_entropy_reduction | hyperbolic | H` → k-NN OOF R² = **+0.105**, n=880.
>
> Both signals are on the asymptote H, not the timescale κ. κ predictions have been uniformly negative R².
>
> **Earlier failed approach:** Flat-ResNet trajectory predictor (`research/resnet_trajectory.py`). Per-target shared trunk → N residual blocks each producing `(H_i, κ_i)`, prediction `y(V) = Σᵢ H_i V/(V+κ_i)`. Train losses descend but val R² stays catastrophically negative; the model converges to a "predict the mean via cancelling components" attractor under normalized MSE loss.
>
> ## The questions
>
> The user is explicit that they want qualitative direction, not a trichotomy of pre-cooked options.
>
> 1. **Resource allocation across the remaining knobs.** Compute is limited (one consumer-grade machine; b10c128 collector; CPU-only PyTorch). Big knobs: more positions (current 392, could go to a few thousand); better features (we capture full per-packet streams but only use 23 V_pre-derived scalars — ownership and policy arrays barely touched, no trajectory-shape features); different architectures; different parametric families. Which directions move the needle, which don't?
>
> 2. **Theoretical bound on R².** At our setup, is there a defensible upper bound on what R² we should expect? When is R²=+0.12 "the model is failing" vs "the model is reaching the irreducible noise floor"?
>
> 3. **Position classification + per-class regressors.** Idea: classify positions into types (e.g., settled, tactical, obvious-move + late-exploration) and train per-class regressors. Tractable? How to define classes — hand-labels, unsupervised clustering, behavior-derived from curve shape? Risks?
>
> 4. **Multi-timestep input framing.** Right now features come from V_pre alone (V≈80, before meaningful search). We have the full per-realization packet stream — features at any V we want, for free. Would it help to feed V_pre AND V_intermediate (V=500, V=2000), so the predictor sees "where search is going" not just "where it starts"? Tradeoffs vs the cleaner "predict from t=0 features" framing for the eventual SPA-side use case?
>
> 5. **Feature engineering.** What features are most likely underrepresented in the 23-feature set? Policy distribution shape beyond entropy? Ownership-derived (areas of high uncertainty, corner imbalances)? Position-structural (stone count, territory estimates from ownership, life/death candidates)?
>
> 6. **Inputs / outputs we may have wrong at the framing level.** Anything more fundamentally off about the problem setup — what we're targeting, what we're conditioning on, how the (value, family, param) panel is structured, MCTS-aggregated vs raw NN outputs?
>
> ## What would be most useful
>
> - **A framework** for thinking about where the work goes next, with named heuristics if you have them ("at this R²/N regime, the dominant axis is usually X").
> - **Theoretical references** if you know any — work on predicting MCTS curve shapes from position features, or analogous problems in other domains, that would help calibrate expectations.
> - **Specific concrete suggestions** prioritized by expected impact-per-effort, as options to consider not a closed checklist.
> - **What you'd want to know but can't tell from this brief.** If key information is missing, naming it is more valuable than guessing.
>
> Length: match the substance. Don't pad. The user has been reading carefully and will catch over-claims; if you're not sure, hedge audibly.

---

## 2. The firewall's response

(verbatim)

> Confirmed: line 433, `term = ((y_pred - y_t) ** 2).mean() / (y_range ** 2)` — that's per-position normalisation. The user described it as "predict the mean via cancelling components" — exactly the failure mode this normalisation enables. With absolute-unit MSE, predicting the population mean is bounded by variance-of-H across positions, but normalising by per-position range eliminates that disincentive for the cancel-out solution. **That's a specific concrete fix I can name.**
>
> Now I have everything. Writing the response.
>
> ---
>
> ## Framework first
>
> At your current state — 392 positions, ~10 realizations each, 23 features at V_pre, +0.12 R² on the two best (target, family, param) combinations — you are in the regime where the dominant uncertainty is **not whether your model can extract signal** but **how much signal there is to extract**. That distinction governs almost every allocation question below, and it's the diagnostic gap I want to flag first.
>
> The decomposition that pins this down:
>
> ```
> Var(H_label_per_position) = Var(H_true_per_position) + Var(H_estimation_error | position)
> ```
>
> Your label is the curve_fit on a 10-realization average. The label noise has a known generative process — fit per realization, look at the spread of (H, κ) across the 10. R² on the label is bounded above by the ratio of true-signal variance to label variance. **You appear not to have measured this.** I grepped for "bootstrap" and "within-position" across the research tree and got no hits. This is the single highest-priority diagnostic in your set, and it determines whether +0.12 is the noise floor or there's a 10x headroom.
>
> Concretely: bootstrap (H, κ) per position by refitting on resamples of its 10 realizations. Compute `σ_within(H) / σ_across(H)` per target. If that ratio is, say, 0.3, then variance-of-true-H is 0.91 of variance-of-label-H and your R² ceiling is around 0.91. If it's 0.7, variance-of-true is 0.51 and the ceiling is around 0.51 — your +0.12 would mean you've captured ~25% of available signal, not 12% of total variance. Either reading reshapes everything downstream.
>
> The framework I'd apply throughout: at this N/R² regime, **the limiting axis is one of three** — label noise, feature inadequacy, or genuine irreducibility — and you can't pick the right next move without knowing which. Q2 asks this directly; the others are conditional on the answer.
>
> ---
>
> ## On your specific questions
>
> ### Q1 — Resource allocation
>
> The knobs ranked by my prior on impact-per-effort, *contingent on the label-noise diagnostic above*:
>
> 1. **Bootstrap the label noise first (one-day effort).** If labels are noisy, more positions is wasted spend until labels are tightened. If labels are clean, features are the bottleneck.
>
> 2. **More features (high impact, low effort).** You are leaving the most information-dense part of each packet on the table. Ownership map (361 floats per packet) and full policy (362 floats) are the two largest objects KataGo emits, and your extractor uses neither beyond the top-5 moves' priors and a Shannon entropy on the entire policy vector. The 23-scalar extractor is shaped for production inference, not for learning — at the research stage it's a self-imposed bottleneck. More on shape in Q5.
>
> 3. **More positions (medium impact, high effort).** At 23-ish features and ~400 positions you have ~17 samples/feature for Ridge, marginal for LGBM. Doubling positions to 800 helps LGBM more than Ridge; quadrupling to 1600 helps the eventual deeper-feature model materially. But this is a multiplicative cost on collection time and only justified once labels and features are sorted.
>
> 4. **Different architecture / parametric family (low priority for now).** Your two-stage pipeline is fine as a signal-detection scaffold. The flat-ResNet failure I'll address in Q6 — there's a specific concrete fix that's worth one more pass, but switching architectures wholesale at +0.12 R² isn't where the leverage is.
>
> 5. **Different parametric family (deferred).** The hyperbolic-H signal is real and the clean% table shows the form is fitting most positions. A three-parameter form might raise per-position fit residual quality marginally without changing the regression story; this is the last knob to spend on.
>
> The order matters: features are downstream of label noise (if labels are too noisy, adding features just gives the model more ways to fit noise). Positions are downstream of both.
>
> ### Q2 — Theoretical bound on R²
>
> I can give you the framework but not a number. The honest read at +0.12 with the diagnostics you have is:
>
> - **It is not obviously the noise floor.** Median fold R² of +0.14 with spread -0.28 to +0.33 across folds is consistent with "real underlying signal, regressor with not enough data to stably exploit it." A model that had reached the noise floor would show low spread around its plateau.
> - **It is not obviously far from the noise floor either.** If per-realization MCTS noise is σ/range ≈ 0.25 on visit-entropy and >1.0 on value-head metrics (your Stage-1 finding) and ten realizations leaves σ_position ≈ σ_real / √10, the propagated noise on the *fitted* (H, κ) depends on how (H, κ) absorbs trajectory shape vs. noise. The 10× averaging helps but isn't necessarily enough — curve_fit's H estimate is dominated by late-V points (where σ is small relative to value), but its κ estimate is dominated by early-V curvature (where σ is large relative to value-changes-from-V=80). **This predicts H more learnable than κ, which matches your "all κ R² negative" finding.**
>
> If I had to guess a likely upper bound *before* the bootstrap: R² ≈ 0.3 to 0.5 on H, R² ≈ 0.05 to 0.2 on κ, with the H side limited mainly by feature inadequacy and the κ side limited by both feature inadequacy and label noise. I want to be loud that this is a prior, not a calibrated estimate. The bootstrap will tighten it.
>
> Theoretical references I'd want you to look at if you don't already know them:
>
> - **Sample-complexity bounds for kernel regression** on smooth targets (Caponnetto-DeVito, "Optimal rates for the regularized least squares algorithm", 2007 — classical reference, "rate-optimal" risk bounds as N → ∞ for L²-bounded targets). The shape says R² → 1 as N → ∞ for fixed-dim feature spaces with bounded signal, but the convergence rate is N^(-2s/(2s+d)) where s is target smoothness and d is effective feature dimension. At d ≈ 23 and N = 400, you're in the regime where the rate is slow enough that doubling N moves R² by single-digit percentage points unless s (target smoothness) is high.
>
> - **Adaptive computation prediction** as a literature: this problem has a direct analog in **anytime algorithm performance prediction**, e.g. Hutter et al.'s "Algorithm runtime prediction" survey (CACM 2014), which predicts the curve-shape of SAT solvers from instance features. Same shape: per-instance saturating-curve fit, features → curve parameters, R² in the 0.2-0.6 range with hundreds of features and thousands of instances. Their experience says **feature engineering is what gets you to the high end of that range, not architecture**.
>
> - **For MCTS specifically:** I'm not aware of published work on predicting MCTS scaling curves from position features. KataGo's published material focuses on the network's own value prediction, not on its search's scaling rate. This is an under-explored corner. The most relevant adjacency is AlphaZero's analysis of "Elo per visit" curves across positions in Anthony et al. ("Thinking Fast and Slow with Deep Learning and Tree Search", 2017) and the Lc0 community's empirical observations on visit-doubling curves — but neither attempts to predict the curve from position features.
>
> The fact that I can't find a precedent is mildly informative: if it were easy, someone would have published. That's not evidence it's impossible at your scale; it's a hint that your bound is realistic-and-modest, not high.
>
> ### Q3 — Position classification
>
> I'd push back on hard partitioning at your N. Reasoning:
>
> - 392 positions across, plausibly, 5-8 natural classes is 50-80 positions per class. That's below the threshold where a separate regressor per class learns anything that a single regressor with class-as-feature wouldn't learn for free.
> - "Class as feature" is the right inclusion form anyway: if a Phase-of-game indicator (opening/middle/endgame) helps, you want a single model that can use it conditionally, not three models that can't transfer signal across.
> - The unsupervised-cluster approach (clustering features, training per-cluster) compounds the problem: you're estimating cluster centroids on small data, then estimating regressors on each cluster's small data. Variance compounds.
>
> What I'd do instead: **add classification-like features**. Stone count, move number, ownership clarity (sum of |ownership - 0.5| over the board), territory imbalance, policy-prior concentration — these are all the *underlying signals* that a manual position classifier would key on. Give them to the regressor as features. Let LGBM partition the feature space implicitly. That's exactly what the KataGo aux-head precedent in your design note argues for at the prediction level; the same logic applies one level up at the feature level.
>
> The exception worth taking seriously: **if the curve-shape itself bifurcates** (some positions fit hyperbolic cleanly, others fit sum_residual_hyperbolic cleanly, third class needs something else), then "predict which family fits" is a useful intermediate target. Your clean% table is consistent with this — visit_entropy_reduction's 25.6% hyperbolic clean / 76.7% sum_residual clean is a strong family-preference signal that's correlated with position class. A two-stage model (predict family-shape, then predict params under chosen family) would be defensible. But again, I'd add it as a *feature engineered up-front*, not as an architectural partition.
>
> ### Q4 — Multi-timestep input framing
>
> This is the underappreciated lever in your list and I want to spell out why.
>
> The problem you're solving is, in time-series language, "predict the *asymptote* of a noisy trajectory from its initial condition." The variance-reduction available from observing the trajectory's *first few intermediate points* is large — that's exactly how Kalman filters work. If you see V_pre AND V=500 AND V=2000, your prediction of H integrates over far less unobserved trajectory and is correspondingly tighter. Crude calibration: with the saturating-hyperbolic form, observing F(V) at V=2000 with κ ≈ 300 pins H to within roughly (F(2000)/F(∞)) = (2000/2300) ≈ 87% of its asymptotic value just from the algebra; the regression has to predict only the remaining 13%.
>
> The tradeoff vs SPA-side use:
>
> - **Training-only:** train on (V_pre + V_intermediate) features, eventually deploy only the V_pre-features path. This is multi-task / auxiliary-input training: the deeper-V features carry signal that conditions the trunk during training, and at inference the model uses only V_pre. The auxiliary path is essentially a stronger gradient signal at training time without committing to deeper inference.
> - **Inference-with-warm-start:** the model is allowed to query V_intermediate features. Costs a small fixed amount of search (V_pre → V_int) before the model commits to its (H, κ). For your eventual allocator use case this is *not unreasonable*: the allocator's job is to allocate the remaining budget, and a small fixed warm-start before committing is a defensible operational cost.
>
> The cleanest experiment to run: **add V_intermediate features alongside V_pre features as a second training condition.** Train two models, one with V_pre-only features, one with V_pre + V=500 features. Compare R². The delta is your bound on how much intermediate-trajectory observation buys you. If the delta is large (say +0.15 R² to +0.27), then warm-start inference is justified. If small, V_pre alone is information-complete enough and the framing should stay clean.
>
> This is the single most defensible cheap experiment in your remaining knob set, because the *data is already collected* — every realization in your corpus already has packets at every V. You're using V_pre alone by choice, not by data constraint.
>
> ### Q5 — Feature engineering
>
> Most likely underrepresented, in priority order:
>
> 1. **Policy distribution shape beyond Shannon entropy.** Shannon entropy is one summary. The policy's top-K mass curve (top-1 prior, top-3 prior, top-10 prior), the *effective number of plausible moves* (exp(H) — you have this), the policy-to-visit-distribution KL divergence (a measure of "the search disagrees with the prior" — very likely informative for κ), and the policy's spatial concentration (entropy over the 19×19 location map, summed over reasonable-prior moves) are all easy to compute, none expensive.
>
> 2. **Ownership-derived structural features.** Stone count is the trivially-load-bearing one — early game and late game have wildly different extraction curves and stone count is the cheapest proxy for game phase. Beyond that: sum-of-absolute-territory-imbalance (how settled), count of points with |ownership| < 0.3 (how many disputed regions), corner imbalance (top-left ownership sum vs. bottom-right), local-clustering of high-uncertainty points (the spatial pattern of disputes — diagnostic for tactical vs. positional). The full 361-dim ownership map is too high-dim to use raw at your N; engineered summaries are what's useful.
>
> 3. **Position-structural features.** Move number, stones-on-board, captures so far, ko presence, recent-move locality (was the last move local to the previous one or a board-jump). Cheap, semantically meaningful, almost certainly nonzero signal.
>
> 4. **Trajectory-shape features (if you go multi-timestep per Q4).** Slope at V=200, slope at V=500, second derivative — these directly inform (H, κ).
>
> 5. **Top-K moveInfo features beyond top-5.** Your top-5 cutoff is conservative. The top-12 visit distribution at V_pre, the top-12 prior, the top-12 LCB, the top-12 score-stdev are all available and likely informative for position classes with wide move distributions.
>
> The ordering says: low-hanging structural and policy features first, ownership next, trajectory-derived last (conditional on the Q4 decision). Total feature count realistic ceiling at your N is probably ~80-100; beyond that LGBM has too many ways to fit noise.
>
> ### Q6 — Framing-level issues
>
> Two things to flag.
>
> **The flat-ResNet failure has a specific fixable cause.** Line 433 of `resnet_trajectory.py`:
>
> ```python
> term = ((y_pred - y_t) ** 2).mean() / (y_range ** 2)
> ```
>
> Per-position normalisation by `y_range`. This is what enables the "predict-the-mean via cancelling components" attractor: under range-normalisation, every position's loss contribution is bounded in [0, ~1] regardless of its actual H, so the model can learn the *shape* of an average position without paying for getting the *scale* of any specific position right. The cancelling-component basin is a local minimum specifically because the normalisation hides H-scale errors.
>
> The fix: **drop the per-position normalisation**. Use absolute-unit MSE, or normalise by population standard deviation of y across the corpus rather than per-position range. Then a model that predicts the population mean H gets punished proportional to Var_population(H), exactly as Ridge / k-NN / LGBM are punished in your current pipeline. The flat-ResNet might still fail for other reasons (it's a hard target), but the cancelling-component basin specifically goes away.
>
> Is this worth doing now? Conditional on the bootstrap diagnostic. If labels are noisy, the trajectory NN is fitting more noise than signal regardless of loss shape. If labels are reasonably clean, fixing the loss is a one-line change worth a single training run.
>
> **The per-position fit-then-regress shape may be backwards for κ.** Your two-stage pipeline does `(V, value(V)) → fit (H, κ) → regress (H, κ) from features`. The fit step's H estimate is well-conditioned (it's near the asymptote where trajectory is clean). The fit step's κ estimate is poorly conditioned (it's set by early-V curvature where trajectory is noisiest *and* depends on H — they're correlated parameters). So κ inherits high label noise even on a clean trajectory.
>
> A reframed target — predict, say, `F(V=500)` and `F(V=2000)` as separate regression targets, and back-solve (H, κ) at allocator-query time — has different conditioning. `F(V=500)` is a directly observed quantity per realization (modulo trajectory-interpolation onto the V grid), the corpus has 10 estimates per position, and σ on the average is σ/√10. No curve_fit conditioning in the middle. The model predicts a quantity whose ground truth is closer to "what was actually measured" than the fit parameters are.
>
> The tradeoff: this gives up the *continuous* property the design note's §1.3 fought hard to establish. You're back to predicting at fixed anchors, and the substrate has to assemble a curve from those anchors. **However**, if the anchors are densely packed (predict F at V=100, 200, 500, 1000, 2000, 5000, 10000 — seven points) then linear-interpolation between predicted points is a much better approximation of F than the two-anchor piecewise-linear Phase 3.5 shape. The combinatorial-impossibility argument applies to (V_start, V_end) *pair* prediction; predicting F(V) at fixed V's only grows linearly in the number of V points sampled.
>
> This is a real architectural fork that the design note doesn't quite name. Both are defensible. The parametric form is cleaner mathematically and gives you closed-form derivatives. Predicting F-at-anchors is closer to what the data actually shows you and avoids the (H, κ) coupling. I'd consider running both in parallel as a calibration experiment before fully committing.
>
> ---
>
> ## What I'd want to know but can't tell from this brief
>
> The diagnostics I'd run before more compute:
>
> 1. **Within-position vs across-position variance of (H, κ).** Bootstrap as described in the framework section. Resolves Q2 directly.
>
> 2. **Per-fold predictions, not just R² summaries.** The -0.28 to +0.33 spread on scoreLead_drift|H is concerning. Is the worst fold a single outlier position? A coherent subspace the model can't capture? Look at the actual residuals on the worst fold.
>
> 3. **The κ vs H joint distribution.** Are (H, κ) anti-correlated across positions (the canonical curve_fit identifiability artifact)? If yes, that explains the κ R² failure regardless of features — you're trying to predict the noisier axis of an under-identified pair.
>
> 4. **What `score_stdev` is actually doing as the top LGBM feature.** This is a v_pre-derived scalar that's reportedly the top H predictor for scoreLead_drift. If you partition positions by score_stdev quantile, does H vary monotonically with it across quantiles? If yes, the signal is real and you understand it; if it's a noisy correlation that LGBM has overfit, the apparent +0.12 R² is fragile.
>
> 5. **The collected-but-unused fields.** You have full ownership maps and full policy in the BYTEA blobs. Are you using `useGraphSearch` results, `ladderMoves`, `humanProfile`, any of the alternative root-info fields? Some are likely informative; without an audit I'm guessing.
>
> 6. **The proxy log channels you'd see at training time.** The umbrella's CLAUDE.md is loud about runtime visibility for cross-boundary work; the same applies to the research pipeline. When `curve_fit` flags a position as degenerate, what does the residual look like? Are degenerate fits systematically concentrated on a class of positions (early-game, late-game, tactically-decided)? That's a free dataset of "positions the model would also fail on" and it's diagnostic.
>
> The single most valuable hour you can spend before more collection is #1 (bootstrap). Everything downstream — whether to add features, whether to scale to more positions, whether to revisit architecture — is conditional on what that returns.

---

## 3. My distillation — actionable recommendations

Each recommendation cites the supporting passage in (2) above. The
priority numbering reflects my read of the firewall's overall message,
which is that **the bootstrap diagnostic conditions everything else**.

### Tier 0: do this before anything else

**0.1. Bootstrap label noise per position.**

> *Source: Framework section + "What I'd want to know" #1.* The firewall
> grepped the research tree and confirmed we never measured
> `σ_within / σ_across` for the fitted (H, κ). Without it, +0.12 R² is
> uninterpretable — it could be 12% of all achievable signal or 25% of
> available signal. **Single most valuable hour to spend before any
> further compute.**

Concrete action: for each position, refit (H, κ) on resamples of its
~10 realizations; compute the within-position std of H and the
across-position std of H per target; the ratio gives the R² ceiling.

### Tier 1: cheap, well-grounded, high upside

**1.1. Fix the flat-ResNet loss normalisation.**

> *Source: Q6, first half.* Line 433's per-position `y_range²`
> normalisation enables the "cancelling-components predicts the mean"
> basin by hiding scale errors. Drop range normalisation; use
> absolute-unit MSE or population-σ normalisation.

One-line change worth one training run. **Conditional** on the
bootstrap not showing label noise dominates — if labels are too noisy,
the NN can't learn anything regardless of loss shape.

**1.2. Multi-timestep features as auxiliary training input.**

> *Source: Q4 in full.* "The single most defensible cheap experiment in
> your remaining knob set, because the data is already collected."
> Predicting asymptote from initial-condition + a few intermediate
> trajectory points is a textbook variance-reduction setup; observing
> F(V=2000) pins ~87% of H by algebra.

Concrete action: extend `feature_extraction.py` to optionally accept a
`V_intermediate` parameter producing features from a packet at that V.
Train two models — V_pre alone, V_pre + V=500 + V=2000 — and compare
R². The delta tells us whether warm-start inference is justified for
the eventual SPA-side allocator.

**1.3. Feature engineering, in firewall-ordered priority.**

> *Source: Q5.* Priority order, from highest impact-per-effort:
>
> 1. Policy distribution shape beyond Shannon entropy: top-K mass
>    curve, **policy-to-visit-distribution KL** (firewall flagged this
>    as "very likely informative for κ"), spatial entropy over 19×19.
> 2. Ownership-derived: stone count (game phase), territory imbalance,
>    count of points with `|ownership| < 0.3`, corner imbalance,
>    local-clustering of high-uncertainty points.
> 3. Position-structural: move number, stones-on-board, captures, ko,
>    recent-move locality.
> 4. (If Q4 pans out) trajectory-shape features: slope at V=200, V=500,
>    second derivative.
> 5. Top-12 moveInfo features (not just top-5).

Realistic feature-count ceiling at our N is ~80-100. Beyond that LGBM
has too many ways to fit noise.

**1.4. Architectural alternative worth piloting: predict F-at-anchors
not (H, κ).**

> *Source: Q6, second half.* The fit-then-regress pipeline has poor
> conditioning on κ specifically (early-V curvature where trajectory
> is noisy, and κ is anti-correlated with H in the fit). Predicting
> F at fixed anchor V's (V=100, 200, 500, 1000, 2000, 5000, 10000)
> bypasses curve_fit identifiability entirely.

Tradeoff: gives up closed-form derivatives. Mitigation: dense-enough
anchor set + linear interpolation gives a much better F approximation
than the Phase 3.5 two-anchor piecewise shape, while linearly (not
quadratically) growing labels in anchor count. Worth running in
parallel with the parametric form as a calibration experiment.

### Tier 2: deferred / costly

**2.1. More positions.**

> *Source: Q1 (#3 in firewall's ranking).* Doubling from 392 → 800
> helps LGBM more than Ridge; quadrupling to 1600 helps deeper-feature
> models. But multiplicative cost on collection time, and **only
> justified once labels and features are sorted** — adding noisy
> labels with inadequate features just lets the model fit more noise.

Defer until 0.1 and 1.3 are done.

**2.2. Different parametric family.**

> *Source: Q1 (#5 in firewall's ranking).* "The last knob to spend on."
> The hyperbolic-H signal is real, and a richer family raises fit
> residual quality marginally without changing the regression story.

### Tier 3: actively recommended against / clarified

**3.1. Position classification + per-class regressors.**

> *Source: Q3.* Firewall pushes back. At 50-80 positions per natural
> class, variance compounds — separate regressors learn less than a
> single regressor with class-as-feature would learn for free. **Use
> classification-like FEATURES (game phase, stone count, ownership
> clarity), not architectural partitioning.**

Recommendation: don't pursue per-class regressors. Do pursue the
classification *signals* as engineered features (covered under 1.3).

The one exception the firewall flagged: a "predict which family fits"
intermediate target IS defensible because the clean% table shows real
position-class-by-family-preference signal. But again, add as a
feature, not as an architectural partition.

### Other diagnostics worth running (cheap, in any order)

- **Per-fold residuals on `scoreLead_drift|H`.** Spread −0.28 to +0.33
  is concerning. Is the worst fold one outlier position, or a coherent
  subspace the model can't capture?
- **(H, κ) joint distribution.** Anti-correlated? Confirms the
  curve_fit identifiability hypothesis.
- **`score_stdev` quantile partition.** Does the top-LGBM-feature
  show monotonic H-vs-quantile? Or is it a noisy correlation LGBM
  overfit?
- **Audit BYTEA blobs for unused fields.** Firewall couldn't tell from
  the brief; possible `humanProfile`, `ladderMoves`, alternative
  rootInfo fields carry signal we're not using.

### Theoretical references provided (for offline reading)

- **Caponnetto-DeVito 2007**, "Optimal rates for the regularized
  least squares algorithm" — sample-complexity bounds for kernel
  regression. At d≈23, N=400, convergence rate `N^(-2s/(2s+d))` is
  slow enough that doubling N moves R² by single-digit % unless target
  smoothness s is high.

- **Hutter et al. CACM 2014**, "Algorithm runtime prediction" survey —
  directly analogous problem (per-instance saturating-curve fit,
  features → curve params, R² in 0.2-0.6 range with hundreds of
  features and thousands of instances). Firewall says: **feature
  engineering is what gets to the top of that range, not
  architecture.** This is the most relevant adjacent literature.

- **Anthony et al. 2017**, "Thinking Fast and Slow with Deep Learning
  and Tree Search" — AlphaZero analysis of Elo-per-visit curves across
  positions. Adjacent but doesn't attempt feature-conditional
  prediction.

- **No known prior work on predicting MCTS scaling curves from
  position features.** Modest signal at our scale is realistic.

---

## 4. Action register

(empty at filing time; populate as recommendations are acted on)

| Date | Recommendation | Status | Notes |
|---|---|---|---|
| | | | |

License: Public Domain (The Unlicense)
