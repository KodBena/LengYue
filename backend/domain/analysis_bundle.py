"""
domain/analysis_bundle.py

Domain DTOs for the analysis-persistence arc.

A bundle is the flat ledger projection over a board's nodes — a
list of `(config_hash, node_id, packet)` records, persisted as
the user's "save analyses for this board" lifecycle anchor. The
backend treats the payload as opaque storage; the wire-shape and
semantic contract for what's inside it is the frontend ACL's
concern (per ADR-0002, "ACL boundaries validate rather than
coerce").

Two wire shapes ride here, discriminated on ``wire_format``:

- **v1** (``AnalysisBundleV1``) — the original canonical-JSON
  shape: ``{schema_version, records: [{config_hash, node_id,
  packet}, ...]}``. Backend understands every field; the
  ``packet`` is a JSON dict carried verbatim through the adapter's
  ``json`` / ``json+gzip`` codecs.

- **v2** (``AnalysisBundleV2``) — the SPA-encoded shape:
  ``{schema_version, format_descriptor, record_count,
  uncompressed_byte_size, data_b64}``. The SPA does all encoding
  (projection allow-list, ownership / policy uniform quantisation)
  and sends pre-encoded bytes; the backend brotli-wraps and stores
  bytes + descriptor + sizes. On read the backend brotli-unwraps
  and returns ``data_b64`` + ``format_descriptor`` verbatim; the
  SPA's decoder does the inverse of whatever its encoder did.
  Design rationale at
  ``docs/notes/analysis-bundle-compression-plan.md``.

Wire-format discrimination
══════════════════════════
``wire_format`` is the discriminator field. v1 carries
``wire_format: "v1"`` with a default (so pre-cutover SPAs that
send only ``{schema_version, records}`` still validate as v1
without changes). v2 requires ``wire_format: "v2"`` explicitly.
Pydantic's union resolution picks v1 for inputs lacking
``wire_format`` and for inputs with ``wire_format == "v1"``;
picks v2 for inputs with ``wire_format == "v2"``; rejects any
other value as 422.

The discriminator-defaulted-to-v1 means: existing v1 clients keep
working with zero changes. SPAs migrate to v2 when ready by
sending the v2 shape; the route layer's dispatch handles both.

Other wire-shape conventions
════════════════════════════
- ``schema_version`` is the **bundle-content** version inside the
  record's payload, not the wire-shape version. Today only ``1``
  is accepted; a future ``2`` would represent records carrying
  additional opaque fields. Distinct from ``wire_format`` (which
  governs the OUTER envelope shape).

- The DTOs here are reused as both domain entities AND wire shapes
  (request bodies / response bodies). The analysis bundle has no
  domain-vs-wire structural difference (unlike Card, which has
  Bayesian-prior fields not in CardCreate). Keeping them as one
  set of types reduces duplication; the route file imports them
  directly.

- All models are ``frozen=True`` per the backend authoring posture
  (immutability by default; mutation via reconstruction). The
  ``Dict[str, Any]`` ``packet`` field (v1) and ``format_descriptor``
  field (v2) are mutable in principle, but we never mutate them
  through the bundle reference — they flow from request → adapter
  → bytes one way, and bytes → adapter → response the other.

License: Public Domain (The Unlicense)
"""
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AnalysisBundleRecord(BaseModel):
    """One persisted (config_hash, node_id, packet) tuple.

    `packet` is opaque to the backend — a JSON object the frontend
    captured from a KataGo analysis response. The backend never
    inspects its shape; the codec round-trip preserves it byte-for-
    byte (modulo JSON normalisation).
    """

    model_config = ConfigDict(frozen=True)

    config_hash: str
    node_id: str
    packet: Dict[str, Any]


class AnalysisBundleV1(BaseModel):
    """v1 wire shape — canonical-JSON records, backend-introspectable.

    The upsert wire shape AND the GET response shape for v1 stored
    bundles. ``wire_format`` defaults to ``"v1"`` so pre-cutover
    SPAs that send only ``{schema_version, records}`` continue to
    validate without changes.
    """

    model_config = ConfigDict(frozen=True)

    wire_format: Literal["v1"] = "v1"
    schema_version: Literal[1]
    records: List[AnalysisBundleRecord]


class AnalysisBundleV2(BaseModel):
    """v2 wire shape — SPA-encoded opaque bytes.

    The upsert wire shape AND the GET response shape for v2 stored
    bundles. The SPA owns the entire encoding pipeline (projection
    allow-list, ownership / policy uniform quantisation); the
    backend brotli-wraps unconditionally for the column-level
    storage win and stores the descriptor + size assertions
    alongside.

    Why the per-field assertions live on the wire:
    - ``record_count`` — the backend can't derive this from the
      opaque bytes; the SPA's summary surface and the per-user
      storage panel both want it without forcing a per-bundle
      decode. The SPA's assertion is trusted.
    - ``uncompressed_byte_size`` — the backend can't measure this
      either (the SPA already projected + quantised before
      encoding). Surfaced to the user as the "saved X%" figure.
      The SPA's assertion is trusted.
    """

    model_config = ConfigDict(frozen=True)

    wire_format: Literal["v2"]
    schema_version: Literal[1]
    format_descriptor: Dict[str, Any]
    record_count: int
    uncompressed_byte_size: int
    data_b64: str


# ``AnalysisBundle`` is the v1 class kept under the original name
# for backward-compatible imports and instantiation across the
# codebase (services, route, repository, fakes, tests). The
# discriminated upload / response wire shape lives at
# ``AnalysisBundleUpload`` below.
AnalysisBundle = AnalysisBundleV1


# The discriminated upload / response type. Pydantic resolves the
# union by trying each variant — V1's ``Literal["v1"]`` default
# accepts inputs missing the field, V2's ``Literal["v2"]`` requires
# the field. Inputs with neither shape's discriminator value (or
# missing v2's required fields) fail with 422.
#
# The route layer's PUT and GET use this union; the Port surface
# follows once the adapter learns the v2-brotli codec (next commit).
AnalysisBundleUpload = Union[AnalysisBundleV1, AnalysisBundleV2]


class AnalysisBundleSummary(BaseModel):
    """Metadata about a stored bundle — no payload.

    The return shape of both ``upsert`` (the write response) and
    ``list_summaries`` (the per-board listing). The two shapes are
    identical so they collapse to one DTO.

    ``stored_byte_size`` is the post-transcoding byte count — the
    same value the per-user quota check sums. The frontend's
    storage panel sums this across a list response to display
    "X of 2 GB used".

    v2-specific fields:
    - ``uncompressed_byte_size`` — SPA-asserted pre-compression
      byte count. NULL for v1 bundles (the backend didn't track
      this concept under v1; legacy rows surface as None).
    - ``format_descriptor`` — SPA-supplied encoding metadata for
      v2 bundles. NULL for v1 bundles (the backend's own codec
      dispatch carries the v1 encoding info).

    These two fields are Optional because the analysis_bundles
    table has v1 rows from before the v2 arc shipped; backfilling
    synthetic values would be dishonest, so the wire shape carries
    None for legacy rows and the SPA renders accordingly.
    """

    model_config = ConfigDict(frozen=True)

    board_id: UUID
    record_count: int
    stored_scheme: str
    stored_byte_size: int
    updated_at: datetime
    uncompressed_byte_size: Optional[int] = None
    format_descriptor: Optional[Dict[str, Any]] = None
