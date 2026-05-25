---
title: nncache_prvq — compression-scheme archaeology
date: 2026-05-25
source: ~/nncache_prvq (external; read-only investigation)
purpose: reference for LengYue analysis-bundle policy quantisation arc
license: Public Domain (The Unlicense)
---

## Scope and frame

The user pointed at `~/nncache_prvq` as a "battle-tested" prior compression
implementation that allegedly contained a **sort-by-magnitude** transformation
preceding vector quantisation. After reading the repo end to end (top-level
files, the C++ decoder, the masks subdirectory) I did **not** find a
sort-by-magnitude transform on individual policy vectors. Section 4 documents
this absence explicitly — the user's recollection of the transform appears to
be either from a different codebase or from a discarded earlier iteration.

What this repo *does* contain is a different battle-tested approach to the
same problem class: a **mask-aware Product Residual Vector Quantiser (PRVQ)**
that handles illegal moves natively in its distance metric and centroid
update, rather than via a pre-quantisation permutation. The two are
substitutable answers to the same underlying difficulty (codebooks must learn
across a variable-length valid support). The rest of this document describes
the present scheme on its own terms.

Subordinate observation: the only "sort" appearing at the data-vector level
is a `np.lexsort` on the *boolean mask pattern across samples* — a delta /
zstd preprocessing step for the mask sidechannel, not a per-vector
permutation. See section 4.2.

---

## 1. Scheme overview

### 1.1 What is being compressed

A KataGo `NNOutput` cache for a single LengYue card. Per sample
(`kata_types.py:51-153`):

- `nnHash : Hash128` — 16 bytes, exact passthrough
- 9 scalar floats — `whiteWinProb`, `whiteLossProb`, `whiteScoreMean`,
  `whiteScoreMeanSq`, `whiteLead`, `varTimeLeft`, `shorttermWinlossError`,
  `shorttermScoreError`, `policyOptimismUsed` (`kata_types.py:4-7`) — exact
  float32 passthrough
- `policyProbs : List[float]` of length **362** (= 19² + 1 pass move) — the
  policy field this writeup concerns. Sentinel `-1.0` marks illegal moves
  (variable per sample). The valid entries form a probability distribution.
- `whiteOwnerMap : List[float]` of length **361** (= 19²) — continuous in
  `[-1, 1]`, never masked. Compressed by a sibling **ContinuousRVQ** model
  (`rvq_cont.py:1-90`), out of scope for the LengYue arc but described
  briefly for context.

The pipeline rejects samples whose `whiteOwnerMap` is absent
(`compression_pipeline.py:515-521`).

### 1.2 Goal

Cache-size reduction is the primary goal — the pipeline is invoked from
`compress_card_fs` (`compression_pipeline.py:630-702`), which writes a
self-contained archive to disk and updates a PostgreSQL `nn_archive` table so
the original LMDB rows can later be pruned. Lookup speed is secondary: the
archive supports batch decode (`compression_pipeline.py:708-747`) but is not
indexed for random access — the unit of recall is the whole card.

Compression ratio is the headline metric in the hyperparameter search
(`hparam_search.py:19-33`). The default config that ships
(`default_config.pkl`, decoded by hex inspection) lands at
`compression_ratio ≈ 4.09×`, `bits_per_sample = 2688`.

### 1.3 End-to-end pipeline

The orchestrator is `compress_card` in
`compression_pipeline.py:465-621`. Numbered as in the source:

1. Load all `(Hash128, NNOutput)` entries for the card from
   LMDB/Postgres (`compression_pipeline.py:487-489`).
2. **Sort entries by mask pattern** (`compression_pipeline.py:491-497`).
   `np.lexsort` over the columns of the boolean `policyProbs == -1` matrix.
   This is sample-order rearrangement so that adjacent rows tend to share
   their illegal-move pattern — preparing for the mask sidechannel's
   XOR-delta encoding (section 5.2). This is **the** "sort" in the pipeline;
   it does not touch individual policy values.
3. Train the **PRVQ codebooks** on *all* policy vectors, including samples
   with no owner-map (more data → better codebooks)
   (`compression_pipeline.py:499-513`).
4. Filter to homogeneous entries (those with an owner-map present)
   (`compression_pipeline.py:515-521`).
5. Encode the filtered policies with the exact-distance encoder
   (`compression_pipeline.py:523-525`).
6. Compute per-sample NJSD between original and reconstruction; drop the
   top 1% outliers; record the threshold
   (`compression_pipeline.py:527-543`).
7. Train a separate **ContinuousRVQ** on the surviving owner-maps
   (`compression_pipeline.py:545-561`).
8. Encode owner-maps (`compression_pipeline.py:563-565`).
9. Pack 16-byte hashes and the 9-float scalar block per sample
   (`compression_pipeline.py:567-572`).
