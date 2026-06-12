/**
 * src/composables/library/useLibraryPlayerSuggest.ts
 *
 * In-memory player-name autocomplete source for the Library
 * filter inputs.
 *
 * Fetches the distinct, frequency-ordered player list once on
 * mount via `libraryService.listPlayers` and exposes a
 * synchronous `suggest(prefix)` projection over the cached
 * array. After-import calls `refresh()` to refetch — the cache
 * lives on the composable instance, not in the persisted
 * workspace document (workspace is user-authored state; library
 * player names are imported data the backend is the source of
 * truth for).
 *
 * Case-insensitive substring match, ordering preserved from the
 * backend's frequency-then-alphabetical sort, so common players
 * surface first.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, shallowReadonly } from 'vue';
import { libraryService } from '../../services/library-service';
const DEFAULT_SUGGEST_LIMIT = 20;
export function useLibraryPlayerSuggest() {
    const players = ref(null);
    const loading = ref(false);
    async function refresh() {
        loading.value = true;
        try {
            players.value = await libraryService.listPlayers();
        }
        finally {
            loading.value = false;
        }
    }
    function suggest(prefix, limit = DEFAULT_SUGGEST_LIMIT) {
        const pool = players.value;
        if (pool === null)
            return [];
        if (prefix === '')
            return pool.slice(0, limit).map(p => p.name);
        const needle = prefix.toLowerCase();
        const out = [];
        for (const p of pool) {
            if (p.name.toLowerCase().includes(needle)) {
                out.push(p.name);
                if (out.length >= limit)
                    break;
            }
        }
        return out;
    }
    return {
        players: shallowReadonly(players),
        loading: shallowReadonly(loading),
        suggest,
        refresh,
    };
}
