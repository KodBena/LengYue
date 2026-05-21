"""
research/feature_extraction.py

Phase 3.5 feature extraction adapted for single-position research use.
Loads a `<position>.pkl.gz` produced by collect_trajectory.py /
run_batch.py (lossless full-packet capture) and computes per-turn
features matching `proxy/middleware/learned_value_fn.py:_per_turn_features`
exactly.

Single-position scope: the Phase 3.5 production use is per-range
(K candidate turns analyzed together, range-level mean/std/min/max
aggregates as features). For single-position research that range
context isn't available; this extractor returns only the per-turn
features (23 floats) plus a small context block.

The result feeds the multi-target regression in regression.py.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import connect, read_packets, list_realizations  # noqa: E402


def _safe_float(v: Any, default: float = 0.0) -> float:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return default


def _shannon_entropy_bits(probs: list[float]) -> float:
    return -sum(p * math.log2(p) for p in probs if p > 0)


def _gini(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    total = sum(s)
    if total <= 0:
        return 0.0
    cum = sum((i + 1) * v for i, v in enumerate(s))
    return (2 * cum) / (n * total) - (n + 1) / n


def per_turn_features(packet: dict[str, Any], to_play: str = "black") -> dict[str, float]:
    """Mirrors proxy/middleware/learned_value_fn.py:_per_turn_features
    exactly so research-side features match production-side features
    at training time.
    """
    root = packet.get("rootInfo", {}) if isinstance(packet.get("rootInfo"), dict) else {}
    mi = packet.get("moveInfos", []) if isinstance(packet.get("moveInfos"), list) else []
    policy = packet.get("policy", []) if isinstance(packet.get("policy"), list) else []

    score_stdev = _safe_float(root.get("scoreStdev"))
    score_lead = _safe_float(root.get("scoreLead"))
    winrate = _safe_float(root.get("winrate"))
    raw_lead = _safe_float(root.get("rawLead"))
    raw_winrate = _safe_float(root.get("rawWinrate"))
    raw_score_selfplay = _safe_float(root.get("rawScoreSelfplay"))
    raw_var_time_left = _safe_float(root.get("rawVarTimeLeft"))
    raw_noresult = _safe_float(root.get("rawNoResultProb"))
    visits = _safe_float(root.get("visits"))
    weight = _safe_float(root.get("weight"))

    top5 = mi[:5] if mi else []
    top5_visits = [_safe_float(m.get("visits")) for m in top5 if isinstance(m, dict)]
    top5_prior = [_safe_float(m.get("prior")) for m in top5 if isinstance(m, dict)]
    top5_utilityLcb = [_safe_float(m.get("utilityLcb")) for m in top5 if isinstance(m, dict)]
    top5_winrate = [_safe_float(m.get("winrate")) for m in top5 if isinstance(m, dict)]
    top5_scoreMean = [_safe_float(m.get("scoreMean")) for m in top5 if isinstance(m, dict)]

    total_visits = sum(top5_visits) or 1.0
    visits_dist = [v / total_visits for v in top5_visits]
    top1_mass = visits_dist[0] if visits_dist else 0.0
    visits_entropy = _shannon_entropy_bits(visits_dist)
    visits_gini = _gini(top5_visits)
    prior_entropy = _shannon_entropy_bits(top5_prior)
    lcb_spread = (max(top5_utilityLcb) - min(top5_utilityLcb)) if len(top5_utilityLcb) >= 2 else 0.0
    winrate_gap = (top5_winrate[0] - top5_winrate[1]) if len(top5_winrate) >= 2 else 0.0
    score_gap = (top5_scoreMean[0] - top5_scoreMean[1]) if len(top5_scoreMean) >= 2 else 0.0

    pv = (top5[0].get("pv", []) or []) if top5 else []
    pv_visits = (top5[0].get("pvVisits", []) or []) if top5 else []
    pv_len = len(pv)
    pv_decay = 0.0
    if isinstance(pv_visits, list) and len(pv_visits) >= 2:
        first = _safe_float(pv_visits[0])
        last = _safe_float(pv_visits[-1])
        if first > 0:
            pv_decay = last / first

    policy_entropy_val = _shannon_entropy_bits(
        [_safe_float(p) for p in policy if isinstance(p, (int, float))]
    )

    return {
        "score_stdev": score_stdev,
        "score_lead": score_lead,
        "winrate": winrate,
        "raw_lead": raw_lead,
        "raw_winrate": raw_winrate,
        "raw_score_selfplay": raw_score_selfplay,
        "raw_var_time_left": raw_var_time_left,
        "raw_noresult": raw_noresult,
        "visits_at_v200": visits,
        "weight_at_v200": weight,
        "winrate_minus_raw": winrate - raw_winrate,
        "score_lead_minus_raw": score_lead - raw_score_selfplay,
        "top1_visits_mass": top1_mass,
        "visits_entropy": visits_entropy,
        "visits_gini": visits_gini,
        "prior_entropy": prior_entropy,
        "lcb_spread": lcb_spread,
        "winrate_gap_top1_top2": winrate_gap,
        "score_gap_top1_top2": score_gap,
        "pv_len": float(pv_len),
        "pv_visit_decay_ratio": pv_decay,
        "policy_entropy": policy_entropy_val,
        "to_play_is_black": 1.0 if to_play == "black" else 0.0,
    }


def load_first_packet_pg(conn, stem: str, turn: int, realization: int) -> dict[str, Any]:
    """Read the V_pre packet (first emission) from Postgres. Raises
    if the realization is missing or has zero packets."""
    packets = read_packets(conn, stem, turn, realization)
    if not packets:
        raise ValueError(f"empty trajectory in Postgres for {stem}:t{turn}:r{realization}")
    return packets[0][1]


def extract_features(
    stem: str,
    turn: int,
    realization: int = 0,
    conn=None,
) -> dict[str, float]:
    """Single-position Phase 3.5 feature vector from V_pre packet
    of one realization. Defaults to r0 — the convention across the
    research code is that r0 is the "canonical" realization to use
    for feature extraction (per-realization variance on the V_pre
    snapshot is much smaller than on the trajectory shape)."""
    own_conn = conn is None
    if own_conn:
        conn = connect()
    try:
        first = load_first_packet_pg(conn, stem, turn, realization)
    finally:
        if own_conn:
            conn.close()
    root = first.get("rootInfo", {})
    to_play = "black" if root.get("currentPlayer") == "B" else "white"
    return per_turn_features(first, to_play=to_play)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: feature_extraction.py <stem> <turn> [realization]")
    stem = sys.argv[1]
    turn = int(sys.argv[2])
    real = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    feats = extract_features(stem, turn, real)
    print(f"{stem}:t{turn}:r{real}: {len(feats)} features:")
    for k, v in sorted(feats.items()):
        print(f"  {k:30s} {v}")
