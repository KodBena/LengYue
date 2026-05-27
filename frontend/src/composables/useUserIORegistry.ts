/**
 * src/composables/useUserIORegistry.ts
 * Registry-driven keyboard dispatcher.
 *
 * Reads `KEYBINDINGS_REGISTRY` from `src/lib/keybindings.ts` and
 * dispatches keydown events to the matching action's handler.
 * The map from key string to action is built reactively by
 * resolving each action's `effectiveKey(action, overrides)`
 * against `store.profile.settings.keybindings` — so a user
 * rebinding (Phase 4 UI) immediately reflects without a remount.
 *
 * Per-action `dispatchMode` decides immediate-vs-coalesced firing
 * (rAF coalesce for navigation, synchronous for toggles — same
 * posture perf Fix #1 introduced and the now-removed hardcoded
 * `COALESCED_NAV_KEYS` set tracked). Per-action `enabledWhen`
 * gates dispatch (active-board / engine-connected / always —
 * replaces the prior global `if (!activeBoard.value) return`
 * early-return). `preventDefault` fires for any registry-bound
 * key regardless of `enabledWhen` so a key the SPA owns doesn't
 * silently fall through to the browser default when its action
 * happens to be currently disabled (e.g., Space when the engine
 * is disconnected stays "claimed" — the page doesn't scroll).
 *
 * Letter-key normalisation: lookup keys are lowercased so a
 * default binding to `m` matches both `m` (no shift) and `M`
 * (shift held). The registry's `defaultKey` strings are already
 * lowercase; the lookup-side `.toLowerCase()` handles the
 * shift-variant `event.key`.
 *
 * Phase 2 of the keybindings arc (per
 * `docs/notes/keybindings-plan.md`). Phase 1 added the registry;
 * this commit makes the dispatcher consume it. Phase 3 adds the
 * Settings sub-tab + read-only Keybindings view; Phase 4 adds
 * the Edit / Reset / Unbind UI.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store';
import {
  KEYBINDINGS_REGISTRY,
  effectiveKey,
  isActionEnabled,
  type KeybindingActionDecl,
} from '../lib/keybindings';

/**
 * Letter keys (A–Z / a–z) normalise to lowercase for both
 * registration and lookup, so a binding to `m` triggers on
 * `event.key === 'm'` AND `event.key === 'M'` (Shift held).
 * Non-letter keys (Arrow*, Home, End, ' ', etc.) pass through
 * unchanged.
 */
function normalizeKey(key: string): string {
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) return key.toLowerCase();
  return key;
}

export function useUserIORegistry() {
  // Reactive key→action map. Recomputes when `store.profile.settings.keybindings`
  // changes (user rebinding via the Phase 4 editor); the registry
  // itself is module-static so its iteration is stable.
  //
  // Conflict resolution: first-wins by `KEYBINDINGS_REGISTRY`
  // registration order. The `validateKeybindingsRegistry`
  // call in `useAppBootstrap` already rejects default-key
  // conflicts at ship time; user-set conflicts are surfaced by
  // the Phase 4 editor before they're persisted.
  const keyToAction = computed(() => {
    const overrides = store.profile.settings.keybindings;
    const map = new Map<string, KeybindingActionDecl>();
    for (const action of KEYBINDINGS_REGISTRY) {
      const key = effectiveKey(action, overrides);
      if (key === null) continue;
      const normalized = normalizeKey(key);
      if (!map.has(normalized)) map.set(normalized, action);
    }
    return map;
  });

  // rAF coalesce state for `dispatchMode: 'coalesced'` actions
  // (navigation). Holds the most-recent pending action; latest-
  // wins per frame. Re-checks `isActionEnabled` at rAF fire time
  // so a state change between schedule and fire (rare) drops the
  // dispatch cleanly. Matches the perf Fix #1 posture.
  let rafId: number | null = null;
  let pendingAction: KeybindingActionDecl | null = null;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Context Guard: ignore hardware events when user is typing.
    //
    // The form-control branches (HTMLInputElement, HTMLTextAreaElement,
    // HTMLSelectElement) cover native widgets that own their own
    // keystrokes. The contenteditable branch covers rich-text editing
    // surfaces — most importantly CodeMirror 6's `.cm-content` div used
    // by PaletteEditor and CardSetEditor, which the textarea check
    // misses because the editable surface is a contenteditable div.
    // `HTMLElement.isContentEditable` already accounts for inheritance,
    // so a single check on `e.target` covers any nested element inside
    // an editable region.
    const target = e.target;
    if (target instanceof HTMLInputElement) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;

    const action = keyToAction.value.get(normalizeKey(e.key));
    if (action === undefined) return;

    // preventDefault for any registry-bound key — fires even when
    // the action's enabledWhen currently returns false so the
    // SPA stays the authority over claimed keys (e.g., Space
    // stays claimed when engine disconnected; page doesn't
    // scroll). The browser's default-action gate runs before the
    // event-loop returns to us, so this MUST be synchronous and
    // MUST precede any rAF schedule.
    e.preventDefault();

    if (!isActionEnabled(action)) return;

    if (action.dispatchMode === 'coalesced') {
      pendingAction = action;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const act = pendingAction;
        pendingAction = null;
        rafId = null;
        if (act !== null && isActionEnabled(act)) act.handler();
      });
    } else {
      action.handler();
    }
  };

  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    // Drop any pending coalesced action queued by the last
    // keydown — a rAF callback firing after listener removal
    // would execute against teardown state. Pair with the
    // `requestAnimationFrame` schedule in the handler above.
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pendingAction = null;
    }
  });
}
