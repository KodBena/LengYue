/**
 * src/composables/perf/jankExtended.ts
 *
 * The `jank-extended` performance scenario: the docked-thumbnail jank
 * stress (`jankSubstrate.ts`) composed with the board-overlay + streaming-
 * query stress the bare jank test omits. Commissioned 2026-06-12 (work-status
 * `perf-jank-extended-before-after`) because render-count / patch-count alone
 * is a deficient realtime probe and the original jank test never exercises the
 * on-board analysis overlays (move suggestions, liveness, transpositions,
 * ownership maps) nor a concurrent in-flight query.
 *
 * Protocol (fixed order; each phase emits a `scenario:jank-extended:*` mark so
 * the trace parser can segment the run):
 *
 *   1. cache clear   — `ctx.clearCache()` (proxy `clear_cache`); the engine
 *                      replay flags (`cache` / `lookup_cache`) are user
 *                      registry leaves left at their defaults (lookup_cache
 *                      off) per the cold-cache discipline in the
 *                      perf-capture normalization protocol.
 *   2. board setup   — the 16-board rail (fixed 342-move Shusaku + 15 random
 *                      at move 50), Shusaku active at the root.
 *   3. warm query    — a 200-visit full-line range query over Shusaku with
 *                      the transposition CAPABILITY enabled, run TO COMPLETION.
 *   4. overlays on   — move suggestions, liveness, transposition rings,
 *                      ownership map enabled explicitly and ASSERTED on
 *                      (fail-loud, ADR-0002) before any stress begins. Enabled
 *                      before the in-flight query so it carries
 *                      `includeOwnership: true` (the wire gate reads the
 *                      ownership overlay state at query construction).
 *   5. stress        — simultaneously: ONE root→leaf autonav pass (defines
 *                      run length), the blinking-popover stress, the 16-tab
 *                      hover-scrub, and an in-flight 100000-visit/node range
 *                      query fired at stress start (it MUST NOT finish during
 *                      the run — that is the point: the navigated board carries
 *                      a live query the whole time).
 *   6. disconnect    — when the autonav pass completes, the in-flight query is
 *                      cancelled INDIRECTLY by disconnecting from the KataGo
 *                      proxy (`analysisService.disconnect()` closes the WS,
 *                      which terminates every in-flight query). This is part of
 *                      the measured protocol, so it is marked.
 *
 * The transposition CAPABILITY (`engine.katago.useTransposition`, the wire
 * `transposition: {}` opt-in) is distinct from the transposition RING overlay
 * (`session.ui.showTranspositionRings`, the rendering toggle). The protocol's
 * step 3 names the capability; step 4's "transpositions" names the overlay.
 * Both are set here.
 *
 * Domain band (ADR-0003): Go/KataGo-bound (B3) — retagged from the perf
 * directory's default B2 at the ratchet's first catch (2026-06-12): this
 * scenario writes KataGo wire-capability settings
 * (`engine.katago.useTransposition`) and drives KataGo queries through the
 * analysis service, which is KataGo vocabulary, not generic game-tree
 * machinery. (The substrate it composes, `jankSubstrate.ts`, stays B2.)
 * Dev-only; makes no perf
 * *claim* (ADR-0009): it is the capture harness, not a measured result. See
 * docs/notes/perf-capture-normalization-protocol.md and
 * docs/worklog/2026-06-12-perf-jank-extended-protocol.md.
 *
 * License: Public Domain (The Unlicense)
 */
import { store, setActiveBoard } from '../../store';
import { mutateProfile } from '../../store/profile-owner';
import { analysisService } from '../../services/analysis-service';
import { useQueryTelemetry } from '../useQueryTelemetry';
import { runAutonav } from './autonav';
import { popoverStress, DEFAULT_POPOVER_TARGET } from './stimuli';
import { setUpRail, startHoverScrub } from './jankSubstrate';
import type { BoardId, QueryId } from '../../types';
import type { PerfScenario, ScenarioContext } from './types';

// magic-literal: warm-query per-node visit budget. 200 visits is the
// protocol's warm-up pass — enough to populate the overlays (ownership,
// suggestions, transposition clusters) and warm the analysis ledger, run to
// completion before the stress phase.
const WARM_VISITS = 200;

// magic-literal: in-flight-query per-node visit budget. 100000 visits/node is
// deliberately absurd so the query does NOT finish during the autonav pass —
// the navigated board must carry a live, never-completing query for the whole
// measured run, cancelled only by the end-of-run proxy disconnect.
const STRESS_VISITS = 100_000;

