"""
repositories/analysis_bundle_repository.py

SQLAlchemy adapter for AnalysisBundleRepositoryPort.

The cross/analysis-persistence arc's persistence side. Holds the
codec dispatch table (encode bundles to the configured write
scheme; decode stored payloads regardless of their scheme) and
the atomic quota check.

The codec dispatch is the load-bearing flexibility: today the
backend writes "json+gzip" and reads both "json" and "json+gzip";
adding a future scheme (e.g., "json+zstd") is one new entry in
each dispatch table plus flipping the write-scheme config knob.
Old rows with older schemes remain readable forever — the
dispatch only grows. The wire-shape and rationale are recorded
in docs/dispatch/backend-to-frontend-analysis-persistence-status.md.

The atomic quota check inside upsert is one extra SELECT before
the INSERT/UPDATE, all within the caller's transaction. Cheap at
hobby scale (per-user bundle count is ~tens), correct at any
scale: the SUM is consistent with the post-write state because
nothing can interleave inside the transaction.

License: Public Domain (The Unlicense)
"""
import gzip
import json
import logging
from typing import Callable, Dict, List, Optional
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import analysis_bundles
from domain.analysis_bundle import (
    AnalysisBundle,
    AnalysisBundleSummary,
)
from domain.auth import UserId
from domain.errors import UnknownSchemeError, UserQuotaExceededError
from repositories.ports import AnalysisBundleRepositoryPort

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------
# Codec dispatch.
#
# Each function takes/returns the canonical bundle dict shape
# (`bundle.model_dump()` / a dict that AnalysisBundle.model_validate
# accepts). The bytes the database stores are whatever the writer
# produces — the column is opaque LargeBinary.
#
# Adding a new scheme:
#   1. Define `_encode_<name>` and `_decode_<name>`.
#   2. Add them to the corresponding dispatch table below.
#   3. Optionally flip ANALYSIS_PERSISTENCE_WRITE_SCHEME to the
#      new tag so newly-written rows use it. Old rows with the
#      old tag continue to decode correctly via their own entry.
# ---------------------------------------------------------------


def _encode_json(bundle_dict: dict) -> bytes:
    # Compact separators — no whitespace; minimises pre-compression size.
    return json.dumps(bundle_dict, separators=(",", ":")).encode("utf-8")


def _decode_json(payload: bytes) -> dict:
    return json.loads(payload.decode("utf-8"))


def _encode_json_gzip(bundle_dict: dict) -> bytes:
    return gzip.compress(_encode_json(bundle_dict))


def _decode_json_gzip(payload: bytes) -> dict:
    return _decode_json(gzip.decompress(payload))


_ENCODERS: Dict[str, Callable[[dict], bytes]] = {
    "json": _encode_json,
    "json+gzip": _encode_json_gzip,
}

_DECODERS: Dict[str, Callable[[bytes], dict]] = {
    "json": _decode_json,
    "json+gzip": _decode_json_gzip,
}


def _encode(scheme: str, bundle_dict: dict) -> bytes:
    encoder = _ENCODERS.get(scheme)
    if encoder is None:
        raise UnknownSchemeError(scheme=scheme)
    return encoder(bundle_dict)


def _decode(scheme: str, payload: bytes) -> dict:
    decoder = _DECODERS.get(scheme)
    if decoder is None:
        raise UnknownSchemeError(scheme=scheme)
    return decoder(payload)


# ---------------------------------------------------------------
# Adapter.
# ---------------------------------------------------------------


