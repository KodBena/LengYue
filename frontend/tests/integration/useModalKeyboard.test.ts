/**
 * tests/integration/useModalKeyboard.test.ts
 *
 * Drives the shared modal keyboard/focus mechanism
 * (`src/composables/useModalKeyboard.ts`) end to end against a real
 * modal component — `ResetAllKeybindingsModal` (destructive-confirm
 * shape, promise-returning `open()`, exactly two focusable controls
 * — the simplest instance of the seven modals it's wired into,
 * chosen so the trap/wrap assertions aren't muddied by an unrelated
 * form). Per ADR-0019 audit finding S5 ("every modal is
 * keyboard-inert: Escape unbound, Tab walks the page behind it").
 *
 * jsdom honestly drives this whole test: the Tab handler is manual
 * (we own it, not the browser's native tab order — see the
 * composable's module header), and jsdom supports `element.focus()`
 * / `document.activeElement` faithfully. Nothing here is
 * UNEXERCISED; the full loop (open → trap → Escape → focus
 * restoration) is genuinely witnessed.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import ResetAllKeybindingsModal from '../../src/components/modals/ResetAllKeybindingsModal.vue';
import { anyModalOpen } from '../../src/composables/useModalKeyboard';

type ModalInstance = { open: () => Promise<boolean> };

function dispatchKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

describe('useModalKeyboard — ResetAllKeybindingsModal', () => {
  let opener: HTMLButtonElement;
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    // A real focusable element outside the modal, standing in for
    // "the button that opened it" — the composable is expected to
    // return focus here when the modal closes.
    opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
  });

  afterEach(() => {
    wrapper?.unmount();
    opener.remove();
  });

  it('moves focus into the modal on open and traps Tab within it', async () => {
    wrapper = mount(ResetAllKeybindingsModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    void vm.open();
    await flushPromises();
    await nextTick();

    const cancelBtn = wrapper.get('.btn-cancel').element as HTMLElement;
    const confirmBtn = wrapper.get('.btn-destructive').element as HTMLElement;

    // Initial focus landed on the first focusable control, not the
    // opener and not nothing.
    expect(document.activeElement).toBe(cancelBtn);

    // Tab from the last focusable wraps to the first.
    confirmBtn.focus();
    expect(document.activeElement).toBe(confirmBtn);
    dispatchKey(confirmBtn, 'Tab');
    expect(document.activeElement).toBe(cancelBtn);

    // Shift+Tab from the first focusable wraps to the last.
    dispatchKey(cancelBtn, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('Escape calls the modal\'s own close path (resolves open() with false) and restores focus to the opener', async () => {
    wrapper = mount(ResetAllKeybindingsModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    const resultPromise = vm.open();
    await flushPromises();

    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);

    dispatchKey(window, 'Escape');
    await flushPromises();

    // Same resolution shape as clicking Cancel — no second close
    // implementation was introduced.
    await expect(resultPromise).resolves.toBe(false);
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('suppresses global-hotkey dispatch (anyModalOpen) while open, clears it on close', async () => {
    expect(anyModalOpen.value).toBe(false);

    wrapper = mount(ResetAllKeybindingsModal, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as ModalInstance;
    const resultPromise = vm.open();
    await flushPromises();

    expect(anyModalOpen.value).toBe(true);

    wrapper.get('.btn-cancel').element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await resultPromise;

    expect(anyModalOpen.value).toBe(false);
  });
});
