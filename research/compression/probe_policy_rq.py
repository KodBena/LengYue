"""
research/compression/probe_policy_rq.py

FAISS ResidualQuantizer (pure RQ, no product structure) probe on the
policy field. Sister-revision to the earlier PRVQ probe under
research/compression/lossy_ownership.py — PRVQ split the dimension
into subvectors and ran RQ within each, which performed worse than
uniform-quant at our N. Pure RQ uses full-dim codebooks per stage
and can capture cross-dimension correlations PRVQ can't; worth
verifying once before committing to the uniform-quant gates.

Comparison: against Q8-factored (legals over [0, 1] with -1 sentinels
in a bitmap), the currently-leading policy quantiser.

Game-wise train/test split (80/20 by stem) so codebooks fit on games
the test packets don't come from. Reproduces the measurement script's
JSD impl exactly by importing its per-packet function.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pickle

import faiss
import numpy as np
import redis

from research.compression.measure_policy_quant import (
    policy_recon_error_factored_per_packet,
)


def jsd_legals(orig: np.ndarray, recon: np.ndarray) -> float:
    """Same impl as measure_policy_quant.policy_recon_error_per_packet
    for the [-1, 1]-range path: legal-mask from original's sentinels,
    clip-to-nonneg on recon, renormalise, normalised JSD (log2)."""
    legal = orig > -0.5
    if not legal.any():
        return float("nan")
    p = orig[legal].astype(np.float64).copy()
    q = recon[legal].astype(np.float64).copy()
    q = np.clip(q, 0.0, None)
    ps, qs = p.sum(), q.sum()
    if ps <= 0 or qs <= 0:
        return float("nan")
    p = p / ps
    q = q / qs
    m = 0.5 * (p + q)
    mask = (p > 0) & (q > 0)
    if not mask.any():
        return float("nan")
    kl_pm = float(np.sum(p[mask] * np.log2(p[mask] / m[mask])))
    kl_qm = float(np.sum(q[mask] * np.log2(q[mask] / m[mask])))
    return 0.5 * kl_pm + 0.5 * kl_qm


def collect_policies(r: redis.Redis) -> tuple[np.ndarray, list[str]]:
    """Load all authoritative (not-during-search) policy vectors from
    the corpus. Returns (X, stems) where X[i] is a length-362 vector
    and stems[i] is the source SGF stem (for train/test split)."""
    vecs: list[np.ndarray] = []
    stems: list[str] = []
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    print(f"  scanning {len(keys)} positions")
    for k in keys:
        stem = k.split(":")[1]
        for _id, fields in r.xrange(k, "-", "+"):
            p = pickle.loads(fields[b"msg"])
            if p.get("isDuringSearch"):
                continue
            pol = p.get("policy")
            if pol is None or len(pol) != 362:
                continue
            vecs.append(np.asarray(pol, dtype=np.float32))
            stems.append(stem)
    X = np.stack(vecs)
    print(f"  loaded {len(X)} authoritative policy vectors, dim {X.shape[1]}")
    return X, stems


def quantile_row(label: str, byte_budget: str,
                 rmse: np.ndarray, max_abs: np.ndarray,
                 jsd: np.ndarray) -> None:
    jsd_clean = jsd[~np.isnan(jsd)]
    rp = np.percentile(rmse, [50, 95])
    mp = np.percentile(max_abs, [50, 95])
    jp = np.percentile(jsd_clean, [50, 95])
    print(f"{label:14s} {byte_budget:>6s}  "
          f"{rp[0]:>7.4f} {rp[1]:>7.4f} {rmse.max():>7.4f}  "
          f"{mp[0]:>7.4f} {mp[1]:>7.4f} {max_abs.max():>7.4f}  "
          f"{jp[0]:>7.4f} {jp[1]:>7.4f} {jsd_clean.max():>7.4f}")


def main() -> int:
    print("[1/3] loading policy corpus from redis (127.0.0.1:6380)")
    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
    X, stems = collect_policies(r)
    d = X.shape[1]

    rng = np.random.default_rng(42)
    unique_stems = sorted(set(stems))
    rng.shuffle(unique_stems)
    n_train_stems = int(0.8 * len(unique_stems))
    train_stems = set(unique_stems[:n_train_stems])
    train_mask = np.array([s in train_stems for s in stems])
    X_train = np.ascontiguousarray(X[train_mask])
    X_test = np.ascontiguousarray(X[~train_mask])
    print(f"  train: {len(X_train)} vectors ({n_train_stems} games)")
    print(f"  test : {len(X_test)} vectors "
          f"({len(unique_stems) - n_train_stems} games)")
    print()

    # (M, nbits) configs spanning 2..32 bytes per vector.
    configs = [(2, 8), (4, 8), (8, 8), (16, 8), (32, 8)]

    print("[2/3] training & evaluating ResidualQuantizer variants")
    print()
    hdr = (f"{'variant':14s} {'bytes':>6s}  "
           f"{'RMSE p50':>7s} {'p95':>7s} {'max':>7s}  "
           f"{'Mabs p50':>7s} {'p95':>7s} {'max':>7s}  "
           f"{'JSD  p50':>7s} {'p95':>7s} {'max':>7s}")
    print(hdr)
    print("-" * len(hdr))

    for M, nbits in configs:
        rq = faiss.ResidualQuantizer(d, M, nbits)
        # Deterministic seeded clustering for reproducibility.
        rq.cp.seed = 1234
        rq.train(X_train)
        codes = rq.compute_codes(X_test)
        recon = rq.decode(codes)
        err = recon - X_test
        rmse = np.sqrt((err ** 2).mean(axis=1))
        max_abs = np.abs(err).max(axis=1)
        jsd = np.array([jsd_legals(X_test[i], recon[i])
                        for i in range(len(X_test))])
        bytes_per_vec = (M * nbits) // 8
        quantile_row(f"RQ M={M} K=256", str(bytes_per_vec),
                     rmse, max_abs, jsd)

    print()
    print("[3/3] baseline: Q8-factored on the same 20% test set")
    print()
    print(hdr)
    print("-" * len(hdr))
    # Re-use the production impl for exact consistency.
    per_pkt = policy_recon_error_factored_per_packet(
        [list(map(float, x)) for x in X_test], bits=8,
    )
    rmse = np.array([p["rmse"] for p in per_pkt])
    max_abs = np.array([p["max_abs"] for p in per_pkt])
    jsd = np.array([p["jsd"] for p in per_pkt])
    # Raw byte budget for Q8-factored: 46-byte bitmap + per-vector
    # uniform-quant payload at ~mean-n-legal bytes. Empirical mean.
    n_legals = np.array([p["n_legal"] for p in per_pkt])
    raw_bytes = 46 + float(n_legals.mean())
    quantile_row("Q8-factored", f"~{raw_bytes:.0f}", rmse, max_abs, jsd)

    print()
    print("Notes:")
    print("  - RQ codes are dense (no redundancy); brotli won't shrink them.")
    print("  - Q8-factored payload is highly redundant (slow-varying probs +")
    print("    sentinel bitmap); brotli typically halves its on-wire size.")
    print("  - Max-abs is the gate-relevant metric: a single bad cell")
    print("    in a heatmap is qualitatively unacceptable regardless of mean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
