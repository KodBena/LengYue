/**
 * tests/unit/lib/keybindings-capture.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/keybindings-capture.ts`
 * — the Phase 4 capture-mode substrate. Covers:
 *
 *   - `RESERVED_KEYS` membership + `isReservedKey` shape.
 *   - `findActionByKey` (default-key lookup, override lookup,
 *     exclude-self semantics, normalization).
 *   - Binding mutators (`setBinding`, `resetBinding`,
 *     `resetAllBindings`, `hasOverride`) over the persisted
 *     `store.profile.settings.keybindings` slot.
 *   - `startCapture` / `cancelCapture` against `captureMode`.
 *
 * `resetWorkspace()` in `beforeEach` clears the store so each
 * test sees the default `keybindings: {}`. `captureMode` is
 * module-scoped and is reset explicitly.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ACTIONS } from '../../../src/lib/keybindings';
import {
  RESERVED_KEYS,
  captureMode,
  cancelCapture,
  findActionByKey,
  hasOverride,
  isReservedKey,
  resetAllBindings,
  resetBinding,
  setBinding,
  startCapture,
} from '../../../src/lib/keybindings-capture';
import { resetWorkspace, store } from '../../../src/store';

beforeEach(() => {
  resetWorkspace();
  cancelCapture();
});

// ── RESERVED_KEYS / isReservedKey ──────────────────────────

describe('RESERVED_KEYS', () => {
  it('contains the three load-bearing UX keys (Escape, Tab, Enter)', () => {
    expect(RESERVED_KEYS.has('Escape')).toBe(true);
    expect(RESERVED_KEYS.has('Tab')).toBe(true);
    expect(RESERVED_KEYS.has('Enter')).toBe(true);
  });

  it('contains all four modifier-only keys (Shift / Control / Alt / Meta)', () => {
    expect(RESERVED_KEYS.has('Shift')).toBe(true);
    expect(RESERVED_KEYS.has('Control')).toBe(true);
    expect(RESERVED_KEYS.has('Alt')).toBe(true);
    expect(RESERVED_KEYS.has('Meta')).toBe(true);
  });

  it('contains ContextMenu and every F-key F1–F12', () => {
    expect(RESERVED_KEYS.has('ContextMenu')).toBe(true);
    for (let i = 1; i <= 12; i++) {
      expect(RESERVED_KEYS.has(`F${i}`)).toBe(true);
    }
  });

  it('does NOT contain letters, digits, space, or arrow keys', () => {
    expect(RESERVED_KEYS.has('a')).toBe(false);
    expect(RESERVED_KEYS.has('m')).toBe(false);
    expect(RESERVED_KEYS.has('1')).toBe(false);
    expect(RESERVED_KEYS.has(' ')).toBe(false);
    expect(RESERVED_KEYS.has('ArrowDown')).toBe(false);
    expect(RESERVED_KEYS.has('ArrowUp')).toBe(false);
    expect(RESERVED_KEYS.has('Home')).toBe(false);
    expect(RESERVED_KEYS.has('End')).toBe(false);
  });
});

describe('isReservedKey', () => {
  it('is true for every member of RESERVED_KEYS', () => {
    for (const key of RESERVED_KEYS) {
      expect(isReservedKey(key)).toBe(true);
    }
  });

  it('is false for non-reserved keys', () => {
    expect(isReservedKey('a')).toBe(false);
    expect(isReservedKey('m')).toBe(false);
    expect(isReservedKey('ArrowDown')).toBe(false);
    expect(isReservedKey(' ')).toBe(false);
  });
});

// ── findActionByKey ────────────────────────────────────────

describe('findActionByKey', () => {
  it('finds an action by its default key when no overrides exist', () => {
    const found = findActionByKey('m', null);
    expect(found?.id).toBe(ACTIONS.displayToggleMoveSuggestions);
  });

  it('finds an action by its overridden key', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    const found = findActionByKey('z', null);
    expect(found?.id).toBe(ACTIONS.displayToggleMoveNumbers);
  });

  it('does NOT find the action whose default key was overridden away', () => {
    // displayToggleMoveNumbers default is 'n'; override to 'z'
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    const found = findActionByKey('n', null);
    expect(found).toBeNull();
  });

  it('does NOT find an action whose effective key is null (unbound)', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, null);
    const found = findActionByKey('n', null);
    expect(found).toBeNull();
  });

  it('excludes the named action id (self-bind is not a conflict)', () => {
    // navNext defaults to ArrowDown; searching for ArrowDown
    // while excluding navNext should return null.
    const found = findActionByKey('ArrowDown', ACTIONS.navNext);
    expect(found).toBeNull();
  });

  it('normalizes the search key (uppercase letter finds lowercase binding)', () => {
    // displayToggleMoveSuggestions defaults to 'm'; searching
    // for 'M' should match.
    const found = findActionByKey('M', null);
    expect(found?.id).toBe(ACTIONS.displayToggleMoveSuggestions);
  });

  it('returns null when the key is bound to no action', () => {
    const found = findActionByKey('z', null);
    expect(found).toBeNull();
  });
});

// ── Binding mutators ──────────────────────────────────────

describe('setBinding', () => {
  it('writes a string override under the action id', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    expect(store.profile.settings.keybindings[ACTIONS.displayToggleMoveNumbers]).toBe('z');
  });

  it('normalises uppercase letter keys to lowercase before storing', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'Z');
    expect(store.profile.settings.keybindings[ACTIONS.displayToggleMoveNumbers]).toBe('z');
  });

  it('preserves multi-char keys unchanged', () => {
    setBinding(ACTIONS.navNext, 'ArrowDown');
    expect(store.profile.settings.keybindings[ACTIONS.navNext]).toBe('ArrowDown');
  });

  it('writes explicit null (user unbind) when key argument is null', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, null);
    expect(store.profile.settings.keybindings[ACTIONS.displayToggleMoveNumbers]).toBeNull();
    // The entry exists (hasOverride is true), value is null —
    // distinct from absence-of-entry.
    expect(ACTIONS.displayToggleMoveNumbers in store.profile.settings.keybindings).toBe(true);
  });

  it('overwrites a prior override', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    setBinding(ACTIONS.displayToggleMoveNumbers, 'x');
    expect(store.profile.settings.keybindings[ACTIONS.displayToggleMoveNumbers]).toBe('x');
  });
});

describe('resetBinding', () => {
  it('removes the override entry for the named action', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    resetBinding(ACTIONS.displayToggleMoveNumbers);
    expect(ACTIONS.displayToggleMoveNumbers in store.profile.settings.keybindings).toBe(false);
  });

  it('no-ops when no override exists', () => {
    expect(() => resetBinding(ACTIONS.displayToggleMoveNumbers)).not.toThrow();
    expect(ACTIONS.displayToggleMoveNumbers in store.profile.settings.keybindings).toBe(false);
  });

  it('does not affect other actions overrides', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    setBinding(ACTIONS.displayToggleMoveSuggestions, 'x');
    resetBinding(ACTIONS.displayToggleMoveNumbers);
    expect(store.profile.settings.keybindings[ACTIONS.displayToggleMoveSuggestions]).toBe('x');
  });
});

describe('resetAllBindings', () => {
  it('clears every override', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    setBinding(ACTIONS.displayToggleMoveSuggestions, 'x');
    setBinding(ACTIONS.navNext, null);
    resetAllBindings();
    expect(Object.keys(store.profile.settings.keybindings)).toHaveLength(0);
  });

  it('no-ops on an empty overrides map', () => {
    expect(() => resetAllBindings()).not.toThrow();
    expect(Object.keys(store.profile.settings.keybindings)).toHaveLength(0);
  });
});

describe('hasOverride', () => {
  it('returns false when no entry exists', () => {
    expect(hasOverride(ACTIONS.displayToggleMoveNumbers)).toBe(false);
  });

  it('returns true when entry is a key string', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    expect(hasOverride(ACTIONS.displayToggleMoveNumbers)).toBe(true);
  });

  it('returns true when entry is explicit null (user unbind)', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, null);
    expect(hasOverride(ACTIONS.displayToggleMoveNumbers)).toBe(true);
  });

  it('returns false after resetBinding clears the entry', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    resetBinding(ACTIONS.displayToggleMoveNumbers);
    expect(hasOverride(ACTIONS.displayToggleMoveNumbers)).toBe(false);
  });
});

// ── captureMode / startCapture / cancelCapture ────────────

describe('captureMode lifecycle', () => {
  it('starts at null after cancelCapture (beforeEach reset)', () => {
    expect(captureMode.value).toBeNull();
  });

  it('startCapture sets captureMode to the action id', () => {
    startCapture(ACTIONS.navNext);
    expect(captureMode.value).toBe(ACTIONS.navNext);
  });

  it('startCapture twice with different ids replaces the prior mode', () => {
    startCapture(ACTIONS.navNext);
    startCapture(ACTIONS.displayToggleMoveNumbers);
    expect(captureMode.value).toBe(ACTIONS.displayToggleMoveNumbers);
  });

  it('cancelCapture clears the mode', () => {
    startCapture(ACTIONS.navNext);
    cancelCapture();
    expect(captureMode.value).toBeNull();
  });

  it('cancelCapture is idempotent', () => {
    cancelCapture();
    cancelCapture();
    expect(captureMode.value).toBeNull();
  });
});
