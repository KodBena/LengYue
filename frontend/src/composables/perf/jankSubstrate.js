/**
 * src/composables/perf/jankSubstrate.ts
 *
 * Shared substrate for the docked-thumbnail jank harnesses: the fixed
 * Shusaku-game metadata lookup, the 16-board rail setup, the per-board
 * forward-to-ply navigation, and the synthetic hover-scrub stimulus.
 * Extracted (2026-06-12) from `useJankTest.ts` so the extended overlay-/
 * query-stress scenario (`jankExtended.ts`) reuses the same board-setup
 * and scrub pieces rather than duplicating them (ADR-0007).
 *
 * `useJankTest.ts` is the original consumer (the dev-toolbar toggle);
 * `jankExtended.ts` is the second consumer (the CDP-drivable
 * `jank-extended` scenario). The substrate holds no orchestration of
 * its own — only the reusable lookups, board builders, and the scrub
 * stimulus, each a single function the orchestrators compose.
 *
 * Game selection fails LOUDLY (ADR-0002): if the fixed Shusaku game
 * cannot be found by its metadata, `loadShusakuGame` throws with what
 * was searched rather than silently substituting another game — a
 * silent substitution would quietly change what the profile measures.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). It loads SGF bodies,
 * navigates the active line, and reads the board collection — game-tree
 * vocabulary — but no Go *rules*. Dev-only; makes no perf *claim*
 * (ADR-0009): substrate for a capture harness, not a measured result.
 *
 * License: Public Domain (The Unlicense)
 */
import { store, createBoard as storeCreateBoard, activeBoard, mutateBoard, } from '../../store';
import { loadSgfIntoBoard } from '../sgf/loadIntoBoard';
import { libraryService } from '../../services/library-service';
import { getActiveVariationPath } from '../../engine/util';
import { navigateTo } from '../../engine/navigator';
// ── Scenario constants ───────────────────────────────────────────────────────
/** Total boards the rail holds for the capture (15 random + 1 fixed). */
export const TOTAL_BOARDS = 16;
/** Plies every board EXCEPT the long fixed game is forwarded to. */
export const PARK_MOVE = 50;
/** Library page size for the random-sample fetch. One page is plenty to
 *  sample 15 games from; we do not need the whole library in memory. */
const SAMPLE_PAGE_SIZE = 200;
/** Hover-scrub bounds: a uniform-random dwell in [MIN, MAX) ms between each
 *  enter/leave transition. Matches the spec's 20–50 ms band — fast enough to
 *  race the preview's mount/unmount, slow enough to land distinct frames. */
const SCRUB_MIN_MS = 20;
const SCRUB_MAX_MS = 50;
/**
 * The fixed long game: Honinbo Shusaku (Black) vs Ito Showa (White),
 * 1850-12-20/21 (Kaei 3-XI-17), 342 moves. The capture needs ONE board
 * whose main line is long enough that continuous auto-nav keeps the main
 * board + variation tree churning for the whole run. We locate it by
 * metadata, not by a hardcoded id, because library ids are per-import.
 *
 * `nameNeedles` are matched case-insensitively as substrings against the
 * row's player fields (SGF `PB`/`PW` spellings vary — "Shusaku" /
 * "Shûsaku", "Ito" / "Itō" / "Showa" / "Shōwa"). `dateFrom`/`dateTo`
 * bracket the two-day span. `expectedMoves` is a post-load sanity check.
 */
export const SHUSAKU = {
    blackNeedles: ['shusaku', 'shûsaku', 'shūsaku'],
    whiteNeedles: ['ito', 'itō', 'showa', 'shōwa'],
    dateFrom: '1850-12-20',
    dateTo: '1850-12-21',
    expectedMoves: 342,
};
// ── Pure helpers ─────────────────────────────────────────────────────────────
function randInt(minInclusive, maxExclusive) {
    return minInclusive + Math.floor(Math.random() * (maxExclusive - minInclusive));
}
/** Fisher–Yates partial shuffle: returns `count` distinct items, randomly. */
function sample(items, count) {
    const pool = [...items];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
        const j = randInt(i, pool.length);
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}
function lc(s) {
    return (s ?? '').toLowerCase();
}
/** True if any needle is a substring of the (lower-cased) haystack. */
function matchesAny(haystack, needles) {
    return needles.some((needle) => haystack.includes(needle));
}
/**
 * Pick the Shusaku row from a list result by player names + date span.
 * Player colour is checked symmetrically (a row may carry Shusaku as
 * either PB or PW depending on the import's orientation), then narrowed
 * by the date bracket. Returns `null` if nothing matches — the caller
 * fails loudly with the search it ran.
 */
