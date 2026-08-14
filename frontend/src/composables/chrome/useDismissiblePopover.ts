/**
 * src/composables/chrome/useDismissiblePopover.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5, §3 step 5, ledger rows 2447/2484/2499).
 * The ONE click/outside-click/Escape dismissal mechanism every
 * click-toggled corner/toolbar popover in this SPA independently
 * re-implemented — `LytPresenceMenu.vue`, `BoardRailPopoverTrigger.vue`,
 * `LocalePicker.vue`, `DebugMenu.vue`, and `App.vue`'s own
 * control-panel-summon popover each had their own `ref(false)` +
 * `document.addEventListener('pointerdown', ..., true)` +
 * `document.addEventListener('keydown', ...)` pair, verbatim-identical
 * in shape (each file's own header said so explicitly: "the SAME idiom
 * ... use"). This composable is that one mechanism, constructed through
 * `overlayContract()` (`state/overlay-contract.ts`) so every call site's
 * dismissal policy is declared, not merely implemented five times in a
 * row.
 *
 * **`outsideClick` is the one call-site-configurable channel.**
 * `DebugMenu.vue` is a disclosed, greppable exception — a dev-only pill
 * menu that never wired outside-click dismiss (its own header: "a plain
 * click-toggle popover, not a modal"); rather than force new behavior
 * onto it, this composable accepts `outsideClick?: boolean` (default
 * `true`) so `DebugMenu.vue` can construct
 * `{ escape: true, outsideClick: false, explicitCloseControl: true }`
 * explicitly instead of silently inheriting a policy it never had.
 * `escape` and `explicitCloseControl` (the trigger button itself, which
 * every consumer of this composable has) are NOT configurable — every
 * current call site wants both, and the `overlayContract()` refusal
 * requires at least one channel regardless.
 *
 * License: Public Domain (The Unlicense)
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { overlayContract } from '../../state/overlay-contract';

export interface UseDismissiblePopoverOptions {
  /** Default `true`. See this file's header, "the one call-site-
   *  configurable channel" — `DebugMenu.vue` is the one caller passing
   *  `false`. */
  outsideClick?: boolean;
  /** Element focus returns to on close — ADR-0019 C17. Defaults to
   *  `null` (no restoration) for callers that don't yet track their own
   *  trigger element; every current call site's trigger IS the element
   *  the browser already focuses on click, so the default is a safe
   *  no-op, not a silent gap this composable introduces. */
  restoreFocusTo?: () => HTMLElement | null;
}

export interface DismissiblePopoverHandle {
  readonly open: Ref<boolean>;
  /** Template ref for the popover's OWN root element — the
   *  outside-click check is scoped to this subtree (the trigger button
   *  AND the popover panel must both be descendants, matching every
   *  existing call site's own DOM shape). */
  readonly rootRef: Ref<HTMLElement | null>;
  readonly toggle: () => void;
  readonly close: () => void;
}

export function useDismissiblePopover(options: UseDismissiblePopoverOptions = {}): DismissiblePopoverHandle {
  const outsideClick = options.outsideClick ?? true;

  // Construction-time refusal only (this file's own header, "never the
  // source of truth for live state") — `open: false` is a snapshot, the
  // reactive `open` ref below is what the template actually binds.
  overlayContract({
    kind: 'popover',
    open: false,
    dismissal: { escape: true, outsideClick, explicitCloseControl: true },
    focusTrap: false,
    restoreFocusTo: options.restoreFocusTo ?? (() => null),
  });

  const open = ref(false);
  const rootRef = ref<HTMLElement | null>(null);

  function toggle(): void {
    open.value = !open.value;
  }
  function close(): void {
    open.value = false;
  }

  function onDocumentPointerDown(e: PointerEvent): void {
    if (!rootRef.value) return;
    // DOM: event.target is an EventTarget; Node is contains()'s arg type.
    if (rootRef.value.contains(e.target as Node)) return;
    close();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      if (outsideClick) document.addEventListener('pointerdown', onDocumentPointerDown, true);
      document.addEventListener('keydown', onKeydown);
    } else {
      if (outsideClick) document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onKeydown);
    }
  });
  onBeforeUnmount(() => {
    if (outsideClick) document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  });

  return { open, rootRef, toggle, close };
}
