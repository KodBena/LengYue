/**
 * tests/integration/LearnPathModal-backdrop-guard.test.ts
 *
 * Fresh-context review finding (`.claude/dispatch-reports/
 * wf8-learn-this-path-review.md`, ADVISORY upgraded to REQUIRED by the
 * coordinator): the modal backdrop's `@mousedown.self="close"` had no
 * phase guard, unlike the footer "Close" button's `:disabled` during
 * `'exploring'`/`'minting'`. A backdrop click while an `explore()` call
 * was still in flight tore down `exploration.value`/`phase.value` out
 * from under the pending promise — orphaning the walk (it kept
 * mutating the board and adding pre-mint markers) with no reachable
 * discard path once it eventually resolved.
 *
 * `useLearnPath` is mocked with a manually-resolved `explore()` so this
 * test controls exactly when the in-flight phase transitions, without
 * depending on real walk timing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

let resolveExplore!: (v: unknown) => void;
const explore = vi.fn(() => new Promise(resolve => { resolveExplore = resolve; }));
const confirmMint = vi.fn(async () => ({ tag: 'x', seeded: [], skipped: [], frontiers: [] }));
const discardExploration = vi.fn();

vi.mock('../../src/composables/cards/useLearnPath', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/cards/useLearnPath')>(
    '../../src/composables/cards/useLearnPath',
  );
  return {
    ...actual,
    useLearnPath: () => ({ explore, confirmMint, discardExploration }),
  };
});

import { i18n } from '../../src/i18n';
import LearnPathModal from '../../src/components/modals/LearnPathModal.vue';
import type { BoardId } from '../../src/types';

beforeEach(() => {
  explore.mockClear();
  confirmMint.mockClear();
  discardExploration.mockClear();
});

describe('LearnPathModal — backdrop close guard during an in-flight explore()', () => {
  it('absorbs a backdrop click while exploring — no teardown, walk stays reachable', async () => {
    const wrapper = mount(LearnPathModal, { global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as { open: (b: BoardId) => void };
    vm.open('board-a' as BoardId);
    await wrapper.vm.$nextTick();
    await wrapper.find('.dark-input[placeholder]').setValue('taisha');
    await wrapper.find('.btn-submit').trigger('click'); // runExplore()
    await flushPromises();

    // explore() is in flight — its promise hasn't resolved yet.
    expect(explore).toHaveBeenCalledTimes(1);

    // Backdrop click during 'exploring': must be absorbed, not torn down.
    await wrapper.find('.modal-backdrop').trigger('mousedown');
    await flushPromises();

    expect(discardExploration).not.toHaveBeenCalled();
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true); // still open

    // Now let the walk resolve — the modal must still be able to show it
    // (proving the earlier backdrop click did NOT reset exploration/phase
    // out from under the in-flight promise).
    resolveExplore({ tag: 'taisha', pendingSeedCount: 1, existingCount: 0, frontierCount: 0, unplayableCount: 0, _pending: {} });
    await flushPromises();

    expect(wrapper.find('.result-box').exists()).toBe(true);
    expect(wrapper.text()).toContain('1');

    // A SECOND backdrop click, now that the phase has landed on
    // 'explored', works normally — the guard only blocks mid-flight.
    await wrapper.find('.modal-backdrop').trigger('mousedown');
    await flushPromises();
    expect(discardExploration).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false); // closed
  });

  it('the footer Close button remains the equivalent disabled affordance during exploring', async () => {
    const wrapper = mount(LearnPathModal, { global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as { open: (b: BoardId) => void };
    vm.open('board-a' as BoardId);
    await wrapper.vm.$nextTick();
    await wrapper.find('.dark-input[placeholder]').setValue('taisha');
    await wrapper.find('.btn-submit').trigger('click');
    await flushPromises();

    const closeBtn = wrapper.find('.btn-cancel');
    expect((closeBtn.element as HTMLButtonElement).disabled).toBe(true);

    resolveExplore({ tag: 'taisha', pendingSeedCount: 0, existingCount: 0, frontierCount: 0, unplayableCount: 0, _pending: {} });
    await flushPromises();
  });
});
