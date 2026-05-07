"""
services/analysis_bundle_service.py

AnalysisBundleService — the analysis-persistence use case.

Thin orchestrator over AnalysisBundleRepositoryPort. The only
domain logic above the Port is the per-bundle cap check:
`request_body_bytes` is bounded at the service layer because the
adapter only sees the parsed `AnalysisBundle` DTO, which has
already been deserialised — the request-body size is a
network-edge concern that the route hands to the service.

Per-user quota enforcement lives in the adapter (it's an SQL
operation that has to be atomic with the upsert). The two caps
serve two purposes:

- `ANALYSIS_PERSISTENCE_BUNDLE_MAX_BYTES`: bounds memory and
  parse cost per request. Service enforces; raises
  BundleTooLargeError → 413.
- `ANALYSIS_PERSISTENCE_USER_QUOTA_BYTES`: bounds long-term
  storage growth per tenant. Adapter enforces inside the upsert
  transaction; raises UserQuotaExceededError → 413.

Both 413 errors carry a `kind` discriminator in their structured
detail body (Confirmation C1 in
docs/dispatch/backend-to-frontend-analysis-persistence-status.md)
so the frontend ACL dispatches by tag.

License: Public Domain (The Unlicense)
"""
from typing import List, Optional
from uuid import UUID

from domain.analysis_bundle import AnalysisBundle, AnalysisBundleSummary
from domain.auth import UserId
from domain.errors import BundleTooLargeError
from repositories.ports import AnalysisBundleRepositoryPort


class AnalysisBundleService:
    """
    Port-pure orchestrator. Constructor takes the Port plus the
    per-bundle cap (read from config at the DI factory in
    api/dependencies.py). No SQL, no session, no transaction
    management — the route owns the transaction boundary.
    """

    def __init__(
        self,
        repository: AnalysisBundleRepositoryPort,
        *,
        bundle_max_bytes: int,
    ):
        self.repository = repository
        self.bundle_max_bytes = bundle_max_bytes

    async def upsert(
        self,
        *,
        board_id: UUID,
        bundle: AnalysisBundle,
        request_body_bytes: int,
        user_id: UserId,
    ) -> AnalysisBundleSummary:
        """
        Per-bundle cap check, then delegate to the Port.

        `request_body_bytes` is the route-supplied raw byte length
        of the incoming JSON body — the same number the frontend's
        pre-save preview predicts. Exceeding the cap raises
        BundleTooLargeError; the route maps this to 413 with a
        structured `bundle_too_large` detail body.

        On success, returns the AnalysisBundleSummary the adapter
        produced — the route projects this directly into the
        AnalysisBundleWriteResponse wire shape.

        Raises:
            BundleTooLargeError: request_body_bytes > bundle_max_bytes.
            UserQuotaExceededError: bubbles up from the Port if the
                upsert would push the user over their quota.
            UnknownSchemeError: bubbles up if the configured write
                scheme isn't in the codec dispatch (a misconfiguration).
        """
        if request_body_bytes > self.bundle_max_bytes:
            raise BundleTooLargeError(
                request_bytes=request_body_bytes,
                cap_bytes=self.bundle_max_bytes,
            )
        return await self.repository.upsert(
            board_id=board_id, user_id=user_id, bundle=bundle,
        )

    async def get(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> Optional[AnalysisBundle]:
        """Pass-through. None on miss; the route maps to 404."""
        return await self.repository.get(
            board_id=board_id, user_id=user_id,
        )

    async def delete(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> None:
        """Pass-through. Idempotent; the route maps to 204 regardless."""
        await self.repository.delete(
            board_id=board_id, user_id=user_id,
        )

    async def list_summaries(
        self,
        *,
        user_id: UserId,
    ) -> List[AnalysisBundleSummary]:
        """Pass-through. The route serialises into the list wire shape."""
        return await self.repository.list_summaries(user_id=user_id)
