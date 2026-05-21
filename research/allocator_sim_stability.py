"""
research/allocator_sim_stability.py

Stability-classifier allocator with cached stable_fractions for fast
τ ablation. Closes the loop the firewall arcs missed: predict the
*decision* (P(top-1 stable from V_term to V_max)) rather than a
continuous summary stat that requires translation.

Per the user's reframe and firewall consult #4 refinements:
  - Stability label is percentile-thresholded ("the quantity at V_term
    matches in ≥X% of subsequent V-weighted intervals") — robust to
    transposition-driven late flips.
  - Extractor family: top1_move, top3_set, top2_margin_quintile,
    winrate_change_threshold, scoreLead_sign, search_agrees_with_policy.
  - winrate_polarity dropped (degenerate label distribution).

Caching architecture (restartable, Redis + disk fallback):
  - Phase A (one-time Postgres pass): for each (position, realization),
    extract trajectory + compute stable_fraction at V_term_floor for
    every extractor. Cache as a structured artifact keyed by
    (stem, turn, realization, extractor). Survives kill mid-pass via
    incremental disk writes.
  - Phase B (cheap, in-memory): for each (extractor, threshold τ),
    binarize the cached fractions → label, train classifier on year2k,
    eval OOD on cards.db, run allocator sim, plot Pareto.

The expensive Postgres re-read happens once; τ ablation over
{0.80, 0.90, 0.95, 0.97, 0.99} × multi-extractor is then a few
seconds of in-memory comparisons.

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
from pg_sink import (  # noqa: E402
    connect, count_thin_coverage,
    fetch_position_bundle_lossless,
    fetch_positions_bundle_lossless_batch,
    fetch_positions_bundle_thin_batch,
)
from stability_trajectory import (  # noqa: E402
    StabilityTrajectory,
    extract_top1_move, extract_top3_set, extract_top2_margin_quintile,
    extract_scoreLead_sign, extract_search_agrees_with_policy,
    extract_winrate_change_threshold_factory,
)


# Extractors to evaluate. The factory-based winrate_change_threshold is
# instantiated per-realization (closure state); represented here as a
# factory callable.
STATELESS_EXTRACTORS: dict[str, callable] = {
    "top1_move": extract_top1_move,
    "top3_set": extract_top3_set,
    "top2_margin_quintile": extract_top2_margin_quintile,
    "scoreLead_sign": extract_scoreLead_sign,
    "search_agrees_with_policy": extract_search_agrees_with_policy,
}
STATEFUL_EXTRACTORS: dict[str, callable] = {
    # name -> factory(): returns a fresh per-realization extractor
    "winrate_change_05": lambda: extract_winrate_change_threshold_factory(0.05),
    "winrate_change_10": lambda: extract_winrate_change_threshold_factory(0.10),
}


def all_extractor_names() -> list[str]:
    return list(STATELESS_EXTRACTORS.keys()) + list(STATEFUL_EXTRACTORS.keys())


# ── Disk cache layout ───────────────────────────────────────────────────────

CACHE_DIR = Path(__file__).resolve().parent / "data" / "stability_cache"


def cache_path_for_position(stem: str, turn: int) -> Path:
    """Per-position cache file. Sharded by first character of stem to
    avoid 1000+ files in one directory."""
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
    tmp.replace(p)  # atomic on POSIX


# ── Redis mirror (optional, transparent fallback) ───────────────────────────

_REDIS_URL = os.environ.get(
    "LENGYUE_RESEARCH_REDIS", "redis://127.0.0.1:6380/0",
)


def _redis_client():
    try:
        import redis  # type: ignore
        r = redis.Redis.from_url(_REDIS_URL, socket_connect_timeout=2)
        if r.ping():
            return r
    except Exception:
        pass
    return None


def redis_get_position(r, stem: str, turn: int) -> dict | None:
    if r is None:
        return None
    try:
        raw = r.get(f"lengyue:research:stability:{stem}:t{turn}")
        if raw is None:
            return None
        return pickle.loads(raw)
    except Exception:
        return None


def redis_set_position(r, stem: str, turn: int, data: dict) -> None:
    if r is None:
        return
    try:
        r.set(
            f"lengyue:research:stability:{stem}:t{turn}",
            pickle.dumps(data, protocol=pickle.HIGHEST_PROTOCOL),
        )
    except Exception:
        pass


# ── Phase A: build per-position stability data ──────────────────────────────

def compute_position_stability_data(
    bundle: dict, V_term_floor: float,
) -> dict | None:
    """For one position's lossless packet bundle (dict of realization_idx
    → list[(t, packet_dict)]), compute per-realization stable_fractions
    at V_term_floor for every extractor. Returns a dict:

      {
        "realizations": {
          r_idx: {
            "stable_fractions": {extractor_name: float | None, ...},
          },
          ...
        }
      }

    Stable_fraction is the V-weighted fraction of [V_term_floor, V_max]
    where the extracted quantity matches its value at V_term_floor. None
    when the tail has no observable packets for that extractor.

    Single-pass implementation: each realization's packets are walked
    once. At each packet, every extractor is invoked; per-extractor
    change-point streams are accumulated inline. This avoids the
    N_extractors-fold redundant packet-iteration of the prior shape."""
    out_reals: dict[int, dict] = {}
    stateless_items = list(STATELESS_EXTRACTORS.items())
    stateful_items = list(STATEFUL_EXTRACTORS.items())
    for r_idx, packets in bundle.items():
        if not packets:
            continue
        # Fresh stateful extractor closures per realization.
        active: list[tuple[str, Callable]] = list(stateless_items)
        for name, factory in stateful_items:
            active.append((name, factory()))
        # Per-extractor change-point accumulators, parallel to `active`.
        n_ex = len(active)
        cps_list: list[list[tuple[float, Any]]] = [[] for _ in range(n_ex)]
        last_val: list[Any] = [_NO_VAL] * n_ex
        last_V = 0.0
        n_packets = 0
        UNK = StabilityTrajectory._UNKNOWN
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
        per_extr: dict[str, float | None] = {}
        for ei in range(n_ex):
            name = active[ei][0]
            traj = StabilityTrajectory.from_changepoints(
                cps_list[ei], V_max=last_V, n_packets=n_packets,
            )
            frac, _ = traj.stable_fraction_from(V_term_floor)
            per_extr[name] = float(frac) if np.isfinite(frac) else None
        out_reals[int(r_idx)] = {"stable_fractions": per_extr}
    if not out_reals:
        return None
    return {"realizations": out_reals}


# Sentinel for "no value yet recorded" inside the single-pass accumulator.
# Distinct from StabilityTrajectory._UNKNOWN (which means "extractor returned
# None for this packet") so the first-observation logic can distinguish them.
_NO_VAL = object()


# Per-worker Postgres connection, opened once by `_worker_init` and reused
# across all chunks the worker processes. psycopg.Connection objects can't
# cross process boundaries, so each worker opens its own; reopening it per
# chunk (as the prior shape did) wastes a LAN handshake per chunk.
_WORKER_CONN = None  # type: ignore[var-annotated]

# Toggle for which fetch path each worker uses. Set by main() once after
# the coverage audit; True means "msg_thin column is fully populated,
# read it"; False means "fall back to lossless msg." The flag is module-
# global so it propagates to worker processes via fork inheritance.
_USE_THIN = False


def _worker_init() -> None:
    """Pool initializer: open one Postgres connection per worker process."""
    global _WORKER_CONN
    _WORKER_CONN = connect()


def _worker_fetch_and_compute(chunk: list[tuple[str, int, float]]) -> dict:
    """Worker function (module-level for multiprocessing): given a chunk
    of (stem, turn, V_term_floor) tuples, runs ONE batched fetch for the
    chunk's positions on the worker's persistent connection, computes
    per-realization stability data, returns dict keyed by (stem, turn)
    → position_stability_data (with V_term_floor stamped in).

    Relies on `_worker_init` having opened `_WORKER_CONN`. In serial mode
    (workers=1), the caller's `_run_serial_chunks` opens the conn instead;
    either path leaves `_WORKER_CONN` populated by the time this runs."""
    if not chunk:
        return {}
    conn = _WORKER_CONN
    if conn is None:
        # Fallback: defensively open a per-call connection so a missing
        # initializer doesn't crash silently.
        conn = connect()
        owned = True
    else:
        owned = False
    try:
        keys = [(stem, turn) for stem, turn, _ in chunk]
        # Use the thin-projection fetch (msg_thin column) when callers set
        # _USE_THIN; otherwise fall back to the lossless path. Selection
        # happens at module level in main() based on coverage audit.
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
        for stem, turn, V_term_floor in chunk:
            bundle = bundles.get((stem, turn))
            if not bundle:
                continue
            data = compute_position_stability_data(bundle, V_term_floor)
            if data is None:
                continue
            data["V_term_floor"] = V_term_floor
            out[(stem, turn)] = data
        return out
    finally:
        if owned:
            try:
                conn.close()
            except Exception:
                pass


def phase_a_build_or_load_labels(
    cache: dict, window_floor_frac: float, force_rebuild: bool = False,
    workers: int = 1, batch_size: int = 8,
) -> dict:
    """Phase A: per-position stable_fractions, cached to disk + Redis.

    Returns a dict: {(stem, turn): position_stability_data}.

    Skip-done: if cache file exists and is well-formed, skip Postgres
    fetch for that position. Resumable mid-pass."""
    stems = cache["stems"]
    turns = cache["turns"]
    V_lo_arr = cache["V_lo"]
    V_hi_arr = cache["V_hi"]
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    floor_idx = max(4, int(round(N_GRID * window_floor_frac))) - 1
    n_total = len(stems)
    print(f"  N_GRID={N_GRID}, floor_idx={floor_idx}, window={window_floor_frac:.3f}",
          flush=True)

    r_client = _redis_client()
    if r_client is None:
        print(f"  redis cache unavailable; using disk only at {CACHE_DIR}",
              flush=True)
    else:
        print(f"  redis cache at {_REDIS_URL}, disk fallback at {CACHE_DIR}",
              flush=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[tuple[str, int], dict] = {}
    n_hit_disk = 0
    n_hit_redis = 0
    n_fetched = 0
    n_skipped = 0
    conn = None  # opened lazily

    # Pass 1: scan cache (disk + redis), build the to-fetch list.
    t0 = time.monotonic()
    to_fetch: list[tuple[str, int, float, int]] = []  # (stem, turn, V_term_floor, i)
    for i in range(n_total):
        stem = str(stems[i])
        turn = int(turns[i])
        V_lo = float(V_lo_arr[i])
        V_hi = float(V_hi_arr[i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            n_skipped += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        V_term_floor = float(V_grid[floor_idx])

        if not force_rebuild:
            cached_disk = load_cached_position(stem, turn)
            if cached_disk is not None and cached_disk.get("V_term_floor") == V_term_floor:
                # Disk is authoritative and survives VM restart; no need
                # to push back to Redis on every read.
                results[(stem, turn)] = cached_disk
                n_hit_disk += 1
                continue
            cached_redis = redis_get_position(r_client, stem, turn)
            if cached_redis is not None and cached_redis.get("V_term_floor") == V_term_floor:
                results[(stem, turn)] = cached_redis
                save_cached_position(stem, turn, cached_redis)
                n_hit_redis += 1
                continue
        to_fetch.append((stem, turn, V_term_floor, i))

    print(f"  cache scan: {n_hit_disk} disk hits, {n_hit_redis} redis hits, "
          f"{n_skipped} skipped, {len(to_fetch)} to fetch from Postgres",
          flush=True)

    if not to_fetch:
        return results

    # Pass 2: batched Postgres fetches in parallel via multiprocessing.Pool.
    # Each worker opens its own Postgres connection (psycopg conns can't
    # cross process boundaries) and processes a chunk of positions via
    # one batched query + per-position stability computation.
    chunks: list[list[tuple[str, int, float]]] = []
    for k in range(0, len(to_fetch), batch_size):
        chunk = [(stem, turn, V_term_floor)
                 for stem, turn, V_term_floor, _ in to_fetch[k: k + batch_size]]
        chunks.append(chunk)
    n_chunks = len(chunks)
    print(f"  parallel fetch: workers={workers}  chunks={n_chunks}  "
          f"batch_size={batch_size}", flush=True)

    t_fetch_start = time.monotonic()
    chunks_done = 0
    positions_done = 0
    n_errors = 0

    if workers <= 1:
        # Serial path (preserved for fallback / debugging). Open the
        # connection once into the same module global the worker function
        # consults; close it after the loop.
        global _WORKER_CONN
        _WORKER_CONN = connect()
        for chunk in chunks:
            res = _worker_fetch_and_compute(chunk)
            if "__error__" in res:
                print(f"  chunk fetch FAILED: {res['__error__']}", flush=True)
                n_errors += 1
                continue
            for (stem, turn), data in res.items():
                save_cached_position(stem, turn, data)
                redis_set_position(r_client, stem, turn, data)
                results[(stem, turn)] = data
                n_fetched += 1
            chunks_done += 1
            positions_done = min(chunks_done * batch_size, len(to_fetch))
            if chunks_done % max(1, n_chunks // 25) == 0 or chunks_done == n_chunks:
                dt = time.monotonic() - t_fetch_start
                rate = positions_done / max(dt, 1e-9)
                eta = (len(to_fetch) - positions_done) / max(rate, 1e-9)
                print(f"  batch [{chunks_done}/{n_chunks}] positions {positions_done}/{len(to_fetch)} "
                      f"{rate:.1f} pos/s  elapsed {dt:.0f}s eta {eta:.0f}s  "
                      f"fetch_total={n_fetched} skip_total={n_skipped} err={n_errors}",
                      flush=True)
        try:
            _WORKER_CONN.close()  # type: ignore[union-attr]
        except Exception:
            pass
        _WORKER_CONN = None
    else:
        # Parallel path: pool of `workers` with a per-process Postgres
        # connection opened once via `_worker_init` (avoids the
        # per-chunk LAN handshake the prior shape paid). imap_unordered
        # streams results as-completed so the main process saves to
        # disk + Redis without waiting for the whole batch to finish.
        with mp.Pool(processes=workers, initializer=_worker_init) as pool:
            for res in pool.imap_unordered(_worker_fetch_and_compute, chunks):
                if "__error__" in res:
                    print(f"  worker reported FAILED chunk: {res['__error__']}",
                          flush=True)
                    n_errors += 1
                else:
                    for (stem, turn), data in res.items():
                        save_cached_position(stem, turn, data)
                        redis_set_position(r_client, stem, turn, data)
                        results[(stem, turn)] = data
                        n_fetched += 1
                chunks_done += 1
                positions_done = min(chunks_done * batch_size, len(to_fetch))
                if chunks_done % max(1, n_chunks // 25) == 0 or chunks_done == n_chunks:
                    dt = time.monotonic() - t_fetch_start
                    rate = positions_done / max(dt, 1e-9)
                    eta = (len(to_fetch) - positions_done) / max(rate, 1e-9)
                    print(f"  batch [{chunks_done}/{n_chunks}] positions {positions_done}/{len(to_fetch)} "
                          f"{rate:.1f} pos/s  elapsed {dt:.0f}s eta {eta:.0f}s  "
                          f"fetch_total={n_fetched} skip_total={n_skipped} err={n_errors}",
                          flush=True)
    return results


# ── Phase B: per-(extractor, threshold) training + sim ──────────────────────

def build_phase_b_substrate(
    cache: dict, stability_data: dict, window_floor_frac: float,
) -> dict:
    """One-time pass over the cache that materializes everything Phase B
    needs that is INVARIANT across (extractor, threshold) cells:

      - X: per-(position, realization) feature rows
      - groups: group ids for GroupKFold (one per position)
      - domains: domain tag (year2k / cards) per row
      - frac_by_extractor: {name: array of per-row stable_fractions or NaN}

    Each (extractor, threshold) cell then only re-binarizes the
    per-extractor fraction array — no re-iteration over the cache, no
    rebuilding of feature rows. With 7 extractors × 5 thresholds = 35
    cells, that's 34× fewer feature-row builds.

    Frac arrays are float NaN for rows where the extractor returned None
    (vs the binary label, which is computed downstream as frac >=
    threshold and would be wrongly counted as 0 for NaN rows). Caller
    masks NaN rows out per-cell."""
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    floor_idx = max(4, int(round(N_GRID * window_floor_frac))) - 1  # noqa: F841
    domains = np.array(cache["domains"], dtype=object)
    stems_cache = np.array(cache["stems"], dtype=object)
    turns_cache = np.array(cache["turns"], dtype=np.int32)

    extractor_names = all_extractor_names()

    X_rows: list[np.ndarray] = []
    g_rows: list[int] = []
    d_rows: list[Any] = []
    fracs_by_extr: dict[str, list[float]] = {name: [] for name in extractor_names}

    for i in range(len(stems_cache)):
        stem = str(stems_cache[i])
        turn = int(turns_cache[i])
        pos_data = stability_data.get((stem, turn))
        if pos_data is None:
            continue
        V_lo = float(cache["V_lo"][i])
        V_hi = float(cache["V_hi"][i])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cache["y_mean_scoreLead_drift"][i]
        if not np.isfinite(y_mean).all():
            continue
        row = build_feature_row(
            cache["phase35"][i], V_grid, y_mean, window_frac=window_floor_frac,
        )
        if row is None:
            continue
        for _r_idx, real_data in pos_data["realizations"].items():
            X_rows.append(row)
            g_rows.append(i)
            d_rows.append(domains[i])
            sfracs = real_data["stable_fractions"]
            for name in extractor_names:
                f = sfracs.get(name)
                fracs_by_extr[name].append(
                    float(f) if f is not None and np.isfinite(f) else float("nan")
                )

    if not X_rows:
        empty = np.empty(0)
        return {
            "X": empty.reshape(0, 0),
            "groups": empty.astype(np.int64),
            "domains": np.array([], dtype=object),
            "frac_by_extractor": {name: empty for name in extractor_names},
            "extractor_names": extractor_names,
        }

    return {
        "X": np.array(X_rows, dtype=np.float64),
        "groups": np.array(g_rows, dtype=np.int64),
        "domains": np.array(d_rows, dtype=object),
        "frac_by_extractor": {
            name: np.array(arr, dtype=np.float64)
            for name, arr in fracs_by_extr.items()
        },
        "extractor_names": extractor_names,
    }


def materialize_labels_for_cell(
    substrate: dict, extractor_name: str, threshold: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Per-cell label binarization on top of the shared substrate. Drops
    rows whose extractor returned NaN (extractor reported None for every
    packet in the realization's tail)."""
    frac = substrate["frac_by_extractor"].get(extractor_name)
    if frac is None or len(frac) == 0:
        return (
            np.empty((0, substrate["X"].shape[1])),
            np.empty(0, dtype=np.int32),
            np.empty(0, dtype=np.int64),
            np.empty(0, dtype=object),
        )
    mask = np.isfinite(frac)
    if not mask.any():
        return (
            np.empty((0, substrate["X"].shape[1])),
            np.empty(0, dtype=np.int32),
            np.empty(0, dtype=np.int64),
            np.empty(0, dtype=object),
        )
    X = substrate["X"][mask]
    y = (frac[mask] >= threshold).astype(np.int32)
    g = substrate["groups"][mask]
    d = substrate["domains"][mask]
    return X, y, g, d


