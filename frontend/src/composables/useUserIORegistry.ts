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

// Keys this composable owns. Membership decides both whether to
// `preventDefault` synchronously (the browser's default-action
// gate runs before the event-loop returns to us, so the suppress
// decision cannot be deferred into the rAF tick) and whether to
// route to the action dispatch at all.
const HANDLED_KEYS = new Set<string>([
  'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
  'Home', 'End',
  ' ',
  'm', 'M', 'c', 'C', 'd', 'D', 'l', 'L',
]);

// Subset of HANDLED_KEYS whose action is rAF-coalesced. Holding
// a navigation key under OS key-repeat back-pressures into at
// most one nav step per browser frame — under heavier downstream
// cost where rAF can't keep up, intermediate steps drop rather
// than queue. Toggles (space / m / c / d / l) stay synchronous:
// one keypress is one toggle, and rAF-coalescing would
// unpredictably drop presses depending on frame boundaries.
// Mirrors `useScopedScroll`'s wheel-event posture. Diagnosed in
// `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug B.
const COALESCED_NAV_KEYS = new Set<string>([
  'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
  'Home', 'End',
]);

export function useUserIORegistry() {
  const nav = useNavigation();

  // rAF coalesce state for navigation keys. `pendingNavKey` is
  // the most-recent navigation key whose action is queued for
  // the next frame; `rafId` is the scheduled callback handle so
  // it can be cancelled (latest-key-wins) and torn down at
  // unmount.
  let rafId: number | null = null;
  let pendingNavKey: string | null = null;

  // Single dispatch — same switch the original handler had,
  // called either synchronously (toggles) or from inside an rAF
  // callback (nav). Re-checks `activeBoard.value` at execution
  // time because the rAF tick fires one frame after the keydown
  // event; the active board may have changed in the interim,
  // matching `useScopedScroll`'s posture of reading current
  // state at fire time.
  const runAction = (key: string) => {
    if (!activeBoard.value) return;
    const boardId = activeBoard.value.id;

    switch (key) {
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
      // variation path. The browser's default Home / End
      // bindings (scroll-to-top / scroll-to-bottom) are
      // pre-empted via the synchronous `e.preventDefault()` in
      // the handler below for the same reason Arrow keys are —
      // the board surface owns these motions while a board is
      // active.
      case 'Home':
        nav.home();
        break;
      case 'End':
        nav.end();
        break;

      // ── Engine Toggle ──
      // Ponder toggle. The predicate / start / stop trio is
      // per-kind: spacebar only ever creates or releases a
      // ponder query, never touches any range / replay running
      // on the same board. `isPondering(boardId)` reads the
      // per-board active-query set in the analysis service;
      // the stop branch delegates to that service to release
      // exactly the ponder-mode query.
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
      // `decodedOwnership` being non-null, so toggling on
      // without an ownership-bearing packet shows nothing and
      // the user re-runs analysis explicitly when they want
      // fresh data. The rationale for the no-auto-restart
      // posture is in commit 6a22369 (2026-05-08): a
      // config-toggle that auto-fires an expensive engine
      // query is the costly-and-unexpected side-effect class
      // ADR-0002 is shaped to make explicit.
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
    }
  };

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
    if (!HANDLED_KEYS.has(e.key)) return;

    // preventDefault synchronously — the browser's default-action
    // decision happens before the event loop returns to us, so
    // the suppress must precede the rAF schedule. Mirrors
    // `useScopedScroll.ts`.
    e.preventDefault();

    if (COALESCED_NAV_KEYS.has(e.key)) {
      pendingNavKey = e.key;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const key = pendingNavKey;
        pendingNavKey = null;
        rafId = null;
        if (key !== null) runAction(key);
      });
    } else {
      runAction(e.key);
    }
  };

  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    // Drop any pending nav step queued by the last keydown.
    // Without this, the rAF callback would fire after the
    // listener is removed and execute against a teardown state
    // the closure no longer rightly reaches. Pair with the
    // `requestAnimationFrame` schedule in the handler above.
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pendingNavKey = null;
    }
  });
}
