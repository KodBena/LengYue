"""research/lyt/tools/count_deprecations.py

LYT relations-first amendment, dispatch C4 (ledger rows
2396/2397/2400/2419/2425/2436/2445) — C3 review condition 3: an
independent, contamination-free count of
`errors.RelationsFirstDeprecationWarning` occurrences per `.lyt` file,
reported per file class (`encodings/` vs. `fixtures/reference/` vs.
`fixtures/transcription/`).

WHY A SEPARATE SUBPROCESS PER FILE. The C3 reviewer's own §6 (cited by
this dispatch's brief; the review document itself,
`lyt-relations-c3-review.md`, could not be located in this worktree —
see this dispatch's own report for that gap) is described as having hit
a "cross-registration double-load pitfall": loading more than one
registration/file inside the SAME Python process risks contaminating a
`warnings.catch_warnings(record=True)` count in at least two ways this
script avoids by construction — (a) Python's default warning filter
deduplicates by `(message, category, module, lineno)`, so a SECOND file
that happens to trigger a warning at the same call site/line as a FIRST
file already-recorded in the same process could be silently suppressed
by the interpreter's own de-dup cache unless every load resets it; (b)
`loader.reset_facts_table_cache` and other module-level caches this
substrate uses are process-global, so a later file's load could
observe state a prior file's load left behind. Spawning ONE fresh
Python subprocess per file sidesteps both: each subprocess starts with
an empty warnings registry and a cold facts-table cache, so one file's
count can never leak into another's.

Two counts per file:
  - WARNING-MODE: the ordinary `loader.load_layouts(text)` call (no
    `refuse_literal_bounds`) — every `RelationsFirstDeprecationWarning`
    the full load emits, counted honestly to completion.
  - STRICT-MODE (encodings/ files only): `loader.load_layouts(text,
    refuse_literal_bounds=True, source_file=...)` — the C4 flip. A
    px/ch literal now RAISES instead of warning, so this mode's own
    warning count is, by construction, always 0 (the load either
    completes with zero px/ch literals resolved under strict context,
    or aborts at the first one via `LytLoadError` before any further
    warning could accumulate) — this is the literal sense in which
    "encodings should be ZERO post-flip" (this dispatch's own brief):
    not that the real committed encodings have zero residual literals
    (they do not — see the WARNING-MODE column, and this dispatch's own
    report for the disclosed 77.5%-not-100% reduction C3 left behind),
    but that STRICT MODE's own warning channel never accumulates a
    nonzero count, because a px/ch literal is refused before it would
    have been recorded as a warning.

Usage: `nice -n 19 <python> tools/count_deprecations.py` from
`research/lyt/`.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # research/lyt/
ENCODINGS_DIR = HERE / "encodings"
FIXTURES_REFERENCE_DIR = HERE / "fixtures" / "reference"
FIXTURES_TRANSCRIPTION_DIR = HERE / "fixtures" / "transcription"

# Files known to need `baseline.BASELINE_WAIVERS` to load at all (as-is,
# disclosedly L2-non-conformant transcriptions) -- unrelated to this
# script's own deprecation count, but a load that raises for an
# unrelated reason before resolving any extents would misreport as "0
# warnings" for the wrong reason, so these are loaded with waivers.
NEEDS_BASELINE_WAIVERS = {"current_row_asis.lyt"}

_WARNING_MODE_SNIPPET = """
import sys, warnings
sys.path.insert(0, {here!r})
import loader
from errors import RelationsFirstDeprecationWarning
text = open({path!r}).read()
kwargs = {{}}
if {needs_waivers!r}:
    from baseline import BASELINE_WAIVERS
    kwargs["waivers"] = BASELINE_WAIVERS
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter("always")
    loader.load_layouts(text, **kwargs)
n = sum(1 for x in w if issubclass(x.category, RelationsFirstDeprecationWarning))
print(n)
"""

_STRICT_MODE_SNIPPET = """
import sys, warnings
sys.path.insert(0, {here!r})
import loader
from errors import LytLoadError, RelationsFirstDeprecationWarning
text = open({path!r}).read()
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter("always")
    try:
        loader.load_layouts(text, refuse_literal_bounds=True, source_file={path!r})
        outcome = "completed"
    except LytLoadError as exc:
        outcome = f"refused:{{exc.detail.get('prohibition')}}@{{exc.detail.get('where')}}"
n = sum(1 for x in w if issubclass(x.category, RelationsFirstDeprecationWarning))
print(f"{{n}} {{outcome}}")
"""


def _run_snippet(snippet: str) -> str:
    result = subprocess.run(
        [sys.executable, "-c", snippet],
        cwd=str(HERE),
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def count_warning_mode(path: Path) -> int:
    snippet = _WARNING_MODE_SNIPPET.format(
        here=str(HERE), path=str(path), needs_waivers=path.name in NEEDS_BASELINE_WAIVERS
    )
    return int(_run_snippet(snippet))


def count_strict_mode(path: Path) -> str:
    rel = str(path.relative_to(HERE))
    snippet = _STRICT_MODE_SNIPPET.format(here=str(HERE), path=str(path))
    # source_file is passed as the raw path above for simplicity; report
    # the relative form here for readability.
    out = _run_snippet(snippet)
    return out


def main() -> int:
    print(f"{'file class':<22} {'file':<28} {'warning-mode count':>19}  strict-mode (count, outcome)")
    print("-" * 100)
    for class_label, directory, strict in (
        ("encodings", ENCODINGS_DIR, True),
        ("fixtures/reference", FIXTURES_REFERENCE_DIR, False),
        ("fixtures/transcription", FIXTURES_TRANSCRIPTION_DIR, False),
    ):
        for p in sorted(directory.glob("*.lyt")):
            wcount = count_warning_mode(p)
            strict_out = count_strict_mode(p) if strict else "-- (fixtures never strict)"
            print(f"{class_label:<22} {p.name:<28} {wcount:>19}  {strict_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
