"""
research/extract_advanced_features.py

Three feature families derivable from packets already in Postgres,
no new collection or GPU required:

  1. policy_kl: KL(visit_distribution_at_V_max || policy_at_V_pre).
     Captures how much MCTS overrode the network's prior. High KL =
     position where search disagreed with the network. The classic
     "look how confidently the net is wrong" signal.

  2. score_histogram stats: from V_max moveInfos. For the top-K
     candidate moves at end of search, compute the score-lead spread:
     score_range, score_std, score_skew. Captures decision-complexity:
     a position with tight scoreLeads across candidates is contested;
     wide spread means one move dominates.

  3. top_move_switch_count: across the trajectory packet sequence,
     count how many times argmax(visits) changes. High switch count =
     ambiguous position where PUCT can't commit. Low = decided early.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import pickle
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import connect  # noqa: E402


# Board layout: 19x19 + 1 pass. Policy is 362-dim row-major board + pass.
BOARD_SIZE = 19
LETTERS = "ABCDEFGHJKLMNOPQRST"  # KataGo column letters (skips I)
_LETTER_TO_COL = {c: i for i, c in enumerate(LETTERS)}


def _move_to_policy_idx(move: str) -> int | None:
    """KataGo coord like 'K10' or 'pass' → policy array index."""
    if not move:
        return None
    if move == "pass":
        return BOARD_SIZE * BOARD_SIZE
    if len(move) < 2:
        return None
    col_letter = move[0].upper()
    if col_letter not in _LETTER_TO_COL:
        return None
    try:
        row = int(move[1:])
    except ValueError:
        return None
    if not (1 <= row <= BOARD_SIZE):
        return None
    col = _LETTER_TO_COL[col_letter]
    # KataGo policy: row 1 = bottom, indexed from 0 in row-major (top-down)
    r_idx = BOARD_SIZE - row  # 0=top
    return r_idx * BOARD_SIZE + col


def policy_kl_from_packets(v_pre_msg: dict, v_max_msg: dict) -> float | None:
    """KL(visits || policy) where visits comes from V_max moveInfos
    (normalized to a probability) and policy comes from V_pre."""
    policy = v_pre_msg.get("policy")
    move_infos = v_max_msg.get("moveInfos")
    if not policy or not move_infos:
        return None
    pol = np.asarray(policy, dtype=np.float64)
    if pol.shape != (362,):
        return None
    # Normalize policy
    pol = np.clip(pol, 1e-9, 1.0)
    pol = pol / pol.sum()

    # Build empirical visit distribution from moveInfos
    visits = np.zeros(362, dtype=np.float64)
    for mi in move_infos:
        move = mi.get("move", "")
        v = mi.get("visits", 0)
        idx = _move_to_policy_idx(move)
        if idx is None:
            continue
        visits[idx] += float(v)
    total = visits.sum()
    if total <= 0:
        return None
    visits = visits / total

    # KL(visits || policy), summed over positions where visits > 0
    mask = visits > 1e-9
    if not mask.any():
        return None
    kl = float(np.sum(visits[mask] * np.log(visits[mask] / pol[mask])))
    return kl


def score_histogram_stats(v_max_msg: dict) -> dict[str, float]:
    """From V_max moveInfos: distribution stats of scoreLead across the
    top-K candidate moves at end of search."""
    move_infos = v_max_msg.get("moveInfos") or []
    if not move_infos:
        return {}
    scores = [mi.get("scoreLead") for mi in move_infos
              if mi.get("scoreLead") is not None]
    if not scores:
        return {}
    arr = np.asarray(scores, dtype=np.float64)
    if len(arr) < 2:
        return {"score_hist_n": float(len(arr)),
                "score_hist_max": float(arr[0])}
    return {
        "score_hist_n": float(len(arr)),
        "score_hist_max": float(arr.max()),
        "score_hist_min": float(arr.min()),
        "score_hist_mean": float(arr.mean()),
        "score_hist_std": float(arr.std(ddof=1)),
        "score_hist_range": float(arr.max() - arr.min()),
        # Skew: how spread out the worst options are below the best.
        # Defined as (mean − min) / (max − min) ∈ [0, 1]
        # 0.5 = symmetric; close to 1 = best dominates; close to 0 = worst clusters
        "score_hist_top_dominance": float(
            (arr.max() - arr.mean()) / max(arr.max() - arr.min(), 1e-9)
        ),
    }


def top_move_switch_count(realization_packets: list[tuple[int, dict]]) -> dict[str, float]:
    """Across the trajectory (sorted by seq), how often does the top-1
    move (by visits) change?"""
    if not realization_packets:
        return {}
    sorted_packets = sorted(realization_packets, key=lambda x: x[0])
    prev_top = None
    switches = 0
    n_packets = 0
    first_top_at_seq = None
    settled_at_seq = None  # seq where top stops changing
    for seq, msg in sorted_packets:
        move_infos = msg.get("moveInfos") or []
        if not move_infos:
            continue
        # Top-1 by visits
        try:
            top = max(move_infos, key=lambda mi: mi.get("visits", 0))
        except Exception:
            continue
        top_move = top.get("move")
        if top_move is None:
            continue
        n_packets += 1
        if prev_top is None:
            first_top_at_seq = seq
        elif top_move != prev_top:
            switches += 1
            settled_at_seq = None
        else:
            if settled_at_seq is None:
                settled_at_seq = seq
        prev_top = top_move
    if n_packets == 0:
        return {}
    return {
        "switch_count": float(switches),
        "switch_rate": float(switches) / n_packets,
        "settled_at_seq": (float(settled_at_seq)
                            if settled_at_seq is not None
                            else float(n_packets)),
        "n_packets_observed": float(n_packets),
    }


FEATURE_NAMES = [
    "policy_kl",
    "score_hist_n", "score_hist_max", "score_hist_min",
    "score_hist_mean", "score_hist_std", "score_hist_range",
    "score_hist_top_dominance",
]


def fetch_endpoints_batched(conn,
                              verbose: bool = True,
                              ) -> dict[tuple[str, int, int],
                                          tuple[dict, dict]]:
    """Fast path: just V_pre (seq=0) and V_max (largest seq per
    realization). Returns dict mapping (stem, turn, ri) → (v_pre, v_max).

    ~2 GB transfer instead of ~49 GB for the full-trajectory case.
    Sufficient for policy_kl + score_histogram.
    """
    cur = conn.cursor()
    t0 = time.monotonic()
    if verbose:
        print(f"  fetching V_pre + V_max packets via batched query...",
              flush=True)
    # CTE to find max seq per realization, join to fetch both endpoints
    cur.execute("""
        WITH last_seq AS (
          SELECT realization_id, MAX(seq) AS max_seq
          FROM mcts_packet
          GROUP BY realization_id
        )
        SELECT p.stem, p.turn, r.realization_idx, pk.seq, pk.msg
        FROM mcts_packet pk
        JOIN mcts_realization r ON r.id = pk.realization_id
        JOIN mcts_position p ON p.id = r.position_id
        JOIN last_seq ls ON ls.realization_id = pk.realization_id
        WHERE pk.seq = 0 OR pk.seq = ls.max_seq
    """)
    raw: dict[tuple[str, int, int], dict[int, dict]] = defaultdict(dict)
    n_rows = 0
    n_decode_fail = 0
    for stem, turn, ri, seq, blob in cur:
        n_rows += 1
        try:
            raw[(stem, turn, ri)][seq] = pickle.loads(blob)
        except Exception:
            n_decode_fail += 1
    cur.close()
    # Resolve into (v_pre, v_max) per realization
    out: dict[tuple[str, int, int], tuple[dict, dict]] = {}
    for key, seq_to_msg in raw.items():
        if not seq_to_msg:
            continue
        v_pre = seq_to_msg.get(0)
        max_seq = max(seq_to_msg.keys())
        v_max = seq_to_msg[max_seq]
        if v_pre is None:
            # seq=0 missing; use earliest available as a proxy
            v_pre = seq_to_msg[min(seq_to_msg.keys())]
        out[key] = (v_pre, v_max)
    if verbose:
        print(f"  fetched {n_rows} endpoint packets ({n_decode_fail} "
              f"decode-failed) across {len(out)} realizations in "
              f"{time.monotonic()-t0:.1f}s", flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "advanced_features.csv"), type=Path)
    args = ap.parse_args()

    conn = connect()
    endpoints = fetch_endpoints_batched(conn)
    conn.close()

    print(f"\n=== computing features ===", flush=True)
    t0 = time.monotonic()
    n_processed = 0
    n_no_policy_kl = 0
    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    csv_f = args.out_csv.open("w", buffering=1)
    fields = ["stem", "turn", "realization"] + FEATURE_NAMES
    csv_w = csv.DictWriter(csv_f, fieldnames=fields, extrasaction="ignore")
    csv_w.writeheader()

    for (stem, turn, ri), (v_pre, v_max) in sorted(endpoints.items()):
        feats = {"stem": stem, "turn": turn, "realization": ri}
        kl = policy_kl_from_packets(v_pre, v_max)
        if kl is not None:
            feats["policy_kl"] = kl
        else:
            n_no_policy_kl += 1
        feats.update(score_histogram_stats(v_max))
        csv_w.writerow(feats)
        n_processed += 1
        if n_processed % 500 == 0:
            print(f"  [{n_processed}/{len(endpoints)}] "
                  f"elapsed {time.monotonic()-t0:.0f}s", flush=True)

    csv_f.close()
    print(f"\ndone in {time.monotonic()-t0:.0f}s; "
          f"{n_processed} realizations processed, "
          f"{n_no_policy_kl} had no policy_kl", flush=True)
    print(f"CSV: {args.out_csv}", flush=True)


if __name__ == "__main__":
    main()
