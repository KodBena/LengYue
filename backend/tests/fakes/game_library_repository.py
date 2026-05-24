"""
tests/fakes/game_library_repository.py

In-memory fake for ``GameLibraryRepositoryPort``. State is keyed by
``(user_id, game_id)``; a parallel content_hash index supports the
per-user dedup contract.

The fake reproduces the production adapter's contract:

  - ``import_games`` processes per-request with per-row failure
    isolation — a configurable ``_raise_on`` map lets a test exercise
    the SAVEPOINT path without actually using SAVEPOINTs.
  - Per-user dedup via ``(user_id, content_hash)`` mirrors the
    adapter's ``(user_id, position_id)`` SELECT.
  - ``list_games`` honors filter predicates, sort + direction with
    ``id`` as the deterministic tiebreaker, and offset + limit.
    Returns ``(rows, total_count)``.
  - ``get_game`` returns ``None`` for cross-tenant or missing.
  - ``delete_game`` returns ``False`` for cross-tenant or missing.

The fake does not exercise SAVEPOINT semantics (no session to
roll back). The adapter integration tests cover SAVEPOINT
isolation directly.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from domain.auth import UserId
from domain.game_library import (
    GameLibraryImportRequest,
    GameListFilter,
    GameListSort,
    GameListSortDirection,
    ImportOutcome,
    ImportOutcomeCreated,
    ImportOutcomeDeduplicated,
    ImportOutcomeErrored,
    LibraryGame,
    LibraryGameListItem,
    PlayerCount,
)


@dataclass
class _Row:
    """One in-memory game_source row."""
    id: int
    user_id: int
    content_hash: bytes
    client_game_id: Optional[UUID]
    player_white: Optional[str]
    player_black: Optional[str]
    raw_content: str
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    metadata_extra: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class FakeGameLibraryRepository:
    """
    Structural match for ``GameLibraryRepositoryPort``.

    Test-facing helpers:

    - ``seed_row(...)``: pre-populate a row directly (for list /
      detail / delete tests that don't need import).
    - ``_raise_on[content_hash] = exc``: when ``import_games``
      processes a request with that content_hash, raise the given
      exception inside the SAVEPOINT region — the outcome surfaces
      as ``ImportOutcomeErrored``.
    """

    def __init__(self) -> None:
        self._rows: Dict[int, _Row] = {}
        self._next_id: int = 1
        self._raise_on: Dict[bytes, Exception] = {}

    # ─── Test-facing seeding helpers ────────────────────────────────

    def seed_row(
        self,
        *,
        user_id: UserId,
        content_hash: bytes = b"\x00" * 32,
        player_white: Optional[str] = None,
        player_black: Optional[str] = None,
        date: Optional[str] = None,
        result: Optional[str] = None,
        ruleset: Optional[str] = None,
        board_size: Optional[int] = None,
        raw_content: str = "(;FF[4])",
        metadata_extra: Optional[Dict[str, Any]] = None,
        client_game_id: Optional[UUID] = None,
        created_at: Optional[datetime] = None,
    ) -> int:
        """Pre-populate a row. Returns the assigned id."""
        row_id = self._next_id
        self._next_id += 1
        self._rows[row_id] = _Row(
            id=row_id,
            user_id=int(user_id),
            content_hash=content_hash,
            client_game_id=client_game_id if client_game_id is not None else uuid4(),
            player_white=player_white,
            player_black=player_black,
            raw_content=raw_content,
            date=date,
            result=result,
            ruleset=ruleset,
            board_size=board_size,
            metadata_extra=metadata_extra or {},
            created_at=created_at or datetime.now(timezone.utc),
        )
        return row_id

    def raise_on(self, content_hash: bytes, exc: Exception) -> None:
        """Wire the SAVEPOINT-error path for a specific content_hash."""
        self._raise_on[content_hash] = exc

    # ─── Port methods ────────────────────────────────────────────────

    async def import_games(
        self,
        *,
        user_id: UserId,
        requests: List[GameLibraryImportRequest],
    ) -> List[ImportOutcome]:
        outcomes: List[ImportOutcome] = []
        for req in requests:
            try:
                outcomes.append(await self._import_one(user_id, req))
            except Exception as exc:  # noqa: BLE001 — matches adapter contract
                outcomes.append(ImportOutcomeErrored(error=str(exc)))
        return outcomes

    async def _import_one(
        self,
        user_id: UserId,
        req: GameLibraryImportRequest,
    ) -> ImportOutcome:
        # Per-test SAVEPOINT-error injection.
        if req.content_hash in self._raise_on:
            raise self._raise_on[req.content_hash]

        # Dedup on (user_id, content_hash).
        for row in self._rows.values():
            if row.user_id == int(user_id) and row.content_hash == req.content_hash:
                return ImportOutcomeDeduplicated(
                    game_id=row.id,
                    client_game_id=row.client_game_id,
                )

        row_id = self._next_id
        self._next_id += 1
        new_uuid = uuid4()
        extras = dict(req.metadata.extras)
        if req.source_path is not None:
            extras["source_path"] = req.source_path
        self._rows[row_id] = _Row(
            id=row_id,
            user_id=int(user_id),
            content_hash=req.content_hash,
            client_game_id=new_uuid,
            player_white=req.metadata.player_white,
            player_black=req.metadata.player_black,
            raw_content=req.raw_content,
            date=req.metadata.date,
            result=req.metadata.result,
            ruleset=req.metadata.ruleset,
            board_size=req.metadata.board_size,
            metadata_extra=extras,
        )
        return ImportOutcomeCreated(
            game_id=row_id,
            client_game_id=new_uuid,
        )

    async def list_games(
        self,
        *,
        user_id: UserId,
        sort: GameListSort,
        direction: GameListSortDirection,
        filt: GameListFilter,
        offset: int,
        limit: int,
    ) -> Tuple[List[LibraryGameListItem], int]:
        owned = [r for r in self._rows.values() if r.user_id == int(user_id)]
        owned = [r for r in owned if _matches(r, filt)]

        # Stable secondary sort by id. Direction applies uniformly.
        # NULLs sort to the end on asc, start on desc — mirrors the
        # adapter contract.
        def key(r: _Row) -> tuple[int, Any, int]:
            v = getattr(r, sort)
            null_marker = 1 if v is None else 0
            return (null_marker, v if v is not None else "", r.id)

        owned.sort(key=key, reverse=(direction == "desc"))
        if direction == "desc":
            # When reversed, NULLs would land at the *start*; the
            # adapter contract puts them at the start on desc. With
            # reverse=True the null_marker=1 entries become "largest"
            # which after reversal land at the front — correct.
            pass

        total = len(owned)
        page = owned[offset:offset + limit]
        rows = [
            LibraryGameListItem(
                id=r.id,
                client_game_id=r.client_game_id,
                player_white=r.player_white,
                player_black=r.player_black,
                date=r.date,
                result=r.result,
                ruleset=r.ruleset,
                board_size=r.board_size,
                created_at=r.created_at,
            )
            for r in page
        ]
        return rows, total

    async def get_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> Optional[LibraryGame]:
        row = self._rows.get(game_id)
        if row is None or row.user_id != int(user_id):
            return None
        return LibraryGame(
            id=row.id,
            client_game_id=row.client_game_id,
            player_white=row.player_white,
            player_black=row.player_black,
            date=row.date,
            result=row.result,
            ruleset=row.ruleset,
            board_size=row.board_size,
            metadata_extra=row.metadata_extra,
            created_at=row.created_at,
            raw_content=row.raw_content,
        )

    async def delete_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> bool:
        row = self._rows.get(game_id)
        if row is None or row.user_id != int(user_id):
            return False
        del self._rows[game_id]
        return True

    async def list_players(
        self,
        *,
        user_id: UserId,
    ) -> List[PlayerCount]:
        owned = [r for r in self._rows.values() if r.user_id == int(user_id)]
        from collections import Counter
        counter: Counter[str] = Counter()
        for r in owned:
            for name in (r.player_white, r.player_black):
                if name:
                    counter[name] += 1
        return [
            PlayerCount(name=name, count=cnt)
            for name, cnt in
            sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
        ]


def _matches(row: _Row, filt: GameListFilter) -> bool:
    if filt.player_like is not None:
        in_white = row.player_white is not None and filt.player_like in row.player_white
        in_black = row.player_black is not None and filt.player_like in row.player_black
        if not (in_white or in_black):
            return False
    if filt.player_white_like is not None:
        if row.player_white is None or filt.player_white_like not in row.player_white:
            return False
    if filt.player_black_like is not None:
        if row.player_black is None or filt.player_black_like not in row.player_black:
            return False
    if filt.date_from is not None:
        if row.date is None or row.date < filt.date_from:
            return False
    if filt.date_to is not None:
        if row.date is None or row.date > filt.date_to:
            return False
    if filt.result_eq is not None:
        if row.result != filt.result_eq:
            return False
    if filt.ruleset_eq is not None:
        if row.ruleset != filt.ruleset_eq:
            return False
    if filt.board_size_eq is not None:
        if row.board_size != filt.board_size_eq:
            return False
    return True
