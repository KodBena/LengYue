# Compression research — follow-up directions

A working scratch-pad for compression-research ideas that haven't
been tested (or that we tested and want to revisit later). Pairs
with `docs/notes/analysis-bundle-compression-plan.md` (the
implementation note) and
`docs/archive/notes/analysis-bundle-compression-research-2026-05-25.md`
(the original research arc's summary).

- **Status:** Open scratch-pad. Anything in this note may turn
  into a probe under `research/compression/` or a shipped
  encoder leaf; both outcomes are valid, and so is "filed and
  not pursued".
- **Genre:** Research-direction note. Captures the design space
  + an honest "is this idea sound or dumb" assessment per item.

## Pinned: what we know works (and what's left on the table)

After the 2026-05-25 research arc + the v2 implementation arc:

- **Projection** of unmodelled fields: solid win regardless of
  the lossy stage. Already shipped as the base of `v2-projected`.
- **Uniform-quant on bounded fields** (Q4 ownership / Q8-factored
  policy): solid win, analytic max-abs is the gate-friendly form.
  Already shipped as `v2-quantized` / `v2-quantized-hifi`.
- **Brotli on the result**: solid win, ~3× ratio on the SPA wire.
  Backend applies unconditionally.
- **Byte-level XOR delta on Q4 ownership** (2026-05-26 probe):
  modest, consistent ~4% post-brotli win. Tight distribution
  (median = mean = aggregate = 4.0%, p95 ≥ 1.8%, one game in 40
  regresses 1.4%). Implementation cost is low (a single XOR
  per packet). Pending ship/skip call.
- **Pair-list / bitmap P-frame delta on Q4 ownership** (2026-05-26
  probe): **regresses 15.7% post-brotli**. Brotli's LZ77 already
  finds the temporal correlation more efficiently than the
  explicit delta encoding does. Filed as null.

The remaining headroom — where this note's ideas sit — is mostly
in **cross-cell structure** and **cross-time structure** that
brotli is not designed to exploit (it's a general-purpose byte
compressor; it has no concept of "this is a 19×19 board" or
"this cell relates to its neighbours by adjacency").

---

## Idea 1 — PCA reference, top-K coefficients

**The proposal.** Treat each ownership map as a 361-dim vector.
Compute PCA across a representative corpus. Compress each map by
storing its top-K coefficients (in the PCA basis), reconstruct by
matrix-multiplying back through the codebook (the eigenvectors).

**Probe result (2026-05-26).** Filed under
`research/compression/probe_pca_ownership.py`. Global basis fit
on all 40 games, Q8 on basis + coefficients, basis bytes counted
once (amortised).

```
variant                    coefs+br   total+br   vs xor   max-abs
byte-XOR Q4 (baseline)      441,853    441,853   1.000×    0.0625
PCA K=10 q8                  72,150     74,676   0.169×    1.71 ⚠
PCA K=50 q8                 355,483    366,924   0.830×    1.11 ⚠
PCA K=200 q8              1,466,016  1,511,495   3.421×    0.48 ⚠
```

The user's framing-correction was right: basis change at full
rank is never worse than the data, and PCA absolutely **can**
compress to smaller bytes than Q4 (K=10 q8 is 5.9× smaller than
byte-XOR at this configuration).

But the load-bearing catch: **PCA truncation optimises L₂
(total variance), not L∞ (per-cell max-abs)**. Variance
fractions captured: K=10 → 58%, K=50 → 94%, K=200 → 99%+. The
remaining variance concentrates on individual cells in
high-frequency / low-energy directions, blowing up max-abs even
when L₂ truncation error is small.

For Q4's L∞ guarantee (≤ 0.0625 per cell), PCA would need K
close to 361 (full rank), at which point the bytes-savings
disappear. Different geometric criteria.

**Sound or dumb.** Sound as a *reference*. The probe is
instructive — it confirms that the structural reason brotli on
Q4 is hard to beat for this application is the **L∞ vs L₂
trade-off**, not "brotli has secret powers". If a future
application needs *L₂ fidelity* (RMS-style metrics, statistical
analysis over the cell distribution), PCA-style truncation
becomes the right tool. For an SPA where the user looks at one
specific cell at a time, L∞ matters.

**Filed as null** for ownership compression at our requirements.

### 2026-05-26 framework-driven ICA probe (post-investigation-note)

Investigation note §4.1 flagged ICA as "conditionally sound to
probe if the R component shows non-Gaussian structure". The
2026-05-26 diagnostic probe
(`research/compression/probe_r_component_structure.py`) found
strongly non-Gaussian R structure: ICA component kurtosis is
**8-15× higher than PCA's** (mean 14.6 vs 1.6). The conditional
trigger fired.

The follow-up method probe
(`research/compression/framework/methods_ica.py`,
`bundle-mean+ica-K{10,20,50,100}` in the framework's baseline
suite) measured the four output families. Headline:

```
method            total bytes  L∞ corpus  L₂ RMS   C_R     status
byte-xor-q4        442 KB       0.0625    0.038    0.989   ← winner
ica-K10            119 KB       1.82 ⚠    0.255    0.439   L∞ catastrophe
ica-K20            207 KB       1.83 ⚠    0.203    0.644   L∞ catastrophe
ica-K50            482 KB       1.35 ⚠    0.127    0.861   L∞ catastrophe
ica-K100         1,035 KB       1.25 ⚠    0.078    0.947   L∞ catastrophe
```

ICA succeeds on bytes (K=10 is 27% the size of byte-XOR-Q4)
and on R-capture (K=100 captures 95% of R). But every operating
point produces L∞ > 1.0 — meaning some cells reconstruct off
by more than the full [-1, 1] range. **Heavy-tailed components
are exactly the ones whose truncation produces concentrated
error**: the non-Gaussianity that ICA exploits is also what
makes truncation pathological in L∞.

Same structural failure as PCA from §1.5 of the investigation
note. The framework now has empirical confirmation: **L₂-optimal
projections lack L∞ bounds, and non-Gaussianity doesn't fix it.**

**Filed as null** for ownership compression at L∞-primary use
cases. ICA *would* be the right tool for an L₂-primary
downstream (statistical analysis, palette-fitting, etc.) — file
under "if a future arc needs L₂-faithful reconstruction".

### 2026-05-26 — byte-XOR layered on Q4-residual variants

The Q4-plus-residual probes from earlier had byte-level temporal
structure left unexploited; layering byte-XOR on top should have
been a free win. The framework measured both layered variants:

```
method                                  post-brotli  L∞      Δ vs non-XOR
bundle-mean+q4-residual                  388 KB      0.099   —
bundle-mean+q4-residual+xor              398 KB      0.099   +2.5% ⚠
bundle-mean+q4-residual-percell          705 KB      0.070   —
bundle-mean+q4-residual-percell+xor      641 KB      0.070   −9% ✓
```

The **global-range variant regresses** under XOR. Reason: the
raw Q4-residual stream already has high pattern density (most
residuals cluster near 0 → most nibbles near bin 8 → brotli's
LZ77 finds the repetition). XOR-ing breaks some of the
cross-cell repetition brotli was exploiting, and exposes
temporal redundancy that brotli was already extracting via
backreferences. Net: −2.5%.

The **per-cell variant saves 9%** under XOR. Per-cell ranges
mean different cells' bin-8 values represent different residual
values; the raw stream has more byte diversity (less brotli-
pattern). XOR finds new zero-runs across packets. Net: useful.

Generalised observation: **byte-XOR's effectiveness depends on
how much brotli was already exploiting**. Already-brotli-friendly
stream + XOR = regression; byte-diverse stream + XOR = saving.

Neither layered variant beats byte-xor-q4 (442 KB / L∞ 0.0625)
on the Pareto plane. **Arc saturated.**

---

## Idea 2 — 1D wavelets on time-axis per cell, with dynamic cutoff

**The proposal.** Instead of treating each packet as a vector to
compress, treat each *cell* as a time-series across the bundle's
moves. A single cell's ownership value evolves smoothly across
moves until it gets captured or surrounded. Wavelet-transform
each cell's time-series (Daubechies-4), keep the coefficients
above a dynamic threshold, drop the rest.

**Probe result (2026-05-26).** Filed under
`research/compression/probe_wavelet_per_cell.py`. Per-cell db4
decomposition via pywt; Q8 quantisation of kept coefficients
within per-cell observed range.

```
variant                   post-brotli   vs xor   max-abs
byte-XOR Q4 (baseline)        441,853   1.000×    0.0625
db4 energy=0.99 Q8            607,345   1.375×    0.74 ⚠
db4 energy=0.999 Q8         1,197,257   2.710×    0.20 ⚠
db4 energy=0.9999 Q8        1,787,990   4.047×    0.054 ✓ matches Q4
db4 energy=1.0 Q8           1,925,733   4.358×    0.029 ✓ 2× Q4 precision
db4 energy=1.0 float32     11.4 MB     25.7×    0.000 ✓ lossless
```

At matched-or-better L∞ precision, wavelet is **4× larger**
than byte-XOR. The per-coefficient sidecar (2-byte uint16
index per kept coefficient) is the wire-size killer:
aggressive thresholding ⇒ few coefficients kept ⇒ but each kept
coefficient still costs 3 bytes (2-byte index + 1-byte Q8
value) — and brotli can't compress index sequences much because
they're spread across the time-series.

The dynamic-cutoff knob trades size for L∞ accuracy. At
energy=0.99, max-abs is 0.74 — unusable for visualisation. At
energy=0.9999 the max-abs is comparable to Q4 (0.054) but bytes
are 4× larger. No regime where wavelet wins.

**Sound or dumb.** Sound *as a probe*. The result is consistent
with the PCA finding: brotli on Q4 cells is the L∞-optimum at
this scale. Wavelets would win for **larger boards** (where
spatial structure has more room to decorrelate) or **longer
time-series** (where the per-coefficient overhead amortises
better). For 19×19 boards and ~200-packet bundles, the
overhead dominates.

**Filed as null** for ownership compression at our scale.

---

## Idea 3 — Spatial kernels (convolutional / Gaussian)

**The proposal.** The 19×19 board has rich 2D structure that
brotli (a 1D byte compressor) cannot see. Ownership maps have
spatially-correlated regions (territory blocks, walls). Apply a
2D transform that exploits spatial adjacency:

- **Fixed Gaussian smoothing** then store residuals: pre-smooth
  the map with a Gaussian kernel, store the (sparse) residual.
  Cheap, no training data.
- **Learned convolutional kernels**: train a small CNN on
  KataGo ownership maps to predict each cell from its
  neighbourhood. Store only the prediction error.
- **2D DCT or 2D wavelet** (JPEG-style): standard spatial
  decorrelation.

**Why it might work.** Strong spatial structure → strong
neighbour-prediction → small residuals → smaller post-brotli
bytes. JPEG demonstrates the principle works in practice.

**Why it might not.** Four concerns:
1. **2D DCT on 19×19 boards** is small enough that the DCT's
   overhead (basis vectors, coefficient ordering) approaches
   the data size. JPEG-style works best at 64×64 or larger.
2. **Sharp territorial boundaries** are exactly what DCT
   struggles with (Gibbs ringing). The user noted previously
   testing DCT without success — this is consistent with that
   experience.
3. **Learned CNN kernels** require training data + inference
   code on the SPA. Significant complexity for an SPA encoder.
4. **The user previously tested DCT without success** (recorded
   in the 2026-05-26 session transcript). Anecdotal null but
   worth respecting.

**Sound or dumb.**
- Fixed Gaussian smoothing → residual: **mildly sound**.
  Trivial to implement, low risk. May or may not beat brotli's
  implicit pattern detection.
- 2D DCT: **dumb at 19×19**, given the user's prior null and
  the structural argument above (board is too small for DCT to
  shine; ringing at sharp boundaries).
- 2D wavelet (Haar / DB4 on 19×19): **uncertain**. Haar handles
  sharp boundaries better than DCT. But the small board size
  argues against deep decomposition trees.
- Learned CNN: **architecturally sound but operationally
  wrong-shape for an SPA**. Training + inference complexity
  exceeds what an SPA encoder should carry. File for "if a
  future server-side compression path opens up".

**Probe target.** No probe scheduled yet. If Idea 1 / Idea 2
show interesting headroom, revisit; otherwise file as long-tail.

---

## Idea 4 — Quantitative framework for time-axis vs. space-axis trade-offs

**Correction (2026-05-26).** Previous version of this section
read as "let's combine time + space coding 3D-video-style". The
user's actual framing is different and load-bearing:

> "I meant that we need a disciplined quantitative way to think
>  about this tradeoff and compare the different methods under
>  such a metric (or family of metrics)."

The point is **not** to mash together time and space; the point
is to have **principled measurement** for *any* method along
each axis — so that decisions like "PCA wins on L₂ but loses on
L∞" are produced by the framework rather than by ad-hoc per-
probe comparison.

**What such a framework would look like.** Open question; this
section sketches the shape, doesn't pin it.

Candidate components:

1. **Decompose the data's structure by axis.** For a corpus
   tensor X of shape (T, S) (T = packets in time, S = cells in
   space), measure:
   - I_time = information explained by time-axis correlations
     alone (e.g., per-cell autocorrelation across packets)
   - I_space = information explained by space-axis correlations
     alone (e.g., per-packet cross-cell correlations)
   - I_joint = total information minus the marginals
   Concretely something like an ANOVA-on-residuals decomposition
   or a mutual-information-style split.

2. **Profile each compression method by which structure it
   exploits.** For a method M:
   - How much of I_time does M extract?
   - How much of I_space?
   - How much of I_joint?
   - At what L∞ / L₂ / JSD cost?
   This is a "structure-capture profile" not a single bytes
   number.

3. **Operational rate-distortion curves per error family.**
   Plot post-brotli bytes against:
   - max L∞ (worst per-cell error across bundle)
   - mean L₂ (RMS across all cells)
   - per-cell JSD (against the policy-style normalisation)
   for each method, varying its hyperparameters. The
   *intersection* of these curves with each other and with
   axis-decomposed structure tells us where the slack actually
   lives.

4. **Identify the Pareto frontier under multi-objective
   constraints.** "Cheapest scheme with L∞ ≤ 0.06 and >70% of
   I_space captured" becomes a well-defined query.

**Why this matters operationally.** Without the framework,
each new method goes through an ad-hoc cycle of "build probe,
measure bytes, measure error, eyeball comparison". The PCA
framing-error this morning (counting per-bundle codebook bytes
unfairly) is exactly the kind of thing that quantitative-
framework discipline catches before it happens. The
followup-note format (idea → probe → result) only works if the
results are framework-grounded; otherwise we keep relitigating
"is X better than Y" without the metric definitions to settle
it.

**Sound or dumb.** Sound *as a research-direction priority*.
Implementing it before more method-probes would prevent the
class of error we caught above. Dumb to ship a metric framework
that's not used — i.e., it has to be cheap enough to apply per
probe, or it never gets applied.

**Filed as the next major step** in this compression-research
arc. Either an Opus 4.7 agent investigates the framework in
concert with the linear-projection investigation (see
`docs/archive/notes/linear-projection-compression-investigation-2026-05-26.md`
when it lands), or we author it ourselves before the next
non-trivial probe.

---

## Idea 5 — Constraint-based reconstruction (sum = scoreLead)

**The proposal.** KataGo's ownership map satisfies
sum(ownership) ≈ scoreLead (approximately; captures, dame, and
edge effects diverge it). Use this as a constraint to improve
reconstruction quality post-quantisation.

**Why it might work.** A known-true relationship between
decoded values provides additional information the decoder can
use to refine its output.

**Why it might not.** Filed during the 2026-05-26 session with
the user's own reasoning:

> "I'm not sure if this is actually an interesting nonlinear
> problem or if it's just 'add/subtract the mean', in which
> case it will have no dynamic visual impact and therefore not
> relevant for the actual problem at hand"

For uniform quantisers (Q4, Q8), the per-cell error is
mean-zero in expectation. Applying a sum constraint redistributes
the small residual evenly across cells — a uniform shift that
doesn't change the visible bin-snap pattern. So the user is
right: for the quantisers we ship, this is a wash visually.

**Sound or dumb.** **Filed as not-actionable for uniform quant**.
The constraint becomes meaningful for non-uniform quantisers
(k-means, learned codebooks) where per-cell error isn't
mean-zero. We don't ship those; revisit if we ever do.

---

## 2026-05-26 framework results — Pareto map

The framework (`research/compression/framework/`) ran end-to-end
on seven methods. Headline corpus-variance decomposition:

```
fraction_B   (bundle main effect):         0.0008
fraction_T_B (packet within bundle):       0.0011
fraction_S   (cell main effect):           0.0372
fraction_BS  (bundle × cell interaction):  0.6603   ← dominant
fraction_R   (joint residual):             0.3005
sum check:                                 1.000000
```

The 66% in BS is the structural finding: each bundle has a
per-cell ownership pattern that's largely stable across packets;
only the 30% R component is the actual per-packet-per-cell joint
variation. This is what brotli on raw Q4 streams is implicitly
exploiting via LZ77 backreferences.

Method results (Pareto-relevant subset):

| method | post-brotli | L∞ | L₂ | error_frac |
|---|---|---|---|---|
| uniform-q4 | 460 KB | 0.0625 | 0.038 | 0.0037 |
| byte-xor-q4 | 442 KB | 0.0625 | 0.038 | 0.0037 |
| bundle-mean+q4-residual (global) | 388 KB | **0.099** | 0.050 | 0.0065 |
| bundle-mean+q4-residual (per-cell) | 705 KB | 0.070 | **0.023** | 0.0014 |
| uniform-q8 | 2 164 KB | 0.0039 | 0.0022 | ~10⁻⁵ |
| byte-xor-q8 | 1 656 KB | 0.0039 | 0.0022 | ~10⁻⁵ |

Key non-obvious finding: **byte-XOR gives ~4% post-brotli savings
on Q4 but ~23% on Q8**. Q8's wider per-cell byte (one full byte
instead of a nibble) makes the byte-level temporal correlation
brotli sees richer. Filed under TODO: ship byte-XOR-Q8 in the SPA.

