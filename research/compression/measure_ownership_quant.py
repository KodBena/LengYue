"""
research/compression/measure_ownership_quant.py

Sibling of measure_policy_quant.py — per-packet Q4 reconstruction error
for the ownership field (361 floats in [-1, 1], no sentinels). Reports
RMSE and max-abs quantiles across the corpus; used to inform the
softhard (p95) gate threshold for ownership in the compression plan.

Ownership Q4 is the dominant ownership quantiser per bundle_bench.py
(analytic max-abs ≤ 0.0625 = half-bin-width); the corpus measurement
characterises the typical (not worst-case) reconstruction error.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import csv
import pickle
from pathlib import Path

import numpy as np
import redis


def main() -> int:
    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    print(f"scanning {len(keys)} positions")

    rmses: list[float] = []
    max_abss: list[float] = []
    per_packet: list[tuple] = []  # (stem, turn, rmse, max_abs)
    for k in keys:
        stem = k.split(":")[1]
        turn = int(k.split(":")[2][1:])
        for _id, fields in r.xrange(k, "-", "+"):
            p = pickle.loads(fields[b"msg"])
            if p.get("isDuringSearch"):
                continue
            own = p.get("ownership")
            if own is None or len(own) != 361:
                continue
            a = np.asarray(own, dtype=np.float64)
            # Q4 uniform over [-1, 1]: bin width = 0.125, half = 0.0625.
            idx = np.minimum(((np.clip(a, -1.0, 1.0) + 1.0) * 8.0)
                             .astype(np.int64), 15)
            recon = -1.0 + (idx.astype(np.float64) + 0.5) * 0.125
            diff = recon - a
            rmse = float(np.sqrt(np.mean(diff ** 2)))
            max_abs = float(np.max(np.abs(diff)))
            rmses.append(rmse)
            max_abss.append(max_abs)
            per_packet.append((stem, turn, rmse, max_abs))

    if not rmses:
        print("no packets matched the filter")
        return 1

    rmse_arr = np.array(rmses)
    max_abs_arr = np.array(max_abss)
    print(f"\nN = {len(rmses)} packets")
    print(f"  Q4 ownership RMSE     p50={np.percentile(rmse_arr,50):.4f} "
          f"p90={np.percentile(rmse_arr,90):.4f} "
          f"p95={np.percentile(rmse_arr,95):.4f} "
          f"p99={np.percentile(rmse_arr,99):.4f} "
          f"max={rmse_arr.max():.4f}")
    print(f"  Q4 ownership max-abs  p50={np.percentile(max_abs_arr,50):.4f} "
          f"p90={np.percentile(max_abs_arr,90):.4f} "
          f"p95={np.percentile(max_abs_arr,95):.4f} "
          f"p99={np.percentile(max_abs_arr,99):.4f} "
          f"max={max_abs_arr.max():.4f}")
    print(f"\n  (analytic max-abs upper bound for Q4 over [-1, 1]: 0.0625)")

    out_csv = Path.home() / "plots" / "ownership-quant-per-packet.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["stem", "turn", "rmse", "max_abs"])
        for row in per_packet:
            w.writerow(row)
    print(f"\nper-packet CSV: {out_csv} ({len(per_packet)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
