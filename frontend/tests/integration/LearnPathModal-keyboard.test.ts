/**
 * tests/integration/LearnPathModal-keyboard.test.ts
 *
 * W5 parity audit finding D1: `LearnPathModal` was the one modal
 * under `src/components/modals/` with no `role="dialog"` and no
 * `useModalKeyboard` registration (consequently no Escape-to-close),
 * unlike its five sibling modals. The space-owner cure (dispatch L5,
 * `.claude/dispatch-reports/lyt-space-owner-spec.md` §1.5/§3 step 5,
 * ledger rows 2447/2484/2499) wired `useModalKeyboard` into this
 * modal — see `LearnPathModal.vue`'s own header. No sibling modal
 * carries a per-file dedicated Escape/role test of its own; parity
 * verification lives at the shared-composable level
 * (`useModalKeyboard.test.ts`, driven against `ResetAllKeybindingsModal`
 * as the simplest representative instance). This file is the
 * modal-specific mirror of that idiom (dispatch Escape via `window`,
 * assert the backdrop disappears and focus is restored to the
 * opener — same shape as `useModalKeyboard.test.ts`), plus the
 * `role="dialog"` markup check, scoped to `LearnPathModal` — and it
 * additionally exercises this modal's own `close()` guard (mid-explore
 * Escape must no-op, mirroring `LearnPathModal-backdrop-guard.test.ts`'s
 * backdrop-click case) since Escape and the backdrop both route
 * through the same `close()`.
 *
 * `useLearnPath` is mocked the same way
 * `LearnPathModal-backdrop-guard.test.ts` mocks it: a manually-resolved
 * `explore()` so the test controls exactly when the in-flight phase
 * transitions, without depending on real walk timing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

let resolveExplore!: (v: unknown) => void;
const explore = vi.fn(() => new Promise(resolve => { resolveExplore = resolve; }));
const discardExploration = vi.fn();

vi.mock('../../src/composables/cards/useLearnPath', async () => {
  const actual = await vi.importActual<typeof import('../../src/composables/cards/useLearnPath')>(
    '../../src/composables/cards/useLearnPath',
  );
  return {
    ...actual,
    useLearnPath: () => ({ explore, discardExploration }),
  };
});

import { i18n } from '../../src/i18n';
import LearnPathModal from '../../src/components/modals/LearnPathModal.vue';
import type { BoardId } from '../../src/types';

type ModalInstance = { open: (b: BoardId) => void };

function dispatchKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

describe('LearnPathModal — Escape-to-close and dialog role (W5 parity, finding D1)', () => {
  let opener: HTMLButtonElement;
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    explore.mockClear();
    discardExploration.mockClear();
    opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
  });

  afterEach(() => {
    wrapper?.unmount();
    opener.remove();
  });

  it('carries role="dialog" and aria-modal="true" on its content container', async () => {
    wrapper = mount(LearnPathModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    vm.open('board-a' as BoardId);
    await flushPromises();

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
  });

  it('Escape closes the modal (form phase) and restores focus to the opener', async () => {
    wrapper = mount(LearnPathModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    vm.open('board-a' as BoardId);
    await flushPromises();

    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);

    dispatchKey(window, 'Escape');
    await flushPromises();

    expect(wrapper.find('.modal-backdrop').exists()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('Escape is absorbed while an explore() is in flight — same no-op as the backdrop guard', async () => {
    wrapper = mount(LearnPathModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    vm.open('board-a' as BoardId);
    await flushPromises();

    await wrapper.find('.btn-submit').trigger('click'); // runExplore()
    await flushPromises();
    expect(explore).toHaveBeenCalledTimes(1);

    dispatchKey(window, 'Escape');
    await flushPromises();

    // Mid-flight: absorbed, not torn down — walk stays reachable.
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);
    expect(discardExploration).not.toHaveBeenCalled();

    resolveExplore({
      boardId: 'board-a', anchorCardId: null,
      pendingSeedCount: 1, existingCount: 0, frontierCount: 0, unplayableCount: 0,
      addedNodeIds: ['n1'],
    });
    await flushPromises();

    // Once explored, Escape works normally and discards the exploration's marks.
    dispatchKey(window, 'Escape');
    await flushPromises();
    expect(discardExploration).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false);
  });
});
