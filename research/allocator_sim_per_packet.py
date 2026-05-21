"""
research/allocator_sim_per_packet.py

Per-packet stability-classifier allocator. Generalizes the single-
cutoff allocator_sim_stability.py to a per-V_t framing aligned with
the optimal-stopping reformulation:

  At every observable V_t (cutoff along the V_grid), the allocator's
  classifier predicts P(top-1 at V_t is stable through to budget).
  Stopping rule: terminate at the first V_t where P(stable) > τ.

Substrate (vs the v2 single-cutoff allocator):

  Phase A — per (position, realization, extractor), compute a
  length-K array of stable_fractions, one per cutoff index along the
  position's V_grid. K = len(CUTOFF_INDICES). The cache is stamped
  with cache_schema_version "v3_per_packet" so old caches force-
  invalidate; cutoff_indices and V_max_query (per f_max) are also
  stamped so a change in window definition triggers re-fetch.

  Phase B — substrate has K rows per (position, realization): each
  row has phase35 (constant) + trajectory features over
  [V_lo, V_grid[cutoff_idx]] (varies per cutoff) + cutoff features
  (log V_t, cutoff_idx / N_GRID). Label = stable_fraction[cutoff_idx]
  ≥ threshold. One classifier per (extractor × threshold) cell, with
  GroupKFold(by position) on year2k → OOD eval on cards.

  Sim — per cards.db position, walk cutoffs in order; at each cutoff
  query the classifier, terminate at first V_t where P > τ; else
  continue to V_max. Sweep τ for Pareto curves.

Single-cutoff allocator_sim_stability.py remains as the baseline
reference. Comparison expected once the per-packet sweep runs.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import os
import pickle
import sys
import time
from pathlib import Path
from typing import Any, Callable

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import roc_auc_score, log_loss
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
from allocator_sim import (  # noqa: E402
    build_feature_row, modal_top1_at_v_max,
    baseline_always_vmax_agreement,
)
from allocator_sim_stability import (  # noqa: E402
    STATELESS_EXTRACTORS, STATEFUL_EXTRACTORS, all_extractor_names,
    _modal_top1_at_idx,
    _NO_VAL,
)
from pg_sink import (  # noqa: E402
    connect, count_thin_coverage,
    fetch_positions_bundle_lossless_batch,
    fetch_positions_bundle_thin_batch,
)
from stability_trajectory import StabilityTrajectory  # noqa: E402


# ── Per-packet cutoff configuration ────────────────────────────────────────

# Grid indices at which to evaluate the per-packet classifier. Same set
# the diagnose_per_v_curves.py diagnostic used, so curve shapes are
# directly comparable. Indices span the log-budget axis from ~0.08 to
# ~0.90.
CUTOFF_INDICES = (4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44)

# ── Cache layout ───────────────────────────────────────────────────────────

CACHE_DIR = Path(__file__).resolve().parent / "data" / "stability_cache_per_packet"

# v3_per_packet: array-of-K stable_fractions per (realization, extractor)
# instead of v2's scalar; cutoff_indices and V_max_query are stamped so
# any change in window definition invalidates entries.
CACHE_SCHEMA_VERSION = "v3_per_packet"


def cache_path_for_position(stem: str, turn: int) -> Path:
    shard = stem[:1] if stem else "_"
    return CACHE_DIR / shard / f"{stem}_t{turn}.pkl"


def load_cached_position(stem: str, turn: int) -> dict | None:
    p = cache_path_for_position(stem, turn)
    if not p.exists():
        return None
    try:
        with p.open("rb") as f:
            return pickle.load(f)
    except Exception:
        return None


def save_cached_position(stem: str, turn: int, data: dict) -> None:
    p = cache_path_for_position(stem, turn)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    with tmp.open("wb") as f:
        pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    tmp.replace(p)


# Redis is intentionally NOT mirrored here — the per-packet cache is
# bulkier than v2 (K floats per realization × extractor instead of 1)
# and disk is sufficient. Reintroduce Redis mirror later if cache miss
# rate becomes a bottleneck.


# ── Phase A: per-packet stability data ─────────────────────────────────────

def compute_position_stability_data_per_packet(
    bundle: dict, cutoff_Vs: np.ndarray, V_max_query: float,
) -> dict | None:
    """For one position's lossless packet bundle, compute per-
    (realization, extractor) the length-K array of stable_fractions
    at each `cutoff_Vs[k]` (V_term) with V_max=V_max_query. Returns

      {
        "realizations": {
          r_idx: {
            "stable_fractions": {
              extractor_name: np.ndarray(shape=(K,), dtype=float64),
            },
          },
          ...
        }
      }

    Cells where the realization's first change-point precedes the
    cutoff are NaN (V_t not observable for that realization).

    Single-pass implementation: each realization's packets are walked
    once; all extractors' change-point streams accumulate inline;
    after the walk, each extractor's trajectory is built once and
    stable_fraction_logV is evaluated at each cutoff_V."""
    K = len(cutoff_Vs)
    if K == 0 or V_max_query <= 0.0:
        return None
    out_reals: dict[int, dict] = {}
    stateless_items = list(STATELESS_EXTRACTORS.items())
    stateful_items = list(STATEFUL_EXTRACTORS.items())
    UNK = StabilityTrajectory._UNKNOWN
    for r_idx, packets in bundle.items():
        if not packets:
            continue
        active: list[tuple[str, Callable]] = list(stateless_items)
        for name, factory in stateful_items:
            active.append((name, factory()))
        n_ex = len(active)
        cps_list: list[list[tuple[float, Any]]] = [[] for _ in range(n_ex)]
        last_val: list[Any] = [_NO_VAL] * n_ex
        last_V = 0.0
        n_packets = 0
        for _t_pkt, pkt in packets:
            root = pkt.get("rootInfo") or {}
            V = float(root.get("visits", 0))
            for ei in range(n_ex):
                val = active[ei][1](pkt)
                tagged = val if val is not None else UNK
                if last_val[ei] is _NO_VAL or tagged != last_val[ei]:
                    cps_list[ei].append((V, tagged))
                    last_val[ei] = tagged
            last_V = V
            n_packets += 1
        if n_packets == 0:
            continue
        per_extr: dict[str, np.ndarray] = {}
        for ei in range(n_ex):
            name = active[ei][0]
            traj = StabilityTrajectory.from_changepoints(
                cps_list[ei], V_max=last_V, n_packets=n_packets,
            )
            row = np.full(K, np.nan, dtype=np.float64)
            for k, V_t in enumerate(cutoff_Vs):
                if V_t <= 0.0 or V_t >= V_max_query:
                    continue
                if V_t > last_V:
                    continue  # past the realization's recorded ceiling
                frac, _ = traj.stable_fraction_logV(
                    float(V_t), V_max=V_max_query,
                )
                if np.isfinite(frac):
                    row[k] = float(frac)
            per_extr[name] = row
        out_reals[int(r_idx)] = {"stable_fractions": per_extr}
    if not out_reals:
        return None
    return {"realizations": out_reals}


# ── Worker (thin-fetch + per-packet compute) ───────────────────────────────

_WORKER_CONN = None
_USE_THIN = False


def _worker_init() -> None:
    global _WORKER_CONN
    _WORKER_CONN = connect()


def _worker_fetch_and_compute_per_packet(
    chunk: list[tuple[str, int, np.ndarray, float]],
) -> dict:
    """Per-chunk worker: fetch a batch of position bundles via thin
    path (or lossless fallback), compute the per-packet stability data
    for each, return dict (stem, turn) → data."""
    if not chunk:
        return {}
    conn = _WORKER_CONN if _WORKER_CONN is not None else connect()
    keys = [(s, t) for s, t, _cv, _vmax in chunk]
    fetch_fn = (
        fetch_positions_bundle_thin_batch
        if _USE_THIN
        else fetch_positions_bundle_lossless_batch
    )
    try:
        bundles = fetch_fn(conn, keys)
    except Exception as e:
        return {"__error__": f"fetch failed: {e}"}
    out: dict = {}
    for stem, turn, cutoff_Vs, V_max_query in chunk:
        bundle = bundles.get((stem, turn))
        if not bundle:
            continue
        data = compute_position_stability_data_per_packet(
            bundle, cutoff_Vs, V_max_query,
        )
        if data is None:
            continue
        data["cutoff_Vs"] = list(map(float, cutoff_Vs))
        data["V_max_query"] = float(V_max_query)
        data["cache_schema_version"] = CACHE_SCHEMA_VERSION
        out[(stem, turn)] = data
    return out


# ── Phase A orchestrator ───────────────────────────────────────────────────

def phase_a_build_per_packet(
    cache: dict, f_max: float = 1.0,
    force_rebuild: bool = False,
    workers: int = 4, batch_size: int = 8,
) -> dict:
    """Phase A: per-(position, realization, extractor) length-K arrays
    of stable_fractions, one per CUTOFF_INDICES entry. Cached to disk
    keyed by (stem, turn) and stamped with (cutoff_indices, V_max_query,
    schema_version)."""
    stems = cache["stems"]
    turns = cache["turns"]
    V_lo_arr = cache["V_lo"]
    V_hi_arr = cache["V_hi"]
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    n_total = len(stems)
    cutoff_indices = list(CUTOFF_INDICES)
    if not (0.0 < f_max <= 1.0):
        raise ValueError(f"f_max must be in (0, 1]; got {f_max}")
    max_idx = min(N_GRID - 1, max(max(cutoff_indices) + 1,
                                  int(round(N_GRID * f_max)) - 1))

    print(f"  N_GRID={N_GRID}, cutoff_indices={cutoff_indices}, max_idx={max_idx}, "
          f"f_max={f_max:.3f}", flush=True)
    print(f"  schema={CACHE_SCHEMA_VERSION} (per-packet log-V weighted)", flush=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[tuple[str, int], dict] = {}
    n_hit_disk = 0
    n_skipped = 0
    n_fetched = 0
    n_errors = 0

    scan_step = max(200, n_total // 8)
    to_fetch: list[tuple[str, int, np.ndarray, float, int]] = []

    def _is_cache_hit(
        entry: dict | None, cutoff_Vs: np.ndarray, V_max_query: float,
    ) -> bool:
        if entry is None:
            return False
        if entry.get("cache_schema_version") != CACHE_SCHEMA_VERSION:
            return False
        if entry.get("V_max_query") != float(V_max_query):
            return False
        cached_Vs = entry.get("cutoff_Vs")
        if cached_Vs is None or len(cached_Vs) != len(cutoff_Vs):
            return False
        for a, b in zip(cached_Vs, cutoff_Vs):
            if abs(float(a) - float(b)) > 1e-6:
                return False
        return True

    for i in range(n_total):
        stem = str(stems[i])
        turn = int(turns[i])
        V_lo = float(V_lo_arr[i])
        V_hi = float(V_hi_arr[i])
        if not (np.isfinite(V_lo) and np.isfinite(V_hi) and V_lo < V_hi):
            n_skipped += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        cutoff_Vs = np.array([V_grid[k] for k in cutoff_indices], dtype=np.float64)
        V_max_query = float(V_grid[max_idx])

        if not force_rebuild:
            cached = load_cached_position(stem, turn)
            if _is_cache_hit(cached, cutoff_Vs, V_max_query):
                results[(stem, turn)] = cached
                n_hit_disk += 1
                if (i + 1) % scan_step == 0:
                    print(f"  scan progress: {i + 1}/{n_total} "
                          f"(disk_hits={n_hit_disk} skipped={n_skipped} "
                          f"pending={len(to_fetch)})", flush=True)
                continue
        to_fetch.append((stem, turn, cutoff_Vs, V_max_query, i))
        if (i + 1) % scan_step == 0:
            print(f"  scan progress: {i + 1}/{n_total} "
                  f"(disk_hits={n_hit_disk} skipped={n_skipped} "
                  f"pending={len(to_fetch)})", flush=True)

    print(f"  cache scan: {n_hit_disk} disk hits, {n_skipped} skipped, "
          f"{len(to_fetch)} to fetch from Postgres", flush=True)

    if not to_fetch:
        return results

    chunks: list[list[tuple[str, int, np.ndarray, float]]] = []
    for k in range(0, len(to_fetch), batch_size):
        chunk = [(s, t, cv, vm)
                 for s, t, cv, vm, _i in to_fetch[k:k + batch_size]]
        chunks.append(chunk)
    n_chunks = len(chunks)
    print(f"  parallel fetch: workers={workers}  chunks={n_chunks}  "
          f"batch_size={batch_size}", flush=True)

    t_fetch_start = time.monotonic()
    chunks_done = 0
    positions_done = 0
    with mp.Pool(processes=workers, initializer=_worker_init) as pool:
        for res in pool.imap_unordered(_worker_fetch_and_compute_per_packet, chunks):
            if "__error__" in res:
                print(f"  worker FAILED chunk: {res['__error__']}", flush=True)
                n_errors += 1
            else:
                for (s, t), data in res.items():
                    save_cached_position(s, t, data)
                    results[(s, t)] = data
                    n_fetched += 1
            chunks_done += 1
            positions_done = min(chunks_done * batch_size, len(to_fetch))
            dt = time.monotonic() - t_fetch_start
            rate = positions_done / max(dt, 1e-9)
            eta = (len(to_fetch) - positions_done) / max(rate, 1e-9)
            print(f"  batch [{chunks_done}/{n_chunks}] positions "
                  f"{positions_done}/{len(to_fetch)} {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s eta {eta:.0f}s  "
                  f"fetch_total={n_fetched} err={n_errors}", flush=True)

    return results


# ── Phase B substrate (K rows per (position, realization)) ─────────────────

def build_phase_b_substrate_per_packet(
    cache: dict, stability_data: dict, f_max: float = 1.0,
) -> dict:
    """Build the Phase B substrate where each (position, realization,
    cutoff_idx) is one row. Features:
      - phase35 (23 dims, position-level constant)
      - trajectory features over [V_lo, V_grid[cutoff_idx]]  (13 dims)
      - log(V_t)                                              (1 dim)
      - cutoff_idx / (N_GRID - 1)                             (1 dim)

    Per-row labels per extractor are computed downstream by
    `materialize_labels_for_cell`. The substrate carries the
    per-(row, extractor) stable_fraction floats so the materialization
    per (extractor, threshold) cell is just a binarize."""
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    domains_full = np.array(cache["domains"], dtype=object)
    stems_cache = np.array(cache["stems"], dtype=object)
    turns_cache = np.array(cache["turns"], dtype=np.int32)
    V_lo_arr = np.asarray(cache["V_lo"], dtype=np.float64)
    V_hi_arr = np.asarray(cache["V_hi"], dtype=np.float64)
    cutoff_indices = list(CUTOFF_INDICES)
    K = len(cutoff_indices)
    extractor_names = all_extractor_names()

    X_rows: list[np.ndarray] = []
    g_rows: list[int] = []
    d_rows: list[Any] = []
    cutoff_rows: list[int] = []
    fracs_by_extr: dict[str, list[float]] = {name: [] for name in extractor_names}

    n_pos_used = 0
    n_pos_skipped = 0

    for i in range(len(stems_cache)):
        stem = str(stems_cache[i])
        turn = int(turns_cache[i])
        pos_data = stability_data.get((stem, turn))
        if pos_data is None:
            n_pos_skipped += 1
            continue
        V_lo = float(V_lo_arr[i])
        V_hi = float(V_hi_arr[i])
        if not (np.isfinite(V_lo) and np.isfinite(V_hi) and V_lo < V_hi):
            n_pos_skipped += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cache["y_mean_scoreLead_drift"][i]
        if not np.isfinite(y_mean).all():
            n_pos_skipped += 1
            continue

        # Pre-compute the feature row per cutoff_idx for this position.
        # phase35 + trajectory_features over [V_lo, V_grid[k]] + cutoff
        # features. Trajectory features depend on the window length;
        # build_feature_row's window_frac arg is converted to a slice
        # length via cutoff = round(N_GRID * window_frac), so we pass
        # (cutoff_idx + 1) / N_GRID to get exactly the inclusive window.
        per_cutoff_feature_rows: dict[int, np.ndarray] = {}
        log_N = float(N_GRID - 1)
        for cidx in cutoff_indices:
            win_frac = (cidx + 1) / N_GRID
            base = build_feature_row(
                cache["phase35"][i], V_grid, y_mean, window_frac=win_frac,
            )
            if base is None:
                continue
            V_t = float(V_grid[cidx])
            cutoff_feats = np.array(
                [np.log(V_t), cidx / log_N], dtype=np.float64,
            )
            per_cutoff_feature_rows[cidx] = np.concatenate([base, cutoff_feats])
        if not per_cutoff_feature_rows:
            n_pos_skipped += 1
            continue
        n_pos_used += 1

        # Emit one row per (realization, cutoff_idx) where the feature
        # row + at least one extractor's stable_fraction is finite.
        for r_idx, real_data in pos_data["realizations"].items():
            sfracs_arr = real_data["stable_fractions"]
            for k_pos, cidx in enumerate(cutoff_indices):
                if cidx not in per_cutoff_feature_rows:
                    continue
                # Collect this row's per-extractor fractions; require at
                # least one extractor to have a finite value (otherwise
                # the row is uninformative for every cell and dropped).
                any_finite = False
                row_fracs: dict[str, float] = {}
                for name in extractor_names:
                    arr = sfracs_arr.get(name)
                    f = float("nan")
                    if arr is not None and k_pos < len(arr):
                        v = arr[k_pos]
                        if v is not None and np.isfinite(v):
                            f = float(v)
                            any_finite = True
                    row_fracs[name] = f
                if not any_finite:
                    continue
                X_rows.append(per_cutoff_feature_rows[cidx])
                g_rows.append(i)
                d_rows.append(domains_full[i])
                cutoff_rows.append(cidx)
                for name in extractor_names:
                    fracs_by_extr[name].append(row_fracs[name])

    if not X_rows:
        empty = np.empty(0)
        return {
            "X": empty.reshape(0, 0),
            "groups": empty.astype(np.int64),
            "domains": np.array([], dtype=object),
            "cutoff_idx": empty.astype(np.int32),
            "frac_by_extractor": {name: empty for name in extractor_names},
            "extractor_names": extractor_names,
            "cutoff_indices": cutoff_indices,
            "n_pos_used": n_pos_used,
            "n_pos_skipped": n_pos_skipped,
        }

    return {
        "X": np.array(X_rows, dtype=np.float64),
        "groups": np.array(g_rows, dtype=np.int64),
        "domains": np.array(d_rows, dtype=object),
        "cutoff_idx": np.array(cutoff_rows, dtype=np.int32),
        "frac_by_extractor": {
            name: np.array(arr, dtype=np.float64)
            for name, arr in fracs_by_extr.items()
        },
        "extractor_names": extractor_names,
        "cutoff_indices": cutoff_indices,
        "n_pos_used": n_pos_used,
        "n_pos_skipped": n_pos_skipped,
    }


def materialize_labels_for_cell(
    substrate: dict, extractor_name: str, threshold: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Per-(extractor, threshold) materialization. Returns
    (X, y, groups, domains, cutoff_idx) with rows where the extractor's
    stable_fraction is finite. Cutoff_idx is carried so the OOD eval
    can stratify by cutoff if useful."""
    frac = substrate["frac_by_extractor"].get(extractor_name)
    if frac is None or len(frac) == 0:
        F = substrate["X"].shape[1] if substrate["X"].ndim == 2 else 0
        return (
            np.empty((0, F)),
            np.empty(0, dtype=np.int32),
            np.empty(0, dtype=np.int64),
            np.empty(0, dtype=object),
            np.empty(0, dtype=np.int32),
        )
    mask = np.isfinite(frac)
    if not mask.any():
        F = substrate["X"].shape[1]
        return (
            np.empty((0, F)),
            np.empty(0, dtype=np.int32),
            np.empty(0, dtype=np.int64),
            np.empty(0, dtype=object),
            np.empty(0, dtype=np.int32),
        )
    X = substrate["X"][mask]
    y = (frac[mask] >= threshold).astype(np.int32)
    g = substrate["groups"][mask]
    d = substrate["domains"][mask]
    c = substrate["cutoff_idx"][mask]
    return X, y, g, d, c


