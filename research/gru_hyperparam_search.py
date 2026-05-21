"""
research/gru_hyperparam_search.py

Hyperparameter sweep for the multi-task per-step GRU stability
classifier. Reuses the data-prep pipeline from gru_per_step.py:
dense labels, sequences, standardization, and train/val/test split
are computed ONCE up-front; per-combo cost is just training.

Sweep dimensions (4 × 4 × 3 = 48 combos):
  hidden_dim ∈ {16, 32, 64, 128}
  weight_decay ∈ {1e-5, 1e-4, 1e-3, 1e-2}
  dropout ∈ {0.0, 0.3, 0.5}

Early stopping: patience 5 epochs of no val_loss improvement.
Per-combo best checkpoint saved by val_loss.

Tensorboard: one run per combo under
  /home/bork/w/vdc/tensorboard/visit_scaling_gru_hpsearch/<timestamp>/
Compare side-by-side at http://localhost:6006/ with the regex filter
matching the sweep root.

Output ranking written to the sweep root as `ranking.txt`.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import itertools
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gru_per_step as gps  # noqa: E402
from pg_sink import connect, count_thin_coverage  # noqa: E402


def train_one(
    hidden: int, weight_decay: float, dropout: float,
    *,
    X_norm: np.ndarray, Y_bin: np.ndarray, mask: np.ndarray,
    train_idx: np.ndarray, val_idx: np.ndarray, cards_idx: np.ndarray,
    T: int, F: int, K_ext: int, extractors: list,
    n_epochs_max: int, patience: int, lr: float, batch_size: int,
    writer: SummaryWriter, log_prefix: str, ckpt_path: Path,
) -> dict:
    """Train a single hyperparam combo with early stopping. Returns a
    summary dict with best val_loss, best AUC OOD, best epoch, etc."""
    device = torch.device("cpu")
    torch.manual_seed(42)  # same model init seed across combos for fairness
    model = gps.GRUStability(
        input_dim=F, hidden_dim=hidden, n_layers=2,
        n_extractors=K_ext, dropout=dropout,
    ).to(device)
    optim = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    bce = nn.BCEWithLogitsLoss(reduction="none")

    train_ds = gps.SeqDataset(X_norm[train_idx], Y_bin[train_idx], mask[train_idx])
    val_ds = gps.SeqDataset(X_norm[val_idx], Y_bin[val_idx], mask[val_idx])
    train_loader = DataLoader(train_ds, batch_size=batch_size,
                              shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)
    X_cards = X_norm[cards_idx]
    Y_cards = Y_bin[cards_idx]
    M_cards = mask[cards_idx]

    best_val = float("inf")
    best_epoch = -1
    best_auc = float("nan")
    epochs_without_improvement = 0
    t_total = time.monotonic()

    for epoch in range(n_epochs_max):
        # Train
        model.train()
        train_loss_sum = 0.0
        n_train_labels = 0.0
        for xb, yb, mb in train_loader:
            optim.zero_grad()
            logits = model(xb)
            losses = bce(logits, yb) * mb
            denom = mb.sum() + 1e-9
            loss = losses.sum() / denom
            loss.backward()
            optim.step()
            train_loss_sum += float(loss.item()) * float(mb.sum().item())
            n_train_labels += float(mb.sum().item())
        train_loss = train_loss_sum / max(n_train_labels, 1.0)

        # Val
        model.eval()
        val_loss_sum = 0.0
        n_val_labels = 0.0
        with torch.no_grad():
            for xb, yb, mb in val_loader:
                logits = model(xb)
                losses = bce(logits, yb) * mb
                val_loss_sum += float(losses.sum().item())
                n_val_labels += float(mb.sum().item())
        val_loss = val_loss_sum / max(n_val_labels, 1.0)

        # OOD AUC (mean across extractors and steps)
        per_step_auc = gps.compute_per_step_auc_ood(
            model, X_cards, Y_cards, M_cards, extractors, device,
        )
        all_aucs = np.concatenate([per_step_auc[ext] for ext in extractors])
        valid_aucs = all_aucs[np.isfinite(all_aucs)]
        mean_auc = float(valid_aucs.mean()) if valid_aucs.size else float("nan")

        # Tensorboard
        writer.add_scalar(f"{log_prefix}/loss_train", train_loss, epoch)
        writer.add_scalar(f"{log_prefix}/loss_val", val_loss, epoch)
        writer.add_scalar(f"{log_prefix}/auc_ood_mean", mean_auc, epoch)
        for ei, ext in enumerate(extractors):
            aucs = per_step_auc[ext]
            v = aucs[np.isfinite(aucs)]
            ext_mean = float(v.mean()) if v.size else float("nan")
            writer.add_scalar(f"{log_prefix}/auc_ood_{ext}", ext_mean, epoch)

        # Early stopping bookkeeping
        if val_loss < best_val - 1e-6:
            best_val = val_loss
            best_epoch = epoch
            best_auc = mean_auc
            torch.save(model.state_dict(), ckpt_path)
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                break

    return {
        "best_val_loss": best_val,
        "best_epoch": best_epoch,
        "best_auc_ood": best_auc,
        "epochs_trained": epoch + 1,
        "wall_time": time.monotonic() - t_total,
    }


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
        default=Path("/home/bork/w/vdc/tensorboard/visit_scaling_gru_hpsearch"),
        type=Path,
    )
    ap.add_argument("--n-epochs-max", type=int, default=40)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--label-workers", type=int, default=4)
    ap.add_argument("--label-batch-size", type=int, default=8)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--hidden-dims", nargs="+", type=int,
        default=[16, 32, 64, 128],
    )
    ap.add_argument(
        "--weight-decays", nargs="+", type=float,
        default=[1e-5, 1e-4, 1e-3, 1e-2],
    )
    ap.add_argument(
        "--dropouts", nargs="+", type=float,
        default=[0.0, 0.3, 0.5],
    )
    args = ap.parse_args()

    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    sweep_root = args.tb_root / f"sweep_{int(time.time())}"
    sweep_root.mkdir(parents=True, exist_ok=True)
    print(f"=== GRU hyperparameter search ===", flush=True)
    print(f"  f_max={args.f_max}  threshold={gps.LABEL_THRESHOLD}", flush=True)
    print(f"  hidden_dims:   {args.hidden_dims}", flush=True)
    print(f"  weight_decays: {args.weight_decays}", flush=True)
    print(f"  dropouts:      {args.dropouts}", flush=True)
    n_combos = len(args.hidden_dims) * len(args.weight_decays) * len(args.dropouts)
    print(f"  total combos:  {n_combos}", flush=True)
    print(f"  early stopping: patience={args.patience}, max_epochs={args.n_epochs_max}",
          flush=True)
    print(f"  tensorboard sweep root: {sweep_root}", flush=True)

    cache_npz = np.load(args.cache, allow_pickle=True)
    cache = {k: cache_npz[k] for k in cache_npz.files}

    # Thin-fetch path
    try:
        conn = connect()
        n_thin, n_total = count_thin_coverage(conn)
        conn.close()
        if n_thin / max(n_total, 1) >= 0.999:
            gps._USE_THIN = True
            print(f"  using thin-projection fetch", flush=True)
    except Exception:
        pass

    # Common pipeline (Phase A + sequences + standardize + split)
    print("\n=== one-time prep ===", flush=True)
    t0 = time.monotonic()
    dense_labels = gps.build_dense_labels(
        cache, args.f_max, force_rebuild=False,
        workers=args.label_workers, batch_size=args.label_batch_size,
    )
    seq = gps.build_sequences(cache, dense_labels, args.f_max)
    X = seq["X"]
    Y_float = seq["Y"]
    groups = seq["groups"]
    domains = seq["domains"]
    T = seq["T"]
    F = seq["F"]
    K_ext = seq["K_ext"]
    extractors = seq["extractors"]
    mask = np.isfinite(Y_float).astype(np.float64)
    Y_bin = np.where(mask > 0, (Y_float >= gps.LABEL_THRESHOLD).astype(np.float64), 0.0)

    y2k_idx_seq = np.where(domains == "year2k")[0]
    cards_idx_seq = np.where(domains == "cards")[0]
    y2k_groups = np.unique(groups[y2k_idx_seq])
    rng = np.random.default_rng(args.seed)
    rng.shuffle(y2k_groups)
    n_val_groups = max(1, int(round(len(y2k_groups) * args.val_frac)))
    val_groups = set(y2k_groups[:n_val_groups].tolist())
    train_groups = set(y2k_groups[n_val_groups:].tolist())
    train_idx = np.array([i for i in y2k_idx_seq
                          if int(groups[i]) in train_groups], dtype=np.int64)
    val_idx = np.array([i for i in y2k_idx_seq
                        if int(groups[i]) in val_groups], dtype=np.int64)
    cards_idx = cards_idx_seq

    # Standardize on train slice
    train_X = X[train_idx]
    mu = train_X.reshape(-1, F).mean(axis=0)
    sd = train_X.reshape(-1, F).std(axis=0) + 1e-6
    X_norm = ((X - mu) / sd).astype(np.float32)
    print(f"  prep done in {time.monotonic()-t0:.1f}s.  "
          f"train={len(train_idx)}  val={len(val_idx)}  test={len(cards_idx)}",
          flush=True)

    # Sweep
    writer = SummaryWriter(log_dir=str(sweep_root))
    results: list[dict] = []
    combos = list(itertools.product(
        args.hidden_dims, args.weight_decays, args.dropouts,
    ))
    print(f"\n=== sweep ({n_combos} combos) ===", flush=True)
    sweep_start = time.monotonic()
    for idx, (hidden, wd, dropout) in enumerate(combos):
        tag = f"h{hidden:03d}_wd{wd:.0e}_do{dropout:.1f}"
        ckpt_path = sweep_root / f"{tag}.pt"
        print(f"\n[{idx+1}/{len(combos)}] {tag}", flush=True)
        summary = train_one(
            hidden=hidden, weight_decay=wd, dropout=dropout,
            X_norm=X_norm, Y_bin=Y_bin, mask=mask,
            train_idx=train_idx, val_idx=val_idx, cards_idx=cards_idx,
            T=T, F=F, K_ext=K_ext, extractors=extractors,
            n_epochs_max=args.n_epochs_max, patience=args.patience,
            lr=args.lr, batch_size=args.batch_size,
            writer=writer, log_prefix=tag, ckpt_path=ckpt_path,
        )
        results.append({
            "tag": tag, "hidden": hidden, "weight_decay": wd, "dropout": dropout,
            **summary,
        })
        # Log scalar at "sweep step = combo index" for at-a-glance comparison
        writer.add_scalar("sweep/best_val_loss", summary["best_val_loss"], idx)
        writer.add_scalar("sweep/best_auc_ood", summary["best_auc_ood"], idx)
        writer.add_scalar("sweep/epochs_trained", summary["epochs_trained"], idx)
        print(f"  best_val={summary['best_val_loss']:.4f} "
              f"best_auc_ood={summary['best_auc_ood']:+.4f}  "
              f"epoch={summary['best_epoch']}  "
              f"trained={summary['epochs_trained']}  "
              f"({summary['wall_time']:.0f}s)",
              flush=True)
        dt_total = time.monotonic() - sweep_start
        eta = dt_total / (idx + 1) * (len(combos) - idx - 1)
        print(f"  cumulative {dt_total:.0f}s  eta {eta:.0f}s", flush=True)

    writer.close()

    # Ranking
    results.sort(key=lambda r: -r["best_auc_ood"]
                 if np.isfinite(r["best_auc_ood"]) else 0.0)
    ranking_path = sweep_root / "ranking.txt"
    with ranking_path.open("w") as f:
        f.write(f"# GRU hyperparameter search\n")
        f.write(f"# sweep root: {sweep_root}\n")
        f.write(f"# n_combos: {len(results)}\n\n")
        header = (
            f"{'rank':>4s}  {'tag':<30s}  "
            f"{'hidden':>7s}  {'wd':>9s}  {'dropout':>7s}  "
            f"{'AUC_OOD':>9s}  {'val_loss':>9s}  "
            f"{'best_ep':>8s}  {'epochs':>7s}  {'time_s':>7s}"
        )
        f.write(header + "\n")
        for rank, r in enumerate(results):
            f.write(
                f"{rank+1:>4d}  {r['tag']:<30s}  "
                f"{r['hidden']:>7d}  {r['weight_decay']:>9.0e}  {r['dropout']:>7.2f}  "
                f"{r['best_auc_ood']:>+9.4f}  {r['best_val_loss']:>9.4f}  "
                f"{r['best_epoch']:>8d}  {r['epochs_trained']:>7d}  "
                f"{r['wall_time']:>7.0f}\n"
            )
    print(f"\n=== sweep complete ({time.monotonic()-sweep_start:.0f}s) ===",
          flush=True)
    print(f"  ranking: {ranking_path}", flush=True)
    print(f"\n=== top 10 by AUC OOD ===", flush=True)
    for rank, r in enumerate(results[:10]):
        print(f"  [{rank+1}] {r['tag']}: "
              f"AUC_OOD={r['best_auc_ood']:+.4f}  "
              f"val_loss={r['best_val_loss']:.4f}  "
              f"best_epoch={r['best_epoch']}",
              flush=True)


if __name__ == "__main__":
    main()
