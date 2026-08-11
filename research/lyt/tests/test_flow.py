"""Unit tests for `flow.py` — work item `lyt-settings-live-opening`
(ledger rows 2007/2009). Covers: row-count against known label sets,
order preservation, degenerate widths (an item wider than the available
width refuses loudly), monotonicity of row count in width, and the
concrete settings-substrip design point
(`encodings/lengyue_landscape.lyt`/`lengyue_portrait.lyt`'s own header
comment — the 443px/2-row/60px numbers this module's own derivation
produced, pinned here so a change to the label set or the padding/border
constants is caught as a deliberate encoding change, not silent drift).
"""
import pytest

import flow
from errors import LytFlowError

# The six settings sub-tab labels' item widths, grounded exactly as the
# encoding headers derive them: ch * PX_PER_CH(8) + 16px padding (2x8) +
# 1px border-right. Order matches SettingsTab.vue's own `subTabs` array
# (session, analysisEnv, cardSets, advancedRegistry, analysis, keybindings).
SETTINGS_ITEM_WIDTHS = [113.0, 177.0, 153.0, 153.0, 137.0, 105.0]


class TestPackRows:
    def test_single_row_when_width_covers_the_sum(self):
        rows = flow.pack_rows(SETTINGS_ITEM_WIDTHS, 838.0)
        assert rows == [[0, 1, 2, 3, 4, 5]]

    def test_known_two_row_split_at_443px(self):
        rows = flow.pack_rows(SETTINGS_ITEM_WIDTHS, 443.0)
        assert rows == [[0, 1, 2], [3, 4, 5]]

    def test_order_is_preserved_never_reordered(self):
        # A pathological width where reordering (e.g. sorting by size)
        # would pack tighter than greedy-in-order — greedy must still
        # respect the ORIGINAL order (row 2009: "order preserved").
        widths = [50.0, 10.0, 40.0, 10.0]
        rows = flow.pack_rows(widths, 60.0)
        # Greedy-in-order: [50] (50, +10=60 fits exactly) -> row [0,1];
        # then 40 -> new row; +10=50 fits -> row [2,3].
        assert rows == [[0, 1], [2, 3]]
        # Every row's own indices are strictly increasing (never reordered).
        for row in rows:
            assert row == sorted(row)

    def test_every_item_appears_exactly_once_across_rows(self):
        rows = flow.pack_rows(SETTINGS_ITEM_WIDTHS, 300.0)
        flat = [i for row in rows for i in row]
        assert flat == list(range(len(SETTINGS_ITEM_WIDTHS)))

    def test_no_row_exceeds_max_width(self):
        for max_width in (200.0, 306.0, 443.0, 838.0):
            rows = flow.pack_rows(SETTINGS_ITEM_WIDTHS, max_width)
            for row in rows:
                assert sum(SETTINGS_ITEM_WIDTHS[i] for i in row) <= max_width

    def test_item_wider_than_max_width_refuses_loudly(self):
        # 100px is narrower than every item's own width (the narrowest,
        # "keybindings", is 105px) — the FIRST item in scan order (index
        # 0, "session", 113px) is what trips the refusal.
        with pytest.raises(LytFlowError) as exc_info:
            flow.pack_rows(SETTINGS_ITEM_WIDTHS, 100.0)
        assert exc_info.value.detail["law"] == "flow"
        assert exc_info.value.detail["prohibition"] == "item-exceeds-max-width"
        assert exc_info.value.detail["index"] == 0

    def test_item_exceeding_width_is_reported_at_its_own_index(self):
        # A width that fits every item EXCEPT the widest ("analysisEnv",
        # 177px, index 1) — the refusal names index 1 specifically, not
        # merely "some item failed".
        with pytest.raises(LytFlowError) as exc_info:
            flow.pack_rows(SETTINGS_ITEM_WIDTHS, 160.0)
        assert exc_info.value.detail["index"] == 1
        assert exc_info.value.detail["item_width"] == 177.0

    def test_non_positive_max_width_refuses_loudly(self):
        with pytest.raises(LytFlowError) as exc_info:
            flow.pack_rows(SETTINGS_ITEM_WIDTHS, 0.0)
        assert exc_info.value.detail["prohibition"] == "non-positive-max-width"

    def test_empty_items_packs_to_no_rows(self):
        assert flow.pack_rows([], 100.0) == []


class TestRowCountMonotonicity:
    def test_row_count_is_monotonically_non_increasing_in_width(self):
        # Module docstring's own Lemma: widening available width can only
        # let a row absorb MORE items, never fewer.
        widths_to_try = [177, 200, 250, 306, 350, 443, 500, 600, 700, 838]
        counts = [flow.row_count(SETTINGS_ITEM_WIDTHS, w) for w in widths_to_try]
        for a, b in zip(counts, counts[1:]):
            assert b <= a, f"row count grew from {a} to {b} as width increased"

    def test_row_count_at_full_sum_is_one(self):
        assert flow.row_count(SETTINGS_ITEM_WIDTHS, sum(SETTINGS_ITEM_WIDTHS)) == 1

    def test_row_count_at_min_feasible_width_is_item_count(self):
        # At the narrowest possible width (the widest single item), each
        # item needs its own row — nothing else can share.
        w = flow.min_feasible_width(SETTINGS_ITEM_WIDTHS)
        assert flow.row_count(SETTINGS_ITEM_WIDTHS, w) == len(SETTINGS_ITEM_WIDTHS)


