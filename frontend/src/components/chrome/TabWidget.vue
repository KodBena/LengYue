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
  <div class="vue-tabs">
    <ul class="tab-header" role="tablist">
      <li
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: modelValue === tab.id }"
        role="tab"
        :aria-selected="modelValue === tab.id"
        tabindex="0"
        @click="selectTab(tab.id)"
        @keydown.enter="selectTab(tab.id)"
        @keydown.space.prevent="selectTab(tab.id)"
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
  padding: 1px 6px;
  font-size: var(--text-emphasis);
  color: var(--text-2);
  cursor: pointer;
  border-right: 1px solid var(--border-1);
  /* Never shrink below natural label width — R2's finding was a
     10.3px-wide pointer target from flex's default shrink-to-fit;
     the strip scrolls (see `.tab-header` above) instead of squeezing. */
  flex: 0 0 auto;
  white-space: nowrap;
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
</style>
