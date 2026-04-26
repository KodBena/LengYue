"""
Go-specific position normalizer.

Implements PositionNormalizerPort by delegating to the existing
domain/normalization.py::normalize_sgf function and mapping its
dict-with-Go-specific-keys return value onto the domain-agnostic
NormalizedPosition DTO.

Why this split exists:
  - normalize_sgf is a pure function that pre-dates the Port
    abstraction. It returns a dict {"content", "hash", "meta"} with
    Go-specific semantics baked into the "meta" keys ("white",
    "black").
  - SgfNormalizer is the class that satisfies PositionNormalizerPort.
    It's a one-method adapter — its only job is to call normalize_sgf
    and translate the dict to NormalizedPosition.

Future Chess adoption writes a sibling PgnNormalizer; the abstract
Port stays unchanged. Today this file is the only domain-specific
inhabitant of the normalizer Port; item 34 may move it under a
`domains/go/` directory as part of the formal Shape-C split.
"""
from domain.normalization import normalize_sgf
from domain.normalizer import NormalizedPosition, PositionNormalizerPort


class SgfNormalizer(PositionNormalizerPort):
    """
    SGF normalizer for Go. Strips variations and non-essential metadata,
    canonicalizes move representation, and produces a SHA-256 content
    hash.

    Stateless — a single instance can serve all requests. DI constructs
    one in `api/dependencies.py::get_position_normalizer`.
    """

    def normalize(self, raw_content: str) -> NormalizedPosition:
        """
        Parse the raw SGF, canonicalize it, and wrap the result as a
        NormalizedPosition.

        Translates the legacy {"content", "hash", "meta"} dict shape
        into the domain-agnostic NormalizedPosition DTO. The "meta"
        dict passes through unchanged as `metadata` — the normalizer
        doesn't know or care how CardService consumes it.

        Propagates ValueError for malformed SGF (CardService catches
        and translates to InvalidInputError at the use-case boundary).
        """
        result = normalize_sgf(raw_content)
        return NormalizedPosition(
            canonical_content=result["content"],
            content_hash=result["hash"],
            metadata=result["meta"],
        )
