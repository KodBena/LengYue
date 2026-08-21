/**
 * tests/integration/MatchPlayerOverrides-label-association.test.ts
 *
 * Regression guard for menus-ui-audit finding M27 (report.md, ledger
 * row 1251): the match-modal override textareas (Black/White) had a
 * visible <label> with no `for`/`id` programmatic association, so
 * assistive tech could not resolve an accessible name for the field
 * from the label at all. Each of the two mounted instances (one per
 * player) needs its OWN id — a shared literal would silently break
 * the second instance's association.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import MatchPlayerOverridesConfig from '../../src/components/MatchPlayerOverridesConfig.vue';

describe('MatchPlayerOverridesConfig.vue — label/textarea programmatic association (M27)', () => {
  it('the label\'s for= matches the textarea\'s id=, for the Black instance', () => {
    const wrapper = mount(MatchPlayerOverridesConfig, {
      props: { player: 'B' },
      global: { plugins: [i18n] },
    });
    const label = wrapper.find('label.player-label');
    const textarea = wrapper.find('textarea');
    expect(label.attributes('for')).toBeTruthy();
    expect(label.attributes('for')).toBe(textarea.attributes('id'));
  });

  it('Black and White instances get DISTINCT ids (no collision between the two mounted copies)', () => {
    const black = mount(MatchPlayerOverridesConfig, { props: { player: 'B' }, global: { plugins: [i18n] } });
    const white = mount(MatchPlayerOverridesConfig, { props: { player: 'W' }, global: { plugins: [i18n] } });
    const blackId = black.find('textarea').attributes('id');
    const whiteId = white.find('textarea').attributes('id');
    expect(blackId).toBeTruthy();
    expect(whiteId).toBeTruthy();
    expect(blackId).not.toBe(whiteId);
  });
});
