/**
 * src/engine/util.ts
 * Pure helpers for board / SGF coordinate work, active-variation
 * traversal, and game-name resolution. Stateless; no reactive
 * imports. (The domain-free helpers `generateUUID` / `updateRegistry`
 * moved to `lib/utils.ts` 2026-06-10 — this module is [B3].)
 * License: Public Domain (The Unlicense)
 */
import type { Move, StoneColor, BoardState, NodeId, GameNode, RootToLeafPath } from '../types';
import { normalizeRuleset, type RulesetResolution } from './rulesets';

/**
 * Thrown when an inbound SGF coordinate is malformed — a character
 * outside the SGF point alphabet, or a decoded point outside the
 * board. This is the file-trust boundary (ADR-0002): a corrupt SGF
 * *file* must fail loudly rather than coerce garbage into board
 * geometry. The loader's callers narrow on it (`instanceof
 * SgfCoordinateError`) to surface a user-visible load failure.
 *
 * Distinct from the legitimate pass markers (empty string, whitespace,
 * and `tt` on boards ≤ 19×19), which `sgfToMove` still resolves to a
 * pass — those are *valid* SGF, not malformation.
 *
 * `coord` is an explicit instance field (not a parameter-property
 * shorthand) because the project's tsconfig has `erasableSyntaxOnly`
 * enabled, which forbids parameter properties — they emit runtime code
 * and so aren't pure type-level syntax. (Same constraint as
 * `AnalysisWaitError` in `composables/analysis/wait-for-analysis.ts`.)
 */
export class SgfCoordinateError extends Error {
  readonly coord: string;

  constructor(coord: string, detail: string) {
    super(`Malformed SGF coordinate ${JSON.stringify(coord)}: ${detail}`);
    this.name = 'SgfCoordinateError';
    this.coord = coord;
  }
}

/**
 * Converts SGF coordinate string to internal Point.
 * @param sgfStr e.g. "pd"
 * @param color 'B' | 'W'
 * @param size Board size from root node
 *
 * Fail-loud at the file-trust boundary (ADR-0002): a coordinate whose
 * characters fall outside the SGF point alphabet, or whose decoded
 * point falls outside `[0, size)`, throws `SgfCoordinateError` rather
 * than minting a `Move` with garbage geometry. The prior shape did the
 * `charCodeAt(…) - 97` arithmetic with no bounds check, so a
 * single-character coordinate (`charCodeAt(1)` → `NaN`) or an
 * out-of-range letter produced a `Move` with `NaN` / out-of-board
 * coordinates that propagated into the stones map and the rules engine.
 * `validateMove` rejects most pathological *placements* downstream, but
 * setup stones (AB/AW/AE) and `getInitialStones` bypass that check —
 * the boundary is enforced here, once, for every consumer.
 */
