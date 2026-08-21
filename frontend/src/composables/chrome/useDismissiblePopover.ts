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
 * **Row 2501 repair — Escape capture-phase hardening
 * (`.claude/dispatch-reports/lyt-cure-repair-build.md`, item 3).** The
 * live-witness rig found the portrait control-panel popover's Escape
 * dismissal inert in a REAL browser despite a passing jsdom test
 * (`.claude/dispatch-reports/lyt-cure-live-witness.md`, item 5b-ii):
 * pressing Escape with the popover open, focus at several different
 * DEEP-in-popover locations, left it open every time. This composable's
 * `onKeydown` was already document-level and open-state-scoped (never
 * consulting `document.activeElement`), so in isolation it does not
 * depend on where focus sits — but that also means it offers no defense
 * against a DIFFERENT ancestor-or-earlier bubble-phase keydown listener
 * intercepting Escape before it reaches this one (the App-level surface
 * this popover mounts under has several OTHER document/window-level
 * keydown listeners of its own — `useUserIORegistry.ts`,
 * `SetupToolPalette.vue`, `useModalKeyboard.ts` — none witnessed calling
 * `stopPropagation`, but a component this file doesn't own could start
 * doing so without this file's own author ever noticing, and the
 * isolated `ToolbarEngineControls` jsdom test that passes for THIS same
 * composable never mounts any of them alongside it). This composable's
 * OWN sibling channel, `onDocumentPointerDown`, already registers with
 * `{ capture: true }` for exactly this reason (register first, run
 * first, regardless of what any other bubble-phase listener does) — the
 * keydown listener lacked that same hardening, an asymmetry between the
 * two channels of the SAME primitive that this repair closes. Escape now
 * registers at `capture: true` too: it runs during the CAPTURE phase,
 * before the event has even reached its target, which is strictly
 * earlier than every bubble-phase listener above (App.vue's own keydown
 * listeners are all plain bubble-phase, confirmed by reading each file)
 * — so no bubble-phase interceptor, present or future, can shadow this
 * primitive's own Escape channel regardless of where focus sits inside
 * the overlay.
 *
 * **Disclosed honestly (ADR-0002): this is a hardening, not a confirmed
 * root-cause fix.** Direct reading of every document/window-level
 * keydown listener in this codebase found none calling `stopPropagation`
 * — the jsdom regression test this repair adds (`App-boot.test.ts`,
 * "Escape closes the summoned popover... in the FULL App tree") passes
 * both with and without this capture-phase change, confirmed by toggling
 * it locally. The real-browser failure's precise mechanism (a native
 * `<select>` dropdown's own OS-level Escape consumption when a focused
 * select's list is open is the most plausible remaining candidate — a
 * class of interaction jsdom cannot simulate at all, since it performs no
 * real layout or native-widget rendering) is UNEXERCISED by anything in
 * this repository's own test suite, live-browser or otherwise, and stays
 * so after this change. Surfaced here rather than silently claimed fixed.
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

  // Row 2501 repair: `true` (capture phase) — see this file's own header,
  // "Escape capture-phase hardening." Registered/removed in lockstep with
  // the pointerdown listener, which already used capture for the same
  // reason.
  watch(open, (isOpen) => {
    if (isOpen) {
      if (outsideClick) document.addEventListener('pointerdown', onDocumentPointerDown, true);
      document.addEventListener('keydown', onKeydown, true);
    } else {
      if (outsideClick) document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onKeydown, true);
    }
  });
  onBeforeUnmount(() => {
    if (outsideClick) document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeydown, true);
  });

  return { open, rootRef, toggle, close };
}
