/**
 * tests/integration/known-positions-boot-hydrate.test.ts
 *
 * Tier-3 coverage for the known-positions boot-time hydrate (the
 * regression fix: "known cards no longer auto-hydrate at SPA start" —
 * see `.claude/dispatch-reports/known-positions-boot-hydrate.md` and
 * the governing design's §3, "Recommend (b)",
 * `.claude/dispatch-reports/card-position-annotations-design.md`).
 *
 * Two things are pinned here:
 *
 *   1. `useKnownPositions().hydrateKnownPositions()` itself — against
 *      the REAL known-positions state module and `fakeBackendService`
 *      (the "fakes at the service boundary, real everywhere else"
 *      Tier-3 shape `frontend/tests/CLAUDE.md` prescribes): a
 *      successful fetch populates the map; a rejected fetch is
 *      swallowed (logged, not thrown) — the ADR-0002 "audible, not
 *      fatal" contract that keeps a hydrate failure from breaking
 *      SPA boot.
 *
 *   2. The auth-flip WIRING CONTRACT `useAppBootstrap.ts` installs —
 *      `watch(() => auth.state.value, (next, prev) => { if
 *      (isAuth && !wasAuth) hydrateKnownPositions() }})` — reproduced
 *      here verbatim against a local, controllable `ref<AuthState>`
 *      rather than by invoking the full `useAppBootstrap` composable.
 *      `useAppBootstrap` pulls in SyncService construction, the
 *      keybindings/knob validators, qEUBO bootstrap, and several other
 *      auth-state watchers with their own network/DOM side effects —
 *      none of which this test wants to fake just to observe one
 *      watcher's edge-triggering. Existing tests exercising a piece of
 *      `useAppBootstrap`'s logic already take this same "call the
 *      underlying pure contract directly, not the composable"
 *      approach (`tests/unit/composables/keybindings-catalog.test.ts`,
 *      `tests/unit/lib/knobs.test.ts`). The watch block under test
 *      here is copied verbatim from `useAppBootstrap.ts`'s "Known-
 *      positions boot-time hydrate" section; a change to that block's
 *      shape should update both together.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, watch, nextTick } from 'vue';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { useKnownPositions } from '../../src/composables/cards/useKnownPositions';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import {
  lookupKnownPosition,
  knownPositionCount,
  purgeKnownPositions,
} from '../../src/state/known-positions';
import type { AuthState } from '../../src/types';
import type { CardId, ContentHash } from '../../src/types';

const HASH_A = 'a'.repeat(64) as ContentHash;
const HASH_B = 'b'.repeat(64) as ContentHash;
const CARD_1 = 1 as CardId;
const CARD_2 = 2 as CardId;

beforeEach(() => {
  resetFakeBackendService();
  purgeKnownPositions();
});

describe('useKnownPositions — hydrateKnownPositions', () => {
  it('populates the map from the bulk fetch', async () => {
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_1 },
      { contentHash: HASH_B, cardId: CARD_2 },
    ]);

    await useKnownPositions().hydrateKnownPositions();

    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
    expect(lookupKnownPosition(HASH_B)).toBe(CARD_2);
    expect(knownPositionCount()).toBe(2);
  });

  it('a hydrate failure is swallowed (logged, not thrown) — boot stays alive', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeBackendService.fetchKnownPositionHashes.mockRejectedValue(new Error('network down'));

    await expect(useKnownPositions().hydrateKnownPositions()).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(knownPositionCount()).toBe(0);

    consoleErrorSpy.mockRestore();
  });

  it('is safe and additive to call twice — first-seen-wins across hydrates', async () => {
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_1 },
    ]);
    await useKnownPositions().hydrateKnownPositions();

    // A second hydrate resolving a DIFFERENT card id for the same hash
    // (e.g. a stale race) must not clobber the first-seen entry.
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_2 },
    ]);
    await useKnownPositions().hydrateKnownPositions();

    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
  });
});

describe('auth-flip wiring contract (useAppBootstrap.ts, "Known-positions boot-time hydrate")', () => {
  // Reproduces useAppBootstrap's watcher verbatim: fires
  // hydrateKnownPositions only on a genuine unauth/unknown -> authenticated
  // EDGE, not on every auth.state mutation (e.g. authenticated ->
  // authenticated with a changed username would NOT re-fire — this is
  // the same edge-detection shape the qEUBO and analysis-persistence
  // watchers in useAppBootstrap.ts already use).
  function wireHydrateOnAuthFlip(authState: ReturnType<typeof ref<AuthState>>) {
    const { hydrateKnownPositions } = useKnownPositions();
    return watch(
      () => authState.value,
      (next, prev) => {
        const wasAuth = prev?.kind === 'authenticated';
        const isAuth = next.kind === 'authenticated';
        if (isAuth && !wasAuth) {
          void hydrateKnownPositions();
        }
      },
    );
  }

  let authState: ReturnType<typeof ref<AuthState>>;
  let stop: () => void;

  beforeEach(() => {
    authState = ref<AuthState>({ kind: 'unknown' });
  });

  afterEach(() => {
    stop?.();
  });

  it('hydrates once the auth state flips into authenticated', async () => {
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_1 },
    ]);
    stop = wireHydrateOnAuthFlip(authState);

    expect(fakeBackendService.fetchKnownPositionHashes).not.toHaveBeenCalled();

    authState.value = { kind: 'authenticated', username: 'alice' };
    await nextTick();
    await vi.waitFor(() => {
      expect(fakeBackendService.fetchKnownPositionHashes).toHaveBeenCalledTimes(1);
    });
    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
  });

  it('does not re-hydrate on an authenticated -> authenticated mutation (no edge)', async () => {
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_1 },
    ]);
    authState = ref<AuthState>({ kind: 'authenticated', username: 'alice' });
    stop = wireHydrateOnAuthFlip(authState);
    await nextTick();

    authState.value = { kind: 'authenticated', username: 'alice', userId: 7 };
    await nextTick();

    expect(fakeBackendService.fetchKnownPositionHashes).not.toHaveBeenCalled();
  });

  it('re-hydrates on re-authentication after a workspace reset purged the map', async () => {
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_A, cardId: CARD_1 },
    ]);
    stop = wireHydrateOnAuthFlip(authState);

    authState.value = { kind: 'authenticated', username: 'alice' };
    await vi.waitFor(() => {
      expect(fakeBackendService.fetchKnownPositionHashes).toHaveBeenCalledTimes(1);
    });
    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);

    // Identity flip: logout drops back to unauthenticated, and the
    // workspace-reset teardown handler (known-positions.ts's own
    // registration, pinned separately in
    // teardown-registry-completeness.test.ts) purges the map — simulated
    // directly here since this test's scope is the re-hydrate half, not
    // the teardown-registry wiring.
    authState.value = { kind: 'unauthenticated' };
    await nextTick();
    purgeKnownPositions();
    expect(knownPositionCount()).toBe(0);

    // Re-authentication (a different identity this time) re-populates —
    // the module must not be left permanently empty after one purge.
    fakeBackendService.fetchKnownPositionHashes.mockResolvedValue([
      { contentHash: HASH_B, cardId: CARD_2 },
    ]);
    authState.value = { kind: 'authenticated', username: 'bob' };
    await vi.waitFor(() => {
      expect(fakeBackendService.fetchKnownPositionHashes).toHaveBeenCalledTimes(2);
    });
    expect(lookupKnownPosition(HASH_B)).toBe(CARD_2);
  });
});
