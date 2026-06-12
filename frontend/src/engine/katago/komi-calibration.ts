/**
 * src/engine/katago/komi-calibration.ts
 *
 * Pure arithmetic for mint-time komi calibration: given the komi an
 * evaluation ran under and the `scoreLead` of its authoritative final
 * packet, compute the komi that would make the position even.
 *
 * ── The framing problem ───────────────────────────────────────────────
 * KataGo's `scoreLead` carries a sign convention selected by
 * `overrideSettings.reportAnalysisWinratesAs` (see
 * `winrate-framing.ts`). A user on the seeded 'WHITE' framing receives
 * `+scoreLead = White ahead`; on 'BLACK', `+scoreLead = Black ahead`;
 * 'SIDETOMOVE' flips per the packet's `currentPlayer`. The arithmetic
 * below works in **Black-positive** points, so the raw `scoreLead` is
 * first normalised to that perspective. We reuse the framing-resolution
 * primitive (`resolveWinrateFraming`) rather than re-deriving the sign
 * rules; the one extra step the existing `normalizePacketToWhiteFraming`
 * does not give us is the WHITE→Black flip, which is a single negation.
 *
 * ── The direction (load-bearing) ──────────────────────────────────────
 * Komi compensates White (SGF `KM` is added to White's score; KataGo's
 * `komi` field is the same convention — `+komi` favours White). If Black
 * is ahead by L points (`scoreLeadBlackPositive = +L`) under komi K, then
 * for the position to be even White needs L more points of compensation,
 * so the even komi is `K + L`:
 *
 *     evenKomi = evalKomi + scoreLeadBlackPositive
 *
 * Verified against this codebase's own framing semantics
 * (`engine/katago/types.ts`: 'WHITE' → `+scoreLead = White favoured`,
 * 'BLACK' → `+scoreLead = Black favoured`) and the SGF/KataGo komi
 * convention (komi added to White). Black ahead ⇒ raise komi.
 *
 * ── The wire constraint ───────────────────────────────────────────────
 * KataGo's Analysis Engine accepts only integer or half-integer komi in
 * the range [-150, 150]. The raw `evalKomi + lead` sum is rounded to the
 * nearest 0.5 and clamped to that range. The clamp is surfaced (the
 * `clamped` flag) so the mint flow can tell the user when the computed
 * komi was out of range rather than silently substituting an endpoint
 * (ADR-0002).
 *
 * License: Public Domain (The Unlicense)
 */

import { resolveWinrateFraming } from './winrate-framing';
import type { Player } from './types';

/** KataGo's accepted komi range — integer or half-integer within these bounds. */
export const KOMI_MIN = -150;
export const KOMI_MAX = 150;

export interface KomiCalibrationInput {
  /**
   * The komi the evaluation ran under — captured from the query payload
   * the engine actually saw (single source). Black-positive convention
   * is irrelevant here: komi is sign-conventionless (it is the same
   * number for both sides; only `scoreLead` carries a perspective).
   */
  readonly evalKomi: number;
  /**
   * The raw `scoreLead` from the evaluation's authoritative final
   * packet (`rootInfo.scoreLead`), in whatever framing the query
   * requested. Normalised internally to Black-positive.
   */
  readonly scoreLead: number;
  /**
   * The `overrideSettings` blob the query carried, read for the
   * `reportAnalysisWinratesAs` framing key. Pass the same object sent
   * to the engine so the framing resolution matches what produced the
   * packet. `undefined` resolves to 'SIDETOMOVE' (KataGo's own default
   * when the field is absent), per `resolveWinrateFraming`.
   */
  readonly overrideSettings: Record<string, unknown> | undefined;
  /**
   * The packet's `rootInfo.currentPlayer` — only consulted under
   * 'SIDETOMOVE' framing, where the sign convention is per-packet.
   * Ignored for 'WHITE' / 'BLACK'.
   */
  readonly currentPlayer: Player;
}

export interface KomiCalibrationResult {
  /**
   * The komi that makes the position even, rounded to the nearest 0.5
   * and clamped to [KOMI_MIN, KOMI_MAX]. Safe to send to KataGo and to
   * write into an SGF `KM` property.
   */
  readonly evenKomi: number;
  /** Black-positive scoreLead used in the arithmetic (post-normalisation). */
  readonly scoreLeadBlackPositive: number;
  /** The pre-rounding, pre-clamp `evalKomi + scoreLeadBlackPositive`. */
  readonly rawEvenKomi: number;
  /** True when rounding pushed the value outside [KOMI_MIN, KOMI_MAX] and it was clamped. */
  readonly clamped: boolean;
}

/**
 * Normalise a raw `scoreLead` to Black-positive points.
 *
 *   - 'BLACK'      → already Black-positive; pass through.
 *   - 'WHITE'      → White-positive; negate.
 *   - 'SIDETOMOVE' → positive favours `currentPlayer`; negate iff the
 *                    side to move is White.
 *
 * Mirrors the sign rules `normalizePacketToWhiteFraming` applies, in the
 * opposite target perspective (that helper canonicalises to WHITE; this
 * one to BLACK). Kept here rather than extending that helper because the
 * calibration arithmetic needs a single scalar, not a whole flipped
 * packet, and the WHITE→BLACK leg is one negation.
 */
export function scoreLeadToBlackPositive(
  scoreLead: number,
  overrideSettings: Record<string, unknown> | undefined,
  currentPlayer: Player,
): number {
  const framing = resolveWinrateFraming(overrideSettings);
  if (framing === 'BLACK') return scoreLead;
  if (framing === 'WHITE') return -scoreLead;
  // SIDETOMOVE: positive favours the side to move at this packet.
  return currentPlayer === 'B' ? scoreLead : -scoreLead;
}

/** Round to the nearest 0.5. Ties (…25, …75) round to the upper 0.5 via Math.round's half-up. */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Clamp into [KOMI_MIN, KOMI_MAX]. */
export function clampKomi(value: number): number {
  if (value < KOMI_MIN) return KOMI_MIN;
  if (value > KOMI_MAX) return KOMI_MAX;
  return value;
}

/**
 * Compute the even komi for a calibrated mint. Pure: normalise →
 * add → round-to-half → clamp.
 */
export function computeEvenKomi(input: KomiCalibrationInput): KomiCalibrationResult {
  const scoreLeadBlackPositive = scoreLeadToBlackPositive(
    input.scoreLead,
    input.overrideSettings,
    input.currentPlayer,
  );
  const rawEvenKomi = input.evalKomi + scoreLeadBlackPositive;
  const rounded = roundToHalf(rawEvenKomi);
  const evenKomi = clampKomi(rounded);
  return {
    evenKomi,
    scoreLeadBlackPositive,
    rawEvenKomi,
    clamped: evenKomi !== rounded,
  };
}
