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
 * ── The per-ruleset komi DOMAIN (ledger row 1146) ──────────────────────
 * The wire constraint above (integer-or-half-integer in [-150, 150]) is
 * KataGo's own acceptance rule and applies uniformly regardless of which
 * of the four ruling-mandated rulesets (`engine/rulesets.ts`) a board is
 * playing under — `roundToHalf`/`clampKomi` model exactly that, and nothing
 * ruleset-specific. Separately, Tromp-Taylor carries its OWN, narrower
 * convention: komi under Tromp-Taylor is customarily an INTEGER (the
 * area-scoring rule set already avoids most drawn-game ties that
 * half-integer komi exists to rule out under other rulesets), so a
 * Tromp-Taylor board's komi should never be representable as a
 * non-integer half-point value. `KOMI_DOMAINS`/`komiDomainStep`/
 * `normalizeKomiForRuleset` below are the single per-ruleset domain
 * table this fact lives in — every site that WRITES a board's komi
 * (fresh-board creation, the StatusBar komi-edit affordance, a ruleset
 * switch) normalizes through it, so an invalid (non-integer,
 * Tromp-Taylor) komi is unrepresentable in persisted board state by
 * construction (ADR-0000), rather than scattering
 * `ruleset === 'Tromp-Taylor'` checks at each call site. This is
 * deliberately NOT applied to the wire-safety `roundToHalf`/
 * `clampKomi` pair above, and not retroactively applied to a komi value
 * already read off a loaded SGF's `KM` property — same posture as
 * `normalizeRuleset`'s own defaulting (`engine/rulesets.ts` header): a
 * file's literal data is never silently rewritten by a read, only an
 * explicit write goes through the domain function.
 *
 * ── The per-ruleset HANDICAP komi convention (ledger rows 1339/1340) ────
 * A handicap game's seeded default komi is a SECOND per-ruleset fact —
 * distinct from the wire-rounding step above, but living in the same
 * domain table: the value is always the smallest komi in that
 * ruleset's own domain that still rules out a drawn game. For the
 * three half-integer-domain rulesets (AGA, Chinese, Japanese) that is
 * 0.5, the long-standing convention this codebase used uniformly
 * before this table existed. Tromp-Taylor's own domain is
 * integer-only (`komiDomainStep` above), and area-scoring already
 * avoids most drawn-game ties without a fractional nudge, so its
 * member of the SAME convention is simply 0 — not a special case
 * carved out for Tromp-Taylor, but what "smallest tie-breaking value
 * in this ruleset's domain" already evaluates to once Tromp-Taylor is
 * an ordinary row in the table rather than an if/else at the call
 * site (commissioner ruling, ledger rows 1339/1340: "I hope that
 * these configurations are instances under a properly abstracted
 * schema, so that TT doesn't look like a sore thumb in the code").
 * `handicapKomiForRuleset` below is the sole read site; no caller
 * string-compares against `'Tromp-Taylor'` to pick a handicap komi.
 *
 * License: Public Domain (The Unlicense)
 */

import { resolveWinrateFraming } from './winrate-framing';
import type { Player } from './types';
import type { RulesetName } from '../rulesets';

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
 * A ruleset's komi domain: the wire-rounding `step` (see
 * `komiDomainStep`) and the seeded `handicapKomi` default (see
 * `handicapKomiForRuleset`), both documented in the file header's
 * "per-ruleset komi DOMAIN" / "HANDICAP komi convention" sections.
 * Declared together because both facts are keyed by the same
 * `RulesetName` and both readers must draw from a single declared
 * table rather than parallel per-function conditionals that could
 * silently drift apart.
 */
interface KomiDomain {
  readonly step: number;
  readonly handicapKomi: number;
}

/**
 * The single declared per-ruleset komi-domain table — Tromp-Taylor is
 * an ordinary row here, not a branch at any call site (commissioner
 * ruling, ledger rows 1339/1340).
 */
const KOMI_DOMAINS: Readonly<Record<RulesetName, KomiDomain>> = {
  'Tromp-Taylor': { step: 1, handicapKomi: 0 },
  AGA: { step: 0.5, handicapKomi: 0.5 },
  Chinese: { step: 0.5, handicapKomi: 0.5 },
  Japanese: { step: 0.5, handicapKomi: 0.5 },
};

/**
 * The komi rounding step for `ruleset`'s domain: `1` (integer-only)
 * under Tromp-Taylor, `0.5` (half-integer) for the other three
 * ruling-mandated rulesets. Backed by `KOMI_DOMAINS` — see the file
 * header's "per-ruleset komi DOMAIN" section.
 */
export function komiDomainStep(ruleset: RulesetName): number {
  return KOMI_DOMAINS[ruleset].step;
}

/**
 * The seeded handicap-game komi for `ruleset`: `0` under Tromp-Taylor,
 * `0.5` for the other three ruling-mandated rulesets — the smallest
 * tie-breaking value in each ruleset's own komi domain. Backed by the
 * same `KOMI_DOMAINS` table `komiDomainStep` reads; see the file
 * header's "per-ruleset HANDICAP komi convention" section. The sole
 * read site `applyHandicap` (`engine/handicap.ts`) should use — no
 * caller branches on `ruleset === 'Tromp-Taylor'` directly.
 */
export function handicapKomiForRuleset(ruleset: RulesetName): number {
  return KOMI_DOMAINS[ruleset].handicapKomi;
}

/**
 * Rounds `value` to the nearest multiple of `step` (half-up on ties,
 * matching `roundToHalf`'s tie behaviour — `Math.round`'s own
 * half-up-toward-+Infinity rule, generalised from the fixed 0.5 step
 * to an arbitrary one).
 */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Normalizes a raw komi value into `ruleset`'s valid domain: rounded to
 * `komiDomainStep(ruleset)` (integer under Tromp-Taylor, half-integer
 * otherwise) and clamped to [KOMI_MIN, KOMI_MAX]. This is the write-time
 * enforcement point named in the file header — every site that persists
 * an explicit komi value (fresh-board creation, a user komi edit, a
 * ruleset switch) should route the new value through this function so a
 * Tromp-Taylor board can never end up holding a non-integer komi.
 */
export function normalizeKomiForRuleset(value: number, ruleset: RulesetName): number {
  return clampKomi(roundToStep(value, komiDomainStep(ruleset)));
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
