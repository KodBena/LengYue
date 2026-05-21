"""
research/regression_per_mode.py

Tests whether the 3 discovered volatility modes (fast-tactical /
reading-paradox / clean-monotone) carry signal that the global
regression head fails to exploit.

Three comparison variants per (target, column):
  1. global         — single head on phase35 + ownership + advanced
  2. global+mode    — same features plus 3-dim mode one-hot
  3. per-mode       — three heads, each trained only on its own mode's
                       samples; per-mode OOF predictions combined and
                       compared back to (1) on the same support.

Interpretation:
  (2) > (1): mode info is useful but the LGBM couldn't derive it from
            raw features — adding mode as a free input helps.
  (3) > (2): modes require partitioning, not just feature augmentation
            — the underlying signal relationships differ across modes.

Logs everything to tensorboard incrementally so progress is visible.

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
from classify_volatility_mode import _build_mode_assignments, MODE_NAMES  # noqa: E402


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


def _cv_oof(X, y, groups, n_folds):
    """OOF predictions via GroupKFold + LGBM."""
    kf = GroupKFold(n_splits=n_folds)
    preds = np.zeros_like(y)
    for tr, te in kf.split(X, y, groups=groups):
        m = _LightGBMWrap()
        m.fit(X[tr], y[tr])
        preds[te] = m.predict(X[te])
    return preds


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
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path,
                    help="trajectory features csv for mode assignment")
    ap.add_argument("--tb-log-dir",
                    default=Path("/home/bork/w/vdc/tensorboard/regression_per_mode"),
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_per_mode_summary.txt", type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()

    run_tag = f"run_{int(time.time())}"
    tb_path = args.tb_log_dir / run_tag
    tb_path.mkdir(parents=True, exist_ok=True)
    print(f"  tensorboard log dir: {tb_path}", flush=True)
    writer = SummaryWriter(log_dir=str(tb_path), flush_secs=5)
    writer.add_scalar("progress/started", 1.0, 0)
    writer.flush()

    # ── Loading ────────────────────────────────────────────────────────────
    print(f"=== loading mode assignments (K=3) ===", flush=True)
    mode_by_pos = _build_mode_assignments(args.features_csv)
    print(f"  {len(mode_by_pos)} positions with mode", flush=True)

    print(f"\n=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X35 = corpus["X"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X35)}", flush=True)

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

    # ── Per-sample feature & mode arrays ───────────────────────────────────
    X_own = np.zeros((len(X35), len(own_cols)))
    X_adv = np.full((len(X35), len(adv_cols)), np.nan)
    mode_id = np.full(len(X35), -1, dtype=np.int64)
    valid_own = np.ones(len(X35), dtype=bool)
    valid_adv = np.ones(len(X35), dtype=bool)
    valid_mode = np.zeros(len(X35), dtype=bool)
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
        m = mode_by_pos.get((stem, turn))
        if m is not None:
            mode_id[i] = m
            valid_mode[i] = True
    col_means = np.nanmean(X_adv, axis=0)
    X_adv = np.where(np.isnan(X_adv), col_means, X_adv)

    # One-hot mode features
    X_mode_onehot = np.zeros((len(X35), 3))
    for i in range(len(X35)):
        if mode_id[i] >= 0:
            X_mode_onehot[i, mode_id[i]] = 1.0

    print(f"\n  mode coverage: {valid_mode.sum()}/{len(X35)} samples",
          flush=True)
    for m in range(3):
        n_m = int(((mode_id == m) & valid_own & valid_adv).sum())
        print(f"    mode {m} ({MODE_NAMES[m]}): {n_m}", flush=True)

    # ── Run comparison ─────────────────────────────────────────────────────
    header = (f"  {'target':<28} {'column':<20} {'n':>4}  "
              f"{'global':>9} {'+mode_oh':>9} {'per_mode':>9}  "
              f"{'pm[0]':>7} {'pm[1]':>7} {'pm[2]':>7}")
    print("\n" + header, flush=True)
    lines = ["# per-mode regression heads vs global head",
             f"# corpus n={len(X35)}; mode coverage={valid_mode.sum()}",
             f"# tensorboard: {tb_path}",
             "",
             header]

    overall_idx = 0
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

        full_mask = ymask & valid_own & valid_adv & valid_mode
        n = int(full_mask.sum())
        if n < 100:
            line = f"  {target:<28} {col:<20} {n:>4}  (too few)"
            print(line, flush=True)
            lines.append(line)
            continue

        ym = y_all[full_mask]
        gm = groups[full_mask]
        log_y = _signed_log1p(ym)
        modes_m = mode_id[full_mask]
        X_both = np.concatenate([X35[full_mask], X_own[full_mask],
                                 X_adv[full_mask]], axis=1)
        X_both_mode = np.concatenate([X_both, X_mode_onehot[full_mask]],
                                     axis=1)

        # (1) global
        pred_global = _cv_oof(X_both, log_y, gm, args.n_folds)
        r2_global = _r2(log_y, pred_global)
        writer.add_scalar(f"r2/{target}_{col}/global", r2_global, target_idx)

        # (2) global + mode one-hot
        pred_global_mode = _cv_oof(X_both_mode, log_y, gm, args.n_folds)
        r2_global_mode = _r2(log_y, pred_global_mode)
        writer.add_scalar(f"r2/{target}_{col}/global_plus_mode_oh",
                          r2_global_mode, target_idx)

        # (3) per-mode: combined OOF across all 3 specialized heads
        pred_per_mode = np.zeros_like(log_y)
        per_mode_r2: dict[int, float] = {}
        per_mode_n: dict[int, int] = {}
        skipped: list[int] = []
        for m in range(3):
            mm = modes_m == m
            n_m = int(mm.sum())
            per_mode_n[m] = n_m
            if n_m < 50:
                per_mode_r2[m] = float("nan")
                pred_per_mode[mm] = log_y[mm].mean() if n_m else 0.0
                skipped.append(m)
                continue
            n_groups_m = len(set(gm[mm].tolist()))
            n_folds_m = min(args.n_folds, max(2, n_groups_m))
            try:
                p_m = _cv_oof(X_both[mm], log_y[mm], gm[mm], n_folds_m)
            except Exception as e:
                p_m = np.full(n_m, log_y[mm].mean())
                skipped.append(m)
                print(f"    mode {m} CV failed ({e}); using mean",
                      flush=True)
            pred_per_mode[mm] = p_m
            per_mode_r2[m] = _r2(log_y[mm], p_m)
            writer.add_scalar(f"r2/{target}_{col}/pm_{m}",
                              per_mode_r2[m], target_idx)

        r2_per_mode = _r2(log_y, pred_per_mode)
        writer.add_scalar(f"r2/{target}_{col}/per_mode_combined",
                          r2_per_mode, target_idx)
        writer.add_scalar(f"delta/{target}_{col}/per_mode_minus_global",
                          r2_per_mode - r2_global, target_idx)
        writer.add_scalar(f"delta/{target}_{col}/mode_oh_minus_global",
                          r2_global_mode - r2_global, target_idx)
        overall_idx += 1
        writer.add_scalar("progress/targets_done", overall_idx, overall_idx)
        writer.flush()

        line = (f"  {target:<28} {col:<20} {n:>4}  "
                f"{r2_global:>+9.4f} {r2_global_mode:>+9.4f} {r2_per_mode:>+9.4f}  "
                f"{per_mode_r2[0]:>+7.3f} {per_mode_r2[1]:>+7.3f} "
                f"{per_mode_r2[2]:>+7.3f}"
                + ("  [skip:" + ",".join(str(s) for s in skipped) + "]"
                   if skipped else ""))
        print(line, flush=True)
        lines.append(line)
        lines.append(f"      mode_n: 0={per_mode_n[0]}  1={per_mode_n[1]}  "
                     f"2={per_mode_n[2]}")

    writer.close()
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
