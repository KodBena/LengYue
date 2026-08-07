/**
 * src/composables/useSetupWizardSignal.ts
 *
 * Cross-layer "open the setup wizard" request signal (ledger slug
 * swz-setup-wizard). Same module-scoped-flag shape as
 * `keybindings-capture.ts`'s `captureMode` and
 * `useModalKeyboard.ts`'s `openModalCount` — a module-scoped `ref`
 * exported read-only, mutated only through named functions.
 *
 * Simpler than `useMintDialogSignal`'s request-COUNTER shape: the
 * mint dialog needs a counter because opening it runs async setup
 * (`prepareDraft`) reached only via a component-ref method call, so
 * a plain boolean can't distinguish "still open from the last
 * request" from "a fresh request arrived." The wizard has no such
 * async-setup step — it is a plain `v-if`-mounted modal — so a
 * boolean is the honest, minimal shape here.
 *
 * Two independent callers open the wizard through this signal:
 *   - `App.vue`'s first-run watcher (`store.workspaceLoadState.kind
 *     === 'loaded'` transitioning while `profile.settings.onboarding
 *     .completed` is still `false`).
 *   - `SettingsTab.vue`'s "Rerun setup wizard" button — re-running
 *     never resets `onboarding.completed`; it only re-opens the same
 *     modal a returning user can revisit anytime.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';

const isOpen: Ref<boolean> = ref(false);

/** Read-only signal: `App.vue` mounts `SetupWizardModal` with `v-if` on this. */
export const setupWizardOpen: Readonly<Ref<boolean>> = isOpen;

/** Open the wizard (first-run trigger or the Settings "rerun" button). */
export function openSetupWizard(): void {
  isOpen.value = true;
}

/** Close the wizard — called on finish, on explicit dismiss, and by
 *  every step's Skip action (skipping a step never closes the
 *  wizard itself; only Finish/Close do). */
export function closeSetupWizard(): void {
  isOpen.value = false;
}
