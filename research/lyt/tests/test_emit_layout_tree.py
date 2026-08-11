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
    # minPx=280.0 (not the REPAIR PASS's 480.0, itself a revision of the
    # original transcription's 340.0): W4 FLOOR SOFTENING (Q3 ruling,
    # ledger row 1848) lowers the side column's own min again, from
    # 480px to 280px, so the tree is solver-FEASIBLE at 1280x1024/
    # 1024x700/900x600 (previously pinned INFEASIBLE below) — see the
    # encoding's own header comment ("W4 FLOOR SOFTENING") for the full
    # derivation and the disclosed, not-independently-re-swept nature of
    # this specific number.
    assert board_rail_track["kind"] == "fixed"
    assert composite_track["kind"] == "elastic"
    assert side_track["kind"] == "board-priority-clamp"
    assert side_track["minPx"] == 280.0
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
    # Every CP-* child declares a literal `min 160px` (W4 FLOOR SOFTENING,
    # Q3 ruling, ledger row 1848 -- was the shared `WRAPPER_MIN` sentinel,
    # 300px; the encoding's own "W4 FLOOR SOFTENING" header section has
    # the full derivation for why this became a per-encoding literal
    # rather than a lowered shared constant); the T node's own derived
    # floor is the componentwise max, i.e. 160px.
    assert control_panel["track"] == {"kind": "elastic", "minPx": 160.0, "frWeight": 1.0}


def test_render_ts_roundtrip_matches_committed_file():
    """The committed frontend/src/state/lyt-layout.gen.ts must be exactly
    what a fresh regeneration produces — guards against a hand-edit or a
    stale regen slipping past review (mirrors emit_ts.py's own
    determinism-test discipline)."""
    program = elt.build_program()
    text = elt.render_ts(program, registration=elt.REGISTRATIONS["landscape"])
    committed = elt.DEFAULT_OUT
    assert committed.exists(), f"{committed} missing — run emit_layout_tree.py"
    assert text == committed.read_text()


# ---------------------------------------------------------------------------
# Portrait (W3 build). Portrait's board composite is CASE B, not CASE A
# (`_apply_board_priority`'s own docstring, ported from emit_mockup.py's
# `_board_priority_tracks` -- read in full before touching these
# assertions): the composite's OWN track is capped
# (`board-priority-self-clamp`), not a sibling's (`board-priority-clamp`).
# ---------------------------------------------------------------------------

PORTRAIT = elt.REGISTRATIONS["portrait"]


def _portrait_program():
    return elt.build_program_for(PORTRAIT)


def test_portrait_root_is_v_split_with_five_children():
    program = _portrait_program()
    root = program["root"]
    assert program["classId"] == "portrait"
    assert root["kind"] == "split"
    assert root["axis"] == "v"
    assert root["gapPx"] == 12.0
    assert len(root["children"]) == 5


def test_portrait_default_visible_by_path_matches_toggle_targets():
    """Mirrors emit_mockup.py's TOGGLE_TARGETS["portrait"] table (that
    module's own docstring is the ledger-cited source): boardRail (path
    0) and previewBoard (path 4.2) are the only two default-off slots;
    A_top (1), the board composite (2), I_engine (3), tree (4.0), and the
    control-panel T-node (4.1) are all default-visible."""
    program = _portrait_program()
    root = program["root"]

    board_rail = _find(root["children"], "0")
    assert board_rail["node"]["widget"] == "boardRail"
    assert board_rail["presenceDefaultVisible"] is False
    assert board_rail["track"] == {"kind": "fixed", "px": 168.0}

    for path in ("1", "2", "3"):
        assert _find(root["children"], path)["presenceDefaultVisible"] is True

    row = _find(root["children"], "4")["node"]["children"]
    tree = _find(row, "4.0")
    control_panel = _find(row, "4.1")
    preview = _find(row, "4.2")
    assert tree["presenceDefaultVisible"] is True
    assert control_panel["presenceDefaultVisible"] is True
    assert preview["node"]["widget"] == "previewBoard"
    assert preview["presenceDefaultVisible"] is False


