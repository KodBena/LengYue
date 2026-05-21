"""
research/curve_families.py

Pluggable parametric-family abstraction for trajectory fitting.
Each family takes a per-V trajectory (V, y) and returns a fitted
parameter dict + residual diagnostics, with a clean/degenerate
status flag computed from family-specific criteria.

This is the abstraction the user proposed to enable experiments with
alternative parametric forms (sum-residual hyperbolic, convex-mixture,
MLP-residual, etc.) without each new experiment requiring surgery on
the fitting and regression pipelines.

The existing single-curve hyperbolic `F(V; H, κ) = H·V/(V+κ)` is the
`Hyperbolic` family. New families register themselves in `FAMILIES`.

Downstream contract
═══════════════════
`CurveFitResult.params` is a `dict[str, float]` so any family's
parameter count is supported uniformly. The labels CSV stores
`params` as JSON; regression code reads via `params_json` and
expands to per-parameter columns by family.

License: Public Domain (The Unlicense)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, Sequence

import numpy as np
from scipy.optimize import curve_fit


# ── Status thresholds (shared across families) ──────────────────────────────
#
# These are the family-agnostic "is this fit acceptable" criteria. Each
# family also has its own family-specific criteria (e.g. parameter
# plausibility ranges) applied on top.

REL_RESID_STD_CLEAN_MAX = 0.25
MONOTONICITY_DROP_CLEAN_MAX = 0.30


# ── Result envelope ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CurveFitResult:
    """Outcome of fitting one CurveFamily to one (V, y) trajectory.

    The `family` field carries the family name (so downstream readers
    can reconstruct which params dict shape to expect). `params` is a
    dict[name → float] so heterogeneous-arity families share one
    container."""

    family: str
    params: dict[str, float]
    y_hat: np.ndarray
    residuals: np.ndarray
    rel_resid_std: float
    pearson_resid_v: float
    max_abs_resid: float
    y_range: float
    y_peak: float
    y_final: float
    monotonicity_drop: float
    peak_position: float
    status: str
    reason: str


class CurveFamily(Protocol):
    """A parametric family of curves over MCTS visit counts V."""

    name: str
    param_names: Sequence[str]

    def fit(self, V: np.ndarray, y: np.ndarray) -> CurveFitResult: ...
    def predict(self, V: np.ndarray, params: dict[str, float]) -> np.ndarray: ...


# ── Shared diagnostics helper ───────────────────────────────────────────────

def compute_diagnostics(
    V: np.ndarray, y: np.ndarray, y_hat: np.ndarray
) -> dict[str, float | np.ndarray]:
    """Family-agnostic residual diagnostics from a (V, y, y_hat) tuple.
    Returned dict keys match the CurveFitResult fields one-for-one."""
    resid = y - y_hat
    y_peak_idx = int(np.argmax(y))
    y_peak = float(y[y_peak_idx])
    y_final = float(y[-1])
    y_range = float(y.max() - y.min())
    monotonicity_drop = (
        (y_peak - y_final) / max(y_peak, 1e-9) if y_peak > 0 else float("inf")
    )
    peak_position = y_peak_idx / max(len(y) - 1, 1)

    if y_range > 0 and resid.std() > 0:
        v_c = V - V.mean()
        r_c = resid - resid.mean()
        denom = np.sqrt((v_c ** 2).sum() * (r_c ** 2).sum())
        pearson = float((v_c * r_c).sum() / denom) if denom > 0 else 0.0
    else:
        pearson = 0.0

    return {
        "residuals": resid,
        "rel_resid_std": float(resid.std() / max(y_range, 1e-9)),
        "max_abs_resid": float(np.abs(resid).max()),
        "pearson_resid_v": pearson,
        "y_range": y_range,
        "y_peak": y_peak,
        "y_final": y_final,
        "monotonicity_drop": monotonicity_drop,
        "peak_position": peak_position,
    }


def _degenerate_result(
    name: str, V: np.ndarray, y: np.ndarray, reason: str
) -> CurveFitResult:
    """Construct a degenerate-status result for cases where the fit
    couldn't be attempted (insufficient data, fit failure, …)."""
    return CurveFitResult(
        family=name,
        params={},
        y_hat=np.zeros_like(y) if len(y) > 0 else np.array([]),
        residuals=np.zeros_like(y) if len(y) > 0 else np.array([]),
        rel_resid_std=float("inf"),
        pearson_resid_v=0.0,
        max_abs_resid=float("inf"),
        y_range=0.0,
        y_peak=0.0,
        y_final=0.0,
        monotonicity_drop=float("inf"),
        peak_position=0.0,
        status="degenerate",
        reason=reason,
    )


