/**
 * src/types/ids.ts
 *
 * Domain-agnostic identity brands: the `Brand<>` phantom-newtype
 * utility, the `PerBoard<T>` store-partitioning alias, and the
 * identity / config-key / content-hash brands that survive a port to
 * any knowledge domain. Game-coupled brands (`NodeId`, `StoneColor`,
 * `ColorMoveIndex`, `PlyIndex`) live in `src/types/game.ts` so a
 * domain fork replaces exactly one module wholesale. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); `src/types.ts` remains the barrel re-export, and bodies
 * here are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

// ── Type Branding Utilities ───────────────────────────────────────────────────
export type Brand<K, T> = K & { readonly __brand: T };

export type BoardId    = Brand<string, 'BoardId'>;
export type ProfileId  = Brand<string, 'ProfileId'>;
export type SessionId  = Brand<string, 'SessionId'>;
export type BookmarkId = Brand<string, 'BookmarkId'>;

/**
 * Per-board store partitioning. A `Partial<Record<BoardId, T>>`: cells are
 * added lazily per board, torn down by `closeBoard` (each a teardown O-pair),
 * and cleared wholesale by `resetWorkspace`. The alias makes board-scope a
 * named, greppable property of the type — `grep 'PerBoard<'` enumerates every
 * per-board store surface. `Partial<>` (not bare `Record<>`) is load-bearing:
 * it keeps indexed reads honest about the `undefined`-after-delete contract
 * (ADR-0001 reflects runtime reality; ADR-0002 forbids the unjustified
 * bare-Record read). The board-scope analog of the backend's `user_id`
 * tenancy spec — see `frontend/docs/notes/board-scope.md`.
 */
export type PerBoard<T> = Partial<Record<BoardId, T>>;

/**
 * Stable identifier for a user-rebindable keyboard action. Branded
 * to prevent string typos from silently mis-routing key dispatch.
 * Naming convention: `<domain>.<verb>` (e.g., `nav.next`,
 * `display.toggleMoveNumbers`). Authoritative constructor and
 * action catalog live at `src/composables/keybindings-catalog.ts`;
 * the generic substrate (resolution / validation helpers) at
 * `src/lib/keybindings.ts`. See
 * `docs/archive/notes/design/keybindings-plan.md` for the
 * substrate design.
 */
export type KeybindingActionId = Brand<string, 'KeybindingActionId'>;

/**
 * Derived content-hash bucket keys for the analysis ledger's two
 * provenance-stratified stores. These are NOT entity identities — they are
 * DJB2 hashes over a structured analysis descriptor, branded distinct so a
 * raw-store read cannot be issued with an enrichment key (or vice versa):
 * the wrong-key read becomes a compile error (ADR-0002, strongest channel).
 *
 * `RawKey` = hash(model + overrideSettings) — palette-independent.
 * `EnrichedKey` = hash(model + overrideSettings + palette).
 *
 * Sole construction site: `deriveAnalysisKeys` in
 * `services/analysis-config.ts` (no raw `as RawKey` casts at consumers).
 * Soundness: bucket keys, not collision-free identities — collision risk is
 * the DJB2 birthday bound, identical to the prior single composite hash.
 * See `IDENTIFIERS.md` ("Derived content hashes") and the stratification
 * consult under `docs/notes/consult/`.
 */
export type RawKey      = Brand<string, 'RawKey'>;
export type EnrichedKey = Brand<string, 'EnrichedKey'>;

/**
 * Ephemeral correlation id for an in-flight engine query — minted by the SPA,
 * echoed back by the proxy as the wire `id`, and used to correlate a query
 * across the analysis-service bookkeeping maps (activeQueries /
 * activeSubscriptions / restartCallbacks / boardToQueries) and the
 * queue-telemetry store. Session-scoped, not persisted. Sole factory:
 * `mintQueryId` / `asQueryId` in `services/query-id.ts`; the wire-response
 * `id` is re-branded to `QueryId` at the analysis-service correlation
 * boundary (a justified ACL cast — the proxy echoes back the SPA's own id).
 */
export type QueryId = Brand<string, 'QueryId'>;

/**
 * Identifier for a registered stability extractor (a fixed vocabulary: the
 * keys of `STABILITY_EXTRACTORS` in `engine/analysis/stability-extractors.ts`,
 * e.g. `scoreLead_sign`, `top1_move`). Branded so an extractor id can't be
 * confused with a metric id or a bare string in the stability composables and
 * the trajectory store's composite key. The `STABILITY_EXTRACTORS` map is the
 * authoritative vocabulary.
 */
export type ExtractorId = Brand<string, 'ExtractorId'>;

/**
 * Identifier for a registered stability metric (a fixed vocabulary: the keys
 * of `STABILITY_METRICS` in `engine/analysis/stability-extractors.ts`).
 * Branded as the symmetric sibling of `ExtractorId` so the two parallel
 * stability vocabularies can't be swapped.
 */
export type MetricId = Brand<string, 'MetricId'>;

/**
 * Discriminated expand-key for the card-tree view: either a stringified
 * `CardId` (a card row) or a `bucket:<cardId>` bucket header. Branded so the
 * dual-shape key can't be confused with a bare string or a `CardId`; the
 * shape discriminator (`isBucketKey`) and the factories
 * (`cardExpandKeyFor` / `bucketIdFor`) live in
 * `composables/cards/useCardTreeProjection.ts`. Persisted in
 * `CardTreeNavState.manuallyExpanded`.
 */
export type CardTreeExpandKey = Brand<string, 'CardTreeExpandKey'>;

/**
 * Stable identity of an analysis panel (the scrollable charts on the
 * Analysis tab). Frozen-forever: it is the persistence key by which an
 * `AnalysisTab` references a panel, so renaming one orphans any saved
 * tab that points at it. Canonical id values live in the SFC-free
 * `components/charts/panel-ids.ts`; the id→component registry is
 * `components/charts/panel-registry.ts`.
 */
export type AnalysisPanelId = Brand<string, 'AnalysisPanelId'>;

/** Stable identity of a user-defined analysis tab. */
export type AnalysisTabId = Brand<string, 'AnalysisTabId'>;

// Server-row identity brands for the card domain (backend numeric
// primary keys; the ACL is the only place the raw number becomes the
// brand — see `services/backend-service.ts`).
export type CardId = Brand<number, 'CardId'>;
export type GameSourceId = Brand<number, 'GameSourceId'>;
