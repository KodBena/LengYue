<!--
  src/components/chrome/ToolbarSliderPopover.vue

  Toolbar surface for the knob registry's quick-access sliders.
  Renders as a single "SLIDERS" badge in the toolbar (sibling to
  PPS, LATENCY, WATCHDOG, QUEUE); hover opens a floating panel
  listing every scalar knob in compact mode, sorted by ascending
  priority so the user's most-likely-touched knob (move-filter
  threshold) sits at the top.

  Pattern mirrors `EngineQueueTooltip` — single hover-open boolean,
  no local state beyond that. The KnobSlider compact-mode
  rendering is what compresses each row to a single line.

  The popover is flat (not grouped by domain) by design — the
  cross-domain `KnobRegistryEditor` in the Other tab is the
  spacious grouped view; this surface is the rapid-access path
  where domain headers would be visual overhead. Priority is the
  organising axis here; the user's eye scans down a frequency-
  ordered list.

  Domain band (ADR-0003): band 1 — purely substrate-driven, no Go
  vocabulary.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { store } from '../../store';
import KnobSlider from '../knobs/KnobSlider.vue';
import type { KnobDecl, KnobId } from '../../types';

const open = ref(false);

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
    @mouseenter="open = true"
    @mouseleave="open = false"
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

/* Floating panel — anchored bottom-of-toolbar, drops down. Width
   is roomy enough to render every compact-mode KnobSlider without
   the slider becoming a stub, but capped so it doesn't blanket
   half the chrome on wide screens. */
.sliders-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-tight);
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
