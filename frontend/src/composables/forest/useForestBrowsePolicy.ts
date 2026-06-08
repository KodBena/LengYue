/**
 * src/composables/forest/useForestBrowsePolicy.ts
 *
 * Translates the Forest Directory navigator's persisted selection
 * into right-pane fetch behaviour. Subscribes to `nav.selection` +
 * `nav.nodes` and dispatches to `tree.loadBrowse` /
 * `loadBrowseForest` / `clearBrowse` based on the kind:
 *
 *   - null:           clear the right pane. `clearBrowse` is
 *                     ownership-aware — it clears only browse-loaded
 *                     content, leaving a slot a deck-pipeline or review
 *                     owns intact (see `useCardTreeData`'s `clearBrowse`
 *                     and `frontend/docs/notes/board-scope.md`).
 *   - root:           single-tree loadBrowse (existing path).
 *   - game ≤ cap:     multi-tree loadBrowseForest.
 *   - game > cap:     surface the cap as a UX message in
 *                     `browseError`; right pane stays empty with
 *                     guidance to pick a specific root in the
 *                     navigator.
 *
 * Why a composable rather than an inline watcher in ForestDirectory:
 * the policy is a real concept ("how does the navigator drive the
 * right pane"), and naming it via a composable makes it findable
 * when future contributors ask "how does selection get translated
 * to a fetch?" The cap policy lives at the boundary between
 * navigation state and data-layer effects, which is exactly the
 * shape composables encapsulate well.
 *
 * Why watch both `nav.selection` AND `nav.nodes`: the game-kind
 * branch needs `nav.nodes` to look up `game.roots.length` against
 * the cap. `nav.nodes` resolves asynchronously after `forestStats`
 * loads in the parent's onMounted; without the dual-source watch,
 * an `immediate: true` fire on mount with empty nodes wouldn't
 * refire when nodes populate. Vue's tuple-source watcher refires
 * when either ref's identity changes.
 *
 * Why `browseError` is owned by the parent: the policy writes to
 * it but doesn't own its lifecycle (the parent's right-pane
 * empty-state cascade reads it alongside `tree.error`). Distinct
 * from `tree.error` (fetch failures) — `browseError` is a UX cap,
 * not a fetch failure; both are checked at render time.
 *
 * License: Public Domain (The Unlicense)
 */

import { watch, type Ref } from 'vue';
import { MULTI_ROOT_DISPLAY_CAP } from '../../engine/constants';
import type { CardTreeData } from '../cards/useCardTreeData';
import type { ForestNavigation } from './useForestNavigation';

export function useForestBrowsePolicy(
  nav: ForestNavigation,
  tree: CardTreeData,
  browseError: Ref<string | null>,
): void {
  watch(
    [() => nav.selection.value, () => nav.nodes.value],
    ([sel]) => {
      if (!sel) {
        browseError.value = null;
        // `clearBrowse` clears ONLY browse-owned content; a slot owned by the
        // deck pipeline or a review survives this null-selection clear (the
        // producer-ownership fix — the slot has three producers and this is
        // its one clearer). See `useCardTreeData.clearBrowse`.
        tree.clearBrowse();
        return;
      }
      if (sel.kind === 'root') {
        browseError.value = null;
        void tree.loadBrowse(sel.rootCardId);
        return;
      }
      // Game selection — resolve the matching node to read its rootCount.
      const game = nav.nodes.value.find(g => g.gameSourceId === sel.gameSourceId);
      if (!game) {
        // Nodes haven't loaded yet (the watch refires when they
        // do) or the game is gone. Clear either way; fail-quiet
        // is fine — the selection is visible in the nav once
        // nodes resolve, or stays dangling if the game vanished.
        browseError.value = null;
        tree.clearBrowse();
        return;
      }
      if (game.roots.length > MULTI_ROOT_DISPLAY_CAP) {
        browseError.value =
          `This game has ${game.roots.length} roots — too many to auto-load. ` +
          `Expand the game in the navigator and select a specific root.`;
        tree.clearBrowse();
        return;
      }
      browseError.value = null;
      void tree.loadBrowseForest(game.roots.map(r => r.rootCardId));
    },
    { immediate: true },
  );
}
