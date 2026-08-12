"""Smoke tests for `bench_solve.py` (lyt-synthesis-spike, ledger row 1848).

Per the commission's own "no performance-dependent flakiness" instruction
(generalizing the umbrella's "no Date-dependent flakiness" rule), this
file asserts SHAPE (a batch of N solves returns N timed samples, all
positive, with a sane status distribution) — never a wall-clock
threshold. The actual measured numbers live in the dispatch report
(`.claude/dispatch-reports/lyt-synthesis-spike.md`), not in an assertion
here that would flake under a busier CI runner.
"""
import bench_solve


def test_bench_one_smoke():
    """A trivial always-feasible zero-arg solve, run a handful of times,
    produces a well-shaped BenchResult."""
    calls = {"n": 0}

    class _FakeResult:
        status = "OPTIMAL"

    def _solve():
        calls["n"] += 1
        return _FakeResult()

    result = bench_solve.bench_one(_solve, label="fake", n=7)
    assert result.n_solves == 7
    assert calls["n"] == 7
    assert result.mean_ms >= 0.0
    assert result.min_ms <= result.mean_ms <= result.max_ms
    assert 0.0 <= result.p95_ms
    assert result.status_counts == {"OPTIMAL": 7}


def test_bench_real_encodings_smoke():
    """A tiny batch (n=2) against the real landscape/portrait/as-is
    encodings actually solves — a correctness smoke check riding on top of
    the timing harness, not a timing assertion.

    OPTION C TAB-SKELETON ENCODING (ledger row 1937) update, 2026-08-11
    (`.claude/dispatch-reports/lyt-optionc-review.md` Finding 1 /
    `.claude/dispatch-reports/lyt-optionc-repair.md`): `lengyue-
    landscape@1920x1080` genuinely flips from `OPTIMAL` to `INFEASIBLE`
    once the control-panel T's interior is honestly modeled -- the
    settings sub-tab strip's ch-measured width demand (~838px, corrected
    per Finding 3) exceeds the side column's own pre-existing, separately-
    ratified `max 340px+60ch` (820px) cap, independently of screen size
    (the column's own `max` is a hard cap, not a per-size quantity). This
    is a real geometry fact this wave's own modeling correctly surfaces,
    not a solver defect or a regression this test should paper over by
    weakening its assertion for every spec -- the other two specs
    (portrait, whose narrower composite floors happen to still fit its own
    column cap at this size; the as-is baseline, untouched by this wave's
    interior modeling) are asserted OPTIMAL exactly as before, so this
    test still catches a genuine regression on either of THOSE two specs.
    The landscape INFEASIBLE finding, and the 820px-vs-~838px tension it
    surfaces, is left for the commissioner (see the repair report's own
    Finding 3 section) -- this test only pins the now-honest status, it
    does not adjudicate a remedy.

    STALE-ASSERTION UPDATE (2026-08-11, work item `lyt-settings-live-
    opening`, ledger rows 2007/2009): the flow-envelope settings-substrip
    fix (`research/lyt/flow.py`) drops the settings composite's floor
    838px -> 443px, well under the 820px cap this test's own docstring
    names — `lengyue-landscape@1920x1080` (this spec prunes
    boardRail/previewBoard absent, i.e. the SAME solve as the "default"
    valuation `test_generated_pages_embed_valid_overlay_json_matching_
    overlay_sizes` also pins) returns to OPTIMAL, verified directly.
    `known_infeasible` is now empty; every spec is asserted OPTIMAL."""
    results = bench_solve.bench_real_encodings(n=2, time_limit_s=20.0)
    assert len(results) == len(bench_solve.REAL_SPECS)
    by_label = {r.label: r for r in results}
    known_infeasible: set = set()
    for r in results:
        assert r.n_solves == 2
        assert r.mean_ms > 0.0
        if r.label in known_infeasible:
            assert r.status_counts.get("INFEASIBLE") == 2, (
                f"{r.label}: expected the known, disclosed INFEASIBLE finding "
                f"(settings-substrip demand vs. the side column's pre-existing "
                f"max cap) both solves; got {r.status_counts!r}"
            )
        else:
            assert r.status_counts.get("OPTIMAL") == 2, (
                f"{r.label}: expected OPTIMAL both solves (not one of the "
                f"disclosed Option C infeasibilities); got {r.status_counts!r}"
            )
    assert set(by_label) == {
        "lengyue-landscape@1920x1080",
        "lengyue-portrait@1080x1920",
        "current-row-asis@1920x1080",
    }


def test_bench_synthetic_smoke():
    """The synthetic flat-H generator produces a solvable program at a
    few small slot counts, and the harness times it without error."""
    results = bench_solve.bench_synthetic(n=2, slot_counts=[5, 10], time_limit_s=20.0)
    assert len(results) == 2
    for r in results:
        assert r.n_solves == 2
        assert r.status_counts.get("OPTIMAL") == 2


def test_make_synthetic_flat_h_slot_count():
    """The synthetic program's own child count matches the requested
    slot count exactly — a structural sanity check independent of the
    solver."""
    slot = bench_solve._make_synthetic_flat_h(12)
    assert len(slot.node.children) == 12
