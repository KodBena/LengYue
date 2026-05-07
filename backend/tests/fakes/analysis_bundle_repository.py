"""
tests/fakes/analysis_bundle_repository.py

In-memory fake for ``AnalysisBundleRepositoryPort``. State is keyed
by ``(user_id, board_id)``; an aggregate ``byte_size`` is tracked
per user so the atomic-quota path is exercisable from a service
test.

The fake reproduces the production adapter's contract:

  - ``upsert`` honors a per-user byte quota; raising
    ``UserQuotaExceededError`` when the would-be total exceeds
    the configured cap.
  - ``get`` returns ``None`` for cross-tenant or missing
    ``(user_id, board_id)``.
  - ``delete`` is idempotent across both missing-row and
    cross-tenant cases.
  - ``list_summaries`` returns one ``AnalysisBundleSummary`` per
    bundle the caller owns.

The fake does not exercise the codec dispatch layer — the bundle
round-trips through Python state, not a transcoded payload. The
codec path is the SQLAlchemy adapter's responsibility and gets
covered by Phase 2 integration tests against the real
``AnalysisBundleRepository``.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from domain.analysis_bundle import AnalysisBundle, AnalysisBundleSummary
from domain.auth import UserId
from domain.errors import UserQuotaExceededError


class FakeAnalysisBundleRepository:
    """
    Structural match for ``AnalysisBundleRepositoryPort``.

    Construction takes an optional per-user quota in bytes (default
    very large so simple tests don't need to opt out) and the
    "stored scheme" the summary should advertise (defaults to
    ``"json"``).

    Test usage::

        repo = FakeAnalysisBundleRepository(
            user_quota_bytes=1_000_000,
        )

        # Service-level write:
        await repo.upsert(
            user_id=UserId(1), board_id=uuid4(), bundle=AnalysisBundle(...)
        )
    """

    def __init__(
        self,
        *,
        user_quota_bytes: int = 10**12,
        stored_scheme: str = "json",
        bytes_per_record: int = 100,
    ) -> None:
        self._bundles: Dict[
            Tuple[int, UUID], Tuple[AnalysisBundle, AnalysisBundleSummary]
        ] = {}
        self._user_quota = user_quota_bytes
        self._scheme = stored_scheme
        # Used to compute a deterministic byte_size per record so a
        # quota-exceeded test can construct deterministic boundary
        # conditions without round-tripping bytes.
        self._bytes_per_record = bytes_per_record

    def _user_total_bytes(
        self, user_id: int, *, exclude_board: Optional[UUID] = None
    ) -> int:
        return sum(
            summary.stored_byte_size
            for (uid, board), (_, summary) in self._bundles.items()
            if uid == user_id and (exclude_board is None or board != exclude_board)
        )

    async def upsert(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
        bundle: AnalysisBundle,
    ) -> AnalysisBundleSummary:
        record_count = len(bundle.records)
        new_byte_size = record_count * self._bytes_per_record

        existing_total = self._user_total_bytes(
            int(user_id), exclude_board=board_id,
        )
        if existing_total + new_byte_size > self._user_quota:
            raise UserQuotaExceededError(
                current_bytes=existing_total + new_byte_size,
                quota_bytes=self._user_quota,
            )

        summary = AnalysisBundleSummary(
            board_id=board_id,
            record_count=record_count,
            stored_scheme=self._scheme,
            stored_byte_size=new_byte_size,
            updated_at=datetime.now(timezone.utc),
        )
        self._bundles[(int(user_id), board_id)] = (bundle, summary)
        return summary

    async def get(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> Optional[AnalysisBundle]:
        entry = self._bundles.get((int(user_id), board_id))
        if entry is None:
            return None
        return entry[0]

    async def delete(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> None:
        self._bundles.pop((int(user_id), board_id), None)

    async def list_summaries(
        self,
        *,
        user_id: UserId,
    ) -> List[AnalysisBundleSummary]:
        return [
            summary
            for (uid, _), (_, summary) in self._bundles.items()
            if uid == int(user_id)
        ]
