"""
research/classify_mode_ownership_cnn.py

Tiny CNN over the V_pre ownership map (19×19) predicting volatility
mode. Tests whether the network's spatial signal — captured by a
small CNN with learned filters — discriminates the three modes
better than the hand-crafted ownership features in
extract_ownership_features.py.

Architecture:
  Conv2d(1, 16, 3x3, pad=1) → ReLU
  Conv2d(16, 32, 3x3, pad=1) → ReLU
  AdaptiveAvgPool2d(1) → 32-dim feature
  Linear(32 + 23, 3)  # concat with phase35 features for hybrid

CPU-only training; ~5K conv params + ~170 linear params ≈ 5K total.
At n=437 positions this is comfortably under-capacity.

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
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

torch.set_num_threads(2)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify_volatility_mode import _build_mode_assignments  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, read_packets,
)
from regression import load_corpus  # noqa: E402


class OwnershipCNN(nn.Module):
    def __init__(self, n_tabular_features: int, n_classes: int = 3):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Linear(32 + n_tabular_features, n_classes)

    def forward(self, ownership: torch.Tensor,
                tabular: torch.Tensor) -> torch.Tensor:
        # ownership: (batch, 1, 19, 19)
        x = torch.relu(self.conv1(ownership))
        x = torch.relu(self.conv2(x))
        x = self.pool(x).flatten(1)  # (batch, 32)
        combined = torch.cat([x, tabular], dim=1)
        return self.head(combined)


def _load_ownership_per_position(conn) -> dict[tuple[str, int], np.ndarray]:
    """Per (stem, turn) → 19×19 ownership averaged across realizations."""
    positions = list_positions(conn)
    out: dict[tuple[str, int], np.ndarray] = {}
    t0 = time.monotonic()
    for i, (stem, turn) in enumerate(positions):
        reals = list_realizations(conn, stem, turn)
        owns = []
        for ri in reals:
            try:
                packets = read_packets(conn, stem, turn, ri)
            except Exception:
                continue
            if not packets:
                continue
            own = packets[0][1].get("ownership")
            if own is None or len(own) != 361:
                continue
            owns.append(np.array(own, dtype=np.float32).reshape(19, 19))
        if owns:
            out[(stem, turn)] = np.stack(owns).mean(axis=0)
        if (i + 1) % 50 == 0:
            dt = time.monotonic() - t0
            print(f"  [{i+1}/{len(positions)}] {dt:.0f}s", flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--averaged-csv",
                    default=Path("/tmp/summary_averaged.csv"), type=Path)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" / "mode_discovery" /
                            "cnn_ownership_summary.txt", type=Path)
    ap.add_argument("--n-epochs", default=300, type=int)
    ap.add_argument("--lr", default=3e-3, type=float)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--batch-size", default=32, type=int)
    args = ap.parse_args()

    print(f"=== mode assignments (K=3) ===", flush=True)
    mode_by_pos = _build_mode_assignments(args.features_csv)
    print(f"  {len(mode_by_pos)} positions", flush=True)

    print(f"\n=== loading phase35 corpus + ownership per position ===",
          flush=True)
    corpus = load_corpus(args.averaged_csv, expand_by_realization=False)
    X_pos = corpus["X"]
    feature_names = corpus["feature_names"]
    sample_ids = corpus["sample_ids"]
    print(f"  per-position phase35: n={len(X_pos)} features={len(feature_names)}",
          flush=True)

    conn = connect()
    own_by_pos = _load_ownership_per_position(conn)
    conn.close()
    print(f"  ownership maps: {len(own_by_pos)} positions", flush=True)

    # Build (ownership, phase35, mode) per position
    sample_pos = [(s.split(":")[0], int(s.split(":")[1].lstrip("t")))
                   for s in sample_ids]
    rows = []
    for i, (stem, turn) in enumerate(sample_pos):
        m = mode_by_pos.get((stem, turn))
        own = own_by_pos.get((stem, turn))
        if m is None or own is None:
            continue
        rows.append((own, X_pos[i], m, stem, turn))
    print(f"  matched samples: {len(rows)}", flush=True)
    if not rows:
        sys.exit("no matched samples — check inputs")

    own_X = np.stack([r[0] for r in rows])  # (N, 19, 19)
    tab_X = np.stack([r[1] for r in rows])  # (N, n_features)
    y = np.array([r[2] for r in rows], dtype=np.int64)
    groups = np.arange(len(rows))  # one group per position
    print(f"  ownership tensor: {own_X.shape}  tabular: {tab_X.shape}",
          flush=True)
    print(f"  class distribution: {np.bincount(y)}", flush=True)

    # Train/test loop with GroupKFold (each position is its own group)
    kf = GroupKFold(n_splits=args.n_folds)
    fold_accs: list[float] = []
    fold_accs_no_own: list[float] = []  # ablation: tabular only

    for fold_i, (train_idx, test_idx) in enumerate(kf.split(own_X, y,
                                                              groups=groups)):
        print(f"\n=== fold {fold_i} ===  train={len(train_idx)} test={len(test_idx)}",
              flush=True)

        # Standardize tabular features (fit on train)
        scaler = StandardScaler()
        tab_tr = scaler.fit_transform(tab_X[train_idx])
        tab_te = scaler.transform(tab_X[test_idx])

        own_tr = torch.tensor(own_X[train_idx], dtype=torch.float32).unsqueeze(1)
        own_te = torch.tensor(own_X[test_idx], dtype=torch.float32).unsqueeze(1)
        tab_tr_t = torch.tensor(tab_tr, dtype=torch.float32)
        tab_te_t = torch.tensor(tab_te, dtype=torch.float32)
        y_tr = torch.tensor(y[train_idx], dtype=torch.long)
        y_te = torch.tensor(y[test_idx], dtype=torch.long)

        # CNN with ownership + tabular
        model = OwnershipCNN(n_tabular_features=tab_X.shape[1])
        opt = torch.optim.Adam(model.parameters(), lr=args.lr,
                                weight_decay=1e-4)
        cls_counts = torch.bincount(y_tr, minlength=3).float()
        cls_w = (len(y_tr) / (3 * cls_counts)).clamp(min=0.5, max=3.0)
        loss_fn = nn.CrossEntropyLoss(weight=cls_w)

        for epoch in range(args.n_epochs):
            model.train()
            idx = torch.randperm(len(own_tr))
            total_loss = 0.0
            for start in range(0, len(own_tr), args.batch_size):
                b = idx[start:start + args.batch_size]
                opt.zero_grad()
                logits = model(own_tr[b], tab_tr_t[b])
                loss = loss_fn(logits, y_tr[b])
                loss.backward()
                opt.step()
                total_loss += float(loss.item()) * len(b)
            if (epoch + 1) % 100 == 0 or epoch == args.n_epochs - 1:
                model.eval()
                with torch.no_grad():
                    pred = model(own_te, tab_te_t).argmax(dim=1)
                    acc = float((pred == y_te).float().mean())
                print(f"  epoch {epoch+1}: train_loss={total_loss/len(own_tr):.4f}  "
                      f"test_acc={acc:.4f}", flush=True)
        fold_accs.append(acc)

        # Ablation: tabular-only baseline (zero out ownership input)
        zeros_tr = torch.zeros_like(own_tr)
        zeros_te = torch.zeros_like(own_te)
        model2 = OwnershipCNN(n_tabular_features=tab_X.shape[1])
        opt2 = torch.optim.Adam(model2.parameters(), lr=args.lr,
                                  weight_decay=1e-4)
        for epoch in range(args.n_epochs):
            model2.train()
            idx = torch.randperm(len(zeros_tr))
            for start in range(0, len(zeros_tr), args.batch_size):
                b = idx[start:start + args.batch_size]
                opt2.zero_grad()
                logits = model2(zeros_tr[b], tab_tr_t[b])
                loss = loss_fn(logits, y_tr[b])
                loss.backward()
                opt2.step()
        model2.eval()
        with torch.no_grad():
            pred2 = model2(zeros_te, tab_te_t).argmax(dim=1)
            acc_no_own = float((pred2 == y_te).float().mean())
        fold_accs_no_own.append(acc_no_own)
        print(f"  ablation (no ownership): test_acc={acc_no_own:.4f}",
              flush=True)

    print(f"\n=== summary ===", flush=True)
    print(f"  CNN + tabular:    avg acc = {np.mean(fold_accs):.4f}  "
          f"per-fold = {fold_accs}", flush=True)
    print(f"  ablation (tab only): avg acc = {np.mean(fold_accs_no_own):.4f}  "
          f"per-fold = {fold_accs_no_own}", flush=True)
    chance = max(np.bincount(y)) / len(y)
    print(f"  chance baseline: {chance:.4f}", flush=True)
    print(f"  LGBM V_pre-only (from V2 classifier): 0.31", flush=True)
    print(f"  LGBM V_pre + 1/3 search: 0.67", flush=True)

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text(
        f"# CNN ownership-map mode classifier\n"
        f"# {len(rows)} positions × 3 modes; GroupKFold k={args.n_folds}\n"
        f"# chance baseline: {chance:.4f}\n"
        f"# LGBM V_pre baseline: 0.31\n"
        f"# LGBM V_pre + 1/3 search: 0.67\n"
        f"#\n"
        f"# CNN + phase35 tabular:    "
        f"avg={np.mean(fold_accs):.4f}  folds={fold_accs}\n"
        f"# ablation (tabular only):  "
        f"avg={np.mean(fold_accs_no_own):.4f}  folds={fold_accs_no_own}\n"
    )


if __name__ == "__main__":
    main()
