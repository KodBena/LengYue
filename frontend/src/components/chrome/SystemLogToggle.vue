<!--
  src/components/chrome/SystemLogToggle.vue

  D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2,
  reclassified REWORK-CAUSED). Restores the manual open/close
  affordance for the system log that the W1 skeleton replacement
  silently dropped — see `useSystemLogToggle.ts`'s own header for the
  write-side story; this file is the button.

  Placement: mounted in App.vue's `#lyt-corner-chrome` cluster,
  alongside `DebugMenu.vue`/`BoardRailPopoverTrigger.vue`/
  `LytPresenceMenu.vue` — an overlay, not a LYT tree node (SPEC.md §2:
  "Overlays... occupy no standing space"), zero grid-track cost in
  either screen class.

  Placement rationale (the commission's own "presence/debug region,
  justify the pick"): NOT folded into `LytPresenceMenu.vue`'s popover.
  That popover's three checkbox targets are specifically LYT grid-
  presence toggles under a shared "at least one must stay visible"
  guard (`useLytPresenceMenu.ts`'s own header) — the system log is not
  a grid leaf at all (it lives in the overlay stratum, contributes no
  layout, per W4 item 1) and has no such guard; folding it in would
  either dilute that guard's own accounting or need a carve-out,
  neither of which the log's semantics call for. NOT folded into
  `DebugMenu.vue` either: that menu is `import.meta.env.DEV`-gated —
  its entire root never renders in a production build — but the
  system log's manual toggle is an ordinary user-facing affordance
  (the auto-reveal already proves normal users see this panel), not a
  developer-only diagnostic. A standalone button, sized and styled
  like `LytPresenceMenu.vue`'s own trigger (the closest sibling in
  register — a quiet, always-present corner icon button, not a wide
  DEBUG-style pill), reads as its own "system status" affordance
  without overloading either neighbour's existing semantics.

  24px pointer-target floor (standing law) — see the .system-log-
  toggle rule below.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useSystemLogToggle } from '../../composables/chrome/useSystemLogToggle';

const { t } = useI18n();
const { expanded, toggle } = useSystemLogToggle();
</script>

<template>
  <button
    id="system-log-toggle-btn"
    type="button"
    class="system-log-toggle"
    :class="{ active: expanded }"
    :aria-pressed="expanded"
    :title="t('systemLog.toggleButton')"
    :aria-label="t('systemLog.toggleButton')"
    @click="toggle"
  >
    <span aria-hidden="true">&#8801;</span>
  </button>
</template>

<style scoped>
/* Same 28px square register as .lyt-presence-trigger (LytPresenceMenu.vue)
   — the closest sibling in the corner-chrome cluster — clearing the
   24x24 WCAG 2.5.8 pointer-target floor (M16 discipline). */
.system-log-toggle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-0);
  cursor: pointer;
  font-size: var(--text-emphasis);
}
.system-log-toggle:hover { border-color: var(--border-3); }
/* Reflects the PERSISTED `systemLogExpanded` intent, not the transient
   auto-reveal — a message-triggered flash does not paint this button
   "active" (it isn't the user's own standing choice). */
.system-log-toggle.active { border-color: var(--accent-primary); color: var(--accent-primary); }
</style>
