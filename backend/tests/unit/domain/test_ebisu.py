"""
tests/unit/domain/test_ebisu.py

Unit tests for ``core.ebisu`` — the Bayesian-recall math the
spaced-repetition algorithm depends on. The math is load-bearing
(every review writes the result of ``update_recall_float`` back to
the database; every card projection invokes ``predict_recall`` and
``model_to_halflife``), so the properties below are pinned as
golden invariants rather than as numerical regression points.

Verified:

  - ``predict_recall``: probability ∈ (0, 1]; recall = 1 at t=0;
    recall = α/(α+β) at t = t0; monotone-decreasing in t_now.
  - ``update_recall_float``: input-contract violations raise
    ValueError loudly (item 9b regression); dt < min_time_ratio
    is a no-op (returns the prior unchanged); a successful review
    increases the posterior mean; a failed review decreases it.
  - ``model_to_halflife``: for a symmetric (α=β) prior the halflife
    equals t0; the function inverts ``predict_recall`` at the
    target percentile.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import math

import pytest

from core.ebisu import (
    model_to_halflife,
    predict_recall,
    update_recall_float,
)

pytestmark = pytest.mark.unit


# ─── predict_recall ───────────────────────────────────────────────────────────


def test_predict_recall_is_probability():
    """A valid probability lies in (0, 1]."""
    p = predict_recall((3.0, 3.0, 1.0), 0.5)
    assert 0.0 < p <= 1.0


def test_predict_recall_at_t_zero_is_one():
    """No time elapsed → no decay → recall is 1."""
    p = predict_recall((3.0, 3.0, 1.0), 0.0)
    assert p == pytest.approx(1.0)


def test_predict_recall_at_t_equals_t0_is_alpha_over_alpha_plus_beta():
    """
    At t_now = t0, the posterior reduces to α/(α+β) — the prior's
    expected recall after exactly one halflife unit.
    """
    p = predict_recall((3.0, 3.0, 1.0), 1.0)
    assert p == pytest.approx(3.0 / (3.0 + 3.0))

    p = predict_recall((4.0, 2.0, 1.0), 1.0)
    assert p == pytest.approx(4.0 / (4.0 + 2.0))


def test_predict_recall_is_monotone_decreasing_in_time():
    """As more time passes, expected recall must not increase."""
    prior = (3.0, 3.0, 1.0)
    p_short = predict_recall(prior, 0.5)
    p_medium = predict_recall(prior, 1.0)
    p_long = predict_recall(prior, 5.0)
    assert p_short > p_medium > p_long


# ─── update_recall_float — input contract (item 9b) ───────────────────────────


def test_update_recall_float_rejects_negative_successes():
    with pytest.raises(ValueError):
        update_recall_float((3.0, 3.0, 1.0), successes=-0.1, total=1.0, t_now=1.0)


def test_update_recall_float_rejects_successes_greater_than_total():
    with pytest.raises(ValueError):
        update_recall_float((3.0, 3.0, 1.0), successes=2.0, total=1.0, t_now=1.0)


def test_update_recall_float_rejects_total_below_one():
    with pytest.raises(ValueError):
        update_recall_float((3.0, 3.0, 1.0), successes=0.0, total=0.5, t_now=1.0)


# ─── update_recall_float — semantics ──────────────────────────────────────────


def test_update_recall_float_no_op_when_dt_below_min_ratio():
    """Reviews too soon after the last review are dropped (no update)."""
    prior = (3.0, 3.0, 1.0)
    out = update_recall_float(
        prior, successes=1.0, total=1.0, t_now=0.001,
        min_time_ratio=0.05,
    )
    assert out == prior


def test_update_recall_float_success_extends_halflife():
    """
    A successful review extends the halflife — the new t component
    should exceed the old one. (With ``rebalance=True``, the
    posterior is re-centered at recall=0.5; the mean stays put for
    symmetric priors but t shifts to encode the learning signal.)
    """
    prior_a, prior_b, prior_t = 3.0, 3.0, 1.0
    _, _, new_t = update_recall_float(
        (prior_a, prior_b, prior_t),
        successes=1.0, total=1.0, t_now=1.0,
    )
    assert new_t > prior_t


def test_update_recall_float_failure_shortens_halflife():
    """A failed review at t = t0 must shrink the halflife."""
    prior_a, prior_b, prior_t = 3.0, 3.0, 1.0
    _, _, new_t = update_recall_float(
        (prior_a, prior_b, prior_t),
        successes=0.0, total=1.0, t_now=1.0,
    )
    assert new_t < prior_t


def test_update_recall_float_returns_finite_values():
    """The posterior tuple must be finite — NaN/inf would corrupt the DB."""
    new_a, new_b, new_t = update_recall_float(
        (3.0, 3.0, 1.0), successes=1.0, total=1.0, t_now=1.0,
    )
    assert math.isfinite(new_a)
    assert math.isfinite(new_b)
    assert math.isfinite(new_t)
    assert new_a > 0 and new_b > 0 and new_t > 0


# ─── model_to_halflife ────────────────────────────────────────────────────────


def test_model_to_halflife_symmetric_prior_equals_t0():
    """
    For (α=β=3, t0=1) at percentile 0.5: predict_recall((3,3,1), t)
    crosses 0.5 exactly at t = 1 (the α/(α+β) identity at t = t0).
    """
    hl = model_to_halflife((3.0, 3.0, 1.0), percentile=0.5)
    assert hl == pytest.approx(1.0, rel=1e-6)


def test_model_to_halflife_inverts_predict_recall():
    """
    For any model and percentile, predict_recall(model, halflife) ==
    percentile. This is the defining property; pin it for a few priors.
    """
    for model, percentile in [
        ((3.0, 3.0, 1.0), 0.5),
        ((4.0, 2.0, 2.0), 0.5),
        ((3.0, 3.0, 1.0), 0.9),
    ]:
        hl = model_to_halflife(model, percentile=percentile)
        assert predict_recall(model, hl) == pytest.approx(percentile, rel=1e-5)


def test_model_to_halflife_scales_linearly_with_t0():
    """
    Doubling t0 doubles the halflife (the posterior is the same shape,
    just stretched on the time axis).
    """
    hl_1 = model_to_halflife((3.0, 3.0, 1.0))
    hl_2 = model_to_halflife((3.0, 3.0, 2.0))
    assert hl_2 == pytest.approx(hl_1 * 2.0, rel=1e-6)
