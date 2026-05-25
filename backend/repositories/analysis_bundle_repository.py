"""
repositories/analysis_bundle_repository.py

SQLAlchemy adapter for AnalysisBundleRepositoryPort.

Holds the codec dispatch (encode bundles to the configured write
scheme for v1; brotli-wrap raw bytes for v2; decode any stored
scheme on read) and the atomic per-user quota check.

The codec dispatch is the module's flexibility hinge. The original
arc shipped two v1-style codecs (``json`` and ``json+gzip``) that
take/return canonical-JSON dicts. The
cross/analysis-bundle-compression-v2 arc adds a v2-style codec
(``v2-brotli``) that takes/returns raw bytes — the SPA owns the
projection + quantisation pipeline before encoding, and the
backend simply brotli-wraps for the column-level storage win. Old
rows with old scheme tags remain readable forever — the dispatch
only grows. The wire-shape and rationale are recorded in
``docs/notes/analysis-bundle-compression-plan.md``.

Dispatch shape: the v1 codecs are ``dict ↔ bytes``; the v2 codec
is ``bytes ↔ bytes``. The two families live in separate dispatch
tables to keep the signatures honest; ``upsert`` and ``get`` choose
which family applies by inspecting ``bundle.wire_format`` on write
and ``row.scheme`` on read.

The atomic quota check inside upsert is one extra SELECT before
the INSERT/UPDATE, all within the caller's transaction. Cheap at
hobby scale (per-user bundle count is ~tens), correct at any
scale: the SUM is consistent with the post-write state because
nothing can interleave inside the transaction.

License: Public Domain (The Unlicense)
"""
import base64
import gzip
import json
import logging
from typing import Callable, Dict, List, Optional
from uuid import UUID

import brotli
from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.schema import analysis_bundles
from domain.analysis_bundle import (
    AnalysisBundleSummary,
    AnalysisBundleUpload,
    AnalysisBundleV1,
    AnalysisBundleV2,
)
from domain.auth import UserId
from domain.errors import UnknownSchemeError, UserQuotaExceededError
from repositories.ports import AnalysisBundleRepositoryPort

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------
# v1-style codec dispatch (dict ↔ bytes).
#
# Each function takes/returns the canonical bundle dict shape
# (``bundle.model_dump()`` / a dict that ``AnalysisBundleV1.
# model_validate`` accepts). The bytes the database stores are
# whatever the writer produces — the column is opaque LargeBinary.
#
# Adding a v1-style scheme:
#   1. Define ``_encode_<name>`` and ``_decode_<name>``.
#   2. Add them to ``_ENCODERS`` / ``_DECODERS`` below.
#   3. Optionally flip ANALYSIS_PERSISTENCE_WRITE_SCHEME to the
#      new tag so newly-written v1 rows use it. Old rows continue
#      to decode via their own entry.
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
# v2-style codec — bytes ↔ bytes, brotli-wrapped.
#
# The SPA produces opaque pre-encoded bytes (projection +
# quantisation already applied); the adapter brotli-wraps for the
# column-level storage win and unwraps on read. Brotli quality 6
# matches the research arc's measurements — the
# compression-ratio-vs-CPU sweet spot for the bundle shapes we
# actually ship.
# ---------------------------------------------------------------


SCHEME_V2_BROTLI = "v2-brotli"
_V2_BROTLI_QUALITY = 6


def _encode_v2_brotli(raw_bytes: bytes) -> bytes:
    return brotli.compress(raw_bytes, quality=_V2_BROTLI_QUALITY)


def _decode_v2_brotli(payload: bytes) -> bytes:
    return brotli.decompress(payload)


# ---------------------------------------------------------------
# Adapter.
# ---------------------------------------------------------------


