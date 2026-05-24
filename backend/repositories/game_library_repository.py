"""
repositories/game_library_repository.py

GameLibraryRepository — SQLAlchemy 2.0 async adapter implementing
``GameLibraryRepositoryPort``.

The library shares the ``game_source`` table with the existing
card-mint flow; this adapter adds the library-specific operations
(batch import with per-row SAVEPOINT isolation, paginated list
with sort + filter + total count, single-game detail, delete)
without duplicating the table.

Two design choices worth naming:

- **SAVEPOINT-per-file** during ``import_games``: each per-row
  write is wrapped in ``session.begin_nested()`` so one malformed
  or constraint-violating SGF doesn't abort the surrounding
  transaction. Successful files in the same batch survive.

- **Column projection** on ``list_games``: ``raw_content`` is
  explicitly omitted from the SELECT list. At ~2 KB/row the body
  dwarfs the metadata; the list endpoint stays ~15 KB/page
  instead of ~200 KB/page. The detail endpoint ships
  ``raw_content`` one row at a time when actually needed.

License: Public Domain (The Unlicense)
"""
import logging
from collections import Counter
from uuid import uuid4

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import game_source, normalized_position
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
)
from repositories.ports import GameLibraryRepositoryPort

logger = logging.getLogger(__name__)


# Whitelisted sort columns → SQLAlchemy column objects. Maps the
# closed Literal vocabulary to its SQL handle. The Port-level
# validation already guarantees ``sort`` is in this set; the lookup
# is straightforward.
_SORT_COLUMNS = {
    "created_at":   game_source.c.created_at,
    "date":         game_source.c.date,
    "player_white": game_source.c.player_white,
    "player_black": game_source.c.player_black,
    "result":       game_source.c.result,
    "ruleset":      game_source.c.ruleset,
    "board_size":   game_source.c.board_size,
}


