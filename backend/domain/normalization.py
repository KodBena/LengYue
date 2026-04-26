import hashlib
from typing import Dict, Any
from sgfmill import sgf

def normalize_sgf(raw_sgf: str) -> Dict[str, Any]:
    """
    Pure Function: Standardizes SGF content and generates a unique hash.
    Ensures that metadata (PB, PW, etc.) does not affect the position identity.
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
            "white": root.get("PW") if root.has_property("PW") else "Unknown",
            "black": root.get("PB") if root.has_property("PB") else "Unknown",
        }
    }
