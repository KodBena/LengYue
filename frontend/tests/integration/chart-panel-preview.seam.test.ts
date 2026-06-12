/**
 * tests/integration/chart-panel-preview.seam.test.ts
 *
 * Pins the cured hover-preview seam the analysis chart panels
 * (`ScoreLeadPanel`, `MergedDeltaPanel`) migrated to under item
 * `chart-panel-preview-migration` — the synchronous-gate + accessor-over-
 * cache shape PR #413 established for `FloatingThumbnail` / `ChartPreviewBox`
 * (see `FloatingThumbnail.seam.test.ts`, the floating-surface analog).
 *
 * Since item `preview-snapshot-shared-composable` this drives the REAL shared
 * unit `usePreviewSnapshot` (the composable the panels now wire), not a
 * hand-restated copy of the quartet. The composable IS the panels'
 * production seam:
 *   - the visible preview state is a `previewNode` ref holding a NodeId (or
 *     null), written ONLY synchronously (`showPreview` sets it, `reset`
 *     clears it);
 *   - the displayed snapshot is DERIVED through `getSnapshotSync(previewNode)`
 *     in the `getPreview` accessor (`() => BoardSnapshot | null`), the
 *     contract `ChartPreviewBox` consumes;
 *   - the only async work is a fire-and-forget `getSnapshot` cache WARM that
 *     writes the shared cache, never the gate.
 *
 * The invariant under test is the content-resurrection race the migration
 * closed: a slow cache-miss resolve landing AFTER a leave-time reset must
 * not repopulate the docked preview with the stale hovered position. Under
 * the old `preview.value = await getSnapshot(...)` shape (last-write-wins on
 * the VISIBLE state), it did; under the cured shape the late resolve writes
 * only the cache, so the accessor — reading the now-null `previewNode` —
 * stays empty.
 *
 * The composable warms the cache internally via `useThumbnailCache().getSnapshot`.
 * To model a SLOW cache miss (the race window) WITHOUT splitting the shared-
 * cache module graph, `useThumbnailCache` is mocked once (hoisted) to the REAL
 * implementation with its `getSnapshot` wrapped in a test-controlled gate
 * (`warmGate`): the wrapper awaits the gate, then delegates to the real fill,
 * so `getSnapshotSync` and the cache itself stay the genuine production
 * singletons and the "the cache genuinely fills" assertion exercises real code.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';
import type { BoardId, NodeId } from '../../src/types';

// Quiet resetWorkspace's service-cleanup paths (the standard Tier-3 mocks).
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

// A test-controlled gate over the cache WARM. `null` = warm resolves
// immediately (the default, cold-cache fast path); a Promise = the warm is
// held until the test releases it (the slow-cache-miss race window). Module-
// level so the hoisted mock factory can close over it; each test resets it.
let warmGate: Promise<void> | null = null;

// Mock useThumbnailCache to the REAL implementation, wrapping getSnapshot in
// the gate. getSnapshotSync and the underlying reactive cache stay the real
// singletons (one module graph), so the accessor reads — and the "cache
// genuinely fills" assertion — exercise production code.
vi.mock('../../src/composables/cards/useThumbnailCache', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/composables/cards/useThumbnailCache')
  >('../../src/composables/cards/useThumbnailCache');
  return {
    ...actual,
    useThumbnailCache: () => {
      const real = actual.useThumbnailCache();
      return {
        ...real,
        getSnapshot: async (nodeId: NodeId, bId: BoardId) => {
          if (warmGate) await warmGate;
          return real.getSnapshot(nodeId, bId);
        },
      };
    },
  };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace } from '../../src/store';
import { useThumbnailCache } from '../../src/composables/cards/useThumbnailCache';
import { usePreviewSnapshot } from '../../src/composables/cards/usePreviewSnapshot';
import { purgeAllThumbnails } from '../../src/composables/cards/thumbnail-render-resources';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';

beforeEach(() => {
  warmGate = null;
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  resetWorkspace();
  purgeAllThumbnails();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(source: string): { boardId: BoardId; path: NodeId[] } {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  // The mainline node ids in play order (root first). The panels index a
  // RootToLeafPath; for the seam property a hand-walked mainline suffices.
  const path: NodeId[] = [];
  let id: NodeId | undefined = board.rootNodeId;
  while (id) {
    path.push(id);
    id = board.nodes[id].children[0];
  }
  return { boardId: board.id, path };
}

describe('chart-panel preview seam (cured shape — real usePreviewSnapshot)', () => {
  it('hover sets the gate synchronously; the accessor fills once the warm resolves', async () => {
    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const hovered = path[2];

    const seam = usePreviewSnapshot(boardId);
    seam.showPreview(hovered);

    // Gate set synchronously; on a cold cache the accessor reads null until
    // the warm lands (no awaited write into the gate).
    expect(seam.previewNode.value).toBe(hovered);

    await flushPromises();
    const snap = seam.getPreview();
    expect(snap).not.toBeNull();
    // The accessor surfaces the hovered position via a stable cache read.
    expect(snap).toEqual(seam.getPreview());
  });

  it('a warm landing AFTER a leave-time reset does not resurrect the stale preview', async () => {
    // Hold the warm: model a slow cache-miss resolve that lands after leave.
    let release!: () => void;
    warmGate = new Promise<void>(r => { release = r; });

    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const hovered = path[2];

    const seam = usePreviewSnapshot(boardId);

    // Hover, then leave before the warm resolves.
    seam.showPreview(hovered);
    expect(seam.previewNode.value).toBe(hovered);
    seam.reset();
    expect(seam.previewNode.value).toBeNull();
    expect(seam.getPreview()).toBeNull();

    // The slow warm now resolves and fills the SHARED cache for `hovered`.
    release();
    await flushPromises();

    // The cache is warm for `hovered`…
    expect(useThumbnailCache().getSnapshotSync(hovered)).not.toBeNull();
    // …but the gate was cleared by the leave, so the docked preview stays
    // empty — no content-resurrection. (Under the old awaited-write shape
    // the late resolve would have repopulated it.)
    expect(seam.getPreview()).toBeNull();
  });

  it('the async warm writes only the shared cache, never the gate', async () => {
    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const hovered = path[1];

    const seam = usePreviewSnapshot(boardId);
    seam.showPreview(hovered);
    seam.reset(); // clear before the warm can resolve

    await flushPromises();

    // previewNode (the gate) is untouched by the resolved warm.
    expect(seam.previewNode.value).toBeNull();
    expect(seam.getPreview()).toBeNull();
    // The warm still filled the shared cache for `hovered` (cache-only write).
    expect(useThumbnailCache().getSnapshotSync(hovered)).not.toBeNull();
  });
});
