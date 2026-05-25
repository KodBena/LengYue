# Analysis Bundle Compression — Research Summary

- **Status:** Archived. Research arc complete. Implementation plan
  at `docs/notes/analysis-bundle-compression-plan.md`.
- **Genre:** Research summary. Captures the empirical findings,
  the inheritance framework used, the comparative leaderboard,
  and the negative results that pruned the design space.
- **Date:** 2026-05-25.
- **Source:** Research branch `bork/research/analysis-bundle-compression-2026-05-25`
  (9 commits, `4e139c2`..`8e5091e`). Code under `research/compression/`;
  collection script + redis corpus at `research/collect_compression_corpus.py`.

## What this document is

A contributor's mental model of what the research arc tried, what
it learned, and what it concluded. The implementation plan picks
up from here and specifies what to build; this note is the
"why" the plan made its choices.

## Corpus

Three games, 608 final-packet analyses collected via
`research/collect_compression_corpus.py`:

- Proxy: `ws://127.0.0.1:1235` (SELECTOR mode, KataGo 1.16.5)
- Model: `b10c128`, 200 visits per turn
- Palette: the seeded "Quality (Robust-Child Calibrated)" so each
  packet carries the `extra.{state, black, white}` enrichment the
  SPA actually sends
- Storage: `redis-cli -p 6380`, keys `traj:{stem}:t{turn}:r0`
- Sizes: ~16.8 KB per packet uncompressed JSON; ~11 KB pickled
- ~9 MB total dataset

The collection script's wire shape matches what an SPA bundle
PUT would actually contain (modulo pickle vs JSON framing —
`pg_sink.py`'s pickle is semantically equivalent at the dict
level).

## Framework

Inheritance hierarchy chosen for auditability; every variant's
lineage is readable from the class graph.

```
Compressor                       per-packet abstract base
├── LosslessCompressor           round-trip dict-`==`
│   ├── IdentityLossless         JSON, no codec — the wire baseline
│   │   ├── JsonGzipLossless     ↳ + gzip
│   │   ├── JsonZstdLossless     ↳ + zstd
│   │   └── JsonBrotliLossless   ↳ + brotli
│   ├── PackedLossless           schema-aware binary serialiser
│   │   ├── PackedGzipLossless   ↳ + gzip
│   │   ├── PackedZstdLossless   ↳ + zstd
│   │   └── PackedBrotliLossless ↳ + brotli
│   └── JsonProjectedLossless    JSON through SPA's typed-shape allow-list
│       ├── JsonProjectedGzipLossless
│       ├── JsonProjectedZstdLossless
│       └── JsonProjectedBrotliLossless

OwnershipCompressor              sequence of ownership maps
├── RawOwnership                 packet-major raw float64
├── TransposedOwnership          coord-major raw float64
├── DeltaOwnership               packet-major + XOR-delta vs prev packet
├── TransposedDeltaOwnership     coord-major + XOR-delta along time
├── SortedDeltaOwnership         per-packet sort + XOR-delta + uint16 perm
├── FlatSortedDeltaOwnership     bundle-flat sort + XOR-delta + uint32 perm
├── LossyOwnershipCompressor     (marker; is_lossless=False)
    ├── UniformScalarQuantOwnership(bits)        fixed uniform bins
    ├── KMeansScalarQuantOwnership(k)            sklearn KMeans on flat values
    ├── ProductVQOwnership(m, k)                 sklearn KMeans on M sub-vectors
    ├── ProductResidualVQOwnership(ns, M, b)     FAISS PRVQ
    └── DeltaUniformScalarQuantOwnership(b, dr)  DPCM + uniform quant

BundleCompressor                 per-list-of-packets abstract base
└── LosslessBundleCompressor
    ├── PerPacketBundle(inner)              lifts a per-packet Compressor
    ├── OwnershipFactoredBundle(rest, own)  factors ownership out for separate encoding
    ├── GzipBundle(inner)                   codec wrapper
    ├── ZstdBundle(inner)                   codec wrapper
    └── BrotliBundle(inner)                 codec wrapper
```

Each ownership variant declares `is_lossless` so the bench harness
switches between bit-equality assertion and reconstruction-error
measurement (L2-RMSE + L-infinity max-abs) automatically.

## Findings (key tables)

### Lossless tier

```
compressor                                           bytes/pkt   ratio
Bundle[Identity]                                         16.8K   1.000
Bundle[JsonBrotli]                                        5.2K   0.309
Bundle[Packed]                                            8.8K   0.521
Bundle[PackedBrotli]                                      6.8K   0.404
OFB[Identity,Raw]+Brotli                                  4.9K   0.288
OFB[Packed,Raw]+Brotli                                    5.3K   0.315
OFB[JsonProjected,Raw]+Brotli                             3.7K   0.218
```

### Lossy tier (ownership quantisation)

```
compressor                              bytes/pkt  ratio   L2-rmse   max-abs   enc-ms
OFB[Identity,UniformQ4b]+Brotli              3.3K  0.197   0.0372    0.0625      197
OFB[Identity,UniformQ8b]+Brotli              3.5K  0.208   0.0022    0.0039      209
OFB[Identity,KMeansQ16]+Brotli               3.3K  0.197   0.0332    0.0834      757
OFB[Identity,PVQ_m19_k16]+Brotli             3.5K  0.206   0.0475    0.9576      478
OFB[Identity,PRVQ_ns19_M2_b4]+Brotli         3.5K  0.207   0.0519    1.5442      557
OFB[Identity,PRVQ_ns19_M4_b4]+Brotli         3.7K  0.220   0.0266    0.5083     1109
OFB[Identity,DeltaUQ4b_dr200]+Brotli         3.3K  0.196   0.0717    0.1250      194
OFB[JsonProjected,UniformQ4b]+Brotli         2.1K  0.127   0.0372    0.0625      123
```

