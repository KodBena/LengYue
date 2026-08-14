"""Benchmark harness for the existing CP-SAT sizing solve (`compiler
.solve_lexicographic`), commissioned as the first half of the lyt-
synthesis-spike (ledger row 1848): before asking whether an exterior
enumeration/synthesis approach over layout STRUCTURE is viable at all,
measure honestly how expensive a single, already-fixed-structure sizing
solve is. This bounds what any structure search built ON TOP of that
solve could ever afford — if one sizing solve costs N milliseconds, an
enumeration that calls the solver once per candidate tree is budgeted at
roughly (budget_seconds / N) candidate trees, full stop.

Two workloads:

1. **The real encodings** (`encodings/lengyue_landscape.lyt`,
   `encodings/lengyue_portrait.lyt`, `fixtures/transcription/current_row_asis.lyt`) —
   solved via the SAME entry point `runner.py` uses
   (`loader.load_layouts` + `presence.resolve_and_validate` +
   `compiler.solve_lexicographic`), at each registration's own
   representative screen size(s), batched.
2. **Synthetic flat-H programs** at 5/10/20/40 leaf slots — a single `H`
   split of N fixed-`{28px}` action leaves plus one `{pref 1fr}` elastic
   leaf, sized against a 1920x1080 root. This isolates how solve time
   scales with slot COUNT alone, decoupled from the real encodings' own
   fixed shape (5 real encodings only ever exercise 6-20-ish slots each;
   this probes further out, per the commission's request for 5/10/20/40).

Each workload reports **wall time per solve**, batched (`BATCH_N` repeats
per data point, mean + p95), never a single untrusted sample — per the
umbrella's own probe-before-trust posture for anything that will inform a
downstream judgment call (here: "is exterior enumeration over structure
viable"). Machine context (CPU count, load average, the `nice -n 19`
this harness is invoked under) is printed alongside every table, since
wall-clock numbers without that context are not honestly comparable
across runs.

Not a pytest suite of its own regression assertions on TIMING (timing
assertions are flaky by nature, forbidden per the commission's own
"no Date-dependent flakiness" instruction, generalized to "no
performance-dependent flakiness") — `tests/test_bench_solve.py` (naming
convention: colocated in `tests/`, imports this module) is a SMOKE test
only: does `bench_one` return a well-shaped, positive result on a small
input, not "is it under X ms".
"""
from __future__ import annotations

import argparse
import platform
import statistics
import time
from dataclasses import dataclass
from typing import Callable, List, Optional

import lyt_ast as ast
import loader
from compiler import solve_lexicographic
from presence import ALL_PRESENT, resolve_and_validate
from runner import is_governed_encoding, resolve_encoding_file, source_file_label


@dataclass
class BenchResult:
    label: str
    n_solves: int
    mean_ms: float
    p95_ms: float
    min_ms: float
    max_ms: float
    status_counts: dict  # e.g. {"OPTIMAL": 1000} or {"INFEASIBLE": 1000}


def _percentile(sorted_vals: List[float], pct: float) -> float:
    """Nearest-rank percentile — no interpolation, no numpy dependency for
    a spike this small. `pct` in [0, 100]."""
    if not sorted_vals:
        return 0.0
    k = max(0, min(len(sorted_vals) - 1, int(round(pct / 100.0 * (len(sorted_vals) - 1)))))
    return sorted_vals[k]


def bench_one(
    solve_fn: Callable[[], object],
    *,
    label: str,
    n: int,
    build_fn: Optional[Callable[[], object]] = None,
) -> BenchResult:
    """Runs `solve_fn()` (a zero-arg callable that performs exactly ONE
    CP-SAT solve and returns its `SolveResult`) `n` times, timing only the
    solve call itself — `build_fn`, if given, is called once beforehand
    and its result is NOT part of any timed iteration (used by the real-
    encoding benchmarks to hoist the one-time parse+load+presence-prune
    cost, which is a fixed, tiny, one-shot cost per program and would
    otherwise dilute what this benchmark is actually measuring: the
    SOLVE's own per-call cost, which is what a structure-search loop would
    pay on every candidate)."""
    if build_fn is not None:
        build_fn()
    times_ms: List[float] = []
    status_counts: dict = {}
    for _ in range(n):
        t0 = time.perf_counter()
        result = solve_fn()
        t1 = time.perf_counter()
        times_ms.append((t1 - t0) * 1000.0)
        status_counts[result.status] = status_counts.get(result.status, 0) + 1
    times_sorted = sorted(times_ms)
    return BenchResult(
        label=label,
        n_solves=n,
        mean_ms=statistics.mean(times_ms),
        p95_ms=_percentile(times_sorted, 95),
        min_ms=min(times_ms),
        max_ms=max(times_ms),
        status_counts=status_counts,
    )


