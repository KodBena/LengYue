/**
 * tests/integration/chart-panel-preview.seam.test.ts
 *
 * Pins the cured hover-preview seam the analysis chart panels
 * (`ScoreLeadPanel`, `MergedDeltaPanel`) migrated to under item
 * `chart-panel-preview-migration` — the synchronous-gate + accessor-over-
 * cache shape PR #413 established for `FloatingThumbnail` / `ChartPreviewBox`
 * (see `FloatingThumbnail.seam.test.ts`, the floating-surface analog).
 *
 * The seam, as the panels now wire it:
 *   - the visible preview state is a `previewNode` ref holding a NodeId (or
 *     null), written ONLY synchronously (a hover sets it, a leave-time
 *     `resetPreview` clears it);
 *   - the displayed snapshot is DERIVED through `getSnapshotSync(previewNode)`
 *     in an accessor (`() => BoardSnapshot | null`), the contract
 *     `ChartPreviewBox` consumes;
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
 * The test drives the REAL `useThumbnailCache` (the production sync-read /
 * async-warm functions the panels delegate to) against a real board; the
 * panel quartet itself (the ref + the two one-line setters + the accessor)
 * is the minimal glue modelled here, exactly as both panels spell it. A
 * deliberately-deferred `getSnapshot` resolve simulates the slow cache miss.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
// @ts-ignore — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

// Quiet resetWorkspace's service-cleanup paths (the standard Tier-3 mocks).
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace } from '../../src/store';
import { useThumbnailCache } from '../../src/composables/cards/useThumbnailCache';
import { purgeAllThumbnails } from '../../src/composables/cards/thumbnail-render-resources';
import type { BoardSnapshot } from '../../src/engine/board-geometry';
import type { BoardId, NodeId } from '../../src/types';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { resetFakeAnalysisPersistenceService } from '../fakes/analysis-persistence-service';

beforeEach(() => {
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

/**
 * The panels' cured quartet, spelled exactly as `ScoreLeadPanel` /
 * `MergedDeltaPanel` now wire it: a synchronously-written nodeId ref, an
 * accessor deriving the snapshot through the real `getSnapshotSync`, and a
 * `showPreview` that warms the shared cache fire-and-forget. `getSnapshot`
 * is the real cache fill; the test substitutes a deferred one per case to
 * model a slow cache miss.
 */
function makePanelSeam(
  boardId: BoardId,
  warm: (nodeId: NodeId, boardId: BoardId) => Promise<unknown>,
) {
  const { getSnapshotSync } = useThumbnailCache();
  const previewNode = ref<NodeId | null>(null);
  const getPreview = (): BoardSnapshot | null =>
    previewNode.value ? getSnapshotSync(previewNode.value) : null;
  function showPreview(nodeId: NodeId): void {
    previewNode.value = nodeId;
    void warm(nodeId, boardId);
  }
  function resetPreview(): void {
    previewNode.value = null;
  }
  return { previewNode, getPreview, showPreview, resetPreview };
}

describe('chart-panel preview seam (cured shape)', () => {
  it('hover sets the gate synchronously; the accessor fills once the warm resolves', async () => {
    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const { getSnapshot } = useThumbnailCache();
    const hovered = path[2];

    const seam = makePanelSeam(boardId, getSnapshot);
    seam.showPreview(hovered);

    // Gate set synchronously; on a cold cache the accessor reads null until
    // the warm lands (no awaited write into the gate).
    expect(seam.previewNode.value).toBe(hovered);

    await flushPromises();
    const snap = seam.getPreview();
    expect(snap).not.toBeNull();
    // The accessor surfaces the hovered position, not some other node.
    expect(snap).toEqual(seam.getPreview()); // stable cache read
  });

  it('a warm landing AFTER a leave-time reset does not resurrect the stale preview', async () => {
    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[pp])');
    const hovered = path[2];

    // A deferred warm: the cache fill is held until we release it, modelling
    // a slow cache-miss resolve that lands after the user has left the chart.
    const real = useThumbnailCache();
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const deferredWarm = async (nodeId: NodeId, bId: BoardId): Promise<unknown> => {
      await gate;
      return real.getSnapshot(nodeId, bId);
    };

    const seam = makePanelSeam(boardId, deferredWarm);

    // Hover, then leave before the warm resolves.
    seam.showPreview(hovered);
    expect(seam.previewNode.value).toBe(hovered);
    seam.resetPreview();
    expect(seam.previewNode.value).toBeNull();
    expect(seam.getPreview()).toBeNull();

    // The slow warm now resolves and fills the SHARED cache for `hovered`.
    release();
    await flushPromises();

    // The cache is warm for `hovered`…
    expect(real.getSnapshotSync(hovered)).not.toBeNull();
    // …but the gate was cleared by the leave, so the docked preview stays
    // empty — no content-resurrection. (Under the old awaited-write shape
    // the late resolve would have repopulated it.)
    expect(seam.getPreview()).toBeNull();
  });

  it('the async warm writes only the shared cache, never the gate', async () => {
    const { boardId, path } = setup('(;FF[4]GM[1]SZ[19];B[pd];W[dp])');
    const { getSnapshot } = useThumbnailCache();
    const hovered = path[1];

    const seam = makePanelSeam(boardId, getSnapshot);
    seam.showPreview(hovered);
    seam.resetPreview(); // clear before the warm can resolve

    await flushPromises();

    // previewNode (the gate) is untouched by the resolved warm.
    expect(seam.previewNode.value).toBeNull();
    expect(seam.getPreview()).toBeNull();
  });
});
