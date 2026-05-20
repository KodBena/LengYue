"""
research/resnet_trajectory.py

Flat-ResNet trajectory predictor. Replaces the per-position curve_fit
+ regress-the-labels two-stage pipeline with an end-to-end NN that
maps Phase-3.5 features to a full y(V) curve.

Architecture (per the user's "flat ResNet" framing — each block
learns one residual component and the final prediction is the sum):

  features (122) →
      Linear(122, hidden) → ReLU → Linear(hidden, hidden) → ReLU
                                                         ↓ trunk
      ┌──────────────────────────────────────────────────────┐
      │  Block 1: Linear(hidden, 2) → (softplus, softplus)   │
      │            → (H_1, κ_1)                              │
      │            → y_1(V) = H_1 · V / (V + κ_1)            │
      ├──────────────────────────────────────────────────────┤
      │  Block 2: trunk → Linear(hidden, 2) → (linear, sp)   │
      │            → (H_2, κ_2), H_2 sign-flexible           │
      │            → y_2(V) = y_1(V) + H_2 · V / (V + κ_2)   │
      ├──────────────────────────────────────────────────────┤
      │  Block 3..N: same as block 2                         │
      └──────────────────────────────────────────────────────┘
      Final: y(V) = Σᵢ H_i · V / (V + κ_i)

Block 1's H is constrained positive (the primary saturating
component). Blocks 2..N's H are sign-flexible (residual refinements
that can subtract). All κ are positive via softplus.

Closed-form derivative preserved:
    dy/dV = Σᵢ H_i · κ_i / (V + κ_i)²

Per the design-note §4.2 multi-target panel: this architecture is
extended to N panel targets by giving each target its own set of
blocks (shared trunk, target-specific heads). Cross-target gradient
sharing through the trunk is the KataGo-aux-head benefit.

Training
════════
- Loss: per-(position, target) MSE between predicted curve y(V) and
  averaged trajectory at V values, summed across the V grid.
- Regularization: trunk and block weight L2; sum across N blocks of
  |H_i| × κ_i (to discourage spurious residuals that fit noise).
- Optimizer: Adam.
- Held-out: leave-one-position-out is feasible at small N; switch to
  k-fold when N grows.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from torch.utils.tensorboard import SummaryWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curve_families import compute_diagnostics  # noqa: E402
from feature_extraction import extract_features as extract_phase35_features  # noqa: E402
from fit_hyperbolic import VALUE_CANDIDATES  # noqa: E402
from pg_sink import (  # noqa: E402
    connect, list_positions, list_realizations, realization_as_flat_arrays,
)
from fit_averaged import averaged_trajectory_for_target  # noqa: E402


# ── ResNet block + model ────────────────────────────────────────────────────

def _bias_for_softplus(target: float) -> float:
    """Solve softplus(b) = target for b. softplus(b) = log(1 + e^b);
    for target > 5 this is essentially b = target. For target ≤ 5 use
    the exact inverse log(e^target − 1)."""
    if target > 5.0:
        return float(target)
    import math
    return float(math.log(math.exp(target) - 1.0))


class _PositiveHead(nn.Module):
    """Block 0 (primary saturating component): produces (H, κ) both
    positive. Initialized at H≈1.0, κ≈100 (a typical mid-range κ for
    MCTS-Go saturating curves)."""

    def __init__(self, hidden: int, kappa_init: float = 100.0):
        super().__init__()
        self.lin = nn.Linear(hidden, 2)
        with torch.no_grad():
            self.lin.weight.mul_(0.01)
            self.lin.bias.copy_(torch.tensor([
                _bias_for_softplus(1.0),
                _bias_for_softplus(kappa_init - 1.0),
            ]))

    def forward(self, trunk: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        raw = self.lin(trunk)
        H = nn.functional.softplus(raw[..., 0]) + 1e-6
        kappa = nn.functional.softplus(raw[..., 1]) + 1.0
        return H, kappa


class _ResidualHead(nn.Module):
    """Blocks 1..N-1: H sign-flexible (linear), κ positive (softplus).
    `kappa_init` controls the timescale this block operates on — the
    different residual blocks are initialized at geometrically-spaced
    κ so they cover distinct V regions of the trajectory rather than
    all collapsing to the same scale (a real failure mode observed
    in early experiments)."""

    def __init__(self, hidden: int, kappa_init: float = 1000.0):
        super().__init__()
        self.lin = nn.Linear(hidden, 2)
        with torch.no_grad():
            self.lin.weight.mul_(0.01)
            self.lin.bias.copy_(torch.tensor([
                0.0,
                _bias_for_softplus(kappa_init - 1.0),
            ]))

    def forward(self, trunk: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        raw = self.lin(trunk)
        H = raw[..., 0]
        kappa = nn.functional.softplus(raw[..., 1]) + 1.0
        return H, kappa


class FlatResNet(nn.Module):
    """Shared trunk + per-target N residual blocks."""

    def __init__(
        self,
        n_features: int,
        target_names: list[str],
        n_blocks: int = 3,
        hidden: int = 32,
    ):
        super().__init__()
        self.target_names = target_names
        self.n_blocks = n_blocks
        self.trunk = nn.Sequential(
            nn.Linear(n_features, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
        )
        # Per target: block 0 (positive, κ_init=100) + (n_blocks-1)
        # residual blocks at geometrically-spaced κ_init values
        # spanning V≈30 .. V≈10000 (the empirically observed range
        # of MCTS half-saturation visit counts in our data).
        self.heads = nn.ModuleDict()
        # Geometric spread for residual blocks
        if n_blocks > 1:
            kappa_inits = np.geomspace(30.0, 10000.0, n_blocks - 1).tolist()
        else:
            kappa_inits = []
        for t in target_names:
            blocks: list[nn.Module] = [_PositiveHead(hidden, kappa_init=100.0)]
            for k_init in kappa_inits:
                blocks.append(_ResidualHead(hidden, kappa_init=k_init))
            self.heads[t] = nn.ModuleList(blocks)

    def forward(
        self,
        features: torch.Tensor,  # (B, n_features)
        V_grid: torch.Tensor,    # (V,)
        target: str,
    ) -> tuple[torch.Tensor, list[tuple[torch.Tensor, torch.Tensor]]]:
        """Returns (predicted y(V) of shape (B, V), per-block (H_i, κ_i) list)."""
        trunk = self.trunk(features)
        blocks = self.heads[target]
        y = torch.zeros(features.shape[0], V_grid.shape[0], device=features.device)
        per_block: list[tuple[torch.Tensor, torch.Tensor]] = []
        for blk in blocks:
            H, kappa = blk(trunk)        # (B,), (B,)
            H = H.unsqueeze(-1)          # (B, 1)
            kappa = kappa.unsqueeze(-1)
            y = y + H * V_grid.unsqueeze(0) / (V_grid.unsqueeze(0) + kappa)
            per_block.append((H.squeeze(-1), kappa.squeeze(-1)))
        return y, per_block


# ── Dataset assembly ────────────────────────────────────────────────────────

@dataclass
class RealizationSample:
    """One (position, realization) training sample. Features and
    trajectory both come from the SAME realization — matched pair, no
    averaging. Train/val splits should be done BY POSITION so val
    samples are independent of train samples."""
    stem: str
    turn: int
    realization_idx: int
    features: np.ndarray
    trajectories: dict[str, tuple[np.ndarray, np.ndarray]]


def _per_realization_trajectory(
    realization_arrs: dict[str, np.ndarray],
    value_fn,
) -> tuple[np.ndarray, np.ndarray] | None:
    """Compute (V, y) for one realization under one value() target.
    Returns None if the trajectory is unusable."""
    V = realization_arrs["visits"].astype(np.float64)
    ids = realization_arrs["isDuringSearch"]
    V_max_idx = int(np.where(~ids)[0][-1]) if (~ids).any() else int(np.argmax(V))
    try:
        y = value_fn(realization_arrs, V_max_idx).astype(np.float64)
    except Exception:
        return None
    if not np.isfinite(y).all() or len(y) < 4:
        return None
    order = np.argsort(V)
    return V[order].astype(np.float32), y[order].astype(np.float32)


def load_dataset() -> list[RealizationSample]:
    """Read Postgres, build one sample per (position, realization).
    Features and trajectory come from the same realization. The
    per-sample Postgres roundtrip is ~80 ms; with ~344 positions ×
    ~10 realizations the load takes 4-5 min, so progress prints
    are emitted every 250 samples (per the long-running-scripts
    feedback discipline)."""
    conn = connect()
    positions = list_positions(conn)
    samples: list[RealizationSample] = []
    n_processed = 0
    t0 = time.monotonic()
    n_estimated = sum(
        len(list_realizations(conn, stem, turn)) for stem, turn in positions
    )
    print(f"  load_dataset: {len(positions)} positions, "
          f"{n_estimated} expected samples", flush=True)
    for stem, turn in positions:
        real_idxs = list_realizations(conn, stem, turn)
        if not real_idxs:
            continue
        for ri in real_idxs:
            # Per-realization features from THAT realization's V_pre packet.
            try:
                feats = extract_phase35_features(stem, turn, realization=ri, conn=conn)
            except Exception:
                continue
            feature_names = sorted(feats.keys())
            feat_vec = np.array([feats[k] for k in feature_names], dtype=np.float32)

            arrs = realization_as_flat_arrays(conn, stem, turn, ri)
            if arrs is None:
                continue
            trajectories: dict[str, tuple[np.ndarray, np.ndarray]] = {}
            for tname, value_fn in VALUE_CANDIDATES.items():
                t = _per_realization_trajectory(arrs, value_fn)
                if t is not None:
                    trajectories[tname] = t
            if trajectories:
                samples.append(RealizationSample(
                    stem=stem, turn=turn, realization_idx=ri,
                    features=feat_vec,
                    trajectories=trajectories,
                ))
            n_processed += 1
            if n_processed % 250 == 0 or n_processed == n_estimated:
                dt = time.monotonic() - t0
                rate = n_processed / max(dt, 1e-9)
                eta = (n_estimated - n_processed) / max(rate, 1e-9)
                print(f"    [{n_processed}/{n_estimated}] "
                      f"{rate:.0f} samples/s  elapsed {dt:.0f}s  "
                      f"eta {eta:.0f}s", flush=True)
    conn.close()
    return samples


# ── Training loop ───────────────────────────────────────────────────────────

def _dataset_fingerprint(samples: list[RealizationSample]) -> str:
    """Stable identifier of the dataset shape. Used to verify a
    checkpoint's saved split is still applicable to the current data."""
    keys = sorted(
        (s.stem, s.turn, s.realization_idx) for s in samples
    )
    h = hashlib.sha256()
    for stem, turn, ri in keys:
        h.update(f"{stem}:{turn}:{ri}|".encode())
    return h.hexdigest()[:16]


