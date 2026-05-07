"""
domain/analysis_bundle.py

Domain DTOs for the analysis-persistence arc.

A bundle is the flat ledger projection over a board's nodes — a
list of `(config_hash, node_id, packet)` records, persisted as
the user's "save analyses for this board" lifecycle anchor. The
backend treats `packet` as opaque storage; the wire-shape and
semantic contract for what's inside it is the frontend ACL's
concern (per ADR-0002, "ACL boundaries validate rather than
coerce").

Wire-shape conventions:

- `schema_version` is the backend's forward-compat hook. Today
  the only accepted value is 1; bundles with unknown versions
  are rejected at the route boundary (Pydantic Literal[1]
  validation → 422). Future versions can extend records with
  additional opaque fields without a DB migration.

- The DTOs here are reused as both domain entities AND wire
  shapes (request bodies / response bodies). The two would
  otherwise be near-identical — the analysis bundle has no
  domain-vs-wire structural difference (unlike Card, which has
  Bayesian-prior fields not in CardCreate). Keeping them as one
  set of types reduces duplication; the route file imports them
  directly.

- All models are `frozen=True` per the backend authoring posture
  (immutability by default; mutation via reconstruction). The
  Dict[str, Any] `packet` field is mutable in principle, but we
  never mutate it through the bundle reference — it flows from
  request → adapter → bytes one way, and bytes → adapter →
  response the other.

License: Public Domain (The Unlicense)
"""
from datetime import datetime
from typing import Any, Dict, List, Literal
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


class AnalysisBundle(BaseModel):
    """The bundle stored under one (user_id, board_id) pair.

    The upsert wire shape; also the GET response shape (since the
    backend reconstructs a canonical-JSON bundle from its stored
    `(scheme, payload)` tuple).

    `schema_version` gates forward compatibility. The backend
    accepts only versions in its known set (today: {1}); a future
    v2 bundle adds fields to records without breaking v1 readers,
    and the gate prevents a v1-only backend from silently
    accepting a v2 bundle it would mis-project.
    """

    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1]
    records: List[AnalysisBundleRecord]


class AnalysisBundleSummary(BaseModel):
    """Metadata about a stored bundle — no payload.

    The return shape of both `upsert` (the write response) and
    `list_summaries` (the per-board listing). The dispatch named
    the upsert-return as AnalysisBundleStored and the list-element
    as AnalysisBundleSummary, but the two shapes are identical and
    the semantic is the same ("metadata about a stored bundle"),
    so they collapse to one DTO here.

    `stored_byte_size` is the post-transcoding byte count — the
    same value the per-user quota check sums (Confirmation C3 in
    the dispatch). The frontend's storage panel sums this across
    a list response to display "X of 2 GB used"; backend's quota
    check on the next PUT operates on the same value.
    """

    model_config = ConfigDict(frozen=True)

    board_id: UUID
    record_count: int
    stored_scheme: str
    stored_byte_size: int
    updated_at: datetime