# ── Classifier train + eval ────────────────────────────────────────────────

def train_classifier_and_eval(
    X: np.ndarray, y: np.ndarray, g: np.ndarray, d: np.ndarray, n_folds: int,
) -> dict:
    """Train LightGBM with GroupKFold on year2k, full-fit + OOD eval on
    cards. Same hyperparameters as the v2 single-cutoff classifier so
    the comparison is honest."""
    import lightgbm as lgb
    y2k = d == "year2k"
    cards = d == "cards"
    if y2k.sum() < 4 * n_folds:
        return {"error": f"year2k too small: {y2k.sum()}"}
    X_y2k, y_y2k, g_y2k = X[y2k], y[y2k], g[y2k]
    X_cards, y_cards = X[cards], y[cards]
    if len(set(y_y2k.tolist())) < 2:
        return {"error": "year2k all one class"}

    kf = GroupKFold(n_splits=n_folds)
    probs_within = np.zeros(len(y_y2k))
    for tr, te in kf.split(X_y2k, y_y2k, groups=g_y2k):
        if len(set(y_y2k[tr].tolist())) < 2:
            probs_within[te] = float(y_y2k[tr].mean())
            continue
        m = lgb.LGBMClassifier(
            n_estimators=200, num_leaves=15, min_data_in_leaf=5,
            learning_rate=0.05, reg_lambda=0.1, verbose=-1,
        )
        m.fit(X_y2k[tr], y_y2k[tr])
        probs_within[te] = m.predict_proba(X_y2k[te])[:, 1]
    pos_rate_y2k = float((y_y2k == 1).mean())
    try:
        auc_within = float(roc_auc_score(y_y2k, probs_within))
    except ValueError:
        auc_within = float("nan")
    eps = 1e-9
    pw = np.clip(probs_within, eps, 1 - eps)
    try:
        ll_within = float(log_loss(y_y2k, pw))
    except ValueError:
        ll_within = float("nan")

    m_full = lgb.LGBMClassifier(
        n_estimators=200, num_leaves=15, min_data_in_leaf=5,
        learning_rate=0.05, reg_lambda=0.1, verbose=-1,
    )
    m_full.fit(X_y2k, y_y2k)
    if len(X_cards) > 0:
        probs_ood = m_full.predict_proba(X_cards)[:, 1]
        try:
            auc_ood = float(roc_auc_score(y_cards, probs_ood))
        except ValueError:
            auc_ood = float("nan")
        po = np.clip(probs_ood, eps, 1 - eps)
        try:
            ll_ood = float(log_loss(y_cards, po))
        except ValueError:
            ll_ood = float("nan")
        pos_rate_cards = float((y_cards == 1).mean())
    else:
        auc_ood = ll_ood = float("nan")
        pos_rate_cards = float("nan")
    return {
        "n_y2k": int(y2k.sum()), "n_cards": int(cards.sum()),
        "pos_rate_y2k": pos_rate_y2k, "pos_rate_cards": pos_rate_cards,
        "auc_within": auc_within, "auc_ood": auc_ood,
        "log_loss_within": ll_within, "log_loss_ood": ll_ood,
        "predictor": m_full,
    }