/**
 * The board-overlay toggles the protocol's step 4 requires ON. Three live
 * under `session.ui` directly (rendering toggles); the transposition CAPABILITY
 * lives under `profile.settings.engine.katago` (the wire opt-in). The ownership
 * map is represented by the `continuous` sub-mode of the ownership overlay
 * group — enabling any of `{continuous, dots, liveness}` makes `analyzeRange`
 * request `includeOwnership: true`, so the map has data to render.
 *
 * Liveness and the ownership map default OFF; move suggestions and the
 * transposition ring/capability default ON — but the protocol says assert,
 * not assume, so each is set and then verified.
 */
interface OverlayState {
  readonly showMoveSuggestions: boolean;
  readonly liveness: boolean;
  readonly ownershipContinuous: boolean;
  readonly showTranspositionRings: boolean;
  readonly useTransposition: boolean;
}

/** Read the current overlay/capability state into a plain snapshot. */
function readOverlayState(): OverlayState {
  const ui = store.session.ui;
  return {
    showMoveSuggestions: ui.showMoveSuggestions,
    liveness: ui.overlayLayers.ownership.liveness,
    ownershipContinuous: ui.overlayLayers.ownership.continuous,
    showTranspositionRings: ui.showTranspositionRings,
    useTransposition: store.profile.settings.engine.katago.useTransposition,
  };
}

/**
 * Enable every overlay the protocol names. Rendering toggles are direct
 * `session.ui` writes (the keybinding handlers in `keybindings-catalog.ts`
 * write them the same way — ephemeral session UI state, ADR-0001). The
 * transposition CAPABILITY is an owner-routed profile write (`mutateProfile`).
 */
function enableAllOverlays(): void {
  const ui = store.session.ui;
  ui.showMoveSuggestions = true;
  ui.overlayLayers.ownership.liveness = true;
  // The ownership "map": enabling the continuous sub-mode flips
  // `needsOwnership` so range queries request `includeOwnership: true`.
  ui.overlayLayers.ownership.continuous = true;
  ui.showTranspositionRings = true;
  // Transposition CAPABILITY (wire `transposition: {}` opt-in) — owner-routed
  // profile write. Default true, but set explicitly per the assert-not-assume
  // posture; the capability only engages when the proxy advertises it.
  mutateProfile((p) => { p.settings.engine.katago.useTransposition = true; });
}

/**
 * Assert every overlay/capability is ON, throwing (ADR-0002) with the
 * offending fields if any is off. The protocol requires the scenario verify
 * overlay state rather than assume it, so a capture that silently ran with an
 * overlay off — and therefore measured the wrong thing — fails loudly instead.
 */
function assertAllOverlaysOn(): void {
  const s = readOverlayState();
  const off = Object.entries(s)
    .filter(([, on]) => !on)
    .map(([k]) => k);
  if (off.length > 0) {
    throw new Error(
      `[jank-extended] overlay assertion failed: ${off.join(', ')} not enabled. ` +
        'The protocol requires move suggestions, liveness, ownership map, ' +
        'transposition rings, and the transposition capability all ON before ' +
        'the stress phase (ADR-0002 — fail loudly rather than measure the wrong thing).',
    );
  }
}

/** Restore the overlay/capability snapshot taken at scenario start. */
function restoreOverlayState(s: OverlayState): void {
  const ui = store.session.ui;
  ui.showMoveSuggestions = s.showMoveSuggestions;
  ui.overlayLayers.ownership.liveness = s.liveness;
  ui.overlayLayers.ownership.continuous = s.ownershipContinuous;
  ui.showTranspositionRings = s.showTranspositionRings;
  mutateProfile((p) => { p.settings.engine.katago.useTransposition = s.useTransposition; });
}

/** True iff `queryId` is still in the engine's in-flight telemetry set —
 *  the same reactive view `autonav.ts` reads per step. */
function inflightStillRunning(queryId: QueryId): boolean {
  return useQueryTelemetry().inFlight.value.some((q) => q.queryId === queryId);
}

/**
 * The `jank-extended` scenario factory. Built as a `PerfScenario` so it
 * registers in the existing registry and `runScenario` brackets it with the
 * `scenario:jank-extended:start/end` marks the parser auto-windows on. Board
 * cleanup is the scenario's own (the jank substrate creates boards directly,
 * not through `ctx.loadSgf`, so the context's created-board teardown doesn't
 * cover them): the final `ctx.resetWorkspace()` clears the rail after the
 * disconnect, additive-neutral on the persisted workspace.
 */