def train_classifier_and_eval(
    X: np.ndarray, y: np.ndarray, g: np.ndarray, d: np.ndarray, n_folds: int,
) -> dict:
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


def _precompute_cards_sim_substrate(
    cards_data: dict, window_floor_frac: float,
) -> dict:
    """Per-position quantities the τ loop needs that are τ-independent
    AND extractor-independent. Computed once per allocator-sim call set
    on the same cards slice; reused across τ values within a call and
    across (extractor, threshold) cells by the higher-level driver."""
    n_pos = len(cards_data["stems"])
    N_GRID = int(cards_data["N_GRID"])
    floor_idx = max(4, int(round(N_GRID * window_floor_frac))) - 1

    valid = np.zeros(n_pos, dtype=bool)
    feature_rows = np.full((n_pos, 0), 0.0)  # widened on first valid row
    V_term_low = np.zeros(n_pos)
    V_term_high = np.zeros(n_pos)
    agree_low = np.zeros(n_pos)
    agree_high = np.zeros(n_pos)

    first_row: np.ndarray | None = None
    for ci in range(n_pos):
        V_lo = float(cards_data["V_lo"][ci])
        V_hi = float(cards_data["V_hi"][ci])
        if not np.isfinite(V_lo) or not np.isfinite(V_hi) or V_lo >= V_hi:
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        y_mean = cards_data["y_mean_scoreLead_drift"][ci]
        if not np.isfinite(y_mean).all():
            continue
        row = build_feature_row(
            cards_data["phase35"][ci], V_grid, y_mean, window_frac=window_floor_frac,
        )
        if row is None:
            continue
        top1_realiz = cards_data["top1_realiz"][ci]
        modal_v_max = modal_top1_at_v_max(top1_realiz)
        if modal_v_max < 0:
            continue
        # Per-position invariants
        if first_row is None:
            first_row = row
            feature_rows = np.zeros((n_pos, row.shape[0]), dtype=np.float64)
        feature_rows[ci] = row
        V_term_low[ci] = float(V_grid[floor_idx])
        V_term_high[ci] = V_hi
        # Agreement at low-V (terminate path) and at V_max (full-search path),
        # averaged across realizations whose entry at that v_idx is observable.
        for v_idx, agree_arr in ((floor_idx, agree_low), (N_GRID - 1, agree_high)):
            agree_count = 0
            real_count = 0
            for r in range(top1_realiz.shape[0]):
                t1 = int(top1_realiz[r, v_idx])
                if t1 < 0:
                    continue
                if t1 == modal_v_max:
                    agree_count += 1
                real_count += 1
            if real_count > 0:
                agree_arr[ci] = agree_count / real_count
            else:
                # Drop the position entirely if neither end is observable.
                # We mark `valid` only after BOTH ends are confirmed.
                agree_arr[ci] = np.nan
        if np.isfinite(agree_low[ci]) and np.isfinite(agree_high[ci]):
            valid[ci] = True

    return {
        "valid": valid,
        "feature_rows": feature_rows,
        "V_term_low": V_term_low,
        "V_term_high": V_term_high,
        "agree_low": agree_low,
        "agree_high": agree_high,
    }