# ── Hyperbolic family ───────────────────────────────────────────────────────

# Family-specific plausibility thresholds (the hyperbolic shape requires
# H > 0 and κ in a plausible "visits" range for the fit to mean
# something allocator-allocatable).

_HYP_H_MIN_CLEAN = 1e-3
_HYP_KAPPA_MIN_CLEAN = 1.0
_HYP_KAPPA_MAX_CLEAN = 1e6


def _hyperbolic_model(V, H, kappa):
    return H * V / (V + kappa)


@dataclass(frozen=True)
class Hyperbolic:
    """Single saturating curve: F(V; H, κ) = H · V / (V + κ).

    Two parameters: H (asymptote) and κ (half-rate visit count).
    Closed-form derivative `dF/dV = H · κ / (V + κ)²` keeps the
    allocator's marginal-gain query cheap."""

    name: str = "hyperbolic"
    param_names: tuple[str, ...] = field(default=("H", "kappa"))

    def predict(self, V: np.ndarray, params: dict[str, float]) -> np.ndarray:
        return _hyperbolic_model(V, params["H"], params["kappa"])

    def fit(self, V: np.ndarray, y: np.ndarray) -> CurveFitResult:
        if not np.isfinite(y).all() or len(y) < 4:
            return _degenerate_result(self.name, V, y, "insufficient data")
        H_guess = max(float(y.max()), 1e-6)
        kappa_guess = max(float(V[np.argmin(np.abs(y - H_guess / 2))]), 1.0)
        try:
            popt, _ = curve_fit(
                _hyperbolic_model, V, y,
                p0=[H_guess, kappa_guess],
                bounds=([0.0, 1e-3], [np.inf, np.inf]),
                maxfev=10_000,
            )
        except Exception as e:
            return _degenerate_result(self.name, V, y, f"fit failed: {e}")

        params = {"H": float(popt[0]), "kappa": float(popt[1])}
        y_hat = self.predict(V, params)
        diag = compute_diagnostics(V, y, y_hat)

        # Status: hyperbolic-specific plausibility plus shared criteria.
        if (
            params["H"] < _HYP_H_MIN_CLEAN
            or params["kappa"] < _HYP_KAPPA_MIN_CLEAN
            or params["kappa"] > _HYP_KAPPA_MAX_CLEAN
            or diag["rel_resid_std"] > REL_RESID_STD_CLEAN_MAX
            or diag["monotonicity_drop"] > MONOTONICITY_DROP_CLEAN_MAX
        ):
            status = "degenerate"
        else:
            status = "clean"

        return CurveFitResult(
            family=self.name,
            params=params,
            y_hat=y_hat,
            residuals=diag["residuals"],
            rel_resid_std=diag["rel_resid_std"],
            pearson_resid_v=diag["pearson_resid_v"],
            max_abs_resid=diag["max_abs_resid"],
            y_range=diag["y_range"],
            y_peak=diag["y_peak"],
            y_final=diag["y_final"],
            monotonicity_drop=diag["monotonicity_drop"],
            peak_position=diag["peak_position"],
            status=status,
            reason="",
        )


# ── Registry ───────────────────────────────────────────────────────────────

# ── Sum-residual hyperbolic family ──────────────────────────────────────────
#
# F(V; H, κ, H', κ') = H · V / (V + κ) + H' · V / (V + κ')
#
# Two opposing-sign hyperbolic components. The primary (H ≥ 0, κ > 0) is
# the saturating "extraction" — the same shape the pure Hyperbolic family
# captures. The residual (H' free, κ' > 0) lets the model represent
# "rise then fall" (peak-then-decline) and pure-decline patterns by
# choosing H' < 0; or augment the saturation with a secondary component
# by choosing H' > 0.
#
# This is the user-proposed sum-with-gated-residual architecture's
# closed-form physics-respecting variant — no NN gate yet (that's the
# convex-mixture family next). Closed-form derivative preserved:
# dF/dV = H·κ/(V+κ)² + H'·κ'/(V+κ')².

_SR_H_MIN_CLEAN = 1e-3
_SR_KAPPA_MIN_CLEAN = 1.0
_SR_KAPPA_MAX_CLEAN = 1e6


