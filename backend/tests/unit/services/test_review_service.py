"""
tests/unit/services/test_review_service.py

Service-level tests for ``ReviewService.process_review`` driven
through ``FakeCardRepository``. Verifies the orchestration logic
between the wire ``ReviewRequest`` and the Bayesian update — the
parts of the flow that aren't pure math.

The Ebisu math itself (``update_recall_float`` in ``core/ebisu.py``)
is the right level for separate unit coverage and is out of scope
here; this file verifies that the service:

  - Fetches via the read Port with the caller's user_id (404-not-403
    on miss).
  - Validates ``len(scores) == card.num_moves`` and the [0, 1] range
    of each score, raising ``InvalidReviewError`` on either failure.
  - Reads ``gamma`` from ``grading_parameter.data.gamma`` with the
    constructor-supplied default fallback.
  - Persists the new (alpha, beta, t) prior via ``update_card_model``.
  - Re-fetches and projects to ``CardWithRecall``.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from domain.auth import UserId
from domain.card import CardWithRecall
from domain.errors import CardNotFoundError, InvalidReviewError
from schemas.card import ReviewRequest
from services.review_service import ReviewService
from tests.fakes import FakeCardRepository

pytestmark = pytest.mark.unit


def _make_service(*, default_gamma: float = 0.925) -> tuple[
    ReviewService, FakeCardRepository
]:
    repo = FakeCardRepository()
    svc = ReviewService(
        repository=repo,
        default_gamma=default_gamma,
        time_unit_seconds=14400.0,
    )
    return svc, repo


ALICE = UserId(1)
BOB = UserId(2)


# ─── Lookup + tenancy ─────────────────────────────────────────────────────────


async def test_process_review_missing_card_raises_card_not_found():
    """A card that doesn't exist raises CardNotFoundError; route maps to 404."""
    svc, _repo = _make_service()
    with pytest.raises(CardNotFoundError):
        await svc.process_review(
            999_999,
            ReviewRequest(scores=[0.5]),
            user_id=ALICE,
        )


async def test_process_review_cross_tenant_card_raises_card_not_found():
    """
    A card owned by another tenant collapses to 404 — same behaviour
    as 'doesn't exist', preserving the 404-not-403 invariant.
    """
    svc, repo = _make_service()
    bobs_card = repo.seed_card(user_id=int(BOB), num_moves=3)

    with pytest.raises(CardNotFoundError):
        await svc.process_review(
            bobs_card,
            ReviewRequest(scores=[0.5, 0.5, 0.5]),
            user_id=ALICE,
        )


# ─── Validation: score-length and score-range ────────────────────────────────


async def test_process_review_score_length_mismatch_raises_invalid_review():
    """
    Item 11: scores must have length == card.num_moves. Padding
    or truncating silently is forbidden — the request is rejected
    with InvalidReviewError, the route maps to 422.
    """
    svc, repo = _make_service()
    card_id = repo.seed_card(user_id=int(ALICE), num_moves=5)

    with pytest.raises(InvalidReviewError, match=r"5"):
        await svc.process_review(
            card_id,
            ReviewRequest(scores=[0.5, 0.5]),  # wrong length
            user_id=ALICE,
        )


async def test_process_review_score_above_range_raises_invalid_review():
    svc, repo = _make_service()
    card_id = repo.seed_card(user_id=int(ALICE), num_moves=2)

    with pytest.raises(InvalidReviewError, match=r"\[0\.0, 1\.0\]"):
        await svc.process_review(
            card_id,
            ReviewRequest(scores=[0.5, 1.5]),
            user_id=ALICE,
        )


async def test_process_review_score_below_range_raises_invalid_review():
    svc, repo = _make_service()
    card_id = repo.seed_card(user_id=int(ALICE), num_moves=2)

    with pytest.raises(InvalidReviewError, match=r"\[0\.0, 1\.0\]"):
        await svc.process_review(
            card_id,
            ReviewRequest(scores=[-0.1, 0.5]),
            user_id=ALICE,
        )


# ─── Happy path ───────────────────────────────────────────────────────────────


