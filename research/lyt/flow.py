"""research/lyt/flow.py

Work item `lyt-settings-live-opening` (ledger rows 2007/2009; ruling text
quoted in full in `encodings/lengyue_landscape.lyt`'s own header, the
settingsSubstrip section, and in `SPEC-AMENDMENTS.md`). Row 2007 rules the
settings sub-tab strip WRAP-CAPABLE: its declaration becomes an envelope
over PACKED ROW-STATES derived from the label texts + spacing tokens —
width demand converts to modeled height demand — no scrollbar, the prior
one-row reading was never the only honest one. Row 2009 rules the packing
MECHANISM: greedy, left-to-right, order-preserving, deterministic line
filling — the same shape `vim`'s `gqq` uses to reflow a paragraph of
words into lines of a fixed column width, applied here to a row of
fixed-width tab labels instead of variable-width words. The compiler
stays a VERIFIER (SPEC.md §8): this module is not wired into `compiler.py`
as a CP-SAT constraint (packing-into-bins is not a linear relation CP-SAT
reasons about naturally) — it is an OFFLINE calculator an encoding author
(or a derivation script) consults to pick a grounded, honest design point,
the same role `PX_PER_CH`-arithmetic already plays for a single-row ch
envelope (see the landscape encoding's own §"settingsSubstrip's WIDTH
DEMAND" comment, the direct predecessor this module generalizes).

**Prototype-seam statement (commission's own words, recorded here
verbatim per that instruction).** This is the WORKED PROTOTYPE a future
settings-pane flow extension generalizes from — a small, well-typed seam:
one pure function (`pack_rows`), one derived-measurement function
(`flow_envelope`), one search helper (`narrowest_width_for_row_count`),
each independently unit-tested against known label sets. A future wave
that wants the SAME packing behavior for a different bounded-chrome strip
(the top-level control-panel tab strip itself, a future toolbar cluster
that also carries a variable-count label set) reaches for THIS module
rather than re-deriving greedy line-fill by hand — see the module's own
`Quantification universe` note below (ADR-0000, 2026-07-02 amendment
form) for which consumers this closure statement covers today and which
it does not yet.

**Why greedy line-fill, not a global-optimum bin-packer.** Row 2009's own
text: "FLOW (vim-gqq-style greedy line-filling, order preserved,
deterministic; height = function of solved width; the compiler stays a
verifier, no second optimizer)". A bin-packing OPTIMIZER (minimize row
count for a fixed width via reordering) would violate "order preserved"
(the sub-tab strip's reading order is the settings pane's own navigational
order — SettingsTab.vue's `subTabs` array — reordering labels to pack more
tightly would silently scramble that order) and would introduce a SECOND
optimizer alongside the CP-SAT solver's own lexicographic objective (SPEC.md
§8), which the ruling explicitly forbids. Greedy left-to-right fill is the
UNIQUE deterministic packing that preserves order: append each item to the
current row while it still fits; start a new row the instant it doesn't.

**Determinism and monotonicity (load-bearing for the envelope's honesty).**
`pack_rows` is a pure function of `(item_widths, max_width)` — no random
tie-breaking, no reordering. Row count is monotonically NON-INCREASING in
`max_width` (Lemma, proved by the regression suite's own
`test_row_count_is_monotonically_non_increasing_in_width`): widening the
available width can only let a row absorb MORE items, never fewer, so
`row_count(w2) <= row_count(w1)` whenever `w2 >= w1`. This is what makes a
DECLARED width floor an honest upper bound on height: any solved width at
or above the floor achieves AT MOST the row count computed at the floor,
so the height declared at the floor is a genuine ceiling across the whole
feasible width range above it — never an underestimate a wider solve could
blow past.

**Quantification universe (ADR-0000, 2026-07-02 amendment form).**
*Invariant*: greedy left-to-right line-fill over a row of independently-
sized, non-reorderable items packs the SAME way regardless of what the
items represent. *Universe covered today*: the settings sub-tab strip
(SIX static labels, `encodings/lengyue_landscape.lyt` /
`lengyue_portrait.lyt`'s own `settingsSubstrip` leaf) — the ONE consumer
this wave wires up. *Siblings named, not covered* (ADR-0000 Rule
2(a)'s "name what is not covered" clause): the top-level control-panel
tab strip itself (`library/cards/settings/analysis/other`, five items,
today a fixed-width `T` group with no wrap declared at all) and any
future bounded-chrome strip with a variable item count are STRUCTURALLY
the same shape (a row of fixed-width, order-significant items that may
need to wrap) but are NOT wired to this module by this wave — each would
need its own grounded item-width derivation (its own ch-measurement +
padding/border arithmetic) and its own encoding decision about whether
wrapping is the right disposition for THAT strip, which is a judgment
this wave does not make on their behalf.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from errors import LytFlowError


def pack_rows(item_widths: Sequence[float], max_width: float) -> List[List[int]]:
    """Greedy, left-to-right, order-preserving line fill (row 2009's own
    "vim-gqq-style" mechanism) over a sequence of item widths, packed into
    rows no wider than `max_width`.

    Returns a list of rows, each row a list of the ORIGINAL indices (into
    `item_widths`) of the items it holds, in their original order — row
    order and within-row order both match `item_widths`' own order, since
    the mechanism never reorders (SPEC-AMENDMENTS.md, row 2009: "order
    preserved").

    Refuses loudly (`LytFlowError`) when a single item's own width exceeds
    `max_width` — no wrapping strategy can honor an item wider than the
    available width, and the honest disposition is a refusal at the SAME
    "no basis for a silent partial rendering" strength this codebase's
    other load-time laws already use (L3/L5's own refusal shape), not a
    silently-overflowing row or a silently-dropped item.
    """
    if max_width <= 0:
        raise LytFlowError(
            "pack_rows: max_width must be positive",
            detail={"law": "flow", "prohibition": "non-positive-max-width", "max_width": max_width},
        )
    rows: List[List[int]] = []
    current: List[int] = []
    current_w = 0.0
    for i, w in enumerate(item_widths):
        if w > max_width:
            raise LytFlowError(
                "pack_rows: item is wider than max_width — no packing can fit it",
                detail={
                    "law": "flow",
                    "prohibition": "item-exceeds-max-width",
                    "index": i,
                    "item_width": w,
                    "max_width": max_width,
                },
            )
        if current and current_w + w > max_width:
            rows.append(current)
            current = []
            current_w = 0.0
        current.append(i)
        current_w += w
    if current:
        rows.append(current)
    return rows


def row_count(item_widths: Sequence[float], max_width: float) -> int:
    """`len(pack_rows(item_widths, max_width))` — named separately since
    most callers (the monotonicity proof, the search helper below) only
    need the count, not the row membership."""
    return len(pack_rows(item_widths, max_width))


def min_feasible_width(item_widths: Sequence[float]) -> float:
    """The width BELOW which `pack_rows` refuses unconditionally — the
    widest single item. An honest floor for "can this strip be packed at
    all," independent of row count: no `max_width` under this value has
    any legal packing, wrap-capable or not."""
    if not item_widths:
        return 0.0
    return max(item_widths)


@dataclass(frozen=True)
class FlowEnvelope:
    """One packed row-STATE (row 2007's own vocabulary: "an envelope over
    packed row-states") — the concrete result of packing a known item set
    at a known design width, converted to a height demand.

    `width_floor_px` is NOT the `max_width` the caller searched with — it
    is the ACTUAL tightest width this exact packing needs (the widest
    single row's own summed width), always `<= max_width`. Declaring
    `width_floor_px` (not the search input) as the encoding's width floor
    is what keeps the envelope honest: it is the narrowest width that
    still produces AT MOST this row count (monotonicity, module docstring
    above), never a looser number that happens to have been convenient to
    search with.
    """

    rows: List[List[int]]
    row_count: int
    width_floor_px: float
    height_px: float


def flow_envelope(
    item_widths: Sequence[float],
    max_width: float,
    *,
    row_height_px: float,
    row_gap_px: float = 0.0,
) -> FlowEnvelope:
    """Packs `item_widths` at `max_width` (via `pack_rows`) and converts the
    resulting row structure into a height demand: `row_count * row_height_px
    + max(row_count - 1, 0) * row_gap_px` — the same `(k-1)*gap` partition
    shape `compiler.py`'s own Split-node arithmetic already uses (SPEC.md
    §9.4, Amendment 3), applied here to rows instead of split children."""
    rows = pack_rows(item_widths, max_width)
    row_sums = [sum(item_widths[i] for i in row) for row in rows]
    width_floor = max(row_sums) if row_sums else 0.0
    n = len(rows)
    height = n * row_height_px + max(n - 1, 0) * row_gap_px
    return FlowEnvelope(rows=rows, row_count=n, width_floor_px=width_floor, height_px=height)


def narrowest_width_for_row_count(
    item_widths: Sequence[float],
    target_rows: int,
    *,
    search_ceiling: float,
) -> float:
    """Binary-searches (monotonicity, module docstring above) for the
    NARROWEST `max_width` at which `row_count(item_widths, max_width) <=
    target_rows` — the grounded design-width input `flow_envelope` above
    is meant to be called with, rather than an author guessing a round
    number. `search_ceiling` bounds the search from above (the sum of
    every item's width — the single-row width — is always a safe
    ceiling: `row_count` at that width is always 1).

    Refuses loudly (`LytFlowError`) when `target_rows` cannot be reached
    even at `search_ceiling` (a caller-supplied ceiling narrower than the
    single-row sum) or when `target_rows < 1`.
    """
    if target_rows < 1:
        raise LytFlowError(
            "narrowest_width_for_row_count: target_rows must be >= 1",
            detail={"law": "flow", "prohibition": "non-positive-target-rows", "target_rows": target_rows},
        )
    floor = min_feasible_width(item_widths)
    if row_count(item_widths, search_ceiling) > target_rows:
        raise LytFlowError(
            "narrowest_width_for_row_count: target_rows unreachable at search_ceiling",
            detail={
                "law": "flow",
                "prohibition": "target-rows-unreachable",
                "target_rows": target_rows,
                "search_ceiling": search_ceiling,
                "row_count_at_ceiling": row_count(item_widths, search_ceiling),
            },
        )
    lo = floor
    hi = search_ceiling
    # Integer-px binary search: pack_rows is monotonic non-increasing in
    # width (module docstring), so "row_count(w) <= target_rows" is a
    # monotonic predicate over [floor, search_ceiling] — invariant:
    # row_count(hi) <= target_rows always holds; we narrow hi down to the
    # smallest width that still satisfies it.
    lo_i = int(lo)
    hi_i = int(hi) if hi == int(hi) else int(hi) + 1
    while lo_i < hi_i:
        mid = (lo_i + hi_i) // 2
        if row_count(item_widths, mid) <= target_rows:
            hi_i = mid
        else:
            lo_i = mid + 1
    return float(hi_i)
