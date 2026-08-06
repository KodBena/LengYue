/**
 * tests/unit/composables/useModalKeyboard.test.ts
 *
 * Tier-1 coverage for `getFocusableElements` — the attribute-based
 * enumeration `useModalKeyboard`'s Tab trap drives. Pure DOM, no
 * Vue reactivity, no mounted component: exactly the shape the
 * module's own jsdom-honesty note describes (attribute checks only,
 * no layout-derived visibility, since jsdom performs no layout and
 * every element's `offsetParent` is always null there).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { getFocusableElements } from '../../../src/composables/useModalKeyboard';

function makeContainer(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('getFocusableElements', () => {
  it('enumerates buttons, inputs, and links in DOM order', () => {
    const container = makeContainer(`
      <button id="a">A</button>
      <input id="b" type="text" />
      <a id="c" href="#">C</a>
    `);
    const ids = getFocusableElements(container).map((el) => el.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('excludes disabled form controls', () => {
    const container = makeContainer(`
      <button id="a">A</button>
      <button id="b" disabled>B</button>
      <input id="c" type="text" disabled />
    `);
    const ids = getFocusableElements(container).map((el) => el.id);
    expect(ids).toEqual(['a']);
  });

  it('excludes tabindex="-1" but includes other explicit tabindex values', () => {
    const container = makeContainer(`
      <div id="a" tabindex="0">A</div>
      <div id="b" tabindex="-1">B (not tab-reachable)</div>
      <div id="c">C (no tabindex, not focusable)</div>
    `);
    const ids = getFocusableElements(container).map((el) => el.id);
    expect(ids).toEqual(['a']);
  });

  it('returns an empty list for a container with no focusable descendants', () => {
    const container = makeContainer('<p>Just text.</p>');
    expect(getFocusableElements(container)).toEqual([]);
  });

  it('does not filter on layout-derived visibility (jsdom has no layout)', () => {
    // A `display: none` element still enumerates here — jsdom never
    // computes layout, so an offsetParent-based filter would always
    // return null and silently empty this list under test. The
    // enumeration is attribute-based by design; see the module's
    // jsdom-honesty note.
    const container = makeContainer('<button id="a" style="display: none">A</button>');
    const ids = getFocusableElements(container).map((el) => el.id);
    expect(ids).toEqual(['a']);
  });
});
