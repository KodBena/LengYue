/**
 * tests/integration/library/LibraryPreviewDensity.test.ts
 *
 * Regression guard for ledger rows 1525/1526 (commissioner
 * screenshot ~/smallscreen.png): "a single game's board-preview
 * thumbnail expands to fill the panel width, so on small screens
 * exactly one game is visible — the list has stopped being a
 * list." Root cause and fix are documented in full at the two edit
 * sites (LibraryPreviewPane.vue's `.preview-board` + script-block
 * comment, LibraryTab.vue's narrow-stack `@container` rule) — this
 * suite witnesses both halves plus the reuse decision:
 *
 *   - LibraryTable renders MULTIPLE discrete, fixed-height rows for
 *     N>1 games — a DOM-observable fact even though jsdom does not
 *     execute `@container` layout (LibraryTable's own overscan
 *     guarantees rendered rows independent of measured container
 *     height; see useVirtualRowList.ts).
 *   - LibraryPreviewPane's board reuses the shared `MiniBoard`
 *     component (same idiom the sidebar rail's docked hover preview
 *     uses) rather than a bespoke SVG-string projection — asserted
 *     structurally via the rendered `.mini-board` element.
 *   - The actual size/collapse claims are SOURCE-PINNED (Tier-1
 *     source-text assertions, same posture as
 *     tests/unit/library-token-integrity.test.ts): `.preview-board`
 *     is capped in BOTH dimensions, and the narrow-stack grid row
 *     that used to let it grow unbounded is capped too. A real
 *     multi-viewport visual claim (does the list actually show N
 *     rows on a 1600x900 screen) is UNEXERCISED here — no headless
 *     browser / real CSS layout engine runs in this jsdom suite;
 *     these source facts are the proxy per the dispatch brief.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { i18n } from '../../../src/i18n';
import LibraryTable from '../../../src/components/library/LibraryTable.vue';
import type { LibraryGameListItem } from '../../../src/types';
import type { GameDisplayOrdinal, GameSourceId } from '../../../src/types/ids';

// jsdom ships no ResizeObserver (same gap LibraryTable-column-fit.test.ts
// and panel-content-two-col-reflow.test.ts each fill); LibraryTable's
// onMounted wires one unconditionally for both the scroll container's
// height tracking and the header's width tracking. A no-op stub is
// enough here — this suite doesn't drive width/height changes, it only
// needs mount to not throw.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
});
afterEach(() => {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
});

vi.mock('../../../src/services/library-service', () => ({
  libraryService: { getGame: vi.fn() },
}));

import { libraryService } from '../../../src/services/library-service';
import { useLibraryPreview } from '../../../src/composables/library/useLibraryPreview';
import LibraryPreviewPane from '../../../src/components/library/LibraryPreviewPane.vue';
import type { LibraryGame } from '../../../src/types';

const mockGet = vi.mocked(libraryService.getGame);

function fakeRow(i: number): LibraryGameListItem {
  return {
    id: i as unknown as GameSourceId,
    clientGameId: `board-${i}` as any,
    playerWhite: 'Cho Hun-hyeon',
    playerBlack: 'Seo Pong-su',
    date: '1981-09-08',
    result: 'B+1.5',
    ruleset: 'Japanese',
    boardSize: 19,
    createdAt: '2026-01-01T00:00:00Z',
    displayOrdinal: i as unknown as GameDisplayOrdinal,
  };
}

describe('LibraryTable — dense multi-row rendering survives (rows 1525/1526)', () => {
  it('renders more than one discrete row for a library with several games, each a fixed 32px row — not one giant tile', async () => {
    const wrapper = mount(LibraryTable, {
      props: {
        totalCount: 8,
        rowAt: (i: number) => (i < 8 ? fakeRow(i) : null),
        isRowLoading: () => false,
        sort: 'date',
        direction: 'desc',
        selectedId: null,
      },
    });
    await nextTick();

    const rows = wrapper.findAll('.library-row');
    // useVirtualRowList's default overscan (5) alone renders rows
    // independent of measured container height in jsdom — see the
    // composable's own doc comment. A regression that made ONE row
    // consume the whole list (the reported defect's shape) would
    // show as exactly one (or zero) `.library-row` elements here.
    expect(rows.length).toBeGreaterThan(1);

    // Every rendered row carries the SAME fixed pixel height — no
    // row grows to swallow the list the way the (unrelated) preview
    // pane's board once did.
    for (const row of rows) {
      expect(row.attributes('style')).toContain('height: 32px');
    }

    // This list renders no board/canvas/svg thumbnail per row at
    // all today — see LibraryTable.vue's own header comment for why
    // (LibraryGameListItem carries no SGF body; see
    // types/library.ts). Guard that fact explicitly so a future
    // per-row-thumbnail addition is a deliberate, evidenced choice,
    // not an accidental reintroduction of the collapse this suite
    // guards against.
    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(wrapper.find('.mini-board').exists()).toBe(false);
  });
});

function makeListItem(id: number): LibraryGameListItem {
  return {
    id: id as never,
    clientGameId: '11111111-2222-3333-4444-555555555555' as never,
    playerWhite: 'Kobayashi Koichi',
    playerBlack: 'Rin Kaiho',
    date: '1981-11-12',
    result: 'B+R',
    ruleset: 'Japanese',
    boardSize: 19,
    createdAt: '2026-01-01T00:00:00Z',
  } as LibraryGameListItem;
}

function makeGame(id: number, rawContent: string): LibraryGame {
  return {
    id: id as never,
    clientGameId: '11111111-2222-3333-4444-555555555555' as never,
    playerWhite: 'Kobayashi Koichi',
    playerBlack: 'Rin Kaiho',
    date: '1981-11-12',
    result: 'B+R',
    ruleset: 'Japanese',
    boardSize: 19,
    metadataExtra: {},
    createdAt: '2026-01-01T00:00:00Z',
    rawContent,
  };
}

beforeEach(() => {
  mockGet.mockReset();
});

async function selectAndSettle(preview: ReturnType<typeof useLibraryPreview>, id: number) {
  preview.selectedRow.value = makeListItem(id);
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

describe('LibraryPreviewPane — reuses the shared MiniBoard thumbnail idiom (rows 1525/1526)', () => {
  it('renders the selected game through the shared MiniBoard component, not a bespoke SVG-string projection', async () => {
    const sgfBody = '(;FF[4]GM[1]SZ[19];B[pd];W[dp])';
    mockGet.mockResolvedValueOnce(makeGame(7, sgfBody));

    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 7);
    await wrapper.vm.$nextTick();

    // MiniBoardSvg (the default renderer) mounts a `.mini-board` SVG
    // element — the same class/idiom MiniBoardCanvas and every other
    // MiniBoard consumer (SidebarWidget's docked hover preview,
    // ChartPreviewBox) render through.
    const board = wrapper.find('.mini-board');
    expect(board.exists()).toBe(true);
    expect(board.element.tagName.toLowerCase()).toBe('svg');

    // Exactly one board instance for the one selected game — this
    // pane never fans MiniBoard out per row (that would be the
    // per-row-thumbnail shape considered and rejected; see
    // LibraryTable.vue's own header comment for why).
    expect(wrapper.findAll('.mini-board').length).toBe(1);
  });
});

describe('LibraryPreviewPane + LibraryTab — the collapse\'s fix is source-pinned (rows 1525/1526)', () => {
  const previewPaneSrc = readFileSync(
    resolve(process.cwd(), 'src/components/library/LibraryPreviewPane.vue'),
    'utf-8',
  );
  const libraryTabSrc = readFileSync(
    resolve(process.cwd(), 'src/components/library/LibraryTab.vue'),
    'utf-8',
  );

  it('.preview-board is capped in BOTH dimensions with a fixed, modest size (not max-width + aspect-ratio alone)', () => {
    const rule = previewPaneSrc.match(/\.preview-board\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    const body = rule![0];

    // Fixed, not merely bounded-above: a `max-width`/`aspect-ratio`
    // pairing has no height ceiling when the parent's own height is
    // intrinsic (the narrow-stack `auto` grid row) — that combination
    // is exactly what grew unbounded and starved the sibling list.
    expect(body).toMatch(/width:\s*160px/);
    expect(body).toMatch(/height:\s*160px/);
    // Modest per the genre's 120-180px range named in the dispatch
    // brief, and close to the sidebar rail's own 150px docked-preview
    // convention.
    expect(body).not.toMatch(/aspect-ratio/);
  });

  it('the narrow-stack (@container max-width: 700px) row template floors the list and caps the preview', () => {
    const containerBlock = libraryTabSrc.match(
      /@container \(max-width: 700px\)\s*\{[\s\S]*?grid-template-rows:\s*([^;]+);/,
    );
    expect(containerBlock).not.toBeNull();
    const rows = containerBlock![1];

    // List row: a floor (`minmax(160px, 1fr)`), never allowed to
    // shrink to 0 regardless of what the sibling preview row does.
    expect(rows).toMatch(/minmax\(160px,\s*1fr\)/);
    // Preview row: a hard ceiling — no longer bare `auto`, which is
    // unbounded-above and is what let the board's content height
    // exceed the container and crush the list to ~0px.
    expect(rows).toMatch(/minmax\(0,\s*260px\)/);
    expect(rows).not.toMatch(/minmax\(0,\s*auto\)/);
  });
});
