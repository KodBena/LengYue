/**
 * src/composables/board/usePassSignal.ts
 * Cross-layer "play a pass" request signal.
 *
 * Mirrors `useMintDialogSignal.ts` exactly, for the same reason: the
 * board-mutation entry point (`useBoardMoveRouting.handlePass`) is
 * built inside `App.vue`'s own setup (it closes over `reviewSession`
 * and `engineResponder`, both of which need a live component
 * instance — see `useEngineResponder.ts`'s `useI18n()` call), so the
 * module-scope keybindings catalog has no direct reference to call.
 * A module-scoped counter `ref`, mutated only through a named
 * function and watched by `App.vue`, closes that gap without giving
 * the catalog a component-scoped dependency.
 *
 * Counter (not boolean) for the same reason `useMintDialogSignal`
 * documents: a `watch` must fire once per request, including two
 * requests inside the same reactive-flush window (rapid double-tap
 * of the pass key), which a boolean flip-to-true-again would
 * silently coalesce.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';

const requestCount: Ref<number> = ref(0);

/**
 * Read-only signal: increments once per `requestPass()` call.
 * `App.vue` watches this to call its own `handlePass()`.
 */
export const passRequestCount: Readonly<Ref<number>> = requestCount;

/** Request that a pass be played on the active board. */
export function requestPass(): void {
  requestCount.value++;
}