def train_resnet(
    samples: list[RealizationSample],
    target_names: list[str],
    n_blocks: int = 3,
    hidden: int = 32,
    n_epochs: int = 1000,
    lr: float = 5e-3,
    weight_decay: float = 1e-3,
    val_fraction: float = 0.2,
    seed: int = 42,
    verbose: int = 100,
    tb_log_dir: Path | None = None,
    checkpoint_dir: Path | None = None,
    checkpoint_every: int = 100,
    resume: bool = False,
) -> dict:
    rng = np.random.default_rng(seed)
    n = len(samples)
    if n < 4:
        return {"error": f"only {n} samples; train/val split needs ≥4"}

    n_features = samples[0].features.shape[0]
    # Train/val split BY POSITION (not by sample index) so val samples
    # are truly independent of train samples — i.e., no realization
    # leakage across the split.
    positions = sorted({(s.stem, s.turn) for s in samples})
    n_positions = len(positions)
    pos_indices = np.arange(n_positions)
    rng.shuffle(pos_indices)
    n_val_pos = max(1, int(round(n_positions * val_fraction)))
    val_positions = {positions[i] for i in pos_indices[:n_val_pos]}
    train_positions = {positions[i] for i in pos_indices[n_val_pos:]}

    train_idx = [
        i for i, s in enumerate(samples)
        if (s.stem, s.turn) in train_positions
    ]
    val_idx_list = [
        i for i, s in enumerate(samples)
        if (s.stem, s.turn) in val_positions
    ]
    print(f"  split: {len(train_positions)} positions ({len(train_idx)} samples) train,"
          f" {len(val_positions)} positions ({len(val_idx_list)} samples) val")

    # Feature standardization (fit on train only)
    train_feats = np.stack([samples[i].features for i in train_idx])
    feat_mean = train_feats.mean(axis=0)
    feat_std = train_feats.std(axis=0) + 1e-9
    feat_mean_t = torch.tensor(feat_mean, dtype=torch.float32)
    feat_std_t = torch.tensor(feat_std, dtype=torch.float32)

    def feat_tensor(sample: RealizationSample) -> torch.Tensor:
        return (torch.tensor(sample.features) - feat_mean_t) / feat_std_t

    # Per-target population σ² (fit on train only). This replaces the
    # legacy per-position y_range² normalization at the loss term — see
    # the 2026-05-20 firewall consultation (Tier 1): per-position
    # normalization creates a "predict-the-mean via cancelling components"
    # attractor by giving every position equal loss weight regardless of
    # the actual signal richness. Per-target population σ² preserves
    # cross-target scale invariance (so visit_entropy_reduction in [0,1]
    # contributes proportionally to scoreLead_drift in tens of points)
    # while restoring within-target gradient signal: high-y-range
    # positions now contribute more loss, so SGD can find the
    # cancelling-components escape direction. Computation deferred until
    # after the resume block so it uses the final (possibly checkpoint-
    # restored) train_idx.
    def _compute_target_pop_sigma2(train_idx_: list[int]) -> dict[str, float]:
        sigma2: dict[str, float] = {}
        for t in target_names:
            ys: list[np.ndarray] = []
            for i in train_idx_:
                s = samples[i]
                if t in s.trajectories:
                    _Vg, y_g = s.trajectories[t]
                    ys.append(np.asarray(y_g, dtype=np.float64).reshape(-1))
            if not ys:
                sigma2[t] = 1.0
                print(f"  ⚠ target {t!r}: no train trajectories, "
                      f"σ² fallback to 1.0", flush=True)
                continue
            all_y = np.concatenate(ys)
            # ddof=0 — population variance, not sample (the entire
            # training set IS the population for the loss normalizer).
            var = float(all_y.var())
            sigma2[t] = max(var, 1e-12)
            print(f"  target {t:<28} train σ² = {sigma2[t]:.6g} "
                  f"(σ = {np.sqrt(sigma2[t]):.4g}, n_y={len(all_y)})",
                  flush=True)
        return sigma2

    model = FlatResNet(
        n_features=n_features, target_names=target_names,
        n_blocks=n_blocks, hidden=hidden,
    )
    # Two parameter groups: weight decay applies to weights but not
    # biases. This preserves the carefully-chosen κ-bias initializations
    # of the residual blocks (block i starts at a geometric κ_init);
    # otherwise weight decay drags every block's κ toward softplus(0)+1≈1.7,
    # which collapses to "predict the mean."
    decay_params = []
    no_decay_params = []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        if name.endswith(".bias"):
            no_decay_params.append(p)
        else:
            decay_params.append(p)
    opt = torch.optim.Adam(
        [
            {"params": decay_params, "weight_decay": weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ],
        lr=lr,
    )

    # Dataset fingerprint for checkpoint validity
    fingerprint = _dataset_fingerprint(samples)
    config = {
        "n_blocks": n_blocks, "hidden": hidden,
        "lr": lr, "weight_decay": weight_decay,
        "val_fraction": val_fraction, "seed": seed,
        "n_features": n_features,
        "target_names": list(target_names),
    }

    # Resume from checkpoint if present + compatible.
    start_epoch = 0
    train_losses: list[float] = []
    val_losses: list[float] = []
    if resume and checkpoint_dir is not None:
        ckpt_latest = checkpoint_dir / "latest.pt"
        if ckpt_latest.exists():
            ck = torch.load(ckpt_latest, weights_only=False)
            if ck.get("fingerprint") != fingerprint:
                print(f"  ⚠ checkpoint fingerprint {ck.get('fingerprint')!r} "
                      f"≠ current dataset {fingerprint!r}; starting fresh")
            elif ck.get("config") != config:
                print(f"  ⚠ checkpoint config differs from current; starting fresh")
            else:
                model.load_state_dict(ck["model_state_dict"])
                opt.load_state_dict(ck["optimizer_state_dict"])
                start_epoch = ck["epoch"] + 1
                train_losses = ck.get("train_losses", [])
                val_losses = ck.get("val_losses", [])
                # Restore the train/val split exactly (so resume doesn't
                # accidentally leak val samples into train on different seed).
                train_idx = ck["train_idx"]
                val_idx_list = ck["val_idx_list"]
                feat_mean = np.asarray(ck["feat_mean"])
                feat_std = np.asarray(ck["feat_std"])
                feat_mean_t = torch.tensor(feat_mean, dtype=torch.float32)
                feat_std_t = torch.tensor(feat_std, dtype=torch.float32)
                print(f"  ✓ resumed from epoch {start_epoch} "
                      f"(checkpoint {ckpt_latest.name})")
        else:
            print(f"  --resume requested but no checkpoint at {ckpt_latest}; starting fresh")

    # Compute σ² with the final train_idx (whether fresh-split or
    # checkpoint-restored). Same train_idx → same σ², so we don't need
    # to store σ² in the checkpoint — it's a deterministic function of
    # (train_idx, samples), both of which are reproduced on resume.
    target_pop_sigma2 = _compute_target_pop_sigma2(train_idx)

    # Tensorboard writer
    writer: SummaryWriter | None = None
    if tb_log_dir is not None:
        run_tag = f"run_{int(time.time())}_{fingerprint}"
        tb_path = tb_log_dir / run_tag
        tb_path.mkdir(parents=True, exist_ok=True)
        writer = SummaryWriter(log_dir=str(tb_path))
        print(f"  tensorboard log: {tb_path}")

    # Setup checkpoint dir
    if checkpoint_dir is not None:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)

    best_val_loss = float("inf")

    for epoch in range(start_epoch, n_epochs):
        model.train()
        opt.zero_grad()
        loss = torch.tensor(0.0)
        per_target_train_loss: dict[str, float] = defaultdict(float)
        per_target_count: dict[str, int] = defaultdict(int)
        n_terms = 0
        for i in train_idx:
            s = samples[i]
            x = feat_tensor(s).unsqueeze(0)
            for t in target_names:
                if t not in s.trajectories:
                    continue
                V_g, y_g = s.trajectories[t]
                V_t = torch.tensor(V_g)
                y_t = torch.tensor(y_g).unsqueeze(0)
                y_pred, _ = model(x, V_t, t)
                # Per-target population σ² normalization (fixes the
                # firewall-flagged per-position-normalization attractor).
                # σ² is constant across positions for one target, so
                # within-target the loss is unweighted MSE → the
                # cancelling-components "predict-the-mean" basin no
                # longer dominates.
                term = ((y_pred - y_t) ** 2).mean() / target_pop_sigma2[t]
                loss = loss + term
                per_target_train_loss[t] += float(term.item())
                per_target_count[t] += 1
                n_terms += 1
        loss = loss / max(n_terms, 1)
        loss.backward()
        opt.step()
        train_losses.append(float(loss.item()))

        if writer is not None:
            writer.add_scalar("loss/train", float(loss.item()), epoch)
            for t in target_names:
                if per_target_count[t] > 0:
                    writer.add_scalar(
                        f"loss_per_target/train/{t}",
                        per_target_train_loss[t] / per_target_count[t],
                        epoch,
                    )

        if epoch % verbose == 0 or epoch == n_epochs - 1:
            model.eval()
            with torch.no_grad():
                vloss = torch.tensor(0.0)
                per_target_val_loss: dict[str, float] = defaultdict(float)
                per_target_val_count: dict[str, int] = defaultdict(int)
                vn = 0
                for i in val_idx_list:
                    s = samples[i]
                    x = feat_tensor(s).unsqueeze(0)
                    for t in target_names:
                        if t not in s.trajectories:
                            continue
                        V_g, y_g = s.trajectories[t]
                        V_t = torch.tensor(V_g)
                        y_t = torch.tensor(y_g).unsqueeze(0)
                        y_pred, _ = model(x, V_t, t)
                        # Same per-target-σ² normalization as train.
                        # σ² was computed on train-only y values so this
                        # is a valid out-of-sample loss comparison.
                        term = ((y_pred - y_t) ** 2).mean() / target_pop_sigma2[t]
                        vloss = vloss + term
                        per_target_val_loss[t] += float(term.item())
                        per_target_val_count[t] += 1
                        vn += 1
                vloss = vloss / max(vn, 1)
                val_losses.append(float(vloss.item()))
                print(f"  epoch {epoch:4d}: train_loss={loss.item():.5f}  "
                      f"val_loss={vloss.item():.5f}", flush=True)

                if writer is not None:
                    writer.add_scalar("loss/val", float(vloss.item()), epoch)
                    for t in target_names:
                        if per_target_val_count[t] > 0:
                            writer.add_scalar(
                                f"loss_per_target/val/{t}",
                                per_target_val_loss[t] / per_target_val_count[t],
                                epoch,
                            )

        # Checkpointing
        if checkpoint_dir is not None and (
            epoch % checkpoint_every == 0 or epoch == n_epochs - 1
        ):
            ckpt = {
                "epoch": epoch,
                "fingerprint": fingerprint,
                "config": config,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": opt.state_dict(),
                "feat_mean": feat_mean,
                "feat_std": feat_std,
                "train_idx": train_idx,
                "val_idx_list": val_idx_list,
                "train_losses": train_losses,
                "val_losses": val_losses,
            }
            torch.save(ckpt, checkpoint_dir / "latest.pt")
            cur_val = val_losses[-1] if val_losses else float("inf")
            if cur_val < best_val_loss:
                best_val_loss = cur_val
                torch.save(ckpt, checkpoint_dir / "best.pt")

    # Per-(position, target) val-set R² on the y curves.
    val_r2_by_target: dict[str, list[float]] = defaultdict(list)
    train_r2_by_target: dict[str, list[float]] = defaultdict(list)
    model.eval()
    with torch.no_grad():
        for split_name, idx_list in [("train", train_idx), ("val", val_idx_list)]:
            for i in idx_list:
                s = samples[i]
                x = feat_tensor(s).unsqueeze(0)
                for t in target_names:
                    if t not in s.trajectories:
                        continue
                    V_g, y_g = s.trajectories[t]
                    V_t = torch.tensor(V_g)
                    y_pred, _ = model(x, V_t, t)
                    y_pred_np = y_pred.squeeze(0).numpy()
                    ss_res = float(((y_g - y_pred_np) ** 2).sum())
                    ss_tot = float(((y_g - y_g.mean()) ** 2).sum())
                    r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
                    if split_name == "train":
                        train_r2_by_target[t].append(r2)
                    else:
                        val_r2_by_target[t].append(r2)

    if writer is not None:
        # Final R²s to tensorboard hparams
        for t, vals in val_r2_by_target.items():
            writer.add_scalar(f"r2_val/{t}", float(np.median(vals)), n_epochs)
        for t, vals in train_r2_by_target.items():
            writer.add_scalar(f"r2_train/{t}", float(np.median(vals)), n_epochs)
        writer.close()

    return {
        "model": model,
        "feat_mean": feat_mean,
        "feat_std": feat_std,
        "train_losses": train_losses,
        "val_losses": val_losses,
        "train_r2_by_target": dict(train_r2_by_target),
        "val_r2_by_target": dict(val_r2_by_target),
        "n_train": len(train_idx),
        "n_val": len(val_idx_list),
        "samples": samples,
        "train_idx": train_idx,
        "val_idx": val_idx_list,
        "target_names": target_names,
    }


