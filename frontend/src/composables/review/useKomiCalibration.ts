/**
 * src/composables/review/useKomiCalibration.ts
 *
 * Mint-time komi calibration: issue a FRESH bounded analysis query for
 * the position being minted, await its authoritative final packet, and
 * compute the komi that would make the position even (the pedagogical
 * "what's the correct move set if the game were balanced" feature).
 *
 * This is the effect-orchestration layer; the arithmetic is the pure
 * `computeEvenKomi` in `engine/katago/komi-calibration.ts`. The
 * connection-lifecycle primitives are the SHARED `connectFresh` /
 * `awaitFinalPacket` in `engine/katago/fresh-eval.ts` (the same owned
 * copy `composables/board/usePlayFromPosition.ts` uses), so the one-
 * shot `connectFresh → subscribe → await-final-packet → disconnect`
 * shape lives in exactly one place. Calibration deliberately does NOT
 * piggy-back on `analysisService`'s singleton: it is a one-off
 * evaluation with its own `maxVisits`, and owning the socket keeps it
 * off the user's live-analysis ledger and subscription bookkeeping. It
 * omits the optional telemetry hooks so the one-shot eval does not
 * surface in the Toolbar queue tooltip.
 *
 * ── evalKomi is single-source ─────────────────────────────────────────
 * The komi the evaluation runs under is read once from the board
 * (`getKomi`), placed on the query payload, and reported back to the
 * caller as `evalKomi` — the SAME value the engine saw. There is no
 * second read; the arithmetic and the wire agree by construction.
 *
 * ── Failure shape (ADR-0002, decided — do not soften) ─────────────────
 * Every failure mode (connect-before-open, wire error packet, timeout,
 * an illegal/absent final packet) REJECTS. The caller
 * (`MintCardModal.submit`) aborts the mint loudly on rejection — there
 * is no silent fallback to an uncalibrated mint.
 *
 * License: Public Domain (The Unlicense)
 */

import {
  type Player,
  type KataCoord,
} from '../../engine/katago/types';
import {
  finalizeAnalysisRouting,
  type UnroutedAnalysisQuery,
} from '../../engine/katago/query-routing';
import type { BoardState, NodeId } from '../../types';
import { store } from '../../store';
import { KATAGO_WS_URL } from '../../config/env';
import { KATAGO_ANALYSIS_TIMEOUT_MS } from '../../lib/timing';
import { getPath } from '../../engine/navigator';
import {
  getBoardSize,
  getKomi,
  getInitialStones,
  moveToKataCoord,
} from '../../engine/util';
import { compileEngineOverrides } from '../../state/analysis-config';
import { connectFresh, awaitFinalPacket } from '../../engine/katago/fresh-eval';
import {
  computeEvenKomi,
  roundToHalf,
  clampKomi,
  type KomiCalibrationResult,
} from '../../engine/katago/komi-calibration';

/**
 * Build the bounded analysis query for the position at `targetNodeId`
 * (defaults to `board.currentNodeId` — every call site before the
 * batch card-minting affordance, ledger rows 926/957/1008, always
 * meant "the board's current position"; the batch-wide calibration
 * ruling, ledger row 1063, is the first caller to pass an explicit,
 * possibly-non-current node). The position is root→target (`getPath`)
 * — the same shape `serializeActivePath(board, targetNodeId)` writes
 * into that card's SGF, so the evaluation matches exactly the position
 * the card stores. The `komi` and `overrideSettings` legs are captured
 * here so the caller can read the single-source `evalKomi` and the
 * framing-bearing overrides without a second board read.
 *
 * **Bug fix (commissioner-directed audit, ledger row 1063):** KataGo's
 * Analysis Engine accepts only integer-or-half-integer komi in
 * [-150, 150] (`engine/katago/komi-calibration.ts`'s own header) — a
 * constraint this function's OUTPUT (`computeEvenKomi`'s `evenKomi`)
 * already honored via `roundToHalf`/`clampKomi`, but its INPUT did
 * not: `evalKomi` was read straight off the board's SGF `KM` property
 * (`getKomi`, `engine/util.ts`) via a bare `parseFloat` with no
 * validation — a hand-edited or third-party-authored SGF can legally
 * carry a `KM` value that is neither half-integer (e.g. `KM[7.3]`) nor
 * in range (e.g. `KM[200]`), which this function then placed VERBATIM
 * on the evaluation query's own `komi` field, sent straight to the
 * engine. Same constraint, same mechanism, in-mandate per the ruling.
 * Fixed by rounding/clamping `evalKomi` at the read site, before it
 * reaches the query OR the caller's `evalKomi` result field — the
 * "single-source, same value the engine saw" invariant (file header)
 * now holds for a VALID value, not whatever the SGF happened to carry.
 */
