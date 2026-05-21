"""
research/stability_trajectory.py

Generic stability-trajectory data structure for any per-packet
discrete-or-binnable quantity Q. Builds a change-point list once from
a packet stream, then serves any-V queries in effectively constant
time. Composes naturally with the proxy's `staged_analysis` capability:
the proxy can maintain the change-point list incrementally and emit
only deltas per stage rather than redundant full packets.

Extractors return `Q | None`:
  - Q: the observed quantity at this packet.
  - None: the packet doesn't permit a reliable observation
    (e.g. moveInfos truncated below the rank needed; required field
    missing). Stability-fraction calculations drop None from both
    numerator and denominator — absence is not a vote against
    stability.

Quantity registry surfaces three classes:
  - rootInfo-only (immune to moveInfos truncation):
      scoreLead_sign, winrate_polarity, winrate_quintile
  - search-vs-network-prior (per-packet, evolves with search):
      search_agrees_with_policy — does argmax(moveInfos.visits) match
      the highest-prior move within moveInfos? Binary.
      (NOTE: raw `argmax(policy)` over the full 362-element policy
      distribution is NOT a useful stability extractor because the
      policy is the network's prior, computed once per position; it
      does not evolve with search. A constant-extractor would be
      trivially "stable" for the wrong reason.)
  - moveInfos-based:
      top1_move (mostly immune — top-1 is never truncated)
      top3_set, top1_in_top3 (vulnerable when rank-position changes
        confound with truncation; defensive None-handling)

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, Hashable, TypeVar

Q = TypeVar("Q", bound=Hashable)


def extract_scoreLead_sign(packet: dict) -> int | None:
    root = packet.get("rootInfo") or {}
    sl = root.get("scoreLead")
    if sl is None:
        return None
    return 1 if float(sl) > 0 else (-1 if float(sl) < 0 else 0)


def extract_winrate_polarity(packet: dict) -> bool | None:
    root = packet.get("rootInfo") or {}
    wr = root.get("winrate")
    if wr is None:
        return None
    return float(wr) > 0.5


def extract_winrate_quintile(packet: dict) -> int | None:
    root = packet.get("rootInfo") or {}
    wr = root.get("winrate")
    if wr is None:
        return None
    return min(4, int(float(wr) * 5))


def extract_search_agrees_with_policy(packet: dict) -> bool | None:
    """Does the search's current top-1 (argmax of moveInfos.visits)
    match the highest-prior move in moveInfos? This evolves with
    search: at low V, search has barely moved away from the prior and
    typically agrees; at high V on a position where MCTS finds a better
    move, search will have moved to a non-prior move and disagrees.

    Replaces the earlier `extract_policy_argmax` which read the raw
    `policy` field — that's the network's prior, computed once per
    position, constant across packets, and therefore useless as a
    stability extractor."""
    mi = packet.get("moveInfos") or []
    if not mi:
        return None
    # Find the move with highest prior within moveInfos.
    network_top_move = None
    network_top_prior = -1.0
    for m in mi:
        p = m.get("prior")
        mv = m.get("move")
        if p is None or mv is None:
            continue
        if float(p) > network_top_prior:
            network_top_prior = float(p)
            network_top_move = mv
    if network_top_move is None:
        return None
    # moveInfos is sorted by visits descending; [0] is the search's top-1.
    search_top_move = mi[0].get("move")
    if search_top_move is None:
        return None
    return str(network_top_move) == str(search_top_move)


def extract_top1_move(packet: dict) -> str | None:
    mi = packet.get("moveInfos") or []
    if not mi:
        return None
    # moveInfos is sorted by visits descending; [0] is the top-1.
    m = mi[0].get("move")
    if m is None:
        return None
    return str(m)


def extract_top3_set(packet: dict) -> frozenset[str] | None:
    mi = packet.get("moveInfos") or []
    if len(mi) < 3:
        return None  # truncation: can't observe top-3 reliably
    moves = [m.get("move") for m in mi[:3]]
    if any(m is None for m in moves):
        return None
    return frozenset(str(m) for m in moves)


def extract_top2_margin_quintile(packet: dict) -> int | None:
    """Visit-fraction margin between top-1 and top-2, bucketed into
    quintiles {0, 1, 2, 3, 4} by `(visits[0] - visits[1]) / sum(visits[:5])`.

    Captures search *confidence* independent of top-1 identity. The
    operationally meaningful signal that an experienced KataGo user
    reads when interpreting analysis output. Per firewall consult #4:
    a position where top-1 just barely beats top-2 may look stable in
    `top1_move` (top-1 never changes) but is operationally fragile.

    Quintile boundaries: {0: <0.05, 1: <0.15, 2: <0.30, 3: <0.50, 4: ≥0.50}.
    Returns None if moveInfos has fewer than 2 entries or visits are
    missing."""
    mi = packet.get("moveInfos") or []
    if len(mi) < 2:
        return None
    try:
        visits = [int(m.get("visits", 0)) for m in mi[:5]]
    except (TypeError, ValueError):
        return None
    if visits[0] <= 0:
        return None
    total = sum(visits)
    if total <= 0:
        return None
    margin = (visits[0] - visits[1]) / total
    if margin < 0.05:
        return 0
    if margin < 0.15:
        return 1
    if margin < 0.30:
        return 2
    if margin < 0.50:
        return 3
    return 4


def extract_winrate_change_threshold_factory(delta: float = 0.05) -> Callable[[dict], int | None]:
    """Returns an extractor reporting which side of a `(reference - delta,
    reference + delta)` band the current winrate sits on, where the
    reference is the FIRST packet's winrate. Output: -1 (below band), 0
    (within band), +1 (above band).

    This is the meaningful replacement for `winrate_polarity`, which
    has degenerate label distribution because almost no position flips
    winrate polarity during search. Threshold-crossing variants
    capture the more common "winrate moved by ε" signal."""
    # We need state: the first packet's winrate per trajectory.
    # Implemented as a stateful per-realization extractor: the closure
    # remembers the reference winrate for the FIRST packet it sees.
    # Build a fresh extractor per realization via this factory.
    state: dict[str, float | None] = {"ref": None}

    def _ex(packet: dict) -> int | None:
        root = packet.get("rootInfo") or {}
        wr = root.get("winrate")
        if wr is None:
            return None
        wr = float(wr)
        if state["ref"] is None:
            state["ref"] = wr
            return 0  # by definition, within the band at the reference
        ref = state["ref"]
        if wr > ref + delta:
            return 1
        if wr < ref - delta:
            return -1
        return 0
    return _ex


def extract_top1_in_top3_factory(target_move: str) -> Callable[[dict], bool | None]:
    """Returns an extractor that asks 'is target_move in top-3 of this
    packet's moveInfos?' — used to check rank-tolerant stability of a
    specific target across the tail."""
    def _ex(packet: dict) -> bool | None:
        mi = packet.get("moveInfos") or []
        if not mi:
            return None
        moves = [m.get("move") for m in mi[: min(3, len(mi))]]
        if any(m is None for m in moves):
            return None
        # If target_move isn't in this packet's moveInfos AT ALL, we can't
        # be confident it's below rank 3 — could be below the truncation.
        # Return None (unknown) defensively.
        all_moves = [m.get("move") for m in mi]
        if target_move not in all_moves:
            return None
        return target_move in moves
    return _ex


EXTRACTORS: dict[str, Callable[[dict], Any]] = {
    "scoreLead_sign": extract_scoreLead_sign,
    "winrate_polarity": extract_winrate_polarity,        # degenerate label distribution; kept for diagnostics
    "winrate_quintile": extract_winrate_quintile,
    "search_agrees_with_policy": extract_search_agrees_with_policy,
    "top1_move": extract_top1_move,
    "top3_set": extract_top3_set,
    "top2_margin_quintile": extract_top2_margin_quintile,
    # winrate_change_threshold is stateful (per-realization closure) — instantiate via factory.
}


@dataclass
class StabilityTrajectory(Generic[Q]):
    """A trajectory over V (visit count) of some discrete quantity Q.
    Stored as a sorted list of change-points: (V_at_change, new_value).
    Supports any-V lookup in O(log K) and tail-stability-fraction in
    O(log K + neighbors_in_tail).

    The trajectory is gap-tolerant: V values may have None observations
    (extractor failed to read), which are recorded as change-points to
    `_UNKNOWN` and skipped in stability calculations.

    The parallel `_cp_Vs` list is built once at construction time and
    reused across `value_at` / `stable_fraction_from` calls so bisect
    doesn't have to re-materialize V projections on every lookup."""

    changepoints: list[tuple[float, Any]]  # (V, Q | _UNKNOWN_SENTINEL)
    V_max: float
    n_packets: int = 0  # informational; for diagnostics
    _cp_Vs: list[float] = field(default_factory=list, repr=False, compare=False)

    _UNKNOWN = object()  # singleton for "extractor returned None"

    def __post_init__(self) -> None:
        if not self._cp_Vs and self.changepoints:
            self._cp_Vs = [cp[0] for cp in self.changepoints]

    @classmethod
    def from_packet_stream(
        cls,
        packets: list[tuple[float, dict]],
        extract: Callable[[dict], Any],
    ) -> "StabilityTrajectory":
        """Build from a list of (V_at_packet, packet_dict) pairs.
        V is the rootInfo.visits at the time of the packet."""
        if not packets:
            return cls(changepoints=[], V_max=0.0, n_packets=0)
        cps: list[tuple[float, Any]] = []
        cp_Vs: list[float] = []
        last_val: Any = None
        for V, pkt in packets:
            val = extract(pkt)
            tagged = val if val is not None else cls._UNKNOWN
            if not cps or tagged != last_val:
                vf = float(V)
                cps.append((vf, tagged))
                cp_Vs.append(vf)
                last_val = tagged
        V_max = float(packets[-1][0])
        return cls(changepoints=cps, V_max=V_max, n_packets=len(packets), _cp_Vs=cp_Vs)

    @classmethod
    def from_changepoints(
        cls,
        changepoints: list[tuple[float, Any]],
        V_max: float,
        n_packets: int = 0,
    ) -> "StabilityTrajectory":
        """Build directly from a pre-collapsed change-point list. Used by
        callers that walk packets once across multiple extractors and
        accumulate per-extractor change-points inline (see
        allocator_sim_stability._compute_changepoint_streams)."""
        cp_Vs = [cp[0] for cp in changepoints]
        return cls(changepoints=changepoints, V_max=V_max, n_packets=n_packets, _cp_Vs=cp_Vs)

    @classmethod
    def from_dense_array(
        cls,
        V_grid: "Any",  # np.ndarray
        values: "Any",  # np.ndarray of shape (len(V_grid),)
        none_value: Any = -1,
    ) -> "StabilityTrajectory":
        """Build from a dense V-grid sampling. `values[i]` is the
        extracted quantity at `V_grid[i]`. `none_value` is the sentinel
        for 'extractor returned None at this grid point' (default -1
        matches the top1_realiz convention in trajectory_cache.npz)."""
        if len(V_grid) == 0:
            return cls(changepoints=[], V_max=0.0, n_packets=0)
        cps: list[tuple[float, Any]] = []
        cp_Vs: list[float] = []
        last_val: Any = None
        for V, v in zip(V_grid, values):
            tagged = cls._UNKNOWN if v == none_value else int(v)
            if not cps or tagged != last_val:
                vf = float(V)
                cps.append((vf, tagged))
                cp_Vs.append(vf)
                last_val = tagged
        V_max = float(V_grid[-1])
        return cls(changepoints=cps, V_max=V_max, n_packets=len(V_grid), _cp_Vs=cp_Vs)

    def value_at(self, V: float) -> Any:
        """Returns the quantity at V (last change-point with V_cp <= V),
        or _UNKNOWN if the trajectory is empty or V is before the first
        change-point."""
        if not self.changepoints:
            return self._UNKNOWN
        # Binary search for rightmost cp with V_cp <= V on the cached
        # parallel V list.
        idx = bisect.bisect_right(self._cp_Vs, V) - 1
        if idx < 0:
            return self._UNKNOWN
        return self.changepoints[idx][1]

    def stable_fraction_from(
        self, V_term: float, threshold: float = 0.97,
    ) -> tuple[float, bool]:
        """Returns (fraction_stable, is_stable).
        fraction_stable = sum-of-V-intervals where value == value_at(V_term),
                        / sum-of-V-intervals where value != _UNKNOWN.
        is_stable = fraction_stable >= threshold.

        Intervals span [V_term, V_max], LINEAR-V-weighted (so a brief flip
        contributes proportionally to its duration in V-space).
        Unknown intervals are dropped from both numerator and denominator.

        Returns (NaN, False) if the tail has no observable packets.

        NOTE: linear-V weighting makes late-V intervals dominate the label
        because the tail of a typical [V_term, V_max] interval carries most
        of the V-mass. For budget-fraction-invariant labels (so the same
        classifier transfers across deployment budgets), prefer
        `stable_fraction_logV` which weights by log-doublings instead."""
        target = self.value_at(V_term)
        if target is self._UNKNOWN:
            return float("nan"), False
        total_known = 0.0
        total_match = 0.0
        # Walk change-points in (V_term, V_max], computing interval lengths.
        # Start with the initial interval [V_term, next_cp_V_after_V_term].
        i = bisect.bisect_right(self._cp_Vs, V_term)
        prev_V = V_term
        prev_val = target  # value at V_term (we just computed it)
        while i < len(self.changepoints):
            V_cp, val_cp = self.changepoints[i]
            interval_len = V_cp - prev_V
            if interval_len > 0:
                if prev_val is not self._UNKNOWN:
                    total_known += interval_len
                    if prev_val == target:
                        total_match += interval_len
            prev_V = V_cp
            prev_val = val_cp
            i += 1
        # Final interval [last_cp_V, V_max]
        if self.V_max > prev_V:
            interval_len = self.V_max - prev_V
            if prev_val is not self._UNKNOWN:
                total_known += interval_len
                if prev_val == target:
                    total_match += interval_len
        if total_known <= 0:
            return float("nan"), False
        frac = total_match / total_known
        return frac, frac >= threshold

    def stable_fraction_logV(
        self,
        V_term: float,
        V_max: float | None = None,
        threshold: float = 0.97,
    ) -> tuple[float, bool]:
        """Budget-fraction-invariant analog of `stable_fraction_from`:
        interval weights are log-doublings (`log(V_cp / prev_V)`) instead
        of linear V differences. The label is then invariant to absolute
        budget rescaling — a classifier trained on labels computed under
        log-V weighting at V_max=15000 measures the same shape of
        "stability per log-doubling" that would apply at deployment
        V_max=200.

        `V_max` (optional): the upper bound of the window. Defaults to
        the trajectory's recorded V_max. Pass a smaller V_max to evaluate
        stability over a tighter post-V_term window (matches
        budget-fraction inference where the deployment budget is less
        than the recorded trajectory's ceiling).

        Both `V_term` and `V_max` must be > 0 since log(0) is undefined.

        Returns (NaN, False) if the tail has no observable packets or
        the window is degenerate (V_max <= V_term).
        """
        if V_max is None:
            V_max = self.V_max
        if V_term <= 0.0 or V_max <= V_term:
            return float("nan"), False
        target = self.value_at(V_term)
        if target is self._UNKNOWN:
            return float("nan"), False
        import math
        log_V_term = math.log(V_term)
        log_V_max = math.log(V_max)
        total_known = 0.0
        total_match = 0.0
        i = bisect.bisect_right(self._cp_Vs, V_term)
        prev_log_V = log_V_term
        prev_val = target
        while i < len(self.changepoints):
            V_cp, val_cp = self.changepoints[i]
            if V_cp >= V_max:
                break
            log_V_cp = math.log(V_cp)
            interval_len = log_V_cp - prev_log_V
            if interval_len > 0:
                if prev_val is not self._UNKNOWN:
                    total_known += interval_len
                    if prev_val == target:
                        total_match += interval_len
            prev_log_V = log_V_cp
            prev_val = val_cp
            i += 1
        # Final interval [last_cp_log_V, log_V_max]
        if log_V_max > prev_log_V:
            interval_len = log_V_max - prev_log_V
            if prev_val is not self._UNKNOWN:
                total_known += interval_len
                if prev_val == target:
                    total_match += interval_len
        if total_known <= 0:
            return float("nan"), False
        frac = total_match / total_known
        return frac, frac >= threshold

    def n_changepoints(self) -> int:
        """For diagnostics. Excludes the implicit final interval."""
        return len(self.changepoints)


__all__ = [
    "StabilityTrajectory", "EXTRACTORS",
    "extract_scoreLead_sign", "extract_winrate_polarity",
    "extract_winrate_quintile", "extract_search_agrees_with_policy",
    "extract_top1_move", "extract_top3_set",
    "extract_top1_in_top3_factory",
]
