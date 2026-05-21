"""
research/permutation_importance.py

Permutation feature importance on the +both feature set
(phase35 + ownership + advanced) for each of the 12 targets.

Method (within-fold permutation, no retraining):
  1. Compute OOF predictions on the full feature set → baseline R².
  2. For each feature column j: within each test fold, shuffle X[:, j]
     across the test rows, re-predict, accumulate.
  3. Importance(j) = baseline_R² − R²(with feature j permuted).

The shuffle preserves the marginal distribution of feature j but
breaks its association with y on the test set, so the R² drop
attributes the model's reliance on j. Cheaper than retraining for
each permuted feature; gives the same qualitative ranking.

Logs each feature's importance to tensorboard as it lands.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupKFold
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _signed_log1p,
)


TARGETS = [
    ("scoreLead_drift", "y_range"),
    ("scoreLead_drift", "y_at_V_max"),
    ("scoreLead_drift", "H_dlp_median"),
    ("L2_joint_drift", "y_range"),
    ("L2_joint_drift", "H_dlp_median"),
    ("winrate_drift", "y_range"),
    ("logit_winrate_drift", "y_range"),
    ("score_stdev_reduction", "y_range"),
    ("visit_entropy_reduction", "y_range"),
    ("visit_entropy_reduction", "dip_depth"),
    ("top_move_visit_fraction", "y_range"),
    ("top_move_visit_fraction", "dip_depth"),
]


def _r2(y, pred):
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum()) if len(y) else 0.0
    return 1.0 - ss_res / max(ss_tot, 1e-12)


def _cv_fit_predict(X, y, groups, n_folds, n_repeats: int = 3, seed: int = 0):
    """Train one model per fold; return per-fold (model, test_idx).
    Also returns the OOF baseline R²."""
    kf = GroupKFold(n_splits=n_folds)
    fold_info = []
    preds = np.zeros_like(y)
    for tr, te in kf.split(X, y, groups=groups):
        m = _LightGBMWrap()
        m.fit(X[tr], y[tr])
        preds[te] = m.predict(X[te])
        fold_info.append((m, te))
    return _r2(y, preds), preds, fold_info


def _permutation_drop(X, y, fold_info, col: int,
                       n_repeats: int, rng: np.random.Generator) -> float:
    """For each fold, permute column `col` on the test slice n_repeats
    times, average the predictions, recompute R² across all folds."""
    preds_acc = np.zeros_like(y)
    for model, te in fold_info:
        Xte = X[te].copy()
        avg = np.zeros(len(te))
        for _ in range(n_repeats):
            Xperm = Xte.copy()
            perm = rng.permutation(len(te))
            Xperm[:, col] = Xte[perm, col]
            avg += model.predict(Xperm)
        preds_acc[te] = avg / n_repeats
    return _r2(y, preds_acc)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--ownership-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "ownership_features.csv"), type=Path)
    ap.add_argument("--advanced-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "advanced_features.csv"), type=Path)
    ap.add_argument("--labels-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--tb-log-dir",
                    default=Path("/home/bork/w/vdc/tensorboard/permutation_importance"),
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "permutation_importance_summary.txt", type=Path)
    ap.add_argument("--out-csv",
                    default=Path.home() / "plots" /
                            "permutation_importance.csv", type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--n-repeats", default=3, type=int,
                    help="permutation repeats per feature per fold")
    ap.add_argument("--seed", default=42, type=int)
    args = ap.parse_args()

    run_tag = f"run_{int(time.time())}"
    tb_path = args.tb_log_dir / run_tag
    tb_path.mkdir(parents=True, exist_ok=True)
    print(f"  tensorboard log dir: {tb_path}", flush=True)
    writer = SummaryWriter(log_dir=str(tb_path), flush_secs=5)
    writer.add_scalar("progress/started", 1.0, 0)
    writer.flush()

    # ── Loading (parallel to regression_advanced_features) ────────────────
    print(f"=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X35 = corpus["X"]
    phase35_names = corpus["feature_names"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X35)}  phase35_dim={X35.shape[1]}", flush=True)

    print(f"\n=== loading ownership features ===", flush=True)
    own_by_pos = {}; counts = {}
    with args.ownership_csv.open() as f:
        rdr = csv.DictReader(f)
        own_cols = [c for c in rdr.fieldnames
                     if c not in ("stem", "turn", "realization")]
        for r in rdr:
            try:
                key = (r["stem"], int(r["turn"]))
                vec = np.array([float(r[c]) for c in own_cols])
                if key not in own_by_pos:
                    own_by_pos[key] = np.zeros_like(vec); counts[key] = 0
                own_by_pos[key] += vec; counts[key] += 1
            except (ValueError, KeyError):
                pass
    own_by_pos = {k: own_by_pos[k] / counts[k] for k in own_by_pos}
    print(f"  ownership: {len(own_by_pos)} positions × {len(own_cols)} feats",
          flush=True)

    print(f"\n=== loading advanced features ===", flush=True)
    adv_by_key = {}
    with args.advanced_csv.open() as f:
        rdr = csv.DictReader(f)
        adv_cols = [c for c in rdr.fieldnames
                     if c not in ("stem", "turn", "realization")]
        for r in rdr:
            try:
                key = (r["stem"], int(r["turn"]), int(r["realization"]))
                adv_by_key[key] = np.array([float(r[c] or "nan")
                                              for c in adv_cols])
            except (ValueError, KeyError):
                pass
    print(f"  advanced: {len(adv_by_key)} realizations × {len(adv_cols)} feats",
          flush=True)

    labels = {}
    with args.labels_csv.open() as f:
        for r in csv.DictReader(f):
            try:
                if r['status'] != 'clean':
                    continue
                key = (r["stem"], int(r["turn"]), r["target"])
                labels[key] = {col: float(r[col]) for col in
                                ['y_range', 'y_at_V_max', 'dip_depth',
                                 'slope_terminal', 'H_dlp_median',
                                 'log_kappa_dlp_median']
                                if r[col] not in ('', None)}
            except (ValueError, KeyError):
                pass

    X_own = np.zeros((len(X35), len(own_cols)))
    X_adv = np.full((len(X35), len(adv_cols)), np.nan)
    valid_own = np.ones(len(X35), dtype=bool)
    valid_adv = np.ones(len(X35), dtype=bool)
    for i, sid in enumerate(sample_ids):
        parts = sid.split(":")
        stem = parts[0]; turn = int(parts[1].lstrip("t"))
        ri = int(parts[2].lstrip("r")) if len(parts) > 2 else 0
        own = own_by_pos.get((stem, turn))
        if own is None:
            valid_own[i] = False
        else:
            X_own[i] = own
        adv = adv_by_key.get((stem, turn, ri))
        if adv is None or np.any(np.isnan(adv)):
            valid_adv[i] = False
        else:
            X_adv[i] = adv
    col_means = np.nanmean(X_adv, axis=0)
    X_adv = np.where(np.isnan(X_adv), col_means, X_adv)

    # ── Feature name registry ─────────────────────────────────────────────
    own_named = [f"own:{c}" for c in own_cols]
    adv_named = [f"adv:{c}" for c in adv_cols]
    phase35_named = [f"ph35:{c}" for c in phase35_names]
    all_names = phase35_named + own_named + adv_named
    print(f"\n  combined feature dim: {len(all_names)} "
          f"(phase35={len(phase35_named)} + own={len(own_named)} "
          f"+ adv={len(adv_named)})", flush=True)

    # ── Per-target permutation ────────────────────────────────────────────
    csv_path = args.out_csv
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    csv_f = csv_path.open("w", buffering=1)
    csv_w = csv.writer(csv_f)
    csv_w.writerow(["target", "column", "n", "baseline_r2",
                     "feature", "permuted_r2", "importance"])

    summary_lines = ["# permutation importance on phase35+ownership+advanced",
                      f"# tensorboard: {tb_path}",
                      f"# n_folds={args.n_folds}  n_repeats={args.n_repeats}",
                      ""]

    rng = np.random.default_rng(args.seed)

    for target_idx, (target, col) in enumerate(TARGETS):
        writer.add_scalar("progress/target_idx", target_idx, target_idx)
        writer.flush()

        y_all = np.full(len(X35), np.nan)
        ymask = np.zeros(len(X35), dtype=bool)
        for i, sid in enumerate(sample_ids):
            parts = sid.split(":")
            stem = parts[0]; turn = int(parts[1].lstrip("t"))
            ent = labels.get((stem, turn, target))
            if ent is None:
                continue
            v = ent.get(col)
            if v is None or not np.isfinite(v):
                continue
            y_all[i] = v; ymask[i] = True

        full_mask = ymask & valid_own & valid_adv
        n = int(full_mask.sum())
        if n < 100:
            summary_lines.append(
                f"  {target}|{col}  n={n}  (too few, skipped)")
            print(summary_lines[-1], flush=True)
            continue

        ym = y_all[full_mask]
        gm = groups[full_mask]
        log_y = _signed_log1p(ym)
        X_full = np.concatenate([X35[full_mask], X_own[full_mask],
                                 X_adv[full_mask]], axis=1)

        t0 = time.monotonic()
        baseline_r2, _preds, fold_info = _cv_fit_predict(
            X_full, log_y, gm, args.n_folds)
        writer.add_scalar(f"baseline_r2/{target}_{col}", baseline_r2,
                          target_idx)
        writer.flush()
        print(f"\n=== {target}|{col}  n={n}  baseline R²={baseline_r2:+.4f} "
              f"(fit {time.monotonic()-t0:.1f}s) ===", flush=True)

        importances: list[tuple[str, float, float]] = []  # (name, perm_r2, drop)
        for ci, fname in enumerate(all_names):
            r2_perm = _permutation_drop(X_full, log_y, fold_info, ci,
                                          args.n_repeats, rng)
            drop = baseline_r2 - r2_perm
            importances.append((fname, r2_perm, drop))
            writer.add_scalar(f"importance/{target}_{col}/{fname}",
                              drop, target_idx)
            csv_w.writerow([target, col, n, f"{baseline_r2:.6f}",
                            fname, f"{r2_perm:.6f}", f"{drop:.6f}"])

        # Per-target top-10 summary
        importances.sort(key=lambda t: -t[2])
        summary_lines.append(
            f"== {target} | {col}  n={n}  baseline R²={baseline_r2:+.4f} ==")
        summary_lines.append(f"  rank  {'feature':<30} {'R²_perm':>9} "
                              f"{'importance':>11}")
        for rk, (fname, r2_perm, drop) in enumerate(importances[:10], 1):
            line = (f"  #{rk:<3} {fname:<30} {r2_perm:>+9.4f} {drop:>+11.4f}")
            summary_lines.append(line)
            print(f"    " + line, flush=True)
        summary_lines.append("")

        writer.add_scalar("progress/targets_done", target_idx + 1,
                          target_idx + 1)
        writer.flush()

    csv_f.close()
    writer.close()
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(summary_lines) + "\n")
    print(f"\ntop-10 summary: {args.out_txt}", flush=True)
    print(f"full csv: {csv_path}", flush=True)


if __name__ == "__main__":
    main()