function findShusakuRow(rows) {
    const candidates = rows.filter((r) => {
        const black = lc(r.playerBlack);
        const white = lc(r.playerWhite);
        const shusakuPresent = matchesAny(black, SHUSAKU.blackNeedles) || matchesAny(white, SHUSAKU.blackNeedles);
        const opponentPresent = matchesAny(white, SHUSAKU.whiteNeedles) || matchesAny(black, SHUSAKU.whiteNeedles);
        return shusakuPresent && opponentPresent;
    });
    // Narrow by date when the row carries one. SGF `DT` for this game is
    // typically `1850-12-20` (the first of the two days); a `startsWith` on
    // either day in the span is the robust check, since some imports record
    // a range string (`1850-12-20,1850-12-21`) in the same field.
    const dated = candidates.filter((r) => r.date !== null && (r.date.startsWith(SHUSAKU.dateFrom) || r.date.startsWith(SHUSAKU.dateTo)));
    return dated[0] ?? candidates[0] ?? null;
}
// ── Library lookups (effectful) ──────────────────────────────────────────────
/**
 * Locate the fixed Shusaku game, fetch its full SGF body, and return it.
 * Tries a metadata-narrowed query first (player + date filter), then a
 * broader player-only query, then fails loudly with the searches it ran
 * (ADR-0002) — never substitutes another game.
 */
export async function loadShusakuGame() {
    const baseQuery = {
        sort: 'date',
        direction: 'asc',
        offset: 0,
        limit: SAMPLE_PAGE_SIZE,
    };
    const attempts = [];
    // 1) Narrowest: black player + date bracket.
    const narrow = await libraryService.listGames({
        ...baseQuery,
        filter: {
            playerLike: 'Shusaku',
            playerWhiteLike: null,
            playerBlackLike: null,
            dateFrom: SHUSAKU.dateFrom,
            dateTo: SHUSAKU.dateTo,
            resultEq: null,
            rulesetEq: null,
            boardSizeEq: null,
        },
    });
    attempts.push({ label: 'player~"Shusaku" AND date∈[1850-12-20,1850-12-21]', result: narrow });
    let row = findShusakuRow(narrow.rows);
    // 2) Broaden: any "Shusaku" game, then filter by the date span client-side.
    if (!row) {
        const broad = await libraryService.listGames({
            ...baseQuery,
            filter: {
                playerLike: 'Shusaku',
                playerWhiteLike: null,
                playerBlackLike: null,
                dateFrom: null,
                dateTo: null,
                resultEq: null,
                rulesetEq: null,
                boardSizeEq: null,
            },
        });
        attempts.push({ label: 'player~"Shusaku" (any date)', result: broad });
        row = findShusakuRow(broad.rows);
    }
    if (!row) {
        const summary = attempts
            .map((a) => `  - ${a.label}: ${a.result.totalCount} total, ` +
            `${a.result.rows.length} examined`)
            .join('\n');
        throw new Error('[jank-substrate] Could not find the fixed Shusaku game ' +
            '(Honinbo Shusaku B vs Ito Showa W, 1850-12-20/21, 342 moves) ' +
            'in the local_user library. Searches run:\n' +
            summary +
            '\nThe harness fails loudly rather than substitute another game (ADR-0002). ' +
            'Confirm the game is imported (it ships in the project author’s SGF corpus) ' +
            'and that the session is authenticated as local_user.');
    }
    const game = await libraryService.getGame(row.id);
    if (!game) {
        throw new Error(`[jank-substrate] Shusaku row #${row.id} matched the list query but GET ` +
            '/library/games/{id} returned 404 (row absent or cross-tenant).');
    }
    return game;
}
/**
 * Fetch a page of the library and return `count` random rows, EXCLUDING
 * the Shusaku row (so the fixed game is not double-loaded). Fewer rows
 * are returned if the library holds fewer than needed; the caller logs
 * the shortfall rather than failing — the harness still produces useful
 * stress with whatever boards exist.
 */
export async function sampleRandomGames(count, excludeId) {
    // `createdAt desc` is the cheapest stable order; we shuffle client-side
    // so the sample is genuinely random within the fetched page.
    const result = await libraryService.listGames({
        sort: 'createdAt',
        direction: 'desc',
        filter: {
            playerLike: null,
            playerWhiteLike: null,
            playerBlackLike: null,
            dateFrom: null,
            dateTo: null,
            resultEq: null,
            rulesetEq: null,
            boardSizeEq: null,
        },
        offset: 0,
        limit: SAMPLE_PAGE_SIZE,
    });
    const eligible = result.rows.filter((r) => r.id !== excludeId);
    return sample(eligible, count);
}
// ── Board setup ──────────────────────────────────────────────────────────────
/** Create a fresh board, make it active, load `rawContent` into it, and
 *  return its id. Mirrors the scenario context's `loadSgf`. */
export function loadGameAsNewBoard(rawContent, clientGameId) {
    storeCreateBoard();
    const b = activeBoard.value;
    if (!b)
        throw new Error('[jank-substrate] no active board after createBoard');
    const id = b.id;
    loadSgfIntoBoard(id, rawContent, (board) => {
        if (clientGameId !== null)
            board.clientGameId = clientGameId;
    });
    return id;
}
/** Forward a board to ply `target` along its active main line, clamped to
 *  the line length. `loadSgfIntoBoard` parks the cursor at the leaf, so we
 *  jump to the node at depth `target` (or the leaf if the game is shorter).
 *  Root→leaf is the genuine shape: the jump targets are forward of the
 *  cursor along the whole line. */
