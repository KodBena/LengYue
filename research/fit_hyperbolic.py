"""
research/fit_hyperbolic.py

Stage-1 (§4.4 overfit-first sanity) hyperbolic fitter for
single-trajectory NPZ files produced by `collect_trajectory.py`.

Per `roadmap-learned-continuous-scaling.md` §3.1: fit
    F(V; H, κ) = H · V / (V + κ)
to a per-trajectory `value(V)` derived from the captured packets.
Three candidate `value()` shapes are screened in parallel (per
§4.2 / §4.4):

  - winrate-drift:   value(V) = drift₀ − |winrate(V) − winrate(V_max)|
  - scoreLead-drift: value(V) = drift₀ − |scoreLead(V) − scoreLead(V_max)|
  - L2 joint drift:  value(V) = drift₀ − sqrt(winrate-drift² + (scoreLead-drift/scoreStdev_at_Vmax)²)

where `drift₀ = drift at the first observed sample` and V_max is
the visit count at the Stage-3 final.

The fit uses non-linear least squares (scipy.optimize.curve_fit).
Residuals are reported as:

  - mean residual (bias check)
  - std residual (noise level)
  - max |residual|
  - Pearson correlation of residual with V (systematic-bias check)

Pass condition (§4.4): residuals small, unbiased, no V-correlation.
Fail condition: systematic structure visible — sigmoid bias, tail
divergence, multimodal pattern.

Also writes a per-trajectory PNG plot (data vs fit, residual vs V)
to the same directory as the input NPZ.

Usage:
  python fit_hyperbolic.py /home/bork/w/omega/research/trajectories/*.npz

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Callable

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit


# ── Parametric form ──────────────────────────────────────────────────────────

def F(V: np.ndarray, H: float, kappa: float) -> np.ndarray:
    """Saturating hyperbolic: F(V; H, κ) = H · V / (V + κ).

    F(0) = 0, F(∞) = H, slope at 0 = H/κ.
    """
    return H * V / (V + kappa)


# ── value() candidates ───────────────────────────────────────────────────────

def value_winrate_drift(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """value(V) = drift₀ − |winrate(V) − winrate(V_max)|

    Starts at 0 at V=V₀; grows toward drift₀ = the initial drift.
    Asymptotically the curve's H ≈ drift₀.
    """
    wr = d["winrate"]
    target = wr[V_max_idx]
    drift = np.abs(wr - target)
    drift_0 = drift[0]
    return drift_0 - drift


def value_logit_winrate_drift(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """value(V) = drift₀ − |logit(winrate(V)) − logit(winrate(V_max))|

    Logit(p) = ln(p / (1 − p)). For tilted games where winrate sits near
    a boundary (0.99 or 0.01), raw winrate volatility is compressed by
    the bound: a "1-move flip" from 0.99 → 0.5 looks like 0.49 in raw
    winrate but 4.6 units in logit space. Captures the
    user-flagged "settled-but-flippable" semeai case (2026-05-20).

    Clipping: ε = 1e-6 to avoid logit at exact boundary.
    """
    wr = np.clip(d["winrate"].astype(np.float64), 1e-6, 1.0 - 1e-6)
    logit = np.log(wr / (1.0 - wr))
    target = logit[V_max_idx]
    drift = np.abs(logit - target)
    drift_0 = drift[0]
    return drift_0 - drift


def value_scorelead_drift(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    sl = d["scoreLead"]
    target = sl[V_max_idx]
    drift = np.abs(sl - target)
    drift_0 = drift[0]
    return drift_0 - drift


def value_l2_joint_drift(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """L2 joint drift normalised by scoreStdev at V_max so winrate and
    scoreLead contributions are commensurate."""
    wr = d["winrate"]
    sl = d["scoreLead"]
    ss_at_max = float(d["scoreStdev"][V_max_idx]) or 1.0
    target_wr = wr[V_max_idx]
    target_sl = sl[V_max_idx]
    wr_drift = (wr - target_wr)
    sl_drift = (sl - target_sl) / ss_at_max
    drift = np.sqrt(wr_drift ** 2 + sl_drift ** 2)
    drift_0 = drift[0]
    return drift_0 - drift


def _visit_entropy(mi_row: np.ndarray) -> float:
    """Shannon entropy of one packet's top-K visit distribution.

    mi_row: int32[TOP_K], visits per move (padded with 0). Normalises
    to probabilities over the non-zero entries; returns H in nats.

    Per `roadmap-learned-continuous-scaling.md` §4.2 (corpus shape):
    visit distribution is the search's own state machine, robust to
    the value-head's data-asymmetry bottleneck. This is the leading
    candidate for the corpus-shape commitment; the three drift
    variants above are §4.4 sanity-test controls.
    """
    total = mi_row.sum()
    if total <= 0:
        return 0.0
    p = mi_row[mi_row > 0].astype(np.float64) / float(total)
    return float(-(p * np.log(p)).sum())


def value_score_stdev_reduction(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """value(V) = scoreStdev(V₀) − scoreStdev(V).

    Captures MCTS's own uncertainty narrowing with search. Distinct
    from value-head scalar drifts because scoreStdev is the search's
    internal posterior, not a downstream consequence of the value head.

    Note: typically monotone-decreasing scoreStdev → monotone-increasing
    value, but transient pathologies (PUCT reallocates to a fresh
    branch with high prior variance) can spike. Added 2026-05-20.
    """
    if "scoreStdev" not in d:
        return np.full(len(d["visits"]), np.nan, dtype=np.float64)
    ss = d["scoreStdev"].astype(np.float64)
    return ss[0] - ss


def value_top_move_visit_fraction(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """value(V) = (top_visits(V) / total_visits(V)) − initial.

    Captures "how decided" the search is. For "obvious-once-you-see-it"
    positions where one move dominates, this saturates rapidly. For
    contested positions where the search struggles to commit, it grows
    slowly. Direct measure of PUCT visit concentration on the leader.
    Added 2026-05-20.
    """
    if "miVisits" not in d:
        return np.full(len(d["visits"]), np.nan, dtype=np.float64)
    mi = d["miVisits"]   # (n_samples, TOP_K) — int visits per move
    top = mi.max(axis=1).astype(np.float64)
    total = mi.sum(axis=1).astype(np.float64)
    fraction = np.where(total > 0, top / total, 0.0)
    return fraction - fraction[0]


def value_visit_entropy_reduction(d: dict[str, np.ndarray], V_max_idx: int) -> np.ndarray:
    """value(V) = H(visits_at_V₀) − H(visits_at_V).

    Per-sample observable, monotonic in expectation but NOT
    per-realization — value-flips mid-search can transiently
    increase entropy (visits reallocate to alternative).

    Notes on the metric (per the §4.2 commitment): visit distribution
    is the search's own allocation, not a downstream consequence of
    the value head. Robust against the value-head data-asymmetry
    bottleneck. Caveat: this is "PUCT has narrowed allocation," not
    strictly "we have acquired N bits of posterior over best move" —
    the visit distribution is biased by the policy prior and the
    c_puct exploration term. Tightly correlated with information
    gain under most positions; diverges on wide-policy or near-
    decided cases.
    """
    if "miVisits" not in d:
        # Older NPZ without moveInfos captured. Return NaN trajectory.
        return np.full(len(d["visits"]), np.nan, dtype=np.float64)
    mi = d["miVisits"]   # (n_samples, TOP_K)
    H = np.array([_visit_entropy(mi[i]) for i in range(len(mi))], dtype=np.float64)
    H_0 = H[0]
    return H_0 - H


VALUE_CANDIDATES: dict[str, Callable[[dict[str, np.ndarray], int], np.ndarray]] = {
    # Leading candidate for §4.2 corpus-shape commitment:
    "visit_entropy_reduction": value_visit_entropy_reduction,
    # Sanity-test controls (value-head scalars, fickle per the value
    # head's data-asymmetry bottleneck):
    "winrate_drift": value_winrate_drift,
    "scoreLead_drift": value_scorelead_drift,
    "L2_joint_drift": value_l2_joint_drift,
    # Logit-space winrate drift: surfaces volatility near the
    # winrate boundary (tilted-but-flippable) that raw winrate
    # compresses. Added 2026-05-20 per user's "settled-but-flippable
    # semeai" observation.
    "logit_winrate_drift": value_logit_winrate_drift,
    # Search's own uncertainty narrowing — orthogonal to value-head
    # scalars. Added 2026-05-20.
    "score_stdev_reduction": value_score_stdev_reduction,
    # Visit-concentration on the leader. Saturates fast for
    # "obvious-once-you-see-it" positions, slow for contested ones.
    # Added 2026-05-20.
    "top_move_visit_fraction": value_top_move_visit_fraction,
}


# ── Fit + residuals ──────────────────────────────────────────────────────────

def fit_one(
    V: np.ndarray,
    y: np.ndarray,
    H_guess: float,
    kappa_guess: float,
) -> tuple[float, float, np.ndarray, dict[str, float]]:
    """Fit y ≈ F(V; H, κ). Returns (H, κ, residuals, stats)."""
    # Bounds: H ≥ 0, κ > 0. Use small positive lower bound to avoid div-by-0.
    popt, _pcov = curve_fit(
        F, V, y,
        p0=[H_guess, kappa_guess],
        bounds=([0.0, 1e-3], [np.inf, np.inf]),
        maxfev=10_000,
    )
    H, kappa = popt
    y_hat = F(V, H, kappa)
    resid = y - y_hat

    # Pearson correlation of residual with V (systematic-bias check)
    if len(V) > 2 and resid.std() > 0:
        v_centered = V - V.mean()
        r_centered = resid - resid.mean()
        denom = np.sqrt((v_centered ** 2).sum() * (r_centered ** 2).sum())
        pearson = float((v_centered * r_centered).sum() / denom) if denom > 0 else 0.0
    else:
        pearson = 0.0

    stats = {
        "H": float(H),
        "kappa": float(kappa),
        "resid_mean": float(resid.mean()),
        "resid_std": float(resid.std()),
        "resid_max_abs": float(np.abs(resid).max()),
        "resid_v_pearson": pearson,
        "y_range": float(y.max() - y.min()),
        "n": int(len(V)),
    }
    return float(H), float(kappa), resid, stats


def fit_trajectory(npz_path: Path) -> dict:
    """Load one trajectory NPZ, fit hyperbolic against three value()
    candidates, return a dict of per-candidate fit results."""
    d = dict(np.load(npz_path, allow_pickle=True))
    V = d["visits"].astype(np.float64)
    ids = d["isDuringSearch"]

    # V_max index: the last is_during_search=False sample. If no final
    # was observed, fall back to argmax V.
    if (~ids).any():
        V_max_idx = int(np.where(~ids)[0][-1])
    else:
        V_max_idx = int(np.argmax(V))
        print(f"  WARNING: no final observed for {npz_path.name}; using argmax V")

    print(f"\n=== {npz_path.name} ===")
    print(f"  {len(V)} samples, V_max={int(V[V_max_idx])} at idx {V_max_idx}")

    results = {}
    for name, value_fn in VALUE_CANDIDATES.items():
        y = value_fn(d, V_max_idx).astype(np.float64)
        if not np.isfinite(y).all():
            print(f"  [{name}] SKIPPED — no usable trajectory "
                  f"(NPZ likely predates moveInfos capture)")
            results[name] = {"error": "missing data"}
            continue
        H_guess = max(float(y.max()), 1e-6)
        # Initial κ guess: visit count where y is roughly halfway.
        half = H_guess / 2
        kappa_guess = float(V[np.argmin(np.abs(y - half))]) if H_guess > 0 else 100.0
        kappa_guess = max(kappa_guess, 1.0)

        try:
            H, kappa, resid, stats = fit_one(V, y, H_guess, kappa_guess)
        except Exception as e:
            print(f"  [{name}] fit FAILED: {e}")
            results[name] = {"error": str(e)}
            continue

        # Report
        rel_resid = stats["resid_std"] / max(stats["y_range"], 1e-9)
        verdict = "PASS" if (
            abs(stats["resid_mean"]) < 0.05 * stats["y_range"]
            and rel_resid < 0.15
            and abs(stats["resid_v_pearson"]) < 0.40
        ) else "REVIEW"
        print(f"  [{name}] H={H:.4f} κ={kappa:.1f}")
        print(f"      resid: mean={stats['resid_mean']:+.4f} "
              f"std={stats['resid_std']:.4f} max|r|={stats['resid_max_abs']:.4f}")
        print(f"      y_range={stats['y_range']:.4f} "
              f"rel_resid_std={rel_resid:.3f} "
              f"pearson(resid,V)={stats['resid_v_pearson']:+.3f}  → {verdict}")
        results[name] = {
            **stats,
            "V": V.tolist(),
            "y": y.tolist(),
            "resid": resid.tolist(),
            "verdict": verdict,
        }

    # Per-trajectory plot
    plot_path = npz_path.with_suffix(".png")
    _plot_fits(npz_path.stem, V, results, plot_path)
    print(f"  plot: {plot_path}")

    return results


def _plot_fits(title: str, V: np.ndarray, results: dict, out: Path) -> None:
    fig, axes = plt.subplots(2, len(VALUE_CANDIDATES), figsize=(4 * len(VALUE_CANDIDATES), 6))
    if len(VALUE_CANDIDATES) == 1:
        axes = axes.reshape(2, 1)
    V_dense = np.linspace(V.min(), V.max(), 400)

    for col, name in enumerate(VALUE_CANDIDATES):
        r = results.get(name, {})
        ax_fit = axes[0, col]
        ax_res = axes[1, col]
        if "error" in r:
            ax_fit.text(0.5, 0.5, f"FIT FAILED\n{r['error']}", ha="center", va="center")
            ax_fit.set_title(f"{name} [error]")
            continue
        y = np.asarray(r["y"])
        resid = np.asarray(r["resid"])
        H, kappa = r["H"], r["kappa"]
        y_hat_dense = F(V_dense, H, kappa)
        ax_fit.scatter(V, y, s=14, alpha=0.7, label="data")
        ax_fit.plot(V_dense, y_hat_dense, "r-", lw=1.2, label=f"F(V; H={H:.3g}, κ={kappa:.3g})")
        ax_fit.set_xlabel("visits V")
        ax_fit.set_ylabel("value(V)")
        ax_fit.set_title(f"{name}  [{r['verdict']}]")
        ax_fit.legend(fontsize=8)
        ax_fit.grid(alpha=0.3)

        ax_res.scatter(V, resid, s=14, alpha=0.7, c="darkred")
        ax_res.axhline(0, color="black", lw=0.5)
        ax_res.set_xlabel("visits V")
        ax_res.set_ylabel("residual (y − F)")
        rel = r["resid_std"] / max(r["y_range"], 1e-9)
        ax_res.set_title(
            f"resid: μ={r['resid_mean']:+.3f} σ={r['resid_std']:.3f} "
            f"ρ(V)={r['resid_v_pearson']:+.2f}"
        )
        ax_res.grid(alpha=0.3)

    fig.suptitle(title, fontsize=11)
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    plt.close(fig)


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("npz", nargs="+", type=Path, help="one or more trajectory NPZ files")
    args = ap.parse_args()
    for p in args.npz:
        fit_trajectory(p)


if __name__ == "__main__":
    main()
