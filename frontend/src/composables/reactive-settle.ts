/**
 * src/composables/reactive-settle.ts
 *
 * `waitForCondition` — the reactive-settle bridge between a procedural
 * async flow and Vue's reactivity graph. An imperative action (firing an
 * analysis, advancing a review card, creating a board) triggers a state
 * transition *through* the reactivity graph; a procedural driver that
 * needs to await that transition cannot `await` a `ref` directly. This
 * helper resolves a promise the moment a reactive predicate flips true,
 * bridging the two worlds.
 *
 * Domain band (ADR-0003): truly agnostic (B1). It speaks only of a
 * boolean predicate over reactive reads — no game-tree, no Go, no domain
 * vocabulary. Any reactive consumer can drive it.
 *
 * Two named consumers share this primitive (the SSOT rationale for
 * extracting it rather than copying):
 *   - the autonomous-SRS driver (`composables/board/autonomous-srs.ts`),
 *     which bridges its per-move loop to `useReviewSession`'s state
 *     machine;
 *   - the performance-scenario context (`composables/perf/`), whose
 *     `setup` / `run` flows await board-creation, analysis settling, and
 *     navigation transitions.
 *
 * License: Public Domain (The Unlicense)
 */

import { watchEffect } from 'vue';

/**
 * Resolve once `predicate()` is true. Resolves immediately (no tick
 * deferral) if the predicate already holds; otherwise installs a
 * `watchEffect` that re-evaluates whenever any reactive value the
 * predicate reads changes, and tears itself down on the first true
 * reading.
 *
 * The predicate must read reactive state for the watch to fire — a
 * predicate over plain (non-reactive) values that starts false will
 * never resolve. That is the caller's contract; this helper does not
 * poll.
 */
export function waitForCondition(predicate: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (predicate()) {
      resolve();
      return;
    }
    const stop = watchEffect(() => {
      if (predicate()) {
        stop();
        resolve();
      }
    });
  });
}
