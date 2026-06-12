/**
 * src/engine/analysis/stability-extractors.ts
 *
 * KataGo-specific stability extractors — per-packet pure functions
 * mapping a `KataAnalysisResponse` to a `StabilityValue | null`.
 * Null means "this packet doesn't permit a reliable observation"
 * (truncated moveInfos below required rank, required field
 * missing, etc.); the trajectory records null as an UNKNOWN gap
 * that drops from stability-fraction computations rather than
 * voting against stability.
 *
 * The v1 catalogue ports the six extractors the research arc
 * validated as carrying signal at b10c128 scale per
 * `docs/notes/stability-surface-design-space.md` §"The extractor
 * catalogue". Degenerate extractors (winrate_polarity with
 * pos_rate ≈ 0.97; winrate_change_threshold(0.10) similarly) are
 * intentionally excluded — they appear in the research catalogue
 * as documented diagnostics but are not surfaced to the user.
 *
 * Composite-quantity extractors (top3_set was Python
 * `frozenset[str]`) serialise to canonical sorted-joined strings
 * so the trajectory's primitive-equality contract holds without
 * a custom equality function.
 *
 * Stateful factories (winrate_change_threshold_factory in the
 * research catalogue) are preserved as a substrate shape but
 * not currently surfaced — the registry stores zero-arg
 * extractor functions; a future call site that wants per-
 * trajectory stateful extractors instantiates a fresh extractor
 * per (board, node) and registers it dynamically. The
 * registry's open-ended Map shape supports this without
 * substrate change.
 *
 * License: Public Domain (The Unlicense)
 */
// ── Catalogue ────────────────────────────────────────────────────────────────
/** Sign of root scoreLead, in {-1, 0, +1}. Pure rootInfo read; immune
 *  to moveInfos truncation. */
export const extractScoreLeadSign = (packet) => {
    const sl = packet.rootInfo?.scoreLead;
    if (sl === undefined || sl === null || Number.isNaN(sl))
        return null;
    if (sl > 0)
        return 1;
    if (sl < 0)
        return -1;
    return 0;
};
/** Winrate bucketed into {0, 1, 2, 3, 4} quintiles. Pure rootInfo read. */
export const extractWinrateQuintile = (packet) => {
    const wr = packet.rootInfo?.winrate;
    if (wr === undefined || wr === null || Number.isNaN(wr))
        return null;
    return Math.min(4, Math.floor(wr * 5));
};
/** Does the search's current top-1 (argmax visits) match the highest-
 *  prior move within moveInfos? Binary. Evolves with search: at low
 *  V, agrees with the prior; at high V on a position where MCTS finds
 *  a better move, disagrees. */
export const extractSearchAgreesWithPolicy = (packet) => {
    const mi = packet.moveInfos;
    if (!mi || mi.length === 0)
        return null;
    let topPriorMove = null;
    let topPrior = -Infinity;
    for (const m of mi) {
        const p = m.prior;
        if (p === undefined || p === null || Number.isNaN(p))
            continue;
        if (p > topPrior) {
            topPrior = p;
            topPriorMove = String(m.move);
        }
    }
    if (topPriorMove === null)
        return null;
    // moveInfos is sorted by visits descending; [0] is the search's top-1.
    return String(mi[0].move) === topPriorMove;
};
/** Move with the most visits (search's current top-1). Mostly immune
 *  to truncation — top-1 is never truncated by moveInfos rank cuts. */
export const extractTop1Move = (packet) => {
    const mi = packet.moveInfos;
    if (!mi || mi.length === 0)
        return null;
    const mv = mi[0].move;
    return mv === undefined || mv === null ? null : String(mv);
};
/** Top-3 set, as a canonical sorted-joined string. Vulnerable to
 *  truncation when moveInfos has fewer than 3 entries — returns null
 *  defensively in that case. The string serialisation preserves the
 *  trajectory's primitive-equality contract; the canonical sort makes
 *  {a, b, c} and {c, a, b} compare equal. */
export const extractTop3Set = (packet) => {
    const mi = packet.moveInfos;
    if (!mi || mi.length < 3)
        return null;
    const moves = [];
    for (let i = 0; i < 3; i++) {
        const mv = mi[i].move;
        if (mv === undefined || mv === null)
            return null;
        moves.push(String(mv));
    }
    moves.sort();
    return moves.join('|');
};
/** Visit-fraction margin between top-1 and top-2, bucketed into
 *  quintiles {0, 1, 2, 3, 4}. Quintile boundaries (from research
 *  Python): {<0.05 → 0, <0.15 → 1, <0.30 → 2, <0.50 → 3, ≥0.50 → 4}.
 *  Captures search *confidence* independent of top-1 identity — a
 *  position where top-1 just barely beats top-2 looks stable in
 *  top1_move but is operationally fragile. */
export const extractTop2MarginQuintile = (packet) => {
    const mi = packet.moveInfos;
    if (!mi || mi.length < 2)
        return null;
    const visits = [];
    for (let i = 0; i < Math.min(5, mi.length); i++) {
        const v = mi[i].visits;
        if (v === undefined || v === null || !Number.isFinite(v))
            return null;
        visits.push(v);
    }
    if (visits[0] <= 0)
        return null;
    const total = visits.reduce((a, b) => a + b, 0);
    if (total <= 0)
        return null;
    const margin = (visits[0] - visits[1]) / total;
    if (margin < 0.05)
        return 0;
    if (margin < 0.15)
        return 1;
    if (margin < 0.30)
        return 2;
    if (margin < 0.50)
        return 3;
    return 4;
};
// ── Registry ─────────────────────────────────────────────────────────────────
/** Map of extractor-id → extractor function. Open-ended Map so a
 *  future call site (e.g., DSL-authored extractors per the design
 *  note's "DSL extension is a third arc" framing) can register
 *  dynamically without consumer-side changes. UI consumers should
 *  iterate this map for the available-extractors menu. */
// This map is the authoritative `ExtractorId` vocabulary; the single
// array cast below is the brand's construction site (the keys are minted
// here, not at consumers).
export const STABILITY_EXTRACTORS = new Map([
    ['scoreLead_sign', extractScoreLeadSign],
    ['winrate_quintile', extractWinrateQuintile],
    ['search_agrees_with_policy', extractSearchAgreesWithPolicy],
    ['top1_move', extractTop1Move],
    ['top3_set', extractTop3Set],
    ['top2_margin_quintile', extractTop2MarginQuintile],
]);
/** Human-readable labels for the registered extractors. UI dropdown
 *  surfaces these alongside the registry keys. */
export const STABILITY_EXTRACTOR_LABELS = new Map([
    ['scoreLead_sign', 'Score-lead sign (B leads / tied / W leads)'],
    ['winrate_quintile', 'Winrate quintile'],
    ['search_agrees_with_policy', "Search agrees with network's prior"],
    ['top1_move', 'Top-1 move'],
    ['top3_set', 'Top-3 move set'],
    ['top2_margin_quintile', 'Top-1 vs top-2 confidence margin'],
]);
/** Default selected extractor for the stability panels (a vocabulary member). */
export const DEFAULT_EXTRACTOR_ID = 'top1_move';