10. Serialise everything to bytes (`compression_pipeline.py:574-587`).
11. Pack the archive container (`compression_pipeline.py:589-602`).
12. Round-trip validation in Python before save
    (`compression_pipeline.py:604-607`); the archive is discarded on
    mismatch.
13. Optional C++ reference dump for the C++ decoder regression tests
    (`compression_pipeline.py:609-611`).

The archive container is a self-describing binary with magic `KATACRD\x00`,
version 1, then a header `(n_samples, n_rejected, njsd_p99)` and tagged
sections: `HASHES`, `SCALARS`, `POLMODEL`, `POLCODES`, `POLMASKS`,
`OWNMODEL`, `OWNCODES` (`compression_pipeline.py:73-179`).

---

## 2. Transformations

### 2.1 No per-vector magnitude sort

There is **no sort-by-magnitude permutation on individual policy
vectors** in this codebase. I verified by:

- Reading `prvq.py` end to end (the PRVQ implementation): centroids are
  indexed by **subspace position**, not by rank. `_codebook_dim = subspace_dim
  = ceil(D / S)` (`prvq.py:283-287`); the codebook tensor has shape
  `[Q, S, K, d]` (`prvq.py:295-301`). If sort-by-magnitude were present the
  subspace dimension would be conceptually different (rank-ordered slots).
- Reading `compression_pipeline.py` and `_compression_pipeline.py` end to
  end. The only `lexsort` is on the mask pattern (sample order), not on the
  policy values.
- `grep -i "sort\|magnitude\|argsort\|permut"` across all Python files in
  the repo — every hit is either the sample-level mask sort, sweep-result
  sorting, board-rotation permutations (`rot.py`), or NumPy `sort` in
  metric-percentile computation.
- The C++ decoder (`prvq_decoder.cpp:346-403`) reads codes back into
  position-indexed subspaces with no inverse-permutation step.

The closest related transformation in the repo is `rot.py`'s **four-rotation
symmetry normalisation** (`rot.py:171-249`): pick the board rotation
(identity, 90°, 180°, 270°) that places each sample's argmax at the smallest
linear index, and emit a 2-bit `sym_id` per sample so the rotation can be
undone. The author imports this in `experiment.py:5` but the call is
commented out (`experiment.py:185`) and `compression_pipeline.py` does not
reference it — it never made it into the shipped pipeline. The `sym_id`
sidechannel mechanic (transmit a small integer per sample to invert a
permutation) is structurally what the user would need if a per-vector sort
were added back; the rotation case is just a four-element symmetry group
rather than a `D!`-element one.

### 2.2 Illegal-move handling — mask as first-class signal

The illegal-move sentinel `-1.0` is preserved through the pipeline and
handled in **two parallel paths**:

**(a) Inside the quantiser** — the mask is fed as a `[B, S, d]` boolean
tensor to every distance computation. The fast L2 kernel
(`prvq.py:16-36`):

```python
@jax.jit
def _fast_l2_distances(x, centroids, mask):
    mx    = jnp.where(mask, x, 0.0)
    x_sq  = jnp.sum(mx ** 2, axis=-1, keepdims=True)
    c_sq  = jnp.sum(centroids ** 2, axis=-1)[None, :, :]
    dot   = jnp.einsum('bsd,skd->bsk', mx, centroids)
    valid = jnp.clip(jnp.sum(mask, axis=-1, keepdims=True), 1.0)
    return (x_sq + c_sq - 2.0 * dot) / valid
```

Two distinct masked-L2 formulas exist: `_fast_l2_distances` (used in
training and standard encode) uses *unmasked* `c_sq` — the author flags
this in the docstring (`prvq.py:18-30`) as an "implicit regulariser pushing
centroids toward small values in masked dims". A separate
`_fast_l2_distances_exact` (`prvq.py:39-58`) restricts `c_sq` to the valid
dimensions of each sample for **unbiased evaluation only**. Centroid
accumulation in k-means similarly zeros out masked positions before the
sum (`prvq.py:386-417`), and the residual update preserves masked positions
(`prvq.py:84`: `new_residual = jnp.where(mask_padded, residual - quantized,
residual)`).

This is the structural insight: the mask is not factored out — it is
threaded through the entire training and inference loop. The codebooks
learn to be useful across varying valid supports because every distance
they're compared against is mask-divided.

**(b) Sidechannel** — the boolean mask `(policyProbs == -1)` is also
serialised separately in the `.rvqmasks` section
(`prvq_serialize.py:219-295`) so the decoder can re-emit the `-1` sentinels
at exactly the right positions. Encoding pipeline:

1. XOR-delta across rows: `delta[i] = mask[i] XOR mask[i-1]`
2. Transpose to `[D, N]`
3. `np.packbits` along the sample axis
4. zstd level-19

