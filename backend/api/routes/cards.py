import logging
from datetime import datetime, timezone
from typing import List

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
from domain.errors import (
    CardBatchTooLargeError,
    InvalidInputError,
    NotFoundError,
)
from repositories.ports import CardRepositoryPort
from schemas.card import (
    CardBatchCreateRequest,
    CardBatchCreateResponse,
    CardCreate,
    CardCreateResponse,
    CardHashEntry,
    CardPatch,
    ReviewRequest,
)
from services.card_service import CardService
from services.review_service import ReviewService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("/hashes", response_model=List[CardHashEntry])
async def get_card_hashes(
    repo: CardRepositoryPort = Depends(get_card_repo),
    user_id: UserId = Depends(get_current_user_id),  # Item 13 (active).
):
    """
    Returns every ``(content_hash, card_id)`` pair for cards the
    caller owns.

    Card-position-annotations boot-time hydrate (see
    ``.claude/dispatch-reports/card-position-annotations-design.md``,
    §3 "Recommend (b)"): the SPA's `known-positions` state module
    otherwise fills only incidentally, via whichever cards navigation
    happens to fetch — leaving the game-tree known-position rings and
    the mint-dialog duplicate warning empty after a fresh SPA start
    until the user browses. This is the guaranteed-complete bulk
    fetch the design names as the fix, driven at SPA boot/login
    rather than left to incidental navigation.

    Registered ahead of ``GET /{card_id}`` in this file: Starlette's
    default path converter for an untyped ``{card_id}`` segment
    matches any non-slash string, so if this static route were
    registered *after* the parametrized one, a request to
    ``/cards/hashes`` would match ``/cards/{card_id}`` first and only
    then fail FastAPI's ``int`` coercion of ``"hashes"`` (a 422, not
    this endpoint). Route order is load-bearing here.

    Item 13 (tenancy): user_id is forwarded to the Port, which
    filters on it directly — no cross-tenant row can appear in the
    result, same 404-not-403-adjacent guarantee (there's nothing to
    404 on; an absent set is just an empty list) the rest of the
    card surface gives.
    """
    return await repo.list_content_hashes(user_id=user_id)


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
    repo: CardRepositoryPort = Depends(get_card_repo),
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
            # Per-user-id-enumeration design: insert_card already minted
            # public_id/display_ordinal at INSERT time (Decision 3); this
            # re-fetch (same session, same still-open transaction, so it
            # sees the uncommitted row) reads them back for the response
            # without widening CardWriteRepositoryPort's return contract.
            created = await repo.get_card_by_id(card_id, user_id=user_id)
        assert created is not None, (
            "just-inserted card must be readable by its own creator "
            "inside the same transaction"
        )
        return CardCreateResponse(
            status="created",
            card_id=card_id,
            public_id=created.public_id,
            display_ordinal=created.display_ordinal,
        )
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


@router.post("/batch", response_model=CardBatchCreateResponse, status_code=201)
async def create_cards_batch(
    body: CardBatchCreateRequest,
    service: CardService = Depends(get_card_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Transactional batch card mint (ratified wire contract, ledger
    rows 884/885/886).

    Registered as a static ``/batch`` path segment ahead of no
    conflicting route — unlike ``GET /cards/hashes`` (which had to
    beat an untyped ``GET /{card_id}``'s string-first matching), this
    is a POST with no sibling single-segment POST route, so ordering
    relative to ``GET /{card_id}`` doesn't matter for method dispatch.
    Kept adjacent to ``POST /`` for readability.

    Request: an ordered list of ``BatchCardItem`` (the ``CardCreate``
    field shape with ``parent_card_id`` replaced by ``parent_ref`` —
    ``null`` | ``{"card_id": ...}`` | ``{"batch_index": ...}``).
    Response: ``{"card_ids": [...]}`` in request order (201).

    Transaction boundary: the ENTIRE batch runs inside one
    ``async with db.begin():`` — matching the single-item POST /
    route's item 30b pattern, just wrapping
    ``CardService.create_cards_batch`` instead of a single
    ``create_card`` call. Any member's failure raises before the
    service call returns, so the ``async with`` block's exception
    path rolls back every row inserted for every earlier member in
    the same request — zero partial batches, per the ratified
    contract. This also rolls back every per-user display-ordinal
    counter increment the failed batch performed (the counter UPDATE
    lives inside the same transaction as the row it numbers; see
    ``repositories/display_counters.py`` and
    ``services/card_service.py``'s module docstring).

    Failure axis (mirrors the single-item route's existing mapping,
    per `domain/errors.py`'s three-axis taxonomy):
        - 413 (``CardBatchTooLargeError``): ``len(cards)`` exceeds
          ``config.CARDS_BATCH_MINT_MAX``. Structured body
          ``{kind: "cards_batch_too_large", detail, received,
          maximum}`` — same shape as the sibling batch caps
          (``BatchTooLargeError`` / ``PositionHashBatchTooLargeError``).
        - 404 (``NotFoundError``): a member's ``parent_ref`` names a
          card that doesn't exist or belongs to another tenant —
          the same 404-not-403 collapse ``POST /cards/`` gives a
          cross-tenant ``parent_card_id`` (docs/notes/tenancy.md).
          The message names the failing index.
        - 422 (``InvalidInputError``, including
          ``BatchIndexReferenceError``): a forward/self
          ``batch_index`` reference, or a member's ``raw_content``
          fails to normalize. The message names the failing index.
    """
    try:
        async with db.begin():
            card_ids = await service.create_cards_batch(
                body.cards, user_id=user_id
            )
        return CardBatchCreateResponse(card_ids=card_ids)
    except CardBatchTooLargeError as e:
        raise HTTPException(
            status_code=413,
            detail={
                "kind": "cards_batch_too_large",
                "detail": str(e),
                "received": e.received,
                "maximum": e.maximum,
            },
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/{card_id}", response_model=CardWithRecall)
async def update_card_metadata(
    card_id: int,
    patch: CardPatch,
    service: CardService = Depends(get_card_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Card-metadata inline-edit arc 2 (2026-05-13). Partial-update
    endpoint for the mutable subset recorded in
    ``docs/dispatch/backend-to-frontend-card-metadata-inline-edit-status.md``
    (Ask 2 table). The wire shape is ``CardPatch``; the response is
    ``CardWithRecall`` projected at write time so the frontend's
    inline-edit affordance can swap the cached card body via
    ``ledger.put`` without a follow-up GET.

    Transaction boundary at the route per item 30b's pattern —
    ``async with db.begin():`` commits on success, rolls back on
    any exception. The Pydantic validation already happened at
    parameter binding (a malformed patch never reaches this
    function body); the try/except below covers domain errors
    raised inside the service or adapter.

    Tenancy: ``user_id`` flows from the JWT decode through to the
    UPDATE's WHERE clause via the five-layer recipe in
    ``docs/notes/tenancy.md``. Cross-tenant ``card_id`` surfaces as
    404 via the ``CardService.update_card_metadata`` →
    ``CardNotFoundError`` translation, preserving the codebase's
    404-not-403 invariant.
    """
    try:
        async with db.begin():
            updated = await service.update_card_metadata(
                card_id, patch, user_id=user_id
            )
        return project_card(
            updated,
            now=datetime.now(timezone.utc),
            time_unit_seconds=config.EBISU_TIME_UNIT,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=422, detail=str(e))
