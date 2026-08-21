<!--
  src/components/chrome/BoardRailPopoverTrigger.vue

  W2 commission (roadmap §7 ruling 2 / §8 W2 item 2, ledger row 1743):
  board rail STYLE B — "a badge-like trigger co-located near the user
  badge / corner-menu region opening the rail as an opaque popover".
  Only rendered by App.vue when `session.ui.railStyle === 'popover'`
  (mirrors `UserBadge.vue`'s trigger-button idiom: a small button that
  opens something on click — there it opens a modal, here a popover).

  The boardRail LYT leaf's own grid track is permanently collapsed in
  this style (App.vue's presence-override computation forces it, see
  `lyt-widget-registry.ts`'s boardRail note) — this component is the
  ENTIRE realization of the rail in style B, a second `SidebarWidget`
  mount (not a shared instance; Vue components are not multiply-homed).

  CORRECTION (independent review, `.claude/dispatch-reports/lyt-w4-
  chrome-review.md` item 2): this header used to claim the mount
  reused `@load-sgf`/`@save-sgf` handlers App.vue's toolbar mount also
  wires, "both copies of the affordance stay live." That claim went
  stale when `SidebarWidget.vue`'s own SGF buttons and `defineEmits`
  were removed (see that file's own header) — this component's
  `SidebarWidget` mount below no longer has any SGF affordance to
  forward events FROM, so the claim was no longer true of live
  behavior. The dead `load-sgf`/`save-sgf` emit-forwarding (this
  component's own `defineEmits` plus App.vue's matching listeners on
  both this component and its `<SidebarWidget>` child) is removed
  accordingly — the ONE live home for Load/Save SGF is
  `ToolbarAppCluster.vue`, mounted at `App.vue`'s `#leaf-A_app` in both
  screen classes (LYT toolbar ontology reencode, 2026-08-11 — formerly
  `#leaf-A_go`/`#leaf-A_top`), which this rail-as-popover fork never
  covered anyway (opening it shows no SGF buttons inside it, popover
  style or not) — no capability is lost, only the inaccurate claim
  about it is corrected.

  Click/outside-click/Escape dismissal follows the SAME idiom
  `LytPresenceMenu.vue` / `LocalePicker.vue` use (read both in full
  before authoring this component) — kept independent (its own open
  ref, its own listeners) rather than sharing state with the presence
  menu, since the two popovers are independently dismissable.

  Opaque (--surface-0, standing law), edge-clamped
  (`usePopoverEdgeClamp`, same idiom as every other click/hover
  popover in this chrome), fixed size generous enough for the rail's
  own thumbnail list to be usable (`SidebarWidget.vue`'s own virtualized
  rail governs its OWN internal sizing; this wrapper just gives it a
  bounded box that never covers #board-square — anchored above the
  trigger, like `LytPresenceMenu.vue`'s own popover).

  Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
  lyt-space-owner-spec.md` §1.5/§3 step 5): dismissal migrated onto
  `useDismissiblePopover` (`composables/chrome/useDismissiblePopover.ts`)
  — this file's own former header named its own idiom "verbatim the
  same shape `LytPresenceMenu.vue`/`LocalePicker.vue` use"; it is now
  the ONE shared construction of that idiom. A new `clearancePx` prop
  (default `0`) adds extra `margin-bottom` — see `CornerStackHost.vue`'s
  own header for the collision this closes.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';
import { useDismissiblePopover } from '../../composables/chrome/useDismissiblePopover';
import SidebarWidget from './SidebarWidget.vue';

const props = defineProps<{
  /** Extra `margin-bottom` (px) this popover adds above its own
   *  `bottom: 100%` anchor. Optional, defaults to `0`. */
  clearancePx?: number;
}>();

const { open, rootRef, toggle } = useDismissiblePopover();
// `rootRef` is bound to this file's own template root (`ref="rootRef"`,
// below) — see `LytPresenceMenu.vue`'s own identical comment for why
// `noUnusedLocals` needs this explicit acknowledgment.
void rootRef;
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);

const popoverId = 'board-rail-popover';
</script>

<template>
  <div ref="rootRef" class="board-rail-trigger-wrap" :class="{ open }">
    <button
      id="board-rail-popover-btn"
      type="button"
      class="board-rail-trigger"
      :title="$t('app.chrome.presence.railPopoverButton')"
      :aria-label="$t('app.chrome.presence.railPopoverButton')"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="popoverId"
      @click="toggle"
    >
      <span aria-hidden="true">&#9638;</span>
    </button>

    <div
      v-if="open"
      :id="popoverId"
      :ref="setPopoverEl"
      class="board-rail-popover"
      role="dialog"
      :aria-label="$t('app.chrome.presence.boardRail')"
      :style="{ transform: `translateX(${xShift}px)`, marginBottom: `${props.clearancePx ?? 0}px` }"
    >
      <SidebarWidget />
    </div>
  </div>
</template>

<style scoped>
.board-rail-trigger-wrap {
  position: relative;
  display: inline-flex;
}

.board-rail-trigger {
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
.board-rail-trigger:hover { border-color: var(--border-3); }
.board-rail-trigger-wrap.open .board-rail-trigger { border-color: var(--accent-primary); }

/* Opaque (standing law), anchored ABOVE the trigger so it never spreads
   over #board-square. Bounded box: wide/tall enough for the rail's own
   virtualized thumbnail list to be usable without blanketing the
   chrome. */
.board-rail-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  width: 220px;
  height: 420px;
  overflow: hidden;
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
}
</style>
