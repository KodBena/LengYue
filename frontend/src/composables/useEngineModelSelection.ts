/**
 * src/composables/useEngineModelSelection.ts
 * SELECTOR-mode model-selection actions layered over the store's
 * `setSelectedModel` named mutator: cycling through
 * `store.engine.info.availableModels` in order (wrapping, skipping
 * unhealthy entries the same way the Toolbar dropdown disables them),
 * and swapping to the last-active selection.
 *
 * Composable (logic) layer per `frontend/CLAUDE.md`'s layering — the
 * keybindings catalog (`keybindings-catalog.ts`) dispatches here
 * rather than reimplementing selection logic inline in a handler, and
 * a component never calls `setSelectedModel` with derived cycling
 * logic of its own. `computeNextModelLabel` is split out pure (no
 * store read) so it is Tier-1 unit-testable without the store.
 *
 * `store.engine.previousSelectedModel` (mutated inside
 * `setSelectedModel`, `src/store/index.ts` — the sole write site,
 * shared by every caller so the pair stays consistent) is the
 * "last-active" memory `swapLastActiveModel` reads; see that field's
 * doc comment in `src/types/engine.ts` for why it is session-local
 * (not synced through SyncService) rather than a durable preference.
 *
 * License: Public Domain (The Unlicense)
 */

import { store, setSelectedModel } from '../store';
import type { EngineModelEntry } from '../types/engine';

/**
 * Pure derivation: the next healthy model label after `current` in
 * `models` order, wrapping. Unhealthy entries are skipped — mirrors
 * the Toolbar `<select>`'s `:disabled="!entry.healthy"` option, which
 * already prevents a user from picking an unavailable model by hand;
 * the cycle action honours the same constraint rather than landing on
 * a selection the dropdown itself would refuse.
 *
 * Returns `null` when no model is healthy (nothing to cycle to) or
 * `models` is empty. When `current` doesn't match any healthy label
 * (unset, or currently selected model just went unhealthy), starts
 * from the first healthy entry rather than treating that as index -1
 * + 1 = 0 by coincidence — spelled out explicitly so the "no match"
 * case reads as a deliberate choice, not an off-by-one accident.
 */
export function computeNextModelLabel(
  models: ReadonlyArray<Pick<EngineModelEntry, 'label' | 'healthy'>>,
  current: string | null,
): string | null {
  const healthy = models.filter((m) => m.healthy);
  if (healthy.length === 0) return null;
  const idx = healthy.findIndex((m) => m.label === current);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % healthy.length;
  return healthy[nextIdx].label;
}

export function useEngineModelSelection() {
  /**
   * Swap to the model selected immediately before the current one.
   * No-op when there is no remembered previous selection (fresh
   * session, or only one model has ever been picked) — the catalog's
   * `enabledWhen` gate is coarse (engine connected in SELECTOR mode);
   * this internal check is the finer-grained no-op guard, following
   * the same handler-does-its-own-existence-check pattern as
   * `enginePonderToggle` in `keybindings-catalog.ts`.
   */
  const swapLastActiveModel = (): void => {
    const previous = store.engine.previousSelectedModel;
    if (previous === null) return;
    setSelectedModel(previous);
  };

  /** Advance to the next healthy model in `availableModels` order, wrapping. */
  const cycleModel = (): void => {
    const next = computeNextModelLabel(store.engine.info.availableModels, store.engine.selectedModel);
    if (next === null) return;
    setSelectedModel(next);
  };

  return { swapLastActiveModel, cycleModel };
}