def simulate_stability_allocator(
    cards_data: dict, sim_substrate: dict, predictor,
    tau_grid: np.ndarray,
) -> dict:
    """Vectorized τ sweep on top of `sim_substrate` (computed once by
    `_precompute_cards_sim_substrate`). For each τ, a position
    terminates iff P_stable > τ; visits and agreement are picked from
    the (low, high) precomputed pairs."""
    valid = sim_substrate["valid"]
    if not valid.any():
        zeros = np.zeros(len(tau_grid))
        return {
            "tau": tau_grid, "avg_visits": zeros,
            "agreement": zeros, "terminate_frac": zeros,
        }
    feature_rows = sim_substrate["feature_rows"]
    V_term_low = sim_substrate["V_term_low"][valid]
    V_term_high = sim_substrate["V_term_high"][valid]
    agree_low = sim_substrate["agree_low"][valid]
    agree_high = sim_substrate["agree_high"][valid]

    # One batched predict_proba call across all valid positions; predictor
    # uses the same per-position feature row as the (extractor, threshold)
    # training pipeline does.
    X_valid = feature_rows[valid]
    try:
        P_stable = predictor.predict_proba(X_valid)[:, 1].astype(np.float64)
    except Exception:
        P_stable = np.full(X_valid.shape[0], np.nan)

    n_valid = P_stable.shape[0]
    avg_visits = np.zeros(len(tau_grid))
    agreement = np.zeros(len(tau_grid))
    terminate_frac = np.zeros(len(tau_grid))
    # Drop positions whose predictor failed.
    pred_ok = np.isfinite(P_stable)
    if not pred_ok.any():
        return {
            "tau": tau_grid, "avg_visits": avg_visits,
            "agreement": agreement, "terminate_frac": terminate_frac,
        }
    P = P_stable[pred_ok]
    V_lo_arr = V_term_low[pred_ok]
    V_hi_arr = V_term_high[pred_ok]
    A_lo_arr = agree_low[pred_ok]
    A_hi_arr = agree_high[pred_ok]
    n_eff = P.shape[0]

    for ti, tau in enumerate(tau_grid):
        terminate = P > tau
        V_picked = np.where(terminate, V_lo_arr, V_hi_arr)
        A_picked = np.where(terminate, A_lo_arr, A_hi_arr)
        avg_visits[ti] = V_picked.mean()
        agreement[ti] = A_picked.mean()
        terminate_frac[ti] = terminate.sum() / n_eff
    return {
        "tau": tau_grid, "avg_visits": avg_visits,
        "agreement": agreement, "terminate_frac": terminate_frac,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache",
                    default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "allocator_pareto_stability",
                    type=Path)
    ap.add_argument("--window-floor-frac", default=1.0/3.0, type=float)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--force-rebuild", action="store_true",
                    help="Ignore disk/Redis caches; re-fetch all positions")
    ap.add_argument("--workers", type=int, default=4,
                    help="Number of parallel worker processes for "
                         "Phase A Postgres fetches (each opens its own "
                         "conn). 1 = serial. Default 4 uses all 4 cores.")
    ap.add_argument("--batch-size", type=int, default=8,
                    help="Positions per batched Postgres query "
                         "(~10 MB returned per position). Default 8.")
    ap.add_argument("--extractors", nargs="+", default=None,
                    help="Subset of extractors to evaluate (default: all)")
    ap.add_argument("--thresholds", nargs="+", type=float,
                    default=[0.80, 0.90, 0.95, 0.97, 0.99])
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    extractors = args.extractors or (
        list(STATELESS_EXTRACTORS.keys()) + list(STATEFUL_EXTRACTORS.keys())
    )
    print(f"=== stability-classifier allocator (cached labels) ===", flush=True)
    print(f"  window_floor_frac={args.window_floor_frac}", flush=True)
    print(f"  extractors: {extractors}", flush=True)
    print(f"  thresholds: {args.thresholds}", flush=True)
    print(f"  force_rebuild: {args.force_rebuild}", flush=True)
    print(f"  workers: {args.workers}  batch_size: {args.batch_size}", flush=True)
    print(flush=True)

    cache = np.load(args.cache, allow_pickle=True)
    cache = {k: cache[k] for k in cache.files}
    domains = np.array(cache["domains"], dtype=object)
    cards_idx = np.where(domains == "cards")[0]
    cards_data = slice_cache(cache, cards_idx)
    print(f"  cache: {(domains=='year2k').sum()} year2k + {(domains=='cards').sum()} cards",
          flush=True)

    # Coverage audit for the thin-projection column. The thin path is
    # ~10× faster on pickle.loads but requires backfill of legacy rows;
    # we flip _USE_THIN only when coverage is complete.
    global _USE_THIN
    try:
        audit_conn = connect()
        n_thin, n_total = count_thin_coverage(audit_conn)
        audit_conn.close()
        thin_frac = n_thin / max(n_total, 1)
        print(f"  msg_thin coverage: {n_thin}/{n_total} "
              f"({100.0 * thin_frac:.2f}%)", flush=True)
        if thin_frac >= 0.999:
            _USE_THIN = True
            print(f"  → using thin-projection fetch path", flush=True)
        else:
            _USE_THIN = False
            print(f"  → using lossless fetch path (run "
                  f"backfill_msg_thin.py to enable thin path)",
                  flush=True)
    except Exception as e:
        print(f"  coverage audit failed ({e}); using lossless path",
              flush=True)
        _USE_THIN = False
    print(flush=True)

    # Phase A: build/load stability labels per position
    print("=== Phase A: build per-position stability data (cached) ===", flush=True)
    stability_data = phase_a_build_or_load_labels(
        cache, args.window_floor_frac, force_rebuild=args.force_rebuild,
        workers=args.workers, batch_size=args.batch_size,
    )
    print(f"  loaded {len(stability_data)} positions", flush=True)
    print(flush=True)

    # Phase B: per-(extractor, threshold) classifier + sim
    baseline = baseline_always_vmax_agreement(cards_data, "scoreLead_drift")
    print(f"  baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
          f"agree={baseline['agreement']:.4f}  n={baseline['n']}", flush=True)
    print()

    # Build the (extractor, threshold)-invariant substrates once. The
    # phase-B substrate carries feature rows / groups / domains / per-row
    # fractions per extractor; the sim substrate carries per-card
    # feature rows + precomputed (V_term_low/high, agree_low/high) so
    # the τ loop reduces to elementwise np.where.
    print("=== Phase B substrate (one-time) ===", flush=True)
    t_sub = time.monotonic()
    phaseb_sub = build_phase_b_substrate(
        cache, stability_data, args.window_floor_frac,
    )
    sim_sub = _precompute_cards_sim_substrate(cards_data, args.window_floor_frac)
    print(f"  X={phaseb_sub['X'].shape}  cards_valid={int(sim_sub['valid'].sum())}/"
          f"{len(sim_sub['valid'])}  built in {time.monotonic() - t_sub:.1f}s",
          flush=True)
    print()

    tau_grid_sim = np.linspace(0.05, 0.95, 19)
    sweep_results: list[dict] = []
    for extractor_name in extractors:
        print(f"=== extractor: {extractor_name} ===", flush=True)
        for threshold in args.thresholds:
            X, y, g, d = materialize_labels_for_cell(
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
            sim = simulate_stability_allocator(
                cards_data, sim_sub, clf["predictor"], tau_grid_sim,
            )
            print(f"  threshold={threshold:.2f}  pos_rate_y2k={clf['pos_rate_y2k']:.3f}  "
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

    # Plot: per-extractor, overlay τ sweeps
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
        ax.set_xlabel("avg visits spent")
        ax.set_ylabel("top-1 agreement")
        ax.set_title(extractor_name)
        ax.grid(alpha=0.3)
        ax.legend(loc="lower right", fontsize=7)
    # Hide unused axes
    for i in range(len(extractors), 2 * ((len(extractors) + 1) // 2)):
        axes[i // 2][i % 2].set_visible(False)
    fig.suptitle(f"Stability allocator τ ablation × extractor — scoreLead_drift\n"
                 f"OOD: year2k → cards.db", fontsize=12)
    fig.tight_layout()
    plot_path = args.out_dir / "stability_pareto_tau_sweep.png"
    fig.savefig(plot_path, dpi=120)
    plt.close(fig)
    print(f"  multi-panel plot: {plot_path}", flush=True)

    # Summary txt
    summary_path = args.out_dir / "summary_stability_sweep.txt"
    with summary_path.open("w") as f:
        f.write(f"# stability allocator τ ablation × extractor sweep\n")
        f.write(f"# window_floor_frac={args.window_floor_frac}\n\n")
        f.write(f"# baseline (always V_max): visits={baseline['avg_visits']:.0f}  "
                f"agree={baseline['agreement']:.4f}  n={baseline['n']}\n\n")
        for entry in sweep_results:
            c = entry["clf"]
            sim = entry["sim"]
            f.write(f"# extractor={entry['extractor']}  threshold={entry['threshold']:.2f}\n")
            f.write(f"  pos_rate_y2k={c['pos_rate_y2k']:.4f}  "
                    f"pos_rate_cards={c['pos_rate_cards']:.4f}\n")
            f.write(f"  n_train={c['n_y2k']}  n_eval={c['n_cards']}\n")
            f.write(f"  AUC: within={c['auc_within']:+.4f}  OOD={c['auc_ood']:+.4f}\n")
            f.write(f"  log_loss: within={c['log_loss_within']:.4f}  OOD={c['log_loss_ood']:.4f}\n")
            f.write(f"  {'tau':>6} {'visits':>9} {'agree':>9} {'term%':>7}\n")
            for ti in range(len(sim["tau"])):
                f.write(f"  {sim['tau'][ti]:>6.3f} "
                        f"{sim['avg_visits'][ti]:>9.0f} "
                        f"{sim['agreement'][ti]:>+9.4f} "
                        f"{sim['terminate_frac'][ti]:>7.2%}\n")
            f.write("\n")
    print(f"  summary: {summary_path}", flush=True)


if __name__ == "__main__":
    main()