Step 1 explains why the pipeline lexsort-orders samples by mask pattern in
step 2 of section 1.3: adjacent rows with identical mask cancel to zero in
the delta, the transpose then runs them as long zero runs along columns,
and zstd collapses those. The `[partial]` `cmpr.py:50` (`probs =
np.array(sorted(probs, key=lambda x: np.sum(-1==x)))`) is an earlier
single-axis variant of this preprocessing.

### 2.3 Probability ↔ logit conversion

For `input_space="probability"` and `metric="l2"`
(`prvq.py:309-335`), the quantiser converts the input to **log-space**
(`_prob_to_logit`) before training, encoding, and decoding, then back to
probability via masked softmax (`_logit_to_prob`) after reconstruction.
The rationale is that L2 in logit space approximates a divergence-aware
metric on the simplex (the JSD k-means variant in `jsd_kmeans.py:69-103`
uses the divergence directly, but the PRVQ pipeline chose the
L2-in-logit-space approximation for codebook training speed).

The C++ decoder mirrors this with a numerically-stable masked softmax
(`prvq_decoder.cpp:317-334`).

### 2.4 No centering, no global scaling

There is no per-vector or per-dimension centering / scaling step. The
codebooks ingest logits directly. A configurable `input_space ∈
{"probability", "logit", "raw"}` exists (`prvq.py:255`) so the caller can
pre-transform if they want, but the shipped path is `"probability"` which
delegates to the internal logit conversion above.

---

## 3. Quantisation specifics

### 3.1 The class

`ProductResidualVQ` in `prvq.py:223-737`. It is a hand-written JAX
implementation, not FAISS-derived. The name decomposes as:

- **Product** — the input dimension `D` is split into `S` subspaces of
  width `d = ceil(D/S)` each, with zero-padding if `S × d > D`. Each
  subspace has its own family of codebooks
  (`prvq.py:283-287, 289-293`).
- **Residual** — within each subspace, `Q` codebook layers are applied in
  cascade: stage `q+1` is trained on the residual left over from stage `q`
  (`prvq.py:65-92` for encode, `prvq.py:486-573` for training).
- **VQ** — k-means codebooks of size `K` per (stage, subspace) pair.

The full codebook tensor has shape `[Q, S, K, d]` float32. For a sample,
the encoded codes are `[Q, S]` of `int32` (downcast to uint8/uint16 by the
serialiser, `prvq_serialize.py:154-188`).

### 3.2 Default hyperparameters

From `default_config.pkl` (decoded via hex inspection of the pickle —
the file is too small for the values to be ambiguous):

| field | value |
|---|---|
| `num_quantizers` (Q) | 6 |
| `num_subspaces` (S) | 56 |
| `subspace_codebook_size` (K) | 256 |
| `subspace_dim` (d) | 7 |
| `bits_per_sample` | 2688 |
| `compression_ratio` | ≈ 4.094× |

Check: `D = 362, S = 56 → d = ceil(362/56) = 7, S×d = 392, padding = 30`.
Bits per sample: `Q × S × log₂(K) = 6 × 56 × 8 = 2688 ✓`. Raw bytes per
sample: `362 × 4 = 1448` (i.e. 11584 bits). Encoded ratio: `11584 / 2688 ≈
4.31×` *of the codes only* — the reported `4.094×` is total including the
amortised codebook overhead (`hparam_search.py:19-33`).

The encoder `_encode_jitted` uses `jax.lax.scan` over quantiser stages so
the loop is JIT-compiled once regardless of `Q` (`prvq.py:65-92`). The
slice `codebooks[:num_quantizers]` is load-bearing — the docstring at
`prvq.py:88-90` warns that without it, intermediate `num_q < Q_total`
encode calls would silently include untrained codebooks.

### 3.3 Training methodology

`train_kmeans` (`prvq.py:423-580`):

- **Initialisation per stage**: random rows from the residual data
  selected uniformly from the rows that have at least one valid dim in
  the subspace (`prvq.py:493-512`). Standard k-means++ is not used here;
  random-sample-from-data init.
- **Update**: arithmetic mean of assigned residuals
  (`prvq.py:408-417`), with empty clusters retaining their previous
  centroid. Inputs to the sum are mask-zeroed before einsum.
- **Convergence**: `jax.lax.while_loop` with two exit criteria —
  `rel_change ≤ tol` (default `1e-4`, `prvq.py:262-279`) on the
  Frobenius-norm of centroid movement, or `iter_idx ≥ kmeans_iters`
  (default 50). The whole loop is jitted.
- **Stage chaining**: at end of stage `q`, codebooks are stored
  (`prvq.py:551`) and the residuals are updated in a separate scan
  (`prvq.py:556-567`) before stage `q+1` initialisation.
