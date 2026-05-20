"""
research/classify_cleanness.py

Binary classifier: can features predict whether a position's averaged-
trajectory fit will come out "clean" (vs "degenerate") for a given
(target, family)? Triggered by the bootstrap label-noise diagnostic
showing visit_entropy_reduction has only 25% clean fits, while the
other targets clear 65-69%.

If a classifier can detect the noisy / unfittable positions ahead of
time, two things follow:

  1. We can filter the regression pipeline to a higher-quality
     subset (raising the effective n) — but more importantly,
  2. The classifier output itself becomes a regression FEATURE,
     capturing whatever position-structural property gates fittability.
     The firewall recommended this exact pattern: "use class-like
     FEATURES" rather than training per-class regressors.

For each (target, family) in the averaged-CSV:
  - Build binary label: 1 if status=="clean" for that (target, family),
    else 0.
  - Train LGBMClassifier with GroupKFold CV (positions as groups so
    per-realization expansion doesn't leak).
  - Report AUC, log-loss, per-fold breakdown, feature importance.
  - Save ROC + PR curves and a feature-importance plot to ~/plots/.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score, log_loss, precision_recall_curve, roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from regression import load_corpus  # noqa: E402


class _LightGBMBinaryWrap:
    """LightGBM binary classifier, same hyperparam style as the regression
    wrapper but with binary objective and probability outputs."""

    name = "lgbm"

    def __init__(self, n_pos: int, n_neg: int):
        # Class-imbalance weighting via scale_pos_weight (positive / neg ratio).
        # LGBM expects ratio of negatives to positives.
        spw = max(n_neg, 1) / max(n_pos, 1)
        self.params = {
            "objective": "binary",
            "metric": ["binary_logloss", "auc"],
            "num_leaves": 15,
            "min_data_in_leaf": 5,
            "learning_rate": 0.05,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "lambda_l2": 0.1,
            "scale_pos_weight": spw,
            "verbose": -1,
        }
        self.num_boost_round = 300
        self.booster = None

    def fit(self, X, y):
        train_set = lgb.Dataset(X, label=y)
        self.booster = lgb.train(self.params, train_set,
                                 num_boost_round=self.num_boost_round)
        return self

    def predict_proba(self, X):
        return self.booster.predict(X)

    def feature_importance(self, n_features: int) -> np.ndarray:
        return self.booster.feature_importance(importance_type="gain")


class _LogisticWrap:
    """Logistic regression with StandardScaler. Linear decision boundary,
    no capacity to overfit non-linear structure — strong validator for
    AUC signals seen under LGBM. class_weight='balanced' to handle the
    cleanness rate imbalance the same way LGBM's scale_pos_weight does.
    L2 regularization (default C=1.0); tune later if needed."""

    name = "logistic"

    def __init__(self, n_pos: int, n_neg: int):
        self.scaler = StandardScaler()
        self.clf = LogisticRegression(
            penalty="l2", C=1.0, class_weight="balanced",
            solver="lbfgs", max_iter=1000,
        )

    def fit(self, X, y):
        Xs = self.scaler.fit_transform(X)
        self.clf.fit(Xs, y)
        return self

    def predict_proba(self, X):
        Xs = self.scaler.transform(X)
        return self.clf.predict_proba(Xs)[:, 1]

    def feature_importance(self, n_features: int) -> np.ndarray:
        # Use |coefficient| on the standardized features as importance —
        # the StandardScaler makes coefficients directly comparable across
        # features.
        return np.abs(self.clf.coef_[0])


_MODEL_COLORS = {"lgbm": "steelblue", "logistic": "crimson"}


def _run_one_model(
    model_cls,
    X: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    n: int,
    n_pos: int,
    n_neg: int,
    feature_names: list[str],
    n_folds: int,
) -> dict:
    """Train one classifier across GroupKFold folds, return OOF metrics +
    feature importances (full-data fit). Pure: no plotting, no I/O."""
    kf = GroupKFold(n_splits=n_folds)
    p_oof = np.full(n, np.nan)
    fold_aucs: list[float] = []
    fold_logloss: list[float] = []
    for train_idx, test_idx in kf.split(X, y, groups=groups):
        y_tr = y[train_idx]
        n_pos_tr = int(y_tr.sum())
        n_neg_tr = len(y_tr) - n_pos_tr
        if n_pos_tr < 5 or n_neg_tr < 5:
            continue
        m = model_cls(n_pos_tr, n_neg_tr).fit(X[train_idx], y_tr)
        p_test = m.predict_proba(X[test_idx])
        p_oof[test_idx] = p_test
        y_test = y[test_idx]
        if len(set(y_test)) == 2:
            fold_aucs.append(roc_auc_score(y_test, p_test))
            fold_logloss.append(
                log_loss(y_test, np.clip(p_test, 1e-6, 1 - 1e-6))
            )

    valid = ~np.isnan(p_oof)
    p_v = p_oof[valid]
    y_v = y[valid]
    if len(p_v) == 0 or len(set(y_v)) < 2:
        return {"error": "no valid OOF predictions or single class"}

    base_rate_v = y_v.mean()
    base_ll = log_loss(y_v, np.full_like(p_v, base_rate_v))
    oof_auc = roc_auc_score(y_v, p_v)
    oof_ap = average_precision_score(y_v, p_v)
    oof_ll = log_loss(y_v, np.clip(p_v, 1e-6, 1 - 1e-6))

    final = model_cls(n_pos, n_neg).fit(X, y)
    importances = final.feature_importance(len(feature_names))
    order = np.argsort(importances)[::-1]
    top = [
        {"rank": rank + 1, "feature": feature_names[i],
         "importance": float(importances[i])}
        for rank, i in enumerate(order) if importances[i] > 0
    ]

    return {
        "p_oof": p_oof, "valid_mask": valid,
        "y_valid": y_v, "p_valid": p_v,
        "oof_auc": oof_auc, "oof_ap": oof_ap,
        "oof_logloss": oof_ll, "baseline_logloss": base_ll,
        "logloss_lift": base_ll - oof_ll,
        "per_fold_auc": fold_aucs,
        "per_fold_logloss": fold_logloss,
        "importances": importances,
        "top_features": top,
        "base_rate_valid": base_rate_v,
    }


def classify_one(
    X: np.ndarray,
    is_clean: np.ndarray,
    feature_names: list[str],
    groups: np.ndarray,
    target: str,
    family: str,
    plot_dir: Path,
    n_folds: int = 5,
) -> dict:
    """Train + evaluate BOTH LGBM and logistic for one (target, family).
    Overlays the two ROC curves on the same axes so they're directly
    comparable. Returns per-model metrics nested under model name."""
    y = is_clean.astype(int)
    n = len(y)
    n_pos = int(y.sum())
    n_neg = n - n_pos
    base_rate = n_pos / n if n > 0 else 0.0
    n_groups = len(set(groups))

    info = {
        "target": target, "family": family,
        "n": n, "n_pos": n_pos, "n_neg": n_neg,
        "base_rate": base_rate, "n_groups": n_groups,
    }

    if n_pos < 10 or n_neg < 10:
        info["error"] = f"too imbalanced: n_pos={n_pos} n_neg={n_neg}"
        return info

    model_classes = [_LightGBMBinaryWrap, _LogisticWrap]
    by_model: dict[str, dict] = {}
    for cls in model_classes:
        res = _run_one_model(
            cls, X, y, groups, n, n_pos, n_neg, feature_names, n_folds,
        )
        by_model[cls.name] = res
    info["models"] = by_model

    # ── ROC + PR + feature-importance plots (overlaid models) ───────────────
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    # ROC — overlay both models
    for name, res in by_model.items():
        if "error" in res:
            continue
        fpr, tpr, _ = roc_curve(res["y_valid"], res["p_valid"])
        axes[0].plot(
            fpr, tpr, lw=2, color=_MODEL_COLORS.get(name, "gray"),
            label=f"{name} AUC={res['oof_auc']:.3f}",
        )
    axes[0].plot([0, 1], [0, 1], "k--", alpha=0.4, label="chance")
    axes[0].set_xlabel("False positive rate")
    axes[0].set_ylabel("True positive rate")
    axes[0].set_title(f"ROC — OOF (GroupKFold k={n_folds})")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # PR — overlay both models
    for name, res in by_model.items():
        if "error" in res:
            continue
        prec, rec, _ = precision_recall_curve(res["y_valid"], res["p_valid"])
        axes[1].plot(
            rec, prec, lw=2, color=_MODEL_COLORS.get(name, "gray"),
            label=f"{name} AP={res['oof_ap']:.3f}",
        )
    axes[1].axhline(
        base_rate, color="black", linestyle="--", alpha=0.4,
        label=f"base rate={base_rate:.3f}",
    )
    axes[1].set_xlabel("Recall")
    axes[1].set_ylabel("Precision")
    axes[1].set_title("Precision-Recall — OOF")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    # Feature importance — side-by-side bars (LGBM gain vs |Logistic coef|).
    # Importances are on different scales, so we normalize each to [0,1] for
    # side-by-side comparison.
    n_feat = len(feature_names)
    sorted_idx_lgbm = (np.argsort(by_model["lgbm"]["importances"])
                       if "lgbm" in by_model and "importances" in by_model["lgbm"]
                       else np.arange(n_feat))
    width = 0.4
    yy = np.arange(n_feat)
    for i, (name, res) in enumerate(by_model.items()):
        if "importances" not in res:
            continue
        imp = res["importances"]
        imp_norm = imp / max(imp.max(), 1e-12)
        axes[2].barh(
            yy + (i - 0.5) * width, imp_norm[sorted_idx_lgbm],
            height=width, color=_MODEL_COLORS.get(name, "gray"),
            label=name, alpha=0.8,
        )
    axes[2].set_yticks(yy)
    axes[2].set_yticklabels([feature_names[i] for i in sorted_idx_lgbm],
                            fontsize=8)
    axes[2].set_xlabel("normalized importance (LGBM gain / |LR coef|)")
    axes[2].set_title("Feature importance (LGBM bottom-up; LR overlay)")
    axes[2].legend()
    axes[2].grid(alpha=0.3, axis="x")

    fig.suptitle(
        f"cleanness classifier — {target} | {family}\n"
        f"n={n} ({n_pos} clean / {n_neg} degenerate, "
        f"base rate {base_rate:.1%}), groups={n_groups}",
        fontsize=11,
    )
    fig.tight_layout()
    out = plot_dir / f"classify_clean_{target}_{family}.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    info["plot_path"] = str(out)
    return info


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--labels-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--plot-dir",
                    default=Path.home() / "plots", type=Path)
    ap.add_argument("--summary-txt",
                    default=Path.home() / "plots" / "classify_cleanness_summary.txt",
                    type=Path)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--triples", nargs="*", default=None,
                    help="Optional list of target|family pairs to run, "
                         "e.g. visit_entropy_reduction|hyperbolic. "
                         "Default: all (target, family) in corpus.")
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

    # Distinct (target, family) pairs — note `per_label` keys are
    # (target, family, param_name) but `is_clean` is param-independent
    # (it's the same status for all params of the same (target, family)).
    seen: dict[tuple[str, str], np.ndarray] = {}
    for (t, fam, _pn), labels in per_label.items():
        if (t, fam) in seen:
            continue
        seen[(t, fam)] = labels[:, 1]  # is_clean column
    pairs = sorted(seen.keys())
    if args.triples:
        wanted = set()
        for s in args.triples:
            try:
                t, fam = s.split("|")
            except ValueError:
                sys.exit(f"bad --triples item: {s!r} (want 'target|family')")
            wanted.add((t.strip(), fam.strip()))
        pairs = [p for p in pairs if p in wanted]
        if not pairs:
            sys.exit("no matching pairs in corpus")

    print(f"corpus: n={len(X)}  features={len(feature_names)}  "
          f"groups={len(set(groups))}", flush=True)
    print(f"running classifier for {len(pairs)} (target, family) pairs",
          flush=True)

    t0 = time.monotonic()
    results: list[dict] = []
    for (t, fam) in pairs:
        is_clean = seen[(t, fam)]
        print(f"\n--- {t} | {fam} ---", flush=True)
        info = classify_one(
            X=X, is_clean=is_clean, feature_names=feature_names,
            groups=groups, target=t, family=fam,
            plot_dir=args.plot_dir, n_folds=args.n_folds,
        )
        if "error" in info:
            print(f"  SKIPPED: {info['error']}", flush=True)
        else:
            print(f"  n={info['n']}  clean={info['n_pos']} ({info['base_rate']:.1%})",
                  flush=True)
            for name, res in info.get("models", {}).items():
                if "error" in res:
                    print(f"  {name:<8s} SKIPPED: {res['error']}", flush=True)
                    continue
                print(
                    f"  {name:<8s} AUC={res['oof_auc']:+.4f}  "
                    f"AP={res['oof_ap']:+.4f}  "
                    f"logloss_lift={res['logloss_lift']:+.4f}",
                    flush=True,
                )
                pf = res.get("per_fold_auc", [])
                if pf:
                    print(
                        f"           per-fold AUC: " +
                        " ".join(f"{a:+.3f}" for a in pf),
                        flush=True,
                    )
                top = (res.get("top_features") or [])[:6]
                if top:
                    print(f"           top features:", flush=True)
                    for f in top:
                        print(
                            f"             {f['rank']:2d}. "
                            f"{f['feature']:<28s} "
                            f"importance={f['importance']:.3g}",
                            flush=True,
                        )
        results.append(info)

    elapsed = time.monotonic() - t0
    print(f"\n=== done in {elapsed:.0f}s ===", flush=True)

    # Summary text — wide table with both models side-by-side
    lines: list[str] = []
    lines.append(f"# cleanness classifier — {len(pairs)} (target, family) pairs")
    lines.append(f"# {len(X)} samples, {len(set(groups))} position groups, "
                 f"{len(feature_names)} features")
    lines.append("# LGBM vs Logistic OOF metrics under GroupKFold "
                 f"(k={args.n_folds})")
    lines.append("")
    lines.append(
        f"  {'target':<28} {'family':<28} {'n':>5} {'clean%':>7} "
        f"{'lgbm_AUC':>9} {'lgbm_AP':>9} {'lgbm_llΔ':>10} "
        f"{'log_AUC':>9} {'log_AP':>9} {'log_llΔ':>10}"
    )
    for info in results:
        t = info["target"]; fam = info["family"]
        if "error" in info:
            lines.append(
                f"  {t:<28} {fam:<28} "
                f"({info['n']:>3} samples)  SKIPPED: {info['error']}"
            )
            continue
        models = info.get("models", {})
        lgbm = models.get("lgbm", {})
        log = models.get("logistic", {})
        def _f(d, k, w=9, sign=True):
            v = d.get(k)
            if v is None:
                return f"{'—':>{w}}"
            fmt = f"{{:>+{w-1}.4f}}" if sign else f"{{:>{w-1}.4f}}"
            return fmt.format(v)
        lines.append(
            f"  {t:<28} {fam:<28} {info['n']:>5} "
            f"{info['base_rate']*100:>6.1f}% "
            f"{_f(lgbm, 'oof_auc', 9)} {_f(lgbm, 'oof_ap', 9)} "
            f"{_f(lgbm, 'logloss_lift', 10)} "
            f"{_f(log, 'oof_auc', 9)} {_f(log, 'oof_ap', 9)} "
            f"{_f(log, 'logloss_lift', 10)}"
        )
    summary = "\n".join(lines)
    print()
    print(summary)
    args.summary_txt.write_text(summary + "\n")
    print(f"\nsummary: {args.summary_txt}", flush=True)


if __name__ == "__main__":
    main()
