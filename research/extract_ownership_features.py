"""
research/extract_ownership_features.py

Extract per-position ownership-derived features from the V_pre packet's
19×19 ownership map. These features have NOT been used in the existing
phase35 feature set; ownership is the spatial signal the V_pre scalars
fundamentally cannot summarize.

Features (per position, V_pre packet only):
  - own_abs_mean:           average |ownership| (0 = totally contested,
                             1 = totally decided)
  - own_decided_fraction:    fraction of points with |ownership| > 0.5
                             (proxy for "how much of the board is settled")
  - own_entropy:             average per-point Bernoulli entropy where
                             p = (1 + ownership) / 2; high = uncertain
  - own_black_mass:          sum of max(0, ownership)
  - own_white_mass:          sum of max(0, -ownership)
  - own_balance:             black_mass - white_mass (net expected
                             territory advantage)
  - own_var:                 variance of ownership across the board
  - own_contested_count:     count of points with |ownership| < 0.3
                             (proxy for unresolved fights)
  - own_n_clusters:          connected components of contested mask
                             (number of separate unresolved areas)
  - own_largest_cluster:     size of largest contested region
  - own_corner_decided:      mean |ownership| in 4 corner 5×5 regions
  - own_edge_decided:        mean |ownership| in side rectangles
  - own_center_decided:      mean |ownership| in central 9×9
  - own_l_quadrant_balance:  mean ownership in the (top-left, bot-right)
                             diagonal minus (top-right, bot-left).
                             Captures diagonal asymmetry — useful for
                             positions with diagonal-mirrored shapes

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, read_packets,
)


# ── Cached loader for per-position 19×19 ownership maps ─────────────────────
# Used by regression_ownership_cnn.py and classify_mode_ownership_cnn.py.
# Per-position Redis cache means the 10-min Postgres iterate becomes a
# ~10-sec Redis lookup. Cache key = (stem, turn), so new positions from
# phase-3 collection add to the cache incrementally rather than
# invalidating the whole thing.

def load_ownership_maps_cached(conn,
                                redis_url: str = "redis://127.0.0.1:6380/0",
                                verbose: bool = True,
                                ) -> dict[tuple[str, int], np.ndarray]:
    """Per (stem, turn) → 19×19 ownership map averaged across realizations,
    cached per-position in Redis. Postgres path uses a SINGLE batched
    query for all V_pre packets (seq=0) instead of per-realization
    loops, which is ~390× faster (4.6 s instead of 30 min at the
    current ~6600 packet scale).

    Cache writes are best-effort and LRU-tolerant: any Redis exception
    is logged but never propagated — the data is already in the
    returned dict; a cache write failure just means the next run pays
    Postgres again.
    """
    import pickle, time

    positions = list_positions(conn)
    out: dict[tuple[str, int], np.ndarray] = {}
    redis_client = None
    try:
        import redis as _redis
        redis_client = _redis.Redis.from_url(redis_url, socket_connect_timeout=2)
        if not redis_client.ping():
            redis_client = None
    except Exception:
        redis_client = None

    n_hit_cache = 0
    t0 = time.monotonic()
    missing: list[tuple[str, int]] = []
    # ── Step 1: read cache (best-effort, LRU-tolerant) ──────────────────
    if redis_client is not None:
        try:
            pipe = redis_client.pipeline()
            keys = [f"lengyue:research:ownership:{stem}:{turn}"
                    for stem, turn in positions]
            for k in keys:
                pipe.get(k)
            cached_vals = pipe.execute()
        except Exception as e:
            if verbose:
                print(f"  warning: Redis pipeline read failed ({e}); "
                      f"falling back to Postgres-only", flush=True)
            cached_vals = [None] * len(positions)
        for (stem, turn), raw in zip(positions, cached_vals):
            if raw is not None:
                try:
                    arr = pickle.loads(raw)
                    if isinstance(arr, np.ndarray) and arr.shape == (19, 19):
                        out[(stem, turn)] = arr.astype(np.float32)
                        n_hit_cache += 1
                        continue
                except Exception:
                    pass
            missing.append((stem, turn))
    else:
        missing = list(positions)
    if verbose:
        print(f"  ownership cache: {n_hit_cache} hit / {len(missing)} miss "
              f"(took {(time.monotonic()-t0)*1000:.0f} ms)", flush=True)

    if not missing:
        return out

    # ── Step 2: batched Postgres fetch of V_pre packets for missing ────
    # One query for ALL realizations of all missing positions.
    missing_set = set(missing)
    t1 = time.monotonic()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.stem, p.turn, r.realization_idx, pk.msg
        FROM mcts_packet pk
        JOIN mcts_realization r ON r.id = pk.realization_id
        JOIN mcts_position p ON p.id = r.position_id
        WHERE pk.seq = 0
    """)
    # Accumulate per-position list of ownership arrays
    per_pos_owns: dict[tuple[str, int], list[np.ndarray]] = {}
    n_rows = 0
    for stem, turn, ri, blob in cur:
        n_rows += 1
        if (stem, turn) not in missing_set:
            continue
        try:
            msg = pickle.loads(blob)
        except Exception:
            continue
        own = msg.get("ownership")
        if own is None or len(own) != 361:
            continue
        per_pos_owns.setdefault((stem, turn), []).append(
            np.array(own, dtype=np.float32).reshape(19, 19)
        )
    cur.close()
    if verbose:
        print(f"  Postgres batched V_pre fetch: {n_rows} rows, "
              f"{len(per_pos_owns)} positions in "
              f"{(time.monotonic()-t1)*1000:.0f} ms", flush=True)

    # Average per position
    for key, owns in per_pos_owns.items():
        if owns:
            out[key] = np.stack(owns).mean(axis=0).astype(np.float32)

    # ── Step 3: best-effort cache writeback (LRU-tolerant) ─────────────
    if redis_client is not None and per_pos_owns:
        n_write_fail = 0
        n_pending = 0
        WRITE_CHUNK = 100
        try:
            write_pipe = redis_client.pipeline()
        except Exception:
            write_pipe = None
        for (stem, turn), arr in [(k, out[k]) for k in per_pos_owns
                                    if k in out]:
            if write_pipe is None:
                break
            try:
                write_pipe.set(
                    f"lengyue:research:ownership:{stem}:{turn}",
                    pickle.dumps(arr),
                )
                n_pending += 1
            except Exception:
                n_write_fail += 1
            if n_pending >= WRITE_CHUNK:
                try:
                    write_pipe.execute()
                except Exception as e:
                    n_write_fail += n_pending
                    if verbose:
                        print(f"  warning: Redis chunk write failed ({e})",
                              flush=True)
                    write_pipe = None
                n_pending = 0
        if write_pipe is not None and n_pending > 0:
            try:
                write_pipe.execute()
            except Exception as e:
                n_write_fail += n_pending
                if verbose:
                    print(f"  warning: Redis final flush failed ({e})",
                          flush=True)
        if verbose:
            n_written = len(per_pos_owns) - n_write_fail
            print(f"  Redis cache populated with {n_written}/{len(per_pos_owns)} "
                  f"new entries (write failures: {n_write_fail})",
                  flush=True)

    if verbose:
        print(f"  total ownership-load time: {(time.monotonic()-t0):.1f} s",
              flush=True)
    return out


