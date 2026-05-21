"""
research/extract_advanced_multitimestep.py

Ownership-derived + full-policy-distribution features extracted at
multiple V-checkpoints per position. Addresses the firewall's Q5 #1+#2
recommendations and the "we're using ~2% of the data" gap.

For each position and each V-checkpoint in {V_pre, V=500, V=2000,
V=10000, V_max}, extracts (using the FIRST realization's packets):

  Ownership-derived (per V-checkpoint):
    own_stone_count            — sum of |ownership| > 0.8 (settled stones)
    own_territory_imbalance    — sum(ownership) (sign-aware imbalance)
    own_disputed_count         — count of |ownership| < 0.3 (still contested)
    own_corner_imbalance       — (top-left + bottom-right) - (top-right + bottom-left)
    own_spatial_entropy        — Shannon entropy over normalized |ownership|
    own_cluster_count          — connected components above |0.8| (crude life/death)

  Policy-distribution (per V-checkpoint):
    pol_entropy                — Shannon entropy of full 362-element policy
    pol_top1_mass              — argmax-policy probability
    pol_top3_mass              — sum of top-3 policy probabilities
    pol_top10_mass             — sum of top-10
    pol_eff_moves              — exp(entropy), effective #plausible moves
    pol_kl_vs_visits           — KL(visit_distribution || policy_prior)
    pol_spatial_entropy        — Shannon entropy over policy mass projected to 19x19

Output: research/data/advanced_multitimestep.csv with one row per
position × V-checkpoint. Pivots downstream into a wide feature matrix
indexed by stem,turn with one column per (feature, V-checkpoint).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import (  # noqa: E402
    connect, list_positions, fetch_position_bundle_lossless,
)


CHECKPOINTS = [
    ("V_pre", None),       # first packet of the realization
    ("V_500", 500),
    ("V_2000", 2000),
    ("V_10000", 10000),
    ("V_max", "last"),     # last `is_during_search=False` packet
]


def pick_packet_at_v(packets: list, target_v) -> dict | None:
    """packets: list of (t, packet_dict). Returns the packet closest to
    target_v (by visits in rootInfo)."""
    if not packets:
        return None
    if target_v is None:
        return packets[0][1]
    if target_v == "last":
        # last is_during_search=False packet
        for t, pkt in reversed(packets):
            if not pkt.get("isDuringSearch", False):
                return pkt
        return packets[-1][1]
    # Closest-V packet
    target_v = float(target_v)
    best = None
    best_diff = float("inf")
    for t, pkt in packets:
        root = pkt.get("rootInfo") or {}
        V = float(root.get("visits", 0))
        if V < target_v:
            continue
        d = abs(V - target_v)
        if d < best_diff:
            best_diff = d
            best = pkt
    if best is None:
        # If no packet has V >= target_v, return the highest-V packet
        return max(packets, key=lambda pv: float(pv[1].get("rootInfo", {}).get("visits", 0)))[1]
    return best


def ownership_features(pkt: dict) -> dict[str, float]:
    """Extract ownership-derived features from a single packet."""
    own = pkt.get("ownership")
    if own is None:
        return {}
    arr = np.asarray(own, dtype=np.float64)
    # Reshape to (19, 19) if it's the standard 361-element vector
    if arr.size == 361:
        grid = arr.reshape(19, 19)
    elif arr.size > 0:
        side = int(np.sqrt(arr.size))
        if side * side == arr.size:
            grid = arr.reshape(side, side)
        else:
            return {}
    else:
        return {}
    n = grid.size
    abs_own = np.abs(grid)
    stone_count = float((abs_own > 0.8).sum())
    territory_imbalance = float(grid.sum())
    disputed_count = float((abs_own < 0.3).sum())
    # Corner imbalance: sum each 6x6 corner of the 19x19
    s = grid.shape[0]
    c = min(6, s // 3)
    tl = float(grid[:c, :c].sum())
    tr = float(grid[:c, -c:].sum())
    bl = float(grid[-c:, :c].sum())
    br = float(grid[-c:, -c:].sum())
    corner_imbalance = (tl + br) - (tr + bl)
    # Spatial entropy: normalize abs_own to a distribution, compute Shannon
    s_sum = abs_own.sum()
    if s_sum > 0:
        p = abs_own.flatten() / s_sum
        p = p[p > 1e-12]
        spatial_entropy = float(-(p * np.log(p)).sum())
    else:
        spatial_entropy = 0.0
    # Crude cluster count: count connected components of |ownership| > 0.8
    # via simple 4-connected flood fill in numpy
    mask = abs_own > 0.8
    cluster_count = 0
    if mask.any():
        visited = np.zeros_like(mask, dtype=bool)
        # 4-neighbor connectivity
        from collections import deque
        for r in range(mask.shape[0]):
            for cc in range(mask.shape[1]):
                if mask[r, cc] and not visited[r, cc]:
                    cluster_count += 1
                    q = deque([(r, cc)])
                    visited[r, cc] = True
                    while q:
                        rr, ccc = q.popleft()
                        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                            nr, nc = rr + dr, ccc + dc
                            if (0 <= nr < mask.shape[0] and 0 <= nc < mask.shape[1]
                                    and mask[nr, nc] and not visited[nr, nc]):
                                visited[nr, nc] = True
                                q.append((nr, nc))
    return {
        "own_stone_count": stone_count,
        "own_territory_imbalance": territory_imbalance,
        "own_disputed_count": disputed_count,
        "own_corner_imbalance": corner_imbalance,
        "own_spatial_entropy": spatial_entropy,
        "own_cluster_count": float(cluster_count),
    }


def policy_features(pkt: dict) -> dict[str, float]:
    """Extract policy-distribution features from a single packet."""
    pol = pkt.get("policy")
    if pol is None:
        return {}
    p = np.asarray(pol, dtype=np.float64)
    # Drop pass (last element) only when computing spatial entropy
    # Normalize (defensive)
    if p.sum() <= 0:
        return {}
    p_norm = p / p.sum()
    # Filter out negative or zero entries for entropy
    p_pos = p_norm[p_norm > 1e-12]
    entropy = float(-(p_pos * np.log(p_pos)).sum())
    top1_mass = float(p_norm.max())
    sorted_desc = np.sort(p_norm)[::-1]
    top3_mass = float(sorted_desc[:3].sum())
    top10_mass = float(sorted_desc[:10].sum())
    eff_moves = float(np.exp(entropy))
    # KL vs visits: build a visit-distribution over moves from moveInfos
    mi = pkt.get("moveInfos") or []
    total_visits = sum(int(m.get("visits", 0)) for m in mi)
    pol_kl = 0.0
    if total_visits > 0 and len(mi) > 0:
        # Build visit distribution over the moves listed in moveInfos.
        # Match against policy by move location is non-trivial; approximate
        # by sorting both: KL between top-K visit prob and top-K policy prob.
        K = min(len(mi), 20)
        visit_p = np.array([float(m.get("visits", 0)) for m in mi[:K]]) / total_visits
        prior_p = np.array([float(m.get("prior", 0.0)) for m in mi[:K]])
        if prior_p.sum() > 0:
            prior_p = prior_p / prior_p.sum()
            v_safe = np.where(visit_p > 1e-12, visit_p, 1e-12)
            pr_safe = np.where(prior_p > 1e-12, prior_p, 1e-12)
            pol_kl = float((v_safe * np.log(v_safe / pr_safe)).sum())
    # Spatial entropy over the 19x19 board (excluding pass)
    spatial_entropy = entropy
    if p_norm.size >= 361:
        board = p_norm[:361]
        if board.sum() > 0:
            b = board / board.sum()
            b_pos = b[b > 1e-12]
            spatial_entropy = float(-(b_pos * np.log(b_pos)).sum())
    return {
        "pol_entropy": entropy,
        "pol_top1_mass": top1_mass,
        "pol_top3_mass": top3_mass,
        "pol_top10_mass": top10_mass,
        "pol_eff_moves": eff_moves,
        "pol_kl_vs_visits": pol_kl,
        "pol_spatial_entropy": spatial_entropy,
    }


FEATURE_NAMES_OWN = [
    "own_stone_count", "own_territory_imbalance", "own_disputed_count",
    "own_corner_imbalance", "own_spatial_entropy", "own_cluster_count",
]
FEATURE_NAMES_POL = [
    "pol_entropy", "pol_top1_mass", "pol_top3_mass", "pol_top10_mass",
    "pol_eff_moves", "pol_kl_vs_visits", "pol_spatial_entropy",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-csv",
                    default=Path(__file__).resolve().parent /
                            "data" / "advanced_multitimestep.csv",
                    type=Path)
    args = ap.parse_args()

    print("=== advanced multi-timestep feature extractor ===", flush=True)
    print(f"  output: {args.out_csv}", flush=True)
    print(f"  checkpoints: {[c[0] for c in CHECKPOINTS]}", flush=True)
    print()

    conn = connect()
    positions = list_positions(conn)
    n = len(positions)
    print(f"  {n} positions to process", flush=True)

    # Wide-format CSV: one row per position, columns are
    # <feature>_<checkpoint>
    field_names = ["stem", "turn"]
    for cpname, _ in CHECKPOINTS:
        for fn in FEATURE_NAMES_OWN + FEATURE_NAMES_POL:
            field_names.append(f"{fn}_{cpname}")

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    f = args.out_csv.open("w")
    writer = csv.DictWriter(f, fieldnames=field_names, extrasaction="ignore")
    writer.writeheader()

    t0 = time.monotonic()
    skipped = 0
    kept = 0

    for i, (stem, turn) in enumerate(positions):
        bundle = fetch_position_bundle_lossless(conn, stem, turn)
        if not bundle:
            skipped += 1
            continue
        # Use r0 (or smallest available index)
        ri = sorted(bundle.keys())[0]
        packets = bundle[ri]
        if not packets:
            skipped += 1
            continue
        row = {"stem": stem, "turn": turn}
        any_features = False
        for cpname, target_v in CHECKPOINTS:
            pkt = pick_packet_at_v(packets, target_v)
            if pkt is None:
                continue
            ofeat = ownership_features(pkt)
            pfeat = policy_features(pkt)
            for fn in FEATURE_NAMES_OWN:
                if fn in ofeat:
                    row[f"{fn}_{cpname}"] = ofeat[fn]
                    any_features = True
            for fn in FEATURE_NAMES_POL:
                if fn in pfeat:
                    row[f"{fn}_{cpname}"] = pfeat[fn]
                    any_features = True
        if any_features:
            writer.writerow(row)
            f.flush()
            kept += 1
        else:
            skipped += 1

        if (i + 1) % 25 == 0 or i + 1 == n:
            dt = time.monotonic() - t0
            rate = (i + 1) / max(dt, 1e-9)
            eta = (n - (i + 1)) / max(rate, 1e-9)
            print(f"  [{i+1}/{n}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s  "
                  f"kept {kept} skipped {skipped}", flush=True)

    f.close()
    conn.close()
    sz_kb = args.out_csv.stat().st_size / 1024
    print(f"  saved: {args.out_csv}  ({sz_kb:.1f} KB)", flush=True)


if __name__ == "__main__":
    main()