# ── Allocator sim: walk cutoffs, stop at first P > τ ───────────────────────

def pareto_frontier_indices(
    visits: np.ndarray, agreement: np.ndarray,
) -> np.ndarray:
    """Indices into (visits, agreement) of the Pareto-optimal subset
    (minimize visits, maximize agreement).

    A point i is dominated iff there exists some j with
        visits[j] <= visits[i]  AND  agreement[j] >= agreement[i]
        AND (visits[j] < visits[i]  OR  agreement[j] > agreement[i]).
    The frontier is the non-dominated subset, returned sorted by
    visits ascending.

    O(N²) brute force; N=19 here so this is fine. For our τ sweep the
    frontier filters out τ values that produce strictly worse operating
    points than smaller τ values."""
    n = len(visits)
    if n == 0:
        return np.empty(0, dtype=np.int64)
    keep = np.zeros(n, dtype=bool)
    for i in range(n):
        vi, ai = float(visits[i]), float(agreement[i])
        if not (np.isfinite(vi) and np.isfinite(ai)):
            continue
        dominated = False
        for j in range(n):
            if i == j:
                continue
            vj, aj = float(visits[j]), float(agreement[j])
            if not (np.isfinite(vj) and np.isfinite(aj)):
                continue
            if vj <= vi and aj >= ai and (vj < vi or aj > ai):
                dominated = True
                break
        if not dominated:
            keep[i] = True
    idx = np.where(keep)[0]
    order = np.argsort(visits[idx])
    return idx[order]


