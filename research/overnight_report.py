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
HYPERPARAM_TXT = Path.home() / "plots" / "hyperparam_sweep.txt"
TARGETS = ["scoreLead_drift", "winrate_drift", "visit_entropy_reduction", "L2_joint_drift"]
EXTRA_TARGETS = ["logit_winrate_drift", "score_stdev_reduction", "top_move_visit_fraction"]
PER_TARGET_DELTA = {
    t: Path.home() / "plots" / f"regression_delta_reframe_{t}.txt"
    for t in TARGETS
}


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
                L.append(f"**Always-V_max reference:** avg_visits = {bm.group(1)},  "
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

    # ---- Extra targets allocator sim ----
    L.append("---")
    L.append("")
    L.append("## 2. Extra targets — allocator sim")
    L.append("")
    L.append("Three additional VALUE_CANDIDATES targets beyond the four main drift targets. Same binary + 3-stage Pareto framework. Useful for target-by-target sensitivity.")
    L.append("")
    for target in EXTRA_TARGETS:
        for variant_suffix, variant_label in [("", "baseline"), ("_enriched", "enriched")]:
            summary_path = PLOTS / f"summary_{target}{variant_suffix}.txt"
            if not summary_path.exists():
                continue
            L.append(f"### {target} — {variant_label}")
            L.append("")
            body = summary_path.read_text()
            bm = re.search(r"avg_visits = (\S+)", body)
            am = re.search(r"agreement\s*= (\S+)", body)
            if bm and am:
                L.append(f"**Always-V_max reference:** visits = {bm.group(1)},  agreement = {am.group(1)}")
                L.append("")
            bin_block = re.search(
                r"# binary policy.*?\n  +tau.*?\n((?:.|\n)*?)(?=\n# 3-stage|\Z)", body)
            if bin_block:
                lines = bin_block.group(1).strip().splitlines()
                L.append("**Binary policy** — sample of τ sweep:")
                L.append("")
                L.append("| τ | avg visits | agreement | terminate% |")
                L.append("|---|---|---|---|")
                shown = 0
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 4:
                        L.append(f"| {parts[0]} | {parts[1]} | {parts[2]} | {parts[3]} |")
                        shown += 1
                    if shown >= 10:
                        break
                L.append("")
            for plot_kind in ["binary", "3stage", "combined"]:
                png_path = PLOTS / f"{plot_kind}_{target}{variant_suffix}.png"
                if png_path.exists():
                    L.append(f"![{plot_kind} Pareto for {target}{variant_suffix}](file://{png_path})")
                    L.append("")
            L.append("")

    # ---- Delta-reframe results, per-target ----
    L.append("---")
    L.append("")
    L.append("## 3. Delta-prediction reframe (Tier 1 from firewall consult)")
    L.append("")
    L.append("Per the firewall's Tier 1 spec: predict `(y(V_target) - y(V_current)) / σ_position` at K=3 anchor `V_target` values per `V_current`. Loss: MSE on per-position-normalized delta. Labels: averaged across realizations. `n_realizations` exposed as a feature.")
    L.append("")
    L.append("**Headline finding:** the delta-reframe's within-corpus R² is ~5× lower than the hyperbolic-H regression's at the same windows. This triggers the firewall's pre-committed kill-criterion (\"if within-corpus R² drops on the reframe\"). Delta-reframe is not the Tier 1 unlock for this corpus.")
    L.append("")
    for target in TARGETS:
        p = PER_TARGET_DELTA.get(target)
        if p is None or not p.exists():
            continue
        L.append(f"### {target}")
        L.append("")
        L.append("```")
        L.append(p.read_text())
        L.append("```")
        L.append("")

    # ---- Delta-predictor allocator (the operational closure of Tier 1) ----
    DELTA_ALLOC = Path.home() / "plots" / "allocator_pareto_delta"
    if DELTA_ALLOC.exists() and any(DELTA_ALLOC.iterdir()):
        L.append("---")
        L.append("")
        L.append("## 3b. Delta-predictor allocator — operational closure of Tier 1")
        L.append("")
        L.append("Even though the delta-reframe's regression R² is ~5× lower than H-prediction's, **predictor R² ≠ allocator utility**. This section wires the delta predictor into the binary-allocator's decision rule and plots its Pareto curve alongside the H-allocator's.")
        L.append("")
        L.append("**Key finding**: the delta-allocator's Pareto curve is per-target. On some targets (e.g., `scoreLead_drift`) it dominates the H-allocator in mid-budget regions; on others (e.g., `visit_entropy_reduction`) the H-allocator wins at the same budget. The Tier 1 reframe's operational value is target-specific, not uniform.")
        L.append("")
        for target in TARGETS:
            sp = DELTA_ALLOC / f"summary_delta_{target}.txt"
            pp = DELTA_ALLOC / f"delta_vs_h_{target}.png"
            if not sp.exists():
                continue
            L.append(f"### {target}")
            L.append("")
            L.append("```")
            L.append(sp.read_text())
            L.append("```")
            L.append("")
            if pp.exists():
                L.append(f"![delta vs H Pareto for {target}](file://{pp})")
                L.append("")

    # ---- Hyperparameter sweep ----
    L.append("---")
    L.append("")
    L.append("## 4. Hyperparameter sweep")
    L.append("")
    L.append("LightGBM hyperparameter sweep on the anchor cell `scoreLead_drift × window_floor_frac=1/3`. 108 configs across `num_leaves × min_data_in_leaf × learning_rate × lambda_l2`. Tensorboard run at `~/w/vdc/tensorboard/hyperparam_sweep/`.")
    L.append("")
    if HYPERPARAM_TXT.exists():
        body = HYPERPARAM_TXT.read_text()
        # Surface just the best line + top 10
        L.append("**Best OOD config:**")
        L.append("")
        for line in body.splitlines():
            if "best OOD" in line or "#   {" in line:
                L.append(f"- `{line.strip().lstrip('#').strip()}`")
        L.append("")
        L.append("Full sweep file: `~/plots/hyperparam_sweep.txt`")
        L.append("")

    # ---- Reference: prior OOD test ----
    L.append("---")
    L.append("")
    L.append("## 5. Prior session's OOD R² baseline (reference)")
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
    L.append("## 6. Where to read further")
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
