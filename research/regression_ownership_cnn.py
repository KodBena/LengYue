"""
research/regression_ownership_cnn.py

CNN-based regression on the 19×19 V_pre ownership map. Counterpart to
classify_mode_ownership_cnn.py — same architecture but with a single
scalar regression head instead of a 3-class classifier.

Tests on the targets where hand-crafted ownership features helped most:

  - score_stdev_reduction | y_range  (+0.10 with hand-crafted)
  - logit_winrate_drift | y_range    (+0.12)
  - L2_joint_drift | H_dlp_median    (+0.13)
  - L2_joint_drift | y_range         (+0.06)
  - winrate_drift | y_range          (+0.05)
  - scoreLead_drift | y_range        (+0.02 already strong baseline)

For each target, compares three feature sets:
  1. phase35 only (baseline)
  2. phase35 + hand-crafted ownership (14 dim)
  3. phase35 + CNN-encoded ownership (32 dim from learned filters)

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import torch
import torch.nn as nn
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler
from torch.utils.tensorboard import SummaryWriter

torch.set_num_threads(2)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, read_packets,
)
from regression import load_corpus, _signed_log1p  # noqa: E402


TARGETS = [
    ("scoreLead_drift", "y_range"),
    ("L2_joint_drift", "y_range"),
    ("L2_joint_drift", "H_dlp_median"),
    ("winrate_drift", "y_range"),
    ("logit_winrate_drift", "y_range"),
    ("score_stdev_reduction", "y_range"),
]


class OwnershipCNNRegressor(nn.Module):
    """1-channel 19×19 → small CNN → concat with tabular → scalar regression.

    Smaller than initial design to reduce overfitting on ~268-per-fold
    training set: 8 → 16 channels (was 16 → 32), MLP head 32 (was 64),
    explicit dropout=0.3 in head.
    """
    def __init__(self, n_tabular: int, hidden_conv: int = 16,
                 dropout: float = 0.3):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 8, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(8, hidden_conv, kernel_size=3, padding=1)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(hidden_conv + n_tabular, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, own: torch.Tensor, tab: torch.Tensor) -> torch.Tensor:
        # own: (B, 1, 19, 19)  tab: (B, n_tab)
        x = torch.relu(self.conv1(own))
        x = torch.relu(self.conv2(x))
        x = self.pool(x).flatten(1)
        x = self.dropout(x)
        return self.head(torch.cat([x, tab], dim=1)).squeeze(-1)


def _r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(((y_true - y_pred) ** 2).sum())
    ss_tot = float(((y_true - y_true.mean()) ** 2).sum())
    return 1.0 - ss_res / max(ss_tot, 1e-12)


def _load_own_per_position(conn, tb_writer=None) -> dict[tuple[str, int], np.ndarray]:
    """Per (stem, turn) → averaged 19×19 ownership map. Delegates to the
    Redis-cached loader in extract_ownership_features."""
    from extract_ownership_features import load_ownership_maps_cached
    return load_ownership_maps_cached(conn, verbose=True)


def _load_handcrafted_own():
    """Per (stem, turn) → averaged 14-feat hand-crafted vector."""
    by_key = {}
    counts = {}
    with open("/home/bork/w/omega/research/data/ownership_features.csv") as f:
        rdr = csv.DictReader(f)
        feat_cols = [c for c in rdr.fieldnames
                      if c not in ("stem", "turn", "realization")]
        for r in rdr:
            try:
                key = (r["stem"], int(r["turn"]))
                vec = np.array([float(r[c]) for c in feat_cols])
                if key not in by_key:
                    by_key[key] = np.zeros_like(vec)
                    counts[key] = 0
                by_key[key] += vec
                counts[key] += 1
            except (ValueError, KeyError):
                pass
    return {k: by_key[k] / counts[k] for k in by_key}, feat_cols


def _load_labels():
    """Per (stem, turn, target) → dict of column values."""
    labels = {}
    with open("/home/bork/w/omega/research/data/trajectory_features_dlp.csv") as f:
        for r in csv.DictReader(f):
            try:
                if r['status'] != 'clean':
                    continue
                key = (r["stem"], int(r["turn"]), r["target"])
                d = {}
                for col in ['y_range', 'y_at_V_max', 'dip_depth',
                              'slope_terminal', 'H_dlp_median',
                              'log_kappa_dlp_median']:
                    try:
                        v = float(r.get(col, "") or "nan")
                        if np.isfinite(v):
                            d[col] = v
                    except ValueError:
                        pass
                labels[key] = d
            except (ValueError, KeyError):
                pass
    return labels


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n-epochs", default=300, type=int)
    ap.add_argument("--lr", default=3e-3, type=float)
    ap.add_argument("--n-folds", default=5, type=int)
    ap.add_argument("--batch-size", default=32, type=int)
    ap.add_argument("--out-txt",
                    default=Path.home() / "plots" /
                            "regression_ownership_cnn_summary.txt", type=Path)
    ap.add_argument("--tb-log-dir",
                    default=Path("/home/bork/w/vdc/tensorboard/ownership_cnn"),
                    type=Path,
                    help="Tensorboard log dir. View with: "
                         "tensorboard --logdir /home/bork/w/vdc/tensorboard "
                         "--bind_all")
    args = ap.parse_args()
    run_tag = f"run_{int(time.time())}"
    tb_path = args.tb_log_dir / run_tag
    tb_path.mkdir(parents=True, exist_ok=True)
    print(f"  tensorboard log dir: {tb_path}", flush=True)
    # Instantiate writer early with tight flush so the user sees live
    # progress (default flush_secs=120 is too slow for follow-along).
    writer = SummaryWriter(log_dir=str(tb_path), flush_secs=10)
    writer.add_text(
        "meta/run_info",
        f"Started run_tag={run_tag}, loading phase begins...", 0,
    )
    writer.flush()

    print(f"=== loading phase35 corpus ===", flush=True)
    corpus = load_corpus(Path("/tmp/summary_averaged.csv"),
                          expand_by_realization=False)
    # Position-level: one row per (stem, turn)
    X35 = corpus["X"]
    sample_ids = corpus["sample_ids"]
    print(f"  per-position phase35: n={len(X35)}", flush=True)

    print(f"\n=== loading ownership maps from Postgres ===", flush=True)
    conn = connect()
    own_maps = _load_own_per_position(conn, tb_writer=writer)
    conn.close()
    print(f"  ownership maps: {len(own_maps)} positions", flush=True)

    print(f"\n=== loading hand-crafted ownership features (CSV) ===",
          flush=True)
    own_hc, own_hc_names = _load_handcrafted_own()
    print(f"  hand-crafted ownership: {len(own_hc)} positions, "
          f"{len(own_hc_names)} feats", flush=True)

    labels = _load_labels()

    # Build common index of positions with everything available
    pos_with_all = []
    sample_pos = [(s.split(":")[0], int(s.split(":")[1].lstrip("t")))
                   for s in sample_ids]
    for i, (stem, turn) in enumerate(sample_pos):
        if (stem, turn) in own_maps and (stem, turn) in own_hc:
            pos_with_all.append(i)
    print(f"  positions with corpus + ownership + hc: {len(pos_with_all)}",
          flush=True)

    X35_p = X35[pos_with_all]
    own_p = np.stack([own_maps[sample_pos[i]] for i in pos_with_all])
    own_hc_p = np.stack([own_hc[sample_pos[i]] for i in pos_with_all])
    sp = [sample_pos[i] for i in pos_with_all]
    groups = np.arange(len(pos_with_all))

    # Results table
    lines = ["# CNN ownership for regression",
             f"# {len(pos_with_all)} positions; "
             f"GroupKFold k={args.n_folds}; CNN hidden_conv=32",
             f"# tensorboard log: {tb_path}",
             "",
             f"  {'target':<28} {'column':<20} {'phase35_only':>12} "
             f"{'+handcrafted':>13} {'+cnn':>9}"]
    print()
    print(lines[-1], flush=True)

    for target, col in TARGETS:
        y = np.full(len(pos_with_all), np.nan)
        for idx, (stem, turn) in enumerate(sp):
            ent = labels.get((stem, turn, target))
            if ent is None:
                continue
            v = ent.get(col)
            if v is not None and np.isfinite(v):
                y[idx] = v
        mask = ~np.isnan(y)
        if mask.sum() < 50:
            line = f"  {target:<28} {col:<20} (too few: {int(mask.sum())})"
            print(line, flush=True)
            lines.append(line)
            continue
        y_log = _signed_log1p(y[mask])
        X35_m = X35_p[mask]
        own_m = own_p[mask]
        own_hc_m = own_hc_p[mask]
        g_m = groups[mask]

        # Three configurations
        kf = GroupKFold(n_splits=args.n_folds)
        preds = {"base": np.zeros(len(y_log)),
                 "hc":   np.zeros(len(y_log)),
                 "cnn":  np.zeros(len(y_log))}

        for fold_i, (tr, te) in enumerate(kf.split(X35_m, y_log,
                                                      groups=g_m)):
            # LGBM baseline (phase35 only)
            lgbm_params = {"objective": "regression", "metric": "rmse",
                            "num_leaves": 15, "min_data_in_leaf": 5,
                            "learning_rate": 0.05, "feature_fraction": 0.8,
                            "bagging_fraction": 0.8, "bagging_freq": 5,
                            "lambda_l2": 0.1, "verbose": -1}
            booster = lgb.train(lgbm_params,
                                  lgb.Dataset(X35_m[tr], label=y_log[tr]),
                                  num_boost_round=200)
            preds["base"][te] = booster.predict(X35_m[te])

            # LGBM with hand-crafted ownership
            X_hc_tr = np.concatenate([X35_m[tr], own_hc_m[tr]], axis=1)
            X_hc_te = np.concatenate([X35_m[te], own_hc_m[te]], axis=1)
            booster = lgb.train(lgbm_params,
                                  lgb.Dataset(X_hc_tr, label=y_log[tr]),
                                  num_boost_round=200)
            preds["hc"][te] = booster.predict(X_hc_te)

            # CNN encoder + tabular phase35 → MLP regression head
            scaler = StandardScaler()
            tab_tr = scaler.fit_transform(X35_m[tr])
            tab_te = scaler.transform(X35_m[te])
            own_tr = torch.tensor(own_m[tr], dtype=torch.float32).unsqueeze(1)
            own_te = torch.tensor(own_m[te], dtype=torch.float32).unsqueeze(1)
            tab_tr_t = torch.tensor(tab_tr, dtype=torch.float32)
            tab_te_t = torch.tensor(tab_te, dtype=torch.float32)
            y_tr_t = torch.tensor(y_log[tr], dtype=torch.float32)
            y_te_t = torch.tensor(y_log[te], dtype=torch.float32)

            # Normalize y_log
            y_mean = float(y_tr_t.mean())
            y_std = float(y_tr_t.std() + 1e-6)
            y_tr_z = (y_tr_t - y_mean) / y_std

            # Split train into train-internal + val for early stopping.
            n_tr = len(own_tr)
            n_val = max(8, int(round(n_tr * 0.2)))
            perm = torch.randperm(n_tr)
            inner_tr = perm[n_val:]
            inner_val = perm[:n_val]

            model = OwnershipCNNRegressor(n_tabular=X35_m.shape[1])
            opt = torch.optim.Adam(model.parameters(), lr=args.lr,
                                    weight_decay=1e-3)
            loss_fn = nn.MSELoss()
            tag = f"{target}_{col}/fold{fold_i}"
            best_val_r2 = -float("inf")
            best_state = None
            patience = 30
            patience_counter = 0
            for epoch in range(args.n_epochs):
                model.train()
                idx = inner_tr[torch.randperm(len(inner_tr))]
                epoch_loss = 0.0
                for start in range(0, len(idx), args.batch_size):
                    b = idx[start:start + args.batch_size]
                    opt.zero_grad()
                    pred = model(own_tr[b], tab_tr_t[b])
                    loss = loss_fn(pred, y_tr_z[b])
                    loss.backward()
                    opt.step()
                    epoch_loss += float(loss.item()) * len(b)
                epoch_loss /= max(len(idx), 1)
                # Eval every epoch for early stopping; log every 5 epochs.
                model.eval()
                with torch.no_grad():
                    val_pred = model(own_tr[inner_val], tab_tr_t[inner_val]).numpy() * y_std + y_mean
                    val_r2 = _r2(y_log[tr][inner_val.numpy()], val_pred)
                    if (epoch + 1) % 5 == 0 or epoch == 0:
                        tr_pred = model(own_tr[inner_tr], tab_tr_t[inner_tr]).numpy() * y_std + y_mean
                        te_pred = model(own_te, tab_te_t).numpy() * y_std + y_mean
                        r2_tr = _r2(y_log[tr][inner_tr.numpy()], tr_pred)
                        r2_te = _r2(y_log[te], te_pred)
                        writer.add_scalar(f"{tag}/loss", epoch_loss, epoch)
                        writer.add_scalar(f"{tag}/r2_train", r2_tr, epoch)
                        writer.add_scalar(f"{tag}/r2_val", val_r2, epoch)
                        writer.add_scalar(f"{tag}/r2_test", r2_te, epoch)
                        writer.flush()
                if val_r2 > best_val_r2:
                    best_val_r2 = val_r2
                    best_state = {k: v.clone() for k, v in model.state_dict().items()}
                    patience_counter = 0
                else:
                    patience_counter += 1
                    if patience_counter >= patience:
                        writer.add_scalar(f"{tag}/early_stopped_at_epoch", epoch, 0)
                        break
            # Restore best-val checkpoint before computing test prediction
            if best_state is not None:
                model.load_state_dict(best_state)
            model.eval()
            with torch.no_grad():
                p_z = model(own_te, tab_te_t).numpy()
            preds["cnn"][te] = p_z * y_std + y_mean
            writer.add_scalar(f"{tag}/best_val_r2", best_val_r2, 0)
            writer.flush()

        r2_base = _r2(y_log, preds["base"])
        r2_hc = _r2(y_log, preds["hc"])
        r2_cnn = _r2(y_log, preds["cnn"])
        # Log final per-target R² to tensorboard for at-a-glance comparison
        target_tag = f"{target}_{col}"
        writer.add_scalar(f"final_r2/{target_tag}/base", r2_base, 0)
        writer.add_scalar(f"final_r2/{target_tag}/hc", r2_hc, 0)
        writer.add_scalar(f"final_r2/{target_tag}/cnn", r2_cnn, 0)
        line = (f"  {target:<28} {col:<20} "
                f"{r2_base:>+12.4f} {r2_hc:>+13.4f} {r2_cnn:>+9.4f}")
        print(line, flush=True)
        lines.append(line)
    writer.close()

    args.out_txt.parent.mkdir(parents=True, exist_ok=True)
    args.out_txt.write_text("\n".join(lines) + "\n")
    print(f"\nsummary: {args.out_txt}", flush=True)


if __name__ == "__main__":
    main()
