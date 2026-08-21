/**
 * src/state/known-positions.ts
 *
 * Per-user reactive `ContentHash -> CardId` map: the set of positions the
 * caller already owns a card for. Card-position-annotations Stage A (see
 * `.claude/dispatch-reports/card-position-annotations-design.md`, §3
 * "Fetch + freshness" and §6's Stage-A acceptance handle).
 *
 * ── Population: bulk hydrate at auth-readiness, PLUS incidental fill ──────
 * Two population paths, not one:
 *
 *   1. **Bulk hydrate** (`useKnownPositions.hydrateKnownPositions`, wired
 *      at auth-readiness by `useAppBootstrap.ts`'s
 *      `installKnownPositionsHydrateWatcher` — see
 *      `.claude/dispatch-reports/known-positions-boot-hydrate.md`): fetches
 *      every `(content_hash, card_id)` pair the caller owns via
 *      `GET /cards/hashes` (the design's §3 dispatch-flag-#3 option (b),
 *      landed) and records each pair. This is the completeness guarantee —
 *      it runs once per authenticated flip-in (cold-start login AND any
 *      later re-authentication), independent of what the user has actually
 *      navigated to.
 *   2. **Incidental fill** (pre-existing, still active): every card-fetch
 *      path the SPA already drives (`queryForest`, `fetchCard`,
 *      `submitReview`, `updateCardMetadata`) carries `content_hash` on the
 *      wire, so `BackendService.mapToReviewCard` — the ACL boundary every
 *      one of those paths funnels through — calls `recordKnownPosition` for
 *      every card it projects. This still matters even with the bulk
 *      hydrate in place: it's what keeps the map current for a card minted
 *      or fetched *after* the last hydrate, without waiting on the next
 *      auth flip.
 *
 * Mint-time duplicate warnings (`useKnownPositions.ts`) additionally append
 * eagerly on a successful mint, so a just-minted card is known immediately
 * without a re-fetch.
 *
 * ── First-seen-wins ────────────────────────────────────────────────────────
 * `recordKnownPosition` does NOT overwrite an existing entry. If the user
 * has card #1 and later mints a duplicate card #7 off the identical
 * content (permitted — see the design's §4 "not a hard block"), the map
 * keeps pointing at #1: the mint-dialog warning should always name the
 * ORIGINAL card, not whichever fetch happened to land most recently in an
 * unordered response set.
 *
 * ── Tenancy / privacy ──────────────────────────────────────────────────────
 * `CardId` values are per-user (backend tenancy spine, `docs/notes/
 * tenancy.md`); the map holding a prior identity's card ids across an
 * identity flip would be a privacy leak analogous to the raw-CardId
 * collision `clearCardThumbnailCache` (audit pair O10) exists to prevent —
 * so this module registers a `workspace-reset` teardown handler
 * (`known-positions:purge`) rather than relying on GC. See
 * `src/store/teardown-registrations.ts` (bootstrap) and
 * `tests/integration/teardown-registry-completeness.test.ts` (the
 * production-completeness guarantee this registration is pinned by).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import type { CardId, ContentHash } from '../types';
import { registerWorkspaceResetHandler } from '../store/teardown-registry';
// Self-import: a same-module function-declaration export is a live
// binding resolved at the declaration site, so a consumer's
// `vi.spyOn(namespaceObject, 'purgeKnownPositions')` does NOT intercept
// a same-module call written as a bare `purgeKnownPositions()` — the
// external spy patches a different object than the closure's direct
// reference. Routing the registration's `run` callback through this
// self-imported namespace makes the call resolve dynamically through
// the (possibly spied) export, the same way `ledger.purgeAll()` /
// `stabilityTrajectoryStore.purgeAll()` are interceptable because
// they're object-method calls, not bare function references.
import * as self from './known-positions';

// Reactive `ref(Map)`, not a plain module-scope `Map` — mirrors
// `thumbnail-render-resources.ts`'s `snapshotCache`: a consumer reading
// `lookupKnownPosition` inside a `computed` must re-evaluate when a later
// `recordKnownPosition` populates the key it read.
const knownPositions: Ref<Map<ContentHash, CardId>> = ref(new Map<ContentHash, CardId>());

/**
 * Record that `cardId` owns the position hashing to `hash`. First-seen-wins
 * (see file header) — a hash already present is left untouched.
 */
export function recordKnownPosition(hash: ContentHash, cardId: CardId): void {
  if (!knownPositions.value.has(hash)) {
    knownPositions.value.set(hash, cardId);
  }
}

/**
 * The `CardId` that already owns `hash`, or `undefined` if the caller has
 * no card at this position (yet, or ever — the set is incidentally
 * populated, see file header).
 */
export function lookupKnownPosition(hash: ContentHash): CardId | undefined {
  return knownPositions.value.get(hash);
}

/** True iff `hash` is a known duplicate of an already-owned position. */
export function isKnownPosition(hash: ContentHash): boolean {
  return knownPositions.value.has(hash);
}

/**
 * A snapshot Set of every currently-known `ContentHash` — the "known
 * hashes" input the batch card-minting affordance's pure filtering
 * constructor takes (`batch-mint-core.ts::filterUncardedSelection`,
 * commissioner ruling, ledger row 1063: "positions that already have
 * cards must never enter the batch-mint pipeline — filtered by
 * construction"). A SNAPSHOT, not a live reference — the constructor
 * that consumes it is pure (P9): it receives a Set, not a way to keep
 * reading this module's mutable state after the fact. Reflects
 * whatever this module currently holds (bulk-hydrated at
 * auth-readiness, PLUS incidental fill — see file header); the same
 * accepted-cost posture as `isKnownPosition`/`lookupKnownPosition`
 * (a false MISS is possible if hydration hasn't completed or a card
 * was minted in another session; never a false HIT).
 */
export function getKnownPositionHashes(): ReadonlySet<ContentHash> {
  return new Set(knownPositions.value.keys());
}

/** Test-only / identity-flip escape hatch: drop every recorded position. */
export function purgeKnownPositions(): void {
  knownPositions.value.clear();
}

/** Test-only: the number of distinct positions currently recorded. */
export function knownPositionCount(): number {
  return knownPositions.value.size;
}

registerWorkspaceResetHandler({
  label: 'known-positions:purge',
  // Drops every recorded ContentHash -> CardId pair on identity flip — the
  // prior identity's owned-card ids must not leak into the next session's
  // duplicate-warning surface. (Privacy, not memory hygiene — see file
  // header.) Routed through `self` — see the import comment above.
  run: () => self.purgeKnownPositions(),
});
