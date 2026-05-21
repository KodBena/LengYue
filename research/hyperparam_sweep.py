"""
research/hyperparam_sweep.py

LightGBM hyperparameter sweep on the best (target, window_frac)
configuration: scoreLead_drift × window_floor_frac=1/3 (the
firewall's anchor cell). Logs to tensorboard.

The within-corpus R² is reported per configuration; OOD R² is also
computed against cards.db. Goal: find a (num_leaves, min_data,
lambda_l2, learning_rate) setting that improves OOD R² over the
default _LightGBMWrap.

Substrate: trajectory_cache.npz (the bundled-fetch cache).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import itertools
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allocator_sim import build_feature_row  # noqa: E402
from regression import _signed_log1p  # noqa: E402


def r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if len(y_true) == 0:
        return float("nan")
    ss_res = float(((y_true - y_pred) ** 2).sum())
    ss_tot = float(((y_true - y_true.mean()) ** 2).sum())
    return 1.0 - ss_res / max(ss_tot, 1e-12)


def build_design_matrix(
    cache: dict, target: str, window_frac: float, domain_filter: str | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build (X, y_signed_log1p, groups) for all positions with the
    given target's hyperbolic-H label clean."""
    n = len(cache["stems"])
    domains = np.array(cache["domains"], dtype=object)
    H = cache[f"H_{target}"]
    clean = cache[f"clean_{target}"]
    keep = clean & np.isfinite(H)
    if domain_filter is not None:
        keep = keep & (domains == domain_filter)
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
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
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cache[f"y_mean_{target}"][i]
        if not np.isfinite(y_mean).all():
            continue
        row = build_feature_row(
            cache["phase35"][i], V_grid, y_mean, window_frac=window_frac,
        )
        if row is None:
            continue
        X_rows.append(row)
        y_rows.append(H[i])
        g_rows.append(i)
    X = np.array(X_rows, dtype=np.float64)
    y = _signed_log1p(np.array(y_rows, dtype=np.float64))
    return X, y, np.array(g_rows, dtype=np.int64)


def train_predict(X_train, y_train, X_eval, hp: dict) -> np.ndarray:
    import lightgbm as lgb
    m = lgb.LGBMRegressor(
        n_estimators=hp.get("n_estimators", 200),
        num_leaves=hp.get("num_leaves", 15),
        min_data_in_leaf=hp.get("min_data", 5),
        learning_rate=hp.get("learning_rate", 0.05),
        reg_lambda=hp.get("lambda_l2", 0.1),
        verbose=-1,
    )
    m.fit(X_train, y_train)
    return m.predict(X_eval)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "hyperparam_sweep.txt",
                    type=Path)
    ap.add_argument("--tb-root",
                    default=Path.home() / "w" / "vdc" / "tensorboard" /
                            "hyperparam_sweep",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift")
    ap.add_argument("--window-frac", default=1.0/3.0, type=float)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== hyperparam_sweep: {args.target} window={args.window_frac:.3f} ===",
          flush=True)

    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}

    print("  building design matrices...", flush=True)
    X_y2k, y_y2k, g_y2k = build_design_matrix(
        cache, args.target, args.window_frac, domain_filter="year2k",
    )
    X_cards, y_cards, _ = build_design_matrix(
        cache, args.target, args.window_frac, domain_filter="cards",
    )
    print(f"  year2k: {len(X_y2k)} samples, feature_dim={X_y2k.shape[1] if len(X_y2k) else 'NA'}",
          flush=True)
    print(f"  cards:  {len(X_cards)} samples", flush=True)

    # Sweep grid
    grid = list(itertools.product(
        [8, 15, 31, 63],          # num_leaves
        [3, 5, 10],               # min_data_in_leaf
        [0.01, 0.05, 0.1],        # learning_rate
        [0.0, 0.1, 1.0],          # lambda_l2
    ))
    print(f"  sweep size: {len(grid)} configs", flush=True)

    try:
        from torch.utils.tensorboard import SummaryWriter  # type: ignore
        args.tb_root.mkdir(parents=True, exist_ok=True)
        tb = SummaryWriter(str(args.tb_root))
    except Exception as e:
        print(f"  tensorboard unavailable ({e}); continuing without", flush=True)
        tb = None

    out_lines: list[str] = []
    out_lines.append(f"# hyperparam_sweep: {args.target} window={args.window_frac:.3f}")
    out_lines.append(f"# year2k_n={len(X_y2k)} cards_n={len(X_cards)} folds={args.n_folds}")
    header = (
        f"  {'idx':>4} {'leaves':>7} {'min_data':>9} {'lr':>6} {'lambda':>8}  "
        f"{'within_R2':>10} {'OOD_R2':>9} {'OOD/within':>11}"
    )
    print(header, flush=True)
    out_lines.append(header)

    best = {"within": -1e9, "ood": -1e9, "ratio": -1e9}
    t0 = time.monotonic()
    for idx, (leaves, mdt, lr, lam) in enumerate(grid):
        hp = {
            "num_leaves": leaves,
            "min_data": mdt,
            "learning_rate": lr,
            "lambda_l2": lam,
            "n_estimators": 200,
        }
        # within-corpus CV
        kf = GroupKFold(n_splits=args.n_folds)
        preds = np.zeros_like(y_y2k)
        for tr, te in kf.split(X_y2k, y_y2k, groups=g_y2k):
            preds[te] = train_predict(X_y2k[tr], y_y2k[tr], X_y2k[te], hp)
        r2_within = r2_score(y_y2k, preds)
        # OOD: train on full year2k, predict on cards
        if len(X_cards) >= 5:
            preds_ood = train_predict(X_y2k, y_y2k, X_cards, hp)
            r2_ood = r2_score(y_cards, preds_ood)
        else:
            r2_ood = float("nan")
        ratio = r2_ood / r2_within if r2_within > 0 and np.isfinite(r2_ood) else float("nan")
        line = (
            f"  {idx:>4} {leaves:>7} {mdt:>9} {lr:>6.3f} {lam:>8.3f}  "
            f"{r2_within:>+10.4f} {r2_ood:>+9.4f} {ratio:>+11.4f}"
        )
        print(line, flush=True)
        out_lines.append(line)
        if r2_ood > best["ood"]:
            best = {
                "within": r2_within, "ood": r2_ood, "ratio": ratio,
                "config": hp, "idx": idx,
            }
        if tb is not None:
            tb.add_scalar("R2_within", r2_within, idx)
            tb.add_scalar("R2_OOD", r2_ood, idx)
            tb.add_scalars("R2_within_vs_OOD", {"within": r2_within, "ood": r2_ood}, idx)
        if (idx + 1) % 10 == 0:
            dt = time.monotonic() - t0
            rate = (idx + 1) / max(dt, 1e-9)
            eta = (len(grid) - (idx + 1)) / max(rate, 1e-9)
            print(f"  ... [{idx+1}/{len(grid)}] {rate:.1f} configs/s  "
                  f"elapsed {dt:.0f}s eta {eta:.0f}s", flush=True)

    out_lines.append("")
    out_lines.append(f"# best OOD config: idx={best['idx']} "
                     f"within={best['within']:+.4f} OOD={best['ood']:+.4f}")
    out_lines.append(f"#   {best.get('config')}")

    if tb is not None:
        tb.flush()
        tb.close()

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(out_lines) + "\n")
    print(f"\n  best OOD: idx={best['idx']}, "
          f"within={best['within']:+.4f}, OOD={best['ood']:+.4f}", flush=True)
    print(f"  config: {best.get('config')}", flush=True)
    print(f"  written: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
