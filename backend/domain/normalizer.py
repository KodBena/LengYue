"""
Position-normalization Port — the Chess-adoption seam.

A "normalizer" turns raw domain content (an SGF for Go, a PGN for Chess,
whatever a future domain needs) into a canonical form plus a content
hash. The canonical form is what the database stores; the hash is what
detects duplicate positions across uploads. The "raw content" the user
typed is preserved separately on game_source for audit purposes — see
CardService.create_card.

This module defines:

- NormalizedPosition: the DTO the normalizer produces. Domain-agnostic
  field names (canonical_content, content_hash, metadata) — per item
  32a's generic-names addendum, this is the first place in the codebase
  where Go-specific naming ("sgf") is replaced by neutral naming.

- PositionNormalizerPort: the Protocol any normalizer implementation
  must satisfy. Go's implementation (domain/sgf_normalizer.py) wraps
  the existing normalize_sgf function. A Chess adoption would write
  a PgnNormalizer in the same shape; no other code needs to change.

The Port is a regular Protocol, not a typeclass-in-waiting: there's
only one operation (normalize) and no additional laws beyond "pure
function, no I/O, deterministic output for the same input." Most
normalizers will satisfy that trivially.

Why this lives in `domain/` rather than `adapters/`: the Port itself
is domain contract; the adapter (SgfNormalizer) is technically
domain-specific infrastructure. Per the Shape-C architecture that
item 34 will formalize, Chess adoption would add a sibling
`domains/chess/pgn_normalizer.py` rather than touching the abstract
Port. For now the flat `domain/` directory holds both — item 34
can split if needed.
"""
from typing import Any, Dict, Protocol

from pydantic import BaseModel, ConfigDict


class NormalizedPosition(BaseModel):
    """
    The result of normalizing raw content into a canonical form.

    Domain-agnostic by design:
      - canonical_content: the content string that gets stored as the
        dedup key (e.g., the SGF with metadata stripped and main-line
        only; a chess PGN with annotations removed; etc.).
      - content_hash: a cryptographic digest of canonical_content,
        used for the get-or-create upsert pattern. Bytes rather than
        hex-string to match the normalized_position.content_hash
        column type (BYTEA/BLOB). Column name aligned with this DTO's
        field name in item 34a.
      - metadata: a side-band dict of domain-specific information the
        normalizer extracted (player names, game date, etc.) that the
        orchestrating service may use but the canonical form does not
        include. Type is Dict[str, Any] precisely because the contents
        are domain-specific — the domain layer doesn't constrain what
        a normalizer can pass up.

    Frozen: once a normalizer produces a NormalizedPosition, mutation
    is a bug.
    """
    model_config = ConfigDict(frozen=True)

    canonical_content: str
    content_hash: bytes
    metadata: Dict[str, Any]


class PositionNormalizerPort(Protocol):
    """
    The contract CardService.create_card depends on.

    Any class whose `normalize(raw_content) -> NormalizedPosition`
    method matches this signature satisfies the Port. The method is
    synchronous — normalization is CPU work, not I/O, and wrapping it
    in `async def` would be a lie to the type system.

    A Chess-adoption test fake looks like:

        class FakePgnNormalizer:
            def normalize(self, raw_content: str) -> NormalizedPosition:
                return NormalizedPosition(
                    canonical_content=raw_content.strip(),
                    content_hash=hashlib.sha256(raw_content.encode()).digest(),
                    metadata={"white": "Kasparov", "black": "Deep Blue"},
                )

    Real implementations strip variations, normalize move representation,
    and extract structural metadata — but the *contract* is just:
    "raw in, canonical + hash + side-band out."
    """

    def normalize(self, raw_content: str) -> NormalizedPosition:
        """
        Turn raw content into its canonical form plus content hash
        and side-band metadata.

        Raises:
            ValueError: if the raw content is malformed. (A future
                sweep will replace this with a domain-specific error
                type; for now, raw ValueError is preserved to match
                the existing `normalize_sgf` signature.)
        """
        ...
