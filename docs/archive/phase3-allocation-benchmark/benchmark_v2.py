"""Sized sweep of Phase 3 allocation policies — v2 of the benchmark
harness consumes plan_v2.json (the OR-derived experiment design).

Improvements over v1:
  - Paired-cell sampling: same (SGF, turn_window) cells are used
    across all 4 tiers so cross-tier comparisons are matched (no
    SGF-effect confounder).
  - Many SGFs (~3900 available in ~/benchmark_sgfs/), 145 cells per
    cheap tier, 25 for fdx6d.
  - Multiple budgets per cell ({1000, 2000, 5000}) — free in GPU
    cost; reveals budget-dependence in policy rankings.
  - N seeds (10) per stochastic policy per cell — captures
    Thompson-sampling variability.
  - Top-3 stability check at end of each tier; skip tier 4 if
    converged across tiers 1-3.
  - Heartbeat task (every 10s, query_version) to keep KeepAlive
    middleware at bay during long oracle queries.
  - capabilities={} on every query to disable all middleware
    (adaptive_reevaluate, transposition, etc.) — the benchmark
    runs against PURE KataGo analyses.

Live progress: streams CSV to results_v2.csv. The dashboard at
http://localhost:8001/ reads that CSV (run dashboard_v2.py).

License: Public Domain (Unlicense).
"""

from __future__ import annotations

import asyncio
import csv
import json
import math
import os
import random as stdlib_random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
import websockets
from scipy.stats import spearmanr
from sgfmill import sgf as sgflib

PROXY_ROOT = Path("/home/bork/w/omega/proxy")
if str(PROXY_ROOT) not in sys.path:
    sys.path.insert(0, str(PROXY_ROOT))

from katago import AnalyzeResponse, TurnIndex  # noqa: E402
from middleware.adaptive_reevaluate import TurnView  # noqa: E402
from middleware.allocation import (  # noqa: E402
    GreedyEIGAlgorithm,
    KnowledgeGradientAlgorithm,
    ThompsonSamplingAlgorithm,
    UCBAlgorithm,
)
from middleware.visit_scaling import (  # noqa: E402
    DiminishingReturnsLogModel,
    MonteCarloSqrtModel,
)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SELECTOR_HOST = "192.168.122.1:1235"
BENCHMARK_SGFS_DIR = Path("/home/bork/benchmark_sgfs")
PLAN_PATH = Path("/home/bork/benchmark_allocation/plan_v2.json")
CSV_PATH = Path("/home/bork/benchmark_allocation/results_v2.csv")
CELLS_PATH = Path("/home/bork/benchmark_allocation/cells_v2.json")


# ---------------------------------------------------------------------------
# SGF utilities
# ---------------------------------------------------------------------------

def _sgf_to_katago_coord(point: tuple[int, int] | None) -> str:
    if point is None:
        return "pass"
    row, col = point
    letter = chr(ord("A") + col + (1 if col >= 8 else 0))
    return f"{letter}{row + 1}"


def _load_moves(path: Path) -> tuple[list[list[str]], int, float]:
    with open(path, "rb") as f:
        g = sgflib.Sgf_game.from_bytes(f.read())
    size = g.get_size()
    raw_komi = float(g.get_root().get("KM") or 6.5)
    # KataGo requires komi to be an integer or half-integer (.0 / .5
    # only). Some SGFs in the wild carry quarter-integer komi (e.g.
    # 3.75 for unusual handicap settings). Round to the nearest
    # half-integer so the analyze query is accepted; the position
    # itself isn't materially changed for allocation-policy
    # benchmarking purposes.
    komi = round(raw_komi * 2) / 2
    moves: list[list[str]] = []
    for node in g.get_main_sequence():
        m = node.get_move()
        if m == (None, None):
            continue
        colour, point = m
        moves.append([colour.upper(), _sgf_to_katago_coord(point)])
    return moves, size, komi


def _sample_cells(
    n_cells_max: int,
    t_per_cell: int,
    stride: int,
    start_min: int,
    rng_seed: int,
) -> list[dict[str, Any]]:
    """Pick (SGF, turn_start) cells uniformly at random from the SGF pool.

    Returns a list of {sgf_path, turn_start, length_moves, ...}.
    Each cell is one (game, position-window) tuple; the pre+oracle
    queries operate on T_per_cell turns starting at turn_start."""
    rng = stdlib_random.Random(rng_seed)
    all_sgfs = sorted(BENCHMARK_SGFS_DIR.glob("*.sgf"))
    rng.shuffle(all_sgfs)
    cells: list[dict[str, Any]] = []
    for sgf_path in all_sgfs:
        if len(cells) >= n_cells_max:
            break
        try:
            moves, size, komi = _load_moves(sgf_path)
        except Exception:
            continue
        n_moves = len(moves)
        if n_moves < start_min + t_per_cell:
            continue
        # Pick a single non-overlapping window per SGF (uniformly at
        # random from eligible starts).
        max_start = n_moves - t_per_cell
        eligible_starts = list(range(start_min, max_start + 1, stride))
        if not eligible_starts:
            continue
        s = rng.choice(eligible_starts)
        cells.append({
            "sgf_stem": sgf_path.stem,
            "sgf_path": str(sgf_path),
            "turn_start": s,
            "turn_count": t_per_cell,
            "n_moves": n_moves,
            "board_size": size,
            "komi": komi,
            "moves": moves,
        })
    return cells