class AnalysisBundleRepository(AnalysisBundleRepositoryPort):
    """
    SQLAlchemy adapter satisfying AnalysisBundleRepositoryPort.

    Construction takes the session plus the two deployment-level
    knobs the adapter needs (write scheme for v1, user quota). The
    DI factory in api/dependencies.py reads them from
    ``core.config`` and passes them in; tests can construct the
    adapter with arbitrary values to exercise the codec dispatch
    and quota check independently.

    v1 vs v2: the ``write_scheme`` knob applies only to v1 uploads
    — v2 uploads ignore it and always store with
    ``scheme=v2-brotli`` (because the v2 wire shape carries its
    own pre-encoded bytes and the brotli wrap is unconditional).

    No method here commits. Transaction boundaries are owned by
    the route via ``async with db.begin():`` — the upsert's quota
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
        bundle: AnalysisBundleUpload,
    ) -> AnalysisBundleSummary:
        # 1. Encode the bundle. Dispatch on wire_format:
        #    - v1: route through the configured write_scheme codec;
        #      format_descriptor + uncompressed_byte_size stay NULL.
        #    - v2: brotli-wrap the raw bytes the SPA pre-encoded;
        #      format_descriptor + uncompressed_byte_size carry the
        #      SPA's assertions.
        # ``byte_size`` is post-transcoding regardless — this is the
        # value the per-user quota counts.
        if isinstance(bundle, AnalysisBundleV2):
            raw_bytes = base64.b64decode(bundle.data_b64)
            payload = _encode_v2_brotli(raw_bytes)
            scheme = SCHEME_V2_BROTLI
            record_count = bundle.record_count
            format_descriptor = bundle.format_descriptor
            uncompressed_byte_size = bundle.uncompressed_byte_size
        else:
            bundle_dict = bundle.model_dump()
            payload = _encode(self.write_scheme, bundle_dict)
            scheme = self.write_scheme
            record_count = len(bundle.records)
            format_descriptor = None
            uncompressed_byte_size = None
        byte_size = len(payload)

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
        common_values = dict(
            scheme=scheme,
            payload=payload,
            record_count=record_count,
            byte_size=byte_size,
            format_descriptor=format_descriptor,
            uncompressed_byte_size=uncompressed_byte_size,
        )
        if existing is not None:
            stmt = (
                update(analysis_bundles)
                .where(analysis_bundles.c.user_id == user_id)
                .where(analysis_bundles.c.board_id == board_id)
                .values(**common_values)
                .returning(analysis_bundles.c.updated_at)
            )
        else:
            stmt = (
                insert(analysis_bundles)
                .values(
                    user_id=user_id,
                    board_id=board_id,
                    **common_values,
                )
                .returning(analysis_bundles.c.updated_at)
            )
        # ``updated_at`` is server-defaulted on INSERT (server_default
        # = func.now()) and refreshed on UPDATE (onupdate =
        # func.now()); RETURNING gives us the database-resolved
        # timestamp without an extra SELECT.
        updated_at = (await self.session.execute(stmt)).scalar()

        return AnalysisBundleSummary(
            board_id=board_id,
            record_count=record_count,
            stored_scheme=scheme,
            stored_byte_size=byte_size,
            updated_at=updated_at,
            format_descriptor=format_descriptor,
            uncompressed_byte_size=uncompressed_byte_size,
        )

    async def get(
        self,
        *,
        board_id: UUID,
        user_id: UserId,
    ) -> Optional[AnalysisBundleUpload]:
        # WHERE clause fuses (board_id, user_id) — the 404-not-403
        # invariant: cross-tenant access returns the same None as
        # a non-existent bundle.
        row = (await self.session.execute(
            select(
                analysis_bundles.c.scheme,
                analysis_bundles.c.payload,
                analysis_bundles.c.record_count,
                analysis_bundles.c.format_descriptor,
                analysis_bundles.c.uncompressed_byte_size,
            )
            .where(analysis_bundles.c.user_id == user_id)
            .where(analysis_bundles.c.board_id == board_id)
        )).fetchone()
        if row is None:
            return None

        if row.scheme == SCHEME_V2_BROTLI:
            # v2 path: brotli-unwrap and reconstruct the V2 wire shape
            # from the row's columns. The format_descriptor and
            # uncompressed_byte_size columns are populated at write
            # time for every v2 row; if they're NULL here, the row
            # is corrupt and Pydantic will raise loudly per ADR-0002.
            raw_bytes = _decode_v2_brotli(row.payload)
            data_b64 = base64.b64encode(raw_bytes).decode("ascii")
            return AnalysisBundleV2(
                wire_format="v2",
                schema_version=1,
                format_descriptor=row.format_descriptor,
                record_count=row.record_count,
                uncompressed_byte_size=row.uncompressed_byte_size,
                data_b64=data_b64,
            )

        # v1 path: ``_decode`` raises UnknownSchemeError if the row's
        # scheme isn't in the v1 dispatch table — propagated to the
        # route as a structured 500.
        bundle_dict = _decode(row.scheme, row.payload)
        return AnalysisBundleV1.model_validate(bundle_dict)

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
                analysis_bundles.c.format_descriptor,
                analysis_bundles.c.uncompressed_byte_size,
            ).where(analysis_bundles.c.user_id == user_id)
        )).fetchall()
        return [
            AnalysisBundleSummary(
                board_id=row.board_id,
                record_count=row.record_count,
                stored_scheme=row.scheme,
                stored_byte_size=row.byte_size,
                updated_at=row.updated_at,
                format_descriptor=row.format_descriptor,
                uncompressed_byte_size=row.uncompressed_byte_size,
            )
            for row in rows
        ]
