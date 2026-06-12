/**
 * src/utils/modifier-key.ts
 *
 * Platform-aware modifier-key detection for the SPA's
 * "secondary action on click" patterns. The cross-platform
 * convention is Cmd on macOS and Ctrl elsewhere; consumers
 * should always go through `isPasteClick` rather than testing
 * `event.ctrlKey` directly so the platform-handling stays
 * consistent across consumers.
 *
 * Middle-click detection is folded in here too because the two
 * gestures back the same affordance (the PV-paste feature uses
 * both as discoverability twins — modifier-click for the
 * keyboard-modifier path, middle-click for the trackpad / power
 * mouse path).
 *
 * License: Public Domain (The Unlicense)
 */
const PLATFORM_MAC = typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
/** The platform-appropriate modifier flag for "secondary action" clicks. */
export function isPasteModifierHeld(e) {
    return PLATFORM_MAC ? e.metaKey : e.ctrlKey;
}
/**
 * True when the click event represents a "secondary action"
 * gesture — modifier-held primary-button click (Ctrl+left on
 * Win/Linux, Cmd+left on Mac). Shift and Alt combinations are
 * explicitly NOT this gesture, so they remain free for other
 * affordances.
 */
export function isPasteClick(e) {
    return e.button === 0 && isPasteModifierHeld(e) && !e.shiftKey && !e.altKey;
}
/**
 * True when the mousedown event represents a middle-button press.
 * Bind on `mousedown` rather than `click` — the `click` event is
 * unreliable for the middle button across browsers, and the
 * `auxclick` event is only honoured by some. The call site should
 * `preventDefault()` to suppress the platform default (auto-scroll
 * on Win/Linux, new-tab in some embeddings).
 */
export function isMiddleButtonMousedown(e) {
    return e.button === 1;
}
/** Display name for the paste modifier on the current platform. */
export function pasteModifierLabel() {
    return PLATFORM_MAC ? 'Cmd' : 'Ctrl';
}