# ---------------------------------------------------------------------------
# KataGo wire client
# ---------------------------------------------------------------------------

class SelectorClient:
    def __init__(self, host: str = SELECTOR_HOST) -> None:
        self.host = host
        self.ws: Any = None
        self._next_id = 0
        self._heartbeat_task: asyncio.Task[None] | None = None
        # The `websockets` library does NOT serialize concurrent
        # send() calls from different coroutines. Heartbeat task +
        # analyze() racing on send corrupts WS frames, the proxy
        # drops them, recv waits forever. This lock serialises
        # every wire write.
        self._send_lock: asyncio.Lock | None = None

    def _qid(self, prefix: str) -> str:
        self._next_id += 1
        return f"{prefix}-{self._next_id}"

    async def _send(self, payload: str) -> None:
        assert self.ws is not None
        assert self._send_lock is not None
        async with self._send_lock:
            await self.ws.send(payload)

    async def connect(self) -> None:
        self.ws = await websockets.connect(
            f"ws://{self.host}/", max_size=None,
        )
        self._send_lock = asyncio.Lock()
        self._heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(), name="bench-hb",
        )

    async def close(self) -> None:
        if self._heartbeat_task is not None and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.ws is not None:
            await self.ws.close()

    async def _heartbeat_loop(self) -> None:
        try:
            assert self.ws is not None
            # FIRST heartbeat fires immediately; subsequent every 10s.
            # 10s is well under the proxy's 25s KeepAlive idle_timeout.
            while True:
                hb_id = self._qid("__hb")
                try:
                    await self._send(json.dumps({
                        "id": hb_id, "action": "query_version",
                    }))
                except Exception:
                    return
                await asyncio.sleep(10.0)
        except asyncio.CancelledError:
            return

    async def analyze(
        self,
        *,
        model: str,
        moves: list[list[str]],
        board_size: int,
        komi: float,
        analyze_turns: list[int],
        max_visits: int,
        include_policy: bool = True,
        timeout_s: float = 600.0,
    ) -> dict[int, dict[str, Any]]:
        qid = self._qid(f"q-{model}")
        query = {
            "id": qid,
            "action": "analyze",
            "model": model,
            "rules": "japanese",
            "komi": komi,
            "boardXSize": board_size,
            "boardYSize": board_size,
            "moves": moves,
            "analyzeTurns": analyze_turns,
            "maxVisits": max_visits,
            "includePolicy": include_policy,
            "capabilities": {},  # opt-out of all middleware
        }
        assert self.ws is not None
        await self._send(json.dumps(query))
        target = set(analyze_turns)
        results: dict[int, dict[str, Any]] = {}
        deadline = asyncio.get_event_loop().time() + timeout_s
        while len(results) < len(target):
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                raise TimeoutError(
                    f"analyze timeout: model={model}, V={max_visits}, "
                    f"received {len(results)}/{len(target)}"
                )
            msg = await asyncio.wait_for(self.ws.recv(), timeout=remaining)
            r = json.loads(msg)
            if r.get("id") != qid:
                continue
            # Error responses arrive with `error` field and no
            # turnNumber; raise loudly so the benchmark fails fast
            # instead of waiting for finals that will never come.
            if "error" in r:
                raise RuntimeError(
                    f"katago rejected query id={qid} model={model}: "
                    f"error={r.get('error')!r} field={r.get('field')!r}"
                )
            if r.get("isDuringSearch", True):
                continue
            t = r.get("turnNumber")
            if t in target and t not in results:
                results[t] = r
        return results


# ---------------------------------------------------------------------------
# Value functions
# ---------------------------------------------------------------------------

def _vfn_policy_entropy(view: TurnView) -> float:
    opaque = view.packet.opaque
    p = opaque.get("policy") if isinstance(opaque, dict) else None
    if not isinstance(p, list) or not p:
        return 0.0
    return -sum(x * math.log2(x) for x in p if x > 0)


