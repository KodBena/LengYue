/**
 * src/services/backend-service.ts
 * Anti-Corruption Layer for the spaced-repetition backend.
 * License: Public Domain (The Unlicense)
 */

import { api, ApiError } from './api-client';
import type {
  CardId,
  CardDisplayOrdinal,
  CardPublicId,
  CardMetadataPatch,
  ContentHash,
  GameDisplayOrdinal,
  ReviewCard,
  CardCreatePayload,
  CardBatchCreateRequestPayload,
  CardBatchCreateResponsePayload,
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
import { recordKnownPosition } from '../state/known-positions';

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
type PositionHashResponseWire = components['schemas']['PositionHashResponse'];
type PositionHashBatchResponseWire = components['schemas']['PositionHashBatchResponse'];

// TEMPORARY hand-written wire type, not a `components['schemas'][...]`
// alias like its siblings above. `npm run gen:api` could not be run in
// this environment to regenerate `src/types/backend.ts` against the new
// backend endpoint (`GET /cards/hashes` — see
// `.claude/dispatch-reports/known-positions-boot-hydrate.md`'s report
// for the reproduced blocker: the local throwaway backend's Alembic
// bootstrap hangs against a fresh SQLite file, unrelated to this
// change). This shape is hand-verified against `backend/schemas/
// card.py::CardHashEntry` field-for-field. Replace with
// `components['schemas']['CardHashEntry']` (deleting this alias) the
// next time `gen:api` runs successfully — per `frontend/CLAUDE.md`,
// the generated file itself is never hand-edited; this is the
// explicitly-sanctioned fallback of adding the wire type alongside the
// other hand-written aliases instead.
type CardHashEntryWire = {
  content_hash: string;
  card_id: number;
};

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
  // ACL escape hatch: `grading_parameter` is untyped on the wire (the one
  // unavoidable type-unsafe ACL point, per this helper's docstring above).
  // Reading a property off the checked non-null object yields `unknown`.
  const data = (gradingParam as Record<string, unknown>)['data'];
  if (!data || typeof data !== 'object') return undefined;
  // Same untyped-blob read; checked non-null above.
  const value = (data as Record<string, unknown>)[key];
  // Caller-asserted T: the field's runtime shape is the caller's claim (the
  // wire blob is unmodelled); returned as `T | undefined` for the consumer.
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
      // The rewriter preserves the wire shape (no-op fast path returns the
      // same reference; otherwise a structural copy) — re-narrow to the
      // wire field type after the structurally-preserving rewrite.
      rewriteGradingParameterAnalysisConfig(raw.grading_parameter)
        .gradingParameter as CardFromWire['grading_parameter'];

    // card-position-annotations Stage A: ACL Band-2 brand mints, then feed
    // the known-positions state module. Every mapToReviewCard call is an
    // opportunity to learn "this caller owns a card at this position" —
    // see src/state/known-positions.ts's file header for why this is the
    // module's sole population path (no dedicated bulk-fetch endpoint).
    const cardId = raw.id as CardId; // ACL Band-2 brand mint (wire number -> CardId)
    const contentHash = raw.content_hash as ContentHash; // ACL Band-2 brand mint (wire hex string -> ContentHash)
    recordKnownPosition(contentHash, cardId);

    return {
      id: cardId,
      // Per-user-id-enumeration design: ACL Band-2 brand mints for
      // the display-role and reference-role fields added alongside
      // the raw PK (`id` stays the exception per Decision 4).
      displayOrdinal: raw.display_ordinal as CardDisplayOrdinal, // ACL Band-2 brand mint
      publicId: raw.public_id as CardPublicId, // ACL Band-2 brand mint
      canonicalContent: raw.canonical_content,
      contentHash,
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
      // Card-metadata inline-edit arc 1: plain tags attached to the
      // card. Wire field is marked optional (Pydantic default
      // serialisation), so coerce `undefined → []` at this
      // boundary — domain-side `ReviewCard.tags` is always
      // present, callers don't branch on absence.
      tags: raw.tags ?? [],
    };
  }

  public async queryForest(
    contextIds: number[],
    pipeline: PipelineStage[],
    gameSourceOrdinals: number[] = [],
  ): Promise<ReviewCard[]> {
    // macro-public-id-tokens: game_source_ordinals is the widened
    // /forests/query token vocabulary (ledger rows 498/500) — each
    // ordinal is resolved server-side, within the caller's tenancy,
    // to its game_source's root card id(s) before the pipeline runs.
    // The SPA never resolves this itself; see context-id-macros.ts.
    const payload = {
      context_ids: contextIds,
      game_source_ordinals: gameSourceOrdinals,
      pipeline
    };

    const rawCards = await api.request<CardFromWire[]>('POST', '/forests/query', payload);
    return rawCards.map(c => this.mapToReviewCard(c));
  }

  public async submitReview(cardId: CardId, scores: number[]): Promise<ReviewCard> {
    const rawCard = await api.request<CardFromWire>('POST', `/cards/${cardId}/review`, { scores });
    return this.mapToReviewCard(rawCard);
  }

  /**
   * Card-metadata inline-edit arc 2 (2026-05-13). Sends a partial
   * update to `PATCH /cards/{card_id}` and returns the
   * re-projected domain card. Absent fields stay absent on the
   * wire so the backend's "absent → preserve" semantics apply —
   * the ACL composes only the keys the caller actually wanted to
   * change. See `CardMetadataPatch`'s doc in `types.ts` for the
   * per-field semantics.
   *
   * `grading_parameter` projects through a one-level wrapper:
   * domain `gradingParameterData` → wire `grading_parameter:
   * { data: ... }`. The keys inside `data` are passed through
   * verbatim — backend only types `gamma`, every other key is
   * frontend-defined pass-through per the Ask 3 contract.
   *
   * On 422 (validation failure) or 404 (cross-tenant or
   * nonexistent id), the underlying `api.request` raises through
   * the shared error handler; callers can rollback their
   * optimistic local update in the rejection branch.
   */
  public async updateCardMetadata(
    cardId: CardId,
    patch: CardMetadataPatch,
  ): Promise<ReviewCard> {
    const body: Record<string, unknown> = {};
    if (patch.tags !== undefined)       body.tags       = [...patch.tags];
    if (patch.numMoves !== undefined)   body.num_moves  = patch.numMoves;
    if (patch.suspended !== undefined)  body.suspended  = patch.suspended;
    if (patch.gradingParameterData !== undefined) {
      body.grading_parameter = { data: patch.gradingParameterData };
    }
    if (patch.resetPrior !== undefined) body.reset_prior = patch.resetPrior;
    const raw = await api.request<CardFromWire>('PATCH', `/cards/${cardId}`, body);
    return this.mapToReviewCard(raw);
  }

  public async createCard(payload: CardCreatePayload): Promise<number> {
    const response = await api.request<any>('POST', '/cards/', payload);
    return response.card_id;
  }

  /**
   * Batch card-minting affordance (commissioner-designed, ledger rows
   * 926/957/1008). Single transactional call — the whole batch mints
   * or none of it does (backend's `async with db.begin()` around
   * `CardService.create_cards_batch`, `backend/api/routes/cards.py`).
   * `CardBatchCreateRequestPayload`/`CardBatchCreateResponsePayload`
   * are hand-written wire types (see `types/cards.ts`'s own comment
   * for why — `gen:api` needs a live backend this build couldn't
   * reach); response `card_ids` come back in request order, so the
   * caller maps `card_ids[i]` back to whatever built `cards[i]`
   * (`batch-mint-core.ts::buildBatchMintPayload`'s `nodeOrder`).
   */
  public async createCardsBatch(payload: CardBatchCreateRequestPayload): Promise<number[]> {
    const response = await api.request<CardBatchCreateResponsePayload>('POST', '/cards/batch', payload);
    return response.card_ids;
  }

  /**
   * card-position-annotations Stage A. Asks the backend "what
   * content_hash would normalizing this raw content produce" without
   * minting anything — no `normalized_position` row, no card. Used by
   * `useMinting.prepareDraft` (mint-dialog duplicate check) and, in
   * Stage B, the tree-node annotation cache.
   *
   * The backend runs the raw content through the exact same
   * `PositionNormalizerPort` `POST /cards/` does (see
   * `api/routes/positions.py`'s module docstring), so the returned
   * hash is guaranteed to equal what minting `rawContent` verbatim
   * would produce — no parallel client-side normalization (design
   * §1: "one identity, one home").
   */
  public async hashPosition(rawContent: string): Promise<ContentHash> {
    const raw = await api.request<PositionHashResponseWire>(
      'POST',
      '/positions/hash',
      { raw_content: rawContent },
    );
    return raw.content_hash as ContentHash; // ACL Band-2 brand mint
  }

  /**
   * card-position-annotations Stage B. Batched sibling of
   * `hashPosition`: hashes every entry in `rawContents` in one round
   * trip, returning the results index-aligned. Used by
   * `useNodePositionHashes` (`src/composables/cards/`) to fill the
   * tree-node NodeId->ContentHash cache without one request per
   * rendered node.
   *
   * Throws (surfaced via `api.request`'s ApiError) on any backend
   * failure — 413 over `POSITIONS_HASH_BATCH_MAX`, 422 if any item
   * fails to normalize. The caller decides how to degrade (absent
   * highlight + one non-blocking notice, per the design's failure-
   * honesty posture — never a stale/partial highlight).
   */
  public async hashPositionsBatch(rawContents: string[]): Promise<ContentHash[]> {
    const raw = await api.request<PositionHashBatchResponseWire>(
      'POST',
      '/positions/hash-batch',
      { raw_contents: rawContents },
    );
    return raw.content_hashes as ContentHash[]; // ACL Band-2 brand mint
  }

  /**
   * Known-positions boot-time hydrate (see
   * `.claude/dispatch-reports/card-position-annotations-design.md`
   * §3, "Recommend (b)"). Bulk-fetches every `(content_hash, card_id)`
   * pair for the caller's own cards via `GET /cards/hashes`, so
   * `useKnownPositions.hydrateKnownPositions` can populate the
   * `known-positions` state module's `ContentHash -> CardId` map
   * completely at auth-readiness, rather than leaving it to fill
   * only incidentally as `mapToReviewCard` happens to see cards
   * during ordinary navigation (today's gap: the game-tree
   * known-position rings and the mint-dialog duplicate warning are
   * empty after a fresh SPA start until the user browses).
   *
   * Does NOT itself write to the known-positions state module —
   * unlike `mapToReviewCard`'s incidental population, this is a
   * plain fetch-and-map; the composable decides how the pairs feed
   * `recordKnownPosition` (first-seen-wins, per that module's file
   * header).
   */
  public async fetchKnownPositionHashes(): Promise<
    Array<{ contentHash: ContentHash; cardId: CardId }>
  > {
    const raw = await api.request<CardHashEntryWire[]>('GET', '/cards/hashes');
    return raw.map(entry => ({
      contentHash: entry.content_hash as ContentHash, // ACL Band-2 brand mint
      cardId: entry.card_id as CardId, // ACL Band-2 brand mint
    }));
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
  // string/number → branded `CardPublicId` / `GameDisplayOrdinal` at
  // the boundary (browse-leak-fix, ledger rows 417/423 — these were
  // `CardId`/`GameSourceId`, the raw global PKs, until this pass),
  // nullable metadata strings preserved (consumers handle the
  // "no metadata" case, the ACL does not coerce — see ADR-0002).
  private mapForestStat(raw: ForestStatWire): ForestStat {
    return {
      rootCardPublicId: raw.root_card_public_id as CardPublicId, // ACL Band-2 brand mint
      gameSourceDisplayOrdinal: raw.game_source_display_ordinal as GameDisplayOrdinal, // ACL Band-2 brand mint
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
      unmatchedCardIds: raw.unmatched_card_ids.map(n => n as CardId), // ACL Band-2 brand mint
    };
  }

  private mapResolvedRoot(raw: ResolvedRootWire): RootGroup {
    return {
      rootCardPublicId: raw.root_card_public_id as CardPublicId, // ACL Band-2 brand mint
      gameSourceDisplayOrdinal: raw.game_source_display_ordinal as GameDisplayOrdinal, // ACL Band-2 brand mint
      cardIdsInTree: raw.card_ids_in_tree.map(n => n as CardId), // ACL Band-2 brand mint
    };
  }

  /**
   * Fetch the structure-only subtree rooted at `rootCardPublicId`.
   * The wire shape is `{id, children}` recursive; per-card data is
   * fetched separately via `fetchCard`. The two read paths are
   * independently cacheable per the backend dispatch.
   *
   * Browse-leak-fix (ledger rows 417/423): the root is now addressed
   * by its `public_id` (a `CardPublicId`) rather than the raw
   * internal `CardId` — the guarantee's "the per-user id IS the
   * handle" ruling. Every caller sources this value from
   * `ForestStat.rootCardPublicId` or `RootGroup.rootCardPublicId`,
   * neither of which carries a raw id anymore.
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
    rootCardPublicId: CardPublicId,
    maxNodes?: number,
  ): Promise<CardLineageTree> {
    const body: { root_card_public_id: CardPublicId; max_nodes?: number } = {
      root_card_public_id: rootCardPublicId,
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
        rootCardPublicId: raw.root_card_public_id as CardPublicId, // ACL Band-2 brand mint
        gameSourceDisplayOrdinal: raw.game_source_display_ordinal as GameDisplayOrdinal, // ACL Band-2 brand mint
        tree: this.mapTreeNode(raw.tree),
      };
    } catch (err) {
      // The api-client throws `ApiError` carrying the HTTP status and raw
      // body. Parse the 422 structured detail to a typed error for ADR-0002
      // surfacing; anything else propagates unchanged.
      if (err instanceof ApiError && err.status === 422) {
        const body422 = parse422Body(err.body);
        if (body422) {
          throw new CardTreeOverflowError(
            rootCardPublicId,
            body422.actualSize,
            body422.maxNodes,
          );
        }
      }
      throw err;
    }
  }

  private mapTreeNode(raw: TreeNodeWire): CardLineageNode {
    return {
      id: raw.id as CardId, // ACL Band-2 brand mint
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
    // JSON.parse returns `any`; narrow to an open record so the fields are
    // read as `unknown` and type-checked below before use (decode frontier).
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
