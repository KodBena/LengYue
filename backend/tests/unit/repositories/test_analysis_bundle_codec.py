"""
tests/unit/repositories/test_analysis_bundle_codec.py

Pure-Python codec dispatch in
``repositories/analysis_bundle_repository.py`` — the encode /
decode round-trip for the analysis-persistence wire shape.

The codec dispatch is the module's flexibility hinge: today
``json`` and ``json+gzip`` are registered; future schemes (e.g.
``json+zstd``) plug in by adding one entry to each dispatch
table. Old rows with old scheme tags must remain readable
forever — the dispatch only grows. These tests pin that
property: a bytes-payload encoded under one scheme decodes
back to a bit-identical dict, and an unknown scheme raises
``UnknownSchemeError`` loudly per ADR-0002.

Verified:

  - Round-trip via ``json``: encode → decode == identity.
  - Round-trip via ``json+gzip``: encode → decode == identity;
    the compressed payload is shorter than the json payload
    for non-trivial data.
  - ``_encode`` raises ``UnknownSchemeError`` for an
    unregistered scheme.
  - ``_decode`` raises ``UnknownSchemeError`` for an
    unregistered scheme.
  - The dispatch table exposes both schemes (regression pin
    against accidental removal).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import json

import pytest

from domain.errors import UnknownSchemeError
from repositories.analysis_bundle_repository import (
    SCHEME_V2_BROTLI,
    _DECODERS,
    _ENCODERS,
    _decode,
    _decode_v2_brotli,
    _encode,
    _encode_v2_brotli,
)

pytestmark = pytest.mark.unit


_BUNDLE: dict = {
    "schema_version": 1,
    "records": [
        {
            "config_hash": "abc123",
            "node_id": "1.2.3",
            "packet": {
                "rootInfo": {"visits": 1500, "winrate": 0.523},
                "moveInfos": [
                    {"move": "Q16", "visits": 500, "winrate": 0.55},
                    {"move": "C4", "visits": 400, "winrate": 0.51},
                ],
            },
        },
        {
            "config_hash": "def456",
            "node_id": "1.2.4",
            "packet": {"rootInfo": {"visits": 800}},
        },
    ],
}


# ─── Dispatch table integrity ────────────────────────────────────────────────


def test_encoders_register_json_and_json_gzip():
    assert set(_ENCODERS.keys()) >= {"json", "json+gzip"}


def test_decoders_register_json_and_json_gzip():
    assert set(_DECODERS.keys()) >= {"json", "json+gzip"}


# ─── json round-trip ─────────────────────────────────────────────────────────


def test_json_encode_produces_compact_utf8_bytes():
    payload = _encode("json", _BUNDLE)
    assert isinstance(payload, bytes)
    # No whitespace separators (compact form).
    assert b": " not in payload
    assert b", " not in payload


def test_json_round_trip_is_identity():
    payload = _encode("json", _BUNDLE)
    decoded = _decode("json", payload)
    assert decoded == _BUNDLE


def test_json_decoded_dict_has_correct_shape():
    """Sanity check on what the wire actually carries."""
    payload = _encode("json", _BUNDLE)
    decoded = _decode("json", payload)
    assert decoded["schema_version"] == 1
    assert len(decoded["records"]) == 2
    assert decoded["records"][0]["packet"]["rootInfo"]["visits"] == 1500


# ─── json+gzip round-trip ────────────────────────────────────────────────────


def test_json_gzip_round_trip_is_identity():
    payload = _encode("json+gzip", _BUNDLE)
    assert isinstance(payload, bytes)
    decoded = _decode("json+gzip", payload)
    assert decoded == _BUNDLE


def test_json_gzip_payload_is_smaller_than_json_for_non_trivial_data():
    """Compression should pay off for real packet shapes."""
    json_bytes = _encode("json", _BUNDLE)
    gzip_bytes = _encode("json+gzip", _BUNDLE)
    assert len(gzip_bytes) < len(json_bytes)


def test_json_gzip_payload_is_not_plain_json():
    """Smoke check — a gzipped payload should not parse as JSON."""
    gzip_bytes = _encode("json+gzip", _BUNDLE)
    with pytest.raises(Exception):
        json.loads(gzip_bytes.decode("utf-8", errors="replace"))


# ─── Cross-scheme decode (an old scheme can still be read) ────────────────────


def test_old_json_payload_remains_readable_after_write_scheme_changes():
    """
    The whole point of the dispatch table is forward compatibility:
    a row written with `json` years ago still decodes correctly
    even if the current write scheme is `json+gzip`.
    """
    json_payload = _encode("json", _BUNDLE)
    decoded = _decode("json", json_payload)
    assert decoded == _BUNDLE


# ─── UnknownSchemeError on unregistered tags ─────────────────────────────────


def test_encode_unknown_scheme_raises_unknown_scheme_error():
    with pytest.raises(UnknownSchemeError) as exc_info:
        _encode("json+zstd", _BUNDLE)
    assert "json+zstd" in str(exc_info.value)


def test_decode_unknown_scheme_raises_unknown_scheme_error():
    with pytest.raises(UnknownSchemeError) as exc_info:
        _decode("json+zstd", b"\x00\x01")
    assert "json+zstd" in str(exc_info.value)


# ─── v2-brotli codec — bytes ↔ bytes ─────────────────────────────────────────


def test_scheme_v2_brotli_tag_is_stable():
    """Pin the scheme tag string — changing it would orphan every
    v2 row written under the old tag (UnknownSchemeError on read)."""
    assert SCHEME_V2_BROTLI == "v2-brotli"


def test_v2_brotli_round_trip_is_identity_on_random_bytes():
    """The v2 codec is bytes-in / bytes-out; it doesn't interpret
    its input. Verify with bytes that span the byte range (not
    JSON-shaped) since the SPA's pre-encoded payload is arbitrary
    binary."""
    raw = bytes(range(256)) * 4  # 1024 bytes covering every value
    payload = _encode_v2_brotli(raw)
    assert isinstance(payload, bytes)
    decoded = _decode_v2_brotli(payload)
    assert decoded == raw


def test_v2_brotli_round_trip_is_identity_on_realistic_spa_shape():
    """The expected v2 input — a JSON-projected, uniformly-quantised
    bundle — compresses well under brotli. Approximate the shape
    with a redundant-byte payload."""
    raw = (b'{"k":"v",' * 1000) + b"}"
    payload = _encode_v2_brotli(raw)
    decoded = _decode_v2_brotli(payload)
    assert decoded == raw


def test_v2_brotli_payload_is_smaller_than_input_for_redundant_data():
    """Compression should pay off for the expected v2 payload
    shape (post-projection, mostly small floats and repeated
    field names)."""
    raw = (b'{"winrate":0.523,"scoreLead":2.5}' * 200)
    payload = _encode_v2_brotli(raw)
    assert len(payload) < len(raw)


def test_v2_brotli_payload_is_not_plain_bytes():
    """Smoke check — a brotli payload should not be byte-identical
    to its input."""
    raw = (b"abc" * 200)
    payload = _encode_v2_brotli(raw)
    assert payload != raw


def test_v2_brotli_round_trip_preserves_empty_input():
    """Edge case: an empty payload should round-trip cleanly. A
    bundle with no records-content would brotli-wrap to a non-empty
    brotli frame, then decompress to empty."""
    raw = b""
    payload = _encode_v2_brotli(raw)
    decoded = _decode_v2_brotli(payload)
    assert decoded == raw
