/**
 * src/utils/context-id-macros.ts
 *
 * Parse `${a, b, ...}` macros in the Cards-tab context-id text
 * input. Each token inside a macro is interpreted as a
 * `game_source.display_ordinal` — the per-user id the SPA can see
 * for a game source (post-browse-leak-fix, `ForestStat` no longer
 * carries a raw `game_source_id`/`root_card_id` PK). Tokens outside
 * macros pass through unchanged as literal card ids.
 *
 * macro-public-id-tokens (restoring the macro after browse-leak-fix
 * broke it, ledger row 456): this module no longer *resolves* a
 * macro token to a root card id. It used to — synchronously, against
 * the cached `ForestStat[]`'s raw `root_card_id` — but that raw PK
 * is gone by design (the whole point of browse-leak-fix). Resolution
 * now happens server-side, within the caller's tenancy, inside
 * `/forests/query` itself (ADOPTED DESIGN, ledger rows 498/500): the
 * SPA's job shrinks to recognizing which typed tokens are (a) plain
 * literal card ids versus (b) game_source ordinal tokens the macro
 * syntax names, and handing both lists to the backend unresolved.
 * The macro expander stays synchronous — it's still pure text
 * parsing, just no longer a lookup-and-substitute.
 *
 * Example:
 *   "1, ${5}, 99"   →   { cardIds: [1, 99], gameSourceOrdinals: [5] }
 *   (assuming game_source ordinal 5 is known to the caller; see
 *   `isKnownGameSourceOrdinal` below)
 *
 * Unknown game_source ordinal tokens (typo'd, or a number that
 * doesn't correspond to any of the caller's own game sources) are
 * reported back in `unknownGameSourceOrdinalTokens` rather than
 * silently folded into `gameSourceOrdinals` — this is still the
 * ADR-0002 UI-input-validation exception (case 1): the caller
 * decides how loud to be about them (`ForestDirectory.vue` warns
 * once per distinct token), rather than this pure function reaching
 * into `console` itself. A bare typo'd id outside a macro behaves
 * the same way the existing parser already treats malformed input:
 * filtered out via `isNaN`.
 *
 * Unclosed macros (`${` without a matching `}`) leave the unclosed
 * substring as-is — the regex requires a closing brace to match.
 * Mid-typing this looks like a no-op for the macro portion; the
 * surrounding text continues to parse normally.
 *
 * Pure function; no Vue / store coupling. The membership-check
 * callback is the seam where the caller injects the
 * `ForestStat`-keyed lookup.
 *
 * License: Public Domain (The Unlicense)
 */

const MACRO_RE = /\$\{([^}]*)\}/g;

export interface ExpandedContextIds {
  /** Literal card ids typed outside any `${...}` macro. */
  readonly cardIds: readonly number[];
  /** Recognized `game_source.display_ordinal` tokens from inside macros. */
  readonly gameSourceOrdinals: readonly number[];
  /**
   * Macro tokens that didn't match any of the caller's known
   * game_source ordinals — surfaced so the caller can warn, rather
   * than silently dropped and indistinguishable from "the user never
   * typed that".
   */
  readonly unknownGameSourceOrdinalTokens: readonly number[];
}

export function expandContextIdMacros(
  input: string,
  isKnownGameSourceOrdinal: (ordinal: number) => boolean,
): ExpandedContextIds {
  const gameSourceOrdinals = new Set<number>();
  const unknownGameSourceOrdinalTokens = new Set<number>();

  const withoutMacros = input.replace(MACRO_RE, (_match, body: string) => {
    const tokens = body
      .split(',')
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n));
    for (const token of tokens) {
      if (isKnownGameSourceOrdinal(token)) {
        gameSourceOrdinals.add(token);
      } else {
        unknownGameSourceOrdinalTokens.add(token);
      }
    }
    // The macro body contributes nothing to the literal-id parse
    // below — it's consumed entirely as game_source ordinal tokens.
    return '';
  });

  const cardIds = withoutMacros
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  return {
    cardIds,
    gameSourceOrdinals: [...gameSourceOrdinals],
    unknownGameSourceOrdinalTokens: [...unknownGameSourceOrdinalTokens],
  };
}
