"""
research/compression/

Compression characterisation framework for the analysis-bundle
compression arc. See `docs/notes/analysis-bundle-compression-plan.md`
for the design space; this package is the first-cut implementation
of the lossless tier.

Module map:
  compressor.py    Abstract bases (Compressor, LosslessCompressor).
  identity.py      JSON-serialised family — IdentityLossless and the
                   Gzip/Zstd/Brotli codec layers stacked on it.
  packed.py        Type-tagged binary serialised family — PackedLossless
                   and its codec layers.
  bench.py         Driver: iterate the redis corpus at 127.0.0.1:6380,
                   run every registered compressor, emit per-packet CSV
                   and an aggregate stdout table.

License: Public Domain (The Unlicense)
"""
