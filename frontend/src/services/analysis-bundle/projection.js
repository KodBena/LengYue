// ── KataAnalysisResponse (the root packet) ─────────────────────────────────
export const ALLOWED_ROOT_KEYS = [
    'id',
    'turnNumber',
    'isDuringSearch',
    'moveInfos',
    'rootInfo',
    'ownership',
    'policy',
    'extra',
];
// ── KataMoveInfo (per-candidate-move data) ─────────────────────────────────
export const ALLOWED_MOVE_INFO_KEYS = [
    'move',
    'visits',
    'winrate',
    'scoreLead',
    'pv',
    'order',
    'clusterId',
    // Network's prior probability for this move. Surfaced on the wire
    // by KataGo's analysis-engine; consumed by the stability-finder's
    // `search_agrees_with_policy` extractor (and any future stability
    // extractor that wants to compare search-derived rankings against
    // the prior). Bundled so re-derivation of stability metrics from a
    // stored bundle stays faithful.
    'prior',
];
// ── KataRootInfo (position-level data) ─────────────────────────────────────
export const ALLOWED_ROOT_INFO_KEYS = [
    'winrate',
    'scoreLead',
    'visits',
    'currentPlayer',
];
// ── KataExtra (proxy enrichment envelope) ──────────────────────────────────
export const ALLOWED_EXTRA_KEYS = [
    'state',
    'black',
    'white',
];
// ── KataPlayerExtra (per-player enrichment) ────────────────────────────────
export const ALLOWED_PLAYER_EXTRA_KEYS = [
    'triangular',
    'deltas',
    'cwt',
];
// ── Runtime projection helpers ─────────────────────────────────────────────
const ROOT_KEY_SET = new Set(ALLOWED_ROOT_KEYS);
const MOVE_INFO_KEY_SET = new Set(ALLOWED_MOVE_INFO_KEYS);
const ROOT_INFO_KEY_SET = new Set(ALLOWED_ROOT_INFO_KEYS);
const EXTRA_KEY_SET = new Set(ALLOWED_EXTRA_KEYS);
const PLAYER_EXTRA_KEY_SET = new Set(ALLOWED_PLAYER_EXTRA_KEYS);
function pickKeys(obj, allowed) {
    const out = {};
    for (const k of Object.keys(obj)) {
        if (allowed.has(k))
            out[k] = obj[k];
    }
    // `out` holds a subset of T's keys (allow-list filter over T's own keys),
    // so it is a Partial<T> by construction.
    return out;
}
/**
 * Project a `KataAnalysisResponse` through the SPA's typed-shape
 * allow-list, recursively for `moveInfos[*]`, `rootInfo`, and the
 * `extra` envelope. Returns a fresh object; the input is not
 * mutated.
 *
 * Fields the runtime carries but the SPA's types don't declare are
 * dropped. Fields the SPA declares but the runtime omits (optional
 * fields like `ownership`, `policy`) pass through as `undefined`
 * and JSON-stringify back out cleanly.
 *
 * Pure function; no I/O, no shared state, no closures.
 */
export function projectPacket(packet) {
    const projected = pickKeys(
    // Widen the typed packet to an open record so the key-allow-list filter
    // can walk it generically; re-narrowed to KataAnalysisResponse at return.
    packet, ROOT_KEY_SET); // pickKeys returns Partial; widen for in-place field assigns below
    if (projected.rootInfo && typeof projected.rootInfo === 'object') {
        projected.rootInfo = pickKeys(
        // Checked object above; treat the nested rootInfo as an open record
        // for the recursive allow-list filter.
        projected.rootInfo, ROOT_INFO_KEY_SET);
    }
    if (Array.isArray(projected.moveInfos)) {
        // Each moveInfo is an open record for the per-element allow-list filter.
        projected.moveInfos = projected.moveInfos.map((mi) => pickKeys(mi, MOVE_INFO_KEY_SET));
    }
    if (projected.extra && typeof projected.extra === 'object') {
        const extra = pickKeys(
        // Checked object above; nested extra envelope as an open record.
        projected.extra, EXTRA_KEY_SET); // pickKeys returns Partial; widen for nested player-extra assigns
        if (extra.black && typeof extra.black === 'object') {
            extra.black = pickKeys(
            // Checked object above; per-player extra as an open record.
            extra.black, PLAYER_EXTRA_KEY_SET);
        }
        if (extra.white && typeof extra.white === 'object') {
            extra.white = pickKeys(
            // Checked object above; per-player extra as an open record.
            extra.white, PLAYER_EXTRA_KEY_SET);
        }
        projected.extra = extra;
    }
    // Re-narrow: `projected` is the allow-list-filtered packet, structurally a
    // KataAnalysisResponse (Band-2 wire-shape remint through the open record).
    return projected;
}
