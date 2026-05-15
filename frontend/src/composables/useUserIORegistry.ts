/**
 * src/composables/useUserIORegistry.ts
 * Unified Input Manager (Hardware Adapter).
 * Maps hardware events to Domain Verbs.
 * License: Public Domain (The Unlicense)
 */

import { onMounted, onUnmounted } from 'vue';
import { store, activeBoard } from '../store';
import { useNavigation } from './useNavigation';
import { analysisService } from '../services/analysis-service';

export function useUserIORegistry() {
  const nav = useNavigation();

  const handleKeyDown = (e: KeyboardEvent) => {
    // Context Guard: ignore hardware events when user is typing.
    //
    // The form-control branches (HTMLInputElement, HTMLTextAreaElement,
    // HTMLSelectElement) cover native widgets that own their own
    // keystrokes. The contenteditable branch covers rich-text editing
    // surfaces — most importantly CodeMirror 6's `.cm-content` div used
    // by PaletteEditor and CardSetEditor, which the textarea check
    // misses because the editable surface is a contenteditable div.
    // `HTMLElement.isContentEditable` already accounts for inheritance,
    // so a single check on `e.target` covers any nested element inside
    // an editable region.
    const target = e.target;
    if (target instanceof HTMLInputElement) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLElement && target.isContentEditable) return;
    if (!activeBoard.value) return;

    const boardId = activeBoard.value.id;
    let handled = true;

    switch (e.key) {
      // ── Depth Navigation (Vertical) ──
      case 'ArrowDown':
        nav.next();
        break;
      case 'ArrowUp':
        nav.prev();
        break;
      
      // ── Variation Navigation (Lateral) ──
      case 'ArrowLeft':
        nav.variation(-1);
        break;
      case 'ArrowRight':
        nav.variation(1);
        break;

      // ── Path Endpoints ──
      // Home / End jump to the first / last node of the active
      // variation path. The browser's default Home / End bindings
      // (scroll-to-top / scroll-to-bottom) are pre-empted via
      // `e.preventDefault()` below for the same reason Arrow keys
      // are — the board surface owns these motions while a board
      // is active.
      case 'Home':
        nav.home();
        break;
      case 'End':
        nav.end();
        break;

      // ── Engine Toggle ──
      // Ponder toggle. The predicate / start / stop trio is
      // per-kind: spacebar only ever creates or releases a ponder
      // query, never touches any range / replay running on the
      // same board. `isPondering(boardId)` reads the per-board
      // active-query set in the analysis service; the stop branch
      // delegates to that service to release exactly the
      // ponder-mode query.
      case ' ':
        if (store.engine.status === 'connected') {
          if (analysisService.isPondering(boardId)) {
            analysisService.stopPonderOnBoard(boardId);
          } else {
            analysisService.analyzeActiveNode(boardId, 'ponder');
          }
        }
        break;

      case 'm':
      case 'M':
        store.session.ui.showMoveSuggestions = !store.session.ui.showMoveSuggestions;
        break;

      // Ownership overlay sub-modes — three orthogonal toggles.
      // Pure display preferences: flipping a sub-mode does NOT
      // auto-fire a fresh analysis. `BoardWidget.vue`'s
      // `continuousCells` / `dotsCells` / `livenessCells` gate
      // rendering on both the toggle state AND on
      // `decodedOwnership` being non-null, so toggling on without
      // an ownership-bearing packet shows nothing and the user
      // re-runs analysis explicitly when they want fresh data.
      // The rationale for the no-auto-restart posture is in
      // commit 6a22369 (2026-05-08): a config-toggle that
      // auto-fires an expensive engine query is the
      // costly-and-unexpected side-effect class ADR-0002 is
      // shaped to make explicit.
      //   'c' — continuous adjacent-square territory fill
      //   'd' — discrete confidence dots on empty intersections
      //   'l' — liveness highlight on disagreeing stones
      case 'c':
      case 'C':
        store.session.ui.overlayLayers.ownership.continuous = !store.session.ui.overlayLayers.ownership.continuous;
        break;
      case 'd':
      case 'D':
        store.session.ui.overlayLayers.ownership.dots = !store.session.ui.overlayLayers.ownership.dots;
        break;
      case 'l':
      case 'L':
        store.session.ui.overlayLayers.ownership.liveness = !store.session.ui.overlayLayers.ownership.liveness;
        break;

      default:
        handled = false;
    }

    if (handled) e.preventDefault();
  };

  onMounted(()   => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));
}
