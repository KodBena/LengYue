/**
 * src/composables/forest/useForestNavigation.ts
 *
 * State and tree-shaping for the Forest Directory file-manager-style
 * navigator. Pure-ish: takes a reactive `Ref<ForestStat[]>` and the
 * active `Ref<BoardId | null>`, returns a `nodes` ComputedRef that
 * groups stats by `gameSourceId` into a games → roots hierarchy with
 * per-game aggregates, plus the persisted expansion (workspace-global)
 * and selection (per-board, keyed on the passed board — schema 59) as
 * read-side ComputedRefs + named mutators writing through
 * `store.session.ui.forestNav`.
 *
 * No backend calls; no effects beyond store writes. The composable
 * is the typed seam between the navigator's persistence shape
 * (`ForestNavState` in `types.ts`, schema-version 21) and the
 * navigator's render shape (`ForestNavGameNode` / `ForestNavRootNode`
 * here, consumed by the SFC). Card-level expansion is intentionally
 * out of scope for v1 — the union and mutator surface are designed to
 * admit it later without a breaking change to existing callers.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { store } from '../../store';
// ── NodeId helpers ───────────────────────────────────────────────────────────
//
// Template-literal types narrow on string-literal templates but not
// on `\`game:${number}\`` where `number` is a runtime value (the
// branded id) — TypeScript widens to `string`. The cast back to
// `NavNodeId` is justified by the helpers themselves: format is
// guaranteed by construction. The helpers are exported so consumers
// (and PR 2's SFC) can produce node ids without re-deriving the
// format from scratch.
export function gameNodeId(gameSourceId) {
    return `game:${gameSourceId}`; // brand mint: `game:`-prefixed NavNodeId (this fn is the factory)
}
export function rootNodeId(rootCardId) {
    return `root:${rootCardId}`; // brand mint: `root:`-prefixed NavNodeId (this fn is the factory)
}
// ── Main entry point ─────────────────────────────────────────────────────────
export function useForestNavigation(forestStats, 
// The board whose navigator selection this composable reads/writes.
// `forestNav.selection` is per-board (schema 59); `expanded` is global,
// so the expansion mutators ignore this. `null` when no board is active —
// selection reads as null and `select` is a no-op.
boardIdRef) {
    const nodes = computed(() => groupByGameSource(forestStats.value));
    const expanded = computed(() => new Set(store.session.ui.forestNav.expanded));
    const selection = computed(() => {
        const id = boardIdRef.value;
        return id ? (store.session.ui.forestNav.selection[id] ?? null) : null;
    });
    function toggle(nodeId) {
        const current = store.session.ui.forestNav.expanded;
        store.session.ui.forestNav.expanded = current.includes(nodeId)
            ? current.filter(id => id !== nodeId)
            : [...current, nodeId];
    }
    function expandAll() {
        store.session.ui.forestNav.expanded = nodes.value.map(g => g.nodeId);
    }
    function collapseAll() {
        store.session.ui.forestNav.expanded = [];
    }
    function select(s) {
        // Per-board: write through the active board's slot in the selection map.
        // In-place add/delete on the reactive store is deep-watched by
        // SyncService (mirrors `cardTreeNav`'s mutators). `null` clears the slot;
        // an absent key reads back as no selection.
        const id = boardIdRef.value;
        if (!id)
            return;
        if (s === null) {
            delete store.session.ui.forestNav.selection[id];
        }
        else {
            store.session.ui.forestNav.selection[id] = s;
        }
    }
    return { nodes, expanded, selection, toggle, expandAll, collapseAll, select };
}
// ── Pure tree-shaping ────────────────────────────────────────────────────────
function groupByGameSource(stats) {
    // Insertion-order Map preserves the backend's stat ordering. Two
    // passes: first bucket stats by gameSourceId, then materialise
    // game nodes with aggregates. Single-pass is possible but would
    // require recomputing the aggregate as roots accumulate; the two-
    // pass shape is clearer and the input size (a few thousand stats
    // worst-case) doesn't motivate the optimisation.
    const grouped = new Map();
    for (const s of stats) {
        const list = grouped.get(s.gameSourceId);
        if (list)
            list.push(s);
        else
            grouped.set(s.gameSourceId, [s]);
    }
    const games = [];
    for (const [gameSourceId, gameStats] of grouped) {
        const roots = gameStats.map(stat => ({
            kind: 'root',
            nodeId: rootNodeId(stat.rootCardId),
            rootCardId: stat.rootCardId,
            gameSourceId: stat.gameSourceId,
            stat,
        }));
        games.push({
            kind: 'game',
            nodeId: gameNodeId(gameSourceId),
            gameSourceId,
            title: titleFor(gameStats),
            aggregate: aggregateFor(gameStats),
            roots,
        });
    }
    return games;
}
function titleFor(gameStats) {
    const firstNamed = gameStats.find(s => s.description?.trim());
    if (firstNamed?.description)
        return firstNamed.description.trim();
    // The game-source id is the only stable identifier when every
    // root has null metadata. Visible enough that the user can match
    // it against the backend if needed; not so prominent it pretends
    // to be a name. Renamed "Game source" → "Game ID" for brevity
    // alongside the CardTreeWidget header rename; the inline `#N`
    // chip in ForestTreeNav still handles the discoverability case
    // when a non-null description hides the id.
    return `Game ID #${gameStats[0]?.gameSourceId ?? '?'}`;
}
function aggregateFor(gameStats) {
    let totalCards = 0;
    let totalReviews = 0;
    let weightedRecall = 0;
    for (const s of gameStats) {
        totalCards += s.totalCards;
        totalReviews += s.totalReviews;
        weightedRecall += s.averageRecall * s.totalReviews;
    }
    return {
        rootCount: gameStats.length,
        totalCards,
        totalReviews,
        averageRecall: totalReviews > 0 ? weightedRecall / totalReviews : 0,
    };
}
