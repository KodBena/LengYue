"""
api/routes/positions.py

Positions route — the stateless position-hashing endpoints.

Two endpoints:
    POST /positions/hash       — normalize one raw domain content and
                                  return its content hash. No persistence.
    POST /positions/hash-batch — the same computation over N items in
                                  one round trip. No persistence.

Card-position-annotations Stage A (see the ratified design at
``.claude/dispatch-reports/card-position-annotations-design.md``, §1
dispatch flag #2). The endpoint exists so the SPA can ask "what
content hash would minting this content produce" *before* minting —
the mint-dialog duplicate-warning flow (Stage A) and the tree-node
annotation markers (Stage B, §5) both need this without creating a
card or a normalized_position row.

Deliberately thin: calls ``PositionNormalizerPort.normalize()``
directly, the same Port ``CardService.create_card`` depends on, so
the hash this endpoint returns for a given ``raw_content`` is
guaranteed to match the hash a subsequent mint of that same content
would produce (one identity, one home — the design's §1 conclusion).
No ``CardService`` involvement, no ``normalized_position`` write, no
``user_id`` threaded into the Port call: normalization is a pure
function of ``raw_content`` alone, so there is nothing tenant-scoped
about the computation itself (ADR-0003 Band 1 — same classification
Stage A gave the single-item endpoint; the batch endpoint computes
the identical pure function N times, so it inherits the same band).

Auth: both routes still depend on ``get_current_user_id`` (unlike
``/resources``, which is genuinely public deployment data) — this is
a per-session SPA utility with no reason to diverge from the rest of
the authenticated card surface, even though the returned value(s)
don't vary by caller. The `user_id` isn't otherwise used.

License: Public Domain (The Unlicense)
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id, get_position_normalizer
from core.config import config
from domain.auth import UserId
from domain.errors import PositionHashBatchTooLargeError
from domain.normalizer import PositionNormalizerPort
from schemas.positions import (
    PositionHashBatchRequest,
    PositionHashBatchResponse,
    PositionHashRequest,
    PositionHashResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/positions", tags=["positions"])


@router.post("/hash", response_model=PositionHashResponse)
async def hash_position(
    request: PositionHashRequest,
    normalizer: PositionNormalizerPort = Depends(get_position_normalizer),
    user_id: UserId = Depends(get_current_user_id),  # noqa: ARG001 — auth-only, see module docstring.
) -> PositionHashResponse:
    """
    Normalize ``raw_content`` and return its content hash.

    Raises:
        422 (via InvalidInputError-shaped translation): the
        normalizer rejects the raw content as malformed — mirrors
        the same ``ValueError`` → 422 translation
        ``CardService.create_card`` performs (services/card_service.py),
        so a caller sees the identical failure mode whether the
        malformed content is submitted here or to ``POST /cards/``.
    """
    try:
        normalized = normalizer.normalize(request.raw_content)
    except ValueError as e:
        raise HTTPException(
            status_code=422, detail=f"Could not normalize position: {e}"
        )
    return PositionHashResponse(content_hash=normalized.content_hash.hex())


@router.post("/hash-batch", response_model=PositionHashBatchResponse)
async def hash_position_batch(
    request: PositionHashBatchRequest,
    normalizer: PositionNormalizerPort = Depends(get_position_normalizer),
    user_id: UserId = Depends(get_current_user_id),  # noqa: ARG001 — auth-only, see module docstring.
) -> PositionHashBatchResponse:
    """
    Normalize each of ``raw_contents`` and return their content
    hashes, index-aligned. Card-position-annotations Stage B (§5 of
    the ratified design) — lets the SPA's game-tree viewer hash every
    currently-rendered node in one round trip instead of one
    ``POST /positions/hash`` call per node.

    Each item is normalized independently via the identical
    ``normalizer.normalize()`` call ``hash_position`` (the single-item
    sibling above) and ``CardService.create_card`` both use — the
    result for ``raw_contents[i]`` here is byte-for-byte the same hash
    a single-item call on that same content would produce.

    Raises:
        413 (``PositionHashBatchTooLargeError``): ``len(raw_contents)``
        exceeds ``config.POSITIONS_HASH_BATCH_MAX``. Detail body:
        ``{kind: "position_hash_batch_too_large", detail, received,
        maximum}`` — same shape as the library-import batch cap
        (``api/routes/library.py``).
        422 (via InvalidInputError-shaped translation): ANY item in
        ``raw_contents`` fails to normalize — the whole batch fails
        rather than returning a partial/sparse result, so a caller
        never has to reconcile "which index is missing" (ADR-0002:
        an ambiguous partial success is a worse failure mode than a
        loud whole-batch rejection). The error message names the
        first-failing index. Callers that need per-item fault
        isolation submit items individually via the single endpoint.
    """
    if len(request.raw_contents) > config.POSITIONS_HASH_BATCH_MAX:
        err = PositionHashBatchTooLargeError(
            received=len(request.raw_contents),
            maximum=config.POSITIONS_HASH_BATCH_MAX,
        )
        raise HTTPException(
            status_code=413,
            detail={
                "kind": "position_hash_batch_too_large",
                "detail": str(err),
                "received": err.received,
                "maximum": err.maximum,
            },
        )

    hashes: list[str] = []
    for index, raw_content in enumerate(request.raw_contents):
        try:
            normalized = normalizer.normalize(raw_content)
        except ValueError as e:
            raise HTTPException(
                status_code=422,
                detail=f"Could not normalize position at index {index}: {e}",
            )
        hashes.append(normalized.content_hash.hex())
    return PositionHashBatchResponse(content_hashes=hashes)