FEATURE_NAMES = [
    "own_abs_mean", "own_decided_fraction", "own_entropy",
    "own_black_mass", "own_white_mass", "own_balance",
    "own_var", "own_contested_count",
    "own_n_clusters", "own_largest_cluster",
    "own_corner_decided", "own_edge_decided", "own_center_decided",
    "own_l_quadrant_balance",
]


def _connected_components_count_and_largest(mask: np.ndarray) -> tuple[int, int]:
    """4-connectivity flood-fill over the boolean mask. Returns
    (n_components, size_of_largest)."""
    visited = np.zeros_like(mask, dtype=bool)
    n_comp = 0
    largest = 0
    H, W = mask.shape
    stack: list[tuple[int, int]] = []
    for i in range(H):
        for j in range(W):
            if mask[i, j] and not visited[i, j]:
                n_comp += 1
                size = 0
                stack.append((i, j))
                while stack:
                    a, b = stack.pop()
                    if not (0 <= a < H and 0 <= b < W):
                        continue
                    if visited[a, b] or not mask[a, b]:
                        continue
                    visited[a, b] = True
                    size += 1
                    stack.extend([(a + 1, b), (a - 1, b),
                                   (a, b + 1), (a, b - 1)])
                if size > largest:
                    largest = size
    return n_comp, largest


