---
title: Linear projection methods + quantitative framework — compression research investigation
date: 2026-05-26
genre: research-survey + framework-proposal
context: analysis-bundle compression arc (post-cross/analysis-bundle-compression-v2 merge)
license: Public Domain (The Unlicense)
---

## 0. What this document is

A two-part research note. **Part 1** surveys the space of linear
projection and transform-based compression methods applicable to
the LengYue ownership-map regime (T ≈ 200 packets × S = 361 cells ×
floats in [−1, 1] × L∞-primary error). **Part 2** proposes a
disciplined quantitative framework — concrete metric definitions,
estimation procedures, and a corpus-grounded protocol — so that
future probes are graded against shared yardsticks rather than ad-
hoc per-method byte counts. **Part 3** synthesises which methods
from Part 1 would actually be worth probing under that framework.
**Part 4** records the operational caveats that survive any
theoretically attractive answer.

The investigation is read-only relative to the codebase except for
this file itself. No probe code is added; pseudocode appears where
it sharpens a definition.

### Genre disclaimer

This is a research-survey. It is descriptive of a well-trodden
literature; where I claim a result holds, I name the canonical
reference (paper, textbook, or framework) so the reader can verify
without trusting my paraphrase. Where I make a project-specific
judgement ("this would fail at our scale because…"), the structural
reason is named explicitly and is the bit you should challenge if
you disagree. The most-likely failure modes of a survey like this
are (a) silent omission of a relevant method I didn't think of, and
(b) over-confident dismissal of a method whose failure-condition I
have inferred from priors rather than measured. I have tried to
flag both kinds of uncertainty inline; the verdict tags ("sound to
probe", "future", "null", "dumb-and-why") are calibrated against
the shipped baselines, not against generic compression literature.

---

## 1. Setup + the L∞ constraint

### 1.1 The data tensor

Per bundle:

- T ≈ 200 packets along the time axis. Each packet corresponds to
  a board position the user analysed at some specific move number;
  packets are not uniformly spaced in any meaningful sense — they
  are a function of which positions the user opened analysis on.
- S = 361 cells along the space axis (19 × 19 board).
- Per (t, s) cell value v ∈ [−1, 1]: KataGo's posterior-mean
  ownership estimate (signed for black/white control).

Stacking the corpus across bundles yields ~40 games × ~200 packets
= ~8 102 packets × 361 cells. The natural tensor view is
(N_bundles, T, 19, 19), with the per-bundle T variable.

### 1.2 What "compression" means here

Two budgets compete:

- **Wire-size budget** measured *post-brotli* — the SPA encodes
  bytes, the backend brotli-wraps unconditionally. Any candidate
  scheme is judged on post-brotli bytes per bundle.
- **Reconstruction-error budget** measured at the SPA's
  rendering boundary — per-cell, per-packet ownership values
  feeding the heatmap overlay.

The shipped baselines, for grounding:

| variant | encoding | post-brotli ratio | L∞ (per-cell max-abs) |
|---|---|---|---|
| v1 | canonical JSON | 1.00× | 0 (lossless) |
| v2-projected | JSON allow-listed | 0.22× | 0 (lossless on observable schema) |
| v2-quantized | Q4 ownership + Q8-factored policy | 0.13× | 0.0625 |
| v2-quantized-hifi | Q8 ownership + Q8-factored policy | ~0.13× (similar) | 0.0039 |

The byte-XOR probe (2026-05-26) found an additional ~4% over
v2-quantized via byte-XOR delta on Q4 packings. The PCA and
wavelet probes (also 2026-05-26) confirmed the L∞ failure mode
that frames the present investigation.

### 1.3 Why L∞ is primary

The SPA's heatmap overlay renders per-cell ownership colour. A
user examining a position fixates on one specific cell at a time
("is this stone alive?"); the user's perceptual experience of
"the decoder lied" is dominated by the *worst* cell, not by the
RMS over the board. The user can recognise an isolated 0.5-unit
error at a glance; they cannot perceive a 0.01 mean shift if the
worst cell holds at 0.05.

This is structurally different from image compression's usual
PSNR / MSE regime, where the eye integrates spatial detail and
mean-square error is a workable proxy for perceptual quality. For
the heatmap-overlay use case, L∞ is the right metric and any
method that optimises L₂ at the cost of L∞ is wrong-shape for
this application, regardless of how good its byte-savings look.

The PCA probe is the canonical illustration: at K=200 components
on a 361-dim signal, captured variance is 99%+ — by any L₂
yardstick a triumphant compression — and yet the per-cell max-abs
error is 0.48, which is **7.7× worse than uniform Q4**. The
L₂-optimal basis is not the L∞-optimal basis, and the gap is
large.

### 1.4 What "linear projection" means in the literature

A linear projection compresses a vector v ∈ ℝᴺ to coefficients
c = Φv ∈ ℝᴷ with K < N via a fixed matrix Φ ∈ ℝᴷˣᴺ.
Decompression reconstructs v̂ = Ψc where Ψ ∈ ℝᴺˣᴷ (typically the
pseudo-inverse or transpose of Φ for orthonormal bases). The
sender pays K coefficients to encode v; both ends share Φ and Ψ.

Three knobs distinguish methods:

1. **How Φ is chosen.** Fixed (DCT, wavelets, Hadamard, random
   projections), data-adaptive (PCA, ICA, K-SVD), or
   problem-adaptive (kernel methods, learned dictionaries).
2. **What Φ is optimised for.** L₂ reconstruction (PCA, DCT),
   sparsity of c (sparse PCA, dictionary learning), statistical
   independence of c (ICA), distance preservation (random
   projections / JL lemma).
3. **What's quantised, and how.** The bytes-on-the-wire come
   from quantising c (and possibly Φ, if it's data-adaptive and
   shipped). Quantisation strategy is orthogonal to the choice
   of Φ but interacts with it strongly.

Transform-based compression generalises linear projection to any
invertible (or quasi-invertible) function; the standard transforms
(DCT, DFT, wavelets) are linear and orthogonal, so they're
formally a sub-case. Nonlinear extensions (kernel methods, tensor
decompositions, deep autoencoders) live one step beyond.

### 1.5 Why L∞ is structurally hard for L₂-optimal projections

A general fact, stated for grounding the rest of the survey:

**Claim.** Let v ∈ ℝᴺ and let Φ be an orthonormal basis (PCA,
DCT, wavelets, random orthogonal projections). Define v̂ as the
reconstruction from the top-K coefficients (largest |c_i|, or
fixed K leading basis vectors). Then ‖v − v̂‖₂² = Σ_{i > K} c_i²
(by Parseval), but ‖v − v̂‖∞ has no comparable structural bound —
it can be as large as Σ_{i > K} |c_i| times the largest
basis-vector magnitude per cell.

The intuition: L₂ truncation evenly distributes the truncation
error across all components in the basis, but each component
reconstructs into the cell domain via a basis vector whose
magnitude per cell varies. A truncated component's energy
concentrates on the cells where its basis vector is large; if
the basis is delocalised (DCT, PCA on smooth data), every cell
sees some residual. The L∞ error is the worst-case sum of these
per-cell contributions.

Three classes of basis behave differently here:

- **Delocalised orthonormal** (PCA, DCT, DFT, Hadamard): low
  variance contributions per coefficient, but the worst cell can
  accumulate many small contributions and blow up.
- **Spatially localised orthonormal** (wavelets, curvelets): each
  coefficient's basis vector is concentrated; L∞ damage from
  truncation localises near the basis-vector support.
- **Identity / piecewise** (uniform quantisation, JPEG block
  DCT): per-cell error is independent; L∞ is bounded by the
  per-cell quantisation step.

Uniform Q4 is in the third class. **This is why it dominates on
L∞ at our scale.** Any L₂-optimal projection has to either get
its K close enough to N to make the truncation tail per-cell
negligible (losing the byte savings), or operate on a basis
where the truncation tail is per-cell localised (wavelets and
their kin — at which point the per-coefficient sidecar overhead
eats the budget at 19×19 scale, as the per-cell wavelet probe
already showed).

This claim drives much of the survey's pessimism. It is not a
theorem-with-quantification (the L∞ blowup depends on the data
distribution as well as the basis), but it is the structural
reason why L₂-optimal byte savings keep evaporating into L∞
regressions.

---

## 2. Question 1: linear-projection methods survey

For each method below: *what it does*, *why it might work for
ownership-map compression*, *why it might not*, *L∞
characterisation*, *verdict*.

The verdict tags are calibrated against the v2-quantized baseline
(ratio ≈ 0.13, L∞ ≤ 0.0625):

- **sound to probe** — plausible chance of net-improvement; the
  probe would be informative whether positive or negative.
- **sound for future** — would matter under different constraints
  (larger boards, longer time-series, different error metric);
  file for revisit.
- **null** — the structural argument predicts no net win at our
  scale; the probe would confirm the negative.
- **dumb-and-why** — the method's failure mode is so directly
  predictable that probing it would be a wasted cycle.

### 2.1 PCA family

#### 2.1.1 Standard PCA (Principal Component Analysis)

*What it does.* Computes the eigendecomposition of the data
covariance matrix Σ = E[(v − μ)(v − μ)ᵀ]. Projects each v onto
the top-K eigenvectors (those with largest eigenvalues —
equivalently, the directions of maximum variance). Reconstruction
v̂ = μ + Σ_{i=1..K} c_i u_i where u_i are eigenvectors and
c_i = u_iᵀ(v − μ). Optimal in the sense of minimising expected
L₂ reconstruction error.

*Why it might work.* Ownership maps have strong cross-cell
correlation (territorial blocks of co-controlled cells); PCA
captures this structure efficiently in its top eigenvectors. The
probe confirms this at the L₂ level: K=10 captures 58% of
variance, K=50 captures 94%, K=200 captures 99%+.

*Why it might not.* The 2026-05-26 probe is dispositive:
truncation optimises L₂ not L∞; at K=200 the L∞ error is 0.48 vs
Q4's 0.0625. To match Q4's per-cell guarantee, K would need to
approach 361, eliminating the byte savings.

*L∞ characterisation.* No native L∞ bound. Per the claim in §1.5,
truncated PCA on delocalised data exhibits L∞ error proportional
to the sum of dropped |c_i| times the local basis-vector
magnitude — unbounded in general.

*Verdict.* **null** for ownership compression. Already filed in
followups note Idea 1. Worth keeping as the L₂-reference
benchmark for any framework Part 2 proposes (i.e., PCA truncation
is the L₂-optimal rate-distortion curve for linear projection;
other methods should be measured against it on L₂ as well as on
L∞).

#### 2.1.2 Sparse PCA

*What it does.* Variant of PCA that enforces sparsity on the
eigenvectors themselves — each principal component is supported
on a small subset of input features. Reference: Zou, Hastie &
Tibshirani (2006), "Sparse Principal Component Analysis"; also
Witten, Tibshirani & Hastie (2009), penalised matrix
decomposition formulations.

*Why it might work for ownership maps.* If the top components
correspond to spatially localised structures (a corner being
contested, a side framework forming), sparse-PCA basis vectors
would localise to those regions. Sparse basis vectors should
have better L∞ behaviour under truncation — the per-cell error
from dropping coefficient c_i is bounded by |c_i| × max-on-
support of u_i, and small support means few cells affected.

*Why it might not.* (1) Sparsity has to be tuned per-component;
inverse correspondence between sparsity level K_sparse and
captured variance. (2) Sparse PCA's optimisation is non-convex
and benchmark-sensitive; the basis you find depends on
initialisation. (3) The shipped quantiser ALREADY has per-cell
locality (Q4 is bitwise per cell). Sparse-PCA's L∞ benefit only
applies if the basis vectors are sparser than the identity
basis. The identity basis is maximally sparse already, so
sparse PCA reduces to "find a basis between identity and full
PCA that improves variance while preserving sparsity" — a
fundamental trade-off whose sweet spot may not exist.

*L∞ characterisation.* Tighter than standard PCA but still no
analytic bound. Sparsity makes per-coefficient L∞ damage local;
truncating many sparse coefficients can still accumulate.

*Verdict.* **sound for future, currently null.** If the framework
in Part 2 shows that PCA's L∞ failure is concentrated in a
small number of "wild" components (high-frequency directions on
specific cells), sparse PCA might suppress those specifically.
This is conditional and worth probing only after the framework
measures it. Without the diagnostic, it's a guess.

#### 2.1.3 Robust PCA

*What it does.* Decomposes data into low-rank + sparse-outlier
components: X = L + S where L is low-rank and S is sparse.
Solved via principal component pursuit (PCP) per Candès, Li, Ma
& Wright (2009), "Robust Principal Component Analysis?". The
"robust" name refers to robustness against outliers, not
robustness in the statistical-distribution-theory sense.

*Why it might work.* If ownership maps are mostly low-rank plus
a few "wild" cells (recent captures, isolated stones), the
low-rank L compresses well via PCA and the sparse S compresses
well via index-value pairs. This matches the observed structure
of ownership maps in some cases — most cells are smoothly part
of a territory; a few cells are at sharp boundaries.

*Why it might not.* (1) Sparse-component encoding (index + value
sidecar) is exactly what failed in the per-cell wavelet probe —
the index overhead at 19 × 19 dominates. (2) PCP is
computationally expensive and adaptive per-bundle; it's not
clearly compatible with a global basis. (3) The user prefers a
single decode path; RPCA introduces dispatch on cell category.

*L∞ characterisation.* Better than standard PCA in principle —
the sparse component preserves the "wild" cells exactly — but
the low-rank component still has the standard PCA L∞ failure
mode for cells not in the sparse component.

*Verdict.* **null** at our scale. The sparse-sidecar overhead
defeats the byte budget for the same reason it did in the
wavelet probe. Could become relevant if the framework in Part 2
shows that the cells driving PCA's L∞ failure are concentrated
on a small (≪361) consistent subset across packets — then a
fixed sparse-cell escape hatch would have value. Speculative.

#### 2.1.4 Probabilistic PCA / Factor Analysis

*What it does.* Treats PCA as a latent-variable Gaussian model:
v = Wz + μ + ε where z ~ N(0, I_K) is a K-dim latent and ε is
isotropic Gaussian noise (PPCA) or diagonal Gaussian noise
(Factor Analysis). The MLE recovers a basis very close to PCA's
top-K eigenvectors.

*Why it might work.* PPCA's probabilistic framing exposes a
noise-floor parameter σ² that could ground a principled
quantisation step. Bayesian extensions (variational Bayes PCA,
sparse factor models) explicitly model uncertainty per
coefficient — potentially useful for adaptive quantisation.

*Why it might not.* Same L₂ vs L∞ failure as standard PCA. The
probabilistic framing doesn't change the basis or the
truncation behaviour; it changes only how you reason about
them.

*L∞ characterisation.* Same as PCA. The MLE basis is the PCA
basis up to rotation; truncation behaviour is identical.

*Verdict.* **null** for this regime; the probabilistic framing
adds no L∞ leverage. Useful if the framework in Part 2 wants to
formalise "expected L∞" rather than "worst-case L∞", but that
would itself be a framing concession.

#### 2.1.5 Kernel PCA

*What it does.* PCA in a Reproducing Kernel Hilbert Space (RKHS)
induced by a positive-definite kernel k(x, y). For Gaussian
kernel k(x, y) = exp(−‖x − y‖²/2σ²), the implicit feature space
is infinite-dimensional. Reference: Schölkopf, Smola & Müller
(1998), "Nonlinear Component Analysis as a Kernel Eigenvalue
Problem".

*Why it might work.* If ownership maps have a low-dimensional
nonlinear manifold structure (e.g., a small number of
"endgame configurations" that capture most positions modulo a
smooth transformation), kernel PCA can compress better than
linear PCA along this manifold.

*Why it might not.* (1) Decoding requires either a pre-image
computation (which is itself an optimisation problem with no
closed form for most kernels) or storing the data points
themselves as part of the codebook — both of which destroy the
byte budget at SPA-decode time. (2) The L∞ behaviour is no
better than linear PCA's by the same eigenvalue-truncation
argument applied in feature space. (3) Operationally
heavyweight for an SPA encoder — kernel matrix construction
is O(N²) in the training set.

*L∞ characterisation.* No better than linear PCA in cell-space;
the truncation argument applies in the feature space, and the
pre-image step can amplify L∞ error unpredictably.

*Verdict.* **dumb-and-why** for SPA-deployment. The pre-image
problem alone makes it operationally untenable at decode time.
Architecturally interesting; not for this surface.

### 2.2 ICA (Independent Component Analysis)

*What it does.* Finds a linear basis under which the projected
coefficients are *maximally statistically independent* (rather
than maximally uncorrelated, which is what PCA gives). Standard
algorithms: FastICA (Hyvärinen & Oja, 2000), InfoMax (Bell &
Sejnowski, 1995).

*Why it might work for ownership maps.* ICA is the right basis
if you believe the data is a linear mixture of statistically
independent sources. For ownership maps, plausible "sources"
would be independent local-region influence functions
(territorial decisions per quadrant, life-and-death decisions
per group). If the basis matched this, the coefficients would
be more independent and might quantise more cheaply (each
coefficient has its own marginal distribution; if those are
heavy-tailed, sparse coefficient encoding is cheap).

*Why it might not.* (1) ICA is L₂-grade at best for compression
— it doesn't have an analytic L∞ bound either. (2) The
"independent sources" hypothesis is itself an assumption; if
ownership maps are not well-modelled as linear mixtures of
independent sources, ICA returns a basis that is no better
than PCA's. (3) ICA needs at-least-as-many observations as
dimensions; with ~8 100 packets vs 361 dims, this is satisfied
but tight (a Gaussianity check would be the first sanity step).

*L∞ characterisation.* Same as PCA — no analytic per-cell bound.

*Verdict.* **sound to probe, low priority.** Cheap to fit on
the 8 102-packet corpus (one FastICA call). Probe outcome:
either ICA gives a basis with more localised support per
component (in which case L∞ improves modestly and we'd revisit
in light of that) or it gives essentially the same basis as
PCA up to rotation (the null hypothesis). The probe is small
enough to be worth running just to know.

### 2.3 Karhunen-Loève Transform (KLT)

*What it does.* The KLT is the data-adaptive basis that
diagonalises the autocorrelation function of a stochastic
process. For a stationary process, the KLT converges to PCA as
the sample size grows; for a non-stationary process, the KLT is
the right framing but requires per-segment adaptation.

*Why it might work for ownership maps.* If ownership statistics
vary across the game phase (opening vs middlegame vs endgame),
a phase-specific KLT could compress each phase better than a
single corpus-wide PCA. The corpus might naturally segment into
(opening, middlegame, endgame) clusters and the KLT for each
cluster would be tighter.

*Why it might not.* (1) The L∞ vs L₂ trade-off is structural and
doesn't depend on which basis you choose; KLT inherits PCA's
L∞ failure. (2) Cluster-conditioned bases require shipping
multiple bases — either at the cost of basis-bytes per bundle
(if shipped per-bundle) or per-cluster (if globally shipped,
adds metadata to dispatch). (3) Phase segmentation is itself a
heuristic and would need its own gate.

*L∞ characterisation.* Same as PCA.

*Verdict.* **null** as a direct compression scheme; **interesting
as a diagnostic** for whether the data has phase structure.
Could feed the framework in Part 2 as a way to measure
non-stationarity.

### 2.4 Random projections (Johnson-Lindenstrauss)

*What it does.* Project v ∈ ℝᴺ to c = Φv where Φ is a random K × N
matrix (Gaussian, sub-Gaussian, or sparse-Bernoulli). The
Johnson-Lindenstrauss lemma guarantees that for K = O(log(M) /
ε²), pairwise L₂ distances among M data points are preserved up
to multiplicative factor (1 ± ε) with high probability.

*Why it might work for ownership maps.* Cheap (no training, no
adaptation), basis-bytes are zero (Φ is generated from a seed).
Database systems use random projections for fast similarity
search; the same machinery can underlie compression if the
projection preserves enough structure.

*Why it might not.* (1) JL gives **L₂ preservation**, not L∞ or
compression-grade reconstruction. JL says "if you project to K
dims, pairwise L₂ distances are nearly preserved"; it does NOT
say "you can reconstruct v from c with small L∞ error". For
reconstruction you need to invert Φ (or use compressed sensing
machinery — §2.10). (2) The reconstruction quality is no
better than PCA's and is usually worse because the basis is
not data-adapted.

*L∞ characterisation.* JL preserves L₂ distances between
training points; nothing in JL bounds the L∞ reconstruction
error of a single point. In fact for K < N the reconstruction
v̂ = ΦᵀΦv has L∞ error that can be arbitrarily large for
adversarial v even when L₂ is small.

*Verdict.* **dumb-and-why** for direct compression — JL solves
the wrong problem (distance preservation, not reconstruction).
Compressed sensing (§2.10) is the right tool if random
projections are involved; JL itself is not it.

### 2.5 Fourier family

#### 2.5.1 DCT (Discrete Cosine Transform)

*What it does.* Expresses v ∈ ℝᴺ as a linear combination of
cosine basis functions (real-valued, orthonormal). The DCT-II
in particular is the basis used in JPEG. Variants DCT-I to
DCT-VIII differ in boundary handling; for image-style data
DCT-II is canonical.

*Why it might work.* DCT decorrelates smooth signals very
effectively (asymptotically optimal for stationary AR(1)
processes as ρ → 1). Ownership maps are smooth within
territories; DCT should capture this in low-frequency
coefficients.

*Why it might not.* (1) **User has previously tried DCT
without success** (followups note Idea 3, recorded user
experience). Worth respecting unless the framework in Part 2
gives reason to revisit. (2) DCT's Gibbs ringing at sharp
boundaries (territorial walls) is exactly the failure mode for
L∞: a discontinuity in the input produces oscillating
high-frequency coefficients that all contribute back into the
boundary cells on reconstruction, blowing up max-abs near the
boundary. (3) On a 19 × 19 board, the 2D DCT has 361
coefficients — at this size the DCT's "natural" coefficient
ordering (zig-zag) loses leverage; truncation either drops too
much (high L∞) or too little (no byte savings).

*L∞ characterisation.* Bounded for low-frequency truncation on
smooth signals; can spike at sharp boundaries (Gibbs effect).
No global analytic bound for truncated reconstruction.

*Verdict.* **null** for 2D-spatial DCT on 19 × 19 boards
(structural argument + user's prior null). **Slightly more
interesting as 1D DCT on time-axis per cell** (the cell's
ownership evolves smoothly across moves until capture, then
discontinuously) — but this is the same regime where the
per-cell wavelet probe already failed, and the structural
problem (per-coefficient sidecar overhead at our scale) is the
same. File as null.

#### 2.5.2 DFT (Discrete Fourier Transform)

*What it does.* Complex-valued frequency decomposition. For
real input, DFT coefficients come in complex-conjugate pairs;
real-valued analogues (DCT, DST, DHT) are more efficient.

*Why it might work for ownership maps.* No particular reason
over DCT — for real input, DFT is essentially equivalent to a
combination of DCT and DST.

*Why it might not.* DFT's complex coefficients are awkward to
quantise (each coefficient is a (real, imaginary) pair); DCT
avoids this. Same Gibbs-effect failure.

*L∞ characterisation.* Same as DCT.

*Verdict.* **dumb-and-why** for real-valued input — DCT is
strictly better.

#### 2.5.3 DST (Discrete Sine Transform), DHT (Discrete Hartley Transform)

*What it does.* DST uses sine basis (zero-Dirichlet boundary
conditions); DHT is a real-valued analogue of DFT using cas(x)
= cos(x) + sin(x) basis functions.

*Why it might work.* DST handles signals with zero-boundary
conditions better than DCT (which assumes mirror-extended
boundaries). Ownership at board edges is not zero in general
(corners have determinate ownership), so the DST's boundary
condition is wrong.

*Why it might not.* Same L∞ vs L₂ failure as DCT, plus the
boundary-condition mismatch.

*L∞ characterisation.* Same as DCT.

*Verdict.* **null** — same regime, no advantage over DCT for
this data.

### 2.6 Wavelet family beyond Daubechies-4

The per-cell-time-axis db4 probe is filed null (followups Idea 2).
The structural reason — per-coefficient sidecar overhead at our
scale — applies across the wavelet family. But there are
internal variants worth naming.

#### 2.6.1 Symlet, Coiflet

*What they do.* Variations on Daubechies with different
properties: Symlets are near-symmetric (better edge handling);
Coiflets have vanishing moments on both wavelet and scaling
functions (smoother reconstruction). Daubechies, Symlet, Coiflet
all live in the same compactly-supported-orthogonal-wavelet
family.

*Why they might work.* Symlets' near-symmetry reduces phase
distortion at boundaries; Coiflets' double vanishing moments
suppress polynomial trends — both potentially relevant for
ownership maps with smooth interiors and sharp edges.

*Why they might not.* The probe's failure was sidecar overhead,
not wavelet choice. Switching from db4 to sym4 or coif2 changes
the basis but not the per-coefficient byte cost. Marginal at
best.

*L∞ characterisation.* Same as db4 — wavelet coefficients are
spatially localised, so per-coefficient L∞ damage is local; the
budget failure is sidecar-side.

*Verdict.* **null** for the same structural reason db4 failed.
Worth probing only if the sidecar problem is addressed
separately (e.g., by interleaving wavelet coefficients with
their indices in a brotli-friendly layout — speculative).

#### 2.6.2 Biorthogonal wavelets

*What they do.* Use different bases for analysis and synthesis
(Φ ≠ Ψ); the JPEG2000 CDF 9/7 wavelet is the canonical example.
Allows symmetric filters with linear phase, important for image
applications.

*Why it might work.* JPEG2000 is the canonical demonstration
that biorthogonal wavelets compress natural images well at
moderate bit budgets. If ownership maps have natural-image-like
structure (smooth regions + sharp boundaries), biorthogonal
wavelets might inherit this performance.

*Why it might not.* JPEG2000 operates at 256 × 256 and larger;
the 19 × 19 board is too small for the wavelet hierarchy to
build out meaningfully. Maximum useful decomposition depth is
~4 levels at 19 × 19; biorthogonal wavelets shine at deeper
hierarchies.

*L∞ characterisation.* Same as orthogonal wavelets — local
support, sidecar overhead.

*Verdict.* **null** at 19 × 19. **Sound for future** if LengYue
ever supports larger boards (a 50 × 50 study tool? a different
game?). File for revisit.

#### 2.6.3 Lifting schemes

*What they do.* Reformulate wavelet transforms as a sequence of
prediction-and-update steps. Lifting allows in-place
computation, integer-to-integer transforms (important for
lossless compression), and custom wavelet design.

*Why it might work.* Lifting's integer-to-integer variant
gives a strictly lossless transform — the wavelet coefficients
are integers and a finite-precision encoder doesn't lose
anything. Combined with sparsity coding, this could give a
loss-less alternative to JSON encoding.

*Why it might not.* Lossless wavelets compete with lossless
schemes (PackedBrotli, JsonProjectedBrotli), where the research
arc already established that JSON's repeated field names give
brotli more leverage than schema-aware packed formats. Lossless
lifting is no different — it ships integer coefficients in a
distribution that brotli will likely struggle with vs. raw
quantised cells.

*L∞ characterisation.* Lossless when applied to integer input;
quantisation at the boundary determines L∞.

*Verdict.* **null** — same failure mode as PackedBrotli.

### 2.7 Curvelets, ridgelets, contourlets

*What they do.* Directional wavelet-like transforms designed for
signals with curve/edge structure. Curvelets (Candès & Donoho,
2004) provide near-optimal sparse representations of C²
functions with C² singularities along curves. Contourlets (Do &
Vetterli, 2005) are a discrete-domain analogue. Ridgelets handle
straight-line discontinuities.

*Why they might work for ownership maps.* Territorial boundaries
on a Go board are *exactly* the directional-singularity structure
these transforms were designed for. Walls of stones forming
borders between black and white territory could plausibly be the
"C² singularities along curves" the curvelet literature
anticipates.

*Why they might not.* (1) Curvelets are designed for *images* —
their byte advantages assume continuous-domain structure that
takes hundreds of pixels per characteristic length-scale to
develop. The 19 × 19 board is too coarse: a territorial boundary
is at most ~3–4 cells wide and curvelet basis functions at this
scale degenerate to standard wavelets. (2) Curvelet computation
is expensive even for moderate-size images; for 19 × 19 the
overhead vastly exceeds the gain. (3) Per-coefficient sidecar
overhead is the same problem as the wavelet probe.

*L∞ characterisation.* Curvelets have provably-good sparse
representations of C² functions; truncation at K terms gives
L₂ error decaying as O(K⁻²) — better than wavelets' O(K⁻¹) at
similar smoothness. **But L∞ behaviour is again not native**;
truncation can still spike at boundary cells.

*Verdict.* **null** at 19 × 19; **sound for future** if board
size grows or if a future surface needs to compress KataGo
*influence fields* (which are continuous and would benefit from
the directional basis). File for revisit.

### 2.8 Walsh-Hadamard transform

*What it does.* Orthogonal transform with ±1 basis vectors —
the binary analogue of DFT. Coefficients are integer linear
combinations of input values (no multiplications). Used in
spread-spectrum communications, in the CCSDS standard for
satellite imagery, and historically as a cheap pre-DCT in some
codecs.

*Why it might work.* Computationally trivial — no
multiplications, no transcendental functions. If ownership-map
structure happens to align with the Hadamard basis (sectors of
roughly equal magnitude), truncation would be efficient. The
basis is fixed (no per-bundle codebook) so no sidecar overhead.

*Why it might not.* The Hadamard basis has no particular
relationship to spatial smoothness; it's designed for
applications where the natural structure is binary. Ownership
maps are smooth in space; Hadamard coefficients will not
concentrate energy as DCT or PCA would.

*L∞ characterisation.* For a 361-cell input, each Hadamard basis
vector has per-cell magnitude 1/√361 ≈ 0.053. Truncating M
coefficients can blow up L∞ by Σ|c_i| / √361 — comparable to
DCT's truncation behaviour, no better.

*Verdict.* **dumb-and-why** for compression at our regime — no
mechanism to compress smooth data efficiently. Would be sound if
ownership maps were binary (which they almost are, in
late-endgame positions — see Part 3 for whether this could be
exploited some other way).

### 2.9 Sparse coding / dictionary learning

*What it does.* Learn an overcomplete dictionary D ∈ ℝᴺˣᴹ (M > N)
such that each data point v can be approximated as v ≈ Dc with c
sparse (few non-zero coefficients). Methods: K-SVD (Aharon, Elad
& Bruckstein, 2006), MOD, online dictionary learning (Mairal,
Bach, Ponce, Sapiro, 2010), Lasso-based methods.

*Why it might work for ownership maps.* Ownership maps may have
a sparse representation in a learned dictionary — e.g., a
dictionary of "local territorial motifs" (corner territory,
side-extension, dragon-eye-shape, capture-residue) where each
ownership map is a sparse combination of ~K motifs. The sparse
combination is cheaper to encode than dense coefficients.

*Why it might not.* (1) Codebook size — even for ownership maps,
a useful dictionary needs M ≥ 1000 atoms × 361 cells × float =
~1.4 MB per dictionary. Shipping this on the SPA wire dominates.
(2) Sparse coding is expensive at encode time (Lasso-style
optimisation per packet). (3) The byte advantage depends on the
sparsity level — if the typical packet needs 50 non-zero
coefficients to reach acceptable L∞, the (index, value) pairs
already cost more than Q4 (50 × 4 bytes = 200 bytes vs Q4's
361 × 4 bits ÷ 8 = 180 bytes). Sparse coding wins only at
sparsity < 30 with high per-coefficient precision, which is a
narrow regime. (4) The sparse-coefficient sidecar (which indices
are non-zero) is the same problem as the wavelet probe.

*L∞ characterisation.* If reconstruction is exact at sparsity ≤
some threshold, L∞ is bounded by the per-coefficient quantisation.
If reconstruction is approximate (sparsity below threshold), L∞
inherits the worst per-cell residual — no analytic bound.

*Verdict.* **null** at our scale. **Sound for future** if
LengYue ever adopts per-card codebooks (the nncache_prvq
archaeology — `docs/archive/notes/nncache-prvq-archaeology-2026-05-25.md`
— is the prior art for this regime). The economics of per-card
codebooks don't transfer to our bundle sizes.

### 2.10 Compressed sensing

*What it does.* Reconstruction of sparse signals from
*sub-Nyquist* random projections. If v ∈ ℝᴺ is K-sparse in some
basis Ψ (i.e., Ψᵀv has K non-zero entries), then c = Φv with K =
O(K log(N/K)) random measurements is sufficient to reconstruct v
via convex optimisation (basis pursuit). Reference: Candès &
Tao (2006), Donoho (2006).

*Why it might work for ownership maps.* If ownership maps are
sparse in some basis Ψ (wavelets, DCT), compressed sensing lets
us measure them with very few random projections and reconstruct
exactly. The basis for sparsity matters: ownership maps are
NOT sparse in the cell basis, but they MAY be sparse in a
wavelet or local-motif basis.

*Why it might not.* (1) Sparsity claim is the open question.
The PCA probe showed ownership maps are *low-rank* (K=200 covers
99%+ variance on 361 dims), not sparse in any specific basis.
Low-rank ≠ sparse. (2) CS reconstruction is expensive
(L1-minimisation per packet at decode time) — SPA-inappropriate.
(3) Even if sparse, the per-coefficient sidecar overhead is the
same problem as everywhere else at our scale.

*L∞ characterisation.* CS has analytic L₂ bounds (RIP-based
reconstruction guarantees), but L∞ bounds are weaker and depend
on the dual-certificate properties of the sensing matrix.

*Verdict.* **null** at our scale, and **dumb-and-why** for
SPA-side decode (L1-optimisation at decode time). Useful in
regimes where the encoder is far cheaper than the decoder
(satellite sensors, MRI); the SPA's encode-decode symmetry
doesn't benefit from this asymmetry.

### 2.11 Tensor decompositions (CP, Tucker, Tensor Train)

The data tensor (T, 19, 19) is naturally 3-dimensional. Tensor
decompositions are the generalisation of matrix factorisations
(SVD, PCA) to higher-order tensors.

#### 2.11.1 CP decomposition (Canonical Polyadic / CANDECOMP/PARAFAC)

*What it does.* Decomposes a tensor T ∈ ℝᴬˣᴮˣᶜ as a sum of R
rank-1 tensors: T = Σ_{r=1..R} a_r ⊗ b_r ⊗ c_r where a_r, b_r,
c_r are vectors. Reference: Kolda & Bader (2009), "Tensor
Decompositions and Applications" — the canonical survey.

*Why it might work for ownership maps.* The (T, 19, 19) tensor
might have low CP-rank — i.e., each ownership map might be
well-approximated as a small number of separable functions
(time × row × col). Separability would correspond to "the
ownership pattern at time t looks like a product of a row-
weighting and a col-weighting", which would match patterns like
"black gets the bottom, white gets the top" smoothly.

*Why it might not.* (1) CP rank is ill-defined in the worst
case (best low-rank approximation may not exist) and CP fitting
is non-convex. (2) The separability assumption is strong —
diagonal territorial walls would break it. (3) Same L∞-vs-L₂
failure as PCA, generalised to tensor regime.

*L∞ characterisation.* Same as PCA — no analytic per-cell
bound.

*Verdict.* **sound to probe, low priority.** The separability
assumption could be tested cheaply (CP fit at low rank, measure
L₂ and L∞). If ownership maps are not well-modelled as
separable, the probe is a quick null. If they are, the
compression advantage could be substantial. Predict null with
maybe 70% confidence.

#### 2.11.2 Tucker decomposition

*What it does.* T = G ×_1 U_1 ×_2 U_2 ×_3 U_3 where G is a
"core tensor" and U_i are factor matrices on each mode. This is
the multi-linear SVD; Tucker is to multi-dim what SVD is to
2D. Reference: Kolda & Bader as above.

*Why it might work.* Tucker captures the joint structure across
all three axes (time, row, col) simultaneously — more general
than CP. The core tensor G summarises the joint structure; the
factor matrices U_i compress along each axis independently.

*Why it might not.* The core tensor G has dimension R_t × R_r ×
R_c — if rank is non-trivial along each axis, G grows
multiplicatively. For 19 × 19 spatial, even ranks of (20, 5, 5)
give G of 500 entries — not catastrophic but already a
substantial sidecar. L∞ behaviour inherits PCA's failure mode.

*L∞ characterisation.* Same.

*Verdict.* **sound to probe** as part of the same arc as CP.
Predict null with maybe 60% confidence — Tucker is more general
than CP, so if CP doesn't fit, Tucker probably will, but the L∞
problem is the same.

#### 2.11.3 Tensor Train (TT) decomposition

*What it does.* T(i_1, ..., i_d) = G_1(i_1) G_2(i_2) ... G_d(i_d)
where G_k are matrices of bounded rank. Decomposition is
SVD-based, polynomial in tensor size, and admits an analytic
controllable error. Reference: Oseledets (2011).

*Why it might work.* TT decomposition is computationally
favourable (compared to CP / Tucker) and admits an *L₂* error
bound at fixed rank. The bound is controllable.

*Why it might not.* L₂ bound, not L∞. Same structural failure
mode at our regime.

*L∞ characterisation.* Controllable L₂; no native L∞ bound.

*Verdict.* **sound for future** if a tensor approach becomes
relevant; **null** as a direct compression scheme.

### 2.12 Autoencoders (since they often masquerade as "linear projections")

*What they do.* Neural network architectures that learn a
nonlinear encoder f: v → z and decoder g: z → v̂ with z ∈ ℝᴷ.
Linear autoencoders (no nonlinearity, single layer) reduce to
PCA. Nonlinear autoencoders can capture manifold structure that
linear methods cannot.

*Why they might work.* If ownership maps lie on a low-
dimensional nonlinear manifold, a small autoencoder could
compress them very effectively. The 8 102-packet corpus is
adequate for training a small (< 100k params) autoencoder.

*Why they might not.* (1) Deploying a neural-net decoder on the
SPA at decode time is heavy weight — ~100 KB to ship the model,
plus inference overhead. (2) Autoencoder reconstructions
optimise the loss they were trained on; L₂-loss training gives
L₂-good reconstructions with the same L∞ failure as PCA. (3)
L∞-loss training is unstable and rarely converges cleanly.
(4) The "compression" arc has so far avoided trained models for
operational reasons; introducing one now would be a significant
shift.

*L∞ characterisation.* Depends entirely on training loss. L∞
training would in principle give L∞-good reconstructions but is
known to be hard to train.

*Verdict.* **sound for future** with significant caveats —
specifically, if a future arc has both (a) decided to ship a
trained model on the SPA and (b) found a stable L∞-loss
training procedure. Both are large prerequisites. **Dumb-and-
why for the current SPA encoder discipline.**

### 2.13 RKHS embeddings (Gaussian, polynomial, Matern kernels)

*What they do.* Map data into a Reproducing Kernel Hilbert
Space (RKHS) via an implicit feature map; then apply linear
methods in the RKHS. The kernel k(x, y) implicitly computes
inner products in the high-dim feature space.

*Why they might work.* Same intuition as kernel PCA — if
ownership maps have a low-dim structure in some RKHS, kernel
methods can find it.

*Why they might not.* Same problems as kernel PCA: pre-image
problem (decoder requires solving an inverse problem), expensive
inference, operational mismatch with SPA decode.

*L∞ characterisation.* No native L∞ bound; depends on the
pre-image.

*Verdict.* **dumb-and-why** for SPA-deployment, same as kernel
PCA.

### 2.14 NMF (Non-negative Matrix Factorization)

*What it does.* Factorises a non-negative data matrix V (m × n)
into V ≈ WH where W (m × k) and H (k × n) are non-negative.
Reference: Lee & Seung (1999).

*Why it might work.* Ownership maps are NOT non-negative (range
[−1, 1]), but the |ownership| or the "control" version
(remapping [−1, 1] → [0, 1]) is. NMF on |ownership| could
capture additive structure of "regions of influence" naturally.

*Why it might not.* (1) Sign loss — must store sign separately
(361 bits = 46 bytes overhead per packet, plus the NMF coding
itself). (2) NMF is L₂-grade; same failure as PCA. (3) NMF
basis vectors are non-negative and have less mathematical
structure than orthogonal bases; truncation behaviour is
ill-characterised.

*L∞ characterisation.* No native bound; truncation behaviour is
not well-studied for NMF specifically.

*Verdict.* **null** at our regime; could be **sound for future**
if the "regions of influence" interpretation pays off
diagnostically (Part 2 could use NMF as a structure-probe
without shipping it as an encoder).

### 2.15 Block-wise / patch-wise transforms

*What they do.* Apply a transform (DCT, wavelet, learned) to
non-overlapping or overlapping blocks of the input rather than
to the whole input. JPEG's 8 × 8 DCT blocks are the canonical
example.

*Why they might work for ownership maps.* On 19 × 19, block
size = 5 × 5 or so. Patch-wise transforms could capture local
structure (territory blocks) more efficiently than global
transforms. Each block's coefficients are quantised; brotli
across blocks captures inter-block redundancy.

*Why they might not.* (1) Block boundary artifacts (JPEG's
infamous blocking). At small block sizes on small boards, the
boundary artifacts dominate. (2) Block coefficients ship as a
2D index (block_id, coeff_id) — sidecar overhead. (3) The
problem is similar to per-cell wavelets at one scale up — same
sidecar failure mode.

*L∞ characterisation.* Block-wise L₂ truncation; per-block L∞
inherits the transform's failure mode.

*Verdict.* **null** at our scale (block size too small to win,
boundary artifacts too prominent).

### 2.16 Method-survey summary table

For quick reference (verdicts pin the "would I probe?" decision):

| family | method | L∞ native bound | sidecar bytes | verdict |
|---|---|---|---|---|
| PCA | standard PCA | no | basis (amortisable) | null (probed) |
| PCA | sparse PCA | tighter, no analytic | basis + sparsity pattern | sound for future |
| PCA | robust PCA | partial (sparse part) | sparse component sidecar | null |
| PCA | probabilistic PCA | no | basis | null |
| PCA | kernel PCA | no (pre-image needed) | data points or pre-image solver | dumb-and-why |
| ICA | FastICA | no | basis | sound to probe (low priority) |
| KLT | per-segment KLT | no | per-segment bases | null as encoder |
| Random | JL random projection | no | (just seed) | dumb-and-why |
| Fourier | 1D DCT (time) | partial | per-coefficient sidecar | null (probed analog) |
| Fourier | 2D DCT (space) | partial (Gibbs) | per-coefficient | null (user prior null) |
| Fourier | DFT | partial | complex pairs | dumb-and-why (DCT strictly better) |
| Fourier | DST | partial (wrong BC) | per-coefficient | null |
| Wavelet | Symlet / Coiflet | per-coefficient local | per-coefficient | null (same as db4) |
| Wavelet | biorthogonal (CDF 9/7) | per-coefficient local | per-coefficient | null (sound for future, larger boards) |
| Wavelet | lifting integer-to-integer | lossless | none if pure | null (vs PackedBrotli precedent) |
| Wavelet | curvelets / contourlets / ridgelets | depends | per-coefficient | null (sound for future, larger boards) |
| Hadamard | Walsh-Hadamard | no | none (basis is fixed) | dumb-and-why |
| Sparse | K-SVD dictionary learning | partial | dictionary | null (sound for future per-card) |
| Sparse | compressed sensing | partial | (seeded sensing matrix) | dumb-and-why (decode cost) |
| Tensor | CP decomposition | no | factor matrices | sound to probe (low priority) |
| Tensor | Tucker decomposition | no | core tensor + factors | sound to probe (low priority) |
| Tensor | Tensor Train | no (L₂-bounded) | core matrices | sound for future |
| Other | autoencoders (deep) | training-dependent | model weights | dumb-and-why (current); sound for future |
| Other | RKHS embeddings | no | data / pre-image | dumb-and-why |
| Other | NMF | no | basis | null (could be diagnostic) |
| Other | block-wise transforms | no | per-block | null at our board size |

The summary reads as bleak relative to byte-XOR Q4. **This is the
substantive finding of the survey** — for the (T ≈ 200, S = 361,
L∞-primary) regime, the L₂-optimal projection methods nearly all
fail on L∞ for the structural reason in §1.5, and the
spatially-localised methods (wavelets, curvelets) fail on sidecar
overhead at our scale.

The four **sound to probe** entries (sparse PCA, ICA, CP, Tucker)
are flagged as low-priority precisely because their predicted
benefit is conditional on observations the framework in Part 2
would surface; running them ahead of the framework is the same
kind of "ad-hoc probe → eyeball result" cycle that the followups
note flags as inefficient.

---

## 3. Question 2: quantitative framework for time-axis vs. space-axis tradeoffs

### 3.1 The motivation, re-stated

The user's framing:

> "We need a disciplined quantitative way to think about this
> tradeoff and compare the different methods under such a metric
> (or family of metrics)."

The followups note's elaboration (Idea 4): a framework should let
us compare methods on a principled axis-of-comparison rather than
ad-hoc per-probe comparison. It needs to:

1. Decompose the data tensor's structure along time/space/joint
   axes — independently of any compression method.
2. Profile each compression method by which structure it
   exploits and at what error cost.
3. Produce rate-distortion curves in multiple error spaces
   (L∞, L₂, JSD) so the multi-objective Pareto frontier is
   visible.
4. Surface the operational cost (encode/decode time, codebook
   bytes, decode complexity) as a third axis.

### 3.2 The framework's input

A corpus tensor of shape (N, T, 19, 19) where N is the number of
bundles, T is the per-bundle packet count (variable; the
framework should accept the corpus as a list of tensors per
bundle), values in [−1, 1].

Optionally accompanying metadata: per-packet move number, per-
bundle game ID, per-bundle KataGo model. These enable
stratification (e.g., "rate-distortion curve restricted to
endgame packets only").

The current corpus: 40 games, 8 102 packets, in Redis at
127.0.0.1:6380 under keys `traj:{stem}:t{turn}:r0` per the
research arc.

### 3.3 The framework's components

#### 3.3.1 Structure decomposition (axis-marginals + joint)

The goal: quantify how much information / variance lives in
each axis's marginal vs. in the joint structure beyond marginals.

**Definition (ANOVA-like variance decomposition).** Let
v(b, t, s) be the ownership value for bundle b, packet t, cell
s. Define:

- μ = E[v] (grand mean)
- μ_s(s) = E_{b,t}[v(b, t, s)] − μ (per-cell mean deviation —
  the "average ownership pattern")
- μ_b(b) = E_{t,s}[v(b, t, s)] − μ (per-bundle mean deviation —
  the "average ownership across this game")
- μ_bs(b, s) = E_t[v(b, t, s)] − μ_s(s) − μ_b(b) − μ (per-cell
  per-bundle residual: how this bundle's cells differ from the
  average pattern)
- μ_bt(b, t) = E_s[v(b, t, s)] − μ_b(b) − μ (per-bundle per-
  packet mean residual — "scoreLead-like aggregate")
- μ_st(t, s) — not directly defined since t is bundle-specific;
  use packet position normalized
- joint residual r(b, t, s) = v − μ − μ_s − μ_b − μ_bs − μ_bt
  − μ_ts (using whatever marginals are well-defined)

Then compute variance contributions:

- V_total = Var(v)
- V_s = Var(μ_s) — "how much of the total variance is
  per-cell-mean structure" (the "average ownership pattern"
  that's the same across all packets)
- V_b = Var(μ_b) — "how much variance is per-bundle aggregate"
- V_bs = Var(μ_bs) — "how much variance is per-bundle per-cell
  but constant across packets"
- V_bt = Var(μ_bt) — "how much variance is per-bundle per-packet
  but constant across cells"
- V_joint = Var(r) — "how much variance is genuinely joint
  bundle × packet × cell, beyond all the marginals"

These should sum to V_total (modulo finite-sample correction
terms). The fractions V_x / V_total give the structure profile
of the corpus.

**Pseudocode** (NumPy, illustrative):

```python
import numpy as np

def variance_decomposition(corpus: list[np.ndarray]) -> dict:
    """
    corpus: list of (T_b, 361) ownership arrays, one per bundle.
    Returns variance fractions for each marginal + residual.
    """
    all_packets = np.concatenate(corpus, axis=0)  # (sum T_b, 361)
    mu = all_packets.mean()
    mu_s = all_packets.mean(axis=0) - mu  # (361,)

    contributions = {}
    contributions["total"] = all_packets.var()
    contributions["mu_s"] = (mu_s ** 2).mean()  # per-cell mean variance

    # ... per-bundle, per-packet, joint residual terms ...
    return contributions
```

**What the decomposition tells us.** For the LengYue corpus,
the expected pattern (testable, not yet measured):

- V_s likely small — the per-cell mean across all games is near
  zero (averaging "this cell tends to be black" across games
  with random colour assignments).
- V_b moderate — bundles differ in average ownership (game
  outcome, komi, etc.).
- V_bs likely substantial — given the bundle, the average
  ownership pattern over packets is informative (this game has
  black taking the lower-left corner).
- V_bt small — per-packet aggregate ownership changes slowly
  over a single bundle's packets.
- V_joint — this is the residual structure that compression has
  to actually capture; everything else can be predicted from the
  marginals.

The framework's first output: "V_joint / V_total fraction" —
the "irreducible" structure beyond marginals. **If V_joint is
small, simple marginal-based methods will compress well.** If it
dominates, joint methods are needed.

#### 3.3.2 Per-method structure-capture profile

For a compression method M, we want to measure how much of each
variance-component is preserved in the reconstruction.

**Definition.** For a method M producing v̂ from v, let
e = v − v̂ be the per-cell reconstruction error. Decompose e
into the same ANOVA components: e_s, e_b, e_bs, e_bt, e_joint.
Compute the "capture fractions":

- C_s(M) = 1 − Var(e_s) / Var(μ_s) — fraction of per-cell mean
  variance preserved
- C_b(M) = 1 − Var(e_b) / Var(μ_b)
- C_bs(M) = 1 − Var(e_bs) / Var(μ_bs)
- C_bt(M) = 1 − Var(e_bt) / Var(μ_bt)
- C_joint(M) = 1 − Var(e_joint) / Var(r)

Each C_x(M) ∈ [−∞, 1]. A value of 1 means "this variance
component is reconstructed exactly"; values close to 0 mean "this
component is mostly lost"; negative values are diagnostic of
encoding misbehaviour (the method made some components *worse*).

**What this profile tells us.** A method specialised to spatial
structure (PCA on cells) would score high on C_bs and C_joint
spatial slices, lower on temporal. A method specialised to
temporal structure (per-cell time-axis wavelets) would do the
opposite. A method doing both well (a tensor decomposition, an
autoencoder) would score high across the board.

**Combined with rate-distortion (next sub-section), this lets us
ask "for a given byte budget, which axis of structure does
method M extract best?"** That's the comparison the user is
asking for.

#### 3.3.3 Rate-distortion curves in multiple error spaces

For a method M with hyperparameter set θ (e.g., PCA's K, or
uniform-quant's bits-per-cell):

- **Rate** R(M, θ) = post-brotli bytes per bundle (averaged across
  the corpus).
- **Distortion** in several spaces:
  - D_L∞(M, θ) = max over (b, t, s) of |v − v̂| (corpus worst-case)
  - D_L∞_p95(M, θ) = 95th percentile of per-bundle max |v − v̂|
  - D_L2(M, θ) = RMS over all (b, t, s) of (v − v̂)
  - D_JSD(M, θ) = Jensen-Shannon divergence between the
    normalised ownership distribution per packet and its
    reconstruction (relevant when ownership is treated as a
    soft probability)

Each method M produces a *curve* in (R, D_X) space parameterised
by θ. **Overlay the curves for all methods and the Pareto
frontier becomes visible per error space.**

**Pseudocode** (illustrative — the actual probe runner does the
heavy lifting):

```python
def rate_distortion_curves(corpus, methods, hyperparams):
    results = []
    for M in methods:
        for theta in hyperparams[M]:
            rate = measure_post_brotli_bytes(M, theta, corpus)
            distortions = {
                "L_inf": worst_case_per_cell_error(M, theta, corpus),
                "L_inf_p95": p95_per_bundle_max(M, theta, corpus),
                "L_2": rms_error(M, theta, corpus),
                "JSD": mean_jsd(M, theta, corpus),
            }
            results.append({"method": M, "theta": theta, "rate": rate,
                            **distortions})
    return results
```

**Pareto frontier extraction.** For each error space D_X, sort
all (rate, D_X) points by rate ascending; keep only points where
D_X is strictly less than all previous points (the Pareto-optimal
ones). Methods not on the frontier are dominated for that error
space; their conditional value (if any) is in another error
space or in the structure-capture profile.

#### 3.3.4 Operational complexity as a third axis

Bytes and error matter; so does compute. Three operational costs
need surfacing per method:

- **T_encode(M)** — encode time per packet (or per bundle) in
  milliseconds. The SPA's auto-save fires every ~2s during
  active analysis; encode must comfortably fit under this.
- **T_decode(M)** — decode time per packet. The decoder runs on
  page load and on every fetched bundle; comparable budget.
- **Codebook bytes / model bytes** — any per-corpus or
  per-method data the SPA must hold in memory to encode/decode.
  PCA's basis is 361 × K × 8 = 2.9K-byte-per-K coefficient;
  small. An autoencoder's weights would be 50KB+.

These should be reported alongside the rate-distortion curves
and would inform a third Pareto dimension. A method that
dominates on (rate, distortion) but exceeds T_encode budget is
operationally infeasible regardless.

### 3.4 The framework's outputs

For each method M and each hyperparameter setting θ:

1. **Rate** R(M, θ) — post-brotli bytes per bundle (mean across
   corpus + std).
2. **Distortion vector** [D_L∞, D_L∞_p95, D_L2, D_JSD].
3. **Structure-capture profile** [C_s, C_b, C_bs, C_bt, C_joint].
4. **Operational cost** [T_encode, T_decode, codebook_bytes].

These per-(M, θ) results are collated into per-method curves,
and curves are overlaid into per-error-space Pareto plots.

### 3.5 The framework's discipline — what it forbids

The framework prescribes that any new compression-method probe
must report all four output families. Specifically:

- **It is not enough to report bytes.** A method that beats the
  byte budget at the cost of L∞ regression is not an improvement;
  the multi-error reporting forces this comparison.
- **It is not enough to report L₂.** The PCA framing-error was
  exactly the "report L₂ variance, ignore L∞" failure; the
  framework requires every metric in the distortion vector.
- **Codebook bytes count toward the rate.** The original PCA
  probe's mis-framing counted per-bundle codebook bytes; the
  corrected version uses a global basis (codebook amortised).
  The framework specifies the amortisation rule: global codebook
  bytes are divided by N_bundles in the corpus; if the
  amortisation falls below ~1% of the per-bundle rate, the
  codebook is effectively free.
- **Operational cost is reported even if it's small.** If a
  method has T_encode = 1ms, that's a feature; if it has
  T_encode = 500ms, that's a deal-breaker for auto-save. Either
  way, the number is in the table.

### 3.6 The framework's discipline — what it enables

Concrete queries the framework answers (each formerly an ad-hoc
question):

- **"Which method has the cheapest bytes-per-bundle subject to
  L∞ ≤ 0.06?"** Sort post-brotli bytes ascending, filter on
  L∞-distortion constraint, take the first row.
- **"Does method M capture temporal structure better than
  spatial?"** Compare C_bt vs C_bs for M.
- **"Is there headroom beyond uniform Q4?"** Look at the Pareto
  frontier in (rate, L∞); if uniform Q4 is on the frontier, no
  L∞-respecting method beats it; if not, the method that
  dominates is the next candidate.
- **"Does the byte-XOR delta exploit V_bt (temporal aggregate)
  more than V_joint (full joint structure)?"** Compute capture
  profile of byte-XOR Q4 and compare.

### 3.7 Where the framework would live in the repo

If the framework is built, it would live under
`research/compression/framework/` as a Python module separate
from the probe scripts. The probe scripts would then call into
the framework rather than re-implementing measurement code each
time. A reference runner `run_framework_on_method.py` would take
a method (Compressor subclass) and a hyperparameter range and
emit the four-output-family report.

Operationally, the framework would consume the existing Redis
corpus at 127.0.0.1:6380 via the same harness as the bundle
bench (`research/compression/bundle_bench.py`, per the research
arc archive).

### 3.8 A worked example — applying the framework to the shipped methods

To make the framework concrete, here's what its output would
look like applied to the three shipped variants + the two
already-probed-and-filed-null variants:

| method | hyperparams | rate (bytes/bundle, mean) | D_L∞ | D_L∞_p95 | D_L2 | C_s | C_b | C_bs | C_bt | C_joint | T_encode (ms) | T_decode (ms) | codebook_bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v1-json (canonical) | — | ~3.4 MB | 0 | 0 | 0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | <1 | <1 | 0 |
| v2-projected | — | ~795 KB | 0 | 0 | 0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | <1 | <1 | 0 |
| v2-quantized Q4 | bits=4 | ~441 KB | 0.0625 | 0.0625 | ~0.04 | ~1.00 | ~1.00 | ~1.00 | ~1.00 | ~0.99 | ~5 | ~5 | 0 |
| v2-quantized-hifi Q8 | bits=8 | ~430 KB (estimate) | 0.0039 | 0.0039 | ~0.002 | ~1.00 | ~1.00 | ~1.00 | ~1.00 | ~1.00 | ~5 | ~5 | 0 |
| byte-XOR Q4 | — | ~424 KB | 0.0625 | 0.0625 | ~0.04 | ~1.00 | ~1.00 | ~1.00 | ~1.00 | ~0.99 | ~5 | ~5 | 0 |
| PCA K=200 q8 | K=200 | ~1.5 MB | 0.48 | ~0.4 | ~0.005 | ~1.00 | ~1.00 | ~0.99 | ~0.99 | ~0.99 | ~50 | ~50 | ~580 KB amortised |
| PCA K=50 q8 | K=50 | ~367 KB | 1.11 | ~0.7 | ~0.04 | ~1.00 | ~1.00 | ~0.95 | ~0.95 | ~0.90 | ~30 | ~30 | ~145 KB amortised |
| PCA K=10 q8 | K=10 | ~75 KB | 1.71 | ~1.5 | ~0.20 | ~1.00 | ~1.00 | ~0.80 | ~0.85 | ~0.50 | ~15 | ~15 | ~29 KB amortised |

(The capture-profile entries above are illustrative — actual
values would come from running the decomposition on the corpus.)

What jumps out from the worked example:

1. **PCA's structure capture is high across the board even at
   low K** (C_b, C_bs, C_bt are all ~1.0 by K=50) — PCA *is*
   capturing the corpus's structure efficiently. The failure
   mode is not "PCA missed the structure"; it's "PCA's residual
   error has the wrong shape for L∞".
2. **Byte-XOR Q4 vs Q4** identical on every distortion axis;
   the 4% advantage is purely in the rate column. This is the
   right way to surface that improvement.
3. **Q4 dominates the L∞-constrained Pareto frontier** —
   nothing else has L∞ ≤ 0.0625 at comparable bytes.
4. **For L₂-constrained Pareto, PCA K=200 wins** — if the
   application were L₂-grade, PCA would be the right shipped
   default. The application is not L₂-grade.

This worked example, computed for real, would be the first
deliverable of the framework's implementation. It establishes
the baselines against which new methods would be measured.

---

## 4. Synthesis — which methods would actually be worth probing if the framework existed

Pulling Question 1's verdicts through Question 2's framework
filter: which methods, if the framework were built and applied,
would be informative to probe?

The "sound to probe" methods from §2.16, **conditional on the
framework giving them a sharper question**:

### 4.1 ICA — to test for non-Gaussian sources

**Conditional probe trigger.** Compute the structure decomposition
(§3.3.1). If V_joint is large relative to V_bs + V_bt + V_b, then
the joint structure has substantial irreducible content beyond
marginals — and the question becomes "what's the right basis for
that joint structure?". PCA gives one answer (L₂-optimal); ICA
gives another (independence-optimal). If the joint structure has
non-Gaussian components (heavy-tailed coefficient distributions
in some basis), ICA's basis would have more localised support
per component and potentially better L∞ truncation behaviour.

**What to measure.** Compare ICA's basis to PCA's; check whether
ICA components have visibly more spatial localisation (i.e., are
supported on fewer cells). If yes, run the full framework
profile on ICA and compare to PCA at matched rate.

**Predicted outcome.** Modest improvement at the L∞ Pareto
frontier. Not enough to dethrone Q4, but informative for the
framework as a method whose structure-capture profile differs
visibly from PCA's.

### 4.2 Sparse PCA — to test for sparsely-supported high-energy components

**Conditional probe trigger.** Suppose ICA shows that PCA's
high-eigenvalue components are spatially extended (high-energy,
delocalised) while a few low-eigenvalue components are spatially
localised (low-energy, "wild cells"). Then sparse PCA with
support per component bounded by ~10 cells might capture both
regimes with one method.

**What to measure.** Same framework outputs. Particular interest
in C_joint and D_L∞_p95 — sparse PCA's hypothesis is that it
suppresses the "wild" L∞ failure of PCA at the cost of slightly
worse L₂. The framework would expose this trade-off
quantitatively.

**Predicted outcome.** Modest L∞ improvement over PCA at matched
rate; still likely worse than Q4 on L∞. Useful as a way to
understand PCA's failure mode but probably not as a shipping
encoder.

### 4.3 Tensor decompositions (CP / Tucker) — to test for separable structure

**Conditional probe trigger.** Compute V_bs (per-bundle per-cell
constant across packets). If V_bs is a large fraction of V_total,
the (b, s) joint marginal carries a lot of structure — i.e., "the
average ownership pattern across a bundle's packets" is bundle-
specific and informative. This is exactly the structure a CP
decomposition would capture: each bundle's ownership tensor
factors as (time-vector × space-pattern).

**What to measure.** Fit CP at varying ranks; framework outputs
as above; particular attention to C_bs.

**Predicted outcome.** If V_bs is dominant, CP at low rank could
give substantial savings. If V_joint dominates (the per-packet
deviation from the bundle's average is the actual signal), CP is
no better than PCA.

### 4.4 Hybrid methods — Q4 plus residual encoding

This isn't in the canonical method list but the framework would
make it obvious: take the Q4-quantised reconstruction as a
"first pass", compute the residual (v − Q4(v)), and encode that
residual via PCA or another method. The L∞ guarantee is
preserved (Q4's max-abs bound holds on the first pass; residual
encoding can only reduce L∞), and the residual is much smaller
than the original.

**Framework signal.** The residual after Q4 is the "wild"
component that uniform quantisation cannot capture cheaply.
Its structure decomposition would tell us whether it's mostly
noise (no further compression possible) or structured. If
structured, residual encoding could give modest additional
savings *without sacrificing L∞*.

**Predicted outcome.** A small but principled win. The residual
is high-entropy (Q4 already removed the low-frequency structure
brotli was finding) so the gains are bounded — maybe 2-5% beyond
the 4% byte-XOR gain. But the gain comes with L∞ preservation,
which is the right shape.

This is the most-likely-to-be-fruitful direction in the survey.
The framework's decomposition would identify whether the Q4
residual has remaining structure worth chasing.

### 4.5 What should NOT be probed even with the framework

The methods tagged "dumb-and-why" or "null" remain so under the
framework. Specifically:

- **DCT (1D or 2D)** — user's prior null + Gibbs failure mode +
  framework would just confirm the L∞ regression.
- **Random projections** — wrong tool for the job (L₂ distance
  preservation ≠ reconstruction).
- **Kernel methods / autoencoders / compressed sensing** —
  operational mismatch with SPA decode discipline.
- **Wavelets / curvelets** — sidecar overhead structural at our
  scale, framework would just confirm.

The framework's value is not "let's probe everything"; it's
"let's probe the things whose verdict is conditional on
observations the framework would surface, and not probe the
things whose verdict is structurally settled."

### 4.6 The framework first; then probes

The synthesis recommendation:

1. **Build the framework first** (the four-output-family
   reporter applied to existing methods).
2. **Run it on the shipped baselines + already-probed nulls** to
   establish the baseline picture (this is the worked example in
   §3.8, with actual numbers).
3. **Examine the structure decomposition** of the data — if
   V_joint is large, conditional probes (§4.1–4.4) become
   high-priority. If V_joint is small, then "uniform Q4 +
   marginal corrections" is essentially optimal and the
   compression arc can saturate without new methods.
4. **Probe only conditional-trigger methods** under the framework
   discipline.

This order respects the followups note's discipline: the
framework would have caught the PCA mis-framing automatically;
running it first prevents the next equivalent error.

---

## 5. Operational caveats — SPA-deployment realities

These are the constraints any "interesting" method must satisfy
to ship, independent of byte / error performance.

### 5.1 Encode budget

The SPA's `analysisAutoSave` triggers on ~2s of analysis-pause.
The encode for a single bundle must comfortably fit under this
window — typical bundle size is ~200 packets, so per-packet
encode time should be < 10ms to leave headroom for the network
PUT and the next analysis cycle.

For reference: the shipped Q4 quantiser encodes a 361-cell
ownership map in well under 1ms in TypeScript. Anything orders
of magnitude slower is operationally inappropriate.

This budget rules out:

- L1-minimisation per packet (compressed sensing decode).
- Iterative optimisation per packet (sparse coding via Lasso,
  some autoencoder fine-tuning).
- Anything requiring per-packet basis fitting (per-bundle PCA).

### 5.2 Decode budget

The SPA decodes bundles on board load and on every fetched
bundle. The decoder runs in the user's browser; a 100ms+ decode
per bundle would be visible.

For reference: the shipped Q4 decoder is < 1ms per packet.

This budget rules out:

- Pre-image computation for kernel methods.
- Iterative reconstruction (CS recovery).
- Large neural-net inference.

### 5.3 Codebook / model size

Any method that ships codebook bytes or model weights must fit
in the SPA's bundle. JavaScript bundles typically aim for
< 500 KB gzipped; spending 100 KB on a compression codebook is
a noticeable fraction.

This rules out:

- Per-card codebooks (the nncache_prvq pattern doesn't transfer).
- Deep autoencoder weights (~100 KB minimum for useful
  capacity).
- Large dictionary-learning codebooks.

Globally-fit codebooks (PCA basis at K=10 to K=200, sparse
dictionaries at small M) fit but are non-trivial; they have to
beat Q4 by enough to justify the bundle bytes.

### 5.4 Encoder/decoder symmetry

The SPA encodes and decodes. Methods where encoding is cheap
and decoding is expensive (compressed sensing) or vice versa
(some learned compression schemes) are still constrained by
the more expensive side.

### 5.5 Cross-team coupling

Every method change touches the wire shape. The dispatch / ADR
discipline applies: a new method requires a wire-shape
amendment, a backend codec-dispatch update if the format
descriptor changes, and a documentation update across the doc
graph (FEATURES.md, frontend FILES.md, possibly the architecture
note).

This is operational overhead that scales with method-velocity.
The framework's value here is that it makes the *decision* to
ship cheap (well-defined comparison), so the *implementation*
cost can be amortised over genuine improvements.

### 5.6 Format descriptor / migration burden

Each new method is a new `wire_format` value (per the v2
implementation ledger). The format descriptor is stored
verbatim and the codec dispatch lives in the backend repository
adapter. Adding a method:

- Frontend: new `ENCODERS_BY_SCHEME` entry, new entry in
  `BUNDLE_COMPRESSION_SCHEMES`, registry value rename if
  needed, new tooltip.
- Backend: new entry in the codec dispatch in the adapter.
- Tests: round-trip tests on both sides.
- Doc graph: dispatch chain, FEATURES, FILES.

This is non-trivial overhead. The framework should produce
strong-enough signal that the operational cost is justified —
the implication is that **the framework should not motivate
five new methods at once**; the right velocity is probably
"one new method per arc, well-justified by the framework's
output, shipped to ramen-test against user reality".

### 5.7 Backward compatibility

The v1 / v2 backward compatibility shape from the implementation
ledger is the right model: legacy formats are read indefinitely;
new writes go through the latest method. This means a new method
adds *complexity* to the system (one more variant to maintain on
read-side) without removing the old.

The corresponding discipline: **don't ship methods that aren't
robustly better.** A method that wins by 3% in some narrow case
is not worth the dispatch-table entry and the read-side
maintenance burden. The framework's threshold for "worth
shipping" should probably be "Pareto-improves the rate-distortion
frontier in at least one of L∞ / L₂ / JSD at a meaningful
margin" — and "meaningful" should be calibrated against the user
experience, not against statistical significance.

---

## 6. Closing summary

The survey returns predominantly null verdicts for the L∞-primary
ownership-map regime at 19 × 19 × ~200-packet scale. The
structural reason is one fact named in §1.5: L₂-optimal linear
projections do not give L∞ bounds, and the L∞-bounded
spatially-localised projections (wavelets, curvelets) have
per-coefficient sidecar overhead that defeats the byte budget at
this scale. Uniform Q4 has analytic L∞ bound from per-cell
independent quantisation; that's the regime where it dominates.

The framework proposed in Part 2 is the right next step before
any more method probes — its principal value is *not* in
discovering new methods but in **preventing the next
PCA-mis-framing-style failure** and in **making conditional
probes (the four "sound to probe" entries in §2.16) carry sharper
ex-ante hypotheses**. Once the framework's structure-decomposition
output is in hand, the conditional probes either become high-value
(if V_joint is large and motivates the conditional methods) or
they become further nulls (if the corpus's structure is mostly
captured by marginals and Q4 + residual encoding saturates).

The most likely real improvement direction — **Q4 + residual
encoding via a method discovered from the framework's
structure-decomposition output** (§4.4) — would preserve L∞ by
construction (residual encoding only reduces L∞) while harvesting
whatever structure remains after Q4. The framework would tell us
whether such residual structure exists and what its character is;
without the framework, the residual-encoding direction is a
plausible guess.

The synthesis recommendation, in priority order:

1. **Build the framework** (Part 2). Apply it to the shipped
   baselines + already-probed nulls. This produces the §3.8
   worked example with real numbers.
2. **Run the structure decomposition** on the corpus. Report
   V_s, V_b, V_bs, V_bt, V_joint as fractions of V_total.
3. **Decide based on the decomposition** whether the conditional
   probes (ICA, sparse PCA, CP, Tucker, Q4-plus-residual) carry
   ex-ante hypotheses sharp enough to justify the operational
   overhead of new wire-format entries.
4. **If yes, probe the highest-priority one** (likely Q4-plus-
   residual). If no, file the compression arc as
   essentially-saturated at v2-quantized + byte-XOR Q4 and turn
   attention elsewhere.

The compression arc has reached the regime where ad-hoc probes
have diminishing returns; framework-first discipline is the next
productivity step.

License: Public Domain (The Unlicense)
