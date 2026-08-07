/**
 * tests/integration/useIntervalSummary-kernel-witness.test.ts
 *
 * The no-parallel-recompute witness for `useIntervalSummary`
 * (wiki Wanted feature #6's commissioned requirement: the summary is
 * the multiresolution heatmap's OWN aggregate, not an independent
 * recompute that happens to agree).
 *
 * Witness construction (ADR-0021 — observe the property, not a
 * symptom): `useIntervalSummary` instantiates its own
 * `useTriangularHeatmap`, so cross-instance referential equality
 * against a second instance can never hold, and structural equality
 * cannot rule out a value-equal recompute (the review's spread-copy
 * experiment, wf6-summary-analysis-review.md finding 1). Instead the
 * kernel module is mocked here to emit SENTINEL cells whose values are
 * arbitrary — underivable from the (empty) inputs — and the test
 * asserts the summary surfaces those very objects BY REFERENCE
 * (`toBe`). A summary that computed anything itself, or copied the
 * cell, fails; the only way to pass is to read the kernel's matrix and
 * return its entries. `plyRangeToColorMoveRange` stays real (its own
 * arithmetic has dedicated unit coverage) so the (s, t) lookup the
 * mock satisfies is the production projection.
 *
 * Live cross-surface agreement (both real instances resolving to the
 * same recorded enrichment) is covered by the sibling file
 * `useIntervalSummary.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi } from 'vitest';
import { computed, ref } from 'vue';

const SENTINEL_B = { color: 'B', s: 0, t: 2, value: 123.456 };
const SENTINEL_W = { color: 'W', s: 0, t: 2, value: -777.25 };

vi.mock('../../src/composables/analysis/useTriangularHeatmap', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/composables/analysis/useTriangularHeatmap')
  >();
  return {
    ...actual,
    // Sentinel kernel: ignores its inputs and emits two fixed cells.
    // Values are deliberately outside anything the (empty) path could
    // yield — the summary can only surface them by READING this matrix.
    useTriangularHeatmap: () =>
      computed(() => ({
        matrix: [{ cell: SENTINEL_B }, { cell: SENTINEL_W }],
      })),
  };
});

import { useIntervalSummary } from '../../src/composables/analysis/useIntervalSummary';
import { withSetup } from './with-setup';
import type { PlyIndex, RootToLeafPath } from '../../src/types';

describe('useIntervalSummary — kernel witness (no parallel recompute)', () => {
  it('surfaces the kernel matrix cells BY REFERENCE for the projected (s, t)', () => {
    // Ply range [1, 6] projects to colour-local (0, 2) for both colours
    // (real plyRangeToColorMoveRange; see its unit suite) — matching the
    // sentinel cells' coordinates.
    const path = ref<RootToLeafPath>([] as unknown as RootToLeafPath);
    const selectionRange = ref<readonly [PlyIndex, PlyIndex]>(
      [1, 6] as unknown as readonly [PlyIndex, PlyIndex],
    );

    const summary = withSetup(() => useIntervalSummary(path, selectionRange));

    const black = summary.value.rows.find((r) => r.color === 'B');
    const white = summary.value.rows.find((r) => r.color === 'W');

    // Referential identity against the mocked kernel's own objects: the
    // load-bearing assertion. A recompute cannot fabricate these values;
    // a copy fails Object.is.
    expect(black?.cell).toBe(SENTINEL_B);
    expect(white?.cell).toBe(SENTINEL_W);
    expect(black?.cell?.value).toBe(123.456);
    expect(white?.cell?.value).toBe(-777.25);
  });

  it('returns null cells (absence, not zero) when the projected pair is not in the matrix', () => {
    const path = ref<RootToLeafPath>([] as unknown as RootToLeafPath);
    // Ply range [1, 2] projects to (0, 0)-per-colour sub-ranges the
    // sentinel matrix does not contain.
    const selectionRange = ref<readonly [PlyIndex, PlyIndex]>(
      [1, 2] as unknown as readonly [PlyIndex, PlyIndex],
    );

    const summary = withSetup(() => useIntervalSummary(path, selectionRange));
    expect(summary.value.rows[0].cell).toBeNull();
    expect(summary.value.rows[1].cell).toBeNull();
  });
});