def _sum_residual_model(V, H, kappa, H_prime, kappa_prime):
    return H * V / (V + kappa) + H_prime * V / (V + kappa_prime)


@dataclass(frozen=True)
class SumResidualHyperbolic:
    """F = H·V/(V+κ) + H'·V/(V+κ'). Primary saturating + secondary
    sign-flexible. Captures bell-shape and pure-decline by letting H'
    go negative; reduces to pure Hyperbolic when H' ≈ 0."""

    name: str = "sum_residual_hyperbolic"
    param_names: tuple[str, ...] = field(default=("H", "kappa", "H_prime", "kappa_prime"))

    def predict(self, V: np.ndarray, params: dict[str, float]) -> np.ndarray:
        return _sum_residual_model(
            V, params["H"], params["kappa"],
            params["H_prime"], params["kappa_prime"],
        )

    def fit(self, V: np.ndarray, y: np.ndarray) -> CurveFitResult:
        if not np.isfinite(y).all() or len(y) < 4:
            return _degenerate_result(self.name, V, y, "insufficient data")

        # Initial guesses. Primary component starts as a pure-Hyperbolic
        # fit; residual starts at zero (let the optimizer add only if
        # it reduces residual). Distinct κ' = 5·κ so the two components
        # operate on different timescales initially.
        H_guess = max(float(y.max()), 1e-6)
        kappa_guess = max(float(V[np.argmin(np.abs(y - H_guess / 2))]), 1.0)
        H_prime_guess = 0.0
        kappa_prime_guess = max(kappa_guess * 5.0, 10.0)

        try:
            popt, _ = curve_fit(
                _sum_residual_model, V, y,
                p0=[H_guess, kappa_guess, H_prime_guess, kappa_prime_guess],
                bounds=(
                    [0.0, 1e-3, -np.inf, 1e-3],
                    [np.inf, np.inf, np.inf, np.inf],
                ),
                maxfev=20_000,
            )
        except Exception as e:
            return _degenerate_result(self.name, V, y, f"fit failed: {e}")

        params = {
            "H": float(popt[0]),
            "kappa": float(popt[1]),
            "H_prime": float(popt[2]),
            "kappa_prime": float(popt[3]),
        }
        y_hat = self.predict(V, params)
        diag = compute_diagnostics(V, y, y_hat)

        # Status: family-specific plausibility (both κ's in band, |H|
        # meaningful) plus shared residual criterion. NOTE: we DO NOT
        # apply the monotonicity_drop criterion here — the whole point
        # of this family is to fit non-monotonic shapes.
        if (
            params["H"] < _SR_H_MIN_CLEAN
            or params["kappa"] < _SR_KAPPA_MIN_CLEAN
            or params["kappa"] > _SR_KAPPA_MAX_CLEAN
            or params["kappa_prime"] < _SR_KAPPA_MIN_CLEAN
            or params["kappa_prime"] > _SR_KAPPA_MAX_CLEAN
            or diag["rel_resid_std"] > REL_RESID_STD_CLEAN_MAX
        ):
            status = "degenerate"
        else:
            status = "clean"

        return CurveFitResult(
            family=self.name,
            params=params,
            y_hat=y_hat,
            residuals=diag["residuals"],
            rel_resid_std=diag["rel_resid_std"],
            pearson_resid_v=diag["pearson_resid_v"],
            max_abs_resid=diag["max_abs_resid"],
            y_range=diag["y_range"],
            y_peak=diag["y_peak"],
            y_final=diag["y_final"],
            monotonicity_drop=diag["monotonicity_drop"],
            peak_position=diag["peak_position"],
            status=status,
            reason="",
        )


# ── Convex-mixture hyperbolic family ────────────────────────────────────────
#
# y = (1-σ(g)) · H₁ · V/(V+κ₁) + σ(g) · H₂ · V/(V+κ₂)
#
# Smooth-XOR between two hyperbolic components: as σ(g) → 0 the
# prediction is the primary hyperbolic; as σ(g) → 1 it is the
# secondary. The mixture weight is fit per-position as `gate_logit`
# (the pre-sigmoid logit, unconstrained real).
#
# This is the per-position version of the "predicate-gated" mixture
# the user proposed. In the full feature-conditioned version the gate
# would be predicted from features by a NN; here it's a position-
# specific scalar fit alongside the other parameters. Regression
# downstream can then learn whether features predict the gate.
#
# Sign-flexibility: H₂ is sign-flexible (capturing peak-then-decline
# via cancellation). H₁ is positive (the primary saturating term).

