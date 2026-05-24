<script setup lang="ts">
/**
 * src/components/library/LibraryPlayerFilter.vue
 *
 * Autocomplete filter input for player names. v-model binds to a
 * filter string (the parent's `playerWhiteLike` or `playerBlackLike`);
 * the dropdown surfaces matches from `useLibraryPlayerSuggest`'s
 * in-memory cache.
 *
 * Thin: input + focus tracking + dropdown render. The actual
 * suggestion source lives in the composable, fed in via the
 * `suggest` prop so the same component renders both filters.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';

interface Props {
  modelValue: string | null;
  label: string;
  suggest: (prefix: string, limit?: number) => readonly string[];
  placeholder?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<(e: 'update:modelValue', v: string | null) => void>();

const focused = ref(false);

// Reflect the filter value as a plain string for the input.
// `null` (parent's "no filter set") renders as an empty input.
const inputValue = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v === '' ? null : v),
});

// Suggestions only when the input has focus AND non-empty content.
// Empty + focused would dump the full ~thousands-row cache into the
// DOM; we prefer to require the user signal "I want suggestions."
const open = computed(() => focused.value && inputValue.value.length > 0);

const suggestions = computed(() =>
  open.value ? props.suggest(inputValue.value, 12) : [],
);

function pick(name: string): void {
  emit('update:modelValue', name);
  focused.value = false;
}

function onBlur(): void {
  // Defer the close so a mousedown on a suggestion can fire first
  // (`mousedown.prevent` on the list item suppresses focus loss in
  // most browsers but the timing isn't synchronous across all of
  // them; the 150 ms window matches the popover close-grace pattern
  // elsewhere in the codebase).
  setTimeout(() => { focused.value = false; }, 150);
}
</script>

<template>
  <div class="library-player-filter">
    <label class="filter-label">{{ label }}</label>
    <input
      v-model="inputValue"
      :placeholder="placeholder ?? ''"
      type="text"
      class="filter-input"
      @focus="focused = true"
      @blur="onBlur"
    />
    <ul v-if="open && suggestions.length > 0" class="filter-suggest">
      <li
        v-for="name in suggestions"
        :key="name"
        class="filter-suggest-item"
        @mousedown.prevent="pick(name)"
      >{{ name }}</li>
    </ul>
  </div>
</template>

<style scoped>
.library-player-filter {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-tiny);
}
.filter-label {
  font-size: var(--text-small);
  color: var(--text-muted);
}
.filter-input {
  padding: var(--space-tiny) var(--space-small);
  font-size: var(--text-body);
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
  color: var(--text-default);
}
.filter-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}
.filter-suggest {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: var(--z-dropdown);
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
  max-height: 240px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.filter-suggest-item {
  padding: var(--space-tiny) var(--space-small);
  font-size: var(--text-body);
  cursor: pointer;
}
.filter-suggest-item:hover {
  background: var(--accent-primary);
  color: var(--surface-1);
}
</style>
