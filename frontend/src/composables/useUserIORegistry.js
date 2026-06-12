/**
 * src/composables/useUserIORegistry.ts
 * Registry-driven keyboard dispatcher.
 *
 * Reads `KEYBINDINGS_REGISTRY` from
 * `src/composables/keybindings-catalog.ts` (resolution and
 * normalisation helpers from the substrate at
 * `src/lib/keybindings.ts`) and dispatches keydown events to the
 * matching action's handler.
 * The map from key string to action is built reactively by
 * resolving each action's `effectiveKey(action, overrides)`
 * against `store.profile.settings.keybindings` — so a user
 * rebinding (Phase 4 UI) immediately reflects without a remount.
 *
 * Per-action `dispatchMode` decides immediate-vs-coalesced firing
 * (rAF coalesce for navigation, synchronous for toggles — same
 * posture perf Fix #1 introduced and the now-removed hardcoded
 * `COALESCED_NAV_KEYS` set tracked). Per-action `enabledWhen` —
 * a catalog-supplied predicate (active-board / engine-connected /
 * always today) — gates dispatch, replacing the prior global
 * `if (!activeBoard.value) return`
 * early-return. `preventDefault` fires for any registry-bound
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
 * Phase 2 of the keybindings arc (per the archived plan,
 * `docs/archive/notes/design/keybindings-plan.md`); all five plan
 * phases have shipped. The 2026-06-10 substrate/catalog split
 * moved the registry itself to the catalog module — this
 * dispatcher is unchanged in behaviour.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store';
import { effectiveKey, normalizeKey, } from '../lib/keybindings';
import { KEYBINDINGS_REGISTRY } from './keybindings-catalog';
import { captureMode } from '../lib/keybindings-capture';
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
        const map = new Map();
        for (const action of KEYBINDINGS_REGISTRY) {
            const key = effectiveKey(action, overrides);
            if (key === null)
                continue;
            const normalized = normalizeKey(key);
            if (!map.has(normalized))
                map.set(normalized, action);
        }
        return map;
    });
    // rAF coalesce state for `dispatchMode: 'coalesced'` actions
    // (navigation). Holds the most-recent pending action; latest-
    // wins per frame. The `enabledWhen` gate runs at schedule time
    // only — the rAF callback deliberately doesn't recheck (see the
    // comment inside the callback). Matches the perf Fix #1 posture.
    let rafId = null;
    let pendingAction = null;
    const handleKeyDown = (e) => {
        // Capture-mode guard: when a KeybindingRow is mid-edit
        // (waiting for the user to press a key to bind), suppress
        // dispatch entirely. The row's own keydown listener records
        // the press; firing the action that key currently maps to
        // would both record the binding AND fire the old action,
        // which is the wrong UX. preventDefault is also intentionally
        // skipped — the row's handler owns the event during capture.
        // See `src/lib/keybindings-capture.ts` for the flag's
        // lifecycle.
        if (captureMode.value !== null)
            return;
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
        if (target instanceof HTMLInputElement)
            return;
        if (target instanceof HTMLTextAreaElement)
            return;
        if (target instanceof HTMLSelectElement)
            return;
        if (target instanceof HTMLElement && target.isContentEditable)
            return;
        const action = keyToAction.value.get(normalizeKey(e.key));
        if (action === undefined)
            return;
        // preventDefault for any registry-bound key — fires even when
        // the action's enabledWhen currently returns false so the
        // SPA stays the authority over claimed keys (e.g., Space
        // stays claimed when engine disconnected; page doesn't
        // scroll). The browser's default-action gate runs before the
        // event-loop returns to us, so this MUST be synchronous and
        // MUST precede any rAF schedule.
        e.preventDefault();
        if (!action.enabledWhen())
            return;
        if (action.dispatchMode === 'coalesced') {
            pendingAction = action;
            if (rafId !== null)
                cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const act = pendingAction;
                pendingAction = null;
                rafId = null;
                // The schedule-time `enabledWhen` check above is the
                // load-bearing gate; the rAF callback doesn't recheck.
                // Every current handler does its own internal
                // context-check where needed (`nav.*` / engine-ponder
                // check `activeBoard.value` internally before mutating;
                // display toggles are state-independent). State changes
                // in the 16.7 ms window between schedule and fire are
                // absorbed by those per-handler checks. Trims one Proxy
                // trap (reactive read) per coalesced dispatch.
                if (act !== null)
                    act.handler();
            });
        }
        else {
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
