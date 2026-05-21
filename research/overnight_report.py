"""
research/overnight_report.py

Consolidates the overnight allocator-simulation + delta-reframe
results into a single Markdown report at
`research/notes/overnight-allocator-results-<date>.md`.

Inputs (all optional — script skips sections whose inputs are missing):
  - ~/plots/allocator_pareto/summary_<target>.txt  (per target)
  - ~/plots/allocator_pareto/binary_<target>.png   (per target)
  - ~/plots/allocator_pareto/3stage_<target>.png   (per target)
  - ~/plots/allocator_pareto/combined_<target>.png (per target)
  - ~/plots/regression_delta_reframe.txt
  - ~/plots/ood_regression.txt (the prior turn's OOD result)
  - ~/plots/extract_advanced.log (advanced feature extraction log)
  - ~/plots/cache_trajectories.log (cache log)

The report is consumable on GitHub's renderer (the user's stated
preference for reading at-rest result tables).

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import datetime
import re
from pathlib import Path


PLOTS = Path.home() / "plots" / "allocator_pareto"
DELTA_TXT = Path.home() / "plots" / "regression_delta_reframe.txt"
OOD_TXT = Path.home() / "plots" / "ood_regression.txt"
TARGETS = ["scoreLead_drift", "winrate_drift", "visit_entropy_reduction", "L2_joint_drift"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out",
                    default=Path(__file__).resolve().parent /
                            "notes" /
                            f"overnight-allocator-results-{datetime.date.today()}.md",
                    type=Path)
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    L: list[str] = []

    L.append(f"# Overnight allocator simulation — {datetime.date.today()}")
    L.append("")
    L.append("Tier-0 follow-up from `firewall-strategic-2026-05-21.md`. The")
    L.append("regression head has cleared the OOD transfer gate; this is the")
    L.append("end-to-end test of whether the prediction translates into a")
    L.append("learned allocator that beats the 'always V_max' baseline on a")
    L.append("Pareto curve of (visits-spent, top-1 agreement).")
    L.append("")
    L.append("**Pre-committed decision rules from the firewall consult §5 Tier 0:**")
    L.append("")
    L.append("- If the learned allocator's Pareto curve dominates the baseline → architecture wins, proceed to feature engineering + delta-reframe + capability dispatch.")
    L.append("- If the curves are roughly tied → predictor is the bottleneck; feature engineering and delta-reframe are warranted next.")
    L.append("- If the baseline strictly dominates → architecture is wrong at a level deeper than predictor quality; rethink target or escalate to sequence models.")
    L.append("")
    L.append("---")
    L.append("")

    # ---- Allocator sim results, per target ----
    L.append("## 1. Allocator simulation Pareto curves")
    L.append("")
    L.append("Train on year2k, evaluate on cards.db OOD slice. Predictor: LightGBM on phase35 + trajectory window features over `V ≤ V_floor` (binary policy) or `V ≤ V_mid` (3-stage policy).")
    L.append("")
    L.append("Pareto axes: avg visits spent vs top-1 move agreement against modal-top-1-across-realizations at V_max.")
    L.append("")
    for target in TARGETS:
        # Combine baseline + enriched variants
        for variant_suffix, variant_label in [("", "baseline (phase35 + trajectory windows)"),
                                              ("_enriched", "enriched (+ ownership + policy distribution at 5 V-checkpoints)")]:
            summary_path = PLOTS / f"summary_{target}{variant_suffix}.txt"
            if not summary_path.exists():
                continue
            L.append(f"### {target} — {variant_label}")
            L.append("")
        # Extract key numbers from summary
        body = summary_path.read_text()
        # Baseline numbers
        bm = re.search(r"avg_visits = (\S+)", body)
        am = re.search(r"agreement\s*= (\S+)", body)
        nm = re.search(r"n_positions = (\S+)", body)
        if bm and am:
            L.append(f"**Baseline (always V_max):** avg_visits = {bm.group(1)},  "
                     f"agreement = {am.group(1)}"
                     + (f",  n = {nm.group(1)}" if nm else ""))
            L.append("")
        # Binary table — first few + Pareto-frontier rows
        bin_block = re.search(
            r"# binary policy.*?\n  +tau.*?\n((?:.|\n)*?)(?=\n# 3-stage|\Z)", body)
        if bin_block:
            lines = bin_block.group(1).strip().splitlines()
            L.append("**Binary policy** (V_floor → V_max) — sample of τ sweep:")
            L.append("")
            L.append("| τ | avg visits | agreement | terminate% |")
            L.append("|---|---|---|---|")
            shown = 0
            for line in lines:
                parts = line.split()
                if len(parts) >= 4:
                    L.append(f"| {parts[0]} | {parts[1]} | {parts[2]} | {parts[3]} |")
                    shown += 1
                if shown >= 12:
                    break
            L.append("")
        # 3-stage best (max agreement / visit budget)
        L.append("**3-stage policy** (V_floor → V_mid → V_max) — see full sweep in summary file.")
        L.append("")
        # Plot embedding
        for plot_kind in ["binary", "3stage", "combined"]:
            png_path = PLOTS / f"{plot_kind}_{target}{variant_suffix}.png"
            if png_path.exists():
                L.append(f"![{plot_kind} Pareto for {target}{variant_suffix}](file://{png_path})")
                L.append("")
        L.append("")
        L.append(f"Summary file: `~/plots/allocator_pareto/summary_{target}{variant_suffix}.txt`")
        L.append("")

    # ---- Delta-reframe results ----
    L.append("---")
    L.append("")
    L.append("## 2. Delta-prediction reframe (Tier 1 from firewall consult)")
    L.append("")
    L.append("Per the firewall's Tier 1 spec: predict `(y(V_target) - y(V_current)) / σ_position` at K=3 anchor `V_target` values per `V_current`. Loss: MSE on per-position-normalized delta. Labels: averaged across realizations. `n_realizations` exposed as a feature.")
    L.append("")
    if DELTA_TXT.exists():
        L.append("```")
        L.append(DELTA_TXT.read_text())
        L.append("```")
        L.append("")
    else:
        L.append("(delta-reframe did not run or did not write output)")
        L.append("")

    # ---- Reference: prior OOD test ----
    L.append("---")
    L.append("")
    L.append("## 3. Prior session's OOD R² baseline (reference)")
    L.append("")
    L.append("From `~/plots/ood_regression.txt`, run earlier this session. Hyperbolic-H regression targets, multi-timestep INPUT features. **CAUTION:** the `full` window row has feature/label coupling (`y_at_V_max` ~ H by construction); within-corpus and OOD ratios are still meaningful but absolute magnitudes there overstate the regression's difficulty.")
    L.append("")
    if OOD_TXT.exists():
        L.append("```")
        L.append(OOD_TXT.read_text())
        L.append("```")
        L.append("")

    # ---- Closing ----
    L.append("---")
    L.append("")
    L.append("## 4. Where to read further")
    L.append("")
    L.append("- `research/notes/firewall-strategic-2026-05-21.md` — the 2-turn firewall consult that anchored Tier 0; pre-committed decision rules and target reframe specifications.")
    L.append("- `research/notes/interim-research-memo-2026-05-21.md` — comprehensive synthesis of the arc through 2026-05-21 mid-day.")
    L.append("- `research/notes/session-handoff-2026-05-21.md` — handoff brief that introduced the mode-as-feature finding.")
    L.append("- `research/data/trajectory_cache.npz` — substrate used by all overnight sims; produced by `cache_trajectories.py` with the bundled-fetch optimization.")
    L.append("- `research/data/advanced_multitimestep.csv` — ownership + policy distribution features at 5 V-checkpoints; produced by `extract_advanced_multitimestep.py`. Available for future enriched-regression retraining.")
    L.append("")
    L.append("---")
    L.append("")
    L.append("License: Public Domain (The Unlicense)")
    L.append("")

    args.out.write_text("\n".join(L))
    print(f"  written: {args.out}")


if __name__ == "__main__":
    main()
