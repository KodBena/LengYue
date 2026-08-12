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
import loader as loader_module
import lyt_ast as ast


def _find(children, path: str):
    for c in children:
        if c["path"] == path:
            return c
    raise KeyError(f"no child at path {path!r} among {[c['path'] for c in children]}")


def _find_tagged_exclusive_slot(slot: ast.Slot, tag: str) -> ast.Slot:
    """LYT presence arc P2a: walks the RAW (unemitted) AST for the Slot
    wrapping a tagged Exclusive node, so a test can assert the emitter's
    `demote` output against the model's own `slot.presence` directly --
    independent of `emit_layout_tree.py`'s own output, per this arc's own
    'no tautology' discipline."""
    node = slot.node
    if isinstance(node, ast.Exclusive) and node.tag == tag:
        return slot
    if isinstance(node, ast.Split):
        for c in node.children:
            found = _find_tagged_exclusive_slot(c, tag)
            if found is not None:
                return found
        return None
    if isinstance(node, ast.Exclusive):
        for c in node.children:
            found = _find_tagged_exclusive_slot(c, tag)
            if found is not None:
                return found
        return None
    return None


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

    # LYT toolbar ontology reencode (2026-08-11, ledger rows 1930/1931):
    # the side column's V-split shrank from four children (A_go/I_engine/
    # A_common/tree-row) to three (A_engine/A_app/tree-row) — the
    # tree/panels/preview row's own path shifts from "2.3" to "2.2"
    # accordingly (every path-keyed consumer across the tree shares this
    # shift; see the dispatch report for the full census).
    #
    # M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): the side
    # column gains a FOURTH direct child, `A_setup` (the palette-adoption
    # presence slot, item 2) -- the tree/panels/preview row's own path
    # shifts AGAIN, "2.2" -> "2.3".
    row = _find(root["children"], "2")["node"]["children"]
    tree_row = _find(row, "2.3")["node"]["children"]
    preview = _find(tree_row, "2.3.2")
    assert preview["node"]["widget"] == "previewBoard"
    assert preview["presenceDefaultVisible"] is False


def test_every_other_default_visible_path_is_true():
    """M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): the side
    column now has FOUR direct children (`A_engine` composite, `A_app`,
    the new `A_setup`, the tree/panels row) -- path "2.2" (`A_setup`) is
    the ONE new default-OFF entry (same footing as `boardRail`/
    `previewBoard`), checked separately below rather than folded into
    this test's own "everything else defaults True" sweep; the
    tree/panels row's own path shifts "2.2" -> "2.3"."""
    program = elt.build_program()
    root = program["root"]
    for path in ("1", "2"):
        assert _find(root["children"], path)["presenceDefaultVisible"] is True
    side = _find(root["children"], "2")["node"]["children"]
    for path in ("2.0", "2.1", "2.3"):
        assert _find(side, path)["presenceDefaultVisible"] is True
    assert _find(side, "2.2")["presenceDefaultVisible"] is False  # A_setup
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
    # minPx=345.0 (not the W4 FLOOR SOFTENING pass's own 280.0): the W4
    # independent review (`.claude/dispatch-reports/lyt-w4-chrome-
    # review.md` item 6) measured that 280px live-clips
    # `SetupToolPalette.vue`'s permanently-reserved `.setup-toolkit`
    # column by up to 52px (the disclosed "not independently re-swept"
    # gap the softening pass named turned out to matter) — the measured
    # true no-clip floor is 335px, and this W4 FLOOR CORRECTION raises
    # the encoding's min to 345px (335px + a ~10px margin, the same
    # posture the REPAIR PASS above used) — see the encoding's own "W4
    # FLOOR CORRECTION" header section for the full derivation,
    # including the disclosed tension: two of the three sizes the
    # softening pass flipped to OPTIMAL under the default valuation
    # (1280x1024, 900x600) flip back to INFEASIBLE at this corrected
    # floor (1024x700 alone survives) — see
    # `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
    # in test_lyt.py for the updated pins.
    assert board_rail_track["kind"] == "fixed"
    assert composite_track["kind"] == "elastic"
    assert side_track["kind"] == "board-priority-clamp"
    assert side_track["minPx"] == 345.0
    assert side_track["maxPx"] == 340.0 + 60.0 * 8.0  # PX_PER_CH=8.0, 340px+60ch (max unchanged)
    assert side_track["naturalBoardCrossUnit"] == "vh"  # root axis 'h' -> cross is height
    assert side_track["fixedSiblingSumPx"] == 24.0 + 28.0  # I_board + A_board
    assert side_track["parentGapPx"] == 12.0


