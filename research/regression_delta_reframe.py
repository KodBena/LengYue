"""
research/regression_delta_reframe.py

Tier 1 from firewall consult #2: predict
`(y(V_target) - y(V_current)) / σ_position` at K=3 anchor `V_target`
values per `V_current`, instead of shape descriptors like H.

Per the firewall's concrete spec (turn 2, Q2):
  - Sampling: anchored V_current ∈ {V_floor, V_floor×4, V_floor×16},
    V_target log-uniform from [V_current×2, V_max].
  - Loss: MSE on per-position-normalized delta.
  - Labels: averaged across realizations; n_realizations as a feature.
  - Output: K=3 vector head at fixed V_target anchors per V_current.

Trains a multi-output LightGBM with one head per (V_current, V_target_anchor)
combination. Reports:
  - Within-corpus R² (year2k 5-fold GroupKFold)
  - OOD R² (year2k → cards.db)

Outputs:
  - ~/plots/regression_delta_reframe.txt (R² table)
  - tensorboard run under ~/w/vdc/tensorboard/regression_delta_reframe/

Substrate: trajectory_cache.npz (the bundled-fetch cache).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allocator_sim import build_feature_row  # noqa: E402
from regression import _LightGBMWrap  # noqa: E402


def r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if len(y_true) == 0:
        return float("nan")
    ss_res = float(((y_true - y_pred) ** 2).sum())
    ss_tot = float(((y_true - y_true.mean()) ** 2).sum())
    return 1.0 - ss_res / max(ss_tot, 1e-12)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_delta_reframe.txt",
                    type=Path)
    ap.add_argument("--tb-root",
                    default=Path.home() / "w" / "vdc" / "tensorboard" /
                            "regression_delta_reframe",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--V-floor", default=500.0, type=float)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== regression_delta_reframe: {args.target} ===", flush=True)
    print(f"  cache: {args.cache}", flush=True)
    print(f"  V_floor: {args.V_floor}", flush=True)
    print(flush=True)

    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}
    N_GRID = int(cache["N_GRID"][0])
    domains = np.array(cache["domains"], dtype=object)
    n_total = len(domains)
    n_y2k = (domains == "year2k").sum()
    n_cards = (domains == "cards").sum()
    print(f"  cache: {n_total} positions ({n_y2k} year2k, {n_cards} cards)",
          flush=True)
    print(flush=True)

    # Anchor V_current values
    V_currents = [args.V_floor, args.V_floor * 4.0, args.V_floor * 16.0]
    # For each V_current, V_target anchors at V_current × 4, × 16, V_max
    # Use K=3 V_targets per V_current as the firewall spec suggested.
    # We'll compute deltas at three fixed multipliers + V_max.

    rows: list[dict] = []
    print("  building (V_current, V_target) labels + features per position...",
          flush=True)
    t0 = time.monotonic()
    for i in range(n_total):
        V_lo = float(cache["V_lo"][i])
        V_hi = float(cache["V_hi"][i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        y_mean = cache[f"y_mean_{args.target}"][i]
        if not np.isfinite(y_mean).all():
            continue
        y_realiz = cache[f"y_realiz_{args.target}"][i]  # (R, N_GRID)
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        # σ_position: across-realization stdev of y at midrange (a stable point)
        mid_idx = N_GRID // 2
        valid_r = ~np.isnan(y_realiz[:, mid_idx])
        if valid_r.sum() < 2:
            sigma_pos = 1.0
        else:
            sigma_pos = float(np.std(y_realiz[valid_r, mid_idx], ddof=1))
        if sigma_pos < 1e-6:
            sigma_pos = 1e-6
        n_real_pos = int(cache["n_realizations"][i])
        for V_current in V_currents:
            if not (V_lo < V_current < V_hi):
                continue
            # Feature row at V_current
            feat_row = build_feature_row(
                cache["phase35"][i], V_grid, y_mean, V_cutoff=V_current,
            )
            if feat_row is None:
                continue
            # Append n_realizations as an additional feature (per firewall spec)
            feat_row = np.append(feat_row, [float(n_real_pos),
                                            np.log1p(n_real_pos)])
            y_at_current = float(np.interp(V_current, V_grid, y_mean))
            # K=3 V_target anchors: 4×, 16×V_current, or V_max
            V_targets = [
                min(V_current * 4.0, V_hi),
                min(V_current * 16.0, V_hi),
                V_hi,
            ]
            deltas = []
            for V_target in V_targets:
                if V_target <= V_current * 1.5:
                    deltas.append(np.nan)
                    continue
                y_at_target = float(np.interp(V_target, V_grid, y_mean))
                delta = (y_at_target - y_at_current) / sigma_pos
                deltas.append(delta)
            rows.append({
                "i_pos": i,
                "V_current": V_current,
                "feat": feat_row,
                "deltas": deltas,
                "domain": cache["domains"][i],
                "sigma_pos": sigma_pos,
            })
    print(f"  built {len(rows)} (position, V_current) feature rows in {time.monotonic()-t0:.1f}s",
          flush=True)

    # Set up tensorboard
    try:
        from torch.utils.tensorboard import SummaryWriter  # type: ignore
        args.tb_root.parent.mkdir(parents=True, exist_ok=True)
        tb = SummaryWriter(str(args.tb_root))
    except Exception as e:
        print(f"  tensorboard not available ({e}), continuing without",
              flush=True)
        tb = None

    out_lines: list[str] = []
    out_lines.append("# regression_delta_reframe — per-V_current, K=3 V_target anchors")
    out_lines.append(f"# target: {args.target}  V_floor: {args.V_floor}")
    out_lines.append("# delta normalized by per-position σ; label averaged across realizations")
    out_lines.append("")
    header = (
        f"  {'V_current':>10} {'V_target':>10} {'n_total':>8} "
        f"{'n_y2k':>7} {'n_cards':>7}  "
        f"{'within_R2':>10} {'OOD_R2':>9} {'OOD/within':>11}"
    )
    print(header, flush=True)
    out_lines.append(header)

    for vci, V_current in enumerate(V_currents):
        # Collect rows for this V_current
        rows_vc = [r for r in rows if r["V_current"] == V_current]
        if not rows_vc:
            continue
        for vti in range(3):  # K=3 V_target anchors
            X = []
            y = []
            g = []
            domains_row = []
            for r in rows_vc:
                d = r["deltas"][vti]
                if not np.isfinite(d):
                    continue
                X.append(r["feat"])
                y.append(d)
                g.append(r["i_pos"])
                domains_row.append(r["domain"])
            X = np.array(X)
            y = np.array(y)
            g = np.array(g)
            domains_row = np.array(domains_row)
            if len(X) < 20:
                continue
            y2k_mask = domains_row == "year2k"
            cards_mask = domains_row == "cards"
            n_y2k_v = int(y2k_mask.sum())
            n_cards_v = int(cards_mask.sum())
            if n_y2k_v < 4 * args.n_folds:
                continue
            # Within-corpus 5-fold GroupKFold on year2k
            X_y2k = X[y2k_mask]
            y_y2k = y[y2k_mask]
            g_y2k = g[y2k_mask]
            kf = GroupKFold(n_splits=args.n_folds)
            preds = np.zeros_like(y_y2k)
            for tr, te in kf.split(X_y2k, y_y2k, groups=g_y2k):
                m = _LightGBMWrap()
                m.fit(X_y2k[tr], y_y2k[tr])
                preds[te] = m.predict(X_y2k[te])
            r2_within = r2_score(y_y2k, preds)
            # OOD: train on year2k, predict on cards
            r2_ood = float("nan")
            if n_cards_v >= 5:
                m = _LightGBMWrap()
                m.fit(X_y2k, y_y2k)
                preds_ood = m.predict(X[cards_mask])
                r2_ood = r2_score(y[cards_mask], preds_ood)
            ratio = r2_ood / r2_within if r2_within > 0 else float("nan")
            v_target_label = f"V_c×{[4,16,'max'][vti]}"
            line = (
                f"  {V_current:>10.0f} {v_target_label:>10} "
                f"{len(X):>8} {n_y2k_v:>7} {n_cards_v:>7}  "
                f"{r2_within:>+10.4f} {r2_ood:>+9.4f} {ratio:>+11.4f}"
            )
            print(line, flush=True)
            out_lines.append(line)
            if tb is not None:
                tb.add_scalar(f"R2_within/V_current_{int(V_current)}", r2_within, vti)
                tb.add_scalar(f"R2_OOD/V_current_{int(V_current)}", r2_ood, vti)

    if tb is not None:
        tb.flush()
        tb.close()

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(out_lines) + "\n")
    print(flush=True)
    print(f"  written: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
