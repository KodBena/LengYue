/**
 * src/composables/chrome/useHoverPopover.ts
 *
 * Hover-intent open/close primitive for toolbar-shaped popovers
 * (`EngineQueueTooltip`, `ToolbarSliderPopover`, `PboPopover` — and
 * any future sibling). Returns a reactive `open` boolean plus
 * `onMouseEnter` / `onMouseLeave` handlers the consumer wires into
 * its hover root.
 *
 * ── Behaviour ────────────────────────────────────────────────────
 *
 * `onMouseEnter` cancels any pending close timer and flips `open`
 * to `true`. Because `mouseenter` on the hover root fires when the
 * pointer enters any descendant (including the v-if'd popover
 * panel itself), this cancellation works whether the pointer
 * re-enters the badge or arrives at the popover after a brief
 * out-of-bounds excursion.
 *
 * `onMouseLeave` schedules a 150 ms (default) `setTimeout` that
 * flips `open` to `false`. The grace window covers pointer
 * overshoot — the user moves past the badge, intends to land on
 * the popover, and the popover stays open long enough to receive
 * the pointer. Without it, the v-if reconciliation can unmount
 * the popover faster than a deliberate hand movement.
 *
 * `onUnmounted` clears any pending timer per the resource-
 * ownership-at-mutation-sites discipline in `frontend/CLAUDE.md`.
 *
 * ── Layout contract for the consumer ─────────────────────────────
 *
 * The popover panel must be a DOM descendant of the hover root
 * (so `mouseenter` on the root catches re-entries from the
 * popover) and should sit *flush* against the trigger element
 * (no `margin-top` or `top: calc(100% + ...)` offset that
 * creates a dead zone outside the root's painted bounding box).
 * The grace window forgives overshoot; it does not forgive a
 * structural gap. See
 * `docs/worklog/2026-05-14-popover-hover-finickiness.md` for
 * the diagnosis and the "Recurring pattern" audit note that
 * triggered this composable's extraction.
 *
 * ── ADR-0003 band ────────────────────────────────────────────────
 *
 * Band 1 (truly domain-agnostic). The composable knows about
 * pointer events and timers; no Go vocabulary, no engine
 * vocabulary, no SGF awareness. A chess or shogi port reuses it
 * unchanged.
 *
 * ── Space-owner cure, dispatch L5 (HOVER-GRACE, the commissioner's
 * own named acceptance scenario) ──────────────────────────────────
 *
 * `.claude/dispatch-reports/lyt-space-owner-spec.md` §1.5/§3 step 5,
 * ledger rows 2447/2484/2499. Every hover-triggered popover this
 * composable drives (`EngineQueueTooltip.vue`, `ToolbarSliderPopover.vue`,
 * `PboPopover.vue`, `ToolbarEngineMetrics.vue`'s `engine-eval`/
 * `engine-health` pair) had ZERO of the overlay primitive's three named
 * dismissal channels (`escape`/`outsideClick`/`explicitCloseControl`) —
 * dismissal happened SOLELY via losing hover, a fourth channel the type
 * (`overlay-contract.ts`) does not model. Rather than silently fork the
 * type to add one, this composable now ALSO closes on Escape (added
 * below) — a genuine, disclosed choice: it gives every consumer at
 * least one of the three named channels (satisfying `overlayContract()`'s
 * own "at least one channel" refusal without widening the type) AND
 * closes a real accessibility gap (a keyboard-only user previously had
 * no way to dismiss any of these four popovers at all). `outsideClick`
 * and `explicitCloseControl` stay explicit, disclosed `false` — the
 * hover-loss corridor remains each consumer's own PRACTICAL dismissal
 * mechanism, outside the three the type names.
 *
 * The corridor itself — the grace window below — is the "short grace
 * timer... if geometry alone cannot express it" the spec's own item 3
 * anticipates. Geometry alone (a CSS `:hover`-chain with no JS) cannot
 * express it here because at least one consumer
 * (`ToolbarEngineMetrics.vue`'s `engine-eval`/`engine-health` popovers)
 * positions its OWN panel via `position: fixed` + JS-computed
 * `top`/`left` (`useFixedAnchoredPopover`), never a CSS-only anchor a
 * `:hover` selector chain could span — the timer is the documented
 * choice, not an oversight.
 *
 * License: Public Domain (The Unlicense)
 */

