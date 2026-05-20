# Opus 4.7 consult — translation-invariant hyperbolic fitting — 2026-05-21

User asked whether a translation-invariant representation of the
hyperbolic curve `F(V) = H·V/(V+κ)` could allow recovery of (H, κ)
from any two trajectory points, motivated by KataGo's non-deterministic
report cadence and the data-amplification intuition. Opus 4.7 agent
queried with web-search authority. Full response preserved verbatim.

## Brief sent

Asked the agent to search the literature on:
- Modern enzyme kinetics fitting (Cornish-Bowden's work, robust
  regression in biochemistry)
- Robust regression for saturation curves
- Equivariance / invariance in neural-network curve fitting
- Bayesian updates for two-point likelihood

Four ranked questions: which transform to use; how to handle
non-monotone trajectories; aggregation across N(N-1)/2 pairs and
inference-complexity comparison vs direct NLS; modern ML alternatives.

## Opus 4.7 response (verbatim)

### TL;DR

Do **not** use a single linearization. Use the **Eisenthal–Cornish-Bowden
direct linear plot (DLP)** as your two-point engine, then aggregate
via the median over all C(N,2) pairs. That gives you (i) the "any two
points → (H, κ)" property your user wants exactly, (ii) the U-statistic
/ median-of-pairs aggregation literature for free, and (iii) a high
breakdown point that handles MCTS realisation noise gracefully. Keep
weighted nonlinear least squares (WNLS) as a cross-check, not as the
production estimator. The "amplification" intuition is correct in
spirit but it is *not* N(N-1)/2 independent samples — see Q3.

### Q1 — Which transform?

**Direct linear plot (DLP), not any of the three "double" linearizations.**

The result you actually want is the algebraic two-point identity.
Given two points (V₁, y₁), (V₂, y₂) of `F(V) = H·V/(V+κ)`, solving
the 2×2 system gives

```
κ = V₁·V₂·(y₂ − y₁) / (V₁·y₁ − V₂·y₂)
H = y₁·y₂·(V₂ − V₁) / (V₂·y₂ − V₁·y₁)
```

This is exactly what DLP computes geometrically: each (Vᵢ, yᵢ) becomes
the line `H = yᵢ + (yᵢ/Vᵢ)·κ` in (κ, H) space, and the pairwise
intersection is the pair's (κ, H) estimate. So DLP *is* the two-point
identity, viewed in parameter space.

[Note: implementation found a sign error in this formula. The correct
common-denominator form, re-derived from y_i + y_i·κ/V_i = y_j + y_j·κ/V_j,
is:
  D = y_i·V_j − y_j·V_i
  κ = V_i·V_j·(y_j − y_i) / D
  H = y_i·y_j·(V_j − V_i)  / D
Synthetic tests on noiseless and noisy hyperbolic curves recover
H=5.0000 and log_κ=7.6009 exactly with this form. The Opus formula
above had a sign-flipped denominator.]

Why not the others, even though they also support a two-point fit?

