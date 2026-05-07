"""
api/routes/analysis_bundles.py

FastAPI router for the analysis-persistence arc.

Four endpoints, all under `/analysis-bundles`:

    PUT    /analysis-bundles/{board_id}    — upsert
    GET    /analysis-bundles/{board_id}    — fetch
    DELETE /analysis-bundles/{board_id}    — idempotent delete
    GET    /analysis-bundles               — per-board summaries

The wire-shape contract (request/response Pydantic models, status
codes, structured error bodies) is recorded in
docs/dispatch/backend-to-frontend-analysis-persistence-status.md.

Pydantic schemas: this router uses the domain DTOs from
`domain/analysis_bundle.py` directly as request and response
types. The auth/me precedent (inline schemas at the top of the
route) and the schemas/ directory both exist; for analysis
bundles, the domain entities and wire shapes are structurally
identical, so a separate wire-shape file would be pure
duplication. The OpenAPI emits snake_case field names; the
frontend's ACL projects to camelCase per the codebase's existing
convention.

License: Public Domain (The Unlicense)
"""
import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import (
    get_analysis_bundle_service,
    get_current_user_id,
    get_db,
)
from domain.analysis_bundle import AnalysisBundle, AnalysisBundleSummary
from domain.auth import UserId
from domain.errors import (
    BundleTooLargeError,
    UnknownSchemeError,
    UserQuotaExceededError,
)
from services.analysis_bundle_service import AnalysisBundleService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis-bundles", tags=["analysis-bundles"])


@router.put("/{board_id}", response_model=AnalysisBundleSummary)
async def upsert_analysis_bundle(
    board_id: UUID,
    bundle: AnalysisBundle,
    request: Request,
    service: AnalysisBundleService = Depends(get_analysis_bundle_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Upsert the analysis bundle stored under
    `(user_id, board_id)`. The frontend's "Save analyses" action
    is the canonical caller — one PUT replaces the whole bundle
    for that board.

    The request body's `schema_version` is gated by Pydantic's
    `Literal[1]` validator on `AnalysisBundle` (Confirmation C2's
    schemaVersion gate; a v2 bundle is a 422 against a v1-only
    backend). The two caps — per-bundle (this route's responsibility,
    via the service) and per-user (the adapter's, atomic with the
    upsert) — both raise to 413 with a structured detail body
    discriminated by `kind`.
    """
    # Capture request body size for the per-bundle cap check.
    # Content-Length is the cheap path; if the client sent chunked
    # encoding (no Content-Length header), fall back to
    # re-serialising the parsed bundle. The fallback's byte count
    # differs from the raw body by whitespace and key-ordering
    # only — bounded enough that the cap stays meaningful.
    content_length = request.headers.get("content-length")
    if content_length is not None:
        request_body_bytes = int(content_length)
    else:
        request_body_bytes = len(bundle.model_dump_json().encode("utf-8"))

    try:
        async with db.begin():
            return await service.upsert(
                board_id=board_id,
                bundle=bundle,
                request_body_bytes=request_body_bytes,
                user_id=user_id,
            )
    except BundleTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "kind": "bundle_too_large",
                "detail": str(e),
                "request_bytes": e.request_bytes,
                "cap_bytes": e.cap_bytes,
            },
        )
    except UserQuotaExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "kind": "user_quota_exceeded",
                "detail": str(e),
                "current_bytes": e.current_bytes,
                "quota_bytes": e.quota_bytes,
            },
        )
    except UnknownSchemeError as e:
        # Should not happen on write — the configured write scheme
        # is in the encoder dispatch by construction. If it does
        # (operator misconfigured ANALYSIS_PERSISTENCE_WRITE_SCHEME),
        # log and fail loudly per ADR-0002.
        logger.error(
            "UnknownSchemeError on write: scheme=%s "
            "(operator misconfiguration in ANALYSIS_PERSISTENCE_WRITE_SCHEME)",
            e.scheme,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "kind": "unknown_scheme",
                "detail": str(e),
                "scheme": e.scheme,
            },
        )


@router.get("/{board_id}", response_model=AnalysisBundle)
async def get_analysis_bundle(
    board_id: UUID,
    service: AnalysisBundleService = Depends(get_analysis_bundle_service),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Fetch the bundle stored under `(user_id, board_id)`, decoded
    back to canonical-JSON shape. 404 if no bundle exists OR if
    the bundle exists but belongs to a different tenant
    (404-not-403 invariant).
    """
    try:
        bundle = await service.get(board_id=board_id, user_id=user_id)
    except UnknownSchemeError as e:
        # Stored row carries a scheme the dispatcher doesn't
        # recognise — see Confirmation C2 in the dispatch.
        # Operator-side issue; fail loudly with structured detail.
        logger.error(
            "UnknownSchemeError on read: scheme=%s board_id=%s user_id=%s",
            e.scheme, board_id, user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "kind": "unknown_scheme",
                "detail": str(e),
                "scheme": e.scheme,
            },
        )

    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis bundle not found",
        )
    return bundle


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis_bundle(
    board_id: UUID,
    service: AnalysisBundleService = Depends(get_analysis_bundle_service),
    db: AsyncSession = Depends(get_db),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Idempotent delete. 204 whether or not a row existed.
    Cross-tenant deletes are silent no-ops (the WHERE clause's
    user_id filter ensures zero-rows-affected for someone else's
    board_id).
    """
    async with db.begin():
        await service.delete(board_id=board_id, user_id=user_id)


@router.get("", response_model=List[AnalysisBundleSummary])
async def list_analysis_bundles(
    service: AnalysisBundleService = Depends(get_analysis_bundle_service),
    user_id: UserId = Depends(get_current_user_id),
):
    """
    Per-bundle metadata for every bundle the caller owns. No
    payloads — the frontend's storage panel uses this to render
    "you have N bundles using M GB" without forcing a per-bundle
    decode.
    """
    return await service.list_summaries(user_id=user_id)
