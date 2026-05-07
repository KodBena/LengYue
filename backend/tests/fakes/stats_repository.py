"""
tests/fakes/stats_repository.py

In-memory fake for ``StatsRepositoryPort``. The two methods return
domain DTOs (``TagStat`` and ``ForestMemberRow``) that the test
pre-loads via ``set_tag_usage`` and ``set_forest_members``.

The fake honors tenancy: each user has its own pre-loaded slice of
results, so a test exercising the cross-tenant invariant gets honest
behaviour.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import Dict, List

from domain.auth import UserId
from domain.stats import ForestMemberRow
from schemas.stats import TagStat


class FakeStatsRepository:
    """
    Structural match for ``StatsRepositoryPort``.

    Test usage::

        repo = FakeStatsRepository()
        repo.set_tag_usage(user_id=1, tags=[
            TagStat(name="attack", count=3),
            TagStat(name="endgame", count=1),
        ])
        repo.set_forest_members(user_id=1, members=[...])
    """

    def __init__(self) -> None:
        self._tag_usage: Dict[int, List[TagStat]] = {}
        self._forest_members: Dict[int, List[ForestMemberRow]] = {}

    def set_tag_usage(self, *, user_id: int, tags: List[TagStat]) -> None:
        self._tag_usage[user_id] = list(tags)

    def set_forest_members(
        self, *, user_id: int, members: List[ForestMemberRow]
    ) -> None:
        self._forest_members[user_id] = list(members)

    async def fetch_tag_usage(self, *, user_id: UserId) -> List[TagStat]:
        return list(self._tag_usage.get(int(user_id), []))

    async def fetch_forest_members(
        self, *, user_id: UserId
    ) -> List[ForestMemberRow]:
        return list(self._forest_members.get(int(user_id), []))
