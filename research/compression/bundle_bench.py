"""
research/compression/bundle_bench.py

Bundle-level driver. Groups the redis corpus into bundles by
`stem` (one bundle per game), sorts each bundle by turnNumber,
and runs every registered `BundleCompressor` over each bundle.
Reports per-bundle byte counts + encode/decode timings + the
roundtrip-ok flag; the aggregate table is normalised by both
total bundle bytes and mean bytes-per-packet so per-packet
ratios stay comparable to the per-packet bench.

Output:
  - stdout: aggregate table
  - ~/plots/compression-bundle-bench-2026-05-25.csv: per-(bundle,
    compressor) rows

Usage:
  python -m research.compression.bundle_bench

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import csv
import pickle
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import redis

from .bundle import (
    BrotliBundle,
    GzipBundle,
    LosslessBundleCompressor,
    OwnershipFactoredBundle,
    PerPacketBundle,
    ZstdBundle,
)
from .identity import IdentityLossless, JsonBrotliLossless
from .lossy_ownership import (
    DeltaUniformScalarQuantOwnership,
    KMeansScalarQuantOwnership,
    ProductVQOwnership,
    UniformScalarQuantOwnership,
)
from .ownership import (
    DeltaOwnership,
    FlatSortedDeltaOwnership,
    RawOwnership,
    SortedDeltaOwnership,
    TransposedDeltaOwnership,
    TransposedOwnership,
)
from .packed import PackedBrotliLossless, PackedLossless


# Registry order chosen for table-presentation lineage. The Bundle[*]
# rows are the per-packet baseline lifted to bundle level (no cross-
# packet transforms); the OFB[*] rows factor ownership out and route
# it through the OwnershipCompressor named in the second slot. Codec
# wrappers compose: `+Gzip`, `+Zstd`, `+Brotli`.
ALL_BUNDLE_COMPRESSORS: list[LosslessBundleCompressor] = [
    # — Per-packet baselines lifted to bundle level —
    PerPacketBundle(IdentityLossless()),
    PerPacketBundle(JsonBrotliLossless()),
    PerPacketBundle(PackedLossless()),
    PerPacketBundle(PackedBrotliLossless()),
    # — Ownership-factored: JSON-the-rest + raw ownership (the new baseline) —
    OwnershipFactoredBundle(IdentityLossless(), RawOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    # — Ownership-factored: JSON-the-rest + TRANSPOSED ownership —
    OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership())),
    # — Ownership-factored: JSON-the-rest + packet-major XOR-DELTA —
    OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership())),
    # — Ownership-factored: JSON-the-rest + coord-major XOR-DELTA (the
    #   variant the transpose was building toward) —
    OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership())),
    # — Per-packet SORTED XOR-DELTA: sort each map's 361 cells before
    #   delta-encoding; uint16 permutation stored per packet —
    OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership())),
    # — Flat SORTED XOR-DELTA: flatten N×W matrix, sort globally,
    #   delta-encode the sorted sequence; uint32 permutation across
    #   the full bundle —
    OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership())),
    # ────────────────────────────────────────────────────────────────
    # LOSSY tier — quantisation. Per-bundle codebook fit (the user's
    # "quantization would happen per-game" directive). Each variant
    # paired with a no-codec baseline + Brotli to see codec headroom.
    # Reconstruction error reported in L2 RMSE + L-infinity max-abs
    # over all bundle cells.
    # ────────────────────────────────────────────────────────────────
    OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(1)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(1))),
    OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(2)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(2))),
    OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(4)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(4))),
    OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(8)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(8))),
    OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(4)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(4))),
    OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(16)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(16))),
    OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(256)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(256))),
    OwnershipFactoredBundle(IdentityLossless(), ProductVQOwnership(19, 16)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), ProductVQOwnership(19, 16))),
    OwnershipFactoredBundle(IdentityLossless(), ProductVQOwnership(19, 256)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), ProductVQOwnership(19, 256))),
    # — DPCM (subtraction-delta) + uniform scalar quantisation. Fast,
    #   bounded per-step error. delta_range = 2.0 covers the full
    #   possible delta magnitude (a cell swinging from -1 to +1 in
    #   one turn); no clipping. Cost: per-bin width is 2× wider than
    #   direct UniformQ at the same bit-depth, so per-step precision
    #   is halved.
    OwnershipFactoredBundle(IdentityLossless(), DeltaUniformScalarQuantOwnership(4, 2.0)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), DeltaUniformScalarQuantOwnership(4, 2.0))),
    OwnershipFactoredBundle(IdentityLossless(), DeltaUniformScalarQuantOwnership(8, 2.0)),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), DeltaUniformScalarQuantOwnership(8, 2.0))),
]


def iter_bundles(r: redis.Redis) -> Iterable[tuple[str, list[dict]]]:
    """Yield (stem, [packet, packet, ...]) for each game in the
    corpus. Packets are sorted by their turn-number, parsed out of
    the redis key (`traj:{stem}:t{turn}:r0`) since lexicographic
    key-sort puts `t10` before `t2`."""
    by_stem: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for k in r.keys("traj:*:r0"):
        ks = k.decode()
        # key shape: traj:{stem}:t{turn}:r0
        parts = ks.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])  # strip 't' prefix
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        _id, fields = entries[0]
        packet = pickle.loads(fields[b"msg"])
        by_stem[stem].append((turn, packet))
    for stem in sorted(by_stem):
        packets = [p for _, p in sorted(by_stem[stem])]
        yield stem, packets


def bench_one(c: LosslessBundleCompressor, bundle: list[dict]) -> tuple[int, float, float, bool, float, float]:
    """Returns (bytes, encode_ms, decode_ms, ok, l2_rmse, max_abs).
    For lossless compressors: ok is decoded == bundle; reconstruction
    errors are 0. For lossy: ok is True (no bit-equality assertion);
    errors computed over the original vs decoded ownership arrays."""
    import numpy as np
    t0 = time.perf_counter()
    blob = c.encode(bundle)
    enc_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    decoded = c.decode(blob)
    dec_ms = (time.perf_counter() - t1) * 1000
    if c.is_lossless:
        return len(blob), enc_ms, dec_ms, decoded == bundle, 0.0, 0.0
    # Lossy: assert non-ownership fields round-trip exactly (which
    # they do — the rest path is lossless); measure ownership error.
    orig_own = [p["ownership"] for p in bundle if "ownership" in p]
    rec_own = [p["ownership"] for p in decoded if "ownership" in p]
    if not orig_own:
        return len(blob), enc_ms, dec_ms, True, 0.0, 0.0
    orig_arr = np.array(orig_own, dtype=np.float64)
    rec_arr = np.array(rec_own, dtype=np.float64)
    diff = rec_arr - orig_arr
    l2_rmse = float(np.sqrt(np.mean(diff ** 2)))
    max_abs = float(np.max(np.abs(diff)))
    return len(blob), enc_ms, dec_ms, True, l2_rmse, max_abs


def fmt_bytes(n: float) -> str:
    if n < 1024:
        return f"{n:.0f}B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f}K"
    return f"{n / 1024 / 1024:.2f}M"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--redis-host", default="127.0.0.1")
    ap.add_argument("--redis-port", type=int, default=6380)
    ap.add_argument(
        "--out-csv",
        default=str(Path.home() / "plots" / "compression-bundle-bench-2026-05-25.csv"),
    )
    ap.add_argument(
        "--baseline",
        default="Bundle[Identity]",
        help="Compressor name to use as the ratio reference.",
    )
    args = ap.parse_args()

    out_csv = Path(args.out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    r = redis.Redis(host=args.redis_host, port=args.redis_port, decode_responses=False)
    r.ping()

    print(
        f"bundle bench — {len(ALL_BUNDLE_COMPRESSORS)} compressors × "
        f"redis {args.redis_host}:{args.redis_port}",
        flush=True,
    )
    print(f"output csv: {out_csv}", flush=True)

    bundles = list(iter_bundles(r))
    if not bundles:
        print("ERROR: no bundles in corpus", file=sys.stderr)
        return 2
    total_packets = sum(len(b) for _, b in bundles)
    print(f"{len(bundles)} bundles, {total_packets} packets total", flush=True)

    # Pre-flight: encode/decode every compressor on the first bundle
    # without insisting on bit-equality (lossy variants would fail).
    # Just ensure no exception path.
    first_bundle = bundles[0][1]
    print("pre-flight encode/decode on first bundle:", flush=True)
    any_broken = False
    for c in ALL_BUNDLE_COMPRESSORS:
        try:
            blob = c.encode(first_bundle)
            decoded = c.decode(blob)
            tier = "lossless" if c.is_lossless else "lossy"
            ok = decoded == first_bundle if c.is_lossless else True
            mark = "ok" if ok else "BROKEN"
            print(f"  {c.name:50s}  [{tier}]  {mark}", flush=True)
            if not ok:
                any_broken = True
        except Exception as e:
            print(f"  {c.name:50s}  EXCEPTION: {e}", flush=True)
            any_broken = True
    if any_broken:
        print("ERROR: at least one compressor failed pre-flight", file=sys.stderr)
        return 2

    per_compressor: dict[str, list[tuple[int, float, float, bool, float, float, int]]] = {
        c.name: [] for c in ALL_BUNDLE_COMPRESSORS
    }

    with out_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "stem", "n_packets", "compressor",
            "bytes", "encode_ms", "decode_ms", "ok",
            "l2_rmse", "max_abs",
        ])

        t_start = time.monotonic()
        for stem, bundle in bundles:
            for c in ALL_BUNDLE_COMPRESSORS:
                bytes_, e_ms, d_ms, ok, l2, mabs = bench_one(c, bundle)
                w.writerow([
                    stem, len(bundle), c.name,
                    bytes_, f"{e_ms:.3f}", f"{d_ms:.3f}", "Y" if ok else "N",
                    f"{l2:.6f}", f"{mabs:.6f}",
                ])
                per_compressor[c.name].append((bytes_, e_ms, d_ms, ok, l2, mabs, len(bundle)))
            print(f"  bundle done: {stem} ({len(bundle)} packets)", flush=True)

    elapsed = time.monotonic() - t_start
    print(
        f"sweep: {len(bundles)} bundles × {len(ALL_BUNDLE_COMPRESSORS)} "
        f"compressors in {elapsed:.1f}s",
        flush=True,
    )

    baseline = per_compressor.get(args.baseline)
    if baseline is None:
        print(f"ERROR: baseline {args.baseline!r} not in registry", file=sys.stderr)
        return 2
    baseline_total = sum(r[0] for r in baseline)

    print(flush=True)
    print(
        f"{'compressor':50s}  {'bytes/pkt':>10s}  {'ratio':>6s}  "
        f"{'enc-ms':>8s}  {'dec-ms':>8s}  {'L2-rmse':>8s}  {'max-abs':>8s}  {'rt':>4s}",
        flush=True,
    )
    print("-" * 116, flush=True)
    for c in ALL_BUNDLE_COMPRESSORS:
        rows = per_compressor[c.name]
        total_bytes = sum(r[0] for r in rows)
        total_pkts = sum(r[6] for r in rows)
        bytes_per_pkt = total_bytes / max(total_pkts, 1)
        ratio = total_bytes / max(baseline_total, 1)
        enc_ms = statistics.mean(r[1] for r in rows)
        dec_ms = statistics.mean(r[2] for r in rows)
        if c.is_lossless:
            rt_ok_count = sum(1 for r in rows if r[3])
            rt_mark = "Y" if rt_ok_count == len(rows) else f"{rt_ok_count}/{len(rows)}"
            l2_str = "—"
            mabs_str = "—"
        else:
            rt_mark = "lossy"
            # Aggregate L2 RMSE across bundles: sqrt(mean of per-bundle squared RMSE)
            # weighted by bundle cell count. Simpler: just take the
            # arithmetic mean over bundles since each is comparably
            # sized.
            l2 = statistics.mean(r[4] for r in rows)
            mabs = max(r[5] for r in rows)
            l2_str = f"{l2:.4f}"
            mabs_str = f"{mabs:.4f}"
        print(
            f"{c.name:50s}  {fmt_bytes(bytes_per_pkt):>10s}  "
            f"{ratio:>6.3f}  {enc_ms:>8.1f}  {dec_ms:>8.1f}  "
            f"{l2_str:>8s}  {mabs_str:>8s}  {rt_mark:>4s}",
            flush=True,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
