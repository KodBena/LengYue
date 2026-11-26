/**
 * Compile-time regression test for the branded input/output contract of
 * expandContextIdMacros. This file is included by tsconfig.app.json and has
 * no runtime caller; false && keeps its assertion function unexecuted.
 *
 * The brand is significant: the helper accepts a display ordinal, not a
 * game-source primary key or a card display ordinal. Parsed numbers are
 * matched against the trusted list and the helper returns those branded
 * members, not freshly asserted numbers.
 *
 * License: Public Domain (The Unlicense)
 */
import { expandContextIdMacros, type ExpandedContextIds } from './context-id-macros';
import type {
  CardDisplayOrdinal,
  GameDisplayOrdinal,
  GameSourceId,
} from '../types/ids';

declare const gameDisplayOrdinals: readonly GameDisplayOrdinal[];
declare const gameSourceIds: readonly GameSourceId[];
declare const cardDisplayOrdinals: readonly CardDisplayOrdinal[];
declare const expanded: ExpandedContextIds;

function __contextIdMacroTypeAssertions(): void {
  // Positive: accepted output retains the exact domain brand.
  const acceptedOrdinals: readonly GameDisplayOrdinal[] = expanded.gameSourceOrdinals;
  void acceptedOrdinals;

  // Positive: only the required ordinal brand is accepted.
  expandContextIdMacros('', gameDisplayOrdinals);

  // Negative: a primary-key identity is not a per-user display ordinal.
  // @ts-expect-error GameSourceId must not substitute for GameDisplayOrdinal.
  expandContextIdMacros('', gameSourceIds);

  // Negative: card display ordinals belong to a different domain.
  // @ts-expect-error CardDisplayOrdinal must not substitute for GameDisplayOrdinal.
  expandContextIdMacros('', cardDisplayOrdinals);
}

export const __CONTEXT_ID_MACRO_TYPE_TEST = false && __contextIdMacroTypeAssertions();
