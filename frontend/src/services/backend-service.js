/**
 * src/services/backend-service.ts
 * Anti-Corruption Layer for the spaced-repetition backend.
 * License: Public Domain (The Unlicense)
 */
import { api, ApiError } from './api-client';
import { CardTreeOverflowError } from '../types';
import { rewriteGradingParameterAnalysisConfig } from '../engine/analysis-config-curation';
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
function readGradingParam(gradingParam, key) {
    if (!gradingParam || typeof gradingParam !== 'object')
        return undefined;
    // ACL escape hatch: `grading_parameter` is untyped on the wire (the one
    // unavoidable type-unsafe ACL point, per this helper's docstring above).
    // Reading a property off the checked non-null object yields `unknown`.
    const data = gradingParam['data'];
    if (!data || typeof data !== 'object')
        return undefined;
    // Same untyped-blob read; checked non-null above.
    const value = data[key];
    // Caller-asserted T: the field's runtime shape is the caller's claim (the
    // wire blob is unmodelled); returned as `T | undefined` for the consumer.
    return value;
}
export class BackendService {
    warnedAboutMissingParentId = false;
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
    mapToReviewCard(raw) {
        // DIAGNOSTIC: under the typed contract, `card_source_id` is
        // `number | null | undefined`. `null` is the normal case for root
        // cards (no parent); `undefined` would mean the backend emitted a
        // response without the key at all, which is a schema regression.
        // We warn on the latter and suppress subsequent identical warnings.
        if (!this.warnedAboutMissingParentId && raw.card_source_id === undefined) {
            console.warn(`[BackendService] API Response missing 'card_source_id' field (key absent, not null). ` +
                `Wire contract expects it to always be present as number | null. ` +
                `Lineage Tree linking will not work until the backend schema is fixed.`);
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
            .gradingParameter;
        return {
            // ACL Band-2 brand mint: the wire `id` (number) becomes the domain
            // `CardId` at this single re-brand boundary (mapToReviewCard).
            id: raw.id,
            canonicalContent: raw.canonical_content,
            numMoves: raw.num_moves,
            // `card_source_id` is `number | null | undefined` on the wire;
            // coalesce null → undefined so the domain type stays
            // `CardId | undefined` (no `null` variant).
            parentId: (raw.card_source_id ?? undefined),
            model: { alpha: raw.alpha, beta: raw.beta, t: raw.t },
            lastReviewedAt: raw.last_reviewed_at ? new Date(raw.last_reviewed_at) : null,
            numReviews: raw.num_reviews,
            suspended: raw.suspended,
            // `?? 1000` is the application-side safety net for cards with
            // malformed or missing grading_parameter.data.default_visits.
            defaultVisits: readGradingParam(raw.grading_parameter, 'default_visits') ?? 1000,
            gamma: readGradingParam(raw.grading_parameter, 'gamma') ?? 0.9,
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
    async queryForest(contextIds, pipeline) {
        const payload = {
            context_ids: contextIds,
            pipeline
        };
        const rawCards = await api.request('POST', '/forests/query', payload);
        return rawCards.map(c => this.mapToReviewCard(c));
    }
    async submitReview(cardId, scores) {
        const rawCard = await api.request('POST', `/cards/${cardId}/review`, { scores });
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
    async updateCardMetadata(cardId, patch) {
        const body = {};
        if (patch.tags !== undefined)
            body.tags = [...patch.tags];
        if (patch.numMoves !== undefined)
            body.num_moves = patch.numMoves;
        if (patch.suspended !== undefined)
            body.suspended = patch.suspended;
        if (patch.gradingParameterData !== undefined) {
            body.grading_parameter = { data: patch.gradingParameterData };
        }
        if (patch.resetPrior !== undefined)
            body.reset_prior = patch.resetPrior;
        const raw = await api.request('PATCH', `/cards/${cardId}`, body);
        return this.mapToReviewCard(raw);
    }
    async createCard(payload) {
        const response = await api.request('POST', '/cards/', payload);
        return response.card_id;
    }
    async getTags() {
        const raw = await api.request('GET', '/stats/tags');
        return raw.map(t => this.mapTagStat(t));
    }
    // Structurally redundant today — wire and domain shapes are
    // field-for-field identical (see the type-level note on `TagStat`).
    // Kept as a forward-looking indirection point per ADR-0005 so a
    // future wire rename or added field is absorbed here, not at consumers.
    mapTagStat(raw) {
        return {
            name: raw.name,
            count: raw.count,
        };
    }
    async getForestStats() {
        const raw = await api.request('GET', '/stats/forests');
        return raw.map(s => this.mapForestStat(s));
    }
    // Wire → domain projection: snake_case → camelCase rename, raw
    // `number` → branded `CardId` / `GameSourceId` at the boundary,
    // nullable metadata strings preserved (consumers handle the
    // "no metadata" case, the ACL does not coerce — see ADR-0002).
    mapForestStat(raw) {
        return {
            rootCardId: raw.root_card_id, // ACL Band-2 brand mint
            gameSourceId: raw.game_source_id, // ACL Band-2 brand mint
            description: raw.description,
            playerWhite: raw.player_white,
            playerBlack: raw.player_black,
            totalCards: raw.total_cards,
            totalReviews: raw.total_reviews,
            averageRecall: raw.average_recall,
        };
    }
    async fetchEbisuSession(contextIds, poolSize = 50, drawSize = 10) {
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
    /**
     * Single-card hydrate. Used by the card-tree widget to populate
     * thumbnails for context cards (cards on a path between active nodes
     * that didn't come back in the pipeline result). The wire shape is
     * the same `CardWithRecall` used by `submitReview` and `queryForest`.
     */
    async fetchCard(cardId) {
        const raw = await api.request('GET', `/cards/${cardId}`);
        return this.mapToReviewCard(raw);
    }
    /**
     * Group input card ids by the game-source root they descend from.
     * Inputs not owned by the caller (or absent from the database) come
     * back in `unmatchedCardIds` rather than being silently dropped —
     * `roots ∪ unmatchedCardIds` partitions the original input.
     */
    async resolveRoots(cardIds) {
        // `CardId` is `number & { __brand }`, so `CardId[]` is assignable to
        // the wire's `number[]` directly — the brand is phantom and widens
        // away here. Going the other direction (raw number → CardId) is
        // where the assertion lives, in `mapResolvedRoot` below.
        const raw = await api.request('POST', '/lineage/resolve-roots', { card_ids: cardIds });
        return {
            roots: raw.roots.map(r => this.mapResolvedRoot(r)),
            unmatchedCardIds: raw.unmatched_card_ids.map(n => n), // ACL Band-2 brand mint
        };
    }
    mapResolvedRoot(raw) {
        return {
            rootCardId: raw.root_card_id, // ACL Band-2 brand mint
            gameSourceId: raw.game_source_id, // ACL Band-2 brand mint
            cardIdsInTree: raw.card_ids_in_tree.map(n => n), // ACL Band-2 brand mint
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
    async fetchTreeByRoot(rootCardId, maxNodes) {
        const body = {
            root_card_id: rootCardId,
        };
        if (maxNodes !== undefined)
            body.max_nodes = maxNodes;
        try {
            const raw = await api.request('POST', '/lineage/tree-by-root', body, { silentStatuses: [422] });
            return {
                rootCardId: raw.root_card_id, // ACL Band-2 brand mint
                gameSourceId: raw.game_source_id, // ACL Band-2 brand mint
                tree: this.mapTreeNode(raw.tree),
            };
        }
        catch (err) {
            // The api-client throws `ApiError` carrying the HTTP status and raw
            // body. Parse the 422 structured detail to a typed error for ADR-0002
            // surfacing; anything else propagates unchanged.
            if (err instanceof ApiError && err.status === 422) {
                const body422 = parse422Body(err.body);
                if (body422) {
                    throw new CardTreeOverflowError(rootCardId, body422.actualSize, body422.maxNodes);
                }
            }
            throw err;
        }
    }
    mapTreeNode(raw) {
        return {
            id: raw.id, // ACL Band-2 brand mint
            children: raw.children.map(c => this.mapTreeNode(c)),
        };
    }
}
// 422 body shape from the backend's overflow response, per the dispatch:
//   { detail: "tree exceeds max_nodes", actual_size: number, max_nodes: number }
// Returns null if the body doesn't match — the caller falls back to the
// generic Error and the system log carries the raw text.
function parse422Body(text) {
    try {
        // JSON.parse returns `any`; narrow to an open record so the fields are
        // read as `unknown` and type-checked below before use (decode frontier).
        const parsed = JSON.parse(text);
        const actualSize = parsed['actual_size'];
        const maxNodes = parsed['max_nodes'];
        if (typeof actualSize === 'number' && typeof maxNodes === 'number') {
            return { actualSize, maxNodes };
        }
    }
    catch {
        // Not JSON, or malformed JSON. Fall through to null.
    }
    return null;
}
export const backendService = new BackendService();