class AnalysisBundleRepository(AnalysisBundleRepositoryPort):
    """
    SQLAlchemy adapter satisfying AnalysisBundleRepositoryPort.

    Construction takes the session plus the two deployment-level
    knobs the adapter needs (write scheme, user quota). The DI
    factory in api/dependencies.py reads them from `core.config`
    and passes them in; tests can construct the adapter with
    arbitrary values to exercise the codec dispatch and quota
    check independently.

    No method here commits. Transaction boundaries are owned by
    the route via `async with db.begin():` — the upsert's quota
    check and the INSERT/UPDATE complete atomically because the
    surrounding transaction holds them together.
    """

    def __init__(
        self,
        session: AsyncSession,
        *,
        write_scheme: str,
        user_quota_bytes: int,
    ):
        self.session = session
        self.write_scheme = write_scheme
        self.user_quota_bytes = user_quota_bytes

    async def upsert(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
        bundle: AnalysisBundle,
    ) -> AnalysisBundleSummary:
        # 1. Encode the bundle. The byte_size is post-transcoding;
        # this is the value the per-user quota counts (Confirmation
        # C3 in the dispatch).
        bundle_dict = bundle.model_dump()
        payload = _encode(self.write_scheme, bundle_dict)
        byte_size = len(payload)
        record_count = len(bundle.records)

        # 2. Atomic quota check. One SELECT covers both:
        #    - the existing row's byte_size (None if no row exists)
        #    - the SUM of all the user's byte_sizes
        # Realistic per-user cardinality is small (~tens of bundles),
        # so Python-side aggregation is cheaper than two SQL
        # aggregates. The whole computation runs inside the route's
        # transaction, so no other writer can interleave between
        # the SELECT and the subsequent INSERT/UPDATE.
        all_rows = (await self.session.execute(
            select(
                analysis_bundles.c.board_id,
                analysis_bundles.c.byte_size,
            ).where(analysis_bundles.c.user_id == user_id)
        )).fetchall()

        current_total = sum(row.byte_size for row in all_rows)
        existing = next(
            (row.byte_size for row in all_rows if row.board_id == board_id),
            None,
        )
        existing_byte_size = existing if existing is not None else 0

        new_total = current_total - existing_byte_size + byte_size
        if new_total > self.user_quota_bytes:
            raise UserQuotaExceededError(
                current_bytes=current_total,
                quota_bytes=self.user_quota_bytes,
            )

        # 3. SELECT-then-conditional-INSERT-or-UPDATE for dialect
        # agnosticism (the documents.py upsert pattern). The
        # existence check piggybacks on the SELECT we already did
        # for the quota math — no extra round-trip.
        if existing is not None:
            stmt = (
                update(analysis_bundles)
                .where(analysis_bundles.c.user_id == user_id)
                .where(analysis_bundles.c.board_id == board_id)
                .values(
                    scheme=self.write_scheme,
                    payload=payload,
                    record_count=record_count,
                    byte_size=byte_size,
                )
                .returning(analysis_bundles.c.updated_at)
            )
        else:
            stmt = (
                insert(analysis_bundles)
                .values(
                    user_id=user_id,
                    board_id=board_id,
                    scheme=self.write_scheme,
                    payload=payload,
                    record_count=record_count,
                    byte_size=byte_size,
                )
                .returning(analysis_bundles.c.updated_at)
            )
        # `updated_at` is server-defaulted on INSERT (server_default
        # = func.now()) and refreshed on UPDATE (onupdate =
        # func.now()); RETURNING gives us the database-resolved
        # timestamp without an extra SELECT.
        updated_at = (await self.session.execute(stmt)).scalar()

        return AnalysisBundleSummary(
            board_id=board_id,
            record_count=record_count,
            stored_scheme=self.write_scheme,
            stored_byte_size=byte_size,
            updated_at=updated_at,
        )

    async def get(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> Optional[AnalysisBundle]:
        # WHERE clause fuses (board_id, user_id) — the 404-not-403
        # invariant: cross-tenant access returns the same None as
        # a non-existent bundle.
        row = (await self.session.execute(
            select(
                analysis_bundles.c.scheme,
                analysis_bundles.c.payload,
            )
            .where(analysis_bundles.c.user_id == user_id)
            .where(analysis_bundles.c.board_id == board_id)
        )).fetchone()
        if row is None:
            return None

        # `_decode` raises UnknownSchemeError if the row's scheme
        # isn't in the dispatch table — propagated to the route as
        # a structured 500 (Confirmation C2).
        bundle_dict = _decode(row.scheme, row.payload)
        return AnalysisBundle.model_validate(bundle_dict)

    async def delete(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> None:
        # Idempotent: zero-rows-affected is a successful return.
        # The route maps every successful return to 204 regardless.
        stmt = (
            delete(analysis_bundles)
            .where(analysis_bundles.c.user_id == user_id)
            .where(analysis_bundles.c.board_id == board_id)
        )
        await self.session.execute(stmt)

    async def list_summaries(
        self,
        *,
        user_id: UserId,
    ) -> List[AnalysisBundleSummary]:
        rows = (await self.session.execute(
            select(
                analysis_bundles.c.board_id,
                analysis_bundles.c.record_count,
                analysis_bundles.c.scheme,
                analysis_bundles.c.byte_size,
                analysis_bundles.c.updated_at,
            ).where(analysis_bundles.c.user_id == user_id)
        )).fetchall()
        return [
            AnalysisBundleSummary(
                board_id=row.board_id,
                record_count=row.record_count,
                stored_scheme=row.scheme,
                stored_byte_size=row.byte_size,
                updated_at=row.updated_at,
            )
            for row in rows
        ]
