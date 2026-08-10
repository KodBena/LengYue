<!--
  src/components/chrome/TabWidget.vue
  A controlled Vue component for tabbed navigation.

  Resolution roadmap Phase 2 (ledger row 928, audit R2): this is the
  ONE HOME both tab strips the arc names — the top-level control-panel
  strip (App.vue's `controlTabs`) and the Settings sub-tab strip
  (SettingsTab.vue's `subTabs`) — render through, so fixing it here
  fixes both surfaces at once (ADR-0012). R2's finding was two-part:
  (1) a squeezed strip silently truncated tab labels to a
  10.3px-wide sliver with no scrollbar (`.tab-header` had no
  `overflow-x` of its own — the audit found a scroll-LESS
  `overflow-x: auto` on an ANCESTOR instead, invisible with no
  painted scrollbar and no affordance), and (2) the `<li>` items
  carried no `role` and were not keyboard-focusable at all, so
  keyboard traversal could not reach an off-screen tab either. Both
  are fixed here: `.tab-header` itself scrolls (own `overflow-x:
  auto`, tabs never shrink below natural width via `flex: 0 0 auto`
  so a genuinely narrow strip scrolls rather than illegibly
  compressing every label), and each `<li>` is `role="tab"` with
  `tabindex="0"` plus Enter/Space activation, so every tab — visible
  or scrolled off — is Tab-reachable and keyboard-activatable
  independent of whether it currently fits.

  Space/Enter double-fire (ledger row 1051): a focused tab header's
  `@keydown.space`/`@keydown.enter` handlers only ever called
  `selectTab` — they never stopped the event from bubbling past the
  `<li>`. Space and Enter also reach the window-level key registry
  (`useUserIORegistry`), which double-fired whatever global binding
  owns that key (witnessed: the ponder toggle firing a second time
  from a focused tab). Both handlers now carry `.stop` so activating
  a tab consumes the keypress instead of also replaying it globally.

  Orientation (ledger rows 1404/1427): the Settings sub-tab strip
  outgrew horizontal scrolling — six sub-tabs no longer fit a
  reasonable width without a scroll affordance the commissioner
  wants replaced, not tuned. `orientation` ('horizontal' default |
  'vertical') is a presentation-only prop: horizontal strips (the
  control-panel strip, ForestDirectory's Decks/Browse, the Analysis
  dashboard's tab row) render the R2 scroll-on-overflow design
  described above unchanged, except the tablist now carries an
  explicit `aria-orientation="horizontal"` (ARIA's implicit tablist
  default made explicit — semantically inert).
  Vertical lays the component out as a row: a column tablist (its
  OWN `overflow-y: auto`, mirroring the horizontal strip's own
  `overflow-x: auto` — same "the strip scrolls itself" discipline,
  rotated) beside the tab body. `aria-orientation` on the tablist
  follows the prop. No arrow-key traversal is added for vertical (or
  reintroduced for horizontal): the component has never handled
  arrow keys — Tab/Shift+Tab reaches every `<li>` via its existing
  `tabindex="0"`, Enter/Space activates — so vertical keeps exactly
  that same parity rather than inventing a new keyboard contract for
  one orientation only.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * As a stateless view, this component emits 'update:modelValue'
 * instead of mutating internal state.
 */

interface Tab {
  id: string;
  label: string;
}

const props = withDefaults(defineProps<{
  tabs: Tab[];
  modelValue: string; // The active tab ID from the Session store
  /**
   * 'horizontal' (default): today's row-of-tabs-above-a-body strip,
   * unchanged in every existing consumer. 'vertical': a column
   * tablist beside the body — the Settings sub-tab strip's new
   * shape (ledger rows 1404/1427), so far the only opt-in consumer.
   */
  orientation?: 'horizontal' | 'vertical';
  /**
   * When true, every tab's slot is mounted eagerly and `v-show`
   * alone controls visibility; switching tabs preserves the
   * leaving tab's DOM (including native element state like
   * `<details open>`, scroll position, contenteditable selection).
   *
   * Default false matches the prior lazy-mount semantics — used
   * by top-level tab strips where each tab's content is heavy
   * enough that mounting all of them on Settings-open would cost
   * more than the user expects, and where per-tab state is not
   * expected to survive switching anyway.
   *
   * Opt in for sub-tab strips where the tabs are facets of one
   * conceptual surface (e.g. Settings > General / Keybindings)
   * and users reasonably expect disclosure state and scroll
   * position to persist across tab switches.
   */
  keepMounted?: boolean;
}>(), {
  orientation: 'horizontal',
  keepMounted: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

function selectTab(id: string) {
  emit('update:modelValue', id);
}
</script>

<template>
  <div class="vue-tabs" :class="{ 'vue-tabs--vertical': orientation === 'vertical' }">
    <ul class="tab-header" role="tablist" :aria-orientation="orientation">
      <li
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: modelValue === tab.id }"
        role="tab"
        :aria-selected="modelValue === tab.id"
        tabindex="0"
        @click="selectTab(tab.id)"
        @keydown.enter.stop="selectTab(tab.id)"
        @keydown.space.prevent.stop="selectTab(tab.id)"
      >
        {{ tab.label }}
      </li>
    </ul>
    
    <div class="tab-body">
      <div v-for="tab in tabs" :key="tab.id" class="tab-pane" v-show="modelValue === tab.id">
        <!-- Eager-mount when keepMounted; otherwise lazy. See prop docstring. -->
        <slot :name="tab.id" v-if="keepMounted || modelValue === tab.id"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vue-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-0);
  min-height: 0;
}

.tab-header {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
  background: var(--surface-0);
  border-bottom: 1px solid var(--border-1);
  flex-shrink: 0;
  /* Resolution roadmap Phase 2 (audit R2): the strip scrolls itself —
     a real painted scrollbar affordance — rather than relying on an
     ancestor's own overflow-x and rather than letting tabs compress
     illegibly (see `li`'s `flex: 0 0 auto` below). */
  overflow-x: auto;
}

.tab-header li {
  /* M16 (audit finding, ledger row 1251): measured 49.7 x 18px — under
     WCAG 2.5.8's 24x24 floor on the vertical axis, the most-touched
     control in the app. Token-based padding plus an explicit
     min-height floor (padding alone can't guarantee 24px against
     every font-metric variance) bring it to spec without font
     blowup. display:flex + align-items:center recenters the label
     text now that padding is no longer symmetric text-hugging. */
  padding: var(--space-default) var(--space-default);
  min-height: 24px;
  display: flex;
  align-items: center;
  font-size: var(--text-emphasis);
  color: var(--text-0);
  cursor: pointer;
  border-right: 1px solid var(--border-1);
  /* Never shrink below natural label width — R2's finding was a
     10.3px-wide pointer target from flex's default shrink-to-fit;
     the strip scrolls (see `.tab-header` above) instead of squeezing. */
  flex: 0 0 auto;
  white-space: nowrap;
  box-sizing: border-box;
}
.tab-header li:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}

/* Hover: text brightening only — the previous background:
   var(--border-1) was a border-token-as-hover-background (the "dark
   grey" slab; same category-inversion class as ledger row 742) and was
   removed with the transition by commissioner directive 2026-08-07. */
.tab-header li:hover {
  color: var(--text-0);
}

.tab-header li.active {
  background: var(--surface-3);
  color: var(--accent-primary);
  border-bottom: 2px solid var(--accent-primary);
}

.tab-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0; /* The magic property: halts flex-stretching */
}

