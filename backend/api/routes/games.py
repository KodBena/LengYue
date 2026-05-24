"""
api/routes/games.py

FastAPI router for the SGF games library.

Four endpoints, all under ``/games``:

    POST   /games/import   — batch import of raw SGFs
    GET    /games          — paginated list with sort + filter
    GET    /games/{id}     — fetch one game including raw_content
    DELETE /games/{id}     — delete one game (cascade-nulls card_source)

Wire-shape contract is recorded in ``docs/notes/sgf-library-plan.md``
and (post-ship) at ``docs/dispatch/backend-to-frontend-sgf-library-status.md``.

Pydantic request/response schemas live at the top of this file
per backend CLAUDE.md (inline at the route until a second consumer
appears). The list-response and detail-response shapes are
structurally identical to the domain ``LibraryGameListItem`` /
``LibraryGame`` value objects, so those are reused directly as
``response_model``; the OpenAPI emit is the same.

License: Public Domain (The Unlicense)
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import (
    get_current_user_id,
    get_db,
    get_game_library_service,
)
from domain.auth import UserId
from domain.errors import BatchTooLargeError
from domain.game_library import (
    GameListFilter,
    GameListSort,
    GameListSortDirection,
    ImportOutcome,
    LibraryGame,
    LibraryGameListItem,
)
from services.game_library_service import GameLibraryService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["games"])


# ─── Request / Response wire shapes ───────────────────────────────────


class ImportGameItem(BaseModel):
    """One SGF in a batch import request."""
    model_config = ConfigDict(frozen=True)
    raw_content: str


class ImportGamesRequest(BaseModel):
    """Batch import request body."""
    model_config = ConfigDict(frozen=True)
    games: List[ImportGameItem]


class ImportGamesResponse(BaseModel):
    """
    Batch import response — per-file outcomes in input order.

    Each entry is one of:
      - ``{"status": "created", "game_id": N, "client_game_id": "..."}}``
      - ``{"status": "deduplicated", "game_id": N, "client_game_id": "..."|null}}``
      - ``{"status": "errored", "error": "..."}``
    """
    model_config = ConfigDict(frozen=True)
    outcomes: List[ImportOutcome]


class ListGamesResponse(BaseModel):
    """Paginated list response."""
    model_config = ConfigDict(frozen=True)
    rows: List[LibraryGameListItem]
    total_count: int


# ─── Routes ───────────────────────────────────────────────────────────


@router.post(
    "/import",
    response_model=ImportGamesResponse,
    status_code=status.HTTP_200_OK,
)
async def import_games(
    body: ImportGamesRequest,
    service: GameLibraryService = Depends(get_game_library_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Batch import of SGFs into the caller's games library.

    Per-file outcomes (``created`` / ``deduplicated`` / ``errored``)
    return in input order, regardless of mix — one malformed SGF in
    the batch does not fail the batch (the adapter wraps each row in
    a SAVEPOINT).

    Failure paths surfaced as HTTP errors:

    - 413 ``batch_too_large``: ``len(games)`` exceeds the configured
      per-request cap (``SGF_LIBRARY_IMPORT_BATCH_MAX``). Clients
      with larger collections chunk client-side.
    - 422: malformed request body (Pydantic validation).
    """
    raws = [item.raw_content for item in body.games]
    try:
        async with db.begin():
            outcomes = await service.import_games(
                user_id=user_id,
                raw_contents=raws,
            )
    except BatchTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "kind": "batch_too_large",
                "detail": str(e),
                "received": e.received,
                "maximum": e.maximum,
            },
        )
    return ImportGamesResponse(outcomes=outcomes)


@router.get("", response_model=ListGamesResponse)
async def list_games(
    sort: GameListSort = Query(
        default="created_at",
        description="Column to sort by. Must be in the closed vocabulary.",
    ),
    direction: GameListSortDirection = Query(
        default="desc",
        description="Sort direction.",
    ),
    player_white_like: Optional[str] = Query(default=None),
    player_black_like: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    result_eq: Optional[str] = Query(default=None),
    ruleset_eq: Optional[str] = Query(default=None),
    board_size_eq: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1),
    service: GameLibraryService = Depends(get_game_library_service),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Paginated list of the caller's library games plus the total
    match count under the same filter.

    Sort column is validated against the closed Literal vocabulary
    by FastAPI's Pydantic gateway (invalid values → 422); the
    service layer asserts pagination bounds defensively. ``limit``
    is capped at ``SGF_LIBRARY_LIST_LIMIT_MAX`` (currently 500).

    ``raw_content`` is omitted from list rows — fetch via
    ``GET /games/{id}`` when needed.
    """
    filt = GameListFilter(
        player_white_like=player_white_like,
        player_black_like=player_black_like,
        date_from=date_from,
        date_to=date_to,
        result_eq=result_eq,
        ruleset_eq=ruleset_eq,
        board_size_eq=board_size_eq,
    )
    try:
        rows, total = await service.list_games(
            user_id=user_id,
            sort=sort,
            direction=direction,
            filt=filt,
            offset=offset,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    return ListGamesResponse(rows=rows, total_count=total)


@router.get("/{game_id}", response_model=LibraryGame)
async def get_game(
    game_id: int,
    service: GameLibraryService = Depends(get_game_library_service),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Fetch one library game by id, including ``raw_content``.

    404 if no row exists OR if it exists but belongs to a different
    tenant (404-not-403 invariant).
    """
    game = await service.get_game(user_id=user_id, game_id=game_id)
    if game is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library game not found",
        )
    return game


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_game(
    game_id: int,
    service: GameLibraryService = Depends(get_game_library_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Delete one library game by id.

    Cascade behaviour on dependent ``card_source`` rows is
    ``ON DELETE SET NULL`` (the existing schema clause): cards
    minted from this game survive the delete with their
    ``game_source_id`` nulled out. Cards retain their position via
    ``normalized_position_id``; they just lose the source link.

    404 if no row exists OR if it belongs to a different tenant —
    the 404-not-403 invariant preserved with the service's boolean
    return.
    """
    async with db.begin():
        deleted = await service.delete_game(user_id=user_id, game_id=game_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library game not found",
        )