def _vfn_score_stdev(view: TurnView) -> float:
    opaque = view.packet.opaque
    root = opaque.get("rootInfo") if isinstance(opaque, dict) else None
    if not isinstance(root, dict):
        return 0.0
    v = root.get("scoreStdev")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return 0.0


def _vfn_lcb_spread(view: TurnView) -> float:
    opaque = view.packet.opaque
    mi = opaque.get("moveInfos") if isinstance(opaque, dict) else None
    if not isinstance(mi, list) or len(mi) < 2:
        return 0.0
    lcbs = [
        m.get("utilityLcb", 0.0) for m in mi[:5]
        if isinstance(m, dict)
    ]
    if len(lcbs) < 2:
        return 0.0
    return max(lcbs) - min(lcbs)


VALUE_FNS: dict[str, Callable[[TurnView], float]] = {
    "policy_entropy": _vfn_policy_entropy,
    "score_stdev": _vfn_score_stdev,
    "lcb_spread": _vfn_lcb_spread,
}


SCALING_MODELS = {
    "monte_carlo_sqrt": MonteCarloSqrtModel(),
    "diminishing_returns_log": DiminishingReturnsLogModel(),
}

ALGORITHM_FACTORIES = {
    "greedy_eig": lambda: GreedyEIGAlgorithm(),
    "knowledge_gradient": lambda: KnowledgeGradientAlgorithm(),
    "thompson_sampling": lambda: ThompsonSamplingAlgorithm(),
    "ucb": lambda: UCBAlgorithm(kappa=1.0),
}

STOCHASTIC_ALGOS = {"thompson_sampling"}


@dataclass(frozen=True)
class Policy:
    name: str
    kind: str            # "baseline" or "phase3"
    algorithm: str
    scaling_model: str
    value_fn: str


def _build_policies() -> list[Policy]:
    out = [Policy(
        name="baseline_v124_uniform",
        kind="baseline", algorithm="uniform",
        scaling_model="n/a", value_fn="n/a",
    )]
    for algo in ALGORITHM_FACTORIES:
        for sm in SCALING_MODELS:
            for vf in VALUE_FNS:
                out.append(Policy(
                    name=f"{algo}+{sm}+{vf}",
                    kind="phase3", algorithm=algo,
                    scaling_model=sm, value_fn=vf,
                ))
    return out


POLICIES = _build_policies()


def _allocate(
    policy: Policy,
    candidates: list[TurnView],
    budget: int,
    seed: int,
) -> dict[int, int]:
    if policy.kind == "baseline":
        n = len(candidates)
        if n == 0:
            return {}
        base = budget // n
        extra = budget - base * n
        alloc = {int(c.turn_index): base for c in candidates}
        for c in candidates[:extra]:
            alloc[int(c.turn_index)] += 1
        return {t: v for t, v in alloc.items() if v > 0}
    algo = ALGORITHM_FACTORIES[policy.algorithm]()
    scaling = SCALING_MODELS[policy.scaling_model]
    vfn = VALUE_FNS[policy.value_fn]
    rng = stdlib_random.Random(seed)
    raw = algo.allocate(
        candidates=candidates,
        value_fn=vfn,
        visit_scaling_model=scaling,
        budget_visits=budget,
        rng=rng,
    )
    return {int(t): v for t, v in raw.items()}


def _visit_distribution(packet: dict[str, Any]) -> dict[str, int]:
    """Return move → visit-count from a KataGo final response."""
    out: dict[str, int] = {}
    mi = packet.get("moveInfos", [])
    if not isinstance(mi, list):
        return out
    for m in mi:
        if not isinstance(m, dict):
            continue
        move = m.get("move")
        visits = m.get("visits", 0)
        if isinstance(move, str) and isinstance(visits, (int, float)):
            out[move] = int(visits)
    return out


def _shannon_entropy(visits: dict[str, int]) -> float:
    """Shannon entropy (bits) of the visit-derived empirical policy."""
    total = sum(visits.values())
    if total == 0:
        return 0.0
    h = 0.0
    for v in visits.values():
        if v <= 0:
            continue
        p = v / total
        h -= p * math.log2(p)
    return h


def _kl_divergence(
    p_visits: dict[str, int],
    q_visits: dict[str, int],
    epsilon: float = 1e-9,
) -> float:
    """KL(p ‖ q) over the union of moves; epsilon-smooths the missing
    masses on either side, then renormalises. Returns 0.0 when either
    distribution is empty."""
    p_total = sum(p_visits.values())
    q_total = sum(q_visits.values())
    if p_total == 0 or q_total == 0:
        return 0.0
    all_moves = set(p_visits) | set(q_visits)
    p = {m: max(p_visits.get(m, 0) / p_total, epsilon) for m in all_moves}
    q = {m: max(q_visits.get(m, 0) / q_total, epsilon) for m in all_moves}
    p_sum = sum(p.values())
    q_sum = sum(q.values())
    return sum(
        (p[m] / p_sum) * math.log2((p[m] / p_sum) / (q[m] / q_sum))
        for m in all_moves
    )