export function sgfToMove(sgfStr: string | undefined, color: StoneColor, size: number): Move {
  if (!sgfStr || sgfStr.trim() === "" || (sgfStr === 'tt' && size <= 19)) {
    return { type: 'pass', color, x: 0, y: 0 };
  }

  // SGF encodes a point as two letters from the 'a'-based alphabet
  // ('a' = 0). Anything shorter than two characters or carrying a
  // character outside that alphabet is malformed file data.
  if (sgfStr.length < 2) {
    throw new SgfCoordinateError(sgfStr, 'expected two coordinate characters');
  }
  const col = sgfStr.charCodeAt(0) - 97;
  const row = sgfStr.charCodeAt(1) - 97;
  if (col < 0 || row < 0 || col >= size || row >= size) {
    throw new SgfCoordinateError(
      sgfStr,
      `decoded point (col=${col}, row=${row}) is outside the ${size}×${size} board`,
    );
  }

  const x = col;
  const y = (size - 1) - row;

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

/**
 * Every NodeId in `nodeId`'s subtree, inclusive of `nodeId` itself —
 * a plain BFS over `children`. Minted for the setup-toolkit's
 * thumbnail-invalidation obligation: `applySetup` (`src/logic.ts`)
 * mutates the CURRENT node's stone projection, and every descendant's
 * cached thumbnail snapshot is a replay that starts from that
 * projection, so all of them go stale together (contrast
 * `applyMarkup`, whose mutation has no board-state carry-forward and
 * therefore invalidates only the one node it touched — no subtree
 * walk needed there).
 */
export function collectSubtreeIds(nodes: Record<NodeId, GameNode>, nodeId: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const queue: NodeId[] = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes[id];
    if (!node) continue;
    out.push(id);
    queue.push(...node.children);
  }
  return out;
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
 * Inverse of `toGtp` — parses a GTP/KataGo wire coordinate
 * (`KataCoord`, e.g. `"Q16"`) into 0-indexed board `{x, y}`, or
 * `null` for `"pass"`. Case-insensitive on the column letter (KataGo
 * emits uppercase; tolerate lowercase defensively). Throws (ADR-0002
 * fail-loudly) on a coordinate outside `[0, boardSize)` or a column
 * letter not in the GTP alphabet (`"I"` is skipped, same as
 * `toGtp`'s encode side) — a malformed coordinate is a data-integrity
 * problem the caller needs to know about, not a value to silently
 * clamp or drop.
 */
export function fromGtp(coord: string, boardSize: number): { x: number; y: number } | null {
  if (coord.toLowerCase() === 'pass') return null;

  const col = coord[0]?.toUpperCase();
  const x = GTP_ALPHABET.indexOf(col ?? '');
  if (x < 0 || x >= boardSize) {
    throw new Error(`[util.ts:fromGtp] Unrecognized or out-of-range GTP column in coordinate "${coord}".`);
  }

  const rowStr = coord.slice(1);
  const row = parseInt(rowStr, 10);
  if (!Number.isFinite(row) || rowStr === '') {
    throw new Error(`[util.ts:fromGtp] Unrecognized GTP row in coordinate "${coord}".`);
  }
  const y = row - 1;
  if (y < 0 || y >= boardSize) {
    throw new Error(`[util.ts:fromGtp] GTP row out of range in coordinate "${coord}" for board size ${boardSize}.`);
  }

  return { x, y };
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
 * Extracts the player to move BEFORE any move has been played, from
 * the SGF root node's `PL` property. Defaults to 'B' — the ordinary
 * "Black moves first" convention every non-handicap board carries — for
 * a missing, empty, or unrecognized `PL` value; only an exact `PL[W]`
 * flips the default. `engine/handicap.ts::applyHandicap` is the write
 * side of this property (handicap hands the first move to White);
 * `loadSgf` reads it to seed `BoardState.turn` correctly for a
 * reloaded handicap game, and the analysis query builder
 * (`services/analysis-service.ts`) reads it to tell KataGo who is to
 * move at the position `initialStones` describes when the query's
 * `moves` list is empty (turn 0 has no move to carry a colour, so the
 * wire's `initialPlayer` field is the only way to say it) — parallel
 * in shape to `getKomi` / `getRulesetResolution` above, all three
 * root-level scalar facts read directly off the SGF properties rather
 * than off `BoardState.turn`, which only tracks the CURSOR's turn and
 * is not itself the root-level fact for a board navigated away from
 * the root.
 */
export function getInitialPlayer(state: BoardState): StoneColor {
  const pl = state.nodes[state.rootNodeId]?.properties['PL']?.[0];
  return pl === 'W' ? 'W' : 'B';
}

/**
 * Extracts the ruleset from the SGF root node's `RU` property, parallel
 * in shape to `getKomi` / `getBoardSize` but returning the
 * `RulesetResolution` record (an effective `RulesetName` plus a
 * `source` provenance tag) rather than a bare string — per the
 * live-testing adjudication superseding the original ruleset ruling
 * (`.claude/dispatch-reports/ruleset-default-wedge-fix.md`), a missing
 * or unrecognized `RU` defaults to Tromp-Taylor (`source: 'defaulted'`)
 * rather than refusing; a recognized `RU` resolves with `source: 'ru'`.
 * See `normalizeRuleset` in `engine/rulesets.ts` for the full contract.
 */
export function getRulesetResolution(state: BoardState): RulesetResolution {
  const raw = state.nodes[state.rootNodeId]?.properties['RU']?.[0];
  return normalizeRuleset(raw);
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
 *
 * Tolerant of a malformed coordinate, deliberately — the inverse of
 * `sgfToMove`'s fail-loud posture, and for a layering reason. The
 * file-trust boundary is `loadSgf` (the SGF → BoardState load):
 * `sgfToMove` throwing there propagates to the loader's catch and is
 * surfaced to the user. By the time `getInitialStones` runs, the board
 * has *already* loaded — it is called from the analysis-request hot
 * path (`analysis-service.ts` range/ponder), often on a board
 * rehydrated from persistence that never re-ran `loadSgf` this session.
 * Re-throwing here would move the boundary to the wrong layer: a board
 * persisted under older (silently-coercing) code would crash analysis
 * on every navigation rather than surface once at load. So a malformed
 * setup coord is skipped with a `console.warn` (level 5) — that one
 * stone degrades, analysis proceeds. This is the same fail-at-load /
 * tolerate-at-re-read split ADR-0002's stale-bundle-shim exception
 * codifies.
 */
export function getInitialStones(state: BoardState): [StoneColor, string][] {
  const rootNode = state.nodes[state.rootNodeId];
  if (!rootNode) return [];
  const size = getBoardSize(state);
  const result: [StoneColor, string][] = [];

  const collect = (coords: string[] | undefined, color: StoneColor) => {
    for (const sgfCoord of coords ?? []) {
      let move: Move;
      try {
        move = sgfToMove(sgfCoord, color, size);
      } catch (err) {
        if (err instanceof SgfCoordinateError) {
          // Post-load tolerance (see docstring): skip the bad stone
          // rather than crash the analysis path. The load-time boundary
          // already had its chance to surface this loudly.
          console.warn(`[getInitialStones] skipping malformed setup coord: ${err.message}`);
          continue;
        }
        throw err;
      }
      if (move.type === 'place') {
        result.push([color, toGtp(move.x, move.y)]);
      }
    }
  };

  collect(rootNode.properties.AB, 'B');
  collect(rootNode.properties.AW, 'W');

  return result;
}

/**
 * True iff any NON-ROOT node on `path` carries a setup property (`AB`/
 * `AW`/`AE`). `getInitialStones` above (and `analyzeRange` /
 * `analyzeActiveNode` in `src/services/analysis-service.ts`) only ever
 * project the ROOT's own AB/AW into KataGo's `initialStones` — that is
 * wire-protocol-correct for handicap/problem setups, but a mid-tree
 * setup edit (the setup toolkit, ledger rows 603/604, can place one on
 * ANY current node — not just root) is silently absent from BOTH
 * `initialStones` (root-only) and `moves` (`buildMovesAndTurnIndex`
 * only ever collects `node.move`, treating a setup-only node exactly
 * like any other moveless node): KataGo's analysis-engine protocol has
 * no wire primitive for "insert a stone mid-sequence with no move,"
 * so the analyzed position silently diverges from the board the user
 * is looking at. This predicate is the query-construction-time
 * detection that lets a caller surface that divergence loudly
 * (ADR-0002) rather than ship a silently-wrong analysis — see the
 * mid-tree-setup system-message notice at both `analyzeRange` and
 * `analyzeActiveNode` call sites.
 *
 * `path[0]` (root) is always excluded — root AB/AW is the
 * wire-correct, already-handled case.
 */
export function pathHasMidTreeSetup(nodes: Record<NodeId, GameNode>, path: readonly NodeId[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const node = nodes[path[i]];
    if (!node) continue;
    if (
      (node.properties.AB && node.properties.AB.length > 0)
      || (node.properties.AW && node.properties.AW.length > 0)
      || (node.properties.AE && node.properties.AE.length > 0)
    ) {
      return true;
    }
  }
  return false;
}

// Game-end-by-pass status (`GameStatus` / `getGameEndStatus`) was
// removed (commissioner ruling, ledger row 2540): the SPA is not a
// game server and must never treat two consecutive passes as a
// terminal/locking condition — see `StatusBar.vue`'s history for the
// removed badge, and `frontend/tests/unit/engine/util.test.ts` for the
// removed truth-table coverage. Unlimited passing is genre-correct
// (Sabaki/KaTrain/OGS); pass interpretation, if ever needed, is a
// concern for a specific play-vs-engine protocol, not this general
// board/GUI helper module.

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
