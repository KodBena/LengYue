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
from .ownership import RawOwnership, TransposedOwnership
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


def bench_one(c: LosslessBundleCompressor, bundle: list[dict]) -> tuple[int, float, float, bool]:
    t0 = time.perf_counter()
    blob = c.encode(bundle)
    enc_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    decoded = c.decode(blob)
    dec_ms = (time.perf_counter() - t1) * 1000
    ok = decoded == bundle
    return len(blob), enc_ms, dec_ms, ok


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

    # Pre-flight roundtrip on the first bundle to fail loud on any
    # broken compressor before the full sweep.
    first_bundle = bundles[0][1]
    print("pre-flight roundtrip on first bundle:", flush=True)
    any_broken = False
    for c in ALL_BUNDLE_COMPRESSORS:
        ok = c.roundtrip_check(first_bundle)
        mark = "ok" if ok else "BROKEN"
        print(f"  {c.name:42s}  {mark}", flush=True)
        if not ok:
            any_broken = True
    if any_broken:
        print("ERROR: at least one compressor failed pre-flight", file=sys.stderr)
        return 2

    per_compressor: dict[str, list[tuple[int, float, float, bool, int]]] = {
        c.name: [] for c in ALL_BUNDLE_COMPRESSORS
    }

    with out_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "stem", "n_packets", "compressor",
            "bytes", "encode_ms", "decode_ms", "roundtrip_ok",
        ])

        t_start = time.monotonic()
        for stem, bundle in bundles:
            for c in ALL_BUNDLE_COMPRESSORS:
                bytes_, e_ms, d_ms, ok = bench_one(c, bundle)
                w.writerow([
                    stem, len(bundle), c.name,
                    bytes_, f"{e_ms:.3f}", f"{d_ms:.3f}", "Y" if ok else "N",
                ])
                per_compressor[c.name].append((bytes_, e_ms, d_ms, ok, len(bundle)))
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
        f"{'compressor':42s}  {'bundle-mean':>11s}  {'bytes/pkt':>10s}  "
        f"{'ratio':>6s}  {'enc-ms':>8s}  {'dec-ms':>8s}  {'rt':>3s}",
        flush=True,
    )
    print("-" * 100, flush=True)
    for c in ALL_BUNDLE_COMPRESSORS:
        rows = per_compressor[c.name]
        total_bytes = sum(r[0] for r in rows)
        mean_bundle = statistics.mean(r[0] for r in rows)
        total_pkts = sum(r[4] for r in rows)
        bytes_per_pkt = total_bytes / max(total_pkts, 1)
        ratio = total_bytes / max(baseline_total, 1)
        enc_ms = statistics.mean(r[1] for r in rows)
        dec_ms = statistics.mean(r[2] for r in rows)
        rt_ok_count = sum(1 for r in rows if r[3])
        rt_mark = "Y" if rt_ok_count == len(rows) else f"{rt_ok_count}/{len(rows)}"
        print(
            f"{c.name:42s}  {fmt_bytes(mean_bundle):>11s}  {fmt_bytes(bytes_per_pkt):>10s}  "
            f"{ratio:>6.3f}  {enc_ms:>8.1f}  {dec_ms:>8.1f}  {rt_mark:>3s}",
            flush=True,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
