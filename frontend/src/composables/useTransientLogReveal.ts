/**
 * src/composables/useTransientLogReveal.ts
 *
 * Transient auto-reveal for the system-log panel when the persistent
 * `session.ui.systemLogExpanded` setting is `false`.
 *
 * UX intent (per the user's framing of `systemLogExpanded`):
 *   - `true`  → log panel is always exposed.
 *   - `false` → log panel is hidden, but reveals momentarily on bad
 *               events (errors and warnings) so the user can act on
 *               them. Without this auto-reveal the channel is closed
 *               in a fail-loud-violation-adjacent way: messages reach
 *               `store.engine.messages`, but with the panel hidden
 *               the user never learns one arrived.
 *
 * Mechanism: a watcher on the head of `store.engine.messages` flips
 * a local `transientReveal` ref to `true` when a new error- or
 * warning-level message arrives. A timer clears it after
 * `REVEAL_DURATION_MS`. A second event during the reveal window
 * resets the timer (latest-wins) so a burst keeps the panel visible
 * until the burst settles.
 *
 * The composable is App.vue-scoped (called once at root); the
 * returned `Ref` overlays the `systemLogExpanded` gate via boolean
 * disjunction. Info-level messages do not trigger; the user-visible
 * channel for them remains the explicitly-expanded panel.
 *
 * Distinguishing "new arrival" from "rotation/dismissal":
 *   `pushSystemMessage` does `messages.unshift(msg)`, so the
 *   monotonically-rising `timestamp` of a new head reliably
 *   indicates a new arrival. Dismissal (`messages.filter(...)`) can
 *   change which message is at index 0 but never produces a head
 *   with a newer timestamp than what was previously seen, so the
 *   timestamp comparison short-circuits the dismissal case
 *   correctly.
 *
 * License: Public Domain (The Unlicense)
 */

import { onUnmounted, readonly, ref, watch, type Ref } from 'vue';
import { store } from '../store';

const REVEAL_DURATION_MS = 8000;

export function useTransientLogReveal(): Readonly<Ref<boolean>> {
  const transientReveal = ref(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastSeenTimestamp = 0;

  // `immediate: true` so a message already at the head when this
  // composable mounts (e.g., a startup migration's audit-trail
  // SystemMessage written by `updateFromRemote` during hydrate) gets
  // its flash too — startup is exactly when the user needs to see
  // diagnostics.
  watch(
    () => store.engine.messages[0],
    (newest) => {
      if (!newest) return;
      if (newest.timestamp <= lastSeenTimestamp) return;
      lastSeenTimestamp = newest.timestamp;
      if (newest.type !== 'error' && newest.type !== 'warning') return;

      transientReveal.value = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        transientReveal.value = false;
        timeoutId = null;
      }, REVEAL_DURATION_MS);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (timeoutId !== null) clearTimeout(timeoutId);
  });

  return readonly(transientReveal);
}