### Final leaderboard

| tier | leader | ratio | notes |
|---|---|---|---|
| Lossless on wire | `OFB[Identity, Raw] + Brotli` | 0.288 | bit-exact, all wire fields preserved |
| Lossless on SPA schema | `OFB[JsonProjected, Raw] + Brotli` | **0.218** | drops fields the SPA doesn't model; SPA-observable round-trip is exact |
| Lossy | `OFB[JsonProjected, UniformQ4b] + Brotli` | **0.127** | ownership quantised to 4 bits per cell; max-abs ≤ 0.0625 |

The lossy leader is 7.9× smaller than uncompressed Identity JSON,
and 2.3× smaller than the prior lossless leader from earlier in
the arc.

## Negative results (the design-space pruning)

Recording these because they're what the next contributor needs
to know NOT to try again. Each was empirically tested and
documented in the research branch.

1. **Schema-aware Packed serialiser + codec is WORSE than JSON +
   codec.** Packed deduplicates field names; brotli's back-
   references love JSON's repeated field names, so removing the
   redundancy preemptively pessimises the codec. Bench:
   `Bundle[PackedBrotli]` 0.404 vs `Bundle[JsonBrotli]` 0.309.

2. **XOR-delta along time (Transposed or Delta layouts) regresses
   with codecs.** `OFB[Identity, Raw]+Brotli` = 0.288; the delta
   variants land at 0.344. Brotli finds back-references to exact
   float64 byte patterns that repeat across packets in Raw; XOR-
   delta destroys those repeats and concentrates entropy in
   mantissa low bits where the codec has less leverage.

3. **Sort + XOR-delta (per-packet or flat) is dominated by Raw +
   codec.** The permutation index overhead (25-50% pre-codec)
   never recovers. Permutations are essentially uniform-random
   over the index range and don't compress.

4. **K-means scalar quantization beats uniform on L2-RMSE but
   loses on max-abs.** Centroids redistribute toward dense
   regions (ownership clusters at ±1 and 0); sparse-region cells
   pay larger max-abs error. Uniform's max-abs is analytically
   bounded by half-bin-width.

5. **Product VQ and Product-Residual VQ are dominated at our
   N≈200 corpus size.** FAISS needs ~40×K training points per
   stage; we have ~N. At every (nsplits, M_sub, nbits) tested,
   PRVQ's max-abs stayed at 0.5-1.6 (much worse than UniformQ4b's
   0.063) and compression ratio was no better. Smaller K helps
   training but doesn't compensate for less expressiveness per
   stage at matched bit-budget.

6. **DPCM (subtraction-delta + uniform quant) at narrow
   `delta_range` blows up max-abs on cells that flip ownership.**
   The "narrow range → finer resolution" tradeoff fails when
   clipping events lock a cell's reconstruction off by 1.5+.
   With `delta_range = 2.0` (no clipping), DPCM is mathematically
   2× worse per step than direct UniformQ at the same bit-depth.

## Methodology notes

### Inheritance for auditability

The hierarchy makes each variant's lineage explicit: a reader
seeing `PackedZstdLossless` knows it shares its serialisation
with `PackedLossless` and adds zstd. Crucially, the IS-A choice
that `JsonGzipLossless IS-A IdentityLossless` (rather than
peers) acknowledges that they share JSON serialisation; the
codec is a layered transform on top.

### Bench harness

`research/compression/bundle_bench.py` iterates the redis corpus,
groups by `stem` (one game = one bundle), runs every registered
compressor, records per-bundle byte counts + encode/decode times.
Lossless variants get a bit-equality assertion; lossy variants
get L2-RMSE + L-infinity max-abs on the ownership component
(non-ownership fields still asserted equal — projection variants
are the exception, where some fields are explicitly dropped).

### Firewall pattern

Early in the arc the naïve Packed format showed 0.845 ratio (just
15% saved by stripping JSON). A fresh-eyes Opus 4.7 agent (no
parent-session context) reviewed the implementation, identified
that 26% of the budget was spent on repeated dict-key names, and
prototyped a version with per-blob key interning that hit 0.601.
The improvement transferred to the schema-aware approach (0.521
in the lossless tier; 0.218 with projection). The firewall
pattern paid off the same way the F-optimizer retrospective
recorded it doing.

## What's preserved on the research branch

- `research/compression/` — the inheritance hierarchy
- `research/collect_compression_corpus.py` — the data-collection
  harness (proxy + redis + b10c128)
- `research/compression/bench.py` (per-packet) and `bundle_bench.py`
  (per-bundle) — the measurement harnesses
- `research/compression/test_packed.py` + `test_bundle.py` — round-
  trip tests including bit-exact-varied-float and synthetic high-
  turn-number cases
- `redis-cli -p 6380` corpus — 608 packets, ~9 MB, still live
- ~/plots/compression-bundle-bench-2026-05-25.csv — per-
  (bundle, compressor) bench rows

The branch isn't merged to main; the implementation port (per
`docs/notes/analysis-bundle-compression-plan.md`) is a fresh
TypeScript + Python build informed by these findings, not a
direct copy.

License: Public Domain (The Unlicense)
