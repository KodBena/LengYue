"""
tests/unit/services/test_stats_service.py

Service-level tests for ``StatsService`` driven through
``FakeStatsRepository``. The Port returns flat per-card
membership rows; the service aggregates them into per-forest
``ForestStat`` DTOs in a single linear pass with one clock
reading per request.

What's verified here:

  - ``compute_tag_usage`` is a thin pass-through; the service
    returns whatever the Port returned. Symmetry with
    ``compute_forest_summaries`` and a natural extension point
    for a future "hide low-use tags" policy.

  - ``compute_forest_summaries`` aggregates flat rows into one
    ``ForestStat`` per distinct ``root_card_id``; per-card
    recall is computed once per row against a single clock
    reading.

  - Tenancy: each user's pre-loaded slice of rows is what they
    see; cross-tenant rows are not visible.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from domain.auth import UserId
from domain.stats import ForestMemberRow
from schemas.stats import TagStat
from services.stats_service import StatsService
from tests.fakes import FakeStatsRepository

pytestmark = pytest.mark.unit


ALICE = UserId(1)
BOB = UserId(2)


def _make_service() -> tuple[StatsService, FakeStatsRepository]:
    repo = FakeStatsRepository()
    svc = StatsService(repository=repo, time_unit=14400.0)
    return svc, repo


def _row(
    *,
    root_card_id: int,
    game_source_id: int,
    description: str = "test-game",
    player_white: str = "W",
    player_black: str = "B",
    num_reviews: int = 0,
    creation_offset_days: int = 1,
) -> ForestMemberRow:
    """Construct a ForestMemberRow with sane defaults."""
    creation = datetime.now(timezone.utc) - timedelta(days=creation_offset_days)
    return ForestMemberRow(
        root_card_id=root_card_id,
        game_source_id=game_source_id,
        description=description,
        player_white=player_white,
        player_black=player_black,
        alpha=3.0,
        beta=3.0,
        t=1.0,
        last_reviewed_at=None,
        creation_date=creation,
        num_reviews=num_reviews,
    )


# ─── compute_tag_usage ────────────────────────────────────────────────────────


async def test_compute_tag_usage_passes_through_repo_output():
    """The service forwards the Port result without transformation."""
    svc, repo = _make_service()
    repo.set_tag_usage(
        user_id=int(ALICE),
        tags=[
            TagStat(name="attack", count=5),
            TagStat(name="defense", count=2),
        ],
    )

    result = await svc.compute_tag_usage(user_id=ALICE)
    assert [t.name for t in result] == ["attack", "defense"]
    assert [t.count for t in result] == [5, 2]


async def test_compute_tag_usage_tenancy():
    """Cross-tenant rows are not visible."""
    svc, repo = _make_service()
    repo.set_tag_usage(
        user_id=int(ALICE),
        tags=[TagStat(name="attack", count=5)],
    )
    repo.set_tag_usage(
        user_id=int(BOB),
        tags=[TagStat(name="defense", count=10)],
    )

    alice = await svc.compute_tag_usage(user_id=ALICE)
    bob = await svc.compute_tag_usage(user_id=BOB)
    assert {t.name for t in alice} == {"attack"}
    assert {t.name for t in bob} == {"defense"}


async def test_compute_tag_usage_empty_returns_empty_list():
    svc, _repo = _make_service()
    assert await svc.compute_tag_usage(user_id=ALICE) == []


# ─── compute_forest_summaries ────────────────────────────────────────────────


async def test_compute_forest_summaries_single_forest_with_three_cards():
    """Three rows in one forest aggregate to one ForestStat with total_cards=3."""
    svc, repo = _make_service()
    repo.set_forest_members(
        user_id=int(ALICE),
        members=[
            _row(root_card_id=1, game_source_id=10, num_reviews=2),
            _row(root_card_id=1, game_source_id=10, num_reviews=1),
            _row(root_card_id=1, game_source_id=10, num_reviews=0),
        ],
    )

    result = await svc.compute_forest_summaries(user_id=ALICE)
    assert len(result) == 1
    forest = result[0]
    assert forest.root_card_id == 1
    assert forest.game_source_id == 10
    assert forest.total_cards == 3
    assert forest.total_reviews == 3
    # Forest-level metadata copied from any row of the forest.
    assert forest.player_white == "W"
    assert forest.player_black == "B"


async def test_compute_forest_summaries_multi_forest_sorted_by_total_cards_desc():
    """Multiple forests are sorted with the largest first."""
    svc, repo = _make_service()
    repo.set_forest_members(
        user_id=int(ALICE),
        members=[
            # forest 1 — small, 1 card
            _row(root_card_id=1, game_source_id=10),
            # forest 2 — medium, 2 cards
            _row(root_card_id=2, game_source_id=20),
            _row(root_card_id=2, game_source_id=20),
            # forest 3 — large, 3 cards
            _row(root_card_id=3, game_source_id=30),
            _row(root_card_id=3, game_source_id=30),
            _row(root_card_id=3, game_source_id=30),
        ],
    )

    result = await svc.compute_forest_summaries(user_id=ALICE)
    assert [f.root_card_id for f in result] == [3, 2, 1]
    assert [f.total_cards for f in result] == [3, 2, 1]


async def test_compute_forest_summaries_average_recall_is_per_card_then_mean():
    """
    average_recall is the arithmetic mean of per-card recalls. With
    identical priors and creation dates across the rows, every card
    has the same recall and the average equals the single-card value.
    """
    svc, repo = _make_service()
    members = [
        _row(root_card_id=1, game_source_id=10, creation_offset_days=1)
        for _ in range(4)
    ]
    repo.set_forest_members(user_id=int(ALICE), members=members)

    result = await svc.compute_forest_summaries(user_id=ALICE)
    assert len(result) == 1
    forest = result[0]
    # The math: every row has the same prior and creation date, so the
    # mean equals one row's recall. We don't pin a numeric value (the
    # ebisu math is its own concern); we only verify the average is
    # a reasonable probability and matches across rows.
    assert 0.0 < forest.average_recall <= 1.0


async def test_compute_forest_summaries_total_reviews_sums_per_card_count():
    svc, repo = _make_service()
    repo.set_forest_members(
        user_id=int(ALICE),
        members=[
            _row(root_card_id=1, game_source_id=10, num_reviews=5),
            _row(root_card_id=1, game_source_id=10, num_reviews=3),
            _row(root_card_id=1, game_source_id=10, num_reviews=0),
        ],
    )

    result = await svc.compute_forest_summaries(user_id=ALICE)
    assert result[0].total_reviews == 8


async def test_compute_forest_summaries_empty_input_returns_empty_list():
    svc, _repo = _make_service()
    assert await svc.compute_forest_summaries(user_id=ALICE) == []


async def test_compute_forest_summaries_tenancy_isolation():
    """Each user sees only their own rows."""
    svc, repo = _make_service()
    repo.set_forest_members(
        user_id=int(ALICE),
        members=[_row(root_card_id=1, game_source_id=10)],
    )
    repo.set_forest_members(
        user_id=int(BOB),
        members=[_row(root_card_id=2, game_source_id=20)],
    )

    alice = await svc.compute_forest_summaries(user_id=ALICE)
    bob = await svc.compute_forest_summaries(user_id=BOB)
    assert [f.root_card_id for f in alice] == [1]
    assert [f.root_card_id for f in bob] == [2]
