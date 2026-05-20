"""
research/regression.py

Stage-1.5 signal-detection. Trains simple regressors `features → (H, κ)`
per target on the multi-realization averaged labels (mcts_realization
in Postgres). Cross-validated R² relative to a predict-the-mean baseline
tells us whether the features carry signal at this scale before we
scale up collection cost.

Models: k-NN (k=3, distance-weighted) and Ridge linear. Both have at
most one hyperparameter; LGBM's notorious hyperparameter space made
it a bad fit for the small-N regime where overfitting dominates.

Feature set (from V₀ rootInfo + top-12 visit distribution, the fields
captured by collect_trajectory.py):

  rootInfo aggregates
    f_winrate, f_scoreLead, f_scoreStdev
    f_winrate_centered    = winrate − 0.5
    f_scoreLead_per_stdev = scoreLead / scoreStdev    (signed certainty)
    f_log_scoreStdev      = log(scoreStdev + 1)

  visit distribution (top-12 at V₀)
    f_visits_entropy_nats           — Shannon H in nats
    f_visits_gini
    f_top1_mass                     = top1 / total
    f_top2_mass
    f_top1_top2_ratio               = top1 / max(top2, 1)
    f_effective_breadth             = exp(H_nats)
    f_visits_total_v0               = top-K sum (proxy for V₀ density)

13 features total. Not the full Phase 3.5 122-feature vector — for a
signal-detection pass, derivable-from-NPZ is the right bar.

For each (target, parameter ∈ {H, κ}), trains k-NN and Ridge on
clean-fit positions, with log-transform on both. Reports K-fold CV R²
vs. predict-the-mean baseline. R² > 0.1 → signal present; R² < 0 →
no better than baseline.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import csv
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import lightgbm as lgb
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import KFold, GroupKFold
from sklearn.neighbors import KNeighborsRegressor
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent))
from feature_extraction import extract_features as extract_phase35_features  # noqa: E402


# ── Feature extraction ──────────────────────────────────────────────────────
# The canonical Phase 3.5 extractor is in feature_extraction.py; it
# requires the lossless `.pkl.gz` companion produced by
# collect_trajectory.py / run_batch.py at capture time. This file
# delegates to it. The previous "minimal 12-feature" extractor was a
# stop-gap before we realized the original collector dropped most of
# KataGo's emitted data at capture time; it is no longer used.


# ── Data loading ────────────────────────────────────────────────────────────

def load_corpus(
    labels_csv: Path,
    expand_by_realization: bool = True,
    redis_url: str | None = None,
) -> dict:
    """Reads labels CSV produced by fit_averaged.py and extracts
    features per sample.

    Three modes (auto-detected from CSV schema + flag):

    1. CSV has `realization` column (per-realization fit):
       one row per (stem, turn, realization, target, family). One
       sample per (position, realization). Features and labels both
       per-realization. groups = position id for GroupKFold.

    2. CSV is averaged + `expand_by_realization=True` (DEFAULT for
       averaged CSV): the position-level label is replicated across
       all of that position's realizations' feature vectors. ~10×
       more samples per label. groups = position id. This is the
       "option 2" the user prefers: averaged (clean) labels paired
       with per-realization (augmented) features.

    3. CSV is averaged + `expand_by_realization=False`: one sample
       per position (features from r0 only). Smallest dataset.

    Caching: per-sample feature extraction takes ~80 ms per call
    (Postgres BYTEA blob fetch + parse). For a 3440-sample corpus
    that's a ~4 min tax on every script. The pickled feature-matrix
    cache is stored in Redis at the URL given by `redis_url` (default
    `redis://127.0.0.1:6379/0`, the qEUBO instance), keyed by the
    labels CSV identity (path + size + mtime + expand flag). On cache
    miss the corpus is rebuilt and the result stashed back; subsequent
    callers hit the cache in well under a second. A disk fallback
    under `research/data/corpus_cache/` is also written so the cache
    survives `redis-cli FLUSHDB` and Redis restarts without RDB.

    Returns dict with keys:
        sample_ids, X, feature_names, per_label, groups, per_realization,
        expanded
    """
    if not labels_csv.exists():
        sys.exit(f"labels CSV not found at {labels_csv}; run fit_averaged.py first")

    import hashlib
    import os
    import pickle
    if redis_url is None:
        redis_url = os.environ.get(
            "LENGYUE_RESEARCH_REDIS", "redis://127.0.0.1:6379/0",
        )

    csv_stat = labels_csv.stat()
    key_str = (
        f"{labels_csv.resolve()}|size={csv_stat.st_size}|"
        f"mtime={csv_stat.st_mtime:.6f}|expand={expand_by_realization}"
    )
    key_hash = hashlib.sha1(key_str.encode()).hexdigest()[:16]
    redis_key = f"lengyue:research:corpus:{labels_csv.stem}:{key_hash}"
    disk_cache_dir = Path(__file__).resolve().parent / "data" / "corpus_cache"
    disk_cache_dir.mkdir(parents=True, exist_ok=True)
    disk_cache_path = disk_cache_dir / f"corpus_{labels_csv.stem}_{key_hash}.pkl"

    # Try Redis first, then disk fallback.
    _r = None
    try:
        import redis  # type: ignore
        _r = redis.Redis.from_url(redis_url, socket_connect_timeout=2)
        if _r.ping():
            raw = _r.get(redis_key)
            if raw is not None:
                try:
                    cached = pickle.loads(raw)
                    print(f"  loaded corpus from redis: {redis_key} "
                          f"(n={len(cached.get('X', []))})", flush=True)
                    return cached
                except Exception as e:
                    print(f"  redis cache decode failed ({e}); "
                          f"trying disk", flush=True)
        else:
            _r = None
    except Exception as e:
        print(f"  redis unavailable ({e}); falling back to disk", flush=True)
        _r = None
    if disk_cache_path.exists():
        try:
            with disk_cache_path.open("rb") as f:
                cached = pickle.load(f)
            print(f"  loaded corpus from disk: {disk_cache_path} "
                  f"(n={len(cached.get('X', []))})", flush=True)
            # Re-populate Redis if available.
            if _r is not None:
                try:
                    _r.set(redis_key, pickle.dumps(cached, protocol=pickle.HIGHEST_PROTOCOL))
                    print(f"  re-populated redis cache: {redis_key}", flush=True)
                except Exception as e:
                    print(f"  redis re-populate failed ({e})", flush=True)
            return cached
        except Exception as e:
            print(f"  disk cache load failed ({e}); recomputing",
                  flush=True)

    # Detect per-realization mode via column presence
    with labels_csv.open() as f:
        first_line = f.readline()
    per_realization = "realization" in first_line.split(",")
    print(f"  detected schema: per_realization={per_realization}")

    # Sample key: (stem, turn) or (stem, turn, realization)
    rows_by_key: dict = {}
    with labels_csv.open() as f:
        for row in csv.DictReader(f):
            try:
                if per_realization:
                    key = (row["stem"], int(row["turn"]), int(row["realization"]),
                           row["target"], row["family"])
                    sample_id = (row["stem"], int(row["turn"]), int(row["realization"]))
                else:
                    key = (row["stem"], int(row["turn"]), row["target"], row["family"])
                    sample_id = (row["stem"], int(row["turn"]))
            except (KeyError, ValueError):
                continue
            rows_by_key[key] = row

    if per_realization:
        sample_ids = sorted({(k[0], k[1], k[2]) for k in rows_by_key})
        targets = sorted({k[3] for k in rows_by_key})
        families = sorted({k[4] for k in rows_by_key})
        label_keys_per_sample = lambda sid: (sid[0], sid[1], sid[2])
    else:
        # Averaged CSV. Decide whether to expand each position into
        # multiple per-realization feature vectors (option 2 from
        # the user's discussion).
        position_ids = sorted({(k[0], k[1]) for k in rows_by_key})
        targets = sorted({k[2] for k in rows_by_key})
        families = sorted({k[3] for k in rows_by_key})
        if expand_by_realization:
            # Expand: query Postgres for all realizations of each
            # position; emit one sample per (position, realization)
            # but the label is the position-level averaged label.
            from pg_sink import connect as _pg_connect, list_realizations
            _conn = _pg_connect()
            sample_ids = []
            for stem, turn in position_ids:
                reals = list_realizations(_conn, stem, turn)
                for ri in reals:
                    sample_ids.append((stem, turn, ri))
            _conn.close()
            # Sample id triple, but label lookup uses only (stem, turn).
            label_keys_per_sample = lambda sid: (sid[0], sid[1])
        else:
            sample_ids = list(position_ids)
            label_keys_per_sample = lambda sid: sid

    # Feature extraction. Reuse a single Postgres connection — opening
    # a new connection per sample (the default when extract_features is
    # called with conn=None) adds ~50-100 ms TLS+auth per call and was
    # the cause of 3-6 min "silent loading" with 3440 samples.
    from pg_sink import connect as _pg_connect_feat
    expanded = (not per_realization) and expand_by_realization
    n_samples = len(sample_ids)
    print(f"  loading features for {n_samples} samples from Postgres...",
          flush=True)
    feats_list: list[dict[str, float]] = []
    kept_samples: list[tuple] = []
    _feat_conn = _pg_connect_feat()
    _t_feat0 = time.monotonic()
    try:
        for i, sid in enumerate(sample_ids):
            try:
                if len(sid) == 3:
                    stem, turn, ri = sid
                    feats = extract_phase35_features(
                        stem, turn, realization=ri, conn=_feat_conn,
                    )
                else:
                    stem, turn = sid
                    feats = extract_phase35_features(
                        stem, turn, realization=0, conn=_feat_conn,
                    )
                feats_list.append(feats)
                kept_samples.append(sid)
            except Exception as e:
                print(f"  skipping {sid}: feature extraction failed: {e}",
                      flush=True)
            if (i + 1) % 250 == 0 or i + 1 == n_samples:
                dt = time.monotonic() - _t_feat0
                rate = (i + 1) / max(dt, 1e-9)
                eta = (n_samples - (i + 1)) / max(rate, 1e-9)
                print(f"    [{i+1}/{n_samples}] {rate:.0f} samples/s  "
                      f"elapsed {dt:.0f}s  eta {eta:.0f}s",
                      flush=True)
    finally:
        _feat_conn.close()

    feature_names = sorted(feats_list[0].keys()) if feats_list else []
    X = np.array(
        [[f[k] for k in feature_names] for f in feats_list],
        dtype=np.float64,
    )

    # Groups: integer per position (so GroupKFold puts all realizations
    # of one position in either train or test).
    groups = None
    if per_realization or expanded:
        pos_to_group: dict[tuple[str, int], int] = {}
        groups = np.zeros(len(kept_samples), dtype=np.int64)
        for i, sid in enumerate(kept_samples):
            pkey = (sid[0], sid[1])
            if pkey not in pos_to_group:
                pos_to_group[pkey] = len(pos_to_group)
            groups[i] = pos_to_group[pkey]
        print(f"  {len(pos_to_group)} distinct positions across {len(kept_samples)} samples")

    # Per (target, family, param_name) labels.
    per_label: dict[tuple[str, str, str], np.ndarray] = {}
    param_names_by_tf: dict[tuple[str, str], set[str]] = defaultdict(set)
    for k, row in rows_by_key.items():
        t = k[-2]
        fam = k[-1]
        try:
            params = json.loads(row.get("params_json", "{}") or "{}")
        except Exception:
            params = {}
        for pname in params:
            param_names_by_tf[(t, fam)].add(pname)

    for (t, fam), pnames in param_names_by_tf.items():
        for pname in sorted(pnames):
            labels = np.full((len(kept_samples), 2), np.nan)
            for i, sid in enumerate(kept_samples):
                if per_realization:
                    row = rows_by_key.get((sid[0], sid[1], sid[2], t, fam))
                else:
                    row = rows_by_key.get((sid[0], sid[1], t, fam))
                if row is None:
                    continue
                try:
                    params = json.loads(row.get("params_json", "{}") or "{}")
                    pv = float(params.get(pname, "nan"))
                    is_clean = 1.0 if row.get("status") == "clean" else 0.0
                    labels[i] = [pv, is_clean]
                except Exception:
                    pass
            per_label[(t, fam, pname)] = labels

    sample_id_strs = [
        (f"{s[0]}:t{s[1]}:r{s[2]}" if len(s) == 3 else f"{s[0]}:t{s[1]}")
        for s in kept_samples
    ]
    result = {
        "sample_ids": sample_id_strs,
        "X": X,
        "feature_names": feature_names,
        "per_label": per_label,
        "groups": groups,
        "per_realization": per_realization,
        "expanded": expanded,
    }
    # Write to Redis (if reachable) AND disk (always). Redis is the
    # fast path; disk is the persistence-across-redis-restart fallback.
    payload = pickle.dumps(result, protocol=pickle.HIGHEST_PROTOCOL)
    if _r is not None:
        try:
            _r.set(redis_key, payload)
            print(f"  cached corpus to redis: {redis_key} "
                  f"({len(payload) / 1024:.1f} KB)", flush=True)
        except Exception as e:
            print(f"  redis cache write failed ({e})", flush=True)
    try:
        with disk_cache_path.open("wb") as f:
            f.write(payload)
        print(f"  cached corpus to disk: {disk_cache_path}", flush=True)
    except Exception as e:
        print(f"  disk cache write failed ({e}); continuing without cache",
              flush=True)
    return result


# ── Regression ──────────────────────────────────────────────────────────────

def _cv_r2(
    X_m: np.ndarray,
    log_y: np.ndarray,
    model_factory,
    n_folds: int,
    random_state: int,
) -> tuple[float, float]:
    """K-fold CV; returns (R², rmse). model_factory() returns a fresh
    fittable model with .fit(X, y) and .predict(X)."""
    kf = KFold(n_splits=n_folds, shuffle=True, random_state=random_state)
    preds = np.zeros_like(log_y)
    for train_idx, test_idx in kf.split(X_m):
        m = model_factory()
        m.fit(X_m[train_idx], log_y[train_idx])
        preds[test_idx] = m.predict(X_m[test_idx])
    ss_res = float(((log_y - preds) ** 2).sum())
    ss_tot = float(((log_y - log_y.mean()) ** 2).sum())
    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
    rmse = float(np.sqrt(((log_y - preds) ** 2).mean()))
    return r2, rmse


class _KNNWrap:
    """k-Nearest-Neighbors regression on standardized features. One
    hyperparameter (k). Distance-weighted so closer neighbors have
    proportionally more influence.

    Replacement for LightGBM at small N: LGBM has a notorious
    hyperparameter space and overfits aggressively on tens-of-samples
    regressions; k-NN has one knob and degrades gracefully."""

    def __init__(self, k: int = 3):
        self.scaler = StandardScaler()
        self.k = k
        self.model: KNeighborsRegressor | None = None

    def fit(self, X, y):
        Xs = self.scaler.fit_transform(X)
        k_eff = min(self.k, max(1, len(X) - 1))
        self.model = KNeighborsRegressor(n_neighbors=k_eff, weights="distance")
        self.model.fit(Xs, y)
        return self

    def predict(self, X):
        return self.model.predict(self.scaler.transform(X))


class _RidgeWrap:
    """RidgeCV on standardized features — a linear-baseline sanity check."""

    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RidgeCV(alphas=np.logspace(-2, 3, 20))

    def fit(self, X, y):
        Xs = self.scaler.fit_transform(X)
        self.model.fit(Xs, y)
        return self

    def predict(self, X):
        return self.model.predict(self.scaler.transform(X))


class _LightGBMWrap:
    """LightGBM regressor — trees, scale-invariant, no feature scaling.
    Hyperparameters are conservative defaults for small-to-medium N
    with L2 regularization and column/row subsampling. Adequate at our
    current scale; tunable later if more data or different behavior
    suggests it."""

    def __init__(self):
        self.params = {
            "objective": "regression",
            "metric": "rmse",
            "num_leaves": 15,
            "min_data_in_leaf": 5,
            "learning_rate": 0.05,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "lambda_l2": 0.1,
            "verbose": -1,
        }
        self.num_boost_round = 200
        self.booster = None

    def fit(self, X, y):
        train_set = lgb.Dataset(X, label=y)
        self.booster = lgb.train(self.params, train_set,
                                  num_boost_round=self.num_boost_round)
        return self

    def predict(self, X):
        return self.booster.predict(X)


def _signed_log1p(y: np.ndarray) -> np.ndarray:
    """sign(y) · log1p(|y|).  Approximately log-scaled for |y| ≫ 1
    (matches plain log when y > 0 and is large), approximately linear
    near 0, sign-respecting for negative values. Safe to apply
    uniformly to params that may be positive-only (H, κ) or sign-
    flexible (e.g. H_prime in sum_residual_hyperbolic)."""
    return np.sign(y) * np.log1p(np.abs(y))


def _cv_r2_grouped(
    X_m: np.ndarray,
    log_y: np.ndarray,
    groups: np.ndarray,
    model_factory,
    n_folds: int,
) -> tuple[float, float]:
    """Group-aware K-fold: ensures all samples from the same group
    (e.g. same position across realizations) land in either train or
    test, never split. Critical for per-realization data."""
    kf = GroupKFold(n_splits=n_folds)
    preds = np.zeros_like(log_y)
    for train_idx, test_idx in kf.split(X_m, log_y, groups=groups):
        m = model_factory()
        m.fit(X_m[train_idx], log_y[train_idx])
        preds[test_idx] = m.predict(X_m[test_idx])
    ss_res = float(((log_y - preds) ** 2).sum())
    ss_tot = float(((log_y - log_y.mean()) ** 2).sum())
    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
    rmse = float(np.sqrt(((log_y - preds) ** 2).mean()))
    return r2, rmse


def regress_one(
    X: np.ndarray,
    y: np.ndarray,
    mask: np.ndarray,
    groups: np.ndarray | None = None,
    n_folds: int = 5,
    random_state: int = 42,
    knn_k: int = 3,
) -> dict:
    """K-fold CV predicting signed-log(y) on rows where mask is True.
    Runs k-NN, Ridge, and LightGBM in parallel.

    If `groups` is provided, uses GroupKFold so samples from the same
    group never split across train/test (critical for per-realization
    data where multiple samples come from the same position)."""
    X_m = X[mask]
    y_m = y[mask]
    g_m = groups[mask] if groups is not None else None
    if len(X_m) < 2 * n_folds:
        return {"error": f"only {len(X_m)} clean samples; need ≥{2*n_folds}"}

    log_y = _signed_log1p(y_m)
    log_y_mean = float(log_y.mean())
    rmse_baseline = float(np.sqrt(((log_y - log_y_mean) ** 2).mean()))

    if log_y.std() < 1e-9:
        return {"error": f"labels have zero variance (all = {float(log_y[0]):.4g})"}

    use_grouped = g_m is not None and len(set(g_m)) >= n_folds

    if use_grouped:
        r2_knn, rmse_knn = _cv_r2_grouped(X_m, log_y, g_m, lambda: _KNNWrap(knn_k), n_folds)
        r2_ridge, rmse_ridge = _cv_r2_grouped(X_m, log_y, g_m, _RidgeWrap, n_folds)
        r2_lgbm, rmse_lgbm = _cv_r2_grouped(X_m, log_y, g_m, _LightGBMWrap, n_folds)
    else:
        r2_knn, rmse_knn = _cv_r2(X_m, log_y, lambda: _KNNWrap(knn_k), n_folds, random_state)
        r2_ridge, rmse_ridge = _cv_r2(X_m, log_y, _RidgeWrap, n_folds, random_state)
        r2_lgbm, rmse_lgbm = _cv_r2(X_m, log_y, _LightGBMWrap, n_folds, random_state)

    return {
        "n_samples": int(len(X_m)),
        "n_negative": int((y_m < 0).sum()),
        "grouped": use_grouped,
        "r2_knn": r2_knn,
        "r2_ridge": r2_ridge,
        "r2_lgbm": r2_lgbm,
        "rmse_knn": rmse_knn,
        "rmse_ridge": rmse_ridge,
        "rmse_lgbm": rmse_lgbm,
        "rmse_baseline_log": rmse_baseline,
        "log_y_mean": log_y_mean,
        "log_y_std": float(log_y.std()),
        "knn_k": knn_k,
    }


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels-csv", default=Path("/tmp/summary_averaged.csv"), type=Path,
                    help="long-format labels CSV from fit_averaged.py")
    ap.add_argument("--plot-dir", default=Path.home() / "plots", type=Path,
                    help="directory for output plots (default ~/plots)")
    ap.add_argument("--text-out",
                    default=Path.home() / "plots" / "regression_results.txt",
                    type=Path,
                    help="path for a text-format R² table the user can `cat`")
    args = ap.parse_args()

    print(f"=== loading corpus: labels={args.labels_csv}, features from Postgres ===")
    corpus = load_corpus(args.labels_csv)
    names = corpus["sample_ids"]
    X = corpus["X"]
    feature_names = corpus["feature_names"]
    per_label = corpus["per_label"]
    groups = corpus["groups"]
    per_realization = corpus["per_realization"]
    print(f"  {len(names)} samples, {len(feature_names)} features"
          f"{', grouped CV (by position)' if groups is not None else ''}")
    print()

    triples = sorted(per_label.keys())
    families = sorted({k[1] for k in triples})
    targets = sorted({k[0] for k in triples})

    print(f"=== signal-detection regression per (target, family, param) ===")
    results: dict[tuple[str, str, str], dict] = {}
    for (target, family, param_name) in triples:
        labels = per_label[(target, family, param_name)]
        vals = labels[:, 0]
        mask_clean = labels[:, 1] == 1.0
        n_clean = int(mask_clean.sum())
        r = regress_one(X, vals, mask_clean, groups=groups)
        results[(target, family, param_name)] = r
        if "error" in r:
            print(f"  [{target}|{family}|{param_name}] "
                  f"{n_clean} clean — SKIPPED ({r['error']})")
            continue
        best_r2 = max(r["r2_knn"], r["r2_ridge"], r["r2_lgbm"])
        verdict = "SIGNAL" if best_r2 > 0.10 else ("WEAK" if best_r2 > 0.0 else "NONE")
        print(f"  [{target}|{family}|{param_name}] n={n_clean} "
              f"knn={r['r2_knn']:+.3f}  ridge={r['r2_ridge']:+.3f}  "
              f"lgbm={r['r2_lgbm']:+.3f}  → {verdict}")

    # Text-format table
    args.text_out.parent.mkdir(parents=True, exist_ok=True)
    grouped_note = " (group-aware CV)" if groups is not None else ""
    with args.text_out.open("w") as f:
        f.write(f"# Regression R² (5-fold CV, signed-log target){grouped_note}\n")
        f.write(f"# {len(names)} samples, {len(feature_names)} features\n")
        f.write(f"# per_realization={per_realization}\n\n")
        f.write(f"  {'target':<28} {'family':<20} {'param':<12} {'n':>5} "
                f"{'knn R²':>9} {'ridge R²':>10} {'lgbm R²':>10}  verdict\n")
        for (target, family, param_name), r in sorted(results.items()):
            if "error" in r:
                f.write(f"  {target:<28} {family:<20} {param_name:<12} "
                        f"{'':>5} {'':>9} {'':>10} {'':>10}  SKIPPED: {r['error']}\n")
                continue
            best_r2 = max(r["r2_knn"], r["r2_ridge"], r["r2_lgbm"])
            verdict = "SIGNAL" if best_r2 > 0.10 else ("WEAK" if best_r2 > 0.0 else "NONE")
            f.write(f"  {target:<28} {family:<20} {param_name:<12} "
                    f"{r['n_samples']:>5} {r['r2_knn']:+9.3f} {r['r2_ridge']:+10.3f} "
                    f"{r['r2_lgbm']:+10.3f}  {verdict}\n")
    print(f"\n  text table: {args.text_out}")

    # Plot grid (one heatmap per family, models side by side as columns).
    print(f"=== generating R² heatmaps per family ===")
    args.plot_dir.mkdir(parents=True, exist_ok=True)
    for family in families:
        fam_params = sorted({p for (t, f, p) in triples if f == family})
        if not fam_params:
            continue
        plot_path = args.plot_dir / f"regression_r2_{family}.png"
        fig, axes = plt.subplots(1, 3, figsize=(5 + 2 * len(fam_params), 4),
                                  squeeze=False)
        axes = axes[0]
        for ax_idx, (model_key, title) in enumerate([
            ("r2_knn", "k-NN (k=3, distance-weighted)"),
            ("r2_ridge", "Ridge (linear)"),
            ("r2_lgbm", "LightGBM"),
        ]):
            ax = axes[ax_idx]
            matrix = np.full((len(targets), len(fam_params)), np.nan)
            for i, t in enumerate(targets):
                for j, p in enumerate(fam_params):
                    r = results.get((t, family, p))
                    if r is not None and model_key in r:
                        matrix[i, j] = r[model_key]
            im = ax.imshow(matrix, cmap="RdYlGn", vmin=-0.3, vmax=0.5, aspect="auto")
            ax.set_xticks(range(len(fam_params)))
            ax.set_xticklabels(fam_params)
            ax.set_yticks(range(len(targets)))
            ax.set_yticklabels(targets)
            for i in range(len(targets)):
                for j in range(len(fam_params)):
                    val = matrix[i, j]
                    if not np.isnan(val):
                        ax.text(j, i, f"{val:+.2f}", ha="center", va="center",
                                color="black" if abs(val) < 0.3 else "white", fontsize=10)
            plt.colorbar(im, ax=ax, label="R² (CV)")
            ax.set_title(title)
        fig.suptitle(f"Family={family}: CV R² for features → log(param)  "
                     f"({len(names)} positions, 5-fold CV)")
        fig.tight_layout()
        fig.savefig(plot_path, dpi=110)
        print(f"  plot: {plot_path}")

    # Note: k-NN and Ridge don't have natural "feature importance" in
    # the gradient/gain sense LGBM exposes. If we want post-hoc importance
    # at this stage, sklearn's permutation_importance on the trained
    # final model would be the principled choice — adds compute but no
    # new hyperparameters. Skipped for now while sample size is small.


if __name__ == "__main__":
    main()