.tab-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Forces children to respect viewport boundaries */
}

/* Vertical orientation (ledger rows 1404/1427): the rail sits beside
   the body, on the left, per ADR-0019's genre convention for a
   settings surface (VS Code / Firefox / Chrome / macOS preferences —
   a persistent left-hand section list, always visible, never a
   forced sequence — the ADR's own C25). Only SettingsTab.vue opts
   in; every other consumer keeps the untouched horizontal rules
   above. */
.vue-tabs--vertical {
  flex-direction: row;
}

.vue-tabs--vertical .tab-header {
  flex-direction: column;
  /* The rail scrolls itself vertically instead of horizontally —
     same "the strip owns its own overflow" discipline as the
     horizontal `overflow-x: auto` above, rotated to the axis that
     can actually overflow here (many sub-tabs in a short pane).
     No `overflow-x` override here: labels wrap (`white-space:
     normal` below) rather than needing a horizontal scrollbar, and
     this stylesheet keeps R2's own proscription (a clipped-not-
     scrolled axis) intact for every orientation — see
     TabWidget-overflow.test.ts's dedicated assertion on this file's
     style block. */
  overflow-y: auto;
  border-bottom: none;
  border-right: 1px solid var(--border-1);
  flex-shrink: 0;
  /* Genre-convention rail width: narrow enough that the control
     panel's measured floor (270px, `computeControlPanelMinWidthPx`
     over the 5 top-level tabs — unrelated to this sub-strip, but the
     tightest width this rail is ever asked to live inside) still
     leaves the body usable; wide enough for "Analysis Environment"
     (the longest English label, 20 characters) to read on one or two
     wrapped lines rather than a single-character sliver. Long labels
     wrap (see `white-space: normal` below) rather than clip — an
     ellipsis would silently hide which sub-tab a wrapped label was. */
  width: clamp(7rem, 30%, 11rem);
}

.vue-tabs--vertical .tab-header li {
  /* Vertical tabs stack to their own height, not a shared row
     height; long labels wrap instead of the horizontal strip's
     `nowrap` (there is no horizontal room to scroll INTO here — the
     rail's own width is the constraint, not its length). */
  white-space: normal;
  word-break: break-word;
  border-right: none;
  border-bottom: 1px solid var(--border-1);
}
.vue-tabs--vertical .tab-header li:last-child {
  border-bottom: none;
}

.vue-tabs--vertical .tab-header li.active {
  /* Underline reads as horizontal-strip grammar; a vertical rail's
     convention (VS Code / browser prefs) is a leading edge bar
     instead, so the active indicator rotates with the axis rather
     than keeping a bottom border that would sit flush against the
     next tab's top edge. */
  border-bottom: 1px solid var(--border-1);
  border-left: 2px solid var(--accent-primary);
}

.vue-tabs--vertical .tab-body {
  overflow-x: auto;
}
</style>