def test_portrait_board_priority_self_clamp_applied_to_composite_only():
    """CASE B (module docstring): the recognized board-composite shape at
    portrait's root (path 2, V(B[aspect 1], I_board[24px], A_board[28px]))
    has composite.axis ('v') == root.axis ('v') -- the composite's OWN
    track is overridden, not a sibling's. Hand-computed expectation from
    encodings/lengyue_portrait.lyt's own sizing numbers: fixed_sum =
    I_board(24px) + A_board(28px) = 52px; root.axis == 'v' means the
    cross axis is width, so naturalCrossUnit == 'vw' (NOT 'vh' -- root
    partitions HEIGHT, so its cross dimension, and the composite's own
    since composite.axis == root.axis, is WIDTH). No independent minPx/
    maxPx on this shape (see this module's own docstring on the
    'board-priority-self-clamp' union member)."""
    program = _portrait_program()
    root = program["root"]

    board_rail_track = _find(root["children"], "0")["track"]
    a_top_track = _find(root["children"], "1")["track"]
    composite_track = _find(root["children"], "2")["track"]
    i_engine_track = _find(root["children"], "3")["track"]

    assert board_rail_track["kind"] == "fixed"
    assert a_top_track["kind"] == "fixed"
    assert i_engine_track["kind"] == "fixed"

    assert composite_track == {
        "kind": "board-priority-self-clamp",
        "naturalCrossUnit": "vw",
        "fixedSiblingSumPx": 52.0,
    }


def test_portrait_control_panel_blackbox_floor_is_wrapper_min_derived():
    program = _portrait_program()
    root = program["root"]
    row = _find(root["children"], "4")["node"]["children"]
    control_panel = _find(row, "4.1")
    assert control_panel["node"]["kind"] == "blackbox"
    assert control_panel["node"]["widget"] == "controlPanel"
    assert control_panel["node"]["childWidgets"] == [
        "CP-library", "CP-cards", "CP-settings", "CP-analysis", "CP-other",
    ]
    # Every CP-* child declares `min 200px` (encoding's own header note,
    # not WRAPPER_MIN -- portrait spells this out literally); the T
    # node's own derived floor is the componentwise max, i.e. 200px.
    assert control_panel["track"] == {"kind": "elastic", "minPx": 200.0, "frWeight": 1.0}


def test_portrait_render_ts_roundtrip_matches_committed_file():
    """The committed frontend/src/state/lyt-layout-portrait.gen.ts must be
    exactly what a fresh regeneration produces (same discipline as
    landscape's own roundtrip test above)."""
    program = _portrait_program()
    text = elt.render_ts(program, registration=PORTRAIT)
    committed = PORTRAIT.default_out
    assert committed.exists(), f"{committed} missing — run emit_layout_tree.py --registration portrait"
    assert text == committed.read_text()


def test_registrations_default_out_paths():
    """Landscape keeps its historical output path; portrait gets its own
    new sibling file -- the shape the parallel Vue-realization task's own
    brief assumes (a NEW SEPARATE lyt-layout-portrait.gen.ts, not a
    second const folded into the existing file)."""
    assert elt.REGISTRATIONS["landscape"].default_out == elt.DEFAULT_OUT
    assert elt.REGISTRATIONS["landscape"].default_out.name == "lyt-layout.gen.ts"
    assert elt.REGISTRATIONS["portrait"].default_out == elt.DEFAULT_OUT_PORTRAIT
    assert elt.REGISTRATIONS["portrait"].default_out.name == "lyt-layout-portrait.gen.ts"


def test_cli_registration_portrait_writes_matching_content(tmp_path):
    """--registration portrait (redirected via --out to a tmp path, so
    this test has no side effect on the committed tree) writes exactly
    what render_ts(build_program_for(PORTRAIT), registration=PORTRAIT)
    produces."""
    out = tmp_path / "lyt-layout-portrait.gen.ts"
    rc = elt.main(["--registration", "portrait", "--out", str(out)])
    assert rc == 0
    assert out.exists()
    expected = elt.render_ts(_portrait_program(), registration=PORTRAIT)
    assert out.read_text() == expected


def test_cli_default_registration_is_landscape(tmp_path):
    """No --registration flag reproduces this script's pre-W3 behavior
    (landscape) exactly -- exercised end-to-end via --out redirection
    (so this test has no side effect on the committed tree) rather than
    by introspecting argparse defaults in isolation."""
    out = tmp_path / "lyt-layout.gen.ts"
    rc = elt.main(["--out", str(out)])
    assert rc == 0
    expected = elt.render_ts(elt.build_program(), registration=elt.REGISTRATIONS["landscape"])
    assert out.read_text() == expected
