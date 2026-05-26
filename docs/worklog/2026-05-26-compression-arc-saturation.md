# Compression-arc saturation — framework, probes, and the L∞ vs L₂ finding

- **Status:** Closed 2026-05-26. The compression-evaluation
  framework lives at `research/compression/framework/`; the
  findings ledger is `docs/notes/compression-research-followups.md`
  (the post-saturation amendments that close each idea-class);
  the agent-survey input is
  `docs/archive/notes/linear-projection-compression-investigation-2026-05-26.md`.
  Findings committed to `main` as `9c850d3`. The sole shippable
  follow-up — byte-XOR-Q8 — has its own ship worklog at
  `2026-05-26-byte-xor-hifi-ship.md`.
- **Genre:** Research arc. Empirical evaluation of the headroom
  left after the v2 base implementation (Q4/Q8 uniform
  quantisation + brotli) closed.
- **Date:** 2026-05-26.

## Context

The v2 analysis-bundle compression arc (PR #270 backend +
through PR #271 frontend) shipped two lossy variants alongside
the lossless `v1`: `v2-projected` (drops unmodelled fields),
`v2-quantized` (Q4 ownership + Q8-factored policy), and
`v2-quantized-hifi` (Q8 ownership). Brotli applies
unconditionally on the backend. The framing question this arc
opened: **is there headroom left after Q4/Q8 + brotli, or has
the obvious decorrelation already been done?**

The 2026-05-25 research arc (archived at
`docs/archive/notes/analysis-bundle-compression-research-2026-05-25.md`)
had named several open directions — PCA reference / top-K
coefficients, 1D wavelets on time-axis per cell, spatial
kernels, sum-equals-scoreLead constraint, byte-XOR delta on
quantised streams. The 2026-05-25 arc filed these as ideas
without probes. The 2026-05-26 arc's job was to actually
measure them under a discipline that would survive
cross-comparison.

The discipline gap surfaced early: an initial PCA probe was
counting per-bundle codebook bytes unfairly, and the eyeballed
comparison would have produced a stronger-than-warranted claim
about PCA's competitiveness. The fix wasn't just to run a
better probe — it was to author a measurement framework that
makes the cross-comparison principled, so that "X wins on
bytes but loses on L∞" produces a decision automatically rather
than per probe. That's Idea 4 in
`compression-research-followups.md`.

## The framework

`research/compression/framework/` is the empirical instrument.
Five modules:

| Module | Purpose |
|---|---|
| `corpus.py` | Loads the 40-game SGF corpus to a `(B, T, S=361)` tensor (B bundles, T packets per bundle, S cells per packet). Ownership values clipped to `[-1, 1]`. |
| `decomposition.py` | 5-way nested ANOVA on the corpus tensor: `V_B` (bundle main effect), `V_T(B)` (packet within bundle), `V_S` (cell main effect), `V_BS` (bundle × cell interaction), `V_R` (joint residual). Reports `fraction_*` as `V_*/V_total`. |
| `method.py` | Method-evaluation protocol — each compression method runs encode+decode on the corpus, returns post-brotli bytes + per-cell reconstruction errors. |
| `metrics.py` | Distortion vector (L∞ corpus, L∞ p95-per-cell, L₂ RMS, JSD where applicable), structure-capture profile (fractions of `V_S`, `V_BS`, `V_R` recovered), operational cost (encode/decode wall-clock, brotli compression time). |
| `runner.py` | The driver that walks every method × hyperparameter cell, produces the per-method table + summary. |

Method libraries `methods_baselines.py` (uniform-q4, uniform-q8,
byte-xor-q4, byte-xor-q8, bundle-mean+q4-residual variants) and
`methods_ica.py` (ica-K10 / K20 / K50 / K100) are the
populations actually evaluated. The top-level driver is
`research/compression/run_framework_baselines.py`; its output
is captured in
`research/compression/framework/baselines_report_2026-05-26.txt`.

Per-axis probes:
- `probe_pca_ownership.py` — global PCA, K ∈ {10, 50, 200}, Q8
  on basis + coefficients.
- `probe_r_component_structure.py` — Gaussianity test on the
  residual after the variance-decomposition's BS removal; the
  conditional trigger for the ICA path.
- `probe_wavelet_per_cell.py` — db4 per-cell time-series
  decomposition with dynamic-cutoff hyperparameter.
- `probe_mpeg_ownership_delta.py` — pair-list / bitmap-factor
  P-frame delta encoding (the 2026-05-25 null direction
  re-measured under the framework).

Each probe writes its output to stdout in the same column
format as the framework's report so the cross-comparison is
literal-text-grep-able.

## The structural finding

The variance decomposition's headline:

```
fraction_B   (bundle main effect):         0.0008
fraction_T_B (packet within bundle):       0.0011
fraction_S   (cell main effect):           0.0372
fraction_BS  (bundle × cell interaction):  0.6603   ← dominant
fraction_R   (joint residual):             0.3005
sum check:                                 1.000000
```

The 66% in BS is the answer to "where does the structure live."
Each bundle has a per-cell ownership pattern that's largely
stable across packets; only the 30% R component is the actual
per-packet-per-cell joint variation. The 4% in cell-main-effect
S is the "centre cells are slightly more contested than corner
cells on average" baseline. The 0.2% in B+T_B is the
expected-near-nothing range of "all 19×19 boards average out the
same."

This decomposition is what brotli's LZ77 backreferences are
implicitly exploiting on the raw Q4 stream: the BS pattern is
stable enough across packets that brotli finds the same
byte-substring in adjacent packets and back-references rather
than re-encodes. The decomposition tells us *why* brotli is
hard to beat on this corpus — not "brotli is magic" but
"66% of the variance is patterns that recur literally."

The 30% R is the actually-decorrelatable surface. The probes
this arc ran asked: **can any non-brotli technique extract more
of R into bytes-savings than what's already happening
implicitly?** Answer below.

## What the probes measured

Headline Pareto-relevant subset (full table in
`baselines_report_2026-05-26.txt`):

| method | post-brotli | L∞ | L₂ | error_frac |
|---|---|---|---|---|
| `uniform-q4` | 460 KB | 0.0625 | 0.038 | 0.0037 |
| `byte-xor-q4` | 442 KB | 0.0625 | 0.038 | 0.0037 |
| `bundle-mean+q4-residual` (global) | 388 KB | **0.099** | 0.050 | 0.0065 |
| `bundle-mean+q4-residual` (per-cell) | 705 KB | 0.070 | **0.023** | 0.0014 |
| `uniform-q8` | 2 164 KB | 0.0039 | 0.0022 | ~10⁻⁵ |
| `byte-xor-q8` | 1 656 KB | 0.0039 | 0.0022 | ~10⁻⁵ |
| `pca-K10-q8` | 75 KB | **1.71** | 0.31 | — |
| `pca-K50-q8` | 367 KB | **1.11** | 0.18 | — |
| `pca-K200-q8` | 1 511 KB | **0.48** | 0.08 | — |
| `ica-K10` | 119 KB | **1.82** | 0.255 | — |
| `ica-K20` | 207 KB | **1.83** | 0.203 | — |
| `ica-K50` | 482 KB | **1.35** | 0.127 | — |
| `ica-K100` | 1 035 KB | **1.25** | 0.078 | — |
| `db4 energy=0.99 Q8` | 607 KB | **0.74** | — | — |
| `db4 energy=0.9999 Q8` | 1 787 KB | 0.054 | — | — |
| `pair-list/bitmap P-frame delta` | (regressed) | 0.0625 | — | — |

### The L∞ vs L₂ finding

The first-class structural finding: **basis-change methods
(PCA, ICA, wavelets) optimise L₂, not L∞**. PCA truncation
captures variance fractions in order of eigenvalue magnitude;
the remaining variance concentrates on individual cells in
high-frequency / low-energy directions. K=10 captures 58% of
variance but blows up L∞ to 1.71. K=200 captures 99%+ but L∞
is still 0.48 — six times Q4's analytic bound.

ICA on the R residual was triggered conditionally —
`probe_r_component_structure.py` found R's components are
8–15× more non-Gaussian than PCA's (mean kurtosis 14.6 vs 1.6),
which §4.1 of the linear-projection investigation had named
as the trigger condition. ICA fired, ran, and produced the
same structural failure: every K shows L∞ > 1.0. The heavy-
tailed components ICA exploits are exactly the ones whose
truncation produces concentrated error. Non-Gaussianity is the
property that **lets** ICA succeed where PCA can't — and it's
also what makes truncation pathological in L∞.

Wavelets followed suit. At matched-or-better L∞ precision
(`db4 energy=0.9999 Q8`, max-abs 0.054, comparable to Q4's
0.0625), wavelet is 4× larger than byte-XOR-Q4. The
per-coefficient sidecar (2-byte index per kept coefficient)
is the wire-size killer. For 19×19 boards and ~200-packet
bundles, the overhead dominates. Wavelets would win for
larger boards or longer time-series.

For an SPA where the user looks at a specific cell at a time
(palette state functions read `rootInfo.visits` and per-cell
ownership directly), L∞ is the relevant geometric criterion.
L₂-optimal basis changes fail it. The framework's
contribution here is making this finding explicit and
reproducible rather than per-probe folklore.

### The byte-XOR finding

The remaining surface where any non-brotli technique helps is
**byte-level temporal redundancy** that brotli's backreferences
don't catch. The byte-XOR probes asked: if consecutive packets
share Q-bin values for many cells, can XOR'ing produce
literal-zero runs that brotli compresses harder than the
original patterns?

Headline: **byte-XOR gives ~4% post-brotli savings on Q4 but
~23% on Q8.** The asymmetry is the technical content. At Q4
(nibble per cell, two cells per byte), byte-level identity
requires both nibble-paired cells to match. At Q8 (full byte
per cell), one cell's bin match produces one zero byte. The
Q8 byte stream has more byte-level temporal correlation, and
brotli's literal-zero handling exploits it more efficiently
than the implicit LZ77 path does.

Layering byte-XOR on top of the Q4-residual variants
(`bundle-mean+q4-residual+xor` and
`bundle-mean+q4-residual-percell+xor`) was checked for
completeness. The global-range variant regresses 2.5%
post-brotli (already-brotli-friendly stream + XOR breaks
brotli's pattern detection); the per-cell variant saves 9%
(byte-diverse stream + XOR finds new zero-runs). Neither beats
byte-xor-q4 on the L∞-respecting Pareto plane. Generalised
observation filed in §1.5 of the followups note: **byte-XOR's
effectiveness depends inversely on how much brotli was already
exploiting**.

### The pair-list / bitmap-factor finding

`probe_mpeg_ownership_delta.py` measured explicit P-frame
delta encoding (pair-list of changed cells, bitmap factor for
the "unchanged" mask) against byte-XOR. Result: regresses 15.7%
post-brotli vs byte-xor-q4. Same root cause as the ICA / PCA
L∞ failure on a different surface — the explicit delta encoding
adds structure brotli can't compress, while removing the
implicit temporal correlation brotli was already exploiting.
Filed null in §1.2 of the followups note.

## The Pareto frontier under L∞-respecting constraints

Two operating points:

- **L∞ ≤ 0.0625** (Q4 territory): `byte-xor-q4` at 442 KB.
- **L∞ ≤ 0.004** (Q8 hifi territory): `byte-xor-q8` at 1 656 KB.

Every other method evaluated either:
1. Loses on (bytes, L∞) jointly — PCA, ICA, wavelets,
   pair-list delta.
2. Trades L∞ for bytes — `bundle-mean+q4-residual` (global)
   wins on bytes at the cost of L∞ → 0.099.
3. Trades bytes for L₂ — `bundle-mean+q4-residual` (per-cell)
   wins on L₂ at the cost of +60% bytes.

Operating points 2 and 3 are interesting as research findings
but don't dominate either Pareto endpoint. They'd be relevant
if a future application surface needed L₂ fidelity rather than
L∞, or accepted L∞ ≈ 0.1 for bytes savings.

## Saturation

The empirical arc is closed. The framework's contribution is:
**named axes (rate, distortion vector, structure-capture
profile, operational cost), reproducible decomposition
(`V_B`/`V_T(B)`/`V_S`/`V_BS`/`V_R`), and a per-method protocol
that produces decision-quality numbers automatically.** Future
probes against ownership compression can plug into the same
runner and produce a row that's directly comparable to the
table above.

The only Pareto-improving operating point the arc surfaced —
byte-XOR-Q8 — has its own ship worklog. Q4 doesn't need the
upgrade (4% savings on a small absolute base, modest); Q8 does
(23% savings on a much larger absolute base, meaningful for
the hifi bandwidth profile).

## What's preserved

- `research/compression/framework/` — the framework itself,
  with method libraries.
- `research/compression/probe_*.py` — the four probes
  (mpeg-style ownership delta, PCA ownership, R-component
  structure, wavelet per-cell).
- `research/compression/framework/baselines_report_2026-05-26.txt`
  — the captured run output.
- `docs/notes/compression-research-followups.md` — the
  ideas ledger, amended with per-idea verdicts.
- `docs/archive/notes/linear-projection-compression-investigation-2026-05-26.md`
  — the Opus 4.7 agent survey that seeded the framework
  direction (Idea 4 → realised as
  `research/compression/framework/`).

## What follows

`2026-05-26-byte-xor-hifi-ship.md` is the implementation
sibling. The TODO entry that recipe-ised the ship work
(`docs/TODO.md` §"Byte-XOR delta on the Q8 ownership wire")
gets struck on the same close-out pass that filed this worklog.

## Closing

The arc came in expecting that "PCA / wavelet / spatial
techniques probably leave headroom on the table" and exited
with the opposite finding: brotli on quantised streams is
better than it looks, basis changes that optimise the wrong
norm fail catastrophically on the right one, and the only
remaining surface for headroom in this configuration is byte-
level temporal redundancy at Q8. The L∞-vs-L₂ structural
result is the keeper — it explains the prior 2026-05-25 nulls
retroactively and predicts forward where related techniques
will and won't work.

License: Public Domain (The Unlicense)