def _top1_move(visits: dict[str, int]) -> str | None:
    if not visits:
        return None
    return max(visits.items(), key=lambda kv: kv[1])[0]


def _oracle_metrics_pair(
    pre: dict[int, dict[str, Any]],
    later: dict[int, dict[str, Any]],
) -> dict[str, dict[int, float]]:
    """Per-turn oracle benefits from (pre, later) endpoint pair.
    Both V=pre→V=intermediate and V=pre→V=oracle use this; the result
    is the per-turn reduction.

    Metrics: visit_entropy_reduction, visit_kl_divergence,
    top1_changed, score_stdev_reduction (see module-level docstring
    on _oracle_metrics for semantics)."""
    out: dict[str, dict[int, float]] = {
        "visit_entropy_reduction": {},
        "visit_kl_divergence": {},
        "top1_changed": {},
        "score_stdev_reduction": {},
    }
    for t in pre:
        if t not in later:
            continue
        pre_visits = _visit_distribution(pre[t])
        later_visits = _visit_distribution(later[t])

        # Entropy reduction (policy-space).
        h_pre = _shannon_entropy(pre_visits)
        h_later = _shannon_entropy(later_visits)
        out["visit_entropy_reduction"][t] = h_pre - h_later

        # KL(later ‖ pre): treats later as truth.
        out["visit_kl_divergence"][t] = _kl_divergence(later_visits, pre_visits)

        # Top-1 flip (binary).
        pre_top = _top1_move(pre_visits)
        later_top = _top1_move(later_visits)
        out["top1_changed"][t] = (
            1.0 if (pre_top is not None and later_top is not None
                    and pre_top != later_top)
            else 0.0
        )

        # Score-space (legacy).
        pre_stdev = float(pre[t].get("rootInfo", {}).get("scoreStdev", 0.0))
        later_stdev = float(later[t].get("rootInfo", {}).get("scoreStdev", 0.0))
        out["score_stdev_reduction"][t] = max(0.0, pre_stdev - later_stdev)
    return out


def _quality(
    allocation: dict[int, int],
    oracle_metric: dict[int, float],
    turns: list[int],
) -> tuple[float, int]:
    """Spearman ρ + top-3 overlap of allocation against one oracle metric."""
    alloc_vec = np.array([allocation.get(t, 0) for t in turns], dtype=float)
    oracle_vec = np.array(
        [oracle_metric.get(t, 0.0) for t in turns], dtype=float,
    )
    if np.unique(alloc_vec).size <= 1 or np.unique(oracle_vec).size <= 1:
        sp = float("nan")
    else:
        sp_corr, _ = spearmanr(alloc_vec, oracle_vec)
        sp = float(sp_corr) if not np.isnan(sp_corr) else float("nan")
    top3_a = set(np.argsort(-alloc_vec)[:3].tolist())
    top3_o = set(np.argsort(-oracle_vec)[:3].tolist())
    return sp, len(top3_a & top3_o)


def _efficiency_linear(
    allocation: dict[int, int],
    r_full: dict[int, float],
    budget: int,
    v_full_extra: int,
) -> float:
    """Efficiency under linear scaling: info_gain(t, A) = r_t × min(A/V, 1).
    Optimal allocation: greedy fill — V_full_extra on highest-r turn,
    then next, etc., until budget exhausted."""
    positive_r = sorted(
        (r for r in r_full.values() if r > 0), reverse=True,
    )
    if not positive_r or budget <= 0 or v_full_extra <= 0:
        return float("nan")
    # Optimal under linear+cap: sequential fill of top-r turns.
    optimal = 0.0
    remaining = budget
    for r in positive_r:
        spend = min(v_full_extra, remaining)
        optimal += r * (spend / v_full_extra)
        remaining -= spend
        if remaining <= 0:
            break
    if optimal <= 0:
        return float("nan")
    realised = sum(
        r_full.get(t, 0.0) * min(a / v_full_extra, 1.0)
        for t, a in allocation.items()
        if r_full.get(t, 0.0) > 0 and a > 0
    )
    return realised / optimal


