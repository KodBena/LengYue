/**
 * src/state/match-player-overrides.ts
 * Session-ephemeral JSON blobs of "active overrides for-the-time-
 * being" — one PER MATCH PLAYER (Black / White) — merged into that
 * player's outgoing match analysis queries' `overrideSettings`
 * (ledger rows 593/594). Direct extension of
 * `state/per-query-overrides.ts` (the just-merged single, GLOBAL
 * surface): same validation contract, same session-ephemeral
 * posture, same merge-into-`overrideSettings`-only scope — reused
 * from that module rather than re-implemented (`parsePerQueryOverrides`,
 * `mergeQueryOverrides`) — but keyed on the MATCH PLAYER instead of
 * applying to every query uniformly.
 *
 * ─── Motivating use (maintainer, verbatim substance) ────────────────
 * A weak engine vs. a strong engine, with the strong one throttled via
 * `playoutDoublingAdvantage`. Per-player surfaces are the only way to
 * test asymmetric overrides — a single global blanket override (the
 * existing surface) cannot express "White gets PDA 1.5, Black gets
 * nothing."
 *
 * ─── KEYING (ADR-0000: make it unrepresentable) ─────────────────────
 * Keyed on `MatchPlayer` ('B' | 'W' — the same closed `Player` union
 * `engine/katago/types.ts` already exports; aliased here for domain
 * clarity, not re-declared as a second union), never on model. Both
 * match players may run the same model with different overrides — the
 * motivating PDA-throttle scenario is exactly that shape when both
 * sides happen to share a network.
 *
 * This module holds the two players' CONFIGURED VALUES (legitimately
 * session-global state, same as any settings panel — the user's
 * typed-in JSON for "Black" and for "White" persist across the
 * session same as the blanket override does). It is NOT where the
 * "whose move is this" decision is made or held. That decision is
 * `matchBoard.turn` inside `playEngineMatch`'s loop, captured as a
 * local `const playerColor` per iteration and threaded as an explicit
 * function argument through `buildAnalyzeQuery` to
 * `finalizeMatchAnalysisRouting` (query-routing.ts) — never re-derived
 * from, or stashed into, a mutable module-scope "current player"
 * variable here or anywhere else. That distinction is deliberate: two
 * queries (one per player) can be in flight/under construction with
 * interleaved async gaps (`awaitFinalPacket`) during a match; a
 * shared mutable "current player" pointer read at merge/send time
 * would let one player's in-flight query pick up the OTHER player's
 * overrides if the pointer moved between "build" and "send" for
 * either query. Threading the key as a plain argument down the call
 * chain makes that interleave bug unrepresentable — the merge always
 * uses the key its own caller passed it, not whatever the module
 * currently thinks is "current."
 *
 * ─── Application seam ────────────────────────────────────────────────
 * `activeMatchPlayerOverrides(player)` is read from
 * `finalizeMatchAnalysisRouting` — a thin match-specific wrapper
 * around `finalizeAnalysisRouting` in `engine/katago/query-routing.ts`
 * — per ADR-0012 (the merge stays at the SAME single choke point every
 * other override application already uses; no second override-
 * application home).
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive } from 'vue';
import type { Player } from '../engine/katago/types';
import {
  parsePerQueryOverrides,
  EMPTY_PER_QUERY_OVERRIDES,
  type PerQueryOverridesObject,
} from './per-query-overrides';

/** The match-player discriminant these overrides key on. Alias of the existing closed `Player` union — not a second union (ADR-0000). */
export type MatchPlayer = Player;

interface MatchPlayerOverridesState {
  /** Raw textarea contents, retained verbatim across valid AND invalid edits. */
  text: string;
  /** Last-known-good parsed object. `EMPTY_PER_QUERY_OVERRIDES` until this player's first valid, non-empty override. */
  applied: PerQueryOverridesObject;
  /** Parse/validation error for the CURRENT `text`, or null when `text` is valid. */
  error: string | null;
}

function freshState(): MatchPlayerOverridesState {
  return { text: '', applied: EMPTY_PER_QUERY_OVERRIDES, error: null };
}

const _state = reactive<Record<MatchPlayer, MatchPlayerOverridesState>>({
  B: freshState(),
  W: freshState(),
});

/** The raw textarea text for `player`, for the UI to bind `v-model`-style. */
export function matchPlayerOverridesText(player: MatchPlayer): string {
  return _state[player].text;
}

/** The current validation error for `player`, or null. For the UI's inline-error display. */
export function matchPlayerOverridesError(player: MatchPlayer): string | null {
  return _state[player].error;
}

/**
 * The overrides object `player`'s outgoing match queries merge against
 * — read by `finalizeMatchAnalysisRouting`. Always the last
 * successfully parsed value for THAT player; never the half-typed
 * invalid one (ADR-0002), and never the other player's value (see
 * module docstring's KEYING section).
 */
export function activeMatchPlayerOverrides(player: MatchPlayer): PerQueryOverridesObject {
  return _state[player].applied;
}

/**
 * Set `player`'s textarea contents and re-validate. On success,
 * updates both `text` and `applied` and clears `error`. On failure,
 * updates `text` (so the user's keystrokes aren't lost) but leaves
 * `applied` at its last-known-good value and sets `error` — never
 * silently half-applied (ADR-0002). The OTHER player's state is
 * untouched by construction (separate keyed slot).
 */
export function setMatchPlayerOverridesText(player: MatchPlayer, text: string): void {
  const slot = _state[player];
  slot.text = text;
  const result = parsePerQueryOverrides(text);
  if (result.kind === 'ok') {
    slot.applied = result.value;
    slot.error = null;
  } else {
    slot.error = result.message;
  }
}

/** Reset affordance for `player` — clears text, applied overrides, and any error back to the identity state. Does not touch the other player. */
export function resetMatchPlayerOverrides(player: MatchPlayer): void {
  _state[player] = freshState();
}

/** Test-only reset — same shape as `_resetPerQueryOverridesForTesting` in `per-query-overrides.ts`. Resets BOTH players. */
export function _resetMatchPlayerOverridesForTesting(): void {
  resetMatchPlayerOverrides('B');
  resetMatchPlayerOverrides('W');
}