# --- Workload 1: the real encodings ----------------------------------------


@dataclass
class RealBenchSpec:
    name: str
    files: List[str]
    layout_name: str
    board_widget: str
    w_px: int
    h_px: int
    absent_widgets: frozenset = frozenset()


REAL_SPECS: List[RealBenchSpec] = [
    RealBenchSpec(
        name="lengyue-landscape@1920x1080",
        files=["lengyue_landscape.lyt"],
        layout_name="lengyue-landscape",
        board_widget="B",
        w_px=1920,
        h_px=1080,
        absent_widgets=frozenset({"boardRail", "previewBoard"}),
    ),
    RealBenchSpec(
        name="lengyue-portrait@1080x1920",
        files=["lengyue_portrait.lyt"],
        layout_name="lengyue-portrait",
        board_widget="B",
        w_px=1080,
        h_px=1920,
        absent_widgets=frozenset({"boardRail", "previewBoard"}),
    ),
    RealBenchSpec(
        # AS-IS baseline needs its own waivers to load (L2-non-conformant
        # by disclosed design, see baseline.py) — imported lazily below
        # only for this one spec, so the other two specs (which don't
        # need it) don't pay an unnecessary import for a module this
        # benchmark otherwise has no reason to touch.
        name="current-row-asis@1920x1080",
        files=["current_row_asis.lyt"],
        layout_name="current-row-asis",
        board_widget="B",
        w_px=1920,
        h_px=1080,
    ),
]


def bench_real_encodings(*, n: int, time_limit_s: float = 20.0) -> List[BenchResult]:
    from baseline import BASELINE_WAIVERS

    results: List[BenchResult] = []
    for spec in REAL_SPECS:
        waivers = BASELINE_WAIVERS if "asis" in spec.name else {}
        # LYT relations-first amendment, dispatch C2 (ledger rows 2426/2427):
        # current_row_asis.lyt moved out of encodings/ to fixtures/
        # transcription/ -- resolve_encoding_file (runner.py's own fixture
        # resolver, same one every other consumer of Registration.files
        # uses) keeps this benchmark's file lookup working after the move,
        # rather than hardcoding ENCODINGS_DIR for a file that may no
        # longer live there.
        # RATCHET FORM, dispatch C4 (ledger rows 2396/2445): every
        # `RealBenchSpec.files` entry this workload declares is a SINGLE
        # file (confirmed directly, not assumed) — the strict-mode
        # decision is unambiguous per spec, computed from that one file's
        # own resolved path.
        resolved_paths = [resolve_encoding_file(f) for f in spec.files]
        text = "\n".join(p.read_text() for p in resolved_paths)
        layouts = loader.load_layouts(
            text,
            waivers=waivers,
            refuse_literal_bounds=is_governed_encoding(resolved_paths[0]),
            source_file=source_file_label(resolved_paths[0]),
        )
        valuation = ALL_PRESENT
        if spec.absent_widgets:
            from presence import PresenceValuation

            valuation = PresenceValuation(name="bench", absent_widgets=spec.absent_widgets)
        layouts = resolve_and_validate(layouts, [spec.layout_name], valuation)
        slot = layouts[spec.layout_name]

        def _solve(slot=slot, spec=spec):
            return solve_lexicographic(
                slot,
                class_id="bench",
                w_px=spec.w_px,
                h_px=spec.h_px,
                board_widget=spec.board_widget,
                reach_preferred_widgets=None,
                time_limit_s=time_limit_s,
            )

        results.append(bench_one(_solve, label=spec.name, n=n))
    return results


# --- Workload 2: synthetic flat-H programs at 5/10/20/40 slots -------------