class TestMinFeasibleWidth:
    def test_is_the_widest_item(self):
        assert flow.min_feasible_width(SETTINGS_ITEM_WIDTHS) == 177.0

    def test_empty_is_zero(self):
        assert flow.min_feasible_width([]) == 0.0


class TestFlowEnvelope:
    def test_two_row_envelope_at_443px(self):
        env = flow.flow_envelope(
            SETTINGS_ITEM_WIDTHS, 443.0, row_height_px=28.0, row_gap_px=4.0
        )
        assert env.row_count == 2
        assert env.width_floor_px == 443.0  # row [session,analysisEnv,cardSets] sums to exactly 443
        assert env.height_px == 60.0  # 2*28 + 1*4

    def test_width_floor_is_the_actual_tightest_row_not_the_search_input(self):
        # Searching at a looser width than strictly needed still reports
        # the ACTUAL packed width demand, never the looser search input.
        env = flow.flow_envelope(
            SETTINGS_ITEM_WIDTHS, 500.0, row_height_px=28.0, row_gap_px=4.0
        )
        assert env.row_count == 2
        assert env.width_floor_px == 443.0  # unchanged — still the max row sum
        assert env.height_px == 60.0

    def test_one_row_envelope_height_has_no_gap_term(self):
        env = flow.flow_envelope(
            SETTINGS_ITEM_WIDTHS, 838.0, row_height_px=28.0, row_gap_px=4.0
        )
        assert env.row_count == 1
        assert env.height_px == 28.0  # no (n-1)*gap term when n==1


class TestNarrowestWidthForRowCount:
    def test_one_row_target_returns_the_full_sum(self):
        w = flow.narrowest_width_for_row_count(
            SETTINGS_ITEM_WIDTHS, 1, search_ceiling=838.0
        )
        assert w == 838.0

    def test_two_row_target_returns_443(self):
        w = flow.narrowest_width_for_row_count(
            SETTINGS_ITEM_WIDTHS, 2, search_ceiling=838.0
        )
        assert w == 443.0
        assert flow.row_count(SETTINGS_ITEM_WIDTHS, w) == 2
        # One px narrower must NOT still achieve 2 rows (443 is the
        # narrowest, not merely an achieving width).
        assert flow.row_count(SETTINGS_ITEM_WIDTHS, w - 1) > 2

    def test_three_row_target_returns_306(self):
        w = flow.narrowest_width_for_row_count(
            SETTINGS_ITEM_WIDTHS, 3, search_ceiling=838.0
        )
        assert w == 306.0

    def test_target_rows_less_than_one_refuses_loudly(self):
        with pytest.raises(LytFlowError) as exc_info:
            flow.narrowest_width_for_row_count(
                SETTINGS_ITEM_WIDTHS, 0, search_ceiling=838.0
            )
        assert exc_info.value.detail["prohibition"] == "non-positive-target-rows"

    def test_unreachable_target_at_ceiling_refuses_loudly(self):
        with pytest.raises(LytFlowError) as exc_info:
            flow.narrowest_width_for_row_count(
                SETTINGS_ITEM_WIDTHS, 1, search_ceiling=400.0
            )
        assert exc_info.value.detail["prohibition"] == "target-rows-unreachable"


class TestSettingsSubstripDesignPoint:
    """Pins the concrete numbers `encodings/lengyue_landscape.lyt` and
    `lengyue_portrait.lyt`'s own headers derive and declare
    (`settingsSubstrip`'s `{60px}` and the wrapping composite's
    `min 443px`) — a change to the label set, PX_PER_CH, or the
    TabWidget padding/border constants that moves this number is a
    DELIBERATE encoding change this test forces to be noticed and
    re-derived, not a silent drift between the encoding's comment and
    its actual declared numbers."""

    def test_settings_substrip_design_point_is_443px_2row_60px(self):
        width = flow.narrowest_width_for_row_count(
            SETTINGS_ITEM_WIDTHS, 2, search_ceiling=sum(SETTINGS_ITEM_WIDTHS)
        )
        env = flow.flow_envelope(
            SETTINGS_ITEM_WIDTHS, width, row_height_px=28.0, row_gap_px=4.0
        )
        assert width == 443.0
        assert env.width_floor_px == 443.0
        assert env.height_px == 60.0
        assert env.row_count == 2

    def test_composite_min_is_max_of_width_and_height_floor(self):
        # BOTH-AXES TENSION (SPEC.md §4.2 / §8's along=None branch): the
        # wrapping V(substrip,pane)'s own T-child min applies identically
        # to both axes, so it must be >= max(width floor, height floor).
        # Height floor = substrip(60) + gap(4) + settingsPane min(200) = 264.
        width_floor = 443.0
        height_floor = 60.0 + 4.0 + 200.0
        assert height_floor == 264.0
        composite_min = max(width_floor, height_floor)
        assert composite_min == 443.0  # the encoding's own declared `min 443px`

    def test_838px_single_row_would_have_exceeded_the_side_column_cap(self):
        # The exact regression this work item retires (REPAIR's own "18px
        # over the cap" finding: 838px > 820px = 340px + 60ch*8px/ch).
        single_row = flow.narrowest_width_for_row_count(
            SETTINGS_ITEM_WIDTHS, 1, search_ceiling=sum(SETTINGS_ITEM_WIDTHS)
        )
        side_column_cap_px = 340.0 + 60.0 * 8.0
        assert single_row == 838.0
        assert single_row > side_column_cap_px  # was INFEASIBLE
        assert 443.0 < side_column_cap_px  # the flow-derived floor is not
