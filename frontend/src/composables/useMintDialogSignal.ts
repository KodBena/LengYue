/**
 * src/composables/useMintDialogSignal.ts
 * Cross-layer "open the mint dialog" request signal.
 *
 * `MintCardModal` is opened today only via a component-ref method
 * call (`App.vue`'s `triggerMint` → `mintModalRef.value?.open(id)`),
 * because the modal owns async setup (`prepareDraft`) that a plain
 * `store.session.ui.*` boolean can't drive — a watcher still has to
 * call the ref's `open(boardId)` method, not just flip a flag the
 * template renders on. There's no composable/service-level "open
 * the mint dialog" entry point elsewhere in the app for a caller
 * outside `App.vue`'s own template scope (the keybindings catalog,
 * module-scope, has no component instance and thus no ref) to reach.
 *
 * This module is the minimal cross-layer signal that closes that
 * gap, in the same shape as the app's other module-scoped UI-signal
 * flags — `keybindings-capture.ts`'s `captureMode` and
 * `useModalKeyboard.ts`'s `openModalCount` — a module-scoped `ref`
 * exported read-only, mutated only through a named function:
 *
 *   - `requestMintDialog()` — called by the keybindings catalog's
 *     `card.mint` handler. Increments a counter rather than setting
 *     a boolean so a `watch` on it (App.vue) fires on every request,
 *     including a request that arrives while a prior request's watch
 *     callback hasn't run yet (Vue's watcher microtask batches same-
 *     tick writes into one flush; a boolean flip-to-true-again inside
 *     that window would be silently absorbed. A monotonic counter
 *     value always differs from what the watcher last observed).
 *   - `mintDialogRequestCount` — the read-only signal. `App.vue`
 *     `watch`es it and calls its own `triggerMint()` (which resolves
 *     `activeBoardId` and calls `mintModalRef.value?.open(id)`) on
 *     every change. Vue's automatic watcher cleanup on unmount means
 *     there's no manual teardown to wire here (see the umbrella
 *     CLAUDE.md's "Resource ownership at mutation sites" — a Vue
 *     `watch` is the automatically-cleaned case that section
 *     explicitly excludes from the manual-cleanup discipline).
 *
 * This is intentionally NOT a `store.session.ui` field: the request
 * is a one-shot imperative signal ("open now"), not persisted UI
 * state — the same reasoning `captureMode` documents for staying
 * module-scoped rather than living on the persisted store.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';

const requestCount: Ref<number> = ref(0);

/**
 * Read-only signal: increments once per `requestMintDialog()` call.
 * `App.vue` watches this to open `MintCardModal` via its ref.
 */
export const mintDialogRequestCount: Readonly<Ref<number>> = requestCount;

/** Request that the mint dialog open for the current active board. */
export function requestMintDialog(): void {
  requestCount.value++;
}