- **Optional intermediate evaluation**: if `test_during_training=True`,
  after each stage the exact encoder is run on a random subset and metrics
  printed (`prvq.py:569-573`).
- **Final evaluation**: after all stages, run the exact encoder on the
  full dataset and store `result_dict` (`prvq.py:575-580`,
  `prvq.py:601-688`).

**Corpus size**: the user's recollection of "thousands of examples" maps
to the inner-card sample count. From the pipeline,
`compression_pipeline.py:501-513` trains on `len(r0)` policy vectors —
all entries for a single card, including those without owner-maps. The
sweep used 133,429 samples (`hparam_search.py:46`), so corpus sizes in
the tens-to-hundreds-of-thousands range.

**Loss tracking**: five metrics computed per sample (`prvq.py:147-211`)
— cross-entropy CE, MSE, max-norm absolute error, JSD, and NJSD (JSD
normalised by the entropy of the mixture, so ∈ [0, 1]). NJSD is the
primary headline metric — both for the per-stage prints
(`prvq.py:641-678`) and for the p99 rejection threshold in the
pipeline (`compression_pipeline.py:531-537`).

**Hyperparameter sweep evidence**: `hparam_search.py` uses
**OR-Tools CP-SAT** to enumerate all (Q, S, C) feasible at a given
target compression ratio (`hparam_search.py:180-332`). The model
expresses raw / codebook / encoded bytes as integer-bit chains and
constrains `codebook_bits + encoded_bits ≤ budget_bits`. The candidate
set is `C ∈ {64, 128, ..., 65536}` (`hparam_search.py:62`), `Q ∈ [1, 24]`,
`S ∈ [1, 64]` (`hparam_search.py:185-186`). The enumerator yields all
feasible configs sorted by descending compression ratio.

`experiment.py:60-143` then trains each candidate in sequence using an
`AdaptiveBatchRunner` effect-handler that halves the batch size on OOM
and caches the discovered-good size per `(S, K, d)` memory profile. The
sweep result is serialised to `arf_partial.pkl` (1290 bytes — a small
dict of `HParams → result_dict`); `analyse_sweep.py` then does
Pareto-frontier and Spearman-sensitivity analysis
(`analyse_sweep.py:85-117, 119-169`).

The author's docstring observation (`analyse_sweep.py:193-198`) is that
within-bits-per-sample variance is the question of whether *allocation*
matters beyond *total bit budget*; the post-hoc finding (paraphrased
from the `hparam_search.py:11-17` "Background") is that the earlier
clustered-PRVQ variant's clustering stage had no measurable effect, so
the model collapsed to flat PRVQ.

---

## 4. Permutation handling — observation of absence

The user expected a per-vector sort-by-magnitude permutation that would
need to be transmitted alongside the quantised codes. Per section 2.1,
this transformation is absent. The repo handles the variable-valid-support
problem **by carrying the mask as a first-class input to the quantiser**
(section 2.2) — the codebooks themselves are not permutation-invariant;
they learn position-conditioned residual structure under the mask
distribution.

This means: in this scheme, **no permutation is transmitted**. The
sidechannel that *is* transmitted is the boolean mask itself
(`prvq_serialize.py:219-295`), packbit-and-zstd compressed across the
batch. That sidechannel is far cheaper than `log₂(362!)` bits per sample
would be — it's 362 bits per sample raw, zstd-compressed to ≪ 362 bits
amortised when consecutive samples share masks (the `lexsort` step in
`compression_pipeline.py:495` ensures this).

For LengYue, the absence is informative: if the LengYue arc adopts a
sort-by-magnitude transform, the user is in **new territory relative to
this codebase** — they will need to design the permutation sidechannel
themselves (the closest analogue here is `rot.py`'s 2-bit per-sample
`sym_id`, scaled up enormously). The "battle-tested" prior is for the
mask-aware PRVQ shape, not for the sort-by-magnitude shape.

---

## 5. Reconstruction quality

### 5.1 Metrics implemented

`_compute_metrics_batch` (`prvq.py:147-211`) computes per-sample:

- **CE** — cross-entropy `H(p, q) = -Σ p log q` over valid dims
- **MSE** — mean squared error over valid dims
- **MaxNorm** — `max_i |p_i - q_i|` over valid dims
- **JSD** — Jensen-Shannon divergence, range `[0, ln 2 ≈ 0.693]`
- **NJSD** — JSD divided by entropy of the mixture, range `[0, 1]`

Per-batch percentiles (`p95`, `p99`) of NJSD are also tracked
(`prvq.py:207-211`) and the final `result_dict` carries `p95`/`p99`
explicitly (`prvq.py:680-688`).

### 5.2 Filtering on NJSD p99

