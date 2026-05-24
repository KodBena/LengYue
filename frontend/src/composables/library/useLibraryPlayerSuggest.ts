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
import type { Ref } from 'vue';
import { libraryService } from '../../services/library-service';
import type { PlayerCount } from '../../types';

export interface LibraryPlayerSuggest {
  /**
   * Cached player list with per-player game counts. `null` while
   * the initial fetch is in flight. The two consumers — the
   * autocomplete dropdown in the per-color filter inputs and the
   * two-column accordion in the Library tab — share this single
   * cache.
   */
  readonly players: Readonly<Ref<readonly PlayerCount[] | null>>;

  /** True while a fetch is in flight; the UI may grey out the input. */
  readonly loading: Readonly<Ref<boolean>>;

  /**
   * Filter the cached list to players whose name contains
   * `prefix` (case-insensitive substring match). Returns at most
   * `limit` results (default 20). The cache's order — frequency
   * then alphabetical — is preserved, so common players appear
   * first in the dropdown. Returns name strings only; the
   * autocomplete dropdown doesn't surface counts.
   *
   * Returns an empty array when the cache hasn't loaded yet —
   * the UI can show "loading…" or simply nothing during that
   * window; both are honest.
   */
  suggest: (prefix: string, limit?: number) => readonly string[];

  /**
   * Fetch (or refetch) the player list. Called once at mount and
   * once after every import to refresh the cache with newly-seen
   * names.
   */
  refresh: () => Promise<void>;
}

const DEFAULT_SUGGEST_LIMIT = 20;

export function useLibraryPlayerSuggest(): LibraryPlayerSuggest {
  const players = ref<readonly PlayerCount[] | null>(null);
  const loading = ref(false);

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      players.value = await libraryService.listPlayers();
    } finally {
      loading.value = false;
    }
  }

  function suggest(prefix: string, limit: number = DEFAULT_SUGGEST_LIMIT): readonly string[] {
    const pool = players.value;
    if (pool === null) return [];
    if (prefix === '') return pool.slice(0, limit).map(p => p.name);
    const needle = prefix.toLowerCase();
    const out: string[] = [];
    for (const p of pool) {
      if (p.name.toLowerCase().includes(needle)) {
        out.push(p.name);
        if (out.length >= limit) break;
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