def extract_ownership_features(ownership: np.ndarray) -> dict[str, float]:
    """ownership: shape (361,) or (19, 19). Values in [-1, +1].
    Returns 14 derived features."""
    if ownership.ndim == 1:
        if ownership.shape[0] != 361:
            return {}
        own = ownership.reshape(19, 19)
    else:
        own = ownership.astype(np.float64)
    abs_own = np.abs(own)

    # Decision metrics
    abs_mean = float(abs_own.mean())
    decided_fraction = float((abs_own > 0.5).mean())

    # Per-point Bernoulli entropy (p = (1 + own) / 2)
    p = (1.0 + own) / 2.0
    p_clip = np.clip(p, 1e-9, 1.0 - 1e-9)
    entropy = float(-(p_clip * np.log2(p_clip) +
                       (1 - p_clip) * np.log2(1 - p_clip)).mean())

    # Mass and balance
    black_mass = float(np.maximum(own, 0).sum())
    white_mass = float(np.maximum(-own, 0).sum())
    balance = black_mass - white_mass

    # Variance
    own_var = float(own.var())

    # Contested
    contested_mask = abs_own < 0.3
    contested_count = int(contested_mask.sum())
    n_clusters, largest_cluster = _connected_components_count_and_largest(
        contested_mask
    )

    # Spatial regions (19x19 board)
    corners = np.concatenate([
        abs_own[:5, :5].flatten(),
        abs_own[:5, 14:].flatten(),
        abs_own[14:, :5].flatten(),
        abs_own[14:, 14:].flatten(),
    ])
    edges = np.concatenate([
        abs_own[0:2, :].flatten(),
        abs_own[17:, :].flatten(),
        abs_own[:, 0:2].flatten(),
        abs_own[:, 17:].flatten(),
    ])
    center = abs_own[5:14, 5:14]

    corner_decided = float(corners.mean())
    edge_decided = float(edges.mean())
    center_decided = float(center.mean())

    # Diagonal asymmetry
    tl = own[:9, :9].mean()
    br = own[10:, 10:].mean()
    tr = own[:9, 10:].mean()
    bl = own[10:, :9].mean()
    diag1 = (tl + br) / 2
    diag2 = (tr + bl) / 2
    l_quadrant_balance = float(diag1 - diag2)

    return {
        "own_abs_mean": abs_mean,
        "own_decided_fraction": decided_fraction,
        "own_entropy": entropy,
        "own_black_mass": black_mass,
        "own_white_mass": white_mass,
        "own_balance": balance,
        "own_var": own_var,
        "own_contested_count": float(contested_count),
        "own_n_clusters": float(n_clusters),
        "own_largest_cluster": float(largest_cluster),
        "own_corner_decided": corner_decided,
        "own_edge_decided": edge_decided,
        "own_center_decided": center_decided,
        "own_l_quadrant_balance": l_quadrant_balance,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "ownership_features.csv"), type=Path)
    args = ap.parse_args()

    conn = connect()
    positions = list_positions(conn)
    print(f"=== extracting ownership features for "
          f"{len(positions)} positions × all realizations (V_pre only) ===",
          flush=True)

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    fields = ["stem", "turn", "realization"] + FEATURE_NAMES
    csv_f = args.out_csv.open("w", buffering=1)
    csv_w = csv.DictWriter(csv_f, fieldnames=fields)
    csv_w.writeheader()

    t0 = time.monotonic()
    n_done = 0
    n_skipped = 0
    for stem, turn in positions:
        real_idxs = list_realizations(conn, stem, turn)
        for ri in real_idxs:
            try:
                packets = read_packets(conn, stem, turn, ri)
            except Exception:
                n_skipped += 1
                continue
            if not packets:
                n_skipped += 1
                continue
            first = packets[0][1]
            ownership = first.get("ownership")
            if ownership is None:
                n_skipped += 1
                continue
            own_arr = np.array(ownership, dtype=np.float64)
            try:
                feats = extract_ownership_features(own_arr)
            except Exception:
                n_skipped += 1
                continue
            if not feats:
                n_skipped += 1
                continue
            row = {"stem": stem, "turn": turn, "realization": ri, **feats}
            csv_w.writerow(row)
        csv_f.flush()
        n_done += 1
        if n_done % 25 == 0 or n_done == len(positions):
            dt = time.monotonic() - t0
            rate = n_done / max(dt, 1e-9)
            eta = (len(positions) - n_done) / max(rate, 1e-9)
            print(f"  [{n_done}/{len(positions)}] {rate:.1f} pos/s  "
                  f"elapsed {dt:.0f}s  eta {eta:.0f}s  "
                  f"skipped {n_skipped}", flush=True)

    csv_f.close()
    conn.close()
    print(f"\ndone in {time.monotonic()-t0:.0f}s; CSV: {args.out_csv}",
          flush=True)
    print(f"skipped {n_skipped} realizations (no ownership data)",
          flush=True)


if __name__ == "__main__":
    main()
