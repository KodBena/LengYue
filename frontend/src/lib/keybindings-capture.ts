/**
 * src/lib/keybindings-capture.ts
 * Capture-mode state + binding-mutation helpers for the
 * user-facing keybindings editor (Phase 4 of the archived plan,
 * `docs/archive/notes/design/keybindings-plan.md`).
 *
 * Three pieces live here:
 *
 *   1. `captureMode` — a module-scoped reactive ref naming the
 *      KeybindingActionId currently in "press a key to bind"
 *      mode (null when no row is mid-edit). Shared by:
 *        - `KeybindingRow.vue` (sets it on Edit click; clears
 *          on commit/cancel; its own keydown listener records
 *          the key while set).
 *        - `useUserIORegistry.ts` (early-returns from the
 *          dispatcher when set, so pressing a key during
 *          capture records the binding instead of triggering
 *          whatever action that key happens to fire normally).
 *
 *      Module-scoped (not `session.ui`) because the flag is
 *      truly ephemeral — closing and reopening the SPA should
 *      never resume a half-finished capture. `session.ui` is
 *      persisted via SyncService; putting the flag there would
 *      both round-trip noise to the backend and survive across
 *      sessions, neither of which is wanted.
 *
 *   2. Binding mutators — `setBinding` / `resetBinding` /
 *      `resetAllBindings` — write into the persisted
 *      `store.profile.settings.keybindings` slot that Phase 1
 *      shipped. These ARE persisted (the user's chosen keys
 *      survive close/reopen and roam to other devices via
 *      SyncService).
 *
 *   3. Capture-time validation — the reserved-key list and
 *      conflict-detection helper.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { store } from '../store';
import type { KeybindingActionId } from '../types';
import {
  effectiveKey,
  normalizeKey,
  type KeybindingActionDecl,
} from './keybindings';

// ── Capture-mode flag ───────────────────────────────────────

/**
 * Which action's row is currently in "press a key" capture
 * mode, if any. Read by the dispatcher (early-returns when
 * set) and by `KeybindingRow.vue` (only the matching row
 * renders its capture surface).
 *
 * One row at a time — clicking Edit on a second row while
 * another is mid-edit cancels the first.
 */
export const captureMode: Ref<KeybindingActionId | null> = ref(null);

export function startCapture(actionId: KeybindingActionId): void {
  captureMode.value = actionId;
}

export function cancelCapture(): void {
  captureMode.value = null;
}

// ── Reserved keys ───────────────────────────────────────────

/**
 * Keys the editor refuses to bind — they have load-bearing
 * roles in the SPA's other input surfaces or in keyboard
 * accessibility:
 *
 *   - `Escape`  — dismisses modals / overlays; also doubles
 *                 as "cancel capture" inside the editor.
 *   - `Tab`     — focus traversal; binding it would break
 *                 keyboard-only navigation.
 *   - `Enter`   — activates focused buttons / submits forms;
 *                 preventDefault on a registry-bound Enter
 *                 would interfere with every focused control.
 *
 * Modifier-only keypresses (`Shift` / `Control` / `Alt` /
 * `Meta`) are also rejected — they have no standalone semantic
 * value, and the registry doesn't support modifier combos in
 * this phase (deferred per the archived plan's "Modifier
 * support — deferred" section — `docs/archive/notes/design/
 * keybindings-plan.md`; harvested as work-status item
 * `keybindings-deferred-extensions`).
 *
 * `ContextMenu` and `F1`..`F12` carry browser-default
 * behaviours users typically rely on (right-click menu,
 * DevTools, browser shortcuts); bound to keep the editor's
 * surface predictable.
 */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Escape',
  'Tab',
  'Enter',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'ContextMenu',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function isReservedKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}

// ── Conflict detection ─────────────────────────────────────

/**
 * Find the action in `registry` currently bound to `key` under
 * the present overrides, EXCLUDING `excludeActionId` (so a row
 * can ask "is this key bound to anything OTHER than me?").
 * Returns null when the key is free. First-match wins by
 * registry order — matches the dispatcher's tie-break.
 *
 * The registry is a parameter, not a module import — same
 * registry-as-input posture as the substrate's
 * `validateKeybindingsRegistry`, so this module stays
 * catalog-agnostic. Production call sites (`KeybindingRow.vue`)
 * pass the application catalog.
 */
export function findActionByKey(
  registry: ReadonlyArray<KeybindingActionDecl>,
  key: string,
  excludeActionId: KeybindingActionId | null,
): KeybindingActionDecl | null {
  const overrides = store.profile.settings.keybindings;
  const normalized = normalizeKey(key);
  for (const action of registry) {
    if (action.id === excludeActionId) continue;
    const effective = effectiveKey(action, overrides);
    if (effective === null) continue;
    if (normalizeKey(effective) === normalized) return action;
  }
  return null;
}

// ── Binding mutators ───────────────────────────────────────

/**
 * Write a user override for `actionId`. `key` is the raw event
 * key (or string) the user pressed; it's normalised before
 * storing so the dispatcher's lookup matches. `null` writes
 * an explicit unbind (distinct from absence-of-entry, which
 * means "use the registry default").
 *
 * The reactive write triggers `useUserIORegistry`'s `keyToAction`
 * computed to rebuild — the new binding is live on the next
 * keydown without a remount.
 */
export function setBinding(actionId: KeybindingActionId, key: string | null): void {
  const overrides = store.profile.settings.keybindings;
  overrides[actionId] = key === null ? null : normalizeKey(key);
}

/**
 * Remove the user's override for `actionId` — `effectiveKey()`
 * falls back to the registry default after this runs. No-op
 * if no override exists.
 */
export function resetBinding(actionId: KeybindingActionId): void {
  const overrides = store.profile.settings.keybindings;
  if (actionId in overrides) {
    delete overrides[actionId];
  }
}

/**
 * Wipe every user override — every action returns to its
 * registry default. The Reset-all confirm modal guards this
 * (destructive — loses every customisation).
 */
export function resetAllBindings(): void {
  const overrides = store.profile.settings.keybindings;
  for (const key of Object.keys(overrides) as KeybindingActionId[]) {
    delete overrides[key];
  }
}

/**
 * Whether an override exists for `actionId` — drives the Reset
 * button's `disabled` state. True when the user has set ANY
 * value (specific key or explicit unbind); false when no entry
 * exists and `effectiveKey()` would return the registry default.
 */
export function hasOverride(actionId: KeybindingActionId): boolean {
  return actionId in store.profile.settings.keybindings;
}