def _efficiency_sqrt(
    allocation: dict[int, int],
    r_full: dict[int, float],
    budget: int,
    v_full_extra: int,
) -> float:
    """Efficiency under √V scaling (MonteCarloSqrt model assumption).
    Water-filling optimal: v_t* ∝ r_t² ⇒ total_optimal = √(B × Σ r_t²)."""
    r_sq_sum = sum(r * r for r in r_full.values() if r > 0)
    if r_sq_sum <= 0 or budget <= 0 or v_full_extra <= 0:
        return float("nan")
    realised = sum(
        r_full.get(t, 0.0) * math.sqrt(a / v_full_extra)
        for t, a in allocation.items()
        if r_full.get(t, 0.0) > 0 and a > 0
    )
    optimal = math.sqrt(budget * r_sq_sum) / math.sqrt(v_full_extra)
    if optimal <= 0:
        return float("nan")
    return realised / optimal


def _efficiency_log(
    allocation: dict[int, int],
    r_full: dict[int, float],
    budget: int,
    v_full_extra: int,
    v_pre: int,
) -> float:
    """Efficiency under log scaling: info_gain(t, A) = r_t × log(1 + A/V_pre) / log(1 + V_full_extra/V_pre).
    Optimal: numerical water-filling. We approximate with a fast
    greedy + bisection. Optimum for ∂g/∂v = (r_t/V_pre)/(1+v_t/V_pre) = λ
    gives v_t* = r_t/(λ × C) - V_pre where C = log(1 + V_full_extra/V_pre).
    Negative v_t* clamp to 0; bisect on λ until Σ v_t* = B.

    Returns nan if no valid optimum (e.g., all r_t = 0)."""
    log_norm = math.log(1.0 + v_full_extra / v_pre)
    if log_norm <= 0:
        return float("nan")
    positive = [(t, r) for t, r in r_full.items() if r > 0]
    if not positive or budget <= 0:
        return float("nan")

    def total_alloc(inv_lambda: float) -> tuple[float, float]:
        # Given inv_lambda = 1/λ, return (Σ v_t*, Σ r_t × log(1 + v_t*/V_pre)/log_norm).
        # v_t* = max(0, inv_lambda × r_t / log_norm × log_norm / V_pre - V_pre) = max(0, inv_lambda × r_t - V_pre).
        # (Derived from r_t/log_norm × 1/(V_pre + v_t) = λ × 1/log_norm ⇒ V_pre + v_t = r_t / λ.)
        sum_v = 0.0
        sum_g = 0.0
        for _t, r in positive:
            v_star = max(0.0, inv_lambda * r - v_pre)
            sum_v += v_star
            if v_star > 0:
                sum_g += r * math.log(1.0 + v_star / v_pre) / log_norm
        return sum_v, sum_g

    # Bisect on inv_lambda.
    lo, hi = 0.0, 1e12
    for _ in range(60):
        mid = (lo + hi) / 2
        s, _ = total_alloc(mid)
        if s < budget:
            lo = mid
        else:
            hi = mid
    _, optimal = total_alloc(hi)
    if optimal <= 0:
        return float("nan")
    realised = sum(
        r_full.get(t, 0.0) * math.log(1.0 + a / v_pre) / log_norm
        for t, a in allocation.items()
        if r_full.get(t, 0.0) > 0 and a > 0
    )
    return realised / optimal


def _efficiency_piecewise(
    allocation: dict[int, int],
    r_int: dict[int, float],
    r_full: dict[int, float],
    budget: int,
    v_int_extra: int,
    v_full_extra: int,
) -> float:
    """Efficiency under direct 3-point measurement: piecewise-linear
    info_gain per turn between (V_pre, V_intermediate, V_full).

    Each turn has two linear segments:
      segment 1: slope r_int/V_int_extra, capacity V_int_extra
      segment 2: slope (r_full - r_int)/(V_full_extra - V_int_extra), capacity V_full_extra - V_int_extra

    Optimal: sort all segments globally by slope desc; greedy fill
    until budget exhausted (water-filling on piecewise-linear curves)."""
    if budget <= 0 or v_int_extra <= 0 or v_full_extra <= v_int_extra:
        return float("nan")
    segments: list[tuple[float, float]] = []  # (slope, capacity)
    for t in r_full:
        ri = r_int.get(t, 0.0)
        rf = r_full.get(t, 0.0)
        if ri > 0:
            segments.append((ri / v_int_extra, float(v_int_extra)))
        s2 = (rf - ri) / (v_full_extra - v_int_extra)
        if s2 > 0:
            segments.append((s2, float(v_full_extra - v_int_extra)))
    segments.sort(key=lambda s: -s[0])
    optimal = 0.0
    remaining = float(budget)
    for slope, cap in segments:
        if remaining <= 0:
            break
        spend = min(cap, remaining)
        optimal += slope * spend
        remaining -= spend
    if optimal <= 0:
        return float("nan")
    # Realised: per turn's allocation A, integrate over the two segments.
    realised = 0.0
    for t, a in allocation.items():
        if a <= 0:
            continue
        ri = r_int.get(t, 0.0)
        rf = r_full.get(t, 0.0)
        s1 = ri / v_int_extra if ri > 0 else 0.0
        s2 = max(0.0, (rf - ri) / (v_full_extra - v_int_extra))
        spend1 = min(float(a), float(v_int_extra))
        spend2 = max(0.0, min(float(a) - v_int_extra, v_full_extra - v_int_extra))
        realised += s1 * spend1 + s2 * spend2
    return realised / optimal