export function forwardToMove(boardId, target) {
    mutateBoard(boardId, (draft) => {
        const path = getActiveVariationPath(draft);
        if (path.length === 0)
            return;
        const idx = Math.min(target, path.length - 1);
        navigateTo(draft, path[idx]);
    });
}
/**
 * Set up the full 16-board rail and return the Shusaku board's id (parked
 * at the root, made nothing-special here — the caller decides active board
 * and start ply). Loads the fixed Shusaku game first (fail-loud if absent),
 * then 15 random others each forwarded to `PARK_MOVE`. Logs (not throws) a
 * shortfall when the library holds fewer than 15 other games — the harness
 * still produces useful stress with whatever exists.
 *
 * The Shusaku move-count is sanity-checked against `SHUSAKU.expectedMoves`
 * and warns on mismatch without hard-failing (the metadata match is the
 * authority, per the original jank test's posture).
 */
export async function setUpRail() {
    // 1) The fixed long game first — fail loudly here before touching the
    //    workspace, so a missing Shusaku game doesn't leave stray boards.
    const shusaku = await loadShusakuGame();
    // 2) 15 random others, excluding the Shusaku row.
    const others = await sampleRandomGames(TOTAL_BOARDS - 1, shusaku.id);
    if (others.length < TOTAL_BOARDS - 1) {
        console.warn(`[jank-substrate] library returned only ${others.length} other games; ` +
            `loading ${others.length + 1} boards instead of ${TOTAL_BOARDS}.`);
    }
    // 3) Load Shusaku as a board and park it at the root (move 0).
    const shusakuBoardId = loadGameAsNewBoard(shusaku.rawContent, shusaku.clientGameId);
    forwardToMove(shusakuBoardId, 0);
    // Sanity-check the move count — surfaces a wrong-game match without
    // hard-failing the run (the metadata match is the authority).
    const shusakuBoard = store.boards.find((b) => b.id === shusakuBoardId);
    const plies = shusakuBoard ? getActiveVariationPath(shusakuBoard).length - 1 : 0;
    if (plies !== SHUSAKU.expectedMoves) {
        console.warn(`[jank-substrate] matched Shusaku game has ${plies} moves, ` +
            `expected ${SHUSAKU.expectedMoves}. Proceeding (metadata matched), ` +
            'but verify the match if the profile looks off.');
    }
    // 4) Load the others, each forwarded to move 50.
    for (const row of others) {
        const game = await libraryService.getGame(row.id);
        if (!game) {
            console.warn(`[jank-substrate] skipping game #${row.id}: GET returned 404.`);
            continue;
        }
        const id = loadGameAsNewBoard(game.rawContent, game.clientGameId);
        forwardToMove(id, PARK_MOVE);
    }
    return shusakuBoardId;
}
// ── The hover-scrub stimulus ─────────────────────────────────────────────────
/**
 * Drive a synthetic pointer back and forth across the visible BoardTab
 * roots in `.thumb-list`, dispatching real `mouseenter`/`mouseleave` so the
 * stimulus flows through the genuine hover path. Sweeps forward then
 * backward, repeating, with a random [20,50) ms dwell between transitions.
 *
 * Returns a `stop()`; the scrubber re-reads the live tab list each step, so
 * it tolerates the board set changing under it. It clears any lingering
 * preview on stop by leaving the last-entered tab.
 */
export function startHoverScrub() {
    let running = true;
    let timer = null;
    let lastEntered = null;
    // Sweep cursor state across the visible tabs.
    let cursor = 0;
    let dir = 1;
    function tabs() {
        return Array.from(document.querySelectorAll('.thumb-list .thumb-container'));
    }
    function fire(el, type) {
        // `mouseenter`/`mouseleave` do not bubble, so dispatch directly on the
        // element Vue attached the listener to (BoardTab's root). `bubbles:false`
        // matches the native event shape; Vue's listener fires regardless.
        el.dispatchEvent(new MouseEvent(type, { bubbles: false, cancelable: false }));
    }
    function step() {
        if (!running)
            return;
        const els = tabs();
        if (els.length === 0) {
            // Nothing to hover yet (boards still loading) — retry shortly.
            timer = window.setTimeout(step, SCRUB_MIN_MS);
            return;
        }
        // Leave the previous tab (synchronous preview clear), then enter the next.
        if (lastEntered)
            fire(lastEntered, 'mouseleave');
        cursor = Math.max(0, Math.min(cursor, els.length - 1));
        const el = els[cursor];
        fire(el, 'mouseenter');
        lastEntered = el;
        // Advance the sweep, bouncing at the ends (forward then backward).
        if (els.length > 1) {
            if (cursor + dir < 0 || cursor + dir > els.length - 1)
                dir = -dir;
            cursor += dir;
        }
        timer = window.setTimeout(step, randInt(SCRUB_MIN_MS, SCRUB_MAX_MS));
    }
    step();
    return {
        stop() {
            running = false;
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
            // Leave the last tab so the docked preview clears (no stranded box).
            if (lastEntered) {
                fire(lastEntered, 'mouseleave');
                lastEntered = null;
            }
        },
    };
}