def _precompute_cards_per_packet_sim_substrate(
    cards_data: dict, f_max: float = 1.0,
) -> dict:
    """Per-cards-position precomputation for the per-packet sim. Builds:
      - feature_rows_by_cutoff[k]: (n_pos, F) array of features at
        cutoff_indices[k] for each position (NaN if not buildable)
      - V_at_cutoff[k]:   (n_pos,) absolute V at cutoff k (NaN if invalid)
      - agree_at_cutoff[k]: (n_pos,) modal-top-1 agreement at cutoff k
      - V_max: (n_pos,) V at the f_max-budget endpoint
      - agree_at_V_max: (n_pos,) agreement at the budget endpoint
      - valid: (n_pos,) bool, True if at least one cutoff has data AND
                  the budget-endpoint agreement is observable.

    Per-tau decision then reduces to (per τ):
      - For each position, find the smallest k where P_k > τ (else None).
      - V_term = V_at_cutoff[k] if k else V_max
      - agreement = agree_at_cutoff[k] if k else agree_at_V_max"""
    n_pos = len(cards_data["stems"])
    N_GRID = int(cards_data["N_GRID"])
    cutoff_indices = list(CUTOFF_INDICES)
    K = len(cutoff_indices)
    max_idx = min(N_GRID - 1, max(max(cutoff_indices) + 1,
                                  int(round(N_GRID * f_max)) - 1))

    log_N = float(N_GRID - 1)
    F_template: np.ndarray | None = None
    feature_rows_by_cutoff: list[np.ndarray] = []  # K (n_pos, F) arrays
    V_at_cutoff = np.full((K, n_pos), np.nan)
    agree_at_cutoff = np.full((K, n_pos), np.nan)
    V_max_arr = np.full(n_pos, np.nan)
    agree_at_V_max = np.full(n_pos, np.nan)
    valid = np.zeros(n_pos, dtype=bool)

    for ci in range(n_pos):
        V_lo = float(cards_data["V_lo"][ci])
        V_hi = float(cards_data["V_hi"][ci])
        if not (np.isfinite(V_lo) and np.isfinite(V_hi) and V_lo < V_hi):
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cards_data["y_mean_scoreLead_drift"][ci]
        if not np.isfinite(y_mean).all():
            continue
        top1_realiz = cards_data["top1_realiz"][ci]
        modal_v_max = _modal_top1_at_idx(top1_realiz, max_idx)
        if modal_v_max < 0:
            continue
        # Per-cutoff features + agreement.
        cell_any_built = False
        for k_pos, cidx in enumerate(cutoff_indices):
            if cidx >= N_GRID:
                continue
            win_frac = (cidx + 1) / N_GRID
            base = build_feature_row(
                cards_data["phase35"][ci], V_grid, y_mean,
                window_frac=win_frac,
            )
            if base is None:
                continue
            V_t = float(V_grid[cidx])
            cutoff_feats = np.array([np.log(V_t), cidx / log_N],
                                    dtype=np.float64)
            row = np.concatenate([base, cutoff_feats])
            if F_template is None:
                F_template = row
                for _ in range(K):
                    feature_rows_by_cutoff.append(
                        np.full((n_pos, row.shape[0]), np.nan),
                    )
            feature_rows_by_cutoff[k_pos][ci] = row
            V_at_cutoff[k_pos, ci] = V_t
            # Agreement at this cutoff vs modal-top-1 at budget endpoint.
            agree_count = 0
            real_count = 0
            for r in range(top1_realiz.shape[0]):
                t1 = int(top1_realiz[r, cidx])
                if t1 < 0:
                    continue
                if t1 == modal_v_max:
                    agree_count += 1
                real_count += 1
            if real_count > 0:
                agree_at_cutoff[k_pos, ci] = agree_count / real_count
            cell_any_built = True

        # Budget-endpoint V + agreement.
        V_max_arr[ci] = float(V_grid[max_idx])
        agree_count = 0
        real_count = 0
        for r in range(top1_realiz.shape[0]):
            t1 = int(top1_realiz[r, max_idx])
            if t1 < 0:
                continue
            if t1 == modal_v_max:
                agree_count += 1
            real_count += 1
        if real_count > 0:
            agree_at_V_max[ci] = agree_count / real_count

        if cell_any_built and np.isfinite(agree_at_V_max[ci]):
            valid[ci] = True

    return {
        "feature_rows_by_cutoff": feature_rows_by_cutoff,
        "V_at_cutoff": V_at_cutoff,
        "agree_at_cutoff": agree_at_cutoff,
        "V_max": V_max_arr,
        "agree_at_V_max": agree_at_V_max,
        "valid": valid,
        "cutoff_indices": cutoff_indices,
    }


