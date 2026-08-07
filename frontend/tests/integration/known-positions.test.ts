/**
 * tests/integration/known-positions.test.ts
 *
 * Coverage for the known-positions state module
 * (`src/state/known-positions.ts`) — the per-user reactive
 * `ContentHash -> CardId` set from card-position-annotations Stage A
 * (`.claude/dispatch-reports/card-position-annotations-design.md`, §3/§6).
 *
 * Pinned behaviours:
 *   - record + lookup round-trips.
 *   - first-seen-wins: a second `recordKnownPosition` call for an
 *     already-known hash does NOT overwrite the original CardId.
 *   - `isKnownPosition` / `knownPositionCount` read the same underlying
 *     map.
 *   - `purgeKnownPositions` clears every entry.
 *
 * The identity-flip WIRING — that `resetWorkspace` actually drives this
 * module's purge via the workspace-reset teardown registry — is pinned
 * separately in `teardown-registry-completeness.test.ts` (the production
 * registration-set guarantee) and `auth-lifecycle.test.ts` (the
 * end-to-end drain-on-401 pin); both were updated in this same change to
 * cover the new `known-positions:purge` handler. This file is deliberately
 * narrower: direct coverage of the module's own read/write/purge contract.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordKnownPosition,
  lookupKnownPosition,
  isKnownPosition,
  purgeKnownPositions,
  knownPositionCount,
} from '../../src/state/known-positions';
import type { CardId, ContentHash } from '../../src/types';

const HASH_A = 'a'.repeat(64) as ContentHash;
const HASH_B = 'b'.repeat(64) as ContentHash;
const CARD_1 = 1 as CardId;
const CARD_2 = 2 as CardId;

beforeEach(() => {
  purgeKnownPositions();
});

describe('known-positions — record / lookup', () => {
  it('lookupKnownPosition returns undefined for an unrecorded hash', () => {
    expect(lookupKnownPosition(HASH_A)).toBeUndefined();
    expect(isKnownPosition(HASH_A)).toBe(false);
  });

  it('records and looks up a position', () => {
    recordKnownPosition(HASH_A, CARD_1);
    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
    expect(isKnownPosition(HASH_A)).toBe(true);
  });

  it('tracks multiple distinct positions independently', () => {
    recordKnownPosition(HASH_A, CARD_1);
    recordKnownPosition(HASH_B, CARD_2);
    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
    expect(lookupKnownPosition(HASH_B)).toBe(CARD_2);
    expect(knownPositionCount()).toBe(2);
  });
});

describe('known-positions — first-seen-wins', () => {
  it('does not overwrite an already-recorded hash with a later CardId', () => {
    // CARD_1 mints first at this position; CARD_2 is a later duplicate
    // mint of the identical content (permitted per the design's §4 —
    // "not a hard block"). The map must keep pointing at the ORIGINAL
    // card, so the mint-dialog warning always names #1, not whichever
    // card happened to be recorded last.
    recordKnownPosition(HASH_A, CARD_1);
    recordKnownPosition(HASH_A, CARD_2);
    expect(lookupKnownPosition(HASH_A)).toBe(CARD_1);
  });
});

describe('known-positions — purge', () => {
  it('purgeKnownPositions clears every recorded entry', () => {
    recordKnownPosition(HASH_A, CARD_1);
    recordKnownPosition(HASH_B, CARD_2);
    expect(knownPositionCount()).toBe(2);

    purgeKnownPositions();

    expect(knownPositionCount()).toBe(0);
    expect(lookupKnownPosition(HASH_A)).toBeUndefined();
    expect(lookupKnownPosition(HASH_B)).toBeUndefined();
  });
});
