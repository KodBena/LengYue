"""
research/compression/measure_policy_quant.py

One-shot measurement: how much do we save by also factoring + uniform-
quantising the `policy` field, on top of the current lossy leader
(JSON-projected rest + ownership at UniformQ4b + brotli)?

The current leader (per bundle_bench.py) leaves `policy` (362 floats
in [0, 1]) in the JSON-rest. This script measures four scenarios on
the same corpus:

  S0  ownership-only factoring (current leader; policy stays in JSON-rest)
  S1  ownership Q4b + policy raw float64 factored
  S2  ownership Q4b + policy Q4b ([0,1] range)
  S3  ownership Q4b + policy Q8b ([0,1] range)

Reports per-bundle bytes / ratio / policy reconstruction error.

Doesn't update the framework; if the saving is meaningful the
proper refactor (parameterise UniformScalarQuant's range, add
OwnershipPolicyFactoredBundle) follows as its own commit.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import io
import json
import pickle
import struct
from collections import defaultdict

import brotli
import numpy as np
import redis


# Allow-lists mirror JsonProjectedLossless (frontend/src/engine/katago/types.ts).
ALLOWED_ROOT = {"id", "isDuringSearch", "turnNumber", "moveInfos",
                "rootInfo", "ownership", "policy", "extra"}
# Variant that drops policy entirely — the SPA doesn't currently consume it
# (verified via grep over frontend/src/composables /services /engine; the
# typed-shape declares `policy?: readonly number[]` but nothing reads it).
ALLOWED_ROOT_NO_POLICY = ALLOWED_ROOT - {"policy"}
ALLOWED_MOVEINFO = {"move", "visits", "winrate", "scoreLead",
                    "pv", "order", "clusterId"}
ALLOWED_ROOTINFO = {"winrate", "scoreLead", "visits", "currentPlayer"}
ALLOWED_EXTRA = {"state", "black", "white"}


def project(p, allow=ALLOWED_ROOT):
    out = {}
    for k, v in p.items():
        if k not in allow:
            continue
        if k == "rootInfo" and isinstance(v, dict):
            out[k] = {kk: v[kk] for kk in v if kk in ALLOWED_ROOTINFO}
        elif k == "moveInfos" and isinstance(v, list):
            out[k] = [{kk: mi[kk] for kk in mi if kk in ALLOWED_MOVEINFO} for mi in v]
        elif k == "extra" and isinstance(v, dict):
            out[k] = {kk: v[kk] for kk in v if kk in ALLOWED_EXTRA}
        else:
            out[k] = v
    return out


def quantise_uniform(values: np.ndarray, bits: int, lo: float, hi: float) -> np.ndarray:
    n_bins = 1 << bits
    v = np.clip(values, lo, hi)
    span = hi - lo
    idx = ((v - lo) * (n_bins / span)).astype(np.int64)
    return np.minimum(idx, n_bins - 1).astype(np.uint64)


def dequantise_uniform(idx: np.ndarray, bits: int, lo: float, hi: float) -> np.ndarray:
    n_bins = 1 << bits
    return lo + (idx.astype(np.float64) + 0.5) * ((hi - lo) / n_bins)


def pack_4bit(idx: np.ndarray) -> bytes:
    """Pack 4-bit values, two per byte (low nibble first)."""
    arr = idx.astype(np.uint8)
    if len(arr) % 2:
        arr = np.concatenate([arr, np.zeros(1, dtype=np.uint8)])
    return (arr[0::2] | (arr[1::2] << 4)).tobytes()


def pack_8bit(idx: np.ndarray) -> bytes:
    return idx.astype(np.uint8).tobytes()


def encode_uvarint(n: int) -> bytes:
    out = bytearray()
    while n > 0x7F:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n & 0x7F)
    return bytes(out)


def build_blob(packets_rest_blobs: list[bytes],
               ownership_blob: bytes,
               policy_blob: bytes | None) -> bytes:
    """Mimic OwnershipFactoredBundle's wire shape, with optional
    additional policy-blob segment. Header carries the lengths."""
    out = io.BytesIO()
    out.write(encode_uvarint(len(packets_rest_blobs)))
    for b in packets_rest_blobs:
        out.write(encode_uvarint(len(b)))
    for b in packets_rest_blobs:
        out.write(b)
    out.write(encode_uvarint(len(ownership_blob)))
    out.write(ownership_blob)
    if policy_blob is not None:
        out.write(encode_uvarint(len(policy_blob)))
        out.write(policy_blob)
    return out.getvalue()


def encode_ownership_q4(arrays: list[list[float]]) -> bytes:
    """Mimic RawOwnership-with-quant wire shape: [N][W][packed bits]."""
    if not arrays or not arrays[0]:
        return encode_uvarint(0) + encode_uvarint(0) + b"\x04"
    n = len(arrays)
    w = len(arrays[0])
    flat = np.array(arrays, dtype=np.float64).reshape(-1)
    idx = quantise_uniform(flat, 4, -1.0, 1.0)
    return encode_uvarint(n) + encode_uvarint(w) + b"\x04" + pack_4bit(idx)


def encode_policy_q(arrays: list[list[float]], bits: int) -> bytes:
    """Same shape, [-1, 1] range (covers both the [0,1] probabilities
    AND KataGo's -1.0 sentinel for illegal positions), configurable
    bit-depth. Wasting half the codebook on the gap between -1 and 0
    where no policy values land is the price for treating -1 as
    in-range; the alternative (a presence bitmap + [0,1] quant on
    legals only) is on the table if this is too coarse."""
    if not arrays or not arrays[0]:
        return encode_uvarint(0) + encode_uvarint(0) + bytes([bits])
    n = len(arrays)
    w = len(arrays[0])
    flat = np.array(arrays, dtype=np.float64).reshape(-1)
    idx = quantise_uniform(flat, bits, -1.0, 1.0)
    packed = pack_4bit(idx) if bits == 4 else pack_8bit(idx)
    return encode_uvarint(n) + encode_uvarint(w) + bytes([bits]) + packed


def encode_policy_raw(arrays: list[list[float]]) -> bytes:
    """Raw float64 packed N*W values."""
    if not arrays or not arrays[0]:
        return encode_uvarint(0) + encode_uvarint(0)
    n = len(arrays)
    w = len(arrays[0])
    flat = np.array(arrays, dtype=np.float64).reshape(-1)
    return encode_uvarint(n) + encode_uvarint(w) + flat.tobytes()


def encode_policy_factored(arrays: list[list[float]], bits: int) -> bytes:
    """Factor the -1 sentinel positions out as a per-packet
    legal-mask bitmap; quantise only the legal cells over [0, 1].

    The legal mask grows monotonically each turn modulo captures
    (one cell added per move; rare cell-removed events on captures),
    so the bitmap stream has strong cross-packet redundancy the
    downstream brotli captures. The legals' quantiser now sees
    [0, 1] instead of [-1, 1], halving the per-cell quantisation
    error at the same bit-depth.

    Blob: [varint N] [varint W] [1 byte bits]
          [per packet i: W bits (ceil(W/8) bytes) presence bitmap,
                         packed-bits count_legals varint-encoded next,
                         then count_legals × bits packed indices]
    """
    if not arrays or not arrays[0]:
        return encode_uvarint(0) + encode_uvarint(0) + bytes([bits])
    n = len(arrays)
    w = len(arrays[0])
    bitmap_bytes = (w + 7) // 8
    out = bytearray()
    out += encode_uvarint(n)
    out += encode_uvarint(w)
    out.append(bits)
    for arr in arrays:
        a = np.asarray(arr, dtype=np.float64)
        legal = a > -0.5  # KataGo's sentinel is exactly -1.0; threshold is safe
        # Pack bitmap (little-bit-first order; same convention as numpy.packbits)
        bm = np.packbits(legal.astype(np.uint8), bitorder="little").tobytes()
        # Pad to exactly bitmap_bytes (np.packbits returns ceil(W/8))
        if len(bm) < bitmap_bytes:
            bm = bm + b"\x00" * (bitmap_bytes - len(bm))
        out += bm
        legal_vals = a[legal]
        out += encode_uvarint(len(legal_vals))
        if len(legal_vals) > 0:
            idx = quantise_uniform(legal_vals, bits, 0.0, 1.0)
            packed = pack_4bit(idx) if bits == 4 else pack_8bit(idx)
            out += packed
    return bytes(out)


def policy_recon_error_factored_per_packet(originals: list[list[float]],
                                           bits: int) -> list[dict]:
    """Per-packet metrics for the factored-bitmap scheme: legals
    quantised over [0, 1]; illegal positions reconstruct as -1
    exactly (the sentinel).

    JSD compares the legal-cell renormalised distributions directly
    — no clip-to-nonneg needed since reconstructed legals come from
    a [0, 1] quantiser and are already in-range.
    """
    out = []
    if not originals or not originals[0]:
        return out
    for orig in originals:
        a = np.asarray(orig, dtype=np.float64)
        legal = a > -0.5
        recon = np.where(legal, 0.0, -1.0)
        n_legal = int(legal.sum())
        if n_legal > 0:
            legal_q = quantise_uniform(a[legal], bits, 0.0, 1.0)
            legal_recon = dequantise_uniform(legal_q, bits, 0.0, 1.0)
            recon[legal] = legal_recon
        diff = recon - a
        rmse = float(np.sqrt(np.mean(diff ** 2)))
        max_abs = float(np.max(np.abs(diff)))
        jsd = float("nan")
        if n_legal > 0:
            p = a[legal].copy()
            q = recon[legal].copy()
            ps, qs = p.sum(), q.sum()
            if ps > 0 and qs > 0:
                p = p / ps
                q = q / qs
                m = 0.5 * (p + q)
                mask = (p > 0) & (q > 0)
                if mask.any():
                    kl_pm = float(np.sum(p[mask] * np.log2(p[mask] / m[mask])))
                    kl_qm = float(np.sum(q[mask] * np.log2(q[mask] / m[mask])))
                    jsd = 0.5 * kl_pm + 0.5 * kl_qm
        out.append({"rmse": rmse, "max_abs": max_abs, "jsd": jsd, "n_legal": n_legal})
    return out


def policy_recon_error_factored(originals: list[list[float]],
                                bits: int) -> tuple[float, float, float]:
    """Aggregate wrapper. Returns (mean RMSE, worst-packet max-abs,
    mean JSD)."""
    per_pkt = policy_recon_error_factored_per_packet(originals, bits)
    if not per_pkt:
        return 0.0, 0.0, 0.0
    rmse = float(np.mean([p["rmse"] for p in per_pkt]))
    max_abs = float(max(p["max_abs"] for p in per_pkt))
    jsds = [p["jsd"] for p in per_pkt if not np.isnan(p["jsd"])]
    jsd = float(np.mean(jsds)) if jsds else 0.0
    return rmse, max_abs, jsd


def policy_recon_error_per_packet(originals: list[list[float]],
                                  bits: int) -> list[dict]:
    """Per-packet (L2-RMSE, max-abs, normalised-JSD, n_legal) for a
    [-1, 1] uniform-quant scheme on KataGo's policy field.

    JSD is the right metric here: policy IS a probability
    distribution over legal moves (the -1.0 sentinel marks illegal
    cells, which are *not* part of the distribution's support). We
    mask out illegal cells using the original's sentinel positions,
    renormalise both sides on the legal-cell support, and compute
    normalised Jensen-Shannon (log base 2 → result in [0, 1]).

    Returns a list of per-packet dicts (one per element of `originals`)
    with keys `rmse`, `max_abs`, `jsd`, `n_legal`. Where JSD can't be
    computed (no legal cells, zero mass on either side), `jsd` is
    NaN.
    """
    out = []
    if not originals or not originals[0]:
        return out
    for orig in originals:
        a = np.asarray(orig, dtype=np.float64)
        idx = quantise_uniform(a, bits, -1.0, 1.0)
        recon = dequantise_uniform(idx, bits, -1.0, 1.0)
        diff = recon - a
        rmse = float(np.sqrt(np.mean(diff ** 2)))
        max_abs = float(np.max(np.abs(diff)))

        legal = a > -0.5
        n_legal = int(legal.sum())
        jsd = float("nan")
        if n_legal > 0:
            p = a[legal].copy()
            q = recon[legal].copy()
            q = np.clip(q, 0.0, None)
            ps, qs = p.sum(), q.sum()
            if ps > 0 and qs > 0:
                p = p / ps
                q = q / qs
                m = 0.5 * (p + q)
                mask = (p > 0) & (q > 0)
                if mask.any():
                    kl_pm = float(np.sum(p[mask] * np.log2(p[mask] / m[mask])))
                    kl_qm = float(np.sum(q[mask] * np.log2(q[mask] / m[mask])))
                    jsd = 0.5 * kl_pm + 0.5 * kl_qm
        out.append({"rmse": rmse, "max_abs": max_abs, "jsd": jsd, "n_legal": n_legal})
    return out


def policy_recon_error(originals: list[list[float]], bits: int) -> tuple[float, float, float]:
    """Aggregate wrapper for backward compat with the old table-output
    path. Returns (mean RMSE, worst-packet max-abs, mean JSD)."""
    per_pkt = policy_recon_error_per_packet(originals, bits)
    if not per_pkt:
        return 0.0, 0.0, 0.0
    rmse = float(np.mean([p["rmse"] for p in per_pkt]))
    max_abs = float(max(p["max_abs"] for p in per_pkt))
    jsds = [p["jsd"] for p in per_pkt if not np.isnan(p["jsd"])]
    jsd = float(np.mean(jsds)) if jsds else 0.0
    return rmse, max_abs, jsd


def main():
    import argparse
    import csv
    from pathlib import Path
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(Path.home() / "plots" /
                                         "policy-quant-per-packet.csv"),
                    help="Per-packet CSV output for downstream plotting.")
    args = ap.parse_args()
    Path(args.csv).parent.mkdir(parents=True, exist_ok=True)

    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)

    # Load bundles grouped by stem, sorted by turn.
    by_stem = defaultdict(list)
    for k in r.keys("traj:*:r0"):
        ks = k.decode()
        parts = ks.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])
        msg = pickle.loads(r.xrange(k, "-", "+")[0][1][b"msg"])
        by_stem[stem].append((turn, msg))
    # bundles: list of (stem, list-of-(turn, packet)), sorted by stem then by turn.
    bundles_with_turns = [
        (stem, sorted(by_stem[stem])) for stem in sorted(by_stem.keys())
    ]
    # Convenience: bundles without turn numbers (for the existing encoding paths).
    bundles = [(stem, [p for _, p in tps]) for stem, tps in bundles_with_turns]

    print(f"bundles: {len(bundles)}, total packets: "
          f"{sum(len(b) for _, b in bundles)}")
    print()

    # Aggregate counters across all bundles.
    agg = {"S0": 0, "S1": 0, "S2": 0, "S3": 0, "S4": 0, "S5": 0, "S6": 0}
    agg_pkts = 0
    policy_err_q4 = []
    policy_err_q8 = []
    policy_err_q4_factored = []
    policy_err_q8_factored = []
    # Per-packet records for CSV output.
    per_packet_records: list = []

    for stem, packets in bundles:
        n = len(packets)
        agg_pkts += n

        # Common pieces.
        ownership_arrs = [p.get("ownership") or [] for p in packets]
        policy_arrs = [p.get("policy") or [] for p in packets]

        # Rest: projected, with no ownership but WITH policy (for S0)
        rest_with_policy = []
        # Rest: projected, with no ownership AND no policy
        # (for S1/S2/S3/S4 — they handle policy separately or drop it)
        rest_without_policy = []
        for p in packets:
            r_with = project({k: v for k, v in p.items() if k != "ownership"})
            # For "without policy" use the allow-list-without-policy variant,
            # so the projection genuinely drops the field rather than just
            # filtering by ALLOWED_ROOT and keeping it.
            r_without = project(
                {k: v for k, v in p.items() if k != "ownership"},
                allow=ALLOWED_ROOT_NO_POLICY,
            )
            rest_with_policy.append(r_with)
            rest_without_policy.append(r_without)

        rest_with_blobs = [json.dumps(rp, separators=(",", ":")).encode("utf-8")
                           for rp in rest_with_policy]
        rest_without_blobs = [json.dumps(rp, separators=(",", ":")).encode("utf-8")
                              for rp in rest_without_policy]

        ownership_blob = encode_ownership_q4(ownership_arrs)

        # S0: current leader (policy in rest, no policy factoring)
        blob_s0 = build_blob(rest_with_blobs, ownership_blob, None)
        agg["S0"] += len(brotli.compress(blob_s0, quality=6))

        # S1: policy factored as raw float64
        policy_raw = encode_policy_raw(policy_arrs)
        blob_s1 = build_blob(rest_without_blobs, ownership_blob, policy_raw)
        agg["S1"] += len(brotli.compress(blob_s1, quality=6))

        # S2: policy factored + uniform-quant 4 bits over [0, 1]
        policy_q4 = encode_policy_q(policy_arrs, 4)
        blob_s2 = build_blob(rest_without_blobs, ownership_blob, policy_q4)
        agg["S2"] += len(brotli.compress(blob_s2, quality=6))

        # S3: policy factored + uniform-quant 8 bits over [-1, 1]
        policy_q8 = encode_policy_q(policy_arrs, 8)
        blob_s3 = build_blob(rest_without_blobs, ownership_blob, policy_q8)
        agg["S3"] += len(brotli.compress(blob_s3, quality=6))

        # S4: drop policy entirely via projection allow-list
        # (no policy bytes anywhere; the SPA doesn't read it)
        blob_s4 = build_blob(rest_without_blobs, ownership_blob, None)
        agg["S4"] += len(brotli.compress(blob_s4, quality=6))

        # S5: factor -1 sentinels into a presence bitmap; Q4 on legals
        # over [0, 1]. Bin width 0.0625 — half of Q4 over [-1, 1].
        policy_f4 = encode_policy_factored(policy_arrs, 4)
        blob_s5 = build_blob(rest_without_blobs, ownership_blob, policy_f4)
        agg["S5"] += len(brotli.compress(blob_s5, quality=6))

        # S6: same factoring, Q8 on legals over [0, 1].
        policy_f8 = encode_policy_factored(policy_arrs, 8)
        blob_s6 = build_blob(rest_without_blobs, ownership_blob, policy_f8)
        agg["S6"] += len(brotli.compress(blob_s6, quality=6))

        # Reconstruction error for policy at 4 and 8 bits.
        rmse4, max4, jsd4 = policy_recon_error(policy_arrs, 4)
        rmse8, max8, jsd8 = policy_recon_error(policy_arrs, 8)
        policy_err_q4.append((rmse4, max4, jsd4))
        policy_err_q8.append((rmse8, max8, jsd8))
        # Reconstruction error for the factored variants.
        rf4, mf4, jf4 = policy_recon_error_factored(policy_arrs, 4)
        rf8, mf8, jf8 = policy_recon_error_factored(policy_arrs, 8)
        policy_err_q4_factored.append((rf4, mf4, jf4))
        policy_err_q8_factored.append((rf8, mf8, jf8))

        # Per-packet metrics for plotting / quantile analysis.
        turns_for_stem = [t for t, _ in next(
            tps for s, tps in bundles_with_turns if s == stem)]
        per_pkt_streams = {
            "Q4_full":     policy_recon_error_per_packet(policy_arrs, 4),
            "Q8_full":     policy_recon_error_per_packet(policy_arrs, 8),
            "Q4_factored": policy_recon_error_factored_per_packet(policy_arrs, 4),
            "Q8_factored": policy_recon_error_factored_per_packet(policy_arrs, 8),
        }
        for variant, stream in per_pkt_streams.items():
            for i, entry in enumerate(stream):
                per_packet_records.append((
                    stem, turns_for_stem[i], variant,
                    entry["rmse"], entry["max_abs"],
                    entry["jsd"], entry["n_legal"],
                ))

    # Reference for ratio: the uncompressed Identity JSON size (sum of
    # per-packet JSON bytes across all bundles). Mimics the bundle bench's
    # ratio column.
    total_identity_bytes = 0
    for stem, packets in bundles:
        for p in packets:
            total_identity_bytes += len(json.dumps(p, separators=(",", ":")).encode())

    print(f"{'scenario':10s}  {'total bytes':>12s}  {'bytes/pkt':>10s}  "
          f"{'ratio':>7s}  {'policy L2':>10s}  {'policy max':>10s}  "
          f"{'JSD':>8s}")
    print("-" * 90)

    descriptions = {
        "S0": "ownership Q4 only; policy in JSON-rest (current leader)",
        "S1": "ownership Q4 + policy raw float64 factored",
        "S2": "ownership Q4 + policy Q4 ([-1,1] — covers -1 sentinel)",
        "S3": "ownership Q4 + policy Q8 ([-1,1] — covers -1 sentinel)",
        "S4": "ownership Q4 + policy DROPPED via projection",
        "S5": "ownership Q4 + policy: bitmap-factor sentinels + Q4 legals ([0,1])",
        "S6": "ownership Q4 + policy: bitmap-factor sentinels + Q8 legals ([0,1])",
    }
    # policy_err_q4 / policy_err_q8 are lists of (RMSE, max-abs, JSD)
    # per bundle. Aggregate: mean RMSE, max max-abs (worst case across
    # any bundle), mean JSD (the natural average over the bundles).
    def agg_err(per_bundle):
        if not per_bundle:
            return (0.0, 0.0, 0.0)
        return (
            float(np.mean([e[0] for e in per_bundle])),
            float(max(e[1] for e in per_bundle)),
            float(np.mean([e[2] for e in per_bundle])),
        )
    policy_errs = {
        "S0": (0.0, 0.0, 0.0),  # policy is lossless
        "S1": (0.0, 0.0, 0.0),  # raw float64 → lossless
        "S2": agg_err(policy_err_q4),
        "S3": agg_err(policy_err_q8),
        "S4": (float("nan"), float("nan"), float("nan")),  # dropped — no reconstruction
        "S5": agg_err(policy_err_q4_factored),
        "S6": agg_err(policy_err_q8_factored),
    }
    for key in ("S0", "S1", "S2", "S3", "S4", "S5", "S6"):
        ratio = agg[key] / max(total_identity_bytes, 1)
        bpp = agg[key] / max(agg_pkts, 1)
        l2, mx, jsd = policy_errs[key]
        if key == "S4":
            l2_str = "dropped"
            mx_str = "dropped"
            jsd_str = "dropped"
        else:
            l2_str = f"{l2:.4f}" if l2 > 0 else "—"
            mx_str = f"{mx:.4f}" if mx > 0 else "—"
            jsd_str = f"{jsd:.4f}" if jsd > 0 else "—"
        print(f"{key:10s}  {agg[key]:>12,}  {bpp/1024:>9.2f}K  "
              f"{ratio:>7.4f}  {l2_str:>10s}  {mx_str:>10s}  {jsd_str:>8s}")
        print(f"           {descriptions[key]}")

    print()
    print(f"ownership quantisation in all scenarios: UniformQ4b, max-abs ≤ 0.0625")
    print(f"JSD: normalised Jensen-Shannon (log base 2) on the legal-cell")
    print(f"     probability distribution; ∈ [0, 1]; mean across packets.")

    # Per-packet CSV for downstream plotting.
    with open(args.csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["stem", "turn", "variant",
                    "rmse", "max_abs", "jsd", "n_legal"])
        for row in per_packet_records:
            w.writerow(row)
    print()
    print(f"per-packet CSV: {args.csv} ({len(per_packet_records)} rows)")


if __name__ == "__main__":
    main()
