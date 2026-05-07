"""
tests/unit/domain/test_sgf_normalizer.py

Pure-domain tests for ``domain/normalization.py::normalize_sgf`` and
its Port-shaped wrapper ``domain/sgf_normalizer.py::SgfNormalizer``.

The normalizer is the front door for every card mint — every
``CardService.create_card`` call runs raw SGF through here on the
way to the canonical-content / content-hash dedup keys. Three
properties are pinned:

  1. **Position identity is metadata-independent.** The same moves
     with different player names produce the same canonical
     content and the same hash. This is the dedup contract: two
     uploads of "the same game" with different PB/PW values
     deduplicate to one ``normalized_position`` row.

  2. **Side-band metadata is preserved.** PB/PW are extracted into
     ``metadata`` even though they are stripped from
     ``canonical_content``. CardService consumes this side-band
     to populate ``game_source.player_white`` / ``player_black``
     without re-parsing the SGF.

  3. **Malformed SGF raises ValueError.** ADR-0002 fail-loud:
     a malformed body must surface as a ValueError that
     CardService translates to InvalidInputError → 422 at the
     route boundary.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import hashlib

import pytest

from domain.normalization import normalize_sgf
from domain.normalizer import NormalizedPosition
from domain.sgf_normalizer import SgfNormalizer

pytestmark = pytest.mark.unit


# ─── normalize_sgf — happy path ───────────────────────────────────────────────


def test_normalize_sgf_returns_content_hash_meta_dict():
    """Returns a dict with the three Go-specific keys."""
    result = normalize_sgf("(;FF[4]SZ[19];B[pd];W[dp])")
    assert set(result.keys()) == {"content", "hash", "meta"}


def test_normalize_sgf_main_line_collapses_variations():
    """
    Off-main-line variations are stripped from canonical content.
    The main line follows the first child at each fork: here
    ``B[pd] → W[dp] → B[qq]``; the alternative branch
    ``W[dq] → B[pp]`` is the off-line variation.
    """
    raw = "(;FF[4]SZ[19];B[pd](;W[dp];B[qq])(;W[dq];B[pp]))"
    result = normalize_sgf(raw)
    canonical = result["content"]
    # Main-line moves remain.
    assert "B[pd]" in canonical
    assert "W[dp]" in canonical
    assert "B[qq]" in canonical
    # The off-line branch must not appear.
    assert "W[dq]" not in canonical
    assert "B[pp]" not in canonical


def test_normalize_sgf_extracts_pw_pb_metadata():
    """PB and PW round-trip into the meta side-band."""
    raw = "(;FF[4]SZ[19]PW[Alice]PB[Bob];B[pd];W[dp])"
    result = normalize_sgf(raw)
    assert result["meta"] == {"white": "Alice", "black": "Bob"}


def test_normalize_sgf_missing_pw_pb_defaults_to_unknown():
    """Empty player metadata maps to 'Unknown' rather than raising."""
    result = normalize_sgf("(;FF[4]SZ[19];B[pd];W[dp])")
    assert result["meta"] == {"white": "Unknown", "black": "Unknown"}


def test_normalize_sgf_hash_is_sha256_of_content():
    """The hash field is SHA-256(content) — the dedup key invariant."""
    result = normalize_sgf("(;FF[4]SZ[19];B[pd];W[dp])")
    expected = hashlib.sha256(result["content"].encode()).digest()
    assert result["hash"] == expected


def test_normalize_sgf_hash_is_bytes_not_hex():
    """Hash is the raw 32-byte digest (matches BYTEA column type)."""
    result = normalize_sgf("(;FF[4]SZ[19];B[pd])")
    assert isinstance(result["hash"], bytes)
    assert len(result["hash"]) == 32


# ─── normalize_sgf — position identity is metadata-independent ────────────────


def test_normalize_sgf_same_moves_different_metadata_same_hash():
    """
    Two uploads of the same moves with different PB/PW produce the
    same canonical content and the same hash — the dedup contract.
    """
    raw_a = "(;FF[4]SZ[19]PW[Alice]PB[Bob];B[pd];W[dp])"
    raw_b = "(;FF[4]SZ[19]PW[Charlie]PB[Diana];B[pd];W[dp])"
    res_a = normalize_sgf(raw_a)
    res_b = normalize_sgf(raw_b)
    assert res_a["content"] == res_b["content"]
    assert res_a["hash"] == res_b["hash"]


def test_normalize_sgf_different_moves_different_hash():
    raw_a = "(;FF[4]SZ[19];B[pd];W[dp])"
    raw_b = "(;FF[4]SZ[19];B[qd];W[dp])"
    res_a = normalize_sgf(raw_a)
    res_b = normalize_sgf(raw_b)
    assert res_a["hash"] != res_b["hash"]


def test_normalize_sgf_preserves_essential_setup_properties():
    """SZ / KM / HA / AB / AW are kept in canonical form (board state)."""
    raw = "(;FF[4]SZ[9]KM[6.5]HA[2]AB[gg][cc];B[ee])"
    result = normalize_sgf(raw)
    canonical = result["content"]
    assert "SZ[9]" in canonical
    assert "KM[6.5]" in canonical
    assert "HA[2]" in canonical
    assert "AB" in canonical


# ─── normalize_sgf — failure mode ─────────────────────────────────────────────


def test_normalize_sgf_malformed_raises_value_error():
    """Malformed SGF must surface as ValueError per ADR-0002."""
    with pytest.raises(ValueError, match="SGF Parsing Error"):
        normalize_sgf("not an sgf")


def test_normalize_sgf_empty_string_raises_value_error():
    with pytest.raises(ValueError, match="SGF Parsing Error"):
        normalize_sgf("")


# ─── SgfNormalizer (Port wrapper) ─────────────────────────────────────────────


def test_sgf_normalizer_satisfies_port_signature():
    """The wrapper is callable with the Port-required signature."""
    norm = SgfNormalizer()
    out = norm.normalize("(;FF[4]SZ[19];B[pd];W[dp])")
    assert isinstance(out, NormalizedPosition)


def test_sgf_normalizer_translates_dict_to_dto():
    """``meta`` dict from normalize_sgf becomes ``metadata`` on the DTO."""
    raw = "(;FF[4]SZ[19]PW[Alice]PB[Bob];B[pd];W[dp])"
    norm = SgfNormalizer()
    out = norm.normalize(raw)

    assert out.canonical_content
    assert isinstance(out.content_hash, bytes)
    assert out.metadata == {"white": "Alice", "black": "Bob"}


def test_sgf_normalizer_propagates_value_error():
    """Malformed SGF reaches the use-case layer as ValueError."""
    norm = SgfNormalizer()
    with pytest.raises(ValueError):
        norm.normalize("not an sgf")


def test_sgf_normalizer_is_stateless_across_calls():
    """A single instance can serve repeated calls deterministically."""
    norm = SgfNormalizer()
    raw = "(;FF[4]SZ[19];B[pd];W[dp])"
    a = norm.normalize(raw)
    b = norm.normalize(raw)
    assert a.canonical_content == b.canonical_content
    assert a.content_hash == b.content_hash


def test_sgf_normalizer_position_dto_is_frozen():
    """NormalizedPosition is frozen per the backend authoring posture."""
    norm = SgfNormalizer()
    out = norm.normalize("(;FF[4]SZ[19];B[pd];W[dp])")
    with pytest.raises(Exception):
        out.canonical_content = "tampered"  # type: ignore[misc]
