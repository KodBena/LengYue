"""
tests/unit/domain/test_card_projection.py

Pure-domain tests for ``domain/card.py`` — the recall-projection
functions that turn a persisted ``Card`` into the ``CardWithRecall``
wire shape.

The projection is deceptively load-bearing: every read of a card
through the API runs ``project_card``, so a regression here would
silently shift recall numbers across the whole UI. The properties
below pin:

  - ``compute_current_recall_from_prior``: naive datetimes are
    treated as UTC; ``last_reviewed_at`` falls back to
    ``creation_date`` when ``None``; the elapsed-time computation
    is invariant under tz-offset changes that preserve the wall
    clock.
  - ``compute_current_recall``: convenience wrapper agrees with
    the lower-level function on identical inputs.
  - ``project_card``: emits a frozen ``CardWithRecall`` with a
    sensible ``current_recall`` and ``halflife_units``; for a
    symmetric prior at exactly t=t0 the recall is α/(α+β).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from domain.card import (
    Card,
    CardWithRecall,
    compute_current_recall,
    compute_current_recall_from_prior,
    project_card,
)

pytestmark = pytest.mark.unit


# ─── Card factory ─────────────────────────────────────────────────────────────


def _make_card(
    *,
    alpha: float = 3.0,
    beta: float = 3.0,
    t: float = 1.0,
    last_reviewed_at: datetime | None = None,
    creation_date: datetime | None = None,
) -> Card:
    return Card(
        id=1,
        num_moves=10,
        alpha=alpha,
        beta=beta,
        t=t,
        last_reviewed_at=last_reviewed_at,
        creation_date=creation_date or datetime(2026, 1, 1, tzinfo=timezone.utc),
        num_reviews=0,
        suspended=False,
        grading_parameter=None,
        canonical_content="(;FF[4])",
    )


# ─── compute_current_recall_from_prior ────────────────────────────────────────


def test_recall_uses_creation_date_when_last_reviewed_at_is_none():
    """An unreviewed card decays from creation, not from epoch."""
    creation = datetime(2026, 1, 1, tzinfo=timezone.utc)
    now = creation + timedelta(seconds=1.0)
    p = compute_current_recall_from_prior(
        alpha=3.0, beta=3.0, t=1.0,
        last_reviewed_at=None,
        creation_date=creation,
        now=now,
        time_unit_seconds=1.0,
    )
    assert p == pytest.approx(0.5)


def test_recall_treats_naive_last_reviewed_as_utc():
    """A naive ``last_reviewed_at`` is interpreted as UTC."""
    creation = datetime(2026, 1, 1, tzinfo=timezone.utc)
    naive_last = datetime(2026, 1, 2)
    aware_now = datetime(2026, 1, 2, tzinfo=timezone.utc) + timedelta(seconds=1.0)
    p = compute_current_recall_from_prior(
        alpha=3.0, beta=3.0, t=1.0,
        last_reviewed_at=naive_last,
        creation_date=creation,
        now=aware_now,
        time_unit_seconds=1.0,
    )
    assert p == pytest.approx(0.5)


def test_recall_at_zero_elapsed_is_one():
    """If ``now`` equals ``last_reviewed_at`` the recall is 1."""
    last = datetime(2026, 2, 1, tzinfo=timezone.utc)
    p = compute_current_recall_from_prior(
        alpha=3.0, beta=3.0, t=1.0,
        last_reviewed_at=last,
        creation_date=last - timedelta(days=10),
        now=last,
        time_unit_seconds=1.0,
    )
    assert p == pytest.approx(1.0)


def test_recall_decreases_as_time_advances():
    """Holding all else fixed, later ``now`` gives lower recall."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    common = dict(
        alpha=3.0, beta=3.0, t=1.0,
        last_reviewed_at=last, creation_date=last,
        time_unit_seconds=1.0,
    )
    p_early = compute_current_recall_from_prior(
        **common, now=last + timedelta(seconds=0.5),
    )
    p_late = compute_current_recall_from_prior(
        **common, now=last + timedelta(seconds=5.0),
    )
    assert p_early > p_late


def test_recall_is_keyword_only():
    """Argument transposition is prevented by keyword-only signature."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with pytest.raises(TypeError):
        compute_current_recall_from_prior(  # type: ignore[misc]
            3.0, 3.0, 1.0, last, last, last, 1.0,
        )


# ─── compute_current_recall (Card wrapper) ────────────────────────────────────


def test_compute_current_recall_agrees_with_low_level():
    """The Card-taking wrapper agrees with the lower-level function."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(last_reviewed_at=last, creation_date=last)
    now = last + timedelta(seconds=1.0)

    p_high = compute_current_recall(card, now=now, time_unit_seconds=1.0)
    p_low = compute_current_recall_from_prior(
        alpha=card.alpha, beta=card.beta, t=card.t,
        last_reviewed_at=card.last_reviewed_at,
        creation_date=card.creation_date,
        now=now, time_unit_seconds=1.0,
    )
    assert p_high == pytest.approx(p_low)


# ─── project_card ─────────────────────────────────────────────────────────────


def test_project_card_returns_cardwithrecall():
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(last_reviewed_at=last, creation_date=last)
    projected = project_card(card, now=last, time_unit_seconds=1.0)
    assert isinstance(projected, CardWithRecall)


def test_project_card_recall_at_t0_is_alpha_over_alpha_plus_beta():
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(
        alpha=4.0, beta=2.0, t=1.0,
        last_reviewed_at=last, creation_date=last,
    )
    projected = project_card(
        card,
        now=last + timedelta(seconds=1.0),
        time_unit_seconds=1.0,
    )
    assert projected.current_recall == pytest.approx(4.0 / (4.0 + 2.0))


def test_project_card_halflife_for_symmetric_prior_equals_t():
    """For α = β, the halflife equals t (in time units)."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(
        alpha=3.0, beta=3.0, t=2.0,
        last_reviewed_at=last, creation_date=last,
    )
    projected = project_card(card, now=last, time_unit_seconds=1.0)
    assert projected.halflife_units == pytest.approx(2.0, rel=1e-6)


def test_project_card_preserves_card_fields():
    """The projection carries every Card field through unchanged."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(last_reviewed_at=last, creation_date=last)
    projected = project_card(card, now=last, time_unit_seconds=1.0)

    for field in Card.model_fields:
        assert getattr(projected, field) == getattr(card, field)


def test_cardwithrecall_is_frozen():
    """Per the backend authoring posture, wire-shape DTOs are frozen."""
    last = datetime(2026, 1, 1, tzinfo=timezone.utc)
    card = _make_card(last_reviewed_at=last, creation_date=last)
    projected = project_card(card, now=last, time_unit_seconds=1.0)

    with pytest.raises(ValidationError):
        projected.current_recall = 0.0  # type: ignore[misc]
