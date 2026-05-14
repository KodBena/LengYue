<!--
  src/components/chrome/ToolbarSliderPopover.vue

  Toolbar surface for the knob registry's quick-access sliders.
  Renders as a single "SLIDERS" badge in the toolbar, visually
  adjacent to the engine-metrics row (PPS, LATENCY, WATCHDOG,
  QUEUE) when connected. The badge itself is substrate-driven
  (ADR-0003 band 1) and renders unconditionally; the engine-metrics
  row's `v-if="isConnected"` gate explicitly does NOT apply to this
  component, since user preferences (hue offset, ownership opacity,
  move-filter threshold) have nothing to do with engine
  reachability. The PR #225 placement put the badge inside the
  gated wrapper; see
  `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` for the
  band/chrome-neighbourhood mismatch and the corrective.

  Hover opens a floating panel listing every scalar knob in compact
  mode, sorted by ascending priority so the user's most-likely-
  touched knob (move-filter threshold) sits at the top.

  Pattern mirrors `EngineQueueTooltip`: hover-open boolean plus a
  hover-intent grace timer. The popover sits flush against the
  badge (no `margin-top` dead zone) so the common case is
  gap-less; the ~150ms close timer on `mouseleave` handles
  overshoot. The grace timer is cancelled on any subsequent
  `mouseenter` of the wrapper, which covers both reentering the
  badge and entering the popover (a DOM descendant). Both
  popovers in `chrome/` carry the same shape; see the worklog
  entry at `docs/worklog/2026-05-14-popover-hover-finickiness.md`
  for the recurring-pattern audit note (third instance → extract
  a composable).

  The KnobSlider compact-mode rendering is what compresses each
  row to a single line.

  The popover is flat (not grouped by domain) by design — the
  cross-domain `KnobRegistryEditor` in the Other tab is the
  spacious grouped view; this surface is the rapid-access path
  where domain headers would be visual overhead. Priority is the
  organising axis here; the user's eye scans down a frequency-
  ordered list.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { store } from '../../store';
import KnobSlider from '../knobs/KnobSlider.vue';
import type { KnobDecl, KnobId } from '../../types';

const open = ref(false);

// Hover-intent close timer. Non-reactive `let` — it's a resource
// handle, not state to render. Cleared on mouseenter into the
// wrapper (including any descendant — the popover counts) and on
// unmount per the resource-ownership-at-mutation-sites discipline
// in `frontend/CLAUDE.md`. The 150ms grace window is the typical
// pointer-overshoot reaction time; smaller feels finicky, larger
// feels sluggish on intentional close.
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const CLOSE_DELAY_MS = 150;

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
  }, CLOSE_DELAY_MS);
}

onUnmounted(() => {
  if (closeTimer !== null) clearTimeout(closeTimer);
});

/**
 * Every scalar (inputs.length === 1) knob in the registry, sorted
 * by ascending `priority` with `undefined` treated as Infinity so
 * unset knobs sit at the end. The list is flat — domains aren't
 * surfaced as headers in the popover, since the user picked the
 * priority field specifically to flatten the ordering question
 * for rapid access.
 */
const orderedKnobs = computed<ReadonlyArray<{ id: KnobId; decl: KnobDecl }>>(() => {
  const entries: Array<{ id: KnobId; decl: KnobDecl }> = [];
  for (const [key, decl] of Object.entries(store.profile.settings.knobs)) {
    if (decl.inputs.length !== 1) continue;
    entries.push({ id: key as KnobId, decl });
  }
  entries.sort((a, b) => priorityKey(a.decl) - priorityKey(b.decl));
  return entries;
});

function priorityKey(decl: KnobDecl): number {
  return decl.priority ?? Number.POSITIVE_INFINITY;
}

const count = computed(() => orderedKnobs.value.length);
</script>

<template>
  <div
    class="metric sliders-metric"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <span class="m-lbl">{{ $t('toolbar.metric.sliders') }}</span>
    <span class="m-val sliders-count">{{ count }}</span>

    <div v-if="open" class="sliders-popover" role="tooltip">
      <div v-if="count === 0" class="popover-empty">
        {{ $t('toolbar.sliders.empty') }}
      </div>
      <div v-else class="popover-body">
        <KnobSlider
          v-for="entry in orderedKnobs"
          :key="entry.id"
          :knob-id="entry.id"
          compact
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Match the queue-tooltip metric layout so the badge sits cleanly
   in the existing engine-metrics row. */
.sliders-metric {
  position: relative;
  cursor: default;
}
.sliders-metric .m-val {
  color: var(--text-2);
  transition: color var(--duration-default);
}
.sliders-metric:hover .m-val {
  color: var(--accent-primary);
}

/* Floating panel — anchored bottom-of-toolbar, drops down flush
   against the badge (no `margin-top`). The zero-gap layout pairs
   with the grace-period close timer in <script> to make
   pointer-traverse from badge to popover gap-free in the common
   case while still tolerating overshoot. Width is roomy enough
   to render every compact-mode KnobSlider without the slider
   becoming a stub, but capped so it doesn't blanket half the
   chrome on wide screens. */
.sliders-popover {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 380px;
  max-width: 520px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.popover-empty {
  color: var(--text-2);
  font-style: italic;
}
.popover-body {
  display: flex;
  flex-direction: column;
}
</style>