The Q4+residual probes (§4.4 of the linear-projection
investigation) show the *byte axis is reachable from BS-exploit*
but at an L∞ cost — global-residual-range regresses L∞ to 0.099
because one volatile cell's range widens the bin for all cells;
per-cell-range fixes L∞ but increases bytes by 60% (brotli
loses the cross-cell pattern when each cell's bin values are
asymmetric around different means).

Pareto frontier at L∞ ≤ 0.07: byte-xor-q4 wins on bytes (442 KB).
Pareto frontier at L∞ ≤ 0.004 (hifi territory): byte-xor-q8
wins on bytes (1 656 KB).

**Filed as: framework working as designed**. The conditional
probes from §4 of the linear-projection investigation each have
a concrete shape now (e.g., "ICA on the R residual" needs the
framework's structure-capture profile to read a non-Gaussian
signature first). Next probes should be framework-driven, not
ad-hoc.

## Closing thought — what the prior arts say

The pattern across the byte-XOR probe and the previous
XOR-delta null:

> Brotli on raw quantised streams is *better than it looks*.

The temporal/spatial correlation we keep trying to exploit
explicitly is largely what brotli's LZ77 backreferences and
literal-zero detection are already exploiting implicitly.
Beating brotli requires either:

1. **A fundamentally different decorrelation basis** (PCA,
   wavelets) that captures structure brotli's 1D byte view
   can't see.
2. **A much sparser representation** at the input to brotli
   (which is what the XOR achieves — most bytes are literal
   zeros after XOR'ing similar packets).
3. **Domain-specific structure** (the 2D board, the time axis)
   that requires lifting brotli out of its byte-stream view.

The byte-XOR probe falls into category 2 and won marginally.
PCA / wavelet probes will tell us whether category 1 is
worth chasing further. Category 3 is open-ended; file under
"if categories 1-2 saturate, return here".

License: Public Domain (The Unlicense)