The pipeline computes per-sample NJSD post-encoding, sets a threshold at
the 99th percentile, and **drops samples whose reconstruction exceeds it**
(`compression_pipeline.py:527-543`). The threshold is written into the
archive header (`compression_pipeline.py:140-141`). The Python round-trip
test validates that all retained samples reconstruct within `1.01 ×
njsd_p99 + 1e-7` of the original (`compression_pipeline.py:336-423`).

This is a **lossy filter, not a lossy compressor in the usual sense**:
samples that would compress badly are excluded from the archive entirely.
The LMDB rows for rejected samples are intentionally left in place
(`compression_pipeline.py:646-650`) — they remain available via the
uncompressed cache path.

### 5.3 No published numerical baselines in-repo

The repo does **not** ship a reference plot or table of NJSD/MSE numbers
achieved by the default config. `arf_partial.pkl` contains the sweep's
per-config result_dicts but I did not load it (refused unpickling of
external pickle data on safety grounds — section 9).
`analyse_sweep.py:79-117` is the code that *would* report those numbers
if `arf_partial.pkl` were unpickled.

What the round-trip path *does* guarantee, per the validation code:

- **Hashes**: exact (`compression_pipeline.py:374-377`)
- **Scalars**: exact at float32 precision (`compression_pipeline.py:380-388`)
- **Policy NJSD**: `≤ njsd_p99` per sample (after `1.01×` slack)
  (`compression_pipeline.py:390-396`)
- **Owner-map MSE**: `≤ ownermap_mse_tol` (default 0.01) per sample
  (`compression_pipeline.py:398-403`)

### 5.4 Compression ratio achieved

From the default config, ≈4.09× on the policy field (per
`default_config.pkl`). The full archive ratio is smaller because the
hashes and scalars are stored verbatim and the owner-map quantiser adds
its own codebook overhead.

The `out_dir/` artifacts (184 MB `policy_recon.bin`, 184 MB
`ownermap_recon.bin`) are decoder outputs from a previous run — flat
`float32 [N, dim]` row-major dumps from the C++ decoder's `--output`
option (`prvq_decoder.cpp:20`). Useful as reference data; not metric
summaries.

---

## 6. Code structure

### 6.1 Layout

The repo is **flat** (no subdirectories beyond `masks/` and `out_dir/`).
The high-signal files for the compression scheme:

| File | Role |
|---|---|
| `prvq.py` | `ProductResidualVQ` — JAX implementation of the quantiser proper |
| `prvq_serialize.py` | Binary format for `.rvqmodel` / `.rvqcodes` / `.rvqmasks` / `.rvqraw` |
| `prvq_decoder.cpp` | Standalone C++17 decoder; mirrors `prvq.py` semantics |
| `compression_pipeline.py` | End-to-end card archive: train + encode + filter + pack |
| `rvq_cont.py` | `ContinuousRVQ` — sibling quantiser for the owner-map (no mask) |
| `rvq_serialize.py` | Sibling serialiser for ContinuousRVQ |
| `rvq_decoder.cpp` | Sibling C++ decoder for ContinuousRVQ |
| `kata_types.py` | `Hash128`, `NNOutput`, `float_keys`, `float_array_keys` |
| `nncache_manager.py` | LMDB + Postgres data loader (`CacheManager.get_card_entries`) |
| `hparam_search.py` | CP-SAT enumeration of `(Q, S, C)` configurations |
| `experiment.py` | Train-many-configs harness with adaptive batch sizing |
| `analyse_sweep.py` | Pareto / sensitivity / budget analysis of sweep results |
| `jsd_kmeans.py` | Alternative: JSD-distance k-means (Bhattacharyya centroids) for clustering |
| `rot.py` | 4-rotation board-symmetry normalisation; **not used** in shipped pipeline |
| `masks/masks.py` | Standalone mask delta+zstd encoder (mirrors `prvq_serialize.save_masks`) |
| `cmpr.py` | Scratch script with the same delta-mask encoder + scratch flows |
| `_compression_pipeline.py` | An earlier, partial-NYI version of the pipeline |

### 6.2 Entry points

For LengYue-style reuse the entry points are:

- **Train + serialise from scratch** (no LMDB / no pipeline):
  `prvq_serialize.save_all(model, data, stem)`
  (`prvq_serialize.py:345-393`) — encodes data through a trained model
  and writes all four files. Inverse: `verify_roundtrip(stem, data)`
  (`prvq_serialize.py:399-444`).
- **Train + archive a card** (with LMDB + Postgres):
  `compress_card_fs(mgr, card_id)` (`compression_pipeline.py:630-702`).
- **Decode**: in Python via `decompress_card(archive)`
  (`compression_pipeline.py:708-747`); in C++ via the `prvq_decoder`
  binary (`prvq_decoder.cpp:498-572` for `main`).

