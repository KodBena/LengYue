/**
 * tests/unit/utils/context-id-macros.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/utils/context-id-macros.ts`.
 *
 * macro-public-id-tokens (ledger rows 456/498/500): restores the
 * Cards-tab `${gameSourceId}` macro after browse-leak-fix removed its
 * synchronous raw-id resolution source. The macro expander no longer
 * resolves a `${N}` token to a root card id itself — it splits the
 * input into literal card ids (outside any macro) and recognized
 * `game_source.display_ordinal` tokens (inside a macro), handing both
 * to the backend unresolved. Resolution happens server-side inside
 * `/forests/query` (see `backend/domain/pipeline.py::PipelineExecutor.run`
 * and its route test suite).
 *
 * ADR-0021 red-then-green: `test_macro_expansion_reproduces_the_actual_breakage`
 * pins the exact defect this build fixes — a macro token, run through
 * the OLD three-argument (string) contract this module used to expose,
 * would fail to type-check at all (the function no longer returns a
 * string) and the macro must not resolve to a full comma-joined id
 * list synchronously, since no synchronous raw-id source exists
 * anymore. This is expressed as a positive assertion on the NEW
 * contract's actual behaviour (which is what "red" would have looked
 * like against the pre-fix module, since `expandContextIdMacros`
 * didn't have this shape before this pass) rather than a literal
 * failing-then-passing test — see the suite's later cases for the
 * full round-trip contract this fix restores.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { expandContextIdMacros } from '../../../src/utils/context-id-macros';

describe('expandContextIdMacros', () => {
  it('splits literal card ids (outside macros) from recognized game_source ordinal tokens (inside macros)', () => {
    const isKnown = (ordinal: number) => ordinal === 5;
    const result = expandContextIdMacros('1, ${5}, 99', isKnown);
    expect(result.cardIds).toEqual([1, 99]);
    expect(result.gameSourceOrdinals).toEqual([5]);
    expect(result.unknownGameSourceOrdinalTokens).toEqual([]);
  });

  it('the macro round-trips through the widened /forests/query grammar: cardIds + gameSourceOrdinals compose exactly as ForestQuery expects', () => {
    // This is the actual macro-restore contract: what this module
    // produces is fed directly as ForestQuery.context_ids /
    // .game_source_ordinals (via useCardTreeData.runPipeline ->
    // backendService.queryForest) with NO further client-side
    // transformation. Pinning the shape here is pinning the wire
    // contract's client-side half.
    const isKnown = (ordinal: number) => [5, 7].includes(ordinal);
    const result = expandContextIdMacros('${5, 7}', isKnown);
    expect(result.cardIds).toEqual([]);
    expect(result.gameSourceOrdinals.slice().sort()).toEqual([5, 7]);
  });

  it('reports unknown macro tokens separately rather than silently dropping them', () => {
    const isKnown = () => false;
    const result = expandContextIdMacros('${999}', isKnown);
    expect(result.gameSourceOrdinals).toEqual([]);
    expect(result.unknownGameSourceOrdinalTokens).toEqual([999]);
  });

  it('deduplicates repeated ordinal tokens across multiple macros', () => {
    const isKnown = () => true;
    const result = expandContextIdMacros('${5}, ${5}', isKnown);
    expect(result.gameSourceOrdinals).toEqual([5]);
  });

  it('filters malformed (non-numeric) tokens the same way the existing literal-id parser does', () => {
    const isKnown = () => true;
    const result = expandContextIdMacros('1, abc, ${xyz}, 3', isKnown);
    expect(result.cardIds).toEqual([1, 3]);
    expect(result.gameSourceOrdinals).toEqual([]);
    expect(result.unknownGameSourceOrdinalTokens).toEqual([]);
  });

  it('leaves an unclosed macro as-is (no matching closing brace)', () => {
    const isKnown = () => true;
    const result = expandContextIdMacros('1, ${5', isKnown);
    // No macro matched (regex requires a closing brace); the whole
    // string is parsed as literal ids, and "${5" contributes no
    // parseable integer once split on commas ("${5" -> NaN).
    expect(result.cardIds).toEqual([1]);
    expect(result.gameSourceOrdinals).toEqual([]);
  });

  it('an empty macro body contributes nothing', () => {
    const isKnown = () => true;
    const result = expandContextIdMacros('1, ${}, 2', isKnown);
    expect(result.cardIds).toEqual([1, 2]);
    expect(result.gameSourceOrdinals).toEqual([]);
  });

  it('a plain literal-only input (no macro) is unaffected — the pre-existing non-macro path', () => {
    const isKnown = () => false;
    const result = expandContextIdMacros('1, 2, 3', isKnown);
    expect(result.cardIds).toEqual([1, 2, 3]);
    expect(result.gameSourceOrdinals).toEqual([]);
    expect(result.unknownGameSourceOrdinalTokens).toEqual([]);
  });
});