def _make_synthetic_flat_h(n_slots: int) -> ast.Slot:
    """A single H split of `n_slots` children: all but the last are fixed
    `{28px}` action leaves (mirrors the real encodings' own dominant leaf
    shape — a fixed-extent toolbar strip); the last is `{pref 1fr, max
    inf}` elastic, so the partition equality has a genuine degree of
    freedom to solve for (an all-fixed split has nothing for a solver to
    decide, which would understate real solve cost). No aspect leaf here
    — this workload isolates SLOT COUNT scaling, not the aspect-relaxation
    stage (already exercised by workload 1's real encodings, which all
    have exactly one aspect leaf apiece regardless of N)."""
    px_extent = ast.Extent(unit="px", v=28.0)
    fixed_sizing = ast.Sizing(min=px_extent, pref=px_extent, max=px_extent)
    elastic_sizing = ast.Sizing(
        min=ast.Extent(unit="px", v=0.0),
        pref=ast.Extent(unit="fr", v=1.0),
        max="inf",
    )
    children = []
    for i in range(n_slots - 1):
        leaf = ast.Leaf(widget=f"w{i}", facets=frozenset({"action"}), domain="common")
        children.append(ast.Slot(node=leaf, presence=ast.FIXED, sizing=fixed_sizing))
    tail = ast.Leaf(widget="tail", facets=frozenset({"info"}), domain="common")
    children.append(ast.Slot(node=tail, presence=ast.FIXED, sizing=elastic_sizing))
    root_sizing = ast.Sizing(
        min=ast.Extent(unit="px", v=0.0), pref=ast.Extent(unit="fr", v=1.0), max="inf"
    )
    split = ast.Split(axis="h", gap_px=4.0, children=children)
    return ast.Slot(node=split, presence=ast.FIXED, sizing=root_sizing)


def bench_synthetic(*, n: int, slot_counts: List[int], time_limit_s: float = 20.0) -> List[BenchResult]:
    results: List[BenchResult] = []
    for n_slots in slot_counts:
        slot = _make_synthetic_flat_h(n_slots)

        def _solve(slot=slot):
            return solve_lexicographic(
                slot,
                class_id="bench",
                w_px=1920,
                h_px=1080,
                board_widget=None,
                reach_preferred_widgets=None,
                time_limit_s=time_limit_s,
            )

        results.append(bench_one(_solve, label=f"synthetic-flat-H-{n_slots}slots", n=n))
    return results


def _machine_context() -> str:
    try:
        load1, load5, load15 = __import__("os").getloadavg()
        load_str = f"{load1:.2f} {load5:.2f} {load15:.2f}"
    except (OSError, AttributeError):
        load_str = "unavailable"
    return (
        f"platform={platform.platform()}  python={platform.python_version()}  "
        f"cpu_count={__import__('os').cpu_count()}  loadavg(1/5/15)={load_str}"
    )


def _print_table(results: List[BenchResult]) -> None:
    print(f"{'label':38s} {'n':>6s} {'mean_ms':>10s} {'p95_ms':>10s} {'min_ms':>10s} {'max_ms':>10s} {'solves/s':>10s}  status")
    for r in results:
        solves_per_sec = 1000.0 / r.mean_ms if r.mean_ms > 0 else float("inf")
        print(
            f"{r.label:38s} {r.n_solves:6d} {r.mean_ms:10.3f} {r.p95_ms:10.3f} "
            f"{r.min_ms:10.3f} {r.max_ms:10.3f} {solves_per_sec:10.1f}  {r.status_counts}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=1000, help="solves per data point (batch size)")
    parser.add_argument(
        "--slot-counts", type=int, nargs="+", default=[5, 10, 20, 40], help="synthetic slot counts to probe"
    )
    args = parser.parse_args()

    print(_machine_context())
    print(f"invoked under: nice -n {__import__('os').nice(0)}  (batch n={args.n})")
    print()
    print("=== workload 1: real encodings ===")
    _print_table(bench_real_encodings(n=args.n))
    print()
    print("=== workload 2: synthetic flat-H programs ===")
    _print_table(bench_synthetic(n=args.n, slot_counts=args.slot_counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
