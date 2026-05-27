/**
 * tests/unit/lib/keybindings.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/keybindings.ts` — the
 * registry substrate's pure helpers (`normalizeKey`,
 * `effectiveKey`, `isActionEnabled`) plus a ship-time smoke
 * check on `KEYBINDINGS_REGISTRY` itself and its validator.
 *
 * No DOM, no fakes. `isActionEnabled` reads the reactive store
 * directly (the dispatcher calls it from a window keydown
 * handler against the live store); these tests mutate the store
 * in `beforeEach` to set up the reactive precondition the unit
 * is reading.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  KEYBINDINGS_REGISTRY,
  ACTIONS,
  effectiveKey,
  isActionEnabled,
  normalizeKey,
  validateKeybindingsRegistry,
  type KeybindingActionDecl,
  type KeybindingEnabledWhen,
} from '../../../src/lib/keybindings';
import { resetWorkspace, store, addBoard } from '../../../src/store';
import { createInitialBoard } from '../../../src/store/board-factory';
import type { KeybindingActionId } from '../../../src/types';

// ── normalizeKey ───────────────────────────────────────────

describe('normalizeKey', () => {
  it('lowercases a single uppercase letter', () => {
    expect(normalizeKey('M')).toBe('m');
    expect(normalizeKey('A')).toBe('a');
    expect(normalizeKey('Z')).toBe('z');
  });

  it('preserves a single lowercase letter', () => {
    expect(normalizeKey('m')).toBe('m');
    expect(normalizeKey('a')).toBe('a');
  });

  it('preserves multi-character key names unchanged', () => {
    expect(normalizeKey('ArrowDown')).toBe('ArrowDown');
    expect(normalizeKey('ArrowUp')).toBe('ArrowUp');
    expect(normalizeKey('Home')).toBe('Home');
    expect(normalizeKey('Escape')).toBe('Escape');
    expect(normalizeKey('F5')).toBe('F5');
  });

  it('preserves space (single char, not a letter) unchanged', () => {
    expect(normalizeKey(' ')).toBe(' ');
  });

  it('preserves a single digit unchanged', () => {
    expect(normalizeKey('1')).toBe('1');
    expect(normalizeKey('9')).toBe('9');
  });

  it('preserves a single punctuation character unchanged', () => {
    expect(normalizeKey('/')).toBe('/');
    expect(normalizeKey(';')).toBe(';');
  });

  it('preserves the empty string unchanged', () => {
    expect(normalizeKey('')).toBe('');
  });
});

// ── effectiveKey ───────────────────────────────────────────

const mkAction = (overrides: Partial<KeybindingActionDecl> = {}): KeybindingActionDecl => ({
  id: 'test.action' as KeybindingActionId,
  labelKey: 'test.action.label',
  descriptionKey: 'test.action.description',
  defaultKey: 'k',
  dispatchMode: 'immediate',
  enabledWhen: 'always',
  handler: () => {},
  ...overrides,
});

describe('effectiveKey', () => {
  it('returns the default when no override entry exists', () => {
    const action = mkAction({ defaultKey: 'k' });
    expect(effectiveKey(action, {})).toBe('k');
  });

  it('returns the override value when an entry exists with a string', () => {
    const action = mkAction({
      id: 'test.foo' as KeybindingActionId,
      defaultKey: 'k',
    });
    expect(effectiveKey(action, { ['test.foo' as KeybindingActionId]: 'x' })).toBe('x');
  });

  it('returns null when override entry is explicit null (user unbind)', () => {
    const action = mkAction({
      id: 'test.foo' as KeybindingActionId,
      defaultKey: 'k',
    });
    expect(effectiveKey(action, { ['test.foo' as KeybindingActionId]: null })).toBeNull();
  });

  it('returns null for an action with null default and no override', () => {
    const action = mkAction({ defaultKey: null });
    expect(effectiveKey(action, {})).toBeNull();
  });

  it('returns override value for an action whose default is null', () => {
    const action = mkAction({
      id: 'test.foo' as KeybindingActionId,
      defaultKey: null,
    });
    expect(effectiveKey(action, { ['test.foo' as KeybindingActionId]: 'x' })).toBe('x');
  });

  it('distinguishes absence-of-entry from explicit-null entry', () => {
    const action = mkAction({
      id: 'test.foo' as KeybindingActionId,
      defaultKey: 'k',
    });
    // absent → default
    expect(effectiveKey(action, {})).toBe('k');
    // null → explicit unbind
    expect(effectiveKey(action, { ['test.foo' as KeybindingActionId]: null })).toBeNull();
  });
});

// ── isActionEnabled ────────────────────────────────────────

describe('isActionEnabled', () => {
  beforeEach(() => {
    // resetWorkspace seeds a default board (`store.boards =
    // [createInitialBoard()]`), so the post-reset state has an
    // active board. Tests below that want the no-board state
    // explicitly empty `store.boards`.
    resetWorkspace();
  });

  const mk = (enabledWhen: KeybindingEnabledWhen): KeybindingActionDecl =>
    mkAction({ enabledWhen });

  it("'always' is true regardless of store state", () => {
    expect(isActionEnabled(mk('always'))).toBe(true);
    addBoard(createInitialBoard());
    expect(isActionEnabled(mk('always'))).toBe(true);
  });

  it("'activeBoardExists' is false when no boards", () => {
    store.boards = [];
    expect(isActionEnabled(mk('activeBoardExists'))).toBe(false);
  });

  it("'activeBoardExists' is true when a board is active", () => {
    // resetWorkspace already seeded one — assertion verifies the
    // post-reset shape composes with the predicate.
    expect(isActionEnabled(mk('activeBoardExists'))).toBe(true);
  });

  it("'engineConnected' is false when engine is disconnected", () => {
    store.engine.status = 'disconnected';
    expect(isActionEnabled(mk('engineConnected'))).toBe(false);
  });

  it("'engineConnected' is false when engine is connecting", () => {
    store.engine.status = 'connecting';
    expect(isActionEnabled(mk('engineConnected'))).toBe(false);
  });

  it("'engineConnected' is true when engine is connected", () => {
    store.engine.status = 'connected';
    expect(isActionEnabled(mk('engineConnected'))).toBe(true);
  });
});

// ── KEYBINDINGS_REGISTRY ship-time smoke ───────────────────

describe('KEYBINDINGS_REGISTRY (ship-time smoke)', () => {
  it('contains the 12 actions ACTIONS catalog declares', () => {
    expect(KEYBINDINGS_REGISTRY.length).toBe(Object.keys(ACTIONS).length);
    expect(KEYBINDINGS_REGISTRY.length).toBe(12);
  });

  it('every action id is unique', () => {
    const ids = KEYBINDINGS_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every action id matches a declared ACTIONS entry', () => {
    const declared = new Set<KeybindingActionId>(Object.values(ACTIONS));
    for (const action of KEYBINDINGS_REGISTRY) {
      expect(declared.has(action.id)).toBe(true);
    }
  });

  it('no two actions share a default key', () => {
    const seen = new Map<string, KeybindingActionId>();
    for (const action of KEYBINDINGS_REGISTRY) {
      if (action.defaultKey === null) continue;
      const prior = seen.get(action.defaultKey);
      expect(prior).toBeUndefined();
      seen.set(action.defaultKey, action.id);
    }
  });

  it('every action references an existing i18n key prefix shape', () => {
    // The i18n catalog's actual presence is verified at runtime
    // by vue-i18n's missingWarn; here we pin the key-shape
    // convention so a future declaration without a matching label
    // pair fails the smoke test loudly.
    for (const action of KEYBINDINGS_REGISTRY) {
      expect(action.labelKey).toMatch(/^keybindings\.action\.[a-zA-Z]+\.label$/);
      expect(action.descriptionKey).toMatch(/^keybindings\.action\.[a-zA-Z]+\.description$/);
    }
  });

  it('every action id is `<domain>.<verb>` with domain ∈ {nav, display, engine}', () => {
    // KeybindingsView's grouped render assumes this closed set.
    for (const action of KEYBINDINGS_REGISTRY) {
      const [domain] = action.id.split('.');
      expect(['nav', 'display', 'engine']).toContain(domain);
    }
  });

  it('coalesced dispatchMode is reserved for nav actions; immediate is used elsewhere', () => {
    // The plan's invariant: rAF-coalesce only for sustained-input
    // (nav) actions; toggles and engine controls dispatch
    // immediately.
    for (const action of KEYBINDINGS_REGISTRY) {
      const [domain] = action.id.split('.');
      if (domain === 'nav') {
        expect(action.dispatchMode).toBe('coalesced');
      } else {
        expect(action.dispatchMode).toBe('immediate');
      }
    }
  });
});

describe('validateKeybindingsRegistry', () => {
  it('passes for the shipped registry', () => {
    expect(() => validateKeybindingsRegistry()).not.toThrow();
  });
});
