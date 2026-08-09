/**
 * tests/integration/MintCardModal-komi-calibration.test.ts
 *
 * Tier-3 (composable/component integration) tests for the mint-time
 * komi-calibration flow wired through `MintCardModal`. Commissioner
 * ruling (ledger row 1063): calibration is a BATCH-WIDE option — when
 * the "calibrate komi" checkbox is set AND the engine is connected, it
 * applies to EVERY card in the batch, each calibrated to its OWN
 * position (a separate `useMinting.calibrateKomiOnDraft` call per
 * card, sequential) before `commitMintBatch`; it system-logs a
 * batch-wide summary, and ABORTS THE WHOLE MINT loudly if ANY
 * evaluation fails (ADR-0002) — no partial batch ever reaches the
 * wire. The control is no longer gated on selection size.
 *
 * `useKomiCalibration` is mocked (its real form owns a one-shot
 * WebSocket connection — out of scope for a component test) so this
 * suite isolates the modal's calibration gating, per-card ordering,
 * logging, and abort behaviour; `useMinting` itself is left REAL —
 * there is exactly ONE mint call site now (`commitMintBatch` /
 * `POST /cards/batch`), faked via `backendService`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const calibrate = vi.fn();
vi.mock('../../src/composables/review/useKomiCalibration', () => ({
  useKomiCalibration: () => ({ calibrate }),
}));

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { store, addBoard } from '../../src/store';
import { createInitialBoard, asNodeId } from '../../src/store/board-factory';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import { addToSelection, removeSelectionSlot } from '../../src/composables/cards/mint-selection';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { purgeKnownPositions } from '../../src/state/known-positions';
import type { BoardId, GameNode } from '../../src/types';

function boardWithChild() {
  const board = createInitialBoard();
  const child = asNodeId('c1');
  const childNode: GameNode = {
    id: child, parent: board.rootNodeId, children: [], activeChildIndex: 0,
    properties: { B: ['aa'] }, move: { x: 0, y: 0, color: 'B', type: 'place' },
  };
  board.nodes[board.rootNodeId].children.push(child);
  board.nodes[child] = childNode;
  return { board, child };
}

beforeEach(() => {
  calibrate.mockReset();
  resetFakeBackendService();
  fakeBackendService.hashPosition.mockImplementation(async (raw: string) => raw as any);
  fakeBackendService.createCardsBatch.mockResolvedValue([1]);
  purgeKnownPositions();
  store.profile.settings.minting.defaultPaletteId = 'active';
  store.engine.messages = [];
});

async function openModal(boardId: BoardId) {
  const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
  await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> }).open(boardId);
  await flushPromises();
  return wrapper;
}

describe('MintCardModal — komi calibration (single-card / degenerate batch)', () => {
  it('runs calibration, adjusts komi, logs a batch-of-1 summary, then mints (ledger row 1146: TT board rounds to integer)', async () => {
    store.engine.status = 'connected';
    // The default board (`store.boards[0]`, seeded via `createInitialBoard`)
    // carries `RU: ['Tromp-Taylor']` — `calibrateKomiOnDraft` now routes
    // `calibrate`'s half-integer wire result (10.5) through
    // `normalizeKomiForRuleset` against the CARD's own ruleset before
    // writing it (ledger row 1146), so the persisted KM is the rounded
    // integer 11, not the raw wire value.
    calibrate.mockResolvedValue({ evenKomi: 10.5, scoreLeadBlackPositive: 4, rawEvenKomi: 10.5, clamped: false });

    const boardId = store.boards[0].id as BoardId;
    const wrapper = await openModal(boardId);
    // The calibration controls render whenever the engine is connected
    // — no longer gated by selection size (ledger row 1063).
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(true);
    await wrapper.find('.calibrate-checkbox').setValue(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrate).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards[0].raw_content).toContain('KM[11]');
    expect(payload.cards[0].raw_content).not.toContain('KM[10.5]');

    const infos = store.engine.messages.filter(m => m.type === 'info');
    expect(infos.some(m => m.text.includes('1'))).toBe(true); // batch-of-1 summary names the count

    removeSelectionSlot(boardId);
  });

  it('a NON-Tromp-Taylor board keeps calibration\'s half-integer result unchanged (ledger row 1146)', async () => {
    store.engine.status = 'connected';
    // Same calibration result (10.5) as the TT case above, but the
    // board's ruleset is Chinese (half-integer domain) — the written
    // komi must NOT be rounded to an integer.
    const root = store.boards[0].nodes[store.boards[0].rootNodeId];
    root.properties = { ...root.properties, RU: ['Chinese'] };
    calibrate.mockResolvedValue({ evenKomi: 10.5, scoreLeadBlackPositive: 4, rawEvenKomi: 10.5, clamped: false });

    const boardId = store.boards[0].id as BoardId;
    const wrapper = await openModal(boardId);
    await wrapper.find('.calibrate-checkbox').setValue(true);
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards[0].raw_content).toContain('KM[10.5]');

    removeSelectionSlot(boardId);
  });

  it('aborts the mint loudly when calibration fails — no mint, error logged', async () => {
    store.engine.status = 'connected';
    calibrate.mockRejectedValue(new Error('engine disconnected'));

    const boardId = store.boards[0].id as BoardId;
    const wrapper = await openModal(boardId);
    await wrapper.find('.calibrate-checkbox').setValue(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrate).toHaveBeenCalledTimes(1);
    expect(fakeBackendService.createCardsBatch).not.toHaveBeenCalled();
    const errors = store.engine.messages.filter(m => m.type === 'error');
    expect(errors.some(m => m.text.includes('engine disconnected'))).toBe(true);

    removeSelectionSlot(boardId);
  });

  it('opt-out mint is unchanged — calibration not run, mint proceeds (checkbox off)', async () => {
    store.engine.status = 'connected';
    const root = store.boards[0].nodes[store.boards[0].rootNodeId];
    root.properties = { ...root.properties, KM: ['6.5'] };

    const boardId = store.boards[0].id as BoardId;
    const wrapper = await openModal(boardId);
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrate).not.toHaveBeenCalled();
    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);
    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards[0].raw_content).toContain('KM[6.5]');

    removeSelectionSlot(boardId);
  });

  it('hides the calibration controls when no engine is connected', async () => {
    store.engine.status = 'disconnected';
    const boardId = store.boards[0].id as BoardId;
    const wrapper = await openModal(boardId);
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(false);
    removeSelectionSlot(boardId);
  });
});

describe('MintCardModal — komi calibration applied per-card across a real batch (ledger row 1063)', () => {
  it('calibrates EVERY card in a 2-node batch, each to its own position, in one wire call (ledger row 1146: TT board rounds each to integer)', async () => {
    store.engine.status = 'connected';
    const { board, child } = boardWithChild();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, board.rootNodeId);
    addToSelection(boardId, child);
    fakeBackendService.createCardsBatch.mockResolvedValue([701, 702]);

    // Two DIFFERENT results, keyed by call order (root is preorder-first).
    // `boardWithChild` builds off `createInitialBoard` — Tromp-Taylor —
    // so both written komis are rounded to the nearest integer: 5.5 -> 6,
    // 8 is already an integer and passes through unchanged.
    calibrate
      .mockResolvedValueOnce({ evenKomi: 5.5, scoreLeadBlackPositive: -1, rawEvenKomi: 5.5, clamped: false })
      .mockResolvedValueOnce({ evenKomi: 8, scoreLeadBlackPositive: 1.5, rawEvenKomi: 8, clamped: false });

    const wrapper = await openModal(boardId);
    await wrapper.find('.calibrate-checkbox').setValue(true);
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    // ONE calibrate() call per card, TWO total — not one for the whole batch.
    expect(calibrate).toHaveBeenCalledTimes(2);
    // ONE wire call for the whole batch regardless — calibration doesn't
    // fork the mint into per-card requests.
    expect(fakeBackendService.createCardsBatch).toHaveBeenCalledTimes(1);

    const payload = fakeBackendService.createCardsBatch.mock.calls[0][0] as { cards: Array<{ raw_content: string }> };
    expect(payload.cards).toHaveLength(2);
    expect(payload.cards[0].raw_content).toContain('KM[6]');
    expect(payload.cards[1].raw_content).toContain('KM[8]');

    const infos = store.engine.messages.filter(m => m.type === 'info');
    expect(infos.some(m => m.text.includes('2'))).toBe(true); // batch-of-2 summary

    removeSelectionSlot(boardId);
  });

  it('a batch-wide calibration failure on the SECOND card aborts the WHOLE mint — no partial batch, first card\'s result is discarded', async () => {
    store.engine.status = 'connected';
    const { board, child } = boardWithChild();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, board.rootNodeId);
    addToSelection(boardId, child);

    calibrate
      .mockResolvedValueOnce({ evenKomi: 5.5, scoreLeadBlackPositive: -1, rawEvenKomi: 5.5, clamped: false })
      .mockRejectedValueOnce(new Error('timeout on second card'));

    const wrapper = await openModal(boardId);
    await wrapper.find('.calibrate-checkbox').setValue(true);
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrate).toHaveBeenCalledTimes(2);
    // No wire call at all — the first card's successful calibration is
    // discarded along with everything else; nothing was minted.
    expect(fakeBackendService.createCardsBatch).not.toHaveBeenCalled();
    const errors = store.engine.messages.filter(m => m.type === 'error');
    expect(errors.some(m => m.text.includes('timeout on second card'))).toBe(true);

    removeSelectionSlot(boardId);
  });

  it('reports a clamped-count summary when any card\'s computed komi fell outside KataGo\'s range', async () => {
    store.engine.status = 'connected';
    const { board, child } = boardWithChild();
    addBoard(board);
    const boardId = board.id as BoardId;
    addToSelection(boardId, board.rootNodeId);
    addToSelection(boardId, child);
    fakeBackendService.createCardsBatch.mockResolvedValue([801, 802]);

    calibrate
      .mockResolvedValueOnce({ evenKomi: 150, scoreLeadBlackPositive: 300, rawEvenKomi: 450, clamped: true })
      .mockResolvedValueOnce({ evenKomi: 6.5, scoreLeadBlackPositive: 0, rawEvenKomi: 6.5, clamped: false });

    const wrapper = await openModal(boardId);
    await wrapper.find('.calibrate-checkbox').setValue(true);
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    const infos = store.engine.messages.filter(m => m.type === 'info');
    // Names both the batch count and the clamped count.
    expect(infos.some(m => m.text.includes('2') && m.text.includes('1'))).toBe(true);

    removeSelectionSlot(boardId);
  });
});
