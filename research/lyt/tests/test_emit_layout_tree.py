"""Emitter-output tests for emit_layout_tree.py (W1 commission,
`.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §8 W1 item 1).

Covers what the build report's own test-triage table names: the compiled
program is deterministic (byte-identical re-run), the one recognized
board-composite shape gets the CASE A `board-priority-clamp` override
(not the bare elastic-capped mapping) on exactly the side V column's
track, the collapsed controlPanel blackbox leaf's floor is the
WRAPPER_MIN-derived componentwise max (300px), and the two default-off
presence slots (boardRail, previewBoard) are exactly the ones
`emit_mockup.py`'s own TOGGLE_TARGETS table marks `default_visible=False`.
"""
from pathlib import Path

import emit_layout_tree as elt


def _find(children, path: str):
    for c in children:
        if c["path"] == path:
            return c
    raise KeyError(f"no child at path {path!r} among {[c['path'] for c in children]}")


def test_build_program_deterministic():
    a = elt.build_program()
    b = elt.build_program()
    assert a == b


def test_root_is_h_split_with_three_children():
    program = elt.build_program()
    root = program["root"]
    assert root["kind"] == "split"
    assert root["axis"] == "h"
    assert root["gapPx"] == 12.0
    assert len(root["children"]) == 3


def test_board_rail_and_preview_board_are_default_off():
    program = elt.build_program()
    root = program["root"]
    board_rail = _find(root["children"], "0")
    assert board_rail["node"]["widget"] == "boardRail"
    assert board_rail["presenceDefaultVisible"] is False
    assert board_rail["track"] == {"kind": "fixed", "px": 168.0}

    row = _find(root["children"], "2")["node"]["children"]
    tree_row = _find(row, "2.3")["node"]["children"]
    preview = _find(tree_row, "2.3.2")
    assert preview["node"]["widget"] == "previewBoard"
    assert preview["presenceDefaultVisible"] is False


def test_every_other_default_visible_path_is_true():
    program = elt.build_program()
    root = program["root"]
    for path in ("1", "2"):
        assert _find(root["children"], path)["presenceDefaultVisible"] is True
    side = _find(root["children"], "2")["node"]["children"]
    for path in ("2.0", "2.1", "2.2", "2.3"):
        assert _find(side, path)["presenceDefaultVisible"] is True
    tree_row = _find(side, "2.3")["node"]["children"]
    assert _find(tree_row, "2.3.0")["presenceDefaultVisible"] is True  # tree
    assert _find(tree_row, "2.3.1")["presenceDefaultVisible"] is True  # controlPanel


def test_board_priority_clamp_applied_to_side_column_only():
    program = elt.build_program()
    root = program["root"]
    board_rail_track = _find(root["children"], "0")["track"]
    composite_track = _find(root["children"], "1")["track"]
    side_track = _find(root["children"], "2")["track"]

    # The one recognized board-composite sibling (side V column) gets the
    # CASE A closed-form override; boardRail (fixed) and the composite
    # itself (the board's own uncapped 1fr track) are untouched.
    #
    # minPx=480.0 (not the original transcription's 340.0): W1 REPAIR
    # (ledger row 1781, review finding A) raises the side column's min —
    # a disclosed, measured reservation-correction for the merged Toolbar
    # mount's real content floor. See the encoding's own header comment
    # ("REPAIR PASS") for the full measured derivation and why 480 (not
    # the first-tried 640) was chosen — the largest width that doesn't
    # regress `test_lengyue_landscape_default_valuation_solves_optimal`'s
    # existing OPTIMAL pins.
    assert board_rail_track["kind"] == "fixed"
    assert composite_track["kind"] == "elastic"
    assert side_track["kind"] == "board-priority-clamp"
    assert side_track["minPx"] == 480.0
    assert side_track["maxPx"] == 340.0 + 60.0 * 8.0  # PX_PER_CH=8.0, 340px+60ch (max unchanged)
    assert side_track["naturalBoardCrossUnit"] == "vh"  # root axis 'h' -> cross is height
    assert side_track["fixedSiblingSumPx"] == 24.0 + 28.0  # I_board + A_board
    assert side_track["parentGapPx"] == 12.0


def test_control_panel_blackbox_floor_is_wrapper_min_derived():
    program = elt.build_program()
    root = program["root"]
    side = _find(root["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    control_panel = _find(tree_row, "2.3.1")
    assert control_panel["node"]["kind"] == "blackbox"
    assert control_panel["node"]["widget"] == "controlPanel"
    assert control_panel["node"]["childWidgets"] == [
        "CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other",
    ]
    # Every CP-* child declares `min WRAPPER_MIN` (300px, loader.WRAPPER_MIN_PX);
    # the T node's own derived floor is the componentwise max, i.e. 300px.
    assert control_panel["track"] == {"kind": "elastic", "minPx": 300.0, "frWeight": 1.0}


def test_render_ts_roundtrip_matches_committed_file():
    """The committed frontend/src/state/lyt-layout.gen.ts must be exactly
    what a fresh regeneration produces — guards against a hand-edit or a
    stale regen slipping past review (mirrors emit_ts.py's own
    determinism-test discipline)."""
    program = elt.build_program()
    text = elt.render_ts(program)
    committed = elt.DEFAULT_OUT
    assert committed.exists(), f"{committed} missing — run emit_layout_tree.py"
    assert text == committed.read_text()
