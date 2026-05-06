/**
 * src/utils/context-id-macros.ts
 *
 * Expand `${a, b, ...}` macros in the Cards-tab context-id text
 * input. Each token inside a macro is interpreted as a
 * `game_source` id; the macro is replaced by the comma-separated
 * list of root card ids belonging to those game_sources. Tokens
 * outside macros pass through unchanged.
 *
 * Example:
 *   "1, ${5}, 99"   →   "1, 100, 101, 102, 99"
 *   (if game_source 5 has roots [100, 101, 102])
 *
 * The DSL's `select` stage takes context ids as the pivot card
 * ids that anchor structural selections; "context" in the DSL is
 * the tree rooted at each context id, including descendants. So
 * the macro only needs to resolve game_source → root_card_ids;
 * descendants are handled by the DSL's selection semantics. The
 * frontend already carries the `gameSourceId → rootCardId`
 * mapping in the cached `ForestStat[]` (via
 * `/stats/forests`), so no backend round-trip is needed for
 * resolution.
 *
 * Unknown `game_source` ids inside a macro silently expand to
 * nothing per ADR-0002's UI-input-validation exception (case 1
 * — UI input validation fallbacks). The user can tell the macro
 * resolved (or didn't) by inspecting the resolved root card ids
 * that appear in the input field after expansion. A bare typo'd
 * id outside a macro behaves the same way the existing parser
 * already treats malformed input: filtered out via `isNaN`.
 *
 * Unclosed macros (`${` without a matching `}`) leave the
 * unclosed substring as-is — the regex requires a closing brace
 * to match. Mid-typing this looks like a no-op for the macro
 * portion; the surrounding text continues to parse normally.
 *
 * Pure function; no Vue / store coupling. The resolver callback
 * is the seam where the caller injects the `ForestStat`-keyed
 * lookup.
 *
 * License: Public Domain (The Unlicense)
 */

const MACRO_RE = /\$\{([^}]*)\}/g;

export function expandContextIdMacros(
  input: string,
  resolveGameSource: (gameSourceId: number) => readonly number[],
): string {
  return input.replace(MACRO_RE, (_match, body: string) => {
    const ids = body
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    const roots: number[] = [];
    for (const id of ids) {
      for (const r of resolveGameSource(id)) {
        roots.push(r);
      }
    }
    return roots.join(', ');
  });
}