- **Lineweaver-Burk** is the universally wrong answer. The 1/y
  transform blows up exactly where MCTS variance is worst (small V,
  noisy y), and the modern literature (Marasović 2017;
  Cornish-Bowden's own retrospectives) is unanimous that LB should
  never be used for parameter recovery.
- **Hanes-Woolf** is the best of the linearizations because it
  distributes error more evenly, but it still applies a nonlinear
  transform to noisy y, biasing the estimator. For winrate y ∈ [0,1],
  dividing V by y near y → 0 (early-MCTS noise) is unstable.
- **Eadie-Hofstee** puts y on both axes — your "x" is no longer
  noise-free, violating the OLS assumption everywhere.
- **DLP** never divides by y. It treats each observation as a
  constraint in parameter space, and is non-parametric in the error
  distribution. The 1974 Eisenthal–Cornish-Bowden paper and its 1974
  statistical follow-up (Cornish-Bowden & Eisenthal, *Biochem J*
  139:721) establish that the median over pairwise intersections is
  more robust than OLS "under a wide variety of experimental
  situations," with non-parametric confidence intervals via the order
  statistics of the projected coordinates.

**Practical recipe per trajectory:**

1. Drop V < V_min (say V < 8) where the hyperbolic functional form is
   structurally inapplicable.
2. For all C(N,2) pairs, compute (κᵢⱼ, Hᵢⱼ) via the closed form above.
3. Reject pairs where `V₁·y₁ − V₂·y₂` is below a tolerance
   (near-parallel lines → unidentifiable).
4. Report the **median** of {κᵢⱼ} and the **median** of {Hᵢⱼ} as the
   trajectory's invariants.
5. Non-parametric CI: the (N choose 2 ± z·σ) order statistics of the
   κᵢⱼ pool.

This is what `renz::dir.MM` does in R and what every modern enzyme-
kinetics tutorial recommends when you want non-parametric robustness;
Cornish-Bowden has reiterated the recommendation across five decades.

### Q2 — Non-monotone "reading paradox" trajectories

The hyperbolic family genuinely cannot fit a dip-then-rise. Three
options, in increasing order of how I'd lean:

1. **Detect and exclude.** Compute a monotonicity score (Spearman ρ
   over the sorted-by-V trajectory; or count sign changes in a
   smoothed derivative). If ρ < ~0.6 or the trajectory has a deep dip,
   drop the trajectory from the (H, κ) corpus and treat it under your
   existing non-parametric features. The DLP estimator is robust to
   outliers within a trajectory, but it is *not* robust to the
   trajectory's underlying shape being wrong — no two-point estimator
   can fix a structural model misspecification.

2. **Truncate the prefix.** Locate `V* = argmin y(V)` (smoothed); fit
   DLP only on V ≥ V*. This recovers the "post-paradox saturation"
   arm. Document the truncation per trajectory; downstream you'll
   want to carry V* as a feature anyway.

3. **Robust upper envelope.** DLP's median already discards pairs
   whose intersection lands in the wrong half-plane. In practice, with
   ~50 points and a localised dip, the dip generates a small minority
   of pairs with implausible (κ, H) — the median absorbs them. This is
   the cleanest version of "just trust the median" and is what I'd
   try first empirically.

I would not bother with a piecewise model. If the trajectory has a
dip you are conceptually outside Michaelis-Menten; reporting (H, κ)
for it is misleading, no matter how good the fit looks.

### Q3 — Aggregation, and the inference-complexity question

**Aggregation:** median of pairwise estimates, full stop. This is
DLP's original prescription and it has the right statistical
structure. If you want to be fancier, use a **trimmed mean of pairwise
(κ, H)** (e.g. 20% trimmed) or an **M-estimator (Huber)** on the pool
— but the median is hard to beat and has the highest breakdown point
(50%).

**"N(N-1)/2 samples for free" — important caveat.** The pairwise
estimates are *not* independent. They share data: pair (1,2) and pair
(1,3) both depend on point 1. The pool of C(N,2) estimates is a
**U-statistic** with kernel size 2. The effective sample size is
O(N), not O(N²). Concretely (Hoeffding's classical result):

- Variance of the median of pairwise estimates scales as `σ²·c / N`,
  not `σ²·c / N²`.
- The leading constant `c` is determined by the Hájek projection —
  the conditional expectation of the pairwise kernel given a single
  data point.
- Asymptotic normality holds (Theil-Sen is the linear analog and has
  been studied to death; the Cornish-Bowden estimator's asymptotic
  normality was proved in Sen & Singer-style work, e.g. the 1986
  *Stat. Probab. Lett.* paper on the asymptotic properties of the CBE
  median estimator).

So the right way to set expectations:

- **DLP-median ≈ weighted NLS** in efficiency under correctly-specified
  noise, with both being O(1/N) in variance.
- **DLP-median ≫ WNLS** under outliers, model misspecification (mild
  non-monotonicity), heteroscedasticity, or heavy-tailed MCTS-
  realisation noise.
- **DLP-median > WNLS** when you have no good variance model (you
  don't — KataGo's per-V noise is not characterised).

**Crossover point — how many points before DLP-median beats NLS?**
For Michaelis-Menten with i.i.d. Gaussian noise, NLS is asymptotically
efficient and DLP-median has efficiency ~64% (the Pitman efficiency
of the median vs the mean, generalised). So *under ideal conditions*
NLS is better at every N. The DLP-median wins as soon as the noise
model is misspecified — which, with ~50 MCTS samples per trajectory
landing on irregular V grids, is approximately always your situation.
The 2024 Ghosh et al. MDPDE paper for nonlinear regression
(arXiv:2409.15995) gives a tunable trade-off: α = 0 is NLS, α ∈ [0.1,
0.3] gives robustness with ~5–10% efficiency loss. That's a
reasonable third option if you want one knob.

**Recommended setup for your stage:** DLP-median as the primary
estimator; bootstrapped MAD-of-pairwise as the per-trajectory
uncertainty; WNLS with `1/y²` or sqrt-variance weights as a sanity
check on the held-out validation set. Compare medians per-trajectory;
they should agree on monotone trajectories and disagree informatively
on the paradoxical ones.

### Q4 — Modern ML angle

Two ideas, in increasing speculativeness:

**(a) DeepSets / Neural-Process amortised estimator** *(my
recommendation if you want an ML approach)*. The mapping from a set
of (V, y) points to (H, κ) is genuinely permutation-invariant.
DeepSets (Zaheer et al. 2017) gives you the right inductive bias:
`(H_hat, κ_hat) = ρ(Σᵢ φ(Vᵢ, yᵢ))`. Train on synthetic trajectories
drawn from your prior over (H, κ) with realistic MCTS noise. Two
payoffs: (i) you can train it to be robust to non-monotone prefixes
by including paradox trajectories in the training set with annotated
parameters; (ii) handles variable N gracefully. This is essentially
Neural Posterior Estimation (NPE) — the `sbi` package implements it
(Tejero-Cantero et al.) and the 2024 X-ray spectral fitting paper
(Barret & Dupourqué, A&A 2024) is a clean methodological template
for "amortised Bayesian curve-fit with NPE." For a Go-AI research
project this is genuinely the modern move and gives you a posterior
for free.

**(b) Pairwise-update Bayesian formulation.** Treat the prior over
(log H, log κ) as Gaussian, and each pair-wise DLP intersection
(κᵢⱼ, Hᵢⱼ) as a noisy likelihood observation. Posterior is then a
precision-weighted product of pairwise estimates, with the U-statistic
correlation structure absorbed into a correction factor on the
precision (since pairs share points). This is more principled than
median-of-pairs but more work to implement; I'd reach for it only if
(a) doesn't fit the research budget.

**(c) Equivariance specifically.** Beyond permutation invariance,
there is a **scale equivariance** in this problem: rescaling V → λV
maps κ → λκ and leaves H unchanged. You can bake this into the
architecture by working in `(log V, y)` space and using a network
that's translation-equivariant in log V. The Approximately
Equivariant Neural Processes paper (Huang et al. 2024,
arXiv:2406.13488) is the closest published template. This is the
"elegant" answer to the user's translation-invariance phrasing —
your user's intuition about translation invariance is correct, but
the translation is in log-V, not in V.

### Concrete next-step proposal

For the Stage-1 sanity scaffold you have in flight (per the recent
commit), I'd add a single column to the per-trajectory output:
`(kappa_dlp_median, H_dlp_median, kappa_dlp_mad, H_dlp_mad,
n_pairs_used, monotonicity_spearman)`. That gets you the invariant
representation, the per-trajectory uncertainty, and a paradox-detection
flag in one pass over the existing data. If those columns agree with
your existing WNLS fit on monotone trajectories and disagree on
paradoxical ones in a structured way, you have a publishable
diagnostic.

If the user then wants the ML version, the DeepSets / NPE approach
is the right escalation — and a clean writeup arc for the project:
classical (DLP) → robust U-statistic aggregation → amortised Bayesian
(NPE). The progression itself tells a story.

## Sources

- Eisenthal & Cornish-Bowden (1974) — The direct linear plot. A new
  graphical procedure for estimating enzyme kinetic parameters
- Cornish-Bowden & Eisenthal (1974) — Statistical considerations in
  the estimation of enzyme kinetic parameters by the direct linear
  plot and other methods
- The asymptotic properties of the Cornish-Bowden-Eisenthal median
  estimator (Stat. Probab. Lett. 1986)
- Marasović (2017) — Robust Nonlinear Regression in Enzyme Kinetic
  Parameters Estimation, J. Chemistry
- Ghosh et al. (2024) — Robust Inference for Non-Linear Regression
  Models with Applications in Enzyme Kinetics (MDPDE), arXiv:2409.15995
- Theil–Sen estimator (linear analog of median-of-pairs)
- Zaheer et al. (2017) — Deep Sets, arXiv:1703.06114
- Huang et al. (2024) — Approximately Equivariant Neural Processes,
  arXiv:2406.13488
- Barret & Dupourqué (2024) — Simulation-Based Inference with NPE
  applied to X-ray spectral fitting
- U-statistic (asymptotic theory for pairwise-kernel estimators)

## Implementation outcome

Implemented the DLP-median in `extract_trajectory_features.py` with
five columns: `H_dlp_median`, `log_kappa_dlp_median`, `H_dlp_mad`,
`log_kappa_dlp_mad`, `dlp_n_valid_pairs`. Synthetic-data tests
recovered H=5.0000 and log_κ=7.6009 exactly on clean data. Applied
to all 450 positions × 7 targets at 100% label coverage.

**What panned out:**
- 100% label coverage (vs 26-68% curve_fit) ✓
- `dlp_n_valid_pairs` is a powerful monotonicity feature, drove the
  three-mode discovery in unsupervised clustering ✓
- Mathematical robustness confirmed ✓
- Surfaced structural non-monotonicity of `visit_entropy_reduction`
  (median 5% valid pairs) and `top_move_visit_fraction` (8%) ✓

**What didn't pan out (as user might have hoped):**
- DLP-median labels are not more predictable from V_pre features
  than curve_fit labels. Both deliver similar OOF R² (~+0.12-+0.13 on
  scoreLead|H).
- The "free data via C(N,2) pairs" intuition was over-promised; the
  U-statistic caveat means effective sample size is O(N), not O(N²).
- `dlp_n_valid_pairs` is itself not predictable from V_pre, consistent
  with the larger finding that mode is a search-time discovery.

Net: translation invariance delivered as a **shape-feature engineering
tool** (mode discovery, monotonicity indicator, 100% coverage) rather
than as a **predictability multiplier**. The user's intuition was
directionally right; the magnitude was over-promised by the closed-form
algebra. The win came from `dlp_n_valid_pairs` as a mode discriminator,
not from improved (H, κ) predictability.
