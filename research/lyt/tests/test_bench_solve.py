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
    encodings actually solves OPTIMAL every time — a correctness smoke
    check riding on top of the timing harness, not a timing assertion."""
    results = bench_solve.bench_real_encodings(n=2, time_limit_s=20.0)
    assert len(results) == len(bench_solve.REAL_SPECS)
    for r in results:
        assert r.n_solves == 2
        assert r.status_counts.get("OPTIMAL") == 2
        assert r.mean_ms > 0.0


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
