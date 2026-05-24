"""
api/routes/library.py

FastAPI router for the SGF games library — namespaced under
``/library`` so the surface name in the URL matches the
product surface name in the SPA.

Five endpoints, all under ``/library``:

    POST   /library/games/import   — batch import of raw SGFs
    GET    /library/games          — paginated list with sort + filter
    GET    /library/games/{id}     — fetch one game including raw_content
    DELETE /library/games/{id}     — delete one game (cascade-nulls card_source)
    GET    /library/players        — distinct player-name set for autocomplete

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
    GameImportInput,
    GameListFilter,
    GameListSort,
    GameListSortDirection,
    ImportOutcome,
    LibraryGame,
    LibraryGameListItem,
    PlayerCount,
)
from services.game_library_service import GameLibraryService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library", tags=["library"])


# ─── Request / Response wire shapes ───────────────────────────────────


class ImportGameItem(BaseModel):
    """
    One SGF in a batch import request.

    ``source_path`` is an optional provenance field: the SPA's
    directory-upload UX populates it from
    ``File.webkitRelativePath`` so the user's on-disk organisation
    (e.g., ``sgf_db/1980/1980-09-24.sgf``) survives into
    ``metadata_extra["source_path"]``. Single-file uploads, curl
    clients, and existing scripts can omit the field — the
    backend stores nothing for it then.
    """
    model_config = ConfigDict(frozen=True)
    raw_content: str
    source_path: Optional[str] = None


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


class ListPlayersResponse(BaseModel):
    """
    Distinct-player-names + game-count response.

    Each entry pairs a player's name with the number of games it
    appears in (either colour) across the caller's library. The
    list is the deduplicated union of ``player_white`` and
    ``player_black`` values, ordered by descending frequency so
    common players surface first in both the autocomplete dropdown
    and the SPA's two-column player accordion. The SPA fetches
    once on Library tab mount and re-fetches after an import
    completes.
    """
    model_config = ConfigDict(frozen=True)
    players: List[PlayerCount]


# ─── Routes ───────────────────────────────────────────────────────────


@router.post(
    "/games/import",
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
    inputs = [
        GameImportInput(
            raw_content=item.raw_content,
            source_path=item.source_path,
        )
        for item in body.games
    ]
    try:
        async with db.begin():
            outcomes = await service.import_games(
                user_id=user_id,
                inputs=inputs,
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


@router.get("/games", response_model=ListGamesResponse)
async def list_games(
    sort: GameListSort = Query(
        default="created_at",
        description="Column to sort by. Must be in the closed vocabulary.",
    ),
    direction: GameListSortDirection = Query(
        default="desc",
        description="Sort direction.",
    ),
    player_like: Optional[str] = Query(
        default=None,
        description=(
            "Substring match against player_white OR player_black — "
            "any-color player filter. Composes (AND) with the "
            "per-color predicates below."
        ),
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
    ``GET /library/games/{id}`` when needed.
    """
    filt = GameListFilter(
        player_like=player_like,
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


@router.get("/games/{game_id}", response_model=LibraryGame)
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


@router.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
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


@router.get("/players", response_model=ListPlayersResponse)
async def list_players(
    service: GameLibraryService = Depends(get_game_library_service),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Distinct player-name set for the caller's library, ordered by
    descending frequency.

    The SPA fetches this once on Library-tab mount, caches in memory
    (not in the persisted workspace document), and runs autocomplete
    against the in-memory list as the user types into the
    player_white / player_black filter inputs. Re-fetch after an
    import completes.

    Combined (white + black) rather than per-color: the slight
    imprecision — suggesting a name that's only ever been black for
    the player_white filter input — is cosmetic, and the
    implementation is trivially simpler. Cardinality at typical
    library size (~thousands of distinct names) makes the full list
    cheap to ship in one go.
    """
    players = await service.list_players(user_id=user_id)
    return ListPlayersResponse(players=players)
