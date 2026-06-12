/**
 * tests/integration/MintCardModal-komi-calibration.test.ts
 *
 * Tier-3 (composable/component integration) tests for the mint-time
 * komi-calibration flow wired through `MintCardModal`. The modal's
 * `submit()` is the orchestration site: when the "calibrate komi"
 * checkbox is set AND the engine is connected, it runs
 * `useMinting.calibrateKomiOnDraft` (which adjusts the draft's SGF komi)
 * before `commitMint`, system-logs the komi set, and ABORTS the mint
 * loudly if the evaluation fails (ADR-0002).
 *
 * `useMinting` is mocked so the test isolates the modal's calibration
 * gating, ordering, logging, and abort behaviour from the real
 * engine/WS path (`useKomiCalibration` owns its own socket; driving the
 * live proxy is out of scope per the test fakes posture). The three
 * behaviours pinned: calibrated mint runs calibration + logs; an
 * evaluation failure aborts loudly without committing; an opt-out mint
 * is unchanged (no calibration call).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const commitMint = vi.fn(async () => 1);
const prepareDraft = vi.fn(async () => ({
  raw_content: '(;SZ[19]KM[6.5]GM[1];B[pd])',
  num_moves: 1,
  tags: [] as string[],
  grading_parameter: { data: { default_visits: 1000, gamma: 0.9 } },
}));
// `calibrateKomiOnDraft` mutates the draft's komi and returns the
// result the modal logs; configured per-test for the success / failure
// cases.
const calibrateKomiOnDraft = vi.fn();

vi.mock('../../src/composables/review/useMinting', () => ({
  useMinting: () => ({ prepareDraft, calibrateKomiOnDraft, commitMint }),
}));

import { store } from '../../src/store';
import { i18n } from '../../src/i18n';
import MintCardModal from '../../src/components/modals/MintCardModal.vue';
import type { BoardId } from '../../src/types';

// Mute jsdom's unimplemented window.alert (the failure path calls it).
beforeEach(() => {
  commitMint.mockClear();
  prepareDraft.mockClear();
  calibrateKomiOnDraft.mockReset();
  store.profile.settings.minting.defaultPaletteId = 'active';
  store.engine.messages = [];
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

async function openModal() {
  const wrapper = mount(MintCardModal, { global: { plugins: [i18n] } });
  await (wrapper.vm as unknown as { open: (b: BoardId) => Promise<void> })
    .open(store.boards[0].id as BoardId);
  await flushPromises();
  return wrapper;
}

describe('MintCardModal — komi calibration', () => {
  it('runs calibration, adjusts komi, logs info, then commits (engine connected, checkbox on)', async () => {
    store.engine.status = 'connected';
    calibrateKomiOnDraft.mockImplementation(async (_boardId, draft) => {
      // Stand in for the real composable: mutate the draft's SGF komi.
      draft.raw_content = '(;SZ[19]KM[10.5]GM[1];B[pd])';
      return { evenKomi: 10.5, scoreLeadBlackPositive: 4, rawEvenKomi: 10.5, clamped: false };
    });

    const wrapper = await openModal();
    // The calibration controls render only when engine is connected.
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(true);
    await wrapper.find('.calibrate-checkbox').setValue(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrateKomiOnDraft).toHaveBeenCalledTimes(1);
    // Committed AFTER calibration, with the komi-adjusted draft.
    expect(commitMint).toHaveBeenCalledTimes(1);
    const committed = commitMint.mock.calls[0][0] as { raw_content: string };
    expect(committed.raw_content).toContain('KM[10.5]');

    // Info system-log naming the komi set for this card.
    const infos = store.engine.messages.filter(m => m.type === 'info');
    expect(infos.some(m => m.text.includes('10.5'))).toBe(true);
  });

  it('aborts the mint loudly when calibration fails — no commit, error logged', async () => {
    store.engine.status = 'connected';
    calibrateKomiOnDraft.mockRejectedValue(new Error('engine disconnected'));

    const wrapper = await openModal();
    await wrapper.find('.calibrate-checkbox').setValue(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrateKomiOnDraft).toHaveBeenCalledTimes(1);
    // The mint did NOT commit (ADR-0002: no silent fallback).
    expect(commitMint).not.toHaveBeenCalled();
    // The failure surfaced as an error in the system log.
    const errors = store.engine.messages.filter(m => m.type === 'error');
    expect(errors.some(m => m.text.includes('engine disconnected'))).toBe(true);
  });

  it('opt-out mint is unchanged — calibration not run, commit proceeds (checkbox off)', async () => {
    store.engine.status = 'connected';

    const wrapper = await openModal();
    // Checkbox defaults unchecked; leave it.
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(true);

    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    expect(calibrateKomiOnDraft).not.toHaveBeenCalled();
    expect(commitMint).toHaveBeenCalledTimes(1);
    const committed = commitMint.mock.calls[0][0] as { raw_content: string };
    // Komi untouched (the draft's original).
    expect(committed.raw_content).toContain('KM[6.5]');
  });

  it('hides the calibration controls when no engine is connected', async () => {
    store.engine.status = 'disconnected';
    const wrapper = await openModal();
    expect(wrapper.find('.calibrate-checkbox').exists()).toBe(false);
  });
});
