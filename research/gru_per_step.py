"""
research/gru_per_step.py

Multi-task GRU over per-V_grid-step sequences. Predicts P(stable to
budget) at every V_grid step k simultaneously for each of the 5
well-behaved stability extractors. Trained on year2k positions
(per-realization sequences), eval AUC OOD on cards.db. Tensorboard
logging to /home/bork/w/vdc/tensorboard/visit_scaling_gru/.

The exercise: does a sequence model with multi-task heads capture
structure the per-(extractor, threshold) LightGBM allocator cells
miss? Specifically, can it exploit the 20pp truth-oracle gap that
the LightGBM-with-marginal-value-look-ahead couldn't?

Input per (position, realization, step) — 33 dims:
  log(V_grid[k])                                     (1)
  step_idx / (N_GRID - 1)                            (1)
  y_realiz at step k, per target (7 targets)         (7)
  top1_changed_from_prev (3-way: same/diff/unknown)  (1)
  phase35 (broadcast at every step, constant)        (23)

Output per (position, realization, step) — 5 sigmoid heads:
  P(stable to budget | extractor) for each of:
    top1_move, top3_set, top2_margin_quintile,
    scoreLead_sign, search_agrees_with_policy
  (winrate_change_* dropped as operationally degenerate)

Labels: stable_fraction_logV(V_grid[k], V_max=V_grid[max_idx])
computed via compute_position_stability_data_per_packet with
cutoff_Vs = V_grid[0:max_idx], cached separately from the
per-packet allocator labels (different cutoff set).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader, Dataset
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))

import allocator_sim_per_packet as app  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, count_thin_coverage,
    fetch_positions_bundle_lossless_batch,
    fetch_positions_bundle_thin_batch,
)
from stability_trajectory import StabilityTrajectory  # noqa: E402


# Extractors the GRU predicts (drop winrate_change_* — operationally degenerate)
GRU_EXTRACTORS = (
    "top1_move", "top3_set", "top2_margin_quintile",
    "scoreLead_sign", "search_agrees_with_policy",
)

# Targets whose y_realiz arrays we feed as input features
INPUT_TARGETS = (
    "visit_entropy_reduction", "winrate_drift", "scoreLead_drift",
    "L2_joint_drift", "logit_winrate_drift", "score_stdev_reduction",
    "top_move_visit_fraction",
)

# Threshold to binarize the stable_fraction labels
LABEL_THRESHOLD = 0.95

DENSE_CACHE_DIR = Path(__file__).resolve().parent / "data" / "gru_dense_labels"
DENSE_SCHEMA_VERSION = "v1_dense_50"


# ── Dense per-step label generation ────────────────────────────────────────

_WORKER_CONN = None
_USE_THIN = False


def _worker_init() -> None:
    global _WORKER_CONN
    _WORKER_CONN = connect()


def _dense_cache_path(stem: str, turn: int, f_max: float) -> Path:
    shard = stem[:1] if stem else "_"
    return DENSE_CACHE_DIR / f"f_max_{f_max:.3f}" / shard / f"{stem}_t{turn}.pkl"


def _worker_fetch_and_compute_dense(
    chunk: list[tuple[str, int, np.ndarray, float, Path]],
) -> dict:
    """Per-chunk worker that fetches a batch via thin (or lossless) path
    and computes per-step stable_fractions across all V_grid steps."""
    if not chunk:
        return {}
    conn = _WORKER_CONN if _WORKER_CONN is not None else connect()
    keys = [(s, t) for s, t, _cv, _vm, _p in chunk]
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
    for stem, turn, cutoff_Vs, V_max_query, cache_path in chunk:
        bundle = bundles.get((stem, turn))
        if not bundle:
            continue
        data = app.compute_position_stability_data_per_packet(
            bundle, cutoff_Vs, V_max_query,
        )
        if data is None:
            continue
        data["cutoff_Vs"] = list(map(float, cutoff_Vs))
        data["V_max_query"] = float(V_max_query)
        data["cache_schema_version"] = DENSE_SCHEMA_VERSION
        # Save per-position
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache_path.with_suffix(".tmp")
        with tmp.open("wb") as f:
            pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
        tmp.replace(cache_path)
        out[(stem, turn)] = data
    return out


def build_dense_labels(
    cache: dict, f_max: float, force_rebuild: bool = False,
    workers: int = 4, batch_size: int = 8,
) -> dict:
    """For each (position, realization, extractor), compute the
    stable_fraction at every V_grid step k from 0 to max_idx-1, where
    max_idx is determined by f_max. Cached per position on disk.

    Returns dict mapping (stem, turn) → cached pickle dict."""
    stems = cache["stems"]
    turns = cache["turns"]
    V_lo_arr = cache["V_lo"]
    V_hi_arr = cache["V_hi"]
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    n_total = len(stems)

    if not (0.0 < f_max <= 1.0):
        raise ValueError(f"f_max must be in (0, 1]; got {f_max}")
    max_idx = min(N_GRID - 1, int(round(N_GRID * f_max)) - 1)
    # Dense cutoff set: every V_grid point from index 0 up to (but not
    # including) max_idx. That's max_idx cutoffs, each in [V_lo, V_max).
    # We label each STEP k with the stability of the answer at V_grid[k]
    # through V_max = V_grid[max_idx].
    n_steps = max_idx
    print(f"  N_GRID={N_GRID}  max_idx={max_idx}  n_steps={n_steps}", flush=True)
    print(f"  schema={DENSE_SCHEMA_VERSION}  cache_dir={DENSE_CACHE_DIR}", flush=True)

    n_hit = 0
    n_skipped = 0
    n_errors = 0
    results: dict[tuple[str, int], dict] = {}
    to_fetch: list[tuple[str, int, np.ndarray, float, Path]] = []

    def _is_cache_hit(entry, cutoff_Vs, V_max_query):
        if entry is None:
            return False
        if entry.get("cache_schema_version") != DENSE_SCHEMA_VERSION:
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

    scan_step = max(200, n_total // 8)
    for i in range(n_total):
        stem = str(stems[i])
        turn = int(turns[i])
        V_lo = float(V_lo_arr[i])
        V_hi = float(V_hi_arr[i])
        if not (np.isfinite(V_lo) and np.isfinite(V_hi) and V_lo < V_hi):
            n_skipped += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        cutoff_Vs = V_grid[:max_idx]
        V_max_query = float(V_grid[max_idx])
        cache_path = _dense_cache_path(stem, turn, f_max)

        if not force_rebuild and cache_path.exists():
            try:
                with cache_path.open("rb") as f:
                    cached = pickle.load(f)
                if _is_cache_hit(cached, cutoff_Vs, V_max_query):
                    results[(stem, turn)] = cached
                    n_hit += 1
                    if (i + 1) % scan_step == 0:
                        print(f"  scan: {i+1}/{n_total}  hits={n_hit} "
                              f"pending={len(to_fetch)}", flush=True)
                    continue
            except Exception:
                pass
        to_fetch.append((stem, turn, cutoff_Vs, V_max_query, cache_path))

    print(f"  cache scan: hits={n_hit} skipped={n_skipped} to_fetch={len(to_fetch)}",
          flush=True)
    if not to_fetch:
        return results

    chunks = [to_fetch[k:k+batch_size] for k in range(0, len(to_fetch), batch_size)]
    n_chunks = len(chunks)
    print(f"  parallel fetch: workers={workers} chunks={n_chunks}", flush=True)

    t0 = time.monotonic()
    chunks_done = 0
    with mp.Pool(processes=workers, initializer=_worker_init) as pool:
        for res in pool.imap_unordered(_worker_fetch_and_compute_dense, chunks):
            if "__error__" in res:
                print(f"  ERROR chunk: {res['__error__']}", flush=True)
                n_errors += 1
            else:
                for k, v in res.items():
                    results[k] = v
            chunks_done += 1
            if chunks_done % max(1, n_chunks // 10) == 0 or chunks_done == n_chunks:
                dt = time.monotonic() - t0
                rate = chunks_done / max(dt, 1e-9)
                eta = (n_chunks - chunks_done) / max(rate, 1e-9)
                print(f"  fetch [{chunks_done}/{n_chunks}]  "
                      f"elapsed={dt:.0f}s eta={eta:.0f}s  err={n_errors}",
                      flush=True)
    print(f"  dense labels: {len(results)} positions  err={n_errors}", flush=True)
    return results


# ── Sequence + label tensor construction ───────────────────────────────────

def build_sequences(
    cache: dict, dense_labels: dict, f_max: float,
) -> dict:
    """Build (N_seq, T, F) input tensor and (N_seq, T, K_ext) label
    tensor, plus group ids and domain labels. T = max_idx (the number
    of supervision steps), F = 33 input features, K_ext = 5 extractor
    heads.

    Sequences are per (position, realization). Drops sequences where
    phase35 has NaN."""
    N_GRID = int(np.asarray(cache["N_GRID"]).flat[0])
    max_idx = min(N_GRID - 1, int(round(N_GRID * f_max)) - 1)
    T = max_idx
    domains_full = np.array(cache["domains"], dtype=object)
    stems_arr = np.array(cache["stems"], dtype=object)
    turns_arr = np.array(cache["turns"], dtype=np.int32)
    V_lo_arr = np.asarray(cache["V_lo"], dtype=np.float64)
    V_hi_arr = np.asarray(cache["V_hi"], dtype=np.float64)
    phase35 = np.asarray(cache["phase35"], dtype=np.float64)
    n_pos = len(stems_arr)

    # Pre-extract per-target y_realiz arrays
    y_realiz_by_target: dict[str, np.ndarray] = {}
    for tname in INPUT_TARGETS:
        key = f"y_realiz_{tname}"
        if key in cache:
            y_realiz_by_target[tname] = np.asarray(cache[key], dtype=np.float64)
    top1_realiz = np.asarray(cache["top1_realiz"], dtype=np.int32)
    R = top1_realiz.shape[1]

    X_list: list[np.ndarray] = []
    Y_list: list[np.ndarray] = []
    g_list: list[int] = []
    d_list: list[str] = []

    n_dropped_phase35 = 0
    n_dropped_no_labels = 0
    n_dropped_empty_y = 0

    F = 1 + 1 + len(INPUT_TARGETS) + 1 + phase35.shape[1]
    K_ext = len(GRU_EXTRACTORS)
    UNK_TOP1 = -1

    for i in range(n_pos):
        stem = str(stems_arr[i])
        turn = int(turns_arr[i])
        # Phase35 must be all-finite
        ph_row = phase35[i]
        if not np.isfinite(ph_row).all():
            n_dropped_phase35 += 1
            continue
        V_lo = float(V_lo_arr[i])
        V_hi = float(V_hi_arr[i])
        if not (np.isfinite(V_lo) and np.isfinite(V_hi) and V_lo < V_hi):
            n_dropped_phase35 += 1
            continue
        V_grid = np.geomspace(V_lo, V_hi, N_GRID)
        log_V = np.log(V_grid[:T])
        step_frac = np.arange(T, dtype=np.float64) / max(N_GRID - 1, 1)
        domain = str(domains_full[i])

        # Labels — per-realization stable_fraction at each step
        label_data = dense_labels.get((stem, turn))
        if label_data is None:
            n_dropped_no_labels += 1
            continue

        for r_idx in range(R):
            real_data = label_data["realizations"].get(int(r_idx))
            if real_data is None:
                continue
            # Per-extractor label arrays
            label_arrs: list[np.ndarray] = []
            label_ok = True
            for ext in GRU_EXTRACTORS:
                arr = real_data["stable_fractions"].get(ext)
                if arr is None:
                    label_ok = False
                    break
                arr = np.asarray(arr, dtype=np.float64)
                if arr.shape[0] != T:
                    # Truncate or pad to T (use NaN for missing)
                    pad = np.full(T, np.nan)
                    pad[:min(T, arr.shape[0])] = arr[:min(T, arr.shape[0])]
                    arr = pad
                label_arrs.append(arr)
            if not label_ok or not label_arrs:
                continue
            Y_seq = np.stack(label_arrs, axis=-1)  # (T, K_ext) of float fractions

            # Per-realization y features at each step
            y_feats = np.full((T, len(INPUT_TARGETS)), np.nan)
            for ti_in, tname in enumerate(INPUT_TARGETS):
                yarr = y_realiz_by_target.get(tname)
                if yarr is None:
                    continue
                y_feats[:, ti_in] = yarr[i, r_idx, :T]
            # Replace residual NaNs with column means (per-target) for this realization
            for col in range(y_feats.shape[1]):
                col_arr = y_feats[:, col]
                if np.isnan(col_arr).all():
                    y_feats[:, col] = 0.0
                else:
                    m = float(np.nanmean(col_arr))
                    y_feats[:, col] = np.where(np.isnan(col_arr), m, col_arr)

            # top1 change indicator
            top1_row = top1_realiz[i, r_idx, :T]
            top1_changed = np.zeros(T, dtype=np.float64)
            prev = top1_row[0]
            for k in range(T):
                cur = int(top1_row[k])
                if cur < 0 or prev < 0:
                    top1_changed[k] = 0.5  # "unknown" sentinel
                elif cur != prev:
                    top1_changed[k] = 1.0
                else:
                    top1_changed[k] = 0.0
                prev = cur

            # Assemble per-step feature vector
            feat_block = np.zeros((T, F), dtype=np.float64)
            feat_block[:, 0] = log_V
            feat_block[:, 1] = step_frac
            feat_block[:, 2:2 + len(INPUT_TARGETS)] = y_feats
            feat_block[:, 2 + len(INPUT_TARGETS)] = top1_changed
            feat_block[:, 2 + len(INPUT_TARGETS) + 1:] = ph_row[None, :]

            X_list.append(feat_block)
            Y_list.append(Y_seq)
            g_list.append(i)
            d_list.append(domain)

    if not X_list:
        return {
            "X": np.empty((0, T, F)),
            "Y": np.empty((0, T, K_ext)),
            "groups": np.empty(0, dtype=np.int64),
            "domains": np.array([], dtype=object),
            "T": T,
            "F": F,
            "K_ext": K_ext,
            "extractors": list(GRU_EXTRACTORS),
        }

    X = np.stack(X_list, axis=0)
    Y = np.stack(Y_list, axis=0)
    groups = np.array(g_list, dtype=np.int64)
    domains = np.array(d_list, dtype=object)

    print(f"  sequences: {X.shape}  labels: {Y.shape}", flush=True)
    print(f"  dropped: phase35_nan={n_dropped_phase35} "
          f"no_labels={n_dropped_no_labels} empty_y={n_dropped_empty_y}",
          flush=True)
    return {
        "X": X, "Y": Y, "groups": groups, "domains": domains,
        "T": T, "F": F, "K_ext": K_ext,
        "extractors": list(GRU_EXTRACTORS),
    }


# ── Model ──────────────────────────────────────────────────────────────────

class GRUStability(nn.Module):
    def __init__(
        self, input_dim: int, hidden_dim: int = 128, n_layers: int = 2,
        n_extractors: int = 5, dropout: float = 0.1,
    ):
        super().__init__()
        self.gru = nn.GRU(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=n_layers,
            batch_first=True,
            dropout=dropout if n_layers > 1 else 0.0,
        )
        # Per-extractor head: shared GRU output → independent linear per extractor
        self.heads = nn.Linear(hidden_dim, n_extractors)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, F)
        out, _ = self.gru(x)  # (B, T, hidden)
        logits = self.heads(out)  # (B, T, K_ext)
        return logits


class SeqDataset(Dataset):
    def __init__(self, X: np.ndarray, Y_bin: np.ndarray, mask: np.ndarray):
        self.X = torch.from_numpy(X).float()
        self.Y = torch.from_numpy(Y_bin).float()
        self.M = torch.from_numpy(mask).float()

    def __len__(self) -> int:
        return self.X.shape[0]

    def __getitem__(self, idx: int):
        return self.X[idx], self.Y[idx], self.M[idx]


def compute_per_step_auc_ood(
    model: GRUStability, X_cards: np.ndarray, Y_bin_cards: np.ndarray,
    mask_cards: np.ndarray, extractors: list[str],
    device: torch.device,
) -> dict:
    """Per-(extractor, step) AUC OOD on cards.db. Returns
    {extractor_name: np.ndarray of shape (T,) with AUC per step}."""
    model.eval()
    with torch.no_grad():
        X_t = torch.from_numpy(X_cards).float().to(device)
        # Run in batches to bound memory
        bs = 256
        logits_chunks = []
        for k in range(0, X_t.shape[0], bs):
            logits_chunks.append(model(X_t[k:k+bs]).cpu().numpy())
        logits = np.concatenate(logits_chunks, axis=0)
    probs = 1.0 / (1.0 + np.exp(-logits))  # (N, T, K_ext)
    T = probs.shape[1]
    per_step_auc: dict[str, np.ndarray] = {}
    for ei, ext in enumerate(extractors):
        aucs = np.full(T, np.nan)
        for k in range(T):
            y_t = Y_bin_cards[:, k, ei]
            m_t = mask_cards[:, k, ei]
            p_t = probs[:, k, ei]
            valid = m_t > 0.5
            if valid.sum() < 10:
                continue
            y_valid = y_t[valid]
            if len(set(y_valid.tolist())) < 2:
                continue
            try:
                aucs[k] = float(roc_auc_score(y_valid, p_t[valid]))
            except ValueError:
                pass
        per_step_auc[ext] = aucs
    return per_step_auc


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=Path(__file__).resolve().parent / "data" / "trajectory_cache.npz",
        type=Path,
    )
    ap.add_argument("--f-max", default=0.85, type=float)
    ap.add_argument(
        "--tb-root",
        default=Path("/home/bork/w/vdc/tensorboard/visit_scaling_gru"),
        type=Path,
    )
    ap.add_argument("--n-epochs", type=int, default=60)
    ap.add_argument("--batch-size-train", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-5)
    ap.add_argument("--hidden-dim", type=int, default=128)
    ap.add_argument("--n-layers", type=int, default=2)
    ap.add_argument("--dropout", type=float, default=0.1)
    ap.add_argument("--force-rebuild", action="store_true")
    ap.add_argument("--label-workers", type=int, default=4)
    ap.add_argument("--label-batch-size", type=int, default=8)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--val-frac", type=float, default=0.15,
                    help="Fraction of year2k positions held out for in-distribution val")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print(f"=== GRU per-step stability ===", flush=True)
    print(f"  f_max={args.f_max}  threshold={LABEL_THRESHOLD}", flush=True)
    print(f"  extractors: {list(GRU_EXTRACTORS)}", flush=True)
    print(f"  hidden_dim={args.hidden_dim}  n_layers={args.n_layers}", flush=True)

    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}
    domains_full = np.array(cache["domains"], dtype=object)
    n_y2k = int((domains_full == "year2k").sum())
    n_cards = int((domains_full == "cards").sum())
    print(f"  cache: {n_y2k} year2k + {n_cards} cards positions", flush=True)

    # Thin-fetch coverage
    global _USE_THIN
    try:
        conn = connect()
        n_thin, n_total = count_thin_coverage(conn)
        conn.close()
        if n_thin / max(n_total, 1) >= 0.999:
            _USE_THIN = True
            print(f"  using thin-projection fetch", flush=True)
    except Exception:
        pass

    # 1. Dense labels
    print("\n=== Phase A: dense labels ===", flush=True)
    dense_labels = build_dense_labels(
        cache, args.f_max,
        force_rebuild=args.force_rebuild,
        workers=args.label_workers,
        batch_size=args.label_batch_size,
    )

    # 2. Sequences
    print("\n=== Phase B: sequences ===", flush=True)
    seq = build_sequences(cache, dense_labels, args.f_max)
    X = seq["X"]
    Y_float = seq["Y"]
    groups = seq["groups"]
    domains = seq["domains"]
    T = seq["T"]
    F = seq["F"]
    K_ext = seq["K_ext"]
    extractors = seq["extractors"]
    print(f"  feature dim F={F}  steps T={T}  heads K={K_ext}",
          flush=True)

    # Binarize labels + build NaN mask
    mask = np.isfinite(Y_float).astype(np.float64)
    Y_bin = np.where(mask > 0, (Y_float >= LABEL_THRESHOLD).astype(np.float64), 0.0)

    # 3. Train / val (year2k) / test (cards) split
    y2k_mask_seq = (domains == "year2k")
    cards_mask_seq = (domains == "cards")
    y2k_idx = np.where(y2k_mask_seq)[0]
    cards_idx = np.where(cards_mask_seq)[0]
    y2k_groups = np.unique(groups[y2k_idx])
    rng = np.random.default_rng(args.seed)
    rng.shuffle(y2k_groups)
    n_val_groups = max(1, int(round(len(y2k_groups) * args.val_frac)))
    val_groups = set(y2k_groups[:n_val_groups].tolist())
    train_groups = set(y2k_groups[n_val_groups:].tolist())
    train_idx = np.array([
        i for i in y2k_idx if int(groups[i]) in train_groups
    ], dtype=np.int64)
    val_idx = np.array([
        i for i in y2k_idx if int(groups[i]) in val_groups
    ], dtype=np.int64)
    print(f"  train: {len(train_idx)} sequences  "
          f"({len(train_groups)} y2k positions)", flush=True)
    print(f"  val:   {len(val_idx)} sequences   "
          f"({len(val_groups)} y2k positions)", flush=True)
    print(f"  test:  {len(cards_idx)} sequences  ({len(np.unique(groups[cards_idx]))} cards positions)",
          flush=True)

    # 4. Tensorboard setup
    run_name = f"f_max_{args.f_max:.2f}_h{args.hidden_dim}_L{args.n_layers}_lr{args.lr}_seed{args.seed}_{int(time.time())}"
    tb_dir = args.tb_root / run_name
    tb_dir.mkdir(parents=True, exist_ok=True)
    writer = SummaryWriter(log_dir=str(tb_dir))
    print(f"\n  tensorboard: {tb_dir}", flush=True)
    print(f"  open http://localhost:6006/  filter: {run_name}", flush=True)

    # 5. Model + loaders
    device = torch.device("cpu")
    model = GRUStability(
        input_dim=F, hidden_dim=args.hidden_dim, n_layers=args.n_layers,
        n_extractors=K_ext, dropout=args.dropout,
    ).to(device)
    optimizer = torch.optim.Adam(
        model.parameters(), lr=args.lr, weight_decay=args.weight_decay,
    )
    # Per-extractor BCE (with logits). We'll mask NaNs.
    bce = nn.BCEWithLogitsLoss(reduction="none")

    # Standardize input features using train stats (over the train slice)
    train_X = X[train_idx]
    mu = train_X.reshape(-1, F).mean(axis=0)
    sd = train_X.reshape(-1, F).std(axis=0) + 1e-6
    X_norm = ((X - mu) / sd).astype(np.float32)
    print(f"  feature standardization: μ.shape={mu.shape}  σ range "
          f"[{sd.min():.2e}, {sd.max():.2e}]", flush=True)

    train_ds = SeqDataset(X_norm[train_idx], Y_bin[train_idx], mask[train_idx])
    val_ds = SeqDataset(X_norm[val_idx], Y_bin[val_idx], mask[val_idx])
    train_loader = DataLoader(train_ds, batch_size=args.batch_size_train,
                              shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)
    X_cards_norm = X_norm[cards_idx]
    Y_cards = Y_bin[cards_idx]
    M_cards = mask[cards_idx]

    # 6. Training loop
    print("\n=== training ===", flush=True)
    global_step = 0
    best_val_loss = float("inf")
    for epoch in range(args.n_epochs):
        # Train
        model.train()
        t0 = time.monotonic()
        train_loss_sum = 0.0
        train_loss_per_ext = np.zeros(K_ext)
        train_n_per_ext = np.zeros(K_ext)
        for xb, yb, mb in train_loader:
            xb, yb, mb = xb.to(device), yb.to(device), mb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            losses = bce(logits, yb)  # (B, T, K_ext)
            masked = losses * mb
            denom = mb.sum() + 1e-9
            loss = masked.sum() / denom
            loss.backward()
            optimizer.step()
            global_step += 1
            train_loss_sum += float(loss.item()) * float(mb.sum().item())
            for ei in range(K_ext):
                m_ei = mb[..., ei]
                l_ei = (losses[..., ei] * m_ei).sum().item()
                n_ei = m_ei.sum().item()
                train_loss_per_ext[ei] += l_ei
                train_n_per_ext[ei] += n_ei
        train_loss_avg = train_loss_sum / max(
            train_loss_per_ext.sum(), 1e-9,
        ) if False else float(np.mean([
            train_loss_per_ext[ei] / max(train_n_per_ext[ei], 1)
            for ei in range(K_ext)
        ]))

        # Val
        model.eval()
        val_loss_sum = 0.0
        val_loss_per_ext = np.zeros(K_ext)
        val_n_per_ext = np.zeros(K_ext)
        with torch.no_grad():
            for xb, yb, mb in val_loader:
                xb, yb, mb = xb.to(device), yb.to(device), mb.to(device)
                logits = model(xb)
                losses = bce(logits, yb)
                masked = losses * mb
                denom = mb.sum() + 1e-9
                loss = masked.sum() / denom
                val_loss_sum += float(loss.item()) * float(mb.sum().item())
                for ei in range(K_ext):
                    m_ei = mb[..., ei]
                    l_ei = (losses[..., ei] * m_ei).sum().item()
                    n_ei = m_ei.sum().item()
                    val_loss_per_ext[ei] += l_ei
                    val_n_per_ext[ei] += n_ei
        val_loss_avg = float(np.mean([
            val_loss_per_ext[ei] / max(val_n_per_ext[ei], 1)
            for ei in range(K_ext)
        ]))

        # OOD eval on cards (per-step AUC per extractor)
        per_step_auc = compute_per_step_auc_ood(
            model, X_cards_norm, Y_cards, M_cards, extractors, device,
        )

        # Tensorboard logging
        writer.add_scalar("loss/train_avg", train_loss_avg, epoch)
        writer.add_scalar("loss/val_avg", val_loss_avg, epoch)
        for ei, ext in enumerate(extractors):
            writer.add_scalar(
                f"loss/train_{ext}",
                train_loss_per_ext[ei] / max(train_n_per_ext[ei], 1),
                epoch,
            )
            writer.add_scalar(
                f"loss/val_{ext}",
                val_loss_per_ext[ei] / max(val_n_per_ext[ei], 1),
                epoch,
            )
            aucs = per_step_auc[ext]
            valid_aucs = aucs[np.isfinite(aucs)]
            mean_auc = float(valid_aucs.mean()) if valid_aucs.size else float("nan")
            writer.add_scalar(f"auc_ood/{ext}_mean_over_steps", mean_auc, epoch)
            # Specific cutoff steps for direct comparison to LightGBM cells
            for step_idx in (4, 8, 12, 16, 20, 24, 28, 32, 36, 40):
                if step_idx < T and np.isfinite(aucs[step_idx]):
                    writer.add_scalar(
                        f"auc_ood/{ext}_step_{step_idx:02d}",
                        float(aucs[step_idx]),
                        epoch,
                    )
        # Aggregate AUC OOD averaged across extractors and steps
        all_aucs = [aucs for aucs in per_step_auc.values()]
        all_aucs_flat = np.concatenate(all_aucs)
        valid_all = all_aucs_flat[np.isfinite(all_aucs_flat)]
        if valid_all.size:
            writer.add_scalar(
                "auc_ood/all_extractors_mean",
                float(valid_all.mean()), epoch,
            )

        dt = time.monotonic() - t0
        print(f"  epoch {epoch+1:>3d}/{args.n_epochs}  "
              f"train_loss={train_loss_avg:.4f}  val_loss={val_loss_avg:.4f}  "
              f"mean_auc_ood={(float(valid_all.mean()) if valid_all.size else float('nan')):+.4f}  "
              f"({dt:.0f}s)", flush=True)

        if val_loss_avg < best_val_loss:
            best_val_loss = val_loss_avg
            torch.save(model.state_dict(), tb_dir / "best.pt")

    writer.close()
    print(f"\n=== done; checkpoint at {tb_dir / 'best.pt'} ===", flush=True)
    print(f"  tensorboard: http://localhost:6006/ filter: {run_name}",
          flush=True)


if __name__ == "__main__":
    main()
