/**
 * src/services/ebisu-service.ts
 * Anti-Corruption Layer for the Ebisu REST Backend.
 * License: Public Domain (The Unlicense)
 */

import { api } from './api-client';
import type { CardId, ReviewCard, CardSet, CardCreatePayload, ForestStat, TagStat } from '../types';
import type { components } from '../types/backend';

// ─── Wire-type aliases (the ACL boundary) ────────────────────────────────────
// These names describe what the backend sends, not what the app speaks in.
// The rest of the app consumes domain types from `../types`; the translation
// happens in `mapToReviewCard` below. Do not leak these types outside this
// file — if a component imports `CardFromWire`, that's an ACL leak.
//
// Backend renamed `CardResponse` → `CardWithRecall` as part of item 30a.
// The new name makes explicit what the shape actually is: a card augmented
// with its current Bayesian recall projection. Adopted here with no loss.
type CardFromWire = components['schemas']['CardWithRecall'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely reads a value from `grading_parameter.data.<key>` on a wire-shaped
 * card.
 *
 * The generated type describes `grading_parameter` as a generic JSON blob
 * (`{[key: string]: unknown} | null`) because Pydantic serializes it
 * opaquely — the backend's grading-config subtypes are domain-specific
 * (KataGo visits, palette, gamma, etc.) and intentionally not captured in
 * the OpenAPI schema. From the OpenAPI consumer's perspective, the inner
 * shape is unknown.
 *
 * This helper performs the minimal runtime narrowing needed to reach
 * `.data.<key>` safely, returning `undefined` on any structural mismatch
 * (missing field, `null`, `data` not an object, etc.). The caller asserts
 * the expected type via the generic parameter; this is the single
 * unavoidable type-unsafe point in the ACL, localized here so consumers
 * don't need to sprinkle `as any` throughout.
 *
 * If the backend ever publishes a typed schema for `grading_parameter`,
 * this helper can be deleted and the access sites can read the field
 * directly through the generated types.
 */
function readGradingParam<T>(
  gradingParam: CardFromWire['grading_parameter'],
  key: string
): T | undefined {
  if (!gradingParam || typeof gradingParam !== 'object') return undefined;
  const data = (gradingParam as Record<string, unknown>)['data'];
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[key];
  return value as T | undefined;
}

export class EbisuService {

  private warnedAboutMissingParentId = false;

  /**
   * Translates the backend's wire shape into our strict domain type.
   * Isolates the frontend from backend schema changes and snake_case.
   *
   * ─── Typed ACL (items 29 + 30) ────────────────────────────────────────────
   * `raw` is now typed as `components['schemas']['CardWithRecall']` (via the
   * `CardFromWire` alias). TypeScript will flag any property access that
   * disagrees with the backend's OpenAPI-published contract, at compile time.
   * A backend field rename becomes a compile error at exactly the sites that
   * need updating — which is the whole point.
   *
   * One side effect of typing: the pre-34b `raw.sgf` fallback leg is gone.
   * `CardWithRecall` doesn't have an `sgf` field (backend rejects it on
   * input post-Commit-3 and never emits it on output), so the access was
   * dead code that the compiler now rejects. Removing a dead fallback is
   * not a behavior change; it's the compiler enforcing what was already
   * true.
   *
   * ─── 34b wire rename — fallback chains (remaining) ────────────────────────
   * Two defensive legs remain:
   *
   *   sgf:           raw.canonical_content ?? raw.normalized_sgf
   *   defaultVisits: readGradingParam<number>(raw.grading_parameter, 'default_visits')
   *                  ?? raw.default_visits
   *                  ?? 1000
   *
   * The middle legs (`normalized_sgf`, top-level `default_visits`) are the
   * backend's stale-bundle compat shims, marked `readonly` in the generated
   * type. They survive until backend's Commit 3b removes them; see TODO
   * item 34b-cleanup for the eventual simplification.
   * ──────────────────────────────────────────────────────────────────────────
   */
  private mapToReviewCard(raw: CardFromWire): ReviewCard {
    // DIAGNOSTIC: under the typed contract, `card_source_id` is
    // `number | null | undefined`. `null` is the normal case for root
    // cards (no parent); `undefined` would mean the backend emitted a
    // response without the key at all, which is a schema regression.
    // We warn on the latter and suppress subsequent identical warnings.
    if (!this.warnedAboutMissingParentId && raw.card_source_id === undefined) {
      console.warn(
        `[EbisuService] API Response missing 'card_source_id' field (key absent, not null). ` +
        `Wire contract expects it to always be present as number | null. ` +
        `Lineage Tree linking will not work until the backend schema is fixed.`
      );
      this.warnedAboutMissingParentId = true;
    }

    return {
      id: raw.id as CardId,
      // canonical_content is the new domain-neutral name. normalized_sgf is
      // the stale-bundle shim (both are required strings under the current
      // wire contract; the `??` is defensive against a hypothetical pre-34b
      // backend and will be dropped by TODO item 34b-cleanup).
      sgf: raw.canonical_content ?? raw.normalized_sgf,
      numMoves: raw.num_moves,
      // `card_source_id` is `number | null | undefined` on the wire;
      // coalesce null → undefined so the domain type stays
      // `CardId | undefined` (no `null` variant).
      parentId: (raw.card_source_id ?? undefined) as CardId | undefined,
      model: { alpha: raw.alpha, beta: raw.beta, t: raw.t },
      lastReviewedAt: raw.last_reviewed_at ? new Date(raw.last_reviewed_at) : null,
      numReviews: raw.num_reviews,
      suspended: raw.suspended,
      // Canonically `grading_parameter.data.default_visits`; the top-level
      // `default_visits` is the stale-bundle shim; `?? 1000` matches the
      // backend's own sentinel for cards that somehow predate Commit 1's
      // data migration.
      defaultVisits: readGradingParam<number>(raw.grading_parameter, 'default_visits')
        ?? raw.default_visits
        ?? 1000,
      gamma: readGradingParam<number>(raw.grading_parameter, 'gamma') ?? 0.9,
    };
  }

  public async queryForest(contextIds: number[], pipeline: any[]): Promise<ReviewCard[]> {
    const payload = {
      context_ids: contextIds,
      pipeline
    };

    const rawCards = await api.request<CardFromWire[]>('POST', '/forests/query', payload);
    return rawCards.map(c => this.mapToReviewCard(c));
  }

  public async fetchCardSet(cardSet: CardSet): Promise<ReviewCard[]> {
    return this.queryForest(cardSet.contextIds, cardSet.pipeline);
  }

  public async submitReview(cardId: CardId, scores: number[]): Promise<ReviewCard> {
    const rawCard = await api.request<CardFromWire>('POST', `/cards/${cardId}/review`, { scores });
    return this.mapToReviewCard(rawCard);
  }

  public async createCard(payload: CardCreatePayload): Promise<number> {
    const response = await api.request<any>('POST', '/cards/', payload);
    return response.card_id;
  }

  public async getTags(): Promise<TagStat[]> {
    return api.request<TagStat[]>('GET', '/stats/tags');
  }

  public async getForestStats(): Promise<ForestStat[]> {
    return api.request<ForestStat[]>('GET', '/stats/forests');
  }

  public async fetchEbisuSession(contextIds: number[], poolSize = 50, drawSize = 10): Promise<ReviewCard[]> {
    const pipeline = [
      {
        stage: "select",
        selection: { type: "DescendantSelection" },
        ordering: { type: "bfs_order" }
      },
      { stage: "take", n: poolSize },
      { stage: "order", ordering: { type: "EbisuRecallKey" } },
      { stage: "take", n: drawSize },
      { stage: "shuffle" }
    ];
    return this.queryForest(contextIds, pipeline);
  }
}

export const ebisuService = new EbisuService();
