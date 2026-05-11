/**
 * src/composables/useTransientHint.ts
 *
 * Module-scoped reactive hint string surfaced by `StatusBar.vue`.
 * Any component or composable can call `setHint(text)` to publish
 * a short context-sensitive message (e.g. "Ctrl+click or
 * middle-click to paste PV" when hovering a move suggestion);
 * `clearHint()` removes it. The StatusBar reads the value
 * directly via the returned read-only ref.
 *
 * Module scope rather than a store field: the hint is purely
 * ephemeral UI state. It does not persist across sessions, does
 * not sync to the backend, and does not participate in the
 * schema-migration ledger. A single global ref is the right
 * shape — at most one hint is meaningful at a time, and the
 * writer-of-last-write-wins semantics matches the hover-driven
 * usage pattern.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, readonly, type DeepReadonly, type Ref } from 'vue';

const hint = ref<string | null>(null);

export function useTransientHint(): {
  hint: DeepReadonly<Ref<string | null>>;
  setHint: (value: string) => void;
  clearHint: () => void;
} {
  return {
    hint: readonly(hint),
    setHint: (value: string) => { hint.value = value; },
    clearHint: () => { hint.value = null; },
  };
}
