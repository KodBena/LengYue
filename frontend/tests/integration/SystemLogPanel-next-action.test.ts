/**
 * tests/integration/SystemLogPanel-next-action.test.ts
 *
 * Disease repair (`.claude/dispatch-reports/lyt-second-opus-review.md`,
 * ledger row 2511): a `SystemMessage` carrying `nextAction:
 * 'open-default-layout-control'` used to render that raw machine token
 * verbatim next to a LOCALIZED "next action" label —
 * `SystemLogPanel.vue`'s own header transcribes the witnessed live
 * artifact, "次のアクション: open-default-layout-control" (a Japanese
 * label followed by an untranslated English identifier). This suite
 * pins the fix at the component level: the token is resolved through
 * `nextActionLabel()` into the SAME catalog the surrounding label
 * renders from, in both English and Japanese, and an unrecognized
 * token degrades to the raw string (never throws) while still logging
 * loudly (ADR-0002) rather than pretending the drift didn't happen.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, clearSystemMessages, pushSystemMessage } from '../../src/store';
import SystemLogPanel from '../../src/components/chrome/SystemLogPanel.vue';

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  clearSystemMessages();
  i18n.global.locale.value = 'en';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  clearSystemMessages();
  i18n.global.locale.value = 'en';
});

describe('SystemLogPanel.vue — nextAction token never leaks raw into user-facing copy', () => {
  it('en: renders a human label, not the raw "open-default-layout-control" token', () => {
    pushSystemMessage('warning', 'Your geometry modification no longer permits board to render.', {
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    });
    wrapper = mount(SystemLogPanel, { global: { plugins: [i18n] } });

    const nextActionRow = wrapper.get('.msg-next-action').text();
    expect(nextActionRow).not.toContain('open-default-layout-control');
    expect(nextActionRow).toContain('Default layout');
  });

  it('ja: the label and the resolved token render in the SAME locale — the exact mixed-locale artifact this repair closes', () => {
    i18n.global.locale.value = 'ja';
    pushSystemMessage('warning', 'Your geometry modification no longer permits board to render.', {
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    });
    wrapper = mount(SystemLogPanel, { global: { plugins: [i18n] } });

    const nextActionRow = wrapper.get('.msg-next-action').text();
    expect(nextActionRow).not.toContain('open-default-layout-control');
    // The witnessed live artifact was literally "次のアクション:
    // open-default-layout-control" — the label translated, the value
    // not. Both halves must now be Japanese.
    expect(nextActionRow).toContain('次のアクション');
    expect(nextActionRow).toContain('デフォルトレイアウト');
  });

  it('a message with no nextAction renders no next-action row at all (unaffected by this repair)', () => {
    pushSystemMessage('info', 'Just an informational message.');
    wrapper = mount(SystemLogPanel, { global: { plugins: [i18n] } });
    expect(wrapper.find('.msg-next-action').exists()).toBe(false);
  });

  it('an UNRECOGNIZED token degrades to the raw string (never throws) but logs loudly (ADR-0002) — a producer/catalog drift must be visible, not silently swallowed', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    pushSystemMessage('warning', 'Some other refusal.', { nextAction: 'some-future-unregistered-token' });
    wrapper = mount(SystemLogPanel, { global: { plugins: [i18n] } });

    expect(wrapper.get('.msg-next-action').text()).toContain('some-future-unregistered-token');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('some-future-unregistered-token');
    errorSpy.mockRestore();
  });
});
