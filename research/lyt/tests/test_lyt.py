"""pytest coverage for the LYT prototype, per the build commission's
required minimum: a well-formed encoding solves; a content-driven-sizing
description is rejected; an L2-violating description is rejected. Also
covers the third typed prohibition this prototype independently
discovered/enforces (untypable system+release presence) and one
end-to-end CP-SAT solve sanity check (board is square, root fills the
viewport, no negative rectangles).
"""
from pathlib import Path

import pytest

import loader
from errors import LytLoadError
from compiler import solve_lexicographic

ENCODINGS_DIR = Path(__file__).parent.parent / "encodings"


def _load(name: str):
    text = (ENCODINGS_DIR / f"{name}.lyt").read_text()
    return loader.load_layouts(text)


@pytest.mark.parametrize(
    "filename,layout_name",
    [
        ("q5go", "q5go"),
        ("ogs", "ogs"),
        ("lengyue_landscape", "lengyue-landscape"),
        ("lengyue_portrait", "lengyue-portrait"),
        ("current_row_repaired", "current-row-repaired"),
    ],
)
def test_well_formed_encoding_loads(filename, layout_name):
    layouts = _load(filename)
    assert layout_name in layouts


def test_well_formed_encoding_solves():
    """A well-formed encoding (q5go, at a screen size where it's
    geometrically feasible — see the build report for why landscape sizes
    are NOT all feasible for every encoding) actually solves via CP-SAT,
    end to end, with a sane board rectangle."""
    layouts = _load("q5go")
    slot = layouts["q5go"]
    result = solve_lexicographic(
        slot,
        class_id="test",
        w_px=1920,
        h_px=1080,
        board_widget="B",
        reach_preferred_widgets=["A", "I"],
        time_limit_s=30,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    board_path = [p for p, w in result.leaf_names.items() if w == "B"][0]
    board_rect = result.rects[board_path]
    assert board_rect.w == board_rect.h  # aspect 1
    assert board_rect.w > 0
    root_rect = result.rects["root"]
    assert root_rect.w == 1920
    assert root_rect.h == 1080
    for rect in result.rects.values():
        assert rect.x >= 0 and rect.y >= 0 and rect.w >= 0 and rect.h >= 0


def test_content_driven_sizing_is_rejected():
    """Typed prohibition #1 (§4.2 line 344-345): 'max CONTENT' is the
    document's own spelling-out of content-driven sizing. It must be
    refused at load time with a structured, machine-checkable error."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_content")
    assert exc_info.value.detail.get("prohibition") == "content-driven-sizing"


def test_system_release_presence_is_rejected():
    """Typed prohibition #2 (§4.1 line 268): the (by='system',
    hidden='release') presence combination is untypable."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_presence")
    assert exc_info.value.detail.get("prohibition") == "system-release-presence"


def test_l2_violation_is_rejected():
    """L2 (zero-standing-cost affordances, §4.2 line 371-380): the
    sidebar-collapse rail standing alone as a dedicated split child is the
    document's own worked example of a violation."""
    with pytest.raises(LytLoadError) as exc_info:
        _load("current_row_wart_l2")
    assert exc_info.value.detail.get("law") == "L2"
    assert len(exc_info.value.detail.get("violations", [])) == 1


def test_l2_conformer_does_not_raise():
    """The board/tree/controls toggle cluster riding the nav bar (§5.1
    line 481-482) is the document's own named L2 CONFORMER — make sure the
    checker doesn't flag it (a checker that flags everything chrome/action
    would pass the violation test above for the wrong reason)."""
    layouts = _load("current_row_repaired")
    assert "current-row-repaired" in layouts  # loads clean, i.e. no L2 raise anywhere in the tree


def test_unknown_domain_is_rejected():
    """A basic ADR-0002 sanity check independent of the two named
    prohibitions: an unrecognized domain literal must be refused, not
    silently coerced."""
    from parser import parse_layouts

    raws = parse_layouts("layout bogus = {min 0px, pref 0px, max inf} X[not-a-real-domain]")
    with pytest.raises(LytLoadError):
        loader.load_slot(raws[0].slot)