export function jankExtendedScenario(opts: {
  readonly proxyUrl?: string;
  readonly model?: string;
}): PerfScenario {
  return {
    name: 'jank-extended',
    async run(ctx: ScenarioContext): Promise<void> {
      // Snapshot overlay/capability state so the capture is neutral on the
      // user's settings (the adaptive toggle is already snapshot/restored by
      // connectEngine's own teardown; overlays are this scenario's to restore).
      const savedOverlays = readOverlayState();
      try {
        // ── Phase 1: cache clear ──────────────────────────────────────────
        // Connect FIRST (clearCache requires a connected engine), then clear.
        ctx.mark('connect:start');
        await ctx.connectEngine({ url: opts.proxyUrl, model: opts.model });
        ctx.mark('connect:end');

        ctx.mark('cacheclear:start');
        await ctx.clearCache();
        ctx.mark('cacheclear:end');

        // ── Phase 2: board setup ──────────────────────────────────────────
        ctx.mark('setup:start');
        const shusakuBoardId: BoardId = await setUpRail();
        const shusakuIdx = store.boards.findIndex((b) => b.id === shusakuBoardId);
        if (shusakuIdx === -1) {
          throw new Error('[jank-extended] Shusaku board vanished after rail setup');
        }
        setActiveBoard(shusakuIdx);
        ctx.mark('setup:end');

        // Enable overlays BEFORE the warm query so it requests ownership, and
        // the transposition capability is live for the warm query. (The
        // protocol orders the warm query at step 3 and overlays at step 4; we
        // enable the capability the warm query uses — and the ownership gate
        // read at query construction — before firing it, so the warm query is
        // a faithful "all overlays active" query rather than one that silently
        // omitted ownership/transposition. The fail-loud assertion still gates
        // the STRESS phase, per the protocol.)
        enableAllOverlays();

        // ── Phase 3: warm query (200 visits, transposition capability) ────
        // Run to completion: await the handle's `settled` promise (resolves
        // when the query leaves the telemetry in-flight set).
        ctx.mark('warmquery:start');
        const warm = ctx.analyzeRange(shusakuBoardId, { full: true, visits: WARM_VISITS });
        await warm.settled;
        ctx.mark('warmquery:end');

        // ── Phase 4: overlays asserted ON (fail-loud) ─────────────────────
        ctx.mark('overlays:start');
        assertAllOverlaysOn();
        ctx.mark('overlays:on');

        // ── Phase 5: stress ───────────────────────────────────────────────
        // Fire the never-completing in-flight query FIRST so it is live before
        // the autonav pass begins (the navigated board carries it the whole
        // run). Then spawn the popover stress and hover scrub, and drive ONE
        // root→leaf autonav pass — its completion defines the run length.
        ctx.mark('stress:start');
        const inflight = ctx.analyzeRange(shusakuBoardId, { full: true, visits: STRESS_VISITS });

        ctx.spawn(popoverStress(DEFAULT_POPOVER_TARGET));
        const scrub = startHoverScrub();

        // Single root→leaf pass; `normalizeTab:true` pins the dashboard tab
        // (Analysis + the default sub-tab, the other analysis scenarios'
        // convention) so the visible chart population is DETERMINISTIC across
        // runs AND across the two measured tree states. "Leave the dashboard
        // wherever it is" would mean wherever HYDRATION put it — and the
        // baseline tree fails to hydrate the shared persisted blob (schema
        // skew) while main hydrates it, so an unpinned tab could differ
        // systematically between the two states (coordinator review
        // amendment, 2026-06-12). The board overlays under test render on
        // the board regardless of which dashboard tab is pinned.
        await ctx.measure('drive', () =>
          runAutonav({ markPrefix: 'jankext:autonav', normalizeTab: true }).done,
        );

        scrub.stop();
        // Assert the in-flight query did NOT complete during the pass — the
        // whole point is that it stayed live until the disconnect.
        const stillInFlight = inflightStillRunning(inflight.queryId);
        ctx.mark('stress:end', { inflightStillRunning: stillInFlight });
        if (!stillInFlight) {
          console.warn(
            '[jank-extended] in-flight 100000-visit query finished before the autonav ' +
              'pass ended — the protocol expects it to stay live until the disconnect. ' +
              'Check the proxy is honouring maxVisits (a fast/cached upstream can drain it).',
          );
        }

        // ── Phase 6: indirect cancel by disconnecting from the proxy ──────
        // Closing the WS terminates every in-flight query — the protocol's
        // indirect cancel (NOT a stopQuery/terminate call). Marked because it
        // is part of the measured protocol. The in-flight handle is
        // intentionally NOT stop()'d — the disconnect is the cancel under test.
        ctx.mark('disconnect:start');
        analysisService.disconnect();
        await ctx.waitFor(() => store.engine.status === 'disconnected');
        ctx.mark('disconnect:end');
      } finally {
        // Clean up after the measured window so the cleanup churn is outside
        // the marks the parser windows on. Restore overlays FIRST (a
        // throw-free store write) so a `resetWorkspace` throw can't strand the
        // user's overlay/capability state clobbered; then clear the rail
        // (additive-neutral on the persisted workspace — the substrate's
        // boards bypass `ctx.loadSgf` so they aren't in the context's
        // created-board teardown set).
        restoreOverlayState(savedOverlays);
        ctx.resetWorkspace();
      }
    },
  };
}
