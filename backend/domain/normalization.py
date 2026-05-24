"""
domain/normalization.py — SGF normalization and metadata extraction.

Pure function `normalize_sgf` turns a raw SGF string into:
  - canonical content (main line + setup, no variations or comments),
  - SHA-256 content hash for dedup,
  - a metadata dict surfacing the SGF's root properties.

The metadata shape is dict-typed (Dict[str, Any]) rather than a
typed value object because:
  1. CardService reads only `meta["white"]` and `meta["black"]` and
     has done so since before the SGF-library arc; preserving those
     keys with their "Unknown" fallback is a backward-compat
     requirement.
  2. The new library-facing keys (date, result, ruleset, board_size,
     extras) coexist in the same dict; the GameLibraryService projects
     them onto the SgfMetadata typed value object at its layer
     boundary.

License: Public Domain (The Unlicense)
"""
import hashlib
from typing import Any, Dict
from sgfmill import sgf


# Properties that are part of the canonical position (move/setup) or
# that we surface as typed metadata keys. These are NOT included in
# the extras dict — typed keys avoid double-counting, move/setup
# properties belong on the board, not in metadata.
_TYPED_METADATA_PROPERTIES = frozenset({"PB", "PW", "DT", "RE", "RU", "SZ"})
_MOVE_SETUP_PROPERTIES = frozenset({"B", "W", "AB", "AW", "AE"})
_EXTRAS_EXCLUDED = _TYPED_METADATA_PROPERTIES | _MOVE_SETUP_PROPERTIES


def _get_optional_str(root, prop: str) -> str | None:
    """Return the SGF property as a stripped string, or None if absent."""
    if not root.has_property(prop):
        return None
    value = root.get(prop)
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _extract_extras(root) -> Dict[str, str]:
    """
    Project every non-typed, non-move SGF property at the root into a
    str→str extras dict using the property's raw byte representation
    (decoded UTF-8 with replacement on invalid bytes).

    Per the SGF-library design note: extras is the forward-compat
    lever — any property the typed columns don't carry (KM, HA, EV,
    RO, GN, GC, ON, OT, BR, WR, BL, WL, TM, OS, AN, US, CP, etc.)
    flows through here untransformed. The raw-byte representation
    preserves the original SGF token rather than imposing a type
    coercion the typed-column escapes; the typed columns are the
    place type coercion happens.
    """
    extras: Dict[str, str] = {}
    for prop in root.properties():
        if prop in _EXTRAS_EXCLUDED:
            continue
        try:
            raw_values = root.get_raw_list(prop)
        except KeyError:
            continue
        if not raw_values:
            continue
        # Multi-value properties (rare at the root for metadata
        # purposes) collapse to a newline-joined string. Per ADR-0002,
        # we surface the full content rather than silently dropping
        # extra values.
        decoded = [v.decode("utf-8", errors="replace") for v in raw_values]
        extras[prop] = "\n".join(decoded) if len(decoded) > 1 else decoded[0]
    return extras


def normalize_sgf(raw_sgf: str) -> Dict[str, Any]:
    """
    Pure function: standardize SGF content, generate a content hash,
    and surface the root metadata.

    Returns a dict with three keys:
      - "content": the canonical SGF (main line + setup, no variations,
        no comments). The dedup key on `normalized_position`.
      - "hash": SHA-256 of the canonical content.
      - "meta": a dict carrying both legacy keys (white, black with
        "Unknown" fallback for CardService backward-compatibility) and
        the SGF-library typed keys (date, result, ruleset, board_size
        as int-or-None) plus an "extras" sub-dict for every other
        root property.

    Per ADR-0002: malformed SGFs raise ValueError; the service-layer
    boundary translates that into a structured ImportOutcomeErrored
    or an InvalidInputError as appropriate.
    """
    try:
        game = sgf.Sgf_game.from_string(raw_sgf)
    except Exception as e:
        raise ValueError(f"SGF Parsing Error: {e}")

    root = game.get_root()
    size = game.get_size()

    # Create canonical game
    clean_game = sgf.Sgf_game(size=size)
    clean_root = clean_game.get_root()

    # Preserve only essential setup properties
    for prop in ["AB", "AW", "SZ", "KM", "HA"]:
        if root.has_property(prop):
            clean_root.set(prop, root.get(prop))

    # Traverse main line only to strip variations/comments
    curr = root
    clean_curr = clean_root
    while True:
        try:
            curr = curr[0]
            color, move = curr.get_move()
            if color:
                clean_curr = clean_game.extend_main_sequence()
                clean_curr.set_move(color, move)
        except IndexError:
            break

    normalized_content = clean_game.serialise().decode("utf-8")
    pos_hash = hashlib.sha256(normalized_content.encode()).digest()

    return {
        "content": normalized_content,
        "hash": pos_hash,
        "meta": {
            # Legacy keys — CardService reads these. "Unknown" fallback
            # preserved for backward-compat per the design note.
            "white": root.get("PW") if root.has_property("PW") else "Unknown",
            "black": root.get("PB") if root.has_property("PB") else "Unknown",
            # SGF-library typed keys — None when the SGF property is
            # absent (rather than "Unknown"), so NULL flows cleanly
            # into the typed columns.
            "player_white": _get_optional_str(root, "PW"),
            "player_black": _get_optional_str(root, "PB"),
            "date": _get_optional_str(root, "DT"),
            "result": _get_optional_str(root, "RE"),
            "ruleset": _get_optional_str(root, "RU"),
            "board_size": size,
            "extras": _extract_extras(root),
        },
    }
