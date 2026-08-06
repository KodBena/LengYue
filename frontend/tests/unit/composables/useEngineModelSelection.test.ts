/**
 * tests/unit/composables/useEngineModelSelection.test.ts
 *
 * Tier-1-shaped tests for `src/composables/useEngineModelSelection.ts`:
 * the pure `computeNextModelLabel` cycling derivation (plain inputs,
 * plain outputs — no store), plus the `swapLastActiveModel` /
 * `cycleModel` composable behaviour driven directly against the real
 * reactive `store` (same posture as the existing
 * `keybindings-catalog.test.ts` predicates tier, which mutates
 * `store.engine.*` directly rather than going through a fake — there
 * is no effectful boundary here to fake, `setSelectedModel` is a bare
 * reactive-field mutator).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeNextModelLabel,
  useEngineModelSelection,
} from '../../../src/composables/useEngineModelSelection';
import { resetWorkspace, store, setSelectedModel } from '../../../src/store';

// ── computeNextModelLabel (pure) ────────────────────────────────

describe('computeNextModelLabel', () => {
  const models = [
    { label: 'a', healthy: true },
    { label: 'b', healthy: false },
    { label: 'c', healthy: true },
  ];

  it('returns null for an empty model list', () => {
    expect(computeNextModelLabel([], null)).toBeNull();
  });

  it('returns null when no model is healthy', () => {
    expect(computeNextModelLabel([{ label: 'x', healthy: false }], null)).toBeNull();
  });

  it('starts from the first healthy entry when current is unset', () => {
    expect(computeNextModelLabel(models, null)).toBe('a');
  });

  it('starts from the first healthy entry when current matches no healthy label', () => {
    expect(computeNextModelLabel(models, 'nonexistent')).toBe('a');
  });

  it('advances to the next healthy entry, skipping unhealthy ones', () => {
    expect(computeNextModelLabel(models, 'a')).toBe('c');
  });

  it('wraps from the last healthy entry back to the first', () => {
    expect(computeNextModelLabel(models, 'c')).toBe('a');
  });
});

// ── useEngineModelSelection (store-driven) ──────────────────────

describe('useEngineModelSelection', () => {
  beforeEach(() => {
    resetWorkspace();
    // `resetWorkspace` deliberately does NOT touch `store.engine`
    // (see its docstring / closeBoard's comment on the engine
    // surface surviving the identity-flip) — reset the two fields
    // under test directly so cases don't leak into each other via
    // module-scope store state.
    store.engine.selectedModel = null;
    store.engine.previousSelectedModel = null;
    store.engine.info = {
      ...store.engine.info,
      availableModels: [
        { label: 'strong', healthy: true },
        { label: 'weak', healthy: false },
        { label: 'medium', healthy: true },
      ],
    };
  });

  describe('cycleModel', () => {
    it('advances selectedModel to the next healthy model, wrapping', () => {
      const { cycleModel } = useEngineModelSelection();
      setSelectedModel('strong');

      cycleModel();
      expect(store.engine.selectedModel).toBe('medium');

      cycleModel();
      expect(store.engine.selectedModel).toBe('strong'); // wrapped
    });

    it('is a no-op when no model is healthy', () => {
      store.engine.info = { ...store.engine.info, availableModels: [{ label: 'x', healthy: false }] };
      const { cycleModel } = useEngineModelSelection();
      setSelectedModel(null);

      cycleModel();
      expect(store.engine.selectedModel).toBeNull();
    });
  });

  describe('swapLastActiveModel', () => {
    it('is a no-op when there is no remembered previous selection', () => {
      const { swapLastActiveModel } = useEngineModelSelection();
      expect(store.engine.previousSelectedModel).toBeNull();

      swapLastActiveModel();
      expect(store.engine.selectedModel).toBeNull();
    });

    it('swaps to the previously-selected model after a second distinct selection', () => {
      const { swapLastActiveModel } = useEngineModelSelection();
      setSelectedModel('strong');
      setSelectedModel('medium');
      expect(store.engine.previousSelectedModel).toBe('strong');

      swapLastActiveModel();
      expect(store.engine.selectedModel).toBe('strong');
    });

    it('toggles back and forth between the two most recent selections', () => {
      const { swapLastActiveModel } = useEngineModelSelection();
      setSelectedModel('strong');
      setSelectedModel('medium');

      swapLastActiveModel(); // -> strong
      expect(store.engine.selectedModel).toBe('strong');
      swapLastActiveModel(); // -> medium
      expect(store.engine.selectedModel).toBe('medium');
      swapLastActiveModel(); // -> strong
      expect(store.engine.selectedModel).toBe('strong');
    });

    it('re-selecting the same model is a no-op that does not disturb the previous-selection memory', () => {
      const { swapLastActiveModel } = useEngineModelSelection();
      setSelectedModel('strong');
      setSelectedModel('medium');
      setSelectedModel('medium'); // re-select the already-selected model

      swapLastActiveModel();
      expect(store.engine.selectedModel).toBe('strong');
    });
  });
});
