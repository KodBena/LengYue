/**
 * src/composables/board/useFollowMePonder.ts
 *
 * "Follow Me" ponder watcher, extracted from App.vue (work-status
 * item app-vue-style-and-wiring-extraction; the history-lessons
 * audit's arch-ergonomics findings sketched it as a sibling of
 * useEngineResponder). Automatically restarts pondering when the
 * user navigates or plays a move on the *currently active* board.
 *
 * Call once from App.vue's setup: the watcher binds to App's effect
 * scope and lives for the app lifetime (Vue reclaims it with the
 * instance, so no explicit teardown is owed — the app root never
 * unmounts; in tests, `withSetup` provides the disposing host).
 *
 * Extraction note: this was App.vue's single direct service import —
 * the annotated wiring-file exemption on the component→services
 * boundary lint. Moving the watcher here retires that exemption:
 * composables are the sanctioned home for service orchestration
 * (frontend/CLAUDE.md "Architectural shape").
 *
 * License: Public Domain (The Unlicense)
 */

import { watch } from 'vue';
import { activeBoard } from '../../store';
import { analysisService } from '../../services/analysis-service';

export function useFollowMePonder(): void {
  // The reactive expression includes the active board's id so a board
  // switch (different active tab) can be distinguished from same-board
  // navigation: switching tabs is NOT a "follow me" trigger and must
  // not re-issue the new tab's ponder query — doing so would cancel and
  // re-subscribe a perfectly good in-flight ponder, churning the
  // proxy's canonical (and, with multi-tab coalescing, masking the
  // proxy's stranded-query / coalescing-transparency behaviour during
  // testing).
  watch(
    () => activeBoard.value
      ? { id: activeBoard.value.id, nodeId: activeBoard.value.currentNodeId }
      : null,
    (curr, prev) => {
      if (!curr || !prev) return;            // mount, unmount, or no active board
      if (curr.id !== prev.id) return;       // board switch — not a "follow me" trigger
      if (curr.nodeId === prev.nodeId) return;
      if (analysisService.isPondering(curr.id)) {
        analysisService.analyzeActiveNode(curr.id, 'ponder');
      }
    }
  );
}
