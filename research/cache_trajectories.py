"""
research/cache_trajectories.py

Bundled-fetch trajectory cache. For every (stem, turn) in Postgres,
pulls all realizations' packets in one query via
`fetch_position_bundle()`, computes per-target averaged trajectories
on a common log-V grid, also retains per-realization (V, y, top1_move)
sequences, and stashes everything to a single npz for fast downstream
allocator-sim and feature-engineering use.

Designed to take ~5-15 min on the current 1107-position corpus, vs
the ~32 min that one-at-a-time fetches took in `ood_regression.py`.

Output schema (`~/w/omega/research/data/trajectory_cache.npz`):

  stems:           (N,) str             — position stem
  turns:           (N,) int32           — position turn
  domains:         (N,) str             — 'year2k' | 'cards'
  n_realizations:  (N,) int32           — packet count per position
  V_grid:          (50,) float32        — common log-spaced V-grid
  y_mean_<target>: (N, 50) float32      — averaged y(V) per target
  y_realiz_<target>: (N, R, 50) float32 — per-realization y(V) per target
  top1_<target>:   (N, R, 50) int32     — top-1 move idx per target per realization
                                          (move index as KataGo's flat move id;
                                           -1 if undefined for that V)
                                          for `scoreLead_drift` only — others left out

Computes labels and stashes:
  H_<target>:        (N,) float32 — hyperbolic fit H per target (NaN if degenerate)
  log_kappa_<target>:(N,) float32 — hyperbolic fit log(kappa) per target (NaN if degenerate)
  clean_<target>:    (N,) bool    — clean fit flag

Phase35 features (only at V_pre, r0):
  phase35:         (N, F) float32       — phase35 feature matrix
  phase35_names:   (F,) str             — column names

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import FAMILIES  # noqa: E402
from feature_extraction import extract_features as extract_phase35  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, fetch_position_bundle,
)


CARDS_PREFIXES = ("card_", "vol_card_", "ctl_card_")
N_GRID = 50


def is_cards_stem(stem: str) -> bool:
    return any(stem.startswith(p) for p in CARDS_PREFIXES)


def per_realization_traj(arrs: dict, value_fn) -> tuple[np.ndarray, np.ndarray] | None:
    """Compute (V_sorted, y_sorted) for one realization on one target."""
    V = arrs["visits"].astype(np.float64)
    ids = arrs["isDuringSearch"]
    V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
    try:
        y = value_fn(arrs, V_max_idx).astype(np.float64)
    except Exception:
        return None
    if not np.isfinite(y).all() or len(y) < 4:
        return None
    order = np.argsort(V)
    return V[order], y[order]


def top1_per_realization(arrs: dict) -> np.ndarray | None:
    """For each packet of this realization, return the top-1 move index
    (the move with most visits in moveInfos). Returns shape (n_packets,)
    int32, with -1 where no moveInfos available."""
    miV = arrs.get("miVisits")
    if miV is None or miV.size == 0:
        return None
    # top-1 column index per row (-1 if all zeros)
    out = np.full(miV.shape[0], -1, dtype=np.int32)
    has = miV.sum(axis=1) > 0
    if has.any():
        out[has] = np.argmax(miV[has], axis=1).astype(np.int32)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out",
                    default=Path(__file__).resolve().parent /
                            "data" / "trajectory_cache.npz",
                    type=Path)
    ap.add_argument("--top-k", default=12, type=int)
    ap.add_argument("--max-realizations", default=12, type=int,
                    help="Cap per-position realization count (most have 10).")
    args = ap.parse_args()

    print("=== trajectory cache (bundled-fetch) ===", flush=True)
    print(f"  output: {args.out}", flush=True)
    print(flush=True)

    conn = connect()
    positions = list_positions(conn)
    n = len(positions)
    print(f"  {n} positions in Postgres", flush=True)
    print(flush=True)

    target_names = list(VALUE_CANDIDATES.keys())
    print(f"  targets: {target_names}", flush=True)

    fam = FAMILIES["hyperbolic"]

    stems = []
    turns = []
    domains = []
    n_real_list = []
    y_mean_by_target: dict[str, list[np.ndarray]] = {t: [] for t in target_names}
    y_realiz_by_target: dict[str, list[np.ndarray]] = {t: [] for t in target_names}
    top1_realiz: list[np.ndarray] = []  # using scoreLead_drift's V-grid; top1 is value-fn-independent
    H_by_target: dict[str, list[float]] = {t: [] for t in target_names}
    log_kappa_by_target: dict[str, list[float]] = {t: [] for t in target_names}
    clean_by_target: dict[str, list[bool]] = {t: [] for t in target_names}
    phase35_rows: list[dict] = []
    phase35_names_ref: list[str] = []

    t0 = time.monotonic()
    skipped = 0

    for i, (stem, turn) in enumerate(positions):
        bundle = fetch_position_bundle(conn, stem, turn, top_k=args.top_k)
        if bundle is None or len(bundle) < 2:
            skipped += 1
            if (i + 1) % 50 == 0 or i + 1 == n:
                dt = time.monotonic() - t0
                rate = (i + 1) / max(dt, 1e-9)
                eta = (n - (i + 1)) / max(rate, 1e-9)
                print(f"  [{i+1}/{n}] {rate:.1f} pos/s  "
                      f"elapsed {dt:.0f}s  eta {eta:.0f}s  "
                      f"kept {len(stems)} skipped {skipped}",
                      flush=True)
            continue

        # Determine V-grid for this position (intersection of all reals)
        per_run_curves_by_target: dict[str, list[tuple[np.ndarray, np.ndarray]]] = {
            t: [] for t in target_names
        }
        V_firsts: list[float] = []
        V_lasts: list[float] = []
        sorted_ris = sorted(bundle.keys())[: args.max_realizations]
        for ri in sorted_ris:
            arrs = bundle[ri]
            # Compute per-target trajectories
            for tname, value_fn in VALUE_CANDIDATES.items():
                traj = per_realization_traj(arrs, value_fn)
                if traj is None:
                    continue
                per_run_curves_by_target[tname].append((ri, traj[0], traj[1]))
                # Use scoreLead_drift's V to set the grid bounds (any non-degenerate works)
            # V bounds via raw visits (independent of value fn)
            V = arrs["visits"].astype(np.float64)
            order = np.argsort(V)
            V_sorted = V[order]
            V_firsts.append(float(V_sorted[0]))
            V_lasts.append(float(V_sorted[-1]))

        if not V_firsts:
            skipped += 1
            continue
        V_lo = max(V_firsts)
        V_hi = min(V_lasts)
        if V_lo >= V_hi:
            skipped += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)

        # Per-target averaged y(V_grid)
        y_mean_pos = {t: np.full(N_GRID, np.nan, dtype=np.float32) for t in target_names}
        y_realiz_pos = {t: np.full((args.max_realizations, N_GRID), np.nan, dtype=np.float32)
                        for t in target_names}
        labels_clean = True
        for tname in target_names:
            run_list = per_run_curves_by_target[tname]
            if not run_list:
                continue
            y_stack = []
            for ri, V_s, y_s in run_list:
                yi = np.interp(V_grid, V_s, y_s)
                y_stack.append(yi)
                # store per-realization too at appropriate row
                if ri < args.max_realizations:
                    y_realiz_pos[tname][ri] = yi.astype(np.float32)
            y_stack = np.array(y_stack)
            y_mean_pos[tname] = y_stack.mean(axis=0).astype(np.float32)

        # Top-1 move index per realization on V_grid (using raw visits to interpolate)
        # Note: top1 is a step function over V; we use nearest-neighbor lookup
        top1_pos = np.full((args.max_realizations, N_GRID), -1, dtype=np.int32)
        for ri in sorted_ris[: args.max_realizations]:
            arrs = bundle[ri]
            V = arrs["visits"].astype(np.float64)
            order = np.argsort(V)
            V_sorted = V[order]
            t1 = top1_per_realization(arrs)
            if t1 is None:
                continue
            t1_sorted = t1[order]
            # nearest-neighbor on V_grid
            idx = np.searchsorted(V_sorted, V_grid, side="right") - 1
            idx = np.clip(idx, 0, len(V_sorted) - 1)
            top1_pos[ri, :] = t1_sorted[idx]

        # Hyperbolic fit on averaged trajectories (the label step)
        for tname in target_names:
            ym = y_mean_pos[tname]
            if not np.isfinite(ym).all():
                H_by_target[tname].append(np.nan)
                log_kappa_by_target[tname].append(np.nan)
                clean_by_target[tname].append(False)
                continue
            fit = fam.fit(V_grid, ym.astype(np.float64))
            H = float(fit.params.get("H", np.nan))
            k = float(fit.params.get("kappa", np.nan))
            H_by_target[tname].append(H)
            log_kappa_by_target[tname].append(np.log(k) if k > 0 else np.nan)
            clean_by_target[tname].append(fit.status == "clean")

        # Phase35 features from r0
        try:
            ph = extract_phase35(stem, turn, realization=sorted_ris[0], conn=conn)
            phase35_rows.append(ph)
            if not phase35_names_ref:
                phase35_names_ref = sorted(ph.keys())
        except Exception as e:
            print(f"  WARN: phase35 extraction failed for {stem}:t{turn}: {e}",
                  flush=True)
            phase35_rows.append({})

        # Append
        stems.append(stem)
        turns.append(turn)
        domains.append("cards" if is_cards_stem(stem) else "year2k")
        n_real_list.append(len(sorted_ris))
        # V_grid is per-position; we store a uniform V_grid_ref later as the
        # log-V-grid relative position 0..49 — but ALSO save per-position
        # V_grid_pos as a 2D array to allow exact-V lookups.
        for tname in target_names:
            y_mean_by_target[tname].append(y_mean_pos[tname])
            y_realiz_by_target[tname].append(y_realiz_pos[tname])
        top1_realiz.append(top1_pos)
        # Also store V_grid for this position so the cache is V-aware
        # (we don't use a single uniform V_grid since V_lo/V_hi vary).
        # Stash as a separate array indexed by position.

        if (i + 1) % 50 == 0 or i + 1 == n:
            dt = time.monotonic() - t0
            rate = (i + 1) / max(dt, 1e-9)
            eta = (n - (i + 1)) / max(rate, 1e-9)
            print(f"  [{i+1}/{n}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s  "
                  f"kept {len(stems)} skipped {skipped}",
                  flush=True)

    conn.close()
    dt_total = time.monotonic() - t0
    print(f"  total: {len(stems)} positions kept, {skipped} skipped, "
          f"{dt_total:.0f}s wall ({len(positions)/max(dt_total,1):.1f} pos/s)",
          flush=True)

    # We need per-position V_grids; recompute on save by reading bundle bounds
    # again. Simpler: compute V_lo/V_hi from V_grid_pos arrays we already
    # gathered implicitly. But we discarded them. Build a single grid array
    # with per-position rows (N, 50).
    # Actually we already wrote V_grid above per-position but didn't store.
    # Re-do quickly with a second pass — cheap because we read just bounds.
    # Better: store the V_grid bounds per position as (V_lo, V_hi); then
    # downstream code reconstructs the grid by np.geomspace.
    # But we have already moved on. The simplest fix: store
    # V_grid_lo (N,) and V_grid_hi (N,) and let downstream reconstruct.
    # Pull them again with one cheap second pass.
    conn = connect()
    V_lo_arr = np.zeros(len(stems), dtype=np.float32)
    V_hi_arr = np.zeros(len(stems), dtype=np.float32)
    for i, (stem, turn) in enumerate(zip(stems, turns)):
        bundle = fetch_position_bundle(conn, stem, turn, top_k=1)
        if not bundle:
            continue
        V_firsts: list[float] = []
        V_lasts: list[float] = []
        for ri, arrs in bundle.items():
            V = arrs["visits"].astype(np.float64)
            order = np.argsort(V)
            V_firsts.append(float(V[order][0]))
            V_lasts.append(float(V[order][-1]))
        if V_firsts:
            V_lo_arr[i] = max(V_firsts)
            V_hi_arr[i] = min(V_lasts)
    conn.close()

    # Phase35 matrix
    F = len(phase35_names_ref)
    phase35_X = np.full((len(stems), F), np.nan, dtype=np.float32)
    for i, row in enumerate(phase35_rows):
        if not row:
            continue
        for j, k in enumerate(phase35_names_ref):
            v = row.get(k, np.nan)
            phase35_X[i, j] = float(v) if v is not None and np.isfinite(v) else np.nan

    # Save
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out: dict[str, np.ndarray] = {
        "stems": np.array(stems, dtype=object),
        "turns": np.array(turns, dtype=np.int32),
        "domains": np.array(domains, dtype=object),
        "n_realizations": np.array(n_real_list, dtype=np.int32),
        "V_lo": V_lo_arr,
        "V_hi": V_hi_arr,
        "N_GRID": np.array([N_GRID], dtype=np.int32),
        "phase35": phase35_X,
        "phase35_names": np.array(phase35_names_ref, dtype=object),
        "top1_realiz": np.array(top1_realiz, dtype=np.int32),
    }
    for tname in target_names:
        out[f"y_mean_{tname}"] = np.array(y_mean_by_target[tname], dtype=np.float32)
        out[f"y_realiz_{tname}"] = np.array(y_realiz_by_target[tname], dtype=np.float32)
        out[f"H_{tname}"] = np.array(H_by_target[tname], dtype=np.float32)
        out[f"log_kappa_{tname}"] = np.array(log_kappa_by_target[tname], dtype=np.float32)
        out[f"clean_{tname}"] = np.array(clean_by_target[tname], dtype=np.bool_)

    np.savez_compressed(args.out, **out)
    sz_mb = args.out.stat().st_size / 1024**2
    print(f"  saved: {args.out}  ({sz_mb:.1f} MB)", flush=True)


if __name__ == "__main__":
    main()
