/**
 * src/composables/cards/useKnownPositions.ts
 *
 * Fetch/mutation API over the known-positions state module
 * (`src/state/known-positions.ts`). Mirrors `useThumbnailCache.ts`'s split
 * from `thumbnail-render-resources.ts`: the state module owns the
 * reactive `ContentHash -> CardId` payload and its identity-flip teardown;
 * this composable owns the two operations that touch the backend —
 * "what hash would this content produce" (the mint-time duplicate check)
 * and "remember the card I just minted" (append-on-mint, so a just-minted
 * card is known immediately without waiting on a re-fetch to populate it
 * via `BackendService.mapToReviewCard`).
 *
 * Card-position-annotations Stage A
 * (`.claude/dispatch-reports/card-position-annotations-design.md`, §6).
 *
 * License: Public Domain (The Unlicense)
 */

import { backendService } from '../../services/backend-service';
import {
  lookupKnownPosition,
  recordKnownPosition,
} from '../../state/known-positions';
import type { CardId, ContentHash } from '../../types';

export function useKnownPositions() {
  /**
   * Hash `rawContent` via the stateless `POST /positions/hash` endpoint
   * and look the result up in the known-positions map.
   *
   * Returns the `CardId` of the existing card at this position, or
   * `null` if `rawContent` normalizes to a position the caller doesn't
   * already own a card for. Does NOT mint, persist, or otherwise mutate
   * anything server-side — `hashPosition` is stateless (see
   * `backend/api/routes/positions.py`'s module docstring).
   *
   * Callers render the in-flight period as "checking" (C6: a lookup in
   * flight is not the same UI state as "confirmed no duplicate") — the
   * returned Promise not having settled yet IS that in-flight signal;
   * this function carries no separate loading flag itself, so the caller
   * (`useMinting`) is the one place a "checking" state needs to exist,
   * and it already awaits this Promise.
   */
  async function checkForDuplicate(rawContent: string): Promise<CardId | null> {
    const hash: ContentHash = await backendService.hashPosition(rawContent);
    return lookupKnownPosition(hash) ?? null;
  }

  /**
   * Record a just-minted card in the known-positions map without a
   * round-trip re-fetch. `commitMint` already has both the raw content
   * (the draft's `raw_content`) and the freshly-minted `cardId`; hashing
   * happens locally via a second `hashPosition` call (cheap — the
   * backend's per-call cost is a single parse + SHA-256, sub-millisecond
   * per the design's §5) rather than re-fetching the full card.
   */
  async function rememberMintedCard(rawContent: string, cardId: CardId): Promise<void> {
    const hash: ContentHash = await backendService.hashPosition(rawContent);
    recordKnownPosition(hash, cardId);
  }

  return {
    checkForDuplicate,
    rememberMintedCard,
  };
}