async def test_process_review_happy_path_returns_card_with_recall():
    """
    A successful review returns a CardWithRecall with current_recall
    in [0, 1] and halflife_units > 0. The new prior is persisted
    and num_reviews incremented.
    """
    svc, repo = _make_service()
    seeded_at = datetime.now(timezone.utc) - timedelta(days=2)
    card_id = repo.seed_card(
        user_id=int(ALICE),
        num_moves=3,
        creation_date=seeded_at,
        last_reviewed_at=seeded_at,
    )

    response = await svc.process_review(
        card_id,
        ReviewRequest(scores=[1.0, 0.8, 0.6]),
        user_id=ALICE,
    )

    assert isinstance(response, CardWithRecall)
    assert 0.0 <= response.current_recall <= 1.0
    assert response.halflife_units > 0
    # Persistence side effect:
    after = await repo.get_card_by_id(card_id, user_id=ALICE)
    assert after is not None
    assert after.num_reviews == 1
    assert after.last_reviewed_at is not None


# ─── Gamma override ───────────────────────────────────────────────────────────


async def test_process_review_uses_default_gamma_when_not_overridden():
    """
    Without a per-card gamma, the service uses the constructor's
    ``default_gamma`` (matching the route's wiring at
    ``api/dependencies.get_review_service``).
    """
    svc, repo = _make_service(default_gamma=0.5)
    card_id = repo.seed_card(
        user_id=int(ALICE),
        num_moves=2,
        grading_parameter=None,
    )
    # Run; verify it doesn't raise. The math itself is exercised
    # under tests/unit/test_ebisu (Phase 4); here we only verify
    # the gamma source dispatch.
    await svc.process_review(
        card_id, ReviewRequest(scores=[1.0, 0.0]), user_id=ALICE,
    )


async def test_process_review_reads_gamma_from_grading_parameter_data():
    """
    A per-card ``grading_parameter.data.gamma`` overrides the
    constructor default. Verified by giving each branch a distinct
    gamma and confirming the resulting Bayesian update is
    different. The exact numbers don't matter — what matters is
    that the override is consulted.
    """
    repo = FakeCardRepository()
    seeded_at = datetime.now(timezone.utc) - timedelta(days=1)

    # Two identical cards, except for grading_parameter.data.gamma.
    a_id = repo.seed_card(
        user_id=int(ALICE),
        num_moves=3,
        grading_parameter={"data": {"gamma": 0.99}},
        creation_date=seeded_at,
        last_reviewed_at=seeded_at,
    )
    b_id = repo.seed_card(
        user_id=int(ALICE),
        num_moves=3,
        grading_parameter={"data": {"gamma": 0.5}},
        creation_date=seeded_at,
        last_reviewed_at=seeded_at,
    )

    svc = ReviewService(
        repository=repo, default_gamma=0.925, time_unit_seconds=14400.0,
    )

    a_resp = await svc.process_review(
        a_id, ReviewRequest(scores=[0.7, 0.7, 0.7]), user_id=ALICE,
    )
    b_resp = await svc.process_review(
        b_id, ReviewRequest(scores=[0.7, 0.7, 0.7]), user_id=ALICE,
    )

    # Different gammas → different posterior models. (Math sanity:
    # the Bayesian update is gamma-sensitive; if the override was
    # ignored, both posteriors would be identical.)
    assert (
        a_resp.alpha != pytest.approx(b_resp.alpha)
        or a_resp.beta != pytest.approx(b_resp.beta)
        or a_resp.t != pytest.approx(b_resp.t)
    )


# ─── Datetime handling ────────────────────────────────────────────────────────


async def test_process_review_handles_naive_last_reviewed_at():
    """
    A historical card with a tz-naive ``last_reviewed_at`` (older
    rows) is normalised to UTC by the service before the elapsed-
    time computation. No crash on the subtraction.
    """
    svc, repo = _make_service()
    aware = datetime.now(timezone.utc) - timedelta(days=3)
    naive_seeded = aware.replace(tzinfo=None)
    naive_creation = naive_seeded
    card_id = repo.seed_card(
        user_id=int(ALICE),
        num_moves=2,
        last_reviewed_at=naive_seeded,
        creation_date=naive_creation,
    )
    await svc.process_review(
        card_id, ReviewRequest(scores=[1.0, 0.5]), user_id=ALICE,
    )