def _all_efficiencies(
    allocation: dict[int, int],
    r_int: dict[int, float],
    r_full: dict[int, float],
    budget: int,
    v_pre: int,
    v_int_extra: int,
    v_full_extra: int,
) -> dict[str, float]:
    return {
        "linear": _efficiency_linear(allocation, r_full, budget, v_full_extra),
        "sqrt": _efficiency_sqrt(allocation, r_full, budget, v_full_extra),
        "log": _efficiency_log(
            allocation, r_full, budget, v_full_extra, v_pre,
        ),
        "piecewise": _efficiency_piecewise(
            allocation, r_int, r_full, budget, v_int_extra, v_full_extra,
        ),
    }


def _build_turn_views(
    pre: dict[int, dict[str, Any]],
) -> list[TurnView]:
    views: list[TurnView] = []
    for t in sorted(pre.keys()):
        opaque = dict(pre[t])
        for k in ("id", "isDuringSearch", "turnNumber"):
            opaque.pop(k, None)
        packet = AnalyzeResponse(
            is_during_search=False, turn_number=t, opaque=opaque,
        )
        to_play = "black" if t % 2 == 0 else "white"
        views.append(TurnView(
            turn_index=TurnIndex(t), to_play=to_play, packet=packet,
        ))
    return views


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

ORACLE_METRICS = (
    "visit_entropy_reduction",  # primary (info-theoretic, policy-space)
    "visit_kl_divergence",
    "top1_changed",
    "score_stdev_reduction",     # value-space legacy comparison
)
SCALINGS = ("linear", "sqrt", "log", "piecewise")
PRIMARY_ORACLE = "visit_entropy_reduction"
PRIMARY_SCALING = "piecewise"  # direct-measurement-based; no scaling assumption


def _eff_col(metric: str, scaling: str) -> str:
    return f"efficiency_{metric}_{scaling}"


CSV_FIELDS = [
    "model", "sgf", "turn_start", "turn_count",
    "policy", "kind", "algorithm", "scaling_model", "value_fn",
    "budget", "seed",
    # Per (oracle metric): spearman (rank correlation), top3
    # (discrete overlap).
    *(f"spearman_{m}" for m in ORACLE_METRICS),
    *(f"top3_{m}" for m in ORACLE_METRICS),
    # Per (oracle metric × scaling): efficiency. 4 metrics × 4
    # scalings = 16 columns. Each is realised total info gain ÷
    # optimal total info gain under that scaling assumption.
    # Bounded [0, 1].
    *(_eff_col(m, s) for m in ORACLE_METRICS for s in SCALINGS),
    "allocation_json", "timestamp",
]


def _open_csv() -> tuple[Any, Any]:
    fresh = not CSV_PATH.exists()
    fp = open(CSV_PATH, "a", newline="")
    writer = csv.DictWriter(fp, fieldnames=CSV_FIELDS)
    if fresh:
        writer.writeheader()
        fp.flush()
    return fp, writer


def _top3_policies(
    per_model: dict[str, list[float]],
) -> list[str]:
    scored = [
        (name, float(np.mean(sp)) if sp else float("-inf"))
        for name, sp in per_model.items()
    ]
    scored.sort(key=lambda x: -x[1])
    return [name for name, _ in scored[:3]]


