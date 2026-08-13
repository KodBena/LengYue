/**
 * src/composables/chrome/useClickTogglePopover.ts
 *
 * Finish-pass wave B2 (`ToolbarEngineControls.vue`'s own new menu-path
 * realization; see that component's header for the F2 commission this
 * serves). Generalizes the click/outside-click/Escape dismiss + fixed-
 * anchored-position shape `LocalePicker.vue` and `LytPresenceMenu.vue`
 * each already hand-author inline (independently, not sharing code) —
 * a third near-identical inline copy is the ADR-0012 P1 "one home per
 * fact" threshold this file crosses. Deliberately NOT retrofitted into
 * the two pre-existing components (out of this commission's own scope —
 * F2 + the reservation-overflow only); flagged in this wave's own report
 * as a follow-up worth doing, not attempted here.
 *
 * Composes `useFixedAnchoredPopover` (position) with a self-contained
 * open/close boolean and its own document-level dismiss listeners
 * (installed only while open, torn down on close and on unmount — same
 * resource-ownership shape `LocalePicker.vue`'s own inline version
 * already established).
 *
 * ADR-0003 band 1 (truly domain-agnostic): click/popover mechanics only,
 * no Go/engine/SGF vocabulary, no toolbar-specific knowledge.
 *
 * License: Public Domain (The Unlicense)
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useFixedAnchoredPopover, type UseFixedAnchoredPopoverOptions } from './useFixedAnchoredPopover';

export interface UseClickTogglePopoverHandle {
  readonly open: Ref<boolean>;
  /** Bind to the outside-click boundary: `<div :ref="el => rootRef = el">`. */
  readonly rootRef: Ref<HTMLElement | null>;
  /** Bind to the trigger button: `<button ref="triggerEl">`. */
  readonly triggerEl: Ref<HTMLElement | null>;
  /** Bind to the popover panel: `<div v-if="open" ref="popoverEl">`. */
  readonly popoverEl: Ref<HTMLElement | null>;
  /** Bind into the popover's `:style`. */
  readonly popoverStyle: Ref<{ top: string; left: string }>;
  toggle(): void;
  close(): void;
}

export function useClickTogglePopover(options: UseFixedAnchoredPopoverOptions): UseClickTogglePopoverHandle {
  const open = ref(false);
  const rootRef = ref<HTMLElement | null>(null);
  const triggerEl = ref<HTMLElement | null>(null);
  const popoverEl = ref<HTMLElement | null>(null);
  const { style: popoverStyle } = useFixedAnchoredPopover(open, triggerEl, popoverEl, options);

  function toggle(): void { open.value = !open.value; }
  function close(): void { open.value = false; }

  function onDocumentPointerDown(e: PointerEvent): void {
    if (!rootRef.value) return;
    if (rootRef.value.contains(e.target as Node)) return; // DOM: event.target is an EventTarget; Node is contains()'s arg type
    close();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  watch(open, (isOpen) => {
    if (isOpen) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true);
      document.addEventListener('keydown', onKeydown);
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onKeydown);
    }
  });
  // Defensive cleanup: if the component unmounts while open, the
  // document listeners would otherwise outlive it (resource-ownership
  // discipline, frontend/CLAUDE.md).
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  });

  return { open, rootRef, triggerEl, popoverEl, popoverStyle, toggle, close };
}
