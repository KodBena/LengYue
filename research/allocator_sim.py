"""
research/allocator_sim.py

End-to-end allocator simulation. Tests whether the multi-timestep
hyperbolic-H regression head, when wired into a visit-allocation
policy, produces decisions that match the "always V_max" baseline at
substantially lower average visit budget.

Tier-0 follow-up from firewall consult #3
(`research/notes/firewall-strategic-2026-05-21.md`):

  >  "the regression head is a means, not an end. The end is 'the
  >  SPA allocator spends visits where they buy decision quality.'"

Two policies:
  * binary: spend V_floor visits, query predictor; predicted remaining
    gain < τ → terminate at V_floor; else spend V_max.
  * 3-stage: V_floor → 4·V_floor → V_max with two τ thresholds.

Metric: top-1 move agreement vs the modal-top-1-across-realizations
at V_max (the "what KataGo actually recommends" reference). Plotted
against avg visits spent → Pareto curve.

Substrate: `trajectory_cache.npz` (produced by cache_trajectories.py).

Plots → ~/plots/allocator_pareto/{binary,3stage}.png plus a combined
overlay. Summary stats → ~/plots/allocator_pareto/summary.txt.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_trajectory_features import (  # noqa: E402
    extract_trajectory_features,
)
from regression import _LightGBMWrap, _signed_log1p  # noqa: E402


TRAJ_COLS = [
    "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
]


def trajectory_features_up_to(V_grid: np.ndarray, y: np.ndarray, V_cutoff: float) -> dict | None:
    """Extract trajectory features over the V <= V_cutoff prefix."""
    mask = V_grid <= V_cutoff
    if mask.sum() < 4:
        return None
    feats = extract_trajectory_features(V_grid[mask], y[mask])
    if feats.get("status") != "clean":
        return None
    return feats


def build_feature_row(
    phase35_row: np.ndarray,
    V_grid: np.ndarray,
    y_mean: np.ndarray,
    V_cutoff: float | None,
    advanced_row: np.ndarray | None = None,
) -> np.ndarray | None:
    """Concatenate phase35 + (optionally) trajectory features over V <= V_cutoff
    + (optionally) advanced multi-timestep ownership/policy features.
    Returns None if features are not extractable."""
    base = list(phase35_row)
    if any(not np.isfinite(v) for v in base):
        return None
    if V_cutoff is None:
        row = np.array(base, dtype=np.float64)
    else:
        feats = trajectory_features_up_to(V_grid, y_mean, V_cutoff)
        if feats is None:
            return None
        extra = []
        for col in TRAJ_COLS:
            v = feats.get(col)
            if v is None or not np.isfinite(v):
                return None
            extra.append(float(v))
        row = np.array(base + extra, dtype=np.float64)
    if advanced_row is not None:
        # LightGBM handles NaN natively (treats as missing). Don't reject
        # rows because of incomplete advanced features — that would drop
        # positions whose KataGo packets lacked policy data at V_pre.
        row = np.concatenate([row, advanced_row])
    return row


def load_advanced_features(
    csv_path: Path, stems: np.ndarray, turns: np.ndarray,
) -> tuple[np.ndarray, list[str]] | None:
    """Load advanced multi-timestep CSV produced by
    extract_advanced_multitimestep.py and align rows to the
    (stems, turns) order. Returns (matrix, feature_names) or None
    if the CSV is missing or empty.
    """
    if not csv_path.exists():
        return None
    import csv as _csv
    by_key: dict[tuple[str, int], dict[str, float]] = {}
    with csv_path.open() as f:
        reader = _csv.DictReader(f)
        names = [c for c in reader.fieldnames if c not in ("stem", "turn")]
        for row in reader:
            try:
                k = (row["stem"], int(row["turn"]))
            except (KeyError, ValueError):
                continue
            vals = {}
            for c in names:
                v = row.get(c, "")
                try:
                    vals[c] = float(v) if v != "" else np.nan
                except ValueError:
                    vals[c] = np.nan
            by_key[k] = vals
    if not by_key:
        return None
    n = len(stems)
    F = len(names)
    out = np.full((n, F), np.nan, dtype=np.float64)
    for i in range(n):
        key = (str(stems[i]), int(turns[i]))
        d = by_key.get(key)
        if d is None:
            continue
        for j, c in enumerate(names):
            out[i, j] = d.get(c, np.nan)
    return out, names


def find_v_index(V_grid: np.ndarray, V_target: float) -> int:
    """Index of V_grid closest to V_target (from below)."""
    idx = np.searchsorted(V_grid, V_target, side="right") - 1
    return int(np.clip(idx, 0, len(V_grid) - 1))


def modal_top1_at_v_max(top1_realiz: np.ndarray) -> int:
    """top1_realiz: (R, n_grid). Returns the modal top-1 move at the
    final V-grid index across realizations. Returns -1 if undefined."""
    last_col = top1_realiz[:, -1]
    valid = last_col[last_col >= 0]
    if valid.size == 0:
        return -1
    counter = Counter(valid.tolist())
    return counter.most_common(1)[0][0]


def simulate_binary(
    predictor,
    feature_names_baseline: list[str],
    cards_data: dict,
    V_floor: float,
    tau_grid: np.ndarray,
    target: str,
    advanced_matrix: np.ndarray | None = None,
) -> dict:
    """For each τ, simulate binary allocator on each cards position:
    - At V_floor, build feature row using trajectory[:V_floor]
    - Predict H (in signed_log1p space)
    - Estimate remaining gain = predicted_H_log - signed_log1p(y_at_V_floor)
    - If remaining_gain < τ, terminate at V_floor. Else V_max.
    - Measure top-1 agreement: top1_at_V_term == modal_top1_at_V_max
    Returns avg_visits, agreement_rate per τ.
    """
    n_pos = len(cards_data["stems"])
    avg_visits = np.zeros(len(tau_grid))
    agreement = np.zeros(len(tau_grid))
    decision_terminate = np.zeros(len(tau_grid))
    for ti, tau in enumerate(tau_grid):
        total_visits = 0.0
        total_agree = 0.0
        total_count = 0
        n_terminate = 0
        for i in range(n_pos):
            V_lo = float(cards_data["V_lo"][i])
            V_hi = float(cards_data["V_hi"][i])
            if not (V_lo < V_floor < V_hi):
                continue
            V_grid = np.geomspace(V_lo, V_hi, cards_data["N_GRID"])
            y_mean = cards_data[f"y_mean_{target}"][i]
            if not np.isfinite(y_mean).all():
                continue
            top1_realiz = cards_data["top1_realiz"][i]
            modal_v_max = modal_top1_at_v_max(top1_realiz)
            if modal_v_max < 0:
                continue
            # Feature row at V_floor (trajectory observed up to V_floor)
            adv_row = advanced_matrix[i] if advanced_matrix is not None else None
            row = build_feature_row(
                cards_data["phase35"][i], V_grid, y_mean, V_cutoff=V_floor,
                advanced_row=adv_row,
            )
            if row is None:
                continue
            log_H_pred = float(predictor.predict(row[None, :])[0])
            y_at_floor = float(np.interp(V_floor, V_grid, y_mean))
            y_at_floor_log = float(_signed_log1p(np.array([y_at_floor]))[0])
            remaining_gain_log = log_H_pred - y_at_floor_log
            if remaining_gain_log < tau:
                V_term = V_floor
                terminate = True
            else:
                V_term = V_hi  # full search
                terminate = False
            if terminate:
                n_terminate += 1
            v_idx = find_v_index(V_grid, V_term)
            # Per-realization agreement at V_term
            agree_count = 0
            real_count = 0
            for r in range(top1_realiz.shape[0]):
                t1 = int(top1_realiz[r, v_idx])
                if t1 < 0:
                    continue
                if t1 == modal_v_max:
                    agree_count += 1
                real_count += 1
            if real_count == 0:
                continue
            total_visits += V_term
            total_agree += agree_count / real_count
            total_count += 1
        if total_count > 0:
            avg_visits[ti] = total_visits / total_count
            agreement[ti] = total_agree / total_count
            decision_terminate[ti] = n_terminate / total_count
    return {
        "tau": tau_grid,
        "avg_visits": avg_visits,
        "agreement": agreement,
        "terminate_frac": decision_terminate,
    }


def simulate_3stage(
    predictor,
    cards_data: dict,
    V_floor: float,
    V_mid_mult: float,
    tau1_grid: np.ndarray,
    tau2_grid: np.ndarray,
    target: str,
    advanced_matrix: np.ndarray | None = None,
) -> dict:
    """3-stage allocator: V_floor → V_mid → V_max with two thresholds.
    Returns a 2D grid over (tau1, tau2)."""
    n_pos = len(cards_data["stems"])
    V_mid_target = V_floor * V_mid_mult
    avg_visits = np.zeros((len(tau1_grid), len(tau2_grid)))
    agreement = np.zeros((len(tau1_grid), len(tau2_grid)))
    counts = np.zeros((len(tau1_grid), len(tau2_grid)), dtype=np.int64)

    # Pre-compute per-position state for speed
    pos_state = []
    for i in range(n_pos):
        V_lo = float(cards_data["V_lo"][i])
        V_hi = float(cards_data["V_hi"][i])
        if not (V_lo < V_floor < V_mid_target < V_hi):
            continue
        V_grid = np.geomspace(V_lo, V_hi, cards_data["N_GRID"])
        y_mean = cards_data[f"y_mean_{target}"][i]
        if not np.isfinite(y_mean).all():
            continue
        top1_realiz = cards_data["top1_realiz"][i]
        modal_v_max = modal_top1_at_v_max(top1_realiz)
        if modal_v_max < 0:
            continue
        adv_row = advanced_matrix[i] if advanced_matrix is not None else None
        row_floor = build_feature_row(
            cards_data["phase35"][i], V_grid, y_mean, V_cutoff=V_floor,
            advanced_row=adv_row,
        )
        row_mid = build_feature_row(
            cards_data["phase35"][i], V_grid, y_mean, V_cutoff=V_mid_target,
            advanced_row=adv_row,
        )
        if row_floor is None or row_mid is None:
            continue
        log_H_pred_floor = float(predictor.predict(row_floor[None, :])[0])
        log_H_pred_mid = float(predictor.predict(row_mid[None, :])[0])
        y_at_floor = float(np.interp(V_floor, V_grid, y_mean))
        y_at_mid = float(np.interp(V_mid_target, V_grid, y_mean))
        y_floor_log = float(_signed_log1p(np.array([y_at_floor]))[0])
        y_mid_log = float(_signed_log1p(np.array([y_at_mid]))[0])
        gain1 = log_H_pred_floor - y_floor_log
        gain2 = log_H_pred_mid - y_mid_log
        floor_idx = find_v_index(V_grid, V_floor)
        mid_idx = find_v_index(V_grid, V_mid_target)
        max_idx = len(V_grid) - 1
        # Per-V-stage top-1 agreement vectors
        agree_floor = 0
        agree_mid = 0
        agree_max = 0
        real_count = 0
        for r in range(top1_realiz.shape[0]):
            t1_f = int(top1_realiz[r, floor_idx])
            t1_m = int(top1_realiz[r, mid_idx])
            t1_x = int(top1_realiz[r, max_idx])
            if t1_f < 0 or t1_m < 0 or t1_x < 0:
                continue
            if t1_f == modal_v_max:
                agree_floor += 1
            if t1_m == modal_v_max:
                agree_mid += 1
            if t1_x == modal_v_max:
                agree_max += 1
            real_count += 1
        if real_count == 0:
            continue
        pos_state.append({
            "gain1": gain1, "gain2": gain2,
            "V_floor": V_floor, "V_mid": V_mid_target, "V_max": V_hi,
            "ag_floor": agree_floor / real_count,
            "ag_mid": agree_mid / real_count,
            "ag_max": agree_max / real_count,
        })

    # Now sweep (tau1, tau2)
    for a, tau1 in enumerate(tau1_grid):
        for b, tau2 in enumerate(tau2_grid):
            tv = 0.0
            ta = 0.0
            tc = 0
            for ps in pos_state:
                if ps["gain1"] < tau1:
                    v_term = ps["V_floor"]
                    ag = ps["ag_floor"]
                elif ps["gain2"] < tau2:
                    v_term = ps["V_mid"]
                    ag = ps["ag_mid"]
                else:
                    v_term = ps["V_max"]
                    ag = ps["ag_max"]
                tv += v_term
                ta += ag
                tc += 1
            if tc > 0:
                avg_visits[a, b] = tv / tc
                agreement[a, b] = ta / tc
                counts[a, b] = tc
    return {
        "tau1": tau1_grid,
        "tau2": tau2_grid,
        "avg_visits": avg_visits,
        "agreement": agreement,
        "counts": counts,
    }


def baseline_always_vmax_agreement(cards_data: dict, target: str) -> dict:
    """Always-V_max policy: spend V_max on every position. Computes
    avg agreement (the realization-noise ceiling)."""
    n_pos = len(cards_data["stems"])
    visits_total = 0.0
    agree_total = 0.0
    count = 0
    for i in range(n_pos):
        V_hi = float(cards_data["V_hi"][i])
        if not np.isfinite(V_hi) or V_hi <= 0:
            continue
        top1_realiz = cards_data["top1_realiz"][i]
        modal_v_max = modal_top1_at_v_max(top1_realiz)
        if modal_v_max < 0:
            continue
        max_idx = top1_realiz.shape[1] - 1
        agree_count = 0
        real_count = 0
        for r in range(top1_realiz.shape[0]):
            t1 = int(top1_realiz[r, max_idx])
            if t1 < 0:
                continue
            if t1 == modal_v_max:
                agree_count += 1
            real_count += 1
        if real_count == 0:
            continue
        visits_total += V_hi
        agree_total += agree_count / real_count
        count += 1
    return {
        "avg_visits": visits_total / max(count, 1),
        "agreement": agree_total / max(count, 1),
        "n": count,
    }


def train_predictor(
    cache: dict, target: str, V_anchor: float | None,
    advanced_matrix: np.ndarray | None = None,
) -> tuple[object, dict]:
    """Train a LightGBM head on year2k data, with features being
    phase35 + (optionally) trajectory features over V <= V_anchor
    + (optionally) advanced multi-timestep ownership/policy features.
    Label is signed_log1p(H_target).

    Returns (fitted_predictor, info_dict).
    """
    n = len(cache["stems"])
    domains = np.array(cache["domains"], dtype=object)
    y2k_mask = domains == "year2k"
    H = cache[f"H_{target}"]
    clean = cache[f"clean_{target}"]
    keep = y2k_mask & clean & np.isfinite(H)
    X_rows = []
    y_rows = []
    g_rows = []
    for i in range(n):
        if not keep[i]:
            continue
        V_lo = float(cache["V_lo"][i])
        V_hi = float(cache["V_hi"][i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        V_grid = np.geomspace(V_lo, V_hi, cache["N_GRID"])
        y_mean = cache[f"y_mean_{target}"][i]
        if not np.isfinite(y_mean).all():
            continue
        adv_row = advanced_matrix[i] if advanced_matrix is not None else None
        row = build_feature_row(
            cache["phase35"][i], V_grid, y_mean, V_cutoff=V_anchor,
            advanced_row=adv_row,
        )
        if row is None:
            continue
        X_rows.append(row)
        y_rows.append(H[i])
        g_rows.append(i)
    X = np.array(X_rows, dtype=np.float64)
    y = _signed_log1p(np.array(y_rows, dtype=np.float64))
    print(f"  trained on {len(X)} year2k positions, "
          f"feature dim={X.shape[1] if len(X) else 'NA'}", flush=True)
    if len(X) < 10:
        raise SystemExit(f"insufficient year2k training data for {target}")
    predictor = _LightGBMWrap()
    predictor.fit(X, y)
    return predictor, {"n_train": len(X), "feature_dim": X.shape[1]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "allocator_pareto",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--V-floor", default=500.0, type=float,
                    help="The smallest budget the allocator considers (visits)")
    ap.add_argument("--V-mid-mult", default=4.0, type=float,
                    help="3-stage middle budget = V_floor × this")
    ap.add_argument("--n-tau", default=25, type=int,
                    help="number of τ values to sweep")
    ap.add_argument("--advanced-csv", type=Path, default=None,
                    help="path to advanced_multitimestep.csv; when provided, "
                         "advanced ownership+policy features are merged into "
                         "the predictor and sim. Output filenames will be "
                         "suffixed with '_enriched'.")
    args = ap.parse_args()
    suffix = "_enriched" if args.advanced_csv else ""

    print(f"=== allocator simulation: target={args.target} V_floor={args.V_floor} ===",
          flush=True)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"  loading cache: {args.cache}", flush=True)
    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}
    n_y2k = (np.array(cache["domains"]) == "year2k").sum()
    n_cards = (np.array(cache["domains"]) == "cards").sum()
    print(f"  cache: {n_y2k} year2k + {n_cards} cards", flush=True)

    # Sub-corpus dicts
    domains = np.array(cache["domains"], dtype=object)
    cards_idx = np.where(domains == "cards")[0]

    def slice_cache(idx):
        out = {}
        for k, v in cache.items():
            v = np.asarray(v)
            if v.ndim > 0 and v.shape[0] == len(domains):
                out[k] = v[idx]
            else:
                out[k] = v
        out["N_GRID"] = int(cache["N_GRID"][0])
        return out

    cards_data = slice_cache(cards_idx)

    # ---- Load advanced features if requested ----
    advanced_matrix = None
    advanced_cards = None
    advanced_names = []
    if args.advanced_csv is not None:
        result = load_advanced_features(args.advanced_csv, cache["stems"], cache["turns"])
        if result is not None:
            advanced_matrix, advanced_names = result
            cards_stems = cards_data["stems"]
            cards_turns = cards_data["turns"]
            cards_result = load_advanced_features(args.advanced_csv, cards_stems, cards_turns)
            if cards_result is not None:
                advanced_cards = cards_result[0]
            print(f"  loaded advanced features: {len(advanced_names)} columns",
                  flush=True)
        else:
            print(f"  WARN: --advanced-csv was given but CSV produced no rows", flush=True)

    # ---- Train predictor with V_floor-window features ----
    print(f"\n--- training predictor with V<=V_floor features"
          f"{' + advanced' if advanced_matrix is not None else ''} ---",
          flush=True)
    predictor_floor, info_floor = train_predictor(
        cache, args.target, V_anchor=args.V_floor,
        advanced_matrix=advanced_matrix,
    )

    # Train second predictor with V<=V_mid features for 3-stage
    V_mid = args.V_floor * args.V_mid_mult
    print(f"\n--- training predictor with V<=V_mid={V_mid} features"
          f"{' + advanced' if advanced_matrix is not None else ''} ---",
          flush=True)
    predictor_mid, info_mid = train_predictor(
        cache, args.target, V_anchor=V_mid,
        advanced_matrix=advanced_matrix,
    )

    # Baseline
    bl = baseline_always_vmax_agreement(cards_data, args.target)
    print(f"\n--- baseline (always V_max) ---", flush=True)
    print(f"  avg_visits={bl['avg_visits']:.0f}  agreement={bl['agreement']:.4f}  "
          f"n_positions={bl['n']}", flush=True)

    # τ grid: based on observed gain distribution. Use a wide range
    # around 0 in signed_log1p space — typical Hs are O(1) in log space.
    tau_grid = np.linspace(-2.0, 4.0, args.n_tau)

    # ---- Binary sim ----
    print(f"\n--- binary policy simulation ({len(tau_grid)} τ values) ---",
          flush=True)
    t0 = time.monotonic()
    binary_res = simulate_binary(
        predictor_floor, cache["phase35_names"], cards_data,
        args.V_floor, tau_grid, args.target,
        advanced_matrix=advanced_cards,
    )
    print(f"  binary done in {time.monotonic()-t0:.1f}s", flush=True)
    print(f"  tau range: {tau_grid[0]:.2f}..{tau_grid[-1]:.2f}", flush=True)
    print(f"  visits range: {binary_res['avg_visits'].min():.0f}..{binary_res['avg_visits'].max():.0f}",
          flush=True)
    print(f"  agreement range: {binary_res['agreement'].min():.4f}..{binary_res['agreement'].max():.4f}",
          flush=True)

    # ---- 3-stage sim ----
    print(f"\n--- 3-stage policy simulation ---", flush=True)
    tau1_grid = np.linspace(-2.0, 4.0, 12)
    tau2_grid = np.linspace(-2.0, 4.0, 12)
    t0 = time.monotonic()
    # Use the V_mid predictor for the 3-stage simulation (both gains)
    stage3_res = simulate_3stage(
        predictor_mid, cards_data,
        args.V_floor, args.V_mid_mult, tau1_grid, tau2_grid, args.target,
        advanced_matrix=advanced_cards,
    )
    print(f"  3-stage done in {time.monotonic()-t0:.1f}s", flush=True)
    print(f"  visits range: {stage3_res['avg_visits'].min():.0f}..{stage3_res['avg_visits'].max():.0f}",
          flush=True)
    print(f"  agreement range: {stage3_res['agreement'].min():.4f}..{stage3_res['agreement'].max():.4f}",
          flush=True)

    # ---- Save numeric summary ----
    summary_path = args.out_dir / f"summary_{args.target}{suffix}.txt"
    with summary_path.open("w") as f:
        f.write(f"# allocator simulation summary: {args.target}\n")
        f.write(f"# V_floor={args.V_floor}  V_mid={V_mid}\n\n")
        f.write(f"# baseline (always V_max)\n")
        f.write(f"  avg_visits = {bl['avg_visits']:.0f}\n")
        f.write(f"  agreement  = {bl['agreement']:.4f}\n")
        f.write(f"  n_positions = {bl['n']}\n\n")
        f.write(f"# binary policy (V_floor → V_max)\n")
        f.write(f"  {'tau':>8} {'visits':>10} {'agree':>9} {'term%':>7}\n")
        for ti in range(len(tau_grid)):
            f.write(f"  {tau_grid[ti]:>+8.3f} "
                    f"{binary_res['avg_visits'][ti]:>10.0f} "
                    f"{binary_res['agreement'][ti]:>+9.4f} "
                    f"{binary_res['terminate_frac'][ti]:>7.2%}\n")
        f.write(f"\n# 3-stage policy (V_floor → V_mid → V_max)\n")
        f.write(f"  {'tau1':>8} {'tau2':>8} {'visits':>10} {'agree':>9}\n")
        for a, tau1 in enumerate(tau1_grid):
            for b, tau2 in enumerate(tau2_grid):
                f.write(f"  {tau1:>+8.3f} {tau2:>+8.3f} "
                        f"{stage3_res['avg_visits'][a, b]:>10.0f} "
                        f"{stage3_res['agreement'][a, b]:>+9.4f}\n")
    print(f"\n  summary: {summary_path}", flush=True)

    # ---- Pareto plot: binary ----
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(binary_res["avg_visits"], binary_res["agreement"],
            marker="o", linestyle="-", color="tab:blue",
            label="binary allocator (V_floor → V_max)")
    ax.scatter([bl["avg_visits"]], [bl["agreement"]],
               color="black", s=80, marker="*",
               label="baseline (always V_max)")
    ax.set_xlabel("avg visits spent per position")
    ax.set_ylabel("top-1 agreement vs modal-top-1 at V_max")
    ax.set_title(f"Binary allocator — {args.target}\n"
                 f"OOD: year2k-trained → cards.db evaluated")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(args.out_dir / f"binary_{args.target}{suffix}.png", dpi=120)
    plt.close(fig)
    print(f"  plot: {args.out_dir / f'binary_{args.target}{suffix}.png'}", flush=True)

    # ---- 3-stage: project to Pareto front ----
    flat_visits = stage3_res["avg_visits"].flatten()
    flat_agree = stage3_res["agreement"].flatten()
    mask = flat_visits > 0
    flat_visits = flat_visits[mask]
    flat_agree = flat_agree[mask]

    # Compute Pareto front: for each unique avg_visits, keep max agreement
    sort_idx = np.argsort(flat_visits)
    sorted_visits = flat_visits[sort_idx]
    sorted_agree = flat_agree[sort_idx]
    pareto_visits = []
    pareto_agree = []
    best_so_far = -np.inf
    # Scan from low-visits to high; track running-max agreement
    for v, a in zip(sorted_visits, sorted_agree):
        if a > best_so_far:
            pareto_visits.append(v)
            pareto_agree.append(a)
            best_so_far = a

    fig, ax = plt.subplots(figsize=(7, 5))
    ax.scatter(flat_visits, flat_agree, alpha=0.3, s=15,
               color="tab:orange", label="3-stage (all τ1,τ2)")
    ax.plot(pareto_visits, pareto_agree, color="tab:red", marker="x",
            label="3-stage Pareto front")
    ax.plot(binary_res["avg_visits"], binary_res["agreement"],
            marker="o", linestyle="-", color="tab:blue", alpha=0.6,
            label="binary allocator")
    ax.scatter([bl["avg_visits"]], [bl["agreement"]],
               color="black", s=80, marker="*",
               label="baseline (always V_max)")
    ax.set_xlabel("avg visits spent per position")
    ax.set_ylabel("top-1 agreement vs modal-top-1 at V_max")
    ax.set_title(f"3-stage allocator — {args.target}\n"
                 f"OOD: year2k-trained → cards.db evaluated")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(args.out_dir / f"3stage_{args.target}{suffix}.png", dpi=120)
    plt.close(fig)
    print(f"  plot: {args.out_dir / f'3stage_{args.target}{suffix}.png'}", flush=True)

    # ---- Combined overlay ----
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.plot(binary_res["avg_visits"], binary_res["agreement"],
            marker="o", linestyle="-", color="tab:blue",
            label="binary allocator")
    ax.plot(pareto_visits, pareto_agree, marker="x", linestyle="-",
            color="tab:red", label="3-stage Pareto front")
    ax.scatter([bl["avg_visits"]], [bl["agreement"]],
               color="black", s=80, marker="*",
               label="baseline (always V_max)")
    ax.set_xlabel("avg visits spent per position")
    ax.set_ylabel("top-1 agreement vs modal-top-1 at V_max")
    ax.set_title(f"Allocator Pareto comparison — {args.target}\n"
                 f"OOD: year2k-trained → cards.db evaluated")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(args.out_dir / f"combined_{args.target}{suffix}.png", dpi=120)
    plt.close(fig)
    print(f"  plot: {args.out_dir / f'combined_{args.target}{suffix}.png'}", flush=True)


if __name__ == "__main__":
    main()