class GameLibraryRepository(GameLibraryRepositoryPort):
    """
    Concrete adapter. Constructor takes only the session — same
    pattern as ``CardRepository``. No commits inside; the route
    owns the transaction boundary via ``async with db.begin():``.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    # ─── import ─────────────────────────────────────────────────────────

    async def import_games(
        self,
        *,
        user_id: UserId,
        requests: list[GameLibraryImportRequest],
    ) -> list[ImportOutcome]:
        outcomes: list[ImportOutcome] = []
        for req in requests:
            try:
                async with self.session.begin_nested():
                    outcome = await self._import_one(user_id=user_id, req=req)
                outcomes.append(outcome)
            except Exception as exc:  # noqa: BLE001 — per-file SAVEPOINT isolation
                logger.warning(
                    "game library import: per-file write failed "
                    "user_id=%s content_hash=%s error=%s",
                    user_id, req.content_hash.hex()[:16], exc,
                )
                outcomes.append(ImportOutcomeErrored(error=str(exc)))
        return outcomes

    async def _import_one(
        self,
        *,
        user_id: UserId,
        req: GameLibraryImportRequest,
    ) -> ImportOutcome:
        """Per-file body, run inside a SAVEPOINT by the caller."""
        position_id = await self._get_or_create_position(
            canonical_content=req.canonical_content,
            content_hash=req.content_hash,
        )

        # Per-user dedup on (user_id, position_id). Hit → return the
        # existing row's id and client_game_id (which may be NULL for
        # legacy rows). First-mint-wins per the design note.
        existing = await self.session.execute(
            select(game_source.c.id, game_source.c.client_game_id)
            .where(game_source.c.user_id == user_id)
            .where(game_source.c.position_id == position_id)
            .limit(1)
        )
        row = existing.first()
        if row is not None:
            return ImportOutcomeDeduplicated(
                game_id=row.id,
                client_game_id=row.client_game_id,
            )

        # Miss → INSERT new row with a freshly generated UUID and the
        # full typed-metadata + extras populated from the request.
        # `source_path` (if supplied by the SPA's directory upload)
        # lands inside metadata_extra under the lowercase
        # ``source_path`` key — distinguished from uppercase SGF
        # property keys (KM, HA, EV, RO, …) so the namespaces don't
        # collide as future provenance fields are added.
        extras = dict(req.metadata.extras)
        if req.source_path is not None:
            extras["source_path"] = req.source_path
        new_uuid = uuid4()
        stmt = (
            insert(game_source)
            .values(
                position_id=position_id,
                user_id=user_id,
                player_white=req.metadata.player_white,
                player_black=req.metadata.player_black,
                raw_content=req.raw_content,
                description=None,
                client_game_id=new_uuid,
                date=req.metadata.date,
                result=req.metadata.result,
                ruleset=req.metadata.ruleset,
                board_size=req.metadata.board_size,
                metadata_extra=extras or None,
            )
            .returning(game_source.c.id)
        )
        result = await self.session.execute(stmt)
        new_id = result.scalar_one()
        logger.info(
            "game library import: created row "
            "id=%s user_id=%s client_game_id=%s",
            new_id, user_id, new_uuid,
        )
        return ImportOutcomeCreated(
            game_id=new_id,
            client_game_id=new_uuid,
        )

    async def _get_or_create_position(
        self,
        *,
        canonical_content: str,
        content_hash: bytes,
    ) -> int:
        """
        Get-or-create a normalized_position row by content_hash.

        Mirrors ``CardRepository.get_or_create_position`` — same
        SELECT-then-conditional-INSERT pattern, same dialect-agnostic
        race tradeoff (concurrent writers may both miss the SELECT
        and one INSERT loses to the UNIQUE constraint; acceptable
        under the current single-writer-per-tenant pattern). The
        method is duplicated here rather than imported because
        ``CardRepository`` is a sibling class and cross-class method
        calls would couple two adapters whose only shared concern
        is the table.
        """
        existing = await self.session.execute(
            select(normalized_position.c.id)
            .where(normalized_position.c.content_hash == content_hash)
        )
        pos_id = existing.scalar()
        if pos_id:
            return pos_id
        stmt = (
            insert(normalized_position)
            .values(
                content_hash=content_hash,
                canonical_content=canonical_content,
            )
            .returning(normalized_position.c.id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    # ─── list ───────────────────────────────────────────────────────────

    async def list_games(
        self,
        *,
        user_id: UserId,
        sort: GameListSort,
        direction: GameListSortDirection,
        filt: GameListFilter,
        offset: int,
        limit: int,
    ) -> tuple[list[LibraryGameListItem], int]:
        sort_col = _SORT_COLUMNS[sort]
        order_clause = (
            (sort_col.asc(), game_source.c.id.asc())
            if direction == "asc"
            else (sort_col.desc(), game_source.c.id.desc())
        )

        # Compose filter predicates conditionally; absent predicates
        # don't contribute a WHERE term. Tenancy filter is always
        # present.
        where_terms = [game_source.c.user_id == user_id]
        if filt.player_white_like is not None:
            where_terms.append(
                game_source.c.player_white.like(f"%{filt.player_white_like}%")
            )
        if filt.player_black_like is not None:
            where_terms.append(
                game_source.c.player_black.like(f"%{filt.player_black_like}%")
            )
        if filt.date_from is not None:
            where_terms.append(game_source.c.date >= filt.date_from)
        if filt.date_to is not None:
            where_terms.append(game_source.c.date <= filt.date_to)
        if filt.result_eq is not None:
            where_terms.append(game_source.c.result == filt.result_eq)
        if filt.ruleset_eq is not None:
            where_terms.append(game_source.c.ruleset == filt.ruleset_eq)
        if filt.board_size_eq is not None:
            where_terms.append(game_source.c.board_size == filt.board_size_eq)

        # Page query — projected columns exclude raw_content.
        page_stmt = (
            select(
                game_source.c.id,
                game_source.c.client_game_id,
                game_source.c.player_white,
                game_source.c.player_black,
                game_source.c.date,
                game_source.c.result,
                game_source.c.ruleset,
                game_source.c.board_size,
                game_source.c.created_at,
            )
            .where(*where_terms)
            .order_by(*order_clause)
            .offset(offset)
            .limit(limit)
        )
        page_result = await self.session.execute(page_stmt)
        rows = [
            LibraryGameListItem(
                id=row.id,
                client_game_id=row.client_game_id,
                player_white=row.player_white,
                player_black=row.player_black,
                date=row.date,
                result=row.result,
                ruleset=row.ruleset,
                board_size=row.board_size,
                created_at=row.created_at,
            )
            for row in page_result.all()
        ]

        # Total count under the same WHERE; the SPA's virtual-scroll
        # height depends on this.
        count_stmt = select(func.count()).select_from(game_source).where(*where_terms)
        total = (await self.session.execute(count_stmt)).scalar_one()

        return rows, total

    # ─── detail ─────────────────────────────────────────────────────────

    async def get_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> LibraryGame | None:
        stmt = (
            select(
                game_source.c.id,
                game_source.c.client_game_id,
                game_source.c.player_white,
                game_source.c.player_black,
                game_source.c.date,
                game_source.c.result,
                game_source.c.ruleset,
                game_source.c.board_size,
                game_source.c.metadata_extra,
                game_source.c.created_at,
                game_source.c.raw_content,
            )
            .where(game_source.c.id == game_id)
            .where(game_source.c.user_id == user_id)
            .limit(1)
        )
        row = (await self.session.execute(stmt)).first()
        if row is None:
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
            metadata_extra=row.metadata_extra or {},
            created_at=row.created_at,
            raw_content=row.raw_content or "",
        )

    # ─── delete ─────────────────────────────────────────────────────────

    async def delete_game(
        self,
        *,
        user_id: UserId,
        game_id: int,
    ) -> bool:
        stmt = (
            delete(game_source)
            .where(game_source.c.id == game_id)
            .where(game_source.c.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        return (result.rowcount or 0) > 0

    # ─── players ────────────────────────────────────────────────────────

    async def list_players(
        self,
        *,
        user_id: UserId,
    ) -> list[str]:
        # Two grouped counts merged in Python. A single SQL UNION ALL
        # subquery with a GROUP BY in the outer scope would be marginally
        # more efficient but harder to read; at hobby scale (~thousands
        # of distinct names) the two indexed group-bys plus a Counter
        # merge are sub-millisecond. The covering indexes
        # `ix_game_source_user_player_white_id` and
        # `ix_game_source_user_player_black_id` make each subquery an
        # index range scan with no table access for grouping.
        async def _grouped(col):
            stmt = (
                select(col, func.count())
                .where(game_source.c.user_id == user_id)
                .where(col.isnot(None))
                .where(col != "")
                .group_by(col)
            )
            return (await self.session.execute(stmt)).all()

        counter: Counter[str] = Counter()
        for name, cnt in await _grouped(game_source.c.player_white):
            counter[name] += cnt
        for name, cnt in await _grouped(game_source.c.player_black):
            counter[name] += cnt

        # Descending by count, alphabetical on ties for determinism.
        return [
            name for name, _ in
            sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