The `if __name__ == "__main__":` block in `prvq_serialize.py:450-484` is
a self-contained smoke test with Dirichlet-sampled probabilities + random
mask lengths — useful as a minimal repro.

### 6.3 Design documents

There is **no README.md, ARCHITECTURE.md, or design-document file** at
the repo root. Architectural rationale lives in module docstrings:

- `prvq_serialize.py:1-44` — full binary format specification for all
  four file types
- `prvq.py:223-252` — `ProductResidualVQ` class docstring with parameter
  semantics
- `prvq_decoder.cpp:1-23` — C++ decoder build / usage / contract notes
- `compression_pipeline.py:1-31` — archive layout and filter policy
- `hparam_search.py:1-48` — compression-ratio formula
- `analyse_sweep.py:1-29` — sweep analysis discipline
- `rot.py:1-29` — symmetry normalisation rationale (descriptive, even
  though the file is not wired in)
- `jsd_kmeans.py:1-20` and `:245-329` — Bhattacharyya-centroid theory for
  the JSD-distance variant

The decode-format spec at `prvq_serialize.py:1-44` is the load-bearing
artifact for cross-language interop (the C++ decoder is a translation of
it).

### 6.4 Tests and benchmarks

No `pytest`/`unittest` structure. Verification lives in-line:

- `test_roundtrip` (`compression_pipeline.py:314-423`) — invoked every
  time `compress_card` runs; raises on mismatch
  (`compression_pipeline.py:606-607`).
- `verify_roundtrip` (`prvq_serialize.py:399-444`) — invoked from the
  `__main__` smoke test.
- `dump_cpp_reference` (`compression_pipeline.py:430-458`) — flat-binary
  format for cross-checking the C++ decoder against the original NNOutputs.
- `rvq_verify.py` — referenced from `experiment.py:245` (commented out).
  Contains the `verify_quantizer` helper.

The "tests" are therefore production-path invariants asserted at archive
creation, plus a C++ regression channel — not a separate test suite.

### 6.5 Git history

10 commits, terse messages. Recent ones:

```
2f3c9c0 fix bug where env sync took positional arguments but passed named argument
47343eb better MDB_ opts
02fcd26 checkpoint
5457dfd checkpoint
5e42e3b Add filesystem archiving and SQL tracking for compressed NN cache
e8b0107 refactor card_decoder for LLM ease of use
c13a403 add fully streamlined archive_loader
d82feab checkpoint
797c346 refactor lmdb fetch to allow batched fetching
4e7f380 initial
```

No release tags, no documented migration arc between checkpoints. The
`5e42e3b` commit is the most recent feature; everything since is plumbing
fixes (LMDB options, bug fixes, refactors).

---

## 7. Caveats, pitfalls, "do differently"

### 7.1 Explicit caveats in the code

- **`prvq.py:18-30`** — the training-time distance kernel deliberately
  uses unmasked `c_sq`, which biases nearest-neighbour lookup but
  "empirically produces better codebooks for variable-length probability
  distributions than the mathematically exact form". A second exact
  kernel exists for evaluation only (`prvq.py:39-58`). The encoder
  exposes both as `encode()` (training-form) and `_encode_exact()`
  (eval-form) — note that the pipeline uses **`_encode_exact`**
  (`compression_pipeline.py:215`), so the production path takes the
  unbiased side at encoding time and the biased side only at training time.
- **`prvq.py:88-90`** — `codebooks[:num_quantizers]` slice is load-bearing.
  Without it, partial-Q encode calls silently include untrained
  codebooks. This is a sharp-edged failure mode if anyone uses the encoder
  with a `num_quantizers` argument smaller than the model's full `Q`.
- **`prvq.py:289-293`** — padding from `S × d > D` is silent (`print` only).
  For `D=362, S=56` the padding is 30 dimensions, never reconstructed
  back into the output (`prvq.py:138-140`).
- **`hparam_search.py:11-17`** — earlier `ClusteredPRVQ` variant was
  dropped because the clustering stage had no measurable positive effect
  on losses. The flat `ProductResidualVQ` is the survivor.
- **`jsd_kmeans.py:266-281`** — explicit retrospective: the previous
  geometric-mean (log-space) centroid updater was the wrong objective
  (it minimises reverse-KL, not JSD or Fisher-Rao). The current
  `InformationGeometricMeanUpdater` uses the Bhattacharyya / Hellinger
  centroid (`(mean √p_i)²` then renormalise), which IS the JSD-correct
  Fréchet mean to first order.
- **`compression_pipeline.py:471-484`** — the pipeline trains PRVQ on
  *all* policy vectors (including ones lacking an owner-map) but archives
  only the subset with owner-maps. The "more data → better codebooks"
  comment (`compression_pipeline.py:499-500`) is the rationale.
