/**
 * tests/integration/useMinting-duplicate-check.test.ts
 *
 * Tier-3 composable-integration coverage for the mint-time
 * duplicate-position check (card-position-annotations Stage A;
 * `.claude/dispatch-reports/card-position-annotations-design.md`, §4
 * "Mint-dialog guard" / §6 Stage-A acceptance handle). Drives
 * `useMinting`'s `checkDuplicate` / `commitMint` against
 * `fakeBackendService` (the `POST /positions/hash` + `POST /cards/`
 * boundaries) and the REAL known-positions state module — the same
 * "fakes at the service boundary, real everywhere else" shape
 * `frontend/tests/CLAUDE.md` prescribes for Tier 3.
 *
 * Pinned behaviours:
 *   - A position whose hash is already recorded in known-positions
 *     surfaces `duplicateCardId` (the mint-dialog warning's data) and
 *     ends in `duplicateCheckStatus === 'checked'`.
 *   - A position whose hash is NOT recorded leaves `duplicateCardId`
 *     null — no false-positive warning (this is the test that would go
 *     RED if the known-positions lookup were removed from
 *     `useKnownPositions.checkForDuplicate`, which is the "remove the
 *     set lookup" red-leg the task names — verified by temporarily
 *     deleting the `lookupKnownPosition(hash) ?? null` line during
 *     authoring; the assertion on `duplicateCardId` fails without it
 *     since `hashPosition` alone would resolve but nothing would ever
 *     null-coalesce false).
 *   - While `hashPosition`'s Promise is unsettled, `duplicateCheckStatus`
 *     reads `'checking'` (C6 posture: in-flight is a distinct state
 *     from "confirmed no duplicate").
 *   - `commitMint` remembers the newly-minted card in known-positions
 *     (state-module refresh on mint), so an immediate second
 *     `checkDuplicate` against the same content finds it without a
 *     server round-trip through `mapToReviewCard`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});

import { useMinting } from '../../src/composables/review/useMinting';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import {
  recordKnownPosition,
  purgeKnownPositions,
  lookupKnownPosition,
} from '../../src/state/known-positions';
import type { CardCreatePayload, CardId, ContentHash } from '../../src/types';

const KNOWN_HASH = 'a'.repeat(64) as ContentHash;
const NOVEL_HASH = 'b'.repeat(64) as ContentHash;
const EXISTING_CARD_ID = 42 as CardId;

beforeEach(() => {
  resetFakeBackendService();
  purgeKnownPositions();
});

describe('useMinting — duplicate-position check', () => {
  it('surfaces the existing card id when the position is already known', async () => {
    recordKnownPosition(KNOWN_HASH, EXISTING_CARD_ID);
    fakeBackendService.hashPosition.mockResolvedValue(KNOWN_HASH);

    const { checkDuplicate, duplicateCardId, duplicateCheckStatus } = useMinting();
    await checkDuplicate('(;FF[4]SZ[19])');

    expect(duplicateCardId.value).toBe(EXISTING_CARD_ID);
    expect(duplicateCheckStatus.value).toBe('checked');
  });

  it('leaves duplicateCardId null for a position not already known', async () => {
    // No recordKnownPosition call for NOVEL_HASH — the known-positions
    // map has nothing under this key.
    fakeBackendService.hashPosition.mockResolvedValue(NOVEL_HASH);

    const { checkDuplicate, duplicateCardId, duplicateCheckStatus } = useMinting();
    await checkDuplicate('(;FF[4]SZ[19];B[pd])');

    expect(duplicateCardId.value).toBeNull();
    expect(duplicateCheckStatus.value).toBe('checked');
  });

  it('reports "checking" while the hash lookup is in flight (C6)', async () => {
    let resolveHash!: (hash: ContentHash) => void;
    fakeBackendService.hashPosition.mockReturnValue(
      new Promise<ContentHash>((resolve) => { resolveHash = resolve; }),
    );

    const { checkDuplicate, duplicateCheckStatus } = useMinting();
    const pending = checkDuplicate('(;FF[4]SZ[19])');

    // The Promise chain inside checkDuplicate sets 'checking' synchronously
    // before awaiting hashPosition — no microtask flush needed to observe it.
    expect(duplicateCheckStatus.value).toBe('checking');

    resolveHash(NOVEL_HASH);
    await pending;

    expect(duplicateCheckStatus.value).toBe('checked');
  });

  it('resetDuplicateCheck returns to idle with no duplicate', async () => {
    recordKnownPosition(KNOWN_HASH, EXISTING_CARD_ID);
    fakeBackendService.hashPosition.mockResolvedValue(KNOWN_HASH);

    const { checkDuplicate, resetDuplicateCheck, duplicateCardId, duplicateCheckStatus } = useMinting();
    await checkDuplicate('(;FF[4]SZ[19])');
    expect(duplicateCardId.value).toBe(EXISTING_CARD_ID);

    resetDuplicateCheck();

    expect(duplicateCardId.value).toBeNull();
    expect(duplicateCheckStatus.value).toBe('idle');
  });
});

describe('useMinting — commitMint remembers the minted card (state-module refresh on mint)', () => {
  it('records the newly-minted card in known-positions without a re-fetch', async () => {
    const NEW_CARD_ID = 99;
    fakeBackendService.createCard.mockResolvedValue(NEW_CARD_ID);
    fakeBackendService.hashPosition.mockResolvedValue(NOVEL_HASH);

    const { commitMint } = useMinting();
    const payload: CardCreatePayload = {
      raw_content: '(;FF[4]SZ[19];B[pd])',
      num_moves: 5,
      tags: [],
      grading_parameter: { data: { default_visits: 1000 } },
      game_metadata: {},
    };

    expect(lookupKnownPosition(NOVEL_HASH)).toBeUndefined();

    const returnedId = await commitMint(payload);

    expect(returnedId).toBe(NEW_CARD_ID);
    expect(lookupKnownPosition(NOVEL_HASH)).toBe(NEW_CARD_ID as unknown as CardId);
  });

  it('a subsequent duplicate check against the just-minted content finds it immediately', async () => {
    fakeBackendService.createCard.mockResolvedValue(7);
    fakeBackendService.hashPosition.mockResolvedValue(NOVEL_HASH);

    const { commitMint, checkDuplicate, duplicateCardId } = useMinting();
    const payload: CardCreatePayload = {
      raw_content: '(;FF[4]SZ[19];B[pd])',
      num_moves: 5,
      tags: [],
      grading_parameter: { data: { default_visits: 1000 } },
      game_metadata: {},
    };
    await commitMint(payload);

    // A second mint attempt from the identical content now finds the
    // one just created, without any additional network fetch through
    // mapToReviewCard.
    await checkDuplicate(payload.raw_content);
    expect(duplicateCardId.value).toBe(7 as unknown as CardId);
  });
});
