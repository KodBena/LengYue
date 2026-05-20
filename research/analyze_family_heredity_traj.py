"""
research/analyze_family_heredity_traj.py

Family heredity analysis on NON-PARAMETRIC trajectory features —
counterpart to analyze_family_heredity.py which works in (H, log κ)
space. Tests whether the within/across-family σ ratio holds when
labels are robust to non-monotone trajectories.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_family_heredity import CARD_META, _family_group_id  # noqa: E402


# Subset of features to analyze (the ones that showed signal in the regression)
TRAJ_COLS = [
    "y_at_V_max", "y_range", "rise_after_dip", "y_at_V_min",
    "slope_terminal", "y_at_V2000", "y_at_V10000",
    "monotonicity_frac", "dip_depth",
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features.csv"), type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "validate_volatile_family",
                    type=Path)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    # Build stem → card_id map from CARD_META
    stem_to_card: dict[str, int] = {meta["stem"]: cid
                                     for cid, meta in CARD_META.items()}

    # Load trajectory features for the 18 family cards
    # key: (card_id, target) → dict of trajectory feature values
    fits_by_card: dict[int, dict[str, dict]] = {cid: {} for cid in CARD_META}
    with args.features_csv.open() as f:
        for row in csv.DictReader(f):
            cid = stem_to_card.get(row["stem"])
            if cid is None:
                continue
            target = row["target"]
            if row.get("status") != "clean":
                fits_by_card[cid][target] = None
                continue
            feats = {}
            for col in TRAJ_COLS:
                try:
                    v = float(row[col])
                    if np.isfinite(v):
                        feats[col] = v
                except (ValueError, KeyError):
                    pass
            fits_by_card[cid][target] = feats

    # Heredity stats per (target, feature column)
    targets = ["L2_joint_drift", "scoreLead_drift",
               "visit_entropy_reduction", "winrate_drift"]
    print(f"=== heredity stats (within-family vs across-family σ) on "
          f"non-parametric trajectory features ===", flush=True)
    print(f"  18 cards (5 seeds + 4 parents + 5 siblings + 4 descendants); "
          f"family group = parent_id", flush=True)

    summary_lines: list[str] = [
        f"# family heredity on non-parametric trajectory features",
        f"# 18 cards = 5 seeds + 4 parents + 5 siblings + 4 descendants",
        "",
    ]
    header = (f"  {'target':<28} {'column':<20} {'n_clean':>8} "
              f"{'n_groups':>9} {'within-σ':>9} {'across-σ':>9} {'ratio':>7}")
    print(header, flush=True)
    summary_lines.append(header)
    for target in targets:
        for col in TRAJ_COLS:
            # Collect values per family group
            by_group: dict[int, list[float]] = {}
            all_vals: list[float] = []
            for cid in CARD_META:
                feats = fits_by_card[cid].get(target)
                if feats is None or col not in feats:
                    continue
                v = feats[col]
                # signed_log1p for scale-comparability with regression labels
                v_log = float(np.sign(v) * np.log1p(np.abs(v)))
                by_group.setdefault(_family_group_id(cid), []).append(v_log)
                all_vals.append(v_log)
            if len(all_vals) < 3:
                line = f"  {target:<28} {col:<20} {len(all_vals):>8}  (too few)"
                print(line, flush=True)
                summary_lines.append(line)
                continue
            across_std = float(np.std(all_vals, ddof=1))
            within_stds = []
            n_groups_2plus = 0
            for g, vs in by_group.items():
                if len(vs) < 2:
                    continue
                within_stds.append(float(np.std(vs, ddof=1)))
                n_groups_2plus += 1
            if not within_stds or across_std <= 0:
                ratio_str = "—"
                within_mean = float("nan")
            else:
                within_mean = float(np.mean(within_stds))
                ratio = within_mean / across_std
                ratio_str = f"{ratio:.3f}"
            line = (
                f"  {target:<28} {col:<20} {len(all_vals):>8} "
                f"{n_groups_2plus:>9} "
                f"{within_mean:>9.3f} {across_std:>9.3f} "
                f"{ratio_str:>7}"
            )
            print(line, flush=True)
            summary_lines.append(line)

    out_txt = args.out_dir / "family_heredity_traj_features_summary.txt"
    out_txt.write_text("\n".join(summary_lines) + "\n")
    print(f"\nsummary: {out_txt}", flush=True)


if __name__ == "__main__":
    main()
