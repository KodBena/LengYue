"""
api/routes/positions.py

Positions route — the stateless position-hashing endpoint.

One endpoint:
    POST /positions/hash — normalize raw domain content and return
    only the resulting content hash. No persistence.

Card-position-annotations Stage A (see the ratified design at
``.claude/dispatch-reports/card-position-annotations-design.md``, §1
dispatch flag #2). The endpoint exists so the SPA can ask "what
content hash would minting this content produce" *before* minting —
the mint-dialog duplicate-warning flow (Stage A) and, later, the
tree-node annotation markers (Stage B) both need this without
creating a card or a normalized_position row.

Deliberately thin: calls ``PositionNormalizerPort.normalize()``
directly, the same Port ``CardService.create_card`` depends on, so
the hash this endpoint returns for a given ``raw_content`` is
guaranteed to match the hash a subsequent mint of that same content
would produce (one identity, one home — the design's §1 conclusion).
No ``CardService`` involvement, no ``normalized_position`` write, no
``user_id`` threaded into the Port call: normalization is a pure
function of ``raw_content`` alone, so there is nothing tenant-scoped
about the computation itself.

Auth: the route still depends on ``get_current_user_id`` (unlike
``/resources``, which is genuinely public deployment data) — this is
a per-session SPA utility with no reason to diverge from the rest of
the authenticated card surface, even though the returned value
doesn't vary by caller. The `user_id` isn't otherwise used.

License: Public Domain (The Unlicense)
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id, get_position_normalizer
from domain.auth import UserId
from domain.normalizer import PositionNormalizerPort
from schemas.positions import PositionHashRequest, PositionHashResponse

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
