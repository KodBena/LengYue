<!-- 
  src/components/chrome/TabWidget.vue 
  A controlled Vue component for tabbed navigation.
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
    <ul class="tab-header">
      <li 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="{ active: modelValue === tab.id }"
        @click="selectTab(tab.id)"
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
  border-bottom: 1px solid var(--surface-1);
  flex-shrink: 0;
}

.tab-header li {
  padding: 1px 6px;
  font-size: var(--text-emphasis);
  color: var(--text-2);
  cursor: pointer;
  border-right: 1px solid var(--surface-1);
  transition: background var(--duration-default), color var(--duration-default);
}

.tab-header li:hover {
  background: var(--border-1);
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
