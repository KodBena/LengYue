/**
 * src/composables/useModalKeyboard.ts
 *
 * Shared keyboard/focus mechanism for the app's modal dialogs
 * (ADR-0019 audit, S5 — "every modal is keyboard-inert"). One
 * composable, wired into all seven `src/components/modals/*.vue`
 * files, replacing seven independent (absent) implementations:
 *
 *   - **Escape closes** — routed to the modal's OWN close
 *     function (the `onClose` callback the caller passes in).
 *     This composable never implements a second close path; it
 *     only calls the one the modal already has.
 *   - **Focus trap** — Tab / Shift+Tab cycle strictly within the
 *     modal's content container while open. Implemented as a
 *     full manual cycle (not merely edge-wrapping): every Tab
 *     keydown is intercepted and focus is moved to the next/
 *     previous entry in the enumerated focusable list. This is
 *     deliberate, not just belt-and-suspenders — the app's own
 *     `window`-level keydown dispatcher
 *     (`useUserIORegistry.ts`) and this composable both listen on
 *     `window`, and relying on native browser tab order would
 *     leave the page BEHIND the modal reachable mid-sequence
 *     (the exact S5 defect). Manual cycling is also what makes
 *     the trap honestly unit-testable under jsdom (see below).
 *   - **Initial focus** — the first focusable element inside the
 *     container is focused when the modal opens (falls back to
 *     the container itself, which template call sites give
 *     `tabindex="-1"` for exactly this case).
 *   - **Focus restoration** — the element that had focus when the
 *     modal opened (`document.activeElement`) is refocused when
 *     it closes.
 *   - **Global-hotkey suppression** — `anyModalOpen` is exported
 *     for `useUserIORegistry.ts` to gate on, alongside its
 *     existing `captureMode` guard (same module-scoped-ref shape
 *     as `src/lib/keybindings-capture.ts`'s `captureMode`). Why
 *     this is needed and not just "nice to have": the registry's
 *     existing context guard only excludes `<input>` /
 *     `<textarea>` / `<select>` / `contenteditable` targets — a
 *     modal's own `<button>` elements (Cancel/Submit/etc.) are
 *     NOT excluded, so without this gate, e.g. pressing `n` while
 *     focus sits on a modal's Cancel button would fire the global
 *     `nav.next` action underneath the open modal. Suppressing
 *     ALL registry actions while any modal is open (not just the
 *     ones that would collide) is the simplest correct rule: a
 *     modal's own controls should be the only thing the keyboard
 *     can reach while it's up.
 *
 * **jsdom honesty note.** `getFocusableElements` deliberately does
 * NOT filter on layout-derived visibility (`offsetParent`,
 * `getBoundingClientRect`) — jsdom performs no layout, so every
 * element's `offsetParent` is always `null` there (see
 * `frontend/tests/CLAUDE.md`'s render-count harness notes on
 * jsdom's layout gap), which would silently empty the focusable
 * list under test and produce a green suite that verifies nothing.
 * The enumeration is attribute-based only (`disabled`,
 * `tabindex="-1"`), which jsdom represents faithfully, and the Tab
 * handler drives `element.focus()` / `document.activeElement`
 * directly rather than relying on native tab-order traversal —
 * both of which jsdom honestly supports. The full loop is
 * therefore genuinely witnessed by the integration tests, not
 * marked UNEXERCISED.
 *
 * **Space-owner cure, dispatch L5** (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5/§3 step 5, ledger rows 2447/2484/2499):
 * this composable already implements the modal half of the overlay
 * primitive's own dismissal contract — Escape, a real Tab focus trap,
 * initial focus, and focus restoration — for every one of the eleven
 * `src/components/modals/*.vue` call sites. `overlayContract()`
 * (`state/overlay-contract.ts`) is now constructed once, at setup, to
 * VALIDATE that shape rather than re-implement it: every caller of this
 * composable declares `kind: 'modal'`, `focusTrap: true` (this
 * composable's own guarantee), and its own `outsideClick`/
 * `explicitCloseControl` disposition (both default `true` — every
 * current modal has a backdrop `@mousedown.self` dismiss AND its own
 * Cancel/×/close button; no caller currently needs the `false`
 * exception, but the parameter exists so a future one can declare it
 * explicitly rather than silently omitting a channel — the review's own
 * "the learn-path modal missing Escape" finding, closed by wiring THIS
 * composable into that one modal that lacked it, `LearnPathModal.vue`).
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, nextTick, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import { overlayContract } from '../state/overlay-contract';

// ── Global-hotkey suppression flag ──────────────────────────────
//
// Module-scoped counter (not a boolean) so two modals stacked
// (e.g. a confirm-dialog opened from within another modal) don't
// have the inner modal's close prematurely clear the outer
// modal's suppression. Mirrors `src/lib/keybindings-capture.ts`'s
// `captureMode` module-ref shape and its consumption pattern in
// `useUserIORegistry.ts`.
const openModalCount: Ref<number> = ref(0);

/** True while at least one modal wired through this composable is open. */
export const anyModalOpen: ComputedRef<boolean> = computed(() => openModalCount.value > 0);

