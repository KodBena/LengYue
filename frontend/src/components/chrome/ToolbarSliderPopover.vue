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

  Hover behaviour is provided by `useHoverPopover` (extracted on
  2026-05-17 when the third instance — `PboPopover` — triggered
  the composable-extraction threshold flagged in
  `docs/worklog/2026-05-14-popover-hover-finickiness.md`). The
  popover sits flush against the badge (no `margin-top` dead
  zone) so the common case is gap-less; the composable's ~150ms
  close-grace timer handles overshoot.

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
import { computed, ref } from 'vue';
import { store } from '../../store';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';
import KnobSlider from '../knobs/KnobSlider.vue';
import type { KnobDecl, KnobId } from '../../types';

const { open, onMouseEnter, onMouseLeave } = useHoverPopover({ devId: 'sliders' });

// D1 fix (commission lyt-sliders-popover-defects, 2026-08-11,
// occlusion defect; extended per the review's Major finding — see
// `useFixedAnchoredPopover.ts`'s own header for the full "scroll/
// resize re-anchor" diagnosis). This popover used to be `position:
// absolute` inside `.sliders-metric` (`position: relative`), itself
// nested inside App.vue's `.lyt-toolbar-strip` — the toolbar's own LYT
// leaf cell (both `#leaf-A_engine` and `#leaf-A_app` post-reencode),
// which carries `overflow-y: auto` so the TOOLBAR'S OWN wrapped
// content is always reachable by scroll rather than silently clipped
// at narrow heights. That ancestor clip applies to every painted
// descendant regardless of z-index, including an absolutely-positioned
// popover — witnessed live: the popover's rendered box extended past
// the strip's own bottom edge at 1400x900, silently truncating the
// lowest knob row. This was never a stacking-order problem
// (`--z-popover-chrome` was already correct and well above every
// sibling); it's a clipping-ancestor problem.
//
// Fix: `position: fixed` (see the popover's own style rule below)
// escapes `.lyt-toolbar-strip`'s clip entirely. The DOM location is
// UNCHANGED — no Teleport — because `useHoverPopover`'s own contract
// requires the popover panel stay a DOM descendant of the hover root
// so a `mouseenter` re-entry from the popover itself is caught (see
// that composable's header). The anchor math (script-computed `top`/
// `left`, scroll/resize re-anchor, viewport clamps) is now owned by
// `useFixedAnchoredPopover` (commission lyt-popover-clip-class,
// extracted from this component's own original D1 implementation —
// see that composable's file header for the full mechanism and
// resource-ownership account). This component no longer imports
// `usePopoverEdgeClamp` — that composable's `position: absolute` +
// `transform: translateX` contract doesn't apply to a `position:
// fixed` consumer.
const triggerEl = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const { style: popoverStyle } = useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'right' });

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
    entries.push({ id: key as KnobId, decl }); // re-brand: the knobs registry is keyed by KnobId; Object.entries widens the key to string
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
    class="sliders-metric"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- W4 item 2 (commissioner screenshot review: "raw 'SLIDERS11'
         text" — the label and the count rendered glued together with
         no gap, because `.metric`'s own `display:flex; gap` rule lives
         in ToolbarEngineMetrics.vue's SCOPED style, which does not
         cross the SFC boundary to this component even though the
         template borrowed the same class name here — see this file's
         own `.sliders-metric` rule below, which now declares its OWN
         flex/gap rather than relying on a same-named class from a
         different component). Also promoted from a plain `<div>` to a
         real `<button>` per the same commission item ("a real labeled
         button not raw text") — semantics + keyboard focusability the
         hover-only div never had; `type="button"` keeps it inert
         inside any future `<form>`. -->
    <!-- S12 (component-shoddiness audit, 2026-08-21): the bare count had
         no unit or explanation on its own — unlike ToolbarEngineMetrics'
         EVAL/HEALTH triggers (which deliberately omit a native `title`
         because their OWN hover popover is the "more detail" surface,
         see that file's header), this badge had no such prior decision
         on record, so a `title` is a plain net addition, not a
         double-up. -->
    <button
      ref="triggerEl"
      type="button"
      class="sliders-trigger"
      :title="$t('toolbar.metric.slidersTooltip', { n: count })"
      :aria-haspopup="true"
      :aria-expanded="open"
    >
      <span class="m-lbl">{{ $t('toolbar.metric.sliders') }}</span>
      <span class="m-val sliders-count">{{ count }}</span>
    </button>

    <div v-if="open" ref="popoverEl" class="sliders-popover" role="tooltip" :style="{ top: popoverStyle.top, left: popoverStyle.left }">
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
   in the existing engine-metrics row. `position: relative` no longer
   anchors the popover (D1 fix, see the <script> header comment above
   — the popover is `position: fixed` with script-computed `top`/
   `left` now, to escape `.lyt-toolbar-strip`'s `overflow-y: auto`
   clip); kept as a harmless, semantically-accurate declaration for
   this element's own stacking-context participation, not load-bearing
   for the popover's placement. */
.sliders-metric {
  position: relative;
}
/* W4 item 2 fix: this component's OWN flex/gap declaration — see the
   template's own comment above for why borrowing ToolbarEngineMetrics'
   `.metric` class name did not actually borrow its CSS (scoped styles
   don't cross the SFC boundary), which produced the concatenated
   "SLIDERS11" render the commissioner's screenshot caught. `.sliders-
   trigger` is now a real `<button>` (see the template); this rule
   gives it the toolbar's own quiet-chrome button register (no visible
   border/background by default, matching how this control read
   before — only the hover/focus states below add a visual cue) plus
   the WCAG 2.5.8 24px pointer-target floor every other toolbar control
   observes. */
.sliders-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  min-height: 24px;
  padding: 1px 5px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-default);
  cursor: pointer;
  font: inherit;
  /* D2 fix (commission lyt-sliders-popover-defects, 2026-08-11, "label
     completely black in the dark theme"). A real `<button>` (promoted
     from a bare `<div>` in W4 item 2, see the file-header note) does
     NOT inherit `color` from its ancestors the way a plain
     `<div>`/`<span>` chain does — browsers apply a UA-stylesheet
     default (`color: buttontext`, rendered black) to form controls
     unless a rule overrides it, and no rule here did: `.m-val` below
     has always set its own `var(--text-0)`, but `.m-lbl` (the
     "SLIDERS" text itself) never did, so it silently rendered at the
     UA black default — invisible against `--surface-0` (also near-
     black in the dark theme) and merely wrong (standing law: readable
     text is ALWAYS --text-0) in every other theme. Verified pre-
     existing on `next` too (that branch's `.sliders-metric .m-val`
     rule has the identical gap; a `<div>` root there happened to
     inherit color from ambient context, which is why it never
     surfaced visibly there) — the div-to-button promotion on
     lyt-phase2 is what turned the latent gap into a visible defect.
     Setting `color` here (rather than only on `.m-lbl`) covers every
     current and future text child of this button by the same
     convention `BoardRailPopoverTrigger.vue`'s `.board-rail-trigger`
     already uses. */
  color: var(--text-0);
}
.sliders-trigger .m-val {
  color: var(--text-0);
}
.sliders-trigger:hover,
.sliders-trigger:focus-visible {
  border-color: var(--border-3);
}
.sliders-trigger:hover .m-val,
.sliders-trigger:focus-visible .m-val {
  /* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
  color: var(--text-0);
}

/* Floating panel — anchored bottom-of-toolbar, drops down flush
   against the badge (no gap). The zero-gap layout pairs with the
   grace-period close timer in <script> to make pointer-traverse from
   badge to popover gap-free in the common case while still tolerating
   overshoot. Width is roomy enough to render every compact-mode
   KnobSlider without the slider becoming a stub, but capped so it
   doesn't blanket half the chrome on wide screens.

   `position: fixed` (D1 fix, see the <script> header comment above)
   replaces the prior `position: absolute; top: 100%; right: 0` — a
   `position: absolute` popover nested inside `.lyt-toolbar-strip`
   (App.vue) inherited that ancestor's `overflow-y: auto` clip
   regardless of z-index, truncating the lowest knob rows. `fixed`
   escapes that clip (its containing block is the viewport); `top`/
   `left` are bound from `popoverStyle`, computed in <script> from the
   trigger's own `getBoundingClientRect()` since fixed-position
   percentage/keyword anchors would otherwise resolve against the
   viewport, not the trigger. */
.sliders-popover {
  position: fixed;
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 380px;
  max-width: 520px;
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
}
.popover-empty {
  color: var(--text-0);
  font-style: italic;
}
.popover-body {
  display: flex;
  flex-direction: column;
}
</style>