def simulate_per_packet_allocator(
    sim_substrate: dict, predictor, tau_grid: np.ndarray,
) -> dict:
    """For each τ, walk cutoffs in order per position; stop at the
    first V_t where P(stable) > τ. Vector-compute the per-cutoff P
    once (one batched predict_proba per cutoff) then derive per-τ
    decisions cheaply."""
    valid = sim_substrate["valid"]
    if not valid.any():
        zeros = np.zeros(len(tau_grid))
        return {
            "tau": tau_grid, "avg_visits": zeros,
            "agreement": zeros, "terminate_frac": zeros,
            "mean_stop_cutoff_idx": zeros,
        }
    cutoff_indices = sim_substrate["cutoff_indices"]
    feature_rows_by_cutoff = sim_substrate["feature_rows_by_cutoff"]
    V_at_cutoff = sim_substrate["V_at_cutoff"]
    agree_at_cutoff = sim_substrate["agree_at_cutoff"]
    V_max_arr = sim_substrate["V_max"]
    agree_at_V_max = sim_substrate["agree_at_V_max"]
    K = len(cutoff_indices)
    n_pos = len(valid)

    # Per-cutoff P(stable) for every valid position. One batched
    # predict_proba per cutoff over rows whose features are finite.
    P_by_cutoff = np.full((K, n_pos), np.nan)
    for k in range(K):
        X = feature_rows_by_cutoff[k]
        row_ok = np.isfinite(X).all(axis=1) & valid
        if not row_ok.any():
            continue
        try:
            P = predictor.predict_proba(X[row_ok])[:, 1]
            P_by_cutoff[k, row_ok] = P
        except Exception:
            pass

    avg_visits = np.zeros(len(tau_grid))
    agreement = np.zeros(len(tau_grid))
    terminate_frac = np.zeros(len(tau_grid))
    mean_stop_idx = np.zeros(len(tau_grid))

    for ti, tau in enumerate(tau_grid):
        # For each valid position, find the smallest k with P > τ.
        # K small enough that an explicit loop over k is cheap.
        chosen_k = np.full(n_pos, -1, dtype=np.int32)
        for k in range(K):
            mask = (chosen_k < 0) & valid & np.isfinite(P_by_cutoff[k]) \
                   & (P_by_cutoff[k] > tau)
            chosen_k[mask] = k
        # Visits + agreement per position based on chosen_k.
        terminated = chosen_k >= 0
        V_picked = np.where(
            terminated,
            np.where(terminated, V_at_cutoff[np.clip(chosen_k, 0, K - 1),
                                              np.arange(n_pos)], V_max_arr),
            V_max_arr,
        )
        A_picked = np.where(
            terminated,
            np.where(terminated, agree_at_cutoff[np.clip(chosen_k, 0, K - 1),
                                                 np.arange(n_pos)],
                     agree_at_V_max),
            agree_at_V_max,
        )
        # Restrict to positions whose budget-endpoint agreement is observable.
        keep = valid & np.isfinite(A_picked) & np.isfinite(V_picked)
        if not keep.any():
            continue
        avg_visits[ti] = V_picked[keep].mean()
        agreement[ti] = A_picked[keep].mean()
        terminate_frac[ti] = float(terminated[keep].sum() / keep.sum())
        # Among terminated, mean cutoff_idx (in [0, K-1]) at which we stopped.
        term_keep = keep & terminated
        if term_keep.any():
            mean_stop_idx[ti] = float(chosen_k[term_keep].mean())

    return {
        "tau": tau_grid,
        "avg_visits": avg_visits,
        "agreement": agreement,
        "terminate_frac": terminate_frac,
        "mean_stop_cutoff_idx": mean_stop_idx,
    }


