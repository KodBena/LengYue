/**
 * src/composables/perf/useJankTest.ts
 *
 * Dev-only "jank test" harness for the docked thumbnail-preview path.
 * A human captures a Chrome DevTools performance profile while this
 * runs; the harness reproduces the worst-case stress the preview
 * rendering sees in practice:
 *
 *   - 16 boards loaded at once (15 random library games + one fixed
 *     long game — the 342-move Shusaku game), which fills the rail's
 *     thumb-list to the screen's tab budget.
 *   - the long game left at the root and AUTO-NAVIGATED continuously
 *     (main board + variation tree churning under the analysis path),
 *     every other board parked at move 50.
 *   - the docked hover preview SCRUBBED rapidly — synthetic
 *     mouseenter / mouseleave dispatched on the real `BoardTab` root
 *     elements, so the stimulus flows through the genuine
 *     `@hover-enter`/`@hover-leave` → `previewBoardId` → `MiniBoard`
 *     mount / unmount path rather than poking internal state. That is
 *     the surface a thumbnail-render fix changes, so the harness must
 *     drive it the way a user's pointer would.
 *
 * The board-setup + Shusaku lookup + hover-scrub pieces live in
 * `jankSubstrate.ts` (extracted 2026-06-12), shared with the extended
 * overlay-/query-stress scenario (`jankExtended.ts`); this file is the
 * dev-toolbar toggle orchestration over them. The relaunch-on-completion
 * auto-nav loop and the ~18 s bounded duration are this harness's own
 * shape — the extended scenario uses a single root→leaf pass instead.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). It loads SGF bodies,
 * navigates the active line, and reads the board collection — game-tree
 * vocabulary — but no Go *rules*. Dev-only; makes no perf *claim*
 * (ADR-0009): it is a capture harness, not a measured result.
 *
 * License: Public Domain (The Unlicense)
 */
import { ref, readonly, onUnmounted } from 'vue';
import { store, setActiveBoard } from '../../store';
import { runAutonav, type AutonavHandle } from './autonav';
import { setUpRail, forwardToMove, startHoverScrub } from './jankSubstrate';

/** Default bounded run length. The run also stops on a second click. */
const DEFAULT_DURATION_MS = 18_000;

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Dev-only composable: a single `toggle()` that starts / stops the jank
 * test, plus an `isRunning` flag the button binds its label/state to.
 *
 * The orchestration:
 *   1. set up the 16-board rail (fixed Shusaku + 15 random; fail-loud if
 *      Shusaku absent) via `setUpRail`,
 *   2. make Shusaku the active board, parked at the root, and start a
 *      continuous (relaunching) auto-nav on it,
 *   3. concurrently scrub the thumbnail previewer at 20–50 ms cadence,
 *   4. run for ~18 s (or until toggled off) then tear the stimuli down.
 */
export function useJankTest() {
  const isRunning = ref(false);
  let autonav: AutonavHandle | null = null;
  let scrub: { stop: () => void } | null = null;
  let durationTimer: number | null = null;
  // Guards against re-entrancy while the async setup is in flight.
  let starting = false;

  function teardown(): void {
    if (durationTimer !== null) {
      window.clearTimeout(durationTimer);
      durationTimer = null;
    }
    scrub?.stop();
    scrub = null;
    autonav?.cancel();
    autonav = null;
    isRunning.value = false;
  }

  async function start(): Promise<void> {
    if (isRunning.value || starting) return;
    starting = true;
    try {
      // 1) Build the rail (Shusaku at root + 15 others at move 50). Fails
      //    loudly here before starting any stimulus if Shusaku is absent.
      const shusakuBoardId = await setUpRail();

      // 2) Auto-nav drives the ACTIVE board, so make Shusaku active. Hover
      //    only sets `previewBoardId`, never `activeBoardIndex`, so the
      //    active board stays Shusaku for the whole scrub.
      const shusakuIdx = store.boards.findIndex((b) => b.id === shusakuBoardId);
      if (shusakuIdx !== -1) setActiveBoard(shusakuIdx);

      isRunning.value = true;

      // Auto-nav walks the active line to its leaf, then resolves. A 342-move
      // game finishes in ~6 s at ~60 steps/s, well under the capture window —
      // so relaunch on each completion (rewinding to the root first) to keep
      // the main board + variation tree churning for the WHOLE run. The
      // `isRunning` guard stops the chain once teardown clears it; cancel()
      // resolves `done` synchronously, so a teardown mid-pass can't relaunch.
      // We pass `normalizeTab:false` — pinning the Analysis tab is for the
      // perf-capture protocol, not this preview-render stress; leave the
      // user's current tab in place.
      function runAutonavLoop(): void {
        autonav = runAutonav({ markPrefix: 'jank:autonav', normalizeTab: false });
        void autonav.done.then(() => {
          if (!isRunning.value) return;
          forwardToMove(shusakuBoardId, 0);
          runAutonavLoop();
        });
      }
      runAutonavLoop();

      // 3) Concurrent hover scrub + bounded duration.
      scrub = startHoverScrub();
      durationTimer = window.setTimeout(teardown, DEFAULT_DURATION_MS);
    } catch (err) {
      // Setup failed (most likely the Shusaku lookup or an auth 401 on the
      // library). Tear down whatever started and re-surface loudly.
      teardown();
      console.error('[jank-test] aborted:', err);
      throw err;
    } finally {
      starting = false;
    }
  }

  function toggle(): void {
    if (isRunning.value) teardown();
    else void start();
  }

  // The rAF autonav loop and the scrub timer outlive Vue's reactivity graph;
  // release both if the host unmounts mid-run.
  onUnmounted(teardown);

  return { isRunning: readonly(isRunning), toggle };
}
