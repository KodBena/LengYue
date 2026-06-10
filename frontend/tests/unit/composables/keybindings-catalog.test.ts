/**
 * tests/unit/composables/keybindings-catalog.test.ts
 *
 * Tier-1 tests for `src/composables/keybindings-catalog.ts` —
 * the application's action catalog. Ship-time smoke checks over
 * `KEYBINDINGS_REGISTRY` / `ACTIONS` (moved here from the
 * substrate's test file when the substrate/catalog split landed),
 * the named `enabledWhen` predicates, and the persisted-id pin.
 *
 * The predicates read the reactive store directly (the dispatcher
 * calls them from a window keydown handler against the live
 * store); those tests mutate the store in `beforeEach` to set up
 * the reactive precondition under read.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIONS,
  KEYBINDINGS_REGISTRY,
  always,
  activeBoardExists,
  engineConnected,
} from '../../../src/composables/keybindings-catalog';
import { validateKeybindingsRegistry } from '../../../src/lib/keybindings';
import { resetWorkspace, store, addBoard } from '../../../src/store';
import { createInitialBoard } from '../../../src/store/board-factory';
import type { KeybindingActionId } from '../../../src/types';

// ── enabledWhen predicates ─────────────────────────────────

describe('enabledWhen predicates', () => {
  beforeEach(() => {
    // resetWorkspace seeds a default board (`store.boards =
    // [createInitialBoard()]`), so the post-reset state has an
    // active board. Tests below that want the no-board state
    // explicitly empty `store.boards`.
    resetWorkspace();
  });

  it("'always' is true regardless of store state", () => {
    expect(always()).toBe(true);
    addBoard(createInitialBoard());
    expect(always()).toBe(true);
  });

  it("'activeBoardExists' is false when no boards", () => {
    store.boards = [];
    expect(activeBoardExists()).toBe(false);
  });

  it("'activeBoardExists' is true when a board is active", () => {
    // resetWorkspace already seeded one — assertion verifies the
    // post-reset shape composes with the predicate.
    expect(activeBoardExists()).toBe(true);
  });

  it("'engineConnected' is false when engine is disconnected", () => {
    store.engine.status = 'disconnected';
    expect(engineConnected()).toBe(false);
  });

  it("'engineConnected' is false when engine is connecting", () => {
    store.engine.status = 'connecting';
    expect(engineConnected()).toBe(false);
  });

  it("'engineConnected' is true when engine is connected", () => {
    store.engine.status = 'connected';
    expect(engineConnected()).toBe(true);
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

  it('action id strings are pinned to their persisted literals (the contract with saved overrides — never rename)', () => {
    // `store.profile.settings.keybindings` is keyed by these exact
    // strings in users' persisted blobs (roaming via SyncService).
    // A failure here means a code change broke every saved binding
    // for the renamed action; retire-and-add with a migration
    // instead. See the catalog header's persisted-id contract.
    const ids = KEYBINDINGS_REGISTRY.map((a) => a.id as string).sort();
    expect(ids).toEqual([
      'display.toggleMoveNumbers',
      'display.toggleMoveSuggestions',
      'display.toggleOwnershipContinuous',
      'display.toggleOwnershipDots',
      'display.toggleOwnershipLiveness',
      'engine.ponderToggle',
      'nav.end',
      'nav.home',
      'nav.next',
      'nav.prev',
      'nav.variationNext',
      'nav.variationPrev',
    ]);
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

  it('passes the substrate validator (the same call useAppBootstrap makes at ship time)', () => {
    expect(() => validateKeybindingsRegistry(KEYBINDINGS_REGISTRY)).not.toThrow();
  });
});