def _tier_stable(history: list[list[str]]) -> bool:
    # Three consecutive identical top-3 lists.
    if len(history) < 3:
        return False
    return history[-1] == history[-2] == history[-3]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    plan = json.loads(PLAN_PATH.read_text())
    cfg = plan["config"]
    n_per_tier: dict[str, int] = plan["n_cells_per_tier"]
    tier_order: list[str] = plan["tier_order"]
    budgets: list[int] = cfg["budgets"]
    n_seeds_stoch: int = cfg["n_seeds_stochastic"]

    t_per_cell = cfg["T_per_cell"]
    v_pre = cfg["V_pre"]
    v_intermediate = cfg["V_intermediate"]
    v_oracle = cfg["V_oracle"]
    v_int_extra = v_intermediate - v_pre
    v_full_extra = v_oracle - v_pre
    stride = cfg["window_stride"]
    start_min = cfg["window_start_min"]
    rng_seed = cfg["rng_seed"]

    n_cells_max = max(n_per_tier.values())  # 145
    print(f"sampling up to {n_cells_max} (SGF, window) cells...", flush=True)
    cells = _sample_cells(
        n_cells_max=n_cells_max,
        t_per_cell=t_per_cell,
        stride=stride,
        start_min=start_min,
        rng_seed=rng_seed,
    )
    print(f"sampled {len(cells)} cells", flush=True)
    if len(cells) < n_cells_max:
        print(
            f"WARN: only {len(cells)} eligible cells found; "
            f"plan called for {n_cells_max}",
            flush=True,
        )

    # Persist the cell selection for reproducibility.
    cell_summary = [
        {k: v for k, v in c.items() if k not in ("moves",)}
        for c in cells
    ]
    CELLS_PATH.write_text(json.dumps(cell_summary, indent=2))

    csv_fp, csv_writer = _open_csv()
    client = SelectorClient()
    await client.connect()

    def tick(msg: str) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

    # Resume support: read existing CSV to find (model, sgf,
    # turn_start) tuples already complete. Skip those on this run.
    already_done: set[tuple[str, str, int]] = set()
    if CSV_PATH.exists():
        with open(CSV_PATH, newline="") as f:
            for r in csv.DictReader(f):
                try:
                    already_done.add(
                        (r["model"], r["sgf"], int(r["turn_start"])),
                    )
                except (KeyError, ValueError):
                    pass
        print(
            f"resume: {len(already_done)} (model, sgf, turn_start) "
            f"tuples already in CSV; will skip those",
            flush=True,
        )

    try:
        per_model_history: list[list[str]] = []
        for tier_idx, model in enumerate(tier_order):
            n_for_tier = n_per_tier.get(model, 0)
            if n_for_tier <= 0:
                tick(f"tier {tier_idx+1}: skipping {model} (n=0 in plan)")
                continue
            tick(f"=== TIER {tier_idx+1}/{len(tier_order)}: {model} ({n_for_tier} cells) ===")
            tier_t0 = time.monotonic()
            tier_results: dict[str, list[float]] = {}

            cells_skipped = 0
            cells_resumed = 0
            for i, cell in enumerate(cells[:n_for_tier]):
                # Resume: if this cell is already in the CSV for this
                # model, skip the GPU work. We still want to add its
                # spearman values to tier_results for the tier-stop
                # heuristic — read those from CSV if needed. For now
                # just count it; tier-stop runs on the full CSV via a
                # post-pass below.
                if (model, cell["sgf_stem"], cell["turn_start"]) in already_done:
                    cells_resumed += 1
                    if cells_resumed % 50 == 0 or cells_resumed == 1:
                        tick(
                            f"  {model}: resume-skip cell {i+1}/{n_for_tier} "
                            f"({cells_resumed} resumed total)"
                        )
                    continue
                turns = list(range(
                    cell["turn_start"], cell["turn_start"] + cell["turn_count"],
                ))
                t0 = time.monotonic()
                try:
                    pre = await client.analyze(
                        model=model, moves=cell["moves"],
                        board_size=cell["board_size"], komi=cell["komi"],
                        analyze_turns=turns, max_visits=v_pre,
                        include_policy=True,
                    )
                    intermediate = await client.analyze(
                        model=model, moves=cell["moves"],
                        board_size=cell["board_size"], komi=cell["komi"],
                        analyze_turns=turns, max_visits=v_intermediate,
                        include_policy=True,
                    )
                    oracle = await client.analyze(
                        model=model, moves=cell["moves"],
                        board_size=cell["board_size"], komi=cell["komi"],
                        analyze_turns=turns, max_visits=v_oracle,
                        include_policy=True,
                    )
                except RuntimeError as e:
                    cells_skipped += 1
                    tick(
                        f"  {model}: SKIP cell {i+1}/{n_for_tier} "
                        f"sgf={cell['sgf_stem']} turn_start={cell['turn_start']}: {e}"
                    )
                    continue
                cell_t = time.monotonic() - t0
                # Two endpoint-pair metric dicts: pre→intermediate
                # (r_int) and pre→oracle (r_full). The oracle metric
                # for ranking/spearman/top3 uses r_full (the canonical
                # "ground truth"); efficiency under piecewise uses
                # both endpoints.
                r_int_by_metric = _oracle_metrics_pair(pre, intermediate)
                r_full_by_metric = _oracle_metrics_pair(pre, oracle)
                candidates = _build_turn_views(pre)

                # Save per-cell raw metric curves to a side-channel
                # JSON for post-hoc scaling-validation analysis. One
                # row per cell appended to cells_v2.jsonl.
                cell_record = {
                    "model": model,
                    "sgf": cell["sgf_stem"],
                    "turn_start": cell["turn_start"],
                    "turn_count": cell["turn_count"],
                    "v_pre": v_pre, "v_intermediate": v_intermediate,
                    "v_oracle": v_oracle,
                    "metrics": {
                        m: {
                            "r_int": {str(t): r_int_by_metric[m].get(t, 0.0)
                                      for t in turns},
                            "r_full": {str(t): r_full_by_metric[m].get(t, 0.0)
                                       for t in turns},
                        }
                        for m in ORACLE_METRICS
                    },
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                with open(
                    "/home/bork/benchmark_allocation/cells_v2.jsonl", "a"
                ) as cf:
                    cf.write(json.dumps(cell_record) + "\n")

                # Policy evaluation (pure Python, no GPU).
                for policy in POLICIES:
                    n_seeds = (
                        n_seeds_stoch if policy.algorithm in STOCHASTIC_ALGOS
                        else 1
                    )
                    for budget in budgets:
                        for seed in range(n_seeds):
                            alloc = _allocate(policy, candidates, budget, seed)
                            row: dict[str, Any] = {
                                "model": model,
                                "sgf": cell["sgf_stem"],
                                "turn_start": cell["turn_start"],
                                "turn_count": cell["turn_count"],
                                "policy": policy.name,
                                "kind": policy.kind,
                                "algorithm": policy.algorithm,
                                "scaling_model": policy.scaling_model,
                                "value_fn": policy.value_fn,
                                "budget": budget,
                                "seed": seed,
                                "allocation_json": json.dumps(alloc),
                                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                            }
                            for m_name in ORACLE_METRICS:
                                r_full = r_full_by_metric[m_name]
                                r_int = r_int_by_metric[m_name]
                                sp, ov = _quality(alloc, r_full, turns)
                                row[f"spearman_{m_name}"] = (
                                    f"{sp:.6f}" if not math.isnan(sp) else ""
                                )
                                row[f"top3_{m_name}"] = ov
                                effs = _all_efficiencies(
                                    alloc, r_int, r_full,
                                    budget=budget, v_pre=v_pre,
                                    v_int_extra=v_int_extra,
                                    v_full_extra=v_full_extra,
                                )
                                for s_name, eff in effs.items():
                                    row[_eff_col(m_name, s_name)] = (
                                        f"{eff:.6f}" if not math.isnan(eff) else ""
                                    )
                            csv_writer.writerow(row)
                            # Tier-stop on PRIMARY metric × PRIMARY
                            # scaling (visit_entropy_reduction × piecewise)
                            # at the headline budget. Piecewise is the
                            # most defensible scaling (no parametric
                            # assumption, anchored to 3 measured points).
                            primary_eff = row[_eff_col(PRIMARY_ORACLE, PRIMARY_SCALING)]
                            if budget == 2000 and primary_eff:
                                tier_results.setdefault(policy.name, []).append(
                                    float(primary_eff)
                                )
                csv_fp.flush()
                if (i + 1) % 10 == 0 or i == n_for_tier - 1:
                    elapsed = time.monotonic() - tier_t0
                    eta = elapsed / (i + 1) * (n_for_tier - i - 1)
                    tick(
                        f"  {model}: cell {i+1}/{n_for_tier} done in {cell_t:.1f}s "
                        f"(tier elapsed {elapsed:.0f}s, ETA {eta:.0f}s)"
                    )

            tier_elapsed = time.monotonic() - tier_t0
            # After a resume, tier_results may be empty (all cells
            # skipped). Re-read the CSV for this tier so the
            # tier-stop heuristic sees the full data, not just the
            # cells we did in this run.
            full_tier_results: dict[str, list[float]] = {}
            csv_fp.flush()
            with open(CSV_PATH, newline="") as f:
                for r in csv.DictReader(f):
                    if r.get("model") != model:
                        continue
                    if int(r.get("budget", "0") or 0) != 2000:
                        continue
                    eff_str = r.get(_eff_col(PRIMARY_ORACLE, PRIMARY_SCALING), "")
                    if not eff_str:
                        continue
                    try:
                        full_tier_results.setdefault(
                            r["policy"], []
                        ).append(float(eff_str))
                    except ValueError:
                        pass
            top3 = _top3_policies(full_tier_results)
            per_model_history.append(top3)
            tick(
                f"  TIER {model} DONE in {tier_elapsed:.0f}s "
                f"(resumed {cells_resumed}, new {n_for_tier - cells_resumed - cells_skipped}, "
                f"skip {cells_skipped}) — TOP-3: {top3}"
            )
            if _tier_stable(per_model_history):
                tick(
                    f"  top-3 stable across 3 consecutive tiers; "
                    f"skipping remaining: {tier_order[tier_idx+1:]}"
                )
                break

    finally:
        await client.close()
        csv_fp.close()
    tick("DONE.")


if __name__ == "__main__":
    asyncio.run(main())
