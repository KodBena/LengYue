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

const props = defineProps<{
  tabs: Tab[];
  modelValue: string; // The active tab ID from the Session store
}>();

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
        <!-- Render slot only if it is the active tab -->
        <slot :name="tab.id" v-if="modelValue === tab.id"></slot>
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
