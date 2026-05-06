/**
 * src/services/backend-service.ts
 * Anti-Corruption Layer for the spaced-repetition backend.
 * License: Public Domain (The Unlicense)
 */

import { api } from './api-client';
import type {
  CardId,
  GameSourceId,
  ReviewCard,
  CardCreatePayload,
  ForestStat,
  TagStat,
  ResolveRootsResult,
  RootGroup,
  CardLineageTree,
  CardLineageNode,
  PipelineStage,
} from '../types';
import { CardTreeOverflowError } from '../types';
import type { components } from '../types/backend';
import { rewriteGradingParameterAnalysisConfig } from '../engine/analysis-config-curation';

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
type ResolveRootsResponseWire = components['schemas']['ResolveRootsResponse'];
type ResolvedRootWire = components['schemas']['ResolvedRoot'];
type TreeByRootResponseWire = components['schemas']['TreeByRootResponse'];
type TreeNodeWire = components['schemas']['TreeNode'];
type ForestStatWire = components['schemas']['ForestStat'];
type TagStatWire = components['schemas']['TagStat'];

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

export class BackendService {

  private warnedAboutMissingParentId = false;

  /**
   * Translates the backend's wire shape into our strict domain type.
   * Isolates the frontend from backend schema changes and snake_case.
   *
   * `raw` is typed as `components['schemas']['CardWithRecall']` (via the
   * `CardFromWire` alias). TypeScript will flag any property access that
   * disagrees with the backend's OpenAPI-published contract at compile
   * time — a backend field rename becomes a compile error at exactly the
   * sites that need updating.
   */
  private mapToReviewCard(raw: CardFromWire): ReviewCard {
    // DIAGNOSTIC: under the typed contract, `card_source_id` is
    // `number | null | undefined`. `null` is the normal case for root
    // cards (no parent); `undefined` would mean the backend emitted a
    // response without the key at all, which is a schema regression.
    // We warn on the latter and suppress subsequent identical warnings.
    if (!this.warnedAboutMissingParentId && raw.card_source_id === undefined) {
      console.warn(
        `[BackendService] API Response missing 'card_source_id' field (key absent, not null). ` +
        `Wire contract expects it to always be present as number | null. ` +
        `Lineage Tree linking will not work until the backend schema is fixed.`
      );
      this.warnedAboutMissingParentId = true;
    }

    // Item 18 closure: route the wire blob through the proxy v1.0.3
    // curation rewriter before surfacing it on the domain card. The
    // rewriter only walks `data.analysis_config.symbols.*` strings,
    // rewriting `np.<fn>(` → `<fn>(` for curated names; the top-level
    // shape is structurally preserved (same reference returned for the
    // no-op fast path; otherwise a structural copy with siblings kept
    // by reference). This aligns pre-v1.0.3 cards' baked configs with
    // the curated proxy stdlib so they remain reviewable. Residue
    // (bodies referencing fns outside the curated stdlib, attribute
    // walks like `np.linalg.<fn>`) is left for the proxy's call-time
    // NameError to surface as a SystemMessage at review time per
    // ADR-0002 — no per-card warning here, which would be noisy.
    const curatedGradingParameter =
      rewriteGradingParameterAnalysisConfig(raw.grading_parameter)
        .gradingParameter as CardFromWire['grading_parameter'];

    return {
      id: raw.id as CardId,
      sgf: raw.canonical_content,
      numMoves: raw.num_moves,
      // `card_source_id` is `number | null | undefined` on the wire;
      // coalesce null → undefined so the domain type stays
      // `CardId | undefined` (no `null` variant).
      parentId: (raw.card_source_id ?? undefined) as CardId | undefined,
      model: { alpha: raw.alpha, beta: raw.beta, t: raw.t },
      lastReviewedAt: raw.last_reviewed_at ? new Date(raw.last_reviewed_at) : null,
      numReviews: raw.num_reviews,
      suspended: raw.suspended,
      // `?? 1000` is the application-side safety net for cards with
      // malformed or missing grading_parameter.data.default_visits.
      defaultVisits: readGradingParam<number>(raw.grading_parameter, 'default_visits') ?? 1000,
      gamma: readGradingParam<number>(raw.grading_parameter, 'gamma') ?? 0.9,
      // Item 18 surfacing: the curated grading_parameter blob (so the
      // SR composable's per-card `analysis_config` override at
      // `useReviewSession.ts:235` can read it), and the recall
      // projections the backend computes on every CardWithRecall
      // response.
      gradingParameter: curatedGradingParameter,
      currentRecall: raw.current_recall,
      halflifeUnits: raw.halflife_units,
    };
  }

  public async queryForest(contextIds: number[], pipeline: PipelineStage[]): Promise<ReviewCard[]> {
    const payload = {
      context_ids: contextIds,
      pipeline
    };

    const rawCards = await api.request<CardFromWire[]>('POST', '/forests/query', payload);
    return rawCards.map(c => this.mapToReviewCard(c));
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
    const raw = await api.request<TagStatWire[]>('GET', '/stats/tags');
    return raw.map(t => this.mapTagStat(t));
  }

  // Structurally redundant today — wire and domain shapes are
  // field-for-field identical (see the type-level note on `TagStat`).
  // Kept as a forward-looking indirection point per ADR-0005 so a
  // future wire rename or added field is absorbed here, not at consumers.
  private mapTagStat(raw: TagStatWire): TagStat {
    return {
      name: raw.name,
      count: raw.count,
    };
  }

