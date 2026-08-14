<!--
  src/components/chrome/CornerStackHost.vue

  Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
  lyt-space-owner-spec.md` §1.4/§3 step 5, ledger rows 2447/2484/2499).
  Replaces `App.vue`'s own two independent `position: fixed` containers
  (`#lyt-corner-chrome` and `#lyt-overlay-stack`) with ONE owner that
  registers every bottom-right corner surface as a `CornerStackEntry`
  (`state/corner-stack.ts`) and lays them out via `CornerStack.layout()`
  — the direct fix for the hand-guessed `bottom: calc(var(--space-medium)
  + 40px)` literal (and its own disclosed "a conservative estimate...
  rather than a swept number" comment) that used to stand in for this
  computation.

  **Three registered regions, one anchor (`bottom-right`, matching
  today's sole occupied anchor).** Ordered ascending = closer to the
  screen edge (`CornerStackEntry.order`'s own doc):

    0. `triggers` — the corner trigger row (`DebugMenu`, the board-rail
       popover trigger, the control-panel summon trigger,
       `LytPresenceMenu`, `SystemLogToggle` — `App.vue`'s former
       `#lyt-corner-chrome` contents, unchanged, passed through the
       `triggers` slot). `reserves: true` — always claims its own row
       height even collapsed to icons.
    1. `log` — `SystemLogPanel` (`App.vue`'s own `v-if` gate,
       unchanged, passed through the `log` slot). `reserves: false` —
       contributes zero height while not rendered.
    2. `banners` — the keybinding-capture / workspace-save /
       workspace-suppressed banner cluster (`App.vue`'s own `v-if`
       gates, unchanged, passed through the `banners` slot).
       `reserves: false`, same reason.

  Each region's own live height is `useContentDemand(el, 'v')`
  (dispatch L2b's runtime measurement seam, already the mechanism
  `TreeWidget.vue` uses for `tree`'s own content-demand ceiling) — the
  SAME "measured live, never a human literal" fix this dispatch chain
  already applied to `tree`'s hoarding defect, applied here to the
  corner stack's own offset math.

  **The clearance this component exposes.** `defineExpose({ clearancePx })`
  below publishes `CornerStack.totalHeight()` over the `log`+`banners`
  regions (order >= 1) — the live px a same-corner popover opened from a
  trigger INSIDE the `triggers` row must add to its own `bottom: 100%`
  anchor to clear whatever is currently stacked above that row.
  DISCLOSED mechanism choice: `provide`/`inject` was tried first and
  does NOT fit this shape — `LytPresenceMenu`/`BoardRailPopoverTrigger`/
  App.vue's own control-panel-summon popover are all mounted as THIS
  component's own SLOT content, and Vue's provide/inject resolves
  against the COMPONENT-INSTANCE tree (the slot's authoring parent,
  i.e. `App.vue` itself), not the rendered DOM tree — a `provide()`
  here would never reach an `inject()` in any of those three, despite
  their DOM nesting inside this component's own template. A template
  ref + `defineExpose` (App.vue reads `cornerStackHostRef.value
  .clearancePx` and threads it down as an ordinary prop) is the correct
  mechanism for a value flowing from a CHILD component back to content
  the PARENT (App.vue) itself renders into that child's slots. See
  `App.vue`'s own `cornerStackClearancePx` computed for the read side.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContentDemand } from '../../composables/chrome/useContentDemand';
import { CornerStack, type CornerStackEntry } from '../../state/corner-stack';
import { measured, px } from '../../state/feasible-layout';

type CornerRegion = 'triggers' | 'log' | 'banners';

const triggersElRef = ref<HTMLElement | null>(null);
const logElRef = ref<HTMLElement | null>(null);
const bannersElRef = ref<HTMLElement | null>(null);

const triggersDemand = useContentDemand(triggersElRef, 'v');
const logDemand = useContentDemand(logElRef, 'v');
const bannersDemand = useContentDemand(bannersElRef, 'v');

const GAP_PX = px(4); // var(--space-tight)'s own px value (theme.css) — see App.vue's pre-dispatch gap token usage at this same stack.

const stack = computed(() => {
  const entries: CornerStackEntry<CornerRegion>[] = [
    {
      region: 'triggers',
      anchor: 'bottom-right',
      order: 0,
      reserves: true,
      measured: measured({
        region: 'triggers',
        axis: 'v',
        min: px(0),
        preferred: triggersDemand.value ?? px(0),
        maxUseful: triggersDemand.value ?? px(0),
      }),
    },
    {
      region: 'log',
      anchor: 'bottom-right',
      order: 1,
      reserves: false,
      measured: measured({
        region: 'log',
        axis: 'v',
        min: px(0),
        preferred: logDemand.value ?? px(0),
        maxUseful: logDemand.value ?? px(0),
      }),
    },
    {
      region: 'banners',
      anchor: 'bottom-right',
      order: 2,
      reserves: false,
      measured: measured({
        region: 'banners',
        axis: 'v',
        min: px(0),
        preferred: bannersDemand.value ?? px(0),
        maxUseful: bannersDemand.value ?? px(0),
      }),
    },
  ];
  return CornerStack.build(entries);
});

const offsets = computed(() => stack.value.layout(GAP_PX));
function bottomStyle(region: CornerRegion): string {
  const offsetPx = offsets.value.get(region) ?? px(0);
  return `calc(var(--space-medium) + ${offsetPx}px)`;
}

// Published for the trigger row's own popover-owning children (see this
// file's own header, "The clearance this component provides").
const clearancePx = computed(() => {
  // `log`+`banners` are exactly the two entries at order >= 1 — reused
  // directly from `stack`'s own build rather than re-summing by hand.
  const total = stack.value.totalHeight(GAP_PX);
  const triggersOffset = offsets.value.get('triggers') ?? px(0);
  // `totalHeight` sums EVERY entry (triggers included); subtracting the
  // triggers region's own offset (which is always 0, order 0) leaves
  // exactly the log+banners contribution — named defensively rather
  // than hardcoding "subtract triggers' own preferred+gap" so a future
  // re-ordering of these three entries can't silently desync this sum
  // from `layout()`'s own.
  return Math.max(0, total - triggersOffset);
});

defineExpose({ clearancePx });
</script>

<template>
  <div id="corner-stack-host">
    <div ref="bannersElRef" id="corner-stack-banners" :style="{ bottom: bottomStyle('banners') }">
      <slot name="banners" />
    </div>
    <div ref="logElRef" id="corner-stack-log" :style="{ bottom: bottomStyle('log') }">
      <slot name="log" />
    </div>
    <div ref="triggersElRef" id="corner-stack-triggers" :style="{ bottom: bottomStyle('triggers') }">
      <slot name="triggers" />
    </div>
  </div>
</template>

<style scoped>
/* Every region is independently `position: fixed`, anchored to the SAME
   right edge, with its own `bottom` computed by `CornerStack.layout()`
   above — replacing the two-container `#lyt-corner-chrome`/
   `#lyt-overlay-stack` split and its hand-guessed `+40px` clearance
   between them (this file's own header). `pointer-events: none` on
   region containers that can be empty (`log`/`banners`) so an empty
   region never steals clicks from chrome underneath — each region's own
   slotted content opts back in individually, matching the pre-dispatch
   `#lyt-overlay-stack > *` rule this replaces. */
#corner-stack-banners,
#corner-stack-log {
  position: fixed;
  right: var(--space-medium);
  z-index: var(--z-chrome-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  max-width: min(320px, 90vw);
  pointer-events: none;
}
#corner-stack-banners > :deep(*),
#corner-stack-log > :deep(*) {
  pointer-events: auto;
}

#corner-stack-triggers {
  position: fixed;
  right: var(--space-medium);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: var(--space-tight);
}
</style>
