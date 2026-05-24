"""
tests/unit/domain/test_sgf_metadata.py

Pure-domain tests for the SGF-library normalizer extension and the
``SgfMetadata`` projection.

The normalizer's library-facing keys (``player_white``,
``player_black``, ``date``, ``result``, ``ruleset``, ``board_size``,
``extras``) are populated alongside the legacy ``white`` / ``black``
keys, which keep the "Unknown" fallback for CardService
backward-compatibility. Two properties pinned:

  1. **Library keys carry ``None`` for absent SGF properties.** The
     legacy keys ship "Unknown"; the library keys ship NULL so
     ``game_source`` columns are clean NULL rather than the
     "Unknown" sentinel string.

  2. **Extras dict carries everything else.** Properties not lifted
     to typed columns flow through ``extras`` as raw decoded
     strings. The forward-compat lever per the design note.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest

from domain.game_library import SgfMetadata
from domain.normalization import normalize_sgf

pytestmark = pytest.mark.unit


# ─── normalize_sgf — library-facing keys ─────────────────────────────────────


def test_normalize_sgf_library_keys_for_full_metadata_sgf():
    """All typed library keys populated from a richly-tagged SGF."""
    raw = (
        "(;FF[4]GM[1]SZ[19]KM[6.5]RU[Japanese]"
        "PB[Cho Chikun]PW[Lee Changho]DT[1996-03-15]RE[B+R]HA[0]"
        ";B[pd];W[dp])"
    )
    meta = normalize_sgf(raw)["meta"]
    assert meta["player_white"] == "Lee Changho"
    assert meta["player_black"] == "Cho Chikun"
    assert meta["date"] == "1996-03-15"
    assert meta["result"] == "B+R"
    assert meta["ruleset"] == "Japanese"
    assert meta["board_size"] == 19


def test_normalize_sgf_library_keys_none_when_property_absent():
    """Library keys carry None — not 'Unknown' — when properties are absent."""
    meta = normalize_sgf("(;FF[4]SZ[19];B[pd];W[dp])")["meta"]
    assert meta["player_white"] is None
    assert meta["player_black"] is None
    assert meta["date"] is None
    assert meta["result"] is None
    assert meta["ruleset"] is None
    # board_size always present — sgfmill defaults SZ to 19 if absent,
    # but here SZ is set explicitly.
    assert meta["board_size"] == 19


def test_normalize_sgf_extras_carries_non_typed_properties():
    """Non-typed root properties (KM/HA/EV/RO) land in extras."""
    raw = (
        "(;FF[4]GM[1]SZ[19]KM[6.5]HA[2]EV[Test Event]RO[Round 1]"
        ";B[pd])"
    )
    extras = normalize_sgf(raw)["meta"]["extras"]
    assert extras["KM"] == "6.5"
    assert extras["HA"] == "2"
    assert extras["EV"] == "Test Event"
    assert extras["RO"] == "Round 1"


def test_normalize_sgf_extras_excludes_typed_keys():
    """Typed-column properties (PB/PW/DT/RE/RU/SZ) are not duplicated in extras."""
    raw = (
        "(;FF[4]SZ[19]PW[Alice]PB[Bob]DT[2024-01-01]RE[B+R]RU[Chinese]"
        ";B[pd])"
    )
    extras = normalize_sgf(raw)["meta"]["extras"]
    for key in ("PB", "PW", "DT", "RE", "RU", "SZ"):
        assert key not in extras


def test_normalize_sgf_extras_excludes_move_setup_properties():
    """Move-line properties (B/W/AB/AW) are not in extras even when AB sits at the root."""
    raw = "(;FF[4]SZ[19]AB[gg][cc]AW[dd];B[ee])"
    extras = normalize_sgf(raw)["meta"]["extras"]
    assert "AB" not in extras
    assert "AW" not in extras
    assert "B" not in extras
    assert "W" not in extras


def test_normalize_sgf_legacy_keys_preserved_for_card_service():
    """The legacy white/black keys keep 'Unknown' fallback for CardService."""
    meta = normalize_sgf("(;FF[4]SZ[19];B[pd])")["meta"]
    assert meta["white"] == "Unknown"
    assert meta["black"] == "Unknown"


# ─── SgfMetadata projection ──────────────────────────────────────────────────


def test_sgf_metadata_from_normalizer_meta_full():
    """Projection reads the library-facing keys, ignoring the legacy pair."""
    raw_meta = {
        "white": "Unknown",       # legacy key, ignored
        "black": "Unknown",       # legacy key, ignored
        "player_white": "Alice",
        "player_black": "Bob",
        "date": "2024-01-01",
        "result": "W+1.5",
        "ruleset": "Chinese",
        "board_size": 19,
        "extras": {"KM": "7.5"},
    }
    md = SgfMetadata.from_normalizer_meta(raw_meta)
    assert md.player_white == "Alice"
    assert md.player_black == "Bob"
    assert md.date == "2024-01-01"
    assert md.result == "W+1.5"
    assert md.ruleset == "Chinese"
    assert md.board_size == 19
    assert md.extras == {"KM": "7.5"}


def test_sgf_metadata_from_normalizer_meta_handles_absent_extras():
    """Missing extras key projects to empty dict, not None."""
    md = SgfMetadata.from_normalizer_meta({"board_size": 19})
    assert md.extras == {}


def test_sgf_metadata_is_frozen():
    """Frozen Pydantic per the project's value-object discipline."""
    md = SgfMetadata.from_normalizer_meta({"board_size": 19})
    with pytest.raises(Exception):
        md.board_size = 9  # type: ignore[misc]
