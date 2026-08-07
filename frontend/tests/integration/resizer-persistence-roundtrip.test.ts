/**
 * tests/integration/resizer-persistence-roundtrip.test.ts
 *
 * resizer-rearch: the persistence half of the contract — "reload
 * restores the dragged layout exactly" — exercised against the SAME
 * mechanism `SyncService` actually uses
 * (`buildPersistencePayload` → PUT → … → GET → `updateFromRemote`),
 * mirroring `migration-store-roundtrip.test.ts`'s pattern rather than
 * a mocked shortcut. No DOM drag here (that's the Playwright dense-
 * sweep probe's job, `.claude/dispatch-reports/resizer-rearch-probe.mjs`)
 * — this test's job is the store-level round trip: does a value a
 * drag *would* write survive a save/hydrate cycle unchanged, and does
 * it NOT resurrect either of the two prior homes the resizer-rearch
 * migration collapsed (`boardSquareMaxWidthPx`, the dead
 * `controlPanelWidth`)?
 *
 * Covers the FINAL two-fact model (nested-splitter amendment ledger
 * row 391, geometry per maintainer constraint ledger row 414):
 *   - `treePanelWidthPx` — the INNER bar's fact (tree panel's own
 *     width; this is the tree pane's ONLY write channel, ever — see
 *     useResizablePanel.ts).
 *   - `treeControlRegionWidthPx` — the OUTER bar's fact (the combined
 *     tree+control wrapper's own width).
 * `controlPanelWidthPx` no longer exists as a persisted fact at all
 * — `#control-panel` is purely CSS-derived (`flex: 1 1 0` inside the
 * wrapper), so there is nothing to round-trip for it.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same service-mock preamble as migration-store-roundtrip.test.ts —
// importing `src/store` pulls the effectful service singletons, which
// must be faked in jsdom.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({ warmPath: vi.fn() }),
}));

vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));

vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import {
  store,
  buildPersistencePayload,
  updateFromRemote,
  resetWorkspace,
} from '../../src/store';

beforeEach(() => {
  resetWorkspace();
});

describe('resizer-rearch: prior homes stay gone on hydrate', () => {
  it('a legacy blob carrying the two prior homes loses both and gains neither the retired controlPanelWidthPx nor a stray key', () => {
    const legacyPayload: any = {
      schemaVersion: 61,
      activeBoardIndex: 0,
      boards: [],
      profile: {},
      session: {
        ui: {
          boardSquareMaxWidthPx: 3490,
          controlPanelWidth: 340,
        },
      },
    };

    updateFromRemote(legacyPayload);

    expect('boardSquareMaxWidthPx' in store.session.ui).toBe(false);
    expect('controlPanelWidth' in store.session.ui).toBe(false);
    // No value is carried forward (see migration 61 → 62's comment);
    // both current-model fields start at their documented defaults.
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();

    const payload = buildPersistencePayload();
    expect('boardSquareMaxWidthPx' in payload.session.ui).toBe(false);
    expect('controlPanelWidth' in payload.session.ui).toBe(false);
    expect('controlPanelWidthPx' in payload.session.ui).toBe(false);
  });
});

describe('resizer-rearch nested-splitter (ledger row 391/414): treePanelWidthPx persistence round trip (INNER bar)', () => {
  it('a dragged tree-panel value survives save → hydrate unchanged', () => {
    // Simulate what the INNER bar's onMouseMove writes: a plain
    // reactive mutation on store.session.ui — no separate "touch"
    // call, per useResizablePanel.ts's docstring; SyncService's
    // existing deep watch on store.session picks this up the same as
    // any other session.ui leaf.
    store.session.ui.treePanelWidthPx = 260;

    const payload = buildPersistencePayload();
    expect(payload.session.ui.treePanelWidthPx).toBe(260);

    resetWorkspace();
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
    updateFromRemote(payload);

    expect(store.session.ui.treePanelWidthPx).toBe(260);
  });

  it('undefined (never dragged) round-trips as undefined, not a stray key', () => {
    const payload = buildPersistencePayload();
    expect(payload.session.ui.treePanelWidthPx).toBeUndefined();

    resetWorkspace();
    updateFromRemote(payload);
    expect(store.session.ui.treePanelWidthPx).toBeUndefined();
  });
});

describe('resizer-rearch nested-splitter (ledger row 391/414): treeControlRegionWidthPx persistence round trip (OUTER bar)', () => {
  it('a dragged region value survives save → hydrate unchanged', () => {
    store.session.ui.treeControlRegionWidthPx = 1900;

    const payload = buildPersistencePayload();
    expect(payload.session.ui.treeControlRegionWidthPx).toBe(1900);

    resetWorkspace();
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
    updateFromRemote(payload);

    expect(store.session.ui.treeControlRegionWidthPx).toBe(1900);
  });

  it('undefined (never dragged) round-trips as undefined, not a stray key', () => {
    const payload = buildPersistencePayload();
    expect(payload.session.ui.treeControlRegionWidthPx).toBeUndefined();

    resetWorkspace();
    updateFromRemote(payload);
    expect(store.session.ui.treeControlRegionWidthPx).toBeUndefined();
  });
});

describe('resizer-rearch: the two facts persist and round-trip INDEPENDENTLY (ADR-0012 one-home-per-fact)', () => {
  it('dragging/persisting one pane\'s fact never touches the other\'s', () => {
    store.session.ui.treePanelWidthPx = 300;
    let payload = buildPersistencePayload();
    expect(payload.session.ui.treePanelWidthPx).toBe(300);
    expect(payload.session.ui.treeControlRegionWidthPx).toBeUndefined();

    resetWorkspace();
    updateFromRemote(payload);
    store.session.ui.treeControlRegionWidthPx = 1900;
    payload = buildPersistencePayload();
    expect(payload.session.ui.treePanelWidthPx).toBe(300);
    expect(payload.session.ui.treeControlRegionWidthPx).toBe(1900);

    resetWorkspace();
    updateFromRemote(payload);
    expect(store.session.ui.treePanelWidthPx).toBe(300);
    expect(store.session.ui.treeControlRegionWidthPx).toBe(1900);
  });
});