def test_control_panel_blackbox_floor_is_wrapper_min_derived():
    """`elt.build_program()`, called bare (no registration), reproduces the
    PRE-REALIZATION-WAVE behavior byte-for-byte -- `open_control_panel`
    defaults False, so the T stays fully collapsed. This is a deliberate,
    still-meaningful pin (a caller of the low-level `build_program` who
    doesn't opt in gets the old, safe default), distinct from
    `test_control_panel_exclusive_opens_library_cards_other_collapses_settings_analysis`
    below, which pins what the ACTUAL landscape registration (and therefore
    the committed `.gen.ts`) now produces."""
    program = elt.build_program()
    root = program["root"]
    side = _find(root["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    control_panel = _find(tree_row, "2.3.1")
    assert control_panel["node"]["kind"] == "blackbox"
    assert control_panel["node"]["widget"] == "controlPanel"
    # OPTION C TAB-SKELETON ENCODING (ledger row 1937) opened CP-analysis
    # and CP-settings one structural level -- `childWidgets` (documentation/
    # report-table parity only, never read by LytNode.vue's rendering) is
    # now a genuine structural fold over the T's composite children
    # (`_collect_leaf_widgets`), not the five bare CP-* names.
    #
    # M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): `settingsPane`
    # (a bare leaf before this stage) is opened ONE level further -- the
    # fold now descends into its own six named sub-panes instead of
    # stopping at the single placeholder name.
    assert control_panel["node"]["childWidgets"] == [
        "CP-library", "CP-cards",
        "settingsSubstrip",
        "SP_session", "SP_analysisEnv", "SP_cardSets",
        "SP_advancedRegistry", "SP_analysis", "SP_keybindings",
        "timelineStrip",
        "AT_basic_interval", "AT_basic_scoreLead", "AT_basic_mergedDelta",
        "AT_dist_deltaDist", "AT_dist_mistakeGap",
        "AT_stab_stability", "AT_stab_crossCorr",
        "AT_multires",
        "otherColorDebug", "otherBand",
    ]
    # REPAIR (`.claude/dispatch-reports/lyt-optionc-repair.md`, Finding 2):
    # the T(...)'s own wrapping slot now declares an EXPLICIT `min 160px`
    # (the pre-Option-C marker reservation -- see the encoding's own header
    # note), and the emitter reads that declared min directly instead of
    # re-deriving the componentwise max of the T's (now composite) children
    # -- which would otherwise leak the settings substrip's 880px interior
    # demand into this LIVE-CONSUMED track. The COMPILER's own independent
    # derivation (used for solving, not for this emitted track) still uses
    # the real componentwise max and correctly finds the region INFEASIBLE
    # at the pinned sizes (`test_lyt.py`'s own AMENDMENT 6 / Option C
    # section) -- this assertion is about the EMITTED track only, unchanged
    # from pre-Option-C behavior by design.
    #
    # STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2a, ledger rows
    # 2108/2331): the fork-1 ruling's own tree/T(...) residual-holder swap
    # PINS `T(...)` at `{min 664px, pref 664px, max 664px}` (its own
    # already-existing componentwise-max floor, dominated by CP-analysis's
    # 664px) instead of leaving it elastic (`pref 1fr, max inf`) -- `tree`
    # is the row's residual holder now. The emitted track shape changes
    # from `elastic` (minPx 160) to a plain `fixed` 664 accordingly --
    # verified directly against `emit_layout_tree.py`'s own output.
    assert control_panel["track"] == {"kind": "fixed", "px": 664.0}


def test_control_panel_exclusive_opens_library_cards_settings_other_collapses_analysis():
    """REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`,
    work item lyt-realization-exclusive-overflow) opened library/cards/other;
    analysis stayed collapsed (genuinely user-configurable at runtime — the
    encoding only models the static default configuration).

    STALE-TEST-NAME UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`, ledger rows 2007/2009/2001): SETTINGS now opens too --
    `control_panel_collapse_indices` drops `{2, 3}` -> `{3}`. This test's
    own NAME changes (the old name asserted a now-false fact) to
    `..._opens_library_cards_settings_other_collapses_analysis`; its BODY
    is updated for the new shape -- `CP-settings`'s own child is a genuine
    `split(settingsSubstrip, settingsPane)` node now (the flow-envelope
    wrap-capable substrip + the single opaque pane leaf), not a collapsed
    blackbox.

    M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): two structural
    edits. (a) The tree/panels row's own path shifts "2.2" -> "2.3" (the
    new `A_setup` sibling, item 2). (b) `settingsPane` -- the "single
    opaque pane leaf" this docstring's own prior paragraph names -- is now
    OPENED one further level (item 3, the pane-granularity fix): its own
    slot holds a `T(SP_session, SP_analysisEnv, SP_cardSets,
    SP_advancedRegistry, SP_analysis, SP_keybindings)` instead of a bare
    leaf. This T is NOT itself an `open_control_panel`-flagged Exclusive
    (only the OUTER control-panel T carries that flag), so it collapses
    to a `blackbox` node the same way the (still-collapsed) `CP-analysis`
    tab's own inner T does -- represented by its FIRST leaf's widget id
    (`SP_session`, `emit_layout_tree.py`'s own fix this stage lands, see
    that module's own updated comment), not the retired `settingsPane`
    name."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
    root = program["root"]
    side = _find(root["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    control_panel = _find(tree_row, "2.3.1")
    assert control_panel["node"]["kind"] == "exclusive"
    assert control_panel["node"]["widget"] == "controlPanel"
    assert control_panel["node"]["tag"] == "BLACK BOX"
    assert control_panel["node"]["defaultTabId"] == "library"
    ex_children = control_panel["node"]["children"]
    tab_ids = [c["tabId"] for c in ex_children]
    assert tab_ids == ["library", "cards", "settings", "analysis", "other"]
    label_keys = [c["tabLabelKey"] for c in ex_children]
    assert label_keys == [
        "app.tabs.library", "app.tabs.cards", "app.tabs.settings",
        "app.tabs.analysis", "app.tabs.other",
    ]
    kinds = {c["tabId"]: c["node"]["kind"] for c in ex_children}
    assert kinds == {
        "library": "leaf", "cards": "leaf",
        "settings": "split", "analysis": "blackbox",
        "other": "split",
    }
    library = _find(ex_children, "2.3.1.0")
    assert library["node"]["widget"] == "CP-library"
    assert library["node"]["scrollAxes"] == ["v"]
    assert library["node"]["content"] == "unbounded"
    settings = _find(ex_children, "2.3.1.2")
    assert settings["node"]["kind"] == "split"
    assert settings["node"]["axis"] == "v"
    settings_children = {c["node"]["widget"]: c for c in settings["node"]["children"]}
    assert set(settings_children) == {"settingsSubstrip", "SP_session"}
    substrip = settings_children["settingsSubstrip"]
    assert substrip["track"] == {"kind": "fixed", "px": 77.0}
    assert substrip["node"]["scrollAxes"] == []
    assert substrip["node"]["content"] == "bounded"
    pane = settings_children["SP_session"]
    assert pane["track"] == {"kind": "elastic", "minPx": 200.0, "frWeight": 1.0}
    assert pane["node"]["kind"] == "blackbox"
    assert pane["node"]["childWidgets"] == [
        "SP_session", "SP_analysisEnv", "SP_cardSets",
        "SP_advancedRegistry", "SP_analysis", "SP_keybindings",
    ]
    analysis = _find(ex_children, "2.3.1.3")
    assert analysis["node"]["widget"] == "CP-analysis"
    assert analysis["node"]["childWidgets"] == [
        "timelineStrip",
        "AT_basic_interval", "AT_basic_scoreLead", "AT_basic_mergedDelta",
        "AT_dist_deltaDist", "AT_dist_mistakeGap",
        "AT_stab_stability", "AT_stab_crossCorr",
        "AT_multires",
    ]
    other = _find(ex_children, "2.3.1.4")
    assert other["node"]["kind"] == "split"
    other_leaves = {c["path"]: c["node"]["widget"] for c in other["node"]["children"]}
    assert other_leaves == {"2.3.1.4.0": "otherColorDebug", "2.3.1.4.1": "otherBand"}
    other_color_debug = _find(other["node"]["children"], "2.3.1.4.0")
    assert other_color_debug["node"]["scrollAxes"] == []
    assert other_color_debug["node"]["content"] == "designed"
    other_band = _find(other["node"]["children"], "2.3.1.4.1")
    assert other_band["node"]["scrollAxes"] == ["v"]
    assert other_band["node"]["content"] == "unbounded"


def test_render_ts_roundtrip_matches_committed_file():
    """The committed frontend/src/state/lyt-layout.gen.ts must be exactly
    what a fresh regeneration produces — guards against a hand-edit or a
    stale regen slipping past review (mirrors emit_ts.py's own
    determinism-test discipline).

    REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
    `elt.build_program()` (bare, no registration) reproduces the PRE-wave
    "always collapse" tree — a real, distinct fact from what the CLI/committed
    file actually contains, since `main()` builds via `build_program_for`
    (which DOES pass `REGISTRATIONS["landscape"]`'s own
    `open_control_panel`/`control_panel_tab_ids`/`control_panel_collapse_indices`
    fields). Comparing against the wrong builder function silently diverged
    from what `main()` actually writes — corrected to `build_program_for`,
    the SAME call `main()` makes."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
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


def test_portrait_root_is_v_split_with_six_children():
    """M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): the root
    gains a sixth direct child, `A_setup` (item 2, palette-adoption
    presence slot -- portrait has no separate side column, so it sits at
    the root itself). [Renamed from "...five_children" -- the old name
    asserted a now-stale count.]"""
    program = _portrait_program()
    root = program["root"]
    assert program["classId"] == "portrait"
    assert root["kind"] == "split"
    assert root["axis"] == "v"
    assert root["gapPx"] == 12.0
    assert len(root["children"]) == 6


def test_portrait_default_visible_by_path_matches_toggle_targets():
    """Mirrors emit_mockup.py's TOGGLE_TARGETS["portrait"] table (that
    module's own docstring is the ledger-cited source): boardRail (path
    0) and previewBoard (path 5.2) are default-off; A_app (1, formerly
    A_top — LYT toolbar ontology reencode, 2026-08-11), the board
    composite (3), A_engine (4, formerly I_engine), and tree (5.0) are all
    default-visible.

    M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): `A_setup`
    (path 2, item 2, palette-adoption presence slot) is a THIRD
    default-off slot, inserted between `A_app` and the board composite —
    every later path shifts by one (board composite 2->3, A_engine
    3->4, tree/panels row 4->5).

    STALE-ASSERTION UPDATE (LYT presence arc P2a, `.claude/dispatch-reports/
    lyt-p2a-presence-contract.md`): the control-panel T-node (5.1) used to
    be pinned `True` here, matching the RETIRED `DEFAULT_VISIBLE_BY_PATH_
    PORTRAIT` table's own (stale, reviewer-confirmed) entry — that table
    was never updated when P1 (`.claude/dispatch-reports/lyt-p1-presence-
    model.md`) added `"BLACK BOX"` (this Exclusive's own `[BLACK BOX]` tag)
    to portrait's own default valuation's `absent_widgets`. Now that
    `presenceDefaultVisible` is DERIVED from that same valuation
    (`is_named_absent` against `runner.valuation_for_class`), this flips to
    `False` — asserted below against the model's own valuation directly
    (not against this emitter's own prior output), so this test cannot
    pass by re-encoding the same bug it is meant to catch."""
    program = _portrait_program()
    root = program["root"]

    board_rail = _find(root["children"], "0")
    assert board_rail["node"]["widget"] == "boardRail"
    assert board_rail["presenceDefaultVisible"] is False
    assert board_rail["track"] == {"kind": "fixed", "px": 168.0}

    for path in ("1", "3", "4"):
        assert _find(root["children"], path)["presenceDefaultVisible"] is True

    assert _find(root["children"], "2")["presenceDefaultVisible"] is False  # A_setup

    row = _find(root["children"], "5")["node"]["children"]
    tree = _find(row, "5.0")
    control_panel = _find(row, "5.1")
    preview = _find(row, "5.2")
    assert tree["presenceDefaultVisible"] is True
    # Derived against the MODEL's own valuation, not a literal -- the tag
    # this Exclusive node itself carries (`node["tag"]`) is exactly the
    # identity `runner.valuation_for_class`'s own `absent_widgets` names.
    # Located by searching `runner.REGISTRATIONS` for the entry that
    # declares "portrait" (mirroring `emit_layout_tree.py`'s own
    # `_runner_registration_for_class`, but re-derived here independently
    # rather than calling into that private helper -- this test's own job
    # is to check the emitter's OUTPUT against the model's fact, not to
    # exercise the emitter's own lookup machinery a second time).
    import runner as runner_module

    portrait_runner_reg = next(
        reg for reg in runner_module.REGISTRATIONS if "portrait" in reg.layout_by_class
    )
    portrait_valuation = runner_module.valuation_for_class(portrait_runner_reg, "portrait")
    assert control_panel["node"]["tag"] == "BLACK BOX"
    assert "BLACK BOX" in portrait_valuation.absent_widgets
    assert control_panel["presenceDefaultVisible"] is False
    assert preview["node"]["widget"] == "previewBoard"
    assert preview["presenceDefaultVisible"] is False


def test_portrait_board_priority_self_clamp_applied_to_composite_only():
    """CASE B (module docstring): the recognized board-composite shape at
    portrait's root (V(B[aspect 1], I_board[24px], A_board[28px])) has
    composite.axis ('v') == root.axis ('v') -- the composite's OWN track
    is overridden, not a sibling's. Hand-computed expectation from
    encodings/lengyue_portrait.lyt's own sizing numbers: fixed_sum =
    I_board(24px) + A_board(28px) = 52px; root.axis == 'v' means the
    cross axis is width, so naturalCrossUnit == 'vw' (NOT 'vh' -- root
    partitions HEIGHT, so its cross dimension, and the composite's own
    since composite.axis == root.axis, is WIDTH). No independent minPx/
    maxPx on this shape (see this module's own docstring on the
    'board-priority-self-clamp' union member).

    M2 STAGE B2b (2026-08-12, ledger rows 2073/2108/2151): the board
    composite's own path shifts 2 -> 3 and `A_engine`'s own path shifts
    3 -> 4 (the new `A_setup` sibling, item 2, inserts at path 2). The
    track SHAPE at each path is unaffected: `A_engine`'s own wrapping
    slot still declares the SAME `{60px, envelope: {...}}` sizing block
    it always did (item 1 replaces its INTERIOR with a composite `H(...)`
    of four leaves, not its own track declaration), so `_track_shape_for_
    child` (which reads a Slot's own `.sizing`, independent of node kind)
    still resolves it to `fixed`."""
    program = _portrait_program()
    root = program["root"]

    board_rail_track = _find(root["children"], "0")["track"]
    a_top_track = _find(root["children"], "1")["track"]
    composite_track = _find(root["children"], "3")["track"]
    i_engine_track = _find(root["children"], "4")["track"]

    assert board_rail_track["kind"] == "fixed"
    assert a_top_track["kind"] == "fixed"
    assert i_engine_track["kind"] == "fixed"

    assert composite_track == {
        "kind": "board-priority-self-clamp",
        "naturalCrossUnit": "vw",
        "fixedSiblingSumPx": 52.0,
    }


def test_portrait_control_panel_blackbox_floor_is_wrapper_min_derived():
    """REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
    portrait's own control-panel T is built through
    `build_program_for(PORTRAIT)`, which threads `PORTRAIT.open_control_panel`
    -- unlike the pre-wave form (this test's own name, kept unchanged so the
    delivery report can cite it by name), the T no longer collapses whole.
    library/cards/other open genuinely; analysis stays collapsed to one
    synthetic blackbox leaf (disclosed scope narrowing -- see the emitter's
    own module docstring, 'REALIZATION WAVE' section, for the
    dynamic-analysis-tabs rationale). The T's own wrapping slot's declared
    `min 200px` (portrait's pre-Option-C marker reservation, REPAIR Finding 2)
    is unaffected -- it is read directly off the Split child's own track,
    independent of whether the T's OWN interior collapses or opens.

    STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`): settings now OPENS too (`control_panel_collapse_indices`
    drops `{2, 3}` -> `{3}`) -- `CP-settings`'s own child is a genuine
    `split(settingsSubstrip, settingsPane)` node, mirroring landscape's
    own updated test.

    STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2b, ledger rows
    2073/2108/2151): the tree/panels row's own path shifts "4" -> "5"
    (the new `A_setup` sibling, item 2); `settingsPane` opens ONE further
    level (item 3) and collapses to a `blackbox` keyed by its own first
    leaf, `SP_session` (same shape as `lengyue_landscape.lyt`'s own
    updated test -- read that one's own note in full)."""
    program = _portrait_program()
    root = program["root"]
    row = _find(root["children"], "5")["node"]["children"]
    control_panel = _find(row, "5.1")
    assert control_panel["node"]["kind"] == "exclusive"
    assert control_panel["node"]["widget"] == "controlPanel"
    assert control_panel["node"]["defaultTabId"] == "library"
    tab_ids = [c["tabId"] for c in control_panel["node"]["children"]]
    assert tab_ids == ["library", "cards", "settings", "analysis", "other"]
    kinds = {c["tabId"]: c["node"]["kind"] for c in control_panel["node"]["children"]}
    assert kinds == {
        "library": "leaf", "cards": "leaf",
        "settings": "split", "analysis": "blackbox",
        "other": "split",
    }
    settings_child = _find(control_panel["node"]["children"], "5.1.2")
    assert settings_child["tabId"] == "settings"
    assert settings_child["node"]["kind"] == "split"
    settings_children = {
        c["node"]["widget"]: c for c in settings_child["node"]["children"]
    }
    assert set(settings_children) == {"settingsSubstrip", "SP_session"}
    assert settings_children["settingsSubstrip"]["track"] == {"kind": "fixed", "px": 77.0}
    assert settings_children["SP_session"]["node"]["kind"] == "blackbox"
    assert settings_children["SP_session"]["node"]["childWidgets"] == [
        "SP_session", "SP_analysisEnv", "SP_cardSets",
        "SP_advancedRegistry", "SP_analysis", "SP_keybindings",
    ]
    analysis_child = _find(control_panel["node"]["children"], "5.1.3")
    assert analysis_child["tabId"] == "analysis"
    assert analysis_child["node"]["widget"] == "CP-analysis"
    assert analysis_child["node"]["childWidgets"] == [
        "timelineStrip",
        "AT_basic_interval", "AT_basic_scoreLead", "AT_basic_mergedDelta",
        "AT_dist_deltaDist", "AT_dist_mistakeGap",
        "AT_stab_stability", "AT_stab_crossCorr",
        "AT_multires",
    ]
    # REPAIR (Finding 2): the T's own wrapping slot declares an explicit
    # `min 200px` (portrait's own pre-Option-C marker reservation); the
    # emitter reads it directly rather than re-deriving from the (now
    # composite) children -- unaffected by this wave's own opening of the
    # T's INTERIOR, since the wrapping slot's track is a fact of the SPLIT
    # child (the control-panel T's own parent Split), computed independently
    # of the T's own node-kind.
    #
    # STALE-ASSERTION UPDATE (2026-08-12, M2 stage B2a, ledger rows
    # 2108/2331): same fork-1 ruling swap as landscape's own updated test
    # (read that one's own note in full) -- `T(...)` is now PINNED at its
    # own already-existing 664px componentwise-max floor (same number as
    # landscape -- both classes' CP-analysis composite declares the
    # identical, unchanged `min 664px`), not elastic.
    assert control_panel["track"] == {"kind": "fixed", "px": 664.0}


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


# ---------------------------------------------------------------------------
# M2 STAGE F1 PORT (ledger row 2311 disposition 2): the eight realization-
# layer leaf metadata fields ported from the model-iteration loop
# experiment. See emit_layout_tree.py's own module docstring, 'M2 STAGE F1
# PORT' section, for the disclosed scope narrowing (unitAxes/wrapPolicy and
# two track-shape algorithm changes are NOT ported this stage).
# ---------------------------------------------------------------------------


def test_f1_port_leaf_fields_default_empty_for_a_plain_leaf():
    """`tree` declares none of the eight fields -- every one reads its
    byte-identical-to-pre-port default (empty list / 'v' / null)."""
    program = elt.build_program()
    side = _find(program["root"]["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    tree = _find(tree_row, "2.3.0")["node"]
    assert tree["elasticAxes"] == []
    assert tree["ceilingAxes"] == []
    assert tree["floorAxes"] == []
    assert tree["edgeAxes"] == []
    assert tree["orientation"] == "v"
    assert tree["activity"] is None
    assert tree["demote"] is None
    assert tree["envelopeStates"] is None


def test_f1_port_a_app_activity_and_demote():
    """`A_app` declares `@demote(h 616px) {..., activity occasional}` --
    verified directly against the encoding (module docstring's own
    'disclosed narrowing' paragraph names this as one of the two mainline
    leaves the port's fields are genuinely non-null for)."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
    side = _find(program["root"]["children"], "2")["node"]["children"]
    a_app = _find(side, "2.1")["node"]
    assert a_app["widget"] == "A_app"
    assert a_app["activity"] == "occasional"
    assert a_app["demote"] == {"axis": "h", "belowPx": 616.0}
    assert a_app["envelopeStates"] is None


def test_f1_port_a_setup_activity_no_demote():
    """`A_setup` declares `activity occasional` but no `@demote` (it is a
    `@toggle(user, release)` presence slot, a different presence kind)."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
    side = _find(program["root"]["children"], "2")["node"]["children"]
    a_setup = _find(side, "2.2")["node"]
    assert a_setup["widget"] == "A_setup"
    assert a_setup["activity"] == "occasional"
    assert a_setup["demote"] is None


def test_f1_port_cp_library_elastic_floor_edge():
    """`CP-library`/`CP-cards` declare `elastic h, floor v 160px, edge v
    unit` -- verified directly against the encoding. `edge v unit`
    [corrected 2026-08-12, measurement-grounded encoding pass, `.claude/
    dispatch-reports/lyt-measurement-wave.md` Measurement 1 -- a live,
    uniform 32px row pitch grounds `unit v 32px` for CP-library, superseding
    the prior `edge v item` this test's own docstring named]."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
    side = _find(program["root"]["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    control_panel = _find(tree_row, "2.3.1")["node"]
    library = _find(control_panel["children"], "2.3.1.0")["node"]
    assert library["widget"] == "CP-library"
    assert library["elasticAxes"] == ["h"]
    assert library["floorAxes"] == [{"axis": "v", "px": 160.0}]
    assert library["edgeAxes"] == [{"axis": "v", "disposition": "unit"}]
    assert library["ceilingAxes"] == []
    assert library["orientation"] == "v"


def test_f1_port_envelope_states_null_for_every_leaf_this_wave():
    """Mainline's ONE `envelope: {disconnected, connected}` declaration
    wraps the `A_engine` composite's own containing Split slot, not a bare
    leaf -- so this leaf-only field is `null` everywhere in the compiled
    landscape program this wave (see the module docstring / LytLeafNode's
    own doc-comment on `envelopeStates` for the full disclosure). A_engine
    itself is not a leaf (kind 'split'), so it is not iterated here."""
    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])

    def _walk(node):
        if node["kind"] == "leaf":
            assert node["envelopeStates"] is None, node["widget"]
        elif node["kind"] == "split":
            for c in node["children"]:
                _walk(c["node"])
        elif node["kind"] == "exclusive":
            for c in node["children"]:
                _walk(c["node"])
        # 'blackbox' carries no leaf of its own.

    _walk(program["root"])


def test_cli_default_registration_is_landscape(tmp_path):
    """No --registration flag reproduces this script's pre-W3 behavior
    (landscape) exactly -- exercised end-to-end via --out redirection
    (so this test has no side effect on the committed tree) rather than
    by introspecting argparse defaults in isolation."""
    out = tmp_path / "lyt-layout.gen.ts"
    rc = elt.main(["--out", str(out)])
    assert rc == 0
    # REALIZATION WAVE: `main()` builds via `build_program_for`, threading the
    # registration's own open_control_panel/tab-id/collapse fields — the same
    # correction as `test_render_ts_roundtrip_matches_committed_file` above.
    expected = elt.render_ts(
        elt.build_program_for(elt.REGISTRATIONS["landscape"]), registration=elt.REGISTRATIONS["landscape"]
    )
    assert out.read_text() == expected


# ---------------------------------------------------------------------------
# LYT presence arc P2a (`.claude/dispatch-reports/lyt-p2a-presence-
# contract.md`, row 2358 follow-up 1): closes the two reviewer-confirmed
# gaps P1 left in this emitter -- (a) Exclusive-node `demote`, (b)
# `presenceDefaultVisible` derived from the model's own valuation rather
# than a hand-mirrored path table. Every assertion below is checked against
# an INDEPENDENT source of truth (the raw loaded AST for (a), `runner.
# valuation_for_class` for (b)) rather than against this emitter's own
# output, per this arc's own commissioned "no tautology" discipline.
# ---------------------------------------------------------------------------


def test_landscape_control_panel_exclusive_emits_demote_matching_encoding():
    """The control-panel `T(...)[BLACK BOX]` wrapping slot declares
    `@demote(h 778px)` (encodings/lengyue_landscape.lyt's own header,
    'REPAIR' section) -- previously silently dropped by the Exclusive
    branch (the leaf branch already emitted an equivalent field; the
    Exclusive branch never did, until this arc)."""
    text = (elt.ENCODINGS_DIR / elt.LAYOUT_FILE).read_text()
    raw_slot = _find_tagged_exclusive_slot(loader_module.load_layouts(text)[elt.LAYOUT_NAME], "BLACK BOX")
    assert raw_slot is not None
    assert raw_slot.presence.kind == "demote"

    program = elt.build_program_for(elt.REGISTRATIONS["landscape"])
    side = _find(program["root"]["children"], "2")["node"]["children"]
    tree_row = _find(side, "2.3")["node"]["children"]
    control_panel = _find(tree_row, "2.3.1")["node"]
    assert control_panel["kind"] == "exclusive"
    assert control_panel["demote"] == {
        "axis": raw_slot.presence.demote_axis,
        "belowPx": raw_slot.presence.demote_below_px,
    }


def test_portrait_control_panel_exclusive_emits_demote_matching_encoding():
    """Same check as the landscape test above, against portrait's own
    `@demote(h 808px)` declaration (encodings/lengyue_portrait.lyt's own
    header) -- a DIFFERENT threshold (808 vs. 778px, per each encoding's
    own tree-floor derivation), confirming this isn't a hardcoded/shared
    constant leaking across classes."""
    text = (elt.ENCODINGS_DIR / "lengyue_portrait.lyt").read_text()
    raw_slot = _find_tagged_exclusive_slot(
        loader_module.load_layouts(text)["lengyue-portrait"], "BLACK BOX"
    )
    assert raw_slot is not None
    assert raw_slot.presence.kind == "demote"

    program = elt.build_program_for(elt.REGISTRATIONS["portrait"])
    row = _find(program["root"]["children"], "5")["node"]["children"]
    control_panel = _find(row, "5.1")["node"]
    assert control_panel["kind"] == "exclusive"
    assert control_panel["demote"] == {
        "axis": raw_slot.presence.demote_axis,
        "belowPx": raw_slot.presence.demote_below_px,
    }


def test_collapsed_blackbox_tabs_carry_null_demote_when_undeclared():
    """Sanity companion to the two tests above: a collapsed TAB's own
    blackbox (`CP-analysis`, `SP_session`) declares no `@demote` of its
    own (only the OUTER control-panel Exclusive does) -- `demote` reads
    `null` for both, on both classes, confirming the field is genuinely
    PER-SLOT (the tab's own wrapping slot), not a copy of the outer T's
    value leaking down."""
    for reg_key, side_path, row_path in (("landscape", "2", "2.3"), ("portrait", None, "5")):
        program = elt.build_program_for(elt.REGISTRATIONS[reg_key])
        if side_path is not None:
            row = _find(program["root"]["children"], side_path)["node"]["children"]
            row = _find(row, row_path)["node"]["children"]
        else:
            row = _find(program["root"]["children"], row_path)["node"]["children"]
        control_panel = next(c["node"] for c in row if c["node"]["kind"] == "exclusive")
        by_tab = {c["tabId"]: c["node"] for c in control_panel["children"]}
        assert by_tab["analysis"]["kind"] == "blackbox"
        assert by_tab["analysis"]["demote"] is None
        # CP-settings' own SP_session blackbox is nested inside the opened
        # settings split -- locate it structurally rather than assuming a
        # fixed relative path (its own path already differs between
        # classes, e.g. '2.3.1.2.1' landscape vs '5.1.2.1' portrait).
        settings_split = by_tab["settings"]
        assert settings_split["kind"] == "split"
        sp_session = next(
            c["node"] for c in settings_split["children"] if c["node"].get("widget") == "SP_session"
        )
        assert sp_session["kind"] == "blackbox"
        assert sp_session["demote"] is None
