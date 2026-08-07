/**
 * src/composables/cards/useKnownPositions.ts
 *
 * Fetch/mutation API over the known-positions state module
 * (`src/state/known-positions.ts`). Mirrors `useThumbnailCache.ts`'s split
 * from `thumbnail-render-resources.ts`: the state module owns the
 * reactive `ContentHash -> CardId` payload and its identity-flip teardown;
 * this composable owns the operations that touch the backend —
 * "what hash would this content produce" (the mint-time duplicate check),
 * "remember the card I just minted" (append-on-mint, so a just-minted
 * card is known immediately without waiting on a re-fetch to populate it
 * via `BackendService.mapToReviewCard`), and "load everything the caller
 * already owns" (`hydrateKnownPositions`, the boot-time bulk fetch below).
 *
 * Card-position-annotations Stage A
 * (`.claude/dispatch-reports/card-position-annotations-design.md`, §6).
 *
 * Known-positions boot-time hydrate
 * (`.claude/dispatch-reports/known-positions-boot-hydrate.md`):
 * `hydrateKnownPositions` closes the regression where the state module
 * filled only incidentally (via `mapToReviewCard` on whatever cards
 * navigation happened to fetch), leaving the game-tree known-position
 * rings and the mint-dialog duplicate warning empty after a fresh SPA
 * start until the user browsed. Wired at auth-readiness by the App
 * bootstrap layer — `useAppBootstrap.ts`'s exported
 * `installKnownPositionsHydrateWatcher`, an auth-state `watch` with
 * `wasAuth`/`isAuth` edge detection (the same auth-readiness-gating
 * shape `ForestDirectory.vue`'s `watch(auth.isAuthenticated, ...,
 * { immediate: true })` uses for its own fetch, though that one lives
 * on a tab component, not the App-bootstrap layer) — not here; this
 * composable only owns the fetch-and-populate operation itself, not
 * *when* it fires.
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

  /**
   * Bulk-populates the known-positions map from `GET /cards/hashes`
   * (`BackendService.fetchKnownPositionHashes`), so the map is complete
   * at auth-readiness rather than filling only as navigation happens to
   * touch cards. Each pair is recorded via `recordKnownPosition`'s
   * first-seen-wins semantics (`src/state/known-positions.ts`'s file
   * header) — calling this more than once (e.g. on re-authentication
   * after a `resetWorkspace` purge) is safe and idempotent-in-effect:
   * a hash already recorded this session is left untouched, and a
   * purged map (identity flip) is empty, so the re-hydrate re-fills it
   * from scratch.
   *
   * ADR-0002 "audible, not fatal": a failure here (network error,
   * backend 5xx) is logged loudly via `console.error` and swallowed —
   * it must not break SPA boot. The known-positions map is a
   * convenience annotation layer (duplicate warnings, tree-node
   * rings), never a blocking dependency for the rest of the app; a
   * failed hydrate just means those annotations stay incomplete until
   * the next successful hydrate (the next re-auth, or ordinary
   * incidental population via `mapToReviewCard` picks up the slack in
   * the meantime).
   */
  async function hydrateKnownPositions(): Promise<void> {
    try {
      const pairs = await backendService.fetchKnownPositionHashes();
      for (const { contentHash, cardId } of pairs) {
        recordKnownPosition(contentHash, cardId);
      }
    } catch (err) {
      console.error(
        '[useKnownPositions] hydrateKnownPositions failed — the known-positions ' +
        'map may be incomplete (duplicate warnings and tree-node rings will ' +
        'under-report) until the next successful hydrate. SPA boot continues.',
        err,
      );
    }
  }

  return {
    checkForDuplicate,
    rememberMintedCard,
    hydrateKnownPositions,
  };
}
