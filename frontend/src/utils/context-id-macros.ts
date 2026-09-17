/**
 * src/utils/context-id-macros.ts
 *
 * Parse `${...}` macros in the Cards-tab context-id text input. Each
 * macro body is a comma-separated list of tokens, where a token is
 * one of:
 *
 *   - a plain integer      `5`      → that one `game_source.display_ordinal`
 *   - an inclusive range    `1-5`   → every ordinal from 1 to 5 (order of
 *                                     the bounds doesn't matter: `5-1`
 *                                     behaves the same as `1-5`)
 *   - the wildcard          `*`     → every ordinal the caller currently
 *                                     knows about (`knownGameSourceOrdinals`)
 *
 * Any number of these can appear in one macro, or across several
 * macros in the same input (`${1-3}, ${7}, ${*}`) — they all union
 * into one `gameSourceOrdinals` set. Tokens outside `${...}` still
 * pass through unchanged as literal card ids; ranges/wildcard are
 * macro-only syntax since they're only meaningful for game_source
 * ordinals, not arbitrary card ids.
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
 *   "1, ${5}, 99"        →  { cardIds: [1, 99], gameSourceOrdinals: [5] }
 *   "${1-3, 7}"          →  { cardIds: [], gameSourceOrdinals: [1, 2, 3, 7] }
 *   "${*}"               →  gameSourceOrdinals === knownGameSourceOrdinals
 *   (assuming the relevant ordinals are present in the caller's
 *   `knownGameSourceOrdinals` — see below)
 *
 * Unknown game_source ordinal tokens (typo'd, an out-of-range member
 * of a range, or a number that doesn't correspond to any of the
 * caller's own game sources) are reported back in
 * `unknownGameSourceOrdinalTokens` rather than silently folded into
 * `gameSourceOrdinals` — this is still the ADR-0002 UI-input-
 * validation exception (case 1): the caller decides how loud to be
 * about them (`ForestDirectory.vue` warns once per distinct token),
 * rather than this pure function reaching into `console` itself. The
 * wildcard can never produce an unknown token, by construction — it
 * only ever expands to members of `knownGameSourceOrdinals`. A bare
 * typo'd id outside a macro behaves the same way the existing parser
 * already treats malformed input: filtered out via `isNaN`.
 *
 * Unclosed macros (`${` without a matching `}`) leave the unclosed
 * substring as-is — the regex requires a closing brace to match.
 * Mid-typing this looks like a no-op for the macro portion; the
 * surrounding text continues to parse normally.
 *
 * Pure function; no Vue / store coupling. `knownGameSourceOrdinals`
 * is the seam where the caller injects the `ForestStat`-derived
 * enumeration — note this is now a plain array rather than a
 * membership-check callback: `*` needs to *enumerate* the known
 * ordinals, not just test one, so a predicate can't express it.
 *
 * License: Public Domain (The Unlicense)
 */

const MACRO_RE = /(~?)\$\{([^}]*)\}/g;

/** Matches an inclusive range token like `1-5` or `5 - 1`. */
const RANGE_RE = /^(\d+)\s*-\s*(\d+)$/;

export interface ExpandedContextIds {
  /** Literal card ids typed outside any `${...}` macro. */
  readonly cardIds: readonly number[];
  /** Recognized `game_source.display_ordinal` tokens from inside macros. */
  readonly gameSourceOrdinals: readonly number[];
  /**
   * Macro-derived ordinals that didn't match any of the caller's
   * known game_source ordinals — surfaced so the caller can warn,
   * rather than silently dropped and indistinguishable from "the
   * user never typed that". Includes both mistyped bare tokens and
   * out-of-range members of an explicit range.
   */
  readonly unknownGameSourceOrdinalTokens: readonly number[];
}

/**
 * Expands one comma-split macro-body token into the ordinals it
 * denotes. Malformed tokens (non-numeric, incomplete range, etc.)
 * expand to nothing — same "silently drop" policy the single-int
 * parse already used for NaN.
 */
function parseMacroToken(
  token: string,
  knownGameSourceOrdinals: readonly number[],
): number[] {
  const trimmed = token.trim();
  if (trimmed === '') return [];
  if (trimmed === '*') return [...knownGameSourceOrdinals];

  const range = RANGE_RE.exec(trimmed);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const out: number[] = [];
    for (let n = lo; n <= hi; n++) out.push(n);
    return out;
  }

  const n = parseInt(trimmed, 10);
  return isNaN(n) ? [] : [n];
}

export function expandContextIdMacros(
  input: string,
  knownGameSourceOrdinals: readonly number[],
): ExpandedContextIds {
  const known = new Set(knownGameSourceOrdinals);
  const gameSourceOrdinals = new Set<number>();
  const excludedGameSourceOrdinals = new Set<number>();
  const unknownGameSourceOrdinalTokens = new Set<number>();

  const withoutMacros = input.replace(MACRO_RE, (_match,tilde: string, body: string) => {
    const isExcluded = tilde === '~';
    const tokens = body
      .split(',')
      .flatMap((t: string) => parseMacroToken(t, knownGameSourceOrdinals));
    for (const token of tokens) {
      if (known.has(token)) {
	if (isExcluded) {
	  excludedGameSourceOrdinals.add(token);
	} else {
          gameSourceOrdinals.add(token);
	}
      } else {
        unknownGameSourceOrdinalTokens.add(token);
      }
    }
    // The macro body contributes nothing to the literal-id parse
    // below — it's consumed entirely as game_source ordinal tokens.
    return '';
  });

  const parsedCards = withoutMacros
    .split(',')
    .map(s => {
      const trimmed = s.trim();
      const isExcluded = trimmed.startsWith('~');
      const valStr = isExcluded ? trimmed.slice(1) : trimmed;
      return { val: parseInt(valStr, 10), isExcluded };
    })
    .filter(({ val }) => !isNaN(val));

  const excludedCards = new Set(parsedCards.filter(p => p.isExcluded).map(p => p.val));
  const cardIds = parsedCards
    .filter(p => !p.isExcluded && !excludedCards.has(p.val))
    .map(p => p.val);

  for (const excluded of excludedGameSourceOrdinals) {
    gameSourceOrdinals.delete(excluded);
  }
  return {
    cardIds,
    gameSourceOrdinals: [...gameSourceOrdinals],
    unknownGameSourceOrdinalTokens: [...unknownGameSourceOrdinalTokens],
  };

/*
  const cardIds = withoutMacros
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  return {
    cardIds,
    gameSourceOrdinals: [...gameSourceOrdinals],
    unknownGameSourceOrdinalTokens: [...unknownGameSourceOrdinalTokens],
  };
  */
}