import { onUnmounted, ref, watch, type Ref } from 'vue';
import { INTERACTION_DISMISS_DELAY_MS } from '../../lib/timing';
import { overlayContract } from '../../state/overlay-contract';

// DEV-only: lets the popover perf harness (useAutoPopoverPerf) force a
// specific popover open by id, programmatically, in place of physical hover.
// Module-scoped so one harness drives whichever popover it targets. The
// consuming watch (below) and this ref's writes are DEV-gated, so a
// production build carries only an unread ref.
const devForcedOpenId = ref<string | null>(null);

/** DEV-only: force the popover whose `devId` matches `id` open (or pass null
 *  to release). No-op in production. Used by the perf-capture harness. */
export function __devForcePopoverOpen(id: string | null): void {
  if (import.meta.env.DEV) devForcedOpenId.value = id;
}

export interface HoverPopoverHandle {
  /** Open/closed state. Template binds via `v-if="open"`. */
  readonly open: Ref<boolean>;
  /** Wire to the hover root's `@mouseenter`. */
  readonly onMouseEnter: () => void;
  /** Wire to the hover root's `@mouseleave`. */
  readonly onMouseLeave: () => void;
}

export interface UseHoverPopoverOptions {
  /**
   * Grace window before the popover closes on `mouseleave`.
   * Default 150 ms — short enough that intentional close feels
   * responsive, long enough that overshoot forgiveness is
   * reliable. Tuneable per call site if a specific surface
   * needs a different rhythm; almost all callers should accept
   * the default for cross-popover consistency.
   */
  closeDelayMs?: number;
  /**
   * DEV-only identifier so the popover perf harness can force this popover
   * open by id (programmatic stress in place of hover). No effect in
   * production. Omit for popovers that never need harness-driving.
   */
  devId?: string;
}

export function useHoverPopover(
  options: UseHoverPopoverOptions = {},
): HoverPopoverHandle {
  // Construction-time refusal only (`overlay-contract.ts`'s own header) —
  // see this file's own "Space-owner cure, dispatch L5" section above
  // for why `escape: true` is the one channel this composable adds, and
  // why `outsideClick`/`explicitCloseControl` stay disclosed `false`.
  overlayContract({
    kind: 'popover',
    open: false,
    dismissal: { escape: true, outsideClick: false, explicitCloseControl: false },
    focusTrap: false,
    restoreFocusTo: () => null,
  });

  const closeDelayMs = options.closeDelayMs ?? INTERACTION_DISMISS_DELAY_MS;
  const open = ref<boolean>(false);

  // Non-reactive `let` — it's a resource handle, not state to
  // render. Cleared on mouseenter (cancelling a pending close)
  // and on unmount (per the resource-ownership discipline).
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') open.value = false;
  }
  // Escape dismissal (dispatch L5, HOVER-GRACE): a single shared
  // `window` listener, installed only while THIS popover is open —
  // mirrors every click-popover's own "listener lifetime matches open
  // state" convention (`useDismissiblePopover.ts`).
  watch(open, (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
  });

  function onMouseEnter(): void {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    open.value = true;
  }

  function onMouseLeave(): void {
    if (closeTimer !== null) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      open.value = false;
      closeTimer = null;
    }, closeDelayMs);
  }

  // DEV-only harness hook: when the perf harness targets this popover's
  // devId, drive `open` directly (the same boolean the hover handlers write),
  // so a programmatic open/close exercises the real render / edge-clamp path
  // without synthetic pointer events. The whole block DCEs in production.
  if (import.meta.env.DEV && options.devId !== undefined) {
    watch(devForcedOpenId, (forced) => {
      open.value = forced === options.devId;
    });
  }

  onUnmounted(() => {
    if (closeTimer !== null) clearTimeout(closeTimer);
    window.removeEventListener('keydown', onKeydown);
  });

  return { open, onMouseEnter, onMouseLeave };
}