_CM_KAPPA_MIN_CLEAN = 1.0
_CM_KAPPA_MAX_CLEAN = 1e6
_CM_GATE_LOGIT_BOUND = 10.0   # σ(±10) ≈ 4.5e-5 / 1-4.5e-5; numerically saturating


def _sigmoid(x):
    # Numerically stable sigmoid for scalar / array input.
    return np.where(x >= 0,
                    1.0 / (1.0 + np.exp(-x)),
                    np.exp(x) / (1.0 + np.exp(x)))


def _convex_mixture_model(V, H1, kappa1, H2, kappa2, gate_logit):
    w = _sigmoid(gate_logit)
    return ((1.0 - w) * H1 * V / (V + kappa1)
            + w * H2 * V / (V + kappa2))


@dataclass(frozen=True)
class ConvexMixtureHyperbolic:
    """Smooth-XOR mixture of two hyperbolics with a learned gate."""

    name: str = "convex_mixture_hyperbolic"
    param_names: tuple[str, ...] = field(
        default=("H1", "kappa1", "H2", "kappa2", "gate_logit")
    )

    def predict(self, V: np.ndarray, params: dict[str, float]) -> np.ndarray:
        return _convex_mixture_model(
            V, params["H1"], params["kappa1"],
            params["H2"], params["kappa2"], params["gate_logit"],
        )

    def fit(self, V: np.ndarray, y: np.ndarray) -> CurveFitResult:
        if not np.isfinite(y).all() or len(y) < 5:
            return _degenerate_result(self.name, V, y, "insufficient data")

        H_guess = max(float(y.max()), 1e-6)
        kappa_guess = max(float(V[np.argmin(np.abs(y - H_guess / 2))]), 1.0)
        # Start with balanced mixture (gate_logit=0 → w=0.5) and two
        # hyperbolics at different timescales. H2 starts sign-zero so
        # the optimizer chooses its sign based on data.
        p0 = [H_guess, kappa_guess, 0.0, max(kappa_guess * 5.0, 10.0), 0.0]
        bounds = (
            [0.0, 1e-3, -np.inf, 1e-3, -_CM_GATE_LOGIT_BOUND],
            [np.inf, np.inf, np.inf, np.inf, _CM_GATE_LOGIT_BOUND],
        )

        try:
            popt, _ = curve_fit(
                _convex_mixture_model, V, y,
                p0=p0, bounds=bounds, maxfev=30_000,
            )
        except Exception as e:
            return _degenerate_result(self.name, V, y, f"fit failed: {e}")

        params = {
            "H1": float(popt[0]),
            "kappa1": float(popt[1]),
            "H2": float(popt[2]),
            "kappa2": float(popt[3]),
            "gate_logit": float(popt[4]),
        }
        y_hat = self.predict(V, params)
        diag = compute_diagnostics(V, y, y_hat)

        # Status: both κ's in plausible range, primary H positive and
        # meaningful, residual under threshold. No mono_drop check —
        # this family is designed to fit non-monotonic shapes.
        if (
            params["kappa1"] < _CM_KAPPA_MIN_CLEAN
            or params["kappa1"] > _CM_KAPPA_MAX_CLEAN
            or params["kappa2"] < _CM_KAPPA_MIN_CLEAN
            or params["kappa2"] > _CM_KAPPA_MAX_CLEAN
            or params["H1"] < _HYP_H_MIN_CLEAN
            or diag["rel_resid_std"] > REL_RESID_STD_CLEAN_MAX
        ):
            status = "degenerate"
        else:
            status = "clean"

        return CurveFitResult(
            family=self.name,
            params=params,
            y_hat=y_hat,
            residuals=diag["residuals"],
            rel_resid_std=diag["rel_resid_std"],
            pearson_resid_v=diag["pearson_resid_v"],
            max_abs_resid=diag["max_abs_resid"],
            y_range=diag["y_range"],
            y_peak=diag["y_peak"],
            y_final=diag["y_final"],
            monotonicity_drop=diag["monotonicity_drop"],
            peak_position=diag["peak_position"],
            status=status,
            reason="",
        )


# ── Registry ───────────────────────────────────────────────────────────────

FAMILIES: dict[str, CurveFamily] = {
    "hyperbolic": Hyperbolic(),
    "sum_residual_hyperbolic": SumResidualHyperbolic(),
    "convex_mixture_hyperbolic": ConvexMixtureHyperbolic(),
}
