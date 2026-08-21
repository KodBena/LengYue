/**
 * tests/unit/store/defaults.test.ts
 *
 * Tier-1 (pure-logic) pin for the median-summary symbol addition
 * (ledger rows 1204/1213/1229, commissioner-defined). `defaults.ts` is
 * the fresh-profile seed; a regression here silently drifts what a
 * brand-new user's `analysis_env` looks like without any migration or
 * hydrate path catching it (defaults are read directly, not migrated).
 *
 * Scope: the three literal facts the commission named —
 *   1. `median_summary` exists with the exact curated-stdlib body.
 *   2. The `quality` palette's `summary_fn` is `median_summary`.
 *   3. `activePaletteId` defaults to `score` (fresh profiles only —
 *      existing users are untouched by the sibling migration, see
 *      `tests/unit/store/migrations.test.ts`'s `70 → 71` block).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../../../src/store/defaults';

describe('defaults.ts — median-summary symbol (ledger rows 1204/1213/1229)', () => {
  const analysisEnv = (defaultSettings as any).engine.katago.analysis_env;

  it('defines median_summary with the exact curated-stdlib body', () => {
    expect(analysisEnv.symbols.median_summary).toBe('float(median(x))');
  });

  it("the 'quality' palette's summary_fn is median_summary", () => {
    const quality = analysisEnv.palettes.find((p: any) => p.id === 'quality');
    expect(quality).toBeDefined();
    expect(quality.summary_fn).toBe('median_summary');
  });

  it('activePaletteId defaults to score (fresh-profile wizard binding)', () => {
    expect(analysisEnv.activePaletteId).toBe('score');
  });
});

/**
 * defaults.ts — scoreLead_root_loss / score-palette root-delta rewire
 * (commissioner ruling, ledger rows 1380/1381/1383/1378).
 *
 * The formula bodies in `defaults.ts` are Python-expression strings,
 * evaluated server-side by the proxy's RegistryInterpreter — this
 * suite has no interpreter to run them against. `scoreLeadRootLoss`
 * below is a literal JS mirror of the shipped formula
 * (`player_sign(x[0]) * (x[1].rootInfo.scoreLead - x[0].rootInfo.scoreLead)`,
 * with `player_sign(x) = x.rootInfo.currentPlayer === 'B' ? 1.0 : -1.0`)
 * used to prove the DERIVATION's arithmetic against synthetic packets;
 * the exact-string assertions below separately pin that the shipped
 * Python body matches what this mirror encodes, so a hand-edit to one
 * side without the other fails loudly here.
 */
describe('defaults.ts — scoreLead_root_loss (ledger rows 1380/1381/1383/1378)', () => {
  const analysisEnv = (defaultSettings as any).engine.katago.analysis_env;

  it('defines scoreLead_root_loss with the derived player_sign(x[0]) * root-swing body', () => {
    expect(analysisEnv.symbols.scoreLead_root_loss).toBe(
      'player_sign(x[0]) * (x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"])',
    );
  });

  it("the 'score' palette's delta_fn now points at scoreLead_root_loss", () => {
    const score = analysisEnv.palettes.find((p: any) => p.id === 'score');
    expect(score).toBeDefined();
    expect(score.delta_fn).toBe('scoreLead_root_loss');
  });

  it("the 'score' palette's delta_ordering stays higher_is_worse (the new form is still a loss, not a gain)", () => {
    const score = analysisEnv.palettes.find((p: any) => p.id === 'score');
    expect(score.delta_ordering).toBe('higher_is_worse');
  });

  // JS mirror of the shipped formula — see file-header comment.
  type Packet = { rootInfo: { currentPlayer: 'B' | 'W'; scoreLead: number }; userMoveInfo?: unknown };
  function playerSign(x0: Packet): number {
    return x0.rootInfo.currentPlayer === 'B' ? 1.0 : -1.0;
  }
  function scoreLeadRootLoss(x0: Packet, x1: Packet): number {
    return playerSign(x0) * (x1.rootInfo.scoreLead - x0.rootInfo.scoreLead);
  }
  // Mirror of the shipped (unchanged) scoreLead_loss_topvsuser body,
  // for the direct before/after comparison test below.
  function scoreLeadLossTopvsuser(x0: Packet & { userMoveInfo?: { scoreLead: number } }): number {
    return playerSign(x0) * ((x0.userMoveInfo ? (x0.rootInfo.scoreLead - x0.userMoveInfo.scoreLead) : 0));
  }

  it('a White blunder (root scoreLead drops after White moves) reads as a positive loss', () => {
    const x0: Packet = { rootInfo: { currentPlayer: 'W', scoreLead: 5.0 } };
    const x1: Packet = { rootInfo: { currentPlayer: 'B', scoreLead: 2.0 } };
    expect(scoreLeadRootLoss(x0, x1)).toBeCloseTo(3.0);
  });

  it('a Black blunder (root scoreLead rises, favouring White, after Black moves) reads as a positive loss', () => {
    const x0: Packet = { rootInfo: { currentPlayer: 'B', scoreLead: 5.0 } };
    const x1: Packet = { rootInfo: { currentPlayer: 'W', scoreLead: 8.0 } };
    expect(scoreLeadRootLoss(x0, x1)).toBeCloseTo(3.0);
  });

  it('a good move (for either colour) reads as a negative loss (a gain)', () => {
    const whiteGood: Packet = { rootInfo: { currentPlayer: 'W', scoreLead: 5.0 } };
    const whiteGoodNext: Packet = { rootInfo: { currentPlayer: 'B', scoreLead: 7.0 } };
    expect(scoreLeadRootLoss(whiteGood, whiteGoodNext)).toBeCloseTo(-2.0);

    const blackGood: Packet = { rootInfo: { currentPlayer: 'B', scoreLead: 5.0 } };
    const blackGoodNext: Packet = { rootInfo: { currentPlayer: 'W', scoreLead: 3.0 } };
    expect(scoreLeadRootLoss(blackGood, blackGoodNext)).toBeCloseTo(-2.0);
  });

  it("the commissioner's scenario: an UNLISTED move (no userMoveInfo) still produces a real nonzero loss via the root delta, unlike scoreLead_loss_topvsuser's blind 0", () => {
    // Same White-blunder packets as above, but with userMoveInfo
    // explicitly absent — the disproportionate case for a weaker
    // player's actual move (commissioner ruling rows 1380/1381).
    const x0: Packet = { rootInfo: { currentPlayer: 'W', scoreLead: 5.0 } }; // userMoveInfo absent
    const x1: Packet = { rootInfo: { currentPlayer: 'B', scoreLead: 2.0 } };

    expect(scoreLeadRootLoss(x0, x1)).toBeCloseTo(3.0); // real, nonzero loss
    expect(scoreLeadLossTopvsuser(x0)).toBeCloseTo(0); // the blind spot this rewire avoids (±0 either sign)
  });
});
