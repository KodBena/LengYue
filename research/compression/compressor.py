"""
research/compression/compressor.py

Abstract bases for the compression characterisation framework.

The class hierarchy partitions on two axes:

  - Lossless vs Lossy
    Lossless: decode(encode(p)) == p at the Python-dict level.
    Lossy:    decode(encode(p)) may differ; the subclass exposes a
              reconstruction-error metric.

  - Serialiser family
    IdentityLossless     → JSON, no codec
    PackedLossless       → schema-tagged binary, no codec
    Each generic-codec variant (gzip / zstd / brotli) IS-A its
    serialiser base, overriding only `_codec_compress` /
    `_codec_decompress`. The is-a-ness reads as "shares the
    serialiser of its parent; layers a codec on top".

Note on the IS-A choice: `JsonGzipLossless IS-A IdentityLossless`
acknowledges that Gzip and Identity share the JSON serialisation;
they differ only in whether a codec layer is applied. The base
class's `_codec_compress` is the identity transform; subclasses
override. This keeps the lineage auditable — every JSON-family
variant has Identity as its observable ancestor, every Packed
variant has Packed as its ancestor.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Compressor(ABC):
    """Abstract root. Every concrete compressor declares a `name`
    class attribute that the bench harness uses for the row label;
    every concrete compressor implements `encode` and `decode`.

    `is_lossless` (default True) is the runtime round-trip contract
    flag. Subclasses with `decode(encode(p)) != p` for some
    well-formed `p` set this to False. Note this is independent of
    inheritance from `LosslessCompressor`: a per-packet projector
    that intentionally drops unmodelled fields inherits the JSON-
    family encode/decode machinery from `LosslessCompressor` but
    declares `is_lossless = False` to be honest with the bench
    harness.

    Subclasses are not instantiated with parameters by default —
    each codec subclass carries its level / quality as a class
    attribute so the bench harness can spin a list of zero-arg
    instances. A future parameterised sweep (e.g. multiple gzip
    levels) would add an `__init__` that overrides the class
    attribute on the instance."""

    name: str
    is_lossless: bool = True

    @abstractmethod
    def encode(self, packet: dict[str, Any]) -> bytes:
        """Serialise + (optionally) compress the packet."""

    @abstractmethod
    def decode(self, blob: bytes) -> dict[str, Any]:
        """Decompress + deserialise back to the original dict.
        For Lossless: decode(encode(p)) == p. For Lossy: may
        differ; see the LossyCompressor contract."""


class LosslessCompressor(Compressor):
    """Round-trip contract: `decode(encode(p)) == p` at the
    Python-dict level. Equality here is Python's `==` on dicts —
    keys + values, value-equal element-wise. Field-order doesn't
    matter (Python dicts compare value-equal across orderings).

    The roundtrip check is a property of every Lossless subclass;
    the bench harness asserts it once per packet per compressor."""

    def roundtrip_check(self, packet: dict[str, Any]) -> bool:
        """True iff decode(encode(p)) == p. Returns False on any
        exception during the round-trip so the bench harness can
        record per-packet failures rather than aborting."""
        try:
            return self.decode(self.encode(packet)) == packet
        except Exception:
            return False


class LossyCompressor(Compressor):
    """Round-trip contract: `decode(encode(p))` may differ from
    `p`. The subclass must implement `reconstruction_error` to
    report a structured error metric the bench harness records
    alongside the byte count.

    The lossy tier is sketched here for the framework's symmetry
    but not yet populated — the first-cut sweep stays lossless,
    per the design note's experiments-shape (steps 1-3 first, lossy
    in steps 4-5)."""

    @abstractmethod
    def reconstruction_error(
        self,
        original: dict[str, Any],
        decoded: dict[str, Any],
    ) -> dict[str, float]:
        """Return a dict of error metrics keyed by name (e.g.
        `{'l_infinity_ownership': 0.012, 'l2_ownership': 0.004}`).
        The bench harness writes one column per metric to the
        per-packet CSV."""