// Exported for direct unit-testing of the evalKomi round/clamp fix
// (ledger row 1063) without mocking the connection-lifecycle plumbing
// (`connectFresh`/`awaitFinalPacket`) — see
// `tests/unit/composables/useKomiCalibration-query.test.ts`. Otherwise
// an internal implementation detail of `calibrate` below.
export function buildCalibrationQuery(
  board: BoardState,
  maxVisits: number,
  overrideSettings: Record<string, unknown> | undefined,
  targetNodeId?: NodeId,
): { query: UnroutedAnalysisQuery; expectedTurn: number; evalKomi: number } {
  const path = getPath(board.nodes, targetNodeId ?? board.currentNodeId);
  const moves = path
    .map((id) => board.nodes[id]?.move ?? null)
    .filter((m): m is NonNullable<typeof m> => !!m)
    // fix the 2-element literal to the [Player, KataCoord] move-pair tuple
    // (same Band-3 cast as `usePlayFromPosition.buildAnalyzeQuery`): the
    // mapped array would otherwise widen to `(string)[]` and not satisfy
    // `KataGoAnalysisQuery.moves`'s readonly tuple element type.
    .map((m) => [m.color, moveToKataCoord(m)] as [Player, KataCoord]);
  const initialStones = getInitialStones(board);
  const expectedTurn = moves.length;
  // Round-and-clamp (see the doc comment above) — the SAME two
  // functions `computeEvenKomi` applies to its own output, applied
  // here to the board's raw SGF-sourced komi before it becomes either
  // the query's `komi` field or the reported `evalKomi`.
  const evalKomi = clampKomi(roundToHalf(getKomi(board)));
  const size = getBoardSize(board);
  return {
    query: {
      id: `komi-calibrate-${Date.now()}`,
      moves,
      ...(initialStones.length ? { initialStones } : {}),
      rules: 'tromp-taylor',
      boardXSize: size,
      boardYSize: size,
      komi: evalKomi,
      maxVisits,
      analyzeTurns: [expectedTurn],
      // The framing-bearing overrides ride along so the response's
      // `scoreLead` sign convention matches what the user's live
      // analyses use (`reportAnalysisWinratesAs`). Conditionally
      // spread so a no-overrides profile sends no field — same posture
      // as the live analysis path.
      ...(overrideSettings ? { overrideSettings } : {}),
      // Calibration is a one-off; we only need the final packet, so we
      // omit `reportDuringSearchEvery` to suppress intermediate stream
      // churn (the proxy reads the absent field as "final only").
    },
    expectedTurn,
    evalKomi,
  };
}

export interface KomiCalibrationOptions {
  readonly board: BoardState;
  readonly maxVisits: number;
  readonly timeoutMs?: number;
  /**
   * The position to calibrate — defaults to `board.currentNodeId`.
   * Batch card-minting affordance (ledger row 1063): calibration
   * applies to EVERY card in a batch, each evaluated at its OWN
   * position (`MintCardModal.vue` calls `calibrate` once per selected
   * node, threading that node's id here), not just whatever the board
   * cursor happens to be sitting on.
   */
  readonly targetNodeId?: NodeId;
}

export function useKomiCalibration() {
  /**
   * Run a fresh bounded evaluation for `opts.board` at
   * `opts.targetNodeId` (or the board's current position) at
   * `opts.maxVisits`, and resolve with the even-komi result. Rejects
   * loudly on any failure (ADR-0002) — the caller aborts the mint.
   *
   * The engine URL resolves from the user's profile setting (the same
   * source `analysisService.connect` uses), then the env default; the
   * caller gates this on `store.engine.status === 'connected'`, so a
   * live proxy is already established at the resolved URL.
   */
  async function calibrate(opts: KomiCalibrationOptions): Promise<KomiCalibrationResult> {
    const url = store.profile.settings.engine?.katago?.url || KATAGO_WS_URL;
    const timeoutMs = opts.timeoutMs ?? KATAGO_ANALYSIS_TIMEOUT_MS;
    const overrideSettings = compileEngineOverrides();
    const { query, expectedTurn, evalKomi } = buildCalibrationQuery(
      opts.board,
      opts.maxVisits,
      overrideSettings,
      opts.targetNodeId,
    );

    // The SELECTOR routing decision — the leg this feature originally
    // shipped WITHOUT (the proxy rejected un-routed calibration queries
    // on the wire: "missing 'model' field for SELECTOR routing",
    // 2026-06-12). Calibration rides the user's currently selected
    // model, the same source the live analysis path routes by; the
    // finalizeAnalysisRouting seam makes the decision explicit and the
    // omission a compile error.
    const routed = finalizeAnalysisRouting(query, store.engine.selectedModel);

    const client = await connectFresh(url);
    try {
      const packet = await awaitFinalPacket(client, routed, expectedTurn, timeoutMs);
      return computeEvenKomi({
        evalKomi,
        scoreLead: packet.rootInfo.scoreLead,
        overrideSettings,
        currentPlayer: packet.rootInfo.currentPlayer,
      });
    } finally {
      client.disconnect();
    }
  }

  return { calibrate };
}
