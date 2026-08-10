"""The `--baseline` load-mode registry (lyt-constants-swap commission,
ledger row 1687): the one place every consumer that needs to load
`current_row_asis.lyt` (the shadow-harness AS-IS conformance baseline,
NOT a design proposal — see that file's own header) gets its
`wellformed.Waiver` list from, so the citations live in exactly one spot
rather than drifting between `runner.py`, `emit_ts.py`, and
`tests/test_lyt.py`.

Every entry here corresponds to a `⚠L2` site named and explained in
`encodings/current_row_asis.lyt`'s own header comment ("L2 SITES"
section) — read that file before extending this registry; the path
strings below are the exact walk-paths `wellformed.find_l2_violations`
reports (`root`, `root/H2/V0/H1`, ...), confirmed by loading the file
once without waivers and reading the resulting `LytLoadError.detail`.

Public Domain (The Unlicense), matching `current_row_repaired.lyt`'s own
license line.
"""
from __future__ import annotations

from typing import Dict, List

from wellformed import Waiver

CURRENT_ROW_ASIS_L2_WAIVERS: List[Waiver] = [
    Waiver(
        law="L2",
        path="root",
        citation=(
            "current_row_asis.lyt header, 'L2 SITES' #1 — App.vue:521-525 "
            "sidebarToggle standing alone as a direct child of the "
            "outermost split (layout-language-consult.md §4.2 L2, lines "
            "371-380, the canonical sidebar-collapse-rail example named "
            "at line 377-378). The outer H's other direct child (the "
            "main-workspace V) has an elastic `pref 1fr`, which trips "
            "wellformed.py's disclosed fr-sibling AMBIGUITY path rather "
            "than a clean majority — still an L2-law site, per that "
            "module's own 'both cases... report the same way' design."
        ),
    ),
    Waiver(
        law="L2",
        path="root/H2/V0/H1",
        citation=(
            "current_row_asis.lyt header, 'L2 SITES' #2 — App.vue:561-572 "
            "`.right-toggles` (boardToggle/treeToggle/ctrlToggle + "
            "locale), a genuine strict-majority violation (99px chrome "
            "of 177px total) per AMENDMENT 2's dominance test "
            "(SPEC-AMENDMENTS.md, ledger row 1671) — the same defect "
            "class as the canonical sidebar-collapse-rail witness, "
            "independently reproduced by this cluster's own real widths."
        ),
    ),
]

BASELINE_WAIVERS: Dict[str, List[Waiver]] = {
    "current-row-asis": CURRENT_ROW_ASIS_L2_WAIVERS,
}
