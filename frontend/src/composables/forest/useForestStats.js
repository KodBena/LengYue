/**
 * src/composables/forest/useForestStats.ts
 *
 * The effectful boundary for the Browse forest's data source. Wraps
 * `backendService.getForestStats` so the ForestDirectory component reads
 * its roots through a composable rather than importing the backend service
 * singleton directly (frontend CLAUDE.md layering). The component owns the
 * `roots` ref and the refresh choreography; only the round-trip lives here.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — speaks `ForestStat`, the
 * Browse/card-forest vocabulary.
 *
 * License: Public Domain (The Unlicense)
 */
import { backendService } from '../../services/backend-service';
export function useForestStats() {
    /** Fetch the forest roots/stats — the Browse directory's data source. */
    function fetchForestStats() {
        return backendService.getForestStats();
    }
    return { fetchForestStats };
}
