"""
research/gru_auc_stopping.py

One-shot test: best-config GRU (h=16, wd=1e-2, do=0.0) with AUC OOD
on cards.db as the early-stopping and checkpoint-selection criterion
instead of val_loss on year2k.

Tests whether the val_loss-based early stopping in
gru_hyperparam_search.py was discarding good checkpoints. If yes,
AUC OOD lifts meaningfully above +0.6129; if no, the ceiling stands.

NOTE: using OOD performance for model selection leaks the OOD set
into the selection process. The result here is best read as an
*upper bound* on what better stopping could yield. The OOD set is
~7720 sequences so the leak is small in absolute terms, but real.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gru_per_step as gps  # noqa: E402
from pg_sink import connect, count_thin_coverage  # noqa: E402


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
        default=Path("/home/bork/w/vdc/tensorboard/visit_scaling_gru_auc_stop"),
        type=Path,
    )
    ap.add_argument("--hidden", default=16, type=int)
    ap.add_argument("--weight-decay", default=1e-2, type=float)
    ap.add_argument("--dropout", default=0.0, type=float)
    ap.add_argument("--n-layers", default=2, type=int)
    ap.add_argument("--n-epochs-max", default=80, type=int)
    ap.add_argument("--patience", default=10, type=int,
                    help="Patience on AUC OOD improvement (epochs).")
    ap.add_argument("--batch-size", default=32, type=int)
    ap.add_argument("--lr", default=1e-3, type=float)
    ap.add_argument("--val-frac", default=0.15, type=float)
    ap.add_argument("--seed", default=42, type=int)
    args = ap.parse_args()

    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    print(f"=== GRU with AUC-OOD early stopping ===", flush=True)
    print(f"  config: h={args.hidden}  wd={args.weight_decay}  do={args.dropout}",
          flush=True)
    print(f"  patience={args.patience} on AUC OOD;  n_epochs_max={args.n_epochs_max}",
          flush=True)

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

    print("\n=== one-time prep ===", flush=True)
    t0 = time.monotonic()
    dense_labels = gps.build_dense_labels(
        cache, args.f_max, force_rebuild=False, workers=4, batch_size=8,
    )
    seq = gps.build_sequences(cache, dense_labels, args.f_max)
    X, Y_float, groups, domains = seq["X"], seq["Y"], seq["groups"], seq["domains"]
    T, F, K_ext = seq["T"], seq["F"], seq["K_ext"]
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

    train_X = X[train_idx]
    mu = train_X.reshape(-1, F).mean(axis=0)
    sd = train_X.reshape(-1, F).std(axis=0) + 1e-6
    X_norm = ((X - mu) / sd).astype(np.float32)
    print(f"  prep done in {time.monotonic()-t0:.1f}s.  "
          f"train={len(train_idx)}  val={len(val_idx)}  test={len(cards_idx)}",
          flush=True)

    device = torch.device("cpu")
    torch.manual_seed(42)
    model = gps.GRUStability(
        input_dim=F, hidden_dim=args.hidden, n_layers=args.n_layers,
        n_extractors=K_ext, dropout=args.dropout,
    ).to(device)
    optim = torch.optim.Adam(model.parameters(), lr=args.lr,
                             weight_decay=args.weight_decay)
    bce = nn.BCEWithLogitsLoss(reduction="none")

    train_ds = gps.SeqDataset(X_norm[train_idx], Y_bin[train_idx], mask[train_idx])
    val_ds = gps.SeqDataset(X_norm[val_idx], Y_bin[val_idx], mask[val_idx])
    train_loader = DataLoader(train_ds, batch_size=args.batch_size,
                              shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)
    X_cards, Y_cards, M_cards = X_norm[cards_idx], Y_bin[cards_idx], mask[cards_idx]

    run_name = (
        f"h{args.hidden:03d}_wd{args.weight_decay:.0e}_do{args.dropout:.1f}_"
        f"AUCstop_{int(time.time())}"
    )
    tb_dir = args.tb_root / run_name
    tb_dir.mkdir(parents=True, exist_ok=True)
    writer = SummaryWriter(log_dir=str(tb_dir))
    print(f"\n  tensorboard: {tb_dir}", flush=True)
    print(f"  filter: {run_name}", flush=True)

    best_auc = -float("inf")
    best_epoch = -1
    best_val_at_best_auc = float("nan")
    epochs_without_improvement = 0
    t_start = time.monotonic()

    print("\n=== training ===", flush=True)
    for epoch in range(args.n_epochs_max):
        model.train()
        t0 = time.monotonic()
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

        per_step_auc = gps.compute_per_step_auc_ood(
            model, X_cards, Y_cards, M_cards, extractors, device,
        )
        all_aucs = np.concatenate([per_step_auc[ext] for ext in extractors])
        valid_aucs = all_aucs[np.isfinite(all_aucs)]
        mean_auc = float(valid_aucs.mean()) if valid_aucs.size else float("nan")

        writer.add_scalar("loss/train", train_loss, epoch)
        writer.add_scalar("loss/val", val_loss, epoch)
        writer.add_scalar("auc_ood/mean", mean_auc, epoch)
        for ei, ext in enumerate(extractors):
            aucs = per_step_auc[ext]
            v = aucs[np.isfinite(aucs)]
            ext_mean = float(v.mean()) if v.size else float("nan")
            writer.add_scalar(f"auc_ood/{ext}", ext_mean, epoch)

        dt = time.monotonic() - t0
        marker = ""
        if mean_auc > best_auc + 1e-6:
            best_auc = mean_auc
            best_epoch = epoch
            best_val_at_best_auc = val_loss
            torch.save(model.state_dict(), tb_dir / "best.pt")
            epochs_without_improvement = 0
            marker = " ← new best"
        else:
            epochs_without_improvement += 1

        print(f"  epoch {epoch+1:>3d}/{args.n_epochs_max}  "
              f"train={train_loss:.4f}  val={val_loss:.4f}  "
              f"AUC_OOD={mean_auc:+.4f}  "
              f"(best={best_auc:+.4f} at ep {best_epoch+1})"
              f"  ({dt:.0f}s){marker}",
              flush=True)

        if epochs_without_improvement >= args.patience:
            print(f"  patience exhausted (no AUC OOD improvement for "
                  f"{args.patience} epochs); stopping.", flush=True)
            break

    writer.close()
    print(f"\n=== done ({time.monotonic()-t_start:.0f}s) ===", flush=True)
    print(f"  best AUC OOD: {best_auc:+.4f} at epoch {best_epoch+1}",
          flush=True)
    print(f"  val_loss at that epoch: {best_val_at_best_auc:.4f}", flush=True)
    print(f"  vs val_loss-based criterion (last sweep): "
          f"+0.6129 at epoch 16 (val_loss=0.4441)", flush=True)
    print(f"  checkpoint: {tb_dir / 'best.pt'}", flush=True)
    print(f"  tensorboard filter: {run_name}", flush=True)


if __name__ == "__main__":
    main()
