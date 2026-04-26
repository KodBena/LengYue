import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import (
    get_card_repo,
    get_card_service,
    get_current_user_id,
    get_db,
    get_review_service,
)
from core.config import config
from domain.auth import UserId
from domain.card import CardWithRecall, project_card
from domain.errors import InvalidInputError, NotFoundError
from repositories.ports import CardRepositoryPort
from schemas.card import (
    CardCreate,
    CardCreateResponse,
    ReviewRequest,
)
from services.card_service import CardService
from services.review_service import ReviewService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("/{card_id}", response_model=CardWithRecall)
async def get_card(
    card_id: int,
    repo: CardRepositoryPort = Depends(get_card_repo),
    user_id: UserId = Depends(get_current_user_id),  # Item 13 (active).
):
    # Item 30a: the route is the assembly point between the domain
    # entity (what the repository produces) and the wire shape (what
    # the client receives). The repository returns Card; we project it
    # here into CardWithRecall using the pure domain function. `now`
    # is captured at response-assembly time (the correct semantic —
    # current_recall should reflect the instant the client receives it).
    #
    # Item 13 (tenancy): user_id flows from the JWT decode through to
    # the repository's WHERE clause. Cards belonging to other tenants
    # return None from the repo, which the route maps to 404. The
    # 404-not-403 boundary is preserved by collapsing "doesn't exist"
    # and "not yours" into the same response code.
    card = await repo.get_card_by_id(card_id, user_id=user_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return project_card(
        card,
        now=datetime.now(timezone.utc),
        time_unit_seconds=config.EBISU_TIME_UNIT,
    )


@router.post("/{card_id}/review", response_model=CardWithRecall)
async def submit_review(
    card_id: int,
    request: ReviewRequest,
    service: ReviewService = Depends(get_review_service),
    user_id: UserId = Depends(get_current_user_id),  # Item 13 (active).
):
    # ReviewService.process_review returns CardWithRecall directly
    # (it already has time_unit_seconds in its constructor, so it does
    # its own projection after the update — see item 30a).
    #
    # Item 13: user_id is forwarded to the service, which threads it
    # through all three Port calls (initial fetch, update, re-fetch).
    try:
        return await service.process_review(card_id, request, user_id=user_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        # Anything that reaches here is genuinely unexpected (a bug, an
        # OperationalError, etc.). Log the full traceback to stderr for
        # the operator; return an opaque message to the client so we
        # don't leak server internals. Item 21a.
        logger.exception(
            "Unhandled exception in submit_review (card_id=%s)", card_id
        )
        raise HTTPException(status_code=500, detail="Internal mathematical error")


@router.post("/", response_model=CardCreateResponse, status_code=201)
async def create_new_card(
    data: CardCreate,
    service: CardService = Depends(get_card_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),  # Tenancy stamp: item 14.
):
    # Item 30b: CardService is now Port-pure and does not commit. The
    # route owns the transaction boundary via `async with db.begin():`
    # — commit on successful exit, rollback on any exception. FastAPI's
    # dependency caching guarantees that `db` and the session held by
    # `service.repository` are the same session, so all six
    # persistence steps commit atomically.
    #
    # FastAPI resolves `service` and `db` independently but both
    # ultimately depend on `get_db`, which FastAPI caches per-request.
    # The tempting redundancy ("why do I need both `service` and `db`?")
    # is the price of keeping the service free of transaction
    # concerns — the alternative is leaking transaction semantics
    # into a Port or introducing a UoW abstraction, both of which
    # are larger commitments than this one-line boundary.
    #
    # Item 13 only widened the read-path Port signatures; the write
    # path (CardService.create_card) already takes user_id and stamps
    # it on the new card's row. Item 14 will add a parent-ownership
    # check for parent_card_id submissions.
    try:
        async with db.begin():
            card_id = await service.create_card(data, user_id=user_id)
        return CardCreateResponse(status="created", card_id=card_id)
    except NotFoundError as e:
        # Item 14: CardService.create_card raises CardNotFoundError
        # (a NotFoundError) when parent_card_id refers to a card the
        # caller doesn't own. Same 404-not-403 collapse as get_card —
        # the user cannot distinguish "no such parent" from "not your
        # parent" from the response.
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        # Legacy raw ValueError path. CardService.create_card now wraps
        # the normalizer's ValueError in InvalidInputError (item 30b),
        # so this branch is effectively dead for the create-card flow —
        # preserved defensively in case any other code path underneath
        # the service still raises raw ValueError.
        raise HTTPException(status_code=400, detail=str(e))
