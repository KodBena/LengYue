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

      // ── Engine Toggle ──
      case ' ':
        if (store.engine.status === 'connected') {
          if (store.engine.activeMode[boardId] === 'ponder') {
            analysisService.stopBoardAnalysis(boardId);
          } else {
            analysisService.analyzeActiveNode(boardId, 'ponder');
          }
        }
        break;

      case 'm':
      case 'M':
        store.session.ui.showMoveSuggestions = !store.session.ui.showMoveSuggestions;
        break;

      // Ownership overlay sub-modes — three orthogonal toggles. The
      // watcher in useAppBootstrap restarts any active analyses so the
      // shared `includeOwnership` wire flag flips correctly when the
      // first sub-mode turns on or the last one turns off.
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
