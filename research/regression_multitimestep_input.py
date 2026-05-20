"""
research/regression_multitimestep_input.py

Multi-timestep INPUT features experiment: extract trajectory
features over V-windows V≤500, V≤2000, V≤V_max for each position
and target, concat with the phase35 features (which come from
V_pre), and regress against (H, κ) labels.

The hypothesis: knowing the early trajectory shape (V_pre → V=500)
gives the model a much stronger basis for predicting the full
trajectory than the V_pre snapshot alone.

This is operationally interesting: the visit-allocation problem
could be re-cast as "do 500 quick visits, then decide whether to
keep going" if the V=500-window features predict the full-search
result well enough.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_trajectory_features import (  # noqa: E402
    extract_trajectory_features, FIELDS as _FIELDS,
)
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_realizations, realization_as_flat_arrays,
)
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _KNNWrap, _RidgeWrap,
    _cv_r2_grouped, _signed_log1p,
)


# Index-based windows (fractions of the V-grid). Agnostic to KataGo's
# non-deterministic reportDuringSearchEvery — works regardless of the
# specific visit counts in the trajectory. Per the 2026-05-21 user
# observation that V-anchored features are non-robust.
WINDOW_FRACTIONS = [
    ("first_third", 1.0 / 3.0),
    ("first_two_thirds", 2.0 / 3.0),
    ("full", 1.0),
]
TRAJ_COLS = [
    "y_at_V_max", "y_min", "y_max", "y_range",
    "dip_depth", "rise_after_dip",
    "log_V_at_y_min", "log_V_at_y_max",
    "monotonicity_frac", "sign_changes",
    "slope_terminal", "slope_early", "slope_midrange",
]


def _window_features(V: np.ndarray, y: np.ndarray, fraction: float):
    """Compute trajectory features on the first `fraction` of the
    V-grid (by index). Robust to non-deterministic V reporting because
    it uses position in the grid rather than absolute visit counts."""
    n = len(V)
    cutoff = max(4, int(round(n * fraction)))
    if cutoff < 4:
        return None
    V_w = V[:cutoff]
    y_w = y[:cutoff]
    feats = extract_trajectory_features(V_w, y_w)
    if feats.get("status") != "clean":
        return None
    return feats


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_multitimestep_input.txt",
                    type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    print(f"=== loading base corpus (phase35 features at V_pre) ===",
          flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  base corpus: n={len(X)}  features={len(feature_names)}  "
          f"groups={len(set(groups))}", flush=True)

    # For each sample, derive (stem, turn) for trajectory lookup
    sample_pos: list[tuple[str, int]] = []
    for s in sample_ids:
        parts = s.split(":")
        sample_pos.append((parts[0], int(parts[1].lstrip("t"))))

    # Compute multi-timestep features per (stem, turn, target, window).
    # Cache per (stem, turn) to avoid reloading Postgres data per sample.
    window_names = [name for name, _ in WINDOW_FRACTIONS]
    print(f"\n=== extracting trajectory features at "
          f"index windows {window_names} ===", flush=True)
    cache_per_position: dict[tuple[str, int], dict] = {}
    conn = connect()
    unique_positions = sorted(set(sample_pos))
    import time
    t0 = time.monotonic()
    for i, (stem, turn) in enumerate(unique_positions):
        real_idxs = list_realizations(conn, stem, turn)
        if not real_idxs:
            continue
        realizations = []
        for ri in real_idxs:
            arrs = realization_as_flat_arrays(conn, stem, turn, ri)
            if arrs is not None:
                realizations.append(arrs)
        if len(realizations) < 2:
            continue
        per_target: dict[str, dict] = {}
        for tname, value_fn in VALUE_CANDIDATES.items():
            avg = averaged_trajectory_for_target(realizations, value_fn)
            if avg is None:
                per_target[tname] = None
                continue
            V_g, y_g = avg
            V_g = V_g.astype(np.float64)
            y_g = y_g.astype(np.float64)
            entries = {}
            for name, frac in WINDOW_FRACTIONS:
                entries[name] = _window_features(V_g, y_g, frac)
            per_target[tname] = entries
        cache_per_position[(stem, turn)] = per_target

        if (i + 1) % 25 == 0 or i + 1 == len(unique_positions):
            dt = time.monotonic() - t0
            rate = (i + 1) / max(dt, 1e-9)
            eta = (len(unique_positions) - (i + 1)) / max(rate, 1e-9)
            print(f"  [{i+1}/{len(unique_positions)}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s", flush=True)
    conn.close()
    print(f"  trajectory cache: {len(cache_per_position)} positions", flush=True)

    # Build augmented X for each (target × window)
    # Per-sample: X_phase35 + traj_features(first_third of target's traj)
    # + traj_features(first_two_thirds) + traj_features(full).
    # For each (target, family, param) label, run regression.
    triples = sorted(per_label.keys())
    targets = sorted({k[0] for k in triples})

    print(f"\n=== running augmented regression for {len(triples)} triples "
          f"× 4 augmentation modes (baseline + 3 index-based windows) ===",
          flush=True)

    lines: list[str] = []
    lines.append(f"# multi-timestep INPUT features experiment")
    lines.append(f"# augmentations: phase35 only (baseline), "
                 f"+ first_third traj feats, + first_two_thirds, + full")
    lines.append(f"# windows are INDEX-based (fraction of V-grid points) — "
                 f"robust to KataGo's non-deterministic V reporting.")
    lines.append("")
    header = (
        f"  {'target':<28} {'fam':<14} {'param':<10} {'n':>4}  "
        f"{'base_knn':>9} {'base_ridge':>10} {'base_lgbm':>10}  "
        f"{'1/3_lgbm':>10} {'2/3_lgbm':>10} {'full_lgbm':>10}"
    )
    print(header, flush=True)
    lines.append(header)

    for (t, fam, pn) in triples:
        labels = per_label[(t, fam, pn)]
        vals = labels[:, 0]
        mask_clean = labels[:, 1] == 1.0
        if mask_clean.sum() < 4 * args.n_folds:
            continue

        # Build the 4 X variants
        def _aug_row(i: int, window_key: str | None) -> np.ndarray | None:
            if window_key is None:
                return X[i]
            stem, turn = sample_pos[i]
            entries = cache_per_position.get((stem, turn), {}).get(t)
            if not entries:
                return None
            feats = entries.get(window_key)
            if feats is None:
                return None
            extra = []
            for col in TRAJ_COLS:
                v = feats.get(col)
                if v is None or not np.isfinite(v):
                    return None
                extra.append(float(v))
            return np.concatenate([X[i], np.array(extra)])

        def _run_one(window_key: str | None) -> tuple:
            X_aug = []
            y_aug = []
            g_aug = []
            for i in np.where(mask_clean)[0]:
                row = _aug_row(int(i), window_key)
                if row is None:
                    continue
                X_aug.append(row)
                y_aug.append(vals[i])
                g_aug.append(groups[i])
            if len(X_aug) < 4 * args.n_folds:
                return float("nan"), float("nan"), float("nan"), 0
            X_arr = np.array(X_aug)
            y_arr = _signed_log1p(np.array(y_aug))
            g_arr = np.array(g_aug)
            r2_knn, _ = _cv_r2_grouped(X_arr, y_arr, g_arr, _KNNWrap, args.n_folds)
            r2_ridge, _ = _cv_r2_grouped(X_arr, y_arr, g_arr, _RidgeWrap, args.n_folds)
            r2_lgbm, _ = _cv_r2_grouped(X_arr, y_arr, g_arr, _LightGBMWrap, args.n_folds)
            return r2_knn, r2_ridge, r2_lgbm, len(X_aug)

        base = _run_one(None)
        w_one_third = _run_one("first_third")
        w_two_thirds = _run_one("first_two_thirds")
        w_full = _run_one("full")

        line = (
            f"  {t:<28} {fam:<14} {pn:<10} {base[3]:>4}  "
            f"{base[0]:>+9.4f} {base[1]:>+10.4f} {base[2]:>+10.4f}  "
            f"{w_one_third[2]:>+10.4f} {w_two_thirds[2]:>+10.4f} {w_full[2]:>+10.4f}"
        )
        print(line, flush=True)
        lines.append(line)

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
