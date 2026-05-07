"""
tests/fakes/normalizer.py

In-memory fake for ``PositionNormalizerPort``. Used by service-level
tests to drive ``CardService.create_card`` without parsing real SGF.

The fake is deterministic: the canonical content is the input with
leading/trailing whitespace stripped, the content_hash is the SHA-256
of the canonical content, and the metadata dict is whatever the
caller pre-loaded via ``set_metadata`` (defaulting to an empty dict).

A ``raises_for(content)`` mode lets a test exercise the
``ValueError → InvalidInputError`` translation without crafting
malformed SGF: the fake raises ``ValueError`` on a configured input.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional

from domain.normalizer import NormalizedPosition


class FakeNormalizer:
    """
    Structural match for ``PositionNormalizerPort``. Construction takes
    no arguments; behaviour is configured via the helper methods.

    Usage::

        n = FakeNormalizer()
        n.set_metadata("(;FF[4])", {"white": "Alice", "black": "Bob"})
        n.raises_for("(;malformed")  # ValueError on this exact input

    Then pass to a service::

        svc = CardService(repository=..., normalizer=n, read_repository=...)
    """

    def __init__(self) -> None:
        self._metadata: Dict[str, Dict[str, Any]] = {}
        self._raises: Dict[str, str] = {}

    def set_metadata(self, raw_content: str, metadata: Dict[str, Any]) -> None:
        """Pre-load the metadata returned for a specific raw content."""
        self._metadata[raw_content] = dict(metadata)

    def raises_for(self, raw_content: str, message: str = "malformed") -> None:
        """Configure the fake to raise ValueError when handed this input."""
        self._raises[raw_content] = message

    def normalize(self, raw_content: str) -> NormalizedPosition:
        if raw_content in self._raises:
            raise ValueError(self._raises[raw_content])
        canonical = raw_content.strip()
        return NormalizedPosition(
            canonical_content=canonical,
            content_hash=hashlib.sha256(canonical.encode()).digest(),
            metadata=self._metadata.get(raw_content, {}),
        )
