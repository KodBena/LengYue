/**
 * tests/integration/library/LibraryPreviewPane.test.ts
 *
 * Component-level regression guard for library audit findings L8
 * and L9 (ledger row 1017), and the cross-selection scrub-state
 * defect at ledger rows 1544/1545:
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
 *   - rows 1544/1545: selecting a different game must re-derive the
 *     scrubber's value, max, and rendered handle position ATOMICALLY
 *     from the newly-selected game — no pane-scoped native-DOM
 *     residue from the previously-selected game. See
 *     `LibraryPreviewPane.vue`'s `scrubKey` comment for the exact
 *     mechanism (a native `<input type="range">` `.value` PROPERTY
 *     write, on the Vue update path, silently clamps to a still-
 *     stale `max` ATTRIBUTE when growing from a shorter game to a
 *     longer one) and the fix (key the element to the selected
 *     game's identity so Vue always takes the mount path, which
 *     orders min/max before value).
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

// A main-line SGF of exactly `n` moves, each at an even (x, y)
// coordinate — the minimum coordinate delta between any two placed
// stones is 2 in every direction, so none are ever orthogonally
// adjacent and no capture can occur regardless of color alternation.
// That makes "the board shows the newly-selected game's final
// position" a plain stone-count assertion (n stones + the one
// last-move marker ring `showMarker` draws) rather than something
// requiring capture-aware board-state introspection.
function movesSgf(n: number): string {
  let s = '(;FF[4]GM[1]SZ[19]';
  for (let i = 0; i < n; i++) {
    const color = i % 2 === 0 ? 'B' : 'W';
    const x = String.fromCharCode(97 + 2 * (i % 10));
    const y = String.fromCharCode(97 + 2 * (Math.floor(i / 10) % 10));
    s += `;${color}[${x}${y}]`;
  }
  return s + ')';
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

describe('LibraryPreviewPane — rows 1544/1545: scrub state re-derives atomically on selection change', () => {
  // The defect: switching from a SHORTER game to a LONGER one left the
  // native <input type="range">'s DOM `.value` clamped to the shorter
  // game's old `max` (the update-path ordering bug the scrubKey
  // comment documents), even though the reactive label/board already
  // showed the new game correctly. Game A is short (5 moves); Game B
  // is long (40 moves) — a real reproduction requires B's target
  // value (40) to exceed A's stale max (5) at DOM-write time, which
  // this size gap guarantees.
  const sgfA = movesSgf(5);
  const sgfB = movesSgf(40);

  it('selecting a longer game after scrubbing a shorter one lands on the longer game — value, max, and handle agree, and the board is the new game\'s final position', async () => {
    mockGet.mockResolvedValueOnce(makeGame(1, sgfA));
    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 1);
    expect(preview.totalMoves.value).toBe(5);

    // Scrub A to an early turn — off its default (final) position.
    const sliderA = wrapper.find('input.scrub-slider');
    await sliderA.setValue('2');
    await nextTick();
    expect(preview.scrubPosition.value).toBe(2);

    // Select the longer game B.
    mockGet.mockResolvedValueOnce(makeGame(2, sgfB));
    await selectAndSettle(preview, 2);

    // Reactive state: lands on B's LAST move (genre default), not a
    // survivor of A's scrub position.
    expect(preview.totalMoves.value).toBe(40);
    expect(preview.scrubPosition.value).toBe(40);

    // The native DOM element — value, max, and label all agree; this
    // is exactly the property the old bug broke (label said 40/40
    // while the underlying <input> stayed clamped near A's old max).
    const sliderB = wrapper.find('input.scrub-slider');
    const el = sliderB.element as HTMLInputElement;
    expect(el.max).toBe('40');
    expect(el.value).toBe('40');
    expect(wrapper.find('.scrub-position').text()).toBe('40 / 40');

    // The rendered board is B's final position: 40 non-adjacent moves
    // land exactly 40 stones, plus the one last-move marker ring.
    expect(wrapper.findAll('circle').length).toBe(41);
  });

  it('selecting back to the shorter game afterwards also lands correctly (not a one-direction fix)', async () => {
    mockGet.mockResolvedValueOnce(makeGame(1, sgfA));
    const preview = useLibraryPreview();
    const wrapper = mount(LibraryPreviewPane, {
      props: { preview },
      global: { plugins: [i18n] },
    });

    await selectAndSettle(preview, 1);
    mockGet.mockResolvedValueOnce(makeGame(2, sgfB));
    await selectAndSettle(preview, 2);
    // Scrub the longer game to an early turn before switching back.
    const sliderB = wrapper.find('input.scrub-slider');
    await sliderB.setValue('3');
    await nextTick();
    expect(preview.scrubPosition.value).toBe(3);

    mockGet.mockResolvedValueOnce(makeGame(1, sgfA));
    await selectAndSettle(preview, 1);

    expect(preview.totalMoves.value).toBe(5);
    expect(preview.scrubPosition.value).toBe(5);

    const sliderA = wrapper.find('input.scrub-slider');
    const el = sliderA.element as HTMLInputElement;
    expect(el.max).toBe('5');
    expect(el.value).toBe('5');
    expect(wrapper.find('.scrub-position').text()).toBe('5 / 5');
    expect(wrapper.findAll('circle').length).toBe(6);
  });
});
