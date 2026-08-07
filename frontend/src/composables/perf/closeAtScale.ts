/**
 * src/composables/perf/closeAtScale.ts
 *
 * The `close-at-scale` performance scenario: build a large board rail
 * (~230 boards, each forwarded to move 50) and then close every board in the
 * heaviest order while the trace records, so the board-count-scaling costs of
 * the close path surface at a scale the bounded harnesses never reach.
 *
 * Why this scenario exists. The 2026-06-12 jank-extended study validated the
 * SPA at 16 boards (p50 ~14 ms, no regression). The close / switch path has
 * several costs that are negligible at 16 but scale with the open-board count —
 * the whole-workspace persistence serialization, the two per-board-watcher
 * reconcile loops (`useAutoSaveAnalyses` / `useAppBootstrap`, fired on
 * `boardsSetVersion`), and the stability-trajectory purge's all-keys scan. This
 * scenario exercises them an order of magnitude past the studied regime so the
 * profile shows which actually dominates at scale.
 *
 * Resolved suspect (this capture's original dominant cost). The first
 * close-at-scale run found the SyncService deep-watch re-traversal of the
 * per-board `store.session` cells (`session.reviews`, `session.ui.cardTreeNav`,
 * `session.ui.forestNav.selection`) dominating — O(open-board count) per fire,
 * O(N²) over a close-all. That `{ deep: true }` traversal of `store.session`
 * was replaced by a shallow `sessionVersion` counter watch (work-status item
 * `perf-syncservice-deep-watch-session`; see `sessionVersion` in
 * `store/index.ts`), so
 * the cost is gone. The scenario stays as the regression guard for it and to
 * surface whichever of the remaining costs above now leads.
 *
 * Heaviest close order (deliberate, documented). The loop always closes the
 * board at index 0, which is also the active board (set before the loop):
 *   - Closing index 0 maximises the array-splice shift — `store.boards.splice(0,
 *     1)` shifts every remaining element (O(N) per close, O(N²) over the run),
 *     vs O(1) when closing the tail.
 *   - Closing the ACTIVE board exercises `closeBoard`'s active-index
 *     reselection every iteration (when active === idx === 0 the index clamps
 *     back to 0, so the next close repeats the pattern — the front board stays
 *     active and gets closed again).
 * This is strictly the heaviest single-board-at-a-time teardown order, so a
 * smell that only shows up under maximal teardown churn has the best chance of
 * appearing.
 *
 * One close per frame. Each close yields a frame before the next so Vue's
 * scheduler flushes (running the SyncService deep-watch and the per-board
 * reconcile watchers) and a paint occurs between closes — exactly the shape of
 * a user closing boards one at a time. Closing all 230 in a single synchronous
 * burst would let Vue dedupe those watchers to a single end-of-burst flush,
 * hiding the per-close reactive cost the capture is meant to measure.
 *
 * Persistence is left ON (it is a prime suspect, not a confound): the
 * SyncService 1000 ms debounce means the whole-workspace serialization fires
 * AFTER the close loop, captured in the `drain` window — so the synchronous
 * per-close fan-out (in `closeall`) and the debounced serialization (in `drain`)
 * land in separate trace windows rather than confounding each other.
 *
 * Teardown etiquette. `closeBoard` floors the workspace at one board (it
 * replaces the last board with a fresh empty one rather than removing it), so
 * the loop runs while `> 1` and the run ends on a single fresh board; the
 * `finally` `ctx.resetWorkspace()` guarantees a clean single-board workspace
 * even on throw. The capture is additive-neutral: no rail boards survive it.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). It builds boards and drives
 * the board collection's teardown — game-tree vocabulary — but writes no KataGo
 * wire settings and runs no analysis (unlike `jankExtended.ts`, which is B3 for
 * exactly that reason). Dev-only; makes no perf *claim* (ADR-0009): it is the
 * capture harness, not a measured result.
 *
 * License: Public Domain (The Unlicense)
 */
import { store, closeBoard, setActiveBoard } from '../../store';
import { setUpManyBoards, MANY_BOARDS_TARGET, PARK_MOVE } from './jankSubstrate';
import type { PerfScenario, ScenarioContext } from './types';

// magic-literal: settle windows (ms). 2000 ms comfortably covers the
// SyncService default 1000 ms persistence debounce plus the stringify/PUT, so
// (a) the post-setup tail has drained before the close loop starts, and (b) the
// final debounced whole-workspace persist is captured inside the `drain` window.
const SETTLE_MS = 2000;

// magic-literal: per-close frame-yield safety cap (ms). The loop yields a real
// animation frame between closes so a paint happens (faithful one-close-per-
// frame shape); the cap resolves the yield anyway if rAF is throttled (e.g. the
// window loses foreground), so the loop can never stall.
const FRAME_CAP_MS = 100;

/** Resolve on the next animation frame, or after FRAME_CAP_MS — whichever is
 *  first. The cap is a stall guard against rAF throttling, never the normal
 *  path on a foregrounded headed capture window. */
function yieldFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, FRAME_CAP_MS);
  });
}

/**
 * The `close-at-scale` scenario factory. Built as a `PerfScenario` so it
 * registers in the existing registry and `runScenario` brackets it with the
 * `scenario:close-at-scale:start/end` marks the parser auto-windows on. Builds
 * its own rail (via the jank substrate, which bypasses `ctx.loadSgf`) and
 * manages its own cleanup, so it is registered as a pre-built scenario rather
 * than via the `prepareAnalysis` preamble.
 */
export function closeAtScaleScenario(opts: { readonly targetBoards?: number } = {}): PerfScenario {
  const target = opts.targetBoards ?? MANY_BOARDS_TARGET;
  return {
    name: 'close-at-scale',
    async run(ctx: ScenarioContext): Promise<void> {
      try {
        // ── Phase 1: build the rail (~target boards, each at move 50) ────────
        ctx.mark('setup:start');
        const built = await setUpManyBoards(target, PARK_MOVE);
        ctx.mark('setup:end', { built, boards: store.boards.length });

        // ── Phase 2: pre-settle — drain the post-setup persistence tail so the
        // close phase is not confounded by setup's trailing debounced PUT ─────
        ctx.mark('presettle:start');
        await new Promise<void>((r) => setTimeout(r, SETTLE_MS));
        ctx.mark('presettle:end');

        // ── Phase 3: close every board in the heaviest order ─────────────────
        // Front board (index 0), made active, closed one-per-frame. closeBoard
        // floors at one board, so the loop terminates at length 1.
        setActiveBoard(0);
        await ctx.measure('closeall', async () => {
          let i = 0;
          while (store.boards.length > 1) {
            const remaining = store.boards.length;
            const boardId = store.boards[0].id;
            // Per-close mark: the inter-mark interval ≈ that close's cost, and
            // `remaining` lets the analysis bucket cost against open-board count
            // (early closes at ~230 remaining vs late closes near 1).
            ctx.mark('close', { i, remaining, boardId });
            closeBoard(boardId);
            i++;
            await yieldFrame();
          }
          ctx.mark('closed', { closes: i, boardsLeft: store.boards.length });
        });

        // ── Phase 4: drain — capture the final debounced whole-workspace
        // persist of the (now single-board) workspace inside the trace ───────
        ctx.mark('drain:start');
        await new Promise<void>((r) => setTimeout(r, SETTLE_MS));
        ctx.mark('drain:end');
      } finally {
        // Clean teardown even on throw — leave a single fresh empty board (the
        // app's baseline), additive-neutral on the persisted workspace.
        ctx.resetWorkspace();
      }
    },
  };
}