- **`prvq_decoder.cpp:41-46`** — ZSTD symbols are forward-declared so
  the file compiles without `libzstd-dev` headers; only the shared
  library is needed at link time. Operational portability note.

### 7.2 Hyperparameter sensitivity

`analyse_sweep.py:119-169` computes a Spearman-ρ table of
(parameter → JSD-max). I did not load `arf_partial.pkl` to extract the
numbers, but the analysis machinery is set up to detect:

- Sensitivity to `num_quantizers`, `num_subspaces`,
  `subspace_codebook_size` individually
- Sensitivity to `bits_per_sample` alone (the bit-budget proxy)
- Within-bits variance (does allocation matter beyond total budget?)
  — `analyse_sweep.py:193-224`

The output is gated on running `analyse_sweep.py` against
`arf_partial.pkl`. If the user wants the actual sensitivity numbers, the
file is 78 KB pickled and the analysis script is ~240 lines.

### 7.3 Things that look notable but aren't documented as gotchas

- The `KATACRD\x00` archive magic at `compression_pipeline.py:75` is
  fixed at version 1, with no upgrade path planned in code.
- `Hash128` uses **native byte order** (`kata_types.py:23, 28`:
  `struct.pack('=QQ', ...)`) while the archive header uses
  **little-endian** explicitly (`compression_pipeline.py:140`:
  `struct.pack('<8siiif', ...)`). On x86-64 these coincide; on a
  big-endian host the hashes would round-trip wrong while the rest of
  the archive would not. The C++ decoder reads everything LE
  (`prvq_decoder.cpp:53-67`), so a big-endian compress side would also
  desync with the decoder for non-hash fields.
- `kata_types.py:4-7` excludes `whiteNoResultProb` from `float_keys`
  ("implied 1-(whiteWinProb+whiteLossProb)" per
  `_compression_pipeline.py:30`). The archive therefore reconstructs it
  by subtraction implicitly; the pipeline does not verify this against
  the original at round-trip time. Minor information channel — the
  Python `test_roundtrip` doesn't include it in its scalar check
  (`compression_pipeline.py:380-388` uses `float_keys` which is the
  9-element list).
- `compression_pipeline.py:469` has a `min_refs` parameter typed as
  `Optional[int]` (with the comment `# ← new`) but `Optional` is not
  imported at the top of the file (`compression_pipeline.py:42`:
  `from typing import List, Tuple`). The file will `NameError` on
  first import unless the caller never touches that signature. Looks
  like the most recent "checkpoint" commits left this latent.
- `compression_pipeline.py:687-688` has a commented alternative form
  (`#archive_id = mgr.postgres.register_archive(archive_path)`) just
  below the active line — an unresolved decision about whether to
  store the basename or the absolute path.
- `_compression_pipeline.py:78-79` — the older pipeline's NYI markers
  for `ownermaps` and `policyProbs` archive storage are now done in
  the current pipeline; the older file is effectively dead code but
  retained.

### 7.4 What this scheme does NOT do

Worth listing for the LengYue arc's adaptation decisions:

- **No per-vector permutation** of any kind (section 4).
- **No FAISS dependency** — the quantiser is hand-written in JAX. The
  `_fast_l2_distances` einsum form is the hot path; benchmarks against
  FAISS-RQ are not in the repo.
- **No supervised / learned quantiser** — k-means only, no neural
  encoder/decoder.
- **No GPU-fused inference for the C++ decoder** — `prvq_decoder.cpp` is
  pure scalar C++ with `-O3 -march=native` (`prvq_decoder.cpp:13`).
- **No per-stage early termination** — all `Q` stages are always
  applied at decode time. The `num_quantizers` argument to `encode()`
  exists (`prvq.py:359`) but is for evaluating the quality-vs-stages
  curve, not for adaptive truncation per sample.
- **No cross-sample state** at decode time — each sample decodes
  independently from its `[Q, S]` codes. The pipeline-level sort is
  pure preprocessing for the mask sidechannel; it does not create
  cross-sample dependencies in the quantiser itself.

---

## 8. Cross-references for the LengYue arc

The user's stated context: "thousands of examples" to train on, the
prior use case didn't need to invert the permutation (sort was for
canonical lookup), LengYue needs full reconstruction.

Map to this codebase:

- **Training corpus**: the pipeline trains *per-card* on however many
  samples the card has (`compression_pipeline.py:487-489`). The default
  config was tuned at `N=133,429` (`hparam_search.py:46`), but the
  scheme itself does not require a held-out training set — each card's
  codebooks ship with the card's archive (`POLMODEL` section). If
  LengYue's analysis bundles are per-card or per-game, the same shape
  is available — train the codebooks on the bundle's own contents and
  ship them inline. Codebook overhead is `Q×S×K×d×4 = 6×56×256×7×4 ≈
  2.4 MB` at the default config, amortised across all samples in the
  archive.
