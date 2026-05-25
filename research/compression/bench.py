"""
research/compression/bench.py

Driver for the compression characterisation sweep. Iterates the
final-packet corpus in redis (127.0.0.1:6380 by default), runs every
registered compressor over every packet, records per-packet bytes
+ encode-time + decode-time + round-trip ok, writes a per-packet
CSV under ~/plots/, and prints an aggregate stdout table.

Usage:
  python -m research.compression.bench

The compressor registry is `ALL_COMPRESSORS`; add new entries there
(lossless or lossy) to include them in the next sweep. The table
column for "ratio" is each compressor's mean bytes divided by
IdentityLossless's mean bytes — the wire-as-JSON baseline.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import csv
import pickle
import statistics
import sys
import time
from pathlib import Path
from typing import Iterable

import redis

from .compressor import LosslessCompressor
from .identity import (
    IdentityLossless,
    JsonGzipLossless,
    JsonZstdLossless,
    JsonBrotliLossless,
)
from .packed import (
    PackedLossless,
    PackedGzipLossless,
    PackedZstdLossless,
    PackedBrotliLossless,
)


# Ordered for table-presentation lineage: Identity family first, then
# Packed family. Each block lists the no-codec baseline first, then
# the codec variants in alphabetical order.
ALL_COMPRESSORS: list[LosslessCompressor] = [
    IdentityLossless(),
    JsonBrotliLossless(),
    JsonGzipLossless(),
    JsonZstdLossless(),
    PackedLossless(),
    PackedBrotliLossless(),
    PackedGzipLossless(),
    PackedZstdLossless(),
]


def iter_packets(r: redis.Redis) -> Iterable[tuple[str, dict]]:
    """Yield (stream_key, packet_dict) for every final packet in the
    corpus. The corpus convention is one-realization-per-(stem,turn)
    with the final packet as the stream's single entry."""
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    for k in keys:
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        # The corpus contract is one entry per stream; iterate
        # defensively in case a future variant records multiple.
        for _id, fields in entries:
            yield k, pickle.loads(fields[b"msg"])


def bench_one(
    compressor: LosslessCompressor, packet: dict
) -> tuple[int, float, float, bool]:
    """One compressor against one packet. Returns
    (bytes, encode_ms, decode_ms, roundtrip_ok)."""
    t0 = time.perf_counter()
    blob = compressor.encode(packet)
    enc_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    decoded = compressor.decode(blob)
    dec_ms = (time.perf_counter() - t1) * 1000
    ok = decoded == packet
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
        default=str(Path.home() / "plots" / "compression-bench-2026-05-25.csv"),
    )
    ap.add_argument(
        "--baseline",
        default="Identity",
        help="Compressor name to use as the ratio reference column.",
    )
    args = ap.parse_args()

    out_csv = Path(args.out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    r = redis.Redis(host=args.redis_host, port=args.redis_port, decode_responses=False)
    r.ping()

    print(
        f"compression bench — {len(ALL_COMPRESSORS)} compressors × "
        f"redis {args.redis_host}:{args.redis_port}",
        flush=True,
    )
    print(f"output csv: {out_csv}", flush=True)

    # Pre-flight round-trip check on the first packet, so we fail
    # loud if a compressor is broken before walking the whole corpus.
    first_packet: dict | None = None
    for _, p in iter_packets(r):
        first_packet = p
        break
    if first_packet is None:
        print("ERROR: no packets in redis — collection corpus missing?", file=sys.stderr)
        return 2
    print("pre-flight roundtrip on first packet:", flush=True)
    any_broken = False
    for c in ALL_COMPRESSORS:
        ok = c.roundtrip_check(first_packet)
        mark = "ok" if ok else "BROKEN"
        print(f"  {c.name:18s}  {mark}", flush=True)
        if not ok:
            any_broken = True
    if any_broken:
        print("ERROR: at least one compressor failed pre-flight roundtrip", file=sys.stderr)
        return 2

    # Full sweep.
    per_compressor: dict[str, list[tuple[int, float, float, bool]]] = {
        c.name: [] for c in ALL_COMPRESSORS
    }

    with out_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["key", "compressor", "bytes", "encode_ms", "decode_ms", "roundtrip_ok"])

        t_start = time.monotonic()
        n_packets = 0
        for key, packet in iter_packets(r):
            n_packets += 1
            for c in ALL_COMPRESSORS:
                bytes_, e_ms, d_ms, ok = bench_one(c, packet)
                w.writerow(
                    [key, c.name, bytes_, f"{e_ms:.3f}", f"{d_ms:.3f}", "Y" if ok else "N"]
                )
                per_compressor[c.name].append((bytes_, e_ms, d_ms, ok))
            if n_packets % 100 == 0:
                elapsed = time.monotonic() - t_start
                rate = n_packets / max(elapsed, 1e-9)
                print(
                    f"  {n_packets} packets, {elapsed:.1f}s, {rate:.0f} pkt/s",
                    flush=True,
                )

    elapsed = time.monotonic() - t_start
    print(
        f"sweep: {n_packets} packets × {len(ALL_COMPRESSORS)} compressors "
        f"in {elapsed:.1f}s",
        flush=True,
    )

    # Aggregate table.
    baseline_results = per_compressor.get(args.baseline)
    if baseline_results is None:
        print(
            f"ERROR: baseline {args.baseline!r} not in registry; "
            f"available: {[c.name for c in ALL_COMPRESSORS]}",
            file=sys.stderr,
        )
        return 2
    baseline_mean = statistics.mean(r[0] for r in baseline_results)

    print(flush=True)
    print(
        f"{'compressor':18s}  {'mean':>8s}  {'p50':>8s}  {'p95':>8s}  "
        f"{'min':>7s}  {'max':>8s}  {'ratio':>6s}  "
        f"{'enc-ms':>8s}  {'dec-ms':>8s}  {'rt':>3s}",
        flush=True,
    )
    print("-" * 110, flush=True)
    for c in ALL_COMPRESSORS:
        rows = per_compressor[c.name]
        bytes_ = sorted(r[0] for r in rows)
        mean_b = statistics.mean(bytes_)
        p50 = bytes_[len(bytes_) // 2]
        p95 = bytes_[int(len(bytes_) * 0.95)]
        min_b = bytes_[0]
        max_b = bytes_[-1]
        ratio = mean_b / baseline_mean
        enc_ms = statistics.mean(r[1] for r in rows)
        dec_ms = statistics.mean(r[2] for r in rows)
        rt_ok_count = sum(1 for r in rows if r[3])
        rt_mark = "Y" if rt_ok_count == len(rows) else f"{rt_ok_count}/{len(rows)}"
        print(
            f"{c.name:18s}  {fmt_bytes(mean_b):>8s}  {fmt_bytes(p50):>8s}  "
            f"{fmt_bytes(p95):>8s}  {fmt_bytes(min_b):>7s}  "
            f"{fmt_bytes(max_b):>8s}  {ratio:>6.3f}  "
            f"{enc_ms:>8.2f}  {dec_ms:>8.2f}  {rt_mark:>3s}",
            flush=True,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