  public async getForestStats(): Promise<ForestStat[]> {
    const raw = await api.request<ForestStatWire[]>('GET', '/stats/forests');
    return raw.map(s => this.mapForestStat(s));
  }

  // Wire → domain projection: snake_case → camelCase rename, raw
  // `number` → branded `CardId` / `GameSourceId` at the boundary,
  // nullable metadata strings preserved (consumers handle the
  // "no metadata" case, the ACL does not coerce — see ADR-0002).
  private mapForestStat(raw: ForestStatWire): ForestStat {
    return {
      rootCardId: raw.root_card_id as CardId,
      gameSourceId: raw.game_source_id as GameSourceId,
      description: raw.description,
      playerWhite: raw.player_white,
      playerBlack: raw.player_black,
      totalCards: raw.total_cards,
      totalReviews: raw.total_reviews,
      averageRecall: raw.average_recall,
    };
  }

  public async fetchEbisuSession(contextIds: number[], poolSize = 50, drawSize = 10): Promise<ReviewCard[]> {
    const pipeline: PipelineStage[] = [
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

  /**
   * Single-card hydrate. Used by the card-tree widget to populate
   * thumbnails for context cards (cards on a path between active nodes
   * that didn't come back in the pipeline result). The wire shape is
   * the same `CardWithRecall` used by `submitReview` and `queryForest`.
   */
  public async fetchCard(cardId: CardId): Promise<ReviewCard> {
    const raw = await api.request<CardFromWire>('GET', `/cards/${cardId}`);
    return this.mapToReviewCard(raw);
  }

  /**
   * Group input card ids by the game-source root they descend from.
   * Inputs not owned by the caller (or absent from the database) come
   * back in `unmatchedCardIds` rather than being silently dropped —
   * `roots ∪ unmatchedCardIds` partitions the original input.
   */
  public async resolveRoots(cardIds: CardId[]): Promise<ResolveRootsResult> {
    // `CardId` is `number & { __brand }`, so `CardId[]` is assignable to
    // the wire's `number[]` directly — the brand is phantom and widens
    // away here. Going the other direction (raw number → CardId) is
    // where the assertion lives, in `mapResolvedRoot` below.
    const raw = await api.request<ResolveRootsResponseWire>(
      'POST',
      '/lineage/resolve-roots',
      { card_ids: cardIds },
    );
    return {
      roots: raw.roots.map(r => this.mapResolvedRoot(r)),
      unmatchedCardIds: raw.unmatched_card_ids.map(n => n as CardId),
    };
  }

  private mapResolvedRoot(raw: ResolvedRootWire): RootGroup {
    return {
      rootCardId: raw.root_card_id as CardId,
      gameSourceId: raw.game_source_id as GameSourceId,
      cardIdsInTree: raw.card_ids_in_tree.map(n => n as CardId),
    };
  }

  /**
   * Fetch the structure-only subtree rooted at `rootCardId`. The wire
   * shape is `{id, children}` recursive; per-card data is fetched
   * separately via `fetchCard`. The two read paths are independently
   * cacheable per the backend dispatch.
   *
   * Throws `CardTreeOverflowError` on 422 (`actual_size` exceeds
   * `max_nodes`). Per ADR-0002, no silent truncation; the caller
   * decides how to react (raise the cap, narrow the query, surface
   * the overflow in the UI).
   *
   * Throws the generic `Error` shape from `api-client` on 404 (root
   * not owned, missing, or not a game-source root).
   */
  public async fetchTreeByRoot(
    rootCardId: CardId,
    maxNodes?: number,
  ): Promise<CardLineageTree> {
    const body: { root_card_id: CardId; max_nodes?: number } = {
      root_card_id: rootCardId,
    };
    if (maxNodes !== undefined) body.max_nodes = maxNodes;

    try {
      const raw = await api.request<TreeByRootResponseWire>(
        'POST',
        '/lineage/tree-by-root',
        body,
        { silentStatuses: [422] },
      );
      return {
        rootCardId: raw.root_card_id as CardId,
        gameSourceId: raw.game_source_id as GameSourceId,
        tree: this.mapTreeNode(raw.tree),
      };
    } catch (err) {
      // The api-client throws `Error` with message "API Error 422: <body>".
      // Parse the structured detail to a typed error for ADR-0002 surfacing.
      if (err instanceof Error) {
        const match = err.message.match(/^API Error 422: (.+)$/s);
        if (match) {
          const body422 = parse422Body(match[1]);
          if (body422) {
            throw new CardTreeOverflowError(
              rootCardId,
              body422.actualSize,
              body422.maxNodes,
            );
          }
        }
      }
      throw err;
    }
  }

  private mapTreeNode(raw: TreeNodeWire): CardLineageNode {
    return {
      id: raw.id as CardId,
      children: raw.children.map(c => this.mapTreeNode(c)),
    };
  }
}

// 422 body shape from the backend's overflow response, per the dispatch:
//   { detail: "tree exceeds max_nodes", actual_size: number, max_nodes: number }
// Returns null if the body doesn't match — the caller falls back to the
// generic Error and the system log carries the raw text.
function parse422Body(text: string): { actualSize: number; maxNodes: number } | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const actualSize = parsed['actual_size'];
    const maxNodes = parsed['max_nodes'];
    if (typeof actualSize === 'number' && typeof maxNodes === 'number') {
      return { actualSize, maxNodes };
    }
  } catch {
    // Not JSON, or malformed JSON. Fall through to null.
  }
  return null;
}

export const backendService = new BackendService();
