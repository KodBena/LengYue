"""
research/regression_advanced_features.py

Tests whether `policy_kl` + score-histogram features (extracted by
`extract_advanced_features.py`) improve regression on top of the
phase35 baseline and the hand-crafted ownership features.

Four comparison configurations per target:
  1. phase35 only (baseline)
  2. + hand-crafted ownership (14 dim)
  3. + advanced features (policy_kl + 7 score-hist features)
  4. + both ownership + advanced

Logs each (target, variant) R² to tensorboard as it lands, so the
results appear incrementally rather than only at the end.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _cv_r2_grouped, _signed_log1p,
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
                    default=Path("/home/bork/w/vdc/tensorboard/regression_advanced"),
                    type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_advanced_summary.txt", type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()
    run_tag = f"run_{int(time.time())}"
    tb_path = args.tb_log_dir / run_tag
    tb_path.mkdir(parents=True, exist_ok=True)
    print(f"  tensorboard log dir: {tb_path}", flush=True)
    writer = SummaryWriter(log_dir=str(tb_path), flush_secs=5)

    print(f"=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=True)
    X35 = corpus["X"]
    groups = corpus["groups"]
    sample_ids = corpus["sample_ids"]
    print(f"  corpus: n={len(X35)}", flush=True)

    # Ownership features (per-position, averaged across realizations)
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

    # Advanced features (per-realization)
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

    # Trajectory feature labels
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

    # Build per-sample feature vectors
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

    # ── Run comparison ─────────────────────────────────────────────────────
    print(f"\n  {'target':<28} {'column':<20} {'n':>4}  "
          f"{'phase35':>9} {'+own':>9} {'+adv':>9} {'+both':>9}", flush=True)
    lines = ["# regression with advanced features (policy_kl + score_histogram)",
             f"# {len(X35)} samples; ownership n={len(own_by_pos)} positions; "
             f"adv n={len(adv_by_key)} realizations × {len(adv_cols)} feats",
             f"# tensorboard: {tb_path}",
             f"# advanced features: {adv_cols}",
             "",
             f"  {'target':<28} {'column':<20} {'n':>4}  "
             f"{'phase35':>9} {'+own':>9} {'+adv':>9} {'+both':>9}"]
    # Heartbeat — gets tensorboard showing SOMETHING immediately so the
    # user knows the script is running.
    writer.add_scalar("progress/started", 1.0, 0)
    writer.flush()

    overall_idx = 0
    for target_idx, (target, col) in enumerate(TARGETS):
        # Heartbeat per target
        writer.add_scalar("progress/target_idx", target_idx, target_idx)
        writer.flush()

        y = np.full(len(X35), np.nan); mask = np.zeros(len(X35), dtype=bool)
        for i, sid in enumerate(sample_ids):
            parts = sid.split(":")
            stem = parts[0]; turn = int(parts[1].lstrip("t"))
            ent = labels.get((stem, turn, target))
            if ent is None:
                continue
            v = ent.get(col)
            if v is None or not np.isfinite(v):
                continue
            y[i] = v; mask[i] = True
        full_mask = mask & valid_own & valid_adv
        if full_mask.sum() < 100:
            line = (f"  {target:<28} {col:<20} {int(full_mask.sum()):>4}  "
                    f"(too few)")
            print(line, flush=True)
            lines.append(line)
            continue
        ym = y[full_mask]; gm = groups[full_mask]
        log_y = _signed_log1p(ym)
        Xb = X35[full_mask]
        Xo = np.concatenate([Xb, X_own[full_mask]], axis=1)
        Xa = np.concatenate([Xb, X_adv[full_mask]], axis=1)
        Xab = np.concatenate([Xb, X_own[full_mask], X_adv[full_mask]], axis=1)

        tag = f"{target}_{col}"
        variants: list[tuple[str, np.ndarray]] = [
            ("phase35", Xb),
            ("plus_ownership", Xo),
            ("plus_advanced", Xa),
            ("plus_both", Xab),
        ]
        r2s: dict[str, float] = {}
        for v_name, X_v in variants:
            r2, _ = _cv_r2_grouped(X_v, log_y, gm, _LightGBMWrap, args.n_folds)
            r2s[v_name] = r2
            # Log immediately so each variant shows up in tb as it lands.
            writer.add_scalar(f"r2/{tag}/{v_name}", r2, target_idx)
            writer.add_scalar(f"progress/n_variants_done", overall_idx + 1,
                                overall_idx)
            writer.flush()
            overall_idx += 1
        line = (f"  {target:<28} {col:<20} {int(full_mask.sum()):>4}  "
                f"{r2s['phase35']:>+9.4f} {r2s['plus_ownership']:>+9.4f} "
                f"{r2s['plus_advanced']:>+9.4f} {r2s['plus_both']:>+9.4f}")
        print(line, flush=True)
        lines.append(line)
        # Delta-from-baseline for quick reading in tb
        for v in ("plus_ownership", "plus_advanced", "plus_both"):
            writer.add_scalar(f"delta/{tag}/{v}",
                                r2s[v] - r2s["phase35"], target_idx)
        writer.flush()

    writer.close()
    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
