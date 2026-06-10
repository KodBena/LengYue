/**
 * tests/unit/lib/keybindings.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/keybindings.ts` — the
 * generic keybindings substrate: `normalizeKey`, `effectiveKey`,
 * and the registry-parameterized `validateKeybindingsRegistry`
 * exercised over synthetic registries (the substrate is
 * catalog-agnostic; the shipped catalog's own smoke tests live in
 * `tests/unit/composables/keybindings-catalog.test.ts`).
 *
 * No DOM, no fakes, no store.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  effectiveKey,
  normalizeKey,
  validateKeybindingsRegistry,
  type KeybindingActionDecl,
} from '../../../src/lib/keybindings';
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

// ── Synthetic-decl helper ──────────────────────────────────

const mkAction = (overrides: Partial<KeybindingActionDecl> = {}): KeybindingActionDecl => ({
  id: 'test.action' as KeybindingActionId,
  labelKey: 'test.action.label',
  descriptionKey: 'test.action.description',
  defaultKey: 'k',
  dispatchMode: 'immediate',
  enabledWhen: () => true,
  handler: () => {},
  ...overrides,
});

// ── effectiveKey ───────────────────────────────────────────

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

// ── validateKeybindingsRegistry ────────────────────────────
//
// Registry-parameterized (the substrate/catalog split made the
// validator take its registry as input), so the failure branches
// are exercisable with synthetic registries — previously only the
// shipped registry's pass case was testable.

describe('validateKeybindingsRegistry', () => {
  it('passes for an empty registry', () => {
    expect(() => validateKeybindingsRegistry([])).not.toThrow();
  });

  it('passes for a conflict-free registry', () => {
    const registry = [
      mkAction({ id: 'test.a' as KeybindingActionId, defaultKey: 'a' }),
      mkAction({ id: 'test.b' as KeybindingActionId, defaultKey: 'b' }),
    ];
    expect(() => validateKeybindingsRegistry(registry)).not.toThrow();
  });

  it('throws on a duplicate action id', () => {
    const registry = [
      mkAction({ id: 'test.dup' as KeybindingActionId, defaultKey: 'a' }),
      mkAction({ id: 'test.dup' as KeybindingActionId, defaultKey: 'b' }),
    ];
    expect(() => validateKeybindingsRegistry(registry)).toThrow(/duplicate action id: test\.dup/);
  });

  it('throws on a default-key conflict, naming both actions', () => {
    const registry = [
      mkAction({ id: 'test.a' as KeybindingActionId, defaultKey: 'x' }),
      mkAction({ id: 'test.b' as KeybindingActionId, defaultKey: 'x' }),
    ];
    expect(() => validateKeybindingsRegistry(registry)).toThrow(
      /default-key conflict: "x" bound to both test\.a and test\.b/,
    );
  });

  it('does NOT treat multiple null defaultKeys as a conflict (unbound actions coexist)', () => {
    const registry = [
      mkAction({ id: 'test.a' as KeybindingActionId, defaultKey: null }),
      mkAction({ id: 'test.b' as KeybindingActionId, defaultKey: null }),
    ];
    expect(() => validateKeybindingsRegistry(registry)).not.toThrow();
  });
});
