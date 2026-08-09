/**
 * tests/integration/TabWidget-keydown-propagation.test.ts
 *
 * Space double-fire (ledger row 1051; mechanism witnessed row 1049).
 * A focused tab header's `@keydown.space`/`@keydown.enter` handlers
 * called `selectTab` but never stopped the keydown from bubbling past
 * the `<li>`. Space and Enter also reach the window-level key
 * registry (`useUserIORegistry`), so a keypress that activated a tab
 * ALSO replayed globally — witnessed as the ponder toggle firing a
 * second time from a focused tab. `TabWidget.vue` now adds `.stop` to
 * both handlers; these tests assert the tab still activates AND that
 * a window-level keydown listener (standing in for the real
 * registry's `window.addEventListener('keydown', ...)`) never sees
 * the event when it originates from a focused tab header.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TabWidget from '../../src/components/chrome/TabWidget.vue';

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'cards', label: 'Cards' },
  { id: 'settings', label: 'Settings' },
];

function mountWidget(modelValue = 'library') {
  return mount(TabWidget, {
    attachTo: document.body,
    props: { tabs: TABS, modelValue },
    slots: {
      library: '<div>Library content</div>',
      cards: '<div>Cards content</div>',
      settings: '<div>Settings content</div>',
    },
  });
}

describe('TabWidget — keydown does not bubble past the tab header (row 1051)', () => {
  let windowListener: ReturnType<typeof vi.fn>;

  afterEach(() => {
    if (windowListener) {
      window.removeEventListener('keydown', windowListener);
    }
  });

  it('Space activates the focused tab AND does not reach a window-level keydown listener', async () => {
    const wrapper = mountWidget('library');
    windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);

    const items = wrapper.findAll('.tab-header li');
    await items[1]!.trigger('keydown.space'); // "Cards"

    expect(wrapper.emitted('update:modelValue')).toEqual([['cards']]);
    expect(windowListener).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('Enter activates the focused tab AND does not reach a window-level keydown listener', async () => {
    const wrapper = mountWidget('library');
    windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);

    const items = wrapper.findAll('.tab-header li');
    await items[2]!.trigger('keydown.enter'); // "Settings"

    expect(wrapper.emitted('update:modelValue')).toEqual([['settings']]);
    expect(windowListener).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('plain typing elsewhere (not on a tab header) still reaches the window-level listener unaffected', async () => {
    const wrapper = mountWidget('library');
    windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);

    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    elsewhere.remove();

    expect(windowListener).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
