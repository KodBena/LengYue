/**
 * src/types/lineage.ts
 *
 * Card-tree / forest browse domain: the backend-sourced stats
 * projections (`ForestStat` / `TagStat`), the lineage-tree shapes
 * for the two card-tree endpoints, the projected display-tree node
 * roles, and the structured `CardTreeOverflowError` class (a runtime
 * export). Carved from the single-file `src/types.ts` (2026-06-10,
 * history-lessons audit §3.15); bodies are verbatim from the
 * pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { CardId, GameSourceId } from './ids';

// ── Value Objects (readonly preserved) — backend-sourced stats ────────────────
//
// camelCase domain projections of the `/stats/forests` and `/stats/tags`
// wire shapes. The ACL at `services/backend-service.ts` translates between
// these and the generated `components['schemas']['ForestStat'|'TagStat']`
// wire types. Branded ids (`CardId`, `GameSourceId`) replace raw `number`
// at the boundary; the wire's nullable string metadata (description,
// player names) is preserved as `string | null` so consumers can choose
// how to surface "no metadata" rather than the ACL silently coercing per
// ADR-0002.

export interface ForestStat {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  readonly description: string | null;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly totalCards: number;
  readonly totalReviews: number;
  readonly averageRecall: number;
}

// `TagStat`'s wire and domain shapes are field-for-field identical (no
// snake_case to translate, no ids to brand — counts stay bare per the
// "brand the meaningful, not the trivial" pattern). The ACL's
// `mapTagStat` is therefore structurally redundant today; it exists as
// a forward-looking indirection point so a future wire rename or added
// field can be absorbed at the boundary rather than rippling through
// consumers.
export interface TagStat {
  readonly name: string;
  readonly count: number;
}

// ── Value Objects (readonly preserved) — Card-tree domain ─────────────────────
//
// Camel-case projections of the wire shapes for the two card-tree
// endpoints (POST /lineage/resolve-roots, POST /lineage/tree-by-root).
// The ACL at `services/backend-service.ts` translates between these and
// the generated `components['schemas']['*']` wire types from
// `types/backend.ts`. Branded ids (`CardId`, `GameSourceId`) replace
// raw `number` so the rest of the app cannot confuse a card id with a
// game-source id.
//
// The structure-only `CardLineageNode` mirrors the backend's `TreeNode`:
// `id` and `children` only, no per-card metadata. Per-card data
// (SGF, recall, palette etc.) is fetched separately via
// `fetchCard(cardId)` and merged in at the render boundary.

export interface CardLineageNode {
  readonly id: CardId;
  readonly children: CardLineageNode[];
}

export interface RootGroup {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  // Subset of the resolve-roots input that descends from this root, in
  // input order. Useful for the consumer that wants to associate
  // pipeline-result cards with the tree they belong in.
  readonly cardIdsInTree: CardId[];
}

export interface ResolveRootsResult {
  readonly roots: RootGroup[];
  // Input ids the backend could not match (not owned, or not present).
  // The wire contract guarantees `roots` ∪ `unmatchedCardIds` partitions
  // the original input — the caller can decide how loud to be about a
  // miss, but never has to wonder where an id went.
  readonly unmatchedCardIds: CardId[];
}

export interface CardLineageTree {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  readonly tree: CardLineageNode;
}

// Per-node role in the projected display tree (see card-tree-frontend-spec).
// `active` — present in the input active set; visually loud.
// `context` — not active, but on a path to an active descendant; quiet
//             default rendering ("structural connective tissue").
// `stub`    — single-subtree summary glyph for a cold region with a
//             real-card head; click expands.
// `bucket`  — synthetic node grouping multiple cold leaves of the same
//             parent into one glyph; click expands into individuals.
export type CardTreeNodeRole = 'active' | 'context' | 'stub' | 'bucket';

// Structured 422 from POST /lineage/tree-by-root. The backend reports
// `actual_size` exactly so the UI can say "this game has N nodes; cap
// is M — increase or narrow." Per ADR-0002, no silent truncation.
export class CardTreeOverflowError extends Error {
  readonly rootCardId: CardId;
  readonly actualSize: number;
  readonly maxNodes: number;
  constructor(rootCardId: CardId, actualSize: number, maxNodes: number) {
    super(
      `Card-tree at root ${rootCardId} exceeds max_nodes ` +
      `(actual ${actualSize} > cap ${maxNodes})`,
    );
    this.name = 'CardTreeOverflowError';
    this.rootCardId = rootCardId;
    this.actualSize = actualSize;
    this.maxNodes = maxNodes;
  }
}
