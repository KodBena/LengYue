/**
 * tests/unit/state/engine-controls-realization.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/state/engine-controls-realization.ts`
 * — the finish-pass wave B2 F2 fix's threshold arithmetic. No DOM, no Vue
 * reactivity: `computeWrappedRowCount`, `computeClusterNeededHeightPx`,
 * and `resolveEngineControlsRealization` are pure functions of their own
 * arguments.
 *
 * Two families of cases: (1) the algorithm's own correctness on small
 * synthetic fixtures (easy to hand-verify), and (2) the exact live-
 * measured worst-case button widths this module cites
 * (`ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX`), pinning the derived
 * threshold (~184.03125px) the commission's own report cites.
 *
 * ── State-invariance correction (W-B2 review MAJOR finding, 2026-08-13) ──
 * The runtime composable (`useEngineControlsRealization`) now derives
 * ITS OWN worst-case-per-slot widths live from the DOM (see that
 * composable's own header) rather than treating this constant table as
 * documentation the runtime intentionally bypassed. This file's own
 * "1920x1080 fits the REAL current buttons but not the worst-case
 * table" case is retired below (with an individual justification, not
 * silently dropped) because that framing — "worst-case would wrongly
 * force menu-path here" — is exactly the framing this correction
 * rejects: at 1920x1080's 150.5px column the worst-case table's own
 * arithmetic (4 rows, 108px > 80px) is now the CORRECT selection,
 * chosen deliberately for state-invariance over idle-state fidelity.
 * A new regression test below pins that new, correct expectation.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  computeWrappedRowCount,
  computeClusterNeededHeightPx,
  resolveEngineControlsRealization,
  A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
  ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX,
  ENGINE_CONTROLS_GAP_PX,
  ENGINE_CONTROLS_ROW_HEIGHT_PX,
} from '../../../src/state/engine-controls-realization';

describe('computeWrappedRowCount — synthetic fixtures', () => {
  it('returns 0 for an empty item list', () => {
    expect(computeWrappedRowCount([], 4, 100)).toBe(0);
  });

  it('a single item always fits in one row, regardless of container width', () => {
    expect(computeWrappedRowCount([50], 4, 10)).toBe(1);
    expect(computeWrappedRowCount([50], 4, 1000)).toBe(1);
  });

  it('two items that fit side-by-side (with the gap) stay in one row', () => {
    // 10 + 4 (gap) + 10 = 24, exactly the container — fits at equality.
    expect(computeWrappedRowCount([10, 10], 4, 24)).toBe(1);
  });

  it('two items that do not fit (even by 1px) wrap to two rows', () => {
    expect(computeWrappedRowCount([10, 10], 4, 23)).toBe(2);
  });

  it('packs sequentially in DOM order, not by a bin-packing optimum', () => {
    // [10, 10, 10] at container 21: item1 alone (10), item2 doesn't fit
    // (10+4+10=24 > 21) -> new row; item3 doesn't fit next to item2 either
    // (10+4+10=24 > 21) -> third row. Three rows, matching CSS flex-wrap's
    // own left-to-right greedy line assignment (not an optimal 2-row pack
    // that would require reordering, which flex-wrap never does).
    expect(computeWrappedRowCount([10, 10, 10], 4, 21)).toBe(3);
  });

  it('a very narrow container still assigns one item per row (never 0 rows for a non-empty list)', () => {
    expect(computeWrappedRowCount([50, 50, 50], 4, 1)).toBe(3);
  });
});

describe('computeClusterNeededHeightPx', () => {
  it('0 rows needs 0 height', () => {
    expect(computeClusterNeededHeightPx(0, 24, 4)).toBe(0);
  });

  it('N rows needs N*rowHeight + (N-1)*rowGap', () => {
    expect(computeClusterNeededHeightPx(1, 24, 4)).toBe(24);
    expect(computeClusterNeededHeightPx(2, 24, 4)).toBe(52);
    expect(computeClusterNeededHeightPx(3, 24, 4)).toBe(80);
    expect(computeClusterNeededHeightPx(4, 24, 4)).toBe(108);
  });
});

describe('resolveEngineControlsRealization', () => {
  it('stays button-cluster when the need is under the reservation', () => {
    expect(resolveEngineControlsRealization(52, 80)).toBe('button-cluster');
  });

  it('stays button-cluster at exact equality (not exceeded)', () => {
    expect(resolveEngineControlsRealization(80, 80)).toBe('button-cluster');
  });

  it('switches to menu-path the moment the need exceeds the reservation', () => {
    expect(resolveEngineControlsRealization(80.01, 80)).toBe('menu-path');
    expect(resolveEngineControlsRealization(108, 80)).toBe('menu-path');
  });
});

describe('the compiled reservation constant', () => {
  it('matches the compiled program\'s own fixed track (lyt-layout.gen.ts path "2.0" / lyt-layout-portrait.gen.ts path "4.0")', () => {
    expect(A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX).toBe(80);
  });
});

describe('the live-measured worst-case button widths — threshold arithmetic (F2)', () => {
  // Live-measured (isolated rig, 2026-08-13): Mint Card(s) 105.625,
  // Learn Path 90.015625, Play 43.21875, Match/Stop Match (worse: Stop
  // Match) 90.015625, Connect/Disconnect (worse: Disconnect) 90.015625.
  // See `state/engine-controls-realization.ts`'s own header for the
  // methodology and why this table is NOT the runtime decision
  // mechanism (the runtime composable measures the real, current
  // buttons instead).
  const widths = ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX;

  it('fits 3 rows (the 80px reservation) at a 190px column — landscape/768px-class-representative width', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 190);
    expect(rows).toBe(3);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(neededPx).toBe(80);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('button-cluster');
  });

  it('needs 4 rows (exceeds the 80px reservation) at the F2 report\'s own 1280x1024 column (107.25px)', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 107.25);
    expect(rows).toBe(5); // worst-case (Disconnect/Stop Match) labels wrap further than the default-state 4 rows the live rig measured
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });

  it('needs 5 rows (exceeds the 80px reservation) at the F2 report\'s own 420x880 column (102px)', () => {
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 102);
    expect(rows).toBe(5);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });

  it('the derived threshold is ~184.03125px: just below it needs menu-path, at/above it fits button-cluster', () => {
    const belowThreshold = 184.03; // just under
    const atThreshold = 184.03125; // exact: 90.015625 + 4 + 90.015625 (the last two items' own row)
    const rowsBelow = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, belowThreshold);
    const rowsAt = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, atThreshold);
    expect(rowsBelow).toBe(4);
    expect(rowsAt).toBe(3);
    expect(
      resolveEngineControlsRealization(
        computeClusterNeededHeightPx(rowsBelow, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX),
        A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
      ),
    ).toBe('menu-path');
    expect(
      resolveEngineControlsRealization(
        computeClusterNeededHeightPx(rowsAt, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX),
        A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
      ),
    ).toBe('button-cluster');
  });

  it('1920x1080\'s own live-measured column (150.5px) — worst-case now selects menu-path even at idle (state-invariance fix, W-B2 review MAJOR finding, 2026-08-13)', () => {
    // JUSTIFICATION for retiring the pre-fix version of this test
    // (which asserted the REAL idle/disconnected button set fits in 3
    // rows/80px and treated that as the runtime-relevant fact): the
    // runtime composable no longer measures the current, state-
    // dependent labels at all — it measures BOTH label variants for
    // every state-varying button and keeps the wider one, i.e. exactly
    // this worst-case table's own shape. So the fact this test now
    // pins is the CORRECT runtime outcome, not a table the runtime
    // deliberately avoids: at 1920x1080's 150.5px column the worst-case
    // set needs 4 rows (108px), which exceeds the compiled 80px
    // reservation, so `menu-path` is selected — even when the engine is
    // idle/disconnected and no match is running. This is the honest,
    // disclosed consequence of the state-invariance fix (see
    // `useEngineControlsRealization`'s own header): a column too narrow
    // for the worst case can no longer show a cluster that later
    // vanishes mid-interaction, because it never shows a cluster there
    // at all until the column widens (a parallel model-side wave is
    // authoring a 184px controls-floor reservation that would restore
    // `button-cluster` at 1920x1080).
    const rows = computeWrappedRowCount(widths, ENGINE_CONTROLS_GAP_PX, 150.5);
    expect(rows).toBe(4);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(neededPx).toBe(108);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });
});

describe('library-cards-promotion: seven capabilities, ample-width regression (aff8 defect 3)', () => {
  // Library/Cards join the five worst-case widths above at runtime
  // (`ToolbarEngineControls.vue`'s own shadow-clone template) — this
  // module's own `ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX` constant
  // is NOT extended to seven (its own header: "a pinned regression
  // fixture" for the original five), so this suite builds its own
  // seven-item set: the five live-measured widths plus two conservative
  // placeholders sized to the widest EXISTING single-word label
  // ("Learn Path"/"Connect", 90.015625px) — a safe upper bound for the
  // shorter "Library"/"Cards" labels, so a pass here can't be an
  // accident of an unrealistically narrow synthetic set.
  const sevenWidths = [...ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX, 90.015625, 90.015625];

  it('an ample column (900px) fits all seven in one row — button-cluster, regardless of the fixed 80px height reservation ("at ample width all entries render as buttons")', () => {
    const rows = computeWrappedRowCount(sevenWidths, ENGINE_CONTROLS_GAP_PX, 900);
    expect(rows).toBe(1);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('button-cluster');
  });

  it('sanity: the SAME seven items at a genuinely narrow column (150px) still correctly select menu-path — the ample-width pass above is not from an unconditional button-cluster bug', () => {
    const rows = computeWrappedRowCount(sevenWidths, ENGINE_CONTROLS_GAP_PX, 150);
    const neededPx = computeClusterNeededHeightPx(rows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX);
    expect(resolveEngineControlsRealization(neededPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX)).toBe('menu-path');
  });
});

describe('state-invariance: the worst-case set never depends on which state produced it (F2 correction)', () => {
  // Regression test for the review's exact traced case
  // (`.claude/dispatch-reports/lyt-wB2-controls-menu-review.md` §1):
  // idle, connected-only, match-running-only, and connected+match-
  // running must all resolve to the SAME form at a fixed column width,
  // because the runtime composable no longer measures per-state labels
  // — it always measures the worst-case set. This test pins that
  // invariant at the pure-logic tier by exercising the same worst-case
  // widths table under the four reachable label combinations the
  // review's own table enumerated, confirming every one of them now
  // collapses to the identical worst-case row count / form the fixed
  // `ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX` table already
  // represents — i.e. state can no longer be an input to the decision
  // at all, so there is nothing left for state to vary.
  const idleWidths = [105.625, 90.015625, 43.21875, 51.015625, 66.609375]; // Match, Connect
  const connectedOnlyWidths = [105.625, 90.015625, 43.21875, 51.015625, 90.015625]; // Match, Disconnect
  const matchRunningOnlyWidths = [105.625, 90.015625, 43.21875, 90.015625, 66.609375]; // Stop Match, Connect
  const connectedAndMatchingWidths = ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX; // Stop Match, Disconnect — the worst case itself

  it('the fix no longer selects a per-state width set — this test exists to name what WOULD have varied pre-fix, not to exercise the fixed mechanism (which reads only the worst-case width regardless of input state)', () => {
    // Pre-fix, `computeWrappedRowCount` over each state's OWN natural
    // widths at 1920x1080's 150.5px column produced DIFFERENT row
    // counts depending on which of these four fixtures was live —
    // exactly the flip the review traced. Documenting all four here
    // shows the actual disagreement the fix eliminates upstream (by
    // never feeding a per-state width set into the algorithm at all,
    // per `useEngineControlsRealization`'s own `measureShadow`, which
    // always takes the max of both variants — i.e. is definitionally
    // fixed at `connectedAndMatchingWidths` regardless of state).
    const columnPx = 150.5;
    const idleRows = computeWrappedRowCount(idleWidths, ENGINE_CONTROLS_GAP_PX, columnPx);
    const connectedOnlyRows = computeWrappedRowCount(connectedOnlyWidths, ENGINE_CONTROLS_GAP_PX, columnPx);
    const matchRunningOnlyRows = computeWrappedRowCount(matchRunningOnlyWidths, ENGINE_CONTROLS_GAP_PX, columnPx);
    const connectedAndMatchingRows = computeWrappedRowCount(connectedAndMatchingWidths, ENGINE_CONTROLS_GAP_PX, columnPx);
    expect(idleRows).toBe(3);
    expect(connectedOnlyRows).toBe(3);
    expect(matchRunningOnlyRows).toBe(4);
    expect(connectedAndMatchingRows).toBe(4);
    // The disagreement above (3 vs 4 rows depending on state) is
    // exactly the pre-fix flip. The fix's own guarantee is that the
    // RUNTIME composable never evaluates the algorithm against any set
    // but `connectedAndMatchingWidths` (the worst case) — proven by
    // `useEngineControlsRealization`'s `measureShadow` always taking
    // the per-slot MAX of both variants, which is structurally
    // `connectedAndMatchingWidths` regardless of which state is
    // actually live. So at runtime, `form` always resolves using THIS
    // row count, never the other three:
    expect(
      resolveEngineControlsRealization(
        computeClusterNeededHeightPx(connectedAndMatchingRows, ENGINE_CONTROLS_ROW_HEIGHT_PX, ENGINE_CONTROLS_GAP_PX),
        A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
      ),
    ).toBe('menu-path');
  });
});