- **Reconstruction needs full inverse**: PRVQ as implemented here *is*
  a full reconstruction quantiser — `decode()` (`prvq.py:373-380`)
  produces a `[N, D]` reconstruction in original-input space, masked
  positions set to `-1.0`. There is no canonicalisation-only path. So
  this codebase already operates in LengYue's regime on this axis.
- **Mask versus permutation**: the bridge from this codebase to a
  LengYue scheme that involves a sort-by-magnitude is the
  `rot.py`-style `sym_id` channel (`rot.py:171-249`) generalised from
  4 elements to a full per-sample permutation. The mask-aware path
  (sections 2.2, 2.3) is the alternative that this codebase chose
  instead. The two are mutually substitutable answers to the same
  difficulty — both shipped paths in this repo *also* transmit the
  mask sidechannel (section 4), so the architectural cost of an
  additional sidechannel is precedented.

---

## 9. Investigation notes

- **Read end-to-end**: `prvq.py` (738 lines), `compression_pipeline.py`
  (748 lines), `prvq_serialize.py` (485 lines), `prvq_decoder.cpp`
  (target sections through 572), `cmpr.py` (186 lines), `rot.py` (269
  lines), `masks/masks.py` (72 lines), `kata_types.py` (154 lines),
  `_compression_pipeline.py` (82 lines), `hparam_search.py` (333
  lines).
- **Read partially**: `jsd_kmeans.py` (read header + class-level
  docstrings for `CentroidUpdater`, `ArithmeticMeanUpdater`,
  `InformationGeometricMeanUpdater`, `JSDKMeans` — skipped the
  ~500-line implementation body of `JSDKMeans.fit`/`_run_single`
  since it is not wired into the production pipeline);
  `analyse_sweep.py` (read top 240 lines including all sections that
  describe metric semantics; the rest is matplotlib glue);
  `rvq_cont.py` (read first 90 lines covering the mask-free L2 kernel
  and encoder; the rest mirrors `prvq.py` without masking);
  `dry_run_ordering.py`, `loading_model.py`, `nncache_manager*.py`,
  `cross_boundary_sharing.py`, `sharing_analysis.py`,
  `archive_overlap.py`, `validate_sharing.py`,
  `repack_data.py`, `sender.py`, `notify.py`, `compute_overlap.py`,
  `load_data.py`, `rvq_serialize.py`, `rvq_serialize_works.py`,
  `rvq_verify.py` — these are LMDB plumbing, sweep orchestration,
  data-locality analysis, and sibling-format serialisation; they do
  not contain compression-scheme primitives.
- **Refused on safety grounds**: did not unpickle `default_config.pkl`,
  `configs_filtered.pkl`, or `arf_partial.pkl` (external pickle data).
  `default_config.pkl` values are reported in section 3.2 via hex
  inspection — the pickle is short enough for the key/value bytes to be
  unambiguous (`HParams` field names visible as strings, integer values
  as `K06`, `K38`, `M0001`, `K07`, `M800a`, plus a float64 for
  `compression_ratio`).
- **Did not run**: no scripts were executed. The C++ decoder was not
  compiled. The `out_dir/` reconstruction blobs were left unread.

---

## 10. The user's "sort by magnitude" — possible resolutions

Pure observation, no recommendation: the user's recollection does not
match the contents of this repo. Possible explanations the user can
disambiguate:

1. **Different repo** — there may be another folder (`~/nncache_*` or
   similar) carrying the sort-by-magnitude variant. The user flagged
   uncertainty: "I believe that's the folder having the functioning
   code, anyways."
2. **Discarded earlier iteration** — the scheme may have been tried,
   shipped briefly, then replaced by the mask-aware PRVQ. The git
   history is terse and the "checkpoint" commits could plausibly span
   an architectural pivot, though no file in the repo retains
   sort-by-magnitude code as dead-code or comments. The `jsd_kmeans.py`
   retrospectives (section 7.1) show the author does document
   dropped-approach reasoning when it's load-bearing.
3. **Different domain** — the "sort by magnitude" may have been in a
   neural-net-cache compression that wasn't this specific PRVQ scheme
   (the user's phrasing "from a neural-net-cache compression use case"
   could refer to a different cache, e.g. weights or activations rather
   than policy distributions).
4. **The mask-as-permutation rephrasing** — there is a structural
   parallel that is not "sort by magnitude" but is in the same
   conceptual family: the lexsort-on-mask preprocessing
   (`compression_pipeline.py:495`) reorders samples so the mask
   sidechannel compresses, which has the *shape* of "sort to make the
   structure more regular before quantisation" without sorting any
   values. It is conceivable the recollection is of this.

The deliverable above documents what is here. Re-examination against a
candidate alternate folder is the user's call.
