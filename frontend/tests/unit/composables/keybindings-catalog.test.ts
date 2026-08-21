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
  engineSelectorMode,
  reviewSessionHasCurrentCard,
  reviewSessionCanGoBack,
} from '../../../src/composables/keybindings-catalog';
import { validateKeybindingsRegistry } from '../../../src/lib/keybindings';
import { resetWorkspace, store, addBoard, mutateReviewSession } from '../../../src/store';
import { createInitialBoard } from '../../../src/store/board-factory';
import { mintDialogRequestCount } from '../../../src/composables/useMintDialogSignal';
import { passRequestCount } from '../../../src/composables/board/usePassSignal';
import type { KeybindingActionId, ReviewCard, CardId, EbisuModel } from '../../../src/types';

// Minimal fixture — mirrors `makeStubCard` in
// `tests/unit/composables/autonomous-srs-policies.test.ts`. The
// `reviewSessionHasCurrentCard` predicate only reads
// `currentIndex`/`queue.length` (via `currentCard`), so the card's
// own fields are irrelevant beyond satisfying the type.
function makeStubCard(): ReviewCard {
  const model: EbisuModel = { alpha: 4, beta: 4, t: 1 };
  return {
    id: 1 as CardId,
    canonicalContent: '(;FF[4]GM[1]SZ[19])',
    numMoves: 1,
    model,
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
    gamma: 1.0,
    tags: [],
  };
}

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

  it("'engineSelectorMode' is false when disconnected, even with a selector advertisement", () => {
    store.engine.status = 'disconnected';
    store.engine.info = { ...store.engine.info, capabilities: { selector: {} } as never };
    expect(engineSelectorMode()).toBe(false);
  });

  it("'engineSelectorMode' is false when connected but no capabilities advertised", () => {
    store.engine.status = 'connected';
    store.engine.info = { ...store.engine.info, capabilities: null };
    expect(engineSelectorMode()).toBe(false);
  });

  it("'engineSelectorMode' is false when connected with capabilities but no 'selector' key", () => {
    store.engine.status = 'connected';
    store.engine.info = { ...store.engine.info, capabilities: {} as never };
    expect(engineSelectorMode()).toBe(false);
  });

  it("'engineSelectorMode' is true when connected and 'selector' is advertised", () => {
    store.engine.status = 'connected';
    store.engine.info = { ...store.engine.info, capabilities: { selector: {} } as never };
    expect(engineSelectorMode()).toBe(true);
  });

  it("'reviewSessionHasCurrentCard' is false with no review session for the active board", () => {
    expect(reviewSessionHasCurrentCard()).toBe(false);
  });

  it("'reviewSessionHasCurrentCard' is true once a queue has a card at currentIndex", () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    mutateReviewSession(boardId, (draft) => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [makeStubCard()];
      draft.currentIndex = 0;
    });
    expect(reviewSessionHasCurrentCard()).toBe(true);
  });

  it("'reviewSessionHasCurrentCard' is false once currentIndex runs past the queue (post-nextCard end-of-queue shape)", () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    mutateReviewSession(boardId, (draft) => {
      draft.status = 'FINISHED';
      draft.queue = [makeStubCard()];
      draft.currentIndex = 1; // one past the single-card queue
    });
    expect(reviewSessionHasCurrentCard()).toBe(false);
  });

  // Deck-repeat: `review.prevCard`'s gate. Mirrors
  // `ReviewSessionPanel.vue`'s Back button `:disabled="!canGoBack"`
  // binding (`useReviewSession.ts`'s `canGoBack = currentIndex > 0`).
  it("'reviewSessionCanGoBack' is false at the first queue slot", () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    mutateReviewSession(boardId, (draft) => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [makeStubCard(), makeStubCard()];
      draft.currentIndex = 0;
    });
    expect(reviewSessionCanGoBack()).toBe(false);
  });

  it("'reviewSessionCanGoBack' is true once past the first queue slot", () => {
    const boardId = store.boards[store.activeBoardIndex].id;
    mutateReviewSession(boardId, (draft) => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [makeStubCard(), makeStubCard()];
      draft.currentIndex = 1;
    });
    expect(reviewSessionCanGoBack()).toBe(true);
  });
});

// ── KEYBINDINGS_REGISTRY ship-time smoke ───────────────────

describe('KEYBINDINGS_REGISTRY (ship-time smoke)', () => {
  it('contains the 19 actions ACTIONS catalog declares', () => {
    expect(KEYBINDINGS_REGISTRY.length).toBe(Object.keys(ACTIONS).length);
    expect(KEYBINDINGS_REGISTRY.length).toBe(19);
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
      'board.pass',
      'card.mint',
      'display.toggleMoveNumbers',
      'display.toggleMoveSuggestions',
      'display.toggleOwnershipContinuous',
      'display.toggleOwnershipDots',
      'display.toggleOwnershipLiveness',
      'engine.cycleModel',
      'engine.ponderToggle',
      'engine.swapLastActiveModel',
      'nav.end',
      'nav.home',
      'nav.next',
      'nav.prev',
      'nav.toggleMainLine',
      'nav.variationNext',
      'nav.variationPrev',
      'review.nextCard',
      'review.prevCard',
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

  it('every action id is `<domain>.<verb>` with domain ∈ {nav, display, engine, review, card, board}', () => {
    // KeybindingsView's grouped render assumes this closed set.
    for (const action of KEYBINDINGS_REGISTRY) {
      const [domain] = action.id.split('.');
      expect(['nav', 'display', 'engine', 'review', 'card', 'board']).toContain(domain);
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

  it("'card.mint' handler bumps the mint-dialog request signal (App.vue's watcher entry point)", () => {
    const action = KEYBINDINGS_REGISTRY.find((a) => a.id === ACTIONS.cardMint);
    expect(action).toBeDefined();
    const before = mintDialogRequestCount.value;
    action!.handler();
    expect(mintDialogRequestCount.value).toBe(before + 1);
  });

  // Deck-repeat: `review.prevCard`'s handler is the literal
  // `reviewSession.goBack` reference (same "the button and the
  // hotkey call the same function" idiom as `review.nextCard` /
  // `reviewSession.nextCard` above it) — wiring smoke, not a
  // re-test of `goBack`'s own snapshot-restore behaviour (covered
  // in `useReviewSession-deck-repeat.test.ts`).
  it("'review.prevCard' handler steps currentIndex back via reviewSession.goBack", () => {
    resetWorkspace();
    const boardId = store.boards[store.activeBoardIndex].id;
    mutateReviewSession(boardId, (draft) => {
      draft.status = 'AWAITING_MOVE';
      draft.queue = [makeStubCard(), makeStubCard()];
      draft.currentIndex = 1;
    });
    const action = KEYBINDINGS_REGISTRY.find((a) => a.id === ACTIONS.reviewPrevCard);
    expect(action).toBeDefined();
    action!.handler();
    expect(store.session.reviews[boardId].currentIndex).toBe(0);
  });

  it("'board.pass' handler bumps the pass request signal (App.vue's watcher entry point)", () => {
    const action = KEYBINDINGS_REGISTRY.find((a) => a.id === ACTIONS.boardPass);
    expect(action).toBeDefined();
    expect(action!.defaultKey).toBe('p');
    const before = passRequestCount.value;
    action!.handler();
    expect(passRequestCount.value).toBe(before + 1);
  });
});