// ── Focusable-element enumeration ────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Enumerate the tab-reachable elements inside `container`, in DOM
 * order. Attribute-based only — see the jsdom honesty note in the
 * module header for why layout-derived visibility is intentionally
 * not part of this check. Exported so the enumeration logic itself
 * has a direct unit-test surface independent of real focus/blur.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ── The composable ───────────────────────────────────────────────

/**
 * Wire Escape-to-close, a Tab focus trap, initial focus, and focus
 * restoration onto one modal instance.
 *
 * @param container Template ref to the modal's content wrapper
 *   (the element role="dialog" / aria-modal="true" / tabindex="-1"
 *   live on in the markup). Initial focus and the Tab trap's
 *   element enumeration are scoped to this element's subtree.
 * @param isOpen Reactive open/closed flag. For modals that own
 *   their own `isOpen` ref (the `defineExpose({ open() {...} })`
 *   shape used by six of the seven modals) pass that ref directly.
 *   For a modal mounted only while open via a parent `v-if`
 *   (`LoginModal.vue`), pass `computed(() => true)` — the watch's
 *   `immediate: true` activates it once on mount, and `onUnmounted`
 *   below deactivates it on the parent's unmount, since `isOpen`
 *   itself never flips to `false` within such an instance's life.
 * @param onClose The modal's OWN close handler (whatever it's
 *   named locally — `close`, `cancel`, `handle('cancel')`, an
 *   emitted `'close'` event). Escape calls exactly this function;
 *   no second close path is introduced.
 * @param dismissal Optional override of the `outsideClick`/
 *   `explicitCloseControl` channels `overlayContract()` validates —
 *   see this file's own header, "Space-owner cure, dispatch L5". Both
 *   default `true`, byte-identical to every current call site's actual
 *   dismissal surface (a backdrop click handler this composable does
 *   NOT own, plus the caller's own close/cancel button).
 */
export function useModalKeyboard(
  container: Ref<HTMLElement | null>,
  isOpen: Ref<boolean> | ComputedRef<boolean>,
  onClose: () => void,
  dismissal?: { outsideClick?: boolean; explicitCloseControl?: boolean },
): void {
  // Construction-time refusal only (`overlay-contract.ts`'s own header,
  // "never itself the source of truth for live UI state") — `open:
  // false` is a snapshot; `isOpen` (above) is what the reactive `watch`
  // below actually tracks.
  overlayContract({
    kind: 'modal',
    open: false,
    dismissal: {
      escape: true,
      outsideClick: dismissal?.outsideClick ?? true,
      explicitCloseControl: dismissal?.explicitCloseControl ?? true,
    },
    focusTrap: true,
    restoreFocusTo: () => (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  });

  // The element focus should return to when this modal closes —
  // captured at open time, restored at close time.
  let opener: HTMLElement | null = null;

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const el = container.value;
    if (el === null) return;
    const focusables = getFocusableElements(el);
    // Nothing to cycle through — swallow Tab so focus can't escape
    // to the page behind via the browser's native order.
    e.preventDefault();
    if (focusables.length === 0) return;

    const current = document.activeElement;
    const currentIndex = current instanceof HTMLElement ? focusables.indexOf(current) : -1;
    let nextIndex: number;
    if (e.shiftKey) {
      nextIndex = currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === -1 || currentIndex === focusables.length - 1
        ? 0
        : currentIndex + 1;
    }
    focusables[nextIndex].focus();
  }

  function activate(): void {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModalCount.value += 1;
    window.addEventListener('keydown', handleKeydown);

    // Deferred to `nextTick` so the `v-if`-gated content has
    // mounted into `container` before we enumerate it (this watch
    // is a 'pre' watcher, which runs before Vue patches the DOM
    // for the same reactive change).
    void nextTick(() => {
      // Modal may have already closed again (rapid open/close) —
      // don't steal focus for a dialog that's no longer open.
      if (openModalCount.value === 0) return;
      const el = container.value;
      if (el === null) return;
      const focusables = getFocusableElements(el);
      (focusables[0] ?? el).focus();
    });
  }

  function deactivate(): void {
    window.removeEventListener('keydown', handleKeydown);
    openModalCount.value = Math.max(0, openModalCount.value - 1);
    if (opener !== null && document.contains(opener)) {
      opener.focus();
    }
    opener = null;
  }

  watch(
    () => isOpen.value,
    (open) => {
      if (open) activate();
      else deactivate();
    },
    { immediate: true },
  );

  // Covers the `LoginModal.vue` shape: the parent's `v-if` unmounts
  // the component directly rather than flipping a local `isOpen`
  // to `false`, so the watch above never sees a `false` transition
  // to deactivate on. Also the general safety net for any modal
  // unmounted while still open.
  onUnmounted(() => {
    if (isOpen.value) deactivate();
  });
}
