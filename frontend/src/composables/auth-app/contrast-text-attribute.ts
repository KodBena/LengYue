/**
 * src/composables/auth-app/contrast-text-attribute.ts
 *
 * Pure DOM-mutation unit backing `useAppBootstrap`'s
 * `appearance.highContrastText` watcher. Pulled out of the watcher
 * body so the OFF-state guarantee — "the flag's absence produces no
 * attribute and no override application" — is testable directly
 * (`tests/unit/contrast-text-attribute.test.ts`) without mounting the
 * full bootstrap composable and its service/auth dependency chain.
 *
 * `theme.css`'s `[data-theme="cluster"][data-contrast-text="on"]`
 * block is the only consumer of the `data-contrast-text` attribute
 * this writes. Setting the attribute to `"on"` when the flag is true
 * and REMOVING it (never `"off"`) when false is load-bearing: an
 * absent attribute cannot match an attribute-selector, so the OFF
 * state is structurally guaranteed to render identically to a build
 * that never shipped this feature — not merely visually similar
 * because `"off"` happens to select nothing today.
 *
 * License: Public Domain (The Unlicense)
 */

const CONTRAST_TEXT_ATTR = 'data-contrast-text';

/**
 * Apply (or remove) the `data-contrast-text` attribute on `el` per
 * the `highContrastText` setting. Idempotent — safe to call on every
 * watcher tick regardless of the previous value.
 */
export function applyContrastTextAttribute(el: Element, highContrastText: boolean): void {
  if (highContrastText) {
    el.setAttribute(CONTRAST_TEXT_ATTR, 'on');
  } else {
    el.removeAttribute(CONTRAST_TEXT_ATTR);
  }
}
