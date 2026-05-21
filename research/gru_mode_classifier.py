"""
research/gru_mode_classifier.py

Sequence-model variant of the mode classifier. Tests whether a GRU
over the per-V trajectory sequence captures information that the
aggregated window features missed.

Baseline (from classify_volatility_mode_v2.py):
  - V_pre only:        LGBM 31%  AUC 0.47
  - V_pre + 1/3 search: LGBM 67% AUC 0.86
  - V_pre + 2/3 search: LGBM 82% AUC 0.94

GRU variant:
  - Input: per-position sequence (≤50 steps) of (log V, y_scoreLead,
    y_L2_joint, y_winrate, y_logit_winrate) — 5 channels.
  - Architecture: 1-layer GRU, hidden=32, head → 3-class softmax.
  - Anytime evaluation: probe accuracy at fractional sequence lengths
    (0%, 10%, 33%, 50%, 67%, 100%) and chart the search-budget curve.

CPU-friendly: `torch.set_num_threads(2)` keeps it out of the way of
the running phase-3 collection and Stream 2 regression.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from sklearn.cluster import KMeans
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

torch.set_num_threads(2)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify_volatility_mode import _build_mode_assignments  # noqa: E402
from fit_averaged import averaged_trajectory_for_target  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)


DRIFT_TARGETS = ["scoreLead_drift", "L2_joint_drift", "winrate_drift",
                 "logit_winrate_drift"]
MODE_NAMES = {0: "fast-tactical", 1: "reading-paradox", 2: "clean-monotone"}


class GRUModeClassifier(nn.Module):
    def __init__(self, n_channels: int = 5, hidden: int = 32,
                 n_classes: int = 3):
        super().__init__()
        self.gru = nn.GRU(input_size=n_channels, hidden_size=hidden,
                          batch_first=True)
        self.head = nn.Linear(hidden, n_classes)

    def forward(self, seq: torch.Tensor,
                lengths: torch.Tensor | None = None) -> torch.Tensor:
        """seq: (batch, T, channels). Returns (batch, n_classes)."""
        out, h = self.gru(seq)
        # Use the LAST hidden state of GRU (one layer)
        return self.head(h.squeeze(0))

    def forward_all_steps(self, seq: torch.Tensor) -> torch.Tensor:
        """Returns (batch, T, n_classes) — anytime decoding."""
        out, _ = self.gru(seq)
        return self.head(out)


def _build_sequences(conn, positions, target_names, n_steps_target=50):
    """For each (stem, turn), build a (T, 5) trajectory tensor over
    log_V and the 4 drift-target y values, interpolated to a common
    log-V grid of fixed length.

    Returns:
      (stem, turn) → np.ndarray shape (T, 5).
    """
    seqs: dict[tuple[str, int], np.ndarray] = {}
    t0 = time.monotonic()
    for i, (stem, turn) in enumerate(positions):
        real_idxs = list_realizations(conn, stem, turn)
        if not real_idxs:
            continue
        realizations = []
        for ri in real_idxs:
            arrs = realization_as_flat_arrays(conn, stem, turn, ri)
            if arrs is not None:
                realizations.append(arrs)
        if len(realizations) < 2:
            continue
        # Average trajectories for each drift target
        averaged = {}
        common_V = None
        for t in target_names:
            value_fn = VALUE_CANDIDATES[t]
            avg = averaged_trajectory_for_target(realizations, value_fn,
                                                  n_grid=n_steps_target)
            if avg is None:
                averaged[t] = None
                continue
            V_g, y_g = avg
            averaged[t] = (V_g, y_g)
            if common_V is None:
                common_V = V_g
        if common_V is None or any(averaged[t] is None for t in target_names):
            continue
        # Sequence: (T, 5) = (log V, y_t1, y_t2, y_t3, y_t4)
        seq = np.zeros((len(common_V), 5), dtype=np.float32)
        seq[:, 0] = np.log10(common_V)
        for j, t in enumerate(target_names):
            V_g, y_g = averaged[t]
            seq[:, 1 + j] = np.interp(common_V, V_g, y_g)
        seqs[(stem, turn)] = seq
        if (i + 1) % 50 == 0 or i + 1 == len(positions):
            dt = time.monotonic() - t0
            print(f"  [{i+1}/{len(positions)}] {dt:.0f}s",
                  flush=True)
    return seqs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--features-csv",
                    default=Path("/home/bork/w/omega/research/data/"
                                  "trajectory_features_dlp.csv"), type=Path)
    ap.add_argument("--out-dir",
                    default=Path.home() / "plots" / "mode_discovery",
                    type=Path)
    ap.add_argument("--n-epochs", default=200, type=int)
    ap.add_argument("--lr", default=3e-3, type=float)
    ap.add_argument("--hidden", default=32, type=int)
    ap.add_argument("--batch-size", default=32, type=int)
    ap.add_argument("--n-folds", default=5, type=int)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== building K=3 mode assignments ===", flush=True)
    mode_by_pos = _build_mode_assignments(args.features_csv)
    print(f"  {len(mode_by_pos)} positions assigned", flush=True)

    print(f"\n=== building (T=50, 5) sequences per position ===", flush=True)
    conn = connect()
    positions = list_positions(conn)
    # Limit to positions that have mode assignments
    positions = [p for p in positions if p in mode_by_pos]
    print(f"  {len(positions)} positions to sequence", flush=True)
    seqs_by_pos = _build_sequences(conn, positions, DRIFT_TARGETS)
    conn.close()
    print(f"  built {len(seqs_by_pos)} sequences", flush=True)

    # Build tensors
    keep_positions = sorted(p for p in seqs_by_pos if p in mode_by_pos)
    X_seq = np.stack([seqs_by_pos[p] for p in keep_positions])  # (N, T, 5)
    y = np.array([mode_by_pos[p] for p in keep_positions], dtype=np.int64)
    print(f"  shape: X={X_seq.shape}  y={y.shape}", flush=True)

    # Per-channel normalization (fit on the full corpus — fine since we
    # only use log_V and y values, which are bounded and known).
    means = X_seq.reshape(-1, 5).mean(axis=0)
    stds = X_seq.reshape(-1, 5).std(axis=0) + 1e-6
    X_norm = (X_seq - means) / stds
    print(f"  channel means: {means}", flush=True)
    print(f"  channel stds:  {stds}", flush=True)

    # Groups: each position is its own group (no replication — sequence
    # uses averaged trajectory, one per position).
    groups = np.arange(len(keep_positions))

    # GroupKFold CV — but here each "group" is a position, so this is
    # essentially regular k-fold.
    kf = GroupKFold(n_splits=args.n_folds)
    # Fractional probe points for anytime evaluation
    PROBE_FRACS = [0.05, 0.10, 0.20, 0.33, 0.50, 0.67, 0.80, 1.00]
    probe_acc = {f: [] for f in PROBE_FRACS}
    probe_correct = {f: 0 for f in PROBE_FRACS}
    probe_total = {f: 0 for f in PROBE_FRACS}

    n = len(X_norm)
    T = X_norm.shape[1]

    for fold_i, (train_idx, test_idx) in enumerate(kf.split(X_norm, y, groups=groups)):
        print(f"\n=== fold {fold_i} ===  train={len(train_idx)} test={len(test_idx)}",
              flush=True)
        X_tr = torch.tensor(X_norm[train_idx], dtype=torch.float32)
        y_tr = torch.tensor(y[train_idx], dtype=torch.long)
        X_te = torch.tensor(X_norm[test_idx], dtype=torch.float32)
        y_te = torch.tensor(y[test_idx], dtype=torch.long)

        # Class weights (balanced)
        cls_counts = torch.bincount(y_tr, minlength=3).float()
        cls_w = (len(y_tr) / (3 * cls_counts)).clamp(min=0.5, max=3.0)

        model = GRUModeClassifier(n_channels=5, hidden=args.hidden, n_classes=3)
        opt = torch.optim.Adam(model.parameters(), lr=args.lr,
                                weight_decay=1e-4)
        loss_fn = nn.CrossEntropyLoss(weight=cls_w)

        for epoch in range(args.n_epochs):
            model.train()
            # Mini-batch
            idx = torch.randperm(len(X_tr))
            total_loss = 0.0
            for start in range(0, len(X_tr), args.batch_size):
                batch_idx = idx[start:start + args.batch_size]
                opt.zero_grad()
                logits = model(X_tr[batch_idx])
                loss = loss_fn(logits, y_tr[batch_idx])
                loss.backward()
                opt.step()
                total_loss += float(loss.item()) * len(batch_idx)
            if (epoch + 1) % 50 == 0 or epoch == args.n_epochs - 1:
                model.eval()
                with torch.no_grad():
                    pred = model(X_te).argmax(dim=1)
                    acc = float((pred == y_te).float().mean())
                print(f"  epoch {epoch+1:>3d}: train_loss={total_loss/len(X_tr):.4f}  "
                      f"test_acc={acc:.4f}", flush=True)

        # Anytime decoding: probe at various fractional sequence lengths
        model.eval()
        with torch.no_grad():
            for frac in PROBE_FRACS:
                cutoff = max(2, int(round(T * frac)))
                logits = model(X_te[:, :cutoff, :])
                pred = logits.argmax(dim=1)
                correct = int((pred == y_te).sum())
                probe_correct[frac] += correct
                probe_total[frac] += len(y_te)
                acc = correct / len(y_te) if len(y_te) > 0 else 0.0
                probe_acc[frac].append(acc)

    # Aggregate
    print(f"\n=== anytime decoding accuracy (avg across folds) ===",
          flush=True)
    print(f"  baseline (chance) ≈ {max(np.bincount(y))/len(y):.4f}",
          flush=True)
    lines = [f"# GRU mode classifier — anytime decoding accuracy"]
    lines.append(f"# n_positions={n}  channels=5 (log_V + 4 drift targets)  "
                 f"T={T}  hidden={args.hidden}  epochs={args.n_epochs}")
    lines.append(f"# chance baseline (majority): {max(np.bincount(y))/len(y):.4f}")
    lines.append("")
    lines.append(f"  {'fraction':>10} {'avg_acc':>10}  per-fold")
    print(f"  {'fraction':>10} {'avg_acc':>10}  per-fold", flush=True)
    for frac in PROBE_FRACS:
        accs = probe_acc[frac]
        avg = probe_correct[frac] / max(probe_total[frac], 1)
        line = (f"  {frac:>10.2f} {avg:>10.4f}  "
                + " ".join(f"{a:.3f}" for a in accs))
        print(line, flush=True)
        lines.append(line)

    (args.out_dir / "gru_anytime_summary.txt").write_text(
        "\n".join(lines) + "\n"
    )

    # Plot anytime curve
    fig, ax = plt.subplots(figsize=(8, 5))
    fracs = np.array(PROBE_FRACS)
    accs = np.array([probe_correct[f] / max(probe_total[f], 1)
                      for f in PROBE_FRACS])
    ax.plot(fracs, accs, "o-", color="steelblue", linewidth=2)
    ax.axhline(max(np.bincount(y)) / len(y), color="black", linestyle="--",
               alpha=0.5, label="chance (majority class)")
    # Reference points from classify_volatility_mode_v2.py LGBM
    ax.plot([0.0, 0.33, 0.67], [0.31, 0.67, 0.82], "s-", color="red",
            alpha=0.7, label="LGBM windowed features (baseline)")
    ax.set_xlabel("fraction of trajectory observed")
    ax.set_ylabel("3-class mode accuracy")
    ax.set_title(f"GRU anytime mode classification "
                 f"(n_pos={n}, T={T}, hidden={args.hidden})")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    out = args.out_dir / "gru_anytime_curve.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    print(f"\nplot: {out}", flush=True)


if __name__ == "__main__":
    main()
