"""
tests/fakes/tag_filter_repository.py

In-memory fake for ``TagFilterRepositoryPort``. The real Port
materializes a tag-DSL expression into the set of card ids whose tags
satisfy the expression; the fake skips the parser and lets the test
pre-load expression → matched-id-set pairs directly.

This keeps service-level tests independent of the tag-DSL grammar's
correctness — those concerns belong in
``tests/unit/test_tag_dsl_pure.py`` and
``tests/integration/test_tag_dsl_qsl.py``.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from typing import Dict, Optional, Set

from domain.auth import UserId
from domain.errors import PipelineDSLError


class FakeTagFilterRepository:
    """
    Structural match for ``TagFilterRepositoryPort``.

    Test usage::

        repo = FakeTagFilterRepository()
        repo.preload(user_id=1, expression="attack", matches={101, 102})

    Then::

        await repo.card_ids_matching("attack", user_id=UserId(1)) == {101, 102}

    Two failure paths are surfaced:

      - ``raise_for_expression(expr)``: configure the fake to raise
        ``PipelineDSLError`` when the expression is queried (mirrors
        the production adapter's parse-time error).

      - Empty result: a query for an unloaded ``(user_id, expression)``
        returns the empty set, matching "no cards match".
    """

    def __init__(self) -> None:
        self._matches: Dict[tuple[int, str], Set[int]] = {}
        self._raises: Dict[str, str] = {}

    def preload(
        self, *, user_id: int, expression: str, matches: Set[int]
    ) -> None:
        self._matches[(user_id, expression)] = set(matches)

    def raise_for_expression(
        self, expression: str, message: str = "malformed expression"
    ) -> None:
        self._raises[expression] = message

    async def card_ids_matching(
        self, tag_expression: str, *, user_id: UserId
    ) -> Set[int]:
        if tag_expression in self._raises:
            raise PipelineDSLError(self._raises[tag_expression])
        return set(self._matches.get((int(user_id), tag_expression), set()))
