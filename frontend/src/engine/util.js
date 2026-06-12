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
    coord;
    constructor(coord, detail) {
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
export function sgfToMove(sgfStr, color, size) {
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
        throw new SgfCoordinateError(sgfStr, `decoded point (col=${col}, row=${row}) is outside the ${size}×${size} board`);
    }
    const x = col;
    const y = (size - 1) - row;
    return { type: 'place', color, x, y };
}
export function pointToKey(x, y) {
    return `${x},${y}`;
}
export function keyToPoint(key) {
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
export function getActiveVariationPath(board) {
    let leafId = board.currentNodeId;
    let leafNode = board.nodes[leafId];
    while (leafNode && leafNode.children.length > 0) {
        leafId = leafNode.children[leafNode.activeChildIndex] || leafNode.children[0];
        leafNode = board.nodes[leafId];
    }
    const path = [];
    let curr = leafId;
    while (curr) {
        path.unshift(curr);
        curr = board.nodes[curr].parent;
    }
    // Brand mint, justified: the walk above descended to the active
    // variation's leaf and collected its lineage back to root, so `path`
    // is root→leaf by construction. This is the brand's single producer.
    return path;
}
const GTP_ALPHABET = "ABCDEFGHJKLMNOPQRSTUVWXYZ".split("");
export function toGtp(x, y) {
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
export function moveToKataCoord(m) {
    return m.type === 'pass' ? 'pass' : toGtp(m.x, m.y);
}
export function getBoardSize(state) {
    return parseInt(state.nodes[state.rootNodeId]?.properties['SZ']?.[0] ?? '19', 10);
}
/**
 * Extracts the komi from the SGF root node.
 * Defaults to 6.5 if missing or unparseable.
 */
export function getKomi(state) {
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
export function getInitialStones(state) {
    const rootNode = state.nodes[state.rootNodeId];
    if (!rootNode)
        return [];
    const size = getBoardSize(state);
    const result = [];
    const collect = (coords, color) => {
        for (const sgfCoord of coords ?? []) {
            let move;
            try {
                move = sgfToMove(sgfCoord, color, size);
            }
            catch (err) {
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
export function decodeBoardArray(values, size) {
    if (values.length !== size * size) {
        console.warn(`[decodeBoardArray] length ${values.length} != size² ${size * size}`);
        return [];
    }
    const out = [];
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
function formatDateStamp(d) {
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
function stripSgfExtension(filename) {
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
export function resolveGameName(board, now = new Date()) {
    const root = board.nodes[board.rootNodeId];
    const props = root?.properties ?? {};
    const gn = props['GN']?.[0]?.trim();
    if (gn)
        return gn;
    const ev = props['EV']?.[0]?.trim();
    if (ev)
        return ev;
    if (board.sourceFileName) {
        const stripped = stripSgfExtension(board.sourceFileName).trim();
        if (stripped)
            return stripped;
    }
    return `Free play (${formatDateStamp(now)})`;
}
