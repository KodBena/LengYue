/**
 * src/engine/util.ts
 * Pure helpers for board / SGF coordinate work, active-variation
 * traversal, and game-name resolution. Stateless; no reactive
 * imports. (The domain-free helpers `generateUUID` / `updateRegistry`
 * moved to `lib/utils.ts` 2026-06-10 — this module is [B3].)
 * License: Public Domain (The Unlicense)
 */
import type { Move, StoneColor, BoardState, NodeId, RootToLeafPath } from '../types';

/**
 * Converts SGF coordinate string to internal Point.
 * @param sgfStr e.g. "pd"
 * @param color 'B' | 'W'
 * @param size Board size from root node
 */
export function sgfToMove(sgfStr: string | undefined, color: StoneColor, size: number): Move {
  if (!sgfStr || sgfStr.trim() === "" || (sgfStr === 'tt' && size <= 19)) {
    return { type: 'pass', color, x: 0, y: 0 };
  }

  const x = sgfStr.charCodeAt(0) - 97;
  const y = (size - 1) - (sgfStr.charCodeAt(1) - 97);

  return { type: 'place', color, x, y };
}

export function pointToKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function keyToPoint(key: string): { x: number, y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Walks the active variation from the current node to the deepest leaf
 * (following `activeChildIndex` at each branch), then walks back up to
 * collect the lineage from root to leaf.
 *
 * Returns `RootToLeafPath` — the sole mint site for that brand. This is
 * the "what does the active line as a whole look like?" shape (chart
 * x-axes, full-game analysis, fast-forward to the mainline end). For
 * "what moves has the engine seen up to a position?" use `getPath`
 * (`engine/navigator.ts`), which returns the sibling `RootToCurrentPath`
 * brand — the two coincide only when current == leaf, and confusing them
 * is the bug class the 2026-05-15 match postmortem records (brand
 * rationale at the declarations in `src/types/game.ts`).
 *
 * Element-wise, every entry is a key in `board.nodes:
 * Record<NodeId, GameNode>` by construction; the brand propagates
 * through `useVariationPath` (which exposes
 * `ComputedRef<RootToLeafPath>`) into its consumers
 * (`useAnalysisProjection`, `useChartNavigation`, `useEnrichedData`,
 * `useKernelSeries`, `useAnalysisTimeline`, `BoardTab`) without
 * per-site casts.
 */
export function getActiveVariationPath(board: BoardState): RootToLeafPath {
  let leafId = board.currentNodeId;
  let leafNode = board.nodes[leafId];
  while (leafNode && leafNode.children.length > 0) {
    leafId = leafNode.children[leafNode.activeChildIndex] || leafNode.children[0];
    leafNode = board.nodes[leafId];
  }

  const path: NodeId[] = [];
  let curr: NodeId | null = leafId;
  while (curr) {
    path.unshift(curr);
    curr = board.nodes[curr].parent;
  }
  // Brand mint, justified: the walk above descended to the active
  // variation's leaf and collected its lineage back to root, so `path`
  // is root→leaf by construction. This is the brand's single producer.
  return path as RootToLeafPath;
}

const GTP_ALPHABET = "ABCDEFGHJKLMNOPQRSTUVWXYZ".split("");

export function toGtp(x: number, y: number): string {
  if (x < 0 || x >= GTP_ALPHABET.length) {
    console.warn(`[util.ts:toGtp] X-coordinate ${x} out of GTP range.`);
    return "pass";
  }

  const col = GTP_ALPHABET[x];
  const row = y + 1;
  return `${col}${row}`;
}

/**
 * Converts a `Move` to the wire-coordinate string KataGo's analysis
 * engine accepts: a GTP coordinate for placed stones, or the literal
 * `"pass"` for passes. The pass branch is load-bearing — without it,
 * any game with a pass in its history sends a move list shorter than
 * the actual move count, and KataGo analyses positions that diverge
 * from the user's board state from the first pass onward.
 */
export function moveToKataCoord(m: Move): string {
  return m.type === 'pass' ? 'pass' : toGtp(m.x, m.y);
}

export function getBoardSize(state: BoardState): number {
  return parseInt(state.nodes[state.rootNodeId]?.properties['SZ']?.[0] ?? '19', 10);
}

/**
 * Extracts the komi from the SGF root node.
 * Defaults to 6.5 if missing or unparseable.
 */
export function getKomi(state: BoardState): number {
  const kmStr = state.nodes[state.rootNodeId]?.properties['KM']?.[0];
  const km = parseFloat(kmStr ?? '6.5');
  return isNaN(km) ? 6.5 : km;
}

/**
 * Extracts SGF-root setup stones (AB / AW on the root node) in the
 * shape KataGo's analysis-engine protocol accepts as `initialStones`.
 *
 * The protocol distinguishes `initialStones` (the board state before
 * the first move — handicap stones, problem setups) from `moves` (the
 * game played after). Sending handicap stones in `moves` shifts
 * KataGo's turn-to-play and produces incorrect analysis silently —
 * exactly the symptom this helper exists to prevent.
 *
 * Mid-tree setup (AB/AW/AE on non-root nodes) is out of scope —
 * KataGo's analysis engine doesn't model setup operations after the
 * first move.
 */
export function getInitialStones(state: BoardState): [StoneColor, string][] {
  const rootNode = state.nodes[state.rootNodeId];
  if (!rootNode) return [];
  const size = getBoardSize(state);
  const result: [StoneColor, string][] = [];

  for (const sgfCoord of rootNode.properties.AB ?? []) {
    const move = sgfToMove(sgfCoord, 'B', size);
    if (move.type === 'place') {
      result.push(['B', toGtp(move.x, move.y)]);
    }
  }
  for (const sgfCoord of rootNode.properties.AW ?? []) {
    const move = sgfToMove(sgfCoord, 'W', size);
    if (move.type === 'place') {
      result.push(['W', toGtp(move.x, move.y)]);
    }
  }

  return result;
}

/**
 * Decodes a flat KataGo board-shaped array (length = size²) into per-cell
 * records in our internal coordinate convention.
 *
 * KataGo emits board arrays (`ownership`, `policy`) in row-major order
 * with row 0 at the *top* of the board. Our internal coordinate system
 * places y=0 at the *bottom* (matching `BoardDisplay.toSVG`'s y-flip),
 * so the row index inverts: row = size - 1 - y.
 *
 * Returns an empty array on length mismatch with a console warning
 * (per ADR-0002 — surfaces the deviation rather than silently rendering
 * a misaligned heatmap).
 *
 * Note: `policy` is conventionally length size² + 1 (the trailing slot
 * is the "pass" probability). Strip the pass slot before passing here,
 * or this function will warn and return empty.
 */
export function decodeBoardArray(
  values: readonly number[],
  size: number,
): { x: number; y: number; value: number }[] {
  if (values.length !== size * size) {
    console.warn(`[decodeBoardArray] length ${values.length} != size² ${size * size}`);
    return [];
  }
  const out: { x: number; y: number; value: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = i % size;
    const row = Math.floor(i / size);
    const y = size - 1 - row;
    out.push({ x, y, value: values[i] });
  }
  return out;
}

// ── Game-name resolution (description fallback ladder) ────────────────────────

/**
 * Format a Date as `YYYY-MM-DD HH:MM` in local time.
 *
 * Locale-independent (manual padding rather than toLocaleString) so
 * the persisted description doesn't drift across user-agent locales —
 * once a description is set on a game_source row, the backend keeps
 * it forever per the first-mint-wins contract; an unstable format
 * would mean two users with different locales producing different
 * "Free play (...)" strings for the same logical action.
 */
function formatDateStamp(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * Strip a single trailing `.sgf` extension (case-insensitive) from a
 * filename. Other extensions pass through unchanged. Used by
 * `resolveGameName` to surface filenames as game names without the
 * format-marker noise — the user typed `kobayashi-vs-cho-1996.sgf`,
 * what they read in the navigator should be `kobayashi-vs-cho-1996`.
 */
function stripSgfExtension(filename: string): string {
  return filename.replace(/\.sgf$/i, '');
}

/**
 * Resolves a board's user-friendly game name via a four-rung
 * fallback ladder:
 *
 *   1. SGF GN root property (game name) — when set in the file.
 *   2. SGF EV root property (event) — common in tournament SGFs.
 *   3. Source filename — populated by `useSgfLoader` from the
 *      File API; absent on blank boards. `.sgf` extension stripped.
 *   4. Date-stamped catch-all — `Free play (YYYY-MM-DD HH:MM)`.
 *      Captured at call time; the backend's first-mint-wins
 *      semantic means subsequent calls for the same game_source
 *      are discarded, so a board's recorded name reflects the
 *      moment of its first mint.
 *
 * Used by `useMetadata.gameName` (the SSOT for display) and by
 * `useMinting.prepareDraft` (the SSOT for the wire payload) — both
 * read from the same helper so a hand-edit to the ladder lands at
 * both surfaces uniformly.
 *
 * Pure function: no side effects beyond reading `Date` for the
 * fourth rung. The ladder previously lived as a chained `||` in
 * `useMetadata` (`'Untitled Game'` as the bottom rung), which
 * conflated "no SGF metadata at all" with "this is a fresh-play
 * board" and produced the user-observed Forest Directory bug
 * where every fresh-play mint became its own "Untitled Game"
 * entry. The new ladder names each rung explicitly.
 */
export function resolveGameName(board: BoardState, now: Date = new Date()): string {
  const root = board.nodes[board.rootNodeId];
  const props = root?.properties ?? {};

  const gn = props['GN']?.[0]?.trim();
  if (gn) return gn;

  const ev = props['EV']?.[0]?.trim();
  if (ev) return ev;

  if (board.sourceFileName) {
    const stripped = stripSgfExtension(board.sourceFileName).trim();
    if (stripped) return stripped;
  }

  return `Free play (${formatDateStamp(now)})`;
}
