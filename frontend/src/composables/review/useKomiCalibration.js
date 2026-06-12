/**
 * src/composables/review/useKomiCalibration.ts
 *
 * Mint-time komi calibration: issue a FRESH bounded analysis query for
 * the position being minted, await its authoritative final packet, and
 * compute the komi that would make the position even (the pedagogical
 * "what's the correct move set if the game were balanced" feature).
 *
 * This is the effect-orchestration layer; the arithmetic is the pure
 * `computeEvenKomi` in `engine/katago/komi-calibration.ts`. The
 * connection-lifecycle primitives mirror the proven shape in
 * `composables/board/usePlayFromPosition.ts` (a one-shot
 * `connectFresh → subscribe → await-final-packet → disconnect` against
 * a dedicated `KataGoClient`), deliberately NOT piggy-backing on
 * `analysisService`'s singleton: calibration is a one-off evaluation
 * with its own `maxVisits`, and owning the socket keeps it off the
 * user's live-analysis ledger and subscription bookkeeping.
 *
 * ── evalKomi is single-source ─────────────────────────────────────────
 * The komi the evaluation runs under is read once from the board
 * (`getKomi`), placed on the query payload, and reported back to the
 * caller as `evalKomi` — the SAME value the engine saw. There is no
 * second read; the arithmetic and the wire agree by construction.
 *
 * ── Failure shape (ADR-0002, decided — do not soften) ─────────────────
 * Every failure mode (connect-before-open, wire error packet, timeout,
 * an illegal/absent final packet) REJECTS. The caller
 * (`MintCardModal.submit`) aborts the mint loudly on rejection — there
 * is no silent fallback to an uncalibrated mint.
 *
 * License: Public Domain (The Unlicense)
 */
import { KataGoClient } from '../../engine/katago/katago-client';
import { store } from '../../store';
import { KATAGO_WS_URL } from '../../config/env';
import { KATAGO_ANALYSIS_TIMEOUT_MS } from '../../lib/timing';
import { getPath } from '../../engine/navigator';
import { getBoardSize, getKomi, getInitialStones, moveToKataCoord, } from '../../engine/util';
import { compileEngineOverrides } from '../../state/analysis-config';
import { computeEvenKomi } from '../../engine/katago/komi-calibration';
/**
 * Connect a fresh `KataGoClient` and resolve once `onConnect` fires.
 * Rejects on disconnect-before-open and on `onError`. Mirrors
 * `usePlayFromPosition`'s `connectFresh` — kept local rather than
 * exported-and-shared because that module's primitives are private and
 * the calibration path's needs differ (it analyses a position, not a
 * "next move").
 */
function connectFresh(url) {
    return new Promise((resolve, reject) => {
        let opened = false;
        let settled = false;
        const settle = (fn) => {
            if (settled)
                return;
            settled = true;
            fn();
        };
        const client = new KataGoClient('');
        client.connect(url, {
            onConnect: () => {
                opened = true;
                settle(() => resolve(client));
            },
            onDisconnect: (code, reason) => {
                if (!opened) {
                    settle(() => reject(new Error(`KataGo WS closed before open (code=${code}, reason=${reason || 'n/a'}, url=${url})`)));
                }
            },
            onError: (errorMsg) => {
                if (!opened) {
                    settle(() => reject(new Error(`KataGo WS error before open: ${errorMsg} (url=${url})`)));
                }
            },
        });
    });
}
/**
 * Subscribe one analysis query and resolve with its authoritative final
 * packet (`isDuringSearch === false`) for `expectedTurn`. Discriminates
 * the typed `subscribe<Q>` callback: `'error' in res` narrows the wire
 * error variant (rejecting), the `else` is `KataAnalysisResponse`.
 * Intermediate during-search packets are ignored. Rejects on timeout.
 * The subscription is torn down on settle regardless of which channel
 * wins.
 */
function awaitFinalPacket(client, query, expectedTurn, timeoutMs) {
    return new Promise((resolve, reject) => {
        let unsub = null;
        let settled = false;
        const settle = (fn) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            unsub?.();
            fn();
        };
        const timer = setTimeout(() => {
            settle(() => reject(new Error(`Komi calibration: no final packet for turn ${expectedTurn} within ${timeoutMs}ms (queryId=${query.id})`)));
        }, timeoutMs);
        unsub = client.subscribe(query, (res) => {
            if ('error' in res) {
                settle(() => reject(new Error(`Komi calibration: KataGo error for queryId=${query.id}: ${res.error}`)));
                return;
            }
            if (res.turnNumber === expectedTurn && res.isDuringSearch === false) {
                settle(() => resolve(res));
            }
        });
    });
}
/**
 * Build the bounded analysis query for the minted position. The
 * position is root→current (`getPath`) — the same shape
 * `serializeActivePath` writes into the card's SGF, so the evaluation
 * matches exactly the position the card stores. The `komi` and
 * `overrideSettings` legs are captured here so the caller can read the
 * single-source `evalKomi` and the framing-bearing overrides without a
 * second board read.
 */
function buildCalibrationQuery(board, maxVisits, overrideSettings) {
    const path = getPath(board.nodes, board.currentNodeId);
    const moves = path
        .map((id) => board.nodes[id]?.move ?? null)
        .filter((m) => !!m)
        .map((m) => [m.color, moveToKataCoord(m)]);
    const initialStones = getInitialStones(board);
    const expectedTurn = moves.length;
    const evalKomi = getKomi(board);
    const size = getBoardSize(board);
    return {
        query: {
            id: `komi-calibrate-${Date.now()}`,
            moves,
            ...(initialStones.length ? { initialStones } : {}),
            rules: 'tromp-taylor',
            boardXSize: size,
            boardYSize: size,
            komi: evalKomi,
            maxVisits,
            analyzeTurns: [expectedTurn],
            // The framing-bearing overrides ride along so the response's
            // `scoreLead` sign convention matches what the user's live
            // analyses use (`reportAnalysisWinratesAs`). Conditionally
            // spread so a no-overrides profile sends no field — same posture
            // as the live analysis path.
            ...(overrideSettings ? { overrideSettings } : {}),
            // Calibration is a one-off; we only need the final packet, so we
            // omit `reportDuringSearchEvery` to suppress intermediate stream
            // churn (the proxy reads the absent field as "final only").
        },
        expectedTurn,
        evalKomi,
    };
}
export function useKomiCalibration() {
    /**
     * Run a fresh bounded evaluation for `opts.board` at `opts.maxVisits`
     * and resolve with the even-komi result. Rejects loudly on any
     * failure (ADR-0002) — the caller aborts the mint.
     *
     * The engine URL resolves from the user's profile setting (the same
     * source `analysisService.connect` uses), then the env default; the
     * caller gates this on `store.engine.status === 'connected'`, so a
     * live proxy is already established at the resolved URL.
     */
    async function calibrate(opts) {
        const url = store.profile.settings.engine?.katago?.url || KATAGO_WS_URL;
        const timeoutMs = opts.timeoutMs ?? KATAGO_ANALYSIS_TIMEOUT_MS;
        const overrideSettings = compileEngineOverrides();
        const { query, expectedTurn, evalKomi } = buildCalibrationQuery(opts.board, opts.maxVisits, overrideSettings);
        const client = await connectFresh(url);
        try {
            const packet = await awaitFinalPacket(client, query, expectedTurn, timeoutMs);
            return computeEvenKomi({
                evalKomi,
                scoreLead: packet.rootInfo.scoreLead,
                overrideSettings,
                currentPlayer: packet.rootInfo.currentPlayer,
            });
        }
        finally {
            client.disconnect();
        }
    }
    return { calibrate };
}
