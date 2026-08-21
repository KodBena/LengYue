"""Smoke tests for `synthesize.py`, the joint structure+sizing CP-SAT
synthesizer (lyt-synthesis-spike, ledger row 1848, commission question 2).

Per the commission's own required minimum: "the synthesizer finds SOME
feasible tree on a trivial 3-region instance." The two full census tests
(landscape/portrait, 8/7 regions) are commission EVIDENCE, not fast unit
tests — they run in the multi-hundred-millisecond range (see the
dispatch report's own measured wall time) and are included here anyway,
at a short time limit, since the whole point of the spike is that this
joint model is fast enough to belong in a regular test suite (a claim
that would go unverified if the suite never actually ran it).
"""
import synthesize


def _trivial_regions():
    return [
        synthesize.Region("alpha", "atomic_fixed", px=100.0),
        synthesize.Region("beta", "atomic_fixed", px=150.0),
        synthesize.Region("gamma", "atomic_fixed", px=80.0),
    ]


def test_synthesize_trivial_3region_finds_feasible_tree():
    # The H/V partition equality is EXACT (no slack absorber among three
    # bare fixed-px regions, unlike the real census's elastic
    # boardComposite/blackbox) — so the class width must exactly equal
    # the sum of the three regions' `pref` plus the root's own 2 gaps
    # (GAP_PX["A"] = 12px) for the "all three placed directly under
    # root, H-oriented" branch to be satisfiable: 100 + 150 + 80 + 2*12
    # = 354. Any other w_px here would make EVERY grouping infeasible
    # (nothing left to absorb the remainder), which is a fact about this
    # trivial all-fixed instance, not a synthesizer bug — see the
    # dispatch report's own note on this exact pitfall.
    result = synthesize.synthesize(
        "landscape",
        w_px=354,
        h_px=200,
        a_slots=3,
        b_slots=2,
        c_slots=2,
        time_limit_s=10.0,
        regions_override=_trivial_regions(),
        blackbox_min_override=0.0,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.num_regions == 3
    assert result.ascii_tree is not None
    # every region name appears exactly once in the rendered tree.
    for region in _trivial_regions():
        assert result.ascii_tree.count(f"{region.id}  [") == 1


def test_synthesize_landscape_reproduces_board_max_optimum():
    """The headline finding of the spike: the joint synthesizer's stage-1
    board-width optimum matches the hand-written `lengyue_landscape.lyt`
    encoding's own board_w=1028 at 1920x1080 (all-present valuation) —
    see the dispatch report for the full comparison and the found tree's
    honest divergence from the hand-written one in STRUCTURE despite the
    matching sizing optimum."""
    result = synthesize.synthesize("landscape", w_px=1920, h_px=1080, time_limit_s=60.0)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.board_w == 1028


def test_synthesize_portrait_reproduces_board_max_optimum():
    """Same claim, portrait class: hand-written board_w=1080 at
    1080x1920 (the board reaches full viewport width — see the dispatch
    report)."""
    result = synthesize.synthesize("portrait", w_px=1080, h_px=1920, time_limit_s=60.0)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.board_w == 1080
