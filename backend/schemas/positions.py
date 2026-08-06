"""
schemas/positions.py

Wire-layer DTOs for the stateless position-hashing endpoint
(``POST /positions/hash``, see ``api/routes/positions.py``).

Card-position-annotations Stage A ("information fetching now" —
fetch + store + mint-dialog duplicate warning; see the ratified
design at ``.claude/dispatch-reports/card-position-annotations-design.md``,
§1 dispatch flag #2). The endpoint's job is narrow: run the caller's
raw domain content (an SGF for Go, per the currently-configured
``PositionNormalizerPort``) through the same normalizer
``CardService.create_card`` uses, and return only the resulting
content hash — no persistence, no ``CardService``, no ``user_id``
scoping on the call itself (position identity is normalizer-global,
not tenant-scoped; only *which* cards a caller owns for a given hash
is tenant-scoped, and that lookup happens client-side against the
cards the SPA already fetched).

License: Public Domain (The Unlicense)
"""
from pydantic import BaseModel, Field


class PositionHashRequest(BaseModel):
    """
    Request body for ``POST /positions/hash``.

    ``raw_content`` is the same shape ``CardCreate.raw_content``
    accepts — raw domain content in whatever form the configured
    ``PositionNormalizerPort`` expects (an SGF string for the Go
    domain). The route feeds it through the identical
    ``normalizer.normalize()`` call ``CardService.create_card`` uses,
    so "what hash would minting this content produce" is answered by
    running the *same* code path, not a parallel reimplementation.
    """

    raw_content: str = Field(
        description=(
            "The raw domain content (SGF for Go, PGN for Chess, etc.) "
            "to normalize and hash. Same shape as CardCreate.raw_content."
        ),
    )


class PositionHashResponse(BaseModel):
    """
    Response body for ``POST /positions/hash``.

    ``content_hash`` is the lowercase-hex SHA-256 digest — the same
    string representation ``domain.card.Card.content_hash`` emits on
    the wire (see ``Card._serialize_content_hash``), so a client can
    compare this endpoint's output against a card's ``content_hash``
    field with plain string equality.
    """

    content_hash: str = Field(
        description="Lowercase-hex SHA-256 digest of the normalized position.",
    )
