"""
research/diagnose_score_stdev_partition.py

For each (target, family, param) triple in the corpus, partition the
positions by their `score_stdev` feature into quintiles and look at:

  1. Per-quintile regression R² (does signal concentrate in
     low-disagreement positions?)
  2. Per-quintile residual statistics
  3. Per-quintile label std (does the label spread shrink with
     score_stdev, suggesting the noisy positions also have less
     across-position structure?)

score_stdev is the per-position MCTS-disagreement signal — if the
search produces very different score-lead estimates across
realizations, the position is informationally noisy. If signal is
concentrated in low-stdev positions, that's evidence the noise is
swamping the regression on volatile positions specifically.

Defaults to running on the SIGNAL triples the previous regression
identified:
  - scoreLead_drift|hyperbolic|H
  - visit_entropy_reduction|hyperbolic|H

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import (  # noqa: E402
    load_corpus, _LightGBMWrap, _KNNWrap, _signed_log1p,
)


DEFAULT_TRIPLES = [
    ("scoreLead_drift", "hyperbolic", "H", "lgbm"),
    ("visit_entropy_reduction", "hyperbolic", "H", "knn"),
    ("L2_joint_drift", "hyperbolic", "H", "lgbm"),
    ("winrate_drift", "convex_mixture_hyperbolic", "H1", "lgbm"),
]


def _model_factory(name: str):
    if name == "lgbm":
        return _LightGBMWrap
    if name == "knn":
        return _KNNWrap
    raise ValueError(f"unknown model {name!r}")


def diagnose_one(
    X: np.ndarray,
    labels: np.ndarray,
    feature_names: list[str],
    groups: np.ndarray,
    target: str, family: str, param: str, model_name: str,
    plot_dir: Path,
    n_quantiles: int = 5,
    n_folds: int = 5,
) -> dict:
    vals = labels[:, 0]
    mask_clean = labels[:, 1] == 1.0
    if mask_clean.sum() < 4 * n_folds:
        return {"error": f"only {int(mask_clean.sum())} clean samples"}

    X_m = X[mask_clean]
    y_raw = vals[mask_clean]
    g_m = groups[mask_clean]
    log_y = _signed_log1p(y_raw)

    if "score_stdev" not in feature_names:
        return {"error": "no score_stdev feature in corpus"}
    score_idx = feature_names.index("score_stdev")
    score_stdev_all = X_m[:, score_idx]

    # ── OOF predictions via GroupKFold ──────────────────────────────────────
    factory = _model_factory(model_name)
    kf = GroupKFold(n_splits=n_folds)
    preds_oof = np.zeros_like(log_y)
    for train_idx, test_idx in kf.split(X_m, log_y, groups=g_m):
        m = factory().fit(X_m[train_idx], log_y[train_idx])
        preds_oof[test_idx] = m.predict(X_m[test_idx])

    residuals = log_y - preds_oof
    overall_r2 = 1.0 - float((residuals ** 2).sum()) / max(
        float(((log_y - log_y.mean()) ** 2).sum()), 1e-12
    )

    # ── Quantile partition by score_stdev ──────────────────────────────────
    qs = np.linspace(0, 1, n_quantiles + 1)
    edges = np.quantile(score_stdev_all, qs)
    bins = np.digitize(score_stdev_all, edges[1:-1], right=False)
    # bins now in [0, n_quantiles-1]
    per_q: list[dict] = []
    for q in range(n_quantiles):
        mask = bins == q
        n = int(mask.sum())
        if n < 2:
            per_q.append({"q": q, "n": n, "error": "too few samples"})
            continue
        y_q = log_y[mask]
        p_q = preds_oof[mask]
        ss_res = float(((y_q - p_q) ** 2).sum())
        ss_tot = float(((y_q - log_y.mean()) ** 2).sum())
        r2_local = 1.0 - ss_res / max(ss_tot, 1e-12)
        per_q.append({
            "q": q,
            "n": n,
            "score_stdev_lo": float(edges[q]),
            "score_stdev_hi": float(edges[q + 1]),
            "label_mean": float(y_q.mean()),
            "label_std": float(y_q.std(ddof=1)) if n > 1 else 0.0,
            "residual_mean": float((y_q - p_q).mean()),
            "residual_std": float((y_q - p_q).std(ddof=1)) if n > 1 else 0.0,
            "r2_local": r2_local,
        })

    # ── Plot: residual scatter vs score_stdev, with quintile bins ──────────
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].scatter(score_stdev_all, residuals, s=10, alpha=0.35,
                    color="steelblue")
    for e in edges:
        axes[0].axvline(e, color="black", lw=0.5, alpha=0.4)
    axes[0].axhline(0, color="red", lw=0.7, alpha=0.6)
    axes[0].set_xlabel("score_stdev (per-position MCTS-disagreement)")
    axes[0].set_ylabel(f"signed-log1p residual ({param})")
    axes[0].set_title(f"OOF residual vs score_stdev — quintile bins")
    axes[0].grid(alpha=0.3)

    # Per-quintile R² bar
    qs_centers = []
    r2_vals = []
    ns = []
    for entry in per_q:
        if "error" in entry:
            continue
        center = 0.5 * (entry["score_stdev_lo"] + entry["score_stdev_hi"])
        qs_centers.append(f"Q{entry['q']+1}\n[{entry['score_stdev_lo']:.2f}, "
                          f"{entry['score_stdev_hi']:.2f}]")
        r2_vals.append(entry["r2_local"])
        ns.append(entry["n"])
    bars = axes[1].bar(qs_centers, r2_vals,
                       color=["#1f77b4" if r > 0 else "#d62728" for r in r2_vals])
    axes[1].axhline(0, color="black", lw=0.5)
    axes[1].axhline(overall_r2, color="blue", lw=1, linestyle="--",
                    label=f"overall OOF R²={overall_r2:+.3f}")
    for bar, n in zip(bars, ns):
        h = bar.get_height()
        axes[1].text(bar.get_x() + bar.get_width() / 2,
                     h + 0.02 if h >= 0 else h - 0.05,
                     f"n={n}", ha="center", fontsize=8)
    axes[1].set_xlabel("score_stdev quintile")
    axes[1].set_ylabel("per-quintile R²")
    axes[1].set_title("Per-quintile R² breakdown")
    axes[1].legend()
    axes[1].grid(alpha=0.3, axis="y")

    fig.suptitle(
        f"{target} | {family} | {param}  ({model_name})  "
        f"n_clean={int(mask_clean.sum())}  overall R²={overall_r2:+.3f}",
        fontsize=11,
    )
    fig.tight_layout()
    out = plot_dir / f"diagnose_stdev_partition_{target}_{family}_{param}_{model_name}.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)

    return {
        "target": target, "family": family, "param": param,
        "model": model_name,
        "overall_r2": overall_r2,
        "n_clean": int(mask_clean.sum()),
        "per_quintile": per_q,
        "plot_path": str(out),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--plot-dir", default=Path.home() / "plots", type=Path)
    ap.add_argument("--summary-txt",
                    default=Path.home() / "plots" / "diagnose_stdev_partition_summary.txt",
                    type=Path)
    ap.add_argument("--n-quantiles", default=5, type=int)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--triples", nargs="*", default=None,
                    help="Optional list of target|family|param|model entries. "
                         "Default: SIGNAL/WEAK triples from regression.py")
    args = ap.parse_args()
    args.plot_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== loading corpus from {args.labels_csv} ===", flush=True)
    corpus = load_corpus(args.labels_csv, expand_by_realization=True)
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    if groups is None:
        sys.exit("expected expanded/per-realization corpus with groups; got None")

    if args.triples:
        triples: list[tuple[str, str, str, str]] = []
        for s in args.triples:
            parts = [p.strip() for p in s.split("|")]
            if len(parts) != 4:
                sys.exit(f"bad triple {s!r} (want 'target|family|param|model')")
            triples.append(tuple(parts))
    else:
        triples = DEFAULT_TRIPLES

    results: list[dict] = []
    for (t, fam, pn, mn) in triples:
        key = (t, fam, pn)
        if key not in per_label:
            print(f"--- {key} ({mn}) — SKIPPED: not in corpus", flush=True)
            continue
        print(f"\n--- {key} ({mn}) ---", flush=True)
        labels = per_label[key]
        r = diagnose_one(
            X=X, labels=labels, feature_names=feature_names,
            groups=groups,
            target=t, family=fam, param=pn, model_name=mn,
            plot_dir=args.plot_dir,
            n_quantiles=args.n_quantiles, n_folds=args.n_folds,
        )
        if "error" in r:
            print(f"  SKIPPED: {r['error']}", flush=True)
            continue
        print(f"  overall R²={r['overall_r2']:+.4f}  n_clean={r['n_clean']}",
              flush=True)
        print(f"  per-quintile breakdown:", flush=True)
        for q in r["per_quintile"]:
            if "error" in q:
                print(f"    Q{q['q']+1}: {q['error']}", flush=True)
                continue
            print(
                f"    Q{q['q']+1}  "
                f"score_stdev∈[{q['score_stdev_lo']:.3f},"
                f"{q['score_stdev_hi']:.3f}]  "
                f"n={q['n']:4d}  "
                f"label μ={q['label_mean']:+.3f}  σ={q['label_std']:.3f}  "
                f"resid μ={q['residual_mean']:+.3f}  σ={q['residual_std']:.3f}  "
                f"R²={q['r2_local']:+.4f}",
                flush=True,
            )
        results.append(r)

    # Summary
    lines: list[str] = []
    lines.append(f"# score_stdev quintile partition — {len(results)} triples")
    lines.append("")
    for r in results:
        lines.append(
            f"## {r['target']} | {r['family']} | {r['param']} "
            f"({r['model']})  overall R²={r['overall_r2']:+.4f}  "
            f"n={r['n_clean']}"
        )
        for q in r["per_quintile"]:
            if "error" in q:
                lines.append(f"  Q{q['q']+1}: {q['error']}")
                continue
            lines.append(
                f"  Q{q['q']+1}  score_stdev∈[{q['score_stdev_lo']:.3f},"
                f"{q['score_stdev_hi']:.3f}]  n={q['n']:4d}  "
                f"label σ={q['label_std']:.3f}  R²={q['r2_local']:+.4f}"
            )
        lines.append("")
    args.summary_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.summary_txt}", flush=True)


if __name__ == "__main__":
    main()
