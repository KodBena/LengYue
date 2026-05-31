/**
 * tests/integration/render-count/jsdom-stubs.ts
 *
 * Environment stubs the render-count subjects need to mount under jsdom:
 * theme CSS custom properties, and a no-op `ResizeObserver`. Kept in one
 * place so each render-count test calls a single install/remove pair.
 *
 * jsdom does not load `src/assets/css/theme.css`, so `themeColor(…)`
 * (which reads CSS custom properties off `document.documentElement` and
 * throws loudly per ADR-0002 when one is empty) fails inside any
 * component render that resolves a chrome anchor. The render-count
 * harness needs the render to *run* (that is the quantity under test),
 * so the colours must resolve to a non-empty value.
 *
 * This stub sets the custom properties the render-count subjects read,
 * as inline properties on the document root (jsdom's `getComputedStyle`
 * surfaces inline custom properties). Values are arbitrary non-empty
 * placeholders — render-count tests assert on render *frequency*, not on
 * resolved colour, so the exact value is immaterial; only non-emptiness
 * matters.
 *
 * License: Public Domain (The Unlicense)
 */

/** Chrome anchors read by the render-count subjects (extend as needed). */
const STUBBED_VARS: Record<string, string> = {
  '--border-2': '#666666',
  '--border-3': '#888888',
  '--accent-primary': '#4aaef0',
  '--surface-0': '#101010',
  '--surface-1': '#181818',
  '--text-1': '#e0e0e0',
};

/**
 * jsdom ships no `ResizeObserver`. The imperative-escape composables the
 * green arc introduced (`useViewportFollow`, the canvas RO-cached-dims
 * shape) construct one in `onMounted`, so a render-count mount throws
 * without it. This no-op stand-in lets the component mount; render-count
 * tests do not depend on observer callbacks firing (they drive nav /
 * structure changes explicitly), so a no-op is sufficient and keeps the
 * harness from depending on layout that jsdom cannot produce anyway.
 */
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export function installRenderEnvStubs(): void {
  for (const [name, value] of Object.entries(STUBBED_VARS)) {
    document.documentElement.style.setProperty(name, value);
  }
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  }
  // jsdom implements no `Element.prototype.scrollTo`. The viewport-follow
  // watcher (an imperative-escape composable) calls it on the cursor
  // change a navigation produces; without it the watcher rejects. The
  // render-count assertion is on render frequency, not scroll behaviour,
  // so a no-op is sufficient.
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = function scrollTo(): void {
      /* no-op jsdom shim */
    };
  }
}

export function removeRenderEnvStubs(): void {
  for (const name of Object.keys(STUBBED_VARS)) {
    document.documentElement.style.removeProperty(name);
  }
}
