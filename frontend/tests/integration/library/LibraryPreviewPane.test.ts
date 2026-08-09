/**
 * tests/integration/library/LibraryPreviewPane.test.ts
 *
 * Component-level regression guard for library audit findings L8
 * and L9 (ledger row 1017):
 *
 *   - L8: the preview must render a meaningful position for a game
 *     with moves, not the empty board at move 0 (identical for
 *     every one of 28,847 GoGoD rows before this fix). Grounded in
 *     genre convention (OGS thumbnails the final position, Sabaki
 *     shows the loaded node, GoBase's diagrams carry stones): the
 *     default is the FINAL main-line position.
 *   - L9: the header must name Black before White (matching Go
 *     convention and the table's own Black|White column order),
 *     with a real "vs" separator — not White-first with the
 *     separator jammed against both names.
 *
 * Mounts the real `LibraryPreviewPane` against the real
 * `useLibraryPreview` composable, with `libraryService.getGame`
 * mocked — the same seam `useLibraryPreview.test.ts` drives, one
 * layer up so the rendered header/board are asserted directly
 * rather than the composable's internal state alone.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../../src/i18n';

vi.mock('../../../src/services/library-service', () => {
  return {
    libraryService: {
      getGame: vi.fn(),
    },
  };
});

import { libraryService } from '../../../src/services/library-service';
import { useLibraryPreview } from '../../../src/composables/library/useLibraryPreview';
import LibraryPreviewPane from '../../../src/components/library/LibraryPreviewPane.vue';
import type { LibraryGame, LibraryGameListItem } from '../../../src/types';

const mockGet = vi.mocked(libraryService.getGame);

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
  };
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

describe('LibraryPreviewPane — L8 default position', () => {
  it('renders the FINAL main-line position (stones present), not the empty board', async () => {
    const sgfBody = '(;FF[4]GM[1]SZ[19];B[pd];W[dp];B[qq];W[cd])';
    mockGet.mockResolvedValueOnce(makeGame(7, sgfBody));

    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 7);
    await wrapper.vm.$nextTick();

    // Position index used is the LAST node on the main line, not 0.
    expect(preview.totalMoves.value).toBe(4);
    expect(preview.scrubPosition.value).toBe(4);

    // The rendered board carries stones — a non-empty position.
    const stoneCount = wrapper.findAll('circle').length;
    expect(stoneCount).toBeGreaterThan(0);

    // Scrub readout reflects the same non-zero default.
    expect(wrapper.text()).toContain('4 / 4');
  });

  it('degrades sanely to the empty board for an actually-empty game (no moves)', async () => {
    mockGet.mockResolvedValueOnce(makeGame(8, '(;FF[4]GM[1]SZ[19])'));

    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 8);
    await wrapper.vm.$nextTick();

    expect(preview.totalMoves.value).toBe(0);
    expect(preview.scrubPosition.value).toBe(0);
    expect(wrapper.findAll('circle').length).toBe(0);
  });
});

describe('LibraryPreviewPane — L9 header order and separator', () => {
  it('names Black before White with a real separator', async () => {
    const sgfBody = '(;FF[4]GM[1]SZ[19];B[pd];W[dp])';
    mockGet.mockResolvedValueOnce(makeGame(7, sgfBody));

    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 7);
    await wrapper.vm.$nextTick();

    const black = wrapper.find('.meta-player-black');
    const white = wrapper.find('.meta-player-white');
    const sep = wrapper.find('.meta-vs');
    expect(black.exists()).toBe(true);
    expect(white.exists()).toBe(true);
    expect(sep.exists()).toBe(true);
    expect(black.text()).toBe('Rin Kaiho');
    expect(white.text()).toBe('Kobayashi Koichi');
    // Separator carries real text (i18n'd "vs"), not empty/collided.
    expect(sep.text().length).toBeGreaterThan(0);

    // DOM order: black element precedes white element.
    const playersEl = wrapper.find('.meta-players');
    const html = playersEl.html();
    expect(html.indexOf('Rin Kaiho')).toBeLessThan(html.indexOf('Kobayashi Koichi'));

    // The separator is its own element between the two names — not
    // text collided into either name (L9's "KoichivsRin" run-on).
    const namesEl = playersEl.element;
    const children = Array.from(namesEl.children).map((c) => c.className);
    expect(children).toEqual(['meta-player-black', 'meta-vs', 'meta-player-white']);
  });
});
