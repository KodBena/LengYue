/**
 * src/engine/katago/winrate-framing.ts
 * Pure utilities for resolving and normalising KataGo's
 * `reportAnalysisWinratesAs` framing axis on response packets.
 *
 * KataGo's Analysis Engine emits `winrate`, `scoreLead`, and
 * `ownership` (and a handful of untyped siblings — `scoreMean`,
 * `scoreSelfplay`, `utility`, `utilityLcb`, `lcb`) under one of three
 * sign conventions selected via the `overrideSettings.reportAnalysisWinratesAs`
 * setting:
 *
 *   'WHITE'      — positive favours White; KataGo's behaviour for our
 *                  registry default
 *   'BLACK'      — positive favours Black; everything sign-flipped
 *                  relative to WHITE
 *   'SIDETOMOVE' — positive favours whoever is to move at this packet;
 *                  KataGo's own default when the field is absent. The
 *                  sign convention varies per packet by the packet's
 *                  `rootInfo.currentPlayer`.
 *
 * The frontend's analysis-projection consumers (liveness overlay,
 * score series, move suggestions, ownership renderer, the seeded
 * `winrate` / `score_lead` palette state_fns reading raw packets)
 * assume a 'WHITE'-framed packet stream. `analysis-service.ts`
 * normalises every packet through `normalizePacketToWhiteFraming`
 * before recording into the ledger, so the entire downstream
 * surface sees canonical WHITE regardless of what the user asked
 * KataGo for.
 *
 * ── Scope (deliberate) ─────────────────────────────────────────────
 * Normalises the raw packet's signed-scalar fields. Does NOT touch
 * `extra.*` (the proxy-applied palette enrichment): those values are
 * computed on the proxy side BEFORE the packet reaches the frontend,
 * so they're already cooked in the wire's framing by the time we see
 * them. A user-authored `state_fn` that reads `x["rootInfo"]["winrate"]`
 * receives the wire-framed value at proxy compile time; the resulting
 * `extra.state[turn]['Win Probability']` is in the wire's framing,
 * not in canonical WHITE. The supported configurations are:
 *
 *   1. Leave `reportAnalysisWinratesAs` at the seeded 'WHITE' (the
 *      common case — the registry's default).
 *   2. Use a non-WHITE framing AND author palette state_fns that
 *      compensate for the sign convention you asked KataGo for.
 *
 * Mixing is fine: raw-packet consumers get WHITE; palette consumers
 * get the wire's framing. Documented in
 * `docs/handoff-current.md`'s "Known gaps (frontend)".
 *
 * License: Public Domain (The Unlicense)
 */

import type { KataAnalysisResponse, KataMoveInfo, KataRootInfo, WinrateFraming } from './types';
import { WINRATE_FRAMINGS } from './types';

/**
 * Resolve the effective winrate framing from a `Record<string, unknown>`
 * that may carry (or omit) a `reportAnalysisWinratesAs` key.
 *
 *   - undefined / missing key / non-string value → 'SIDETOMOVE'
 *     (KataGo's own default when the field is absent from the wire).
 *   - string ∈ {'BLACK', 'WHITE', 'SIDETOMOVE'}                → that.
 *   - string outside the set → ADR-0002 fail-loud (console.warn) +
 *     'SIDETOMOVE' fallback. Unreachable in practice because the
 *     RegistryEditor's `PATH_ENUMS` constrains the leaf via a
 *     dropdown, but a hand-edited workspace blob or a future code
 *     path bypassing the editor could still land here.
 */
export function resolveWinrateFraming(
  overrides: Record<string, unknown> | undefined,
): WinrateFraming {
  if (!overrides) return 'SIDETOMOVE';
  const v = overrides.reportAnalysisWinratesAs;
  if (typeof v !== 'string') return 'SIDETOMOVE';
  if ((WINRATE_FRAMINGS as readonly string[]).includes(v)) { // widen the literal-union tuple to string[] for the .includes membership test
    return v as WinrateFraming; // membership confirmed above: v is one of the WINRATE_FRAMINGS literals
  }
  console.warn(
    `[winrate-framing] Unknown reportAnalysisWinratesAs value '${v}'; ` +
      `falling back to 'SIDETOMOVE'. Accepted: ${WINRATE_FRAMINGS.join(', ')}.`,
  );
  return 'SIDETOMOVE';
}

