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
// Structured 422 from POST /lineage/tree-by-root. The backend reports
// `actual_size` exactly so the UI can say "this game has N nodes; cap
// is M — increase or narrow." Per ADR-0002, no silent truncation.
export class CardTreeOverflowError extends Error {
    rootCardId;
    actualSize;
    maxNodes;
    constructor(rootCardId, actualSize, maxNodes) {
        super(`Card-tree at root ${rootCardId} exceeds max_nodes ` +
            `(actual ${actualSize} > cap ${maxNodes})`);
        this.name = 'CardTreeOverflowError';
        this.rootCardId = rootCardId;
        this.actualSize = actualSize;
        this.maxNodes = maxNodes;
    }
}