# ── slice_cache copy (independent from allocator_sim_stability) ────────────

def slice_cache(cache: dict, idx: np.ndarray) -> dict:
    domains = np.array(cache["domains"], dtype=object)
    out = {}
    for k, v in cache.items():
        v = np.asarray(v)
        if v.ndim > 0 and v.shape[0] == len(domains):
            out[k] = v[idx]
        else:
            out[k] = v
    out["N_GRID"] = int(np.asarray(cache["N_GRID"]).flat[0])
    return out


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
        type=Path,
    )
    ap.add_argument(
        "--out-dir",
        default=Path.home() / "plots" / "allocator_pareto_per_packet",
        type=Path,
    )
    ap.add_argument("--f-max", default=1.0, type=float,
                    help="Log-budget fraction defining the upper bound. "
                         "Default 1.0 (full recorded trajectory).")
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--force-rebuild", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--extractors", nargs="+", default=None)
    ap.add_argument("--thresholds", nargs="+", type=float,
                    default=[0.80, 0.90, 0.95, 0.97, 0.99])
    ap.add_argument("--max-positions", type=int, default=None,
                    help="Limit cache to first N positions (smoke testing).")
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    extractors = args.extractors or all_extractor_names()
    print(f"=== per-packet stability allocator ===", flush=True)
    print(f"  cutoff_indices: {list(CUTOFF_INDICES)}", flush=True)
    print(f"  f_max={args.f_max:.4f}", flush=True)
    print(f"  extractors: {extractors}", flush=True)
    print(f"  thresholds: {args.thresholds}", flush=True)
    print(f"  workers={args.workers}  batch_size={args.batch_size}", flush=True)
    print(flush=True)

    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}
    if args.max_positions is not None:
        # Slice to the first N to keep both year2k and cards present.
        n_total_cache = len(cache["stems"])
        keep_idx = np.arange(min(args.max_positions, n_total_cache))
        # Bias to include some cards positions by interleaving if possible.
        domains_all = np.array(cache["domains"], dtype=object)
        y2k_idx = np.where(domains_all == "year2k")[0][:args.max_positions // 2]
        cards_idx_pick = np.where(domains_all == "cards")[0][:args.max_positions // 2]
        keep_idx = np.concatenate([y2k_idx, cards_idx_pick])
        cache = slice_cache(cache, keep_idx)
    domains = np.array(cache["domains"], dtype=object)
    cards_idx = np.where(domains == "cards")[0]
    cards_data = slice_cache(cache, cards_idx)
    print(f"  cache: {(domains=='year2k').sum()} year2k + "
          f"{(domains=='cards').sum()} cards", flush=True)

    # Thin-coverage audit
    global _USE_THIN
    try:
        audit_conn = connect()
        n_thin, n_total = count_thin_coverage(audit_conn)
        audit_conn.close()
        thin_frac = n_thin / max(n_total, 1)
        print(f"  msg_thin coverage: {n_thin}/{n_total} "
              f"({100.0*thin_frac:.2f}%)", flush=True)
        if thin_frac >= 0.999:
            _USE_THIN = True
            print(f"  → using thin-projection fetch path", flush=True)
        else:
            _USE_THIN = False
            print(f"  → using lossless fetch path", flush=True)
    except Exception as e:
        print(f"  coverage audit failed ({e}); using lossless path",
              flush=True)
        _USE_THIN = False
    print(flush=True)

    # Phase A
    print("=== Phase A: per-packet stability data ===", flush=True)
    stability_data = phase_a_build_per_packet(
        cache, f_max=args.f_max, force_rebuild=args.force_rebuild,
        workers=args.workers, batch_size=args.batch_size,
    )
    print(f"  loaded {len(stability_data)} positions", flush=True)
    print(flush=True)

    # Phase B substrate
    print("=== Phase B substrate (per-packet rows) ===", flush=True)
    t_sub = time.monotonic()
    phaseb_sub = build_phase_b_substrate_per_packet(
        cache, stability_data, f_max=args.f_max,
    )
    print(f"  substrate built in {time.monotonic() - t_sub:.1f}s", flush=True)
    print(f"  X shape: {phaseb_sub['X'].shape}  "
          f"positions_used={phaseb_sub['n_pos_used']}  "
          f"positions_skipped={phaseb_sub['n_pos_skipped']}", flush=True)
    dom_counts = {
        dom: int((phaseb_sub["domains"] == dom).sum())
        for dom in ("year2k", "cards")
    }
    print(f"  rows per domain: {dom_counts}", flush=True)
    print(flush=True)

    # Sim substrate (cards only)
    print("=== sim substrate (cards) ===", flush=True)
    t_sim_sub = time.monotonic()
    sim_sub = _precompute_cards_per_packet_sim_substrate(
        cards_data, f_max=args.f_max,
    )
    print(f"  sim substrate built in {time.monotonic() - t_sim_sub:.1f}s",
          flush=True)
    print(f"  cards_valid={int(sim_sub['valid'].sum())}/"
          f"{len(sim_sub['valid'])}", flush=True)
    print(flush=True)

    # Baseline
    baseline = baseline_always_vmax_agreement(cards_data, "scoreLead_drift")
    print(f"  baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
          f"agree={baseline['agreement']:.4f}  n={baseline['n']}", flush=True)
    print(flush=True)

    # Per-(extractor, threshold) cell
    tau_grid_sim = np.linspace(0.05, 0.95, 19)
    sweep_results: list[dict] = []
    for extractor_name in extractors:
        print(f"=== extractor: {extractor_name} ===", flush=True)
        for threshold in args.thresholds:
            X, y, g, d, c = materialize_labels_for_cell(
                phaseb_sub, extractor_name, threshold,
            )
            if len(X) < 50:
                print(f"  threshold={threshold:.2f}: only {len(X)} samples; skipping",
                      flush=True)
                continue
            clf = train_classifier_and_eval(X, y, g, d, args.n_folds)
            if "error" in clf:
                print(f"  threshold={threshold:.2f}: {clf['error']}", flush=True)
                continue
            sim = simulate_per_packet_allocator(
                sim_sub, clf["predictor"], tau_grid_sim,
            )
            print(f"  threshold={threshold:.2f}  rows={len(X)}  "
                  f"pos_rate_y2k={clf['pos_rate_y2k']:.3f}  "
                  f"AUC: within={clf['auc_within']:+.4f} OOD={clf['auc_ood']:+.4f}  "
                  f"sim: visits={sim['avg_visits'].min():.0f}..{sim['avg_visits'].max():.0f} "
                  f"agree={sim['agreement'].min():.4f}..{sim['agreement'].max():.4f}",
                  flush=True)
            sweep_results.append({
                "extractor": extractor_name,
                "threshold": threshold,
                "clf": clf,
                "sim": sim,
            })
        print()

    # ── Plot + summary ──────────────────────────────────────────────
    fig, axes = plt.subplots(
        nrows=(len(extractors) + 1) // 2, ncols=2,
        figsize=(14, 4 * ((len(extractors) + 1) // 2)),
        squeeze=False,
    )
    color_for_thresh = {
        0.80: "tab:blue", 0.90: "tab:orange", 0.95: "tab:green",
        0.97: "tab:red", 0.99: "tab:purple",
    }
    for ei, extractor_name in enumerate(extractors):
        ax = axes[ei // 2][ei % 2]
        for entry in sweep_results:
            if entry["extractor"] != extractor_name:
                continue
            t = entry["threshold"]
            ax.plot(entry["sim"]["avg_visits"], entry["sim"]["agreement"],
                    marker="o", linestyle="-",
                    color=color_for_thresh.get(t, "tab:gray"),
                    label=f"τ={t}")
        ax.scatter([baseline["avg_visits"]], [baseline["agreement"]],
                   color="black", s=100, marker="*", label="baseline")
        ax.set_xlabel("avg visits spent (at stop)")
        ax.set_ylabel("top-1 agreement")
        ax.set_title(extractor_name)
        ax.grid(alpha=0.3)
        ax.legend(loc="lower right", fontsize=7)
    for i in range(len(extractors), 2 * ((len(extractors) + 1) // 2)):
        axes[i // 2][i % 2].set_visible(False)
    fig.suptitle(
        f"Per-packet allocator τ ablation × extractor  "
        f"(f_max={args.f_max:.2f}, K={len(CUTOFF_INDICES)} cutoffs)\n"
        f"OOD: year2k → cards.db",
        fontsize=12,
    )
    fig.tight_layout()
    plot_path = args.out_dir / "per_packet_pareto_tau_sweep.png"
    fig.savefig(plot_path, dpi=120)
    plt.close(fig)
    print(f"  multi-panel plot: {plot_path}", flush=True)

    summary_path = args.out_dir / "summary_per_packet.txt"
    with summary_path.open("w") as f:
        f.write(f"# per-packet stability allocator sweep\n")
        f.write(f"# f_max={args.f_max}  schema={CACHE_SCHEMA_VERSION}\n")
        f.write(f"# cutoff_indices={list(CUTOFF_INDICES)}\n\n")
        f.write(f"# baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
                f"agree={baseline['agreement']:.4f}  n={baseline['n']}\n\n")
        for entry in sweep_results:
            c = entry["clf"]
            sim = entry["sim"]
            f.write(f"# extractor={entry['extractor']}  "
                    f"threshold={entry['threshold']:.2f}\n")
            f.write(f"  pos_rate_y2k={c['pos_rate_y2k']:.4f}  "
                    f"pos_rate_cards={c['pos_rate_cards']:.4f}\n")
            f.write(f"  n_train={c['n_y2k']}  n_eval={c['n_cards']}\n")
            f.write(f"  AUC: within={c['auc_within']:+.4f}  "
                    f"OOD={c['auc_ood']:+.4f}\n")
            f.write(f"  log_loss: within={c['log_loss_within']:.4f}  "
                    f"OOD={c['log_loss_ood']:.4f}\n")
            f.write(f"  {'tau':>6} {'visits':>9} {'agree':>9} {'term%':>7} "
                    f"{'stop_k':>7}\n")
            for ti in range(len(sim["tau"])):
                f.write(f"  {sim['tau'][ti]:>6.3f} "
                        f"{sim['avg_visits'][ti]:>9.0f} "
                        f"{sim['agreement'][ti]:>+9.4f} "
                        f"{sim['terminate_frac'][ti]:>7.2%} "
                        f"{sim['mean_stop_cutoff_idx'][ti]:>7.2f}\n")
            # Pareto frontier — dominance-filtered subset of (visits,
            # agreement). Filters out τ values that produce strictly
            # worse operating points than smaller τ values. The
            # remaining points are the operationally meaningful
            # trade-offs the allocator can hit.
            front_idx = pareto_frontier_indices(
                sim["avg_visits"], sim["agreement"],
            )
            f.write(f"  -- Pareto frontier ({len(front_idx)}/{len(sim['tau'])} points):\n")
            f.write(f"  {'tau':>6} {'visits':>9} {'agree':>9} {'term%':>7} "
                    f"{'stop_k':>7}\n")
            for ti in front_idx:
                f.write(f"  {sim['tau'][ti]:>6.3f} "
                        f"{sim['avg_visits'][ti]:>9.0f} "
                        f"{sim['agreement'][ti]:>+9.4f} "
                        f"{sim['terminate_frac'][ti]:>7.2%} "
                        f"{sim['mean_stop_cutoff_idx'][ti]:>7.2f}\n")
            f.write("\n")
    print(f"  summary: {summary_path}", flush=True)


if __name__ == "__main__":
    main()
