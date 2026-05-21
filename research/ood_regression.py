"""
research/ood_regression.py

Tier-0 firewall recommendation from
research/notes/firewall-strategic-2026-05-21.md.

Train the multi-timestep regression head on year2000 pro positions,
evaluate held-out on cards.db positions (the OOD test). Also reports
a noise-floor tiebreaker: train on year2000 minus a random
N-position holdout, evaluate on the holdout — gives a reference for
"what R² wobble does this sample size produce when distribution is
held constant?"

Pre-committed decision rules (from the firewall consult §5 Tier 0):

  OOD/within ratio ≥ 0.5  → architecture shippable
  OOD/within ratio 0.2..0.5 → partial transfer, phase-3 will refine
  OOD/within ratio < 0.2  → architecture doesn't transfer

The script regenerates labels in-memory from Postgres rather than
reading a stale summary_averaged.csv (which is pro-only from 2026-05-20
and would miss the cards.db data that has landed since).

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
from curve_families import FAMILIES  # noqa: E402
from extract_trajectory_features import (  # noqa: E402
    extract_trajectory_features,
)
from feature_extraction import extract_features as extract_phase35  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)
from regression import _LightGBMWrap, _signed_log1p  # noqa: E402


CARDS_PREFIXES = ("card_", "vol_card_", "ctl_card_")


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
    n = len(V)
    cutoff = max(4, int(round(n * fraction)))
    if cutoff < 4:
        return None
    feats = extract_trajectory_features(V[:cutoff], y[:cutoff])
    if feats.get("status") != "clean":
        return None
    return feats


def is_cards_stem(stem: str) -> bool:
    return any(stem.startswith(p) for p in CARDS_PREFIXES)


def load_one_position(conn, stem: str, turn: int) -> dict | None:
    """For one (stem, turn): pull all realizations, compute averaged
    trajectory per target, fit hyperbolic to get labels, extract
    phase35 features from r0, extract multi-timestep window features.

    Returns dict with keys:
      stem, turn, n_real, domain ("year2k" or "cards"),
      phase35 (dict),
      labels: {target: {"H": float, "kappa": float, "clean": bool}},
      windows: {target: {window_name: traj_features_dict | None}},
    Returns None if the position has no usable data.
    """
    real_idxs = list_realizations(conn, stem, turn)
    if not real_idxs:
        return None
    arrs_list = []
    for ri in real_idxs:
        arrs = realization_as_flat_arrays(conn, stem, turn, ri)
        if arrs is not None:
            arrs_list.append(arrs)
    if len(arrs_list) < 2:
        return None

    # Phase35 features from r0
    try:
        phase35 = extract_phase35(stem, turn, realization=real_idxs[0], conn=conn)
    except Exception:
        return None

    fam = FAMILIES["hyperbolic"]
    labels: dict[str, dict] = {}
    windows: dict[str, dict] = {}
    for tname, value_fn in VALUE_CANDIDATES.items():
        avg = averaged_trajectory_for_target(arrs_list, value_fn)
        if avg is None:
            labels[tname] = {"H": float("nan"), "kappa": float("nan"), "clean": False}
            windows[tname] = {name: None for name, _ in WINDOW_FRACTIONS}
            continue
        V_g, y_g = avg
        V_g = V_g.astype(np.float64)
        y_g = y_g.astype(np.float64)
        # Label
        fit = fam.fit(V_g, y_g)
        H = float(fit.params.get("H", float("nan")))
        kappa = float(fit.params.get("kappa", float("nan")))
        labels[tname] = {"H": H, "kappa": kappa, "clean": fit.status == "clean"}
        # Multi-timestep window features
        windows[tname] = {
            name: _window_features(V_g, y_g, frac)
            for name, frac in WINDOW_FRACTIONS
        }

    return {
        "stem": stem,
        "turn": turn,
        "n_real": len(arrs_list),
        "domain": "cards" if is_cards_stem(stem) else "year2k",
        "phase35": phase35,
        "labels": labels,
        "windows": windows,
    }


def build_design_matrix(
    positions: list[dict],
    target: str,
    window_name: str | None,
    phase35_names: list[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """For a given (target, window_name) configuration, build (X, y, clean_mask, groups).
    window_name=None → phase35 features only (baseline).
    """
    X_rows = []
    y_rows = []
    clean_rows = []
    group_rows = []
    for i, pos in enumerate(positions):
        base = [pos["phase35"].get(k, np.nan) for k in phase35_names]
        if window_name is not None:
            feats = pos["windows"].get(target, {}).get(window_name)
            if feats is None:
                continue
            extra = []
            ok = True
            for col in TRAJ_COLS:
                v = feats.get(col)
                if v is None or not np.isfinite(v):
                    ok = False
                    break
                extra.append(float(v))
            if not ok:
                continue
            row = base + extra
        else:
            row = base
        if not all(np.isfinite(r) for r in row):
            continue
        label = pos["labels"].get(target, {})
        H = label.get("H", float("nan"))
        clean = bool(label.get("clean", False))
        X_rows.append(row)
        y_rows.append(H)
        clean_rows.append(clean)
        group_rows.append(i)
    return (
        np.asarray(X_rows, dtype=np.float64),
        np.asarray(y_rows, dtype=np.float64),
        np.asarray(clean_rows, dtype=bool),
        np.asarray(group_rows, dtype=np.int64),
    )


def r2_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(((y_true - y_pred) ** 2).sum())
    ss_tot = float(((y_true - y_true.mean()) ** 2).sum())
    return 1.0 - ss_res / max(ss_tot, 1e-12)


def cv_r2_grouped(X, y, groups, n_folds=5) -> float:
    kf = GroupKFold(n_splits=n_folds)
    preds = np.zeros_like(y)
    for tr, te in kf.split(X, y, groups=groups):
        m = _LightGBMWrap()
        m.fit(X[tr], y[tr])
        preds[te] = m.predict(X[te])
    return r2_score(y, preds)


def train_predict(X_train, y_train, X_eval) -> np.ndarray:
    m = _LightGBMWrap()
    m.fit(X_train, y_train)
    return m.predict(X_eval)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "ood_regression.txt",
                    type=Path)
    ap.add_argument("--target", default="scoreLead_drift",
                    help="Drift target to regress on (default: scoreLead_drift, "
                         "the firewall's recommended OOD test target)")
    ap.add_argument("--all-targets", action="store_true",
                    help="Also run on the other 3 drift targets")
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--n-tiebreaker-runs", default=5, type=int,
                    help="Number of random year2k holdouts for the noise-floor "
                         "reference (averaged for stability)")
    ap.add_argument("--seed", default=20260521, type=int)
    args = ap.parse_args()

    print("=== year2000 → cards.db OOD R² test (firewall Tier 0) ===",
          flush=True)
    print(f"  output: {args.out_txt}", flush=True)
    print(f"  primary target: {args.target}", flush=True)
    print(f"  all targets: {args.all_targets}", flush=True)
    print(f"  CV folds: {args.n_folds}", flush=True)
    print(f"  tiebreaker runs: {args.n_tiebreaker_runs}", flush=True)
    print(f"  seed: {args.seed}", flush=True)
    print(flush=True)

    conn = connect()
    all_positions = list_positions(conn)
    n_total = len(all_positions)
    n_cards = sum(1 for s, _ in all_positions if is_cards_stem(s))
    n_year2k = n_total - n_cards
    print(f"  Postgres: {n_total} positions total "
          f"({n_year2k} year2k pro, {n_cards} cards.db)", flush=True)
    print(flush=True)

    print("=== loading all positions (phase35 + labels + windows) ===",
          flush=True)
    positions: list[dict] = []
    t0 = time.monotonic()
    for i, (stem, turn) in enumerate(all_positions):
        rec = load_one_position(conn, stem, turn)
        if rec is not None:
            positions.append(rec)
        if (i + 1) % 50 == 0 or i + 1 == n_total:
            dt = time.monotonic() - t0
            rate = (i + 1) / max(dt, 1e-9)
            eta = (n_total - (i + 1)) / max(rate, 1e-9)
            print(f"  [{i+1}/{n_total}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s  "
                  f"loaded {len(positions)} positions", flush=True)
    conn.close()
    print(f"  loaded {len(positions)} positions in {time.monotonic()-t0:.0f}s",
          flush=True)

    year2k = [p for p in positions if p["domain"] == "year2k"]
    cards = [p for p in positions if p["domain"] == "cards"]
    print(f"  year2k subset: {len(year2k)}, cards subset: {len(cards)}",
          flush=True)
    print(flush=True)

    phase35_names = sorted(year2k[0]["phase35"].keys()) if year2k else []
    print(f"  phase35 feature count: {len(phase35_names)}", flush=True)
    print(flush=True)

    targets_to_run = [args.target]
    if args.all_targets:
        targets_to_run = ["scoreLead_drift", "winrate_drift",
                          "visit_entropy_reduction", "L2_joint_drift"]

    rng = np.random.default_rng(args.seed)

    lines: list[str] = []
    lines.append("# year2000 → cards.db OOD R² test")
    lines.append(f"# n_year2k={len(year2k)}  n_cards={len(cards)}")
    lines.append(f"# label: hyperbolic.H ∈ signed_log1p, "
                 f"regressor: LightGBM (same hyperparams as multi-timestep run)")
    lines.append("")
    header = (
        f"  {'target':<26} {'window':<18} "
        f"{'n_y2k':>6} {'n_cards':>8} {'n_holdout':>10}  "
        f"{'within_R2':>10} {'OOD_R2':>9} {'NF_R2':>9} {'NF_std':>8} "
        f"{'OOD/within':>11}"
    )
    print(header, flush=True)
    lines.append(header)
    print("  " + "-" * (len(header) - 2), flush=True)
    lines.append("  " + "-" * (len(header) - 2))

    for target in targets_to_run:
        for window_name in [None, "first_third", "first_two_thirds", "full"]:
            wlabel = window_name if window_name is not None else "baseline_phase35"

            # year2k design matrix
            Xy, yy, cy, gy = build_design_matrix(
                year2k, target, window_name, phase35_names,
            )
            mask_y = cy & np.isfinite(yy)
            if mask_y.sum() < 4 * args.n_folds:
                line = f"  {target:<26} {wlabel:<18} (year2k: only {mask_y.sum()} clean — skipped)"
                print(line, flush=True)
                lines.append(line)
                continue
            Xy_c = Xy[mask_y]
            yy_c = _signed_log1p(yy[mask_y])
            gy_c = gy[mask_y]

            # cards design matrix
            Xc, yc, cc, gc = build_design_matrix(
                cards, target, window_name, phase35_names,
            )
            mask_c = cc & np.isfinite(yc)
            Xc_c = Xc[mask_c]
            yc_c = _signed_log1p(yc[mask_c]) if mask_c.sum() > 0 else np.array([])

            # Within-corpus R² on year2k
            r2_within = cv_r2_grouped(Xy_c, yy_c, gy_c, n_folds=args.n_folds)

            # OOD R²: train on all year2k, predict on cards
            if mask_c.sum() >= 5:
                preds_ood = train_predict(Xy_c, yy_c, Xc_c)
                r2_ood = r2_score(yc_c, preds_ood)
            else:
                r2_ood = float("nan")

            # Noise-floor: hold out N=n_cards positions from year2k at random,
            # train on the rest, predict on holdout. Average over multiple runs.
            n_holdout = min(mask_c.sum(), len(year2k) // 4)
            nf_r2s = []
            if n_holdout >= 5:
                pos_ids = np.arange(len(year2k))
                for run in range(args.n_tiebreaker_runs):
                    holdout_pos = set(rng.choice(pos_ids, size=n_holdout, replace=False).tolist())
                    train_mask = np.array([g not in holdout_pos for g in gy_c])
                    eval_mask = np.array([g in holdout_pos for g in gy_c])
                    if eval_mask.sum() < 5 or train_mask.sum() < 4 * args.n_folds:
                        continue
                    preds = train_predict(Xy_c[train_mask], yy_c[train_mask], Xy_c[eval_mask])
                    nf_r2s.append(r2_score(yy_c[eval_mask], preds))
            nf_r2_mean = float(np.mean(nf_r2s)) if nf_r2s else float("nan")
            nf_r2_std = float(np.std(nf_r2s)) if len(nf_r2s) > 1 else float("nan")

            ratio = r2_ood / r2_within if (r2_within > 0 and np.isfinite(r2_ood)) else float("nan")

            line = (
                f"  {target:<26} {wlabel:<18} "
                f"{len(yy_c):>6} {mask_c.sum():>8} {n_holdout:>10}  "
                f"{r2_within:>+10.4f} {r2_ood:>+9.4f} {nf_r2_mean:>+9.4f} "
                f"{nf_r2_std:>8.4f} {ratio:>+11.4f}"
            )
            print(line, flush=True)
            lines.append(line)

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(flush=True)
    print(f"  results written to: {args.out_txt}", flush=True)

    # Decision summary for the primary (target, 2/3 window) cell — the
    # firewall's recommended decision anchor.
    print(flush=True)
    print("=== firewall decision rules (primary target × 2/3 window) ===",
          flush=True)
    print("    OOD/within ≥ 0.5: architecture shippable",
          flush=True)
    print("    OOD/within 0.2..0.5: partial transfer",
          flush=True)
    print("    OOD/within < 0.2: architecture doesn't transfer",
          flush=True)


if __name__ == "__main__":
    main()
