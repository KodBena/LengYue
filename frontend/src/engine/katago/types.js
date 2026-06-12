/**
 * src/engine/katago/types.ts
 * Exhaustive Type Definitions for the KataGo Parallel Analysis Engine.
 *
 * This is the single source of truth for all KataGo wire-protocol types,
 * including the enrichment envelope (`KataExtra`) produced by the analysis
 * proxy middleware. No other module should define or re-declare these types.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Accepted values for the KataGo Analysis Engine's
 * `overrideSettings.reportAnalysisWinratesAs` setting. Controls the
 * sign convention of `winrate`, `scoreLead`, and `ownership` in the
 * response packets:
 *
 *   'BLACK'      — high winrate / +score / +ownership = Black favoured
 *   'WHITE'      — high winrate / +score / +ownership = White favoured
 *   'SIDETOMOVE' — perspective flips per move (KataGo's own default)
 *
 * This enum is exported and re-used by:
 *
 *   - the registry editor's dropdown table (`PATH_ENUMS` in
 *     `components/RegistryEditor.vue`), so the user can't typo the
 *     value;
 *   - the receipt-time normalisation layer in
 *     `engine/katago/winrate-framing.ts`, which flips the typed
 *     signed scalars (winrate, scoreLead, ownership) plus the
 *     defensively-handled untyped siblings (scoreMean, utility,
 *     etc.) to canonical 'WHITE' framing before packets reach the
 *     ledger. After normalisation, every consumer downstream sees
 *     'WHITE'-framed packets regardless of what the user asked
 *     KataGo for, fixing the inversion bug for raw-packet consumers.
 *
 * ── Residual limitation (proxy-side palette enrichment) ───────────
 * The receipt-time normaliser flips raw-packet signed scalars only.
 * Palette enrichment in `extra.*` is computed on the proxy side
 * BEFORE packets reach the frontend, using the wire's framing —
 * so a user with `reportAnalysisWinratesAs: 'BLACK'` receives
 * `extra.state[turn]['Win Probability']` in BLACK framing even
 * after the raw packet's `rootInfo.winrate` is normalised to
 * WHITE. Custom palette state_fns reading signed scalars must
 * compensate, or the user keeps the registry at 'WHITE' (the
 * seeded default) for fully-consistent display. Tracking detail
 * in `docs/handoff-current.md`'s "Known gaps (frontend)" and the
 * scope discussion in `engine/katago/winrate-framing.ts`'s file
 * header.
 */
export const WINRATE_FRAMINGS = ['BLACK', 'WHITE', 'SIDETOMOVE'];
