"""
domain/game_library.py — value objects for the SGF library.

Frozen Pydantic entities for the library's typed surfaces:

- ``SgfMetadata`` projects the normalizer's meta dict onto a typed
  bundle the service layer consumes when populating ``game_source``
  columns.
- ``LibraryGameListItem`` is the list-view row projection (no
  ``raw_content`` — that field stays on the backend until ``GET
  /games/{id}`` is hit).
- ``LibraryGame`` is the full game row including ``raw_content``,
  the detail-view shape.
- ``GameListSort`` is the closed-vocabulary sort enum. Per
  ADR-0008's classification discipline, requests with unsupported
  sort columns surface as 422 at the route boundary rather than
  fuzzy-matching to a closest fit.
- ``GameListFilter`` is the request-shaped filter spec.
- ``ImportOutcome`` is the discriminated union returned per file
  by the batch-import endpoint — Created / Deduplicated / Errored
  on a discriminator field that lets the frontend dispatch
  without `isinstance`.

Pure domain. Imports only stdlib and Pydantic; no SQLAlchemy, no
FastAPI, no db.schema.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Dict, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ─── Typed metadata ──────────────────────────────────────────────────────────


class SgfMetadata(BaseModel):
    """
    Typed projection of the SGF root properties the library surfaces.

    Built from the normalizer's ``meta`` dict via
    ``from_normalizer_meta``. Frozen — once extracted, metadata
    doesn't mutate.

    Field semantics:

    - ``player_white`` / ``player_black``: PW / PB properties. ``None``
      when the SGF omits the property; the legacy CardService keys
      keep the "Unknown" string fallback for backward-compat (see
      ``domain/normalization.py``'s meta dict).
    - ``date``: DT property, free-form string. SGF doesn't impose a
      date format; preserved verbatim.
    - ``result``: RE property, free-form string (typically ``B+R``,
      ``W+3.5``, etc.).
    - ``ruleset``: RU property, free-form string.
    - ``board_size``: SZ property, coerced to int by sgfmill. The one
      reliably-typed field on this object.
    - ``extras``: every other root property as a str→str map. The
      forward-compat lever per the design note — KM / HA / EV / RO
      and any future SGF property flows through here untransformed.
    """
    model_config = ConfigDict(frozen=True)

    player_white: Optional[str] = None
    player_black: Optional[str] = None
    date: Optional[str] = None
    result: Optional[str] = None
    ruleset: Optional[str] = None
    board_size: Optional[int] = None
    extras: Dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_normalizer_meta(cls, meta: Dict[str, Any]) -> "SgfMetadata":
        """
        Project the normalizer's meta dict onto typed fields.

        Reads the library-facing keys (``player_white``, ``player_black``,
        ``date``, ``result``, ``ruleset``, ``board_size``, ``extras``)
        introduced in the SGF-library normalizer extension; ignores the
        legacy ``white`` / ``black`` keys the normalizer keeps for
        CardService.
        """
        return cls(
            player_white=meta.get("player_white"),
            player_black=meta.get("player_black"),
            date=meta.get("date"),
            result=meta.get("result"),
            ruleset=meta.get("ruleset"),
            board_size=meta.get("board_size"),
            extras=dict(meta.get("extras") or {}),
        )


# ─── List-view and detail-view rows ──────────────────────────────────────────


class LibraryGameListItem(BaseModel):
    """
    Projection of a ``game_source`` row for the library list endpoint.

    Excludes ``raw_content`` — the SGF body ships only via the detail
    endpoint per the column-projection discipline. Includes
    ``client_game_id`` so the frontend can open the row as a board
    using the same identifier the existing card-mint dedup path
    keys on.
    """
    model_config = ConfigDict(frozen=True)

    id: int
    client_game_id: Optional[UUID]
    player_white: Optional[str]
    player_black: Optional[str]
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    created_at: datetime


class LibraryGame(BaseModel):
    """
    Full library game row including ``raw_content``. The detail-view
    shape returned by ``GET /games/{id}``.

    ``metadata_extra`` is the JSON column's content — every SGF
    property not lifted into a typed column. Typed as
    ``Dict[str, Any]`` because the values are heterogeneous (some
    SGF properties are lists, some are structured); the column
    stores whatever the importer wrote.
    """
    model_config = ConfigDict(frozen=True)

    id: int
    client_game_id: Optional[UUID]
    player_white: Optional[str]
    player_black: Optional[str]
    date: Optional[str]
    result: Optional[str]
    ruleset: Optional[str]
    board_size: Optional[int]
    metadata_extra: Dict[str, Any]
    created_at: datetime
    raw_content: str


# ─── List request shape ──────────────────────────────────────────────────────


GameListSort = Literal[
    "created_at",
    "date",
    "player_white",
    "player_black",
    "result",
    "ruleset",
    "board_size",
]
"""
Closed vocabulary of sort columns supported by the library list
endpoint. Each value corresponds to a typed column on
``game_source`` with a compound ``(user_id, col, id)`` index. Per
ADR-0008's classification discipline — requests carrying a sort
column outside this set are 422'd, not fuzzy-matched to a
closest fit.
"""


GameListSortDirection = Literal["asc", "desc"]


class GameListFilter(BaseModel):
    """
    Filter predicates for the library list endpoint.

    All fields are optional; omitted fields don't constrain the
    query. Predicate semantics:

    - ``player_white_like`` / ``player_black_like``: substring match
      (SQL ``LIKE '%val%'``) on the respective column. Case-sensitivity
      follows the database default (SQLite: insensitive; Postgres:
      sensitive — operators should provide a citext column if
      case-insensitive search matters there).
    - ``date_from`` / ``date_to``: lexicographic comparison on the
      date string. SGF date strings are typically ISO 8601 prefix
      so lexicographic ordering aligns with chronological; if a
      collection has free-form date strings, the filter does what
      it does literally.
    - ``result_eq`` / ``ruleset_eq``: exact match.
    - ``board_size_eq``: exact int match.

    Not frozen — request models are constructed from query params
    and the construction site is the only mutation.
    """
    player_white_like: Optional[str] = None
    player_black_like: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    result_eq: Optional[str] = None
    ruleset_eq: Optional[str] = None
    board_size_eq: Optional[int] = None


# ─── Import outcomes (discriminated union) ───────────────────────────────────


class ImportOutcomeCreated(BaseModel):
    """
    A new game_source row was inserted for this SGF.

    The ``client_game_id`` UUID is stamped at insertion time and
    returned so the frontend can open the imported game as a board
    without a follow-up ``GET /games/{id}`` round-trip — the
    existing card-mint dedup path keys on the same UUID.
    """
    model_config = ConfigDict(frozen=True)

    status: Literal["created"] = "created"
    game_id: int
    client_game_id: UUID


class ImportOutcomeDeduplicated(BaseModel):
    """
    The SGF normalized to a position already in the user's library;
    the existing row's id is returned without inserting a duplicate.

    ``client_game_id`` is the existing row's UUID, which may be
    ``None`` for legacy rows that pre-date the dedup arc (rows
    minted via the card flow before ``client_game_id`` rolled out).
    The frontend handles None by falling back to ``game_id`` as
    the row's identity.
    """
    model_config = ConfigDict(frozen=True)

    status: Literal["deduplicated"] = "deduplicated"
    game_id: int
    client_game_id: Optional[UUID]


class ImportOutcomeErrored(BaseModel):
    """
    The SGF failed to parse or otherwise produced a structured
    error. The remaining files in the batch keep processing per
    the SAVEPOINT-per-file isolation contract.
    """
    model_config = ConfigDict(frozen=True)

    status: Literal["errored"] = "errored"
    error: str


ImportOutcome = Annotated[
    Union[ImportOutcomeCreated, ImportOutcomeDeduplicated, ImportOutcomeErrored],
    Field(discriminator="status"),
]
"""
Per-file outcome of a batch import. Returned in order matching the
request's ``games`` array — the frontend can correlate index N of
the outcomes list with index N of the request's input files
without an explicit identifier.
"""


class GameLibraryImportRequest(BaseModel):
    """
    Per-file input to the adapter's batch import.

    The service constructs one of these per raw SGF after the
    normalizer pass succeeds. The adapter consumes the request
    inside a SAVEPOINT — a per-row write that fails (uniqueness
    violation, dialect quirk) rolls back only that SAVEPOINT, not
    the surrounding batch transaction.

    Fields:

    - ``raw_content``: the SGF as the user supplied it, stored
      verbatim on ``game_source.raw_content``.
    - ``canonical_content`` / ``content_hash``: the normalizer's
      canonical projection, used to find or create the shared
      ``normalized_position`` row.
    - ``metadata``: typed metadata for the typed columns + the
      extras dict for ``metadata_extra``.
    """
    model_config = ConfigDict(frozen=True)

    raw_content: str
    canonical_content: str
    content_hash: bytes
    metadata: SgfMetadata