# ── Plotting + summary ──────────────────────────────────────────────────────

def report_and_plot(result: dict, plot_dir: Path) -> None:
    plot_dir.mkdir(parents=True, exist_ok=True)

    # Training curve
    train_losses = result["train_losses"]
    val_losses = result["val_losses"]
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(train_losses, label="train", lw=1.0)
    val_x = np.linspace(0, len(train_losses) - 1, len(val_losses))
    ax.plot(val_x, val_losses, "ro-", markersize=3, label="val")
    ax.set_xlabel("epoch")
    ax.set_ylabel("loss (mean per-V MSE / y_range²)")
    ax.set_yscale("log")
    ax.set_title(f"flat-ResNet training "
                 f"(n_train={result['n_train']}, n_val={result['n_val']})")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(plot_dir / "resnet_training.png", dpi=110)
    plt.close(fig)

    # Per-target val R² summary
    print(f"\n=== flat-ResNet R² per target on curve prediction (y(V)) ===")
    print(f"  {'target':<28} {'n_train':>7} {'train R² med':>12} "
          f"{'n_val':>6} {'val R² med':>12}")
    for t in result["target_names"]:
        tr = result["train_r2_by_target"].get(t, [])
        vl = result["val_r2_by_target"].get(t, [])
        tr_med = np.median(tr) if tr else float("nan")
        vl_med = np.median(vl) if vl else float("nan")
        print(f"  {t:<28} {len(tr):>7} {tr_med:>+12.3f} "
              f"{len(vl):>6} {vl_med:>+12.3f}")

    # Held-out per-position trajectory plot (val set, all targets overlaid)
    model = result["model"]
    samples = result["samples"]
    feat_mean_t = torch.tensor(result["feat_mean"], dtype=torch.float32)
    feat_std_t = torch.tensor(result["feat_std"], dtype=torch.float32)
    target_names = result["target_names"]

    val_idx = result["val_idx"]
    if not val_idx:
        return
    # Cap at 8 samples for readable plot; pick spread across val set.
    MAX_VAL_PLOT = 8
    if len(val_idx) > MAX_VAL_PLOT:
        step = max(len(val_idx) // MAX_VAL_PLOT, 1)
        val_idx_plot = list(val_idx)[::step][:MAX_VAL_PLOT]
    else:
        val_idx_plot = list(val_idx)
    ncols = 2
    nrows = (len(val_idx_plot) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 3 * nrows),
                              squeeze=False)
    target_colors = {
        "visit_entropy_reduction": "#1f77b4",
        "winrate_drift": "#ff7f0e",
        "scoreLead_drift": "#2ca02c",
        "L2_joint_drift": "#d62728",
    }
    model.eval()
    with torch.no_grad():
        for ax_idx, i in enumerate(val_idx_plot):
            ax = axes[ax_idx // ncols][ax_idx % ncols]
            s = samples[i]
            x = (torch.tensor(s.features) - feat_mean_t) / feat_std_t
            x = x.unsqueeze(0)
            for t in target_names:
                if t not in s.trajectories:
                    continue
                V_g, y_g = s.trajectories[t]
                # Normalize y so different targets share a scale on the plot
                y_n = (y_g - y_g.min()) / max(y_g.max() - y_g.min(), 1e-9)
                color = target_colors.get(t, "gray")
                ax.scatter(V_g, y_n, s=10, alpha=0.5, c=color, label=f"{t} obs")
                V_t = torch.tensor(V_g)
                y_pred, _ = model(x, V_t, t)
                y_pred_np = y_pred.squeeze(0).numpy()
                y_pred_n = (y_pred_np - y_g.min()) / max(y_g.max() - y_g.min(), 1e-9)
                ax.plot(V_g, y_pred_n, "-", c=color, lw=1.2, alpha=0.8,
                        label=f"{t} pred")
            ax.set_title(f"{s.stem}:t{s.turn} r{s.realization_idx}", fontsize=8)
            ax.set_xlabel("V")
            ax.set_ylabel("y (per-target normalized)")
            ax.legend(fontsize=5, loc="best")
            ax.grid(alpha=0.3)
        for j in range(len(val_idx_plot), nrows * ncols):
            axes[j // ncols][j % ncols].axis("off")
    fig.suptitle(
        f"Held-out positions ({len(val_idx_plot)} of {len(val_idx)} val samples shown): "
        f"per-realization trajectory vs ResNet prediction",
        fontsize=10,
    )
    fig.tight_layout()
    fig.savefig(plot_dir / "resnet_val_trajectories.png", dpi=110)
    plt.close(fig)

    # Per-block decomposition on the best-fitting training position.
    # Diagnoses "why are predictions monotone" — if all blocks beyond
    # the first contribute ≈0, weight decay has crushed them to zero
    # and we have a hyperbolic-in-disguise.
    train_idx = result["train_idx"]
    best_i = None
    best_score = -float("inf")
    for i in train_idx:
        s = samples[i]
        x = (torch.tensor(s.features) - feat_mean_t) / feat_std_t
        x = x.unsqueeze(0)
        median_r2 = []
        for t in target_names:
            if t not in s.trajectories:
                continue
            V_g, y_g = s.trajectories[t]
            V_t = torch.tensor(V_g)
            with torch.no_grad():
                y_pred, _ = model(x, V_t, t)
            y_pred_np = y_pred.squeeze(0).numpy()
            ss_res = float(((y_g - y_pred_np) ** 2).sum())
            ss_tot = float(((y_g - y_g.mean()) ** 2).sum())
            r2 = 1.0 - ss_res / max(ss_tot, 1e-12)
            median_r2.append(r2)
        if median_r2:
            score = float(np.median(median_r2))
            if score > best_score:
                best_score = score
                best_i = i

    if best_i is not None:
        s = samples[best_i]
        x = (torch.tensor(s.features) - feat_mean_t) / feat_std_t
        x = x.unsqueeze(0)
        n_tgt = len([t for t in target_names if t in s.trajectories])
        fig, axes = plt.subplots(1, n_tgt, figsize=(4 * n_tgt, 3.2), squeeze=False)
        col = 0
        for t in target_names:
            if t not in s.trajectories:
                continue
            V_g, y_g = s.trajectories[t]
            V_t = torch.tensor(V_g)
            with torch.no_grad():
                y_pred, per_block = model(x, V_t, t)
            y_pred_np = y_pred.squeeze(0).numpy()
            ax = axes[0][col]
            ax.scatter(V_g, y_g, s=14, alpha=0.7, c="black", label="observed")
            ax.plot(V_g, y_pred_np, "k-", lw=1.8, label="total prediction")
            for bi, (H, kappa) in enumerate(per_block):
                Hv = float(H.item())
                kv = float(kappa.item())
                comp = Hv * V_g / (V_g + kv)
                ax.plot(V_g, comp, "--", alpha=0.7,
                        label=f"block {bi}: H={Hv:+.4g}, κ={kv:.1f}")
            ax.set_xlabel("V")
            ax.set_ylabel("y")
            ax.set_title(f"{t}", fontsize=10)
            ax.legend(fontsize=7, loc="best")
            ax.grid(alpha=0.3)
            col += 1
        fig.suptitle(
            f"Per-block decomposition — best-fit train position "
            f"{s.stem}:t{s.turn} (median R²={best_score:+.3f})"
        )
        fig.tight_layout()
        fig.savefig(plot_dir / "resnet_block_decomposition.png", dpi=110)
        plt.close(fig)
        print(f"  per-block decomposition: {plot_dir / 'resnet_block_decomposition.png'}")

        # Also print numerical per-block contributions in text form
        print(f"\n=== per-block parameters on {s.stem}:t{s.turn} ===")
        for t in target_names:
            if t not in s.trajectories:
                continue
            V_g, y_g = s.trajectories[t]
            V_t = torch.tensor(V_g)
            with torch.no_grad():
                _, per_block = model(x, V_t, t)
            print(f"  {t}:")
            for bi, (H, kappa) in enumerate(per_block):
                print(f"    block {bi}: H={float(H.item()):+.5g}  κ={float(kappa.item()):.2f}")

    print(f"\n  plots saved to {plot_dir}/")


# ── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n-blocks", default=3, type=int,
                    help="number of residual blocks (= number of summed "
                         "hyperbolic components in the final prediction)")
    ap.add_argument("--hidden", default=32, type=int)
    ap.add_argument("--epochs", default=1500, type=int)
    ap.add_argument("--lr", default=5e-3, type=float)
    ap.add_argument("--weight-decay", default=1e-3, type=float)
    ap.add_argument("--val-fraction", default=0.2, type=float)
    ap.add_argument("--seed", default=42, type=int)
    ap.add_argument("--plot-dir", default=Path.home() / "plots", type=Path)
    ap.add_argument(
        "--tb-log-dir",
        default=Path("/home/bork/w/vdc/tensorboard/resnet"),
        type=Path,
        help="Tensorboard log root. Each run gets a timestamped subdir. "
             "View with: tensorboard --logdir <dir>",
    )
    ap.add_argument(
        "--checkpoint-dir",
        default=Path("/home/bork/w/vdc/checkpoints/resnet"),
        type=Path,
        help="Saves latest.pt and best.pt (by val loss) checkpoints",
    )
    ap.add_argument(
        "--checkpoint-every", default=100, type=int,
        help="Save checkpoint every N epochs (and at last epoch)",
    )
    ap.add_argument(
        "--resume", action="store_true",
        help="Load latest.pt and continue from saved epoch. Only "
             "applies if dataset fingerprint and config match.",
    )
    ap.add_argument(
        "--no-tb", action="store_true",
        help="Disable tensorboard logging",
    )
    ap.add_argument(
        "--no-checkpoint", action="store_true",
        help="Disable checkpoint saving",
    )
    args = ap.parse_args()

    print(f"=== loading dataset ===")
    samples = load_dataset()
    if not samples:
        sys.exit("no positions in Postgres")
    print(f"  {len(samples)} positions")
    target_names = list(VALUE_CANDIDATES.keys())
    print(f"  targets: {target_names}")
    n_features = samples[0].features.shape[0]
    print(f"  n_features: {n_features}")

    print(f"\n=== training flat-ResNet ===")
    print(f"  n_blocks={args.n_blocks} hidden={args.hidden} "
          f"epochs={args.epochs} lr={args.lr} weight_decay={args.weight_decay}")
    print(f"  val_fraction={args.val_fraction}")
    print()

    result = train_resnet(
        samples=samples,
        target_names=target_names,
        n_blocks=args.n_blocks,
        hidden=args.hidden,
        n_epochs=args.epochs,
        lr=args.lr,
        weight_decay=args.weight_decay,
        val_fraction=args.val_fraction,
        seed=args.seed,
        tb_log_dir=None if args.no_tb else args.tb_log_dir,
        checkpoint_dir=None if args.no_checkpoint else args.checkpoint_dir,
        checkpoint_every=args.checkpoint_every,
        resume=args.resume,
    )
    if "error" in result:
        sys.exit(result["error"])
    report_and_plot(result, args.plot_dir)


if __name__ == "__main__":
    main()
