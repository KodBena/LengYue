/**
 * src/composables/chrome/useSystemLogToggle.ts
 *
 * D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2,
 * reclassified REWORK-CAUSED). The W1 skeleton replacement lost the
 * system log's manual open/close affordance — pre-rework, a toggle
 * wrote `session.ui.systemLogExpanded`; after W1 only the transient
 * auto-reveal (`useTransientLogReveal.ts`, a SEPARATE ref) survived,
 * and nothing in the tree ever wrote `true` to the persisted field
 * again. This composable is the restored write site.
 *
 * Deliberately thin — the field's read semantics were never touched
 * by the W4 overlay-stratum move (`App.vue`'s own comment on
 * `#lyt-overlay-stack`: "systemLogExpanded still means exactly 'does
 * the user want the log panel visible' — only WHERE it renders
 * changed"), so restoring the affordance is exactly read-current-
 * value + flip-it-through-`touchSession()`, the same shape
 * `useLytPresenceMenu.ts`'s own `toggle()` uses for its own
 * persisted-boolean writes. No new guard logic: unlike the presence
 * menu's three targets, there is no "last remaining panel" concern
 * here — hiding the log never leaves the user without SOME visible
 * panel, it just silences diagnostics (recoverable any time via this
 * same toggle, or transiently via an error/warning arrival).
 *
 * ADR-0003 band: 2 (chrome-coupled — reads/writes session UI state;
 * no Go/engine vocabulary).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type ComputedRef } from 'vue';
import { store, touchSession } from '../../store';

export interface SystemLogToggleHandle {
  /** Mirrors `store.session.ui.systemLogExpanded` — the persisted
   *  "does the user want the log panel visible" intent. Does NOT
   *  reflect the separate transient auto-reveal state; a consuming
   *  template composes the two independently (see App.vue's
   *  `SystemLogPanel` v-if, unchanged by this fix). */
  readonly expanded: ComputedRef<boolean>;
  /** Flips `systemLogExpanded` and calls `touchSession()` so the
   *  change schedules a persist, the same write shape every other
   *  chrome toggle in this codebase uses. */
  readonly toggle: () => void;
}

export function useSystemLogToggle(): SystemLogToggleHandle {
  const expanded = computed(() => store.session.ui.systemLogExpanded);

  function toggle(): void {
    store.session.ui.systemLogExpanded = !store.session.ui.systemLogExpanded;
    touchSession();
  }

  return { expanded, toggle };
}