/**
 * Normalise a single KataGo analysis packet to canonical 'WHITE'
 * framing. Returns the input unchanged when no flip is needed.
 *
 * Sign-flipped fields (typed):
 *   - rootInfo.winrate     (1 - w)
 *   - rootInfo.scoreLead   (-)
 *   - moveInfos[].winrate  (1 - w, per element)
 *   - moveInfos[].scoreLead (-, per element)
 *   - ownership[]          (-, per element)
 *
 * Sign-flipped fields (untyped — defensively flipped if KataGo
 * emitted them; absent → no-op):
 *   - rootInfo.scoreMean / scoreSelfplay / utility (each negated)
 *   - moveInfos[].scoreMean / scoreSelfplay / utility / utilityLcb (negated)
 *   - moveInfos[].lcb      (1 - lcb — winrate-shaped probability)
 *
 * Untouched (sign-invariant):
 *   - rootInfo.visits, currentPlayer, scoreStdev, rawStWrError, etc.
 *   - moveInfos[].visits, prior, weight, pv, order, clusterId, etc.
 *   - policy[]            (probabilities)
 *   - extra.*             (proxy enrichment in wire framing — see the
 *                          file-header rationale)
 *
 * SIDETOMOVE is per-packet: the sign convention flips with
 * `rootInfo.currentPlayer`. A query that requested SIDETOMOVE will
 * receive packets where one move's winrate is from Black's view and
 * the next is from White's; each packet is normalised in isolation
 * using its own currentPlayer. That's the canonical KataGo idiom.
 */
export function normalizePacketToWhiteFraming(
  packet: KataAnalysisResponse,
  framing: WinrateFraming,
): KataAnalysisResponse {
  let flip = false;
  if (framing === 'BLACK') {
    flip = true;
  } else if (framing === 'SIDETOMOVE') {
    flip = packet.rootInfo.currentPlayer === 'B';
  }
  if (!flip) return packet;

  return {
    ...packet,
    rootInfo: flipRootSignedFields(packet.rootInfo),
    moveInfos: packet.moveInfos.map(flipMoveSignedFields),
    ...(packet.ownership ? { ownership: packet.ownership.map(negateScalar) } : {}),
  };
}

const negateScalar = (v: number): number => -v;
const oneMinus = (v: number): number => 1 - v;

/**
 * Flip the signed scalars on a `KataMoveInfo`. Spread-preserves the
 * input's typed shape and then reaches through a widening cast to
 * defensively flip the untyped signed siblings KataGo may emit.
 * The widening is justified per ADR-0002 Rule 2: the typed surface
 * doesn't enumerate every signed field KataGo can produce, but
 * leaving them untouched would silently produce a packet whose
 * typed `winrate` and untyped `lcb` carry inconsistent sign
 * conventions — a worse failure mode than the cast.
 */
function flipMoveSignedFields(mi: KataMoveInfo): KataMoveInfo {
  const flipped: KataMoveInfo = {
    ...mi,
    winrate: oneMinus(mi.winrate),
    scoreLead: negateScalar(mi.scoreLead),
  };
  // Widen to an open record so the optional signed fields can be flipped in
  // place by name (the typed shape's optionals aren't index-writable); the
  // double hop bridges the structural mismatch. Returns the typed `flipped`.
  const widened = flipped as unknown as Record<string, unknown>;
  flipIfPresent(widened, 'scoreMean', negateScalar);
  flipIfPresent(widened, 'scoreSelfplay', negateScalar);
  flipIfPresent(widened, 'utility', negateScalar);
  flipIfPresent(widened, 'utilityLcb', negateScalar);
  flipIfPresent(widened, 'lcb', oneMinus);
  return flipped;
}

function flipRootSignedFields(ri: KataRootInfo): KataRootInfo {
  const flipped: KataRootInfo = {
    ...ri,
    winrate: oneMinus(ri.winrate),
    scoreLead: negateScalar(ri.scoreLead),
  };
  // Widen to an open record so the optional signed fields can be flipped in
  // place by name; the double hop bridges the structural mismatch.
  const widened = flipped as unknown as Record<string, unknown>;
  flipIfPresent(widened, 'scoreMean', negateScalar);
  flipIfPresent(widened, 'scoreSelfplay', negateScalar);
  flipIfPresent(widened, 'utility', negateScalar);
  return flipped;
}

function flipIfPresent(
  obj: Record<string, unknown>,
  key: string,
  fn: (v: number) => number,
): void {
  const v = obj[key];
  if (typeof v === 'number') {
    obj[key] = fn(v);
  }
}
